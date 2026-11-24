# Faza 4 rolloutu testów — walidacja i bramki — Plan Brief

> Full plan: `context/changes/testing-validation-and-gates/plan.md`
> Research: `context/changes/testing-validation-and-gates/research.md`

## What & Why

Faza 4 z `context/foundation/test-plan.md`. Ryzyko #7: złe wejście ma dawać czytelny `?error=` na stronie źródłowej, nie 500; warianty wielkości liter i spacji nie tworzą duplikatu; klucz nazwy zawsze zgodny z nazwą — także gdy ktoś pisze do bazy z pominięciem aplikacji. Cross-cutting: testy z faz 1–4 mają faktycznie blokować merge i deploy w CI, a agent ma dostać szybkie testy unit w pętli edycji.

## Starting Point

6 endpointów danych już waliduje po stronie serwera, ale nic tego nie przypina poza ręcznym smoke. Luki: signin/signup dają 500 na ciele nie-formularzu; baza nie wiąże `ingredients.name_key` z `name` ani nie wymusza normalizacji spacji; nieznana kategoria zostawia osierocony składnik. CI uruchamia tylko lint i build, `main` nie ma ochrony, hooków agenta brak.

## Desired End State

Każda luka #7 ma test, który był czerwony i jest zielony. Bezpośredni zapis niezgodnej nazwy lub klucza odrzuca baza (CHECK). Na każdym PR biegną joby `checks` i `integration` (stos Supabase w Dockerze, unit, services, migracje, pgTAP, HTTP, smoke); deploy czeka na oba, a ruleset blokuje merge przy czerwonym checku. Edycja pliku w Claude Code uruchamia powiązane testy unit bez stosu.

## Key Decisions Made

| Decision                 | Choice                                                                                                 | Why (1 sentence)                                                                                  | Source   |
| ------------------------ | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | -------- |
| Zakres napraw #7         | naprawić auth 500, niezmienniki nazw w bazie, osierocony składnik; podwójne wysłanie tylko test        | brak duplikatu już działa, reszta to realne luki z czerwonym testem                               | Plan     |
| Niezmienniki nazw        | CHECK-i (`name_key = lower(name)`, nazwa znormalizowana) bez zmiany zapisu w aplikacji                 | najmniejsza zmiana; aplikacja już zapisuje zgodne dane                                            | Plan     |
| Struktura CI             | joby `checks` + `integration`, `deploy` z `needs` na oba                                               | szybki sygnał, build i dev server na osobnych runnerach, deploy nie biegnie na czerwonych testach | Plan     |
| Blokada merge'a          | ruleset na `main`: PR + oba checki, obejście dla admina                                                | bramka działa dla PR, właściciel zachowuje wyjście awaryjne                                       | Plan     |
| Smoke w CI               | tak, po `test:http` na tym samym dev serverze                                                          | zamyka lukę „smoke nie w CI” odnotowaną 3× w archiwum                                             | Plan     |
| Limit auth w CI          | podmiana `sign_in_sign_ups` tylko na runnerze                                                          | brak flaków w CI, lokalna dyscyplina oszczędzania kont bez zmian                                  | Plan     |
| Hooki                    | per-edit `vitest related --project unit` + end-of-turn `npm run test:unit` przez `/10x-configure-hook` | szybki sygnał bez stosu, hook udowodniony testem                                                  | Plan     |
| Znaki zerowej szerokości | świadome wyłączenie w §7 + wiersz PINNED                                                               | spójne z decyzją o NFC                                                                            | Plan     |
| Walidacja bez zod        | ręczna, jak dotąd                                                                                      | decyzja S-01, zod nie jest zainstalowany                                                          | Research |
| Test bez formularza      | bezpośrednie żądania HTTP z `Origin` + wywołania serwisów                                              | dowodzi serwera, nie walidacji HTML; Astro odrzuca 403 bez `Origin`                               | Research |

## Scope

**In scope:**

