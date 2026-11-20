---
date: 2026-11-16T17:53:49+01:00
researcher: Claude (Opus 5.5) z rszymanski1966
git_commit: 5213da2
branch: chore/testing-safe-migrations
repository: 10x-astro-starter
topic: "Ugruntowanie fazy 3 test-planu (Bezpieczne migracje): ryzyko #3"
tags: [research, testing, migrations, supabase, postgres, fixtures]
status: complete
last_updated: 2026-11-16
last_updated_by: Claude (Opus 5.5)
---

# Research: faza 3 test-planu — bezpieczne migracje (#3)

**Date**: 2026-11-16T17:53:49+01:00
**Researcher**: Claude (Opus 5.5) z rszymanski1966
**Git Commit**: 5213da2
**Branch**: chore/testing-safe-migrations
**Repository**: 10x-astro-starter

## Research Question

Co musi wiedzieć `/10x-plan`, żeby zbudować test „migracja uruchomiona na bazie z reprezentatywnymi danymi zachowuje liczbę wierszy, oznaczenia „najlepszy” i przypisania kategorii (poza zmianami zamierzonymi)” (`context/foundation/test-plan.md:56`)? Konkretnie (z kolumny „Context `/10x-research` must ground”, `test-plan.md:56`): jak zbudować jednorazową bazę z danymi bez dotykania lokalnej bazy deweloperskiej i bez `db reset` (`test-plan.md:32`), oraz jak dziś wygląda `db push` na produkcję. Dodatkowo: co robią istniejące migracje z danymi i czego spodziewać się po M-02.

## Summary

