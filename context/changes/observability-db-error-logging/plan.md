# Logowanie błędów bazy w warstwie serwisów: plan implementacji

## Overview

Fix nr 1 z audytu observability (`context/audits/observability/2026-11-26_auth-writes-lookup.md` §6). Każdy nieoczekiwany błąd bazy i każde złamane założenie w `src/lib/services/substitutes.ts` zostawia jedną linię `console.error` w Workers Logs: operacja z krokiem, kod (`network` przy statusie 0), status, `message`, `hint` i uuid encji — nigdy `details` ani nazwy. `not_found` i `invalid_category` dostają `console.warn`, duplikaty nic. Grupa zamienników bez kategorii (L2) przestaje być cicho pomijana: serwis zwraca błąd i loguje. Zamyka W1, W2, W3, W4, W5, W7, L2, część logującą L1 i nazwę operacji z L5; potwierdza i zamyka follow-up F2 (`context/archive/2026-11-21-testing-validation-and-gates/follow-ups/review-fixes.md`).

## Current State Analysis

Podstawa: audyt (raport wyżej, §2–§5), punkty kontrolne sprawdzone ręcznie w kodzie i w `node_modules`.

- `fail()` (`src/lib/services/substitutes.ts:35-37`) zwraca tylko tekst dla użytkownika. 23 wywołania `fail()` bez argumentów: 17 po prawdziwym błędzie PostgREST (`:85, 91, 127, 134, 142, 152, 160, 178, 209, 238, 286, 338, 383, 403, 429, 449, 469`), 4 „niemożliwe” nulle (`:143, 161, 289, 346`), 2 zewnętrzne w `hasSearchHits` (`:488-489`), które opakowują już obsłużony błąd wewnętrzny. Komentarz `:22-23` („Errors are returned, not thrown; `error` is a short, user-safe message”) był świadomą decyzją UX; nikt nie zachowuje przyczyny.
- postgrest-js 2.116 nie rzuca przy awarii sieci: zwraca `{ error: { message: "TypeError: fetch failed", code: "", details: <stack>, hint: "" }, status: 0 }` (`node_modules/@supabase/postgrest-js/dist/index.mjs:416-456`). Status HTTP siedzi na odpowiedzi (`result.status`), nie na obiekcie błędu. Żaden błąd bazy nie dociera więc do logu Astro.
- `details` z PostgREST zawiera dane użytkownika: dla 23505 „Key (user_id, name_key)=(…, mąka) already exists.”, dla 23514 „Failing row contains (…)”. `message` nazywa ograniczenie albo politykę bez wartości (wyjątek: 22P02 cytuje zły input, dziś chroniony przez `isUuid`).
- Zmapowane dziś: 23505 → `duplicate` (`:177, 382, 428`), 23505 w RPC → komunikat o współbieżnej zmianie (`:283-285`), P0002 → `not_found` (`:281`), 0 wierszy → `not_found` (`:385, 431, 450, 470`), brak kategorii → `invalid_category` (`:128`). Żadne nie loguje.
- `addSubstitute` (`:114-197`) to cztery osobne zapisy bez transakcji; nieudane oznaczenie „najlepszego” po insercie zwraca `ok()` ze stałym `bestError` i gubi kod (`:187-195`).
- `listIngredientSubstitutes` pomija parę z zamiennikami, gdy osadzona kategoria jest pusta (`:244`); `getSubstituteForEdit` w tej samej sytuacji zwraca `fail()` (`:346`). Strona potwierdzenia usunięcia składnika liczy wtedy „0 zamienników”, a kaskada usuwa wszystkie.
- `no-console` = `warn` w `src/` (`eslint.config.js:25`); endpointy auth używają `eslint-disable-next-line` z uzasadnieniem (`src/pages/api/auth/signin.ts:15`). W całym `src/` są dwa wywołania `console.*`.
- Konwencja testów: `test-plan.md` §6.1 zabrania klienta Supabase w `tests/unit/` („nigdy klienta Supabase”, „Nie: mock Supabase”); §6.2 — serwisy na lokalnym stosie przez `createTestUser`. `HarnessEnv` (`tests/harness/env.ts:5-15`) daje `apiUrl` i `publishableKey` dla klienta anonimowego. RPC `set_best_substitute` nie ma `execute` dla `anon` (`supabase/migrations/20261011201658_*.sql:79`), więc wywołanie jako anon daje prawdziwy błąd Postgresa.

