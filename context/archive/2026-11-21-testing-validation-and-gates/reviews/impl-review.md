<!-- IMPL-REVIEW-REPORT -->

# Implementation Review: Faza 4 rolloutu testów — walidacja i bramki

- **Plan**: context/changes/testing-validation-and-gates/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4, 5, 6
- **Date**: 2026-11-24
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension           | Verdict |
| ------------------- | ------- |
| Plan Adherence      | WARNING |
| Scope Discipline    | WARNING |
| Safety & Quality    | WARNING |
| Architecture        | PASS    |
| Pattern Consistency | PASS    |
| Success Criteria    | WARNING |

Evidence for success criteria (2026-11-24): locally `npm run test:unit` (125), `npm test` (242 + 14 migrations), `npx supabase test db` (6 files, 80), `npm run lint`, `lint:db-access`, `lint:ui`, `prettier --check` (test-plan, CLAUDE.md, README) and `npm run test:hooks` (26) all green. `test:http` and smoke ran green on CI run 45447163081 (merge commit 07ffb9f on `main`, job `integration`); deploy started after `checks` and `integration` (5.6). Ruleset 27920190 on `main` confirmed via `gh api`. Every "What We're NOT Doing" item respected (no zod, no generated column, `config.toml` still at 30, no husky, no NFC/zero-width stripping, no 23514 message).

## Findings

### F1 — CLAUDE.md still says lint:db-access is not in CI; stale command descriptions

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence (also Success Criteria: manual 6.6 "opis bramek spójny z workflow" is checked)
- **Location**: CLAUDE.md:33 (also CLAUDE.md:27, :28, :30, :37; README.md test:http line)
- **Detail**: `:33` ends with "Not in CI yet." while `.github/workflows/ci.yml` runs `npm run lint:db-access` in job `checks`, and CLAUDE.md's own CI line and test-plan §5 say so. Stale too: `:27` test:unit "pure search, view and return-URL rules" (no name and sign-in field rules; README was updated), `:28` npm test and `:30` / README test:http list no names/duplicates/validation tests. `:37` "at the end of a turn that changed TypeScript" — the Stop hook actually runs whenever the working tree has uncommitted or untracked `.ts`/`.tsx`/`package*.json` against HEAD.
- **Fix**: Drop "Not in CI yet" (→ "In CI: job `checks`"), add the new test areas to the test:unit / npm test / test:http lines in CLAUDE.md and README, and reword the Stop trigger to "while the working tree has uncommitted TypeScript changes".
- **Decision**: FIXED — CLAUDE.md :27, :28, :30, :33 (In CI: job `checks`), :37 (Stop trigger); README test:http and hooks sentence.

### F2 — Database errors in substitutes.ts are dropped without a log (new CHECKs make it matter)

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/substitutes.ts:127 (new), :85, :91, :134, :142, :152, :160, :178
- **Detail**: Phase 3 added `if (category.error) return fail();`, and every other DB-error branch also returns a bare `fail()` (GENERIC_ERROR) with the PostgREST error discarded. With the Phase 4 CHECK constraints, a 23514 (e.g. a name where JS `toLocaleLowerCase("pl")` and Postgres `lower()` disagree, see F5) ends as "Nie udało się wykonać operacji na bazie danych." with nothing in the Worker logs — the drift the invariants exist to catch is invisible. CLAUDE.md hard rule: "no dropped error causes … if the fix needs a catch, it logs or reports the error with its cause".
- **Fix A ⭐ Recommended**: In substitutes.ts add a `dbFail(op, error)` helper that does `console.error(new Error(\`Supabase ${op} failed (${error.code})\`, { cause: error }))`and returns`fail()`; use it at the DB-error branches (not at the `!data` / user-error branches). No user data in the message.
  - Strength: Closes the exact blind spot this change created; one helper, mechanical call-site edits; same `Error` + `cause` style as the new `console.warn` in `src/pages/api/auth/signin.ts`.
  - Tradeoff: Touches pre-existing branches outside the plan's scope; `no-console` is a lint warning (needs an eslint-disable line, as in the auth endpoints, or a small logger).
  - Confidence: MED — pattern exists in the auth endpoints; services have not logged before.
  - Blind spot: Other services (`src/lib/services/*`) use the same bare pattern; not reviewed here.
- **Fix B**: Leave the code; queue it for `/10x-observability-audit` (all services and endpoints together).
  - Strength: One consistent decision for the whole codebase instead of one file.
  - Tradeoff: The 23514 blind spot stays in production until that audit's change lands.
  - Confidence: HIGH — the audit skill targets exactly this class.
  - Blind spot: No date for the audit.
- **Decision**: Fix B — no code change; queued for `/10x-observability-audit` in `follow-ups/review-fixes.md`.

