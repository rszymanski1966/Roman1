<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: First Substitute Lookup (S-01)

- **Plan**: context/changes/first-substitute-lookup/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-09
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS (1 observation) |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | WARNING |

## Evidence

- Plan drift: all 11 planned files MATCH (migration, types, service, README, endpoint, new/index pages, middleware, dashboard, smoke, pgTAP). Guardrails respected: no new npm deps, no zod, no React island / JSON API, no `is_best`, no UPDATE/DELETE policies, hand-written types.
- RLS: all 4 tables have RLS; per-operation `to authenticated` policies; INSERT on `ingredient_categories`/`substitutes` requires parent ownership; no anon policies, no `security definer`. CSRF covered by Astro 7 default `checkOrigin: true`. No `set:html`; no open redirects.
- Automated (re-run 2026-10-09): `npx astro sync && npm run lint` PASS (after restoring LF, see F4); `npm run build` PASS; `npx supabase test db` PASS (14/14); `BASE_URL=http://localhost:4321 npm run smoke` PASS (16/16). One smoke run crashed with a Node exception while `astro sync`/`build` were running alongside the dev server; the immediate rerun passed.
- Not re-run: `npx supabase db reset` (phase 1), because it would wipe local data from the manual testing. The migration is proven applied by the passing pgTAP run on the same DB.
- Manual: 1.3–1.4, 2.2–2.4, 3.2–3.4, 4.4 checked by the user; not verifiable from the diff.
- Earlier reviews: phase 2 F2 (redirect 404) is moot; phase 2 F3 and F4 still apply and are consolidated here as F3 and F2.

## Findings

### F1 — Smoke isolation step never exercises the foreign-id lookup path

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:129-133
- **Detail**: Account B has no ingredients, so `/ingredients?ingredient=<A>&category=<A>` renders the "Nie masz jeszcze żadnych składników" branch (`index.astro:67-74`), which never queries or renders substitutes. The marker check would pass even if RLS on `substitutes`/`ingredient_categories` leaked. It only proves ingredient isolation at the HTTP level; pgTAP covers the rest at SQL level.
- **Fix**: Have B add its own ingredient first, then open A's URL and assert "Brak zamienników" plus absence of A's marker.
- **Decision**: FIXED — B dodaje własny składnik; krok izolacji oczekuje „Brak zamienników” i braku markera A (smoke 17/17)

### F2 — Non-form POST to /api/ingredients returns 500

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/ingredients.ts:36
- **Detail**: `await context.request.formData()` is not wrapped. A JSON, empty or Content-Type-less body throws, and Astro answers with an unhandled 500 instead of a `?error=` redirect. Only reachable after the null-client and auth guards (authenticated, malformed requests). The same pattern exists in `src/pages/api/auth/signin.ts:5`. This is phase 2 review F4, still open.
- **Fix**: Wrap in try/catch and redirect with `errorRedirect("Nieprawidłowe dane formularza.")`.
- **Decision**: FIXED — try/catch wokół formData(); zalogowany POST JSON → 302 ?error=Nieprawidłowe dane formularza. (endpointy auth bez zmian)

### F3 — Validation error clears the whole add form

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/ingredients.ts:22-24, src/pages/ingredients/new.astro:9-10
- **Detail**: `errorRedirect` carries only `?error=`. Substitute, ratio and notes are lost on every validation error; the ingredient name survives only via an id prefill. This is phase 2 review F3, still open.
- **Fix A ⭐ Recommended**: Echo the submitted text fields back as query params on error and prefill them in `new.astro`.
  - Strength: Small, follows the existing redirect + `?error=` convention.
  - Tradeoff: Notes (≤ 500 chars) end up in the URL and browser history.
  - Confidence: HIGH — same mechanism as the existing `?ingredient=`/`?category=` prefill.
  - Blind spot: URL length is fine for these limits, but not tested.
- **Fix B**: Client-side `required`/`maxlength` attributes so most errors never reach the server.
  - Strength: No URL changes; instant feedback.
  - Tradeoff: Server errors (DB failure) still clear the form.
  - Confidence: MEDIUM — covers the common cases only.
  - Blind spot: Code-point vs UTF-16 length mismatch between `maxlength` and the server check.
- **Decision**: FIXED (Fix A) — endpoint odsyła ingredient_name/category/substitute/ratio/notes (przycięte do limitów); new.astro wypełnia pola; escaping sprawdzony

### F4 — Restoring files with git checkout leaves CRLF and breaks lint

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: repo root (no .gitattributes; core.autocrlf=true)
- **Detail**: The phase 4 break-check restored `src/pages/ingredients/index.astro` via `git checkout --`. With `core.autocrlf=true` the file came back with CRLF, and prettier reported 152 `Delete ␍` errors. The committed blob is LF; only the working copy was affected and has been restored to LF. Any Windows checkout of this repo has the same trap.
- **Fix**: Add `.gitattributes` with `* text=auto eol=lf` so checkouts always produce LF.
- **Decision**: FIXED — dodany .gitattributes (`* text=auto eol=lf`); indeks miał już wyłącznie LF

### F5 — Unplanned eslint ignore for .claude/

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: eslint.config.js (commit 9e69587)
- **Detail**: Phase 1 added `globalIgnores([".claude/"])`, which is not in the plan. It is harmless tooling, likely needed for lint to pass with the course skills present.
- **Fix**: Add a one-line addendum to Phase 1 in plan.md.
- **Decision**: SKIPPED

### F6 — Unbounded ingredients query, also used for a single-name prefill

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/substitutes.ts:51, src/pages/ingredients/new.astro:29-31
- **Detail**: `listIngredients` has no limit; hosted PostgREST caps at 1000 rows, so the dropdown would be silently truncated past that. `new.astro` loads the whole list just to find one name for the prefill. Fine for MVP volumes (plan: hundreds of rows).
- **Fix**: Accept for MVP; later look up a single ingredient by id in `new.astro`.
- **Decision**: ACCEPTED — wolumeny MVP (setki wierszy); pobieranie pojedynczego składnika po id później

### F7 — Foreign keys without indexes

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261004120000_substitute_database.sql:56, :58, :88
- **Detail**: `ingredient_categories.user_id`, `ingredient_categories.category_id` and `substitutes.user_id` have no index. Reads are served by existing unique indexes; only cascade deletes from `auth.users` and Supabase's "unindexed foreign keys" advisor are affected.
- **Fix**: Accept now, or add the indexes in a later migration (e.g. with S-04/S-05).
- **Decision**: ACCEPTED — indeksy FK dojdą w późniejszej migracji (np. z S-04/S-05)