## Desired End State

- `src/lib/log.ts` jest jedynym miejscem w `src/lib/`, które woła `console.*`, i jedynym, które wie, jak wygląda linia logu bazy.
- Każda z 17 gałęzi błędu PostgREST w serwisie wywołuje `logDbError` z nazwą operacji (z krokiem w `addSubstitute`) i uuid encji, potem zwraca ten sam `fail()` co dziś — tekst dla użytkownika bez zmian.
- 4 niemożliwe nulle i grupa bez kategorii logują `logInvariant` i zwracają `fail()`.
- `not_found` (P0002 z RPC i 0 wierszy w update/delete) i `invalid_category` logują `logExpected` (warn). Duplikaty (każde 23505) nie logują nic.
- Nieudane oznaczenie „najlepszego” w `addSubstitute` daje jeden warn o częściowym wyniku z id zamiennika; błąd pod spodem loguje `setBestSubstitute` raz. `hasSearchHits` nie loguje drugi raz.
- `tests/unit/db-error-logging.test.ts` (prawdziwy supabase-js, podstawiony `fetch`) i `tests/services/db-error-logging.test.ts` (prawdziwe błędy na lokalnym stosie) są zielone; ani jedna linia logu w testach nie zawiera nazwy z fixture'a.
- `test-plan.md` §6.1 opisuje wyjątek „podstawiony fetch pod prawdziwym supabase-js” tylko dla kontraktu logowania; §6.2 i `CLAUDE.md` mówią, że błędy bazy w serwisach idą przez `src/lib/log.ts`.

Weryfikacja: `npm run test:unit`, `npm test` (stos lokalny), `npm run lint`, `npm run lint:db-access`, `npm run test:http` przy działającym `npm run dev`, ręczny podgląd linii w konsoli dev.

### Key Discoveries:

- `src/lib/services/substitutes.ts:35` — jeden punkt dławienia; zmiana zostaje w jednym pliku serwisu plus nowy moduł.
- `node_modules/@supabase/postgrest-js/dist/index.mjs:449-456` — status 0 i pusty `code` przy awarii sieci; helper musi dostać `status` z odpowiedzi.
- `tests/harness/env.ts:5-15` — `apiUrl` + `publishableKey` wystarczą na klienta anonimowego w teście services, bez nowego pomocnika w harnessie.
- `supabase/migrations/20261011201658_*.sql:79-80` — anon bez `execute` na RPC: źródło prawdziwego 42501 niezależne od kodu pod testem.
- `src/pages/api/auth/signin.ts:12-16` — istniejący wzorzec: `new Error(msg, { cause })`, w komunikacie tylko dane techniczne.

## What We're NOT Doing

- Endpointy i strony: bez zmian statusów (503 dla błędów ładowania strony to fix nr 5), bez logowania pustych `catch {}` wokół `formData()` (fix nr 3, W6), bez kontekstu żądania (ścieżka, `cf-ray`) w linii logu.
- Auth: middleware `getUser()`, sign-in/sign-up/sign-out — fix nr 2 (`logAuthError`), osobny change.
- Brak kodu referencyjnego w komunikacie dla użytkownika (druga połowa L5) — tekst błędu bez zmian.
- `addSubstitute` jako jedno RPC/transakcja (W2) — tu tylko nazwy kroków w logu.
- Logowanie ładowania „not found” na stronach edycji i usuwania (`getSubstituteForEdit`/`getIngredient` → `ok(null)`) — decyzja o warn obejmuje tylko P0002 i 0 wierszy w update/delete.
- Logowanie duplikatów ani konfliktu współbieżnego 23505 w RPC.
- Logowanie `details`, nazw składników i zamienników, notatek, fraz wyszukiwania, e-maili.
- Tracker błędów, alerty, zmiany w `wrangler.jsonc`.
- Strona `src/pages/dev/kitchen-sink.astro` — żaden widok ani komponent się nie zmienia.

## Implementation Approach

