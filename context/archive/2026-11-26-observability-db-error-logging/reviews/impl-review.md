<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Logowanie błędów bazy w warstwie serwisów

- **Plan**: context/changes/observability-db-error-logging/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-11-27
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Automated checks run on 2026-11-27: `npm run test:unit` (163/163), `npm test` (283/283 unit+services, 14/14 migrations, sweeps 0, dev data unchanged), `npm run test:http` (66/66, dev server started for the run and stopped afterwards), `npm run lint`, `npm run lint:db-access`, `npx prettier --check context/foundation/test-plan.md`. All green.

Checked and clean: all 17 PostgREST error branches log through `logDbError` (23505 and P0002 skip it, as planned); every user-facing string matches `main` byte for byte; ids are only uuids (callers check `isUuid`); `details` is never logged; no log call can throw; no double logging; both callers of `listIngredientSubstitutes` handle the new `fail()`; spies are restored and the substituted fetch is per client.

## Findings

### F1 — Non-JSON error body logged as `code=network`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/log.ts:30
- **Detail**: postgrest-js turns a non-2xx response with a body that is not JSON into `{ message: body }` with no `code` (`node_modules/@supabase/postgrest-js/dist/index.mjs:513-524`). `code || "network"` then prints e.g. `code=network status=502 message="<html>…"`. A gateway/Cloudflare 5xx page reads as a network outage, and the whole HTML body goes into the line (no user data, but no length limit). The comment at :23 assumes an empty code only comes with status 0.
- **Fix**: Print `network` only when `status === 0` (otherwise e.g. `code=none`), cap `message` at a fixed length, and add one unit row (502 with an HTML body).
- **Decision**: FIXED — `log.ts`: `code=none` when there is no code and the status is not 0; `message` cut to 300 characters in both the line and the cause. New unit case "error body that is not JSON" (red before the fix, green after; test:unit 164/164).

### F2 — §6.1 says every substituted response is confirmed on the real stack; 23514 is not

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: context/foundation/test-plan.md:133; tests/services/db-error-logging.test.ts:1-7
- **Detail**: The §6.1 exception has a condition: „kształt każdej podstawionej odpowiedzi potwierdza test na prawdziwym stosie”. The services file confirms only 42501 (anon RPC), 0 rows → not_found and 23505. The 23514 check violation is not confirmed. It is the main privacy case (the unit test at :79-84 relies on `details` holding the row and `message` holding only the constraint name). XX000/500 is not confirmed either. The status-0 shape comes from the postgrest-js source, which is acceptable. The plan already over-claimed this (Implementation Approach: "kształt odpowiedzi z fixture'ów potwierdza test services").
- **Fix A ⭐ Recommended**: Add a real 23514 to `tests/services/db-error-logging.test.ts`: `renameIngredient(user.client, id, "x".repeat(101))` hits `check (char_length(name) between 1 and 100)` (migration 20261004120000:33; the service does no length check, :505-516). Assert one error line with `code=23514`, `status=400`, the constraint name, and no fixture name.
  - Strength: Confirms the privacy-critical shape on real Postgres, so the §6.1 condition holds for the case that matters most.
  - Tradeoff: One more services test (one account, under a second).
  - Confidence: HIGH — the constraint exists and the service passes the name through unchanged.
  - Blind spot: The constraint name Postgres generates (`ingredients_name_check`?) is not verified; the assertion should read it from the real response or the catalog, not guess it.
- **Fix B**: Narrow the wording of §6.1 and of the services file header to "the shapes listed in `tests/services/db-error-logging.test.ts`", and name the rest as taken from the postgrest-js source.
  - Strength: Documentation-only, no new test.
  - Tradeoff: The privacy case stays proven only on fixtures.
  - Confidence: MED — honest, but it weakens the exception's guarantee.
  - Blind spot: None significant.
- **Decision**: FIXED via Fix B — the §6.1 condition and both test headers now name the shapes confirmed on the stack (42501, 0 rows, 23505); 23514, XX000, status 0 and a non-JSON body are stated as unconfirmed.

### F3 — Committed files cite an audit report that is not committed

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/unit/db-error-logging.test.ts:3; tests/services/db-error-logging.test.ts:5; context/changes/observability-db-error-logging/change.md (Notes); plan.md:5
- **Detail**: `context/audits/` is untracked (`git ls-files context/audits` is empty). The oracle references in both test headers, the change notes and the plan point to `context/audits/observability/2026-11-26_auth-writes-lookup.md`, which would not exist in the PR. `/10x-observability-audit --verify` needs the report as its reference point.
- **Fix**: Commit `context/audits/observability/2026-11-26_auth-writes-lookup.md` on this branch (a separate `docs(observability)` commit) before the PR.
- **Decision**: FIXED — committed alone in 494c789 (`docs(observability): …`).

### F4 — `saved_without_best_mark` outcome is not in the plan contract

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: src/lib/log.ts:45-52; src/lib/services/substitutes.ts:236
- **Detail**: The plan's contract is `logExpected(op, "not_found" | "invalid_category", ids?)`. The code adds a third outcome, `saved_without_best_mark`, for the `addSubstitute.markBest` warn (the plan required the warn but did not say how). `change.md` records it (W3); `plan.md` does not. The exported `LogIds` type is also unplanned and harmless.
- **Fix**: Add a one-line addendum in plan.md Phase 2 §2 that names the third outcome.
- **Decision**: FIXED — addendum added to plan.md, Phase 2 §2.

### F5 — §6.1 „Granica” still reads as an absolute ban

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md (§6.1 „Granica”, just above :133)
- **Detail**: The plan's contract named the „Granica”/„Nie” bullets. The implementation added a separate „Wyjątek” bullet and touched „Nie”, but „Granica” still says „nigdy … klienta Supabase” with no pointer. Someone who reads only that bullet sees an absolute rule.
- **Fix**: Add „(wyjątek: kontrakt logowania niżej)” to the „Granica” bullet.
- **Decision**: FIXED — „Granica” now reads „klienta Supabase (wyjątek: kontrakt logowania błędów bazy niżej)”.

### F6 — Test headers cite plan.md under context/changes/, which moves on archive

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/unit/db-error-logging.test.ts:6; tests/services/db-error-logging.test.ts:10
- **Detail**: Both headers cite `context/changes/observability-db-error-logging/plan.md` with line numbers. After `/10x-archive` the folder moves to `context/archive/<date>-observability-db-error-logging/`. Sibling tests cite archive paths.
- **Fix**: In the archive commit, replace the path in both headers with the archive path (the line numbers stay valid).
- **Decision**: FIXED (queued) — step for the archive commit in `follow-ups/review-fixes.md`; plan.md line numbers kept stable (the F4 addendum sits on an existing line).

### F7 — Auth endpoints still say "no logger in the app yet"

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/pages/api/auth/signin.ts:15; src/pages/api/auth/signup.ts:15
- **Detail**: Both comments justify a direct `console.warn` with "no logger in the app yet", and `src/lib/log.ts` now exists. Auth is out of scope here (fix nr 2, `logAuthError`), so this is not drift. But the comment is now false, and the next agent may copy the direct-console pattern.
- **Fix**: Leave the code as it is and put the comment update and the move to `src/lib/log.ts` in the fix nr 2 change (note it in that change's research).
- **Decision**: FIXED (queued) — follow-up for the fix nr 2 change in `follow-ups/review-fixes.md`; no code change here.
