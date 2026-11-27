---
type: observability-audit
date: 2026-11-26 17:49
mode: audit
commit: 03f66b8
branch: main
dirty_tree: true
areas: [auth, writes, lookup]
area_source: user
runtime_proof: not-run
error_tracker: none (Cloudflare Workers Logs only)
previous_report: null
findings: { critical: 4, high: 8, medium: 9, low: 5 }
---

# Observability audit — auth, writes, lookup (2026-11-26)

## 1. TL;DR

- **No failure in the three flows reaches Workers Logs with its cause.** All of `src/` has two `console.*` calls, both for a client-caused condition (non-form body on sign-in/sign-up). Outages, constraint violations, RLS denials and dead sessions log nothing.
- **The service layer drops every PostgREST error** in one place (`fail()`, `src/lib/services/substitutes.ts:35`, 23 bare calls), and postgrest-js never throws, even on network failure (it returns `status: 0`). So no DB failure ever becomes an uncaught exception Astro would log.
- **Auth results are read from `data` only.** `getUser()` in the middleware ignores `error`, so a GoTrue outage looks exactly like anonymous traffic: every signed-in user is bounced to `/auth/signin`, and sign-in then shows raw English GoTrue text as if the password were wrong.
- **The only failure contract is "302 with `?error=`" or "200 with an alert".** `src/` has 0 explicit 5xx responses; 39 of 58 API redirects carry an error. The request log can't tell a failed write or a failed page load from a successful one.
- **Missing Supabase secrets in a deploy look like being signed out** (optional env + null client), with no log line.
- Most important consequence: **a Supabase outage (DB or Auth) is invisible in Workers Logs.** Users see "sign in again", "Nie udało się wykonać operacji na bazie danych." or an empty list; the responder sees normal-looking 302s and 200s.

## 2. Capture model

- **Runtime:** Astro 7.3.2 SSR (`output: "server"`, `astro.config.mjs:13`) on Cloudflare Workers via `@astrojs/cloudflare` 14.3.1 (`wrangler.jsonc` main `@astrojs/cloudflare/entrypoints/server`, `nodejs_compat`). Supabase (Auth + PostgREST, RLS) via `@supabase/ssr` 0.12.7 / supabase-js 2.116.0. Two React islands (`SignInForm`, `SignUpForm`), native form posts.
- **Error tracker:** none. No Sentry/OTel/Datadog/etc. in `src/`, `package.json`, `astro.config.mjs`, `wrangler.jsonc`.
- **Logging:** `console.*` only, collected by Workers Logs (`wrangler.jsonc` `observability.enabled: true, logs.enabled: true`). In `src/` there are exactly two calls: `src/pages/api/auth/signin.ts:16`, `signup.ts:16` (`console.warn(new Error(…, { cause }))`, Content-Type only).
- **Capture boundary:** Astro's request handler catches uncaught throws and logs `err.stack` as a single string through its console logger (`node_modules/astro/dist/core/routing/handler.js:101-108`, `core/logger/impls/console.js:11-21`), then renders a 500 — with no `src/pages/500.astro`, an empty body (`core/errors/default-handler.js:105`). The error object is not passed, so `cause` and own properties (e.g. a PostgREST `code`) are lost and the line carries no method/path. The adapter adds no try/catch (`@astrojs/cloudflare/dist/utils/handler.js:36-88`). Errors after the first streamed byte are not logged by Astro (`runtime/server/render/astro/render.js:62-73`); latent today, since no component awaits.
- **What runs outside the boundary in practice:** almost everything, because nothing throws. postgrest-js turns fetch rejections into `{ error: { code: "", details: <stack> }, status: 0 }` (`node_modules/@supabase/postgrest-js/dist/index.mjs:416-456`); auth-js turns them into `AuthRetryableFetchError(msg, 0)` and 5xx/52x into `AuthRetryableFetchError(…, status)` (`node_modules/@supabase/auth-js/dist/module/lib/fetch.js:22-43, 110-123`).
- **Middleware:** `src/middleware.ts:10-13` calls `getUser()` on every request and keeps only `data.user`; `PROTECTED_ROUTES` (`/dashboard`, `/ingredients`) redirect to `/auth/signin` when `user` is null (`:18-21`).
- **Null client:** `src/lib/supabase.ts:6-8` returns `null` when `SUPABASE_URL`/`SUPABASE_KEY` are missing; both are `optional: true` (`astro.config.mjs:23-24`).
- **Background work:** none (no `waitUntil`, queues, cron, floating promises).
- **Client side:** no global error handler, no error boundary, no client `fetch`; forms work without JS. Client errors are invisible by construction, low stakes.
- **Scrubbing / sampling / release tagging:** none in code.