Mały moduł `src/lib/log.ts` z trzema funkcjami o stałym formacie, wołany z gałęzi w serwisie; serwis dalej zwraca te same `ServiceResult`. Kolejność według kosztu × sygnału: najpierw 17 gałęzi błędu (najwięcej ślepoty usuwa), potem niemożliwe przypadki i oczekiwane wyniki (mniej linii, decyzje o szumie), na końcu dowód na prawdziwym Postgresie i dokumentacja. Każda faza zaczyna się od czerwonego testu.

Testy unit: prawdziwy `createClient` z `@supabase/supabase-js` z `global.fetch` podstawionym przez funkcję testu (trasowanie po metodzie i ścieżce: odpowiedź PostgREST z kodem, odrzucenie jak przy awarii sieci, błąd na wybranym kroku). postgrest-js parsuje odpowiedź naprawdę, więc test widzi te same pola co produkcja; kształt odpowiedzi z fixture'ów potwierdza test services na prawdziwym stosie (faza 3). Wyrocznia: literały z decyzji tego planu i z audytu (nazwa operacji, `code=23514`, `code=network`, `status=0`, nazwa ograniczenia z fixture'a) oraz brak nazwy z fixture'a w każdej linii — nigdy wartości liczone funkcjami serwisu.

## Critical Implementation Details

**Format linii.** Workers Logs pokazuje `Error` jako nazwę, komunikat i stos; zagnieżdżony `cause` najpewniej nie jest rozwijany (audyt §2, założenie niepotwierdzone). Wszystkie pola diagnostyczne muszą więc być w tekście komunikatu, a `cause` niesie tylko ich obiektową kopię (bez `details`). Przedrostek `[db]` pozwala wyszukać wszystkie linie jednym zapytaniem.

**Bez podwójnego logu.** Błąd loguje funkcja, która dostała go od PostgREST. Wywołujący, który dostaje już `ServiceResult` z błędem (`hasSearchHits` → `listIngredients`; `addSubstitute` → `setBestSubstitute`), nie loguje tego samego błędu drugi raz. Jedyny wyjątek to warn o częściowym wyniku w `addSubstitute`: inne zdarzenie (zamiennik zapisany bez oznaczenia), z id zamiennika.

## Phase 1: Moduł logu i nieoczekiwane błędy bazy

### Overview

Nowy `src/lib/log.ts` i 17 gałęzi błędu PostgREST w serwisie, test-first. Zamyka W1, W2 (nazwy kroków), W5 (niezmapowane kody RPC) i część logującą L1.

### Changes Required:

#### 1. Test kontraktu logowania (czerwony przed zmianą)

**File**: `tests/unit/db-error-logging.test.ts`

**Intent**: Dowieść na prawdziwym supabase-js, że błąd bazy daje jedną linię `console.error` z polami diagnostycznymi i bez danych użytkownika. Nagłówek pliku nazywa ryzyko (audyt W1/W2/W5, follow-up F2), źródła wyroczni (ten plan: Key Decisions; audyt §5) i wyjątek od §6.1 (prawdziwy klient, podstawiony tylko transport). Plik nie importuje `tests/harness/`.

**Contract**: Przypadki (`it` albo `it.each` z komentarzem źródła w każdym wierszu):

- awaria sieci (podstawiony `fetch` odrzuca jak `fetch failed`) w `listCategories` → jedna linia z `listCategories`, `code=network`, `status=0`; wynik serwisu to nadal ogólny komunikat;
- odpowiedź 400 z `code: "23514"`, `message` z nazwą ograniczenia `ingredients_name_key_matches_name`, `details` z nazwą z fixture'a (np. „Mąka tortowa”) w `renameIngredient` → linia zawiera `renameIngredient`, `code=23514`, `status=400`, nazwę ograniczenia i uuid składnika; **nie zawiera** nazwy z fixture'a ani tekstu `details`;
- błąd na wybranym kroku `addSubstitute` (upsert pary, insert zamiennika) → nazwa operacji z krokiem, np. `addSubstitute.pairUpsert`, `addSubstitute.substituteInsert`;
- niezmapowany kod z RPC (np. 42501) w `setBestSubstitute` → linia z `setBestSubstitute`, `code=42501`, uuid zamiennika;
- 23505 w `addSubstitute`/`updateSubstitute`/`renameIngredient` i 23505 z RPC → zero wywołań `console.error` i `console.warn` (decyzja o szumie; ten przypadek może przejść już przed zmianą — to strażnik regresji, nie czerwony krok).
  `console.error`/`console.warn` przez `vi.spyOn(...).mockImplementation(() => {})`, przywracane po każdym teście. Klient: `createClient(url, key, { global: { fetch }, auth: { persistSession: false, autoRefreshToken: false } })`.

