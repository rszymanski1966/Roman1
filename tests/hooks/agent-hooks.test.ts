// Proof for the Claude Code hooks in .claude/settings.json (§5 "post-edit hook", plan testing-validation-and-gates
// phase 6). Oracle: the Claude Code hook protocol (.claude/skills/10x-configure-hook/references/anthropic.md):
// PostToolUse reaches the agent only with exit 2 + stderr; Stop here never blocks and talks to the user through a
// `systemMessage` on stdout. Every case pipes a payload into the real script inside a throwaway git repo in the OS
// temp dir (real git, real Vitest through a junction to this repo's node_modules), never on the developer's tracked
// files; the only write that lands in this repo is Vitest's own config cache (node_modules/.vite-temp, through the
// junction). No Supabase stack, no dev server. One run at a time: beforeAll removes leftover dirs of killed runs.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");
const HOOK_FILES = ["lib.mjs", "related-unit-tests.mjs", "end-of-turn-unit.mjs"];
const PER_EDIT = "related-unit-tests.mjs";
const END_OF_TURN = "end-of-turn-unit.mjs";
const SESSION = "proof-session";

// The fixture repo: one module, a unit test that pins it, and a `services` test that always fails, so a hook that
// forgets `--project unit` goes red on a clean file.
const FIXTURE: Record<string, string> = {
  "package.json": JSON.stringify(
    { name: "hook-fixture", private: true, type: "module", scripts: { "test:unit": "vitest run --project unit" } },
    null,
    2,
  ),
  ".gitignore": "node_modules\n.vite-cache\n",
  "vitest.config.ts": [
    'import { defineConfig } from "vitest/config";',
    "export default defineConfig({",
    '  cacheDir: ".vite-cache",',
    "  test: {",
    "    projects: [",
    '      { test: { name: "unit", include: ["tests/unit/**/*.test.ts"] } },',
    '      { test: { name: "services", include: ["tests/services/**/*.test.ts"] } },',
    "    ],",
    "  },",
    "});",
    "",
  ].join("\n"),
  "src/lib/price.ts": "export function double(n: number): number {\n  return n * 2;\n}\n",
  "src/lib/untested.ts": "export const untested = 1;\n",
  "tests/unit/price.test.ts": [
    'import { expect, it } from "vitest";',
    'import { double } from "../../src/lib/price";',
    'it("doubles a price", () => {',
    "  expect(double(21)).toBe(42);",
    "});",
    "",
  ].join("\n"),
  "tests/services/price.test.ts": [
    'import { it } from "vitest";',
    'import { double } from "../../src/lib/price";',
    'it("services project must not run in the agent hooks", () => {',
    "  throw new Error(`services project ran (${String(double(1))})`);",
    "});",
    "",
  ].join("\n"),
  "README.md": "# fixture\n",
};
const BROKEN_PRICE = "export function double(n: number): number {\n  return n * 3;\n}\n";

let tmp: string;
let app: string; // the session's checkout, with node_modules
let worktree: string; // a sibling worktree of `app`, with node_modules
let other: string; // another repository, without node_modules
let stateDir: string;

