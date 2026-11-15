# Review fixes: testing-search-and-best

Follow-ups queued during the triage of `reviews/impl-review.md`. Each item names its target and the finding it comes from.

## F2 — `lint:db-access` does not see the direct Postgres driver

- **Target**: test-plan rollout Phase 4 "Walidacja i bramki" (`context/foundation/test-plan.md`, the phase that puts the guard into CI).
- **Problem**: this change installed `pg` (a devDependency, used only in `tests/` today). `scripts/db-access.mjs` knows only the `@supabase/supabase-js` and `@supabase/ssr` factories (`FACTORIES`), and `SECRET_PATTERN` does not include `DB_URL`. `import { Client } from "pg"` in `src/` with a `DB_URL` connection string would bypass RLS, and nothing would flag it.
- **Fix**: in `scanSource` (`src/` only), report any import of `pg`, `pg-pool` or `postgres`, and add `DB_URL` to `SECRET_PATTERN`. Add cases to `tests/scripts/db-access.test.ts`.
- **Status**: open (2026-11-15).
