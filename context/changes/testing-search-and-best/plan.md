# Faza 2 test-planu: wyszukiwanie i „najlepszy” — Implementation Plan

## Overview

Zabezpieczyć ryzyka #4 (wyszukiwanie po nazwie, tryb, filtr kategorii, stan widoku) i #6 (oznaczenie „najlepszy”) z `context/foundation/test-plan.md` §2. Każda reguła trafia do najtańszej warstwy, która daje sygnał:

- **unit bez stosu:** tabela przykładów spisana z wymagań, nie z kodu;
- **integracja serwisów:** na lokalnym Supabase, jako konto tymczasowe;
- **test wyścigu:** deterministyczny, w dwóch sesjach Postgresa;
- **wąska warstwa HTTP:** dla ciasteczka i renderu stanów.

Faza kończy się wzorcami §6.1 (unit) i współbieżności w cookbooku.

## Current State Analysis

Pełne ugruntowanie: `context/changes/testing-search-and-best/research.md`. Najważniejsze:

- **Czyste funkcje dopasowania istnieją, ale nie mają testów:** `normalizeName`/`toNameKey` (`src/lib/entry-fields.ts:20-28`), `parseMatchMode`, `normalizeQuery`, `matchIngredients` (`src/lib/services/substitutes.ts:46-75`) i URL-e powrotu (`src/lib/list-view.ts:31-80`).
- **Rozstrzygnięcie trybu i widoku żyje we frontmatterze strony,** przemieszane z zapytaniami (`src/pages/ingredients/index.astro:42-143`):
  - tryb URL > cookie > `contains` i zapis ciasteczka;
  - priorytet składnik > wyszukiwanie > stan początkowy;
  - widoki 0, 1 i więcej trafień;
  - zły `category`;
  - link powrotu.
- **Kombinacja „dopasowanie + filtr” jest skopiowana** w `hasSearchHits` (`substitutes.ts:460-481`).
- **Każdy projekt Vitest dziedziczy `globalSetup` harnessu** (`vitest.config.ts:12`, `extends: true`). Test unit też woła więc `npx supabase status` i sweep.
- **„Najlepszy”:**
  - indeks częściowy na parę (`supabase/migrations/20261011201658_best_substitute.sql:13-15`);
  - funkcja `set_best_substitute` z `for update` (`supabase/migrations/20261026202646_delete_entries.sql:69-113`);
  - pgTAP sekwencyjny (`supabase/tests/best-substitute.sql`, 14 asercji; `delete-entries.sql:122-127`; `edit-entries.sql:41-51`).
- **Strażnik F1 to regex na treści funkcji** (`delete-entries.sql:199-205`). Żaden przeplot współbieżny nie jest testowany automatycznie. S-05 świadomie zostawił weryfikację ręczną w psql (`context/archive/2026-10-24-delete-entries-confirmed/plan.md:55`).
- **Klient `pg`/`postgres` nie jest zainstalowany.** `DB_URL` jest w `npx supabase status -o env`, ale `tests/harness/env.ts:42-45` go nie czyta.
- **Brak testów TS dla wyszukiwania, „najlepszego” i `list-view.ts`.** Smoke (`scripts/smoke.mjs:398-533`) ma po jednym kroku na regułę i jest ręczny.

## Desired End State

- `npm run test:unit` działa bez Dockera i bez serwera, w kilka sekund. Pokrywa reguły dopasowania, trybu, widoku wyszukiwania i URL-i powrotu tabelą przykładów, w której każdy wiersz ma źródło (PRD albo zatwierdzona decyzja w archiwum).
- `index.astro` i `hasSearchHits` korzystają ze wspólnych czystych funkcji. Zachowanie strony się nie zmienia: smoke i `npm run test:http` przechodzą bez zmian w oczekiwaniach.
- `npm test` (unit + services) dowodzi na prawdziwej bazie, jako konto tymczasowe:
  - filtra kategorii, grupowania i kolejności zamienników;
  - reguł „najlepszego”: zamiana, zdjęcie, edycja i zmiana nazwy zachowują oznaczenie, usunięcie najlepszego, oznaczenie usuniętego;
  - dwóch przeplotów współbieżnych z kontrolą, że ten sam test na ciele funkcji bez blokady wykrywa fałszywy sukces.
- `npm run test:http` sprawdza `Set-Cookie`, regułę URL > cookie oraz render stanów: początkowy, brak trafień z CTA, lista „Pasujące składniki”, jedno trafienie, zły `category`, konto bez składników.
- `test-plan.md`:
  - §6.1 ma wzorzec unit, a §6.2 wzorzec testu współbieżności;
  - §6.6 ma notatki fazy 2;
  - §7 i §4 opisują przyjęte ograniczenia i nowy stos;
  - §3 Phase 2 ma status `complete` po implementacji.

Weryfikacja: `npm run test:unit`, `npm test`, `npm run test:http` (przy `npm run dev`), `npx supabase test db`, `npm run lint`, `npm run lint:ui`, `npm run lint:db-access`, `npm run smoke`. Hash danych dev musi być bez zmian (teardown harnessu).

### Key Discoveries:

- **Zakres „najlepszego” to para składnik + kategoria,** nie kategoria. Mówi tak decyzja S-02 (`context/archive/2026-10-11-best-substitute-highlight/plan.md:19`, `:36`) i wymusza to indeks. Stan „żaden” jest dozwolony (`:40`, zdjęcie przez `p_is_best = false`).
- **Wyrocznia #4 to PRD FR-004/FR-005** (`context/foundation/prd.md:108-114`) **plus decyzje S-03** (`context/archive/2026-10-12-ingredient-name-search/plan.md:21-33`), z przykładami w `:124` i `:255-261`.
  - Zatwierdzone odstępstwa: link powrotu tylko przy więcej niż jednym trafieniu (`context/archive/2026-10-12-ingredient-name-search/change.md`, sekcja „Odstępstwa od planu”).
  - Brak składania diakrytyków (`context/archive/2026-10-10-unique-substitutes/plan.md:37`), utrzymany decyzją tej fazy.
- **Rozróżnia tylko przeplot b:** usunięcie trzyma blokadę wiersza, a zamiana czeka. Przy nim funkcja z blokadą kończy się `P0002`, a funkcja bez blokady zgłasza sukces i zdejmuje oznaczenie z poprzedniego najlepszego (`delete-entries-confirmed/plan.md:16`). `Promise.all` przez supabase-js tego nie rozróżni (research, tabela przeplotów).
- **Fixture'y konta tymczasowego kaskadują z `auth.users`** (`supabase/migrations/20261004120000_substitute_database.sql:32`, `:56`, `:88`). Sweep je usuwa, a hash danych dev pozostaje nietknięty.
- **Wzorzec testu serwisu:** `tests/services/delete.test.ts:42-114`. Fixture powstaje przez `addSubstitute(user.client, …)`, a stan jest obserwowany `adminClient()` jako zbiory id.
- **Wzorzec HTTP:** `tests/http/client.ts`. `HttpSession` zapisuje ciasteczka, ale nie zwraca nagłówków `Set-Cookie`.
- **`lint:db-access` sprawdza tylko `src/**` i migracje** (`scripts/db-access.mjs:2-3`). Połączenie `pg` w `tests/` go nie narusza.

## What We're NOT Doing

- Składanie diakrytyków („maka” → „mąka”) ani normalizacja Unicode (NFC). Test przypina dzisiejsze zachowanie, a §7 zapisuje to jako znane ograniczenie.
- Testy ani poprawka limitu 1000 wierszy `listIngredients` (`max_rows`). Zostaje opisany w §7 jako przyjęte ograniczenie S-03 (bez paginacji).
- Zmiany zachowania strony `/ingredients`, endpointów i funkcji SQL. Phase 2 to wyłącznie wydzielenie bez zmiany wyników.
- Usuwanie strażnika regex z `supabase/tests/delete-entries.sql:199-205`. Zostaje jako tani sygnał w bramce pgTAP, która w fazie 4 trafi do CI. Dowodem zachowania jest nowy test wyścigu.
- Przeplot c (zamiana zatwierdzona, potem usunięcie: para bez najlepszego) i e (usunięcie poprzedniego najlepszego w trakcie zamiany). Oba to stany dozwolone, bez fałszywego sukcesu.
- Atomowość „dodaj z checkboxem najlepszy” (`substitutes.ts:171-182`, zaakceptowane w `best-substitute-highlight/plan.md:53`).
- Testy w CI (to faza 4), post-edit hook (faza 4) i testy migracji (faza 3).
- Testy przeglądarkowe i snapshoty wyglądu (§7).

## Implementation Approach

Kolejność według koszt × sygnał.

1. **Unit bez stosu (Phase 1–2):**
   - najpierw istniejące czyste funkcje;
   - potem wydzielenie rozstrzygnięcia trybu i widoku, test-first: testy z tabeli przykładów są czerwone, bo funkcji jeszcze nie ma, potem przeniesienie logiki 1:1.
2. **Integracja serwisów (Phase 3):** buduje fixture'y i pomocniki obserwacji, z których korzysta test wyścigu.
3. **Test wyścigu (Phase 4):** dwie sesje `pg` jako rola `authenticated` z claims konta tymczasowego, obserwator jako superużytkownik (`pg_blocking_pids`). Kontrola mutacyjna wywołuje dawne ciało funkcji bez blokady, utworzone w `pg_temp`, czyli istniejące tylko w tej sesji.
4. **HTTP (Phase 5):** tylko to, czego unit nie widzi: nagłówki, rzeczywisty render, ciasteczko między żądaniami.
5. **Dokumentacja (Phase 6).**

Wyrocznia w każdym teście to wiersz tabeli przykładów albo stan bazy obserwowany kluczem admina. Nigdy wynik testowanej funkcji ani tekst przepisany z kodu.

## Critical Implementation Details

- **Edycja `src/pages/ingredients/index.astro` przy działającym `npm run dev`:** Edit tworzy plik `*.tmp.*` i zabija dev (ENOENT). Zapisuj plik w miejscu (np. `fs.writeFileSync`) albo edytuj przy zatrzymanym dev. Nie uruchamiaj `npm run build` ani `npx astro check` przy działającym dev (500 z `deps_ssr`).
- **Kolejność w teście wyścigu:** sesja Y dostaje polecenie dopiero po potwierdzeniu, że X trzyma blokadę (X wykonał `delete`/`set_best_substitute` i nie zatwierdził). Zatwierdzenie X następuje dopiero, gdy `pg_blocking_pids(<pid Y>)` zawiera pid X. Każda sesja ma `set local lock_timeout`, a `finally` zawsze robi `rollback` i `end()`, żeby przerwany test nie zostawił blokad ani połączeń.
- **Kontrola `pg_temp`:** funkcję tymczasową tworzy sesja Y przed `set local role authenticated`.
  - Pierwszy krok Phase 4 sprawdza, czy rola `authenticated` może wykonać funkcję z własnego `pg_temp` (wymaga prawa TEMP do bazy).
  - Jeśli nie może, kontrola woła funkcję jako rola pierwotna sesji. Mechanizm fałszywego sukcesu nie zależy od RLS.
  - Wybrany wariant i powód trafiają do komentarza w teście.
