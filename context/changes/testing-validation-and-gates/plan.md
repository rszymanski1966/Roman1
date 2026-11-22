# Faza 4 rolloutu testów — walidacja i bramki: plan implementacji

## Overview

Faza 4 z `context/foundation/test-plan.md` („Walidacja i bramki”). Dwa cele:

1. **Ryzyko #7** — złe wejście (POST bez formularza, puste / same spacje / za długie pola, wielkość liter i spacje, podwójne wysłanie, nieznana kategoria) daje czytelny `?error=` na stronie źródłowej, nie 500; warianty wielkości liter i spacji nie tworzą duplikatu; klucz nazwy zawsze zgodny z nazwą — także przy zapisie z pominięciem aplikacji. Każda luka najpierw dostaje czerwony test, potem poprawkę.
2. **Bramki** — unit, integracja (services + http + migracje), pgTAP, `lint:db-access` i smoke biegną w CI i faktycznie blokują merge i deploy; lokalnie agent dostaje hooki z szybkimi testami unit bez stosu.

## Current State Analysis

Pełne ustalenia: `context/changes/testing-validation-and-gates/research.md`. Najważniejsze:

- 6 endpointów danych już waliduje po stronie serwera (catch `formData()`, `normalizeName`, limity, `error_field`), np. `src/pages/api/ingredients.ts:62-98`. Nic tego nie przypina w Vitest ani w CI — jedyne pokrycie to ręczny `npm run smoke`.
- `src/pages/api/auth/signin.ts:5` i `signup.ts:5`: `formData()` bez try/catch → 500 na ciele nie-formularzu; pola `as string` (`:6-7`) bez trim i sprawdzenia; `confirmPassword` sprawdza tylko klient (`src/components/auth/SignUpForm.tsx:42-45`).
- `ingredients.name_key` liczy aplikacja (`src/lib/entry-fields.ts:26-28`); baza nie wiąże go z `name` (tabelowy INSERT, `grant update (name, name_key)` w `supabase/migrations/20261021120000_edit_entries.sql:32`). `substitutes.name_key = lower(name)` (`20261010115230_unique_substitutes.sql:11-12`), ale `name` nie musi być znormalizowana przy zapisie z pominięciem API.
- `addSubstitute` zapisuje składnik przed sprawdzeniem kategorii (`src/lib/services/substitutes.ts:120-140`) → nieistniejąca kategoria zostawia osierocony składnik.
- Podwójne wysłanie nie tworzy drugiego wiersza (23505 → komunikat o duplikacie, `substitutes.ts:164-166`), ale nie ma testu.
- CI: jeden job `ci` (`.github/workflows/ci.yml:10-39`) — lint, lint:ui, build, deploy przy push; żadnych testów; `main` bez ochrony gałęzi i rulesetów.
- Brak hooków agenta (`.claude/settings.json` ma tylko `permissions`).

## Desired End State

- `tests/unit/entry-fields.test.ts` i `tests/unit/auth-fields.test.ts` przypinają reguły nazwy, długości i odczytu formularza logowania.
- `tests/http/validation.test.ts` wysyła złe wejście bezpośrednio (bez formularza) na 8 endpointów POST i dowodzi: 3xx na stronę źródłową z `error=`, nigdy 500, wiersze konta bez zmian.
- `tests/services/names.test.ts` dowodzi: warianty wielkości liter/spacji → jeden składnik i jeden zamiennik; podwójne (sekwencyjne i równoległe) dodanie → jeden wiersz i kod `duplicate`; `name_key == toNameKey(name)` po dodaniu i zmianie nazwy; nieznana kategoria → czytelny błąd i brak osieroconego składnika.
- `supabase/tests/name-invariants.sql` dowodzi, że bezpośredni zapis jako `authenticated` z niezgodnym `name_key` albo nienormalizowaną nazwą jest odrzucany (23514) przez nowe CHECK-i z migracji.
- CI: joby `checks` i `integration`, `deploy` z `needs` na oba; ruleset na `main` wymaga PR i obu checków (z obejściem dla admina).
- Hooki Claude Code: per-edit (`vitest related … --project unit`) i end-of-turn (`npm run test:unit`), udowodnione przez `/10x-configure-hook`.
- `test-plan.md` §4–§7, `CLAUDE.md` i README opisują nowy stan bramek.

Weryfikacja końcowa: PR z tej zmiany ma zielone `checks` i `integration`; celowo zepsuty commit na gałęzi próbnej daje czerwony check i zablokowany przycisk merge (dla nie-admina; admin widzi obejście).

### Key Discoveries:

