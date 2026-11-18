# Faza 3 rolloutu testów — bezpieczne migracje — Implementation Plan

## Overview

Bramka „test migracji na danych” (`context/foundation/test-plan.md:115`, ryzyko #3): przed `db push` każda migracja nowsza niż linia bazowa przechodzi przez jednorazową bazę w lokalnym klastrze Postgresa, z syntetycznymi danymi w kształcie dzisiejszej produkcji. Test porównuje inwarianty danych (liczności per konto, przypisania kategorii po slugu, oznaczenia „najlepszy”, treść wierszy, spójność właściciela) przed i po migracji. Dozwolone są tylko zmiany, które migracja jawnie zadeklaruje. Bez `db reset`, bez zmian w danych deweloperskich (`test-plan.md:32`).

## Current State Analysis

- Migracje trafiają na produkcję ręcznie: `npx supabase db push` przed merge kodu zależnego, potem `migration list` (`README.md:130-135`; `context/archive/2026-10-10-unique-substitutes/plan.md:203`). Przed pushem nie ma żadnego automatycznego sprawdzenia; CI nie dotyka bazy (`.github/workflows/ci.yml`). `README.md:124-128` każe lokalnie `db reset`, wbrew `test-plan.md:32`.
- 6 migracji w `supabase/migrations/`; dane zmieniają 3 z nich: seed kategorii (`20261004120000_substitute_database.sql:22-25`), nieodwracalne usuwanie duplikatów (`20261010115230_unique_substitutes.sql:14-24`, sprawdzone tylko ręcznie, F6 pominięty: `context/archive/2026-10-10-unique-substitutes/reviews/impl-review.md:82-90`), zmiana nazw kategorii po slugu (`20261028120000_rename_categories.sql:6-8`). Wszystkie kwalifikują tabele `public.` i odwołują się do `auth.users` / `auth.uid()` (`20261004120000:30-32`); żadna nie ma `begin`/`commit`.
- Harness ma `DB_URL` z `npx supabase status -o env` (`tests/harness/env.ts:9-10`, `:35-48`), połączenia `pg` (`tests/harness/pg-sessions.ts:30`), hash danych dev przez PostgREST (`tests/harness/snapshot.ts:55-75`) i global setup ze sweepem kont (`tests/harness/global-setup.ts:9-34`). Vitest ma projekty `unit`, `services`, `http` z global setupem per projekt (`vitest.config.ts:20-50`).
- Rola `postgres` w obrazie Supabase ma `CREATEDB` (`demote-postgres.sql:22` w `public.ecr.aws/supabase/postgres:17.6.1.166`); role `anon`/`authenticated`/`service_role` są globalne dla klastra, schemat `auth` istnieje tylko w bazie `postgres`. Niezweryfikowane na działającym stosie: że `DB_URL` łączy jako `postgres` i `create database` przechodzi.
- Szczegóły i źródła: `context/changes/testing-safe-migrations/research.md`.

## Desired End State

- `npm run test:migrations` (i `npm test`, który go obejmuje) przy działającym lokalnym stosie: tworzy jednorazowe bazy `mig_test_<runId>…`, nakłada migracje przez `npx supabase migration up --db-url` do linii bazowej `20261028120000`, ładuje fixture, nakłada każdą nowszą migrację osobno i porównuje snapshot inwariantów z oczekiwanym (domyślnie „bez zmian”, inaczej deklaracja w `tests/migrations/expectations.ts`). Kontrola mutacyjna: syntetyczne migracje psujące każdy inwariant oblewają porównanie; zadeklarowana zmiana przechodzi; niezadeklarowana oblewa. Migracja padająca w połowie pliku nie zostawia stanu pośredniego.
- Po przebiegu nie zostaje żadna baza wzorca `mig_test_`, a hash danych deweloperskich jest identyczny jak przed przebiegiem; inaczej przebieg pada.
- README, CLAUDE.md i test-plan opisują kolejność przed pushem: `npm run test:migrations` → `npx supabase db push --dry-run` → `npx supabase db push` → `npx supabase migration list`, oraz przesunięcie linii bazowej po pushu. README nie każe już `db reset`.

### Key Discoveries:

- Migracje kwalifikują `public.` na sztywno → izolacja tylko osobną bazą, nie schematem (`research.md` §4, opcja D).
- `migration up --db-url` stosuje wszystkie oczekujące migracje z katalogu projektu → podzbiór plików wymaga osobnego katalogu roboczego (`--workdir`) (`npx supabase migration up --help`, CLI 2.117.0).
- W jednorazowej bazie nie ma PostgREST/GoTrue → fixture i odczyty przez `pg` jako `postgres`, nie `addSubstitute`/`adminClient()` (`context/archive/2026-11-04-testing-isolation-and-delete/research.md:100`).
- Cookbook wymaga wyroczni z literałów i obowiązkowej kontroli mutacyjnej (`test-plan.md:143`, `:157`); nazwy kategorii porównywać po `slug` (`20261028120000_rename_categories.sql:1-4`).
- Wąski wzorzec rzeczy usuwanych przez sweep ma własny test (`tests/harness/accounts.test.ts:1-3`).

## What We're NOT Doing

- Bramka w CI i hook pre-push — faza 4 rolloutu (`test-plan.md:73`); tu tylko skrypt npm i dokumentacja.
- Skrypt, który sam wykonuje `db push` — push na produkcję zostaje ręczny (operacje na bazie produkcyjnej poza odczytem są human-only, `context/foundation/infrastructure.md:82`).
- Kopia danych produkcyjnych lub deweloperskich jako fixture — tylko dane syntetyczne (`context/foundation/prd.md:158`).
- Odtwarzanie historii (M2, M6) jako testów — sprawdzane są migracje nowsze niż linia bazowa; historię zastępują syntetyczne mutanty o tym samym kształcie (delete, update kategorii).
- Prawdziwy schemat `auth` / osobny kontener — zastępczy `auth`; migracja dotykająca `auth`, `storage` lub rozszerzeń padnie głośno i wtedy wraca decyzja o kontenerze (§7 test-planu).
- Migracje usuwające lub zmieniające nazwę kolumny z bazowego snapshotu — zapytanie snapshotu wtedy padnie; aktualizuje się je razem z linią bazową. Bez adaptera w deklaracjach.
- Zmiany w migracjach, kodzie aplikacji i schemacie; test RLS/uprawnień w jednorazowej bazie.

## Implementation Approach

Trzy klocki w `tests/harness/` + jeden plik testu:

1. `scratch-db.ts` — tworzenie/usuwanie jednorazowych baz o wąskim wzorcu nazwy, zastępczy `auth`, sweep zaległych baz, klonowanie z szablonu.
2. `migrate-cli.ts` — nałożenie zadanej listy plików migracji na bazę przez `npx supabase migration up --db-url` z tymczasowego katalogu roboczego; błędy bez hasła.
3. `migration-snapshot.ts` + `tests/migrations/fixture.sql` + `tests/migrations/expectations.ts` — snapshot inwariantów przez `pg`, fixture na schemacie linii bazowej, deklaracje zmian.

Test `tests/migrations/migrations.test.ts` w nowym projekcie Vitest `migrations`. Raz na przebieg budowana jest baza wyjściowa (migracje ≤ linia bazowa + fixture), każdy przypadek klonuje ją `create database … template …` i nakłada swoje migracje. Global setup projektu: sweep baz `mig_test_` przed i po + porównanie hasha danych dev (`devSnapshot`), bez sweepu kont.

## Critical Implementation Details

- **Global setup bez sweepu kont.** `npm test` uruchomi `services` i `migrations` w jednym przebiegu. Vitest 5.1.0 odpala wszystkie global setupy przed pierwszym testem, a teardowny po ostatnim (`node_modules/vitest/dist/chunks/cli-api.*.js`, `initializeGlobalSetup` / `_teardownGlobalSetup`), więc nie ma tu wyścigu. Projekt `migrations` nie tworzy kont, a sweep kont robi już `services`, więc dostaje własny global setup bez dublowania sweepu: sweep baz `mig_test_` + `devSnapshot` przed/po (odczyt; wiersze kont wzorca są z hasha wyłączone, `tests/harness/snapshot.ts:56-68`).
- **Szablon wymaga braku połączeń.** `create database <case> template <base>` przechodzi tylko, gdy nikt nie jest połączony z bazą wyjściową — po zbudowaniu jej zamknąć wszystkie klienty `pg`. Klon z `postgres` (bazy dev) jest niemożliwy z tego samego powodu (`research.md` §4).
- **Hasło w URL-u.** `DB_URL` zawiera hasło; URL jednorazowej bazy powstaje przez podmianę nazwy bazy w `DB_URL` (percent-encoded, jak wymaga `--db-url`). Wyjście i błąd CLI trafiają do komunikatu dopiero po zamaskowaniu całego URL-a i segmentu `user:hasło@` znacznikiem; nic nie jest logowane wprost (`tests/harness/env.ts:1-2`). Nie podmieniać gołego ciągu hasła: lokalnie hasło to `postgres`, tak samo jak rola i baza, więc podmiana zniszczyłaby komunikaty (`role "postgres"`).
- **Atomowość to fakt do zmierzenia, nie założenie.** Jeśli w fazie 3 CLI okaże się nieatomowy (stan pośredni zostaje), zatrzymać się i wrócić do użytkownika przed zmianą asercji — nie przepisywać testu pod wynik.

## Phase 1: Jednorazowa baza i runner CLI

### Overview

Sprawdzić założenia na działającym stosie, zbudować helper jednorazowych baz z wąskim wzorcem i sweepem, runner `migration up --db-url` i projekt Vitest `migrations`. Dowód: wszystkie 6 migracji przechodzi na jednorazowej bazie przez CLI, dane dev bez zmian.

### Changes Required:

#### 1. Weryfikacja założeń (spike, bez kodu w repo)

**File**: — (wynik zapisany w Phase 1 notes / Progress)

**Intent**: Przed kodem potwierdzić na działającym stosie (`npx supabase start`): rolę pod `DB_URL` i `rolcreatedb`, `create database` / `drop database … with (force)`, oraz że `npx supabase migration up --db-url <url> --workdir <tmp>` działa na pustej bazie z zastępczym `auth` (czy potrzebuje `config.toml` w katalogu roboczym, czy tworzy `supabase_migrations.schema_migrations`). Wynik negatywny = stop i powrót do decyzji o izolacji.

**Contract**: Fakty zanotowane w planie (sekcja Phase 1) przed przejściem do zmian 2–5.

#### 2. Helper jednorazowych baz

**File**: `tests/harness/scratch-db.ts`

**Intent**: Jedyne miejsce, które tworzy i usuwa bazy testów migracji. Nazwa z wąskiego wzorca, żeby sweep nigdy nie dotknął innej bazy; zastępczy `auth` dokładnie w zakresie, którego używają migracje.

**Contract**:

- `scratchDbName(label)` → `mig_test_<runId>_<label>` (`runId` z `tests/harness/accounts.ts:15`; etykieta: małe litery, cyfry, podkreślenia); `isSweepableDbName(name)` — wąski predykat dla tego wzorca.
- `createScratchDb(label, { template? })` → `{ name, url, client }` (`url` = `DB_URL` z podmienioną bazą, `client` = połączenie `pg`); bez `template` dokłada zastępczy `auth`: schemat `auth`, `auth.users (id uuid primary key, email text)`, `auth.uid()` zwracające `sub` z `request.jwt.claims` (jak `init-scripts/00000000000001-auth-schema.sql:94`) — nic więcej.
- `dropScratchDb(name)` — `drop database … with (force)`, tylko dla nazw spełniających `isSweepableDbName`.
- `sweepScratchDbs()` → liczba usuniętych baz wzorca (z `pg_database`, połączenie do `postgres` pod `DB_URL`, tylko odczyt katalogu + `drop` baz wzorca).

#### 3. Test wąskości wzorca

**File**: `tests/harness/scratch-db.test.ts`

**Intent**: Sweep usuwa bazy naprawdę, więc wzorzec ma własny test w stylu `tests/harness/accounts.test.ts`: literalne nazwy, nigdy kopia wyrażenia.

**Contract**: `it.each` z nazwami, które sweep usuwa (`mig_test_<runId>_base`, `…_case_delete`) i które zostawia (`postgres`, `template0`, `template1`, `_supabase`, `mig_test`, `mig_test_`, `xmig_test_…`, `mig_test_<runId>` bez etykiety, wielkie litery, myślniki, cudzysłowy/średniki). Plik w projekcie `services` (glob `tests/harness/**/*.test.ts`, `vitest.config.ts:33`) — czysty predykat, bez stosu poza global setupem tego projektu.

#### 4. Runner migracji przez CLI

**File**: `tests/harness/migrate-cli.ts`

**Intent**: Nałożyć dokładnie zadane pliki migracji na wskazaną bazę tą samą ścieżką, którą idzie `db push`.

**Contract**:

- `listMigrations()` → posortowane wersje i ścieżki z `supabase/migrations/`.
- `applyMigrations(dbUrl, files: { version, sql | path }[])` → `{ ok: true } | { ok: false, output }`: katalog tymczasowy (`os.tmpdir()`), w nim `supabase/config.toml` (kopia) i `supabase/migrations/<pliki>`, potem `npx supabase migration up --db-url <dbUrl> --workdir <tmp>`; katalog usuwany w `finally`. `output` z zamaskowanym całym URL-em i segmentem `user:hasło@` (patrz Critical Implementation Details). Pliki syntetyczne (mutanty) podawane jako `sql` z wersją większą niż linia bazowa.
- `files` = wszystkie pliki już zapisane w `supabase_migrations.schema_migrations` bazy docelowej + pliki pod testem, każdy o wersji wyższej niż ostatnia zastosowana. Inaczej CLI 2.117.0 przerywa („Remote migration versions not found in local migrations directory” / „Found local migration files to be inserted before the last migration on remote database”). Bez `migration repair` i bez `--include-all`: test idzie tą samą ścieżką co `db push`.
- Funkcja nie rzuca na niezerowy kod wyjścia CLI (faza 3 potrzebuje wyniku), rzuca tylko na błąd uruchomienia.

#### 5. Projekt Vitest `migrations`, global setup, skrypt npm

**File**: `vitest.config.ts`, `tests/harness/migrations-global-setup.ts`, `tests/migrations/migrations.test.ts`, `package.json`

**Intent**: Osobny projekt z własnym global setupem (sweep baz + hash danych dev, bez sweepu kont — patrz Critical Implementation Details) i pierwszy test dymny ścieżki.

**Contract**:

- Projekt `migrations`: `include: ["tests/migrations/**/*.test.ts"]`, `globalSetup: ["tests/harness/migrations-global-setup.ts"]`, `fileParallelism: false`; `hookTimeout`/`testTimeout` podniesione w projekcie tak, by mieściły kilka wywołań CLI.
- Global setup: `setup` = `sweepScratchDbs()` + `devSnapshot()`; `teardown` = `sweepScratchDbs()`, pozostała baza wzorca → błąd, zmieniony hash → błąd z `describeSnapshotDiff` (jak `tests/harness/global-setup.ts:21-34`).
- `package.json`: `"test:migrations": "vitest run --project migrations"`; `"test"` dostaje `--project migrations`.
- Test dymny w `tests/migrations/migrations.test.ts`: pusta jednorazowa baza (zero tabel w `public`) → `applyMigrations` wszystkich 6 plików → `ok`, `supabase_migrations.schema_migrations` ma 6 wersji, w `public.categories` 3 slugi.

### Success Criteria:

#### Automated Verification:

- `npm run test:migrations` przechodzi przy działającym stosie: test dymny + global setup bez błędów, w logu „0 baz testowych po sweepie, dane deweloperskie bez zmian”
- `npx vitest run --project services tests/harness/scratch-db.test.ts` przechodzi
- `npm run lint` przechodzi
- Po przebiegu `select datname from pg_database where datname like 'mig\_test\_%'` zwraca 0 wierszy

#### Manual Verification:

- Fakty ze spike'u (rola pod `DB_URL`, `rolcreatedb`, zachowanie `--workdir`) zapisane w notatce fazy
- Przerwany przebieg (Ctrl+C w trakcie testu) zostawia bazę `mig_test_…`, którą usuwa kolejny `npm run test:migrations` (sweep przed przebiegiem)
- Komunikat błędu CLI dla URL-a z fałszywym, wyróżniającym się hasłem (np. celowo zły port) nie zawiera tego hasła

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Fixture, inwarianty i deklaracje

### Overview

Baza wyjściowa (migracje ≤ linia bazowa + fixture), snapshot inwariantów, deklaracje zamierzonych zmian i kontrola mutacyjna, która dowodzi, że porównanie łapie każdy inwariant.

### Changes Required:

#### 1. Fixture na schemacie linii bazowej

**File**: `tests/migrations/fixture.sql`

**Intent**: Syntetyczne dane w kształcie dzisiejszej produkcji, które ćwiczą znane klasy zmian (`research.md` §6), ze stałymi UUID, żeby oczekiwania w deklaracjach były literałami.

**Contract**: Wstawiane jako `postgres` przez `pg` po migracjach ≤ `20261028120000`. Konwencja UUID jak pgTAP (`test-plan.md:165`): nowy sufiks kont (np. `…0000fa`, `…0000fb`), prefiksy `1…` składnik, `2…` para, `3…` zamiennik; e-maile `@example.test`. Zawiera co najmniej: 2 konta; składnik w 2+ kategoriach; wszystkie 3 slugi w użyciu; pary z najlepszym i bez; zamienniki z `notes` null i niepustym; nazwy z polskimi znakami i różną wielkością liter; tę samą nazwę składnika u obu kont; konto bez żadnych składników. Nagłówek pliku: ryzyko #3 i zasada „aktualizuj razem z linią bazową”.

#### 2. Snapshot inwariantów

**File**: `tests/harness/migration-snapshot.ts`

**Intent**: Czytelny (nie tylko hash) obraz danych, którego różnica w Vitest od razu mówi, co migracja zmieniła.

**Contract**: `migrationSnapshot(client)` → obiekt z posortowanymi wierszami: `users` (`id`); `categories` (`slug`, `name`, `sort_order`); `ingredients` (`id`, `user_id`, `name`, `name_key`); `assignments` (`ingredient_categories.id`, `user_id`, `ingredient_id`, slug kategorii); `substitutes` (`id`, `user_id`, `ingredient_category_id`, `name`, `ratio`, `notes`, `is_best`); `counts` per tabela per `user_id`; `ownershipViolations` (wiersze, gdzie `user_id` zamiennika ≠ pary ≠ składnika) — oczekiwane zawsze puste. Jawne listy kolumn (nowa kolumna nie psuje snapshotu). Odczyt w `begin transaction read only`.

#### 3. Linia bazowa i deklaracje zmian

**File**: `tests/migrations/expectations.ts`

**Intent**: Jedno miejsce, w którym autor migracji mówi, co jego migracja ma zmienić w danych; brak deklaracji = „bez zmian”.

**Contract**: `BASELINE_MIGRATION = "20261028120000"`; `expectations: Record<string, (before: MigrationSnapshot) => MigrationSnapshot>` — funkcja zwraca oczekiwany snapshot z literałów fixture'u (np. „bez zamiennika `3…01`”, „`ciasta` → nowa nazwa”), nigdy z wyniku migracji. Komentarz przy stałej: po `db push` przesuń linię bazową na ostatnią wypchniętą wersję, usuń jej deklarację, zaktualizuj fixture, jeśli schemat się zmienił.

#### 4. Test migracji i kontrola mutacyjna

**File**: `tests/migrations/migrations.test.ts`

**Intent**: Właściwa bramka plus dowód, że rozróżnia dobre i złe migracje.

**Contract**:

- `beforeAll`: baza `…_base` = zastępczy `auth` + `applyMigrations(≤ BASELINE)` + `fixture.sql`; zamknięte połączenia (szablon).
- Strażnicy: plik linii bazowej istnieje w `supabase/migrations/`; każda deklaracja w `expectations` dotyczy wersji nowszej niż linia bazowa i istniejącego pliku; fixture na bazie wyjściowej ma pusty `ownershipViolations`.
- Migracje pod testem: wersje > `BASELINE_MIGRATION`, nakładane po kolei na jednym klonie (każde wywołanie `applyMigrations` dostaje pliki ≤ linia bazowa + dotąd nałożone + następną); po każdej snapshot porównany (`toEqual`) z `expectations[v]?.(before) ?? before`; błąd CLI = porażka z oczyszczonym `output`. Test wypisuje listę migracji pod testem; przy zerowej liście przechodzi z informacją „brak migracji nowszych niż linia bazowa”.
- Kontrola mutacyjna (`it.each`, każdy przypadek na świeżym klonie, mutant jako syntetyczny plik o wersji > linii bazowej, bez deklaracji, nakładany razem z plikami ≤ linia bazowa): usunięcie jednego zamiennika; przepięcie przypisania na inną kategorię przez `category_id`; zdjęcie `is_best` w parze; zmiana `notes` w miejscu; zmiana `user_id` zamiennika na drugie konto; zmiana nazwy kategorii. Każdy mutant musi dać różnicę w snapshot (asercja: porównanie z „bez zmian” zawodzi, a różnica dotyczy oczekiwanego klucza snapshotu). Przypadek pozytywny: ta sama zmiana nazwy kategorii z deklaracją w teście → porównanie przechodzi.
- Funkcja porównania wydzielona tak, by kontrola mutacyjna używała dokładnie tej samej ścieżki co bramka.

### Success Criteria:

#### Automated Verification:

- `npm run test:migrations` przechodzi: strażnicy, „brak migracji nowszych niż linia bazowa” (dziś), 6 mutantów wykrytych, przypadek zadeklarowany przechodzi
- `npm test` przechodzi (unit + services + migrations w jednym przebiegu, bez kolizji global setupów)
- `npm run lint` przechodzi
- Celowe zepsucie: tymczasowa migracja `supabase/migrations/<nowa wersja>_probe.sql` z `delete` jednego wiersza o UUID z fixture'u (`3…01`, nieobecny w dev i na produkcji) bez deklaracji → `npm run test:migrations` czerwony z różnicą w `substitutes`; po usunięciu pliku zielony

#### Manual Verification:

- Różnica zgłoszona przy celowym zepsuciu wskazuje konkretny wiersz i tabelę (czytelna bez zaglądania w kod)
- 3 przebiegi `npm run test:migrations` z rzędu bez flaków; czas przebiegu zanotowany

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Atomowość pliku migracji

### Overview

Zmierzyć i przypiąć, co zostaje po migracji, która pada w połowie pliku, nakładanej tą samą ścieżką CLI co `db push`.

### Changes Required:

#### 1. Przypadek „błąd w połowie pliku”

**File**: `tests/migrations/migrations.test.ts`

**Intent**: Zamienić niezweryfikowane źródła wtórne (`research.md` §5) w test o tym, co zostanie na produkcji po błędzie.

**Contract**: Świeży klon bazy wyjściowej; syntetyczna migracja (nakładana razem z plikami ≤ linia bazowa, jak mutanty): poprawna instrukcja zmieniająca dane (np. update nazwy kategorii po slugu), potem DDL (np. nowa tabela), potem instrukcja z błędem wykonania. Asercje: `applyMigrations` zwraca `ok: false`; snapshot równy snapshotowi przed; nowej tabeli nie ma; `supabase_migrations.schema_migrations` bez tej wersji. Komentarz: przypina zachowanie Supabase CLI 2.117.0. Jeśli wynik pokaże stan pośredni — stop (Critical Implementation Details).

### Success Criteria:

#### Automated Verification:

- `npm run test:migrations` przechodzi z przypadkiem atomowości
- `npm run lint` przechodzi

#### Manual Verification:

- Zaobserwowane zachowanie CLI (atomowe / nieatomowe) potwierdzone z użytkownikiem przed zamknięciem fazy

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Bramka w dokumentacji

### Overview

Opisać bramkę tam, gdzie czyta ją człowiek i agent przed `db push`, i zamknąć fazę w test-planie.

### Changes Required:

#### 1. README

**File**: `README.md`

**Intent**: Usunąć sprzeczność z `test-plan.md:32` i opisać kolejność przed pushem.

**Contract**: Sekcja „Database migrations” (`README.md:122-135`): lokalnie `npx supabase migration up` zamiast `db reset`; dla projektu hostowanego kolejność `npm run test:migrations` → `npx supabase db push --dry-run` → `npx supabase db push` → `npx supabase migration list`, plus przesunięcie `BASELINE_MIGRATION` po pushu. „Available Scripts”: `npm run test:migrations`, `npm test` obejmuje migracje.

#### 2. CLAUDE.md

**File**: `CLAUDE.md`

**Intent**: Agent ma znać bramkę i jej wymagania.

**Contract**: Sekcja „Commands”: wpis `npm run test:migrations` (stos, bez dev servera, jednorazowe bazy `mig_test_*`, sweep przed/po), `npm test` = unit + services + migrations; zdanie w „Key conventions → Supabase migrations”: przed `db push` `npm run test:migrations`; migracja zmieniająca dane deklaruje zmianę w `tests/migrations/expectations.ts`. Commitować tylko te hunki (blok 10x-cli w CLAUDE.md zostaje poza commitem).

#### 3. Test-plan

**File**: `context/foundation/test-plan.md`

**Intent**: Zamknąć fazę 3 zgodnie z konwencją poprzednich faz.

**Contract**: §1 twarde ograniczenie: dopisać jednorazowe bazy wzorca `mig_test_<runId>_<etykieta>` w lokalnym klastrze (nigdy baza `postgres`), sweep przed i po przebiegu, pozostała baza wzorca oblewa przebieg; §3 Phase 3 status → `complete`; §4 wiersz „migracje na danych” → istnieje (projekt `migrations`, zastępczy `auth`, CLI 2.117.0), profil bazy testów; §5 „test migracji na danych” → required (wired, local); §6.5 cookbook (kiedy, lokalizacja, uruchomienie, linia bazowa, fixture, deklaracja, kontrola mutacyjna, czego nie robić — `db reset`, kopia danych); §6.6 notatka fazy 3 (2–3 linie); §7 wpisy: wierność zastępczego `auth`, brak testu historii przed linią bazową, przypięta wersja CLI w teście atomowości; §8 data przeglądu.

### Success Criteria:

#### Automated Verification:

- `npx prettier --check README.md context/foundation/test-plan.md` przechodzi
- `npm run lint` przechodzi
- `grep -n "db reset" README.md` nie zwraca polecenia do uruchomienia lokalnie

#### Manual Verification:

- Ktoś, kto nie brał udziału w planowaniu, wykonuje z README kroki przed `db push` (bez samego pushu) i dochodzi do zielonego `npm run test:migrations`
- §6.5 odpowiada na pytanie „jak dodać migrację zmieniającą dane?” bez czytania kodu testu

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Wąskość `isSweepableDbName` (literalne nazwy usuwane i zostawiane) — `tests/harness/scratch-db.test.ts`.

### Integration Tests:

- Test dymny: 6 migracji na pustej jednorazowej bazie przez CLI.
- Bramka: migracje > linia bazowa na fixture, porównanie z deklaracją.
- Kontrola mutacyjna: 6 mutantów wykrytych, deklarowana zmiana przechodzi.
- Atomowość: błąd w połowie pliku nie zostawia stanu.
- Global setup: 0 baz `mig_test_` po przebiegu, hash danych dev bez zmian.

### Manual Testing Steps:

1. `npx supabase start`, potem `npm run test:migrations` — zielony, log sweepu i hasha.
2. Dodać `supabase/migrations/<nowa wersja>_probe.sql` z `delete from public.substitutes where id = '<UUID 3…01 z fixture'u>'` (tylko wiersz fixture'u, żeby przypadkowy `migration up` na dev ani zapomniany `db push` nic nie usunęły) → czerwony z różnicą; usunąć plik → zielony.
3. Przerwać przebieg w trakcie → kolejny przebieg usuwa zaległą bazę.

## Performance Considerations

Każde wywołanie CLI to osobny proces; baza wyjściowa budowana raz na przebieg, przypadki klonują ją z szablonu (bez ponownego nakładania 6 migracji). Czas przebiegu notowany w fazie 2; jeśli `npm test` wyraźnie się wydłuży, decyzja o wyłączeniu `migrations` z `npm test` wraca do użytkownika.

## Migration Notes

Ta zmiana nie dodaje migracji. Po każdym `db push` z nową migracją: przesunąć `BASELINE_MIGRATION`, usunąć jej deklarację, zaktualizować `tests/migrations/fixture.sql`, jeśli zmienił się schemat.

## References

- Related research: `context/changes/testing-safe-migrations/research.md`
- Risk and guidance: `context/foundation/test-plan.md:42`, `:56`, `:115`, `:143`, `:157`
- Sweep pattern + its test: `tests/harness/accounts.ts:15-35`, `tests/harness/accounts.test.ts`
- Global setup pattern: `tests/harness/global-setup.ts:9-34`
- pg connection pattern: `tests/harness/pg-sessions.ts:30`
- Prior destructive migration: `context/archive/2026-10-10-unique-substitutes/`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Jednorazowa baza i runner CLI

#### Automated

- [x] 1.1 `npm run test:migrations` przechodzi przy działającym stosie: test dymny + global setup bez błędów, w logu „0 baz testowych po sweepie, dane deweloperskie bez zmian” — 7f30c00
- [x] 1.2 `npx vitest run --project services tests/harness/scratch-db.test.ts` przechodzi — 7f30c00
- [x] 1.3 `npm run lint` przechodzi — 7f30c00
- [x] 1.4 Po przebiegu `select datname from pg_database where datname like 'mig\_test\_%'` zwraca 0 wierszy — 7f30c00

#### Manual

- [x] 1.5 Fakty ze spike'u (rola pod `DB_URL`, `rolcreatedb`, zachowanie `--workdir`) zapisane w notatce fazy — 7f30c00
- [x] 1.6 Przerwany przebieg (Ctrl+C w trakcie testu) zostawia bazę `mig_test_…`, którą usuwa kolejny `npm run test:migrations` (sweep przed przebiegiem) — 7f30c00
- [x] 1.7 Komunikat błędu CLI dla URL-a z fałszywym, wyróżniającym się hasłem (np. celowo zły port) nie zawiera tego hasła — 7f30c00

### Phase 2: Fixture, inwarianty i deklaracje

#### Automated

- [x] 2.1 `npm run test:migrations` przechodzi: strażnicy, „brak migracji nowszych niż linia bazowa” (dziś), 6 mutantów wykrytych, przypadek zadeklarowany przechodzi
- [x] 2.2 `npm test` przechodzi (unit + services + migrations w jednym przebiegu, bez kolizji global setupów)
- [x] 2.3 `npm run lint` przechodzi
- [x] 2.4 Celowe zepsucie: tymczasowa migracja `supabase/migrations/<nowa wersja>_probe.sql` z `delete` jednego wiersza o UUID z fixture'u (`3…01`, nieobecny w dev i na produkcji) bez deklaracji → `npm run test:migrations` czerwony z różnicą w `substitutes`; po usunięciu pliku zielony

#### Manual

- [x] 2.5 Różnica zgłoszona przy celowym zepsuciu wskazuje konkretny wiersz i tabelę (czytelna bez zaglądania w kod)
- [x] 2.6 3 przebiegi `npm run test:migrations` z rzędu bez flaków; czas przebiegu zanotowany

### Phase 3: Atomowość pliku migracji

#### Automated

- [ ] 3.1 `npm run test:migrations` przechodzi z przypadkiem atomowości
- [ ] 3.2 `npm run lint` przechodzi

#### Manual

- [ ] 3.3 Zaobserwowane zachowanie CLI (atomowe / nieatomowe) potwierdzone z użytkownikiem przed zamknięciem fazy

### Phase 4: Bramka w dokumentacji

#### Automated

- [ ] 4.1 `npx prettier --check README.md context/foundation/test-plan.md` przechodzi
- [ ] 4.2 `npm run lint` przechodzi
- [ ] 4.3 `grep -n "db reset" README.md` nie zwraca polecenia do uruchomienia lokalnie

#### Manual

- [ ] 4.4 Ktoś, kto nie brał udziału w planowaniu, wykonuje z README kroki przed `db push` (bez samego pushu) i dochodzi do zielonego `npm run test:migrations`
- [ ] 4.5 §6.5 odpowiada na pytanie „jak dodać migrację zmieniającą dane?” bez czytania kodu testu
