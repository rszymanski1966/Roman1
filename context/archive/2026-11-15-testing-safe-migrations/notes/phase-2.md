# Phase 2 — notatki (2026-11-18)

## Czas przebiegu (kryterium 2.6)

- 3 przebiegi `npm run test:migrations` z rzędu, 13/13 zielone, bez flaków: Vitest 38,9 s / 41,3 s / 37,9 s (wall 43–47 s); po każdym 0 baz `mig_test_%`, dane deweloperskie bez zmian.
- Większość czasu to wywołania CLI (ok. 2–5 s każde): baza wyjściowa, test dymny, 6 mutantów, przypadek zadeklarowany.

## `npm test` — migracje po kolei, nie równolegle (bramka 2.2)

- Objaw: 1 z 2 przebiegów `vitest run --project unit --project services --project migrations` padł w `beforeAll` `tests/services/delete.test.ts` na `harnessEnv()` (STACK_DOWN) przy działającym stosie; drugi przebieg zielony. `npm test` urósł z 37 s do 69 s.
- Dowód: `npx supabase status -o env` trwa ok. 5 s bezczynnie, do 30 s przy 10 równoległych wywołaniach (8 CPU) i do 46 s, gdy równolegle biegnie projekt `migrations`; `env.ts` ubija go po 60 s, a `catch` gubił przyczynę, więc samego przekroczenia nie widać było wprost.
- Decyzja użytkownika: `npm test` = `vitest run --project unit --project services && vitest run --project migrations` oraz `env.ts` zachowuje przyczynę (kod/sygnał/limit + stderr w komunikacie, oryginalny błąd jako `cause` z wyczyszczonymi `stdout`/`output`, w których są klucze). Po zmianie 2 przebiegi `npm test` z rzędu zielone (30–34 s + 43 s).

## Raporter pod agentem AI

- Vitest 5.1.0 pod agentem (`std-env` `isAgent`) używa raportera `minimal` z `silent: "passed-only"`, więc log „migracje pod testem: …” widać tylko w zwykłym terminalu albo z `--silent=false`.