- **`DB_URL` zawiera hasło.** Nigdy go nie loguj i nie wstawiaj do komunikatów błędów (konwencja z `tests/harness/env.ts:1-2`).

## Faza 1: Projekt `unit` i reguły dopasowania

### Overview

Stack-free projekt Vitest i tabela przykładów dla istniejących czystych funkcji wyszukiwania.

### Changes Required:

#### 1. Konfiguracja Vitest i skrypty

**File**: `vitest.config.ts`, `package.json`

**Intent**: Dodać projekt `unit`, który nie uruchamia harnessu, żeby testy reguł działały bez Dockera (także jako przyszły post-edit hook z fazy 4). `npm test` obejmuje unit i services.

**Contract**:

- `globalSetup: ["tests/harness/global-setup.ts"]` przenosi się z `test` w korzeniu do projektów `services` i `http`.
- Nowy projekt `{ name: "unit", include: ["tests/unit/**/*.test.ts"] }` bez `globalSetup`.
- Skrypty: `"test:unit": "vitest run --project unit"`, `"test": "vitest run --project unit --project services"`.
- Pliki w `tests/unit/` nie importują niczego z `tests/harness/`.

#### 2. Tabela przykładów dopasowania

**File**: `tests/unit/search-match.test.ts`

**Intent**: Wyrocznia #4 dla `matchIngredients`, `normalizeQuery` i `parseMatchMode`, spisana z PRD i decyzji S-03 jako `it.each`. Każdy wiersz ma komentarz ze źródłem.

**Contract**: Przypadki (oczekiwania z wymagań, nie z kodu):

| Przypadek                                                                                              | Oczekiwany wynik                                                           | Źródło                                                                        |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| „Mąka” w `contains` na liście [„mąka pszenna”, „Mąka żytnia”, „biała mąka”, „skrobia z mąki”, „Masło”] | trzy pierwsze, w kolejności wejścia                                        | S-03 `:124`                                                                   |
| „mąka” w `prefix`                                                                                      | „mąka pszenna”, „Mąka żytnia” (bez „biała mąka”)                           | S-03 `:124`                                                                   |
| „ąka” w `prefix`                                                                                       | brak trafień                                                               | S-03 `:257`                                                                   |
| „ąka” w `contains`                                                                                     | trafienia                                                                  | S-03 `:257`                                                                   |
| „MĄKA” i „mąka”                                                                                        | ten sam wynik                                                              | —                                                                             |
| „ŁOSOŚ” i „łosoś”                                                                                      | ten sam wynik                                                              | —                                                                             |
| „maka”                                                                                                 | **nie** znajduje „mąka”                                                    | decyzja: bez składania diakrytyków, `unique-substitutes/plan.md:37` + ta faza |
| zapytanie ze spacjami („ mąka pszenna ”)                                                               | pasuje do „mąka pszenna”                                                   | —                                                                             |
| `""` i `"   "`                                                                                         | brak trafień                                                               | S-03 `:24`                                                                    |
| nazwa zapisana w NFD („a” + U+0328) vs zapytanie „mąka” w NFC                                          | brak trafienia — **przypięte znane ograniczenie** (komentarz odsyła do §7) | —                                                                             |
| `normalizeQuery`: trim                                                                                 | —                                                                          | S-03                                                                          |
| `normalizeQuery`: 101 znaków                                                                           | ucięte do 100                                                              | —                                                                             |
| `normalizeQuery`: spacja na granicy cięcia                                                             | usunięta                                                                   | —                                                                             |
| `normalizeQuery`: `null` / `undefined`                                                                 | `""`                                                                       | —                                                                             |
| `parseMatchMode`: `"contains"`, `"prefix"`                                                             | ta sama wartość                                                            | —                                                                             |
| `parseMatchMode`: `"Prefix"`, `""`, `"foo"`, `null`, `undefined`                                       | `null`                                                                     | —                                                                             |

### Success Criteria:

#### Automated Verification:

- `npm run test:unit` przechodzi przy zatrzymanym stosie Supabase (`npx supabase stop` albo bez Dockera) i nie wypisuje komunikatów harnessu
- `npm test` przechodzi przy działającym stosie (unit + services, harness: 0 kont testowych, dane dev bez zmian)
- `npm run lint` przechodzi

#### Manual Verification:

- Przegląd tabeli przykładów: każdy wiersz ma źródło, a żaden oczekiwany wynik nie jest wyliczony wywołaniem testowanej funkcji

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed kolejną fazą.

---

## Faza 2: Wydzielenie trybu i widoku wyszukiwania (test-first) + URL-e powrotu

### Overview

Czyste funkcje rozstrzygające tryb i widok, napisane pod czerwone testy z tabeli przykładów. Potem przeniesione do strony i do `hasSearchHits` bez zmiany zachowania. Do tego testy unit `list-view.ts`.

### Changes Required:

#### 1. Testy widoku wyszukiwania (najpierw czerwone)

**File**: `tests/unit/search-view.test.ts`

**Intent**: Wyrocznia reguł S-03 dla trybu i widoku. Fixture to lista `IngredientListItem` ze stałymi uuid i zbiór `allowedIds`. Bez bazy.

**Contract**:

