# Review fixes — observability-db-error-logging

From `reviews/impl-review.md` (2026-11-27).

## F6 — test headers point to the plan under `context/changes/`

- **When**: in the `/10x-archive` commit of this change.
- **What**: replace `context/changes/observability-db-error-logging/plan.md` with the archive path (`context/archive/<date>-observability-db-error-logging/plan.md`) in:
  - `tests/unit/db-error-logging.test.ts` (header, line 6)
  - `tests/services/db-error-logging.test.ts` (header, line 10)
- **Keep**: the plan's line numbers. The test comments cite them (`:95`, `:105`, `:159`, `:181`…). Do not add or remove lines in `plan.md` before the archive. The F4 addendum was placed on an existing line for that reason.

## F7 — auth endpoints still say "no logger in the app yet"

- **When**: in the fix nr 2 change (`logAuthError`, audit `context/audits/observability/2026-11-26_auth-writes-lookup.md` §6).
- **What**: `src/pages/api/auth/signin.ts:15` and `signup.ts:15` justify a direct `console.warn` with "no logger in the app yet". `src/lib/log.ts` exists now. Route those calls through `src/lib/log.ts` and remove the comment.
