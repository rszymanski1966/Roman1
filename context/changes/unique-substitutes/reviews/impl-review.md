<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Unique Substitutes Implementation Plan

- **Plan**: context/changes/unique-substitutes/plan.md
- **Scope**: Full plan (completed phases)
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-10
- **Verdict**: APPROVED
- **Findings**: 0 critical, 1 warning, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

## Success criteria

- `npx supabase test db`: PASS (2 files, 18 tests)
- `npm run lint`: PASS; `npm run build`: PASS
- `BASE_URL=http://localhost:4321 npm run smoke`: PASS (18 steps)
- `npx supabase db reset` (1.1): not re-run during the review, because it wipes local data. It passed in phase 1 (f05b9da).
- Manual 1.4, 2.4–2.6: confirmed by the user. 1.4 has evidence from the session (15 → 14 rows, the oldest kept).

## Findings

### F1 — CSV snapshot can miss rows, no rollback steps

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261010115230_unique_substitutes.sql:14-24, plan Faza 3
- **Detail**: The DELETE is irreversible and there is no down migration. The CSV from 3.1 is the only copy, but it is taken before `db push`. A duplicate added between the preview and the push gets deleted without being in the CSV. The plan also has no manual rollback steps.
- **Fix**: In plan 3.1/3.2: run the preview right before `db push` and compare the deleted-row count with the CSV. Add manual rollback steps to Migration Notes (drop the constraint, recreate the index, drop `name_key`, re-insert rows from the CSV).
- **Decision**: FIXED (plan: preview right before push + row-count check; manual rollback steps in Migration Notes)

### F2 — Smoke contract in the plan differs from the implementation

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: scripts/smoke.mjs:119-137 vs plan Faza 2 §3
- **Detail**: The plan expects the prefix `/ingredients/new?error=`. The implementation checks the prefix up to the closing quote of the conflict message. This deliberate tightening caught the broken 23505 mapping in the break-check. The plan does not record it.
- **Fix**: Add a note about the adaptation to the plan's Faza 2 §3 contract.
- **Decision**: FIXED (plan: adaptation note in Faza 2 §3)

### F3 — Two ways to derive name_key

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: supabase/migrations/20261010115230_unique_substitutes.sql:11-12 vs src/lib/services/substitutes.ts:37-39
- **Detail**: `ingredients.name_key` is computed in the app (`toLocaleLowerCase("pl")`). `substitutes.name_key` is a generated column (`lower(name)`). This was a deliberate choice so that S-04 keeps the key in sync. Without a rule, the next table could go either way.
- **Fix**: Record a lesson: new name keys use a generated `lower()`, and `ingredients` is the exception.
- **Decision**: ACCEPTED-AS-RULE: Klucz nazwy (name_key) jako kolumna generowana

### F4 — Whitespace normalization happens only in the app

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261010115230_unique_substitutes.sql:12
- **Detail**: The key is `lower(name)`. trim and space collapsing are done only by `normalizeName`. A write that bypasses `/api/ingredients` could store "Olej  kokosowy" next to "Olej kokosowy". Reach is low today: the key is server-only and every write goes through the API.
- **Fix**: Accept as risk. Possible hardening later: `lower(regexp_replace(btrim(name), '\s+', ' ', 'g'))`.
- **Decision**: SKIPPED (risk accepted: all writes go through the API)

### F5 — Double submit shows an error after a successful save

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/substitutes.ts:111-115
- **Detail**: On a double click, the first request saves the row. The second gets 23505 and goes back to the form with "jest już zapisany". The data is correct and the message is true, but the user may think the save failed.
- **Fix**: Skip, or disable the submit button after the first click.
- **Decision**: SKIPPED

### F6 — No automated test for the duplicate-removal step

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/tests/unique-substitutes.sql, scripts/smoke.mjs
- **Detail**: Only manual check 1.4 verified that the oldest row survives. Smoke does not check that the list still shows exactly one entry after a duplicate attempt (manual 2.4 covers this). The migration runs once.
- **Fix**: Skip (accept: a one-off migration, checked manually on real data).
- **Decision**: SKIPPED (one-off migration, manually verified in 1.4)
