# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-11-01

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   team is worried about X, and the failure would surface somewhere in
   <area>" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `supabase/migrations/`, `scripts/` (30 dni do 2026-11-01, 41 commitów).

**Twarde ograniczenie projektu:** żaden test ani bramka nie może wymagać `supabase db reset` ani zapisywać fixture'ów do lokalnej bazy deweloperskiej. Migracje: `npx supabase migration up`. Testy pgTAP: w transakcji wycofywanej na końcu (wywiad P2, incydent z 2026-10-10).

## 2. Risk Map

Najważniejsze scenariusze awarii, uporządkowane według ryzyka = wpływ × prawdopodobieństwo. Kolumna Source cytuje *dowód, który podniósł ryzyko*, nigdy konkretny plik jako „miejsce awarii” (patrz §1, zasada 3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|---|---|---|---|
| 1 | Usunięcie jednego zamiennika kasuje też inne zamienniki lub cały składnik; składnik znika bez jawnego potwierdzenia albo kaskada usuwa inne zamienniki niż pokazane na ekranie potwierdzenia | High | Medium | wywiad P1 (największa obawa); PRD FR-007; archive/2026-10-24-delete-entries-confirmed (impl-review F2: potwierdzenie pokazuje stan z GET, kaskada usuwa stan z POST); hot-spot dir `src/pages/api` (17 commitów/30d) |
| 2 | Użytkownik widzi, edytuje lub usuwa cudze składniki/zamienniki, np. podając cudze id w URL-u albo w formularzu | High | Medium | PRD Guardrails + Access Control; wywiad P1 (druga obawa); wywiad P4 (izolacja testowana tylko w warstwie bazy); archive/2026-10-04-first-substitute-lookup (impl-review F1: smoke nie ćwiczy ścieżki z cudzym id); hot-spot dir `src/pages/api` (17 commitów/30d) |
| 3 | Migracja wypchnięta na produkcję gubi lub przekłamuje dane użytkowników (wiersze, kategorie, oznaczenie „najlepszy”) | High | Medium | archive/2026-10-10-unique-substitutes (impl-review F1: kopia CSV może pominąć wiersze, brak kroków wycofania; F6: brak testu usuwania duplikatów); roadmap Open Question 2 (zmiana nazw kategorii migracją); hot-spot dir `supabase/migrations` (6 commitów/30d) |
| 4 | Wyszukiwanie po nazwie, tryb prefiksu lub filtr kategorii zwraca złe wyniki — gubi pasujące składniki, miesza kategorie, pokazuje stan pusty mimo istniejących danych | Medium | High | wywiad P3, P4; PRD FR-004, FR-005, US-01; archive/2026-10-12-ingredient-name-search (impl-review NEEDS ATTENTION; F1: filtr kategorii i reguła „URL wygrywa z cookie” bez pozytywnego sprawdzenia; F3: brak pokrycia listy „Pasujące składniki”); hot-spot dir `src/pages/ingredients` (20 commitów/30d, najwyżej w projekcie) |
| 5 | Uruchomienie testów lub bramki weryfikacyjnej kasuje lokalne dane dewelopera (konta, składniki) | Medium | High | wywiad P2 (incydent 2026-10-10: `db reset` jako bramka wyczyścił bazę lokalną); tech-stack.md (lokalny Supabase jako jedyna baza deweloperska) |
| 6 | Oznaczenie „najlepszy” jest błędne — dwa albo żaden w kategorii, znika po edycji, albo zamiana zgłasza sukces mimo równoległego usunięcia wiersza | Medium | Medium | PRD FR-003, FR-006, Business Logic; archive/2026-10-11-best-substitute-highlight (impl-review F1: odczyt bez blokady); roadmap S-05 Risk („fałszywy sukces”) |
| 7 | Niepoprawne lub nietypowe wejście (POST bez formularza, puste/za długie pola, wielkość liter i spacje, podwójne wysłanie) daje 500 albo zapisuje duplikat lub klucz nazwy niezgodny z nazwą | Medium | Medium | archive/2026-10-04-first-substitute-lookup (impl-review F2: POST bez formularza daje 500); archive/2026-10-10-unique-substitutes (F4: normalizacja tylko w aplikacji; F5: podwójne wysłanie); archive/2026-10-17-edit-entries (F3: grant pozwala zapisać niezgodny klucz); lessons.md (null z klienta Supabase → 500; dwa sposoby liczenia klucza nazwy) |

Abuse lens: #2 (autoryzacja / IDOR) i #7 (niezaufane wejście, walidacja po stronie serwera). Brak płatności i kosztownych operacji. Odrzucone w rewizji: dostęp niezalogowanego do chronionych tras (middleware stabilny, smoke już pokrywa przekierowania), różnice runtime dev/prod (brak dowodów), NFR < 1 s (przy tej skali danych to obserwacja, nie test).

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Po usunięciu jednego zamiennika pozostałe zamienniki składnika i sam składnik istnieją; składnik bez potwierdzenia się nie usuwa; kaskada usuwa dokładnie to, co pokazano przy potwierdzeniu | „Smoke usuwa drugi zamiennik i lista się zgadza, więc kaskada jest bezpieczna” | ścieżka usuwania od formularza do bazy, reguła kaskady, treść ekranu potwierdzenia, istniejące pokrycie pgTAP | integracja (endpoint + lokalny Supabase) + uzupełnienie pgTAP | asercja tylko „usunięty wiersz zniknął” bez sprawdzenia, że sąsiednie zostały |
| #2 | Konto B nie odczyta, nie zmieni ani nie usunie danych A — przez URL ani formularz z cudzym id; odpowiedź nie zdradza istnienia cudzego wiersza | „RLS działa w bazie (pgTAP), więc endpointy są bezpieczne” | które ścieżki przyjmują id od klienta, jakim klientem Supabase działa każda, jak tłumaczone są błędy „nie znaleziono” | integracja z dwoma kontami | test z jednym kontem; mock Supabase omijający RLS |
| #3 | Migracja uruchomiona na bazie z reprezentatywnymi danymi zachowuje liczbę wierszy, oznaczenia „najlepszy” i przypisania kategorii (poza zmianami zamierzonymi) | „Migracja przechodzi na pustej bazie, więc jest bezpieczna” | jak zbudować jednorazową bazę z danymi bez dotykania lokalnej; jak dziś wygląda `db push` na produkcję | integracja (migracja na jednorazowej bazie z fixture'ami) | test na pustej bazie; `db reset` na bazie deweloperskiej |
| #4 | Dla zestawu nazw (wielkość liter, polskie znaki, prefiks, brak trafień) i kombinacji filtr kategorii / URL / cookie wynik zgadza się z regułami z PRD i roadmapy | „Smoke przechodzi, więc filtr działa” — smoke nie ma pozytywnego sprawdzenia filtra | gdzie żyje logika trybu, filtra i stanu widoku; czy da się ją wydzielić jako czystą funkcję; źródło oczekiwanych wyników | unit (jeśli logika czysta), inaczej integracja renderu strony | wyrocznia przepisana z implementacji; tylko scenariusze z trafieniem |
| #5 | Pełny przebieg testów zostawia lokalne dane i konta deweloperskie bez zmian | „Testy sprzątają po sobie” — sprzątanie po przerwanym teście nie zadziała | czy testy integracyjne mogą działać w transakcji, osobnym schemacie lub osobnej bazie; izolacja fixture'ów | sprawdzenie w harnessie (liczności przed/po) | wymaganie `db reset`; fixture'y w bazie deweloperskiej |
| #6 | W każdej kategorii co najwyżej jeden „najlepszy”; zamiana atomowa; edycja zachowuje oznaczenie; usunięcie w trakcie zamiany nie daje fałszywego sukcesu | „Pojedyncze kliknięcie działa, więc reguła jest spełniona” | funkcja zamiany, ograniczenia w bazie, istniejący test pgTAP best-substitute | pgTAP + integracja | tylko ścieżka sekwencyjna; asercja skopiowana z SQL funkcji |
| #7 | Złe wejście daje czytelny błąd (`?error=` na stronie źródłowej), nie 500; nazwy różniące się wielkością liter/spacjami nie tworzą duplikatu; klucz nazwy zawsze zgodny z nazwą | „Formularz HTML waliduje, więc serwer nie musi” | walidacja po stronie serwera, normalizacja, ograniczenia unikalności, obsługa null z klienta Supabase | unit (normalizacja) + integracja (endpointy) | test tylko przez formularz; mock walidacji |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|---|---|---|---|---|---|
| 1 | Izolacja i usuwanie | Dowieść, że usuwanie kasuje tylko to, co trzeba, a konta są szczelne na poziomie endpointów; postawić runner TS i harness, który nie rusza lokalnych danych | #1, #2, #5 | runner + integracja (lokalny Supabase, dwa konta) + pgTAP | implementing | testing-isolation-and-delete |
| 2 | Wyszukiwanie i najlepszy | Zabezpieczyć najczęściej zmieniany obszar: tryb prefiksu, filtr kategorii, stan widoku i regułę „najlepszego” | #4, #6 | unit + integracja + pgTAP | not started | — |
| 3 | Bezpieczne migracje | Każda nowa migracja przechodzi test na bazie z danymi przed `db push`; gotowe przed pierwszą migracją M-02 | #3 | integracja (jednorazowa baza z fixture'ami) | not started | — |
| 4 | Walidacja i bramki | Twarda walidacja serwera; unit, integracja i pgTAP w CI; lokalny post-edit hook dla szybkich testów wyszukiwania | #7, cross-cutting | unit + integracja + gates + post-edit-hook | not started | — |

Kolejność: Faza 1 pokrywa największe obawy z wywiadu (P1) i buduje harness, którego potrzebują kolejne fazy. Faza 2 to hot-spot nr 1 (P3, P4). Faza 3 musi wylądować przed pierwszą migracją kolejnego milestone'u. Faza 4 utrwala poziom w CI.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

Profil bazy testów: **sparse** — 5 testów pgTAP w `supabase/tests/` (izolacja RLS, usuwanie, najlepszy, edycja, unikalność), uruchamiane ręcznie; ręczny `scripts/smoke.mjs` (~60 kroków HTTP przy działającym serwerze); kod TS (strony, API, `src/lib`) bez runnera; CI nie uruchamia żadnych testów.

| Layer | Tool | Version | Notes |
|---|---|---|---|
| unit + integration (TS) | Vitest (przez `getViteConfig()` z Astro) | 5.0.5 (npm, checked: 2026-11-01) | none yet — see Phase 1; zgodność z Astro 7.3.2 i adapterem Cloudflare do weryfikacji w research fazy 1 |
| baza danych (RLS, funkcje, ograniczenia) | pgTAP przez `npx supabase test db` | Supabase CLI 2.117.0 | istnieje; nie w CI — see Phase 4 |
| migracje na danych | Supabase CLI + jednorazowa baza z fixture'ami | 2.117.0 | none yet — see Phase 3; bez `db reset` na bazie deweloperskiej |
| e2e (HTTP) | `scripts/smoke.mjs` (Node fetch) | — | istnieje; ręcznie przy działającym serwerze; włączenie do CI rozważa Phase 4 |
| e2e (przeglądarka) | — | — | świadomie brak — przepływy są server-rendered, smoke HTTP daje sygnał taniej |
| (optional) AI-native | post-edit hook uruchamiający szybkie testy unit — checked: 2026-11-01 | n/a | see Phase 4. When NOT to use: dla testów wymagających Supabase (za wolne w pętli edycji) i jako substytut CI |

**Stack grounding tools (current session):**
- Docs: brak docs MCP (Context7 not available in current session) — sprawdzono przewodnik testowania Astro przez WebSearch (`getViteConfig()`, Container API); checked: 2026-11-01
- Search: WebSearch (Exa not available in current session) — potwierdzenie podejścia Vitest + Astro; wersje odczytane z npm registry i `node_modules`; checked: 2026-11-01
- Runtime/browser: claude-in-chrome dostępny — not used; e2e w przeglądarce poza zakresem (patrz wyżej); checked: 2026-11-01
- Provider/platform: `gh` CLI (bez MCP); brak MCP Supabase i Cloudflare — not used; checked: 2026-11-01

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is `planned`.

| Gate | Where | Required? | Catches |
|---|---|---|---|
| lint (ESLint z regułami typed) | local + CI | required (wired) | dryf składni i typów |
| lint:ui (literały w widokach) | local + CI | required (wired) | kolory i wartości spoza tokenów |
| build | CI | required (wired) | błędy kompilacji i konfiguracji env |
| unit + integration (Vitest) | local; CI | local required after §3 Phase 1; CI required after §3 Phase 4 | regresje logiki, izolacji i usuwania |
| pgTAP (`supabase test db`) | local; CI | local required (istnieje); CI required after §3 Phase 4 | RLS, kaskady, ograniczenia, funkcje bazy |
| test migracji na danych | local, przed `db push` | required after §3 Phase 3 | utrata lub przekłamanie danych przez migrację |
| smoke HTTP (`npm run smoke`) | local; CI optional | recommended local; CI decyzja w §3 Phase 4 | zepsute krytyczne przepływy end-to-end |
| post-edit hook | local (agent loop) | recommended after §3 Phase 4 | regresje wyszukiwania w chwili edycji |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- TBD — see §3 Phase 2 (wzorzec dla reguł wyszukiwania: tryb prefiksu, filtr kategorii, stan widoku; oczekiwane wyniki z PRD, nie z implementacji).

### 6.2 Adding an integration test (endpoint + lokalny Supabase)

- TBD — see §3 Phase 1 (wzorzec dla dwóch kont i usuwania: asercja na sąsiednich wierszach, harness bez zapisu do bazy deweloperskiej).

### 6.3 Adding a database test (pgTAP)

- **Location**: `supabase/tests/`.
- **Run locally**: `npx supabase test db`.
- Konwencja izolacji danych i plik referencyjny — TBD — see §3 Phase 1.

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 1 (autoryzacja: cudze id z drugiego konta) i §3 Phase 4 (walidacja: złe wejście → `?error=`, nie 500).

### 6.5 Adding a test for a new migration

- TBD — see §3 Phase 3 (migracja na jednorazowej bazie z fixture'ami; liczności i kluczowe pola przed/po).

### 6.6 Per-rollout-phase notes

(Po każdej fazie `/10x-implement` dopisuje tu 2–3 linie o tym, czego faza nauczyła.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Kitchen sink (`/dev/kitchen-sink`)** — strona tylko deweloperska, w produkcji 404. Re-evaluate if zacznie trafiać do produkcji albo stanie się źródłem regresji w komponentach. (Source: Phase 2 interview Q5.)
- **Multimodalny przegląd wizualny i snapshoty wyglądu** — wygląd zmienia się często, koszt utrzymania przewyższa sygnał przy jednym użytkowniku. Re-evaluate if pojawi się regresja wizualna, której nie złapał `lint:ui`. (Source: rewizja briefu, cost × signal.)

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-11-01
- Stack versions last verified: 2026-11-01
- AI-native tool references last verified: 2026-11-01

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
