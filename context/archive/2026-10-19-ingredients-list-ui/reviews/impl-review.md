<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Widok listy zamienników na kontrakcie design systemu (ingredients-list-ui)

- **Plan**: context/changes/ingredients-list-ui/plan.md
- **Scope**: Full plan (fazy 1–5; 5.6 „CI na PR” w toku)
- **Reviewed phases**: 1, 2, 3, 4, 5
- **Date**: 2026-10-20
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING |
| Scope Discipline | WARNING |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Automated checks in this review: `npm run lint` exit 0, `npm run lint:ui` exit 0, `npx astro check` 0 errors / 0 warnings / 0 hints. `npm run smoke`: 23 failures, all after the dev server broke (see F1). Not a code result.

Verified OK: no open redirect in `best.ts` (fixed `LIST_PAGE`, UUID-validated ids, `URLSearchParams`); `error_for` only compared, never rendered; no `set:html`; Supabase null checks in place; kitchen-sink 404 outside DEV and without DB; all 13 oklch values match Tailwind 4.3.3; smoke markup constraints kept; every "What We're NOT Doing" boundary respected.

## Triage summary (2026-10-20)

- Fixed: F1, F2, F3 (Fix A), F4, F5, F6, F8 (7)
- Accepted: F7 (1)
- After the fixes: `npm run lint` 0, `npm run lint:ui` 0 (injected literal → 1), `npx astro check` 0/0/0. Smoke after the dev restart: 44/44 PASS (40 + 4 new). The fixes are not committed yet.

## Findings

### F1 — Smoke not re-verified: dev server broke after `astro check`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: plan.md:438 (Testing Strategy), scripts/smoke.mjs
- **Detail**: `npx astro check` ran Vite's dependency optimizer ("[optimizer] bundling dependencies...") while the user's `npm run dev` was up. The smoke run right after it got 500 on `/ingredients` from the first step on (23 FAIL, 14 PASS). The cascading `Nie znaleziono zamiennika.` errors follow from that: no substitute id could be parsed from 500 pages. The server then stopped accepting connections, and a second `npm run dev` did not start within 30 s. This is the same symptom as the "build breaks dev server" note. The plan calls `astro check` a "safe type check with dev running", and that does not hold here. Progress 3.4/4.4 record a green smoke at d75d56c/0c91b82. The code in `best.ts` is correct on reading (`errorFor` at :82 and :88).
- **Fix**: Restart `npm run dev`, then run `BASE_URL=http://localhost:4321 npm run smoke` before the push. Correct plan.md:438: `astro check` is not safe while dev is running.
- **Decision**: FIXED (plan.md:438 corrected; smoke re-run pending a dev restart by the user)

### F2 — Approved deviations not written back to plan.md

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence / Scope Discipline
- **Location**: plan.md:158-174, :234; src/components/ingredients/IngredientsFooter.astro; src/components/ui/focus.ts; src/pages/dev/kitchen-sink.astro:213
- **Detail**: Three tokens differ from the plan's table. `--ring` is orange-600 (plan: orange-500), `--success` is green-800 (plan: green-700), and `--destructive` is red-700 (plan: unchanged). The plan's mapping failed AA. theme-values.md:34 and a74b99a record this, with user approval. Sign-out moved from the header (outline) to the new `IngredientsFooter` (link variant). Only d75d56c records that. `focus.ts` (`focusRing`/`focusOutline`) is not in the plan. All of these are benign, but the plan is the source of truth for `/10x-archive` and S-04's re-review, and it still describes the old intent. Knock-on: the kitchen-sink sample is still labelled "Wyloguj się (outline)" (:213).
- **Fix**: Add a "Deviations" addendum to plan.md (ring/success/destructive with the AA reason, sign-out in footer, `IngredientsFooter`, `focus.ts`) and rename the kitchen-sink label.
- **Decision**: FIXED (`## Deviations` in plan.md; kitchen-sink sample renamed to "Oznacz jako najlepszy (outline)")

### F3 — `lint:ui` regex misses whole classes of literals

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: scripts/ui-literals.mjs:24-25
- **Detail**: The CI gate does not catch any of the following:
  - Prefixes outside `(bg|text|border|ring|outline|from|via|to|fill|stroke|shadow|divide)`: `border-t-red-500`, `ring-offset-stone-50`, `accent-orange-600`, `caret-*`, `decoration-*`, `placeholder-*`. `accent-*` is already used (`LookupForms.astro:25`).
  - Arbitrary values outside `-\[[0-9.]+(px|rem)\]`: `top-[-4px]`, `m-[13px_2px]`, `text-[length:13px]`, `h-[calc(100%-4px)]`, `size-[12PX]`.
  - The colour functions `lab()`, `lch()`, `hwb()`, `color-mix()`.

  It also gives false positives on hex-letter anchors (`href="#add-form"`). CLAUDE.md `## UI` presents the script as the guard. The regex is a 1:1 copy of the `/10x-ui` SKILL.md:124 scan, so widening it means diverging from the skill.
