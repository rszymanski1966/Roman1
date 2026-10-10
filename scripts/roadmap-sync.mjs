// Roadmap → GitHub issues sync (one-way). Reads the "At a glance" table in context/foundation/roadmap.md and,
// for every F-NN / S-NN row, sets the matching issue's `status:<status>` label and closes it when the item is done.
// The issue is matched by its title prefix "[S-01]". Never writes to the repository.
// Zero dependencies on purpose. Run in CI (GITHUB_TOKEN, GITHUB_REPOSITORY) or locally with DRY_RUN=1:
//   GITHUB_TOKEN=$(gh auth token) GITHUB_REPOSITORY=owner/repo DRY_RUN=1 node scripts/roadmap-sync.mjs

import { readFile } from "node:fs/promises";

const ROADMAP = process.env.ROADMAP_PATH ?? "context/foundation/roadmap.md";
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const dryRun = process.env.DRY_RUN === "1";
const API = "https://api.github.com";

const LABEL_PREFIX = "status:";
const LABEL_COLORS = { proposed: "C5DEF5", ready: "FBCA04", "in-progress": "1D76DB", done: "0E8A16" };

// GitHub Actions annotations; plain lines locally.
const warn = (message) => console.log(process.env.GITHUB_ACTIONS ? `::warning::${message}` : `WARN  ${message}`);

function cells(line) {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

/** Rows of the "## At a glance" table as { id, status }, located by header names, not column positions. */
function parseAtAGlance(markdown) {
  const section = /^## At a glance\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(markdown)?.[1];
  if (!section) throw new Error(`No "## At a glance" section in ${ROADMAP}`);
  const tableLines = section.split("\n").filter((line) => line.trim().startsWith("|"));
  if (tableLines.length < 3) throw new Error(`"## At a glance" table in ${ROADMAP} has no rows`);

  const header = cells(tableLines[0]).map((name) => name.toLowerCase());
  const idCol = header.indexOf("id");
  const statusCol = header.indexOf("status");
  if (idCol === -1 || statusCol === -1) throw new Error(`"## At a glance" table needs "ID" and "Status" columns`);

  return tableLines
    .slice(2)
    .map(cells)
    .map((row) => ({ id: row[idCol], status: (row[statusCol] ?? "").toLowerCase() }))
    .filter((row) => /^[FS]-\d+$/.test(row.id) && row.status);
}

/** Archive path from the item's "## Done" bullet, if /10x-archive wrote one. */
function archivePath(markdown, id) {
  const line = markdown.split("\n").find((l) => l.startsWith(`- **${id}:`));
  return line && /`(context\/archive\/[^`]+)`/.exec(line)?.[1];
}

async function github(method, path, body) {
  const response = await fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

async function listIssues() {
  const issues = [];
  for (let page = 1; ; page++) {
    const batch = await github("GET", `/repos/${repo}/issues?state=all&per_page=100&page=${page}`);
    issues.push(...batch.filter((issue) => !issue.pull_request));
    if (batch.length < 100) return issues;
  }
}

// Mutations are skipped (only logged) in dry-run mode.
async function mutate(description, method, path, body) {
  console.log(`${dryRun ? "DRY   " : "DO    "}${description}`);
  if (!dryRun) await github(method, path, body);
}

async function ensureLabel(existing, name, status) {
  if (existing.has(name)) return;
  const color = LABEL_COLORS[status] ?? "EDEDED";
  await mutate(`create label "${name}"`, "POST", `/repos/${repo}/labels`, { name, color });
  existing.add(name);
}

async function main() {
  if (!token || !repo) throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required");

  const markdown = await readFile(ROADMAP, "utf8");
  const items = parseAtAGlance(markdown);
  const issues = await listIssues();
  const labels = new Set((await github("GET", `/repos/${repo}/labels?per_page=100`)).map((label) => label.name));

  for (const { id, status } of items) {
    const issue = issues.find((candidate) => candidate.title.startsWith(`[${id}]`));
    if (!issue) {
      warn(`${id}: no issue titled "[${id}] …" — skipped`);
      continue;
    }

    const wanted = `${LABEL_PREFIX}${status}`;
    const current = issue.labels.map((label) => label.name);
    const stale = current.filter((name) => name.startsWith(LABEL_PREFIX) && name !== wanted);
    const ref = `#${issue.number} (${id})`;

    if (!current.includes(wanted)) {
      await ensureLabel(labels, wanted, status);
      await mutate(`${ref}: add label "${wanted}"`, "POST", `/repos/${repo}/issues/${issue.number}/labels`, {
        labels: [wanted],
      });
    }
    for (const name of stale) {
      await mutate(
        `${ref}: remove label "${name}"`,
        "DELETE",
        `/repos/${repo}/issues/${issue.number}/labels/${encodeURIComponent(name)}`,
      );
    }

    if (status === "done" && issue.state === "open") {
      const archive = archivePath(markdown, id);
      const comment = [
        `Zamknięte automatycznie przez roadmap-sync: ${id} ma w \`${ROADMAP}\` status \`done\`.`,
        archive ? `Archiwum: \`${archive}\`.` : "",
      ]
        .filter(Boolean)
        .join("\n\n");
      await mutate(`${ref}: comment`, "POST", `/repos/${repo}/issues/${issue.number}/comments`, { body: comment });
      await mutate(`${ref}: close as completed`, "PATCH", `/repos/${repo}/issues/${issue.number}`, {
        state: "closed",
        state_reason: "completed",
      });
    } else if (status !== "done" && issue.state === "closed") {
      // One-way sync never reopens: a closed issue for an unfinished item needs a human decision.
      warn(`${ref}: issue is closed but roadmap status is "${status}" — left closed`);
    }

    if (current.includes(wanted) && stale.length === 0 && !(status === "done" && issue.state === "open")) {
      console.log(`OK    ${ref}: ${wanted}, ${issue.state}`);
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
