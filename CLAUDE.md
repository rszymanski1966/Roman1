# Rules for AI

## Key conventions

- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`. Tokens and the UI contract: see `## UI`.
- **API routes**: uppercase `GET`/`POST` exports. Auth routes take form posts and answer with redirects, not JSON. Errors go back as `?error=<encodeURIComponent(msg)>` on the originating page (see `@src/pages/api/auth/signin.ts`). zod is not installed yet; add it (`npm i zod`) before validating new input with it.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies. Locally apply them with `npx supabase migration up`. Before `npx supabase db push`, `npm run test:migrations` must pass; a migration that changes data declares that change in `tests/migrations/expectations.ts` (no declaration = the data must stay exactly as it was), and after the push `BASELINE_MIGRATION` there moves to the last pushed version (`context/foundation/test-plan.md` §6.5).
- **React**: no Next.js directives ("use client" etc.). Extract hooks to `src/components/hooks/`.
- **Services/helpers** go in `src/lib/` (or `src/lib/services/` for extracted business logic).
- **Shared types** (entities, DTOs) go in `src/types.ts`.
- **`context/archive/` is immutable**: skills must not write there. If a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

## Auth flow

- `src/lib/supabase.ts` — creates a Supabase SSR client using `@supabase/ssr` with cookie-based sessions. Uses `astro:env/server` for `SUPABASE_URL` and `SUPABASE_KEY` (server-only secrets declared in astro.config.mjs `env.schema`). **Returns `null` when env vars are missing** (they're `optional` in the env schema), so every caller must handle `null` (see middleware and API routes).
- `src/middleware.ts` — runs on every request, resolves the current user, attaches to `context.locals.user`. Redirects unauthenticated users away from routes listed in `PROTECTED_ROUTES`.
- API endpoints: `src/pages/api/auth/{signin,signup,signout}.ts`
- Auth pages: `src/pages/auth/{signin,signup,confirm-email}.astro`
- Protected page example: `src/pages/dashboard.astro`

## Commands

Scripts: @package.json

- `npm run test:unit` — Vitest project `unit` (pure search, view and return-URL rules in `tests/unit/`). No stack, no dev server, no harness.
- `npm test` — Vitest projects `unit` + `services` (sweep pattern, harness, DB access guard, deletes, search and the best mark through the services on the real local Supabase, plus the two-session race test of `set_best_substitute`, which connects to Postgres directly via `DB_URL` from `npx supabase status -o env`), then project `migrations` in a second run (not in parallel: that pushed `npx supabase status` close to its 60 s limit). Needs a running local stack (`npx supabase start`), no dev server.
- `npm run test:migrations` — Vitest project `migrations` only (about 40 s): every migration newer than `BASELINE_MIGRATION` goes through `npx supabase migration up --db-url` onto throwaway databases `mig_test_<runId>_<label>` in the local cluster (stub `auth`, synthetic `tests/migrations/fixture.sql`) and must leave the data invariants as declared in `tests/migrations/expectations.ts`; plus mutation control and the per-file atomicity case. Needs the local stack, no dev server. Never writes to the `postgres` database (only reads the catalog and creates/drops `mig_test_*` there): its global setup sweeps `mig_test_*` databases before and after (each sweep prints how many it dropped; above 0 after the run means a test leaked one), and fails the run if one is left after the sweep or the dev data hash changed.
- `npm run test:http` — Vitest project `http` (account isolation, the delete confirmation path, the search mode cookie and search states over HTTP). Needs the local stack **and** a running `npm run dev` (`BASE_URL` overrides `http://localhost:4321`); without the server it stops with one "run `npm run dev`" message.
- The `services` and `http` runs create throwaway accounts (`vitest-<runId>-<label>@example.test`) in the local dev database. The global setup sweeps them before and after, and fails the run if one is left or the dev data hash changed. Never `supabase db reset` for tests.
- `npm run test:sweep` — deletes leftover throwaway and smoke accounts only (after an interrupted run). Needs the local stack. Leftover `mig_test_*` databases are dropped by the next `npm run test:migrations`.
- `npm run lint:db-access` — static guard: no service-role/secret key names in `src/`, Supabase clients created only in `src/lib/supabase.ts`, no `security definer` in migrations. Not in CI yet.
- `npx supabase test db` — pgTAP tests in `supabase/tests/`, each file in a transaction rolled back at the end.
- `npm run smoke` — end-to-end smoke test (home, auth redirect, signup/signin flow) against a **running** server: `BASE_URL=http://localhost:4321 npm run smoke`. Its accounts are removed by the sweep.
- CI runs none of the tests above yet (only lint, lint:ui, build). How to add a test (unit, integration, concurrency, pgTAP, new endpoint with an id from the client, new migration): `context/foundation/test-plan.md` §6.

On a fresh checkout, run `npx astro sync` before `npm run lint`. It generates the virtual-module types that type-checked ESLint needs.

## References

- Setup, env vars, local Supabase, and deploy steps: @README.md
- CI and deploy pipeline: @.github/workflows/ci.yml

## UI

- **Tokens** live in `src/styles/global.css`: values in `:root` / `.dark`, published to Tailwind through `@theme inline`. The comment above `:root` maps each token to its source palette step.
- **Components** live in `src/components/ui/`. Check there before creating one. Static views use the Astro components (`Input`, `Label`, `NativeSelect`, `Card`, `Alert`, `Badge`); buttons and links use `buttonVariants()`. Add React components with `npx shadcn@latest add [name]`; model new static Astro ones on new-york and build them from tokens.
- **No literals in views**: no colour literals (hex, `rgb()`, `oklch()`, palette classes like `text-orange-600`) and no arbitrary `px`/`rem` values; use tokens by role (`bg-primary`, `text-muted-foreground`).
- **`npm run lint:ui`** (also in CI) scans the files listed in `scripts/ui-literals.mjs`. When you clean a view, add it to that list.
- **Focus**: controls built with `buttonVariants()` add `focusRing` from `@/components/ui/focus` via `cn()` (full-opacity ring, AA 3:1); native radios/checkboxes use `focusOutline`.
- **Dark mode** changes only in `.dark` in `global.css`. No `dark:` variants or off-token colours in views and components.
- **Kitchen sink**: `src/pages/dev/kitchen-sink.astro` (dev only, 404 in production). Update it whenever a view or component changes.

## Git

Conventional commits: `type(scope): summary` (e.g. `fix(ci): ...`, `refactor(redesign): ...`).
<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 3, Lesson 1

Open Module 3 by producing a **durable, risk-first quality contract** before any test is written — then drive each rollout phase through the standard change chain.

```
PRD + roadmap + archive
        │
        ▼
   /10x-test-plan  ──►  context/foundation/test-plan.md  (strategy §1–§5 frozen + cookbook §6 grows)
        │
        ▼  (one rollout phase at a time, /clear between handoffs)
   /10x-new ──► /10x-research ──► /10x-plan ──► /10x-implement
```

`/10x-test-plan` is a **stateful orchestrator**, not a one-shot generator. On first run it writes the phased rollout to `context/foundation/test-plan.md`. On every subsequent run it re-derives state from on-disk artifacts and presents the next handoff. The lesson focus is **strategy and rollout sequencing, not configuration**. Hooks, MCP servers, and CI YAML are configured in later lessons of this module.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Quality strategy as a rules-file (lesson focus)** | |
| `/10x-test-plan` | You have a PRD (and ideally a roadmap and a few archived slices) and you are about to write the project's first tests, or you noticed that AI-generated tests are landing on helpers while critical flows go uncovered. First invocation runs discovery (PRD + roadmap + archive + hot-spot scan), a 5-question user interview, and a synthesis pass with a mandatory challenger check, then writes `test-plan.md` in `context/foundation/` with a risk map (5–7 failure scenarios), a phased rollout table, a stack table, a quality-gates table, a cookbook section (`§6`, fills in as phases ship), and a negative-space section (what we deliberately don't test). Subsequent invocations advance the rollout one handoff at a time. |
| `/10x-test-plan --status` | A `test-plan.md` already exists and you want a compact snapshot of where the rollout stands — which phases are `not started`, `change opened`, `researched`, `planned`, `implementing`, or `complete`, and what the next action is. Does no work; safe to run any time. |
| `/10x-test-plan --refresh` | A `test-plan.md` already exists and one of: a new top-3 risk surfaced from the roadmap or archive, a tool's `checked:` date is older than three months, the project's tech stack changed, or §7 negative-space no longer matches what the team believes. Opens a new `test-plan-refresh-<YYYY-MM-DD>` change folder rather than editing the guide in place. |