- **Fix A ⭐ Recommended**: Widen the regex in the script: prefixes `border(-[trblxyse])?|ring(-offset)?|accent|caret|decoration|placeholder|inset-shadow|inset-ring`, arbitrary values `-\[[^\]]*\d(px|rem)[^\]]*\]` with `i`, `lab|lch|hwb|color-mix`, hex `(?![-\w])`. Add a comment that the script is stricter than the skill scan.
  - Strength: the gate covers what CLAUDE.md promises; `accent-*` is a real case in this view.
  - Tradeoff: diverges from the skill's pattern; re-run on all guarded files is needed (today 0 hits).
  - Confidence: MED — the gaps were tested on sample strings, but the new pattern still needs a pass on the guarded files.
  - Blind spot: new false positives in kitchen-sink copy (e.g. text describing literals).
- **Fix B**: Keep the pattern identical to the skill and list the known gaps in a comment in `ui-literals.mjs`.
  - Strength: one source of truth for the scan; no change to the gate.
  - Tradeoff: the CI gate stays weaker than the CLAUDE.md rule it enforces.
  - Confidence: HIGH — no code change.
  - Blind spot: none significant.
- **Decision**: FIXED via Fix A (24/24 sample literals caught; anchors `#add-form`, `#ks-…`, `#substitute-…` no longer hits; `lint:ui` 0 on guarded files; injected literal → exit 1)

### F4 — Inherited `dark:` classes and missing `.dark` kitchen tokens

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ui/button.tsx:8,16 (via `buttonVariants({ variant: "outline" })`); src/styles/global.css `.dark`
- **Detail**: The new CLAUDE.md rule says "No `dark:` variants … in views and components", but every `outline` button in the view still renders `dark:bg-input/30 dark:border-input …` from `button.tsx`, which is out of scope. `.dark` has the `--success` placeholder but no `--kitchen-from/-via/-to`, so the gradient would stay light in dark mode. Neither is visible today because there is no toggle. Both are gaps the future dark-mode change has to know about.
- **Fix**: Add a comment in `.dark` for the `--kitchen-*` placeholders, and add a line to plan.md "What We're NOT Doing" (dark mode list) about the `dark:` classes inherited from `button.tsx`.
- **Decision**: FIXED (comment in `global.css` `.dark`; new item in the plan's dark-mode list)

### F5 — Card error not linked to its button; load errors without role

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ingredients/SubstituteCard.astro:53-65; src/pages/ingredients/index.astro:204, :222
- **Detail**: The card `Alert` is in the initial HTML, so screen readers often do not announce it. The `#substitute-<id>` anchor scrolls but does not move focus, and the "Oznacz jako najlepszy" button has no `aria-describedby` pointing to the error. The `loadError` and `substitutesError` alerts have no `role`, while the top and card errors use `role="alert"`.
- **Fix**: Give the card Alert `id="substitute-<id>-error"`, set `aria-describedby` on the button when `error` is set, and add `role="alert"` to the two load-error alerts.
- **Decision**: FIXED

### F6 — Focus ring on an invalid field drops to 20 % red

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ui/Input.astro:15, src/components/ui/NativeSelect.astro:16
- **Detail**: `aria-invalid:ring-destructive/20` comes after `focus-visible:ring-ring` (from `focusRing`) in Tailwind's variant order, so a focused invalid field shows a 20 % red ring, below 3:1. This is inherited from shadcn new-york. Today it is visible only in the kitchen-sink, because the view has no invalid fields. It will matter on the first form view that uses `aria-invalid` (`ingredients/new`).
- **Fix**: Change it to `aria-invalid:focus-visible:ring-destructive` (full opacity) in both components.
- **Decision**: FIXED

### F7 — Input border contrast ~1.4:1

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/styles/global.css `--input` (stone-300)
- **Detail**: Against `card`, the input border is about 1.4:1, while WCAG 1.4.11 asks for 3:1 for the visual boundary that identifies a control. Labels mitigate this, and the shadcn default has the same gap. `theme-values.md` does not measure this pair.
- **Fix**: Measure `input` on `card` in theme-values.md and decide: either accept it (labels identify every field) or move `--input` to stone-400 or stone-500.
  - Strength: an explicit, recorded decision instead of an unmeasured pair.
  - Tradeoff: a darker border changes the look of every field on the contract.
  - Confidence: MED — the ratio was estimated, not measured.
  - Blind spot: how stone-500 looks on the translucent `bg-card/70` container.
- **Decision**: ACCEPTED: stone-300 stays (measured 1,49:1; stone-400 2,59:1, stone-500 4,81:1). Every field has a visible Label, and the focus ring is full opacity. Recorded in theme-values.md "Otwarte punkty".

### F8 — Duplicate "Dodaj" CTA with zero ingredients

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ingredients/IngredientsHeader.astro, EmptyState in src/pages/ingredients/index.astro
- **Detail**: In the "no ingredients" state, both the header's "Dodaj składnik" and the empty state's "Dodaj pierwszy składnik" show. Two primary CTAs lead to the same target.
- **Fix**: Accept it (the header bar is constant across states), or switch the empty-state CTA to the `outline` variant so that only one primary button shows.
- **Decision**: FIXED (`EmptyState` CTA is `outline` in all empty states; the header CTA is the only primary)