- testy unit reguł nazwy i odczytu pól auth
- macierz złego wejścia przez HTTP na 8 endpointach POST; poprawka signin/signup (w tym `confirmPassword` po stronie serwera), smoke z `confirmPassword`
- testy serwisu duplikatów i klucza nazwy; sprawdzenie kategorii w `addSubstitute`
- pgTAP + migracja z trzema CHECK-ami; zapytanie kontrolne przed pushem na produkcję
- workflow z jobami `checks`/`integration`/`deploy`, `hookTimeout` 90 s dla `services`/`http`, ruleset przez `gh api`
- hooki Claude Code; aktualizacja test-planu, CLAUDE.md, README

**Out of scope:**

- blokowanie przycisku przy podwójnym wysłaniu, NFC, usuwanie znaków zerowej szerokości
- kolumna generowana dla `ingredients.name_key`, zod, limity długości auth w aplikacji
- hook pre-push / husky, `supabase/setup-cli`, podbicie akcji z Node 20, ręczna bramka deployu

## Architecture / Approach

Od najtańszej warstwy: unit (bez stosu; to też to, co uruchamia hook) → HTTP (prawdziwe handlery, bez formularza) → serwis (prawdziwa baza, przeplot `Promise.all`) → pgTAP + migracja (CHECK-i) → CI i ruleset → hooki i dokumenty. Wyrocznie: literały ze źródłem i obserwacja kluczem admina, nigdy wynik testowanego kodu.

## Phases at a Glance

| Phase                            | What it delivers                                                                 | Key risk                                                   |
| -------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Reguły nazwy w unit           | tabele dla `normalizeName`, `toNameKey`, `charLength`, `truncate`; §7 zero-width | niski                                                      |
| 2. Złe wejście przez HTTP + auth | `validation.test.ts`, `auth-fields.ts`, poprawione signin/signup, smoke          | limit auth przy wielu żądaniach do GoTrue                  |
| 3. Duplikaty w serwisie          | `names.test.ts`, sprawdzenie kategorii, `error_field=category_id`                | flaki testu równoległego dodania                           |
| 4. Niezmienniki w bazie          | `name-invariants.sql`, migracja z CHECK-ami                                      | dane produkcyjne lub `lc_ctype` niezgodne z CHECK          |
| 5. CI i ruleset                  | 3 joby, `hookTimeout`, ruleset                                                   | start Supabase i dev servera na runnerze; sekrety w logach |
| 6. Hooki i dokumenty             | hooki z testem dowodowym, test-plan/CLAUDE.md/README                             | hook dociąga testy wymagające stosu                        |

**Prerequisites:** lokalny stos (`npx supabase start`), `npm run dev` dla testów HTTP, `gh` zalogowany z prawem admina do repo (ruleset), zgoda na utworzenie rulesetu.
**Estimated effort:** ok. 4–6 sesji w 6 fazach; faza 5 może wymagać kilku iteracji workflow na PR.

## Open Risks & Assumptions

- Kod 500 w auth przy JSON pod workerd i odpowiedź GoTrue na długi e-mail są wnioskiem — faza 2 zaczyna od czerwonego testu, który to potwierdza.
- `supabase test db` bez `postgres-meta`, odczyt `.dev.vars` przez workerd w CI i czas startu stosu na runnerze — sprawdza pierwszy przebieg `integration`.
- Produkcja może mieć inne `lc_ctype` niż lokalne `en_US.UTF-8`; zapytanie kontrolne przed pushem to wyłapie.
- Obejście rulesetu przez admina oznacza, że właściciel może scalić z czerwonym checkiem — świadomy wybór.

## Success Criteria (Summary)

- Żaden z przypadków złego wejścia z macierzy nie daje 500; nazwy-warianty nie tworzą duplikatu; baza odrzuca niezgodny klucz.
- PR z czerwonym testem nie da się scalić bez świadomego obejścia, a deploy nie rusza przed zielonymi testami.
- Agent widzi porażkę testu unit zaraz po edycji, bez uruchomionego Supabase.
