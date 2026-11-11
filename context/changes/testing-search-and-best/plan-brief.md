# Faza 2 test-planu: wyszukiwanie i „najlepszy” — Plan Brief

> Full plan: `context/changes/testing-search-and-best/plan.md`
> Research: `context/changes/testing-search-and-best/research.md`

## What & Why

Faza 2 rolloutu z `context/foundation/test-plan.md` zabezpiecza najczęściej zmieniany obszar:

- **ryzyko #4:** wyszukiwanie po nazwie gubi albo miesza wyniki, źle łączy tryb, ciasteczko i filtr kategorii, albo pokazuje zły stan pusty;
- **ryzyko #6:** oznaczenie „najlepszy” jest błędne — dwa w parze, utracone bez akcji użytkownika, albo fałszywy sukces zamiany przy równoległym usunięciu.

Dziś obie reguły sprawdza tylko ręczny smoke (po jednym kroku na regułę) i sekwencyjny pgTAP. Strażnik najgroźniejszego wyścigu to regex na tekście funkcji.

## Starting Point

- **Czyste funkcje dopasowania** (`matchIngredients`, `parseMatchMode`, `normalizeQuery`) istnieją bez testów.
- **Logika trybu i widoku** siedzi we frontmatterze `src/pages/ingredients/index.astro`, przemieszana z zapytaniami, i jest skopiowana w `hasSearchHits`.
- **Funkcja `set_best_substitute`** ma już `for update` (S-05), ale żaden test nie ćwiczy przeplotu współbieżnego.
- **Harness z fazy 1** (konta tymczasowe, sweep, hash danych dev) działa dla projektów `services` i `http`. Każdy projekt Vitest wymaga jednak stosu Supabase.

## Desired End State

- **`npm run test:unit`** w kilka sekund, bez Dockera, sprawdza reguły wyszukiwania tabelą przykładów, w której każdy wiersz ma źródło w PRD albo w zatwierdzonej decyzji.
- **`npm test`** dowodzi na prawdziwej bazie filtra, grupowania i całego cyklu „najlepszego”. Dowodzi też dwóch przeplotów współbieżnych, z kontrolą, że ten sam test na dawnym ciele funkcji bez blokady wykrywa fałszywy sukces.
- **`npm run test:http`** sprawdza ciasteczko trybu i render stanów strony.
- **Cookbook** ma wzorzec unit i wzorzec testu współbieżności.

## Key Decisions Made

| Decision             | Choice                                                                                              | Why (1 sentence)                                                                                    | Source   |
| -------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | -------- |
| Źródło wyroczni #4   | PRD FR-004/005 + decyzje S-03 jako tabela przykładów                                                | PRD nie definiuje trybów, ciasteczka ani stanów; definiuje je zatwierdzony plan S-03                | Research |
| Zakres „najlepszego” | para składnik + kategoria; „żaden” dozwolony                                                        | decyzja S-02 i indeks w bazie; PRD dosłownie mówi „na kategorię”                                    | Research |
| Diakrytyki           | bez zmian: „maka” ≠ „mąka”, test to przypina                                                        | brak zmiany produktu w fazie testowej; spójne z kluczem unikalności                                 | Plan     |
| Test wyścigu         | `pg` + dwie sesje: przeploty b i d + kontrola `pg_temp`                                             | tylko sterowany przeplot b rozróżnia funkcję z blokadą i bez; supabase-js i pgTAP tego nie potrafią | Plan     |
| Logika widoku        | wydzielić czyste `resolveMatchMode` / `resolveSearchView` (wspólne z `hasSearchHits`) + wąskie HTTP | reguły testowane w sekundach, znika duplikat; zachowanie bez zmian                                  | Plan     |
| Projekt unit         | osobny projekt `unit` bez `globalSetup`                                                             | bez Dockera; gotowe pod post-edit hook z fazy 4                                                     | Plan     |
| Limit 1000 i NFD     | opis w §7; NFD przypięte testem unit                                                                | ryzyka spekulatywne przy skali MVP, bez zmian produktu                                              | Plan     |
| Strażnik regex F1    | zostaje w pgTAP                                                                                     | tani sygnał w bramce pgTAP; dowodem jest test zachowania                                            | Plan     |