**Assumptions (outside the repo, not findings):**
- Workers Logs collects console output and invocation records in production — confirmed by the user ("Workers Logs only").
- No alerting exists on Workers Logs or error rate — confirmed by the user. Every finding below is therefore "only visible if someone searches"; logging is the precondition for any future alert.
- Workers Logs serializes an `Error` argument with name, message and stack; nested `cause` is probably not expanded (unconfirmed). Log `code`/`status` as explicit fields, not only inside `cause`.
- A handler that returns a 500 Response is recorded as outcome "ok" with status 500, not "exception" (inferred from the code path, unconfirmed).
- Hosted Supabase auth rate limits and `max_rows` are set in the Supabase dashboard; `supabase/config.toml` is local only (unconfirmed).
- No post-deploy smoke or uptime check runs against production (`ci.yml` `deploy` job ends at `wrangler-action`) — observation.

## 3. What reaches Workers Logs (static-only — not runtime-proven)

| Failure shape | Response | Workers Logs | Verdict |
|---|---|---|---|
| Throw in a page/endpoint/middleware | 500, empty body | `[ERROR]` line with stack string, no cause/props/path | poor |
| PostgREST error (any code) in a write endpoint | 302 `?error=<generic>` | nothing | missed |
| PostgREST error / network failure on a page load | 200 with alert | nothing | missed |
| Supabase DB unreachable (status 0) | 302 or 200 (as above), GETs silently retried up to ~7 s | nothing | missed |
| GoTrue down during `getUser()` (middleware) | 302 → `/auth/signin` | nothing | missed |
| GoTrue down / 5xx / 429 on sign-in or sign-up | 302 `?error=<raw GoTrue text>` | nothing (message only visible in the next GET URL) | missed |
| `signOut()` fails | 302 → `/` | nothing | missed |
| Secrets missing in deploy | 302 → sign-in, banner on public pages | nothing | missed |
| 0 rows updated/deleted (RLS, policy regression, wrong id) | 302 `?error=Nie znaleziono…` | nothing | missed |
| Non-form body on sign-in/sign-up | 302 `?error=` | `warn` with cause + Content-Type | good |
| Non-form body on the 6 data endpoints | 302 `?error=` | nothing | missed |

## 4. Systemic root causes

1. **The service layer returns errors as user text and keeps no cause.** `fail()` (`src/lib/services/substitutes.ts:35`) builds `{ error: GENERIC_ERROR }` and every DB branch calls it without the PostgREST error (23 bare `fail()` calls). The convention "Errors are returned, not thrown; `error` is a short, user-safe message" (`:22-23`) was a reasonable UX decision, but nothing keeps the original error anywhere. Combined with postgrest-js returning `status: 0` instead of throwing, no DB failure — outage, 23514, 42501, PGRST301 — can reach the logs. Explains W1–W5, W8, L1, L3, L5 (and F2).
2. **Auth calls are read from `data` only; `error` is dropped or flattened.** `src/middleware.ts:10-13` (`getUser`), `src/pages/api/auth/signin.ts:30-32`, `signup.ts:30-32` (`error.message` straight into `?error=`), `signout.ts:7` (result discarded). auth-js 2.116 offers a clean taxonomy (`AuthRetryableFetchError` with status 0/5xx, `AuthApiError` with `code`, `AuthSessionMissingError`), but the app can't tell "GoTrue down" from "anonymous" from "wrong password". Explains A1–A5, L2 (and F6 part 2).
3. **"Redirect with `?error=`" / "200 with an alert" is the only failure contract, and no rule asks for a log before it.** 58 `redirect(` calls in `src/pages/api`, 39 with `error` (plus the `back()` helper in `rename.ts`, `update.ts`); 16 `loadError`/`substitutesError` assignments in `src/pages/**/*.astro` render 200; 0 explicit 5xx anywhere in `src/`. The CLAUDE.md API convention made this uniform. The six empty `catch {}` around `formData()` are the same mechanism. Explains P2, W6, L1, L4 (and F6 part 1).
4. **Optional secrets + null client turn a broken deploy into normal-looking traffic.** `astro.config.mjs:23-24` (`optional: true`), `src/lib/supabase.ts:6-8` (`return null`), `src/middleware.ts:14-16` (`user = null`). The protected pages' own "not configured" branch is unreachable because the middleware redirects first. Explains P1.
5. **The framework's own error log is a flattened string.** `node_modules/astro/dist/core/routing/handler.js:102` logs `err.stack` only; the app has no wrapping middleware or custom fetch handler to add the error object, `cause` and path. Low impact today (nothing throws), but it caps the value of any fix that starts throwing. Explains P3, P4.

