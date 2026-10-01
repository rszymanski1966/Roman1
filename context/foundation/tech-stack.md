---
starter_id: 10x-astro-starter
package_manager: npm
project_name: kuchenny-zamiennik
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-workers
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: standard
  quality_override: false
  self_check_answers: null
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
---

## Why this stack

A solo developer building an after-hours MVP in 3 weeks needs a battle-tested, agent-friendly starter with auth and a database out of the box. Kuchenny Zamiennik is a small web app for one user at a time, built on per-user CRUD over ingredients, categories and substitutes, with search by name and an optional category filter. 10x-astro-starter is the recommended default for web apps in JS/TS and passes all four agent-friendly gates. Supabase email/password auth covers the PRD's access-control section. Postgres with per-operation RLS policies enforces the guardrail that each user's substitute database stays isolated, and it handles sub-second search at this data volume without extra infrastructure. Payments, realtime, AI and background jobs are out of scope, so the edge runtime's limits on long-running work don't matter here. Deployment goes to Cloudflare Workers via GitHub Actions (`cloudflare/wrangler-action@v3`, `wrangler deploy`) on merge to `main`. Runtime secrets `SUPABASE_URL` and `SUPABASE_KEY` are set once with `npx wrangler secret put`.
