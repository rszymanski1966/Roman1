---
date: 2026-11-09T18:24:59+01:00
researcher: Claude (Opus 5.5) z rszymanski1966
git_commit: 20a393e
branch: chore/testing-search-and-best
repository: 10x-astro-starter
topic: "Ugruntowanie fazy 2 test-planu (Wyszukiwanie i najlepszy): ryzyka #4 i #6"
tags: [research, testing, search, best-substitute, pgtap, vitest, concurrency]
status: complete
last_updated: 2026-11-09
last_updated_by: Claude (Opus 5.5)
---

# Research: faza 2 test-planu — wyszukiwanie (#4) i „najlepszy” (#6)

**Date**: 2026-11-09T18:24:59+01:00
**Researcher**: Claude (Opus 5.5) z rszymanski1966
**Git Commit**: 20a393e (drzewo robocze z niezacommitowanymi zmianami poza `src/`, `supabase/`, `tests/`, `scripts/`)
**Branch**: chore/testing-search-and-best
**Repository**: 10x-astro-starter

## Research Question

Ugruntować fazę 2 z `context/foundation/test-plan.md` §3 dla ryzyk #4 i #6. Dla każdego ryzyka: znaleźć w kodzie prawdziwą ścieżkę awarii, zacytować linie, zweryfikować albo poprawić Risk Response Guidance z §2, wskazać istniejące testy i najtańszą użyteczną warstwę, oznaczyć ryzyka spekulatywne i mylące dowody z hot-spotów. Ograniczenie: bez `supabase db reset`, bez zmian lokalnych danych dev, reuse harnessu z fazy 1.

## Summary

**#4 (wyszukiwanie)**

- Wyrocznia „z PRD” nie wystarczy. PRD mówi tylko „wyszukiwać/filtrować po nazwie” i „kategoria to opcjonalne zawężenie” (`context/foundation/prd.md:108-114`).
- Reguły, które da się przetestować, są zatwierdzonymi decyzjami planu S-03 w archiwum: wielkość liter, tryby `contains`/`prefix`, URL > cookie > `contains`, filtr kategorii, stany widoku i lista „Pasujące składniki”. Do tego brak składania diakrytyków z S-01b. Wyrocznię trzeba spisać z tych dokumentów jako tabelę przykładów, nie z kodu.
- „Must challenge” z §2 („smoke nie ma pozytywnego sprawdzenia filtra”) jest nieaktualne. Smoke ma dziś pozytywny krok filtra i reguły URL > cookie (`scripts/smoke.mjs:419-423`) oraz krok listy „Pasujące składniki (2)” (`scripts/smoke.mjs:468-470`).
- Smoke ma jednak jedną kombinację na regułę, jest ręczny i nie sprawdza:
  - wielkich liter ani polskich znaków,
  - filtra odrzucającego jedno z kilku trafień,
  - złej wartości `match` ani `category`,
  - atrybutów ciasteczka.
- Czyste funkcje dopasowania już są i nadają się do testów unit od zaraz: `matchIngredients`, `parseMatchMode`, `normalizeQuery`, `normalizeName`/`toNameKey`.
- Rozstrzygnięcie trybu i stanu widoku siedzi we frontmatterze `index.astro` przemieszane z zapytaniami. Bez wydzielenia pokryje je tylko HTTP.
- Każdy projekt Vitest dziedziczy dziś `globalSetup` harnessu, więc „unit” też wymagałby działającego stosu.

**#6 („najlepszy”)**

