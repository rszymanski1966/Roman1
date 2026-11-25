---
date: 2026-11-21T11:43:52+01:00
researcher: rszymanski1966 (z Claude Code)
git_commit: 6fa0110e6d0f531530a9321347a70424f94802a6
branch: main
repository: rszymanski1966/Roman1
topic: "Ugruntowanie fazy 4 rolloutu testów (Walidacja i bramki): ryzyko #7 + bramki cross-cutting"
tags: [research, testing, validation, ci, quality-gates, post-edit-hook, supabase, name-key]
status: complete
last_updated: 2026-11-21
last_updated_by: rszymanski1966 (z Claude Code)
---

# Research: faza 4 rolloutu testów — walidacja i bramki

**Date**: 2026-11-21T11:43:52+01:00
**Researcher**: rszymanski1966 (z Claude Code)
**Git Commit**: 6fa0110e6d0f531530a9321347a70424f94802a6 (drzewo robocze z niezacommitowanymi zmianami w `CLAUDE.md`, `context/foundation/test-plan.md`, `.claude/`; odnośniki w tym dokumencie są lokalnymi `plik:linia`)
**Branch**: main
**Repository**: rszymanski1966/Roman1

## Research Question

Ugruntować fazę 4 z `context/foundation/test-plan.md` („Walidacja i bramki”):

- **#7**: udowodnić, że złe wejście (POST bez formularza, puste/za długie pola, wielkość liter i spacje, podwójne wysłanie) daje czytelny `?error=` na stronie źródłowej, nie 500; nazwy różniące się wielkością liter/spacjami nie tworzą duplikatu; klucz nazwy zawsze zgodny z nazwą. Zakwestionować „formularz HTML waliduje, więc serwer nie musi”. Unikać testu tylko przez formularz i mocka walidacji.
- **cross-cutting**: bramki z §5 oznaczone „CI required after §3 Phase 4” faktycznie blokują merge (wymaga lokalnego Supabase w CI); decyzja o smoke w CI; post-edit hook uruchamia tylko szybkie testy unit bez stosu i nie zastępuje CI.

Zakres sprawdzony: wszystkie endpointy w `src/pages/api/**` (9 plików), `src/lib/entry-fields.ts`, `src/lib/services/substitutes.ts`, `src/middleware.ts`, formularze w `src/components/**` i `src/pages/ingredients/**`, migracje `supabase/migrations/*.sql` (6), `supabase/config.toml`, `vitest.config.ts`, `tests/**`, `scripts/*.mjs`, `.github/workflows/*.yml`, `.claude/settings*.json`, `.husky/`, `context/archive/**`, `context/foundation/{prd,test-plan,lessons}.md`. Odczyt statyczny; żadnych testów ani serwera nie uruchamiano. Stan ochrony gałęzi sprawdzony przez `gh api` (tylko odczyt).

## Summary

**#7 — wytyczna częściowo nieaktualna.** Serwer już waliduje: 6 endpointów danych (`api/ingredients.ts`, `ingredients/{rename,delete}.ts`, `substitutes/{best,update,delete}.ts`) łapie błąd `formData()`, przycina i scala spacje, sprawdza puste i za długie pola i odpowiada przekierowaniem z `?error=` (np. `src/pages/api/ingredients.ts:62-98`). Twierdzenie „formularz waliduje, więc serwer nie musi” nie opisuje dzisiejszego kodu — ale **nic tego nie przypina testem w Vitest ani w CI** (jedyne pokrycie pustych pól i duplikatów wielkością liter to ręczny `npm run smoke`). Realne luki:

1. **`/api/auth/signin` i `/api/auth/signup` dają 500 na POST bez formularza** — `await context.request.formData()` bez try/catch (`src/pages/api/auth/signin.ts:5`, `signup.ts:5`), przed sprawdzeniem null klienta. Brak pola jest rzutowany `as string` i trafia do GoTrue jako `null` (`signin.ts:6-7`). Fix S-01 F2 świadomie pominął auth („endpointy auth bez zmian”, `context/archive/2026-10-04-first-substitute-lookup/reviews/impl-review.md:51`).
2. **`ingredients.name_key` może rozjechać się z `name`** przy bezpośrednim zapisie przez PostgREST (anon key + własny JWT): tabelowy grant INSERT nie jest cofnięty, `grant update (name, name_key)` (`supabase/migrations/20261021120000_edit_entries.sql:32`), żadnego CHECK/triggera wiążącego klucz z nazwą. Follow-up z S-04 F3 nadal otwarty (`context/archive/2026-10-17-edit-entries/follow-ups/review-fixes.md:6`).
3. **Normalizacja spacji tylko w aplikacji**: `substitutes.name_key = lower(name)` (`supabase/migrations/20261010115230_unique_substitutes.sql:11-12`) nie przycina ani nie scala spacji; zapis z pominięciem API może zapisać „Olej kokosowy” obok „Olej kokosowy”. Ryzyko zaakceptowane w unique-substitutes F4 („SKIPPED (risk accepted: all writes go through the API)”, `context/archive/2026-10-10-unique-substitutes/reviews/impl-review.md:70`).
4. **Osierocony składnik**: dodanie z poprawnym składniowo, ale nieistniejącym `category_id` tworzy wiersz `ingredients` (`src/lib/services/substitutes.ts:120-123`), a potem upsert pary pada na FK (`supabase/migrations/20261004120000_substitute_database.sql:58`) → ogólny błąd; składnik zostaje bez pary (wniosek z kodu, nieuruchomione).
5. **Podwójne wysłanie nie tworzy duplikatu** (drugi insert dostaje 23505 → czytelny komunikat o duplikacie, `substitutes.ts:164-166`), ale użytkownik widzi błąd po udanym zapisie (unique-substitutes F5, SKIPPED). Brak testu sekwencyjnego i współbieżnego.

**Bramki — dziś nic nie blokuje merge'a.** CI to jeden job `ci`: `npm ci` → `astro sync` → lint → lint:ui → build → deploy przy push (`.github/workflows/ci.yml:10-39`); bez testów i bez Supabase. `main` nie ma ochrony gałęzi ani rulesetów (`gh api …/branches/main/protection` → 404 „Branch not protected”, `/rulesets` → `[]`). Kod testów jest przenośny na Linux CI i działa na świeżej, pustej bazie; praca leży w workflow (start Supabase w Dockerze, wygenerowanie `.dev.vars`, dev server w tle, kolejne kroki zamiast równoległych) i w **ręcznym** ustawieniu ruleset/ochrony gałęzi w GitHubie (poza repo). Post-edit hook: brak jakichkolwiek hooków dziś (`.claude/settings.json` ma tylko `permissions`); właściwy kształt to `PostToolUse` na `Write|Edit` ze skryptem Node uruchamiającym `vitest related <plik> --run --project unit --passWithNoTests` — `--project unit` jest obowiązkowe.

## Detailed Findings

### #7.1 Zachowanie endpointów przy złym wejściu

**Warstwa przed handlerem — Astro `checkOrigin`.** Domyślnie `true` (`node_modules/astro/dist/core/config/schemas/defaults.js:44`, bez nadpisania w `astro.config.mjs`). Dla POST: Content-Type formularzowy (`x-www-form-urlencoded`, `multipart/form-data`, `text/plain`) bez zgodnego `Origin` → 403; brak Content-Type i brak zgodnego `Origin` → 403 (`node_modules/astro/dist/core/app/origin-check.js:15-21`). Do handlera dociera więc `application/json` z dowolnego originu oraz żądania same-origin z dowolnym typem. Konsekwencja dla testów: żądanie „POST bez formularza” musi mieć `Origin` zgodny z serwerem (robi to już `tests/http/client.ts:47`) albo `Content-Type: application/json` — inaczej test sprawdzi 403 z Astro, a nie handler.

**Endpointy danych (6 plików) — zachowanie z kodu:**

| Przypadek                                                       | Zachowanie                                                                                                                | Źródło                                                                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ciało nie-formularz                                             | catch → `?error=Nieprawidłowe dane formularza.`                                                                           | `api/ingredients.ts:62-68`; analogicznie `rename.ts:37-43`, `update.ts:62-68`, `best.ts:24-30`, `substitutes/delete.ts:34-40`, `ingredients/delete.ts:37-43` |
| brak pola / puste / same spacje                                 | `field()` mapuje null/File na `""` (`api/ingredients.ts:16-19`), potem `normalizeName`/`trim` i komunikat z `error_field` | `api/ingredients.ts:69-92`; `update.ts:89,91`; `rename.ts:56,60`                                                                                             |
| za długie                                                       | `charLength` (punkty kodowe) > 100/100/100/500 → komunikat                                                                | `api/ingredients.ts:83,89,93,96`; limity `src/lib/entry-fields.ts:7-9` = CHECK-i `supabase/migrations/20261004120000_substitute_database.sql:33,90-92`       |
| `category_id` nie-uuid                                          | „Wybrana kategoria jest nieprawidłowa.”                                                                                   | `api/ingredients.ts:87`                                                                                                                                      |
| `category_id` uuid nieistniejący                                | upsert składnika OK, para pada na FK → ogólny błąd bez `error_field`; składnik zostaje (wniosek)                          | `src/lib/services/substitutes.ts:120-123,134-140`                                                                                                            |
| wariant wielkości liter/spacji istniejącego składnika           | ten sam klucz → `ignoreDuplicates` → istniejący wiersz użyty, pierwsza pisownia zostaje; bez błędu i bez duplikatu        | `substitutes.ts:116-123`                                                                                                                                     |
| duplikat zamiennika (wielkość liter / spacje)                   | 23505 → `duplicateSubstituteMessage`, kod `duplicate`, `error_field=substitute`                                           | `substitutes.ts:164-166`; `api/ingredients.ts:109-112`                                                                                                       |
| podwójne wysłanie dodania                                       | drugi request: upserty nic nie robią, insert → 23505 → komunikat o duplikacie; bez drugiego wiersza                       | jw.                                                                                                                                                          |
| zmiana nazwy na nazwę innego składnika (dowolna wielkość liter) | 23505 → „Składnik „X” jest już zapisany.”                                                                                 | `substitutes.ts:408-417`                                                                                                                                     |
| cudze / losowe uuid                                             | RLS: 0 wierszy → not_found → „Nie znaleziono …” (status < 500)                                                            | `substitutes.ts:374,420,439,459`; pokryte `tests/http/isolation.test.ts:264-277`                                                                             |