`resolveMatchMode(url, cookie)` → `{ mode, remember }`:

| url          | cookie     | mode       | remember   |
| ------------ | ---------- | ---------- | ---------- |
| `null`       | `null`     | `contains` | `null`     |
| `"prefix"`   | `null`     | `prefix`   | `prefix`   |
| `"contains"` | `"prefix"` | `contains` | `contains` |
| `"prefix"`   | `"prefix"` | `prefix`   | `null`     |
| `"foo"`      | `"prefix"` | `prefix`   | `null`     |
| `null`       | `"foo"`    | `contains` | `null`     |

Źródło: S-03 `:32`, `index.astro:42-54` jako opis istniejącego kontraktu, nie wyrocznia.

`resolveSearchView(input)`:

| Wejście                                                      | Oczekiwany widok                                                                                              | Źródło                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| bez `q` i bez `ingredient`                                   | `initial`                                                                                                     | S-03 `:24`                                      |
| `q` z 0 trafień                                              | `no-match`                                                                                                    | S-03 `:25`                                      |
| `q` z 1 trafieniem                                           | `ingredient` z tym składnikiem, bez przekierowania                                                            | S-03 `:26`                                      |
| `q` z kilkoma trafieniami                                    | `matches` w kolejności wejścia                                                                                | S-03 `:27`                                      |
| filtr kategorii odrzuca składnik spoza `allowedIds`          | 2 trafienia → 1, czyli widok `ingredient`                                                                     | S-03 `:28`                                      |
| poprawny uuid kategorii, w której nic nie pasuje             | `no-match`                                                                                                    | S-03 `:28`                                      |
| zły format `category` przy `q`                               | `no-match`                                                                                                    | S-03 Phase 2                                    |
| zły format `category` przy `ingredient`                      | `ingredient` z `null`                                                                                         | S-03 Phase 2                                    |
| nieznany albo cudzy `ingredient` (poprawny uuid spoza listy) | `ingredient` z `null`                                                                                         | S-03 `:33`                                      |
| zły format `ingredient`                                      | `ingredient` z `null`                                                                                         | —                                               |
| `ingredient` + `q`                                           | widok składnika, liczba trafień policzona                                                                     | S-03 `:29`, priorytet składnik > wyszukiwanie   |
| link powrotu do wyników                                      | tylko przy `ingredient` + `q` i więcej niż 1 trafieniu; przy niepoliczonych trafieniach (błąd filtra) zostaje | odstępstwo w `ingredient-name-search/change.md` |
| błąd zapytania filtra                                        | stan błędu, nie `no-match`                                                                                    | —                                               |

#### 2. Czyste funkcje widoku wyszukiwania

**File**: `src/lib/search-view.ts` (nowy)

**Intent**: Jedno źródło reguł trybu, dopasowania z filtrem i widoku, zamiast frontmatteru strony i kopii w `hasSearchHits`. Moduł bez I/O, testowalny unit.

**Contract**:

- `resolveMatchMode(urlValue: string | null | undefined, cookieValue: string | null | undefined): { mode: MatchMode; remember: MatchMode | null }`.
- `searchMatches(ingredients: IngredientListItem[], query: string, mode: MatchMode, allowedIds: Set<string> | null): IngredientListItem[]`.
- `resolveSearchView(input: { ingredients; query; mode; ingredientParam; categoryParam; allowedIds: Set<string> | null; filterFailed: boolean })` zwraca:
  - `viewCategory: string | null`, `categoryValid: boolean`;
  - `searchHits: number | null`;
  - `backToResults: boolean`;
  - `decision`: `{ kind: "initial" } | { kind: "no-match" } | { kind: "matches"; matches } | { kind: "ingredient"; target: IngredientListItem | null } | { kind: "filter-error" }`.
- Importuje tylko `isUuid`, `parseMatchMode`, `matchIngredients` z `@/lib/services/substitutes` i typy z `@/types`.

#### 3. Strona i serwis na wspólnych funkcjach

**File**: `src/pages/ingredients/index.astro`, `src/lib/services/substitutes.ts`

**Intent**: Strona woła `resolveMatchMode` (zapis ciasteczka, gdy `remember !== null`) i `resolveSearchView`. Zapytania, `listIngredientSubstitutes` dla `target` i render zostają bez zmian. `hasSearchHits` używa `searchMatches`. Zachowanie identyczne.

**Contract**:

- Te same parametry URL.
- Ten sam zapis ciasteczka (atrybuty z `index.astro:47-53`).
- Te same teksty i linki.
- `hasSearchHits(client, query, mode, categoryId)` bez zmiany sygnatury.
- Plik strony zapisywany w miejscu (Critical Implementation Details).

#### 4. Testy URL-i powrotu

**File**: `tests/unit/list-view.test.ts`

**Intent**: Reguła „akcja wraca do tego samego widoku” (S-03 `:33`) i „po usunięciu składnika wróć do wyszukiwania” (`delete-entries-confirmed/plan.md:32`) dla `parseListView`, `listRedirect`, `searchRedirect`.

**Contract**:

`parseListView`:

- `null` przy złym uuid `ingredient` albo niepustej, złej `category`;
- normalizuje `q`;
- odrzuca nieznany `match`.

`listRedirect`:

- kolejność `ingredient`, `category`, `q`, `match`, potem `notice`/`error`, potem `error_for` z kotwicą `#substitute-<id>`;
- puste wartości pominięte;
- `null` widok daje gołe `/ingredients`.

`searchRedirect`:

