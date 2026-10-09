<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: First Substitute Lookup (S-01)

- **Plan**: context/changes/first-substitute-lookup/plan.md
- **Scope**: Phase 2 of 4
- **Reviewed phases**: 2
- **Date**: 2026-10-08
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Automated: `npm run lint` — clean; `npm run build` — Complete (2026-10-08).
Manual 2.2–2.4 marked [x] at e009821; evidence lives in Studio / browser, consistent with the diff.

## Findings

### F1 — Unplanned UI rework commits on the change branch

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Scope Discipline
- **Location**: commits 0485291, 978223f (src/pages/ingredients/new.astro, src/pages/dashboard.astro, src/styles/global.css, auth pages, landing)
- **Detail**: After p2 two commits outside the plan restyled the app (kitchen theme, Polish copy, landing page). They touch new.astro (Phase 2) and dashboard.astro (Phase 3 target). Plan still says pages use the "cosmic" glass style of dashboard.astro, so Phase 3 (index.astro) would be built against a stale style reference.
- **Fix A ⭐ Recommended**: Add a short addendum to the plan: theme changed to kitchen (`bg-kitchen`, stone/orange palette, Polish copy); Phase 3 pages follow new.astro styling.
  - Strength: Keeps the work; the plan stays the source of truth for /10x-implement in Phase 3.
  - Tradeoff: Plan grows by an out-of-scope note.
  - Confidence: HIGH — the only Phase 3 dependency is the style reference and dashboard.astro.
  - Blind spot: None significant.
- **Fix B**: Move the UI commits to a separate branch/change.
  - Strength: Strict scope; S-01 PR shows only planned work.
  - Tradeoff: Rebase/conflicts in new.astro and dashboard.astro.
  - Confidence: MED — conflicts are small but certain.
  - Blind spot: Whether the branch is already pushed/shared.
- **Decision**: FIXED (Fix A) — aneks o stylu kuchennym dopisany do Fazy 3 w plan.md

### F2 — Success redirect lands on a 404 until Phase 3

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/pages/api/ingredients.ts:76
- **Detail**: Redirect to `/ingredients?ingredient=…&category=…` as planned, but `src/pages/ingredients/index.astro` does not exist yet. Expected in a phased plan; do not merge/deploy the branch between phases.
- **Fix**: None — Phase 3 creates the page.
- **Decision**: DISMISSED — nieaktualne; /ingredients istnieje od fazy 3

### F3 — Validation error clears the whole form

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (UX)
- **Location**: src/pages/api/ingredients.ts:24-26
- **Detail**: Redirect carries only `?error=`; the user retypes all fields (incl. up to 500 chars of notes). Not required by the plan.
- **Fix**: Skip for S-01, or append `ingredient`/`category` (already supported prefill) to the error redirect.
- **Decision**: FIXED — w przeglądzie całego planu (impl-review.md, F3, Fix A)

### F4 — Non-form POST throws 500

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/ingredients.ts:38
- **Detail**: `request.formData()` throws on a body that is not form-encoded, giving 500 instead of `?error=` redirect. Same as existing auth routes; only reachable by hand-crafted requests.
- **Fix**: Wrap in try/catch and return `errorRedirect("Nieprawidłowe dane formularza.")`.
- **Decision**: FIXED — w przeglądzie całego planu (impl-review.md, F2)
