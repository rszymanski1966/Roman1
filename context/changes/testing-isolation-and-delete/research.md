---
date: 2026-11-04T18:47:12+01:00
researcher: rszymanski1966 (Claude Code)
git_commit: bae2591
branch: main
repository: 10x-astro-starter
topic: "Faza 1 planu testów: izolacja kont i usuwanie (ryzyka #1, #2, #5)"
tags: [research, testing, delete, rls, isolation, vitest, pgtap, harness]
status: complete
last_updated: 2026-11-04
last_updated_by: rszymanski1966 (Claude Code)
---

# Research: Faza 1 planu testów — izolacja kont i usuwanie

**Date**: 2026-11-04T18:47:12+01:00
**Researcher**: rszymanski1966 (Claude Code)
**Git Commit**: bae2591 (drzewo robocze z niezacommitowanymi plikami toolkitu i `context/foundation/test-plan.md`; żaden nie dotyczy badanych ścieżek)
**Branch**: main
**Repository**: 10x-astro-starter

## Research Question

Ugruntować w kodzie rollout Phase 1 z `context/foundation/test-plan.md` („Izolacja i usuwanie”): ryzyka #1 (usuwanie kasuje za dużo / kaskada niezgodna z potwierdzeniem), #2 (dostęp do cudzych danych przez id z URL/formularza), #5 (testy kasują lokalne dane dewelopera). Dla każdego: realna ścieżka awarii, weryfikacja lub korekta Risk Response Guidance, istniejące testy, najtańsza warstwa, ryzyka spekulatywne.

Metoda: trzy równoległe badania read-only (usuwanie, izolacja, runner/harness) + weryfikacja decydujących miejsc w głównym kontekście. Nic nie uruchamiano (ani pgTAP, ani smoke, ani dev). Jedyne zapytanie sieciowe: `npm view vitest` i dokumentacja Astro.

## Summary

1. **Ryzyko #1 — częściowo realne, dwie tezy z §2 trzeba skorygować.**
   - Usuwanie zamiennika i składnika to pojedyncze `delete().eq("id", …).select("name").maybeSingle()` przez klienta użytkownika (`src/lib/services/substitutes.ts:429-437`, `:449-457`), a kaskada to FK `on delete cascade` (`supabase/migrations/20261004120000_substitute_database.sql:57`, `:89`). Reguła SQL jest już dobrze pokryta pgTAP (`supabase/tests/delete-entries.sql:79-100`, `:126-161`). Niepokryta jest warstwa TS: regresja filtra w serwisie nie zostałaby złapana.
   - **„Składnik bez potwierdzenia się nie usuwa” jest prawdą tylko na poziomie UI.** Endpoint `POST /api/ingredients/delete` nie ma pola potwierdzenia — sprawdza sesję, formularz, widok i `isUuid(ingredient_id)` (`src/pages/api/ingredients/delete.ts:28-57`). Bezpośredni POST usuwa składnik z kaskadą; smoke robi to dziś celowo (`scripts/smoke.mjs:880-889`). PRD FR-007 („po potwierdzeniu przez użytkownika”, `context/foundation/prd.md:100`) nie rozstrzyga, czy wymuszenie ma być po stronie serwera → decyzja użytkownika.
   - **„Kaskada usuwa dokładnie to, co pokazano przy potwierdzeniu” nie zachodzi przy równoległej zmianie i to jest zaakceptowane.** impl-review S-05 F2: „ACCEPTED — Fix A: ograniczenie wzorca »strona potwierdzenia + POST«” (`context/archive/2026-10-24-delete-entries-confirmed/reviews/impl-review.md`, sekcja F2). Test może udowodnić wersję sekwencyjną: GET pokazuje pełny zasięg kaskady (wszystkie kategorie), a POST bez zmian pomiędzy usuwa dokładnie ten zbiór.