#### 2. Moduł logu

**File**: `src/lib/log.ts` (nowy)

**Intent**: Jedno miejsce z formatem linii i jedynym wyjątkiem od `no-console` w `src/lib/`, z komentarzem, że innego loggera w aplikacji nie ma, a Workers Logs zbiera konsolę.

**Contract**:

- `logDbError(op: string, failure: { error: PostgrestError; status: number }, ids?: Record<string, string>): void` → `console.error(new Error(<msg>, { cause: { op, code, status, message, hint, ...ids } }))`, gdzie `<msg>` = `[db] <op> failed: code=<code lub "network" gdy pusty> status=<status> message=<JSON.stringify(message)>` + ` hint=<JSON.stringify(hint)>` gdy niepusty + ` <klucz>=<wartość>` dla każdego id. `details` nigdy nie trafia ani do komunikatu, ani do `cause`.
- `ids` przyjmuje tylko uuid (np. `ingredientId`, `categoryId`, `substituteId`); wywołujący nigdy nie przekazuje nazw.
- Funkcje fazy 2 (`logInvariant`, `logExpected`) dochodzą w tym samym pliku.

#### 3. Gałęzie błędu w serwisie

**File**: `src/lib/services/substitutes.ts`

**Intent**: W każdej z 17 gałęzi po `error` od PostgREST zawołać `logDbError` przed `fail()`; tekst i `code` wyniku bez zmian. Gałęzie 23505 i P0002 zostają bez `logDbError` (P0002 dostaje warn w fazie 2). Komentarz `:22-23` dopisuje, że przyczyna idzie do logu przez `src/lib/log.ts`.

**Contract**: Nazwy operacji = nazwa funkcji eksportowanej; w `addSubstitute` z krokiem: `addSubstitute.categoryLookup`, `.ingredientUpsert`, `.ingredientSelect`, `.pairUpsert`, `.pairSelect`, `.substituteInsert`. Żeby przekazać `status`, gałęzie czytają cały wynik zapytania (dziś część destrukturyzuje tylko `{ data, error }`). Ids: to, co funkcja dostała jako argument (`ingredientId`, `categoryId`, `substituteId`) i ustalone po drodze w `addSubstitute`.

### Success Criteria:

#### Automated Verification:

- Nowe przypadki w `tests/unit/db-error-logging.test.ts` są czerwone przed zmianą w serwisie (poza strażnikiem duplikatów): `npx vitest run --project unit tests/unit/db-error-logging.test.ts`
- Te same przypadki zielone po zmianie: `npm run test:unit`
- Lint bez nowych ostrzeżeń `no-console` poza `src/lib/log.ts`: `npm run lint`
- Strażnik dostępu do bazy dalej zielony: `npm run lint:db-access`
- Istniejące testy serwisów zielone na lokalnym stosie: `npm test`

#### Manual Verification:

- Jedna linia z przypadku 23514 wypisana przez `npx vitest run --project unit tests/unit/db-error-logging.test.ts --silent=false` (z tymczasowo wyłączonym mockiem albo przez `console.log` w teście, nie commitowany) czyta się jako diagnoza: operacja, kod, status, ograniczenie, uuid; bez nazwy

**Implementation Note**: Po fazie i zielonej automatyce zatrzymaj się na ręczne potwierdzenie przed fazą 2.

---

## Phase 2: Złamane założenia i oczekiwane wyniki

### Overview

Niemożliwe nulle, grupa bez kategorii, warn dla `not_found`/`invalid_category`, częściowy wynik w `addSubstitute`, brak podwójnego logu. Zamyka W3, W4, W7, L2 i nazwę operacji z L5.

### Changes Required:

#### 1. Test (czerwony przed zmianą)

**File**: `tests/unit/db-error-logging.test.ts`