## 5. Findings by area

### Auth (sign-in, sign-up, sign-out, session resolution)

| # | Location | Category | Severity | What happens in production | Fix direction |
|---|---|---|---|---|---|
| A1 | `src/middleware.ts:10-13`, redirect `:18-21` | swallowed | critical | GoTrue unreachable (status 0), 5xx/52x, or 429 on token refresh → `user = null` → every signed-in user opening `/dashboard` or `/ingredients*` is sent to `/auth/signin` with no message; a submitted write form is lost. Retryable errors keep the cookies, so users "come back" when GoTrue recovers, which hides the outage further. Responder: a burst of 302s identical to anonymous traffic, no log. *Spot-checked.* | Read `error`; when it is not `AuthSessionMissingError` (returned on every anonymous request — skip it, it is noise) `console.error` name/status/code + pathname; consider 503 instead of a redirect for retryable errors. |
| A2 | `src/pages/api/auth/signin.ts:30-32`, `signup.ts:30-32` | flattened-response | critical | Every GoTrue error, outage included, becomes `?error=${error.message}`: the user sees "HTTP 503", "TypeError: fetch failed" or `{}` in English in the Polish UI, reading like their own mistake. Sign-up also hides SMTP failures ("Error sending confirmation email", 500). Responder: nothing; the message appears only in the next GET's URL, without status or code, mixed with wrong-password traffic. Network failures carry **`status: 0`, not a missing status** (`auth-js/dist/module/lib/fetch.js:121`). Confirms and extends F6. *Spot-checked.* | Log name/status/code/route when `!error.status \|\| error.status >= 500` (and `AuthUnknownError`, no status); never log e-mail or password; don't log `invalid_credentials`/validation codes; map outages to a Polish "Usługa logowania jest chwilowo niedostępna". |
| A3 | `signin.ts:31`, `signup.ts:32` with `supabase/config.toml` auth rate limits | flattened-response | high | A 429 (`over_request_rate_limit`, `over_email_send_rate_limit`) shows the same red box as a wrong password. If hosted GoTrue counts the Worker's egress IP, all users may share one bucket (to verify in Supabase). Responder: only 302s. | Log at warn with `code`; show a Polish "Zbyt wiele prób, spróbuj za kilka minut". |
| A4 | `src/pages/api/auth/signout.ts:7` | missing-throw | high | Result of `signOut()` ignored. (a) Session load fails retryably → auth-js returns the error **without removing the session** (`GoTrueClient.js:3426-3428`): cookies stay, user lands on `/` thinking they signed out. (b) `/logout` answers 5xx → local cookies removed but the server-side revoke failed (`:3432-3442`): the refresh token stays valid on other devices. No trace in either case. *Spot-checked.* | Check `error`, log name/status/code, redirect with `?error=`. |
| A5 | `src/middleware.ts:10-13` with `supabase/config.toml:164-167` | identity-lost | medium | A non-retryable refresh failure (`refresh_token_already_used`, `session_expired`, `refresh_token_not_found`) really signs the user out (cookies cleared). Token rotation with a 10 s reuse window plus parallel requests in different isolates is the classic cause of "random logouts" — and it is indistinguishable from A1 or from never having signed in. | Same log as A1, with `error.code`; that separates "session dead" from "GoTrue down". |
| A6 | `src/pages/auth/confirm-email.astro:4`, `signup.ts:35` | flattened-response | medium | "Auto-confirmed" comes from `import.meta.env.DEV`, not from the `signUp` response. With confirmations on and an existing e-mail, GoTrue returns an obfuscated user without an error: the user is told "check your inbox" and no mail comes. In production with confirmations off, a signed-in user is told to check e-mail. No trace. *Spot-checked (line 4).* | Branch on `data.session` / `data.user.identities.length`; log only the outcome kind (no e-mail). |
| A7 | `@supabase/ssr` chunked-cookie decode via `src/lib/supabase.ts:12` | missing-context | low | A corrupt chunked auth cookie produces a library `console.warn` and the user is signed out. The only lost-session case that leaves a line, but without route or request context. | Covered once A1's log includes the pathname. |

