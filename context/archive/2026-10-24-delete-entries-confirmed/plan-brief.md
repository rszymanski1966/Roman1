# Usuwanie wpisów z potwierdzeniem (S-05) — Plan Brief

> Full plan: `context/changes/delete-entries-confirmed/plan.md`
> Research: `context/changes/delete-entries-confirmed/research.md`

## What & Why

Zalogowany użytkownik usuwa własny zamiennik albo własny składnik. Składnik znika razem ze wszystkimi zamiennikami we wszystkich kategoriach (FR-007). Baza zamienników jest budowana ręcznie i nie ma kopii zapasowej, więc każde usunięcie wymaga jawnego potwierdzenia, które pokazuje, co zniknie („potwierdzenie jest częścią wymagania, nie ozdobą”, roadmapa S-05).

## Starting Point

Kaskada FK `ingredients → ingredient_categories → substitutes` już istnieje. Brakuje polityk RLS `DELETE`: dziś usunięcie po cichu zwraca 0 wierszy. `set_best_substitute` czyta wiersz bez blokady (F1). Endpointy rozpoznają duplikat po treści komunikatu (F3). Wariant `destructive` przycisku łamie kontrakt tokenów.

## Desired End State

Karta zamiennika ma link „Usuń”, a nagłówek składnika link „Usuń składnik”. Oba prowadzą na stronę potwierdzenia SSR. Zamiennik: która para i czy to najlepszy. Składnik: liczba zamienników per kategoria, zawsze ze wszystkich kategorii. Po usunięciu zamiennika użytkownik wraca do tego samego widoku, po usunięciu składnika do wyników wyszukiwania (gdy dalej coś znajdują) albo na gołą listę, w obu przypadkach z komunikatem. Cudzy albo już usunięty wpis daje „Nie znaleziono …”, nigdy fałszywy sukces.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Potwierdzenie dla zamiennika | Tak, ta sama ścieżka co składnik | Jeden wzorzec i żadnej przypadkowej utraty ręcznie wpisanych proporcji i uwag. | Plan |
| Forma potwierdzenia | Osobna strona SSR + POST | Wzorzec stron edycji z S-04, działa bez JS (S-02 odrzuciło okna ze skryptem). | Plan / Research |
| Treść potwierdzenia składnika | Liczba per kategoria, wszystkie kategorie | Kaskada wykracza poza kategorię widoku i użytkownik musi to zobaczyć. | Plan |
| Powrót po usunięciu składnika | Do wyników `q`, gdy dalej coś znajdują (`hasSearchHits`); inaczej goła lista | Zachowuje kontekst wyszukiwania i omija mylące „Nie znaleziono” tuż po usunięciu jedynego trafienia. | Plan / Research / Plan review F2 |
| Przycisk destrukcyjny | Nowy token `--destructive-foreground` + poprawiony wariant | Domyka kontrakt UI na poziomie systemu zamiast obchodzić go w widoku. | Plan |
| Wejścia do usuwania | Karta + nagłówek na liście | Akcja stoi przy wpisie, jak edycja z S-04. | Plan |
| Zakres migracji | Polityki DELETE, `for update`, revoke `anon`, 3 indeksy FK | F1 jest obowiązkowe, revoke `anon` to obrona w głąb, indeksy zamykają odłożone F7. | Research / Plan |
| Puste pary po ostatnim zamienniku | Zostają | Widoki je pomijają, a sprzątanie dodałoby logikę i wyścig z dodawaniem. | Plan |
| Brak wpisu przy POST | Błąd „Nie znaleziono …” | Spójne z S-04, cudzy id nie dostaje „Usunięto”. | Plan |
| F3 | `code: "duplicate" \| "not_found"` w `ServiceResult` | Endpointy przestają zależeć od treści komunikatów. | Research |
| Testy | pgTAP + smoke + ręczny test blokady w 2 sesjach psql | Blokady F1 nie sprawdzi test w jednej sesji. | Plan |

## Scope

**In scope:**
- migracja: polityki DELETE (`ingredients`, `substitutes`), `set_best_substitute` z `for update`, revoke `DELETE` dla `anon`, 3 indeksy FK;
- `ServiceResult.code`, `deleteSubstitute`, `deleteIngredient`, `substituteCount`, `searchRedirect`;
- dwie strony potwierdzenia, dwa endpointy, linki na liście;
- token `--destructive-foreground` i wariant `destructive`;
- `GUARDED`, kitchen-sink (przycisk, widoki, matryca 7 stanów), pgTAP `delete-entries.sql`, kroki smoke.

**Out of scope:**
- sprzątanie pustych par, usuwanie ze stron edycji, usuwanie zbiorcze, kosz i cofnięcie;
- JS, `confirm()`, `<dialog>`;
- przegląd innych wariantów przycisku i strojenie dark mode;
- automatyczny test współbieżności.

## Architecture / Approach

Lista → GET `/ingredients/delete-{substitute|ingredient}` (komponent `*DeleteConfirm.astro`, odczyt przez RLS, stan „nie znaleziono”) → POST `/api/{substitutes|ingredients}/delete` → serwis `delete().eq(id).select().maybeSingle()` (0 wierszy daje `not_found`) → redirect. Zamiennik wraca przez `listRedirect(view)`, składnik przez `searchRedirect(view)`. Kaskada działa w bazie przez FK z pominięciem RLS tabel podrzędnych. `for update` w `set_best_substitute` serializuje oznaczanie z usuwaniem.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza | Polityki DELETE, `for update`, revoke `anon`, indeksy FK, pgTAP, ręczny test blokady | `for update` wymaga grantu i polityki UPDATE: są, ale zweryfikować testem |
| 2. Serwis i kontrakt błędów | `code` w `ServiceResult` (F3), funkcje usuwania, `searchRedirect` | Przepięcie `error_field` bez zmiany zachowania (pilnują kroki smoke duplikatu) |
| 3. Usuwanie zamiennika | Token i wariant `destructive`, strona, endpoint, link w karcie, kitchen-sink, smoke | Kontrakt smoke na markup karty, kontrast w obu motywach |
| 4. Usuwanie składnika | Strona z licznikiem, endpoint z powrotem do wyszukiwania, link, kitchen-sink, smoke | Kolejność kroków smoke: usunięcia A po wszystkich użyciach i krokach B |

**Prerequisites:** lokalny Supabase uruchomiony (`npx supabase start`), migracje do `20261021120000` zastosowane. Na prod `npx supabase db push` przed merge.
**Estimated effort:** ~3–4 sesje w 4 fazach; fazy 3 i 4 są największe.

## Open Risks & Assumptions

- Zakładamy READ COMMITTED (domyślne w Supabase). Zachowanie blokady sprawdza ręczny test, nie automat.
- Smoke nie działa w CI. Regresje kroków usuwania wychwyci tylko lokalne uruchomienie.
- Wartości `--destructive-foreground` w `.dark` nie są dostrojone (dark mode odłożony), sprawdzamy tylko kontrast AA.

## Success Criteria (Summary)

- Użytkownik usuwa zamiennik i składnik wyłącznie po stronie potwierdzenia, która mówi, co zniknie, i wraca do sensownego widoku z komunikatem.
- Konto B nie usunie niczego z konta A, a ponowny albo cudzy POST daje „Nie znaleziono …”.
- `set_best_substitute` nie zgłasza sukcesu dla zamiennika usuniętego w trakcie operacji.
