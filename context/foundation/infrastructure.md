---
project: kuchenny-zamiennik
researched_at: 2026-09-30
recommended_platform: Cloudflare Workers (static assets)
runner_up: Vercel
context_type: mvp
tech_stack:
  language: TypeScript
  framework: Astro 7 (SSR) + React 19, @astrojs/cloudflare 14.3
  runtime: Cloudflare workerd (nodejs_compat), Node 22 for build
---

## Recommendation

**Deploy on Cloudflare Workers (with static assets) — not Cloudflare Pages.**

Cloudflare scored a full pass on all five agent-friendly criteria and is the only candidate that needs no adapter swap: `@astrojs/cloudflare` 14.3, `wrangler.jsonc` and the GitHub Actions deploy step already target it. The PRD's scale (small users, low QPS, small data) fits comfortably in the Free plan. Interview answers (no persistent connections, cost/DX neutral, no prior familiarity, single region, co-location undecided) did not push against it; the lowest migration cost broke the tie.

**Correction to `tech-stack.md`:** its hint `deployment_target: cloudflare-pages` is stale. `@astrojs/cloudflare` v13+ removed Pages support; the adapter deploys to Workers only. Use `wrangler deploy`, never `wrangler pages deploy`. `tech-stack.md` should be updated to say Workers.

## Platform Comparison

| Platform | CLI-first | Managed/Serverless | Agent-readable docs | Stable deploy API | MCP / Integration | Total |
|---|---|---|---|---|---|---|
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | 5 / 5 |
| Vercel | Pass | Pass | Pass | Pass | Partial (MCP public beta) | 4.5 |
| Netlify | Pass | Pass | Pass | Partial (no CLI rollback found) | Pass | 4.5 |
| Railway | Pass | Pass | Pass | Partial (rollback dashboard-only) | Pass | 4.5 |
| Render | Pass | Pass | Pass | Partial (rollback via dashboard/API) | Pass | 4.5 |
| Fly.io | Pass | Partial (Dockerfile required) | Pass | Partial (rollback = redeploy old image) | Partial (status unverified) | 3.5 |

No platform was dropped by the hard filters (no persistent connections needed; all run JS/TS). Notes per platform:

- **Cloudflare**: `wrangler deploy`, `wrangler rollback` (last 100 versions), `wrangler tail`; `developers.cloudflare.com/llms.txt`; MCP servers for docs, bindings, builds and observability (no beta label seen).
- **Vercel**: `vercel deploy --prod`, `vercel rollback`, `vercel logs`; `vercel.com/llms.txt`; MCP at `mcp.vercel.com` is **Public Beta** (checked 2026-09-30). Hobby is personal/non-commercial only; default function region is `iad1`, so set `fra1`.
- **Netlify**: draft-by-default `netlify deploy`; `llms.txt`; MCP supported. Free plan runs functions in Ohio; EU region is Pro-only. Rollback is UI-only per docs.
- **Railway**: `railway up`/`redeploy`, `.md` docs, MCP at `mcp.railway.com`; EU West (Amsterdam) available; no true free tier (Hobby $5/month).
- **Render**: deploy hooks, CLI, `llms.txt`, hosted MCP; free tier cold-starts ~1 min, Starter ~$7/month (price from a third-party snippet, unverified).
- **Fly.io**: `fly deploy`; no free tier (trial only); rollback is `fly deploy --image ...`; `fly mcp` status unverified.

### Shortlisted Platforms

#### 1. Cloudflare Workers (Recommended)

Full pass on all criteria, zero migration work, likely $0 at 10k–100k requests/month (Free: 100k requests/day; static asset requests are free). Fallback is Workers Paid at $5/month.

#### 2. Vercel

Excellent CLI/API and `@astrojs/vercel` 11 supports Astro 7. Gap: MCP is beta, Hobby forbids commercial use (Pro is $20/month), and it requires swapping the adapter, CI deploy step and secrets flow.

#### 3. Railway

Confirmed EU region, good CLI and MCP, no Dockerfile needed. Gaps: rollback is dashboard-only, always-on billing (~$5+/month), and it needs `@astrojs/node` in place of the Cloudflare adapter.

## Anti-Bias Cross-Check: Cloudflare Workers

### Devil's Advocate — Weaknesses

1. **Free-plan CPU cap of 10 ms/request.** SSR pages that do Supabase auth and queries could exceed it; the Paid plan ($5/month, up to 30 s CPU default) is the fallback.
2. **Edge-to-Supabase latency.** Workers execute near the user but Supabase lives in one region; every SSR request adds a hop, which threatens the PRD's under-1-second search goal.
3. **Current `wrangler.jsonc` disables observability, `workers_dev` and `preview_urls`.** As configured there are no runtime logs and no preview deploys.
4. **CI deploys every push to `main` with no approval gate** (`ci.yml`).
5. **`wrangler rollback` reverts code only**, not bindings or data — Supabase migrations do not roll back with it.

### Pre-Mortem — How This Could Fail

Six months on, the app feels slow and is hard to debug. The team followed `tech-stack.md` and older Pages tutorials, losing days on Pages commands the current adapter no longer supports. Observability stayed disabled, so when a search endpoint began exceeding the Free plan's 10 ms CPU limit and returning errors, there were no logs to explain it. Supabase sat in a different region from the user, and edge SSR made the "instant search" requirement feel sluggish. `SUPABASE_URL` and `SUPABASE_KEY` had been set only as GitHub build secrets, so production ran without them; the middleware silently got a `null` client and redirected every request to sign-in. Every push to `main` auto-deployed, so a commit coupled to a database migration reached production immediately. When it broke, rolling back the Worker left the schema changed, and the app stayed down until the schema was fixed by hand.

