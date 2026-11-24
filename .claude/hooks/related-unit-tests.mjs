// PostToolUse (Write|Edit): run the `unit` tests related to the file the agent just edited.
// Exit 2 + stderr is the only combination Claude sees; exit 0 means "checked and clean" or "nothing to check".
// Only the stack-free `unit` project: without --project unit, `vitest related` would pull in tests/services/*,
// whose global setup needs the local Supabase stack. This hook does not replace CI (job `integration`).
// Proof: tests/hooks/agent-hooks.test.ts (`npm run test:hooks`).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { commonDir, isCheckedSource, plainEnv, readPayload, registerRoot, tail, toplevel } from "./lib.mjs";

const RUN_TIMEOUT_MS = 50_000; // below the 60 s hook timeout in .claude/settings.json

function block(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

const payload = readPayload();
const sessionCwd = typeof payload.cwd === "string" && payload.cwd ? payload.cwd : process.cwd();
const rawFile = payload.tool_input?.file_path ?? payload.tool_input?.notebook_path;
if (typeof rawFile !== "string" || !rawFile) process.exit(0);

const file = path.resolve(sessionCwd, rawFile);
if (!isCheckedSource(file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) process.exit(0);

// The checkout of the edited file, not $CLAUDE_PROJECT_DIR (it goes stale after EnterWorktree). Files of other
// repositories (~/.claude, other projects) are skipped; any worktree of this repository is checked.
const root = toplevel(path.dirname(file));
if (!root) process.exit(0);
const repo = commonDir(root);
if (!repo || repo !== commonDir(sessionCwd)) process.exit(0);

registerRoot(payload.session_id, root);

const vitest = path.join(root, "node_modules", "vitest", "vitest.mjs");
if (!fs.existsSync(vitest)) {
  block(`Hook related-unit-tests.mjs could not run: ${vitest} is missing. Run \`npm ci\` in ${root}.`);
}

const relative = path.relative(root, file).split(path.sep).join("/");
const result = spawnSync(
  process.execPath,
  [vitest, "related", relative, "--run", "--project", "unit", "--passWithNoTests"],
  { cwd: root, encoding: "utf8", env: plainEnv, timeout: RUN_TIMEOUT_MS, stdio: ["ignore", "pipe", "pipe"] },
);

if (result.error) {
  block(`Hook related-unit-tests.mjs could not run Vitest for ${relative}: ${result.error.message}`);
}
if (result.status !== 0) {
  block(
    `Unit tests related to ${relative} fail (vitest related --project unit):\n${tail(`${result.stdout}\n${result.stderr}`)}`,
  );
}
process.exit(0);
