# Follow-ups from impl-review (2026-11-24)

Source: `context/changes/testing-validation-and-gates/reviews/impl-review.md`.

## For `/10x-observability-audit` (F2, F6)

Run the audit on the critical flows (sign-in and sign-up; adding, editing and deleting ingredients and substitutes). Fix what it finds through a new change, failing test first, per CLAUDE.md "Never hide the evidence".

- **F2: DB errors in the services are dropped.** In `src/lib/services/substitutes.ts`, every DB error branch returns a bare `fail()` with the generic message and discards the PostgREST error. That includes the category check added in Phase 3. The constraints from migration `20261123120000_name_invariants.sql` make this matter: a 23514 on save, for example from the `toLocaleLowerCase("pl")` vs `lower()` mismatch in test-plan §7, leaves no trace in the Worker logs. Check the other services in `src/lib/services/` too. Proposed fix from the review: a helper that logs `console.error(new Error(..., { cause: error }))` with the error code and no user data, then returns `fail()`.
- **F6: silent failures in the endpoints.**
  - An empty `catch {}` around `formData()` in `src/pages/api/ingredients.ts`, `ingredients/delete.ts`, `ingredients/rename.ts`, `substitutes/best.ts`, `substitutes/delete.ts` and `substitutes/update.ts`. The auth endpoints already log the cause and only the Content-Type: use that pattern.
  - In `src/pages/api/auth/signin.ts` and `signup.ts`, a GoTrue error such as an outage (no status, or 5xx) is redirected the same way as a wrong password, with no log. Log the cause when `error.status` is missing or ≥ 500, never the e-mail or password.