### Unknown Unknowns

- `@astrojs/cloudflare` v13+ removed Pages support; Pages-based docs and the `tech-stack.md` hint are stale for this version.
- The adapter auto-provisions a `SESSION` KV namespace and an image-service binding by default; a deploy can create resources you did not ask for.
- Env access is `import { env } from "cloudflare:workers"`; `Astro.locals.runtime` was removed, so older tutorials will mislead an agent.
- `cloudflare/wrangler-action` deploys code but does not set runtime secrets; they need `wrangler secret put` (or the dashboard) separately from the GitHub build secrets.
- Not verified in research: real CPU time of this app's SSR pages against the 10 ms Free cap; `nodejs_compat`, `wrangler tail` and preview-URL behaviour come from general knowledge rather than fetched docs.

## Operational Story

- **Preview deploys**: currently none — `workers_dev` and `preview_urls` are both `false` in `wrangler.jsonc`, and CI only builds on PRs. To get previews, enable `preview_urls` and use `wrangler versions upload`; protect them (e.g. Cloudflare Access) since they would expose a Supabase-backed app.
- **Secrets**: runtime secrets (`SUPABASE_URL`, `SUPABASE_KEY`) live in Workers Secrets, set with `npx wrangler secret put <NAME>`; build-time copies live in GitHub Actions secrets. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are GitHub secrets. Rotation: re-run `wrangler secret put`, then update the GitHub secret.
- **Rollback**: `npx wrangler rollback [version-id]` (last 100 versions retained, takes seconds). Does not undo bindings or Supabase migrations; migrations must be written to be backward-compatible.
- **Approval**: production deploy currently runs unattended on push to `main`. Human-only: rotating the primary Supabase key, dropping or resetting the database, deleting the Worker, changing the API token scope. An agent may run `wrangler deploy`, `wrangler rollback`, `wrangler tail` and read-only queries.
- **Logs**: enable `observability` in `wrangler.jsonc`, then `npx wrangler tail` for live logs; the Cloudflare Observability MCP server is an optional structured alternative (start with CLI). Free plan retention is 3 days.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| Free-plan 10 ms CPU cap exceeded by SSR + Supabase calls | Devil's advocate | M | M | Measure after first deploy; move to Workers Paid ($5/month) if errors appear |
| Edge-to-Supabase latency breaks the <1 s search goal | Devil's advocate | M | M | Create the Supabase project in an EU region near users; consider Smart Placement if needed |
| No logs or previews because config disables them | Devil's advocate | H | M | Set `observability.enabled` true; decide on `preview_urls` before first deploy |
| Auto-deploy on push to `main` ships a bad migration-coupled change | Devil's advocate | M | H | Deploy schema changes first and keep them backward-compatible; consider a manual gate on the deploy job |
| Rollback does not revert schema or bindings | Devil's advocate | M | H | Expand/contract migrations; never drop columns in the same release |
| Team follows stale Pages guidance (`cloudflare-pages` in `tech-stack.md`) | Pre-mortem | H | M | Update `tech-stack.md` to Workers; use only `wrangler deploy` |
| Runtime secrets missing in production (only GitHub build secrets set) | Pre-mortem | H | H | `wrangler secret put SUPABASE_URL` and `SUPABASE_KEY` before first deploy; smoke-test signin against production |
| Adapter auto-provisions `SESSION` KV and image binding unexpectedly | Unknown unknowns | M | L | Review `wrangler deploy` output; set the image service to `compile` or configure KV explicitly |
| Env access differs from older docs (`cloudflare:workers`, no `Astro.locals.runtime`) | Unknown unknowns | M | L | Point agents at the v14 adapter docs; keep using `astro:env/server` |
| Some Cloudflare capabilities unverified (`nodejs_compat`, `wrangler tail`, preview URLs) | Research finding | L | L | Confirm on first deploy; re-check against docs |
| Vercel MCP beta / Render pricing figures are unverified | Research finding | L | L | Re-verify only if the platform is swapped |

## Getting Started

Commands validated against Astro 7.3 with `@astrojs/cloudflare` 14.3 and wrangler 4.x (pinned in `package.json`). Note `astro dev` and `astro preview` already run on workerd, so a separate `wrangler dev` is not needed.

1. Local dev: `cp .env.example .dev.vars`, fill in `SUPABASE_URL` and `SUPABASE_KEY`, then `npm run dev`.
2. Authenticate: `npx wrangler login` (interactive, run it yourself), and create a scoped API token limited to Workers for this account for CI.
3. Before first deploy, set runtime secrets: `npx wrangler secret put SUPABASE_URL` and `npx wrangler secret put SUPABASE_KEY`. Also decide the `observability` and `preview_urls` settings in `wrangler.jsonc`.
4. Deploy: `npm run build && npx wrangler deploy` (Workers command; do not use `wrangler pages deploy`).
5. Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to GitHub secrets so the existing `ci.yml` deploy step works, then verify with `BASE_URL=<worker-url> npm run smoke`.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup
- Production-scale architecture (multi-region, HA, DR)
