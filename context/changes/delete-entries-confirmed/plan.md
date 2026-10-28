# Usuwanie wpisów z potwierdzeniem (S-05) — plan implementacji

## Overview

Zalogowany użytkownik usuwa własny zamiennik albo własny składnik (FR-007). Usunięcie składnika kasuje kaskadowo wszystkie jego zamienniki we wszystkich kategoriach. Każde usunięcie przechodzi przez osobną stronę potwierdzenia SSR, która pokazuje, co zniknie. Dopiero przycisk „Usuń” na tej stronie (POST) kasuje dane. Przy okazji domykamy dwa zobowiązania z wcześniejszych slice'ów: blokadę w `set_best_substitute` (F1 z S-02) i kody błędów w `ServiceResult` (F3 z `ingredients-new-ui`).

## Current State Analysis

Na podstawie `context/changes/delete-entries-confirmed/research.md`:

- **Kaskada FK już działa, brakuje polityk.**
  - Kaskada: `ingredient_categories.ingredient_id → ingredients` i `substitutes.ingredient_category_id → ingredient_categories`, obie `on delete cascade` (`supabase/migrations/20261004120000_substitute_database.sql:57,89`).
  - Polityk `DELETE` nie ma (`:3`, lokalne `pg_policies`).
  - `anon` i `authenticated` mają tabelowe `DELETE` na 4 tabelach `public` (domyślne granty Supabase). Bez polityki `DELETE` zwraca 0 wierszy bez błędu.
- **Kaskada omija RLS tabel podrzędnych.** Sprawdzone w lokalnej bazie (`begin … rollback`): polityka `DELETE` na samym `ingredients` usuwa też parę i zamiennik.
- **F1:** `set_best_substitute` czyta wiersz bez blokady (`supabase/migrations/20261011201658_best_substitute.sql:45-48`). Gdy wiersz zniknie przed `update`, funkcja zwraca sukces z nazwą nieistniejącego zamiennika. Przy oznaczaniu najlepszego zdąży też zdjąć wyróżnienie z poprzedniego (`:59-64`).
- **F3:** `ServiceResult` nie ma kodu (`src/lib/services/substitutes.ts:21`). Duplikat rozpoznają porównania tekstu w `src/pages/api/ingredients.ts:117` i `src/pages/api/substitutes/update.ts:99`.
- **Wzorce do skopiowania:**
  - endpointy akcji: `src/pages/api/substitutes/best.ts:14-60`, `update.ts`, `rename.ts`;
  - strony edycji z kontekstem widoku: `src/pages/ingredients/edit-*.astro`;
  - formularz ze stanem „nie znaleziono”: `src/components/ingredients/IngredientRenameForm.astro`;
  - „0 wierszy = nie znaleziono”: `updateSubstitute`, `renameIngredient` (`substitutes.ts:339-408`).
- **`listRedirect` zawsze ustawia `ingredient`** (`src/lib/list-view.ts:45-46`). Widok nieistniejącego składnika pokazuje mylący EmptyState „Brak zamienników dla tego składnika.” (`src/pages/ingredients/index.astro:110-116,284-291`).
- **Wariant `destructive`** ma `text-white` i warianty `dark:` (`src/components/ui/button.tsx:13-14`). Tokenu `--destructive-foreground` nie ma (`src/styles/global.css`).

## Desired End State

- **Na liście** karta zamiennika ma link „Usuń” obok „Edytuj”, a nagłówek składnika link „Usuń składnik” obok „Zmień nazwę”. Oba niosą kontekst widoku (`ingredient`, `category`, `q`, `match`) i oba prowadzą na stronę potwierdzenia, nie usuwają od razu.
- **`/ingredients/delete-substitute`** mówi, który zamiennik, którego składnika i w jakiej kategorii zniknie. Przy najlepszym zamienniku dodaje, że para zostanie bez najlepszego. Pod spodem przycisk „Usuń zamiennik” (wariant `destructive`) i „Anuluj” (powrót do widoku).
- **`/ingredients/delete-ingredient`** mówi, że zniknie składnik i N zamienników we wszystkich kategoriach, z liczbą per kategoria, np. „Ciasta: 2”, „Dania mięsne: 1”. Liczy wszystkie kategorie także wtedy, gdy widok był zawężony. Składnik bez zamienników dostaje osobny komunikat.
- **Po usunięciu zamiennika** redirect do tego samego widoku listy z `notice=Usunięto zamiennik „X”.`.
- **Po usunięciu składnika** redirect do wyników wyszukiwania (`q`, `match`, `category`), gdy widok miał `q` i to wyszukiwanie dalej coś znajduje. Inaczej (bez `q` albo 0 trafień, np. po usunięciu jedynego trafienia) na gołe `/ingredients`, żeby tuż po udanym usunięciu nie pokazywać „Nie znaleziono składnika” z przyciskiem „Dodaj składnik”. W obu przypadkach z `notice=Usunięto składnik „X”.`.
- **Cudzy, nieistniejący albo już usunięty wpis** daje przy POST powrót na listę z `error=Nie znaleziono zamiennika.` / `Nie znaleziono składnika.`, bez zmiany danych. Przy GET strona pokazuje stan „nie znaleziono” bez formularza.
- **Błąd bazy przy usuwaniu** wraca na stronę potwierdzenia z `?error=` i Alertem nad przyciskami.
- **Baza:** polityki `DELETE` (własne wiersze) na `ingredients` i `substitutes`, `anon` bez `DELETE`, 3 indeksy FK, `set_best_substitute` z `select … for update`.
- **Endpointy** rozpoznają duplikat i „nie znaleziono” po `result.code`, nie po tekście.

### Key Discoveries:

- `delete().eq("id", …).select("name").maybeSingle()` zwraca `data: null` bez błędu, gdy RLS ukrywa wiersz. To ten sam mechanizm co przy `update` w S-04 (`substitutes.ts:345-360`). PostgREST potrzebuje do tego polityki SELECT, a ta już jest.
- `select … for update` w funkcji `security invoker` wymaga uprawnienia UPDATE na choć jednej kolumnie i przejścia polityki UPDATE `using`. `authenticated` ma `update (is_best, name, ratio, notes)`, a `substitutes_update_own` ma ten sam predykat co SELECT (`20261011201658_best_substitute.sql:21-27`, `20261021120000_edit_entries.sql:26`).
- Kaskada z `ingredients` korzysta z istniejących indeksów unikalnych (`ingredient_categories (ingredient_id, category_id)`, `substitutes (ingredient_category_id, name_key)`). Nowe indeksy FK zamykają odłożone F7 (`context/archive/2026-10-04-first-substitute-lookup/reviews/impl-review.md:108-110`) i przyspieszają kaskadę z `auth.users`.
- Smoke szuka id zamiennika przez pierwszy `name="substitute_id"` za `>nazwa<` (`scripts/smoke.mjs:55-59`). Linki „Usuń” to GET z parametrem `substitute=`, więc kontraktu nie ruszają, pod warunkiem że nazwa nie trafi do treści linku, tylko do `aria-label` (`SubstituteCard.astro:11-16`).
- `listIngredientSubstitutes(client, id, null)` (`substitutes.ts:210-243`) daje grupy per kategoria, posortowane po `sort_order`, bez pustych par. Wystarcza do licznika na stronie potwierdzenia.
- Kitchen-sink renderuje komponenty formularzy na fixturach (np. `SubstituteEditForm`), więc treść stron potwierdzenia trafia do komponentów w `src/components/ingredients/`. Ten katalog jest już w `GUARDED` przez glob (`scripts/ui-literals.mjs:16`).

## What We're NOT Doing

- Sprzątanie pustych par `ingredient_categories` po usunięciu ostatniego zamiennika. Widoki je pomijają (`substitutes.ts:187-190,227`), więc nie dodajemy polityki `DELETE` na parach.
- Usuwanie z poziomu stron edycji, usuwanie wielu wpisów naraz, kosz i cofnięcie.
- Okno `confirm()`, `<dialog>` ani żaden JavaScript po stronie klienta.
- Odbieranie `DELETE` roli `authenticated` na `ingredient_categories` i `categories`. Bez polityki RLS i tak odrzuca każdy wiersz, a kaskada nie potrzebuje grantu użytkownika.
- Przegląd pozostałych wariantów `buttonVariants` (`outline`, `ghost` też mają `dark:`). Poprawiamy tylko `destructive`, którego używamy.
- Strojenie dark mode poza nowym tokenem (dark mode jest odłożony, `global.css:79`).
- Automatyczny test współbieżności blokady. Weryfikujemy ją ręcznie w dwóch sesjach psql.
- Zmiana tekstów komunikatów duplikatu i „nie znaleziono”.

## Implementation Approach

Kolejność „baza → serwis → widoki”. Faza 1 otwiera usuwanie w bazie razem z blokadą F1, żeby nigdy nie istniał stan z polityką `DELETE`, a bez `for update`. Faza 2 przygotowuje serwis i kontrakt błędów, a istniejące endpointy przechodzą na kody bez zmiany zachowania (smoke bez zmian). Fazy 3 i 4 to dwa pionowe przyrosty: najpierw prostszy zamiennik, który wprowadza token, wariant `destructive` i wzór strony potwierdzenia, potem składnik z licznikiem i innym powrotem.

Nazewnictwo powiela S-04: strony `/ingredients/delete-substitute?substitute=<id>&…` i `/ingredients/delete-ingredient?ingredient_id=<id>&…`, endpointy `POST /api/substitutes/delete` i `POST /api/ingredients/delete`.

## Critical Implementation Details

- **Kolejność w migracji:** `create or replace function set_best_substitute` musi być w tej samej migracji co polityki `DELETE`. `create or replace` zachowuje granty `execute` i sygnaturę, więc `revoke`/`grant` z `20261011201658_best_substitute.sql:79-80` nie trzeba powtarzać.
- **Środowisko lokalne:** `npm run build` i `npx astro check` przy działającym `npm run dev` psują dev (500 z `deps_ssr`). Edycja przez Edit w `src/pages/` przy działającym dev potrafi go zabić (ENOENT `*.tmp.*`). Typy sprawdzaj po smoke, przy zatrzymanym dev. Pliki w `src/pages/` zapisuj w miejscu albo zatrzymaj dev na czas edycji.
- **Baza lokalna:** migrację wprowadzaj przez `npx supabase migration up`, nie `db reset` (reset kasuje dane lokalne).

## Faza 1: Baza — polityki DELETE, blokada F1, granty i indeksy

### Overview

