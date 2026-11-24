// Stop: run `npm run test:unit` once per turn in every checkout this session changed, and tell the user when it
// is red. Never blocks (always exit 0, never `decision: block`): a deliberately red test (the red step of TDD, a
// phase waiting for confirmation) must not force the agent to keep working. The signal for the agent is the
// per-edit hook (related-unit-tests.mjs); this one is the user's safety net for edits that bypassed it (files
// rewritten through Bash). It does not replace CI (jobs `checks` and `integration`).
// Proof: tests/hooks/agent-hooks.test.ts (`npm run test:hooks`).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import {
  clearRegistry,
  git,
  isUnitRelevant,
  plainEnv,
  readPayload,
  registeredRoots,
  samePath,
  tail,
  toplevel,
} from "./lib.mjs";

const RUN_TIMEOUT_MS = 100_000; // below the 120 s hook timeout in .claude/settings.json

function tellUser(message) {
  process.stdout.write(JSON.stringify({ systemMessage: message }));
  process.exit(0);
}

const payload = readPayload();

// Claude is already continuing because a Stop hook blocked (loop_count: Cursor, which imports .claude/settings.json).
if (payload.stop_hook_active === true || (typeof payload.loop_count === "number" && payload.loop_count > 0)) {
  process.exit(0);
}

const sessionCwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
const roots = new Map();
for (const candidate of [toplevel(sessionCwd), ...registeredRoots(payload.session_id)]) {
  if (candidate && fs.existsSync(candidate)) roots.set(samePath(candidate), candidate);
}
if (roots.size === 0) tellUser(`end-of-turn-unit.mjs: no git checkout at ${sessionCwd}, unit tests not run.`);

const failures = [];
for (const root of roots.values()) {
  // Nothing the unit project depends on changed (a Q&A turn, docs only): nothing to run here.
  const changed = [git(root, "diff", "--name-only", "HEAD"), git(root, "ls-files", "-o", "--exclude-standard")]
    .join("\n")
    .split("\n")
    .filter(Boolean);
  if (!changed.some(isUnitRelevant)) continue;

  const result = spawnSync("npm run test:unit", {
    cwd: root,
    encoding: "utf8",
    env: plainEnv,
    shell: true, // npm is npm.cmd on Windows; the command is a constant, no payload data reaches the shell
    timeout: RUN_TIMEOUT_MS,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    failures.push(`${root}: npm run test:unit could not run: ${result.error.message}`);
  } else if (result.status !== 0) {
    failures.push(`${root}: npm run test:unit fails:\n${tail(`${result.stdout}\n${result.stderr}`)}`);
  }
}

if (failures.length > 0) {
  tellUser(`Unit tests are red at the end of this turn (not blocking):\n${failures.join("\n\n")}`);
}
clearRegistry(payload.session_id);
process.exit(0);