Note: the only two logs in the flow (`signin.ts:16`, `signup.ts:16`) record a client-caused condition at `warn`, with the error object and Content-Type only. They are the right pattern; the priorities are inverted (real outages log nothing).

### Writes (add, edit, rename, delete, mark "best")

| # | Location | Category | Severity | What happens in production | Fix direction |
|---|---|---|---|---|---|
| W1 | `src/lib/services/substitutes.ts:35` (`fail()`); write branches `:127,134,142,152,160,178,286,383,429,449,469` | identity-lost | critical | Outage (status 0, code ""), 23514 check violation (e.g. the `toLocaleLowerCase("pl")` vs SQL `lower()` mismatch against `ingredients_name_key_matches_name`, `20261123120000_name_invariants.sql`, on add `:131` and rename `:420`), 42501 RLS/grant denial, PGRST301 JWT error — all become "Nie udało się wykonać operacji na bazie danych." The same input fails the same way every time. Only 23505 and P0002 are mapped. A network timeout after Postgres committed returns status 0; a resubmit then hits 23505 and reads as the user's mistake. Responder: one 302, nothing else. Confirms and extends F2. *Spot-checked.* | One `dbFail(op, error)` helper: `console.error(new Error(\`${op} failed: ${error.code \|\| "network"}\`, { cause: error }))` with `code`, `status`, `op`, entity id as explicit fields, then `fail()`. Never names or notes. |
| W2 | `addSubstitute`, `substitutes.ts:131-179` | missing-context | high | Four separate HTTP writes, no transaction. If the pair upsert/select (`:152,160`) or the substitute insert (`:178`) fails, the ingredient (and maybe the pair) is already committed: the user gets the generic error and later sees a new ingredient with no substitutes. The "impossible" nulls after a successful upsert (`:143`, `:161`) return a bare `fail()` without a step name. *Spot-checked.* | Log the step name and code at each branch (W1 helper with `op: "add.pair_upsert"` etc.); longer term, one RPC for the add. |
| W3 | `substitutes.ts:187-195`, `src/pages/api/ingredients.ts:121-126` | swallowed | high | When marking "best" fails after the insert, `best.error` and its code (incl. 23505 concurrency, P0002) are discarded and the function returns `ok()` with a fixed `bestError` text. The partial success is invisible to the responder. *Spot-checked.* | Log the code with `op: "add.mark_best"` and the substitute id. |
| W4 | `updateSubstitute :385`, `renameIngredient :431`, `deleteSubstitute :450`, `deleteIngredient :470` | missing-throw | high | 0 rows changed is correctly never reported as success, but a wrong id, a row already deleted, another account's row, a dropped/broken UPDATE or DELETE policy and a request running as anon all show "Nie znaleziono …". After a bad migration every edit and delete would say "not found" with no spike anywhere. | `console.warn` with `op`, entity id, `not_found` (warn, not error). The form just showed the row, so a burst of these is a signal. |
| W5 | `setBestSubstitute`, `substitutes.ts:281-289` | identity-lost | medium | P0002 and 23505 are mapped; everything else (42501 — anon has no execute, `20261011201658…sql:79` — and any other code) is flattened at `:286`, and an empty RPC result at `:289` is a bare `fail()`. No log. | Log unmapped codes and the empty-result case; log 23505 at info at most. |
| W6 | empty `catch {}` around `formData()`: `src/pages/api/ingredients.ts:65`, `ingredients/delete.ts:40`, `ingredients/rename.ts:40`, `substitutes/best.ts:27`, `substitutes/delete.ts:37`, `substitutes/update.ts:65`; `parseListView` null: `ingredients/delete.ts:47`, `rename.ts:47`, `best.ts:34`, `substitutes/delete.ts:44`, `update.ts:72` | swallowed | medium | Malformed bodies and broken hidden fields give "Nieprawidłowe dane formularza." with no log. If the page markup breaks (a hidden `ingredient` field dropped), every user hits this and nobody sees it. Confirms F6 part 1. | The sign-in pattern (`console.warn(new Error(…, { cause }))` + Content-Type); for `parseListView`, a warn naming the field, no values. |
| W7 | `getSubstituteForEdit`, `substitutes.ts:338-346`; `edit-substitute.astro:33-34`, `delete-substitute.astro:29-30` | missing-context | medium | A missing pair/ingredient/category ("a broken row" per the comment) returns a bare `fail()`: the user sees the generic alert, a data-integrity problem stays invisible. | Log `op: "get_substitute_for_edit"`, the substitute id and which relation is missing. |
| W8 | `src/pages/api/ingredients/delete.ts:74-79` (`hasSearchHits` ignored on purpose), `src/pages/ingredients/new.astro:52-53` (`listIngredients` failure drops suggestions and prefill) | swallowed | low | Secondary reads fail silently; a prefill link opens with an empty name. | `console.warn` with the op name. |

