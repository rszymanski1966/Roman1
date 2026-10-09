<!-- PLAN-REVIEW-REPORT -->
# Plan Review: First Substitute Lookup (S-01)

- **Plan**: context/changes/first-substitute-lookup/plan.md
- **Mode**: Deep (inline verification)
- **Date**: 2026-10-05
- **Verdict**: REVISE → SOUND (after triage)
- **Findings**: 1 critical 2 warnings 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL |
| Plan Completeness | WARNING |

## Grounding
6/6 paths ✓, 4/4 symbols ✓, brief↔plan ✓, Progress↔Phase ✓ (4/4 phases, 16/16 criteria)

## Findings

### F1 — Upsert needs an UPDATE policy the plan never creates

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Faza 1 §1 (RLS) + §3 (addSubstitute)
- **Detail**: `.upsert()` = INSERT … ON CONFLICT DO UPDATE; with RLS and no UPDATE policy the conflict path fails, so re-adding an existing ingredient errors. `ignoreDuplicates` returns no row on conflict.
- **Fix A ⭐ Recommended**: ON CONFLICT DO NOTHING (`ignoreDuplicates: true`) + SELECT id by key, for ingredients and the pair.
  - Strength: No UPDATE policy; stays within scope.
  - Tradeoff: One extra query per write.
  - Confidence: HIGH — standard Postgres ON CONFLICT + RLS behaviour.
  - Blind spot: None significant.
- **Fix B**: Add UPDATE policies now.
  - Strength: Single upsert call.
  - Tradeoff: Opens UPDATE before S-04; contradicts scope.
  - Confidence: HIGH.
  - Blind spot: WITH CHECK must prevent changing user_id.
- **Decision**: FIXED (Fix A)

### F2 — Malformed id gives a 400 from PostgREST, not an empty state

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 3 §1, Faza 2 §1
- **Detail**: Non-UUID `?ingredient=` / `category_id` raises 22P02, which is an error, not zero rows.
- **Fix**: UUID-format check before querying; list → empty state, endpoint → `?error=`.
- **Decision**: FIXED

### F3 — rls-isolation.sql: user setup and runner not specified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Faza 4 §2
- **Detail**: FK to auth.users requires seeding users; `supabase/tests/` is the pgTAP directory; psql may be missing, so the check stays manual.
- **Fix**: pgTAP test with auth.users setup, run via `npx supabase test db`; 4.3 moved to Automated.
- **Decision**: FIXED

### F4 — "Ponowienie po błędzie jest bezpieczne" is only half true

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: What We're NOT Doing (atomowość)
- **Detail**: Orphan ingredient on partial failure; double submit duplicates substitute.
- **Fix**: Reword claim; accept both effects explicitly.
- **Decision**: FIXED

### F5 — Phase commits on main deploy before `db push`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Migration Notes / Prerequisites
- **Detail**: CI deploys on push to main; code could reach prod before the hosted migration.
- **Fix**: Feature branch, or `db push` before first push of Faza 2 code.
- **Decision**: FIXED
