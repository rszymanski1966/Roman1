# Ingredient Name Search Implementation Plan

## Overview

Użytkownik wpisuje nazwę składnika (albo jej fragment) i dostaje zamienniki bez przewijania listy rozwijanej. Kategoria jest opcjonalnym zawężeniem. Dopasowanie ma dwa tryby: „zawiera" (domyślny) i „zaczyna się od". Przełącza je użytkownik, a ostatni wybór zapamiętuje ciasteczko. Gdy pasuje kilka składników, najpierw widać ich listę; przy jednym trafieniu od razu widać zamienniki. Dotychczasowa lista rozwijana zostaje, ale kategoria jest w niej teraz opcjonalna. Bez kategorii zamienniki są pogrupowane w sekcje per kategoria, każda z własnym „najlepszym". Roadmapa: S-03, PRD: FR-004, FR-005, US-01, NFR (< 1 s).

## Current State Analysis

- `/ingredients` (`src/pages/ingredients/index.astro:99-138`) to formularz GET z dwiema wymaganymi listami rozwijanymi: `?ingredient=<uuid>&category=<uuid>`. Bez obu parametrów strona pokazuje tylko podpowiedź (`:140-141`).
- Strona już ładuje wszystkie składniki użytkownika do listy rozwijanej (`listIngredients`, `src/lib/services/substitutes.ts:50-54`, sortowanie po `name_key`).
- `listSubstitutes` (`substitutes.ts:147-170`) obsługuje dokładnie jedną parę składnik + kategoria: najpierw szuka pary, potem zamienników (najlepszy pierwszy, reszta od najstarszego).
- „Najlepszy" jest per para (indeks częściowy `substitutes_one_best_per_pair_idx`, `supabase/migrations/20261011201658_best_substitute.sql:13-15`). Widok bez kategorii musi więc pokazać kilka niezależnych „najlepszych".
- Przycisk „Oznacz jako najlepszy" (`index.astro:170-183`) wysyła `ingredient` i `category`, a `api/substitutes/best.ts:14-22, 43-48` wymaga obu jako UUID i wraca na `?ingredient&category`. Kontekst wyszukiwania by przepadł.
- `ingredients.name_key` liczy aplikacja: `toNameKey(normalizeName(name))` = trim + scalenie spacji + `toLocaleLowerCase("pl")` (`substitutes.ts:25-39`).
- `/ingredients/new` przyjmuje `?ingredient_name=` i `?category=` jako wstępne wypełnienie (`src/pages/ingredients/new.astro:9-12`), więc CTA „Dodaj składnik" z pustego wyniku nie wymaga zmian w formularzu.
- Smoke (`scripts/smoke.mjs`) przechowuje ciasteczka w słoikach per konto, porównuje `location` przez `startsWith` i sprawdza izolację kont na adresie `?ingredient&category` konta A z tekstem „Brak zamienników".

## Desired End State