- Astro `checkOrigin` (domyślnie włączony) odrzuca 403 POST z formularzowym Content-Type albo bez Content-Type, gdy `Origin` się nie zgadza (`node_modules/astro/dist/core/app/origin-check.js:15-21`); test „ciała nie-formularza” musi wysłać `Origin` serwera, inaczej sprawdzi Astro, a nie handler.
- `HttpSession` ma tylko `postForm` (`tests/http/client.ts:36-38`); potrzebna metoda z dowolnym ciałem i Content-Type, z tymi samymi ciasteczkami i `Origin`.
- `categories` są czytelne dla `authenticated` (`20261004120000_substitute_database.sql:17-20`) — serwis może sprawdzić kategorię przed upsertem składnika.
- Wszystkie istniejące wiersze testowe spełniają `name_key = lower(name)` i normalizację: 5 plików pgTAP (wstawki składników), `tests/migrations/fixture.sql:22-28`, `tests/harness/harness.test.ts:28` (`harness-<runId>`, małe litery). Migracja z CHECK-ami nie wymaga deklaracji w `tests/migrations/expectations.ts`.
- Smoke rejestruje bez `confirmPassword` (`scripts/smoke.mjs:158,640`) — po serwerowym sprawdzeniu hasła musi go wysyłać.
- `--project unit` w hooku jest obowiązkowe: bez niego `vitest related` dociąga `tests/services/*` z globalSetup harnessu, które wołają `npx supabase status`.
- Limit auth `sign_in_sign_ups = 30` / 5 min (`supabase/config.toml:190`); jeden pełny przebieg CI zużywa ok. 27.

## What We're NOT Doing

- Blokowanie przycisku po pierwszym kliknięciu (podwójne wysłanie): wymaganiem jest brak duplikatu w bazie, nie UX drugiego żądania (unique-substitutes F5 zostaje SKIPPED).
- Konwersja `ingredients.name_key` na kolumnę generowaną — wybrane CHECK-i; aplikacja nadal liczy klucz (wyjątek S-01 z `lessons.md`).
- Normalizacja NFC i usuwanie znaków zerowej szerokości — §7 (NFC już jest; zero-width dopisujemy w fazie 1 jako świadome wyłączenie).
- Limity długości e-maila i hasła w aplikacji — decyduje GoTrue; test dowodzi tylko „czytelny `?error=`, nie 500”.
- Osobny komunikat dla 23514 (naruszenie CHECK) — aplikacja zawsze zapisuje dane spełniające CHECK; rozjazd JS `toLocaleLowerCase("pl")` vs Postgres `lower()` dla egzotycznych znaków (np. `İ`) kończy się ogólnym `?error=`, nie 500.
- Komunikat „Baza danych nie jest skonfigurowana.” ginący na chronionych trasach (middleware przekierowuje na logowanie) — diagnozowalność, nie 500.
- zod — walidacja zostaje ręczna (decyzja S-01).
- Hook pre-push / aktywacja husky, `supabase/setup-cli`, podbicie akcji z Node 20 (osobna notatka), ręczna bramka deployu.
- Zmiana `sign_in_sign_ups` w zacommitowanym `config.toml` — tylko podmiana na runnerze CI.

## Implementation Approach

Kolejność „od najtańszej warstwy”: najpierw unit (bez stosu; to też to, co później uruchamia hook), potem HTTP (prawdziwe handlery bez formularza), serwis (prawdziwa baza, przeploty), baza (CHECK-i), na końcu CI, ruleset i hooki, gdy suita jest kompletna. W fazach 2–4 każda luka: czerwony test → poprawka → zielony; poprawka nie zmienia asercji. Wyrocznie zgodnie z §6.1–§6.4 test-planu: literały ze źródłem, obserwacja kluczem admina, nigdy wynik testowanego kodu ani mock walidacji.

## Critical Implementation Details

- **Origin w testach HTTP**: każde żądanie „bez formularza” musi nieść `Origin: BASE_URL` (jak `HttpSession`), a przypadek z innym `Origin` nie należy do tej macierzy (to 403 Astro, nie handler).
- **CHECK normalizacji**: `btrim(name)` przycina tylko spacje, nie tabulatory ani nowe linie — przycinanie przez regex (snippet w fazie 4).
- **Kolejność w CI**: dev server (`test:http`, smoke) i `npm run build` współdzielą cache Vite; w jobie `integration` nie ma builda, a build jest w `checks` i `deploy` (osobne runnery).
- **Push migracji**: migracja z fazy 4 trafia na produkcję ręcznie wg README „Database migrations”, po sprawdzeniu zapytaniem naruszeń na produkcji; kod tej zmiany od niej nie zależy, więc deploy kodu może ją poprzedzić.

## Faza 1: Reguły nazwy w testach unit

### Overview

Przypiąć czyste reguły z `src/lib/entry-fields.ts` testem unit (bez stosu) i dopisać do §7 świadome wyłączenie znaków zerowej szerokości.

### Changes Required:

#### 1. Test reguł nazwy i długości

**File**: `tests/unit/entry-fields.test.ts` (nowy)

**Intent**: Bezpośrednie tabele przykładów dla `normalizeName`, `toNameKey`, `charLength`, `truncate` — dziś testowane tylko pośrednio przez wyszukiwanie. Nagłówek pliku nazywa ryzyko #7 i źródła wyroczni.