**Intent**: Dopisać przypadki dla złamanych założeń i oczekiwanych wyników, z tym samym podstawionym `fetch`.

**Contract**:

- upsert składnika OK, ale select zwraca pusty wynik → `console.error` z `addSubstitute.ingredientSelect` i informacją o złamanym założeniu; analogicznie para (`addSubstitute.pairSelect`);
- RPC zwraca pustą tablicę → `console.error` z `setBestSubstitute` i id zamiennika;
- `getSubstituteForEdit` z wierszem bez pary/składnika/kategorii → `console.error` z nazwą brakującej relacji i id zamiennika;
- `listIngredientSubstitutes`: para z zamiennikami i `categories: null` → wynik to ogólny błąd (nie pusta lista) i `console.error` z `listIngredientSubstitutes` i `ingredientId`; para bez zamienników dalej pomijana bez logu (brzeg);
- 0 wierszy w `updateSubstitute`, `renameIngredient`, `deleteSubstitute`, `deleteIngredient` i P0002 z RPC → jeden `console.warn` z operacją, `not_found` i uuid; zero `console.error`;
- nieznana kategoria w `addSubstitute` → jeden `console.warn` z `invalid_category` i `categoryId`;
- `addSubstitute` z `isBest`, insert OK, RPC zwraca P0002 → wynik `ok` z `bestError` jak dziś, jeden warn `addSubstitute.markBest` z id zamiennika; RPC z niezmapowanym kodem → jedna linia `console.error` z `setBestSubstitute` plus jeden warn `addSubstitute.markBest`;
- `hasSearchHits` przy awarii sieci → po jednej linii dla każdego wewnętrznego zapytania (`listIngredients`, `listIngredientIdsWithSubstitutes`), żadnej z `hasSearchHits`.

#### 2. Moduł logu

**File**: `src/lib/log.ts`

**Intent**: Dwie funkcje obok `logDbError`, ten sam przedrostek i sposób zapisu id.

**Contract**:

- `logInvariant(op: string, reason: string, ids?: Record<string, string>): void` → `console.error(new Error("[db] <op> broken invariant: <reason> <ids>"))`; `reason` to stały tekst z kodu (np. `"pair select returned no row after upsert"`), nigdy dane.
- `logExpected(op: string, outcome: "not_found" | "invalid_category", ids?: Record<string, string>): void` → `console.warn("[db] <op>: <outcome> <ids>")`.

#### 3. Serwis

**File**: `src/lib/services/substitutes.ts`

**Intent**: `logInvariant` w `:143, 161, 289, 346` i w nowej gałęzi grupy bez kategorii; `logExpected` w `:128, 281, 385, 431, 450, 470`; warn o częściowym wyniku w `:188-195`; `hasSearchHits` bez nowych logów.

**Contract**: `listIngredientSubstitutes` zmienia zachowanie: para z co najmniej jednym zamiennikiem i pustą kategorią → `fail()` (ogólny komunikat), para bez zamienników → dalej `continue`. Docstring `:221-226` opisuje nową regułę. Warn w `addSubstitute` używa operacji `addSubstitute.markBest` i `substituteId`. `ServiceResult` i komunikaty dla użytkownika bez zmian.

### Success Criteria:

#### Automated Verification:

- Nowe przypadki czerwone przed zmianą w serwisie: `npx vitest run --project unit tests/unit/db-error-logging.test.ts`
- Zielone po zmianie: `npm run test:unit`
- `npm run lint`
- Istniejące testy serwisów zielone (w tym `tests/services/search.test.ts` i `delete.test.ts` po zmianie L2): `npm test`
- Testy HTTP zielone przy działającym `npm run dev`: `npm run test:http`

#### Manual Verification:

- Przy `npm run dev` i lokalnym stosie: otwórz potwierdzenie usunięcia zamiennika w dwóch kartach, usuń w pierwszej, potwierdź w drugiej → strona pokazuje „Nie znaleziono zamiennika.”, a konsola dev ma jedną linię `[db] deleteSubstitute: not_found substituteId=<uuid>` bez nazwy

**Implementation Note**: Po fazie i zielonej automatyce zatrzymaj się na ręczne potwierdzenie przed fazą 3.

---

