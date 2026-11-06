# Testy izolacji kont i usuwania — Implementation Plan

## Overview

Faza 1 rolloutu z `context/foundation/test-plan.md` („Izolacja i usuwanie”, ryzyka #1, #2, #5). Stawiamy pierwszy runner TS (Vitest) z harnessem, który zakłada konta tymczasowe i dowodzi, że dane deweloperskie po przebiegu są nietknięte. Na nim budujemy testy, które dowodzą, że usuwanie kasuje dokładnie to, co trzeba (serwisy na prawdziwej bazie), i że konto B nie dosięga danych A przez endpointy (HTTP, dwa konta). Dokładamy statycznego strażnika konwencji, na której stoi bezpieczeństwo RLS, i uzupełniamy cookbook.

## Current State Analysis

- Brak runnera TS. Istnieje 5 plików pgTAP w `supabase/tests/` (ręcznie, `npx supabase test db`) i ręczny `scripts/smoke.mjs` (~60 kroków HTTP przy działającym serwerze). CI nie uruchamia testów.
- Usuwanie: `deleteSubstitute` / `deleteIngredient` to `delete().eq("id", …).select("name").maybeSingle()` przez klienta użytkownika (`src/lib/services/substitutes.ts:429-437`, `:449-457`); kaskada w bazie (FK `on delete cascade`, `supabase/migrations/20261004120000_substitute_database.sql:57`, `:89`). Reguły SQL są pokryte pgTAP (`supabase/tests/delete-entries.sql:79-100`, `:126-161`); warstwa TS — nie.
- Potwierdzenie usunięcia składnika istnieje tylko w UI: endpoint nie ma pola potwierdzenia (`src/pages/api/ingredients/delete.ts:51-57`). F2 z S-05 (ekran z GET vs kaskada z POST) jest zaakceptowanym ograniczeniem.
- Izolacja: jedyny klient to anon/publishable + JWT z ciasteczek (`src/lib/supabase.ts:9`); w `src/`, `supabase/migrations/`, `scripts/` brak `service_role` i `security definer`. Cudze id i losowy uuid trafiają w tę samą gałąź `not_found`. Bezpieczeństwo trzyma się więc konwencji, której nic nie pilnuje.
- Dane testowe: smoke zakłada konta `smoke-<Date.now()>@<SMOKE_EMAIL_DOMAIN|mailinator.com>` i `…-b@…` (`scripts/smoke.mjs:7-10`) i nie sprząta. Wszystkie tabele użytkownika mają `user_id … references auth.users on delete cascade` i RLS per użytkownik, więc usunięcie konta kasuje jego dane i nie dotyka cudzych.
- Lokalny stos Supabase działa; `npx supabase status -o env` zwraca m.in. `API_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY`, `SERVICE_ROLE_KEY`, `DB_URL` (sprawdzone 2026-11-04, tylko nazwy zmiennych).
- Szczegóły i kotwice: `context/changes/testing-isolation-and-delete/research.md`.

## Desired End State

- `npm test` uruchamia Vitest (testy serwisów i harnessu) bez serwera; `npm run test:http` uruchamia testy endpointów przy działającym `npm run dev`; `npm run test:sweep` sprząta konta tymczasowe; `npm run lint:db-access` pilnuje konwencji dostępu do bazy.
- Każdy przebieg testów kończy się weryfikacją harnessu: po sweepie nie zostaje żadne konto wzorca testowego, a hash danych deweloperskich (spoza wzorca) jest identyczny przed i po. Zaległe konta smoke znikają przy pierwszym sweepie.
- Testy dowodzą (na prawdziwym Supabase): usunięcie zamiennika usuwa dokładnie jeden wiersz; usunięcie składnika usuwa dokładnie zbiór pokazany przez źródło danych ekranu potwierdzenia (bez zmian pomiędzy); konto B z id konta A dostaje to samo co z losowym uuid, a stan A się nie zmienia.
- `test-plan.md` §6.2–6.4 opisuje działające wzorce; §1/§2/§4 zawierają poprawki z research; `CLAUDE.md` zna nowe komendy.

### Key Discoveries:

- Serwisy przyjmują `SupabaseClient` jako argument i importują tylko typy supabase-js oraz `@/lib/entry-fields` (`src/lib/services/substitutes.ts:1-13`) — testowalne zwykłym Vitestem bez Astro i bez adaptera Cloudflare.
- `getViteConfig()` z adapterem Cloudflare uruchamia Miniflare w Vitest (wnioskowanie z dist, research §Runner) — omijamy.
- Vitest 5.1.0 (npm, 2026-11-02), peer `vite ^6.4 || ^7 || ^8`; zainstalowany vite 8.3.0, Node 22.23.
- `supabase/config.toml:209`: `enable_confirmations = false`.
- Konwencja pgTAP: `begin;` … `select * from finish();` `rollback;`, stałe UUID per plik, `set local role authenticated; set local request.jwt.claims = …` (`supabase/tests/rls-isolation.sql:5-95`).
- Smoke wysyła nagłówek `Origin: BASE_URL` (`scripts/smoke.mjs:125`) — wymagany przez domyślne `checkOrigin` Astro dla POST formularzy.
- Pola formularzy: `ingredient_id` (`IngredientRenameForm.astro:48`), `substitute_id`, `name`, `ratio`, `notes` (`SubstituteEditForm.astro:68-109`) plus pola widoku `ingredient`, `category`, `q`, `match`.

## What We're NOT Doing

- **Nie wymuszamy potwierdzenia usunięcia po stronie serwera.** FR-007 pozostaje spełnione przez UI (jedyna ścieżka UI prowadzi przez stronę potwierdzenia); bezpośredni POST na `/api/ingredients/delete` nadal usuwa składnik. Ochronę przed cudzym formularzem daje `checkOrigin`. Decyzja planu 2026-11-04.
- **Nie naprawiamy F2** (rozjazd GET/POST przy równoległej zmianie). Test sekwencyjny dokumentuje zaakceptowane ograniczenie z S-05.
- Nie zmieniamy logiki smoke (tylko sweep sprząta jego konta).
- Nie podpinamy testów ani `lint:db-access` do CI — to Faza 4 rolloutu.
- Nie używamy `getViteConfig()`, Container API ani importu handlerów tras.
- Nie testujemy hermetycznie mapowania błędów DB innych niż „nie znaleziono” (`formRedirect`) — Faza 4 rolloutu (walidacja i bramki).
- Nie uruchamiamy `supabase db reset`, nie stawiamy drugiego stosu Supabase, nie zapisujemy sekretów do `.env`.
- Mutation testing (Stryker) — poza zakresem; ewentualnie selektywnie po fazie.

## Implementation Approach

Harness najpierw, bo każdy kolejny test go potrzebuje i bo to on dowodzi ryzyka #5. Potem tani strażnik statyczny (#2, konwencja). Potem reguły usuwania na poziomie serwisów — najtańsza warstwa, która widzi filtr w TS i prawdziwą kaskadę (#1). Potem HTTP z dwoma kontami — jedyna warstwa, która widzi redirecty, teksty błędów i middleware (#2). Na końcu cookbook i synchronizacja dokumentów.

Wyrocznie pochodzą z PRD (FR-007, Access Control), z decyzji tego planu i z niezależnych obserwacji stanu bazy (zbiory id czytane kluczem admina), nigdy z wartości zwracanych przez testowany kod. Każda reguła ma co najmniej jeden przypadek brzegowy.

## Critical Implementation Details

- **Sekrety tylko w pamięci procesu testów.** Harness czyta `API_URL`, `PUBLISHABLE_KEY` i `SECRET_KEY` z `npx supabase status -o env` przy starcie, nigdy ich nie loguje ani nie zapisuje. Gdy stos nie działa, test kończy się czytelnym błędem („uruchom `npx supabase start`”), nie pustym przebiegiem.
- **Wzorzec sweepu musi być wąski.** Usuwane są wyłącznie konta pasujące w całości do: `vitest-<runId>-<etykieta>@example.test` oraz `smoke-<13 cyfr>@<domena smoke>` / `smoke-<13 cyfr>-b@<domena smoke>`, gdzie domena smoke to `SMOKE_EMAIL_DOMAIN` albo `mailinator.com`. Jeśli lokalny GoTrue odrzuci domenę `example.test` przy `admin.createUser`, przejść na `vitest-…@mailinator.com` i zaktualizować wzorzec oraz jego test.
- **Hash danych dev nie może zależeć od logowania.** Dla `auth.users` hashować tylko `id` i `email` (nie `last_sign_in_at`/`updated_at`); dla `ingredients`, `ingredient_categories`, `substitutes` — wszystkie kolumny treści wierszy, których `user_id` nie należy do kont wzorca; `categories` — wszystkie wiersze. Sortowanie po `id` przed hashowaniem. Równoległa praca dewelopera w aplikacji w trakcie przebiegu da fałszywy alarm — to zamierzone (komunikat ma to mówić).
- **Testy HTTP wymagają działającego dev.** Zgodnie z dotychczasową praktyką: dev w tle (`ASTRO_DEV_BACKGROUND=1`, limit 30 s na start), zatrzymanie przez `npx astro dev stop`; nie uruchamiać `npm run build` ani `npx astro check`, gdy dev działa.

## Faza 1: Runner i harness

### Overview

Vitest z dwoma projektami (`services`, `http`), harness kont tymczasowych, sweep, snapshot danych dev przed/po i test wąskości wzorca. Dowodzi ryzyka #5.

### Changes Required:

#### 1. Zależność i skrypty

**File**: `package.json`

**Intent**: Dodać runner i komendy, które kolejne fazy i cookbook będą wywoływać.

**Contract**: devDependency `vitest` `^5.1.0`. Skrypty: `test` → projekt `services`; `test:http` → projekt `http`; `test:sweep` → samodzielny sweep kont wzorca (bez testów).

#### 2. Konfiguracja Vitest

**File**: `vitest.config.ts`

**Intent**: Zwykły Vitest bez konfiguracji Astro; alias `@/` → `src/`; wspólny global setup harnessu.

**Contract**: `test.projects`: `services` (`tests/services/**/*.test.ts`, `tests/harness/**/*.test.ts`, `tests/scripts/**/*.test.ts`), `http` (`tests/http/**/*.test.ts`, bez równoległości plików). Oba używają `tests/harness/global-setup.ts`. Środowisko `node`.

#### 3. Harness

**File**: `tests/harness/env.ts`, `tests/harness/accounts.ts`, `tests/harness/sweep.ts`, `tests/harness/snapshot.ts`, `tests/harness/global-setup.ts`

**Intent**: Jedno miejsce, które daje testom prawdziwe, zalogowane klienty dla kont tymczasowych i gwarantuje sprzątanie oraz weryfikację danych dev.

**Contract**:

- `env.ts`: odczyt `API_URL`, `PUBLISHABLE_KEY`, `SECRET_KEY` z `npx supabase status -o env` (raz na proces); czytelny błąd, gdy stos nie działa.
- `accounts.ts`: `isSweepableEmail(email): boolean` (wzorzec z Critical Implementation Details); `createTestUser(label)` → konto przez `auth.admin.createUser` (`email_confirm: true`, losowe hasło) i klient supabase-js zalogowany kluczem publishable (`signInWithPassword`); zwraca `{ id, email, password, client }`. `adminClient()` — klient z kluczem secret, tylko do sweepu i obserwacji stanu.
- `sweep.ts`: listuje wszystkich użytkowników (z paginacją), usuwa pasujących do `isSweepableEmail`, zwraca liczbę; uruchamialny samodzielnie (`npm run test:sweep`).
- `snapshot.ts`: `devSnapshot()` → hash (zasady z Critical Implementation Details).
- `global-setup.ts`: setup = sweep → snapshot; teardown = sweep → asercja „0 kont wzorca” → asercja „snapshot identyczny”, w przeciwnym razie błąd przebiegu z różnicą liczności per tabela.

#### 4. Testy harnessu

**File**: `tests/harness/accounts.test.ts`, `tests/harness/harness.test.ts`

**Intent**: Dowieść, że sweep nigdy nie trafi w prawdziwe konto i że konto tymczasowe działa pod RLS.

**Contract**:

- `accounts.test.ts` (unit, `it.each`): **zachowanie** — wzorzec pasuje do `vitest-<runId>-a@example.test`, `smoke-1730000000000@mailinator.com`, `smoke-1730000000000-b@mailinator.com`; **nie pasuje** do adresu dewelopera, `smoke@mailinator.com`, `smoke-test@mailinator.com`, `smoke-123@mailinator.com` (nie 13 cyfr), `xsmoke-1730000000000@mailinator.com`, `smoke-1730000000000@gmail.com`, `vitest@example.test`, pustego napisu. **Regresja**: poluzowanie wzorca (np. prefiks bez kotwic). **Źródło wyroczni**: decyzja planu (wąski wzorzec), format smoke `scripts/smoke.mjs:7-10`. **Antywzorzec unikany**: wzorzec skopiowany do testu — oczekiwania to literalne adresy.
- `harness.test.ts` (integracja): konto tymczasowe wstawia własny składnik i widzi go; drugie konto tymczasowe go nie widzi. Teardown dowodzi, że dane dev się nie zmieniły. **Brzeg**: konto bez danych widzi pustą listę, nie błąd.

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi (testy wzorca i harnessu), a teardown raportuje 0 kont wzorca i identyczny snapshot
- `npm run test:sweep` kończy się sukcesem i wypisuje liczbę usuniętych kont
- `npm run lint` przechodzi (nowe pliki objęte typowanym lintem)
- `npx prettier --check vitest.config.ts tests` przechodzi

#### Manual Verification:

- Liczności danych dev w Studio identyczne przed i po `npm test`, konta `smoke-*` usunięte (Studio: localhost:54323, Table Editor i Authentication)
- Przerwany przebieg zostawia konta `vitest-*`, które usuwa następny `npm test` lub `npm run test:sweep` (przerwanie: Ctrl+C w trakcie `npm test`)

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie ręcznych kroków, zanim przejdziesz dalej.

---

## Faza 2: Strażnik dostępu do bazy

### Overview

Tani skrypt statyczny, który łamie się, gdy aplikacja przestaje działać wyłącznie jako zalogowany użytkownik. Chroni założenie, na którym stoi ryzyko #2.

### Changes Required:

#### 1. Skrypt i komenda

**File**: `scripts/db-access.mjs`, `package.json`

**Intent**: W stylu `scripts/ui-literals.mjs` (zero zależności): failuje z listą `plik:linia` przy naruszeniu reguły.

**Contract**: Reguły: (a) w `src/**` brak `service_role`, `SERVICE_ROLE`, `SECRET_KEY`, `sb_secret_`; (b) w `src/**` import `createClient` z `@supabase/supabase-js` albo `createServerClient`/`createBrowserClient` z `@supabase/ssr` tylko w `src/lib/supabase.ts` (importy samych typów dozwolone); (c) w `supabase/migrations/*.sql` brak `security definer` (bez względu na wielkość liter), z pustą listą wyjątków `ALLOWED` wymagającą komentarza z uzasadnieniem. Funkcje skanujące eksportowane, żeby dało się je testować. Skrypt `lint:db-access` w `package.json`.

#### 2. Test strażnika

**File**: `tests/scripts/db-access.test.ts`

**Intent**: Dowieść, że reguły łapią naruszenia i nie łapią dozwolonego kodu.

**Contract**: `it.each` na przykładowych fragmentach: łapie `createClient(url, process.env.SERVICE_ROLE_KEY)`, `import { createServerClient } from "@supabase/ssr"` poza `src/lib/supabase.ts`, `SECURITY DEFINER` w SQL; nie łapie `import type { SupabaseClient } from "@supabase/supabase-js"`, `security invoker`, słowa „secret” w zwykłym tekście. **Regresja**: wyłączenie reguły albo zbyt szeroki wzorzec. **Antywzorzec unikany**: test tylko „repo przechodzi” bez przypadku negatywnego.

### Success Criteria:

#### Automated Verification:

- `npm run lint:db-access` przechodzi na obecnym repo
- `npm test` przechodzi (z testem strażnika)
- `npm run lint` przechodzi

#### Manual Verification:

- Tymczasowe `security definer` lub `SERVICE_ROLE_KEY` daje błąd z poprawnym `plik:linia`; po cofnięciu skrypt przechodzi (w katalogu roboczym: `security definer` w migracji albo `SERVICE_ROLE_KEY` w pliku w `src/`, sprawdzane `npm run lint:db-access`)

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie ręcznych kroków, zanim przejdziesz dalej.

---

## Faza 3: Usuwanie na poziomie serwisów (#1)

### Overview

Testy integracyjne `deleteSubstitute` i `deleteIngredient` na prawdziwej bazie, jako konto tymczasowe, z porównaniem zbiorów id przed i po (obserwacja kluczem admina, niezależna od testowanego kodu). Uzupełnienie pgTAP.

### Changes Required:

#### 1. Testy usuwania

**File**: `tests/services/delete.test.ts`

**Intent**: Dowieść FR-007 w warstwie, której pgTAP nie widzi (filtr w TS, mapowanie 0 wierszy).

**Contract**: Fixture konta A budowany przez `addSubstitute` (ścieżka użytkownika): składnik M z kategorią Ciasta (zamienniki X, Y) i Dania mięsne (Z); składnik C z Ciasta (W). Stan obserwowany przez `adminClient()` jako zbiory id `ingredients`/`ingredient_categories`/`substitutes` z `user_id` = A. Przypadki:

- **Usunięcie zamiennika usuwa dokładnie jeden wiersz**: `deleteSubstitute(X)` → zbiór zamienników po = przed − {X}; pary i składniki bez zmian. Regresja: filtr po parze/składniku zamiast id (zabrałby Y). Źródło: PRD FR-007, test-plan §2 #1.
- **Brzeg — ostatni zamiennik pary**: `deleteSubstitute(Z)` → para (M, Dania mięsne) i M zostają.
- **Brzeg — nie znaleziono**: drugi `deleteSubstitute(X)` i losowy uuid → wynik `not_found`, zbiory bez zmian. Regresja: 0 wierszy zgłoszone jako sukces.
- **Usunięcie składnika usuwa dokładnie zasięg z ekranu potwierdzenia**: przed POST pobrać `listIngredientSubstitutes(A, M, null)` (źródło danych `delete-ingredient.astro:35-51`) → `deleteIngredient(M)` → usunięte zamienniki = dokładnie te id; usunięte pary = pary M; C, jego para i W bez zmian. Regresja: ekran pokazuje tylko bieżącą kategorię albo kaskada sięga dalej.
- **F2 — zaakceptowane ograniczenie (sekwencyjnie)**: po pobraniu zasięgu A dodaje zamiennik M w trzeciej kategorii, potem `deleteIngredient(M)` usuwa także nowy wiersz. Nazwa testu i komentarz wskazują decyzję S-05 (Fix A) — test chroni kontrakt „kaskada wg stanu z chwili usunięcia”, a nie naprawia F2.
- **Cudze id**: konto B wywołuje `deleteSubstitute(Y)` i `deleteIngredient(C)` → `not_found`, zbiory A bez zmian.
  **Antywzorzec unikany**: asercja „usunięty wiersz zniknął” bez sprawdzenia sąsiadów; oczekiwane zbiory liczone tym samym zapytaniem co kod.

#### 2. pgTAP — składnik przeżywa usunięcie zamiennika

**File**: `supabase/tests/delete-entries.sql`

**Intent**: Domknąć jawną asercję, której dziś brakuje (przeżycie wynika tylko z FK pary).

**Contract**: Po usunięciu „Margaryna” asercja, że wiersz składnika „Masło” istnieje; `plan(18)` → `plan(19)`. Konwencja pliku bez zmian (transakcja wycofywana).

### Success Criteria:

#### Automated Verification:

- `npm test` przechodzi (z `tests/services/delete.test.ts`), teardown harnessu czysty
- `npx supabase test db` przechodzi (19 asercji w `delete-entries.sql`)
- `npm run lint` przechodzi

#### Manual Verification:

- Tymczasowa zmiana filtra w `deleteSubstitute` daje czerwony test „usuwa dokładnie jeden wiersz”; po cofnięciu zielony (np. usunięcie `.eq("id", …)` w katalogu roboczym)

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie ręcznych kroków, zanim przejdziesz dalej.

---

## Faza 4: Izolacja endpointów przez HTTP (#2)

### Overview

Testy HTTP na działającym dev z dwoma kontami tymczasowymi: konto B z id konta A dostaje odpowiedź równoważną odpowiedzi dla losowego uuid, a stan A się nie zmienia. Plus przypadek tej samej nazwy, ścieżka UI przez potwierdzenie i pgTAP z pustym `returning`.

### Changes Required:

#### 1. Klient HTTP testów

**File**: `tests/http/client.ts`

**Intent**: Minimalny klient jak w smoke: logowanie przez `POST /api/auth/signin` kontem tymczasowym, słoik ciasteczek, nagłówek `Origin`, brak podążania za redirectami.

**Contract**: `BASE_URL` z env (domyślnie `http://localhost:4321`); w `beforeAll` sprawdzenie dostępności serwera z komunikatem „uruchom `npm run dev`”. `signIn(user)` → sesja; `get(path)`, `postForm(path, fields)` → `{ status, location, body }`.

#### 2. Testy izolacji

**File**: `tests/http/isolation.test.ts`

**Intent**: Dowieść Access Control z PRD na poziomie endpointów, z którego korzysta użytkownik.

**Contract**: Fixture A (przez serwis jako A): składnik z kategorią i zamiennikiem. Dla każdego wejścia (`it.each`) porównanie odpowiedzi B dla id A z odpowiedzią B dla losowego uuid: ten sam status, ten sam `location` po zastąpieniu id znacznikiem, treść bez nazw/proporcji/uwag A; po każdej próbie hash wierszy A (`adminClient()`) bez zmian. Wejścia:

- POST: `/api/ingredients/rename` (`ingredient_id`, `name`), `/api/ingredients/delete` (`ingredient_id`), `/api/substitutes/update` (`substitute_id`, `name`, `ratio`, `notes`), `/api/substitutes/delete` (`substitute_id`), `/api/substitutes/best` (`substitute_id`) — z polami widoku jak w formularzach.
- GET: `/ingredients/edit-ingredient?ingredient_id=`, `/ingredients/delete-ingredient?ingredient_id=`, `/ingredients/edit-substitute?substitute=`, `/ingredients/delete-substitute?substitute=`, `/ingredients?ingredient=&category=`, `/ingredients/new?ingredient=`.
  **Brzeg — ta sama nazwa**: B wysyła `POST /api/ingredients` z nazwą i kategorią składnika A → B ma własny, nowy składnik (inne id), wiersze A bez zmian. **Regresja**: wyciek przez komunikat, fałszywy sukces mutacji, unikalność nazwy globalna zamiast per użytkownik. **Źródło**: PRD Access Control, test-plan §2 #2, research (tabela wejść). **Antywzorzec unikany**: test z jednym kontem; mock Supabase; oczekiwany tekst błędu przepisany z kodu zamiast porównania z odpowiedzią dla losowego uuid.

#### 3. Ścieżka UI przez potwierdzenie

**File**: `tests/http/delete-confirmation.test.ts`

**Intent**: Udokumentować decyzję „potwierdzenie w UI”: z listy nie da się usunąć składnika bez strony potwierdzenia, a strona pokazuje pełny zasięg.

**Contract**: Jako A: strona listy z wybranym składnikiem zawiera link „Usuń składnik” prowadzący do `/ingredients/delete-ingredient?…` (nie do `/api/…`) i żaden formularz z akcją `/api/ingredients/delete`; strona potwierdzenia pokazuje liczbę zamienników równą liczbie wierszy zamienników składnika obserwowanej kluczem admina (wszystkie kategorie). **Brzeg**: składnik z zamiennikami w dwóch kategoriach.

#### 4. pgTAP — puste `returning` dla cudzych mutacji

**File**: `supabase/tests/edit-entries.sql`, `supabase/tests/delete-entries.sql`

**Intent**: Utrwalić w bazie własność, na której opiera się mapowanie `maybeSingle()` → `not_found`.

**Contract**: Jako B: `update … returning id` na składniku i zamienniku A oraz `delete … returning id` na zamienniku i składniku A zwracają 0 wierszy (`is_empty`). Aktualizacja `plan(N)` w obu plikach.

### Success Criteria:

#### Automated Verification:

- `npm run test:http` przechodzi przy działającym `npm run dev`, teardown harnessu czysty
- `npx supabase test db` przechodzi
- `npm test` nadal przechodzi
- `npm run lint` przechodzi

#### Manual Verification:

- `npm run test:http` bez działającego dev kończy się czytelnym komunikatem o braku serwera (nie dziesiątkami niejasnych błędów)
- Tymczasowe dopisanie nazwy składnika do komunikatu `NOT_FOUND` daje czerwony test izolacji; po cofnięciu zielony (w jednym endpoincie, w katalogu roboczym)

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie ręcznych kroków, zanim przejdziesz dalej.

---

## Faza 5: Cookbook i synchronizacja dokumentów

### Overview

Zapisać wzorce, które faza wprowadziła, przenieść poprawki z research do planu testów i zaktualizować reguły projektu.

### Changes Required:

#### 1. Plan testów

**File**: `context/foundation/test-plan.md`

**Intent**: Plan ma opisywać to, co faktycznie testujemy i jak dodać kolejny test.

**Contract**:

- §6.2 (integracja: `createTestUser`, obserwacja kluczem admina, porównanie zbiorów, plik referencyjny `tests/services/delete.test.ts`), §6.3 (konwencja pgTAP: szkielet `begin`/`rollback`, unikalny sufiks UUID per plik, `set local role`), §6.4 (nowy endpoint: przypadek cudzego id ≡ losowy uuid w `tests/http/isolation.test.ts`), §6.6 (2–3 linie wniosków z fazy).
- §1: ograniczenie doprecyzowane zgodnie z decyzją — testy nie mogą wymagać `db reset` ani zmieniać danych deweloperskich; dozwolone są wyłącznie konta wzorca testowego, usuwane sweepem przed i po, z porównaniem hashy.
- §2 Risk Response Guidance: #1 — zawężenie do przypadku sekwencyjnego (F2 ACCEPTED) i potwierdzenia w UI; #2 — dopisek o konwencji pilnowanej przez `lint:db-access`; #5 — smoke sprzątany sweepem.
- §4: Vitest 5.1.0 (`checked: <data>`), uruchamiany bez `getViteConfig()`; §5: bramka unit+integration lokalnie wymagana (`npm test`, `npm run test:http`), `lint:db-access` lokalnie.
- Bez kotwic `plik:linia` w §2 (zasada 3 planu).

#### 2. Reguły projektu

**File**: `CLAUDE.md`, `README.md`

**Intent**: Agent i człowiek mają wiedzieć, jak uruchomić testy.

**Contract**: `CLAUDE.md` `## Commands`: zastąpić „There is no unit-test framework…” opisem `npm test`, `npm run test:http` (wymaga dev), `npm run test:sweep`, `npm run lint:db-access`, `npx supabase test db` i odesłaniem do `test-plan.md` §6. `README.md` `## Available Scripts`: te same skrypty jednym zdaniem każdy.

### Success Criteria:

#### Automated Verification:

- `npx prettier --check context/foundation/test-plan.md CLAUDE.md README.md` przechodzi
- `npm run lint` i `npm test` przechodzą

#### Manual Verification:

- Nowa sesja agenta wskazuje §6.4 i `tests/http/isolation.test.ts` dla testu nowego endpointu (pytanie: „jak dodać test dla nowego endpointu z id od klienta?”)

**Implementation Note**: Po automatycznej weryfikacji zatrzymaj się na potwierdzenie ręcznych kroków.

---

## Testing Strategy

### Unit Tests:

- Wąskość wzorca sweepu (`tests/harness/accounts.test.ts`).
- Reguły strażnika dostępu do bazy (`tests/scripts/db-access.test.ts`).

### Integration Tests:

- Serwisy na prawdziwym Supabase jako konto tymczasowe: usuwanie zamiennika i składnika, F2 sekwencyjnie, cudze id (`tests/services/delete.test.ts`).
- HTTP na działającym dev z dwoma kontami: równoważność cudze id ≡ losowy uuid na 5 POST i 6 GET, ta sama nazwa, ścieżka UI przez potwierdzenie (`tests/http/*.test.ts`).
- pgTAP: przeżycie składnika, puste `returning` dla cudzych mutacji.
- Harness: każdy przebieg dowodzi, że dane dev są nietknięte (#5).

### Manual Testing Steps:

1. Zapisać liczności w Studio, uruchomić `npm test`, porównać liczności i brak kont `smoke-*`.
2. Przerwać `npm test` w trakcie, uruchomić `npm run test:sweep`, sprawdzić brak kont `vitest-*`.
3. Wprowadzić tymczasową regresję (filtr w `deleteSubstitute`, nazwa w komunikacie `NOT_FOUND`) i zobaczyć czerwony test; cofnąć.

## Performance Considerations

`npx supabase status` przy starcie dodaje kilka sekund na przebieg; akceptowalne. Testy HTTP są wolniejsze (serwer dev) i dlatego mają osobną komendę.

## Migration Notes

Brak migracji schematu. Pierwszy sweep usunie zaległe konta `smoke-*` i ich dane z lokalnej bazy dev — zamierzone.

## References

- Research: `context/changes/testing-isolation-and-delete/research.md`
- Test plan: `context/foundation/test-plan.md` (§1, §2 #1/#2/#5, §3 Phase 1)
- F2: `context/archive/2026-10-24-delete-entries-confirmed/reviews/impl-review.md`
- Wzorzec skryptu: `scripts/ui-literals.mjs`
- Wzorzec HTTP: `scripts/smoke.mjs:100-135`
- Konwencja pgTAP: `supabase/tests/rls-isolation.sql`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Runner i harness

#### Automated

- [x] 1.1 `npm test` przechodzi (testy wzorca i harnessu), a teardown raportuje 0 kont wzorca i identyczny snapshot
- [x] 1.2 `npm run test:sweep` kończy się sukcesem i wypisuje liczbę usuniętych kont
- [x] 1.3 `npm run lint` przechodzi (nowe pliki objęte typowanym lintem)
- [x] 1.4 `npx prettier --check vitest.config.ts tests` przechodzi

#### Manual

- [x] 1.5 Liczności danych dev w Studio identyczne przed i po `npm test`, konta `smoke-*` usunięte
- [x] 1.6 Przerwany przebieg zostawia konta `vitest-*`, które usuwa następny `npm test` lub `npm run test:sweep`

### Phase 2: Strażnik dostępu do bazy

#### Automated

- [ ] 2.1 `npm run lint:db-access` przechodzi na obecnym repo
- [ ] 2.2 `npm test` przechodzi (z testem strażnika)
- [ ] 2.3 `npm run lint` przechodzi

#### Manual

- [ ] 2.4 Tymczasowe `security definer` lub `SERVICE_ROLE_KEY` daje błąd z poprawnym `plik:linia`; po cofnięciu skrypt przechodzi

### Phase 3: Usuwanie na poziomie serwisów (#1)

#### Automated

- [ ] 3.1 `npm test` przechodzi (z `tests/services/delete.test.ts`), teardown harnessu czysty
- [ ] 3.2 `npx supabase test db` przechodzi (19 asercji w `delete-entries.sql`)
- [ ] 3.3 `npm run lint` przechodzi

#### Manual

- [ ] 3.4 Tymczasowa zmiana filtra w `deleteSubstitute` daje czerwony test „usuwa dokładnie jeden wiersz”; po cofnięciu zielony

### Phase 4: Izolacja endpointów przez HTTP (#2)

#### Automated

- [ ] 4.1 `npm run test:http` przechodzi przy działającym `npm run dev`, teardown harnessu czysty
- [ ] 4.2 `npx supabase test db` przechodzi
- [ ] 4.3 `npm test` nadal przechodzi
- [ ] 4.4 `npm run lint` przechodzi

#### Manual

- [ ] 4.5 `npm run test:http` bez działającego dev kończy się czytelnym komunikatem o braku serwera
- [ ] 4.6 Tymczasowe dopisanie nazwy składnika do komunikatu `NOT_FOUND` daje czerwony test izolacji; po cofnięciu zielony

### Phase 5: Cookbook i synchronizacja dokumentów

#### Automated

- [ ] 5.1 `npx prettier --check context/foundation/test-plan.md CLAUDE.md README.md` przechodzi
- [ ] 5.2 `npm run lint` i `npm test` przechodzą

#### Manual

- [ ] 5.3 Nowa sesja agenta wskazuje §6.4 i `tests/http/isolation.test.ts` dla testu nowego endpointu