- z `q` → `q`, `match`, `category`;
- bez `q` → `/ingredients` (bez `category`);
- nigdy `ingredient`.

### Success Criteria:

#### Automated Verification:

- `npm run test:unit` przechodzi (zanim powstał `src/lib/search-view.ts`, testy widoku były czerwone — zanotowane w opisie commita)
- `npm test` przechodzi
- `npm run lint` i `npm run lint:ui` przechodzą
- `npm run test:http` przechodzi bez zmian w istniejących testach (przy działającym `npm run dev`)
- `npm run smoke` przechodzi bez zmian w oczekiwaniach smoke (`BASE_URL=http://localhost:4321`)

#### Manual Verification:

- Na `/ingredients` w przeglądarce: wyszukiwanie z kilkoma trafieniami, z jednym trafieniem, bez trafień i z filtrem kategorii wygląda i działa jak przed zmianą

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed kolejną fazą.

---

## Faza 3: Integracja serwisów — filtr, grupowanie, „najlepszy”

### Overview

Reguły zależne od prawdziwej bazy (RLS, `!inner`, indeks, funkcja SQL) przez serwisy, jako konto tymczasowe, według §6.2.

### Changes Required:

#### 1. Wspólne pomocniki fixture'ów

**File**: `tests/services/fixtures.ts` (nowy), `tests/services/delete.test.ts`

**Intent**: Wydzielić z `delete.test.ts` pomocniki używane też przez nowe pliki, bez zmiany asercji tego pliku.

**Contract**: Pomocniki do wydzielenia, z obecnymi sygnaturami z `delete.test.ts:42-110`:

- `loadCategoryIds`, `idsOf`, `oneId`, `add`, `pairOf`, `substituteOf`;
- nowy `bestIdsOf(pairId)`: id z `is_best = true` w parze, odczyt `adminClient()`.

`add` dostaje opcjonalne `isBest`.

#### 2. Wyszukiwanie przez serwisy

**File**: `tests/services/search.test.ts` (nowy)

**Intent**: Filtr kategorii, grupowanie i kolejność na prawdziwej bazie, z kontami A i B.

**Contract**: Fixture A (nazwy z `runId`):

- „Mąka pszenna” w Ciastach i Daniach mięsnych;
- „Mąka żytnia” tylko w Daniach mięsnych;
- „Cukier” w Ciastach, którego jedyny zamiennik usunięto (`deleteSubstitute`), więc para zostaje pusta (`delete-entries-confirmed/plan.md:50`).

Konto B ma składnik o tej samej nazwie co A.

Asercje (oczekiwania z reguł, obserwacja kluczem admina):

- `listIngredientIdsWithSubstitutes(Ciasta)`:
  - zawiera „Mąka pszenna”;
  - **nie** zawiera „Mąka żytnia”;
  - **nie** zawiera „Cukier” (pusta para);
  - **nie** zawiera id B.
- `listIngredientSubstitutes(pszenna, null)`:
  - grupy w kolejności `sort_order` kategorii (odczyt `categories` kluczem admina);
  - w grupie najpierw najlepszy, potem od najstarszego;
  - kategorie bez zamienników pominięte.
- `listIngredientSubstitutes(pszenna, Ciasta)`: jedna grupa.
- `listIngredientSubstitutes(<id B>, null)` jako A: pusta lista.
- `hasSearchHits`:
  - `true` dla „mąka” bez kategorii;
  - `false` dla „żytnia” + Ciasta;
  - `false` dla prefiksu „ąka”.

#### 3. „Najlepszy” przez serwisy

**File**: `tests/services/best.test.ts` (nowy)

**Intent**: Reguły #6 na sekwencyjnej ścieżce aplikacji (to, co widzi endpoint). Każdy test na świeżym fixturze.

**Contract**: Fixture: składnik w Ciastach z X, Y (bez najlepszego) i w Daniach mięsnych z Z (najlepszy). Wyrocznia: `bestIdsOf` dla obu par, przed i po.

| Akcja                                                    | Oczekiwanie                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------- |
| `setBestSubstitute(X, true)`                             | Ciasta {X}, `replacedName` `null`; Dania {Z}                          |
| `setBestSubstitute(Y, true)`                             | Ciasta {Y}, `replacedName` = nazwa X; Dania {Z}                       |
| ponownie Y                                               | {Y}, `replacedName` `null`                                            |
| `setBestSubstitute(Y, false)`                            | Ciasta {} (stan dozwolony), Dania {Z}                                 |
| `updateSubstitute` najlepszego (nazwa, proporcja, uwagi) | zbiór najlepszych bez zmian                                           |
| `updateSubstitute` nie-najlepszego                       | nie staje się najlepszym                                              |
| `renameIngredient`                                       | zbiory najlepszych w obu parach bez zmian                             |
| `deleteSubstitute(najlepszy)`                            | para {}, żaden inny nie awansuje                                      |
| `setBestSubstitute(<usunięty id>, true)`                 | `code: "not_found"`, poprzedni najlepszy pary nietknięty (przeplot a) |
| `setBestSubstitute(<losowy uuid>)`                       | `not_found`                                                           |
| B na zamienniku A                                        | `not_found`, zbiory A bez zmian                                       |
| `addSubstitute` z `isBest` w parze z najlepszym          | `replacedName` = poprzedni, para {nowy}                               |

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi (harness: 0 kont testowych po sweepie, dane dev bez zmian)
- `npx vitest run --project services tests/services/delete.test.ts` przechodzi bez zmian w asercjach (po wydzieleniu pomocników)
- `npm run lint` przechodzi

