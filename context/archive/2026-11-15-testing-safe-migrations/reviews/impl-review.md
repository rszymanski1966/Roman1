<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Faza 3 rolloutu testów — bezpieczne migracje

- **Plan**: context/changes/testing-safe-migrations/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2, 3, 4
- **Date**: 2026-11-19
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Grounding

- Zakres: commity `7f30c00`..`7ce6ef9` (p1–p4 + epilog), 21 plików. Poza planem tylko `tests/harness/env.ts` — wyjaśnione w `notes/phase-2.md` (decyzja użytkownika).
- Odchylenia zatwierdzone: `npm test` = `unit + services && migrations` (dwa przebiegi, `notes/phase-2.md`); CLI przez `node supabase/dist/supabase.js --agent no` i `auth.uid()` z `request.jwt.claim.sub` (`notes/phase-1-spike.md`).
- „What We're NOT Doing”: dotrzymane (bez zmian w `ci.yml`, `src/`, `supabase/migrations/`; brak skryptu `db push`; fixture syntetyczny; brak adaptera kolumn).
- Kryteria automatyczne uruchomione 2026-11-19: `npm run test:migrations` 14/14 (0 baz po sweepie, dane dev bez zmian), `scratch-db.test.ts` 27/27, `npm run lint`, `prettier --check` README + test-plan, `grep "db reset" README.md` (tylko ostrzeżenie, linia 131). `npm test` zielony po p3 (173 + 14); p4 zmieniła tylko dokumentację.
- Kryteria ręczne: wszystkie `[x]`, każde potwierdzone przez użytkownika w sesji (1.5–1.7 notatka spike'u, 2.5–2.6 `notes/phase-2.md`, 3.3 atomowość, 4.4–4.5).
- SQL/command injection: brak (nazwy baz przez wzorzec + `escapeIdentifier`, spawn bez powłoki z tablicą argumentów); wyciek hasła: brak na prześledzonych ścieżkach.

## Findings

### F1 — Runner migracji i klon nie sprawdzają, że cel to baza wzorca

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/harness/migrate-cli.ts:118, tests/harness/scratch-db.ts:79-83, :146-155
- **Detail**: `applyMigrations(dbUrl, …)` przyjmie dowolny URL — wywołane z `harnessEnv().dbUrl` nałoży oczekujące migracje na deweloperską bazę `postgres`. Teardown tego nie wykryje: `devSnapshot()` liczy hash z wierszy przez PostgREST, więc DDL i `schema_migrations` są dla niego niewidoczne. To samo dotyczy `urlFor()` — gdyby podmiana nazwy bazy w URL-u cicho zawiodła, zastępczy `auth` i CLI trafiłyby w `postgres`. Dziś pośrednio pilnuje tego tylko test dymny (0 tabel w `public`); ścieżki klonów nie mają strażnika. Twarde ograniczenie test-planu §1 opiera się wyłącznie na dyscyplinie wywołujących.
- **Fix**: W `applyMigrations` odczytać nazwę bazy z `dbUrl` i odmówić, gdy `!isSweepableDbName(name)`; w `createScratchDb` po `connect()` sprawdzić `select current_database()` = `name`.
  - Strength: Zamienia konwencję na egzekwowany niezmiennik w jedynych dwóch miejscach, które piszą do bazy; ta sama wąska reguła co sweep (`scratch-db.test.ts`).
  - Tradeoff: Dwa małe sprawdzenia i jeden przypadek testu (odmowa dla URL-a z `/postgres`); `migrate-cli.ts` zaczyna importować `scratch-db.ts`.
  - Confidence: HIGH — predykat już istnieje i ma test literałów.
  - Blind spot: Polecenia globalne dla klastra (role, `alter system`) i tak przechodzą przez bazę wzorca — patrz F8.
- **Decision**: FIXED (2026-11-20) — strażnik `isSweepableDbName` w `applyMigrations` przed CLI, `current_database()` w `createScratchDb`; nowy `tests/harness/migrate-cli.test.ts` (4 przypadki, czerwony bez strażnika); `test:migrations` 14/14.

### F2 — Limit 60 s na wywołanie CLI nie działa na Windows

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: tests/harness/migrate-cli.ts:36, :89-107
- **Detail**: `CLI_ENTRY` to wrapper `node_modules/supabase/dist/supabase.js`, który uruchamia natywny `supabase.exe` przez `spawn(binPath, argv, { stdio: "inherit" })` (linia 38) i przekazuje SIGTERM handlerami `process.on`. Na Windows `timeout` zabija wrapper przez TerminateProcess, handlery się nie wykonują, `supabase.exe` zostaje sierotą z odziedziczonymi potokami, a `runCli` czeka na `close` (zamknięcie wszystkich strumieni). Zawieszony CLI wisi więc do `testTimeout` 120 s Vitesta, komunikat „Supabase CLI przerwany sygnałem …” się nie pojawia, a `rm(workdir)` może dostać EBUSY. Nie odtworzone na żywo (1.7 sprawdzało zły port, który kończy się szybko).
- **Fix A ⭐ Recommended**: Uruchamiać natywny binarny CLI bezpośrednio (rozwiązany tak jak wrapper: pakiet `@supabase/cli-<platforma>`), bez pośrednika.
  - Strength: Usuwa przyczynę: `timeout` zabija proces, który naprawdę trzyma potoki; zachowanie identyczne na wszystkich platformach.
  - Tradeoff: Powiela logikę rozwiązywania ścieżki z wrappera; aktualizacja pakietu `supabase` może ją zmienić.
  - Confidence: MED — wynika z kodu wrappera i semantyki Node na Windows, nie z pomiaru.
  - Blind spot: Nie sprawdzono, czy natywny binarny bez wrappera potrzebuje jakichś zmiennych środowiska ustawianych przez wrapper.
- **Fix B**: Przy przekroczeniu limitu zabijać drzewo procesów (`taskkill /T /F /PID` na win32) i rozstrzygać na `exit` z krótkim czasem na potoki.
  - Strength: Zostawia oficjalny punkt wejścia pakietu.
  - Tradeoff: Kod zależny od platformy; więcej ruchomych części w `runCli`.
  - Confidence: MED — standardowe obejście, ale też niezmierzone tutaj.
  - Blind spot: Zachowanie `exit` vs `close` przy częściowo opróżnionych potokach.
- **Decision**: DISMISSED (2026-11-20) — pomiar przeczy przesłance: serwer TCP, który nie odpowiada, `spawn(..., { timeout: 5000 })`; wrapper `supabase/dist/supabase.js`: `exit`/`close` SIGTERM po 5341/5342 ms, natywny `supabase.exe`: 5489 ms; w obu przypadkach `tasklist` po `close` pusty (libuv na Windows trzyma dzieci w job object zamykanym razem z rodzicem). Bez zmian w kodzie.

### F3 — Utracone dowody przy sprzątaniu baz testowych

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/harness/scratch-db.ts:17, :149-151; tests/migrations/migrations.test.ts:102-108; tests/harness/migration-snapshot.ts:166-168; migrations.test.ts:183-185; migrate-cli.ts:157-159
- **Detail**: (a) `ScratchDb.lost` jest zapisywane, ale nigdzie nieczytane — błąd zerwanego połączenia znika, a kolejne zapytania dają ogólne „Connection terminated”; odpowiednik `PgSession.lost` jest rzucany przez `closeSession` (`pg-sessions.ts:144`). (b) `closeAndDrop` = `try { end() } finally { drop() }`: gdy padną oba, błąd `drop` zastępuje błąd `end`. (c) Trzy `AggregateError` mają `cause` = błąd sprzątania, choć komentarz mówi „the read's first”; `rethrowWith` i `withSessions` dają jako `cause` błąd pierwotny. Narusza regułę CLAUDE.md „no dropped error causes”.
- **Fix**: Wyeksportować z `scratch-db.ts` `closeScratchDb(db)` w kształcie `rethrowWith` (zbiera `lost`, `end`, `drop`; pierwszy jako `cause`, wszystkie w `AggregateError`), użyć go w `closeAndDrop`/`withClone`, a w trzech `AggregateError` ustawić `cause: error`.
- **Decision**: FIXED (2026-11-20) — `closeScratchDb` w `scratch-db.ts` (zgłasza `lost`, `end`, `drop`; pierwszy jako `cause`) zamiast `closeAndDrop`; trzy miejsca sprzątania przez `failureOf` + `rethrowWith` (cause = błąd pierwotny; reguła ESLint `preserve-caught-error` wymuszała wcześniej cause = błąd sprzątania w zagnieżdżonym `catch`). `closeOnFailure` w `pg-sessions.ts` celowo bez zmian (poza change'em). lint OK, `test:migrations` 14/14, harness 54/54.

### F4 — Teardown po cichu usuwa bazę zostawioną przez sam przebieg

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/harness/migrations-global-setup.ts:17-23; CLAUDE.md:29; context/foundation/test-plan.md:32, §6.5 „Sprzątanie”
- **Detail**: Teardown najpierw robi sweep (wynik ignoruje), a potem oblewa przebieg tylko, gdy baza została mimo sweepu. Baza, której test nie usunął (wyciek w `afterAll`/`withClone`), znika bez śladu. Dokumentacja mówi „fails the run if one is left”, co sugeruje więcej niż kod. Zgodne z kontraktem planu i z harnessem kont, ale chowa sygnał o przecieku.
- **Fix**: W teardown zalogować liczbę usuniętych baz (jak setup), a w dokumentacji doprecyzować: „pozostała po sweepie baza oblewa przebieg; sweep w teardown wypisuje, ile baz posprzątał”.
- **Decision**: FIXED (2026-11-20) — teardown wypisuje liczbę baz usuniętych przez sweep po przebiegu; doprecyzowane CLAUDE.md:29 i test-plan §6.5 „Sprzątanie”.

### F5 — Tekst planu rozjechał się z zatwierdzonym `npm test`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: context/changes/testing-safe-migrations/plan.md:51, :116, :189
- **Detail**: Critical Implementation Details (pierwszy punkt: „nie ma tu wyścigu”), kontrakt Phase 1 (`"test"` dostaje `--project migrations`) i kryterium 2.2 („w jednym przebiegu”) opisują jeden przebieg; kod ma dwa (`notes/phase-2.md`, decyzja użytkownika). Także `applyMigrations` rzuca nie tylko na błąd uruchomienia, ale i na sygnał/limit oraz złe wejście — rozsądne, ale poza kontraktem.
- **Fix**: Dopisać w planie krótkie addendum pod Critical Implementation Details z odnośnikiem do `notes/phase-2.md` (przed archiwizacją plan staje się źródłem dla kolejnych zmian).
- **Decision**: FIXED (2026-11-20) — addendum pod Critical Implementation Details w `plan.md` (dwa przebiegi `npm test` z odnośnikiem do `notes/phase-2.md`; szerszy kontrakt rzucania `applyMigrations`, w tym F1).

### F6 — `maskConnectionSecrets` bez testu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: tests/harness/migrate-cli.ts:53-64
- **Detail**: Jedyna funkcja, która trzyma hasło z dala od wyjścia CLI, nie ma testu (sprawdzono ją ręcznie w 1.7). Czysta funkcja, łatwa do przypięcia literałami jak `accounts.test.ts`.
- **Fix**: Dodać `tests/harness/migrate-cli.test.ts` (projekt `services` albo `unit`): URL surowy, zdekodowany, inny userinfo, `password=` gołe / w `'…'` / w `"…"`, oraz `role "postgres"` nienaruszone.
- **Decision**: FIXED (2026-11-20) — `describe("maskConnectionSecrets")` w `tests/harness/migrate-cli.test.ts`: 6 form maskowania + `role "postgres"` nienaruszone (literały); mutacja (bez formy zdekodowanej) daje czerwony. 11/11.

### F7 — Nieprecyzyjne sformułowania w dokumentacji i komentarzu

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: CLAUDE.md:29; tests/harness/env.ts:9; context/foundation/test-plan.md §6.5 „Jak działa”
- **Detail**: CLAUDE.md „Never touches the `postgres` database” — harness łączy się z `postgres` (katalog, `create`/`drop database`, odczyt hasha), tylko nie pisze tam danych; §1 test-planu mówi to precyzyjnie. Komentarz `env.ts:9` przy `dbUrl` mówi „only for … pg-sessions.ts”, a używają go też `scratch-db.ts` i `migrate-cli.ts`. §6.5 „Każdy przypadek dostaje jej klon” — dotyczy przypadków inwariantów, nie testu dymnego.
- **Fix**: „Never writes to the `postgres` database”; komentarz `env.ts:9` wymienić trzech użytkowników; w §6.5 „każdy przypadek inwariantów”.
- **Decision**: FIXED (2026-11-20) — CLAUDE.md „Never writes to the `postgres` database (only reads the catalog and creates/drops `mig_test_*` there)”; komentarz `env.ts` wymienia trzech użytkowników; §6.5 „Każdy przypadek oprócz testu dymnego …”.

### F8 — Polecenia globalne dla klastra omijają izolację

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: context/foundation/test-plan.md §6.5 „Nie”, §7
- **Detail**: Role, `alter role`, `alter system`, `alter database postgres …` działają na cały klaster; przyszła migracja z nimi zmieni klaster deweloperski przez bazę wzorca, a hash danych dev tego nie zobaczy. Dzisiejsze migracje ich nie mają (grep pusty).
- **Fix**: Dopisać w §7 (obok wierności zastępczego `auth`) wpis „polecenia globalne dla klastra” z warunkiem re-ewaluacji.
- **Decision**: FIXED (2026-11-20) — wpis „Polecenia globalne dla klastra w teście migracji” w test-plan §7 (po wierności zastępczego `auth`), z warunkiem re-ewaluacji; grep migracji pusty.