**Endpointy auth:**

| Przypadek                                                                    | Zachowanie                                                                                                                                     | Źródło                                          |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| ciało nie-formularz (JSON, albo same-origin bez Content-Type / `text/plain`) | `formData()` rzuca → nieobsłużony wyjątek → 500 (wniosek z domyślnego zachowania Astro, nieuruchomione)                                        | `src/pages/api/auth/signin.ts:5`, `signup.ts:5` |
| brak pola                                                                    | `form.get("email") as string` przekazuje `null` do `signInWithPassword` / `signUp`; komunikat GoTrue przekazany wprost (wniosek)               | `signin.ts:6-7,15-16`; `signup.ts:6-7,15-16`    |
| puste / za długie / same spacje                                              | brak walidacji i trim po stronie serwera; decyduje GoTrue; `confirmPassword` sprawdzany tylko w kliencie                                       | `signin.ts:13`, `signup.ts:13`                  |
| null klient                                                                  | `?error=Baza danych nie jest skonfigurowana.` (strony auth nie są chronione, komunikat widać) — ale tylko gdy `formData()` nie rzuci wcześniej | `signin.ts:9-12`                                |

`/api/auth/signout` nie czyta ciała; przy null kliencie pomija wylogowanie i przekierowuje na `/` (`src/pages/api/auth/signout.ts:5-9`).

**Null klient na endpointach danych.** Każdy endpoint obsługuje `null` (np. `api/ingredients.ts:53-56`), ale cel przekierowania leży pod `/ingredients`, a middleware przy null kliencie ustawia `user = null` i przekierowuje chronione trasy na `/auth/signin` (`src/middleware.ts:7-22`). Komunikat „Baza danych nie jest skonfigurowana.” nie dociera więc do użytkownika (wniosek). Nie 500, więc mieści się w #7; to raczej problem diagnozowalności niż walidacji.

### #7.2 „Formularz HTML waliduje, więc serwer nie musi” — werdykt

- Formularze mają `required`/`maxlength` (`SubstituteCreateForm.astro:84-85,112,134-135,150-151,166`; `SubstituteEditForm.astro:81-82,96-97,112`; `IngredientRenameForm.astro:61-62`), ale serwer **niezależnie** powtarza te same reguły na 6 endpointach danych (tabela wyżej). Twierdzenie nie opisuje kodu endpointów danych.
- Na endpointach auth twierdzenie **jest** faktycznie przyjęte: formularz React (`SignInForm.tsx:18-30`, `noValidate` + walidacja w JS) jest jedyną walidacją, a serwer nie ma żadnej (`signin.ts:5-13`).
- Rozbieżność warstw: HTML `maxlength` liczy jednostki UTF-16, serwer punkty kodowe (`entry-fields.ts:11-14`) — przeglądarka jest ostrzejsza dla emoji; nieszkodliwe.
- Wniosek dla testów: udowodnić serwer **bez formularza** — bezpośredni `fetch` POST (HTTP) i wywołania serwisów; nie przez przeglądarkę i nie przez mock `normalizeName`/limitów.

### #7.3 Normalizacja i duplikaty