### Rollout chain — what happens after the guide is written

The guide's §3 *Phased Rollout* table is the orchestrator's state. For each non-`complete` row the orchestrator selects the next handoff based on which artifacts exist in `context/changes/<change-id>/`:

| State on disk | Next handoff | Status transitions to |
| --- | --- | --- |
| change folder missing | `/10x-new <change-id>` | `change opened` |
| `change.md` only | `/10x-research` (with a risks-to-verify brief) | `researched` |
| `+ research.md` | `/10x-plan` (with cost × signal + cookbook-update constraints) | `planned` |
| `+ plan.md` with pending `## Progress` items | `/10x-implement <change-id> phase <N>` | `implementing` / `complete` |
| `+ plan.md` fully `[x]` | Mark §3 row `complete`; loop to next pending row | — |

Each handoff is a **STOP point**. The orchestrator copies the next command to the clipboard, asks the user to `/clear` and run it, then exits. Re-invoke `/10x-test-plan` (no arguments) to advance.

### Risk-first prioritization rules

- Risks are **failure scenarios in user / business terms**, not test names. "Logged-out user reaches paid content via stale token" is a risk; "test the login form" is not.
- 5 to 7 risks. Fewer is too coarse; more makes prioritization useless.
- Impact and likelihood are user/business ratings, not technical complexity.
- Every risk traces to a source: PRD section, archived slice, roadmap entry, Phase 2 interview question, hot-spot **directory** with churn count, or a tech-stack constraint. No invented risks.
- **Signal, not knowledge.** §2 cites *evidence that raised the risk*, never a file as "where the failure lives." File:line anchors, function names, schema names, and module names are forbidden in §2 — they belong in `/10x-research`'s output, produced per rollout phase against current code. The plan is a QA spec; it is not a code audit.
- Coverage is not the metric. **Risk coverage** is the metric.