2. **Ryzyko #2 — w inspekcji nie znaleziono podatności; ryzyko jest regresyjne, nie bieżące.** Klient to klucz anon/publishable + JWT z ciasteczek (`src/lib/supabase.ts:9`). W `src/`, `supabase/migrations/` i `scripts/` brak `service_role` i `security definer` (grep, wynik pusty). Wszystkie ścieżki po id idą przez RLS; 0 wierszy mapuje się na `not_found`, nie na sukces (`substitutes.ts:371, 417, 436, 456`); cudze id i losowy uuid trafiają w tę samą gałąź i ten sam tekst. Założenie „RLS w bazie, więc endpointy są bezpieczne” jest dziś prawdziwe **tylko z konwencji** — pgTAP nie zauważy, gdy aplikacja zacznie używać klienta service-role albo funkcji definer. Smoke ma już dwa konta i ~70% kroków cross-account, ale ręcznie, poza CI i z kontami zostającymi w bazie.
3. **Ryzyko #5 — realne i już się materializuje przez smoke.** Smoke rejestruje dwóch użytkowników `smoke-${Date.now()}@…` (`scripts/smoke.mjs:8-10`), nie sprząta (brak `finally`/`deleteUser`), więc każdy przebieg — także zielony — zostawia 2 wiersze `auth.users` i dane konta B. Wszystkie tabele mają `user_id … references auth.users on delete cascade` i RLS per użytkownik, więc throwaway user nie widzi i nie koliduje z danymi deweloperskimi. Nowy harness nie może powielić wzorca smoke.
4. **Runner — taniej niż `getViteConfig()`.** Logika DB w `src/lib/services/substitutes.ts` przyjmuje wstrzyknięty `SupabaseClient` i nie importuje `astro:env` (importują go tylko `src/lib/supabase.ts:3` i `src/lib/config-status.ts:1`). Zwykły Vitest bez konfiguracji Astro + klient supabase-js zalogowany jako throwaway user wystarcza dla testów serwisów. Zachowanie endpointów (redirecty, `?error=`, middleware) — przez HTTP na działającym dev, jak smoke. `getViteConfig()` z adapterem Cloudflare jest niezweryfikowanym ryzykiem (Miniflare w Vitest). **Wersja w planie jest nieaktualna:** najnowszy Vitest to 5.1.0 (npm, 2026-11-02), peer `vite ^6.4 || ^7 || ^8` (zainstalowany vite 8.3.0).
5. **Konflikt do rozstrzygnięcia przed `/10x-plan`:** `test-plan.md` §1 zabrania „zapisywać fixture'ów do lokalnej bazy deweloperskiej”. Jedyna tania droga dla testów integracyjnych z RLS i auth to throwaway users w tej samej lokalnej bazie + gwarantowane sprzątanie + sprawdzenie przed/po. Alternatywa bez zapisu to drugi stos Supabase (~7 GB RAM, znane problemy z portami WinNAT). → decyzja użytkownika.

## Detailed Findings

### Ryzyko #1 — usuwanie

**Zamiennik.**

- Wejście: link „Usuń” → `/ingredients/delete-substitute?substitute=<id>&…` (`src/components/ingredients/SubstituteCard.astro:47`). Strona potwierdzenia czyta `getSubstituteForEdit` pod RLS; cudze/nieistniejące/zniekształcone id → stan „nie znaleziono” bez formularza (`src/pages/ingredients/delete-substitute.astro:26-33`).
- Endpoint `src/pages/api/substitutes/delete.ts`: null klienta → redirect z komunikatem (:26-28); brak `locals.user` → `/auth/signin` (:30-32; `/api` nie jest w `PROTECTED_ROUTES`, `src/middleware.ts:4`); zły formularz/widok → `INVALID_FORM` (:34-46); nie-uuid → `error=Nie znaleziono zamiennika.` (:48-51); usunięcie przez `deleteSubstitute` (:54); `not_found` → lista z `?error=` (:57-58); inny błąd DB → strona potwierdzenia z `?error=` (:60); sukces → `notice=Usunięto zamiennik „…”` (:63).
- Baza: polityka `substitutes_delete_own using (user_id = auth.uid())` (`supabase/migrations/20261026202646_delete_entries.sql:46-49`).

**Składnik.**