- Reguła obejmuje **parę składnik + kategoria**, nie całą kategorię. PRD dosłownie mówi „na kategorię” (`prd.md:88-93`), plan S-02 świadomie zawęził to do pary, a baza wymusza parę indeksem.
- Stan „żaden najlepszy” jest dozwolony: po zdjęciu wyróżnienia i po usunięciu najlepszego. Awarią jest tylko utrata oznaczenia bez akcji użytkownika.
- Fałszywy sukces przy usunięciu w trakcie zamiany naprawiono w S-05: funkcja czyta wiersz przez `for update` (`supabase/migrations/20261026202646_delete_entries.sql:78-89`).
- Ochrona przed regresją to jednak tylko regex na tekście funkcji (`supabase/tests/delete-entries.sql:199-205`), czyli wzorzec, którego §2 każe unikać.
- Żadna ścieżka współbieżna nie jest testowana automatycznie.
- pgTAP i supabase-js nie odtworzą przeplotu, który odróżnia funkcję z blokadą od funkcji bez niej. Potrzebne są dwie bezpośrednie sesje Postgresa. W `node_modules` nie ma klienta `pg`/`postgres`, a `DB_URL` jest w `npx supabase status -o env`.
- Zachowanie oznaczenia przy edycji pokrywają pgTAP (`supabase/tests/edit-entries.sql:47-51`) i smoke (`scripts/smoke.mjs:517-533`). Brakuje testu serwisu.

## Detailed Findings

### #4 — gdzie żyje logika

Czyste funkcje (bez I/O, dziś testowalne unit):

- `normalizeName` (trim + scalenie białych znaków) i `toNameKey` (`toLocaleLowerCase("pl")`): `src/lib/entry-fields.ts:20-28`. Moduł jest celowo bez importów (`entry-fields.ts:1-4`).
- `parseMatchMode`, czyli tylko `"contains"` albo `"prefix"`, reszta daje `null`: `src/lib/services/substitutes.ts:46-49`.
- `normalizeQuery`, czyli trim i cięcie do `MAX_QUERY_LENGTH = 100`: `substitutes.ts:51-57`.
- `matchIngredients`: klucz zapytania i klucz nazwy liczone tą samą normalizacją, `startsWith` albo `includes`, puste zapytanie daje `[]`, kolejność wejścia zachowana: `substitutes.ts:59-75`.
  - Klucz liczony jest z `ingredient.name` (`:72`), nie z kolumny `ingredients.name_key`. Rozjazd `name_key` z nazwą (otwarte F3 z edit-entries, grant `20261021120000_edit_entries.sql:32`) nie wpływa więc na dopasowanie. Wpływa tylko na sortowanie (`substitutes.ts:87`) i deduplikację przy dodawaniu.
- Budowanie URL-i powrotu: `parseListView`, `setListViewParams`, `listRedirect`, `searchRedirect` w `src/lib/list-view.ts:31-80`. Czyste i dziś bez testów.

Logika z I/O:

- `listIngredientIdsWithSubstitutes(categoryId)` zwraca id składników z co najmniej jednym zamiennikiem w kategorii. `substitutes!inner` odrzuca pary bez zamienników: `substitutes.ts:185-198`.
- `listIngredientSubstitutes(ingredientId, categoryId|null)` zwraca grupy per kategoria. Grupy są w kolejności `sort_order`, w grupie najlepszy pierwszy, potem od najstarszego, kategorie bez zamienników pominięte. Sortowanie w JS: `substitutes.ts:207-246`.
- `hasSearchHits` powtarza kombinację „dopasowanie + filtr” ze strony. Używa jej przekierowanie po usunięciu składnika: `substitutes.ts:460-481`.

Logika tylko we frontmatterze strony (`src/pages/ingredients/index.astro`):

- Tryb wybierany w kolejności URL > cookie > `"contains"`: `:42-45`.
- Ciasteczko `ingredients_match` jest zapisywane tylko wtedy, gdy URL niesie poprawny tryb różny od zapisanego. Atrybuty: `path=/ingredients`, `httpOnly`, `sameSite=lax`, `secure` przy https, rok ważności: `:46-54`.
- Zły uuid w `category` (`:57`):
  - przy wyszukiwaniu daje widok „no-match” (`:119-120`);
  - przy `ingredient` daje widok składnika z `ingredient = null`, bez zapytania o zamienniki (`:113-117`).