- `normalizeName = value.trim().replace(/\s+/g, " ")` (`src/lib/entry-fields.ts:21-23`); `toNameKey = toLocaleLowerCase("pl")` (`:26-28`). Moduł jest bez importów (`:1-3`), więc testowalny w projekcie `unit`.
- Wywołania: endpointy `api/ingredients.ts:69,71`, `rename.ts:56`, `update.ts:81`; serwis ponownie `substitutes.ts:116-117,153,358,408-411`; wyszukiwanie `:72,75` (klucz liczony z `name`, nie z zapisanego `name_key`).
- JS `\s` obejmuje NBSP, U+2000–200A, U+3000; **nie** obejmuje znaków zerowej szerokości (U+200B/200C/200D/2060). Brak NFC. NFC/NFD jest świadomie wyłączone w `context/foundation/test-plan.md:242` (§7); znaki zerowej szerokości nie są tam wymienione (luka w §7 albo w normalizacji — decyzja).
- Ograniczenia w bazie: `ingredients` unique `(user_id, name_key)` (`20261004120000_substitute_database.sql:36`); `ingredient_categories` unique `(ingredient_id, category_id)` (`:60`); `substitutes` unique `(ingredient_category_id, name_key)` na kolumnie generowanej (`20261010115230_unique_substitutes.sql:11-12,26-28`); jeden najlepszy na parę — częściowy indeks (`20261011201658_best_substitute.sql:13-15`).
- Długość sprawdzana po scaleniu spacji, więc `"a" + 200 spacji + "b"` przechodzi jako `"a b"` (zgodne z intencją).

### #7.4 Klucz nazwy zgodny z nazwą

- Ścieżki aplikacji (dodanie, zmiana nazwy) liczą klucz z tej samej znormalizowanej nazwy i zapisują razem (`substitutes.ts:116-122`, `:408-411`) — spójne.
- Bezpośredni INSERT do `ingredients` przez PostgREST: polityka insert sprawdza tylko `user_id` (`20261004120000_substitute_database.sql:46-49`), żadna migracja nie cofa tabelowego INSERT — dowolny `name_key` i nienormalizowana `name` przechodzą (limit 1..100 dotyczy `name`, `name_key` nie ma limitu).
- Bezpośredni UPDATE: `grant update (name, name_key) on public.ingredients to authenticated` + polityka own-rows (`20261021120000_edit_entries.sql:31-38`) pozwala zmienić samo `name` (stary klucz) albo sam `name_key`.
- Skutek (wniosek): późniejsze dodanie „Mąka” nie trafi w konflikt i powstaje drugi, wizualnie identyczny składnik; sortowanie po `name_key` (`substitutes.ts:90`) się rozjeżdża; wyszukiwanie nie, bo liczy klucz z `name`.
- `substitutes.name_key` jest zawsze `lower(name)` (kolumna generowana; zapis 428C9 przypięty w `supabase/tests/edit-entries.sql:69-75`), ale `name` może być nienormalizowana przy bezpośrednim INSERT/UPDATE (`grant update (name, ratio, notes)`, `20261021120000_edit_entries.sql:26`).
- JS `toLocaleLowerCase("pl")` vs Postgres `lower()`: polskie litery zgodne lokalnie (`lower('ŻÓŁĆ')='żółć'`, `context/archive/2026-10-10-unique-substitutes/plan.md:13`; pgTAP `supabase/tests/unique-substitutes.sql:36-40`). Collation produkcji **niesprawdzona** (follow-up `context/archive/2026-10-17-edit-entries/follow-ups/review-fixes.md:6` każe sprawdzić przed migracją). Ma to znaczenie dopiero przy dodaniu `check`/triggera/kolumny generowanej na `ingredients` albo przy backfillu SQL-em — wtedy to migracja zmieniająca dane i podlega bramce z §6.5 (`tests/migrations/expectations.ts`).
- Fixture'y wpisują `ingredients.name_key` ręcznie (`tests/migrations/fixture.sql:22-28`; `supabase/tests/edit-entries.sql:89,95`; `tests/harness/harness.test.ts:28` → `name_key: name`) — zmiana na kolumnę generowaną albo trigger z CHECK-iem ich dotknie.

### #7.5 Istniejące pokrycie testami

