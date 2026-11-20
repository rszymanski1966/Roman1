# Faza 3 rolloutu testów — bezpieczne migracje — Plan Brief

> Full plan: `context/changes/testing-safe-migrations/plan.md`
> Research: `context/changes/testing-safe-migrations/research.md`

## What & Why

Bramka uruchamiana lokalnie przed `db push`. Każda migracja nowsza niż linia bazowa przechodzi przez jednorazową bazę z syntetycznymi danymi w kształcie produkcji. Musi zachować liczności, przypisania kategorii, oznaczenia „najlepszy” i treść wierszy, chyba że zadeklaruje zmianę. Ryzyko #3 z test-planu: migracja wypchnięta na produkcję gubi lub przekłamuje dane, a „przechodzi na pustej bazie” niczego nie dowodzi.

## Starting Point

Dziś `db push` uruchamiasz ręcznie i nic go nie poprzedza. Jedyna dotąd destrukcyjna migracja (usuwanie duplikatów) była sprawdzona tylko ręcznie. Harness ma już `DB_URL`, `pg`, sweep przed i po oraz hash danych dev. Migracje używają `public.*` na sztywno i potrzebują `auth.users` / `auth.uid()`.

## Desired End State

`npm run test:migrations` (także w `npm test`) tworzy bazy `mig_test_<runId>…` w lokalnym klastrze i nakłada migracje przez `supabase migration up --db-url` do linii bazowej. Potem ładuje fixture i porównuje snapshot inwariantów po każdej nowszej migracji. Syntetyczne mutanty dowodzą, że porównanie łapie każdy inwariant. Migracja, która pada w połowie pliku, nie zostawia stanu pośredniego. Po przebiegu nie zostaje żadna baza testowa, a dane dev są nietknięte. README, CLAUDE.md i test-plan opisują kolejność przed pushem.

## Key Decisions Made

| Decision         | Choice                                                                       | Why (1 sentence)                                                                                         | Source          |
| ---------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | --------------- |
| Izolacja         | Druga baza w lokalnym klastrze + zastępczy `auth`                            | Zero nowej infrastruktury; migracja dotykająca `auth`/`storage` padnie głośno, nie przejdzie po cichu    | Research + Plan |
| Nakładanie       | `npx supabase migration up --db-url` z tymczasowego `--workdir`              | Ta sama ścieżka co `db push`, więc test mówi o produkcji                                                 | Plan            |
| Zakres           | Migracje nowsze niż `BASELINE_MIGRATION` (dziś `20261028120000`)             | Fixture opisuje dzisiejszy kształt produkcji; nowa migracja bez deklaracji = „bez zmian danych”          | Plan            |
| Wyrocznia        | Snapshot inwariantów vs `expectations[v](before)` z literałów fixture'u      | Zgodne z cookbookiem (`test-plan.md:143`): oczekiwane = przed + zadeklarowana zmiana, nie wynik migracji | Research        |
| Kontrola mutacji | 6 syntetycznych mutantów (delete, kategoria, best, notes, właściciel, nazwa) | Wymóg `test-plan.md:157`: bez niej test nie dowodzi, że rozróżnia dobrą i złą migrację                   | Research + Plan |
| Atomowość        | Jeden przypadek: błąd w połowie pliku nie zostawia stanu                     | Zamienia źródła wtórne w fakt o tym, co zostanie na produkcji; przypina CLI 2.117.0                      | Plan            |
| Bramka           | `npm run test:migrations` + kroki w README/CLAUDE.md; push zostaje ręczny    | Zgodne z obecnymi bramkami lokalnymi; push na produkcję jest human-only                                  | Plan            |
| Dane             | Tylko syntetyczne fixture'y SQL                                              | Prywatność per użytkownik (PRD), dane dev nietykalne                                                     | Research        |

## Scope

**In scope:**

- `tests/harness/scratch-db.ts` (+ test wąskości wzorca), `migrate-cli.ts`, `migration-snapshot.ts`, `migrations-global-setup.ts`
- `tests/migrations/{fixture.sql, expectations.ts, migrations.test.ts}`, projekt Vitest `migrations`, `npm run test:migrations`
- README (kolejność przed pushem, bez `db reset`), CLAUDE.md (komendy), test-plan (§1 ograniczenie o bazach `mig_test_*`, §3–§8)

**Out of scope:**

- CI i hook pre-push (faza 4), skrypt wykonujący `db push`
- Kopia danych produkcyjnych/dev, prawdziwy `auth` w kontenerze, test historii przed linią bazową
- Zmiany migracji, schematu, aplikacji; RLS w jednorazowej bazie

## Architecture / Approach

Global setup projektu `migrations` robi sweep baz `mig_test_` i liczy hash danych dev przed i po, bez sweepu kont, żeby nie kolidować z `services` w `npm test`. `beforeAll` buduje bazę wyjściową z zastępczym `auth`, migracjami ≤ linia bazowa (CLI) i fixture'em (`pg`), potem zamyka połączenia. Każdy przypadek klonuje ją przez `create database … template …`, nakłada swoje migracje przez CLI (prawdziwe nowe albo syntetyczne mutanty) i porównuje `migrationSnapshot` z oczekiwanym. Błędy CLI trafiają do komunikatu bez hasła.

## Phases at a Glance

| Phase                              | What it delivers                                                                              | Key risk                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1. Jednorazowa baza i runner CLI   | Spike założeń, helper baz + sweep + test wzorca, runner CLI, projekt `migrations`, test dymny | `create database` albo `--workdir` nie działa jak zakładamy → stop i powrót do izolacji |
| 2. Fixture, inwarianty, deklaracje | Fixture, snapshot, `BASELINE_MIGRATION` + deklaracje, bramka, 6 mutantów                      | Fixture za ubogi, żeby mutant był widoczny; czas `npm test`                             |
| 3. Atomowość pliku                 | Przypadek „błąd w połowie pliku” przez CLI                                                    | CLI nieatomowe → stop, decyzja z użytkownikiem                                          |
| 4. Bramka w dokumentacji           | README, CLAUDE.md, test-plan §1, §3–§8                                                            | Hunki CLAUDE.md zmieszane z blokiem 10x-cli                                             |

**Prerequisites:** działający lokalny stos (`npx supabase start`; przy błędzie portów WinNAT restart usługi jako admin), Docker, Supabase CLI 2.117.0.
**Estimated effort:** ~2–3 sesje w 4 fazach (fazy 1–2 największe).

## Open Risks & Assumptions

- Założenie: `DB_URL` łączy jako `postgres` z `CREATEDB` — potwierdzone tylko w pliku obrazu, sprawdzane w spike'u fazy 1.
- Założenie: `migration up --db-url --workdir` działa na bazie bez schematów Supabase poza zastępczym `auth`.
- Linia bazowa i fixture wymagają ręcznej aktualizacji po każdym pushu (opisane w README i §6.5).
- Migracja usuwająca kolumnę z bazowego snapshotu wymaga aktualizacji zapytania snapshotu razem z linią bazową.

## Success Criteria (Summary)

- Przed `db push` jedna komenda mówi, czy nowa migracja zmienia dane inaczej niż deklaruje, z różnicą wskazującą tabelę i wiersz.
- Celowo destrukcyjna migracja bez deklaracji oblewa bramkę; po przebiegu dane dev i lista baz są jak przed.
