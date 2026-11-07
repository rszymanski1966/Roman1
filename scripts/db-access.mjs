// DB access guard: fails when the app could stop acting only as the signed-in user, i.e. when it could reach
// past RLS. Rules: (a) no service-role or secret key names in src/**; (b) Supabase clients are created only in
// src/lib/supabase.ts (type-only imports are fine anywhere); (c) no `security definer` in migrations.
// Zero dependencies on purpose, like scripts/ui-literals.mjs. Run: node scripts/db-access.mjs
// The scan functions are exported for tests/scripts/db-access.test.ts; the CLI runs only when executed directly.

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

/** @typedef {"secret-key" | "client-import" | "security-definer"} Rule */
/** @typedef {{ file: string, line: number, rule: Rule, match: string }} Finding */

// Migrations exempt from rule (c), as repo-relative paths. Every entry needs a comment above it saying why the
// function must bypass RLS and what limits it (owner, search_path, checks on auth.uid()). Empty on purpose.
/** @type {readonly string[]} */
export const ALLOWED = [];

// The only file allowed to create a Supabase client.
const CLIENT_FILE = "src/lib/supabase.ts";

// Case-sensitive on purpose: the word "secret" in plain text is not a hit; SERVICE_ROLE_KEY is (via SERVICE_ROLE).
const SECRET_PATTERN = /service_role|SERVICE_ROLE|SECRET_KEY|sb_secret_/g;

// Client factories per module; importing them outside CLIENT_FILE is a hit.
/** @type {Record<string, readonly string[]>} */
const FACTORIES = {
  "@supabase/supabase-js": ["createClient"],
  "@supabase/ssr": ["createServerClient", "createBrowserClient"],
};

// `import { ... } from` / `export { ... } from` one of the modules above, also across lines and with a default
// import before the braces. Group 1: statement-level `type`; group 2: braces content; group 4: module.
const NAMED_PATTERN =
  /\b(?:import|export)\s+(type\s+)?(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*(["'])(@supabase\/(?:supabase-js|ssr))\3/g;

// `import * as x from` / `export * from` one of the modules: a way to every factory, so a hit too.
const NAMESPACE_PATTERN =
  /\b(?:import\s+\*\s+as\s+[\w$]+|export\s+\*(?:\s+as\s+[\w$]+)?)\s+from\s*(["'])(@supabase\/(?:supabase-js|ssr))\1/g;

// Case-insensitive, any whitespace (including line breaks) between the words; SQL comments count too.
const DEFINER_PATTERN = /\bsecurity\s+definer\b/gi;

// 1-based line of a character offset.
function lineAt(text, offset) {
  let line = 1;
  for (let i = 0; i < offset; i++) if (text[i] === "\n") line++;
  return line;
}

/**
 * Rules (a) and (b) for one file under src/. Reports a forbidden import on the line of the offending specifier.
 * @param {string} file repo-relative path with forward slashes
 * @param {string} text file contents
 * @returns {Finding[]}
 */
export function scanSource(file, text) {
  /** @type {Finding[]} */
  const findings = [];

  for (const match of text.matchAll(SECRET_PATTERN)) {
    findings.push({ file, line: lineAt(text, match.index), rule: "secret-key", match: match[0] });
  }

  if (file !== CLIENT_FILE) {
    for (const match of text.matchAll(NAMED_PATTERN)) {
      if (match[1]) continue; // import type { ... }
      const module = match[4];
      const contentStart = match.index + match[0].indexOf("{") + 1;
      let position = 0;
      for (const part of match[2].split(",")) {
        const specifier = /^\s*(type\s+)?([\w$]+)/.exec(part);
        if (specifier && !specifier[1] && FACTORIES[module].includes(specifier[2])) {
          const offset = contentStart + position + specifier[0].length - specifier[2].length;
          findings.push({
            file,
            line: lineAt(text, offset),
            rule: "client-import",
            match: `${specifier[2]} from ${module}`,
          });
        }
        position += part.length + 1;
      }
    }
    for (const match of text.matchAll(NAMESPACE_PATTERN)) {
      findings.push({ file, line: lineAt(text, match.index), rule: "client-import", match: `* from ${match[2]}` });
    }
  }

  return findings.sort((a, b) => a.line - b.line);
}

/**
 * Rule (c) for one migration file.
 * @param {string} file repo-relative path with forward slashes
 * @param {string} text file contents
 * @returns {Finding[]}
 */
export function scanMigration(file, text) {
  if (ALLOWED.includes(file)) return [];
  return [...text.matchAll(DEFINER_PATTERN)].map((match) => ({
    file,
    line: lineAt(text, match.index),
    rule: /** @type {const} */ ("security-definer"),
    match: match[0].replace(/\s+/g, " "),
  }));
}

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".astro"]);

// Repo-relative source files under dir, recursively, with forward slashes.
function sourceFiles(root, dir) {
  return readdirSync(path.join(root, dir), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) return sourceFiles(root, file);
      return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [file] : [];
    });
}

function main() {
  const root = path.resolve(import.meta.dirname, "..");
  const read = (file) => readFileSync(path.join(root, file), "utf8");
  const migrations = readdirSync(path.join(root, "supabase/migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => `supabase/migrations/${name}`);

  const findings = [
    ...sourceFiles(root, "src").flatMap((file) => scanSource(file, read(file))),
    ...migrations.flatMap((file) => scanMigration(file, read(file))),
  ];

  for (const { file, line, rule, match } of findings) console.log(`${file}:${line}: ${match} (${rule})`);
  if (findings.length) {
    console.log(
      `\n${findings.length} DB access violation(s) found; the app must act only as the signed-in user (see scripts/db-access.mjs)`,
    );
  }
  process.exit(findings.length ? 1 : 0);
}

// Run the CLI only when executed directly, not when imported by a test. Windows paths compare case-insensitively.
const normalize = (file) => {
  const resolved = path.resolve(file);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
};
if (process.argv[1] && import.meta.filename && normalize(process.argv[1]) === normalize(import.meta.filename)) main();
