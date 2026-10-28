<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Usuwanie wpisów z potwierdzeniem (S-05)

- **Plan**: context/changes/delete-entries-confirmed/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-10-28
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 5 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Kryteria sukcesu

- Ponownie na HEAD (5f62c0b): `npm run lint` PASS, `npm run lint:ui` PASS, grep `=== duplicateSubstituteMessage(` w `src/` 0 trafień, `npx supabase test db` PASS (5 plików, 65 testów), `pg_policies` z `ingredients_delete_own` i `substitutes_delete_own` (DELETE), `has_table_privilege('anon', …, 'DELETE')` = `f` na 4 tabelach.
- Smoke, `npx astro check` (0 błędów) i `npm run build` przeszły w tej samej sesji na kodzie identycznym z HEAD (po bramkach zmieniły się tylko `plan.md` i `change.md`).
- Manual: wszystkie wiersze `[x]` z SHA. 4.7 (deliberate break) wykonany w sesji: 11 zepsutych oczekiwań dało dokładnie 11 FAIL, osobno zepsute „2 zamienniki” dało 1 FAIL; plik przywrócony i porównany z kopią. 4.8 i 4.9 potwierdził użytkownik.

## Findings

### F1 — Myląca nazwa kroku smoke „account A has no ingredients left”

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:891-895
- **Detail**: Krok sprawdza tylko notice „Usunięto składnik”, a pusty stan sprawdza następny krok. Przy awarii nazwa wskaże zły objaw.
- **Fix**: Zmienić nazwę na „account A sees the delete notice on the bare list”.
- **Decision**: FIXED — krok przemianowany na „account A sees the delete notice on the bare list” (scripts/smoke.mjs:892).

### F2 — Potwierdzenie pokazuje stan z chwili GET, kaskada usuwa stan z chwili POST

- **Severity**: 💡 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: src/pages/ingredients/delete-ingredient.astro:37-50, src/pages/api/ingredients/delete.ts:57
- **Detail**: Zamiennik dodany w innej karcie między wyświetleniem potwierdzenia a POST zniknie, choć licznik go nie pokazał. Dotyczy tylko własnych danych (RLS), nie da się tego wykorzystać między kontami. To cecha wzorca „strona potwierdzenia + POST”.
- **Fix A ⭐ Recommended**: Zaakceptować jako ograniczenie wzorca
  - Strength: Zgodne z planem (jedno DELETE po kluczu, bez JS); scenariusz wymaga dwóch kart tego samego użytkownika.
  - Tradeoff: Teoretyczna utrata świeżo dodanego zamiennika bez jego wymienienia.
  - Confidence: HIGH — MVP jednoosobowy, brak współdzielenia danych.
  - Blind spot: None significant.
- **Fix B**: Wysłać w formularzu liczbę zamienników i odrzucić usunięcie, gdy się nie zgadza
  - Strength: Zgoda dokładnie na pokazany zasięg.
  - Tradeoff: Dodatkowy odczyt i nowa gałąź błędu w endpoincie, nowy krok smoke; wyścig dalej możliwy między liczeniem a DELETE bez transakcji/RPC.
  - Confidence: MED — pełna gwarancja wymagałaby funkcji w bazie.
  - Blind spot: Nie sprawdzono, czy warto to robić przed kolejnym slice'em.
- **Decision**: ACCEPTED — Fix A: ograniczenie wzorca „strona potwierdzenia + POST”; MVP jednoosobowy, wymaga dwóch kart tego samego użytkownika.

### F3 — `hasSearchHits` czyta wszystkie składniki użytkownika

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/lib/services/substitutes.ts:464-481 (wywołanie: src/pages/api/ingredients/delete.ts:74)
- **Detail**: Po usunięciu z `q` endpoint czyta pełną listę składników (i filtr kategorii), a strona docelowa czyta ją jeszcze raz. To ten sam nieograniczony odczyt, który `index.astro` robi przy każdym renderze, więc to nie regresja. Plan to przewidział (Performance Considerations).
- **Fix**: Bez zmian teraz. Przy wzroście liczby składników przenieść dopasowanie nazw do SQL (np. `ilike` po kluczu nazwy) dla obu miejsc.
- **Decision**: ACCEPTED — bez zmian teraz; przy wzroście liczby składników przenieść dopasowanie nazw do SQL (`ilike`) w `hasSearchHits` i `index.astro`.

### F4 — Błąd `hasSearchHits` zostawia wyszukiwanie w redirect

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/api/ingredients/delete.ts:75-79
- **Detail**: Gdy sprawdzenie trafień zawiedzie, użytkownik może zobaczyć „Nie znaleziono składnika” obok komunikatu o udanym usunięciu. Zachowanie jest zgodne z kontraktem planu i skomentowane (usunięcie już się udało).
- **Fix**: Zaakceptować bez zmian.
- **Decision**: ACCEPTED — bez zmian; zachowanie zgodne z kontraktem planu i skomentowane.

### F5 — Drobne dodatki spoza planu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: src/lib/services/substitutes.ts:94; scripts/smoke.mjs:773-778; src/pages/ingredients/index.astro:289-307
- **Detail**: (1) `duplicateSubstituteMessage` przestał być eksportowany (nie ma innych konsumentów). (2) Dodatkowy krok smoke: B widzi „Nie znaleziono składnika.” na stronie potwierdzenia bez formularza. (3) Linki „Zmień nazwę” i „Usuń składnik” w osobnym wrapperze `flex flex-wrap` (także w kitchen-sink). Wszystkie zgodne z intencją planu.
- **Fix**: Zaakceptować; ewentualnie dopisać jako addendum w planie.
- **Decision**: FIXED — zaakceptowane i dopisane jako addendum w plan.md (sekcja „Addendum (impl-review 2026-10-28, F5)”).
