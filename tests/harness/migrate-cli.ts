// Applies migration files to a given database with the Supabase CLI (`migration up --db-url`), the same path
// `db push` takes: the CLI splits the statements and records each version in supabase_migrations.schema_migrations.
// Each call gets its own temporary project directory holding exactly the files under test, removed afterwards.
// dbUrl holds the password: the CLI's output reaches a message only through maskConnectionSecrets.
import { spawn } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { failureOf, isSweepableDbName, rethrowWith } from "./scratch-db.ts";

export interface MigrationFile {
  version: string;
  /** File name without the version prefix and the extension, e.g. `rename_categories`. */
  name: string;
  path: string;
}

/** A migration to apply: a file from supabase/migrations/ (path) or a synthetic one (sql, e.g. a mutant). */
export type MigrationInput = { version: string } & ({ path: string } | { sql: string; name?: string });

export type ApplyResult = { ok: true } | { ok: false; output: string };

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase", "migrations");
const CONFIG_TOML = path.join(REPO_ROOT, "supabase", "config.toml");
// The npm package's JS entry, run with this Node: no shell (npx.cmd on Windows), arguments passed as an array.
const CLI_ENTRY = createRequire(import.meta.url).resolve("supabase/dist/supabase.js");

const MIGRATION_FILE_RE = /^([0-9]+)_(.+)\.sql$/;
const VERSION_RE = /^[0-9]+$/;
const SYNTHETIC_NAME_RE = /^[a-z0-9_]+$/;

// A few CLI calls per test fit easily; a hung CLI (e.g. a port that never answers) fails here instead of the test.
const CLI_TIMEOUT_MS = 60_000;

/** The repository's migrations, sorted by version (the order the CLI applies them in). */
export function listMigrations(): MigrationFile[] {
  return readdirSync(MIGRATIONS_DIR)
    .flatMap((file) => {
      const match = MIGRATION_FILE_RE.exec(file);
      return match ? [{ version: match[1], name: match[2], path: path.join(MIGRATIONS_DIR, file) }] : [];
    })
    .sort((a, b) => (a.version < b.version ? -1 : a.version > b.version ? 1 : 0));
}

/**
 * Replaces connection strings with `scheme://***@host/db`: the given URLs whole (as passed and decoded), then any
 * other `scheme://user:password@` userinfo and `password=` pair. The bare password is never replaced on its own:
 * locally it is `postgres`, the same as the role and the database, so that would garble messages like `role "postgres"`.
 */
export function maskConnectionSecrets(text: string, urls: string[]): string {
  let masked = text;
  for (const raw of urls) {
    const url = new URL(raw);
    const marker = `${url.protocol}//***@${url.host}${url.pathname}`;
    const decoded = `${url.protocol}//${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}@${url.host}${url.pathname}`;
    for (const form of new Set([raw, url.toString(), decoded])) masked = masked.split(form).join(marker);
  }
  return masked
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, "$1***@")
    .replace(/(password=)("[^"]*"|'[^']*'|\S+)/gi, "$1***");
}

function migrationFileName(file: MigrationInput): string {
  if (!VERSION_RE.test(file.version)) throw new Error(`Niepoprawna wersja migracji: "${file.version}" (same cyfry).`);
  if ("path" in file) {
    const base = path.basename(file.path);
    const match = MIGRATION_FILE_RE.exec(base);
    if (match?.[1] !== file.version) {
      throw new Error(`Plik ${base} nie ma postaci ${file.version}_<nazwa>.sql.`);
    }
    return base;
  }
  const name = file.name ?? "synthetic";
  if (!SYNTHETIC_NAME_RE.test(name)) throw new Error(`Niepoprawna nazwa migracji syntetycznej: "${name}".`);
  return `${file.version}_${name}.sql`;
}

interface CliRun {
  code: number | null;
  signal: NodeJS.Signals | null;
  output: string;
}

