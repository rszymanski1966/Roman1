<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Faza 2 test-planu: wyszukiwanie i „najlepszy”

- **Plan**: context/changes/testing-search-and-best/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-11-13
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 3 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Plan drift: no DRIFT or MISSING item. Every contract-table row has a test, and every oracle is a literal or an admin-key observation. Minor extras (`resolveCategory`, `closeSession(s)`/`closeOnFailure`, extra control assertions in `search.test.ts`, two extra rows in `search-match.test.ts`) support the plan's intent. Phase 2's behaviour equivalence was verified against the pre-change page. The mutant body differs from `20261011201658_best_substitute.sql:36-77` only in its name.

Success criteria (re-run 2026-11-13): `npm run test:unit` 73/73, `npm test` 146/146, `npm run test:http` 25/25 (harness: 0 accounts, dev data unchanged both times), `npx supabase test db` PASS, `npm run lint`, `lint:ui` and `lint:db-access` PASS, `npm run smoke` PASS. Not re-run in this review: 1.1 with the stack stopped (verified in Phase 1) and 4.1 five times in a row (verified in Phase 4). 6.1: `CLAUDE.md` fails `prettier --check` only inside the generated 10x-cli block, as it already did at HEAD before the change. The user accepted this as pre-existing. All manual rows are `[x]` with evidence from the session (break-checks, session check, reviews).

Outside this change: `hasSearchHits` drops the Supabase error without logging it (`substitutes.ts:477-478`, `delete.ts:75`). This is pre-existing code and a candidate for `/10x-observability-audit`.

## Findings

### F1 — Error in `finally` hides the error that explains a race-test failure

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/services/best-concurrency.test.ts:170-172, :205-207; tests/harness/pg-sessions.ts:118-124
- **Detail**: Both tests call `await closeSessions(x, y, observer)` in `finally`. When the body throws (for example the "Przeplot nie powstał…" diagnostic, or a pg error from a broken connection) and the close also throws (the rollback on that same broken connection), JS keeps only the `finally` error. The diagnosis is lost. `closeSession` has the same `try { rollback } finally { end() }` shape. `closeOnFailure` (:36-49) already does this correctly with an `AggregateError`. This breaks the "never hide the evidence" rule.
- **Fix**: Add a `withSessions(open, body)` helper in `pg-sessions.ts` that catches the body's error and, when the close also fails, throws `AggregateError([bodyError, closeError], …, { cause: bodyError })`, the same pattern as `closeOnFailure`. Use it in both tests, and apply the same idea inside `closeSession`.
  - Strength: matches the file's own `closeOnFailure` pattern. A failed run always shows the first cause.
  - Tradeoff: one more helper; the tests' `try/finally` blocks are restructured.
  - Confidence: HIGH — the masking follows from JS `finally` semantics and is visible in the code.
  - Blind spot: not reproduced at runtime (it needs a connection killed in the middle of a test).
- **Decision**: FIXED (2026-11-15) — `failureOf` + `withSessions` in `tests/harness/pg-sessions.ts` (the body error stays the `cause` of the `AggregateError`; `closeSession` keeps the rollback error as the cause); both race tests use `withSessions`. `cause: bodyError` is written without a nested `catch`, because `preserve-caught-error` rejects it there. Race tests 3/3; fake-session check: cause = body error.

### F2 — `lint:db-access` does not see the new direct Postgres driver

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/db-access.mjs:22-29 (`SECRET_PATTERN`, `FACTORIES`)
- **Detail**: This change installs `pg` (a devDependency, used only in `tests/` today). The guard's purpose is that the app reaches the database only as the signed-in user. It knows only the `@supabase/supabase-js` and `@supabase/ssr` factories, and its secret pattern does not include `DB_URL`. `import { Client } from "pg"` in `src/` with a `DB_URL` connection string would bypass RLS, and nothing would flag it.
- **Fix A ⭐ Recommended**: Extend the guard now. In `scanSource` (it scans only `src/`), report any import of `pg`, `pg-pool` or `postgres`, and add `DB_URL` to `SECRET_PATTERN`. Add a case to `tests/scripts/db-access.test.ts`.
  - Strength: closes the hole in the same change that opened it. The guard already has a test file to extend.
  - Tradeoff: touches a file outside the plan's list (a small addendum to scope).
  - Confidence: HIGH — the structure of `FACTORIES` and `scanSource` makes this a few lines.
  - Blind spot: rule (c) (`security definer`) and CI coverage of the guard are unchanged. The guard is not in CI yet.
- **Fix B**: Record it as a follow-up for rollout phase 4 ("Walidacja i bramki", where the guard goes into CI).
  - Strength: keeps this change's scope exactly as planned.
  - Tradeoff: the gap stays open until phase 4; any `src/` change in between is unguarded.
  - Confidence: MED — depends on phase 4 actually picking it up.
  - Blind spot: none significant.
- **Decision**: DEFERRED via Fix B (2026-11-15) — queued in `follow-ups/review-fixes.md` for test-plan rollout Phase 4 "Walidacja i bramki".

### F3 — The cookie tests depend on the order of their `it` blocks

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/http/search.test.ts:101-156
- **Detail**: The five cookie `it` blocks share one cookie jar (`cookieSession`). Steps 2-4 assume that step 1 stored `prefix` (comment at :138). If step 1 fails, the later steps fail with misleading messages. Running a single step (`-t`, `it.only`, a future `sequence.shuffle`) breaks it. The other HTTP tests keep each `it` independent after `beforeAll`.
- **Fix**: Merge the cookie sequence into one `it` with labelled steps (expect messages or comments per step), so the dependency is explicit and cannot be run partially.
- **Decision**: FIXED (2026-11-15) — the cookie sequence is one `it` with six labelled steps (`expect(value, step)`); `tests/http/search.test.ts` 8/8 against `npm run dev`.

