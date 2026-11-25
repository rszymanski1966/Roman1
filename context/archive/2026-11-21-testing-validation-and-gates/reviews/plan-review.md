<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Faza 4 rolloutu testów — walidacja i bramki

- **Plan**: context/changes/testing-validation-and-gates/plan.md
- **Mode**: Deep
- **Date**: 2026-11-21
- **Verdict**: REVISE → SOUND after triage
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | WARNING |
| Blind Spots           | WARNING |
| Plan Completeness     | WARNING |

## Grounding

12/12 paths ✓, 9/9 symbols ✓ (Astro checkOrigin `origin-check.js:15-21`, `ServiceErrorCode`, `sign_in_sign_ups` `config.toml:190`, smoke `:158/:640`, `STATUS_TIMEOUT_MS` 60 s, Supabase CLI 2.117.0, `-x` container names, `vitest related --project`, repo PUBLIC → rulesets enforced on free plan), brief↔plan ✓, Progress↔Phase ✓ (6/6 phases, 36/36 steps).

## Findings

### F1 — Pre-fix red run creates GoTrue accounts with unspecified emails

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 — #2 Macierz walidacji, criterion 2.1
- **Detail**: Before the fix, signup.ts passes any fields to GoTrue (confirmations off, `config.toml:209`), so the "different confirmPassword" and "long e-mail" rows create real accounts in run 2.1 and the missing-field signin rows reach GoTrue. The sweep removes only `vitest-<runId>-<label>@example.test` (`tests/harness/accounts.ts:18`); any other e-mail stays in dev data and fails the harness check. The "≤3 GoTrue requests" budget holds only after the fix.
- **Fix**: Build every auth-row e-mail from runId in the sweep pattern; budget applies after the fix; teardown sweep removes the 2.1 accounts.
- **Decision**: FIXED

### F2 — Blocking Stop hook works against intentional red tests

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 6 — #1 Hooki
- **Detail**: Red-first workflow (CLAUDE.md, /10x-tdd, "wait for confirmation") conflicts with a Stop hook that exits 2 on red `test:unit`: the agent is forced to continue exactly when it should stop and show red.
- **Fix A ⭐ Recommended**: Keep blocking; hook message names intentional red as a valid reason to stop.
  - Strength: signal stays on accidental red.
  - Tradeoff: one extra turn per intentional red.
  - Confidence: MED — relies on the agent following the message.
  - Blind spot: interaction with /10x-tdd stops.
- **Fix B**: Non-blocking Stop hook (message to the user); per-edit hook remains the agent's signal.
  - Strength: no conflict with TDD.
  - Tradeoff: agent can end a turn on accidental red.
  - Confidence: HIGH.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix B)

### F3 — Auth fix adds empty catch, against the CLAUDE.md hard rule

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Architectural Fitness
- **Location**: Phase 2 — #4 Endpointy auth
- **Detail**: Contract copies `api/ingredients.ts:62-68` (empty `catch {}`); CLAUDE.md: "If the fix needs a catch, it logs or reports the error with its cause."
- **Fix**: `console.warn` with the error as cause and the Content-Type only (never the body — passwords), then redirect.
- **Decision**: FIXED

### F4 — Database whitespace rule is narrower than normalizeName

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 — #2 Migracja; Migration Notes query
- **Detail**: JS `\s` covers all Zs (NBSP U+00A0, U+2007, U+202F, U+FEFF); Postgres `\s` under libc excludes the no-break spaces, so a direct write with NBSP passed the planned CHECK.
- **Fix**: Character class `[\s   ﻿]` in the CHECK and control query; NBSP throws_ok row.
- **Decision**: FIXED

### F5 — Local dev data is not checked before `migration up`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 4 — criterion 4.2
- **Detail**: test:migrations uses only synthetic fixture.sql; the control query was production-only, so local dev data was the first real data under the CHECKs.
- **Fix**: Run the control query locally (Studio) before 4.2.
- **Decision**: FIXED

### F6 — Trial branch gets no CI run without a PR

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 5 — criteria 5.3 / 5.5
- **Detail**: ci.yml triggers only on push/PR to main; pushing a trial branch alone runs nothing.
- **Fix**: Open a draft PR from the trial branch; close it and delete the branch after.
- **Decision**: FIXED
