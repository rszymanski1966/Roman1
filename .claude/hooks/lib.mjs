// Shared helpers for the Claude Code hooks in this directory (see .claude/settings.json).
// Proof: tests/hooks/agent-hooks.test.ts (`npm run test:hooks`).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Hook output is read by a model, not a terminal.
export const plainEnv = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };

// Keep a failure message readable: the tail of the runner output is where the summary is.
const MAX_OUTPUT_CHARS = 8000;

export function tail(text) {
  const trimmed = text.trim();
  return trimmed.length <= MAX_OUTPUT_CHARS ? trimmed : `…\n${trimmed.slice(-MAX_OUTPUT_CHARS)}`;
}

// The payload is untrusted in shape: empty stdin, invalid JSON or missing fields mean "nothing to check".
export function readPayload() {
  let raw = "";
  try {
    raw = fs.readFileSync(0, "utf8");
  } catch {
    // No stdin at all (the hook was started without a pipe): treated as an empty payload.
    return {};
  }
  try {
    const parsed = JSON.parse(raw);
    return parsed !== null && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function git(cwd, ...args) {
  const result = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf8", env: plainEnv });
  return result.status === 0 ? result.stdout.trim() : null;
}

// Real path with one separator style and, on Windows, one case, so paths from git and from the payload compare.
export function samePath(p) {
  let resolved = path.resolve(p);
  try {
    resolved = fs.realpathSync.native(resolved);
  } catch {
    // A path that does not exist (yet) is compared as resolved.
  }
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function toplevel(dir) {
  const top = git(dir, "rev-parse", "--show-toplevel");
  return top ? path.resolve(top) : null;
}

export function commonDir(dir) {
  const common = git(dir, "rev-parse", "--path-format=absolute", "--git-common-dir");
  return common ? samePath(common) : null;
}

// Checkouts the per-edit hook saw this session, so the Stop hook also sweeps a sibling worktree.
function registryFile(sessionId) {
  const safe = String(sessionId ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!safe) return null;
  const dir = process.env.CLAUDE_HOOKS_STATE_DIR || path.join(os.tmpdir(), "claude-hooks");
  return path.join(dir, `${safe}.roots`);
}

export function registerRoot(sessionId, root) {
  const file = registryFile(sessionId);
  if (!file) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${root}\n`);
}

export function registeredRoots(sessionId) {
  const file = registryFile(sessionId);
  if (!file || !fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
}

export function clearRegistry(sessionId) {
  const file = registryFile(sessionId);
  if (file && fs.existsSync(file)) fs.writeFileSync(file, "");
}

// Files the `unit` project can depend on. Only TypeScript: tests/unit imports src/lib/*.ts only.
export function isCheckedSource(file) {
  return /\.(ts|tsx)$/i.test(file);
}

// Changes after which the whole unit run is worth it at end of turn: checked sources plus the files that decide
// what and how Vitest runs.
export function isUnitRelevant(file) {
  return isCheckedSource(file) || /(^|\/)package(-lock)?\.json$/.test(file);
}