**Contract**: `it.each` z literałami i komentarzem źródła (S-01 plan-brief, unique-substitutes plan `:33,:37`, „istniejący kontrakt `src/lib/entry-fields.ts`”). Wiersze co najmniej: spacje na brzegach, wielokrotne spacje, tabulator, nowa linia, NBSP, same spacje → `""`; `toNameKey` dla „ŻÓŁTY Ser”, „MĄKA”; `charLength` dla „ą”, emoji (1 punkt kodowy, 2 jednostki UTF-16), limit 100/101; `truncate` nie tnie pary zastępczej. Wiersz `normalizeName("Mą​ka")` zostawia znak zerowej szerokości, z komentarzem `PINNED CURRENT BEHAVIOUR, NOT A REQUIREMENT` i odnośnikiem do §7.

#### 2. Wyłączenie w §7

**File**: `context/foundation/test-plan.md` (§7)

**Intent**: Dopisać pozycję „Znaki zerowej szerokości w nazwach” obok NFC: wygląda jak ta sama nazwa, ale to inny klucz; re-evaluate przy imporcie/wklejaniu z innych systemów.

**Contract**: Nowy punkt §7 w formacie istniejących (opis, „Re-evaluate if…”, „Source: §3 Phase 4, plan testing-validation-and-gates”).

### Success Criteria:

#### Automated Verification:

- `npm run test:unit` przechodzi z nowym plikiem
- Celowe zepsucie `normalizeName` (np. bez scalania spacji) daje czerwony `npm run test:unit`, po cofnięciu zielony
- `npm run lint` przechodzi

#### Manual Verification:

- Wpis §7 o znakach zerowej szerokości jest w test-planie i wskazuje wiersz PINNED w teście

**Implementation Note**: po automatycznej weryfikacji poczekaj na potwierdzenie ręcznych kroków przed kolejną fazą.

---

## Faza 2: Złe wejście przez HTTP + poprawka auth

### Overview

Macierz złego wejścia wysyłanego bezpośrednio na 8 endpointów POST (6 danych + signin + signup). Dla auth czerwona; poprawka: bezpieczny odczyt formularza i walidacja pól po stronie serwera.

### Changes Required:

#### 1. Surowe żądanie w kliencie HTTP

**File**: `tests/http/client.ts`

**Intent**: Pozwolić wysłać POST z dowolnym ciałem i Content-Type (albo bez niego) z ciasteczkami sesji i `Origin`, żeby ominąć formularz.

**Contract**: `HttpSession.postRaw(path, { body?: string, contentType?: string })` → `HttpResponse`; ta sama obsługa ciasteczek i `redirect: "manual"` co `postForm`.

#### 2. Macierz walidacji

**File**: `tests/http/validation.test.ts` (nowy)

**Intent**: Dowieść, że serwer sam odrzuca złe wejście czytelnym błędem, niezależnie od formularza HTML.

**Contract**: Jedno konto tymczasowe (`createTestUser`) i jedna sesja `signIn` w `beforeAll`; fixture `addSubstitute` jako to konto (id do pól). `it.each` po wierszach `{ name, path, session: "user" | "anon", body/fields, expectedPage }`:

- ciało nie-formularz dla każdego z 8 endpointów: JSON (`application/json`), brak Content-Type z pustym ciałem, `text/plain`;
- pola: brak wszystkich, same spacje, za długie (101 znaków nazwy, 501 uwag) dla `/api/ingredients`, `/api/ingredients/rename`, `/api/substitutes/update`;
- auth: brak e-maila, e-mail ze spacji, puste hasło (signin i signup), signup z różnym `confirmPassword`, signup z nadmiernie długim e-mailem (odpowiedź GoTrue).

Oczekiwanie (literały w wierszach): status 3xx, `location` zaczyna się od strony źródłowej wiersza (strona z formularzem, który tam wysyła; gdy brak pól widoku — dokumentowany fallback endpointu, np. `/ingredients`), parametr `error` niepusty; status nigdy ≥ 500; dla endpointów danych wiersze konta (odczyt `adminClient()`) identyczne przed i po. Przypadki auth, które kończą się na walidacji aplikacji, nie dochodzą do GoTrue (oszczędność limitu); po poprawce plik wykonuje najwyżej 3 żądania docierające do GoTrue poza `signIn`. Każdy e-mail w wierszach auth jest budowany z `runId` we wzorcu sweepa `vitest-<runId>-<label>@example.test` (etykiety `[a-z0-9]+`, `tests/harness/accounts.ts:18`; długi e-mail = `vitest-<runId>-<"a"×N>@example.test`): czerwony przebieg sprzed poprawki (2.1) tworzy prawdziwe konta (różne hasła, długi e-mail) i dociera do GoTrue z pustymi polami — te konta usuwa sweep w teardownie, a budżet 3 żądań wtedy nie obowiązuje.

#### 3. Odczyt formularza logowania

**File**: `src/lib/auth-fields.ts` (nowy), `tests/unit/auth-fields.test.ts` (nowy)

**Intent**: Czysta funkcja odczytu i walidacji pól auth, testowalna w `unit` i wspólna dla obu endpointów.