- Priorytet widoku: składnik > wyszukiwanie > stan początkowy (`:60-63`). Dopasowanie z filtrem: `:100-108`.
- Liczba trafień decyduje o widoku (`:123-131`):
  - 0 trafień daje stan „Nie znaleziono składnika „q”.” (`:256-259`);
  - 1 trafienie pokazuje od razu zamienniki, bez przekierowania;
  - więcej trafień daje „Pasujące składniki (N)” z linkami (`:260-274`).
- Link powrotu do wyników pojawia się tylko przy `ingredient` + `q` i więcej niż jednym trafieniu (`:169-172`).
- Stan pusty składnika ma dwa teksty, z kategorią i bez (`:310-317`). Konto bez składników ma osobny stan (`:232-236`).

**Wniosek (warstwa):**

- Kombinacja w `:42-143` miesza parsowanie parametrów, zapytania i decyzję o widoku. Dziś da się ją sprawdzić tylko renderem strony, czyli projektem `http` przy działającym `npm run dev`.
- Dwa wydzielenia dają czyste funkcje bez zmiany zachowania (decyzja planu):
  - `resolveMatchMode(urlValue, cookieValue)` zwracające `{ mode, cookieToSet }`;
  - funkcja „widok wyszukiwania” z wejściem `(ingredients, query, mode, allowedIds | null, categoryValid, hasIngredientParam)` i wyjściem `initial | no-match | matches | ingredient(target)`.
- Taka funkcja usunęłaby też duplikat `hasSearchHits` / `index.astro:100-108`.
- Zostanie wąska warstwa HTTP: nagłówek `Set-Cookie`, teksty stanów pustych i lista linków „Pasujące składniki”.

### #4 — wyrocznia (źródła wymagań, nie kod)

| Reguła                                                                      | Źródło                                                     |
| --------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Wyszukiwanie/filtrowanie po nazwie; kategoria to opcjonalne zawężenie       | `prd.md:108-114` (FR-004, FR-005)                          |
| Dwa tryby (`match=contains                                                  | prefix`), domyślny „zawiera”                               | `context/archive/2026-10-12-ingredient-name-search/plan.md:21`, `:32` |
| Filtr kategorii przepuszcza tylko składniki z zamiennikiem w tej kategorii  | ten sam plan, `:28`                                        |
| Tryb: URL > cookie > „zawiera”; poprawny tryb z URL jest zapamiętywany      | ten sam plan, `:32`                                        |
| Stany wyników: puste `q`, 0, 1 i więcej trafień                             | ten sam plan, `:24-27`, `:169`                             |
| Widok składnika z kategorią i bez (sekcje, najlepszy pierwszy, stany puste) | ten sam plan, `:29-31`                                     |
| Brak składania diakrytyków („maslo” ≠ „masło”)                              | `context/archive/2026-10-10-unique-substitutes/plan.md:37` |

Uwagi do wyroczni:

- Diakrytyki: zapis w `unique-substitutes/plan.md:37` dotyczy unikalności. Dla wyszukiwania to wniosek, że ten sam `toNameKey` daje to samo zachowanie, nie jawna decyzja produktowa. Do potwierdzenia w planie (Open Questions).
- Ciasteczko pamięta tylko tryb. Kategoria i `q` żyją w URL-u, a żadne źródło nie wymaga ich zapamiętywania.
- Poza zakresem z decyzji: literówki i odmiana (`prd.md:112-113`), wyszukiwanie po stronie bazy, paginacja i wyszukiwanie na żywo (`ingredient-name-search/plan.md:48-50`).

Przypadki brzegowe dla tabeli przykładów, z wynikiem wynikającym z reguł, nie z kodu:

- wielkość liter z polskimi literami: „MĄKA” i „mąka” to to samo, „Ł” to to samo co „ł”;
- „maka” nie znajduje „mąka”;
- prefiks vs środek nazwy: „ąka” w trybie `prefix` daje brak trafień (`ingredient-name-search/plan.md:257`);
- spacje wiodące i podwójne w zapytaniu;
- zapytanie dłuższe niż 100 znaków;
- puste zapytanie po trim daje stan początkowy;
- `match=foo` przy cookie `prefix` daje `prefix`, a ciasteczko się nie zmienia;
- `category` z poprawnym uuid kategorii, w której składnik nie ma zamienników, daje brak trafień;
- `category=zły-format` daje brak trafień bez zapytań;
- filtr odrzuca jedno z dwóch trafień, więc zamiast listy od razu widok jednego składnika;
- konto bez składników;
- cudzy składnik nie jest znajdowany (izolacja z fazy 1).

### #4 — obserwowane ścieżki awarii i ryzyka spekulatywne

- **Limit 1000 wierszy.**
  - `listIngredients` nie stronicuje (`substitutes.ts:86-90`), a PostgREST tnie odpowiedź do `max_rows = 1000` (`supabase/config.toml:18`).
  - Przy więcej niż 1000 składnikach konta wyszukiwanie po cichu gubi trafienia z końca kolejności `name_key`. To dokładnie scenariusz „gubi pasujące składniki”.
  - To samo dotyczy `listIngredientIdsWithSubstitutes` (wiersze par w kategorii).
  - Decyzja S-03 „bez paginacji” (`ingredient-name-search/plan.md:48-49`) to akceptuje. Przy skali MVP ryzyko jest spekulatywne. Plan powinien je nazwać, nie testować.
- **Unicode NFC/NFD.** Ani `normalizeName`, ani `toNameKey` nie normalizują postaci Unicode (`entry-fields.ts:21-28`). Nazwa zapisana jako „a + łączący ogonek” nie pasuje do „ą” w zapytaniu. Brak dowodu, że taki zapis występuje. Ryzyko spekulatywne, a test unit kosztuje jedną linijkę, gdyby plan chciał je zamknąć jako znane ograniczenie.
- Filtr w trakcie wyszukiwania zależy od drugiego zapytania. Jego błąd daje komunikat zamiast stanu pustego (`index.astro:121-122`), co jest poprawną reakcją, nie fałszywym „brak wyników”.

### #6 — reguła, zakres i ograniczenia w bazie

- Kolumna `is_best boolean not null default false` i indeks częściowy `substitutes_one_best_per_pair_idx on substitutes (ingredient_category_id) where is_best`: `supabase/migrations/20261011201658_best_substitute.sql:8-15`. Zakres to para, a baza odrzuci drugi najlepszy w parze niezależnie od aplikacji.
- PRD FR-003 mówi „jeden „najlepszy” zamiennik na kategorię” (`prd.md:88-93`). Plan S-02 świadomie zmienił zakres na parę: „Każda para składnik + kategoria ma zero albo jeden najlepszy” (`context/archive/2026-10-11-best-substitute-highlight/plan.md:19`, `:36`). Wyrocznia testów: para.
- Stan „żaden” jest dozwolony:
  - po zdjęciu wyróżnienia (`p_is_best = false`, `20261026202646_delete_entries.sql:105-108`);
  - po usunięciu najlepszego (`best-substitute-highlight/plan.md:40`).
- Zamiana działa w jednym wywołaniu funkcji plpgsql, czyli w jednej transakcji RPC. Najpierw zdjęcie starego, potem ustawienie nowego (`20261026202646_delete_entries.sql:93-104`).
- Uprawnienia: grant `UPDATE` na `is_best` dla `authenticated` (`20261011201658_best_substitute.sql:20-27`) i edycja `name`, `ratio`, `notes` (`20261021120000_edit_entries.sql:26`). Użytkownik może więc przez PostgREST zmienić `is_best` z pominięciem funkcji. Drugiego najlepszego i tak nie ustawi, bo blokuje go indeks.
- Mapowanie błędów w serwisie (`substitutes.ts:265-273`):
  - `P0002` daje „Nie znaleziono zamiennika.” z kodem `not_found`;
  - `23505` daje „Najlepszy zamiennik właśnie się zmienił…”;
  - pozostałe błędy dają komunikat ogólny.