- Na `/ingredients` są dwa formularze GET:
  - **Wyszukiwanie**: pole „Nazwa składnika" (`q`), przełącznik „zawiera / zaczyna się od" (`match=contains|prefix`), kategoria opcjonalna („Wszystkie kategorie").
  - **Wybór z listy**: dotychczasowa lista rozwijana składnika (wymagana) + kategoria opcjonalna.
- Wyszukiwanie:
  - puste `q` → stan początkowy z podpowiedzią;
  - brak trafień → „Nie znaleziono składnika „q"." + CTA „Dodaj składnik" (`/ingredients/new?ingredient_name=q[&category=c]`);
  - jedno trafienie → od razu zamienniki tego składnika;
  - kilka trafień → lista nazw składników jako linki do ich zamienników (zachowują `q`, `match`, `category`).
- Z kategorią wyszukiwanie zwraca tylko składniki, które mają co najmniej jeden zamiennik w tej kategorii (np. „mąka" + Ciasta nie pokazuje „mąka żytnia", jeśli ta ma zamienniki tylko w Daniach mięsnych).
- Widok składnika (`?ingredient=<uuid>[&category=<uuid>]`):
  - z kategorią → jedna lista jak dziś (najlepszy pierwszy), stan pusty „Brak zamienników dla tego składnika w wybranej kategorii." z CTA jak dziś;
  - bez kategorii → sekcje per kategoria (kolejność `sort_order`), w każdej najlepszy pierwszy; kategorie bez zamienników pominięte; gdy nie ma żadnych → „Brak zamienników dla tego składnika." z CTA.
- Tryb dopasowania: `?match` z URL > ciasteczko > „zawiera". Poprawna wartość `match` w URL zapisuje się w ciasteczku, więc kolejne wejście na `/ingredients` startuje od ostatniego wyboru.
- Oznaczenie / zdjęcie „najlepszego" wraca do tego samego widoku (ten sam składnik, ta sama kategoria albo jej brak, to samo `q` i `match`).
- Izolacja: cudze `ingredient` w URL daje stan pusty; wyszukiwanie widzi tylko własne składniki (RLS + lista z `listIngredients`).
- Weryfikacja: `npm run lint`, `npm run build`, `BASE_URL=http://localhost:4321 npm run smoke`, ręczny przegląd w przeglądarce.

### Key Discoveries:

- Strona i tak pobiera pełną listę składników użytkownika dla listy rozwijanej, więc dopasowanie nazwy można zrobić w aplikacji na tej samej liście: zero dodatkowych zapytań, ten sam `toNameKey` co przy zapisie (polskie litery bez zależności od locale bazy) i brak escapowania wzorców `LIKE` (PostgREST traktuje `*` w `like` jako `%`).
- Filtr kategorii w wyszukiwaniu wymaga jednego zapytania: id składników z parą w tej kategorii, która ma co najmniej jeden zamiennik (`ingredient_categories` z `substitutes!inner`).
- Smoke porównuje `location` przez `startsWith(listPath)`, gdzie `listPath = /ingredients?ingredient=…&category=…`. Przekierowanie z `best.ts` musi zachować kolejność `ingredient`, `category`, a `q` / `match` dopisywać na końcu i tylko gdy są niepuste.
- Lekcja „class:list czy cn()": nowe klasy, które nadpisują utility z bazowego zestawu, łączy `cn()`; samo dokładanie odstępów może zostać w `class:list`.
- Lekcja „Zawsze sprawdzaj null z klienta Supabase": dotyczy strony i `best.ts`; obecne gałęzie `!supabase` zostają.

## What We're NOT Doing

- Tolerancja literówek, odmiana, wyszukiwanie po nazwie zamiennika (PRD FR-004: odłożone po MVP).
- Wyszukiwanie po stronie bazy (`ilike`, indeks trigramowy, migracja). Dane jednego użytkownika są małe; do rozważenia, gdy lista składników przestanie się mieścić w jednym zapytaniu.
- Limit liczby trafień i paginacja listy składników.
- Wyszukiwanie „na żywo" w trakcie pisania i auto-wysyłanie formularza po zmianie przełącznika (bez JS; zmiana trybu działa po kliknięciu „Szukaj").
- Zmiany w `/ingredients/new` i `/api/ingredients` (przekierowanie po dodaniu dalej idzie na `?ingredient&category`).
- React: widok zostaje w Astro.

## Implementation Approach

Logika trafia do `src/lib/services/substitutes.ts` (lub nowego `src/lib/services/ingredient-search.ts`, jeśli plik serwisu za bardzo urośnie): czyste funkcje dopasowania i odczytu trybu oraz dwa zapytania do bazy (id składników z zamiennikami w kategorii, zamienniki składnika pogrupowane per kategoria). Strona `index.astro` rozstrzyga stan widoku z parametrów URL w kolejności: `ingredient` (widok składnika) > `q` (wyszukiwanie) > stan początkowy. Ciasteczko trybu ustawia sama strona przez `Astro.cookies`. `best.ts` przenosi pełny kontekst widoku w przekierowaniu.

## Critical Implementation Details

**Kolejność parametrów w przekierowaniu `best.ts`:** `ingredient`, potem `category` (pominięta, gdy pusta), potem `q` i `match` (pominięte, gdy puste), potem `notice` / `error`. Dzisiejsze kroki smoke porównują `location` przez `startsWith` z `?ingredient=…&category=…`.

**Stan pusty dla cudzego składnika:** widok składnika szuka nazwy w liście z `listIngredients` (RLS). Gdy id nie należy do użytkownika (albo ma zły format), strona pokazuje stan pusty z tekstem zaczynającym się od „Brak zamienników", na którym opiera się krok izolacji w smoke, i nie odpytuje zamienników.

## Faza 1: Serwis — dopasowanie, tryb, zamienniki pogrupowane

### Overview