// Resolves with the exit code whatever it is; rejects only when the CLI could not be started. A spawn error carries
// the arguments (spawnargs, with the URL), so only a masked copy of its fields becomes the cause.
function runCli(args: string[], cwd: string, mask: (text: string) => string): Promise<CliRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI_ENTRY, ...args], {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: CLI_TIMEOUT_MS,
      windowsHide: true,
    });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
    child.on("error", (error: NodeJS.ErrnoException) => {
      const cause = { code: error.code, syscall: error.syscall, message: mask(error.message) };
      reject(new Error(`Nie udało się uruchomić Supabase CLI: ${cause.message}`, { cause }));
    });
    child.on("close", (code, signal) => {
      resolve({ code, signal, output: Buffer.concat(chunks).toString("utf8") });
    });
  });
}

/**
 * Applies the given files to dbUrl with `supabase migration up --db-url`. files must be every version already in
 * the target's supabase_migrations.schema_migrations plus the files under test, each with a version above the last
 * applied one: otherwise CLI 2.117.0 refuses ("Remote migration versions not found in local migrations directory",
 * "Found local migration files to be inserted before the last migration on remote database"). No `migration repair`,
 * no `--include-all`: the path stays the one `db push` takes.
 * A non-zero exit code is a result ({ ok: false, output }, output masked); only a failure to run the CLI throws.
 */
export async function applyMigrations(dbUrl: string, files: MigrationInput[]): Promise<ApplyResult> {
  // The CLI writes to whatever dbUrl names: only a scratch database qualifies (test-plan §1).
  const database = decodeURIComponent(new URL(dbUrl).pathname.slice(1));
  if (!isSweepableDbName(database)) {
    throw new Error(
      `Baza "${database}" nie jest bazą testów migracji (mig_test_<runId>_<etykieta>): nie nakładam na nią migracji.`,
    );
  }
  const names = files.map(migrationFileName);
  const versions = new Set(files.map((file) => file.version));
  if (versions.size !== files.length) throw new Error("Lista migracji zawiera powtórzoną wersję.");

  const workdir = await mkdtemp(path.join(os.tmpdir(), "mig-test-"));
  let result: ApplyResult;
  try {
    const target = path.join(workdir, "supabase", "migrations");
    await mkdir(target, { recursive: true });
    await copyFile(CONFIG_TOML, path.join(workdir, "supabase", "config.toml"));
    for (const [index, file] of files.entries()) {
      const destination = path.join(target, names[index]);
      if ("path" in file) await copyFile(file.path, destination);
      else await writeFile(destination, file.sql, "utf8");
    }
    // Guard against a stray file: the CLI applies whatever the directory holds.
    const present = (await readdir(target)).sort();
    if (present.join("\n") !== [...names].sort().join("\n")) {
      throw new Error("Katalog roboczy migracji zawiera inne pliki niż zadane.");
    }

    // --workdir is the project root (the parent of supabase/); pointing it at supabase/ itself applies nothing
    // and still exits 0. --agent no keeps the plain text output when the tests run under a coding agent.
    const mask = (text: string): string => maskConnectionSecrets(text, [dbUrl]);
    const args = ["migration", "up", "--db-url", dbUrl, "--workdir", workdir, "--agent", "no"];
    const run = await runCli(args, workdir, mask);
    const output = mask(run.output);
    if (run.signal !== null) {
      throw new Error(
        `Supabase CLI przerwany sygnałem ${run.signal} (limit ${CLI_TIMEOUT_MS} ms). Wyjście:\n${output}`,
      );
    }
    result = run.code === 0 ? { ok: true } : { ok: false, output: `kod wyjścia ${run.code ?? "brak"}\n${output}` };
  } catch (error) {
    // The original error stays the cause; a cleanup failure only joins it.
    rethrowWith(
      error,
      [await failureOf(rm(workdir, { recursive: true, force: true }))],
      `Migracje nie zostały nałożone, a katalog ${workdir} został.`,
    );
  }
  await rm(workdir, { recursive: true, force: true });
  return result;
}
