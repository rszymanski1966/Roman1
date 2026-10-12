<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Best Substitute Highlight

- **Plan**: context/changes/best-substitute-highlight/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-12
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Notes:
- **Plan adherence:** every contract item in phases 1–3 matches the code (`git diff 69468ab..origin/main`). The changed files are exactly the ones in the plan. The few EXTRA items are all minor tightenings:
  - additional pgTAP cases: re-mark returns null, anon gets 42501 on EXECUTE;
  - strict check that `is_best` is "1" or "0" in `best.ts`;
  - `data-best-badge` hook and `aria-label` on the list.
- **Security:**
  - The function is `security invoker` with `search_path = ''` and no dynamic SQL.
  - UPDATE is granted on the `is_best` column only, with an RLS policy on own rows. EXECUTE is granted to `authenticated` only.
  - CSRF is covered by Astro's `checkOrigin` (default true). Redirects use fixed paths, and Astro escapes the notice and error text.
- **Concurrency:** two concurrent swaps end with 23505 from the partial index, which the service maps to "Najlepszy zamiennik właśnie się zmienił…".
- **Phase 4:** the migration was applied to production before the merge (`db push` applied only `20261011201658`). Production verification 4.2 was confirmed by the user.
- **Success criteria:**
  - `npx supabase test db`: PASS (3 files, 32 tests).
  - `npm run lint`: PASS.
  - Smoke: 26/26 on commit 0f4f657, which has the same code as `main`. The re-run during this review could not connect because the dev server was down.
  - Build: PASS locally on 1ea886b. CI built and deployed `main` after the merges of #12 and #13.
- **Not reported as findings:**
  - The rollback path must also restore the table-wide UPDATE grant. This is already written in the plan's "Migration Notes".
  - `best.ts` does not check that `substitute_id` belongs to the posted pair. The worst case is a redirect to a different list of the same user, and RLS still protects the data.
  - Phase 3 findings were triaged in `impl-review-phase-3.md`.

## Findings

### F1 — set_best_substitute reads the row without a lock (matters once S-05 adds DELETE)

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261011201658_best_substitute.sql:45-48
- **Detail**: The function reads the row with a plain `select … into` and no `for update`. If the row is deleted between that read and the UPDATEs, the UPDATE affects 0 rows and the function still returns success, with the name of a substitute that no longer exists. This cannot happen today because `substitutes` has no DELETE policy. The plan's note for S-05 says deleting the best substitute "nie wymaga dodatkowej logiki" (needs no extra logic), so this nuance is not recorded anywhere.
- **Fix A ⭐ Recommended**: Record it as a note on S-05 (roadmap or that slice's plan): when DELETE is added, migrate `set_best_substitute` to `select … for update`.
  - Strength: Nothing is broken today, and the fix lands in the slice that creates the risk, with no extra production migration now.
  - Tradeoff: It relies on someone reading the note when planning S-05.
  - Confidence: HIGH — there is no DELETE policy, so the race cannot happen today.
  - Blind spot: S-05 could be planned without reading the roadmap note.
- **Fix B**: Add a new migration now with `create or replace function` using `select … for update`.
  - Strength: Closes the gap for good before S-05, and also tightens behaviour under concurrent swaps.
  - Tradeoff: Another migration plus `db push` to production for a risk that is theoretical today; needs a new change or branch.
  - Confidence: MED — the change is simple, but it needs pgTAP and smoke runs again.
  - Blind spot: Lock interaction with other updates hasn't been tested.
- **Decision**: FIXED (Fix A) — S-05 Risk note in context/foundation/roadmap.md

### F2 — `?notice=` shows any text in a green "success" box

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/ingredients/index.astro:76-78
- **Detail**: A crafted link `/ingredients?notice=…` shows attacker-chosen text in a green success box (content spoofing). It needs a signed-in victim, executes nothing, and touches no data. This is the same risk class as the existing `?error=` pattern from CLAUDE.md, only with success styling.
- **Fix**: Accept as risk. If it ever matters, pass an identifier (e.g. `?swapped=<id>`) and build the message on the server.
- **Decision**: SKIPPED