**Contract**: `readCredentials(form: FormData, options: { confirm: boolean })` → `{ email, password } | { error: string }`. E-mail przycięty; puste e-mail/hasło → komunikat; hasło nieprzycinane; przy `confirm` różne hasła → komunikat. Teksty komunikatów zgodne z `SignUpForm.tsx` / `SignInForm.tsx` tam, gdzie klient je ma („Hasła nie są takie same”). Moduł bez importów Astro (testowalny w `unit`).

#### 4. Endpointy auth

**File**: `src/pages/api/auth/signin.ts`, `src/pages/api/auth/signup.ts`

**Intent**: Ciało nie-formularz → `?error=Nieprawidłowe dane formularza.` na `/auth/signin` albo `/auth/signup`; błąd `readCredentials` → `?error=<komunikat>`; dopiero poprawne pola idą do GoTrue.

**Contract**: try/catch wokół `formData()` w stylu `api/ingredients.ts:62-68`, ale catch nie jest pusty (CLAUDE.md „Never hide the evidence”): `console.warn` z błędem jako `cause` i samym Content-Type żądania — nigdy ciała (zawiera hasło) — potem przekierowanie jak wyżej; sprawdzenie null klienta zostaje; przekierowania jak dziś (`encodeURIComponent`).

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Rejestracja wysyła `confirmPassword` (dziś `:158`, `:640`), żeby przejść nowe sprawdzenie serwera.

**Contract**: pole `confirmPassword` równe `password` w obu żądaniach signup.

### Success Criteria:

#### Automated Verification:

- Przed poprawką `npm run test:http` jest czerwony na wierszach signin/signup z ciałem nie-formularzem (500)
- Po poprawce `npm run test:unit` i `npm run test:http` przechodzą (stos + `npm run dev`)
- `BASE_URL=http://localhost:4321 npm run smoke` przechodzi
- `npm run lint`, `npm run lint:db-access` przechodzą

#### Manual Verification:

- `/auth/signup` z różnymi hasłami przy wyłączonym JS w przeglądarce pokazuje komunikat serwera zamiast tworzyć konto

**Implementation Note**: po automatycznej weryfikacji poczekaj na potwierdzenie ręcznych kroków przed kolejną fazą.

---

## Faza 3: Duplikaty i osierocone wiersze w serwisie

### Overview

Na prawdziwej bazie przez serwisy: warianty nazw, podwójne dodanie, zgodność klucza nazwy. Nieznana kategoria czerwona; poprawka w `addSubstitute`.

### Changes Required:

#### 1. Testy serwisu

**File**: `tests/services/names.test.ts` (nowy)

**Intent**: Dowieść reguł duplikatów i klucza nazwy tam, gdzie żyją (serwis + ograniczenia bazy).

**Contract**: Jedno konto w `beforeAll`; świeży fixture w każdym `it`; obserwacja `adminClient()` (pomocniki z `tests/harness/fixtures.ts`). Przypadki:

- „ Mąka pszenna ” potem „MĄKA PSZENNA” (inne zamienniki, ta sama kategoria) → jeden wiersz `ingredients` z `name` „Mąka pszenna” i `name_key` „mąka pszenna” (literały);
- to samo dodanie dwa razy sekwencyjnie → drugi wynik `code: "duplicate"`, w parze jeden zamiennik;
- to samo dodanie dwa razy równolegle (`Promise.all`) → dokładnie jeden sukces i jeden `code: "duplicate"`, jeden wiersz; plik 5× z rzędu bez flaków;
- zamiennik „Olej kokosowy” obok „olej kokosowy” → `duplicate`;
- `renameIngredient` na „ Masło klarowane ” → `name` „Masło klarowane”, `name_key` „masło klarowane”;
- nieznana kategoria (losowe uuid) → `code: "invalid_category"`, liczności `ingredients`/`ingredient_categories` konta bez zmian.

#### 2. Sprawdzenie kategorii

**File**: `src/lib/services/substitutes.ts`

**Intent**: Sprawdzić istnienie kategorii przed upsertem składnika, żeby błąd nie zostawiał osieroconego wiersza.

**Contract**: `ServiceErrorCode` rozszerzony o `"invalid_category"`; `addSubstitute` czyta `categories` po `id` (`maybeSingle`) przed upsertem; brak → `fail("Wybrana kategoria jest nieprawidłowa.", "invalid_category")`.

#### 3. Endpoint dodawania

**File**: `src/pages/api/ingredients.ts`, `tests/http/validation.test.ts`

**Intent**: Kod `invalid_category` wskazuje pole kategorii.

**Contract**: `errorField` = `"category_id"` dla `invalid_category` (obok `duplicate` → `"substitute"`, `:111`); nowy wiersz macierzy HTTP: nieistniejące uuid kategorii → `/ingredients/new?error=…&error_field=category_id`.

### Success Criteria:

#### Automated Verification:

- Przed poprawką `npx vitest run --project services tests/services/names.test.ts` jest czerwony tylko na przypadku nieznanej kategorii
- Po poprawce `npm test` przechodzi
- `npx vitest run --project services tests/services/names.test.ts` 5× z rzędu zielony
- `npm run test:http` przechodzi z nowym wierszem
- `npm run lint` przechodzi

#### Manual Verification:

- Formularz dodawania z podmienionym w devtools `category_id` pokazuje błąd przy polu kategorii, a lista składników nie ma nowego wpisu

**Implementation Note**: po automatycznej weryfikacji poczekaj na potwierdzenie ręcznych kroków przed kolejną fazą.

---

## Faza 4: Niezmienniki nazw w bazie

### Overview

pgTAP pokazuje, że bezpośredni zapis przez PostgREST (rola `authenticated`) może dziś rozjechać klucz z nazwą i zapisać nienormalizowaną nazwę; migracja z CHECK-ami to zamyka.

### Changes Required:

#### 1. Test pgTAP

**File**: `supabase/tests/name-invariants.sql` (nowy)

**Intent**: Dowieść odrzucenia niezgodnych zapisów na poziomie bazy, niezależnie od aplikacji.

**Contract**: Szkielet z §6.3 (begin, plan, rollback); konto z nieużywanym sufiksem (`…0000ca`); jako `authenticated`:

- `throws_ok(…, '23514')`: INSERT składnika z `name_key` ≠ `lower(name)`; INSERT „ Mąka ”, „Mąka pszenna”, „Mąka\tpszenna”, „Mąka pszenna” z NBSP (U+00A0) zamiast spacji, z `name_key = lower(name)`, żeby padała tylko normalizacja; UPDATE samego `name` (stary klucz); INSERT i UPDATE zamiennika z „ Olej” / „Olej kokosowy”;
- `lives_ok`: zgodne „Mąka pszenna”/„mąka pszenna” i „ŻÓŁTY Ser”/„żółty ser” (zgodność `lower()` z `toLocaleLowerCase("pl")` dla polskich liter).

#### 2. Migracja

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_name_invariants.sql` (nowy)

**Intent**: CHECK-i: `ingredients.name_key = lower(name)`; nazwa znormalizowana (bez białych znaków na brzegach, pojedyncze spacje) w `ingredients` i `substitutes`. Tylko schemat, bez zmiany danych.

**Contract**: trzy nazwane ograniczenia (`ingredients_name_key_matches_name`, `ingredients_name_normalized`, `substitutes_name_normalized`). Normalizacja w Postgresie przez regex, nie `btrim` (ten przycina tylko spacje):

```sql
check (name = regexp_replace(regexp_replace(name, '^[\s   ﻿]+|[\s   ﻿]+$', '', 'g'), '[\s   ﻿]+', ' ', 'g'))
```

Klasa jest szersza niż samo `\s`: Postgres `\s` (klasa `space` z libc) nie obejmuje twardych spacji (U+00A0, U+2007, U+202F) ani U+FEFF, które JS `\s` w `normalizeName` przycina i scala. Zbiór Postgresa pozostaje podzbiorem JS, więc dane zapisane przez aplikację zawsze spełniają CHECK.

#### 3. Zapytanie kontrolne przed pushem

**File**: — (sekcja „Migration Notes” tego planu; zapytanie jednorazowe dla tej migracji, README bez zmian)

**Intent**: Najpierw lokalnie (Studio, przed `npx supabase migration up` w 4.2 — `test:migrations` sprawdza tylko syntetyczny `fixture.sql`, więc lokalne dane deweloperskie to pierwsze prawdziwe dane pod CHECK-ami), potem przed `db push` na produkcji: liczba naruszeń i `lc_ctype`; > 0 → stop i decyzja (migracja i tak padłaby atomowo).

**Contract**: zapytanie w „Migration Notes” niżej.

### Success Criteria:

#### Automated Verification:

- Przed migracją `npx supabase test db` jest czerwony na asercjach `throws_ok` z `name-invariants.sql`
- `npx supabase migration up` nakłada migrację lokalnie bez błędu
- Po migracji `npx supabase test db` przechodzi (wszystkie pliki)
- `npm run test:migrations` przechodzi, a log „migracje pod testem” wymienia nową migrację (bez deklaracji w `expectations.ts`)
- `npm test` i `npm run test:http` przechodzą (aplikacja zapisuje dane spełniające CHECK-i)
- `npm run lint:db-access` przechodzi

#### Manual Verification:

- Dodanie, edycja i zmiana nazwy w UI na lokalnej bazie po migracji działają jak przedtem

**Implementation Note**: po automatycznej weryfikacji poczekaj na potwierdzenie ręcznych kroków przed kolejną fazą. Push na produkcję — po merge'u, wg README i Migration Notes.

---

## Faza 5: Bramki w CI i ruleset

### Overview

Workflow z dwoma jobami testowymi i deployem zależnym od obu; ruleset na `main`, który wymaga PR i obu checków.

### Changes Required:

#### 1. Workflow

**File**: `.github/workflows/ci.yml`

**Intent**: Testy blokują deploy i dają statusy, które ruleset może wymagać.

**Contract**:

- `permissions: contents: read`; `concurrency` per ref z anulowaniem dla PR.
- job `checks`: checkout, setup-node 22 (cache npm), `npm ci`, `npx astro sync`, `npm run lint`, `npm run lint:ui`, `npm run lint:db-access`, `npm run test:unit`, `npm run build` (sekrety jak dziś).
- job `integration`: checkout, setup-node, `npm ci`; podmiana `sign_in_sign_ups = 30` → `300` w `supabase/config.toml` na runnerze (krok z komentarzem „CI only”, sprawdzający, że podmiana się udała); `npx supabase start -x realtime,storage-api,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor`; `.dev.vars` z `npx supabase status -o env` (`SUPABASE_URL` z `API_URL`, `SUPABASE_KEY` z klucza anon/publishable), wartości maskowane `::add-mask::`, nic nie wypisane; `npm test`; `npx supabase test db`; `npm run dev` w tle z logiem do pliku, polling do odpowiedzi 200 (limit czasu, kilka sekund zapasu po pierwszej 200); `npm run test:http`; `BASE_URL=http://localhost:4321 npm run smoke`; na porażkę upload logu dev servera jako artefakt. Bez `npm run build` w tym jobie. CLI z `npm ci` (2.117.0), nie `supabase/setup-cli`.
- job `deploy`: `needs: [checks, integration]`, `if: github.event_name == 'push'`; `npm ci`, `npx astro sync`, `npm run build`, `cloudflare/wrangler-action@v3` jak dziś.

