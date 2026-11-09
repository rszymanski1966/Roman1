# Testy izolacji kont i usuwania — Plan Brief

> Full plan: `context/changes/testing-isolation-and-delete/plan.md`
> Research: `context/changes/testing-isolation-and-delete/research.md`

## What & Why

Faza 1 rolloutu z `context/foundation/test-plan.md`. Największe obawy z wywiadu to: usunięcie jednego zamiennika kasuje za dużo (#1), ktoś dosięga cudzych danych przez id w URL-u lub formularzu (#2) i testy kasują lokalne dane dewelopera (#5, incydent `db reset` z 2026-10-10). Faza stawia pierwszy runner TS i harness, który nie rusza danych dev, i na nim dowodzi tych trzech ryzyk.

## Starting Point

Kod TS nie ma runnera. Jest 5 plików pgTAP (reguły SQL dobrze pokryte) i ręczny smoke, który przy każdym przebiegu zostawia w bazie dev 2 konta. Bezpieczeństwo endpointów opiera się wyłącznie na RLS i na konwencji: nigdzie nie ma klucza service-role ani funkcji `security definer`, ale nic tego nie pilnuje. Potwierdzenie usunięcia składnika istnieje tylko w UI.

## Desired End State

`npm test` (serwisy, bez serwera) i `npm run test:http` (endpointy, przy działającym dev) dowodzą na prawdziwym Supabase, że usuwanie kasuje dokładnie to, co trzeba, a konto B z id A dostaje to samo co z losowym uuid. Każdy przebieg kończy się dowodem, że dane dev są nietknięte i nie zostało żadne konto testowe. Zaległe konta smoke znikają. `npm run lint:db-access` łapie service-role lub `security definer`. Cookbook w `test-plan.md` §6 opisuje te wzorce.

## Key Decisions Made

| Decision                | Choice                                                                        | Why (1 sentence)                                                                         | Source   |
| ----------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------- |
| Izolacja danych testów  | Konta tymczasowe w bazie dev + sweep przed i po + porównanie hashy danych dev | RLS i kaskada z `auth.users` chronią dane dev; drugi stos to ~7 GB RAM i problemy WinNAT | Plan     |
| Potwierdzenie usunięcia | Zostaje w UI; test dokumentuje ścieżkę UI                                     | Faza zostaje czysto testowa; CSRF chroni `checkOrigin`, MVP jednoosobowy                 | Plan     |
| F2 (GET vs POST)        | Zaakceptowane ograniczenie, test sekwencyjny                                  | Szanuje decyzję S-05 (Fix A)                                                             | Research |
| Warstwa testów          | Serwisy (Vitest + prawdziwy supabase-js) + HTTP na dev                        | Każda warstwa widzi to, czego druga nie: filtr TS i kaskadę vs redirecty i middleware    | Plan     |
| Smoke                   | Sweep usuwa też konta `smoke-<13 cyfr>(-b)@…`                                 | Jedno narzędzie domyka #5 dla obu źródeł kont                                            | Plan     |
| Strażnik konwencji RLS  | `scripts/db-access.mjs` + `npm run lint:db-access`; CI w Fazie 4 rolloutu     | Grosze kosztu, łapie regresję niewidoczną dla pgTAP                                      | Plan     |
| Runner                  | Vitest 5.1.0 bez `getViteConfig()`                                            | Serwisy nie importują `astro:`; adapter Cloudflare uruchamiałby Miniflare w testach      | Research |
| Sekrety                 | Z `npx supabase status -o env` w pamięci procesu                              | Nic nie trafia do `.env`, klucz admina tylko w harnessie                                 | Plan     |

## Scope

**In scope:**

- Vitest, harness (konta, sweep, snapshot), komendy `test`, `test:http`, `test:sweep`, `lint:db-access`
- Testy serwisów usuwania, testy HTTP izolacji na 5 POST i 6 GET, ścieżka UI przez potwierdzenie
- Uzupełnienia pgTAP (przeżycie składnika, puste `returning` dla cudzych mutacji)
- Cookbook §6, poprawki §1/§2/§4/§5 w `test-plan.md`, `CLAUDE.md`, `README.md`

**Out of scope:**

- Wymuszenie potwierdzenia na serwerze, naprawa F2, zmiany logiki smoke
- CI (Faza 4 rolloutu), hermetyczne testy mapowania błędów DB, Stryker
- `db reset`, drugi stos Supabase, sekrety w plikach

## Architecture / Approach

Global setup Vitest: odczyt kluczy z CLI → sweep kont wzorca → snapshot (hash) danych dev. Testy tworzą konta przez admin API i działają prawdziwym klientem zalogowanym kluczem publishable (pod RLS). Stan obserwują kluczem admina, niezależnie od testowanego kodu. Teardown: sweep → asercja 0 kont wzorca → asercja identycznego snapshotu. Testy HTTP logują konta tymczasowe przez `/api/auth/signin`, tak jak smoke.

## Phases at a Glance

| Phase                                  | What it delivers                                                    | Key risk                                                     |
| -------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Runner i harness                    | Vitest, konta tymczasowe, sweep, dowód „dane dev nietknięte” (#5)   | Zbyt szeroki wzorzec sweepu; GoTrue odrzuci `example.test`   |
| 2. Strażnik dostępu do bazy            | `lint:db-access` + test reguł                                       | Fałszywe trafienia grepa                                     |
| 3. Usuwanie na poziomie serwisów (#1)  | Porównanie zbiorów id, F2 sekwencyjnie, pgTAP                       | Fixture budowany kodem produkcyjnym (`addSubstitute`)        |
| 4. Izolacja endpointów przez HTTP (#2) | Cudze id ≡ losowy uuid, stan A bez zmian, ta sama nazwa, ścieżka UI | Wymaga działającego dev; wolniejsze                          |
| 5. Cookbook i synchronizacja           | §6 i poprawki w `test-plan.md`, `CLAUDE.md`, `README.md`            | Dokumenty rozjadą się z kodem, jeśli faza zostanie pominięta |

**Prerequisites:** działający lokalny stos Supabase (`npx supabase start`); dla Fazy 4 działający `npm run dev`.
**Estimated effort:** ~3–4 sesje w 5 fazach (fazy 1 i 4 największe).

## Open Risks & Assumptions

- Lokalny GoTrue może odrzucić domenę `example.test` przy `admin.createUser` — wtedy wzorzec `vitest-…@mailinator.com`.
- Praca w aplikacji w trakcie przebiegu testów da fałszywy alarm snapshotu (zamierzone).
- Pierwszy sweep usunie zaległe konta `smoke-*` z bazy dev — zamierzone.
- Zgodność Vitest 5.1 z Vite 8 i `@/` alias pod Vitest potwierdzi dopiero Faza 1.

## Success Criteria (Summary)

- Pełny przebieg testów zostawia dane dev bez zmian i bez kont testowych — dowiedzione automatycznie przy każdym przebiegu.
- Regresja filtra usuwania lub wyciek cudzych danych przez endpoint daje czerwony test.
- Następny agent wie z `test-plan.md` §6, jak dodać test dla nowego endpointu lub nowej reguły usuwania.