- Wejście: `deleteHref` → `/ingredients/delete-ingredient?ingredient_id&…` (`src/pages/ingredients/index.astro:187-195`). Strona czyta `getIngredient`, potem `listIngredientSubstitutes(supabase, id, null)` — wszystkie kategorie (`src/pages/ingredients/delete-ingredient.astro:35-51`). Komponent pokazuje „Usuniesz składnik „X” i N zamienników we wszystkich kategoriach” i liczbę per kategoria (`src/components/ingredients/IngredientDeleteConfirm.astro:43-58`). Formularz niesie tylko `ingredient_id` i pola widoku, bez liczby ani listy (:62-67).
- Endpoint `src/pages/api/ingredients/delete.ts:51-79` (zweryfikowane w głównym kontekście): `isUuid` → `deleteIngredient` → `not_found` do wyszukiwania z `?error=`, inny błąd do formularza, sukces z `notice` i opcjonalnym `hasSearchHits`.
- Kaskada: `ingredient_categories.ingredient_id … on delete cascade` (`20261004120000_substitute_database.sql:57`), `substitutes.ingredient_category_id … on delete cascade` (:89). Pary nie mają polityki DELETE (`20261026202646_delete_entries.sql:7-9`); anon traci DELETE na czterech tabelach (:51).
- Skażenie kaskady cudzymi wierszami przez API niemożliwe: INSERT zamiennika wymaga własnej pary (`20261004120000:106-117`), a `ingredient_category_id` nie ma grantu UPDATE (`20261011201658_best_substitute.sql:20-21`, `20261021120000_edit_entries.sql:26`).
- Efekt uboczny do asercji: usunięcie ostatniego zamiennika pary zostawia pustą parę i składnik; `listIngredientSubstitutes` pomija puste pary (`substitutes.ts:230`).

**Potwierdzenie po stronie serwera.** Brak pola confirm/nonce/count w obu endpointach. Jedyną barierą przed cudzym formularzem jest domyślne `security.checkOrigin` Astro (brak nadpisania w `astro.config.mjs` — grep pusty); to ochrona CSRF, nie potwierdzenie. Zachowanie POST bez nagłówka `Origin` niezweryfikowane.

**F2 — konkretny scenariusz rozjazdu.** Karta 1 otwiera potwierdzenie dla składnika M („1 zamiennik, Ciasta: 1”). Karta 2 dodaje zamiennik w „Dania mięsne”; `addSubstitute` odnajduje ten sam składnik po `name_key` (`substitutes.ts:117-130`). Karta 1 klika „Usuń składnik”: POST niesie tylko `ingredient_id`, kaskada usuwa 2 zamienniki w 2 kategoriach, a komunikat (`delete.ts:65`) wymienia tylko składnik. Odwrotne przypadki (zamiennik usunięty lub nazwa zmieniona pomiędzy) są nieszkodliwe. Usuwanie zamiennika (po kluczu głównym) nie ma tej luki.

**Istniejące pokrycie.**

- pgTAP `supabase/tests/delete-entries.sql` (`begin;` :7 … `rollback;` :190, `plan(18)`): B nie usuwa danych A, liczności A bez zmian (:45-71); A usuwa „Margaryna” — zostają dokładnie `['Ksylitol','Olej kokosowy','Smalec']` i para (:79-100) — siostra w tej samej parze, w innej kategorii i inny składnik; `set_best_substitute` na usuniętym id → P0002 (:102-107); bezpośredni DELETE pary → 0 wierszy (:112-121); usunięcie „Masło” kasuje obie pary i ich zamienniki, „Cukier” zostaje (:126-161); anon DELETE → 42501 (:169-174). Nie asertuje wprost, że wiersz składnika „Masło” przeżywa usunięcie zamiennika (wynika z FK pary). Nie pokrywa niczego powyżej SQL.
- Smoke `scripts/smoke.mjs:740-899`: B dostaje stan „nie znaleziono” i `error=` dla cudzych id (:741-757, :775-788); A usuwa `secondSubstitute` i lista zawiera `substituteMarker`, nie zawiera usuniętego (:809-816); ponowny POST → `not_found` (:819-821); potwierdzenie składnika pokazuje „2 zamienniki” i obie kategorie (:825-839); kaskada sprawdzona tylko przez `foundSubstituteId` (:874-876). Nie sprawdza: przeżycia trzeciego zamiennika tej samej pary, liczby faktycznie usuniętych wierszy, zgodności liczby z potwierdzenia z kaskadą. Asercje to dopasowania HTML.

