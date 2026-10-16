<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Ingredient Name Search

- **Plan**: context/changes/ingredient-name-search/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-16
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Success criteria (re-run 2026-10-16): `npm run lint`: PASS. `BASE_URL=http://localhost:4321 npm run smoke`: PASS (35/35). `npm run build` was not re-run because a dev server was running; it passed in phases 1 and 2, and CI runs it on the PR. Every manual item in Progress is `[x]`. There is evidence for 3.3: in this session's break-check, ignoring `match` turned 2 steps red.

Noted, not findings:
- `listIngredients` has no `.range`, so the PostgREST max-rows limit (1000 by default) caps search. The plan accepts this ("no pagination").
- With `?ingredient=`, the substitutes query could run in `Promise.all` instead of after the lists. That would save one round trip, but the NFR < 1 s is not at risk.

## Findings

### F1 — The category filter and the "URL beats cookie" rule have no positive smoke check

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:284-289
- **Detail**: The step "search in a category without its substitutes finds nothing" expects "Nie znaleziono składnika". It still passes in two broken cases:
  - `match=contains` from the URL is ignored and the cookie's `prefix` wins;
  - `listIngredientIdsWithSubstitutes` always returns an empty set.

  No step proves that a URL mode overrides the cookie (`index.astro:32`), and none proves the category filter can return a hit.
- **Fix**: Add a step right after "search without match uses the remembered prefix mode". It requests `?q=${searchFragment}&match=contains&category=${categoryId}` and expects `bodyIncludes: foundSubstitute`. The cookie is still `prefix` at that point, so the step covers both the URL > cookie precedence and the filter's "allowed" path.
- **Decision**: FIXED: added step "contains from the URL beats the cookie and the category filter keeps the ingredient" (scripts/smoke.mjs). Break-check: a cookie-over-URL break and an always-empty-filter break each turned only this step red. Smoke is green after restore.

### F2 — Three approved phase 2 deviations are not recorded in plan.md

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/ingredients/index.astro:362, :135-140, :172/:199
- **Detail**: The deviations, which the user approved in the phase 2 session:
  - the category section headings are `h3`; the plan says `h2`;
  - the "Dodaj zamiennik" CTA carries the ingredient id only for the user's own ingredient; the plan says "CTA jak dziś";
  - the forms sit side by side from md up (card `md:max-w-3xl`); the plan says search sits above the list.

  Only the 463ab1f commit message records them. Future reviews and archives treat the plan as the source of truth.
- **Fix**: Add a short "Odstępstwa od planu (zatwierdzone)" note to `## Notes` in `change.md`, or as a section before `## Progress` in plan.md. List the 3 points and refer to 463ab1f.
- **Decision**: FIXED: the 3 deviations are recorded in change.md → ## Notes → "Odstępstwa od planu (zatwierdzone)".

### F3 — Smoke never covers the "Pasujące składniki" list or the per-category sections

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs (search steps); src/pages/ingredients/index.astro:324-336, :359-402
- **Detail**: Two views have no smoke step:
  - The multi-hit list. Every search in smoke hits 0 or 1 ingredients.
  - The view without a category across several sections. `smoke-search` has substitutes in only one category, so smoke would not catch broken grouping or ordering.
- **Fix**: Optional, 2 steps:
  - Search `?q=smoke-&match=contains` (it hits both of account A's ingredients) and expect `Pasujące składniki (2)`.
  - Add a second `foundSubstitute` in `otherCategoryId`, then check that `?ingredient=<id>` shows both substitutes.
- **Decision**: FIXED: 3 steps in scripts/smoke.mjs ("search matching several ingredients lists them", adding `smoke-other` in otherCategoryId, "ingredient view without a category shows both categories in sort order"). Break-check: treating several hits as one and reversing group order each turned only the matching step red. Smoke is green after restore.

### F4 — index.astro and best.ts duplicate the q cap and normalization

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/ingredients/index.astro:17, :24; src/pages/api/substitutes/best.ts:8, :68
- **Detail**: `MAX_QUERY_LENGTH = 100` and the trim → slice → trim cleanup appear in both files; best.ts even comments "Same cap as the search field". `MATCH_MODE_COOKIE` and `parseMatchMode` have already moved to the service, so this pair is the odd one out. The list URL is also built twice (`withParams`/`matchHref` vs `listRedirect`). The order agrees today, and smoke pins it for best.ts.
- **Fix**: Export `MAX_QUERY_LENGTH` and `normalizeQuery(raw)` from `src/lib/services/substitutes.ts` and use them in both files. Leave the URL builders alone.
- **Decision**: FIXED: `MAX_QUERY_LENGTH` and `normalizeQuery()` are exported from src/lib/services/substitutes.ts and used in index.astro and best.ts; no behavior change. Lint, prettier and smoke all pass.

### F5 — The S-03 Backlog Handoff row in the roadmap is stale; S-02 had the same problem

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: context/foundation/roadmap.md:135
- **Detail**: The S-03 row in `## Backlog Handoff` still says Ready `yes` / "Run `/10x-plan ingredient-name-search`", even though the plan exists and is implemented. S-02 had the same problem: after `/10x-archive` its row still said "Run /10x-plan…", and this change had to fix it (phase 1, 6b39beb). `/10x-archive` flips Status in the "At a glance" table and in the item body, but not in Backlog Handoff. The problem recurs, so this is not a one-off.
- **Fix**: When archiving S-03, set the row to `—` / `Done (archived <date>)` in the same commit. Consider recording it with `/10x-lesson`.
- **Decision**: ACCEPTED-AS-RULE: Wiersz Backlog Handoff w roadmapie po archiwizacji (lessons.md). The row is not changed now; it will be updated at /10x-archive.

### F6 — After "Oznacz jako najlepszy" from a one-hit URL, the page shows a back link that wasn't there before

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/ingredients/index.astro:144-147; src/pages/api/substitutes/best.ts:25-36
- **Detail**: With exactly one hit, the view renders on `?q=…&match=…` (no `ingredient`), so the back link doesn't show. The redirect from best.ts goes to `?ingredient=…&q=…&match=…`, so the link "← Wszystkie wyniki dla „q”" appears after the click. It leads back to the same ingredient. This follows the plan ("przy jednym trafieniu link wraca do tego samego składnika"), but the view changes slightly after the action.
- **Fix**: None needed (the plan accepts this). Skip it, or fix it later if it bothers anyone in use.
- **Decision**: FIXED (on the page): index.astro counts the search hits also with `ingredient` + `q`, and the back link shows only when there is more than one hit (when the filter query fails it stays). 2 smoke steps (one-hit = no link, several hits = link). Break-check: the old condition turned the one-hit step red. Lint, astro check and smoke all pass. Recorded in change.md → Odstępstwa.