Funkcje, z których strona zbuduje wyszukiwanie i widok bez kategorii, plus typy. Bez zmian w UI.

### Changes Required:

#### 1. Typy

**File**: `src/types.ts`

**Intent**: Opisać tryb dopasowania i grupę zamienników jednej kategorii.

**Contract**: `type MatchMode = "contains" | "prefix"`; `interface SubstituteGroup { category: Pick<Category, "id" | "name" | "sort_order">; substitutes: SubstituteListItem[] }`.

#### 2. Dopasowanie nazwy i tryb

**File**: `src/lib/services/substitutes.ts`

**Intent**: Czyste funkcje bez bazy: dopasowanie zapytania do listy składników oraz odczyt trybu z URL i ciasteczka.

**Contract**:
- `matchIngredients(ingredients: IngredientListItem[], query: string, mode: MatchMode): IngredientListItem[]`: porównuje `toNameKey(normalizeName(query))` z `toNameKey(normalizeName(name))` przez `includes` albo `startsWith`; puste zapytanie po normalizacji → `[]`; zachowuje kolejność wejścia (po `name_key`).
- `parseMatchMode(value: string | null | undefined): MatchMode | null`: tylko `"contains"` / `"prefix"`, reszta → `null`.
- Stała z nazwą ciasteczka (np. `MATCH_MODE_COOKIE = "ingredients_match"`), wspólna dla strony.

#### 3. Składniki z zamiennikami w kategorii

**File**: `src/lib/services/substitutes.ts`

**Intent**: Filtr kategorii dla wyszukiwania: które składniki mają w tej kategorii co najmniej jeden zamiennik.

**Contract**: `listIngredientIdsWithSubstitutes(client, categoryId): Promise<ServiceResult<Set<string>>>`; jedno zapytanie do `ingredient_categories` (`ingredient_id`, `substitutes!inner(id)`, `eq category_id`); błąd → `GENERIC_ERROR`.

#### 4. Zamienniki składnika pogrupowane per kategoria

**File**: `src/lib/services/substitutes.ts`

**Intent**: Jedna funkcja dla obu widoków składnika: z kategorią daje najwyżej jedną grupę, bez kategorii wszystkie niepuste grupy. Zastępuje `listSubstitutes`.

**Contract**: `listIngredientSubstitutes(client, ingredientId, categoryId: string | null): Promise<ServiceResult<SubstituteGroup[]>>`; jedno zapytanie do `ingredient_categories` z osadzonymi `categories(id, name, sort_order)` i `substitutes(id, name, ratio, notes, is_best, created_at)`; grupy po `sort_order`, w grupie `is_best` pierwszy, potem `created_at` rosnąco — oba sortowania w JS po pobraniu (`.order(…, { referencedTable })` sortuje tylko osadzony zasób, nie wiersze `ingredient_categories`); grupy bez zamienników pominięte; brak pary / cudze id → `[]`. `listSubstitutes` zostaje w tej fazie (używa go jeszcze `index.astro:4,33`); usuwa go faza 2.

#### 5. Roadmapa — poprawka wiersza S-02

**File**: `context/foundation/roadmap.md`

**Intent**: Uzgodniona porządkowa poprawka, wchodzi w pierwszy commit S-03 (bez osobnego PR) i jest wspomniana w opisie commita.

**Contract**: `## Backlog Handoff`, wiersz S-02: Ready `yes` → `—`, Notes → `Done (archived 2026-10-12)`, w stylu wiersza S-01.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Build przechodzi (przy zatrzymanym `npm run dev`): `npm run build`

#### Manual Verification:

- Przegląd kodu: `matchIngredients` dla „Mąka" w trybie „zawiera" zwraca „mąka pszenna" i „Mąka żytnia", w trybie „zaczyna się od" nie zwraca „skrobia z mąki" ani „biała mąka"

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Faza 2: Strona i przekierowanie — wyszukiwanie, sekcje, ciasteczko

### Overview

Nowy formularz wyszukiwania, opcjonalna kategoria w obu formularzach, wszystkie stany wyniku, zapamiętanie trybu i powrót do tego samego widoku po oznaczeniu najlepszego.

### Changes Required:

#### 1. Rozstrzygnięcie stanu i ciasteczko

**File**: `src/pages/ingredients/index.astro`