### Ryzyko #2 — izolacja kont

**Podstawy (zweryfikowane).** `createServerClient(SUPABASE_URL, SUPABASE_KEY, {cookies})` (`src/lib/supabase.ts:9`); grep `service_role|security definer` po `src`, `supabase/migrations`, `scripts` — brak wyników. Jedyne RPC: `set_best_substitute` (`substitutes.ts:258`), `security invoker` (`20261011201658:39`, `20261026202646:72`), pierwszy odczyt `for update` przez RLS, pusty wynik → P0002. Polityki `*_own` `to authenticated` na `user_id = (select auth.uid())` dla SELECT/INSERT (`20261004120000:41-49, 65-81, 101-117`), UPDATE (`20261011201658:23-27`, `20261021120000:34-38`), DELETE (`20261026202646:41-49`). Granty UPDATE ograniczone do kolumn treści. Każdy endpoint danych sam sprawdza `locals.user` (`api/ingredients.ts:58`, `ingredients/delete.ts:33`, `ingredients/rename.ts:33`, `substitutes/best.ts:20`, `substitutes/delete.ts:30`, `substitutes/update.ts:58`).

**Wejścia przyjmujące id od klienta** (co widzi B z id A):

| Wejście                                                                          | Id od klienta                               | Operacja                                                                            | Co widzi B                                                                |
| -------------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| GET `/ingredients?ingredient=&category=`                                         | ingredient, category                        | wyszukanie id we własnej liście B (`index.astro:111-117`)                           | 200, stan pusty „Brak zamienników dla tego składnika.” (:310-317)         |
| GET `/ingredients/new?ingredient=`                                               | ingredient                                  | `.find` we własnej liście (`new.astro:21,57`)                                       | brak prefillu                                                             |
| GET `/ingredients/edit-ingredient?ingredient_id=`                                | ingredient_id                               | `getIngredient` (`substitutes.ts:384-390`)                                          | „Nie znaleziono składnika.”, bez formularza                               |
| GET `/ingredients/delete-ingredient?ingredient_id=`                              | ingredient_id                               | `getIngredient`                                                                     | „Nie znaleziono składnika.”, bez formularza                               |
| GET `/ingredients/edit-substitute?substitute=`, `/delete-substitute?substitute=` | substitute                                  | `getSubstituteForEdit` (`substitutes.ts:317-325`)                                   | „Nie znaleziono zamiennika.”, bez formularza i bez wartości               |
| POST `/api/ingredients/rename`                                                   | ingredient_id                               | `update().eq(id).select().maybeSingle` (`substitutes.ts:406-417`)                   | 302 do formularza z `error=Nie znaleziono składnika.` (`rename.ts:64-66`) |
| POST `/api/ingredients/delete`                                                   | ingredient_id                               | delete (`substitutes.ts:449-457`)                                                   | 302 z `error=Nie znaleziono składnika.` (`delete.ts:59-60`)               |
| POST `/api/substitutes/update`                                                   | substitute_id                               | update (`substitutes.ts:356-371`)                                                   | 302 z `error=Nie znaleziono zamiennika.` (`update.ts:96-99`)              |
| POST `/api/substitutes/delete`                                                   | substitute_id                               | delete (`substitutes.ts:429-437`)                                                   | 302 z `error=Nie znaleziono zamiennika.` (`delete.ts:57-58`)              |
| POST `/api/substitutes/best`                                                     | substitute_id                               | RPC `set_best_substitute`                                                           | 302 z `error=Nie znaleziono zamiennika.&error_for=<id>` (`best.ts:49-51`) |
| POST `/api/ingredients`                                                          | category_id (składnik po nazwie, nie po id) | upsert `on conflict do nothing` na `(user_id, name_key)` (`substitutes.ts:117-130`) | nie dotyczy — tworzy własny wiersz B                                      |

