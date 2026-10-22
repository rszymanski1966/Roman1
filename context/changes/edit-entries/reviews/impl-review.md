<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edycja wpisów (S-04)

- **Plan**: context/changes/edit-entries/plan.md
- **Scope**: Full plan (3.10 — db push na prod i sprawdzenie po deployu — z natury po merge, pending)
- **Reviewed phases**: 1, 2, 3
- **Date**: 2026-10-22
- **Verdict**: APPROVED
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | WARNING |
| Success Criteria | PASS |

Success criteria (2026-10-22, HEAD da67a20): `npm run lint` PASS, `npm run lint:ui` PASS, `npx supabase test db` PASS (4 pliki, 47 testów), smoke PASS (55/55). `npx astro check` (0 błędów) i `npm run build` (uruchomiony przez użytkownika, chunki edit-ingredient/rename w `dist/`) przeszły dziś na tym samym kodzie przy commicie fazy 3. Manual 1.4, 2.6–2.9, 3.7–3.9 potwierdzone przez użytkownika; 3.10 pending (po merge).

Drift: brak DRIFT i MISSING; każdy punkt Contract z faz 1–3 i lista „What We're NOT Doing” zgodne z kodem.

## Findings

### F1 — Błąd zapisu w formularzach edycji nie jest powiązany z polem

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ingredients/IngredientRenameForm.astro:40-62; src/components/ingredients/SubstituteEditForm.astro:42-93
- **Detail**: Po błędzie zapisu komunikat jest tylko w `<Alert role="alert">` nad formularzem. Żadne pole nie dostaje `aria-invalid` ani `aria-describedby` wskazującego na komunikat, choć `Input`/`Textarea` mają styl `aria-invalid`, a `SubstituteCard.astro:77` w tym samym obszarze wiąże błąd karty przez `aria-describedby={error ? errorId : undefined}`. `role="alert"` obecny już przy ładowaniu strony (po redirect) bywa nieogłaszany. Plan tego nie wymagał; `new.astro` ma ten sam brak.
- **Fix**: W formularzu zmiany nazwy (jedno pole, więc błąd zawsze dotyczy nazwy) nadać `Alert` id i przy `error` ustawić na input `aria-invalid="true"` oraz `aria-describedby="<hintId> <errorId>"`. Formularz zamiennika zostawić bez zmian — wskazanie pola wymaga parametru typu `error_field` z endpointu (follow-up).
- **Decision**: FIXED (2026-10-22) — `IngredientRenameForm.astro`: Alert ma `id`, przy błędzie input dostaje `aria-invalid="true"` i `aria-describedby="<hint> <error>"`. Formularz zamiennika → follow-up w `follow-ups/review-fixes.md`.

### F2 — Adaptacje implementacji nie są zapisane w planie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: context/changes/edit-entries/plan.md (brak sekcji Deviations)
- **Detail**: Kod zawiera nieszkodliwe dodatki spoza planu: formularze wydzielone do `SubstituteEditForm.astro` i `IngredientRenameForm.astro` (dla stanów w kitchen-sink); `setListViewParams` i `parseListView` przyjmujący także `URLSearchParams` (`src/lib/list-view.ts:45-50`); `getSubstituteForEdit` zwraca błąd ogólny przy brakującym embedzie (`substitutes.ts:325`); widok zapasowy na stronach edycji zachowuje `q`/`match` z URL; sekcja stanów Textarea w kitchen-sink; pgTAP oczekuje `428C9` zamiast `42501` dla `name_key` (plan na to pozwalał); `src/types.ts` bez zmian w fazie 3. Plan jest źródłem prawdy dla archiwum i kolejnych review, a tych decyzji w nim nie ma.
- **Fix**: Dopisać do plan.md krótką sekcję „Deviations” (przed `## Progress`) z tymi punktami, jak w ingredients-list-ui.
- **Decision**: FIXED (2026-10-22) — sekcja `## Deviations` w plan.md przed `## Progress`.

### F3 — Grant UPDATE na ingredients.name_key pozwala zapisać klucz niezgodny z nazwą

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: supabase/migrations/20261021120000_edit_entries.sql:31
- **Detail**: `grant update (name, name_key) on public.ingredients to authenticated` umożliwia zalogowanemu użytkownikowi bezpośredni PATCH przez PostgREST z `name_key` niezgodnym z `name` (baza nie sprawdza `name_key = lower(name)` ani `normalizeName`). Skutek dotyczy wyłącznie własnych danych (polityka `ingredients_update_own`): zła kolejność listy (sortowanie po `name_key`), a `addSubstitute` (`substitutes.ts:118-128`) może nie znaleźć składnika i utworzyć duplikat nazwy. Luka nie jest nowa — INSERT z S-01 już pozwala na dowolny `name_key`. Plan świadomie wyłączył check w bazie („What We're NOT Doing”, zgodnie z lekcją name_key).
- **Fix A ⭐ Recommended**: Zaakceptować w S-04 i zapisać follow-up: trigger BEFORE INSERT/UPDATE ustawiający `name_key := lower(name)` albo konwersja na kolumnę generowaną (zgodnie z lekcją), wtedy `name_key` znika z grantu i z payloadów aplikacji.
  - Strength: Zgodne z decyzją planu; S-04 zamyka się bez zmiany migracji przed db push; ryzyko ogranicza się do własnych danych użytkownika.
  - Tradeoff: Niespójność możliwa (tylko celowo, spoza UI) do czasu follow-upu.
  - Confidence: HIGH — RLS i testy B potwierdzają izolację; luka istniała przez INSERT od S-01.
  - Blind spot: Czy `lower()` w Postgresie daje to samo co `toLocaleLowerCase("pl")` dla wszystkich znaków (ważne przy migracji danych na kolumnę generowaną).
- **Fix B**: Dodać teraz nową migrację z triggerem `name_key := lower(name)` na INSERT/UPDATE i zawęzić grant do `(name)`, przed db push na prod.
  - Strength: Zamyka niespójność już w tym slice, zanim kod trafi na prod.
  - Tradeoff: Wychodzi poza plan („nie robimy checku name_key”), wymaga nowych testów pgTAP i zmiany serwisu; ryzyko rozjazdu `lower()` vs `toLocaleLowerCase("pl")` na istniejących danych.
  - Confidence: MED — wymaga sprawdzenia zgodności lowercase na danych prod.
  - Blind spot: Nie sprawdzono danych prod pod kątem rozjazdu kluczy.
- **Decision**: ACCEPTED via Fix A (2026-10-22) — akceptacja w S-04; follow-up (trigger albo kolumna generowana dla `name_key`) w `follow-ups/review-fixes.md`.

### F4 — `rows={3}` w Textarea nie działa przy `field-sizing-content`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ui/Textarea.astro:15; src/components/ingredients/SubstituteEditForm.astro:92
- **Detail**: Klasa `field-sizing-content` (z shadcn new-york) sprawia, że w przeglądarkach ją wspierających wysokość wynika z treści (minimum `min-h-16`), więc `rows={3}` nie ma efektu. Zachowanie zgodne z upstream.
- **Fix**: Bez zmian; jeśli puste pole ma być wyższe, użyć `min-h-*` zamiast `rows`.
- **Decision**: ACCEPTED (2026-10-22) — bez zmian w kodzie, zachowanie zgodne z upstream shadcn; wyższe puste pole → `min-h-*`, nie `rows`.