## Phase 3: Dowód na prawdziwym stosie i dokumentacja

### Overview

Test services, który potwierdza, że prawdziwe błędy PostgREST niosą pola, które logujemy, i że oczekiwane wyniki nie logują jako błąd. Potem cookbook i reguły projektu.

### Changes Required:

#### 1. Test na lokalnym stosie

**File**: `tests/services/db-error-logging.test.ts`

**Intent**: Wyrocznia niezależna od fixture'ów z fazy 1: grant w migracji (`20261011201658_*.sql:79`) i reguły z tego planu. Nagłówek nazywa ryzyko i to, że plik potwierdza kształt odpowiedzi użyty w `tests/unit/db-error-logging.test.ts`.

**Contract**:

- klient anonimowy (`createClient(harnessEnv().apiUrl, harnessEnv().publishableKey)`, bez sesji) → `setBestSubstitute(anon, randomUUID(), true)` → jedna linia `console.error` z `setBestSubstitute`, `code=42501`, statusem 4xx różnym od 0 i niepustym `message`;
- `createTestUser("db-log-notfound")` → `deleteSubstitute(user.client, randomUUID())` → jeden `console.warn` z `not_found`, zero `console.error`;
- `createTestUser("db-log-dup")` → dwa razy ten sam `addSubstitute` (nazwy z `runId`) → drugi zwraca `code: "duplicate"`, zero `console.error` i `console.warn`, a żadna linia nie zawiera nazwy.
  Fixture'y przez `add`/`loadCategoryIds` z `tests/harness/fixtures.ts`; sprzątanie przez sweep (§6.2).

#### 2. Cookbook testów

**File**: `context/foundation/test-plan.md`

**Intent**: §6.1 dostaje nazwany wyjątek: w `tests/unit/` wolno użyć prawdziwego `createClient` z podstawionym `global.fetch` wyłącznie do kontraktu logowania błędów bazy (plik referencyjny `tests/unit/db-error-logging.test.ts`), z warunkiem, że kształt odpowiedzi potwierdza test w `tests/services/`. §6.2 dostaje akapit: test serwisu, który sprawdza logowanie, szpieguje `console.error`/`console.warn` i sprawdza brak nazw w liniach (plik referencyjny `tests/services/db-error-logging.test.ts`). §8 (Freshness Ledger) dostaje wpis z datą, jeśli tabela tego wymaga.

**Contract**: Sekcje §6.1 „Granica”/„Nie” i §6.2; reszta dokumentu bez zmian.

#### 3. Reguły projektu

**File**: `CLAUDE.md`

**Intent**: W punkcie „Services/helpers” jedno zdanie: błąd bazy w serwisie loguj przez `src/lib/log.ts` (`logDbError`/`logInvariant`/`logExpected`) przed zwróceniem `fail()`; nigdy `details`, nazw ani danych użytkownika. Commit tylko tego hunka (blok 10x-cli w `CLAUDE.md` zostaje poza commitem).

**Contract**: Linia „Services/helpers” w `## Key conventions`.

#### 4. Notatka w change

**File**: `context/changes/observability-db-error-logging/change.md`

**Intent**: W `## Notes` lista znalezisk z audytu zamkniętych przez ten change (W1, W2 częściowo — tylko log, W3, W4, W5, W7, L2, L1 część logująca, L5 nazwa operacji) i F2, żeby `/10x-observability-audit --verify` miał punkt odniesienia.

**Contract**: Sekcja `## Notes`.

### Success Criteria:

#### Automated Verification:

- Nowy test services zielony: `npx vitest run --project services tests/services/db-error-logging.test.ts`
- Pełny przebieg na lokalnym stosie: `npm test`
- `npm run test:unit`
- `npm run lint`
- `npx prettier --check context/foundation/test-plan.md`

#### Manual Verification:

- Przegląd §6.1 i §6.2 w `test-plan.md`: wyjątek jest wąski (tylko kontrakt logowania) i wskazuje oba pliki referencyjne
- Linia w `CLAUDE.md` jest jedyną zmianą tego pliku w commicie

**Implementation Note**: Po fazie i zielonej automatyce zatrzymaj się na ręczne potwierdzenie; potem `/10x-impl-review observability-db-error-logging`.

