<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: First Substitute Lookup (S-01)

- **Plan**: context/changes/first-substitute-lookup/plan.md
- **Scope**: Phase 3 of 4
- **Reviewed phases**: 3
- **Date**: 2026-10-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS (1 observation) |
| Safety & Quality | PASS (1 observation) |
| Architecture | PASS |
| Pattern Consistency | PASS (1 observation) |
| Success Criteria | PASS |

## Evidence

- Commits: f7cc546 (implementation), 625ac5b (progress SHA).
- Plan vs diff: `src/pages/ingredients/index.astro` MATCH (all three states, prefilled empty-state CTA, UUID check before querying, null client handled); `src/pages/dashboard.astro` MATCH (two links, rest unchanged); kitchen-style addendum from the phase 2 review respected. EXTRA: `src/lib/services/substitutes.ts` + `src/pages/api/ingredients.ts` (shared `isUuid`), see F2.
- Automated: `npm run lint` passes (no output), `npm run build` passes ("Complete!").
- Manual: 3.2–3.4 checked by the user; not verifiable from the diff (expected for manual checks).
- Phase interaction: phase 2 review F2 (success redirect → 404 until Phase 3) is resolved by this phase, since `/ingredients` now exists.

## Findings

### F1 — Substitutes query error hides the selection form

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/ingredients/index.astro:34, :61
- **Detail**: If only `listSubstitutes` fails, `loadError` replaces the whole card. The form disappears, and the user cannot pick another pair without editing the URL. Rare case (DB error after the categories/ingredients reads succeeded).
- **Fix**: Keep the form when categories and ingredients loaded; show the substitutes error in place of the result list.
- **Decision**: FIXED — osobny `substitutesError`; formularz zostaje, błąd w miejscu listy

### F2 — Unplanned `isUuid` extraction and refactor of the add endpoint

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/services/substitutes.ts:29-34, src/pages/api/ingredients.ts:48
- **Detail**: The plan lists only `index.astro` and `dashboard.astro` for Phase 3. The regex moved from the endpoint into the service as `isUuid` and is reused by both. Behaviour unchanged, documented in the commit message, but not in the plan.
- **Fix**: Add a one-line addendum to Phase 3 in plan.md noting the shared `isUuid`.
- **Decision**: FIXED — aneks o `isUuid()` dopisany do Fazy 3 w plan.md

### F3 — `class:list` used for class merging instead of `cn()`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/ingredients/index.astro:67, :119
- **Detail**: CLAUDE.md says to merge Tailwind classes with `cn()`, not manually. `class:list={[ctaClass, "mt-4"]}` merges without tailwind-merge. No conflicting utilities today, and `new.astro` (phase 2) uses the same `class:list` style, so the code is consistent with its sibling but not with the rule.
- **Fix**: Accept as is and clarify the rule (e.g. "`class:list` is fine in .astro when no Tailwind conflicts; use `cn()` when overriding utilities").
- **Decision**: ACCEPTED-AS-RULE: class:list czy cn() w komponentach .astro