## Scope

**In scope:**

- projekt `unit` i tabele przykładów (dopasowanie, tryb, widok, URL-e powrotu);
- wydzielenie czystych funkcji z `index.astro` bez zmiany zachowania;
- testy serwisów (filtr z pustą parą, grupowanie, izolacja, cykl „najlepszego”);
- test wyścigu b i d z kontrolą mutacyjną;
- testy HTTP ciasteczka i stanów;
- dokumentacja (test-plan §3–§8, CLAUDE.md, README).

**Out of scope:**

- składanie diakrytyków i NFC;
- paginacja i limit 1000;
- zmiany zachowania strony, endpointów i SQL;
- przeploty c i e (stany dozwolone);
- atomowość „dodaj z najlepszym”;
- CI, post-edit hook, testy migracji (fazy 3–4);
- testy przeglądarkowe.

## Architecture / Approach

Piramida według koszt × sygnał:

1. czyste funkcje w `src/lib/search-view.ts` i istniejące helpery testowane w `tests/unit/` (bez harnessu);
2. serwisy testowane w `tests/services/` kontem tymczasowym (`createTestUser`, obserwacja `adminClient()` jako zbiory id, wspólne pomocniki w `tests/services/fixtures.ts`);
3. test wyścigu: dwie sesje `pg` jako `authenticated` z claims konta tymczasowego, sterowane przez `pg_blocking_pids`, z fixture'ami usuwanymi sweepem;
4. HTTP przez `HttpSession` z nagłówkami `Set-Cookie`.

## Phases at a Glance

| Phase                                  | What it delivers                                                                                           | Key risk                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1. Projekt `unit` i reguły dopasowania | `npm run test:unit` bez stosu; tabela przykładów dopasowania                                               | przeniesienie `globalSetup` może zepsuć projekty `services`/`http` |
| 2. Wydzielenie trybu i widoku          | `src/lib/search-view.ts` test-first; strona i `hasSearchHits` na wspólnych funkcjach; testy `list-view.ts` | refaktor pliku-hotspotu; edycja przy działającym dev zabija dev    |
| 3. Integracja serwisów                 | filtr (z pustą parą), grupowanie, izolacja, cykl „najlepszego”                                             | wydzielenie pomocników z `delete.test.ts`                          |
| 4. Test wyścigu                        | przeploty b i d + kontrola mutacyjna w `pg_temp`                                                           | prawo TEMP dla `authenticated`; wiszące sesje przy przerwaniu      |
| 5. Wąska warstwa HTTP                  | `Set-Cookie`, URL > cookie, render stanów                                                                  | parsowanie HTML (encje w `href`)                                   |
| 6. Dokumentacja                        | §6.1 unit, §6.2 współbieżność, §6.6, §7, §4, CLAUDE.md, README                                             | —                                                                  |

**Prerequisites:** działający lokalny stos (`npx supabase start`); `npm run dev` dla faz 2 i 5; brak `db reset`.
**Estimated effort:** ~3–4 sesje (fazy 1–2 jedna, 3–4 jedna lub dwie, 5–6 jedna).

## Open Risks & Assumptions

- **Kontrola `pg_temp`** zakłada, że `authenticated` może wykonać funkcję z własnego `pg_temp` (prawo TEMP do bazy). Fallback: wywołanie jako rola pierwotna sesji. Fałszywy sukces nie zależy od RLS.
- **Przeploty b i d** to wniosek z semantyki READ COMMITTED. Pierwszy przebieg Phase 4 je potwierdza albo plan wraca do rewizji.
- **Teardown harnessu** może zgłosić fałszywy alarm, gdy w trakcie przebiegu pracujesz w aplikacji.

## Success Criteria (Summary)

- Każda reguła #4 i #6 z tabeli przykładów ma test, który oblewa się po celowym złamaniu kodu (złamania kontrolne w fazach 3–5, kontrola mutacyjna w fazie 4).
- `npm run test:unit` działa bez Dockera; `npm test` i `npm run test:http` przechodzą z niezmienionym hashem danych dev.
- Cookbook §6.1/§6.2 pozwala dodać kolejny test unit i test przeplotu bez czytania tej zmiany.