Migracja otwiera usuwanie własnych wierszy, zamyka F1, odbiera `DELETE` roli `anon` i dodaje indeksy FK. Nowy test pgTAP pinuje kontrakt, a ręczny test w dwóch sesjach sprawdza blokadę.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_delete_entries.sql` (znacznik czasu z chwili tworzenia, późniejszy niż `20261021120000`)

**Intent**: Pozwolić `authenticated` usuwać własne składniki (kaskada zabiera pary i zamienniki) i własne zamienniki. Zablokować wyścig usuwania z `set_best_substitute`. Nagłówek w stylu `20261021120000_edit_entries.sql:1-21` wyjaśnia, czego nie robimy (polityka na parach, `authenticated` na `categories`) i zawiera rollback.

**Contract**:
- `create policy "ingredients_delete_own" on public.ingredients for delete to authenticated using (user_id = (select auth.uid()))`
- `create policy "substitutes_delete_own" on public.substitutes for delete to authenticated using (user_id = (select auth.uid()))`
- `revoke delete on public.ingredients, public.ingredient_categories, public.substitutes, public.categories from anon`
- indeksy: `ingredient_categories_user_id_idx (user_id)`, `ingredient_categories_category_id_idx (category_id)`, `substitutes_user_id_idx (user_id)`
- `create or replace function public.set_best_substitute(p_substitute_id uuid, p_is_best boolean)`: ta sama sygnatura, `security invoker`, `search_path = ''` i ciało. Jedyna zmiana to `for update` w odczycie z `:45-48`, z komentarzem, że współbieżne usunięcie czeka albo daje `P0002`.
- rollback w komentarzu: przywrócenie ciała bez `for update`, `drop index` ×3, `grant delete … to anon`, `drop policy` ×2.

#### 2. Test nowy

**File**: `supabase/tests/delete-entries.sql`

**Intent**: Pinować kontrakt usuwania w stylu `supabase/tests/edit-entries.sql`: setup jako `postgres`, potem `set local role authenticated` z `request.jwt.claims`.

**Contract**: asercje (liczba w `plan(N)` dopasowana do końcowej listy):
- A usuwa własny zamiennik: wiersz znika, para i pozostałe zamienniki zostają;
- A usuwa własny składnik w 2 kategoriach: znikają jego pary i wszystkie zamienniki, a drugi składnik A zostaje nietknięty;
- B usuwa wiersze A (`ingredients`, `substitutes`): 0 wierszy, bez błędu, dane A bez zmian (sprawdzone jako A albo `postgres`);
- A usuwa własną parę wprost z `ingredient_categories`: 0 wierszy (brak polityki);
- `anon` usuwa z `ingredients`: `throws_ok` z `42501`;
- `set_best_substitute` na usuniętym zamienniku: `throws_ok` z `P0002`;
- `pg_get_functiondef('public.set_best_substitute(uuid, boolean)'::regprocedure)` zawiera `for update` (strażnik regresji F1).

#### 3. Ręczny test blokady

**File**: brak (procedura w Manual Verification)

**Intent**: Potwierdzić, że `for update` serializuje oznaczanie i usuwanie. pgTAP działa w jednej sesji, więc tego nie sprawdzi. Błąd F1 odróżnia od poprawki tylko scenariusz (b): w (a) UPDATE w funkcji blokuje wiersz także bez `for update`.

**Contract**:
- **Dostęp:** lokalnie nie ma `psql`, więc każda sesja to `docker exec -it supabase_db_10x-astro-starter psql -U postgres`.
- **Dane testowe** zatwierdza wcześniej rola `postgres` (druga sesja nie widzi niezatwierdzonych danych): testowy użytkownik w `auth.users`, jego składnik, para i dwa zamienniki, z których jeden ma `is_best = true`. Każdy scenariusz zaczyna od świeżego zestawu.
- **Sesje:** w obu `set role authenticated` i `set request.jwt.claims = '{"sub":"<user id>","role":"authenticated"}'` tego samego użytkownika.
- **(b) przed migracją (punkt odniesienia),** uruchamiane przed `npx supabase migration up`. `authenticated` nie ma jeszcze polityki `DELETE`, więc sesja 2 usuwa jako `postgres` (bez `set role`). Sesja 2: `begin; delete from public.substitutes where id = <id zwykłego>;` bez commit. Sesja 1: `select * from public.set_best_substitute(<id zwykłego>, true);` czeka. Commit w sesji 2. Sesja 1 zwraca sukces z nazwą usuniętego zamiennika, a poprzedni najlepszy traci wyróżnienie (to jest błąd F1).
- **(b) po migracji:** te same kroki, z `delete` jako `authenticated`. Sesja 1 dostaje `P0002`, a poprzedni najlepszy zostaje najlepszym.
- **(a) po migracji (zwykłe sprawdzenie):** sesja 1: `begin; select * from public.set_best_substitute(<id>, true);` bez commit. Sesja 2: `delete from public.substitutes where id = <id>` czeka. Commit w sesji 1, wtedy sesja 2 kończy z 1 wierszem.
- **Sprzątanie:** `delete from auth.users where id = <user id>` jako `postgres` (kaskada zabiera składnik, parę i zamienniki).

### Success Criteria:

#### Automated Verification:

- Migracja wchodzi na lokalną bazę: `npx supabase migration up`
- Testy bazy przechodzą, w tym nowy `delete-entries.sql` i niezmienione `best-substitute.sql`, `edit-entries.sql`, `rls-isolation.sql`: `npx supabase test db`
- W lokalnej bazie `pg_policies` pokazuje `ingredients_delete_own` i `substitutes_delete_own` (cmd `DELETE`), a `has_table_privilege('anon', …, 'DELETE')` daje `f` na 4 tabelach `public`

#### Manual Verification:

- Ręczny test blokady, scenariusz (a) po migracji: usunięcie czeka na commit oznaczenia
- Ręczny test blokady, scenariusz (b): przed migracją oznaczenie po zatwierdzonym usunięciu zwraca fałszywy sukces, po migracji kończy się `P0002`, a poprzedni najlepszy zachowuje wyróżnienie
- Przegląd migracji: nagłówek wyjaśnia, czego nie robimy, i zawiera rollback

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na potwierdzenie weryfikacji ręcznej, zanim przejdziesz dalej.

---

## Faza 2: Serwis i kontrakt błędów

### Overview

`ServiceResult` dostaje kod błędu (F3). Istniejące endpointy przechodzą z porównywania tekstu na kod bez zmiany zachowania. Serwis dostaje funkcje usuwania, a `list-view.ts` powrót po usunięciu składnika.

### Changes Required:

#### 1. Kod błędu w `ServiceResult`

**File**: `src/lib/services/substitutes.ts`

**Intent**: Endpoint rozpoznaje rodzaj błędu po kodzie, a tekst służy tylko do wyświetlenia. Zamyka F3 (`context/archive/2026-10-22-ingredients-new-ui/follow-ups/review-fixes.md:11-15`).

**Contract**:
- `export type ServiceErrorCode = "duplicate" | "not_found"`
- gałąź błędu: `{ data: null; error: string; code?: ServiceErrorCode }`
- `fail(error?, code?)`
- kod `duplicate` ustawiają: `addSubstitute` (`:160`), `updateSubstitute` (`:357`), `renameIngredient` (`:403`);
- kod `not_found` ustawiają: `setBestSubstitute` (P0002, `:264`), `updateSubstitute` (`:360`), `renameIngredient` (`:406`) i nowe funkcje usuwania;
- teksty komunikatów bez zmian;
- komentarz przy `duplicateSubstituteMessage` (`:89-90`) przestaje mówić o porównywaniu w endpointach.

#### 2. Endpointy przepięte na kod

**File**: `src/pages/api/ingredients.ts`, `src/pages/api/substitutes/update.ts`

**Intent**: `error_field` dla duplikatu wynika z `result.code === "duplicate"`, nie z porównania z `duplicateSubstituteMessage(...)`. Import `duplicateSubstituteMessage` znika z obu plików.

**Contract**: `ingredients.ts:117` daje `errorField = "substitute"`, a `update.ts:99` daje `"name"`, wyłącznie przy `code === "duplicate"`.

#### 3. Funkcje usuwania

**File**: `src/lib/services/substitutes.ts`

**Intent**: Usunięcie po id z RLS. Brak wiersza (cudzy, nieistniejący, już usunięty) to „nie znaleziono”, nie sukces.

**Contract**:
- `deleteSubstitute(client, substituteId): Promise<ServiceResult<{ name: string }>>`: `delete().eq("id", …).select("name").maybeSingle()`; brak danych daje `fail("Nie znaleziono zamiennika.", "not_found")`.
- `deleteIngredient(client, ingredientId): Promise<ServiceResult<{ name: string }>>`: to samo z „Nie znaleziono składnika.”. Doc comment mówi, że kaskada FK zabiera pary i zamienniki ze wszystkich kategorii.
- Wywołujący sprawdza id przez `isUuid` przed wywołaniem.

#### 4. Odmiana liczby zamienników

**File**: `src/lib/services/substitutes.ts` (obok `bestSwapNotice`)

**Intent**: Tekst „N zamiennik/zamienniki/zamienników” na stronie potwierdzenia składnika.

**Contract**: `substituteCount(n: number): string` daje „1 zamiennik”, „2 zamienniki”, „5 zamienników”, „12 zamienników”, „22 zamienniki”. Reguła: `n === 1` daje „zamiennik”; `n % 10` w 2–4 przy `n % 100` poza 12–14 daje „zamienniki”; reszta (w tym 0) daje „zamienników”.

#### 5. Powrót po usunięciu składnika

**File**: `src/lib/list-view.ts`, `src/lib/services/substitutes.ts`

**Intent**: Widok usuniętego składnika już nie istnieje, więc powrót idzie do wyszukiwania, z którego użytkownik przyszedł, o ile ono dalej coś znajduje, a inaczej na gołą listę. `searchRedirect` tylko buduje URL. O tym, czy wyszukiwanie ma jeszcze trafienia, decyduje endpoint przez `hasSearchHits` (Faza 4 #3).

**Contract**:
- `searchRedirect(view: ListView | null, extra: Record<string, string> = {}): string`:
  - przy `view?.q`: `/ingredients?q=…&match=…[&category=…]` z pominięciem pustych wartości, potem `extra`. Kolejność jak `backHref` w `index.astro:168-171`.
  - bez `q` (także `view === null`): `/ingredients` z samym `extra` (bez `category`, które bez `q` nie ma znaczenia).
  - nigdy nie ustawia `ingredient`.
- `hasSearchHits(client, query: string, mode: MatchMode, categoryId: string | null): Promise<ServiceResult<boolean>>` w serwisie: te same reguły co wyszukiwanie w `index.astro:99-107`, czyli `listIngredients` + `matchIngredients(query, mode)`, a przy `categoryId` filtr przez `listIngredientIdsWithSubstitutes`. `index.astro` zostaje bez zmian (i tak potrzebuje pełnych list do formularzy).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Grep po `src/` nie znajduje porównań `=== duplicateSubstituteMessage(`
- Smoke przechodzi bez zmian w krokach, w tym kroki duplikatu przy dodawaniu i edycji (`error_field`): `BASE_URL=http://localhost:4321 npm run smoke`
- Typy przechodzą przy zatrzymanym dev, uruchomione po smoke: `npx astro check`

#### Manual Verification:

- Przegląd: każde `fail(...)` z tekstem duplikatu albo „Nie znaleziono …” ma odpowiedni kod, a żaden konsument `ServiceResult` nie porównuje już `result.error` z tekstem

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na potwierdzenie weryfikacji ręcznej, zanim przejdziesz dalej.

---

## Faza 3: Usuwanie zamiennika end-to-end

### Overview

Token i wariant `destructive`, komponent i strona potwierdzenia, endpoint, link w karcie, kitchen-sink i smoke.

### Changes Required:

#### 1. Token `--destructive-foreground` i wariant `destructive`

**File**: `src/styles/global.css`, `src/components/ui/button.tsx`

**Intent**: Pełny przycisk destrukcyjny na tokenach, bez literałów i `dark:` (kontrakt `## UI` w `CLAUDE.md`).

**Contract**:
- `--destructive-foreground`: w `:root` biel jak pozostałe `*-foreground` (`oklch(0.985 0 0)`), w `.dark` ciemny jak `--primary-foreground` w `.dark` (`oklch(0.205 0 0)`), bo `--destructive` jest tam jasny;
- `--color-destructive-foreground` w `@theme inline`;
- komentarz nad `:root` wymienia nowy token;
- wariant `destructive` = `bg-destructive text-destructive-foreground shadow-xs hover:bg-destructive/90`, bez `text-white`, `dark:` i własnego ringu (focus daje `focusRing` przez `cn()`);
- kontrast tekstu do tła ≥ 4.5:1 w obu motywach (sprawdzenie w Manual Verification).

#### 2. Komponent potwierdzenia

**File**: `src/components/ingredients/SubstituteDeleteConfirm.astro`

**Intent**: Treść strony potwierdzenia (także dla kitchen-sink) na wzór `IngredientRenameForm.astro`. Przy `substitute === null` stan „nie znaleziono” (EmptyState „Nie znaleziono zamiennika.” + „Wróć do listy”), bez formularza i bez Alertu błędu.

**Contract**:
- Props: `substitute: SubstituteForEdit | null`, `view: ListView | null`, `error?: string | null`;
- treść: „Usuniesz zamiennik „{name}” składnika „{ingredientName}” w kategorii „{categoryName}”.”, przy `is_best` dodatkowo „To najlepszy zamiennik w tej kategorii. Po usunięciu kategoria zostanie bez najlepszego.”, na końcu „Tej operacji nie można cofnąć.”;
- `error` jako `Alert variant="destructive"` nad formularzem;
- formularz `POST /api/substitutes/delete` z ukrytymi `substitute_id`, `ingredient`, `category`, `q`, `match`;
- „Usuń zamiennik” = `buttonVariants({ variant: "destructive" })` + `focusRing`; „Anuluj” = link `outline` do `listRedirect(view)`.

#### 3. Strona potwierdzenia

**File**: `src/pages/ingredients/delete-substitute.astro`

**Intent**: Kopia schematu `edit-substitute.astro`: odczyt przez `getSubstituteForEdit`, `isUuid` przed zapytaniem, `loadError` daje Alert, widok z URL albo zapasowy widok własnego składnika, `IngredientsFooter`.

**Contract**:
- `GET ?substitute=<id>[&ingredient&category&q&match][&error=<msg>]`;
- `<Layout title="Usuń zamiennik">`, `h1` „Usuń zamiennik”;
- chroniona przez middleware (prefiks `/ingredients`).

#### 4. Endpoint

**File**: `src/pages/api/substitutes/delete.ts`

**Intent**: Szkielet z `src/pages/api/substitutes/best.ts:14-60`: kolejno null klient, brak użytkownika, `formData()` w try/catch, `parseListView`, `isUuid`, wywołanie serwisu.

**Contract**:
- sukces: `listRedirect(view, { notice: "Usunięto zamiennik „{name}”." })`;
- `code === "not_found"` (także zły uuid): `listRedirect(view, { error: "Nie znaleziono zamiennika." })`, bez `error_for`, bo karty już nie ma;
- inny błąd: redirect na `/ingredients/delete-substitute?substitute=<id>&<view>&error=<msg>`, kolejność jak w `formRedirect` z `update.ts`;
- null klient, zły formularz, brak widoku: jak w `best.ts`.

#### 5. Link w karcie

**File**: `src/components/ingredients/SubstituteCard.astro`

**Intent**: Link „Usuń” za „Edytuj”, z tym samym kontekstem widoku co `editHref`.

**Contract**:
- `href=/ingredients/delete-substitute?substitute=<id>&ingredient&category&q&match` (puste wartości pominięte);
- `buttonVariants({ variant: "outline", size: "sm" })` + `focusRing` + tekst w tokenie `destructive` także na hover, łączone przez `cn()`;
- `aria-label="Usuń: {name}"`; nazwa nie trafia do treści linku;
- link bez `name="substitute_id"`; komentarz kontraktu ze smoke (`:10-15`) wymienia nowy link;
- trzy przyciski zawijają się w `flex-wrap` bez poziomego scrolla przy szerokości telefonu.

#### 6. Kontrakt UI

**File**: `scripts/ui-literals.mjs`, `src/pages/dev/kitchen-sink.astro`

**Intent**: Nowa strona pod strażnikiem literałów, nowe stany w kitchen-sink (`CLAUDE.md`, `## UI`).

**Contract**:
- `GUARDED` += `src/pages/ingredients/delete-substitute.astro` (komponent łapie istniejący glob);
- kitchen-sink, sekcja „Przyciski”: przycisk `destructive` (zwykły, `sm`, disabled);
- kitchen-sink, nowa sekcja „Widok /ingredients/delete-substitute” na fixturach: zwykły zamiennik, najlepszy zamiennik, z błędem usuwania, „nie znaleziono”;
- kitchen-sink, nowa matryca 7 stanów widoków potwierdzenia (wspólna dla fazy 3 i 4, w fazie 4 uzupełniana o składnik), w formacie `stateMatrix`;
- karta zamiennika w sekcji „Widok /ingredients” pokazuje link „Usuń”.

#### 7. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Kroki end-to-end usuwania zamiennika. Kroki konta B stoją w bloku B, przed usunięciami A. Usunięcia A stoją po ostatnim użyciu celu i przed `signout`.

**Contract**: helper `deleteSubstituteForm(substituteId, path = listPath)` z kontekstem jak `bestForm`. Kroki:
- A: GET strony potwierdzenia dla `secondSubstituteId` daje 200, nazwę i `action="/api/substitutes/delete"`;
- B: GET strony potwierdzenia dla `firstSubstituteId` daje „Nie znaleziono zamiennika.” i nie zawiera formularza;
- B: POST usunięcia `firstSubstituteId` z `listPathB` daje 302 na `listPathB` z `error=Nie+znaleziono+zamiennika.`;
- A: POST usunięcia `secondSubstituteId` daje 302 na `listPath` z `notice=Usuni%C4%99to+zamiennik`;
- A: GET `listPath` nie zawiera `>secondSubstitute<`, zawiera nazwę pierwszego zamiennika;
- A: ponowny POST tego samego daje `error=Nie+znaleziono+zamiennika.`.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Skan literałów UI przechodzi z nową stroną w `GUARDED`: `npm run lint:ui`
- Smoke przechodzi z nowymi krokami fazy 3 i bez zmian w istniejących krokach: `BASE_URL=http://localhost:4321 npm run smoke`
- Typy przechodzą przy zatrzymanym dev, uruchomione po smoke: `npx astro check`
- Testy bazy dalej przechodzą: `npx supabase test db`

#### Manual Verification:

- Każdy nowy krok smoke fazy 3 został raz celowo zepsuty (np. zmieniony oczekiwany komunikat) i wtedy zawiódł
- W przeglądarce: „Usuń” z widoku bez kategorii, z kategorią i z wyników wyszukiwania prowadzi na potwierdzenie, a „Anuluj” i usunięcie wracają do tego samego widoku
- Usunięcie najlepszego zamiennika: potwierdzenie mówi o utracie najlepszego, a po usunięciu kategoria nie ma znaczka „Najlepszy”
- Kitchen-sink: przycisk `destructive` ma kontrast tekstu ≥ 4.5:1 i widoczny focus (pełny ring) w motywie jasnym i ciemnym (ciemny przez klasę `dark` na `<html>` w devtools, bo nic jej nie włącza; kontrast można też policzyć z tokenów: `oklch(0.985 0 0)` na `oklch(0.505 0.213 27.518)` i `oklch(0.205 0 0)` na `oklch(0.704 0.191 22.216)`); karta z trzema przyciskami zawija się bez poziomego scrolla przy 360 px

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na potwierdzenie weryfikacji ręcznej, zanim przejdziesz dalej.

---

## Faza 4: Usuwanie składnika end-to-end

### Overview

Komponent i strona potwierdzenia z licznikiem per kategoria, endpoint z powrotem do wyszukiwania, link przy nagłówku, kitchen-sink i smoke.

### Changes Required:

#### 1. Komponent potwierdzenia

**File**: `src/components/ingredients/IngredientDeleteConfirm.astro`

**Intent**: Pokazać pełny zasięg kaskady, wszystkie kategorie bez względu na widok. Przy `ingredient === null` stan „nie znaleziono” jak w fazie 3.

**Contract**:
- Props: `ingredient: IngredientListItem | null`, `groups: SubstituteGroup[]`, `view: ListView | null`, `error?: string | null`;
- przy N > 0: „Usuniesz składnik „{name}” i {substituteCount(N)} we wszystkich kategoriach:”, potem lista „{kategoria}: {liczba}” w kolejności `groups`;
- przy N = 0: „Usuniesz składnik „{name}”. Nie ma zapisanych zamienników.”;
- na końcu „Tej operacji nie można cofnąć.”;
- formularz `POST /api/ingredients/delete` z ukrytymi `ingredient_id`, `ingredient`, `category`, `q`, `match`;
- „Usuń składnik” (`destructive`) i „Anuluj” (`outline`, `listRedirect(view)`).

#### 2. Strona potwierdzenia

**File**: `src/pages/ingredients/delete-ingredient.astro`

**Intent**: Schemat `edit-ingredient.astro`. Gdy składnik istnieje, strona pobiera jeszcze `listIngredientSubstitutes(supabase, id, null)`. Błąd któregokolwiek odczytu daje Alert `loadError` bez formularza, bo bez znanego zasięgu nie ma świadomego potwierdzenia.

**Contract**:
- `GET ?ingredient_id=<id>[&ingredient&category&q&match][&error=<msg>]`;
- `<Layout title="Usuń składnik">`, `h1` „Usuń składnik”;
- zapasowy widok jak w `edit-ingredient.astro:40-47`.

#### 3. Endpoint

**File**: `src/pages/api/ingredients/delete.ts`

**Intent**: Szkielet jak w fazie 3, z powrotem przez `searchRedirect`, bo widok składnika przestaje istnieć. Po udanym usunięciu z `q` endpoint sprawdza, czy wyszukiwanie dalej coś znajduje, żeby nie odesłać na „Nie znaleziono składnika”.

**Contract**:
- sukces bez `view.q`: `searchRedirect(view, { notice: "Usunięto składnik „{name}”." })`, czyli gołe `/ingredients?notice=…`;
- sukces z `view.q`: `hasSearchHits(supabase, view.q, mode, view.category || null)`, gdzie `mode` = `parseMatchMode(view.match)` ?? cookie `MATCH_MODE_COOKIE` ?? `"contains"` (jak w `index.astro:42-44`). `true` daje `searchRedirect(view, { notice })`; `false` daje `searchRedirect(null, { notice })`; błąd sprawdzenia daje `searchRedirect(view, { notice })` (usunięcie już się udało, więc żadnego `error`);
- `code === "not_found"` (także zły uuid): `searchRedirect(view, { error: "Nie znaleziono składnika." })`;
- inny błąd: `/ingredients/delete-ingredient?ingredient_id=<id>&<view>&error=<msg>`;
- null klient, zły formularz, brak widoku: `listRedirect(null, { error })` jak w `rename.ts`.

#### 4. Link przy nagłówku

**File**: `src/pages/ingredients/index.astro`

**Intent**: „Usuń składnik” obok „Zmień nazwę”, z tym samym kontekstem co `renameHref` (`:176-184`), także z wyszukiwania z jednym trafieniem.

**Contract**:
- `deleteHref=/ingredients/delete-ingredient?ingredient_id&ingredient&category&q&match`;
- `textLinkClass` + tekst w tokenie `destructive`, przez `cn()`;
- `aria-label="Usuń składnik: {name}"`;
- `h2` dalej zawiera samą nazwę (kontrakt smoke, `:275`);
- komentarz przy `notice`/`error` (`:34`) wymienia nowe endpointy.

#### 5. Kontrakt UI

**File**: `scripts/ui-literals.mjs`, `src/pages/dev/kitchen-sink.astro`

**Intent**: Jak w fazie 3, dla widoku składnika.

**Contract**:
- `GUARDED` += `src/pages/ingredients/delete-ingredient.astro`;
- kitchen-sink, sekcja „Widok /ingredients/delete-ingredient” na fixturach: składnik w 2 kategoriach (np. 2 + 1), składnik bez zamienników, z błędem usuwania, „nie znaleziono”;
- matryca 7 stanów widoków potwierdzenia uzupełniona o składnik;
- nagłówek w sekcji „Widok /ingredients” pokazuje „Usuń składnik”.

#### 6. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Kaskada, izolacja i oba warianty powrotu. Usuwamy przemianowany składnik wyszukiwania (zamienniki w dwóch kategoriach), a na koniec główny składnik A (powrót bez `q`). Kroki B stoją w bloku B, przed usunięciami A, i po kroku „account B search does not find account A's ingredient”.

**Contract**: helper `deleteIngredientForm(ingredientId, context = {})` jak `renameForm`. Id głównego składnika A pochodzi z parametru `ingredient` w `listPath`. Kroki:
- A: GET potwierdzenia dla `searchIngredientId` z `q=searchFragment` daje 200, „2 zamienniki” i nazwy obu kategorii;
- B: POST usunięcia `searchIngredientId` daje 302 z `error=Nie+znaleziono+sk%C5%82adnika.`, potem A: GET widoku składnika dalej pokazuje `foundSubstitute`;
- A: POST usunięcia `searchIngredientId` z kontekstem `q=<runId>&match=contains` (wyszukiwanie dalej trafia w główny składnik A) daje 302 na `/ingredients?q=<runId>&match=contains&notice=Usuni%C4%99to+sk%C5%82adnik…`, bez `ingredient=`;
- A: GET tej lokalizacji daje notice i nagłówek `>smoke-ingredient-<runId><` (widok jedynego trafienia);
- A: GET `/ingredients/delete-substitute?substitute=<foundSubstituteId>` daje „Nie znaleziono zamiennika” (kaskada widziana po id zamiennika, nie przez listę składników);
- A: POST usunięcia głównego składnika A z kontekstem `q=searchFragment` (0 trafień) daje 302 dokładnie na `/ingredients?notice=…`, bez `q=`, a GET tej lokalizacji daje notice i stan „Nie masz jeszcze żadnych składników”.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Skan literałów UI przechodzi z obiema stronami w `GUARDED`: `npm run lint:ui`
- Smoke przechodzi z nowymi krokami fazy 4 i krokami fazy 3: `BASE_URL=http://localhost:4321 npm run smoke`
- Typy przechodzą przy zatrzymanym dev, uruchomione po smoke: `npx astro check`
- Build przechodzi przy zatrzymanym dev: `npm run build`
- Testy bazy dalej przechodzą: `npx supabase test db`

#### Manual Verification:

- Każdy nowy krok smoke fazy 4 został raz celowo zepsuty i wtedy zawiódł
- W przeglądarce: „Usuń składnik” z widoku zawężonego do kategorii pokazuje licznik wszystkich kategorii; po usunięciu z wyników wyszukiwania, które dalej coś znajduje, powrót trafia do wyników, a po usunięciu jedynego trafienia albo z widoku bez `q` na gołą listę z komunikatem
- Kitchen-sink: oba widoki potwierdzenia we wszystkich stanach z matrycy, zrzut ekranu jasnego motywu bez poziomego scrolla przy 360 px

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na potwierdzenie weryfikacji ręcznej, zanim przejdziesz dalej.

---

## Testing Strategy

### Unit Tests:

- Brak frameworka testów jednostkowych. `substituteCount` i `searchRedirect` sprawdzają pośrednio kroki smoke (licznik „2 zamienniki”, lokalizacje po usunięciu) i fixtury kitchen-sink.

### Integration Tests:

- pgTAP `supabase/tests/delete-entries.sql`: polityki, kaskada, izolacja A/B, brak polityki na parach, odmowa `anon`, `P0002` po usunięciu, strażnik `for update`.
- Smoke: strony potwierdzenia (wpis własny, cudzy), usunięcie zamiennika i składnika, ponowny POST, izolacja B, oba warianty powrotu, kaskada widoczna na liście.

### Manual Testing Steps:

1. Dwie sesje psql: scenariusze (a) i (b) blokady z fazy 1.
2. Usunięcie zamiennika z trzech rodzajów widoku i powrót do każdego z nich.
3. Usunięcie najlepszego zamiennika: komunikat na potwierdzeniu i brak znaczka po usunięciu.
4. Usunięcie składnika z widoku zawężonego do kategorii: licznik pokazuje wszystkie kategorie.
5. Podwójne kliknięcie „Usuń” (albo druga karta przeglądarki): drugi POST daje „Nie znaleziono …”.
6. Kitchen-sink: kontrast i focus przycisku `destructive` w obu motywach, zawijanie karty przy 360 px.

## Performance Considerations

Usunięcie to jeden DELETE po kluczu głównym. Kaskada idzie po istniejących indeksach unikalnych. Strona potwierdzenia składnika robi dwa odczyty (składnik i jego zamienniki). Endpoint usuwania składnika z `q` robi po usunięciu jeszcze jeden albo dwa odczyty (`hasSearchHits`). Wpływu na NFR (< 1 s) nie ma. Indeksy FK są małe i przyspieszają kaskadę z `auth.users`.

## Migration Notes

- Migracja nie zmienia danych: dodaje polityki, indeksy i blokadę w funkcji, odbiera grant `anon`.
- Lokalnie: `npx supabase migration up`. Na prod: `npx supabase db push` przed merge PR (CI deployuje tylko Workera, `README.md`).
- Rollback w komentarzu migracji (faza 1). Po rollbacku polityk endpointy usuwania zwracają „Nie znaleziono …” (0 wierszy), więc aplikacja nie wpada w 500.

## References

- Research: `context/changes/delete-entries-confirmed/research.md`
- F1: `context/archive/2026-10-11-best-substitute-highlight/reviews/impl-review.md:45-62`, `context/foundation/roadmap.md:126`
- F3: `context/archive/2026-10-22-ingredients-new-ui/follow-ups/review-fixes.md:11-15`
- Wzorzec stron i endpointów edycji: `context/archive/2026-10-17-edit-entries/plan.md`, `src/pages/ingredients/edit-ingredient.astro`, `src/pages/api/ingredients/rename.ts`
- Wzorzec testu pgTAP: `supabase/tests/edit-entries.sql`
- FR-007: `context/foundation/prd.md:100-105`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza — polityki DELETE, blokada F1, granty i indeksy

#### Automated

- [x] 1.1 Migracja wchodzi na lokalną bazę: `npx supabase migration up` — 13378a1
- [x] 1.2 Testy bazy przechodzą, w tym nowy `delete-entries.sql` i niezmienione `best-substitute.sql`, `edit-entries.sql`, `rls-isolation.sql`: `npx supabase test db` — 13378a1
- [x] 1.3 W lokalnej bazie `pg_policies` pokazuje `ingredients_delete_own` i `substitutes_delete_own` (cmd `DELETE`), a `has_table_privilege('anon', …, 'DELETE')` daje `f` na 4 tabelach `public` — 13378a1

#### Manual

- [x] 1.4 Ręczny test blokady, scenariusz (a) po migracji: usunięcie czeka na commit oznaczenia — 13378a1
- [x] 1.5 Ręczny test blokady, scenariusz (b): przed migracją oznaczenie po zatwierdzonym usunięciu zwraca fałszywy sukces, po migracji kończy się `P0002`, a poprzedni najlepszy zachowuje wyróżnienie — 13378a1
- [x] 1.6 Przegląd migracji: nagłówek wyjaśnia, czego nie robimy, i zawiera rollback — 13378a1

### Phase 2: Serwis i kontrakt błędów

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — 4044061
- [x] 2.2 Grep po `src/` nie znajduje porównań `=== duplicateSubstituteMessage(` — 4044061
- [x] 2.3 Smoke przechodzi bez zmian w krokach, w tym kroki duplikatu przy dodawaniu i edycji (`error_field`): `BASE_URL=http://localhost:4321 npm run smoke` — 4044061
- [x] 2.4 Typy przechodzą przy zatrzymanym dev, uruchomione po smoke: `npx astro check` — 4044061

#### Manual

- [x] 2.5 Przegląd: każde `fail(...)` z tekstem duplikatu albo „Nie znaleziono …” ma odpowiedni kod, a żaden konsument `ServiceResult` nie porównuje już `result.error` z tekstem — 4044061

### Phase 3: Usuwanie zamiennika end-to-end

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint` — 693b2fe
- [x] 3.2 Skan literałów UI przechodzi z nową stroną w `GUARDED`: `npm run lint:ui` — 693b2fe
- [x] 3.3 Smoke przechodzi z nowymi krokami fazy 3 i bez zmian w istniejących krokach: `BASE_URL=http://localhost:4321 npm run smoke` — 693b2fe
- [x] 3.4 Typy przechodzą przy zatrzymanym dev, uruchomione po smoke: `npx astro check` — 693b2fe
- [x] 3.5 Testy bazy dalej przechodzą: `npx supabase test db` — 693b2fe

#### Manual

- [x] 3.6 Każdy nowy krok smoke fazy 3 został raz celowo zepsuty (np. zmieniony oczekiwany komunikat) i wtedy zawiódł — 693b2fe
- [x] 3.7 W przeglądarce: „Usuń” z widoku bez kategorii, z kategorią i z wyników wyszukiwania prowadzi na potwierdzenie, a „Anuluj” i usunięcie wracają do tego samego widoku — 693b2fe
- [x] 3.8 Usunięcie najlepszego zamiennika: potwierdzenie mówi o utracie najlepszego, a po usunięciu kategoria nie ma znaczka „Najlepszy” — 693b2fe
- [x] 3.9 Kitchen-sink: przycisk `destructive` ma kontrast tekstu ≥ 4.5:1 i widoczny focus (pełny ring) w motywie jasnym i ciemnym (ciemny przez klasę `dark` na `<html>` w devtools, bo nic jej nie włącza; kontrast można też policzyć z tokenów: `oklch(0.985 0 0)` na `oklch(0.505 0.213 27.518)` i `oklch(0.205 0 0)` na `oklch(0.704 0.191 22.216)`); karta z trzema przyciskami zawija się bez poziomego scrolla przy 360 px — 693b2fe

### Phase 4: Usuwanie składnika end-to-end

#### Automated

- [x] 4.1 Lint przechodzi: `npm run lint`
- [x] 4.2 Skan literałów UI przechodzi z obiema stronami w `GUARDED`: `npm run lint:ui`
- [x] 4.3 Smoke przechodzi z nowymi krokami fazy 4 i krokami fazy 3: `BASE_URL=http://localhost:4321 npm run smoke`
- [x] 4.4 Typy przechodzą przy zatrzymanym dev, uruchomione po smoke: `npx astro check`
- [x] 4.5 Build przechodzi przy zatrzymanym dev: `npm run build`
- [x] 4.6 Testy bazy dalej przechodzą: `npx supabase test db`

#### Manual

- [x] 4.7 Każdy nowy krok smoke fazy 4 został raz celowo zepsuty i wtedy zawiódł
- [x] 4.8 W przeglądarce: „Usuń składnik” z widoku zawężonego do kategorii pokazuje licznik wszystkich kategorii; po usunięciu z wyników wyszukiwania, które dalej coś znajduje, powrót trafia do wyników, a po usunięciu jedynego trafienia albo z widoku bez `q` na gołą listę z komunikatem
- [x] 4.9 Kitchen-sink: oba widoki potwierdzenia we wszystkich stanach z matrycy, zrzut ekranu jasnego motywu bez poziomego scrolla przy 360 px
