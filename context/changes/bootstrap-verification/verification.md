---
bootstrapped_at: 2026-09-25T10:02:07Z
starter_id: 10x-astro-starter
starter_name: "10x Astro Starter (Astro + Supabase + Cloudflare)"
project_name: kuchenny-zamiennik
language_family: js
package_manager: npm
cwd_strategy: git-clone
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "npm audit --json"
---

# Bootstrap verification — kuchenny-zamiennik

## Hand-off

Source: `context/foundation/tech-stack.md` (the invocation argument `@tech-stack.md` did not resolve at the repo root; the default hand-off path was used).

```yaml
starter_id: 10x-astro-starter
package_manager: npm
project_name: kuchenny-zamiennik
hints:
  language_family: js
  team_size: solo
  deployment_target: cloudflare-pages
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
```

## Why this stack

A solo developer building an after-hours MVP in 3 weeks needs a battle-tested, agent-friendly starter with auth and a database out of the box. Kuchenny Zamiennik is a small web app for one user at a time, built on per-user CRUD over ingredients, categories and substitutes, with search by name and an optional category filter. 10x-astro-starter is the recommended default for web apps in JS/TS and passes all four agent-friendly gates. Supabase email/password auth covers the PRD's access-control section. Postgres with per-operation RLS policies enforces the guardrail that each user's substitute database stays isolated, and it handles sub-second search at this data volume without extra infrastructure. Payments, realtime, AI and background jobs are out of scope, so the edge runtime's limits on long-running work don't matter here. Deployment goes to Cloudflare Pages via GitHub Actions with auto-deploy on merge, which is what the starter ships with.

## Pre-scaffold verification

| Signal      | Value                                                       | Severity | Notes                                                             |
| ----------- | ----------------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| npm package | not run                                                     | —        | cmd_template starts with `git clone`; no npm CLI to check         |
| GitHub repo | przeprogramowani/10x-astro-starter last pushed 2026-09-12   | fresh    | from card.docs_url; `gh` not installed, queried GitHub REST API via curl |

## Scaffold log

**Resolved invocation**: `git clone https://github.com/przeprogramowani/10x-astro-starter .bootstrap-scaffold && cd .bootstrap-scaffold && npm install`
**Strategy**: git-clone (cloned `.git/` deleted before move-up)
**Exit code**: 0
**Files moved**: 2 — `AGENTS.md`, `scripts/smoke.mjs`
**Conflicts (.scaffold siblings)**: 15 — `.github/workflows/ci.yml.scaffold`, `CLAUDE.md.scaffold`, `eslint.config.js.scaffold`, `package.json.scaffold`, `package-lock.json.scaffold`, `README.md.scaffold`, `src/components/Topbar.astro.scaffold`, `src/components/Welcome.astro.scaffold`, `src/layouts/Layout.astro.scaffold`, `src/lib/supabase.ts.scaffold`, `src/pages/auth/confirm-email.astro.scaffold`, `src/pages/auth/signin.astro.scaffold`, `src/pages/auth/signup.astro.scaffold`, `tsconfig.json.scaffold`, `wrangler.jsonc.scaffold`
**Byte-identical files (no sibling created)**: 34 — the cwd copy already matched the scaffold exactly, so a `.scaffold` sibling would carry no information; scaffold copy dropped.
**node_modules**: scaffold copy dropped; the existing cwd `node_modules/` was kept (install artifact, regenerable via `npm install`).
**.gitignore handling**: append-merged — scaffold `.gitignore` was byte-identical to cwd, so zero lines appended.
**.bootstrap-scaffold cleanup**: deleted

**Install notes (stderr)**: `npm install` emitted EBADENGINE warnings — `astro-eslint-parser@3.1.0` and `eslint-plugin-astro@3.1.0` require Node `^22.22.3 || ^24.16.0 || >=26.3.0`, `undici@8.10.2` requires Node `>=22.19.0`; local Node is v22.14.0. The scaffold's own `npm install` reported **0 vulnerabilities** against the starter's current lockfile.