| Przypadek           | Pokryte                                                                                                                                                                                                                                                                          | Niepokryte                                                                                                          |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| ciało nie-formularz | —                                                                                                                                                                                                                                                                                | wszystkie endpointy, w tym 500 w auth (brak `application/json`/`text/plain` w `tests/` i `scripts/smoke.mjs`)       |
| puste pole          | tylko smoke: pusta proporcja przy dodaniu i edycji (`scripts/smoke.mjs:279,295,317,541,554`)                                                                                                                                                                                     | same spacje, brak pola, pusty składnik/zamiennik/kategoria, pusta nazwa przy zmianie nazwy, auth                    |
| za długie           | unit tylko dla zapytania wyszukiwania (`tests/unit/search-match.test.ts:171-183`, `tests/unit/list-view.test.ts:63`)                                                                                                                                                             | limity endpointów, `charLength`/`truncate` na punktach kodowych, CHECK-i w pgTAP                                    |
| wielkość liter      | pgTAP zamienniki insert/update (`supabase/tests/unique-substitutes.sql:48-54`, `edit-entries.sql:59-65`); smoke duplikat wielkimi literami (`smoke.mjs:350,369,571,586,625`); `normalizeName`/`toNameKey` pośrednio przez `matchIngredients` (`tests/unit/search-match.test.ts`) | warianty spacji przy dodaniu; ponowne użycie składnika przy wariancie; bezpośredni unit `normalizeName`/`toNameKey` |
| podwójne wysłanie   | smoke podwójne usunięcie (`smoke.mjs:819`); serwis „już usunięte” (`tests/services/delete.test.ts:127`)                                                                                                                                                                          | identyczne ponowne dodanie; współbieżne dodanie                                                                     |
| `name_key`          | kolumna generowana zamienników (`edit-entries.sql:53-57,69-75`)                                                                                                                                                                                                                  | `ingredients.name_key == toNameKey(name)` po dodaniu i zmianie nazwy; bezpośredni zapis przez API                   |
| null klient         | —                                                                                                                                                                                                                                                                                | wszystkie                                                                                                           |
| id                  | cudze/losowe uuid na 5 endpointach POST (`tests/http/isolation.test.ts:264-277`), serwisy, pgTAP RLS                                                                                                                                                                             | nie-uuid na endpointach; nieistniejąca kategoria (osierocony składnik)                                              |

Smoke (`npm run smoke`) wymaga działającego serwera i nie jest w CI.

### #7.6 Najtańsza użyteczna warstwa testu

- **unit** (`tests/unit/`, bez stosu): `normalizeName`, `toNameKey`, `charLength`, `truncate` bezpośrednio, w tym NBSP/tab/nowa linia, polskie litery, emoji (punkty kodowe vs UTF-16). Tanie, nadaje się do post-edit hooka.
- **services** (lokalny Supabase, przez prawdziwy klient z kontem testowym): `addSubstitute` sekwencyjnie 2× i współbieżnie (`Promise.all`) → jeden wiersz, drugi wynik `code: "duplicate"`; warianty „ Mąka ”/„MĄKA”/„mąka pszenna” → jeden składnik; `ingredients.name_key == toNameKey(name)` po dodaniu i `renameIngredient`; nieistniejąca kategoria → brak osieroconego składnika (dziś czerwone, jeśli to wymaganie).
- **http** (`tests/http/`, dev server): macierz złego wejścia na endpointach — JSON / brak Content-Type / pusty urlencoded / brak pól / same spacje / za długie → status 3xx (nie 500), `Location` na stronie źródłowej z `error=`; w tym signin/signup (dziś czerwone: 500). Endpointy importują `astro:env` przez `src/lib/supabase.ts`, więc handlera nie da się tanio wywołać w zwykłym Vitest bez Astro — HTTP to najtańsza warstwa, która ćwiczy prawdziwy handler.
- **pgTAP** (`supabase/tests/`): bezpośredni INSERT/UPDATE jako `authenticated` z niezgodnym `name_key` albo nienormalizowaną nazwą → dziś przechodzi (dokumentuje lukę); po ewentualnej migracji (trigger/CHECK/kolumna generowana) → odrzucone lub przeliczone. CHECK-i długości.

### Bramki: stan CI

- Jeden job `ci` (`.github/workflows/ci.yml:10`); kroki `:16-32`; deploy `if: github.event_name == 'push'` (`:34-39`), bez `needs`, `concurrency`, `permissions`. Każdy krok dodany przed deployem blokuje też deploy; osobne joby testowe wymagałyby `needs:` na deployu.
- Ochrona gałęzi: brak (404 i `[]` z `gh api`; repo publiczne, `allow_auto_merge: false`). Workflow może tylko zakończyć się porażką; **zablokowanie merge'a wymaga rulesetu albo ochrony gałęzi na `main`**, która wymaga PR i wymaga statusu joba po nazwie (dziś `ci`). Bez „require PR” bezpośredni push na `main` omija bramkę. To krok ręczny poza repo; da się go zweryfikować `gh api`.
- Żaden dokument w repo nie wspomina ochrony gałęzi ani wymaganych checków.

### Bramki: co potrzebne, by testy ruszyły w CI