Noise guard (not a finding): duplicates (23505 on add/edit/rename/best) and `invalid_category` are clear to the user (`substitutes.ts:177,382,428`, `ingredients.ts:112-113`, `update.ts:99`). When W1's helper lands, skip them or log at info, or expected user errors will drown the real ones.

### Lookup (list and search, entry loading for edit/delete)

| # | Location | Category | Severity | What happens in production | Fix direction |
|---|---|---|---|---|---|
| L1 | Read branches `substitutes.ts:85,91,209,238,338,403`; pages `ingredients/index.astro:85-88,111,120-121`, `edit-ingredient.astro:30-31`, `edit-substitute.astro:33-34`, `delete-ingredient.astro:38-39,46-47`, `delete-substitute.astro:29-30`, `new.astro:46-47` | flattened-response | critical | Any DB or network failure renders a 200 page with the generic alert (visibly distinct from an empty result for the user). GET requests are silently retried up to 3 times with 1/2/4 s backoff (`postgrest-js/dist/index.mjs:196-226`), so an outage can add ~7 s latency first. Responder: `GET /ingredients 200`, nothing else. *Spot-checked (no status set in `index.astro`).* | W1's helper covers the log; set `Astro.response.status = 503` when `loadError`/`substitutesError` is set. |
| L2 | `src/lib/services/substitutes.ts:242-244` (`if (!category \|\| rows.length === 0) continue`); `delete-ingredient.astro:45-49`, `IngredientDeleteConfirm.astro:26` | swallowed | high | If categories become RLS-hidden (a grant/policy regression; `categories_select_authenticated` is `to authenticated` only), every group is skipped: every ingredient shows "Brak zamienników", and the delete confirmation counts "0 zamienników" while the cascade still deletes them all. `getSubstituteForEdit` treats the same broken row as `fail()`, so the two functions disagree. An empty categories result is `ok([])`: selects show only "Wszystkie kategorie", nothing logged. *Spot-checked.* | A pair with substitutes but no category → `fail()` + log `{ op: "listIngredientSubstitutes", ingredientId }`; log an empty categories list (it is a fixed seeded dictionary). |
| L3 | `src/lib/supabase.ts:12` (client built from the request `Cookie` header) in pages and endpoints, after `src/middleware.ts:10-13` already refreshed | identity-lost | medium (plausible) | The middleware's refresh writes new cookies only to the response; the page/endpoint client re-refreshes from the old cookies, relying on the 10 s reuse window. If that second refresh fails, supabase-js sends the anon key and RLS returns zero rows: the user sees the first-run empty state "Nie masz jeszcze żadnych składników" (`index.astro`), and on add "Wybrana kategoria jest nieprawidłowa." (anon can't read `categories`). No log. Conditional on a refresh failure inside one request; not runtime-proven. | Create the client once in the middleware and pass it via `locals`; on a protected route with no session in the page client, log `auth_session_lost` instead of rendering empty data. |
| L4 | `src/lib/search-view.ts:106-115`, `ingredients/index.astro:107-109`, `LookupForms.astro:71,114` | flattened-response | medium | An unknown, deleted, foreign or malformed `ingredient`/`category` gives the same "Brak zamienników…" or "Nie znaleziono składnika" as a genuinely empty result, with a 200. An unknown category id shows "Wszystkie kategorie" in the selects, contradicting the message. Never shares a branch with DB errors, but does with real emptiness. | A `not-found` view kind with its own copy and 404; log a reason code, no names. |
| L5 | `substitutes.ts:29` (`GENERIC_ERROR`), `ingredients/index.astro:85-88` | missing-context | medium | Every failure shows the same message, only the first error is shown, and the page carries no operation code or request id, so a user report can't be matched to anything. | Add an `op` to the failure result; show a short reference (e.g. `cf-ray`) in the alert and in the log line. |
| L6 | `listIngredients` `substitutes.ts:90`, `listIngredientIdsWithSubstitutes` `:205-208`; `supabase/config.toml:18` `max_rows = 1000` | coverage-gap | low | No range is requested; beyond the row cap ingredients silently vanish from search ("Nie znaleziono"). Far from current data sizes. | Request a count and log when the result hits the cap. |