### F4 — pg clients have no `error` listener and no connection timeout

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/harness/pg-sessions.ts:24-26
- **Detail**: `new Client({ connectionString })` has no `connectionTimeoutMillis` and no `client.on("error", …)`. If a connection is killed while idle in transaction (for example the stack restarts in the middle of a run), it emits `error` with no handler, and Vitest reports an unrelated "Unhandled Error". A port that accepts but never answers makes `connect()` hang until the 15 s test timeout.
- **Fix**: Set `connectionTimeoutMillis: 5_000` and add an `error` listener that stores the error on the session, so that `closeSession` rethrows it.
- **Decision**: FIXED (2026-11-15) — `connectionTimeoutMillis: 5_000` and an `error` listener that stores `session.lost`; `closeSession` reports lost → rollback → close with the first one as the cause. Runtime check: `pg_terminate_backend` on an idle-in-transaction session → no unhandled error, cause = "terminating connection due to administrator command".

### F5 — Circular import, and a second copy of the mode rule in the delete endpoint

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/lib/search-view.ts:1, src/lib/services/substitutes.ts:14-16; src/pages/api/ingredients/delete.ts:71-72
- **Detail**: `search-view.ts` imports `isUuid`, `parseMatchMode` and `matchIngredients` from `substitutes.ts`, which imports `searchMatches` back. This is safe today (no top-level use), but it departs from the project's pattern: pure rules live in a module without imports (`entry-fields.ts`) and are re-exported by the service. Also, `delete.ts` still hand-codes `form > cookie > contains` instead of `resolveMatchMode`, so the "single source" covers only the page and `hasSearchHits`. The plan forbade endpoint changes in this phase, so this is not drift.
- **Fix A ⭐ Recommended**: In a follow-up change, move the three pure functions into `search-view.ts` and re-export them from `substitutes.ts`, as `normalizeName`/`toNameKey` are. Switch `delete.ts` to `resolveMatchMode(view.match, cookie).mode`.
  - Strength: one direction of dependency, one source of the rule. Unit tests already cover `resolveMatchMode`.
  - Tradeoff: touches an endpoint (needs `npm run test:http` and smoke), which is outside this plan's "What We're NOT Doing".
  - Confidence: HIGH — a mechanical move with existing tests on both sides.
  - Blind spot: other callers of `isUuid` and `parseMatchMode` must keep their import path through the re-export.
- **Fix B**: Leave it. Note in `search-view.ts` that `delete.ts` keeps its own copy.
  - Strength: no change to app code in a test-only rollout phase.
  - Tradeoff: the duplicate rule can drift unnoticed.
  - Confidence: MED.
  - Blind spot: none significant.
- **Decision**: FIXED via Fix B (2026-11-15) — no app-code change; the header comment of `src/lib/search-view.ts` now names the copy of the mode rule in `delete.ts` and the circular import.

### F6 — HTTP test helpers: fixtures taken from the services folder, and a second `decodeHtml`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/http/search.test.ts:9, :51-53
- **Detail**: The test imports `add`, `loadCategoryIds` and `oneId` from `../services/fixtures.ts`, while the other HTTP tests use their own loaders. Its `decodeHtml` duplicates the one in `delete-confirmation.test.ts:72-79` with different behaviour: it decodes `&amp;` first, so `&amp;quot;` becomes `"` (a double decode), and it skips `&#39;`, `&lt;` and `&gt;`. This is harmless for today's fixture names.
- **Fix**: Move one correct `decodeHtml` (`&amp;` decoded last), together with `links()`, into `tests/http/client.ts`. Move the shared fixtures to `tests/harness/fixtures.ts` (or document cross-project reuse in §6.4).
- **Decision**: FIXED (2026-11-15) — one `decodeHtml` (`&amp;` last, plus `&#39;`, `&lt;`, `&gt;`, `&#38;`) and `links()` in `tests/http/client.ts`, used by `search.test.ts` and `delete-confirmation.test.ts` (its `linkHrefs` now filters `links()`); `tests/services/fixtures.ts` moved to `tests/harness/fixtures.ts` (imports in 4 service tests + the HTTP test, test-plan §6.2 updated). `npm test` 146/146, `npm run test:http` 21/21.

### F7 — The HTTP cookie test fails outright when `BASE_URL` is https

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: tests/http/search.test.ts:114
- **Detail**: `expect(new URL(BASE_URL).protocol).toBe("http:")` fails the test when `BASE_URL` points at https, instead of expecting `Secure` in that case.
- **Fix**: Branch the assertion on the protocol: `Secure` is present over https and absent over http.
- **Decision**: FIXED (2026-11-15) — `expect(secure).toBe(protocol === "https:")`, the same condition as `src/pages/ingredients/index.astro:50`; `tests/http/search.test.ts` 8/8.

## Triage (2026-11-15)

| Decision | Findings |
|----------|----------|
| Fixed | F1, F3, F4, F6, F7 |
| Fixed via Fix B (note in code) | F5 |
| Deferred via Fix B | F2 → `follow-ups/review-fixes.md` (test-plan rollout Phase 4) |

After the fixes: `npm test` 146/146, `npm run test:http` 21/21 (the five cookie steps are now one test, F3), harness 0 accounts and dev data unchanged in every run; lint of the changed files clean.