**Wycieki i fałszywe sukcesy.** Brak wyroczni istnienia: cudze id i losowy uuid dają ten sam wynik. Format id zmienia cel redirectu (nie-uuid → lista; poprawny uuid → formularz; `rename.ts:52` vs `:64`, `update.ts:77` vs `:96`), ale nie zdradza istnienia. Każda mutacja łańcuchem `.select().maybeSingle()` zamienia 0 wierszy na `not_found`. Mylący, ale niezdradzający tekst: obcy lub nieznany `?ingredient=` daje „Brak zamienników dla tego składnika.” z linkiem „dodaj”.

**Pokrycie.** pgTAP: `rls-isolation.sql:33-64` (SELECT/INSERT cross-user, 42501), `edit-entries.sql:124-149` (UPDATE B nic nie zmienia), `delete-entries.sql:45-71`, `best-substitute.sql:118-133` (P0002, oznaczenie A bez zmian), `unique-substitutes.sql:68-74`. Smoke: dwa konta (`smoke.mjs:9-10`), kroki B na best/update/edit/rename/delete/search (:648-794); F1 z S-01 naprawione (`context/archive/2026-10-04-first-substitute-lookup/reviews/impl-review.md:33-41`, smoke :686-702, :760-764). **Luki:** brak kroku B na GET `edit-ingredient` i prefill `new`; brak porównania „cudze id ≡ losowy uuid”; stan A niesprawdzany po próbie best (tylko pgTAP) i po próbie rename; pierwszy krok best akceptuje dowolny `error=` (:652); brak przypadku „B dodaje dokładnie nazwę składnika A” przez HTTP (B ma sufiks `-b`, :695); pgTAP nie asertuje pustego `returning` dla UPDATE/DELETE B (na tym opiera się mapowanie `maybeSingle`).

### Ryzyko #5 — harness i dane deweloperskie

- `supabase/config.toml:209`: `enable_confirmations = false`; `enable_signup = true` — signup daje od razu sesję. Porty: api 54321, db 54322.
- `.env`/`.dev.vars`: tylko `SUPABASE_URL` i `SUPABASE_KEY` (klucz publishable). Klucz secret istnieje lokalnie przez `npx supabase status` (nieuruchamiane; nazwa zmiennej w CLI 2.117.0 niezweryfikowana).
- Smoke zostawia po każdym przebiegu 2 `auth.users` (+ identities, sesje) oraz składnik, parę i zamiennik konta B (`smoke.mjs:686-700`); przerwany przebieg zostawia też dane A.
- Izolacja throwaway usera: wszystkie tabele użytkownika mają `user_id … references auth.users (id) on delete cascade` (`20261004120000:32, 56, 88`); unikalności per użytkownik lub para (`:36`, `20261010115230:28`); globalnie unikalne tylko `categories.slug/name` (słownik bez polityki zapisu, `:17-20`). Usunięcie usera przez admin API kasuje wszystkie jego wiersze.