### F3 — Stop hook runs npm in any root listed in the temp registry without checking the repository

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: .claude/hooks/end-of-turn-unit.mjs:37-38
- **Detail**: Roots come from `os.tmpdir()/claude-hooks/<session>.roots` and are only checked with `fs.existsSync`, then `npm run test:unit` runs there (`shell: true`; constant command, so no payload data reaches the shell). The per-edit hook validates the repository before registering, the Stop hook does not re-check. On a shared Linux host `/tmp/claude-hooks` could be pre-created by another user, who could then point the hook at their own `package.json`. Low likelihood here (Windows, per-user temp; CI never runs the real hook).
- **Fix**: In the Stop hook keep only roots whose `commonDir(root)` equals `commonDir(sessionCwd)` (as the per-edit hook does) and add a proof case: a registered root of another repository is not swept.
- **Decision**: FIXED — `end-of-turn-unit.mjs` keeps only roots of the session's repository; new proof case „does not run npm in a registered root of another repository” (red with the filter removed, 27/27 green).

### F4 — Hook proof test: junction cleanup can fall through to rmSync; writes through the junction

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/hooks/agent-hooks.test.ts:178 (afterAll), header comment :1-6
- **Detail**: `if (fs.existsSync(link) && fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link);` silently skips a link that is not reported as a symlink; the following `fs.rmSync(tmp, { recursive: true })` would then recurse into the real `node_modules`. Node reports junctions as symlinks today (measured before writing the test), so unlikely, but the damage would be large. A killed run leaves `%TEMP%/agent-hooks-*` with live junctions. Also, the fixture's Vitest bundles its config into `node_modules/.vite-temp` through the junction, i.e. the real repo's `node_modules` — harmless, but the header says "never in the developer's tree".
- **Fix**: Throw when the link exists and is not a symlink (before `rmSync`); in `beforeAll` sweep stale `agent-hooks-*` dirs (unlink junctions first); reword the header to "never in the developer's tracked files (Vitest's config cache lands in node_modules/.vite-temp)".
- **Decision**: FIXED — `removeTree` throws when a junction home is not a link; `beforeAll` sweeps leftover `agent-hooks-*`; header names the `.vite-temp` write.

### F5 — JS vs Postgres lower-casing divergence is accepted in the plan but not recorded in test-plan §7

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/foundation/test-plan.md §7; supabase/migrations/20261123120000_name_invariants.sql:36-37
- **Detail**: `ingredients_name_key_matches_name` checks `name_key = lower(name)` while the app computes `toLocaleLowerCase("pl")`. For rare characters (Turkish `İ`, Greek final sigma) they differ, the save fails with 23514 and a generic error. The plan accepts this ("What We're NOT Doing"), and Migration Notes require a violation count before `db push`, but §7 — the place future contributors read — has no entry, and no test pins the behaviour.
- **Fix**: Add a §7 entry ("Rozjazd `toLocaleLowerCase("pl")` i Postgres `lower()` dla znaków spoza polskiego…", Re-evaluate if nazwy spoza polskiego alfabetu / import; Source: §3 Phase 4, plan „What We're NOT Doing”).
- **Decision**: FIXED — new §7 entry in `context/foundation/test-plan.md`.

### F6 — Pre-existing silent failures in endpoints next to the new pattern

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/ingredients.ts:65, ingredients/delete.ts:40, ingredients/rename.ts:40, substitutes/best.ts:27, substitutes/delete.ts:37, substitutes/update.ts:65; src/pages/api/auth/signin.ts and signup.ts (`if (error) return context.redirect(...)`)
- **Detail**: The auth endpoints now log a failed `formData()` with its cause; the six data endpoints still have an empty `catch {}` around `formData()`. In the rewritten auth endpoints a GoTrue outage (no status / 5xx) is redirected like a wrong password, with no log. Both are pre-existing, outside this plan, but conflict with CLAUDE.md "Never hide the evidence".
- **Fix**: Queue for `/10x-observability-audit` (critical flows: auth, add/edit/delete) rather than patching here.
- **Decision**: FIXED (queued) — follow-up for `/10x-observability-audit` in `follow-ups/review-fixes.md`, together with F2.

### F7 — Phase 6 adaptations and hook extras are not recorded in plan.md

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/testing-validation-and-gates/plan.md (Faza 6)
- **Detail**: Beyond the contract, benign and tested: separate Vitest project `hooks` + `test:hooks` step in CI `checks`; direct `node …/vitest.mjs` instead of `npx --no-install`; the Stop hook skips when no unit-relevant file differs from HEAD, sweeps sibling worktrees via a session registry and exits early on `stop_hook_active` / `loop_count`; the per-edit hook also reads `tool_input.notebook_path`. Documented only in commit 156b738 and test-plan §4/§5.
- **Fix**: Append a short "Addendum (implementation)" under Faza 6 in plan.md listing these, so the plan stays the source of truth for the archive.
- **Decision**: FIXED — „Addendum (implementation, 2026-11-24)” under Faza 6 in plan.md.
