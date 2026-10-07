# First Substitute Lookup (S-01) Implementation Plan

## Overview

Pierwszy przepływ end-to-end produktu: zalogowany użytkownik dodaje składnik z kategorią i zamiennik (proporcja + uwagi), a następnie wybiera składnik + kategorię i widzi listę zamienników albo czytelny stan pusty. Zmiana wnosi całą warstwę danych (4 tabele, RLS) i dowodzi guardrailu izolacji danych w tej samej historyjce. Realizuje FR-001, FR-002, US-01 (bez wyróżnienia „najlepszego" – to S-02).

## Current State Analysis

- Brak warstwy danych: `supabase/config.toml` istnieje, ale nie ma `supabase/migrations/` ani tabel; README twierdzi, że migracje nie są potrzebne (do poprawy).
- Auth gotowy: `src/lib/supabase.ts:5` zwraca `null` bez `SUPABASE_URL`/`SUPABASE_KEY`; `src/middleware.ts:4` chroni trasy z `PROTECTED_ROUTES` (dziś tylko `/dashboard`) i ustawia `locals.user`.
- Endpointy auth to formularze POST z odpowiedzią redirect `?error=<msg>` (`src/pages/api/auth/signin.ts:4-19`). Strony mają szklany styl „cosmic" (`src/pages/dashboard.astro`).
- Brak `src/types.ts`, brak `src/lib/services/`, brak zod, brak frameworka testów; jedyny test to `scripts/smoke.mjs` (sesja cookie jar, jedno konto, zwraca tylko status + location).
- Lokalne Supabase ma `enable_confirmations = false` (`supabase/config.toml:209`), więc signup → signin działa bez maila.

## Desired End State

Po zakończeniu: zalogowany użytkownik wchodzi na `/ingredients/new`, wpisuje nazwę składnika, wybiera kategorię z tabeli `categories`, podaje zamiennik z proporcją i uwagami i po zapisie ląduje na `/ingredients?ingredient=<id>&category=<id>` z nowym zamiennikiem na liście. Na `/ingredients` wybór składnika + kategorii pokazuje listę zamienników (nazwa, proporcja, uwagi) albo stan pusty z linkiem do dodania. Konto B nie widzi ani nie może wstawić danych powiązanych z kontem A. Weryfikacja: rozszerzony `npm run smoke` (dwa konta), `supabase/tests/rls-isolation.sql`, lint i build.

### Key Discoveries:

- `createClient()` może zwrócić `null` – każdy nowy endpoint i strona SSR musi to obsłużyć (`context/foundation/lessons.md`, `src/lib/supabase.ts:6`).
- `PROTECTED_ROUTES` używa `startsWith` na ścieżce (`src/middleware.ts:18`), więc `/ingredients` pokrywa też `/ingredients/new`, ale nie `/api/ingredients` – endpoint musi sam sprawdzić `locals.user`.
- Zwykła kolumna z unikalnym indeksem pozwala użyć `onConflict` w supabase-js; indeks na wyrażeniu `lower(name)` – nie. Dlatego klucz porównania nazwy (`name_key`) jest kolumną wyliczaną w aplikacji.
- `.upsert()` bez `ignoreDuplicates` to ON CONFLICT DO UPDATE – przy włączonym RLS i braku polityki UPDATE ścieżka konfliktu kończy się błędem RLS. Stąd ON CONFLICT DO NOTHING + osobny odczyt id.
- Konwencja migracji: `supabase/migrations/YYYYMMDDHHmmss_short_description.sql`, RLS zawsze włączone, polityki per operacja i rola (CLAUDE.md).

## What We're NOT Doing

- Wyróżnianie „najlepszego" zamiennika (S-02), wyszukiwanie po nazwie (S-03), edycja (S-04), usuwanie (S-05) – brak kolumny `is_best`, brak polityk UPDATE/DELETE (dojdą z S-04/S-05).
- zod i jakakolwiek nowa zależność npm; walidacja ręczna.
- React islands i JSON API – formularze POST + redirect, strony Astro SSR.
- Przeliczanie ilości wg proporcji – proporcja to tekst.
- Podkategorie, tolerancja literówek, zarządzanie kategoriami przez użytkownika (lista jest seedem; zmiana = nowa migracja).
- Atomowość trzech zapisów w jednej transakcji (RPC). Zapisy składnika i pary są idempotentne, insert zamiennika nie. Akceptowane skutki: błąd po pierwszym zapisie zostawia składnik bez kategorii (widoczny w selekcie, daje stan pusty), a podwójne wysłanie formularza dubluje zamiennik (usuwanie przyjdzie z S-05).
- Generowane typy bazy (`supabase gen types`) – typy ręczne w `src/types.ts`.

## Implementation Approach

Od dołu do góry: migracja + typy + serwis → endpoint dodawania + strona formularza → strona listy → weryfikacja izolacji. Model: `categories` (słownik z seedem) ← `ingredient_categories` (para składnik–kategoria) → `ingredients` (składnik per użytkownik, unikalny po `name_key`); `substitutes` wiszą na parze. Dodanie składnika, który już istnieje (ta sama nazwa bez rozróżniania wielkości liter), dopisuje kategorię/zamiennik do istniejącego wpisu zamiast tworzyć duplikat. Izolacja: `user_id` na każdej tabeli użytkownika (`default auth.uid()`), polityki SELECT/INSERT sprawdzają `user_id = auth.uid()`, a INSERT dodatkowo sprawdza, że rodzic należy do tego samego użytkownika.

## Faza 1: Data layer + RLS

### Overview

Schemat, seed kategorii, polityki RLS, typy i funkcje dostępu do danych.

### Changes Required:

#### 1. Migracja schematu

**File**: `supabase/migrations/20261004120000_substitute_database.sql`

**Intent**: Tworzy tabele domeny z RLS i polityki per operacja/rola, plus seed kategorii.

**Contract**:
- `categories(id uuid pk, slug text unique, name text unique, sort_order int)`; RLS on; jedyna polityka: SELECT dla `authenticated`. Seed: ciasta, dania mięsne, wegetariańskie (lista docelowa to otwarte pytanie roadmapy – zmiana przez kolejną migrację).
- `ingredients(id uuid pk, user_id uuid not null default auth.uid() references auth.users on delete cascade, name text not null, name_key text not null, created_at)`; `unique(user_id, name_key)`; check długości nazwy 1–100.
- `ingredient_categories(id uuid pk, user_id … default auth.uid(), ingredient_id → ingredients on delete cascade, category_id → categories, created_at)`; `unique(ingredient_id, category_id)`.
- `substitutes(id uuid pk, user_id … default auth.uid(), ingredient_category_id → ingredient_categories on delete cascade, name text not null, ratio text not null, notes text null, created_at)`; checki długości (nazwa i proporcja ≤ 100, uwagi ≤ 500); indeks na `ingredient_category_id`.
- RLS włączone na wszystkich 4 tabelach. Dla tabel użytkownika polityki SELECT i INSERT tylko dla roli `authenticated`: `user_id = (select auth.uid())`; polityka INSERT dla `ingredient_categories` i `substitutes` dodatkowo wymaga `exists` rodzica widocznego dla użytkownika (zabezpieczenie przed podpięciem pod cudzy rekord). Brak polityk dla `anon`. Polityki UPDATE/DELETE – poza zakresem.

#### 2. Typy współdzielone

**File**: `src/types.ts`

**Intent**: Encje (`Category`, `Ingredient`, `IngredientCategory`, `Substitute`) i DTO listy zamienników.

**Contract**: Pola odpowiadają kolumnom migracji; `SubstituteListItem = { id, name, ratio, notes: string | null }`.

#### 3. Serwis danych

**File**: `src/lib/services/substitutes.ts`

**Intent**: Funkcje przyjmujące klienta Supabase (już sprawdzonego na `null` przez wywołującego): lista kategorii, lista składników użytkownika, dodanie zamiennika, lista zamienników dla (składnik, kategoria).

**Contract**: `addSubstitute(client, { ingredientName, categoryId, substituteName, ratio, notes })` → `{ ingredientId, categoryId }` lub błąd. Normalizacja: `trim`, kolaps spacji, `name_key = name.toLocaleLowerCase("pl")`. Kolejność: upsert składnika po `(user_id, name_key)` z `ignoreDuplicates: true` (ON CONFLICT DO NOTHING) → `select id` po `name_key` → to samo dla pary `(ingredient_id, category_id)` → insert zamiennika. Nie używamy zwykłego `.upsert()` (ON CONFLICT DO UPDATE), bo przy RLS wymaga polityki UPDATE, której ta zmiana nie tworzy; `ignoreDuplicates` przy konflikcie nie zwraca wiersza, stąd osobny odczyt id. `listSubstitutes(client, ingredientId, categoryId)` zwraca `SubstituteListItem[]` posortowane po `created_at`; brak pary = pusta lista.

#### 4. Dokumentacja

**File**: `README.md`

**Intent**: Poprawia zdanie „No database tables or migrations are required" i dopisuje `npx supabase db reset` / `npx supabase db push` (hosted).

**Contract**: Sekcja Supabase Configuration.

### Success Criteria:

#### Automated Verification:

- Migracja i seed stosują się bez błędów: `npx supabase db reset`
- Typy i lint przechodzą: `npx astro sync && npm run lint`

#### Manual Verification:

- W Studio (`http://localhost:54323`) wszystkie 4 tabele mają włączone RLS, a `categories` zawiera 3 wiersze seedu
- W Studio widać polityki SELECT i INSERT dla `authenticated` na tabelach użytkownika i brak polityk dla `anon`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Faza 2: Adding flow

### Overview

Formularz dodania składnika z zamiennikiem i endpoint zapisu.

### Changes Required:

#### 1. Endpoint dodawania

**File**: `src/pages/api/ingredients.ts`

**Intent**: Przyjmuje formularz, waliduje ręcznie, wywołuje `addSubstitute` i przekierowuje na listę z wybranym składnikiem i kategorią.

**Contract**: `POST`. Pola formularza: `ingredient`, `category_id`, `substitute`, `ratio`, `notes`. Kolejność guardów: klient `null` → redirect `/ingredients/new?error=…`; brak `locals.user` → redirect `/auth/signin`; walidacja (wymagane: ingredient, category_id, substitute, ratio; `category_id` w formacie UUID; limity długości z migracji) → redirect z błędem. Sukces: redirect `/ingredients?ingredient=<id>&category=<id>`. Błędy bazy tłumaczone na krótki komunikat, bez wycieku szczegółów SQL.

#### 2. Strona formularza

**File**: `src/pages/ingredients/new.astro`

**Intent**: Chroniona strona z formularzem (styl jak `dashboard.astro`), z listą kategorii z bazy i wyświetleniem `?error=`.

**Contract**: Formularz `POST /api/ingredients`; select kategorii z `listCategories`; opcjonalne prefill `?ingredient=` / `?category=` z linku stanu pustego; wymaga wpisu w `PROTECTED_ROUTES`.

#### 3. Ochrona trasy

**File**: `src/middleware.ts`

**Intent**: Dodaje `/ingredients` do `PROTECTED_ROUTES`.

**Contract**: `const PROTECTED_ROUTES = ["/dashboard", "/ingredients"]`.

### Success Criteria:

#### Automated Verification:

- Lint i build przechodzą: `npm run lint && npm run build`

#### Manual Verification:

- Po zalogowaniu formularz zapisuje składnik, parę i zamiennik (widoczne w Studio z właściwym `user_id`)
- Ponowne dodanie tego samego składnika (inna wielkość liter) w tej samej kategorii dopisuje zamiennik do istniejącego składnika, bez duplikatu w `ingredients`
- Puste pole wymagane i zbyt długa wartość wracają na formularz z czytelnym `?error=`

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Faza 3: Lookup list

### Overview

Strona wyboru składnika + kategorii i listy zamienników ze stanem pustym.

### Changes Required:

#### 1. Strona listy

**File**: `src/pages/ingredients/index.astro`

**Intent**: Formularz GET (select składnika użytkownika + select kategorii) i lista zamienników dla wybranej pary; stan pusty z linkiem do `/ingredients/new` (z prefillem).

**Contract**: Parametry `?ingredient=<id>&category=<id>`. Trzy stany: (a) brak wyboru – zachęta do wyboru, a gdy użytkownik nie ma żadnego składnika – zachęta do dodania pierwszego; (b) wybór bez zamienników – stan pusty z CTA; (c) lista pozycji: nazwa, proporcja, uwagi (uwagi pomijane, gdy `null`). Obce `id` daje stan pusty, nie błąd (RLS zwraca zero wierszy); `id` o złym formacie (nie UUID) jest odrzucane sprawdzeniem formatu przed zapytaniem i również daje stan pusty (inaczej Postgres zwraca błąd 22P02). Klient `null` obsłużony czytelnym komunikatem.

#### 2. Nawigacja

**File**: `src/pages/dashboard.astro`

**Intent**: Dodaje linki do `/ingredients` i `/ingredients/new`.

**Contract**: Dwa linki w istniejącej karcie, bez zmiany reszty strony.

### Success Criteria:

#### Automated Verification:

- Lint i build przechodzą: `npm run lint && npm run build`

#### Manual Verification:

- Po dodaniu zamiennika lista pokazuje go z proporcją i uwagami dla wybranej pary składnik + kategoria
- Wybór pary bez zamienników pokazuje czytelny stan pusty z linkiem do dodania, a nie pustą listę
- Wynik pojawia się odczuwalnie natychmiast (< 1 s)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Faza 4: Isolation & verification

### Overview

Dowód guardraila izolacji: scenariusz dwóch kont w smoke oraz test polityk w SQL.

### Changes Required:

#### 1. Rozszerzenie smoke

**File**: `scripts/smoke.mjs`

**Intent**: Obsługa dwóch sesji (osobne cookie jary) i odczytu treści odpowiedzi; nowe kroki: niezalogowany `/ingredients` → redirect; niezalogowany POST `/api/ingredients` → redirect; konto A dodaje składnik z zamiennikiem i widzi go na liście; konto B na tym samym URL (id z A) widzi stan pusty bez danych A.

**Contract**: `request()` przyjmuje jar i zwraca dodatkowo `body`. Kroki oceniane po statusie/location i obecności/nieobecności unikalnego markera w body (np. nazwa zamiennika z timestampem). Istniejące kroki auth bez zmian zachowania.

#### 2. Test polityk SQL

**File**: `supabase/tests/rls-isolation.sql`

**Intent**: Test pgTAP w transakcji z `rollback`, w którym dwóch użytkowników (rola `authenticated`, `request.jwt.claims` ustawione na różne `sub`) próbuje czytać i wstawiać cudze dane.

**Contract**: Struktura: `begin; create extension if not exists pgtap; select plan(n); … select * from finish(); rollback;`. Setup jako `postgres`: insert dwóch wierszy do `auth.users` (stałe UUID A i B, wymagane przez FK `user_id`) oraz danych A (składnik, para, zamiennik); potem per użytkownik `set local role authenticated` + `set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}'` (powrót przez `reset role`). Asercje (`is`, `throws_ok`, `is_empty`): B nie widzi wierszy A w 3 tabelach; B nie wstawi `ingredient_categories`/`substitutes` wskazujących na rekord A; `anon` nie widzi niczego; wszyscy `authenticated` widzą `categories`. Uruchamianie: `npx supabase test db` (wbudowany runner pgTAP CLI, skanuje `supabase/tests/`; bez nowych zależności npm).

### Success Criteria:

#### Automated Verification:

- Smoke przechodzi wraz z nowymi krokami: `BASE_URL=http://localhost:4321 npm run smoke`
- Lint i build przechodzą: `npm run lint && npm run build`
- Test polityk RLS przechodzi: `npx supabase test db`

#### Manual Verification:

- Dwa konta w dwóch przeglądarkach nie widzą nawzajem swoich składników i zamienników

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Testing Strategy

### Unit Tests:

- Brak frameworka testów; nie dodajemy go. Logika normalizacji/walidacji jest mała i pokryta smoke.

### Integration Tests:

- `scripts/smoke.mjs`: dodanie → odnalezienie przez konto A, brak wglądu przez konto B, redirecty dla anonima.
- `supabase/tests/rls-isolation.sql` (pgTAP, `npx supabase test db`): polityki na poziomie bazy (w tym próba podpięcia pod cudzy rekord).

### Manual Testing Steps:

1. Zaloguj się, dodaj „masło" w kategorii „ciasta" z zamiennikiem „olej kokosowy", proporcja „1:1", uwagi „lekki posmak kokosa".
2. Dodaj „Masło" w „ciasta" z drugim zamiennikiem – w Studio nadal jeden wiersz `ingredients`.
3. Wybierz „masło" + „dania mięsne" – stan pusty z linkiem do dodania.
4. Zaloguj się na drugie konto – lista pusta, brak składników.

## Performance Considerations

Dane są małe (jeden użytkownik, setki wpisów). Lista to dwa zapytania po kluczach z indeksami (`unique(ingredient_id, category_id)`, indeks na `substitutes.ingredient_category_id`); NFR < 1 s spełnione bez cache.

## Prerequisites

Docker i lokalny Supabase (`npx supabase start`). `.env` i `.dev.vars` dziś wskazują na hostowany projekt (`hangfwsmconpyyuhoyfi.supabase.co`); na czas developmentu i faz weryfikacji przepisz w obu plikach `SUPABASE_URL` na `http://127.0.0.1:54321` i `SUPABASE_KEY` na anon key z wyjścia `supabase start`, zachowując poprzednie wartości do powrotu. Fazy 1 i 4 zakładają lokalny stack (`db reset`, Studio `:54323`, `supabase test db`).

Każdy push na `main` deployuje Workera (CI). Pracuj na gałęzi feature (PR tylko buduje), a jeśli commity faz trafiają na `main` – wykonaj `npx supabase db push` na hostowanym projekcie przed pierwszym pushem kodu z Fazy 2.

## Migration Notes

Migracja stosuje się lokalnie przez `npx supabase db reset`. Dla hostowanego projektu Supabase trzeba ją zastosować (`npx supabase db push`) przed wdrożeniem kodu, bo CI (`.github/workflows/ci.yml`) deployuje tylko Worker. Brak istniejących danych do migracji.

## References

- Roadmap: `context/foundation/roadmap.md` (S-01)
- PRD: `context/foundation/prd.md` (FR-001, FR-002, US-01, Access Control, guardrail izolacji)
- Rules: `context/foundation/lessons.md`
- Wzorzec endpointu: `src/pages/api/auth/signin.ts:4-19`
- Wzorzec ochrony tras: `src/middleware.ts:4-22`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Data layer + RLS

#### Automated

- [x] 1.1 Migracja i seed stosują się bez błędów: `npx supabase db reset` — 9e69587
- [x] 1.2 Typy i lint przechodzą: `npx astro sync && npm run lint` — 9e69587

#### Manual

- [x] 1.3 W Studio (`http://localhost:54323`) wszystkie 4 tabele mają włączone RLS, a `categories` zawiera 3 wiersze seedu — 9e69587
- [x] 1.4 W Studio widać polityki SELECT i INSERT dla `authenticated` na tabelach użytkownika i brak polityk dla `anon` — 9e69587

### Phase 2: Adding flow

#### Automated

- [x] 2.1 Lint i build przechodzą: `npm run lint && npm run build` — e009821

#### Manual

- [x] 2.2 Po zalogowaniu formularz zapisuje składnik, parę i zamiennik (widoczne w Studio z właściwym `user_id`) — e009821
- [x] 2.3 Ponowne dodanie tego samego składnika (inna wielkość liter) w tej samej kategorii dopisuje zamiennik do istniejącego składnika, bez duplikatu w `ingredients` — e009821
- [x] 2.4 Puste pole wymagane i zbyt długa wartość wracają na formularz z czytelnym `?error=` — e009821

### Phase 3: Lookup list

#### Automated

- [ ] 3.1 Lint i build przechodzą: `npm run lint && npm run build`

#### Manual

- [ ] 3.2 Po dodaniu zamiennika lista pokazuje go z proporcją i uwagami dla wybranej pary składnik + kategoria
- [ ] 3.3 Wybór pary bez zamienników pokazuje czytelny stan pusty z linkiem do dodania, a nie pustą listę
- [ ] 3.4 Wynik pojawia się odczuwalnie natychmiast (< 1 s)

### Phase 4: Isolation & verification

#### Automated

- [ ] 4.1 Smoke przechodzi wraz z nowymi krokami: `BASE_URL=http://localhost:4321 npm run smoke`
- [ ] 4.2 Lint i build przechodzą: `npm run lint && npm run build`
- [ ] 4.3 Test polityk RLS przechodzi: `npx supabase test db`

#### Manual

- [ ] 4.4 Dwa konta w dwóch przeglądarkach nie widzą nawzajem swoich składników i zamienników