- **Supabase**: klucze tylko z `npx supabase status -o env` (`tests/harness/env.ts:67-71`), bez nadpisania zmienną środowiskową. Usługi potrzebne testom i aplikacji: db, kong, gotrue, postgrest. Kandydat: `npx supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor` (nazwy z `npx supabase start --help` w 2.117.0). `mailpit` można wyłączyć, bo `enable_confirmations = false` (`supabase/config.toml:209`). Że `supabase test db` działa bez `postgres-meta` — niezweryfikowane.
- **Wersja CLI**: `npx supabase` z `npm ci` (2.117.0 z lockfile); atomowość pliku jest przypięta do tej wersji (test-plan §6.5). `supabase/setup-cli@latest` rozjechałby się z pinem.
- **Świeża baza w CI**: odcisk danych deweloperskich (`tests/harness/snapshot.ts:7-8,55-75`) wyklucza konta do sprzątania; pusta baza ma ten sam odcisk przed i po → kontrola działa. Migracje seedują `categories`; `supabase/seed.sql` nie istnieje mimo `[db.seed]` (`config.toml:60`) — wniosek: CLI tylko ostrzega.
- **`.dev.vars`** (gitignored) musi powstać przed `npm run dev`: `API_URL` → `SUPABASE_URL`, klucz anon/publishable → `SUPABASE_KEY`, bez wypisywania do logu. Bez niego `createClient` zwraca `null` (`src/lib/supabase.ts:6-8`) i wszystko kończy się „Baza danych nie jest skonfigurowana.”. Czy workerd czyta `.env` zamiast `.dev.vars` — niezweryfikowane.
- **Dev server** dla `npm run test:http` i smoke: start w tle, polling do 200, zatrzymanie na końcu. Tryb agenta Astro włącza się tylko przez `am-i-vibing` (`node_modules/astro/dist/cli/dev/index.js:86`); w CI nie powinien (wniosek).
- **Kolejność**: projekty po kolei na jednym stosie (sweep i odcisk innego przebiegu kolidują, `tests/harness/sweep.ts:8-17`); `npm test` już rozdziela `migrations` na drugi przebieg (`package.json`, test-plan §6.6 Phase 3). Build i dev współdzielą cache Vite (`node_modules/.vite/deps_ssr`, notatka pamięci „build breaks dev server”) — http i smoke przed `npm run build` albo w osobnym jobie.
- **Limit auth**: `sign_in_sign_ups = 30` / 5 min (`config.toml:190`). Szacunek z kodu: services ok. 9 logowań przez `createTestUser`, http ok. 6 + 7 logowań formularzem, smoke 5 → ok. 27 w jednym jobie; ponowny przebieg w tym samym oknie przekroczy limit (szacunek, nie pomiar). Czy `admin.createUser` liczy się do limitu — niezweryfikowane.
- **Timeouty**: `hookTimeout` 30 s (`vitest.config.ts:18`) < limit `supabase status` 60 s (`tests/harness/env.ts:21-22`, zmierzone do 46 s pod obciążeniem) — pierwszy `harnessEnv()` w `beforeAll` może na wolnym runnerze paść jako timeout hooka. `migrations`: 120 s (`vitest.config.ts:61-62`), przebieg ok. 40 s.
- **Bez stosu**: `npm run lint:db-access` to Node bez zależności (`scripts/db-access.mjs`) — może wejść do CI od razu. `npm run test:unit` też (brak globalSetup, `vitest.config.ts:21-27`); czas nigdzie nie zapisany (wniosek: kilka sekund).
- **Smoke w CI**: częściowo dubluje `tests/http/` (duplikaty wielkością liter, puste pola, cudze id), ale ćwiczy pełny przepływ signup→signin i jest jedynym testem kilku ścieżek z tabeli #7.5; kosztuje ok. 5 żądań auth z limitu i potrzebuje tego samego dev servera co `test:http`. Konta smoke'a sprząta sweep tylko przy zgodnym `SMOKE_EMAIL_DOMAIN` (`tests/harness/accounts.ts:24-28`). Brak smoke'a w CI odnotowany 3× w archiwum (`context/archive/2026-10-22-ingredients-new-ui/follow-ups/review-fixes.md:14`, `2026-10-24-delete-entries-confirmed/plan-brief.md:68`, `…/research.md:91`).
- **Test migracji w CI / pre-push**: wymaga stosu, ok. 40 s. Hook pre-push przez husky nie zadziała: `.husky/pre-commit` istnieje, ale husky jest nieaktywny (brak skryptu `prepare`, brak `core.hooksPath`; `context/archive/2026-10-19-ingredients-list-ui/plan.md:370`, stan potwierdzony dziś).

### Post-edit hook