#### 2. Timeout hooków Vitest

**File**: `vitest.config.ts`

**Intent**: Pierwszy `harnessEnv()` w `beforeAll` na wolnym runnerze nie może paść jako timeout hooka przed limitem `supabase status` (60 s, `tests/harness/env.ts:22`).

**Contract**: `hookTimeout: 90_000` w projektach `services` i `http` (root i `unit` bez zmian).

#### 3. Ruleset na `main`

**File**: — (konfiguracja GitHuba przez `gh api`; krok wychodzący na zewnątrz — wykonać dopiero po zgodzie użytkownika w trakcie implementacji)

**Intent**: Czerwony check blokuje merge.

**Contract**: `POST repos/rszymanski1966/Roman1/rulesets`: `target: branch`, `include: ["~DEFAULT_BRANCH"]`, `enforcement: active`, reguły `pull_request` (0 wymaganych zatwierdzeń) i `required_status_checks` z kontekstami `checks` i `integration`; `bypass_actors`: rola repozytorium Admin. Utworzyć po pierwszym przebiegu workflow na PR (konteksty istnieją). Weryfikacja: `gh api repos/rszymanski1966/Roman1/rulesets` i `…/rules/branches/main`.

### Success Criteria:

#### Automated Verification:

- `npm run lint` przechodzi (workflow nie jest lintowany — poprawność YAML sprawdza pierwszy przebieg)
- PR z tą zmianą: joby `checks` i `integration` zielone w GitHub Actions
- Gałąź próbna z celowo zepsutą asercją w `tests/services/` i otwartym na niej draft PR do `main` (sam push gałęzi nie uruchamia workflow) daje czerwony `integration` i zielony `checks`; PR zamknięty, gałąź usunięta po próbie
- `gh api repos/rszymanski1966/Roman1/rules/branches/main` zwraca reguły `pull_request` i `required_status_checks` z `checks` i `integration`

#### Manual Verification:

- Na PR z czerwonym checkiem GitHub pokazuje merge jako zablokowany (z opcją obejścia dla admina)
- Push na `main` po merge'u uruchamia `deploy` dopiero po zielonych `checks` i `integration`
- Log `integration` nie zawiera kluczy Supabase ani `DB_URL` w jawnej postaci

**Implementation Note**: po automatycznej weryfikacji poczekaj na potwierdzenie ręcznych kroków przed kolejną fazą.

---

## Faza 6: Hooki agenta i dokumentacja

### Overview

Hooki Claude Code z szybkimi testami unit (bez stosu) oraz aktualizacja dokumentów o bramkach.

### Changes Required:

#### 1. Hooki

**File**: `.claude/settings.json`, skrypty hooków i test dowodowy wg `/10x-configure-hook`

**Intent**: Per-edit: sygnał o testach unit związanych z edytowanym plikiem; end-of-turn: cały projekt `unit` przed oddaniem tury. Hooki nie zastępują CI.

**Contract**: uruchomić `/10x-configure-hook` z wymaganiami: `PostToolUse` na `Write|Edit`, skrypt Node (brak `jq`), tylko `.ts`/`.tsx`, ścieżka z `tool_input.file_path`, polecenie `npx --no-install vitest related <plik> --run --project unit --passWithNoTests` z `NO_COLOR=1`, porażka → stderr + exit 2, timeout ok. 60 s; `Stop` uruchamia `npm run test:unit` **bez blokowania** (zawsze exit 0; przy porażce komunikat dla użytkownika, np. `systemMessage`, nie `decision: block`), żeby celowo czerwony test (krok red w TDD, faza czekająca na potwierdzenie) nie zmuszał agenta do dalszej pracy; sygnałem dla agenta zostaje hook per-edit. Test dowodowy hooków nie może wymagać stosu.

#### 2. Test-plan

**File**: `context/foundation/test-plan.md`

**Intent**: Stan bramek i wzorce po fazie 4.