- Endpoint `/api/substitutes/best` przekierowuje z `error` i `error_for` przy błędzie, a z `notice` tylko przy prawdziwej zamianie (`src/pages/api/substitutes/best.ts:49-59`).

### #6 — współbieżność: przeploty z usunięciem i drugą zamianą

Funkcja po S-05 czyta wiersz z blokadą (`20261026202646_delete_entries.sql:78-89`). Poniższe przeploty to **wnioskowanie z semantyki READ COMMITTED w Postgresie**. Nie były uruchamiane w tym researchu.

| #   | Przeplot                                                                     | Z blokadą (dziś)                                                                            | Bez blokady (`20261011201658:45-48`)                                                                                     | Czy wynik odróżnia wersje                             |
| --- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| a   | usunięcie B zatwierdzone przed zamianą na B                                  | `P0002`, A zostaje najlepszy                                                                | `P0002` (ten sam `not found`)                                                                                            | nie — sekwencyjne, już w `delete-entries.sql:122-127` |
| b   | usunięcie B trzyma blokadę wiersza, zamiana na B czeka, usunięcie zatwierdza | `for update` pomija usunięty wiersz → `P0002`, A zostaje najlepszy                          | A traci oznaczenie, `update` B trafia 0 wierszy → **sukces z nazwą B i „A → B”** (`delete-entries-confirmed/plan.md:16`) | **tak — jedyny przeplot, który łapie regresję F1**    |
| c   | zamiana na B zatwierdzona, potem usunięcie B                                 | sukces (prawdziwy w chwili zatwierdzenia), potem para bez najlepszego                       | to samo                                                                                                                  | nie — stan dozwolony (B7)                             |
| d   | dwie równoległe zamiany w parze (na B i na C)                                | druga nie widzi nowej wersji B w swoim zdjęciu, ustawia C → `23505` → „właśnie się zmienił” | to samo                                                                                                                  | nie dotyczy F1; pilnuje indeks                        |
| e   | usunięcie poprzedniego najlepszego A w trakcie zamiany na B                  | `replaced_name = null`, brak komunikatu zamiany                                             | to samo                                                                                                                  | nie — bez fałszywego sukcesu                          |

- Przeplot **b** wymaga, żeby usuwająca transakcja była otwarta, gdy rusza zamiana.
- Przez supabase-js/PostgREST każde wywołanie to osobna transakcja. Nie da się trzymać blokady między wywołaniami.
- Test „`Promise.all` wiele razy” nie da sygnału. Z blokadą kończy się wynikiem a albo c, bez blokady wynikiem c albo b. Przy b bez blokady stan końcowy jest identyczny jak przy c: B usunięty, A bez oznaczenia, zamiana z sukcesem. Wyniku nie da się więc odróżnić bez sterowania kolejnością.
- pgTAP działa w jednej sesji i w transakcji wycofywanej na końcu. Druga sesja nie widzi jej danych (`supabase/tests/best-substitute.sql:5`, `:153`).
- Deterministyczny test wymaga dwóch bezpośrednich połączeń do Postgresa w Node:
  - sesja X: `begin; set local role authenticated; set local request.jwt.claims = {"sub": <konto tymczasowe>}; delete from substitutes where id = B;`
  - sesja Y (ta sama rola i claims): `select * from set_best_substitute(B, true)` — blokuje się;
  - obserwator czeka, aż `pg_blocking_pids(<pid Y>)` zawiera pid X, potem `commit` X;
  - oczekiwanie: Y kończy się `P0002`, A nadal najlepszy.
- Wariant d tą samą techniką: X trzyma niezatwierdzoną zamianę na B, Y zamienia na C, X zatwierdza, Y dostaje `23505`.

Wymagania i koszt tego testu:

- **Klient Postgresa:** w `node_modules` nie ma `pg` ani `postgres`. Trzeba dodać devDependency.
- **`DB_URL`:** jest wśród kluczy `npx supabase status -o env` (sprawdzone 2026-11-09, wypisane tylko nazwy kluczy). `tests/harness/env.ts:42-45` czyta dziś tylko `API_URL`, `PUBLISHABLE_KEY` i `SECRET_KEY`.
- **Zgodność z §1:** fixture'y tworzone jako konto tymczasowe (`createTestUser`) są usuwane przez sweep. Wiersze kaskadują z `auth.users` (`20261004120000_substitute_database.sql:32`, `:56`, `:88`), więc hash danych dev się nie zmienia. Brak `db reset`.
- **`lint:db-access`** sprawdza tylko `src/**` i migracje (`scripts/db-access.mjs:2-3`). Połączenie superużytkownika w `tests/` go nie narusza. Akcje muszą jednak iść jako `authenticated` z claims, żeby działało RLS. Superużytkownik służy wyłącznie do obserwacji (`pg_blocking_pids`).
- **Sprzeczność z decyzją archiwum:** S-05 świadomie odrzucił automatyczny test współbieżności na rzecz ręcznej weryfikacji w dwóch sesjach psql (`delete-entries-confirmed/plan.md:55`). Intencja fazy 2 („nie tylko ścieżka sekwencyjna”) to odwraca. Decyzja dla planu lub użytkownika.

### #6 — istniejące testy i luki

pgTAP `supabase/tests/best-substitute.sql`, 14 asercji (`:9`), wyłącznie sekwencyjnie:

- oznaczenie bez poprzednika;
- zamiana z `replaced_name`;
- dokładnie jeden najlepszy po zamianie;
- ponowne oznaczenie;
- niezależność innej pary tego samego składnika;
- zdjęcie i zero najlepszych;
- `23505` dla drugiego `is_best` wstawionego wprost;
- `42501` przy przenoszeniu do innej pary;
- `P0002` dla konta B;
- `42501` dla `anon`.

pgTAP `supabase/tests/delete-entries.sql`:

- `P0002` dla usuniętego zamiennika, sekwencyjnie (`:122-127`);
- strażnik F1 jako regex `where s\.id = p_substitute_id\s+for update;` na `pg_get_functiondef` (`:199-205`). To asercja skopiowana z SQL funkcji, czyli anty-wzorzec z §2. Przejdzie dla każdego ciała z tym tekstem i nie dowodzi blokady. Behawioralny test przeplotu b może ją zastąpić albo uzupełnić.

pgTAP `supabase/tests/edit-entries.sql:41-51`: edycja `name`, `ratio` i `notes` najlepszego zostawia `is_best = true`.

Serwis i aplikacja:

- `updateSubstitute` nigdy nie wysyła `is_best` (`substitutes.ts:345-365`).
- `addSubstitute` z `isBest` nie jest atomowe. Po zapisie oznaczenie może się nie udać i wtedy wynik to `bestError` (`substitutes.ts:171-182`). To zaakceptowane w `best-substitute-highlight/plan.md:53`.
- Brak testów TS dla best, wyszukiwania i `list-view.ts`: w `tests/` jest tylko `services/delete.test.ts`, `http/{isolation,delete-confirmation}.test.ts`, harness i `scripts/db-access.test.ts`.

Smoke (ręczny):

- oznaczenie i zamiana z komunikatem (`scripts/smoke.mjs:245-260`);
- błąd przypięty do karty (`:262-275`);
- dodanie z checkboxem zastępuje najlepszego (`:329-345`);
- oznaczenie z URL-a wyszukiwania (`:440-465`);
- edycja najlepszego i zachowana plakietka (`:517-533`).

Nie ma kroku, który usuwa bieżącego najlepszego (raport przeglądu archiwum, niesprawdzone grepem).

### Mylące dowody z hot-spotów