| Opcja                                                                                                             | Co zostaje po przerwanym przebiegu           | Koszt                                                       | Wpływ na dane deweloperskie                                                                                          |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| (1) throwaway users `vitest-<runId>@example.test` + sweep przed i po (admin API, klucz secret tylko w env testów) | osierocone konta wzorca do następnego sweepu | niski                                                       | brak dzięki RLS i unikalnościom per user; baza **jest** zapisywana                                                   |
| (2a) druga baza w tym samym Postgresie                                                                            | tylko ta baza                                | średni                                                      | brak; PostgREST/GoTrue obsługują tylko `postgres` → nadaje się do testów SQL i migracji (ryzyko #3), nie do API/auth |
| (2b) drugi stos Supabase (osobny `project_id` i porty)                                                            | nic w dev                                    | wysoki (~7 GB RAM, WinNAT)                                  | brak                                                                                                                 |
| (2c) osobny schemat                                                                                               | —                                            | niepraktyczne (`public.*` na sztywno, `auth.users` wspólne) | —                                                                                                                    |
| (3) tylko pgTAP w transakcji                                                                                      | nic (rollback)                               | najniższy, konwencja istnieje                               | brak; tylko reguły DB                                                                                                |

**Sprawdzenie „dane dev bez zmian”.** Klucz publishable widzi tylko własne wiersze; `auth` nie jest w `api.schemas` (`config.toml:13`). Najprostsza droga read-only: połączenie Postgres `127.0.0.1:54322` w `begin transaction read only;`, przed i po: liczność + `md5(string_agg(...order by id))` treści per tabela (`auth.users`, `ingredients`, `ingredient_categories`, `substitutes`, `categories`) z wyłączeniem wzorca testowego, plus „0 wierszy wzorca po sweepie”. Same liczności nie złapią UPDATE w miejscu. Domyślne dane logowania `postgres/postgres` niezweryfikowane.

**Konwencja pgTAP (wszystkie 5 plików).** `begin;` → `create extension if not exists pgtap;` → `select plan(N);` → … → `select * from finish();` → `rollback;` (np. `rls-isolation.sql:5,7,9,93,95`). Użytkownicy wstawiani jako postgres do `auth.users` ze stałymi UUID per plik (`…0a/…0b`, `…da/…db`, `…ea/…eb`), e-maile `@example.test`; działanie jako użytkownik: `set local role authenticated; set local request.jwt.claims = '{"sub":"…","role":"authenticated"}';`, potem `reset role;`. Nowe testy: ten sam szkielet, nowy sufiks UUID, bez `commit`.

### Runner TS

- Zainstalowane: astro 7.3.2, vite 8.3.0, @astrojs/cloudflare 14.3.1 (zweryfikowane w `node_modules/*/package.json`). `getViteConfig(userViteConfig, inlineAstroConfig?)` eksportowane (`node_modules/astro/dist/config/index.d.ts:13`).
- Vitest: najnowszy 5.1.0 (2026-11-02), 5.0.5 z 2026-10-15; peer `vite ^6.4.0 || ^7.0.0 || ^8.0.0`; engines `node ^22.12.0 || ^24 || >=26`. Astro sam testuje na `vitest ^4.1.0` — brak potwierdzenia Vitest 5 po stronie Astro.
- `getViteConfig()` uruchamia `astro:config:setup` wszystkich integracji, a adapter Cloudflare bezwarunkowo dodaje `cfVitePlugin`, który tworzy Miniflare w `configureServer` (wnioskowanie z dist, nieuruchamiane). Wyjście awaryjne: `configFile: false` (pole w `AstroInlineConfig`). `astro:env/server` w trybie nie-build jest wstrzykiwany z `loadEnv(mode)` → pod Vitest czytane `.env`, `.env.test`.
- Import handlerów tras wprost odradzany: wymagają pełnego `APIContext` z `locals.user` ustawianym przez middleware (`src/pages/api/substitutes/delete.ts:24-31`) — test sprawdzałby atrapy. Realny runtime to workerd.
- `@/` alias: Vite 8 ma `resolve.tsconfigPaths` (typy), działanie pod Vitest 5 niezweryfikowane.

## Code References

- `src/lib/services/substitutes.ts:429-437` — `deleteSubstitute`: delete po id, 0 wierszy → `not_found`
- `src/lib/services/substitutes.ts:449-457` — `deleteIngredient`: delete po id, kaskada w bazie
- `src/lib/services/substitutes.ts:117-130` — `addSubstitute` odnajduje istniejący składnik po `name_key` (mechanizm F2)
- `src/pages/api/ingredients/delete.ts:51-79` — endpoint bez pola potwierdzenia
- `src/pages/ingredients/delete-ingredient.astro:35-51` — źródło danych ekranu potwierdzenia (`listIngredientSubstitutes(…, null)`)
- `src/components/ingredients/IngredientDeleteConfirm.astro:43-67` — treść potwierdzenia i ukryte pola
- `src/lib/supabase.ts:9` — jedyny sposób tworzenia klienta (anon + cookies)
- `src/middleware.ts:4` — `PROTECTED_ROUTES` bez `/api`
- `supabase/migrations/20261004120000_substitute_database.sql:32,56,57,88,89` — FK do `auth.users` i kaskady
- `supabase/migrations/20261026202646_delete_entries.sql:41-51` — polityki DELETE, revoke anon
- `supabase/tests/delete-entries.sql:79-100,126-161` — pgTAP sąsiadów i kaskady
- `scripts/smoke.mjs:8-10,740-899` — konta smoke bez sprzątania; kroki usuwania i cross-account
- `supabase/config.toml:209` — `enable_confirmations = false`

## Architecture Insights

- Własność danych egzekwuje wyłącznie RLS; aplikacja nie ma własnych checków własności. Bezpieczeństwo endpointów zależy od dwóch niezmienników aplikacji: (a) każdy klient powstaje przez `src/lib/supabase.ts` z kluczem anon, (b) brak funkcji `security definer`. Oba są dziś spełnione wyłącznie z konwencji — najtańsza ochrona to statyczny check (skrypt/lint), nie test integracyjny.
- Serwisy przyjmują `SupabaseClient` jako argument — to naturalny szew testowy: prawdziwy klient zalogowany jako throwaway user, bez Astro i bez mocków.
- Wzorzec „strona potwierdzenia (GET) + POST z samym id” jest nieatomowy z założenia (F2 ACCEPTED).

## Historical Context (from prior changes)

- `context/archive/2026-10-24-delete-entries-confirmed/reviews/impl-review.md` (F2) — rozjazd GET/POST: **supported** (mechanizm potwierdzony w kodzie); decyzja ACCEPTED (Fix A), Fix B (liczba w formularzu) odrzucony.
- `context/archive/2026-10-04-first-substitute-lookup/reviews/impl-review.md:33-41` (F1: smoke nie ćwiczy cudzego id) — **contradicted dziś**: smoke ma już kroki z cudzym id (`smoke.mjs:686-702, :760-764`). Test plan §2 cytuje F1 jako dowód ryzyka #2 — jako dowód historyczny pozostaje poprawny, jako opis stanu jest nieaktualny.
- Incydent 2026-10-10 (`db reset` jako bramka) — źródło twardego ograniczenia §1; smoke nadal zapisuje do bazy dev.

## Related Research

Nie dotyczy (pierwsza faza rolloutu testów).

## Corrections to test-plan.md (do backportu przez `/10x-test-plan`)

1. **#1 Risk Response Guidance:** „kaskada usuwa dokładnie to, co pokazano przy potwierdzeniu” → zawęzić do przypadku sekwencyjnego (F2 ACCEPTED); „składnik bez potwierdzenia się nie usuwa” → dziś tylko UI; wersja serwerowa wymaga decyzji produktowej.
2. **#2 Must challenge:** dopisać, że założenie „RLS wystarcza” trzyma się konwencji (brak service-role i definer) — najtańszy strażnik to check statyczny.
3. **#5:** smoke już łamie „bez fixture'ów w bazie dev” (konta bez sprzątania); doprecyzować ograniczenie (patrz Open Question 1).
4. **§4 Stack:** Vitest 5.1.0 (nie 5.0.5); `getViteConfig()` niekonieczny dla testów serwisów.

## Open Questions

1. **(decyzja użytkownika, blokuje plan)** Czy throwaway users w lokalnej bazie dev (wzorzec e-mail, sweep przed i po przez admin API, sprawdzenie hashy danych dev przed/po) spełniają twarde ograniczenie §1? Jeśli nie — testy integracyjne endpointów wymagają drugiego stosu Supabase albo zostają przy pgTAP.
2. **(decyzja użytkownika)** Czy FR-007 wymaga, by serwer odrzucał usunięcie składnika bez potwierdzenia (np. pole `confirm`)? To zmiana kodu produkcyjnego, nie tylko test.
3. **(decyzja użytkownika)** F2: zostawić jako zaakceptowane ograniczenie i udokumentować testem sekwencyjnym, czy wrócić do Fix B / RPC?
4. **(spike w planie)** Czy smoke ma dostać sprzątanie kont w ramach tej fazy (ryzyko #5), czy zostaje jak jest?
5. **(niezweryfikowane)** nazwa zmiennej klucza secret w `supabase status -o env` (CLI 2.117.0); domyślne `postgres/postgres` na 54322; `resolve.tsconfigPaths` pod Vitest 5; zachowanie `checkOrigin` dla POST bez `Origin`; zachowanie `maybeSingle()` przy mutacji 0 wierszy (potwierdzone pośrednio przez smoke :664, :758, nieuruchamiane).