**Contract**: §4 — wiersze pgTAP, migracji, smoke, post-edit hook: „w CI (§3 Phase 4)” zamiast „nie w CI”; §5 — unit+integracja, lint:db-access, pgTAP, test migracji, smoke: „required (wired, CI: job `integration`/`checks`)”, post-edit hook: „wired (local)”; §6.4 „Walidacja” — wzorzec z `tests/http/validation.test.ts` (wiersz macierzy, `postRaw`, `Origin`); §6.6 — 2–3 linie o fazie 4; §3 — status fazy 4 aktualizuje `/10x-test-plan`.

#### 3. CLAUDE.md i README

**File**: `CLAUDE.md` (Commands), `README.md` (CI)

**Intent**: Usunąć „CI runs none of the tests above yet”; opisać joby `checks`/`integration`/`deploy`, ruleset i podmianę limitu auth tylko w CI.

**Contract**: sekcje „Commands” w `CLAUDE.md` i „CI” w README.

### Success Criteria:

#### Automated Verification:

- Test dowodowy hooków z `/10x-configure-hook` przechodzi i każdy skrypt hooka oblewa się na celowo zepsutym pliku
- `npm run test:unit` przechodzi
- `npx prettier --check context/foundation/test-plan.md CLAUDE.md README.md` przechodzi
- Joby CI zielone na PR z dokumentacją

#### Manual Verification:

- Edycja `src/lib/entry-fields.ts` z celowym błędem w sesji Claude Code pokazuje porażkę hooka per-edit bez uruchomionego stosu Supabase
- Opis bramek w test-planie, CLAUDE.md i README jest spójny z workflow

**Implementation Note**: po automatycznej weryfikacji poczekaj na potwierdzenie ręcznych kroków.

---

## Testing Strategy

### Unit Tests:

- `normalizeName`, `toNameKey`, `charLength`, `truncate` (tabele literałów, polskie znaki, emoji, PINNED zero-width).
- `readCredentials` (brak pól, spacje, różne hasła, `File` zamiast stringa).

### Integration Tests:

- HTTP: macierz złego wejścia na 8 endpointach POST bez formularza (status, strona źródłowa, `error`, brak zmian w danych).
- Serwisy: warianty nazw, podwójne dodanie sekwencyjne i równoległe, klucz po dodaniu i zmianie nazwy, nieznana kategoria.
- pgTAP: CHECK-i na bezpośrednim zapisie jako `authenticated`.
- Migracje: nowa migracja przez bramkę bez deklaracji.

### Manual Testing Steps:

1. Signup z różnymi hasłami przy wyłączonym JS → komunikat serwera.
2. Dodanie z podmienionym `category_id` → błąd przy kategorii, brak nowego składnika na liście.
3. PR z czerwonym checkiem → merge zablokowany.
4. Edycja pliku z błędem w Claude Code → hook zgłasza porażkę bez stosu.

## Performance Considerations

Job `integration` dodaje kilka minut do PR (pobranie obrazów Supabase, ok. 40 s testu migracji, start dev servera); `checks` zostaje w okolicy obecnych 1,5–2 min. Sprawdzenie kategorii w `addSubstitute` to jedno dodatkowe zapytanie na dodanie.

## Migration Notes

Migracja `<YYYYMMDDHHmmss>_name_invariants.sql` zmienia tylko schemat. Przed `npx supabase db push` (kolejność z README „Database migrations”) uruchom na produkcji (SQL editor):

```sql
select current_setting('lc_ctype') as ctype,
  (select count(*) from public.ingredients
    where name_key <> lower(name)
       or name <> regexp_replace(regexp_replace(name, '^[\s   ﻿]+|[\s   ﻿]+$', '', 'g'), '[\s   ﻿]+', ' ', 'g')) as ingredients_bad,
  (select count(*) from public.substitutes
    where name <> regexp_replace(regexp_replace(name, '^[\s   ﻿]+|[\s   ﻿]+$', '', 'g'), '[\s   ﻿]+', ' ', 'g')) as substitutes_bad;
```

Oba liczniki muszą być 0; inaczej push wstrzymany i decyzja (poprawka danych = migracja zmieniająca dane z deklaracją w `expectations.ts`). Po pushu: `BASELINE_MIGRATION` na nową wersję (§6.5). Wycofanie: `alter table … drop constraint …` dla trzech ograniczeń.

## References