### Platform / plumbing

| # | Location | Category | Severity | What happens in production | Fix direction |
|---|---|---|---|---|---|
| P1 | `astro.config.mjs:23-24`, `src/lib/supabase.ts:6-8`, `src/middleware.ts:14-16` | config | high | A deploy with missing or lost secrets: every request is anonymous, protected routes bounce to sign-in, writes redirect to a protected page and then to sign-in (the "not configured" message never renders), sign-in says "Baza danych nie jest skonfigurowana.". Users on public pages see the banner (`Layout.astro:23` via `config-status.ts`); the responder sees only 302s and 200s. | `console.error` once per isolate when the client is null, or make the vars required in production builds (keep `null` for the local template case). |
| P2 | 58 `redirect(` in `src/pages/api` (39 with `error`, plus `back()` in `rename.ts`, `update.ts`); 16 `loadError`/`substitutesError` 200s in `src/pages/**/*.astro`; 0 explicit 5xx in `src/` | flattened-response | high | About 19 of the redirect paths are infrastructure failures (8 "not configured", 11 passing a service or auth error), not validation. Request status in Workers Logs can't separate a failed request from a successful one, so even a future status-based alert would see nothing. *Counts spot-checked.* | Keep the redirect UX, but log before every non-validation error redirect (root cause 3); 503 for failed page loads (L1). |
| P3 | `node_modules/astro/dist/core/routing/handler.js:102`, `core/logger/impls/console.js:11-21`; no `src/pages/500.astro` | identity-lost | medium | A thrown error is logged as a stack string: no `cause`, no error properties, no method/path; the user gets an empty 500 body. Matters as soon as fixes start throwing. *Spot-checked.* | A top-level wrapper in `src/middleware.ts` that catches, logs `{ method, path, err }` with the error object, and rethrows; add `500.astro`. |
| P4 | `node_modules/astro/dist/runtime/server/render/astro/render.js:62-73` | coverage-gap | low | Errors after the first streamed byte truncate a 200 page with no Astro log. Latent: page frontmatter is awaited before streaming and no component awaits. | Keep `await` out of child components, or disable streaming on critical pages. |
| P5 | `src/components/auth/*`, `SubstituteCreateForm.astro:199-236` | coverage-gap | low | Client JS errors (hydration, inline script) are invisible to Workers Logs by construction; forms post natively without JS, so impact is low. | None needed now; revisit if client-side logic grows. |

