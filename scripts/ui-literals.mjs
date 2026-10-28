// UI literal scan: fails when a guarded view or component uses a literal colour or an arbitrary px/rem value
// instead of a design token. Based on the /10x-ui pre-audit pattern (.claude/skills/10x-ui/SKILL.md), see PATTERN.
// Zero dependencies on purpose. Run: node scripts/ui-literals.mjs [files...]
// Without arguments it scans every guarded file; with arguments only those that are also guarded.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Guarded paths, relative to the repo root. A trailing "/*.astro" guards every .astro file in that directory.
// Add a view here once it reads only tokens and components.
const GUARDED = [
  "src/pages/ingredients/index.astro",
  "src/pages/ingredients/new.astro",
  "src/pages/ingredients/edit-substitute.astro",
  "src/pages/ingredients/edit-ingredient.astro",
  "src/pages/ingredients/delete-substitute.astro",
  "src/pages/ingredients/delete-ingredient.astro",
  "src/components/ingredients/*.astro",
  "src/components/ui/Input.astro",
  "src/components/ui/Textarea.astro",
  "src/components/ui/Label.astro",
  "src/components/ui/NativeSelect.astro",
  "src/components/ui/Card.astro",
  "src/components/ui/Alert.astro",
  "src/components/ui/Badge.astro",
  "src/components/ui/focus.ts",
  "src/pages/dev/kitchen-sink.astro",
];

// Stricter than the /10x-ui pre-audit pattern: also side borders, ring-offset, accent/caret/decoration/placeholder,
// lab()/lch()/hwb()/color-mix(), and any px/rem inside an arbitrary value (negative, several values, calc(),
// type hints). A hex needs a non-word end, so anchors like #add-form are not hits.
const PATTERN =
  /#[0-9a-f]{3,8}(?![-\w])|\b(rgba?|hsla?|okl(ch|ab)|lab|lch|hwb|color-mix)\(|-\[[^\]]*\d(px|rem)[^\]]*\]|\b(bg|text|border(-[trblxyse])?|ring(-offset)?|outline|from|via|to|fill|stroke|shadow|divide|accent|caret|decoration|placeholder|inset-shadow|inset-ring)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|white|black)\b/gi;

const root = path.resolve(import.meta.dirname, "..");

// Repo-relative path with forward slashes, whether the input is absolute, relative or uses backslashes.
function toRepoPath(file) {
  return path.relative(root, path.resolve(root, file)).split(path.sep).join("/");
}

// Expands the directory globs by listing the directory; plain entries pass through.
function guardedFiles() {
  return GUARDED.flatMap((entry) => {
    const star = entry.lastIndexOf("/*");
    if (star === -1) return [entry];
    const dir = entry.slice(0, star);
    const ext = entry.slice(star + 2);
    return readdirSync(path.join(root, dir))
      .filter((name) => name.endsWith(ext))
      .sort()
      .map((name) => `${dir}/${name}`);
  });
}

const guarded = guardedFiles();
const args = process.argv.slice(2);
const files = args.length ? [...new Set(args.map(toRepoPath))].filter((file) => guarded.includes(file)) : guarded;

let hits = 0;
for (const file of files) {
  const absolute = path.join(root, file);
  if (!existsSync(absolute)) {
    console.log(`${file}: guarded file is missing (update the list in scripts/ui-literals.mjs)`);
    hits++;
    continue;
  }
  readFileSync(absolute, "utf8")
    .split(/\r?\n/)
    .forEach((line, index) => {
      for (const match of line.matchAll(PATTERN)) {
        console.log(`${file}:${index + 1}: ${match[0]}`);
        hits++;
      }
    });
}

if (hits) console.log(`\n${hits} UI literal(s) found; use tokens by role (see ## UI in CLAUDE.md)`);
process.exit(hits ? 1 : 0);
