---
change_id: ingredients-new-ui
title: Ingredients new UI
status: implementing
created: 2026-10-22
updated: 2026-10-23
archived_at: null
---

## Notes

Zmiana UI przez `/10x-ui`. Nie jest slice'em z roadmapy.

- **Widok:** `src/pages/ingredients/new.astro`, formularz „Dodaj zamiennik”. Tylko ten jeden widok.
- **Źródło tokenów:** `src/styles/global.css` (`:root` / `.dark` → `@theme inline`); komponenty z `src/components/ui/` (`Input`, `Label`, `NativeSelect`, `Textarea`, `Card`, `Alert`, `buttonVariants` + `focusRing`/`focusOutline`).
- **Wariant kontraktu:** istniejący design system. Widok nie czyta jeszcze ani tokenów, ani komponentów: 0 klas tokenowych, 0 importów z `ui/`, 23 trafienia skanu literałów.
- **Wstępne zarzuty z pre-auditu (2026-10-22):**
  1. literały kolorów: `orange-600` jako drugi „primary”, `red-*` zamiast `destructive`;
  2. ręcznie zbudowane pola, błąd, przycisk i karta zamiast `ui/`; `maxlength` na sztywno zamiast `MAX_*`;
  3. jedyne wyjście prowadzi na `/dashboard`, a nie z powrotem do widoku listy;
  4. błąd nie jest powiązany z polem.
- **Follow-up F1 z S-04** (`context/archive/2026-10-17-edit-entries/follow-ups/review-fixes.md`): `error_field` z `/api/ingredients`, żeby oznaczyć pole z błędem. Przeniesienie tego na `SubstituteEditForm` to drugi widok; research i plan zdecydują, czy wchodzi tu, czy zostaje deferred.
- **Poza zakresem:** `dashboard.astro` (też ma literały, osobna zmiana).
- **Dopisane do planu 2026-10-23 (prośba użytkownika):** wybór istniejącego składnika z listy. Jedno pole „Składnik” z natywnym `<datalist>` zapisanych składników i etykietą „Istniejący składnik” / „Nowy składnik” (mały `<script>`, ta sama reguła `name_key` co serwer). Faza 1, bez zmian w API; 2 nowe kroki smoke. Odrzucone: przełącznik „Z listy / Nowy” i select z „+ Nowy…” (zmiana API, brak wyszukiwania), combobox w React.
- **Faza 1, krok 1.10 (2026-10-23):** sprawdzone w Chrome/Edge i na telefonie, bez Firefoksa (nie zainstalowany). Fallback z planu (usunąć `autocomplete="off"` z pola „Składnik”, jeśli Firefox nie pokaże listy) pozostaje niezweryfikowany.