- `src/pages/ingredients` ma 20 commitów w oknie 2026-10-02 … 2026-11-02 (`git log -- src/pages/ingredients`). Zmiany logiki wyszukiwania to 2 z nich (`463ab1f`, `3916228`), a „najlepszego” 3 (`31cd35d`, `1ea886b`, `0f4f657`). Reszta to UI (list-ui, new-ui), edycja i usuwanie.
- Logika wyszukiwania i najlepszego żyje głównie w `src/lib/services/substitutes.ts` i migracjach. Na stronie jest tylko rozstrzygnięcie widoku i trybu.
- Hot-spot nadal uzasadnia prawdopodobieństwo: w tym oknie 12 commitów dotyka `src/pages/ingredients/index.astro`, z czego 4 to wyszukiwanie lub najlepszy (`463ab1f`, `3916228`, `31cd35d`, `0f4f657`), a reszta to UI, edycja i usuwanie, które przy okazji ruszały ten plik. Nie jest to jednak „najczęściej zmieniana logika wyszukiwania”.

## Code References

- `src/lib/entry-fields.ts:20-28` — `normalizeName`, `toNameKey` (wspólna reguła nazwy).
- `src/lib/services/substitutes.ts:46-75` — `parseMatchMode`, `normalizeQuery`, `matchIngredients` (czyste).
- `src/lib/services/substitutes.ts:86-90` — `listIngredients` bez stronicowania (limit `max_rows`).
- `src/lib/services/substitutes.ts:185-246` — filtr kategorii i grupowanie/sortowanie zamienników.
- `src/lib/services/substitutes.ts:253-277` — `setBestSubstitute`, mapowanie `P0002`/`23505`.
- `src/lib/services/substitutes.ts:345-373` — `updateSubstitute` bez `is_best`.
- `src/lib/services/substitutes.ts:460-481` — `hasSearchHits` (duplikat kombinacji ze strony).
- `src/pages/ingredients/index.astro:42-143` — tryb, ciasteczko, stan widoku (frontmatter z I/O).
- `src/lib/list-view.ts:31-80` — URL-e powrotu (czyste, bez testów).
- `src/pages/api/substitutes/best.ts:14-60` — endpoint oznaczania.
- `supabase/migrations/20261011201658_best_substitute.sql:8-27` — kolumna, indeks częściowy, grant, polityka UPDATE.
- `supabase/migrations/20261026202646_delete_entries.sql:69-113` — `set_best_substitute` z `for update`.
- `supabase/tests/best-substitute.sql`, `supabase/tests/delete-entries.sql:122-127,199-205`, `supabase/tests/edit-entries.sql:41-51` — istniejące pgTAP.
- `scripts/smoke.mjs:398-470` — wyszukiwanie, tryb, cookie, filtr, lista trafień.
- `vitest.config.ts:12` — `globalSetup` wspólny dla wszystkich projektów (`extends: true`).
- `tests/harness/accounts.ts:61` (`createTestUser`), `tests/harness/global-setup.ts:9-34`, `tests/http/client.ts:28-90` (`HttpSession`, `signIn`, `assertServerReachable`), `tests/services/delete.test.ts:42-114` (wzorzec fixture'ów i wyroczni na zbiorach id).

## Architecture Insights

- Konwencja „błędy zwracane, nie rzucane” (`substitutes.ts:19-24`) ułatwia testy serwisów: asercje na `error` i `code`, bez łapania wyjątków.
- Reguła nazwy jest w module bez importów, więc test unit nie potrzebuje Astro ani Supabase.
- `substitutes.ts` importuje jednak typ `SupabaseClient`, a `import type` jest wymazywany. Test `matchIngredients` z `@/lib/services/substitutes` nie potrzebuje stosu.
- Wspólny `globalSetup` (`vitest.config.ts:12`) sprawia, że każdy przebieg Vitest woła `npx supabase status` i sweep. Szybki projekt `unit` bez stosu, potrzebny też pod post-edit hook z fazy 4 (§4), musi nie dziedziczyć `globalSetup`. To decyzja konfiguracyjna planu.
- Inwariant „co najwyżej jeden najlepszy w parze” pilnuje baza (indeks), nie aplikacja. Testy powinny sprawdzać inwariant na stanie, czyli liczbę `is_best` w parze odczytaną klientem admin. Nie powinny sprawdzać, który `update` się wykonał.

## Historical Context (from prior changes)

- `context/archive/2026-10-11-best-substitute-highlight/reviews/impl-review.md` — F1 „odczyt bez blokady” naprawione w S-05 (`13378a1`). F2 (dowolny tekst w `?notice=`) zaakceptowane jako ryzyko i nadal otwarte (`index.astro:36`, `:217-221`). Równoległe zamiany (23505) rozważone, nieprzetestowane (wg raportu przeglądu).
- `context/archive/2026-10-12-ingredient-name-search/reviews/impl-review.md`:
  - F1 (brak pozytywnego sprawdzenia filtra i URL > cookie) naprawione w `3916228`, smoke `:419-423`;
  - F3 (brak listy trafień i sekcji) naprawione, smoke `:468-470` i kolejne kroki;
  - F6 (link powrotu po jednym trafieniu) naprawione, smoke `:474`;
  - uwaga o limicie 1000 bez paginacji zaakceptowana.
- `context/archive/2026-10-24-delete-entries-confirmed/plan.md:16`, `:55` — opis fałszywego sukcesu i odrzucenie automatycznego testu współbieżności (ręcznie w psql). `roadmap.md:126` — ryzyko S-05.
- `context/archive/2026-10-17-edit-entries` — F3 (grant pozwala zapisać `ingredients.name_key` niezgodny z nazwą) nadal otwarty, w follow-upie. Nie wpływa na dopasowanie (patrz wyżej), należy do ryzyka #7.
- `context/archive/2026-11-04-testing-isolation-and-delete` — harness, wzorce §6.2–§6.4. §6.1 (unit) czeka na tę fazę (`test-plan.md:124-126`).

Oceny poszczególnych twierdzeń historycznych:

- „smoke nie ma pozytywnego sprawdzenia filtra” (test-plan §2, Must challenge #4) — **contradicted** od `3916228`. Prawdziwe pozostaje: jedna kombinacja, ręcznie.
- „F1: odczyt bez blokady” (test-plan §2 Source #6) — **contradicted** jako stan bieżący. Naprawione w `20261026202646`. Prawdziwe jako historia i jako brak testu behawioralnego.
- „najlepszy na kategorię” (PRD FR-003) — **partial**. Zakres to para wg zatwierdzonej decyzji S-02.

## Related Research

- `context/archive/2026-11-04-testing-isolation-and-delete/research.md` — faza 1 (harness, izolacja kont).

## Open Questions

1. **Diakrytyki w wyszukiwaniu:** czy „maka” ma nie znajdować „mąka”? Dziś nie znajduje. Jedyne źródło dotyczy unikalności (`unique-substitutes/plan.md:37`). Test powinien zapisać to jako jawną decyzję albo znane ograniczenie.
2. **Test współbieżności (przeplot b, opcjonalnie d):** dodać devDependency `pg`/`postgres` i dwusesyjny test w Vitest (odwraca decyzję `delete-entries-confirmed/plan.md:55`)? Czy zostawić weryfikację ręczną i strażnika regex? Bez tego „nie tylko ścieżka sekwencyjna” z intencji fazy da się pokryć tylko przeplotem d, i to niedeterministycznie.
3. **Wydzielenie z `index.astro`:** czy faza testowa może zrobić mały refaktor (`resolveMatchMode`, czysta funkcja widoku wyszukiwania, scalenie z `hasSearchHits`), żeby reguły #4 testować unit? Alternatywa: tylko HTTP przy działającym dev.
4. **Projekt `unit` bez `globalSetup`:** osobny projekt Vitest bez harnessu, czyli bez stosu, szybki i gotowy pod post-edit hook z fazy 4? Czy unit w projekcie `services` ze stosem?
5. **Limit 1000 i NFC/NFD:** nazwać w planie jako zaakceptowane ograniczenia, czy przypiąć testem unit (NFD) i komentarzem (limit)? Ryzyko spekulatywne przy skali MVP.
