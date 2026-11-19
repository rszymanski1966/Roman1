# 10x Astro Starter

![](./public/template.png)

A modern, opinionated starter template for building fast, accessible web applications.

## Tech Stack

- [Astro](https://astro.build/) v7 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/przeprogramowani/10x-astro-starter.git
cd 10x-astro-starter
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm run test:unit` - Run the Vitest unit tests (pure search and view rules); no Supabase stack or dev server needed
- `npm test` - Run the Vitest unit tests plus the service and harness tests against the local Supabase stack, then the migration tests in a second run (needs `npx supabase start`; the race test and the migration tests connect to Postgres directly via `DB_URL` from `npx supabase status`)
- `npm run test:migrations` - Run the migration tests only: every migration newer than the baseline goes through the Supabase CLI onto throwaway `mig_test_*` databases with synthetic data (needs `npx supabase start`, no dev server; about 40 s). Run it before every `npx supabase db push`, see [Database migrations](#database-migrations)
- `npm run test:http` - Run the Vitest HTTP tests (account isolation, delete confirmation, search mode cookie and states) against a running `npm run dev`
- `npm run test:sweep` - Delete leftover throwaway test and smoke accounts from the local database (leftover `mig_test_*` databases are dropped by the next `npm run test:migrations`)
- `npm run lint:db-access` - Check that the app reaches the database only as the signed-in user (no service-role key, no `security definer`)
- `npx supabase test db` - Run the pgTAP database tests in `supabase/tests/` (each file rolls back its changes)

How to add a test: `context/foundation/test-plan.md` §6.

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Initialize the local Supabase project (creates a `supabase/` config folder):

```bash
npx supabase init
```

3. Start the local stack (downloads Docker images on first run):

```bash
npx supabase start
```

4. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

5. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

### Database migrations

The database schema lives in `supabase/migrations/`: tables with Row Level Security, plus the seeded `categories` list. To apply the migrations the local database does not have yet (after a pull, or one you just wrote), run the command below. It applies only the pending migrations and keeps your local data.

```bash
npx supabase migration up
```

Do not use `supabase db reset` on the local stack: it drops the local database with all your data. No test or check in this project needs it.

For a hosted Supabase project, link it once:

```bash
npx supabase link --project-ref <project-ref>
```

Push the migrations **before** deploying code that depends on them. CI deploys only the Worker, not the database, and runs no migration check, so go through these steps by hand, in this order:

1. With the local stack running (`npx supabase start`), test every migration that is not on production yet. It applies each migration newer than `BASELINE_MIGRATION` (in `tests/migrations/expectations.ts`) onto a throwaway copy of synthetic data and fails if the data changes in a way the migration did not declare. A migration that is meant to change data declares that change in that file (see `context/foundation/test-plan.md` §6.5).

   ```bash
   npm run test:migrations
   ```

2. Preview the push. It lists the migrations it would apply; they must be the ones the test listed under "migracje pod testem". If it lists an older one, the baseline is ahead of production and that migration was not tested.

   ```bash
   npx supabase db push --dry-run
   ```

3. Push, then check that every local migration is also on the remote database:

   ```bash
   npx supabase db push
   npx supabase migration list
   ```

4. In `tests/migrations/expectations.ts`, move `BASELINE_MIGRATION` to the last pushed version and delete the declarations of the pushed versions (the test fails on a declaration that is not newer than the baseline). If the pushed migrations changed the schema of the tables in `tests/migrations/fixture.sql`, update the fixture in the same commit. Then run `npm run test:migrations` again.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable       | Description                                                |
| -------------- | ---------------------------------------------------------- |
| `SUPABASE_URL` | Project URL from Supabase dashboard → Settings → API       |
| `SUPABASE_KEY` | `anon` public key from Supabase dashboard → Settings → API |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Example protected page (redirects to `/auth/signin` if unauthenticated) |

Route protection is handled in `src/middleware.ts`. Add paths to the `PROTECTED_ROUTES` array there to require authentication.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in your Cloudflare dashboard or via `npx wrangler secret put`.

## CI

GitHub Actions runs `astro sync` → lint → build on every push and PR to `main`. Every push to `main` also deploys to Cloudflare Workers via `cloudflare/wrangler-action` (PRs only build, never deploy).

Configure these repository secrets in GitHub: `SUPABASE_URL` and `SUPABASE_KEY` (build step), `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (deploy step).

A second workflow, `roadmap-sync`, runs when `context/foundation/roadmap.md` changes on `main`. It is a one-way sync, from the roadmap to GitHub issues. For each `S-NN`/`F-NN` row in the roadmap's "At a glance" table, it sets the `status:<status>` label on the issue titled `[S-NN] …`, and closes that issue once the status is `done`. It never writes to the repo and never reopens issues. It needs no extra secrets (built-in `GITHUB_TOKEN`). Preview it locally without changing anything:

```bash
GITHUB_TOKEN=$(gh auth token) GITHUB_REPOSITORY=<owner>/<repo> DRY_RUN=1 node scripts/roadmap-sync.mjs
```

## License

MIT