- **Jak dziś migracja trafia na produkcję**: ręcznie, z maszyny użytkownika: `npx supabase link` raz, potem `npx supabase db push` przed wdrożeniem kodu, który od niej zależy (`README.md:130-135`); w praktyce na gałęzi feature przed merge, bo merge do `main` = deploy Workera (`context/archive/2026-10-17-edit-entries/plan.md:68`, `.github/workflows/ci.yml` — brak kroku Supabase). Kontrola po pushu: `npx supabase migration list` (Local = Remote) (`context/archive/2026-10-10-unique-substitutes/plan.md:203`). Przed pushem nie ma żadnego automatycznego sprawdzenia; bramka „test migracji na danych — local, przed `db push`” jest zaplanowana na fazę 3 (`test-plan.md:115`), §6.5 to „TBD” (`test-plan.md:186-188`). `wrangler rollback` nie cofa schematu (`context/foundation/infrastructure.md:81`).
- **Jednorazowa baza — rekomendacja: druga baza w tym samym lokalnym Postgresie** (`create database` przez `pg` pod `DB_URL`) z minimalnym zalążkiem schematu `auth`. Uzasadnienie: migracje są w całości kwalifikowane `public.` i odwołują się do `auth.users` / `auth.uid()` (`supabase/migrations/20261004120000_substitute_database.sql:30-32`), więc osobny schemat odpada; rola `postgres` w obrazie Supabase ma `CREATEDB` (`/docker-entrypoint-initdb.d/migrations/10000000000000_demote-postgres.sql:22` w obrazie `public.ecr.aws/supabase/postgres:17.6.1.166`); role `anon`/`authenticated`/`service_role` są globalne dla klastra (`init-scripts/00000000000000-initial-schema.sql:29-31` w tym obrazie), ale schemat `auth` istnieje tylko w bazie `postgres`. Ta sama opcja „(2a)” była już oceniona jako odpowiednia „do testów SQL i migracji (ryzyko #3)” (`context/archive/2026-11-04-testing-isolation-and-delete/research.md:100`). Alternatywa o wyższej wierności: osobny kontener z tego samego obrazu (prawdziwy schemat `auth`), droższy i wrażliwy na porty WinNAT.
- **Reprezentatywne dane = syntetyczne fixture'y SQL** wstawiane jako `postgres` w jednorazowej bazie (nie ma tam PostgREST/GoTrue, więc ścieżka `addSubstitute` z §6.2 nie działa). Żaden dokument nie dopuszcza kopii danych produkcyjnych do testów; PRD wymaga prywatności danych per użytkownik (`context/foundation/prd.md:158`), a operacje na bazie produkcyjnej poza odczytem są „human-only” (`infrastructure.md:82`).
- **Inwentarz migracji**: z 6 plików w `supabase/migrations/` dane zmieniają 3: seed 3 kategorii (`20261004120000:22-25`), usuwanie duplikatów zamienników z zachowaniem najstarszego (`20261010115230_unique_substitutes.sql:14-24`, nieodwracalne) i zmiana nazw 3 kategorii po slugu (`20261028120000_rename_categories.sql:6-8`). Żaden z 6 plików nie ma `begin`/`commit`, żaden nie jest w całości powtarzalny.
- **M-02 nie jest zdefiniowany** — roadmapa ma tylko zamknięty M-01 (`context/foundation/roadmap.md:153-155`). Test musi więc być ogólny (każda nowa migracja), a nie pisany pod konkretną zmianę.

## Detailed Findings

### 1. Procedura `db push` dziś

- Dokumentacja: link raz, `db push` **przed** wdrożeniem kodu zależnego; CI wdraża tylko Workera (`README.md:130-135`).
- Uruchamia użytkownik ręcznie (`context/archive/2026-10-11-best-substitute-highlight/plan.md:264`), na gałęzi feature przed merge (`context/archive/2026-10-17-edit-entries/plan.md:68`, `:413`; `context/archive/2026-10-24-delete-entries-confirmed/plan.md:471`; zasada z `context/archive/2026-10-04-first-substitute-lookup/reviews/plan-review.md:74-81`).
- Sprawdzenie po pushu: `npx supabase migration list` pokazuje Local = Remote (`context/archive/2026-10-10-unique-substitutes/plan.md:203`, `:210`).
- CLI ma `db push --dry-run` („Print the migrations that would be applied”) i `--db-url` w `migration up`, `db push`, `migration list`, `test db`, `db dump` (sprawdzone `npx supabase <cmd> --help`, Supabase CLI 2.117.0). Projekt jest powiązany z projektem zdalnym (`supabase/.temp/project-ref` istnieje; `.temp` jest w `supabase/.gitignore:3`). Wersja Postgresa projektu zdalnego zapisana przez CLI: `17.6.1.166` (`supabase/.temp/postgres-version`), `[db] major_version = 17` (`supabase/config.toml`, sekcja `[db]`).
- Luki: brak kroku migracji w CI (`.github/workflows/ci.yml`); brak automatycznej kontroli przed pushem; deploy na push do `main` bez ręcznej bramki (`infrastructure.md:82`); ryzyko „Auto-deploy ships a bad migration-coupled change” i „Rollback does not revert schema” z mitygacją expand/contract i „never drop columns in the same release” (`infrastructure.md:91-92`), niczym nieegzekwowaną.
- Sprzeczność poza zakresem: `README.md:124-128` nadal każe lokalnie `npx supabase db reset`, wbrew twardemu ograniczeniu `test-plan.md:32`.

### 2. Co istniejące migracje robią z danymi

| Migracja                                 | Zmiana danych                                                                                                                | Zależności spoza `public`                                                                                | Uwagi                                                                                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `20261004120000_substitute_database.sql` | insert 3 kategorii `ciasta`/`dania-miesne`/`wegetarianskie` (`:22-25`)                                                       | FK `auth.users (id)` on delete cascade (`:32`, `:56`, `:88`); `default auth.uid()`; rola `authenticated` | tworzy 4 tabele; `ingredient_categories.category_id` bez `on delete` = NO ACTION                                                                              |
| `20261010115230_unique_substitutes.sql`  | **delete** duplikatów w `(ingredient_category_id, lower(name))`, zostaje wiersz o najmniejszym `(created_at, id)` (`:14-24`) | brak                                                                                                     | kolumna generowana `name_key` (`:11-12`), unique (`:26-28`), `drop index` bez `if exists` (`:31`); komentarz każe wyeksportować podgląd przed pushem (`:5-8`) |
| `20261011201658_best_substitute.sql`     | `is_best boolean not null default false` — istniejące wiersze dostają `false` (`:8-9`)                                       | `auth.uid()`, `anon`, `authenticated`, `public`                                                          | częściowy indeks unikalny jednego najlepszego na parę (`:13-15`), funkcja `set_best_substitute` (`:36-80`)                                                    |
| `20261021120000_edit_entries.sql`        | brak                                                                                                                         | `auth.uid()`, `anon`, `authenticated`                                                                    | granty i polityka; rollback jako komentarz (`:17-21`)                                                                                                         |
| `20261026202646_delete_entries.sql`      | brak w trakcie migracji                                                                                                      | `auth.uid()`, `anon`, `authenticated`                                                                    | polityki delete, indeksy, `create or replace` funkcji z `for update` (`:69-113`); rollback jako komentarz (`:27-36`)                                          |
| `20261028120000_rename_categories.sql`   | 3× `update categories set name … where slug …` (`:6-8`)                                                                      | brak                                                                                                     | `id` i `slug` bez zmian, więc przypisania kategorii zostają (`:1-4`); brak sluga = 0 wierszy bez błędu                                                        |

- Żaden z 6 plików nie zawiera `begin`/`commit`, triggerów ani odwołań do `storage`/rozszerzeń (przegląd pełnych plików przez workera; potwierdzone grepem: wszystkie tabele kwalifikowane `public.`).
- `supabase/seed.sql` nie istnieje, choć `config.toml` (`[db.seed] sql_paths = ["./seed.sql"]`) na niego wskazuje; seed kategorii żyje w pierwszej migracji.

### 3. Co porównywać („dane zachowane”)

Końcowy schemat tabel użytkownika (po 6 migracjach):

- `categories(id, slug unique, name unique, sort_order)` — bez `user_id`.
- `ingredients(id, user_id → auth.users cascade, name, name_key [liczony w aplikacji], created_at)`, unique `(user_id, name_key)`.
- `ingredient_categories(id, user_id, ingredient_id → ingredients cascade, category_id → categories NO ACTION, created_at)`, unique `(ingredient_id, category_id)`.
- `substitutes(id, user_id, ingredient_category_id → ingredient_categories cascade, name, ratio, notes, created_at, name_key generated lower(name), is_best)`, unique `(ingredient_category_id, name_key)`, częściowy unique `(ingredient_category_id) where is_best`.

Inwarianty do porównania przed/po (propozycja z inwentarza, do decyzji w planie):

1. Liczność wierszy per `user_id` w `ingredients`, `ingredient_categories`, `substitutes`; liczność `auth.users`.
2. Przypisania kategorii jako zbiór `(ingredient_id, category_slug)` — porównywać po `slug`, bo `name` zmienia się celowo (M6), a `id` kategorii to losowy uuid per baza.
3. Zbiór najlepszych `{(ingredient_category_id, substitute_id) where is_best}` — żadna para nie zyskuje ani nie traci najlepszego.
4. Treść wierszy (np. hash `(id, name, ratio, notes, ingredient_category_id)` zamienników i `(id, name, name_key)` składników) — same liczności nie złapią UPDATE w miejscu (ta sama obserwacja: `context/archive/2026-11-04-testing-isolation-and-delete/research.md:105`).
5. Spójność właściciela wzdłuż FK (`substitutes.user_id = ingredient_categories.user_id = ingredients.user_id`) — dziś pilnuje jej tylko RLS przy insercie, żadne ograniczenie.
6. Migracja celowo zmieniająca dane (jak M2 albo M6) deklaruje oczekiwaną różnicę (zbiór usuniętych id, mapa nowych nazw); wyrocznią jest „przed” plus zadeklarowana zmiana, nie „przed = po”. Wzorzec zgodny z §6.2: „Oczekiwane „po” = „przed” minus id, które nazywa reguła” (`test-plan.md:143`).

### 4. Jak zbudować jednorazową bazę bez dotykania danych dev

| Opcja                                                                                                                    | Dowód                                                                                                                                                                                                                                                                                                                                                                                    | Koszt / ryzyko                                                                                                                                                                                                                                                                                                                              | Wpływ na dane dev                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **A. Druga baza w lokalnym klastrze** (`create database mig_<runId>` jako `postgres` pod `DB_URL`, potem zalążek `auth`) | `postgres` ma `NOSUPERUSER CREATEDB CREATEROLE … BYPASSRLS` (`demote-postgres.sql:22` w obrazie 17.6.1.166); role API globalne (`initial-schema.sql:29-31`); `DB_URL` i `pg` już są w harnessie (`tests/harness/env.ts:9-10`, `tests/harness/pg-sessions.ts:80-81`); oceniona jako odpowiednia dla ryzyka #3 (`context/archive/2026-11-04-testing-isolation-and-delete/research.md:100`) | niski; trzeba zbudować zalążek: `schema auth`, `auth.users(id uuid pk, …)`, `auth.uid()` czytające `request.jwt.claims`; domyślne uprawnienia Supabase do schematu `public` (`alter default privileges`) są per baza, więc w nowej bazie ich nie będzie — bez znaczenia dla testu danych jako `postgres`, istotne, gdyby test sprawdzał RLS | żaden: dane dev żyją w bazie `postgres`; `devSnapshot` czyta tylko ją (`tests/harness/snapshot.ts:7-8`, przez PostgREST) |
| B. Osobny kontener `public.ecr.aws/supabase/postgres:17.6.1.166` na wolnym porcie                                        | obraz jest lokalnie (`docker images`); ma prawdziwy `auth.users` (`init-scripts/00000000000001-auth-schema.sql:7`) i `auth.uid()` (`:94`); ta sama wersja co projekt zdalny (`supabase/.temp/postgres-version`)                                                                                                                                                                          | średni: start kontenera, wolny port (WinNAT bywa problemem, zob. pamięć projektu), sprzątanie kontenera po przerwanym przebiegu                                                                                                                                                                                                             | żaden                                                                                                                    |
| C. Transakcja na bazie dev (jak pgTAP)                                                                                   | —                                                                                                                                                                                                                                                                                                                                                                                        | migracje celują w `public.*` na tabelach z danymi dev; DDL trzyma blokady na tabelach dev; nie da się testować stanu „przed migracją”, jeśli `migration up` już ją lokalnie zastosował; fixture'y mieszają się z danymi dev                                                                                                                 | po rollbacku żaden, ale w trakcie — tak; odrzucić                                                                        |
| D. Osobny schemat                                                                                                        | migracje kwalifikowane `public.` (grep wszystkich 6 plików)                                                                                                                                                                                                                                                                                                                              | niewykonalne bez przepisywania migracji (tak samo `research.md:102` z 2026-11-04)                                                                                                                                                                                                                                                           | —                                                                                                                        |
| E. Drugi stos Supabase                                                                                                   | odrzucony wcześniej: ~7 GB RAM, WinNAT (`context/archive/2026-11-04-testing-isolation-and-delete/research.md:101`)                                                                                                                                                                                                                                                                       | wysoki                                                                                                                                                                                                                                                                                                                                      | żaden                                                                                                                    |

Szczegóły opcji A:

- `create database … template postgres` (klon bazy dev) odpada: Postgres wymaga, żeby baza-szablon nie miała innych połączeń, a usługi stosu są do niej podłączone (reguła Postgresa, nie sprawdzona na działającym stosie). Nowa baza powstaje z domyślnego szablonu, więc pusta.
- Sprzątanie: `drop database … with (force)` w `finally` oraz sweep zaległych baz wzorca nazwy (np. `mig_test_%`) przed przebiegiem — analogicznie do sweepu kont (`tests/harness/global-setup.ts:95-99`). Nazwa bazy musi mieć wąski wzorzec z własnym testem, jak konta (`test-plan.md:198`).
- Nie zweryfikowane na działającym stosie (stos był zatrzymany w trakcie badania): że `DB_URL` łączy jako `postgres` i że `create database` przechodzi. Archiwum notuje domyślne `postgres/postgres` jako niezweryfikowane (`context/archive/2026-11-04-testing-isolation-and-delete/research.md:105`). To pierwszy krok planu (jedno zapytanie `select rolcreatedb from pg_roles where rolname = current_user`).

### 5. Jak nałożyć migracje na jednorazową bazę

- `npx supabase migration up --db-url <url>` stosuje **wszystkie** oczekujące migracje (`--help`, CLI 2.117.0); żeby zatrzymać się przed migracją testowaną, potrzebny jest katalog roboczy z podzbiorem plików (`--workdir`) albo wykonanie plików SQL bezpośrednio przez `pg`.
- `pg` (protokół prosty): wieloinstrukcyjny tekst bez jawnego `begin`/`commit` wykonuje się jako jedna niejawna transakcja (zachowanie Postgresa; żaden z 6 plików nie ma `begin`/`commit`). Daje pełną kontrolę kolejności: migracje 1…k−1 → fixture'y → snapshot → migracja k → snapshot.
- Czy CLI wykonuje każdy plik w jednej transakcji: tylko źródła wtórne (wyniki wyszukiwania twierdzą, że partia migracji jest niejawnie transakcyjna); kodu CLI nie sprawdzono. Ma znaczenie dla pytania „co zostaje na produkcji po błędzie w połowie pliku”. Można to rozstrzygnąć empirycznie na jednorazowej bazie (celowo błędna migracja przez `migration up --db-url`, potem `migration list --db-url`).
- Wierność: test przez `pg` nie ćwiczy dzielenia instrukcji przez CLI ani zapisu do `supabase_migrations.schema_migrations`; test przez CLI ćwiczy, ale wymaga `--workdir` z podzbiorem. Wybór dla planu.

### 6. Reprezentatywne dane

- Źródłem nie może być kopia produkcji ani bazy dev (prywatność per użytkownik `prd.md:158`; produkcja poza odczytem jest human-only `infrastructure.md:82`; dane dev są nietykalne `test-plan.md:32`). Żaden dokument nie opisuje anonimizacji.
- W jednorazowej bazie nie ma PostgREST/GoTrue (`context/archive/2026-11-04-testing-isolation-and-delete/research.md:100`), więc fixture'y wstawia SQL jako `postgres` (jak setup pgTAP, `test-plan.md:164-165`), nie `addSubstitute` (§6.2 dotyczy bazy dev).
- Co fixture powinien zawierać, żeby ćwiczyć znane klasy zmian (wnioskowane z inwentarza §2): co najmniej 2 konta; składnik w więcej niż jednej kategorii; pary z najlepszym i bez; zamienniki z `notes` null i niepustym; nazwy z polskimi znakami i różną wielkością liter (dotyczy `lower()` w M2 i `name_key`); ta sama nazwa u dwóch kont; wszystkie 3 slugi kategorii w użyciu.
- Weryfikacja przypadku destrukcyjnego (M2) w przeszłości była ręczna: 15 → 14 wierszy lokalnie (`context/archive/2026-10-10-unique-substitutes/reviews/impl-review.md:28`), automatyczny test pominięty jako „jednorazowa migracja” (F6, `impl-review.md:82-90`).

## Code References

- `supabase/migrations/20261004120000_substitute_database.sql:22-25` — seed kategorii
- `supabase/migrations/20261004120000_substitute_database.sql:30-32` — `public.ingredients`, FK do `auth.users`, `default auth.uid()`
- `supabase/migrations/20261010115230_unique_substitutes.sql:5-8` — instrukcja eksportu podglądu przed pushem
- `supabase/migrations/20261010115230_unique_substitutes.sql:14-24` — usuwanie duplikatów
- `supabase/migrations/20261011201658_best_substitute.sql:8-15` — `is_best` i częściowy indeks unikalny
- `supabase/migrations/20261028120000_rename_categories.sql:1-8` — zmiana nazw po slugu
- `tests/harness/env.ts:9-10`, `:35-48` — `DB_URL` z `npx supabase status -o env`
- `tests/harness/pg-sessions.ts:80-93` — połączenie `pg` pod `DB_URL`
- `tests/harness/snapshot.ts:7-8`, `:26-39` — hash danych dev tylko z bazy `postgres` przez PostgREST
- `tests/harness/global-setup.ts:95-121` — sweep i porównanie hashy
- `vitest.config.ts:20-50` — projekty `unit`/`services`/`http`; global setup per projekt
- `scripts/db-access.mjs:2-3` — strażnik skanuje `src/` i `security definer` w migracjach; testy w `tests/` z `pg` go nie dotyczą
- `README.md:124-135` — lokalnie `db reset` (sprzeczne z `test-plan.md:32`), produkcja `link` + `db push`
- obraz `public.ecr.aws/supabase/postgres:17.6.1.166`: `/docker-entrypoint-initdb.d/migrations/10000000000000_demote-postgres.sql:22`, `init-scripts/00000000000000-initial-schema.sql:29-31`, `init-scripts/00000000000001-auth-schema.sql:7`, `:94`

## Architecture Insights

- Harness ma już wszystko, czego opcja A potrzebuje: `DB_URL`, `pg`, wzorzec sweepu przed/po i hash danych dev. Nowy test nie potrzebuje nowej zależności.
- Test migracji jest niezależny od kont tymczasowych i PostgREST, więc może żyć w osobnym projekcie Vitest (np. `migrations`) z własnym global setup (sweep baz wzorca), albo w `services` — wtedy dostaje też istniejący sweep kont i hash, które pozostaną bez zmian, bo test nie dotyka bazy `postgres`. Decyzja planu.
- Zasady z §6 przenoszą się wprost: wyrocznia to literalne oczekiwania z zamierzonej zmiany, nie wynik tego samego SQL; obowiązkowa kontrola mutacyjna (celowo zła migracja, np. delete bez `partition by` albo update kategorii po `id` zamiast `slug`, musi oblać test) (`test-plan.md:157`).
- Gate'a „przed `db push`” nie da się wymusić w CI w tej fazie (CI nie uruchamia testów, faza 4). Realne miejsce: skrypt npm + kroki w README/CLAUDE.md obok `db push --dry-run` i `migration list`.

## Historical Context (from prior changes)

- `context/archive/2026-10-10-unique-substitutes/reviews/plan-review.md:35-43` — F2 (naprawione): usunięto niezweryfikowane założenie o dziennym backupie na planie Free; zamiast tego eksport CSV podglądu. Plan: „Nie zakładamy dostępności backupu Supabase” (`plan.md:240`). Nadal aktualne: dostępność backupu/PITR na produkcji nigdzie nie sprawdzona.
- `context/archive/2026-10-10-unique-substitutes/reviews/impl-review.md:32-40` — F1 (naprawione procedurą): CSV mógł pominąć wiersze dodane między podglądem a pushem → podgląd tuż przed pushem i kontrola liczności po = przed − wiersze CSV; ręczne kroki wycofania. Sama migracja pozostaje nieodwracalna (supported).
- `context/archive/2026-10-10-unique-substitutes/reviews/impl-review.md:82-90` — F6 (pominięte): brak automatycznego testu usuwania duplikatów. Nadal aktualne; ta faza jest pierwszym miejscem, które mogłoby go dać.
- Commit `56daf38` (PR #27) — `20261028120000_rename_categories.sql` bez folderu change'a; jedyna zapisana weryfikacja (w przejrzanym archiwum i historii git) to treść commita („Already applied locally (migration up) and to production (db push)”). Testy w `tests/` i `supabase/tests/` (grep) wybierają kategorie po slugu i nie asertują ich nazw.
- `context/archive/2026-10-17-edit-entries/follow-ups/review-fixes.md:6` — otwarty follow-up: `ingredients.name_key` jako trigger/kolumna generowana, z prośbą o sprawdzenie na danych produkcyjnych, że `lower()` = `toLocaleLowerCase("pl")`. Kandydat na przyszłą migrację zmieniającą dane — dokładnie przypadek, który test na fixture'ach z polskimi znakami powinien obsłużyć.
- `context/archive/2026-11-04-testing-isolation-and-delete/research.md:97-105` — porównanie opcji izolacji: (2a) druga baza w tym samym Postgresie wskazana dla migracji; (2b) drugi stos i (2c) osobny schemat odrzucone.
- Incydent 2026-10-10: `db reset` jako bramka wyczyścił lokalne dane (`test-plan.md:44`), stąd twarde ograniczenie `test-plan.md:32`.

## Related Research

- `context/archive/2026-11-04-testing-isolation-and-delete/research.md`
- `context/archive/2026-11-09-testing-search-and-best/research.md`

## Open Questions

1. **Opcja A czy B** (druga baza w klastrze z zalążkiem `auth` vs osobny kontener z prawdziwym `auth`). Rekomendacja: A — najtańsza, bez nowej infrastruktury; przyszła migracja dotykająca `auth`/`storage` padnie na zalążku głośno, nie przejdzie po cichu. B jako ścieżka, gdyby taka migracja się pojawiła.
2. **Nakładanie migracji: CLI (`migration up --db-url` z `--workdir`) czy `pg`**. Wpływa na wierność względem `db push` i na to, czy test odpowiada na pytanie o transakcyjność pliku.
3. **Zakres**: tylko nowa (najnowsza) migracja, czy każda migracja po kolei na tym samym fixture (regresja historii, w tym M2 z oczekiwanym zbiorem usuniętych i M6 z mapą nazw). Rekomendacja: ogólny runner + deklaracja oczekiwanej zmiany per migracja, domyślnie „brak zmian w inwariantach”.
4. **Gdzie żyje bramka i jak ją wywołać przed `db push`** (skrypt npm, kroki w README/CLAUDE.md, ewentualnie korekta `README.md:124-128`).
5. **Do sprawdzenia na działającym stosie** (pierwszy krok planu): rola i `rolcreatedb` pod `DB_URL`; czy `create database` / `drop database … with (force)` działa; czy CLI stosuje plik migracji atomowo.
6. **M-02 niezdefiniowany** (`roadmap.md:153-155`); termin „przed pierwszą migracją M-02” (`test-plan.md:75`) nie ma daty.