### Dual-layer mapping rules

- Classic layer first: the cheapest test that gives a real signal wins. Promote to e2e only when no cheaper layer covers the risk.
- AI-native layer second, and only where it adds signal classic tests do not give cheaply.
- Every AI-native row has a **"When NOT to use"** line. If you cannot write one, drop the row.
- Every tool name carries a `checked: <YYYY-MM-DD>` date. Tool names are examples of the category, not endorsements.
- Both layers must be non-empty in the final guide if the project warrants them. Classic-only is a 2020 plan; AI-native-only is hype. AI-native phases are not mandatory — include them only when the brief justified them under cost × signal.

### Quality gates rules

- Required gates (lint, typecheck, unit+integration, e2e on critical flows) must map to actual CI steps. If a required gate is not yet wired, mark it as `required after §3 Phase <N>` and let the named rollout phase wire it.
- Post-edit hook is **recommended local**, not a CI substitute.
- Multimodal visual review is **selective**, applied to 1–3 critical screens, not to every page.
- Vision-driven fallback (Anthropic Computer Use or OpenAI CUA) is reserved for DOM-unreachable surfaces; expensive per action.

### Cookbook patterns (§6) — fills in over time

`test-plan.md` is both a phased strategy and a **growing cookbook**. §6 starts as placeholders (`TBD — see §3 Phase <N>`) and fills in incrementally — each rollout phase's plan ends with a sub-phase that updates the relevant §6 entry (location, naming, reference test, run command). After Module 3 completes, §6 becomes the canonical answer to "how do I add a test for X in this project?" — and is what `/10x-tdd` reads in Lesson 2.

### Lesson boundaries

- Do not write test code. That is Lesson 2 (`/10x-tdd` and unit-test authoring).
- Do not configure hooks, hook lifecycle, or debugging hooks. That is Lesson 3.
- Do not configure MCP servers, Playwright API, e2e code, or multimodal scenario code. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test workflow. That is Lesson 5.
- Do not author CI/CD pipelines from scratch or write GitHub Actions YAML. The guide names gates; configuration is owned by Module 1 Lesson 5 and Module 2 Lesson 5.
- Do not benchmark multimodal models. Cite criteria (cost, latency, agent-friendliness), never a ranking.
- Do not read the codebase for knowledge (call graphs, schemas, "which file owns this failure"). That is `/10x-research`'s job, per rollout phase.

### Paths used by this lesson

- `context/foundation/test-plan.md` — the quality contract produced and maintained by `/10x-test-plan`
- `context/foundation/prd.md` — primary risk source
- `context/foundation/roadmap.md` — likelihood weighting
- `context/foundation/tech-stack.md` — stack input (when present)
- `context/archive/<change-id>/plan.md` — implemented risk surface
- `context/changes/<change-id>/` — per-rollout-phase change folder (one per row in §3)

<!-- END @przeprogramowani/10x-cli -->
