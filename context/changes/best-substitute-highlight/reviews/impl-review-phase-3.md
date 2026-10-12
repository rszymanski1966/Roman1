<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Best Substitute Highlight

- **Plan**: context/changes/best-substitute-highlight/plan.md
- **Scope**: Phase 3 of 4
- **Reviewed phases**: 3
- **Date**: 2026-10-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Notes:
- Plan adherence: all 4 planned changes MATCH (service, API, form, smoke). The only EXTRA is the smoke step "add form echoes the best checkbox after a validation error". It is in scope and automates manual check 3.6.
- Success criteria:
  - Lint passed again during this review.
  - Build and smoke passed in /10x-implement on the exact code of commit 1ea886b. Smoke ran 26/26, and the break-check went red when `isBest` was ignored.
  - The smoke re-run during this review could not connect (`fetch failed`) because the dev server was not running. That says nothing about the code.
  - Manual checks 3.4–3.7 were confirmed by the user.

## Findings

### F1 — Duplicated swap-notice template in two endpoints

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/ingredients.ts:117, src/pages/api/substitutes/best.ts:71
- **Detail**: The text `Najlepszy zamiennik zmieniony: ${replaced} → ${name}.` is copied into both endpoints, and smoke checks both by prefix, so the two copies can drift apart unnoticed. `best.ts` takes the new name from the DB (`substituteName` from the RPC). `ingredients.ts` takes it from the form value `substitute`. The two are identical today because both go through `normalizeName`, but `addSubstitute` throws away `best.data.substituteName`.
- **Fix**: Export a helper `bestSwapNotice(replacedName, substituteName)` from `src/lib/services/substitutes.ts` and use it in both endpoints. Optionally, return the stored name from `addSubstitute` as well.
- **Decision**: FIXED — helper bestSwapNotice in src/lib/services/substitutes.ts, used in api/ingredients.ts and api/substitutes/best.ts

### F2 — bestError hides the specific reason the mark failed

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/substitutes.ts:131-139
- **Detail**: When `setBestSubstitute` fails, its message (for example 23505 "Najlepszy zamiennik właśnie się zmienił…") is replaced by the generic text from the plan, "Zamiennik zapisany, ale nie udało się oznaczyć go jako najlepszy." This follows the plan, and the fallback is acceptable: the substitute is saved, and the user can mark it from the list.
- **Fix**: Accept as is (plan-mandated text), or append `best.error` to `bestError`. That would change the plan's contract.
- **Decision**: SKIPPED — the plan text is deliberate; the case is rare and recoverable from the list

### F3 — Stale comment about where list messages come from

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/ingredients/index.astro:11
- **Detail**: The comment says `?notice=`/`?error=` come from `/api/substitutes/best`. Since phase 3, `/api/ingredients` sends them too (swap notice, or the error when marking fails).
- **Fix**: Change the comment to "Messages from /api/substitutes/best and /api/ingredients: …".
- **Decision**: FIXED — comment updated in src/pages/ingredients/index.astro:11