- Dziś brak hooków: `.claude/settings.json` i `.claude/settings.local.json` mają tylko `permissions`; w git tylko nieaktywny `.husky/pre-commit` (`npx lint-staged`).
- Kształt dla tego repo: `PostToolUse`, matcher `Write|Edit`, skrypt Node (na maszynie brak `jq`), tylko dla `.ts`/`.tsx`, ścieżka z `tool_input.file_path`, uruchamia `npx --no-install vitest related <plik> --run --project unit --passWithNoTests` z `NO_COLOR=1`; porażka → stderr + exit 2; timeout ok. 60 s.
- **`--project unit` obowiązkowe**: bez niego edycja np. `src/lib/services/substitutes.ts` dociąga `tests/services/search.test.ts`, który ładuje globalSetup harnessu i woła `npx supabase status` — do 60 s czekania albo `STACK_DOWN` bez stosu. `--passWithNoTests`, bo większość plików nie ma testu unit. Czy `vitest related --project` faktycznie pomija globalSetup innych projektów — niezweryfikowane.
- Projekt ma skill `/10x-configure-hook`, który generuje taki hook i dowodzi go testem `agent-hooks.test.*` (`.claude/skills/10x-configure-hook/SKILL.md`); plan może go użyć zamiast pisać hook ręcznie.
- Hook nie zastępuje CI: testy `services`/`http`/`migrations`/pgTAP zostają wyłącznie w CI i lokalnie (test-plan §4 `:92`).

## Code References

- `src/pages/api/auth/signin.ts:5-7` — `formData()` bez try/catch, pola `as string`
- `src/pages/api/auth/signup.ts:5-7` — to samo
- `src/pages/api/ingredients.ts:62-98` — wzorzec walidacji serwerowej (catch, normalizacja, limity, `error_field`)
- `src/lib/entry-fields.ts:7-28` — limity, `charLength`, `truncate`, `normalizeName`, `toNameKey`
- `src/lib/services/substitutes.ts:112-166` — `addSubstitute`: upsert składnika przed parą (niatomowe), 23505 → duplikat
- `src/lib/services/substitutes.ts:408-417` — zmiana nazwy: `name` + `name_key` razem
- `src/middleware.ts:4-22` — null klient → user null → przekierowanie chronionych tras
- `supabase/migrations/20261004120000_substitute_database.sql:33,36,46-49,58,90-92` — CHECK długości, unique klucza, polityka insert, FK kategorii
- `supabase/migrations/20261010115230_unique_substitutes.sql:11-12,26-28` — `name_key = lower(name)` + unique
- `supabase/migrations/20261021120000_edit_entries.sql:26,31-38` — granty UPDATE na kolumny
- `node_modules/astro/dist/core/app/origin-check.js:15-21` — 403 dla cross-origin formularzy i braku Content-Type
- `tests/http/client.ts:47` — klient HTTP wysyła `Origin`
- `vitest.config.ts:17-27,61-62` — timeouty, projekt `unit` bez globalSetup
- `tests/harness/env.ts:21-22,67-71` — limit `supabase status`, klucze tylko ze statusu
- `supabase/config.toml:190,209` — limit auth, potwierdzenia e-mail wyłączone
- `.github/workflows/ci.yml:10-39` — jeden job, deploy przy push

## Architecture Insights

- Walidacja jest ręczna, bez zod (decyzja S-01, `context/archive/2026-10-04-first-substitute-lookup/plan-brief.md:26`; reguła `CLAUDE.md`: zod dopiero po `npm i zod`). Limity w aplikacji odbijają CHECK-i w bazie — dwie warstwy, baza jako ostatnia.
- Reguła nazwy (`normalizeName` + klucz) żyje tylko w aplikacji dla `ingredients` i częściowo w bazie dla `substitutes` (sam `lower`). Dopóki RLS i granty pozwalają na bezpośredni zapis z anon key + JWT, „wszystkie zapisy idą przez API” (uzasadnienie akceptacji F4) jest założeniem, nie gwarancją. Lekcja „Klucz nazwy jako kolumna generowana” (`context/foundation/lessons.md`) wskazuje kierunek dla nowych kluczy i nazywa `ingredients.name_key` wyjątkiem.
- Błędy idą jako `?error=` na stronę źródłową; kody serwisu (`ServiceErrorCode = "duplicate" | "not_found"`, `substitutes.ts:26`) zamiast dopasowania tekstu.

## Historical Context (from prior changes)

