---
change_id: ingredients-list-ui
title: Ingredients list ui
status: implementing
created: 2026-10-19
updated: 2026-10-19
archived_at: null
---

## Notes

UI change started with `/10x-ui` (Module 2, Lesson 5).

- **View (one):** `src/pages/ingredients/index.astro` (`/ingredients`, the main list after login).
- **Token source:** `src/styles/global.css` (`:root` / `.dark` values, published through `@theme inline`). Components: `src/components/ui/` (shadcn, new-york).
- **Contract variant (to confirm in research):** a fresh starter with a dead token file. The tokens hold the shadcn neutral defaults and the view reads none of them. The app's real motif (warm stone, orange and amber) lives only in literals. Working assumption: map that motif onto the existing variable names so the look stays the same and the view starts reading tokens. Do not run a second `shadcn init`.
- **Dark mode:** N/A. The app has no toggle anywhere.

### Pre-audit (2026-10-19)

- Hardcoded-value scan on the view: 52 hits on 30 lines (`text-stone` 12, `bg-orange` 7, `text-black` 6, `bg-white` 5, red/green for messages, one arbitrary `md:grid-cols-[1fr_auto_1fr]`). `Layout.astro`: 0.
- Token classes used in the view: 0. Imports from `components/ui`: 0. Only `auth/SubmitButton.tsx` uses `ui/button`.
- `bg-kitchen` (`global.css:113`) is a hex gradient with no role name.
- Agent rules: `CLAUDE.md` only (`AGENTS.md` points to it). It has no rule inviting one-off values and no tokens rule. `lessons.md` has a rule on `class:list` vs `cn()`.

### Audit brief for /10x-research

Run the two-way audit (source → views, view → source) and write 3–5 charges under `## Charges` in `research.md`. Each charge gets a file:line and one sentence on the effect on the user. Candidates to verify:

1. **Missing tokens:** class constants at `index.astro:161-177` and the best card/badge (`:175`, `:379-382`) use palette classes; no role tokens.
2. **Missing shared component:** `submitClass` / `ctaClass` / `markButtonClass` (`:164-177`) are three button styles beside `ui/button`. Inputs, labels, cards and messages are class strings, not components (Input, Label, Card, Alert, Badge?). Open question: can `ui/button.tsx` (React) be rendered static in `.astro` inside a form POST, or is an Astro-side variant better?
3. **focus-visible:** inputs use `focus:ring-orange-400` (`:162`) instead of `focus-visible` + `ring` token. CTAs and links fall back to the base `outline-ring/50` (neutral grey, 50 %), which shows up weakly on orange.
4. **Accidental architecture:** with data, the list has no way to add an entry (CTAs exist only in empty states). The only navigation is "Wróć do panelu" (`:419-423`), and there is no header or sign-out. The starter's dashboard acts as the hub.
5. Check the 7-state matrix against today's view (loading is likely N/A because rendering is SSR with full-page GET forms; confirm).

Out of scope: other views (`ingredients/new`, dashboard, auth, landing) keep their literals in this change; they get their own changes. S-04 (`edit-entries`) is parked until this lands.