- Research: `context/changes/testing-validation-and-gates/research.md`
- Test plan: `context/foundation/test-plan.md` §2 (#7), §5, §6.1–§6.6, §7
- Wzorzec walidacji: `src/pages/api/ingredients.ts:52-125`
- Wzorzec testu HTTP: `tests/http/isolation.test.ts`, `tests/http/client.ts`
- Wzorzec testu serwisu: `tests/services/delete.test.ts`, `tests/harness/fixtures.ts`
- Wzorzec pgTAP: `supabase/tests/edit-entries.sql`
- Lekcje: `context/foundation/lessons.md` (null z klienta Supabase, klucz nazwy)
- Historia: `context/archive/2026-10-04-first-substitute-lookup/reviews/impl-review.md:43-51`, `context/archive/2026-10-10-unique-substitutes/reviews/impl-review.md:62-80`, `context/archive/2026-10-17-edit-entries/follow-ups/review-fixes.md:6`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Reguły nazwy w testach unit

#### Automated

- [x] 1.1 `npm run test:unit` przechodzi z nowym plikiem — 4e7c4a8
- [x] 1.2 Celowe zepsucie `normalizeName` (np. bez scalania spacji) daje czerwony `npm run test:unit`, po cofnięciu zielony — 4e7c4a8
- [x] 1.3 `npm run lint` przechodzi — 4e7c4a8

#### Manual

- [x] 1.4 Wpis §7 o znakach zerowej szerokości jest w test-planie i wskazuje wiersz PINNED w teście — 4e7c4a8

### Phase 2: Złe wejście przez HTTP + poprawka auth

#### Automated

- [x] 2.1 Przed poprawką `npm run test:http` jest czerwony na wierszach signin/signup z ciałem nie-formularzem (500)
- [x] 2.2 Po poprawce `npm run test:unit` i `npm run test:http` przechodzą (stos + `npm run dev`)
- [x] 2.3 `BASE_URL=http://localhost:4321 npm run smoke` przechodzi
- [x] 2.4 `npm run lint`, `npm run lint:db-access` przechodzą

#### Manual

- [x] 2.5 `/auth/signup` z różnymi hasłami przy wyłączonym JS w przeglądarce pokazuje komunikat serwera zamiast tworzyć konto

### Phase 3: Duplikaty i osierocone wiersze w serwisie

#### Automated

- [ ] 3.1 Przed poprawką `npx vitest run --project services tests/services/names.test.ts` jest czerwony tylko na przypadku nieznanej kategorii
- [ ] 3.2 Po poprawce `npm test` przechodzi
- [ ] 3.3 `npx vitest run --project services tests/services/names.test.ts` 5× z rzędu zielony
- [ ] 3.4 `npm run test:http` przechodzi z nowym wierszem
- [ ] 3.5 `npm run lint` przechodzi

#### Manual

- [ ] 3.6 Formularz dodawania z podmienionym w devtools `category_id` pokazuje błąd przy polu kategorii, a lista składników nie ma nowego wpisu

### Phase 4: Niezmienniki nazw w bazie

#### Automated

- [ ] 4.1 Przed migracją `npx supabase test db` jest czerwony na asercjach `throws_ok` z `name-invariants.sql`
- [ ] 4.2 `npx supabase migration up` nakłada migrację lokalnie bez błędu
- [ ] 4.3 Po migracji `npx supabase test db` przechodzi (wszystkie pliki)
- [ ] 4.4 `npm run test:migrations` przechodzi, a log „migracje pod testem” wymienia nową migrację (bez deklaracji w `expectations.ts`)
- [ ] 4.5 `npm test` i `npm run test:http` przechodzą (aplikacja zapisuje dane spełniające CHECK-i)
- [ ] 4.6 `npm run lint:db-access` przechodzi

#### Manual

- [ ] 4.7 Dodanie, edycja i zmiana nazwy w UI na lokalnej bazie po migracji działają jak przedtem

### Phase 5: Bramki w CI i ruleset

#### Automated

- [ ] 5.1 `npm run lint` przechodzi (workflow nie jest lintowany — poprawność YAML sprawdza pierwszy przebieg)
- [ ] 5.2 PR z tą zmianą: joby `checks` i `integration` zielone w GitHub Actions
- [ ] 5.3 Gałąź próbna z celowo zepsutą asercją w `tests/services/` i otwartym na niej draft PR do `main` (sam push gałęzi nie uruchamia workflow) daje czerwony `integration` i zielony `checks`; PR zamknięty, gałąź usunięta po próbie
- [ ] 5.4 `gh api repos/rszymanski1966/Roman1/rules/branches/main` zwraca reguły `pull_request` i `required_status_checks` z `checks` i `integration`

#### Manual

- [ ] 5.5 Na PR z czerwonym checkiem GitHub pokazuje merge jako zablokowany (z opcją obejścia dla admina)
- [ ] 5.6 Push na `main` po merge'u uruchamia `deploy` dopiero po zielonych `checks` i `integration`
- [ ] 5.7 Log `integration` nie zawiera kluczy Supabase ani `DB_URL` w jawnej postaci

### Phase 6: Hooki agenta i dokumentacja

#### Automated

- [ ] 6.1 Test dowodowy hooków z `/10x-configure-hook` przechodzi i każdy skrypt hooka oblewa się na celowo zepsutym pliku
- [ ] 6.2 `npm run test:unit` przechodzi
- [ ] 6.3 `npx prettier --check context/foundation/test-plan.md CLAUDE.md README.md` przechodzi
- [ ] 6.4 Joby CI zielone na PR z dokumentacją

#### Manual

- [ ] 6.5 Edycja `src/lib/entry-fields.ts` z celowym błędem w sesji Claude Code pokazuje porażkę hooka per-edit bez uruchomionego stosu Supabase
- [ ] 6.6 Opis bramek w test-planie, CLAUDE.md i README jest spójny z workflow
