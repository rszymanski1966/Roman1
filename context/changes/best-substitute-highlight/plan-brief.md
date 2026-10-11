# Best Substitute Highlight — Plan Brief

> Full plan: `context/changes/best-substitute-highlight/plan.md`

## What & Why

Użytkownik oznacza jeden zamiennik jako „najlepszy" dla pary składnik + kategoria i widzi go wyróżnionego na liście. To reguła biznesowa z PRD (FR-003, US-01, Business Logic), która odróżnia narzędzie od płaskiej listy i domyka kryterium Primary razem z S-01 i S-03.

## Starting Point

Po S-01 i unique-substitutes zamienniki wiszą na parze składnik–kategoria i są wyświetlane na `/ingredients` od najstarszego. Tabela `substitutes` ma tylko polityki SELECT/INSERT, a projekt nie ma jeszcze funkcji SQL.

## Desired End State

Najlepszy zamiennik stoi na górze listy z plakietką „Najlepszy" i pomarańczową ramką. Można go oznaczyć przyciskiem na liście albo checkboxem przy dodawaniu, a także zdjąć oznaczenie. Gdy nowe oznaczenie zastępuje poprzednie, lista pokazuje „Najlepszy zamiennik zmieniony: X → Y."

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Zakres „najlepszego" | Para składnik + kategoria | Dosłowne „jeden na kategorię" dałoby jedno wyróżnienie na wszystkie składniki w Ciastach. |
| Gdy jest już najlepszy | Automatyczna zamiana | Jedno kliknięcie; cofnięcie to ponowne oznaczenie poprzedniego. |
| Informacja o zamianie | Komunikat po zapisie (`?notice=`) | Ta sama droga co `?error=`, bez JS po stronie klienta. |
| Zdjęcie oznaczenia | Dozwolone (zero lub jeden) | PRD mówi o „opcjonalnym oznaczeniu"; pozwala cofnąć pomyłkę. |
| Gdzie oznaczać | Lista + checkbox w formularzu | Pokrywa oznaczenie przy rejestracji (PRD Primary) i późniejszą zmianę zdania. |
| Kolejność listy | Najlepszy na górze, reszta od najstarszego | PRD: „uporządkowana lista z jedną pozycją rekomendowaną". |
| Model danych | `is_best` + indeks częściowy + funkcja SQL `set_best_substitute` | Zamiana atomowa, regułę pilnuje baza, RLS działa (security invoker). |
| Wygląd | Plakietka „Najlepszy" + pomarańczowa ramka | Czytelne także bez rozróżniania kolorów. |
| Testy | pgTAP + kroki smoke | Reguła i izolacja w bazie, przepływ end-to-end w smoke, jak w poprzednich zmianach. |

## Scope

**In scope:**
- Kolumna `is_best`, indeks częściowy, polityka UPDATE tylko dla `is_best`, funkcja zamiany
- Endpoint `POST /api/substitutes/best`, wyróżnienie, przyciski i komunikaty na liście
- Checkbox „Najlepszy" w formularzu dodawania
- Test pgTAP, kroki smoke, migracja produkcyjna i PR

**Out of scope:**
- „Najlepszy" na całą kategorię i kontekst przygotowania
- Potwierdzenie przed zamianą, komunikaty przy oznaczeniu bez poprzednika i przy zdjęciu
- Edycja pozostałych pól (S-04), wyszukiwanie (S-03), usuwanie (S-05), React

## Architecture / Approach

Baza jest źródłem prawdy: `substitutes.is_best` z unikalnym indeksem częściowym na `ingredient_category_id where is_best`. Funkcja `set_best_substitute(p_substitute_id, p_is_best)` (security invoker) w jednej transakcji zdejmuje poprzedniego najlepszego, ustawia nowego i zwraca nazwę zastąpionego. Woła ją serwis `setBestSubstitute`, używany przez endpoint listy i przez `addSubstitute` (insert, potem oznaczenie). API przekierowuje na listę z `?notice=` albo `?error=`. Grant UPDATE obejmuje tylko kolumnę `is_best`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza | Kolumna, indeks, polityka, funkcja, test pgTAP | Kolejność UPDATE-ów w funkcji (najpierw zdjęcie, potem ustawienie) |
| 2. Lista | Wyróżnienie, przyciski, endpoint, komunikaty, smoke | Klasy karty muszą iść przez `cn()` (lekcja) |
| 3. Formularz | Checkbox „Najlepszy" przy dodawaniu, smoke | Dodanie i oznaczenie to dwa wywołania; błąd oznaczenia musi być czytelny |
| 4. Wydanie | `db push` na produkcję, PR do `main` | Merge przed migracją wywoła błędy na produkcji |

**Prerequisites:** S-01 i unique-substitutes w `main` (są); lokalny Supabase działa.
**Estimated effort:** ~1–2 sesje w 4 fazach.

## Open Risks & Assumptions

- Dodanie z checkboxem nie jest atomowe: przy błędzie oznaczenia zamiennik zostaje zapisany bez wyróżnienia, a użytkownik widzi komunikat na liście.
- `?notice=` (jak `?error=`) przyjmuje dowolny tekst z URL; Astro go escapuje, ryzyko akceptujemy dla spójności z konwencją.
- S-04 musi rozszerzyć grant UPDATE o pozostałe kolumny i nie ruszać `is_best` przy edycji.

## Success Criteria (Summary)

- Na liście pary widać najwyżej jeden wyróżniony zamiennik, zawsze na górze.
- Zmiana najlepszego to jedno kliknięcie i jasny komunikat, co zostało zastąpione.
- Cudzego zamiennika nie da się oznaczyć (pgTAP + smoke).