## Post-scaffold audit

**Tool**: npm audit --json (run from cwd, i.e. against the pre-existing `package.json` / `package-lock.json`, which won the conflict policy over the starter's newer copies)
**Exit code**: 1 (informational)
**Summary**: 2 CRITICAL, 15 HIGH, 7 MODERATE, 3 LOW (27 total; 961 dependencies)
**Direct vs transitive**: 1/1/1/0 direct of total 2/15/7/3 — direct: `astro` (CRITICAL), `wrangler` (HIGH), `supabase` (MODERATE)

> Note: the starter's current `package.json.scaffold` / `package-lock.json.scaffold` installed with 0 vulnerabilities. Adopting them (or running `npm audit fix` / bumping `astro`, `wrangler`, `supabase`) would likely clear most findings.

#### CRITICAL findings
- **astro** <=7.2.7 (direct) — GHSA-jrpj-wcv7-9fh9: Astro: XSS via Unescaped Attribute Names in Spread Props; GHSA-f48w-9m4c-m7f5: Astro: XSS via unescaped spread attribute names in renderHTMLElement (incomplete fix for CVE-2026-54298); GHSA-7pw4-f3q4-r2p2: Astro: Cross-site scripting via unescaped transition:* directive values on hydrated islands; GHSA-4g3v-8h47-v7g6: Astro: Reflected XSS via unescaped View Transition animation properties; GHSA-2pvr-wf23-7pc7: Astro: Host header SSRF in prerendered error page fetch; GHSA-8hv8-536x-4wqp: Astro: Reflected XSS via unescaped slot name; GHSA-26w7-cxv4-gfx2: Astro: Remote code execution through AVIF image optimization; GHSA-376h-93r7-7g6f: Astro: Authorization bypass from missing path-segment boundary check when stripping the configured base — fix available
- **tar** <=7.5.20 (transitive) — GHSA-vmf3-w455-68vh: node-tar applies PAX size override to intermediary GNU long-name/long-link headers, causing tar parser interpretation differential (file smuggling); GHSA-w8wr-v893-vjvp: node-tar: Process crash via PAX numeric path type confusion; GHSA-23hp-3jrh-7fpw: node-tar: Decompression/parse DoS via unlimited input; GHSA-8x88-c5mf-7j5w: node-tar: Negative tar entry size causes infinite loop in archive replace; GHSA-gvwx-54wh-qm9j: node-tar: Uncaught Exception DoS via NUL byte in PAX path/linkpath records; GHSA-r292-9mhp-454m: node-tar: Uncontrolled recursion in mapHas/filesFilter allows uncatchable stack-overflow DoS via crafted long-path tar with member selection — fix available
#### HIGH findings
- **brace-expansion** <=1.1.17 || 3.0.0 - 5.0.8 (transitive) — GHSA-3jxr-9vmj-r5cp: brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups; GHSA-3jxr-9vmj-r5cp: brace-expansion: DoS via exponential-time expansion of consecutive non-expanding {} groups; GHSA-mh99-v99m-4gvg: brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash; GHSA-mh99-v99m-4gvg: brace-expansion: DoS via unbounded expansion length causing an out-of-memory process crash; GHSA-rgw5-rvv9-x895: brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation; GHSA-rgw5-rvv9-x895: brace-expansion: DoS via unbounded intermediate arrays, bypassing the CVE-2026-14257 mitigation — fix available
- **browserslist** <=4.28.6 (transitive) — GHSA-c83g-rgw3-j3cx: Browserslist: Unbounded memory growth (no cache eviction) via distinct query results, leading to eventual OOM; GHSA-73wf-gq98-2v4g: Browserslist: Uncaught crash / prototype write via untrusted browserslist-stats.json custom stats (normalizeStats) — fix available
- **devalue** <=5.9.0 (transitive) — GHSA-77vg-94rm-hx3p: Svelte devalue: DoS via sparse array deserialization; GHSA-9rgm-9g3h-6x36: Svelte devalue: DoS via malformed input — fix available
- **fast-uri** 3.0.0 - 3.1.5 (transitive) — GHSA-v2hh-gcrm-f6hx: fast-uri vulnerable to host confusion via literal backslash authority delimiter; GHSA-7p8r-x3mc-p8w7: fast-uri vulnerable to host confusion via backslash authority introducer; GHSA-f65p-4m7j-42xc: fast-uri vulnerable to server-side request forgery via malformed IPv6 normalization; GHSA-fph4-wmhf-6fwf: fast-uri vulnerable to server-side request forgery via repeated hostname percent-decoding; GHSA-jqff-g426-hqxp: fast-uri vulnerable to host confusion via percent-encoded scheme normalization; GHSA-4c8g-83qw-93j6: fast-uri vulnerable to host confusion via failed IDN canonicalization — fix available
- **js-yaml** 4.0.0 - 4.3.1 (transitive) — GHSA-h67p-54hq-rp68: JS-YAML: Quadratic-complexity DoS in merge key handling via repeated aliases; GHSA-52cp-r559-cp3m: js-yaml: YAML merge-key chains can force quadratic CPU consumption; GHSA-5p4m-2wfm-xmqj: JS-YAML: Quadratic CPU consumption in !!omap resolution (3.x and 4.x) — CVE-2026-59870 fix not backported; GHSA-2883-xcg3-v3hh: js-yaml: maxTotalMergeKeys does not limit CPU use for empty merge sources — fix available
- **miniflare** <=0.0.0-fff677e35 || 3.20250204.0 - 5.20260908.0-alpha (transitive) — via sharp, sharp, undici, ws — fix available
- **nanoid** <=3.3.17 (transitive) — GHSA-28wg-ghj8-5hjv: nanoid: non-secure generators can loop indefinitely with negative size; GHSA-2v37-7h3g-55p8: nanoid: custom generators can loop indefinitely when size is zero — fix available
- **postcss** <=8.5.22 (transitive) — GHSA-fxqj-rqcc-2cmp: PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset; GHSA-r28c-9q8g-f849: PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure — fix available
- **sharp** <=0.35.4-rc.0 (transitive) — GHSA-f88m-g3jw-g9cj: sharp inherited vulnerabilities in libvips: CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591; GHSA-rgj7-g3m4-5g8c: sharp: Vulnerabilities in libheif: GHSA-g89c-p67h-r497 and GHSA-2jg2-4ch7-h545 — fix available
- **smol-toml** <=1.7.0 (transitive) — GHSA-7w5x-hrqm-74c2: smol-toml: Denial of Service via malformed TOML documents — fix available
- **svgo** 4.0.0 - 4.0.2 (transitive) — GHSA-2p49-hgcm-8545: SVGO removeScripts plugin leaves some executable scripts intact; GHSA-w27v-7q3p-w38r: SVGO: removeScripts allows executable links through namespace and control-character bypasses; GHSA-4vpr-x523-8j87: SVGO: removeScripts incompletely sanitizes executable HTML in SVG foreignObject elements — fix available
- **undici** 7.0.0 - 7.28.0 (transitive) — GHSA-vmh5-mc38-953g: undici vulnerable to TLS certificate validation bypass via dropped requestTls in SOCKS5 ProxyAgent; GHSA-p88m-4jfj-68fv: undici vulnerable to HTTP header injection via Set-Cookie percent-decoding; GHSA-vxpw-j846-p89q: undici WebSocket client vulnerable to denial of service via fragment count bypass; GHSA-hm92-r4w5-c3mj: undici vulnerable to cross-origin request routing via SOCKS5 proxy pool reuse; GHSA-g8m3-5g58-fq7m: undici vulnerable to Set-Cookie SameSite attribute downgrade via permissive substring matching; GHSA-pr7r-676h-xcf6: undici vulnerable to cross-user information disclosure via shared cache whitespace bypass; GHSA-8xcm-r25x-g524: undici vulnerable to downstream response desynchronization via retry interceptor; GHSA-4cwx-7wf7-3272: undici vulnerable to cross-user information disclosure and parse-time crash via degenerate private cache directives; GHSA-m8rv-5g2x-5cg5: undici vulnerable to CRLF Injection via blob-like body 'type' property; GHSA-jr45-8vmc-qm54: undici vulnerable to cross-user information disclosure via whitespace around equals in Cache-Control directives; GHSA-v3r7-h72x-cjcm: undici vulnerable to cookie attribute injection via unsanitized domain and unparsed setCookie fields; GHSA-35p6-xmwp-9g52: undici vulnerable to HTTP response queue poisoning via keep-alive socket reuse — fix available
- **vite** 7.0.0 - 7.3.3 (transitive) — GHSA-v6wh-96g9-6wx3: launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows; GHSA-fx2h-pf6j-xcff: vite: `server.fs.deny` bypass on Windows alternate paths — fix available
- **wrangler** <=0.0.0-kickoff-demo || 3.108.0 - 4.130.0 (direct) — via esbuild, miniflare, miniflare — fix available
- **ws** 8.0.0 - 8.20.1 (transitive) — GHSA-58qx-3vcg-4xpx: ws: Uninitialized memory disclosure; GHSA-96hv-2xvq-fx4p: ws: Memory exhaustion DoS from tiny fragments and data chunks — fix available
#### MODERATE findings
- **@astrojs/language-server** 2.14.0 - 2.16.10 (transitive) — via volar-service-yaml — fix available
- **@cloudflare/vite-plugin** <=0.0.0-fff677e35 || 0.0.7 - 1.41.0 (transitive) — via miniflare, wrangler, ws — fix available
- **baseline-browser-mapping** >=2.0.0 <2.11.0 (transitive) — GHSA-w5vr-8v7q-w6rv: baseline-browser-mapping process termination on invalid input causes denial of service — fix available
- **supabase** 1.1.6 - 2.98.2 (direct) — via tar — fix available
- **volar-service-yaml** <=0.0.70 (transitive) — via yaml-language-server — fix available
- **yaml** 2.0.0 - 2.8.2 (transitive) — GHSA-48c2-rrv3-qjmp: yaml is vulnerable to Stack Overflow via deeply nested YAML collections — fix available
- **yaml-language-server** 1.11.1-08d5f7b.0 - 1.21.1-f1f5a94.0 || 1.22.1-0ae5603.0 - 1.22.1-fc5f874.0 (transitive) — via yaml — fix available
#### LOW / INFO
- **@babel/core** <=7.29.0 (transitive) — GHSA-4x5r-pxfx-6jf8: @babel/core: Arbitrary File Read via sourceMappingURL Comment — fix available
- **esbuild** 0.27.3 - 0.28.0 (transitive) — GHSA-g7r4-m6w7-qqqr: esbuild allows arbitrary file read when running the development server on Windows — fix available
- **postcss-selector-parser** 7.1.0 - 7.1.2 (transitive) — GHSA-w9m9-85wc-3x92: postcss-selector-parser allows denial of service through uncontrolled AST recursion — fix available

## Hints recorded but not acted on

| Hint                    | Value                 |
| ----------------------- | --------------------- |
| bootstrapper_confidence | first-class           |
| quality_override        | false                 |
| path_taken              | standard              |
| self_check_answers      | null                  |
| team_size               | solo                  |
| deployment_target       | cloudflare-pages      |
| ci_provider             | github-actions        |
| ci_default_flow         | auto-deploy-on-merge  |
| has_auth                | true                  |
| has_payments            | false                 |
| has_realtime            | false                 |
| has_ai                  | false                 |
| has_background_jobs     | false                 |

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- `git init` (if you have not already) to start your own repo history.
- Review any `.scaffold` siblings the conflict policy created and decide which version of each file to keep.
- Address audit findings per your project's risk tolerance — the full breakdown is in this log.
