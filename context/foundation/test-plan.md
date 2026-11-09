# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-11-09

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents _what
   could fail_ and _why we believe it's likely_ — drawn from documents,
   interview, and codebase _signal_ (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`, `scripts/` (30 dni do 2026-11-01, 41 commitów).

**Twarde ograniczenie projektu:** żaden test ani bramka nie może wymagać `supabase db reset` ani zmieniać lokalnych danych deweloperskich (wywiad P2, incydent z 2026-10-10). Migracje: `npx supabase migration up`. Testy pgTAP: w transakcji wycofywanej na końcu. Testy TS mogą zapisywać do lokalnej bazy wyłącznie jako konta tymczasowe wąskiego wzorca testowego (`vitest-<runId>-<etykieta>@example.test` oraz zaległe konta smoke `smoke-<13 cyfr>@<domena smoke>` / `smoke-<13 cyfr>-b@<domena smoke>`). Harness usuwa je sweepem przed i po każdym przebiegu i porównuje hash danych deweloperskich (wszystkiego spoza wzorca) przed i po; pozostałe konto wzorca albo zmieniony hash oblewa przebieg (decyzja planu §3 Phase 1, 2026-11-04).

## 2. Risk Map

Najważniejsze scenariusze awarii, uporządkowane według ryzyka = wpływ × prawdopodobieństwo. Kolumna Source cytuje _dowód, który podniósł ryzyko_, nigdy konkretny plik jako „miejsce awarii” (patrz §1, zasada 3).

| #   | Risk (failure scenario)                                                                                                                                                                      | Impact | Likelihood | Source (evidence — not anchor)                                                                                                                                                                                                                                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Usunięcie jednego zamiennika kasuje też inne zamienniki lub cały składnik; składnik znika bez jawnego potwierdzenia albo kaskada usuwa inne zamienniki niż pokazane na ekranie potwierdzenia | High   | Medium     | wywiad P1 (największa obawa); PRD FR-007; archive/2026-10-24-delete-entries-confirmed (impl-review F2: potwierdzenie pokazuje stan z GET, kaskada usuwa stan z POST); hot-spot dir `src/pages/api` (17 commitów/30d)                                                                                                                                     |
| 2   | Użytkownik widzi, edytuje lub usuwa cudze składniki/zamienniki, np. podając cudze id w URL-u albo w formularzu                                                                               | High   | Medium     | PRD Guardrails + Access Control; wywiad P1 (druga obawa); wywiad P4 (izolacja testowana tylko w warstwie bazy); archive/2026-10-04-first-substitute-lookup (impl-review F1: smoke nie ćwiczy ścieżki z cudzym id); hot-spot dir `src/pages/api` (17 commitów/30d)                                                                                        |
| 3   | Migracja wypchnięta na produkcję gubi lub przekłamuje dane użytkowników (wiersze, kategorie, oznaczenie „najlepszy”)                                                                         | High   | Medium     | archive/2026-10-10-unique-substitutes (impl-review F1: kopia CSV może pominąć wiersze, brak kroków wycofania; F6: brak testu usuwania duplikatów); roadmap Open Question 2 (zmiana nazw kategorii migracją); hot-spot dir `supabase/migrations` (6 commitów/30d)                                                                                         |
| 4   | Wyszukiwanie po nazwie, tryb prefiksu lub filtr kategorii zwraca złe wyniki — gubi pasujące składniki, miesza kategorie, pokazuje stan pusty mimo istniejących danych                        | Medium | High       | wywiad P3, P4; PRD FR-004, FR-005, US-01; archive/2026-10-12-ingredient-name-search (impl-review NEEDS ATTENTION; F1: filtr kategorii i reguła „URL wygrywa z cookie” bez pozytywnego sprawdzenia; F3: brak pokrycia listy „Pasujące składniki”); hot-spot dir `src/pages/ingredients` (20 commitów/30d, najwyżej w projekcie)                           |
| 5   | Uruchomienie testów lub bramki weryfikacyjnej kasuje lokalne dane dewelopera (konta, składniki)                                                                                              | Medium | High       | wywiad P2 (incydent 2026-10-10: `db reset` jako bramka wyczyścił bazę lokalną); tech-stack.md (lokalny Supabase jako jedyna baza deweloperska)                                                                                                                                                                                                           |
| 6   | Oznaczenie „najlepszy” jest błędne — dwa albo żaden w kategorii, znika po edycji, albo zamiana zgłasza sukces mimo równoległego usunięcia wiersza                                            | Medium | Medium     | PRD FR-003, FR-006, Business Logic; archive/2026-10-11-best-substitute-highlight (impl-review F1: odczyt bez blokady); roadmap S-05 Risk („fałszywy sukces”)                                                                                                                                                                                             |
| 7   | Niepoprawne lub nietypowe wejście (POST bez formularza, puste/za długie pola, wielkość liter i spacje, podwójne wysłanie) daje 500 albo zapisuje duplikat lub klucz nazwy niezgodny z nazwą  | Medium | Medium     | archive/2026-10-04-first-substitute-lookup (impl-review F2: POST bez formularza daje 500); archive/2026-10-10-unique-substitutes (F4: normalizacja tylko w aplikacji; F5: podwójne wysłanie); archive/2026-10-17-edit-entries (F3: grant pozwala zapisać niezgodny klucz); lessons.md (null z klienta Supabase → 500; dwa sposoby liczenia klucza nazwy) |

Abuse lens: #2 (autoryzacja / IDOR) i #7 (niezaufane wejście, walidacja po stronie serwera). Brak płatności i kosztownych operacji. Odrzucone w rewizji: dostęp niezalogowanego do chronionych tras (middleware stabilny, smoke już pokrywa przekierowania), różnice runtime dev/prod (brak dowodów), NFR < 1 s (przy tej skali danych to obserwacja, nie test).

### Risk Response Guidance

| Risk | What would prove protection                                                                                                                                                                                                                                                                                                                                                                                                                           | Must challenge                                                                                                                                                                                                                                                                    | Context `/10x-research` must ground                                                                                      | Likely cheapest layer                                                              | Anti-pattern to avoid                                                                                       |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| #1   | Po usunięciu jednego zamiennika pozostałe zamienniki składnika i sam składnik istnieją; ścieżka UI nie prowadzi do usunięcia składnika z pominięciem strony potwierdzenia (serwer potwierdzenia nie wymusza — decyzja planu §3 Phase 1); bez zmian pomiędzy odczytem a usunięciem kaskada usuwa dokładnie to, co pokazano przy potwierdzeniu (przypadek sekwencyjny; rozjazd przy równoległej zmianie to zaakceptowane ograniczenie F2 z S-05, Fix A) | „Smoke usuwa drugi zamiennik i lista się zgadza, więc kaskada jest bezpieczna”                                                                                                                                                                                                    | ścieżka usuwania od formularza do bazy, reguła kaskady, treść ekranu potwierdzenia, istniejące pokrycie pgTAP            | integracja (serwisy + lokalny Supabase) + HTTP dla ścieżki UI + uzupełnienie pgTAP | asercja tylko „usunięty wiersz zniknął” bez sprawdzenia, że sąsiednie zostały                               |
| #2   | Konto B nie odczyta, nie zmieni ani nie usunie danych A — przez URL ani formularz z cudzym id; odpowiedź nie zdradza istnienia cudzego wiersza                                                                                                                                                                                                                                                                                                        | „RLS działa w bazie (pgTAP), więc endpointy są bezpieczne” — to prawda tylko, dopóki aplikacja działa wyłącznie jako zalogowany użytkownik (klucz publishable, bez klucza service-role/secret i bez funkcji `security definer`); tę konwencję pilnuje statycznie `lint:db-access` | które ścieżki przyjmują id od klienta, jakim klientem Supabase działa każda, jak tłumaczone są błędy „nie znaleziono”    | integracja z dwoma kontami                                                         | test z jednym kontem; mock Supabase omijający RLS                                                           |
| #3   | Migracja uruchomiona na bazie z reprezentatywnymi danymi zachowuje liczbę wierszy, oznaczenia „najlepszy” i przypisania kategorii (poza zmianami zamierzonymi)                                                                                                                                                                                                                                                                                        | „Migracja przechodzi na pustej bazie, więc jest bezpieczna”                                                                                                                                                                                                                       | jak zbudować jednorazową bazę z danymi bez dotykania lokalnej; jak dziś wygląda `db push` na produkcję                   | integracja (migracja na jednorazowej bazie z fixture'ami)                          | test na pustej bazie; `db reset` na bazie deweloperskiej                                                    |
| #4   | Dla zestawu nazw (wielkość liter, polskie znaki, prefiks, brak trafień) i kombinacji filtr kategorii / URL / cookie wynik zgadza się z regułami z PRD i roadmapy                                                                                                                                                                                                                                                                                      | „Smoke przechodzi, więc filtr działa” — smoke nie ma pozytywnego sprawdzenia filtra                                                                                                                                                                                               | gdzie żyje logika trybu, filtra i stanu widoku; czy da się ją wydzielić jako czystą funkcję; źródło oczekiwanych wyników | unit (jeśli logika czysta), inaczej integracja renderu strony                      | wyrocznia przepisana z implementacji; tylko scenariusze z trafieniem                                        |
| #5   | Pełny przebieg testów zostawia lokalne dane i konta deweloperskie bez zmian (hash przed/po), a po przebiegu nie zostaje żadne konto wzorca testowego — także konta, które zostawia smoke: sprząta je sweep                                                                                                                                                                                                                                            | „Testy sprzątają po sobie” — sprzątanie po przerwanym teście nie zadziała (stąd sweep także przed przebiegiem i samodzielnie)                                                                                                                                                     | czy testy integracyjne mogą działać w transakcji, osobnym schemacie lub osobnej bazie; izolacja fixture'ów               | sprawdzenie w harnessie (sweep przed/po, hash danych dev przed/po)                 | wymaganie `db reset`; fixture'y poza kontami wzorca testowego; same liczności (nie złapią zmiany w miejscu) |
| #6   | W każdej kategorii co najwyżej jeden „najlepszy”; zamiana atomowa; edycja zachowuje oznaczenie; usunięcie w trakcie zamiany nie daje fałszywego sukcesu                                                                                                                                                                                                                                                                                               | „Pojedyncze kliknięcie działa, więc reguła jest spełniona”                                                                                                                                                                                                                        | funkcja zamiany, ograniczenia w bazie, istniejący test pgTAP best-substitute                                             | pgTAP + integracja                                                                 | tylko ścieżka sekwencyjna; asercja skopiowana z SQL funkcji                                                 |
| #7   | Złe wejście daje czytelny błąd (`?error=` na stronie źródłowej), nie 500; nazwy różniące się wielkością liter/spacjami nie tworzą duplikatu; klucz nazwy zawsze zgodny z nazwą                                                                                                                                                                                                                                                                        | „Formularz HTML waliduje, więc serwer nie musi”                                                                                                                                                                                                                                   | walidacja po stronie serwera, normalizacja, ograniczenia unikalności, obsługa null z klienta Supabase                    | unit (normalizacja) + integracja (endpointy)                                       | test tylko przez formularz; mock walidacji                                                                  |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| #   | Phase name               | Goal (one line)                                                                                                                                             | Risks covered     | Test types                                                | Status      | Change folder                |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------- | ----------- | ---------------------------- |
| 1   | Izolacja i usuwanie      | Dowieść, że usuwanie kasuje tylko to, co trzeba, a konta są szczelne na poziomie endpointów; postawić runner TS i harness, który nie rusza lokalnych danych | #1, #2, #5        | runner + integracja (lokalny Supabase, dwa konta) + pgTAP | complete    | testing-isolation-and-delete |
| 2   | Wyszukiwanie i najlepszy | Zabezpieczyć najczęściej zmieniany obszar: tryb prefiksu, filtr kategorii, stan widoku i regułę „najlepszego”                                               | #4, #6            | unit + integracja + pgTAP                                 | not started | —                            |
| 3   | Bezpieczne migracje      | Każda nowa migracja przechodzi test na bazie z danymi przed `db push`; gotowe przed pierwszą migracją M-02                                                  | #3                | integracja (jednorazowa baza z fixture'ami)               | not started | —                            |
| 4   | Walidacja i bramki       | Twarda walidacja serwera; unit, integracja i pgTAP w CI; lokalny post-edit hook dla szybkich testów wyszukiwania                                            | #7, cross-cutting | unit + integracja + gates + post-edit-hook                | not started | —                            |

Kolejność: Faza 1 pokrywa największe obawy z wywiadu (P1) i buduje harness, którego potrzebują kolejne fazy. Faza 2 to hot-spot nr 1 (P3, P4). Faza 3 musi wylądować przed pierwszą migracją kolejnego milestone'u. Faza 4 utrwala poziom w CI.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

Profil bazy testów: **sparse** (po §3 Phase 1) — Vitest w `tests/` z harnessem kont tymczasowych: projekt `services` (wzorzec sweepu, harness, strażnik dostępu do bazy, usuwanie przez serwisy na lokalnym Supabase; bez serwera aplikacji) i projekt `http` (izolacja kont i ścieżka potwierdzenia usunięcia przez HTTP; przy działającym `npm run dev`); 5 plików pgTAP w `supabase/tests/` (izolacja RLS, usuwanie, najlepszy, edycja, unikalność), uruchamianych ręcznie; ręczny `scripts/smoke.mjs` (~60 kroków HTTP przy działającym serwerze); strony, wyszukiwanie i walidacja bez testów TS; CI nie uruchamia żadnych testów.

| Layer                                    | Tool                                                                  | Version                          | Notes                                                                                                                                                                                                                                                              |
| ---------------------------------------- | --------------------------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| unit + integration (TS)                  | Vitest, zwykły (bez `getViteConfig()` z Astro)                        | 5.1.0 (npm, checked: 2026-11-09) | istnieje (§3 Phase 1); `vitest.config.ts`: projekty `services` i `http`, alias `@/`, wspólny global setup harnessu; nie ładuje Astro ani adaptera Cloudflare — testy wołają serwisy z prawdziwym klientem supabase-js albo endpointy przez HTTP na działającym dev |
| baza danych (RLS, funkcje, ograniczenia) | pgTAP przez `npx supabase test db`                                    | Supabase CLI 2.117.0             | istnieje; nie w CI — see Phase 4                                                                                                                                                                                                                                   |
| migracje na danych                       | Supabase CLI + jednorazowa baza z fixture'ami                         | 2.117.0                          | none yet — see Phase 3; bez `db reset` na bazie deweloperskiej                                                                                                                                                                                                     |
| e2e (HTTP)                               | `scripts/smoke.mjs` (Node fetch)                                      | —                                | istnieje; ręcznie przy działającym serwerze; jego konta usuwa sweep harnessu (`npm run test:sweep` albo dowolny przebieg Vitest); włączenie do CI rozważa Phase 4                                                                                                  |
| e2e (przeglądarka)                       | —                                                                     | —                                | świadomie brak — przepływy są server-rendered, smoke HTTP daje sygnał taniej                                                                                                                                                                                       |
| (optional) AI-native                     | post-edit hook uruchamiający szybkie testy unit — checked: 2026-11-01 | n/a                              | see Phase 4. When NOT to use: dla testów wymagających Supabase (za wolne w pętli edycji) i jako substytut CI                                                                                                                                                       |

**Stack grounding tools (current session):**

- Docs: brak docs MCP (Context7 not available in current session) — sprawdzono przewodnik testowania Astro przez WebSearch (`getViteConfig()`, Container API); checked: 2026-11-01
- Search: WebSearch (Exa not available in current session) — potwierdzenie podejścia Vitest + Astro; wersje odczytane z npm registry i `node_modules`; checked: 2026-11-01. Wersje zainstalowane (Vitest 5.1.0 z `node_modules`, Supabase CLI 2.117.0 z `npx supabase --version`) — checked: 2026-11-09
- Runtime/browser: claude-in-chrome dostępny — not used; e2e w przeglądarce poza zakresem (patrz wyżej); checked: 2026-11-01
- Provider/platform: `gh` CLI (bez MCP); brak MCP Supabase i Cloudflare — not used; checked: 2026-11-01

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate                                                         | Where                  | Required?                                                                                                                                               | Catches                                                                                                                         |
| ------------------------------------------------------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| lint (ESLint z regułami typed)                               | local + CI             | required (wired)                                                                                                                                        | dryf składni i typów                                                                                                            |
| lint:ui (literały w widokach)                                | local + CI             | required (wired)                                                                                                                                        | kolory i wartości spoza tokenów                                                                                                 |
| build                                                        | CI                     | required (wired)                                                                                                                                        | błędy kompilacji i konfiguracji env                                                                                             |
| unit + integration (Vitest: `npm test`, `npm run test:http`) | local; CI              | local required (wired, §3 Phase 1: oba wymagają lokalnego Supabase, `npm run test:http` także działającego `npm run dev`); CI required after §3 Phase 4 | regresje logiki, izolacji i usuwania; zmiana danych deweloperskich w trakcie przebiegu (teardown harnessu)                      |
| lint:db-access (strażnik dostępu do bazy)                    | local; CI              | local required (wired, §3 Phase 1); CI required after §3 Phase 4                                                                                        | nazwy klucza service-role/secret w `src/`, klient Supabase tworzony poza `src/lib/supabase.ts`, `security definer` w migracjach |
| pgTAP (`supabase test db`)                                   | local; CI              | local required (istnieje); CI required after §3 Phase 4                                                                                                 | RLS, kaskady, ograniczenia, funkcje bazy                                                                                        |
| test migracji na danych                                      | local, przed `db push` | required after §3 Phase 3                                                                                                                               | utrata lub przekłamanie danych przez migrację                                                                                   |
| smoke HTTP (`npm run smoke`)                                 | local; CI optional     | recommended local; CI decyzja w §3 Phase 4                                                                                                              | zepsute krytyczne przepływy end-to-end                                                                                          |
| post-edit hook                                               | local (agent loop)     | recommended after §3 Phase 4                                                                                                                            | regresje wyszukiwania w chwili edycji                                                                                           |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- TBD — see §3 Phase 2 (wzorzec dla reguł wyszukiwania: tryb prefiksu, filtr kategorii, stan widoku; oczekiwane wyniki z PRD, nie z implementacji).

### 6.2 Adding an integration test (endpoint + lokalny Supabase)

- **Kiedy**: reguła żyje w serwisie (`src/lib/services/`) i zależy od prawdziwej bazy (RLS, kaskady, ograniczenia). To najtańsza warstwa nad pgTAP, która widzi filtr w TS i mapowanie wyniku (np. 0 wierszy → `not_found`).
- **Location**: `tests/services/*.test.ts` (projekt Vitest `services`). Plik referencyjny: `tests/services/delete.test.ts`.
- **Run locally**: `npx supabase start` (stos musi działać), potem `npm test`; serwer aplikacji niepotrzebny. Jeden plik: `npx vitest run --project services tests/services/delete.test.ts`.
- **Aktor**: `createTestUser("<etykieta>")` z `tests/harness/accounts.ts` zwraca `{ id, email, password, client }`. `client` to supabase-js zalogowany kluczem publishable, więc RLS działa jak w aplikacji. Serwisy przyjmują `SupabaseClient` jako argument: podaj im `user.client`, bez mocków i bez Astro. Etykieta: małe litery, cyfry, myślniki; konto dostaje adres `vitest-<runId>-<etykieta>@example.test`. Drugie konto (cudze id) to drugie wywołanie, np. `createTestUser("delete-other")`.
- **Fixture**: ścieżką użytkownika, jak formularz dodawania: `addSubstitute(user.client, { ingredientName, categoryId, substituteName, ratio, notes, isBest })`. Nazwy unikalne per przebieg (`runId` z harnessu) i świeży fixture w każdym `it`. Kategorie po slugu ze słownika `categories` (seed w migracjach), czytane `adminClient()`.
- **Wyrocznia — obserwacja kluczem admina**: `adminClient()` (klucz secret, omija RLS) czyta wiersze konta (`user_id` = id konta) w `ingredients`, `ingredient_categories`, `substitutes` jako posortowane zbiory id, przed i po operacji. Oczekiwane „po” = „przed” minus id, które nazywa reguła (w pliku referencyjnym lokalne pomocniki `idsOf`, `accountState`, `without`). Nie licz oczekiwań tym samym zapytaniem co testowany kod; wartość zwracana przez serwis (`{ data, error }`, `code: "not_found"`) to osobna asercja, nie wyrocznia stanu.
- **Zawsze sąsiedzi i brzeg**: asercja obejmuje wiersze, które reguła ma zostawić (zamiennik z tej samej pary, inna para, inny składnik), plus co najmniej jeden brzeg (ostatni wiersz pary, ponowne wywołanie, losowy uuid, cudze konto).
- **Sprzątanie**: test niczego nie usuwa ręcznie. Global setup (`tests/harness/global-setup.ts`) robi sweep przed i po przebiegu; teardown oblewa przebieg, gdy zostało konto wzorca albo zmienił się hash danych deweloperskich (fałszywy alarm, gdy w tym czasie pracujesz w aplikacji). `adminClient()` służy do obserwacji i sweepu, nigdy jako aktor testowanej operacji ani do budowania fixture'ów.
- **Nie**: mock Supabase, `getViteConfig()`, import handlerów tras (endpointy → §6.4), `db reset`.

### 6.3 Adding a database test (pgTAP)

- **Location**: `supabase/tests/<obszar>.sql`. Plik referencyjny: `supabase/tests/delete-entries.sql`; najkrótszy szkielet: `supabase/tests/rls-isolation.sql`.
- **Run locally**: `npx supabase test db` (działający stos; uruchamia wszystkie pliki; nie wymaga `db reset`).
- **Szkielet**: `begin;` → `create extension if not exists pgtap;` → `select plan(N);` → setup jako postgres (omija RLS) → asercje → `select * from finish();` → `rollback;`. Nigdy `commit`: wycofanie transakcji gwarantuje, że lokalne dane deweloperskie zostają nietknięte. Po dodaniu asercji zaktualizuj `plan(N)`.
- **Użytkownicy i dane**: wstawiani jako postgres do `auth.users` ze stałymi UUID i e-mailami `@example.test`. Nowy plik bierze własny, nieużywany sufiks UUID (np. `…0000da`/`…0000db` w `delete-entries.sql`, `…0000ea`/`…0000eb` w `edit-entries.sql`; starsze pliki dzielą `…00000a`/`…00000b`), żeby id w wyniku błędu wskazywały plik. Wiersze danych z prefiksem wg tabeli: `1…` składnik, `2…` para składnik–kategoria, `3…` zamiennik.
- **Działanie jako użytkownik**: `set local role authenticated;` + `set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';` → asercje → `reset role;`. Jako anon: `set local role anon;` + `'{"role":"anon"}'`.
- **Asercje izolacji**: jako B mutacja na wierszu A z `returning id` daje `is_empty` (pusty wynik, nie błąd — na tym opiera się mapowanie „nie znaleziono” w serwisach), a liczności A po próbie są bez zmian; kontrola, że A widzi własne wiersze, dowodzi, że pustka pochodzi z RLS, a nie z braku danych.

### 6.4 Adding a test for a new API endpoint

- **Kiedy**: nowy endpoint albo strona przyjmuje id od klienta (pole formularza, parametr URL). Domyślna odpowiedź na pytanie „jak dodać test dla nowego endpointu z id od klienta?”: dopisz wiersz do tablicy `inputs` w `tests/http/isolation.test.ts` (projekt Vitest `http`); kolejne wejście nie potrzebuje nowego pliku.
- **Run locally**: `npx supabase start` i `npm run dev` w osobnym terminalu, potem `npm run test:http`. Inny adres serwera: `BASE_URL=http://localhost:4321 npm run test:http` (`vitest.config.ts` przekazuje go testom jako `HTTP_TEST_BASE_URL`, bo Vitest nadpisuje `BASE_URL` w workerach). Bez działającego dev przebieg kończy się jednym komunikatem „Uruchom `npm run dev`”.
- **Wzorzec — cudze id ≡ losowy uuid**: dwa konta tymczasowe (`createTestUser`, sesja HTTP przez `signIn` z `tests/http/client.ts`, czyli logowanie formularzem `POST /api/auth/signin`). A ma składnik z kategorią i zamiennikiem, zbudowane `addSubstitute` jako A. Dla każdego wiersza `inputs` B wysyła raz id A, raz świeże losowe uuid. Oczekiwaniem jest odpowiedź dla losowego uuid, nie tekst błędu przepisany z kodu. Test wymaga:
  - tego samego statusu, tego samego `location` po zastąpieniu id znacznikami `<ingredient-id>`/`<substitute-id>`, tej samej treści odpowiedzi, a dla POST także tej samej strony, na którą prowadzi redirect;
  - braku nazw, proporcji i uwag A w czymkolwiek, co dostał B (zdekodowany `location`, treść, strona po redirekcie);
  - wierszy A (odczyt `adminClient()`, wszystkie kolumny) identycznych przed i po próbie;
  - statusu < 500 i braku przekierowania do `/auth/signin` (próba dotarła do kodu jako B).
- **Jak dodać wiersz do `inputs`** (tablica dla `it.each`):
  - POST: `{ name, method: "POST", path, fields: (ids) => ({ <pole_id>: ids.ingredient albo ids.substitute, ...view(ids, kategoria), ...pozostałe pola formularza }) }`. Pola jak w prawdziwym formularzu: z niepełnym formularzem obie próby odbije ta sama walidacja i test przejdzie, nie dotykając id.
  - GET: `{ name, method: "GET", path: (ids) => withQuery("/sciezka", { … }), ownerSees: "<klucz z Secrets>" }`. `ownerSees` to wartość A, którą ta strona pokazuje samemu A; próba kontrolna jako A sprawdza, że ją widać, więc sprawdzenie wycieku może się nie udać.
  - Endpoint z innym rodzajem id: rozszerz `Ids` i fixture w `beforeAll`.
- **Pokrewne wzorce w tym samym katalogu**: mutacja po nazwie zamiast id — `describe` „the same ingredient name in another account” w `tests/http/isolation.test.ts` (osobne konto, nowy własny wiersz, wiersze A bez zmian); ścieżka UI przez stronę potwierdzenia i liczba na niej porównana z obserwacją kluczem admina — `tests/http/delete-confirmation.test.ts`. Serwis pod endpointem z cudzym id: ostatni przypadek w `tests/services/delete.test.ts` (§6.2).
- **Klient Supabase**: nowy endpoint dostaje klienta wyłącznie z `src/lib/supabase.ts` (i obsługuje `null`); `npm run lint:db-access` łamie się przy kluczu service-role/secret albo własnym kliencie.
- **Walidacja** (złe wejście → `?error=` na stronie źródłowej, nie 500): TBD — see §3 Phase 4.

### 6.5 Adding a test for a new migration

- TBD — see §3 Phase 3 (migracja na jednorazowej bazie z fixture'ami; liczności i kluczowe pola przed/po).

### 6.6 Per-rollout-phase notes

(Po każdej fazie `/10x-implement` dopisuje tu 2–3 linie o tym, czego faza nauczyła.)

**§3 Phase 1 — Izolacja i usuwanie (2026-11-09)**

- Zwykły Vitest bez `getViteConfig()` wystarczył: serwisy przyjmują `SupabaseClient` jako argument, więc test podaje im prawdziwego klienta konta tymczasowego zamiast mocka, a redirecty, `?error=` i middleware sprawdza HTTP na działającym dev. Astro i adapter Cloudflare nie trafiają do runnera.
- Wyrocznią jest stan bazy obserwowany kluczem admina (zbiory id, wiersze konta), a dla izolacji odpowiedź dla losowego uuid — nigdy wartość zwracana przez testowany kod ani tekst błędu przepisany z kodu.
- Zapis do lokalnej bazy dev jest dopuszczalny tylko pod wąskim wzorcem kont, którego wąskość ma własny test (`tests/harness/accounts.test.ts`), ze sweepem przed i po i porównaniem hashy. Serwerowe potwierdzenie usunięcia i F2 zostały świadomie poza zakresem (potwierdzenie w UI, test sekwencyjny).

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Kitchen sink (`/dev/kitchen-sink`)** — strona tylko deweloperska, w produkcji 404. Re-evaluate if zacznie trafiać do produkcji albo stanie się źródłem regresji w komponentach. (Source: Phase 2 interview Q5.)
- **Multimodalny przegląd wizualny i snapshoty wyglądu** — wygląd zmienia się często, koszt utrzymania przewyższa sygnał przy jednym użytkowniku. Re-evaluate if pojawi się regresja wizualna, której nie złapał `lint:ui`. (Source: rewizja briefu, cost × signal.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-11-09
- Stack versions last verified: 2026-11-09
- AI-native tool references last verified: 2026-11-01

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