| Twierdzenie historyczne                                                                    | Źródło                                                                                                                                                                     | Werdykt dziś                                                                                         |
| ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| POST bez formularza daje 500 (S-01 F2)                                                     | `context/archive/2026-10-04-first-substitute-lookup/reviews/impl-review.md:43-51`                                                                                          | **częściowo**: naprawione na 6 endpointach danych; nadal prawdziwe dla `auth/signin` i `auth/signup` |
| Normalizacja spacji tylko w aplikacji (F4), ryzyko zaakceptowane                           | `context/archive/2026-10-10-unique-substitutes/reviews/impl-review.md:62-70`                                                                                               | **potwierdzone**: kolumna nadal `lower(name)`                                                        |
| Podwójne wysłanie pokazuje błąd po udanym zapisie (F5), SKIPPED                            | tamże `:72-80`                                                                                                                                                             | **potwierdzone** (wniosek z kodu; bez duplikatu w bazie)                                             |
| Grant pozwala zapisać niezgodny `name_key` (S-04 F3), follow-up trigger/kolumna generowana | `context/archive/2026-10-17-edit-entries/reviews/impl-review.md:48-65`; `follow-ups/review-fixes.md:6`                                                                     | **potwierdzone, otwarte**: brak migracji; także INSERT pozwala                                       |
| `lower('ŻÓŁĆ')='żółć'` lokalnie                                                            | `context/archive/2026-10-10-unique-substitutes/plan.md:13`                                                                                                                 | **wspierane** lokalnie; produkcja niesprawdzona (`…/reviews/plan-review.md:51`)                      |
| husky nieaktywny                                                                           | `context/archive/2026-10-19-ingredients-list-ui/plan.md:370`                                                                                                               | **potwierdzone**                                                                                     |
| CI i hooki odłożone do fazy 4                                                              | `context/archive/2026-11-04-testing-isolation-and-delete/plan.md:39`; `2026-11-09-testing-search-and-best/plan.md:72,111`; `2026-11-15-testing-safe-migrations/plan.md:31` | **potwierdzone**: CI bez testów                                                                      |
| Projekt `unit` bez globalSetup „także jako przyszły post-edit hook”                        | `context/archive/2026-11-09-testing-search-and-best/plan.md:111`                                                                                                           | **wspierane** (`vitest.config.ts:21-27`)                                                             |

PRD (`context/foundation/prd.md`, FR-001–FR-007) nie definiuje limitów długości, dozwolonych znaków ani tekstów błędów; reguły pochodzą z planów i kodu.

## Related Research

- `context/archive/2026-11-15-testing-safe-migrations/research.md` — bramka migracji, otwarty follow-up `name_key` (`:137`)
- `context/archive/2026-11-09-testing-search-and-best/research.md` — projekt `unit` jako baza post-edit hooka (`:252`)
- `context/archive/2026-10-17-edit-entries/research.md` — walidacja ręczna, limity = CHECK-i (`:103`)

## Open Questions

Decyzje dla `/10x-plan` (nie fakty do dalszego szukania):

1. **Zakres napraw #7 w tej fazie.** Faza testowa może tylko przypiąć zachowanie, albo też naprawić luki. Kandydaci: (a) try/catch + walidacja pól w `auth/signin` i `auth/signup` — mała zmiana kodu; (b) wymuszenie `ingredients.name_key` w bazie (trigger `name_key := lower(normalize(name))` albo kolumna generowana) — migracja zmieniająca dane, wymaga sprawdzenia `lower()` vs `toLocaleLowerCase("pl")` i deklaracji w `tests/migrations/expectations.ts`; (c) normalizacja spacji w bazie dla `substitutes`/`ingredients` (CHECK `name = regexp_replace(btrim(name), '\s+', ' ', 'g')` albo klucz z btrim) — cofnięcie akceptacji F4; (d) osierocony składnik przy nieistniejącej kategorii — walidacja kategorii przed upsertem albo RPC; (e) podwójne wysłanie — zostawić (brak duplikatu) czy blokować przycisk.
2. **Znaki zerowej szerokości** — dopisać do §7 jako świadome wyłączenie czy normalizować.
3. **Struktura CI**: jeden job (testy jako kroki przed deployem) czy kilka jobów z `needs:`; które kroki są „required checks” w rulesecie.
4. **Smoke w CI**: tak/nie — koszt w limicie auth i czasie vs pokrycie ścieżek, których `tests/http/` nie ma.
5. **Test migracji**: w CI na każdym PR czy tylko lokalnie przed `db push` (husky nieaktywny, więc pre-push wymagałby włączenia husky).
6. **Limit auth w CI**: podnieść `sign_in_sign_ups` (dla wszystkich, w `config.toml`) czy podmienić tylko w CI, czy rozłożyć przebiegi.
7. **Ruleset/ochrona `main`** — ręczny krok właściciela repo; plan powinien go wymienić i zweryfikować `gh api`.

Niezweryfikowane fakty (do sprawdzenia przy implementacji, nie blokują planu): kod odpowiedzi auth przy JSON pod workerd; odpowiedź GoTrue na `email: null`; `supabase test db` bez `postgres-meta`; czy workerd czyta `.env`; czy `admin.createUser` liczy się do limitu; czy `vitest related --project unit` pomija globalSetup innych projektów; collation produkcji.
