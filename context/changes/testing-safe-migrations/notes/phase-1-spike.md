# Phase 1 — fakty ze spike'u (2026-11-18)

Sprawdzone na działającym lokalnym stosie (Supabase CLI 2.117.0, PostgreSQL 17.6) przed napisaniem kodu fazy 1. Wynik pozytywny: izolacja przez drugą bazę w klastrze działa, plan bez zmian.

## Rola i bazy

- `DB_URL` (`127.0.0.1:54322/postgres`) łączy jako `postgres`: `select current_user, session_user` → `postgres` / `postgres`.
- `select rolname, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls from pg_roles where rolname = current_user` → `rolsuper = false`, `rolcreatedb = true`, `rolcreaterole = true`, `rolbypassrls = true`.
- Hasło lokalne = nazwa roli (`postgres`), co potwierdza regułę „nie maskować gołego hasła” (F3 przeglądu planu).
- Bazy klastra przed testem: `_supabase`, `postgres`, `template0`, `template1`.
- `create database "mig_test_…"` działa; nowa baza nie ma schematu `auth` ani tabel w `public`.
- `drop database … with (force)` działa także przy połączonym kliencie. Ten klient dostaje wtedy `FATAL 57P01` jako zdarzenie `error`; bez listenera Node pada (stąd `ScratchDb.lost` i listener w `scratch-db.ts`).
- `create database X template Y` przy kliencie połączonym z `Y` → `source database "…" is being accessed by other users`; po zamknięciu klienta działa, kopia zawiera zastępczy `auth.users`.

## `auth.uid()` w zalążku

- `init-scripts/00000000000001-auth-schema.sql:94` czyta tylko `request.jwt.claim.sub`. Funkcja w działającej bazie `postgres` (odczyt `pg_get_functiondef`) to `coalesce(request.jwt.claim.sub, request.jwt.claims->>'sub')::uuid`. Zalążek kopiuje tę drugą, więc działa z claimami, które ustawia `pg-sessions.ts`.

## `migration up --db-url --workdir`

- Działa bez powłoki: `node node_modules/supabase/dist/supabase.js migration up --db-url <url> --workdir <tmp> --agent no`, gdzie `<tmp>/supabase/migrations/*.sql`. Kod 0, ok. 2,1 s dla 6 migracji.
- `config.toml` w katalogu roboczym nie jest potrzebny (wynik identyczny z nim i bez niego); runner kopiuje go zgodnie z planem.
- **Pułapka:** `--workdir` musi wskazywać katalog projektu (rodzica `supabase/`). Z `--workdir <tmp>/supabase` CLI nic nie nakłada, wypisuje `{"applied":[]}` i kończy z kodem 0 (cichy sukces).
- CLI tworzy `supabase_migrations.schema_migrations` w jednorazowej bazie i zapisuje wszystkie 6 wersji z nazwami (liczby instrukcji: 17, 4, 8, 4, 7, 3). Kategorie po przebiegu: `ciasta`, `dania-miesne`, `wegetarianskie` z nowymi nazwami.
- CLI zapisuje `<workdir>/supabase/.temp/cli-latest`; runner usuwa cały katalog w `finally`.
- Pod agentem AI CLI 2.117.0 sam przełącza stdout na JSON (`--agent auto`); `--agent no` daje zwykły tekst. Postęp i błędy idą na stderr.
- Wersja już zastosowana, a pominięta w katalogu (pliki 2–6 na bazie z 1–6) → kod 1, „Remote migration versions not found in local migrations directory.” (potwierdza kontrakt `applyMigrations`, F1 przeglądu planu).
- Błędna 7. migracja (`select 1; select * from nope;`) → kod 1, `ERROR: relation "nope" does not exist (SQLSTATE 42P01) At statement: 1`; 6 wcześniejszych zostaje, wersja 7 niezapisana. Atomowość jednego pliku mierzy faza 3.

## Maskowanie

- `applyMigrations` z hasłem `Zq9distinctivePW` na złym porcie 54399 (ECONNREFUSED) i na dobrym porcie 54322 (`28P01 password authentication failed`): kod 1, hasła nie ma w wyjściu. Surowe wyjście CLI też go nie zawiera (pokazuje `host=… user=postgres database=…`).

## Przerwany przebieg (kryterium 1.6)

- Jedno Ctrl+C w Vitest 5.1.0 nie zabija przebiegu: Vitest wypisuje „Cancelling test run. Press CTRL+c again to exit forcefully.”, czeka na bieżący test (`cancelCurrentRun`) i zamyka się normalnie (`ctx.exit`), więc `afterAll` usuwa bazę, a teardown robi sweep (`node_modules/vitest/dist/chunks/cli-api.*.js`, `registerConsoleShortcuts`). Kolejny przebieg słusznie pokazuje „usunął baz testowych: 0” (sprawdzone przez użytkownika).
- Zaległa baza zostaje tylko po twardym przerwaniu (drugie Ctrl+C, zamknięty terminal, awaria). Odtworzone: uruchomienie `npx vitest run --project migrations`, oczekiwanie na bazę w `pg_database`, `taskkill /T /F` na drzewie procesów → zostaje `mig_test_mwmbplfp068544_smoke`; następny `npm run test:migrations` → „sweep przed przebiegiem usunął baz testowych: 1”, test zielony, 0 baz po przebiegu.

## Komunikat bez hasła (kryterium 1.7)

- `applyMigrations("postgresql://postgres:Zq9distinctivePW@127.0.0.1:<port>/mig_test_maskcheck_x", [])` (2026-11-18): port 54399 → `kod wyjścia 1`, `dial error (connect ECONNREFUSED 127.0.0.1:54399)`; port 54322 → `kod wyjścia 1`, `FATAL: password authentication failed for user "postgres" (SQLSTATE 28P01)`. W obu wyjściach hasła nie ma; rola `postgres` czytelna.
