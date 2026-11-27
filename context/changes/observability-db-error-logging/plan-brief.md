# Logowanie błędów bazy w warstwie serwisów — Plan Brief

> Full plan: `context/changes/observability-db-error-logging/plan.md`
> Audyt (zamiast research): `context/audits/observability/2026-11-26_auth-writes-lookup.md`

## What & Why

Awaria Supabase, złamane ograniczenie (23514) czy odmowa RLS (42501) nie zostawiają dziś żadnego śladu w Workers Logs: serwis zamienia każdy błąd PostgREST na ogólny komunikat i gubi przyczynę. Ten change daje każdemu takiemu błędowi jedną linię logu, z której da się postawić diagnozę, bez danych użytkownika. To fix nr 1 z audytu observability i follow-up F2.

## Starting Point

`fail()` w `src/lib/services/substitutes.ts:35` zwraca tylko tekst; 23 wywołania bez przyczyny (17 po błędzie PostgREST, 4 „niemożliwe” nulle, 2 opakowania). postgrest-js nie rzuca nawet przy awarii sieci (status 0), więc nic nie dociera do logu Astro. W całym `src/` są dwa `console.*`, oba w auth.

## Desired End State

Każdy nieoczekiwany błąd bazy i każde złamane założenie w serwisie daje jedną linię `console.error` z przedrostkiem `[db]`: operacja (z krokiem w `addSubstitute`), kod (`network` przy statusie 0), status, `message`, `hint`, uuid encji. `not_found` i `invalid_category` dają warn, duplikaty nic. Grupa zamienników bez kategorii zwraca błąd zamiast cichego pominięcia. Komunikaty dla użytkownika bez zmian.

## Key Decisions Made

| Decision                              | Choice                                                                                                 | Why (1 sentence)                                                                                                | Source   |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------- |
| Pola w linii logu                     | operacja, code, status, message, hint, uuid; nigdy `details`                                           | `details` zawiera nazwy („Key (…)=(…, mąka)”), a `message` nazywa ograniczenie, co wystarcza do diagnozy        | Plan     |
| Szum z oczekiwanych wyników           | warn dla `not_found` (P0002, 0 wierszy) i `invalid_category`; duplikaty bez logu                       | regresja polityki RLS albo zgubiona sesja pokaże się jako seria warnów (zamyka też W4)                          | Plan     |
| L2: para z zamiennikami bez kategorii | `fail()` + log                                                                                         | strona pokazuje błąd zamiast „0 zamienników” przed nieodwracalnym usunięciem; zgodność z `getSubstituteForEdit` | Plan     |
| Warstwa testów                        | unit (prawdziwy supabase-js, podstawiony `fetch`) + jeden test services                                | każda gałąź w szybkim projekcie unit, a prawdziwy 42501 potwierdza kształt odpowiedzi                           | Plan     |
| Format linii                          | pola w tekście `Error`, `cause` jako kopia bez `details`                                               | Workers Logs najpewniej nie rozwija `cause`                                                                     | Audyt §2 |
| Podwójny log                          | loguje funkcja, która dostała błąd od PostgREST; `addSubstitute` dodaje tylko warn o częściowym wyniku | jedna awaria = jedna linia błędu                                                                                | Plan     |
| Lint                                  | jeden moduł `src/lib/log.ts` z wyjątkiem od `no-console`                                               | jedno miejsce formatu, zamiast komentarzy w serwisie                                                            | Plan     |

## Scope

**In scope:**

- `src/lib/log.ts` (`logDbError`, `logInvariant`, `logExpected`)
- 17 gałęzi błędu, 5 złamanych założeń, 6 oczekiwanych wyników w `substitutes.ts`
- zmiana zachowania L2 w `listIngredientSubstitutes`
- testy unit i services, §6.1/§6.2 w `test-plan.md`, linia w `CLAUDE.md`

**Out of scope:**

- statusy 503 na stronach, puste `catch {}` w endpointach, kontekst żądania w linii (fixy nr 3 i 5)
- auth: middleware, sign-in/up/out (fix nr 2)
- kod referencyjny w komunikacie dla użytkownika, `addSubstitute` jako jedno RPC
- logowanie „not found” przy ładowaniu stron edycji/usuwania, duplikatów, `details`, nazw

## Architecture / Approach

Serwis dalej zwraca te same `ServiceResult`; przed `fail()` woła jedną z trzech funkcji z `src/lib/log.ts`. Linia: `[db] <op> failed: code=<code|network> status=<n> message="…" hint="…" <id>=<uuid>`. Testy unit trasują podstawiony `fetch` po metodzie i ścieżce, więc postgrest-js parsuje prawdziwe kształty odpowiedzi; test services sprawdza je na prawdziwym Postgresie.

## Phases at a Glance

| Phase                                        | What it delivers                                                   | Key risk                                                          |
| -------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| 1. Moduł logu i nieoczekiwane błędy bazy     | `log.ts`, 17 gałęzi z logiem, test unit                            | fixture odpowiedzi PostgREST różny od prawdziwego (domyka faza 3) |
| 2. Złamane założenia i oczekiwane wyniki     | invarianty, L2, warny, brak podwójnego logu                        | zmiana L2 zmienia widok przy złamanej relacji; szum z warnów      |
| 3. Dowód na prawdziwym stosie i dokumentacja | test services (42501, not_found, duplikat), §6.1/§6.2, `CLAUDE.md` | anon może dostać inny kod niż 42501 — wtedy najpierw zbadać grant |

**Prerequisites:** lokalny stos (`npx supabase start`) dla `npm test`; `npm run dev` dla `test:http` w fazie 2.
**Estimated effort:** ~2 sesje, 3 fazy.

## Open Risks & Assumptions

- Workers Logs nie rozwija `cause` (założenie z audytu) — dlatego wszystkie pola są w tekście komunikatu.
- `message` z Postgresa nie zawiera wartości poza 22P02 (chronionym przez `isUuid`); nowy kod błędu z wartością w `message` wymagałby rewizji.
- Warn `not_found` z nieaktualnej karty to oczekiwany, niski szum.

## Success Criteria (Summary)

- Każda awaria bazy w serwisie jest w Workers Logs pod `[db]` z operacją, kodem i statusem, bez nazw.
- Użytkownik widzi te same komunikaty co dziś; para bez kategorii daje błąd zamiast zaniżonej liczby.
- Testy unit i services dowodzą formatu, braku danych użytkownika i braku szumu z duplikatów.
