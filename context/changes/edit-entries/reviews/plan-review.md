<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Edycja wpisów (S-04)

- **Plan**: context/changes/edit-entries/plan.md
- **Mode**: Deep
- **Date**: 2026-10-21
- **Verdict**: REVISE → SOUND po triage (wszystkie 4 findings naprawione w planie)
- **Findings**: 1 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | FAIL |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

8/8 paths ✓, 9/10 symbols ✓ (`index.astro:391-407` no longer holds the card), brief↔plan ✓, Progress↔Phase ✓ (3/3 phases).

Verified and fine: revoke→grant order; `ON CONFLICT DO NOTHING` upsert on `ingredients` after UPDATE is revoked (no UPDATE privilege needed); `update().select().maybeSingle()` returns empty for RLS-hidden rows; renaming "Masło"→"masło" on the same row; renaming `searchIngredient` keeps `searchFragment`. The pgTAP test for `set name_key` will probably get `428C9` (the rewriter fails before the permission check). The plan already allows for that.

## Findings

### F1 — Edit pages copy new.astro, which breaks the UI contract

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Implementation Approach; Faza 2 §5, Faza 3 §3
- **Detail**: The plan said the edit pages "powielają markup new.astro". new.astro has palette literals (`stone-*`, `orange-*`, `amber-*`, :43-49, :145-164) and is not in `GUARDED` in `scripts/ui-literals.mjs`, so `lint:ui` would not catch the copy. CLAUDE.md § UI requires tokens, Input/Label/Card/Alert, `buttonVariants()`+`focusRing`, adding views to `GUARDED`, and updating the kitchen-sink.
- **Fix**: Build the edit pages from tokens and `ui/` components (modelled on index.astro/SubstituteCard). Add a new `Textarea.astro`, put both pages in `GUARDED`, add their states to the kitchen-sink, and add `npm run lint:ui` to the criteria for Faza 2 and 3.
- **Decision**: FIXED (Faza 2 §5 and the new §8 „Kontrakt UI”, Faza 3 §3, Implementation Approach, Key Discoveries, Progress 2.2 and 3.2 with renumbering)

### F2 — The "Edytuj" link targets index.astro, but the card moved

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 §6, Faza 3 §4, Key Discoveries
- **Detail**: After ingredients-list-ui the card is `SubstituteCard.astro` (form :47-63), and `withParams`/`shownIngredient` are not in its scope. The `<h2>` is at `index.astro:259` and the notice at :192-196. The smoke line references (:42-46, :323-332, :251) had shifted.
- **Fix**: Faza 2 §6 → SubstituteCard.astro (href from props, update the comment at :10-13), Faza 3 §4 → index.astro:259, refresh the line numbers.
- **Decision**: FIXED

### F3 — Edit page without list context loses the edit

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 2 §3–§5, Faza 3 §2–§3
- **Detail**: Without `ingredient` in the URL, `parseListView` returns null and the endpoint redirects to `/ingredients?error=Nieprawidłowe dane formularza.` without saving and without echo.
- **Fix**: `getSubstituteForEdit` returns `ingredientId`, and the page falls back to it when the URL `ingredient` is invalid. edit-ingredient falls back to `ingredient_id`.
- **Decision**: FIXED

### F4 — "Nie znaleziono" shows twice on the edit page

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 2 §4–§5, Faza 3 §2–§3
- **Detail**: A service "not found" goes back to the edit form with `?error=`, and the page also renders its own not-found state.
- **Fix**: In the not-found state the page does not show the `?error=` Alert.
- **Decision**: FIXED
