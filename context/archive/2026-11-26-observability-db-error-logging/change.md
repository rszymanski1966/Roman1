---
change_id: observability-db-error-logging
title: Observability db error logging
status: archived
created: 2026-11-26
updated: 2026-11-27
archived_at: 2026-11-27T07:14:35Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

Znaleziska z audytu `context/audits/observability/2026-11-26_auth-writes-lookup.md` (§5) zamknięte przez ten change — punkt odniesienia dla `/10x-observability-audit --verify`:

- **W1** — każda z 17 gałęzi błędu PostgREST w `src/lib/services/substitutes.ts` loguje `logDbError` (operacja, `code` albo `network` przy statusie 0, status, `message`, `hint`, uuid encji; bez `details`).
- **W2 częściowo (tylko log)** — kroki `addSubstitute` mają nazwy w logu (`addSubstitute.categoryLookup`, `.ingredientUpsert`, `.ingredientSelect`, `.pairUpsert`, `.pairSelect`, `.substituteInsert`); brak transakcji zostaje (jedno RPC poza zakresem).
- **W3** — nieudane oznaczenie „najlepszego” po insercie: przyczynę loguje raz `setBestSubstitute`, a częściowy wynik — warn `addSubstitute.markBest: saved_without_best_mark` z `substituteId`.
- **W4** — 0 wierszy w `updateSubstitute`, `renameIngredient`, `deleteSubstitute`, `deleteIngredient` → `logExpected(..., "not_found")` (warn) z uuid.
- **W5** — niezmapowane kody z RPC `set_best_substitute` → `logDbError`; pusty wynik RPC → `logInvariant`; P0002 → warn `not_found`.
- **W7** — `getSubstituteForEdit` z brakującą parą, składnikiem albo kategorią → `logInvariant` z nazwą relacji i `substituteId`.
- **L2** — para z zamiennikami bez kategorii w `listIngredientSubstitutes` → `fail()` i `logInvariant` zamiast cichego pominięcia grupy.
- **L1 (część logująca)** — gałęzie odczytu logują przez `logDbError`; status 503 na stronach zostaje (fix nr 5).
- **L5 (nazwa operacji)** — każda linia nazywa operację; kod referencyjny w komunikacie dla użytkownika zostaje poza zakresem.
- **F2** (`context/archive/2026-11-21-testing-validation-and-gates/follow-ups/review-fixes.md`) — potwierdzony audytem (→ W1) i zamknięty tym samym logiem.

Dowód: `tests/unit/db-error-logging.test.ts` (prawdziwy supabase-js, podstawiony `fetch`) i `tests/services/db-error-logging.test.ts` (prawdziwe 42501, `not_found` i duplikat na lokalnym stosie). Bez zmian: W6, W8, L3, L4, L6 i znaleziska auth (fix nr 2 i dalsze).