interface Run {
  status: number | null;
  stdout: string;
  stderr: string;
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync(
    "git",
    ["-c", "user.name=hook-proof", "-c", "user.email=hook-proof@example.test", "-c", "commit.gpgsign=false", ...args],
    { cwd, encoding: "utf8" },
  );
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed in ${cwd}: ${result.stderr}`);
  return result.stdout.trim();
}

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [relative, content] of Object.entries(files)) {
    const file = path.join(root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
}

function linkNodeModules(root: string): void {
  fs.symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(root, "node_modules"), "junction");
}

function newRepo(root: string, withHooks: boolean): void {
  fs.mkdirSync(root, { recursive: true });
  writeFiles(root, FIXTURE);
  if (withHooks) {
    for (const name of HOOK_FILES) {
      writeFiles(root, {
        [`.claude/hooks/${name}`]: fs.readFileSync(path.join(REPO_ROOT, ".claude/hooks", name), "utf8"),
      });
    }
    writeFiles(root, {
      ".claude/settings.json": fs.readFileSync(path.join(REPO_ROOT, ".claude/settings.json"), "utf8"),
    });
  }
  git(root, "init", "-q", "-b", "main");
  git(root, "add", "-A");
  git(root, "commit", "-q", "-m", "fixture");
}

function resetRepo(root: string): void {
  git(root, "reset", "-q", "--hard");
  git(root, "clean", "-fdq");
}

function runHook(script: string, payload: unknown, options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): Run {
  const input = typeof payload === "string" ? payload : JSON.stringify(payload);
  const result = spawnSync(process.execPath, [path.join(app, ".claude/hooks", script)], {
    cwd: options.cwd ?? app,
    input,
    encoding: "utf8",
    env: { ...process.env, CLAUDE_HOOKS_STATE_DIR: stateDir, ...options.env },
    timeout: 110_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function editPayload(file: string, cwd = app): Record<string, unknown> {
  return {
    session_id: SESSION,
    cwd,
    hook_event_name: "PostToolUse",
    tool_name: "Edit",
    tool_input: { file_path: file },
  };
}

function stopPayload(extra: Record<string, unknown> = {}, cwd = app): Record<string, unknown> {
  return { session_id: SESSION, cwd, hook_event_name: "Stop", stop_hook_active: false, ...extra };
}

function systemMessage(run: Run): string {
  const parsed = JSON.parse(run.stdout) as { systemMessage?: unknown };
  if (typeof parsed.systemMessage !== "string") throw new Error(`no systemMessage in ${run.stdout}`);
  return parsed.systemMessage;
}

// The shell Claude Code runs hook commands with: Git Bash on Windows, sh elsewhere.
function hookShell(): string {
  if (process.platform !== "win32") return "sh";
  const bash = path.resolve(git(REPO_ROOT, "--exec-path"), "../../../bin/bash.exe");
  if (!fs.existsSync(bash)) throw new Error(`Git Bash not found at ${bash}`);
  return bash;
}

const TMP_PREFIX = "agent-hooks-";
const JUNCTION_HOMES = ["app", "app-worktree"];

// Removes one temp dir of this test. The junctions to the real node_modules go first; anything in their place that
// is not a link stops the removal, because rmSync would otherwise recurse into the real node_modules.
function removeTree(dir: string): void {
  for (const home of JUNCTION_HOMES) {
    const link = path.join(dir, home, "node_modules");
    const stat = fs.lstatSync(link, { throwIfNoEntry: false });
    if (!stat) continue;
    if (!stat.isSymbolicLink()) throw new Error(`${link} is not a link: refusing to remove ${dir} recursively`);
    fs.unlinkSync(link);
  }
  fs.rmSync(dir, { recursive: true, force: true });
}

beforeAll(() => {
  // A killed run (timeout, Ctrl+C) skips afterAll and leaves its dir, junctions included.
  for (const entry of fs.readdirSync(os.tmpdir())) {
    if (entry.startsWith(TMP_PREFIX)) removeTree(path.join(os.tmpdir(), entry));
  }
  tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), TMP_PREFIX)));
  app = path.join(tmp, "app");
  worktree = path.join(tmp, "app-worktree");
  other = path.join(tmp, "other");
  stateDir = path.join(tmp, "state");
  newRepo(app, true);
  linkNodeModules(app);
  git(app, "worktree", "add", "-q", "-b", "side", worktree);
  linkNodeModules(worktree);
  newRepo(other, false);
}, 60_000);

afterAll(() => {
  if (tmp) removeTree(tmp);
});

beforeEach(() => {
  for (const root of [app, worktree, other]) resetRepo(root);
  fs.rmSync(stateDir, { recursive: true, force: true });
});

describe("per edit: related-unit-tests.mjs", () => {
  it("blocks with the failing unit test when the edited module breaks it", () => {
    writeFiles(app, { "src/lib/price.ts": BROKEN_PRICE });

    const run = runHook(PER_EDIT, editPayload(path.join(app, "src", "lib", "price.ts")));

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("Unit tests related to src/lib/price.ts fail");
    expect(run.stderr).toContain("doubles a price");
    expect(run.stderr).not.toContain("services project ran");
  });

  it("passes silently on a clean file and never runs the services project", () => {
    const run = runHook(PER_EDIT, editPayload(path.join(app, "src", "lib", "price.ts")));

    expect(run).toMatchObject({ status: 0, stderr: "" });
  });

  it("passes on a source file no unit test depends on", () => {
    const run = runHook(PER_EDIT, editPayload(path.join(app, "src", "lib", "untested.ts")));

    expect(run).toMatchObject({ status: 0, stderr: "" });
  });

  it.each([
    ["a file type the hook does not check", (): unknown => editPayload(path.join(app, "README.md"))],
    ["a file that does not exist", (): unknown => editPayload(path.join(app, "src", "lib", "missing.ts"))],
    ["an empty object", (): unknown => ({})],
    ["text that is not JSON", (): unknown => "not json"],
    ["empty stdin", (): unknown => ""],
    ["a tool call without a path", (): unknown => ({ cwd: app, tool_name: "Bash", tool_input: { command: "ls" } })],
  ])("treats %s as nothing to check", (_label, payload) => {
    writeFiles(app, { "src/lib/price.ts": BROKEN_PRICE });

    const run = runHook(PER_EDIT, payload());

    expect(run).toMatchObject({ status: 0, stderr: "" });
  });

  it("resolves a relative path against the payload cwd", () => {
    writeFiles(app, { "src/lib/price.ts": BROKEN_PRICE });

    const run = runHook(PER_EDIT, editPayload("src/lib/price.ts"), { cwd: tmp });

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("src/lib/price.ts");
  });

  it("skips a broken file of another repository", () => {
    writeFiles(other, { "src/lib/price.ts": BROKEN_PRICE });

    const run = runHook(PER_EDIT, editPayload(path.join(other, "src", "lib", "price.ts")));

    expect(run).toMatchObject({ status: 0, stderr: "" });
  });

  it("checks the edited file's checkout even when CLAUDE_PROJECT_DIR names a broken one", () => {
    writeFiles(other, { "src/lib/price.ts": BROKEN_PRICE });

    const run = runHook(PER_EDIT, editPayload(path.join(app, "src", "lib", "price.ts")), {
      env: { CLAUDE_PROJECT_DIR: other },
    });

    expect(run).toMatchObject({ status: 0, stderr: "" });
  });

  it("checks a broken file in a sibling worktree of the same repository", () => {
    writeFiles(worktree, { "src/lib/price.ts": BROKEN_PRICE });

    const run = runHook(PER_EDIT, editPayload(path.join(worktree, "src", "lib", "price.ts")));

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("doubles a price");
  });

  it("fails visibly when Vitest is not installed", () => {
    const run = runHook(PER_EDIT, editPayload(path.join(other, "src", "lib", "price.ts"), other), { cwd: other });

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("Run `npm ci`");
  });
});

describe("end of turn: end-of-turn-unit.mjs", () => {
  it("tells the user, without blocking, when a file changed outside the edit tools breaks a unit test", () => {
    // Written straight to disk, as `cat > file` through Bash would: no per-edit payload ever saw it.
    writeFiles(app, { "src/lib/price.ts": BROKEN_PRICE });

    const run = runHook(END_OF_TURN, stopPayload());

    expect(run.status).toBe(0);
    expect(run.stderr).not.toContain("doubles a price");
    const message = systemMessage(run);
    expect(message).toContain("Unit tests are red at the end of this turn (not blocking)");
    expect(message).toContain("npm run test:unit fails");
    expect(message).toContain("doubles a price");
  });

  it("stays silent when the changed sources keep the unit tests green", () => {
    writeFiles(app, { "src/lib/untested.ts": "export const untested = 2;\n" });

    const run = runHook(END_OF_TURN, stopPayload());

    expect(run).toMatchObject({ status: 0, stdout: "", stderr: "" });
  });

  it.each([
    ["stop_hook_active", { stop_hook_active: true }],
    ["Cursor's loop_count", { loop_count: 1 }],
  ])("does not run again when %s says a Stop hook already sent the agent back", (_label, extra) => {
    writeFiles(app, { "src/lib/price.ts": BROKEN_PRICE });

    const run = runHook(END_OF_TURN, stopPayload(extra));

    expect(run).toMatchObject({ status: 0, stdout: "", stderr: "" });
  });

  it("does not run the suite when no source changed (a red HEAD stays unreported)", () => {
    writeFiles(app, { "src/lib/price.ts": BROKEN_PRICE });
    git(app, "commit", "-q", "-am", "red head");
    try {
      writeFiles(app, { "README.md": "# fixture, docs only\n" });

      const run = runHook(END_OF_TURN, stopPayload());

      expect(run).toMatchObject({ status: 0, stdout: "", stderr: "" });
    } finally {
      git(app, "reset", "-q", "--hard", "HEAD~1");
    }
  });

  it("sweeps a sibling worktree the per-edit hook registered for this session", () => {
    writeFiles(worktree, { "src/lib/price.ts": BROKEN_PRICE });
    expect(runHook(PER_EDIT, editPayload(path.join(worktree, "src", "lib", "price.ts"))).status).toBe(2);

    const run = runHook(END_OF_TURN, stopPayload());

    expect(run.status).toBe(0);
    const message = systemMessage(run);
    expect(message).toContain(path.basename(worktree));
    expect(message).toContain("doubles a price");
  });

  it("does not run npm in a registered root of another repository (the registry is not trusted)", () => {
    // A roots file written by someone else (shared temp dir): it names a checkout of another repository whose
    // test:unit would fail (no node_modules), next to a clean session checkout.
    writeFiles(other, { "src/lib/untested.ts": "export const untested = 2;\n" });
    writeFiles(app, { "src/lib/untested.ts": "export const untested = 2;\n" });
    writeFiles(stateDir, { [`${SESSION}.roots`]: `${other}\n` });

    const run = runHook(END_OF_TURN, stopPayload());

    expect(run).toMatchObject({ status: 0, stdout: "", stderr: "" });
  });

  it("ignores CLAUDE_PROJECT_DIR pointing at another, broken checkout", () => {
    writeFiles(other, { "src/lib/price.ts": BROKEN_PRICE });
    writeFiles(app, { "src/lib/untested.ts": "export const untested = 2;\n" });

    const run = runHook(END_OF_TURN, stopPayload(), { env: { CLAUDE_PROJECT_DIR: other } });

    expect(run).toMatchObject({ status: 0, stdout: "", stderr: "" });
  });

  it("tells the user when the unit run cannot start (Vitest not installed)", () => {
    writeFiles(other, { "src/lib/untested.ts": "export const untested = 2;\n" });

    const run = runHook(END_OF_TURN, stopPayload({}, other), { cwd: other });

    expect(run.status).toBe(0);
    expect(systemMessage(run)).toContain("npm run test:unit fails");
  });

  it("tells the user when the session cwd is not a git checkout", () => {
    const run = runHook(END_OF_TURN, stopPayload({}, tmp), { cwd: tmp });

    expect(run.status).toBe(0);
    expect(systemMessage(run)).toContain("no git checkout");
  });
});

describe("commands in .claude/settings.json", () => {
  interface HookEntry {
    hooks: { type: string; command: string; timeout: number }[];
  }
  const settings = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, ".claude/settings.json"), "utf8")) as {
    hooks: Partial<Record<string, HookEntry[]>>;
  };
  const command = (event: string): string => {
    const commands = (settings.hooks[event] ?? []).flatMap((entry) => entry.hooks.map((hook) => hook.command));
    expect(commands).toHaveLength(1);
    return commands[0] ?? "";
  };

  function runCommand(event: string, payload: unknown): Run {
    // From the worktree, with a stale project dir: the command must find the script through git, not the variable.
    const result = spawnSync(hookShell(), ["-c", command(event)], {
      cwd: worktree,
      input: JSON.stringify(payload),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_HOOKS_STATE_DIR: stateDir, CLAUDE_PROJECT_DIR: path.join(tmp, "does-not-exist") },
      timeout: 110_000,
    });
    return { status: result.status, stdout: result.stdout, stderr: result.stderr };
  }

  it("registers the per-edit hook on Write|Edit with a timeout in seconds", () => {
    expect(settings.hooks.PostToolUse?.[0]).toMatchObject({ matcher: "Write|Edit", hooks: [{ timeout: 60 }] });
    expect(settings.hooks.Stop?.[0]).toMatchObject({ hooks: [{ timeout: 120 }] });
  });

  it("PostToolUse command reaches its script from a worktree and blocks on a broken edit", () => {
    writeFiles(worktree, { "src/lib/price.ts": BROKEN_PRICE });

    const run = runCommand("PostToolUse", editPayload(path.join(worktree, "src", "lib", "price.ts"), worktree));

    expect(run.status).toBe(2);
    expect(run.stderr).toContain("Unit tests related to src/lib/price.ts fail");
  });

  it("Stop command reaches its script from a worktree and reports a broken turn", () => {
    writeFiles(worktree, { "src/lib/price.ts": BROKEN_PRICE });

    const run = runCommand("Stop", stopPayload({}, worktree));

    expect(run.status).toBe(0);
    expect(systemMessage(run)).toContain("doubles a price");
  });
});
