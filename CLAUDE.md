# Rules for AI

## Key conventions

- **Astro components** for static content/layout; **React components** only when interactivity is needed.
- **Tailwind class merging**: use the `cn()` helper from `@/lib/utils` (clsx + tailwind-merge) for conditional/merged class names. Do not concatenate class strings manually.
- **shadcn/ui**: components live in `src/components/ui/`, "new-york" style variant. Install new ones with `npx shadcn@latest add [name]`. Tokens and the UI contract: see `## UI`.
- **API routes**: uppercase `GET`/`POST` exports. Auth routes take form posts and answer with redirects, not JSON. Errors go back as `?error=<encodeURIComponent(msg)>` on the originating page (see `@src/pages/api/auth/signin.ts`). zod is not installed yet; add it (`npm i zod`) before validating new input with it.
- **Supabase migrations**: `supabase/migrations/` using naming format `YYYYMMDDHHmmss_short_description.sql`. Always enable RLS on new tables with granular per-operation, per-role policies.
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

- `npm run smoke` — end-to-end smoke test (home, auth redirect, signup/signin flow) against a **running** server: `BASE_URL=http://localhost:4321 npm run smoke`. There is no unit-test framework; this is the only automated check beyond lint/build.

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

## 10xDevs AI Toolkit - Module 2, Lesson 5 (10xDevs 4.0 UI)

**For UI work on a view that already renders, start with `/10x-ui <view>`.** It is the
entry point: a short pre-audit, a suggested change-id and the `/10x-new` command for you to
run, then the audit brief for `/10x-research`. The visual change goes through the same chain
as any other change (`/10x-new` → `/10x-research` → `/10x-plan` → `/10x-implement` →
`/10x-impl-review`); `/10x-ui <change-id>` resumes at the first step not yet done. It carries
the rules:
when to start and which view, the audit into charges, the design-system contract as
this repo realises it, the component states, the screenshot gate, and the rule that
keeps the next agent on the contract. Its `references/` hold the quality checklist.

Building a view for the first time is not a `/10x-ui` job — build it through the
ordinary chain, then come back to it with `/10x-ui`.

<!-- END @przeprogramowani/10x-cli -->
