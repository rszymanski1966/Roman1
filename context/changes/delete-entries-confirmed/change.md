---
change_id: delete-entries-confirmed
title: Usuwanie wpisów z potwierdzeniem
status: implemented
created: 2026-10-24
updated: 2026-10-28
archived_at: null
---

## Notes

Slice S-05 z roadmapy (FR-007): użytkownik usuwa własny składnik albo zamiennik. Usunięcie składnika kasuje kaskadowo jego zamienniki, po jawnym potwierdzeniu.

Do uwzględnienia (ustalone wcześniej):

- **Ryzyko z roadmapy (review S-02, F1):** po dodaniu polityki DELETE na `substitutes` funkcja `set_best_substitute` musi czytać wiersz przez `select … for update`. Inaczej usunięcie w trakcie zamiany da fałszywy sukces.
- **Follow-up F3 z `ingredients-new-ui`** (`context/archive/2026-10-22-ingredients-new-ui/follow-ups/review-fixes.md`): duplikat w `/api/ingredients` i `api/substitutes/update` jest rozpoznawany po treści komunikatu. Przy zmianie serwisu zamienników dodać kod błędu do `ServiceResult` (np. `code: "duplicate"`).
- **Nowe widoki** (np. potwierdzenie usunięcia) budować z komponentów `ui/` i dopisać do `GUARDED` w `scripts/ui-literals.mjs` oraz do kitchen-sink (`CLAUDE.md`, `## UI`).