#### Manual Verification:

- Złamanie kontrolne: odwrócenie sortowania „najlepszy pierwszy” i pominięcie `!inner` oblewają właściwe przypadki; zmiany wycofane
  (lokalnie, niecommitowane: sortowanie w `listIngredientSubstitutes` → `search.test.ts`; `!inner` w `listIngredientIdsWithSubstitutes` → przypadek pustej pary)

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed kolejną fazą.

---

## Faza 4: Test wyścigu w dwóch sesjach Postgresa

### Overview

Deterministyczne przeploty b i d z kontrolą mutacyjną, która dowodzi, że test b wykrywa regresję F1.

### Changes Required:

#### 1. Zależność i środowisko harnessu

**File**: `package.json`, `tests/harness/env.ts`

**Intent**: Bezpośrednie połączenie z lokalnym Postgresem tylko w testach.

**Contract**:

- devDependencies `pg` i `@types/pg` (instalacja przez `npm i -D`).
- `HarnessEnv` dostaje `dbUrl` z klucza `DB_URL` w `npx supabase status -o env`. Brak klucza daje ten sam komunikat `STACK_DOWN`.

#### 2. Pomocnik sesji

**File**: `tests/harness/pg-sessions.ts` (nowy)

**Intent**: Sesja działająca jako zalogowany użytkownik (RLS jak w aplikacji) i obserwator blokad.

**Contract**:

- `openUserSession(userId)`: łączy, robi `begin`, `set local role authenticated`, `set local request.jwt.claims = '{"sub":"<id>","role":"authenticated"}'`, `set local lock_timeout = '10s'`. Zwraca `{ client, pid }`.
- `openObserver()`: rola pierwotna, tylko do odczytu `pg_blocking_pids`.
- `waitUntilBlockedBy(observer, waiterPid, blockerPid, timeoutMs)`: odpytuje, aż `blockerPid = any(pg_blocking_pids(waiterPid))`, inaczej rzuca błąd czytelny dla człowieka.
- Zamykanie (`rollback` + `end`) w `finally` wywołującego.
- Żadnego logowania `dbUrl`.

#### 3. Testy przeplotów

**File**: `tests/services/best-concurrency.test.ts` (nowy)

**Intent**: Dowód zachowania funkcji przy współbieżności, czyli to, czego pgTAP i supabase-js nie potrafią.

**Contract**: Fixture przez `addSubstitute` jako konto tymczasowe (pomocniki z Phase 3): para z A (najlepszy), B, C. Wyrocznia: `bestIdsOf` i istnienie wierszy kluczem admina.

1. **Przeplot b:**
   - X: `delete from public.substitutes where id = B` bez zatwierdzenia;
   - Y: `select * from public.set_best_substitute(B, true)` rusza;
   - `waitUntilBlockedBy(Y, X)`, potem X `commit`;
   - **oczekiwane:** Y kończy się błędem o kodzie `P0002`, para {A}, B nie istnieje.
2. **Przeplot d:**
   - X: `set_best_substitute(B, true)` bez zatwierdzenia;
   - Y: `set_best_substitute(C, true)` rusza;
   - `waitUntilBlockedBy(Y, X)`, potem X `commit`;
   - **oczekiwane:** Y kończy się błędem `23505`, para {B} (dokładnie jeden).
3. **Kontrola mutacyjna (dawne ciało bez blokady):**
   - sesja Y tworzy `pg_temp.set_best_substitute_unlocked(uuid, boolean)` z ciałem z `supabase/migrations/20261011201658_best_substitute.sql:36-77`. To celowa kopia historycznego mutanta, z komentarzem;
   - ten sam przeplot co b;
   - **oczekiwane:** Y kończy się sukcesem (`substitute_name` = B, `replaced_name` = A), a para {}. To fałszywy sukces, czyli dowód, że przeplot b rozróżnia funkcję z blokadą i bez niej.

Wariant roli dla kontroli według kroku sprawdzającego (Critical Implementation Details).

### Success Criteria:

#### Automated Verification:

- `npx vitest run --project services tests/services/best-concurrency.test.ts` przechodzi 5 razy z rzędu (deterministyczność; pętla w shellu)
- `npm test` przechodzi (harness: 0 kont testowych, dane dev bez zmian; brak wiszących połączeń)
- `npx supabase test db` przechodzi (strażnik regex i pgTAP bez zmian)
- `npm run lint` i `npm run lint:db-access` przechodzą

#### Manual Verification:

- Po przebiegu nie ma pozostawionych sesji testu (`idle in transaction`)
  (sprawdzenie: `select * from pg_stat_activity where state = 'idle in transaction'` albo Studio `http://localhost:54323`)
- Przegląd: kopia ciała w kontroli pochodzi z migracji `20261011201658` i jest opisana jako mutant, a test b nie porównuje tekstu funkcji

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed kolejną fazą.

---

## Faza 5: Wąska warstwa HTTP — ciasteczko i render stanów

### Overview

To, czego unit nie widzi: nagłówek `Set-Cookie`, ciasteczko między żądaniami i faktyczny HTML stanów, według §6.4 (sesja przez `signIn`).

### Changes Required:

#### 1. Nagłówki ciasteczek w kliencie testowym

**File**: `tests/http/client.ts`

**Intent**: Test musi widzieć atrybuty ciasteczka i to, czy odpowiedź je ustawiła.

**Contract**: `HttpResponse` dostaje `setCookies: string[]` (surowe `getSetCookie()`). Istniejące pola i zachowanie słoika bez zmian.