---

## Testing Strategy

### Unit Tests:

- `tests/unit/db-error-logging.test.ts`: prawdziwy supabase-js, podstawiony `fetch`; awaria sieci, 23514 z danymi w `details`, błąd na wybranym kroku `addSubstitute`, niezmapowany kod RPC, niemożliwe nulle, grupa bez kategorii, `not_found`/`invalid_category` jako warn, duplikaty bez logu, brak podwójnego logu.
- Każda linia sprawdzana na obecność literałów (operacja, kod, status, uuid) i nieobecność nazwy z fixture'a.

### Integration Tests:

- `tests/services/db-error-logging.test.ts`: prawdziwy 42501 (RPC jako anon), `not_found` na prawdziwym delete, duplikat na prawdziwym insercie.
- Istniejące `tests/services/*.test.ts` i `tests/http/*.test.ts` dowodzą, że komunikaty dla użytkownika i zachowanie endpointów się nie zmieniły (poza L2).

### Manual Testing Steps:

1. Linia 23514 z testu unit czytana jako diagnoza (faza 1).
2. Dwie karty, usunięcie tego samego zamiennika: warn w konsoli dev, bez nazwy (faza 2).
3. Przegląd wyjątku w §6.1 i linii w `CLAUDE.md` (faza 3).

## Performance Considerations

Jedno wywołanie konsoli na nieudane zapytanie; ścieżka sukcesu bez zmian.

## Migration Notes

Brak migracji. Po deployu linie pojawiają się w Workers Logs pod przedrostkiem `[db]`.

## References

- Audyt: `context/audits/observability/2026-11-26_auth-writes-lookup.md` (§4 przyczyna 1, §5 W1–W8 i L1–L6, §6 fix nr 1)
- Follow-up F2: `context/archive/2026-11-21-testing-validation-and-gates/follow-ups/review-fixes.md`
- Wzorzec logu: `src/pages/api/auth/signin.ts:12-16`
- Cookbook: `context/foundation/test-plan.md` §6.1, §6.2

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Moduł logu i nieoczekiwane błędy bazy

#### Automated

- [x] 1.1 Nowe przypadki w `tests/unit/db-error-logging.test.ts` są czerwone przed zmianą w serwisie (poza strażnikiem duplikatów)
- [x] 1.2 Te same przypadki zielone po zmianie: `npm run test:unit`
- [x] 1.3 Lint bez nowych ostrzeżeń `no-console` poza `src/lib/log.ts`: `npm run lint`
- [x] 1.4 Strażnik dostępu do bazy dalej zielony: `npm run lint:db-access`
- [x] 1.5 Istniejące testy serwisów zielone na lokalnym stosie: `npm test`

#### Manual

- [x] 1.6 Linia z przypadku 23514 czyta się jako diagnoza: operacja, kod, status, ograniczenie, uuid; bez nazwy

### Phase 2: Złamane założenia i oczekiwane wyniki

#### Automated

- [ ] 2.1 Nowe przypadki czerwone przed zmianą w serwisie
- [ ] 2.2 Zielone po zmianie: `npm run test:unit`
- [ ] 2.3 `npm run lint`
- [ ] 2.4 Istniejące testy serwisów zielone: `npm test`
- [ ] 2.5 Testy HTTP zielone przy działającym `npm run dev`: `npm run test:http`

#### Manual

- [ ] 2.6 Dwie karty, usunięcie tego samego zamiennika: „Nie znaleziono zamiennika.” i jedna linia warn w konsoli dev bez nazwy

### Phase 3: Dowód na prawdziwym stosie i dokumentacja

#### Automated

- [ ] 3.1 Nowy test services zielony: `npx vitest run --project services tests/services/db-error-logging.test.ts`
- [ ] 3.2 Pełny przebieg na lokalnym stosie: `npm test`
- [ ] 3.3 `npm run test:unit`
- [ ] 3.4 `npm run lint`
- [ ] 3.5 `npx prettier --check context/foundation/test-plan.md`

#### Manual

- [ ] 3.6 Wyjątek w §6.1 jest wąski i wskazuje oba pliki referencyjne
- [ ] 3.7 Linia w `CLAUDE.md` jest jedyną zmianą tego pliku w commicie