## 6. Recommended fix order

1. **Log in `fail()`'s callers through one DB helper** (closes W1, W2, W3, W5, W7, L1, L2 log side, L5 partly; F2). One file, `src/lib/services/substitutes.ts`. Constraints: log `op`, `code`, `status`, entity id and the error as `cause`; never ingredient/substitute names, notes or search terms; skip or info-level the expected 23505/`invalid_category`/`not_found` (noise guard). Failing test first: a service test that forces a DB error (e.g. a 23514) and asserts one `console.error` with `code` and no user data.
2. **Read auth `error` in middleware, sign-in, sign-up, sign-out through one `logAuthError(step, error, path)`** (closes A1, A2, A4, A5, A7; F6 part 2). Skip `AuthSessionMissingError` and `invalid_credentials`/validation codes; condition `!status || status >= 500` (status 0 = network); never e-mail or password. Map outages and 429 (A3) to Polish messages.
3. **Log the six empty `formData()` catches and the `parseListView` rejections** with the existing sign-in pattern (closes W6; F6 part 1). Mechanical.
4. **Log a null Supabase client** once per isolate, or require the secrets in production (closes P1).
5. **Give failures a status:** 503 for page load errors (L1), and a top-level middleware wrapper that logs thrown errors with the error object and path, plus `500.astro` (P3). Do this after 1–2, so the new throws/statuses carry a logged cause.
6. **Behavioural fixes that need product decisions:** `addSubstitute` as one RPC (W2), `not-found` view with 404 (L4), confirm-email from `data.session` (A6), single client per request via `locals` (L3), category-missing groups as an error (L2), `not_found` warn (W4).

## 7. Changes since last audit

First run (no previous report). The earlier impl-review follow-ups F2 and F6 (`context/archive/2026-11-21-testing-validation-and-gates/follow-ups/review-fixes.md`) are confirmed: F2 → W1 (extended to reads: L1, and to multi-step/best: W2, W3, W5); F6 empty catches → W6; F6 GoTrue → A2 (corrected: network failures carry `status: 0`, so the condition is `!status || status >= 500`).

## 8. Method and limits

- **Agents:** three area auditors (auth, writes, lookup) and one plumbing auditor, read-only, in parallel, each given the capture model above and the F2/F6 follow-ups.
- **Spot-checked by hand:** `fail()` and `addSubstitute` (`substitutes.ts:20-40, 105-200`); category-embed skip (`:225-250`); postgrest-js network error shape (`index.mjs:410-460`); auth-js status 0 and 5xx mapping (`fetch.js:15-45, 110-125`); `_signOut` both failure branches (`GoTrueClient.js:3419-3450`, which settled a disagreement between two auditors: both branches exist); Astro's catch-and-log (`routing/handler.js:98-110`, `console.js`, `default-handler.js:105`); `signin.ts`, `signup.ts`, `signout.ts`, `confirm-email.astro:4`; counts of 23 bare `fail()`, 58 redirects, 39 with `error`.
- **Corrected:** the lookup auditor cited `supabase.ts` and `middleware.ts` line numbers beyond the files' length; the report uses the real lines (`supabase.ts:12`, `middleware.ts:10-13`).
- **Marked plausible, not confirmed:** L3 (needs a refresh failure inside one request), A3's shared rate-limit bucket (depends on hosted GoTrue's IP handling).
- **Runtime proof:** not run (user chose static-only). Without a tracker, probes would only record response + console output. Not verified: how Workers Logs renders `Error`/`cause`, the invocation outcome of a returned 500, production log retention.
- **Repo-wide sweep (`src/`):** 8 catch sites (6 without binding, all `formData()`), 0 `.catch(`, 1 `?? []` (embedded relation), 2 console calls (both `warn`), 0 `throw`, 3 ignored auth/service `error` results (`middleware.ts:10-12`, `signout.ts:7`, `ingredients/delete.ts:76`), 23 bare `fail()`.
- **Probe harness:** none created.