#### 2. Testy wyszukiwania przez HTTP

**File**: `tests/http/search.test.ts` (nowy)

**Intent**: Reguły S-03 widoczne dla użytkownika, na koncie tymczasowym z fixturem przez `addSubstitute`.

**Contract**: Fixture: dwa składniki z `runId` i fragmentem w środku nazwy, jeden z zamiennikiem tylko w drugiej kategorii.

Ciasteczko:

- `?q=<fragment>&match=prefix` ustawia `ingredients_match=prefix` z `Path=/ingredients`, `HttpOnly`, `SameSite=Lax`, `Max-Age=31536000`, bez `Secure` na http;
- kolejne `?q=<fragment>` bez `match` daje brak trafień (tryb z ciasteczka);
- `match=contains` wygrywa z ciasteczkiem i je nadpisuje;
- `match=foo` nie ustawia ciasteczka i działa tryb z ciasteczka;
- ten sam tryb w URL i w ciasteczku nie wysyła `Set-Cookie`.

Render:

- **stan początkowy:** podpowiedź;
- **brak trafień:** „Nie znaleziono składnika „q”.” i link `/ingredients/new?ingredient_name=<q>` (z `category`, gdy wybrana);
- **kilka trafień:**
  - nagłówek „Pasujące składniki (2)”;
  - dokładnie dwa linki z oczekiwanymi nazwami;
  - `href` zawiera `ingredient=<id>`, `q`, `match` (z dekodowaniem `&amp;`);
- **filtr odrzuca jeden:** od razu widok jednego składnika, bez listy;
- **zły `category`:** brak trafień;
- **świeże konto bez składników:** stan „Nie masz jeszcze żadnych składników.”

Teksty to wyrocznia z S-03 `:24-31`, a nie z szablonu.

### Success Criteria:

#### Automated Verification:

- `npm run test:http` przechodzi przy działającym `npm run dev` (istniejące testy bez zmian)
- `npm run test:http` bez serwera kończy się jednym komunikatem „Uruchom `npm run dev`”
- `npm run lint` przechodzi

#### Manual Verification:

- Złamanie kontrolne: zamiana kolejności `urlMode ?? cookieMode` w `resolveMatchMode` oblewa test unit i HTTP; po sprawdzeniu wycofane

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na ręczne potwierdzenie przed kolejną fazą.

---

## Faza 6: Dokumentacja i cookbook

### Overview

Utrwalić wzorce i decyzje fazy w test-planie i dokumentach projektu.

### Changes Required:

#### 1. Test-plan

**File**: `context/foundation/test-plan.md`

**Intent**: Następny kontrybutor dodaje test unit albo test współbieżności bez czytania tej zmiany.

**Contract**:

- **§6.1:** wzorzec unit — kiedy, lokalizacja `tests/unit/`, `npm run test:unit`, bez harnessu i bazy, tabela przykładów ze źródłem w każdym wierszu, plik referencyjny `tests/unit/search-view.test.ts`.
- **§6.2:** podsekcja o teście współbieżności — kiedy (przeplot rozróżnia wersje funkcji), pomocniki `tests/harness/pg-sessions.ts`, sterowanie blokadą przez `pg_blocking_pids`, kontrola mutacyjna w `pg_temp`, plik referencyjny.
- **§6.6:** 2–3 linie notatek fazy 2.
- **§7:** brak składania diakrytyków, brak normalizacji NFC, limit 1000 wierszy w wyszukiwaniu (z warunkiem ponownej oceny).
- **§4:** projekt `unit`, `pg` w wersji z `node_modules` z datą `checked:`, profil bazy testów.
- **§5:** wiersz unit + integration z `npm run test:unit`.
- **§3:** Phase 2 → `complete`.
- **§8:** daty przeglądu.

#### 2. Dokumenty projektu

**File**: `CLAUDE.md`, `README.md`

**Intent**: Komendy zgodne ze skryptami.

**Contract**:

- `npm run test:unit` (bez stosu).
- `npm test` = unit + services.
- Test wyścigu wymaga działającego stosu (bezpośrednie połączenie z `DB_URL`).

### Success Criteria:

#### Automated Verification:

- `npx prettier --check context/foundation/test-plan.md CLAUDE.md README.md` przechodzi
- Każda komenda wymieniona w nowych wpisach §6.1/§6.2 istnieje w `package.json` (sprawdzenie grepem)

#### Manual Verification:

- Przegląd §6.1 i §6.2: osoba spoza zmiany dodałaby według nich nowy test unit i nowy test przeplotu

---

## Testing Strategy

### Unit Tests:

- Dopasowanie, tryb, widok wyszukiwania, URL-e powrotu.
- Brzegi: puste zapytanie, cięcie do 100, zły format id, nieznany tryb, NFD, diakrytyki, filtr redukujący trafienia, błąd filtra.

### Integration Tests:

- Serwisy na lokalnym Supabase: filtr z pustą parą, grupowanie i kolejność, izolacja kont, cały cykl „najlepszego”.
- Dwie sesje `pg`: przeploty b i d oraz kontrola mutacyjna.
- HTTP: ciasteczko i render stanów.

### Manual Testing Steps:

1. Phase 2: przejście wyszukiwania na `/ingredients` (kilka, jedno, zero trafień, filtr).
2. Phase 3 i 5: złamania kontrolne, każde oblewa właściwy test, potem wycofane.
3. Phase 4: brak wiszących sesji po przebiegu.

## Performance Considerations