**Intent**: Odczytać `ingredient`, `category`, `q`, `match` i ustalić widok: składnik > wyszukiwanie > stan początkowy. Ustalić tryb (URL > ciasteczko > „contains") i zapisać ciasteczko, gdy URL niesie poprawny `match` różny od zapisanego.

**Contract**:
- Parametry: `ingredient` (UUID), `category` (UUID albo pusta = wszystkie), `q` (trim, obcięte do 100 znaków), `match` (`contains|prefix`). Zły format `category` → stan pusty bez zapytań (jak dziś dla złych id). Gdy jest `ingredient`, `q` tylko wypełnia pole wyszukiwania.
- Ciasteczko: `Astro.cookies.set(MATCH_MODE_COOKIE, mode, { path: "/ingredients", httpOnly: true, sameSite: "lax", secure: <https>, maxAge: 365 dni })`.
- Wyszukiwanie: `matchIngredients` na liście z `listIngredients`; przy kategorii dodatkowo przecięcie z `listIngredientIdsWithSubstitutes`. Jedno trafienie → widok składnika dla tego trafienia (bez przekierowania).
- Widok składnika: nazwa z listy `listIngredients`; nieznane id → stan pusty; w przeciwnym razie `listIngredientSubstitutes`. Błąd zapytań zamienników idzie do `substitutesError` (formularze zostają widoczne), jak dziś.
- Po przełączeniu strony na `listIngredientSubstitutes` usunąć `listSubstitutes` z `src/lib/services/substitutes.ts` (nie ma innych wywołań).

#### 2. Formularze

**File**: `src/pages/ingredients/index.astro`

**Intent**: Wyszukiwanie nad dotychczasową listą rozwijaną; obie kategorie opcjonalne.

**Contract**:
- Formularz wyszukiwania (GET `/ingredients`): `input type="search" name="q"` z etykietą, `fieldset` z `legend` „Dopasowanie" i dwoma radio `match` („zawiera", „zaczyna się od"; zaznaczony bieżący tryb), select `category` z pierwszą opcją „Wszystkie kategorie" (`value=""`), przycisk „Szukaj".
- Formularz listy (GET `/ingredients`): select `ingredient` (wymagany, jak dziś), select `category` bez `required`, z opcją „Wszystkie kategorie", przycisk „Pokaż zamienniki". Ukryte `match` niosące bieżący tryb, żeby nie wyzerować go w URL.
- Wizualne oddzielenie obu formularzy (np. separator „albo wybierz z listy"); id pól unikalne w obrębie strony (dwa selecty kategorii).

#### 3. Stany wyniku

**File**: `src/pages/ingredients/index.astro`

**Intent**: Wyrenderować wszystkie stany z „Desired End State".

**Contract**:
- Kilka trafień: `<ul>` z linkami `?ingredient=<id>[&category=c]&q=<q>&match=<mode>`, nagłówek „Pasujące składniki (N)".
- Widok składnika: nagłówek z nazwą składnika; gdy URL ma `ingredient` i niepuste `q`, link „← Wszystkie wyniki dla „q"" (`?q=<q>&match=<mode>[&category=c]`; bez liczenia trafień, bo przy `ingredient` strona nie uruchamia wyszukiwania; przy jednym trafieniu link wraca do tego samego składnika). Widok jednego trafienia na adresie wyszukiwania (bez `ingredient`) linku nie ma. Z kategorią: jedna lista kart jak dziś. Bez kategorii: sekcja per grupa z nagłówkiem `h2` (nazwa kategorii) i listą kart.
- Karta zamiennika bez zmian (plakietka, `cn()` dla najlepszego). Ukryte pola formularza oznaczania: `substitute_id`, `is_best`, `ingredient` (bieżący składnik), `category` (kategoria widoku albo pusta), `q`, `match`.
- Stany puste: brak trafień z CTA `/ingredients/new?ingredient_name=<q>[&category=c]`; składnik bez zamienników (z kategorią / bez) z CTA jak dziś (`?ingredient=<id>[&category=c]`). Oba teksty zaczynają się od „Brak zamienników" albo „Nie znaleziono składnika".
- Dotychczasowy stan „Nie masz jeszcze żadnych składników" zostaje bez zmian.

#### 4. Powrót do widoku po oznaczeniu

**File**: `src/pages/api/substitutes/best.ts`

**Intent**: Przekierowanie wraca do tego samego widoku, także bez kategorii i z kontekstem wyszukiwania.

**Contract**: `ingredient` dalej wymagany jako UUID; `category` pusta albo UUID (inny format → `INVALID_FORM` jak dziś); `q` obcięte do 100 znaków; `match` tylko `contains|prefix`, inaczej pominięty. `listRedirect` buduje parametry w kolejności `ingredient`, `category`, `q`, `match`, a potem `notice` / `error`, pomijając puste.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Build przechodzi (przy zatrzymanym `npm run dev`): `npm run build`
- Dotychczasowy smoke przechodzi bez zmian w krokach: `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- „mąka" w trybie „zawiera" bez kategorii pokazuje listę pasujących składników; kliknięcie pokazuje sekcje per kategoria z najlepszym na górze każdej
- Przełączenie na „zaczyna się od" zawęża wynik; po ponownym wejściu na `/ingredients` przełącznik stoi na „zaczyna się od"
- „mąka" + Ciasta pokazuje tylko składniki z zamiennikami w Ciastach; przy jednym trafieniu od razu ich zamienniki
- Brak trafień pokazuje komunikat i CTA, które otwiera formularz dodawania z wpisaną nazwą (i kategorią, jeśli wybrana)
- Lista rozwijana bez kategorii pokazuje sekcje per kategoria; z kategorią działa jak wcześniej
- „Oznacz jako najlepszy" w widoku bez kategorii i w widoku z wyszukiwania wraca do tego samego widoku z tym samym `q` i trybem

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Faza 3: Smoke — kroki wyszukiwania

### Overview

Nowe kroki w `scripts/smoke.mjs` utrwalają reguły wyszukiwania, ciasteczka i izolacji.

### Changes Required:

#### 1. Kroki smoke

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć reguły, które łatwo zepsuć przy kolejnych zmianach widoku.

**Contract**: kroki na koncie A (po istniejących krokach dodawania), z unikalnymi nazwami opartymi o `runId`:
- krok „add form lists categories for account A" zapamiętuje też drugie id kategorii (`otherCategoryId`, drugie `<option value=…>`);
- konto A dodaje składnik wyszukiwania `smoke-search-${runId}` z zamiennikiem w kategorii `categoryId`. Nazwa jest rozłączna z nazwą składnika B (`smoke-ingredient-${runId}-b`), a ta zaczyna się od nazwy składnika A (`smoke-ingredient-${runId}`), więc wyszukiwanie nazwy A z konta B zawsze trafiałoby we własny składnik B. Id składnika zapamiętuje się z `location` przekierowania (`?ingredient=<id>`). Kolejne kroki szukają `smoke-search-${runId}` (fragment środkowy: `search-${runId}`);
- wyszukiwanie „zawiera" po środkowym fragmencie nazwy składnika A znajduje go;
- ten sam fragment w trybie `match=prefix` go nie znajduje (stan „Nie znaleziono składnika"), a odpowiedź ustawia ciasteczko trybu;
- kolejne `GET /ingredients?q=<fragment>` bez `match` używa trybu z ciasteczka (dalej brak trafienia);
- wyszukiwanie z kategorią `otherCategoryId`, w której składnik nie ma zamienników, go nie znajduje;
- widok `?ingredient=<id>` bez kategorii pokazuje zamiennik A;
- oznaczenie najlepszego z `q` i `match` w formularzu wraca na adres zawierający `q=`;
- konto B szukające `smoke-search-${runId}` dostaje „Nie znaleziono składnika" i w odpowiedzi nie ma id tego składnika A (nie `bodyExcludes: substituteMarker`: marker A jest prefiksem zamiennika B `smoke-substitute-${runId}-b`).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Smoke przechodzi z nowymi krokami: `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- Celowe zepsucie (np. ignorowanie `match` w serwisie) powoduje FAIL co najmniej jednego nowego kroku smoke; po cofnięciu zmiany smoke znów przechodzi

---

## Testing Strategy

### Unit Tests:

- Brak frameworka testów jednostkowych (CLAUDE.md). `matchIngredients` i `parseMatchMode` to czyste funkcje; sprawdzane przeglądem w fazie 1 i krokami smoke.

### Integration Tests:

- Smoke (faza 3): tryby dopasowania, ciasteczko, filtr kategorii, widok bez kategorii, powrót po oznaczeniu, izolacja kont.
- Bez nowych testów pgTAP: schemat i polityki się nie zmieniają.

### Manual Testing Steps:

1. Dodaj „mąka pszenna" (Ciasta, Dania mięsne) i „mąka żytnia" (tylko Dania mięsne), każdą z zamiennikami; oznacz najlepszy w obu kategoriach „mąki pszennej".
2. Szukaj „mąka" (zawiera) → oba składniki; kliknij „mąka pszenna" → dwie sekcje z najlepszym w każdej.
3. Szukaj „ąka" w trybie „zaczyna się od" → brak trafień z CTA; otwórz CTA → nazwa wpisana w formularzu.
4. Zamknij kartę, wejdź na `/ingredients` → przełącznik na „zaczyna się od".
5. Szukaj „mąka" + Ciasta → od razu zamienniki „mąki pszennej" w Ciastach.
6. W widoku bez kategorii oznacz innego najlepszego → komunikat zamiany, ten sam widok.
7. Lista rozwijana: „mąka żytnia" bez kategorii → jedna sekcja Dania mięsne.

## Performance Considerations

Dopasowanie nazwy działa w pamięci na liście, którą strona i tak pobiera dla listy rozwijanej. Filtr kategorii to jedno dodatkowe zapytanie, widok składnika też jedno (zamiast dwóch w `listSubstitutes`). Przy bazie jednego użytkownika (dziesiątki–setki składników) NFR < 1 s nie jest zagrożone.

## Migration Notes

Brak migracji bazy. Wycofanie to revert commitów; stare adresy `?ingredient&category` działają przez cały czas.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-03)
- PRD: `context/foundation/prd.md` (FR-004, FR-005, US-01, NFR, Business Logic)
- Lekcje: `context/foundation/lessons.md`
- Poprzednia zmiana (wzorzec listy, przekierowań i smoke): `context/archive/2026-10-11-best-substitute-highlight/plan.md`
- Kod: `src/pages/ingredients/index.astro`, `src/lib/services/substitutes.ts`, `src/pages/api/substitutes/best.ts`, `src/pages/ingredients/new.astro:9-12`, `scripts/smoke.mjs`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Serwis — dopasowanie, tryb, zamienniki pogrupowane

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint` — 6b39beb
- [x] 1.2 Build przechodzi (przy zatrzymanym `npm run dev`): `npm run build` — 6b39beb

#### Manual

- [x] 1.3 Przegląd kodu: `matchIngredients` dla „Mąka" w trybie „zawiera" zwraca „mąka pszenna" i „Mąka żytnia", w trybie „zaczyna się od" nie zwraca „skrobia z mąki" ani „biała mąka" — 6b39beb

### Phase 2: Strona i przekierowanie — wyszukiwanie, sekcje, ciasteczko

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — 463ab1f
- [x] 2.2 Build przechodzi (przy zatrzymanym `npm run dev`): `npm run build` — 463ab1f
- [x] 2.3 Dotychczasowy smoke przechodzi bez zmian w krokach: `BASE_URL=http://localhost:4321 npm run smoke` — 463ab1f

#### Manual

- [x] 2.4 „mąka" w trybie „zawiera" bez kategorii pokazuje listę pasujących składników; kliknięcie pokazuje sekcje per kategoria z najlepszym na górze każdej — 463ab1f
- [x] 2.5 Przełączenie na „zaczyna się od" zawęża wynik; po ponownym wejściu na `/ingredients` przełącznik stoi na „zaczyna się od" — 463ab1f
- [x] 2.6 „mąka" + Ciasta pokazuje tylko składniki z zamiennikami w Ciastach; przy jednym trafieniu od razu ich zamienniki — 463ab1f
- [x] 2.7 Brak trafień pokazuje komunikat i CTA, które otwiera formularz dodawania z wpisaną nazwą (i kategorią, jeśli wybrana) — 463ab1f
- [x] 2.8 Lista rozwijana bez kategorii pokazuje sekcje per kategoria; z kategorią działa jak wcześniej — 463ab1f
- [x] 2.9 „Oznacz jako najlepszy" w widoku bez kategorii i w widoku z wyszukiwania wraca do tego samego widoku z tym samym `q` i trybem — 463ab1f

### Phase 3: Smoke — kroki wyszukiwania

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint` — bff12e2
- [x] 3.2 Smoke przechodzi z nowymi krokami: `BASE_URL=http://localhost:4321 npm run smoke` — bff12e2

#### Manual

- [x] 3.3 Celowe zepsucie (np. ignorowanie `match` w serwisie) powoduje FAIL co najmniej jednego nowego kroku smoke; po cofnięciu zmiany smoke znów przechodzi — bff12e2