Projekt `unit` ma trwać sekundy (bez `npx supabase status`). Test wyścigu czeka na blokady z limitem (`lock_timeout`, timeout odpytywania), żeby zawieszenie było błędem, a nie wiszącym przebiegiem.

## Migration Notes

Brak migracji. Test wyścigu i kontrola nie zmieniają schematu bazy dev. Funkcja kontrolna żyje w `pg_temp` i znika z sesją. Fixture'y należą do kont tymczasowych usuwanych sweepem.

## References

- Research: `context/changes/testing-search-and-best/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (#4, #6), §6
- Wyrocznia #4: `context/archive/2026-10-12-ingredient-name-search/plan.md:21-33`, `:124`, `:255-261`; `context/foundation/prd.md:108-114`
- Wyrocznia #6: `context/archive/2026-10-11-best-substitute-highlight/plan.md:19`, `:36`, `:40`; `context/archive/2026-10-24-delete-entries-confirmed/plan.md:16`, `:32`, `:50`, `:55`
- Wzorce: `tests/services/delete.test.ts`, `tests/http/isolation.test.ts`, `tests/http/client.ts`, `supabase/tests/best-substitute.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Projekt `unit` i reguły dopasowania

#### Automated

- [x] 1.1 `npm run test:unit` przechodzi przy zatrzymanym stosie Supabase (`npx supabase stop` albo bez Dockera) i nie wypisuje komunikatów harnessu — 65f0462
- [x] 1.2 `npm test` przechodzi przy działającym stosie (unit + services, harness: 0 kont testowych, dane dev bez zmian) — 65f0462
- [x] 1.3 `npm run lint` przechodzi — 65f0462

#### Manual

- [x] 1.4 Przegląd tabeli przykładów: każdy wiersz ma źródło, a żaden oczekiwany wynik nie jest wyliczony wywołaniem testowanej funkcji — 65f0462

### Phase 2: Wydzielenie trybu i widoku wyszukiwania (test-first) + URL-e powrotu

#### Automated

- [x] 2.1 `npm run test:unit` przechodzi (zanim powstał `src/lib/search-view.ts`, testy widoku były czerwone — zanotowane w opisie commita) — 6573ca2
- [x] 2.2 `npm test` przechodzi — 6573ca2
- [x] 2.3 `npm run lint` i `npm run lint:ui` przechodzą — 6573ca2
- [x] 2.4 `npm run test:http` przechodzi bez zmian w istniejących testach (przy działającym `npm run dev`) — 6573ca2
- [x] 2.5 `npm run smoke` przechodzi bez zmian w oczekiwaniach smoke (`BASE_URL=http://localhost:4321`) — 6573ca2

#### Manual

- [x] 2.6 Na `/ingredients` w przeglądarce: wyszukiwanie z kilkoma trafieniami, z jednym trafieniem, bez trafień i z filtrem kategorii wygląda i działa jak przed zmianą — 6573ca2

### Phase 3: Integracja serwisów — filtr, grupowanie, „najlepszy”

#### Automated

- [x] 3.1 `npm test` przechodzi (harness: 0 kont testowych po sweepie, dane dev bez zmian)
- [x] 3.2 `npx vitest run --project services tests/services/delete.test.ts` przechodzi bez zmian w asercjach (po wydzieleniu pomocników)
- [x] 3.3 `npm run lint` przechodzi

#### Manual

- [x] 3.4 Złamanie kontrolne: odwrócenie sortowania „najlepszy pierwszy” i pominięcie `!inner` oblewają właściwe przypadki; zmiany wycofane

### Phase 4: Test wyścigu w dwóch sesjach Postgresa

#### Automated

- [ ] 4.1 `npx vitest run --project services tests/services/best-concurrency.test.ts` przechodzi 5 razy z rzędu (deterministyczność; pętla w shellu)
- [ ] 4.2 `npm test` przechodzi (harness: 0 kont testowych, dane dev bez zmian; brak wiszących połączeń)
- [ ] 4.3 `npx supabase test db` przechodzi (strażnik regex i pgTAP bez zmian)
- [ ] 4.4 `npm run lint` i `npm run lint:db-access` przechodzą

#### Manual

- [ ] 4.5 Po przebiegu nie ma pozostawionych sesji testu (`idle in transaction`)
- [ ] 4.6 Przegląd: kopia ciała w kontroli pochodzi z migracji `20261011201658` i jest opisana jako mutant, a test b nie porównuje tekstu funkcji

### Phase 5: Wąska warstwa HTTP — ciasteczko i render stanów

#### Automated

- [ ] 5.1 `npm run test:http` przechodzi przy działającym `npm run dev` (istniejące testy bez zmian)
- [ ] 5.2 `npm run test:http` bez serwera kończy się jednym komunikatem „Uruchom `npm run dev`”
- [ ] 5.3 `npm run lint` przechodzi

#### Manual

- [ ] 5.4 Złamanie kontrolne: zamiana kolejności `urlMode ?? cookieMode` w `resolveMatchMode` oblewa test unit i HTTP; po sprawdzeniu wycofane

### Phase 6: Dokumentacja i cookbook

#### Automated

- [ ] 6.1 `npx prettier --check context/foundation/test-plan.md CLAUDE.md README.md` przechodzi
- [ ] 6.2 Każda komenda wymieniona w nowych wpisach §6.1/§6.2 istnieje w `package.json` (sprawdzenie grepem)

#### Manual

- [ ] 6.3 Przegląd §6.1 i §6.2: osoba spoza zmiany dodałaby według nich nowy test unit i nowy test przeplotu
