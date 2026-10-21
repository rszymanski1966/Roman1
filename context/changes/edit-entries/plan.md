# Edycja wpisów (S-04) — plan implementacji

## Overview

Zalogowany użytkownik może zmienić nazwę własnego składnika oraz nazwę, proporcję i uwagi własnego zamiennika (FR-006). Edycja nadpisuje pola bez dodatkowej logiki, a oznaczenie „najlepszy” zostaje przy wpisie. Każda edycja ma osobną stronę z formularzem. Po zapisie użytkownik wraca do widoku, z którego przyszedł, z komunikatem „Zapisano zmiany.”.

## Current State Analysis

Na podstawie `context/changes/edit-entries/research.md`:

- **Baza blokuje dziś każdą edycję poza `is_best`.**
  - `substitutes` ma grant UPDATE tylko na `is_best`, ale ma już politykę `substitutes_update_own` (`supabase/migrations/20261011201658_best_substitute.sql:20-27`).
  - `ingredients` ma domyślny grant UPDATE na wszystkie kolumny, dla `anon` i `authenticated`, i nie ma polityki UPDATE (`…20261004120000_substitute_database.sql:30-49`). RLS odrzuca więc każdy wiersz.
- **Aplikacja nie ma żadnego `.update(`** (grep po `src/` i `scripts/`) ani odczytu pojedynczego składnika lub zamiennika po id.
- **Unikalność.**
  - Składnik: `ingredients_user_id_name_key_key unique (user_id, name_key)`, gdzie `name_key` liczy aplikacja przez `toNameKey` (`src/lib/services/substitutes.ts:39-41`).
  - Zamiennik: `unique (ingredient_category_id, name_key)`, gdzie `name_key` to kolumna generowana `lower(name)` (`…20261010115230_unique_substitutes.sql:11-12`, `:26-28`). Jej UPDATE kończy się błędem `428C9`.
- **Kontekst widoku listy** (`ListView`, `listRedirect`) żyje lokalnie w `src/pages/api/substitutes/best.ts:13-34`.
- **Limity pól oraz `charLength` i `truncate`** żyją lokalnie w `src/pages/api/ingredients.ts:7-24`.
- **Test pgTAP pinuje wąski grant:** `supabase/tests/best-substitute.sql:104-110` oczekuje `42501` dla `update … set name`.

## Desired End State

- Na liście (`/ingredients`) każda karta zamiennika ma link „Edytuj”, a nagłówek składnika link „Zmień nazwę”. Oba niosą kontekst widoku: `ingredient`, `category`, `q` i `match`.
- `/ingredients/edit-substitute` pokazuje formularz z nazwą, proporcją i uwagami, wypełniony z bazy. Składnik i kategoria są widoczne tylko do odczytu. Zapis idzie przez `POST /api/substitutes/update`.
- `/ingredients/edit-ingredient` pokazuje formularz z nazwą składnika. Zapis idzie przez `POST /api/ingredients/rename` i zmienia nazwę we wszystkich kategoriach.
- **Po sukcesie:** redirect do tego samego widoku listy z `notice=Zapisano zmiany.`.
- **Po błędzie:** powrót do formularza edycji z `?error=`, z echem wpisanych wartości i z kontekstem.
- **Konflikty nazw:** duplikat nazwy zamiennika w parze daje ten sam komunikat co przy dodawaniu. Duplikat nazwy składnika daje „Składnik „X” jest już zapisany.”.
- **Cudzy, nieistniejący lub usunięty wpis** daje „Nie znaleziono zamiennika.” albo „Nie znaleziono składnika.”, bez zmiany danych.
- **`is_best`** zostaje bez zmian po każdej edycji.
- **Weryfikacja:** pgTAP (`npx supabase test db`) i smoke (`npm run smoke`) przechodzą z nowymi krokami, a każdy nowy krok był raz celowo zepsuty.

### Key Discoveries:

- `listRedirect` pisze parametry w stałej kolejności: ingredient, category, q, match, potem notice/error. Smoke to sprawdza (`scripts/smoke.mjs:331-355`).
- `substituteIdFor` (`scripts/smoke.mjs:47-51`) szuka pierwszego `>${name}<`, a po nim pierwszego `name="substitute_id"`. Link „Edytuj” nie może renderować nazwy zamiennika jako tekstu ani dodawać pola `substitute_id` z innym id.
- Po ingredients-list-ui karta zamiennika to `src/components/ingredients/SubstituteCard.astro` (formularz „Oznacz jako najlepszy” `:47-63`, komentarz o zależnościach smoke `:10-13`). Dostaje propsy `ingredient`, `category`, `q`, `match`, a `withParams` i `shownIngredient` są tylko w `index.astro`. Nagłówek składnika to `index.astro:259`, komunikat `notice` `:192-196`.
- `new.astro` nie spełnia kontraktu UI z CLAUDE.md: ma literały palety (`stone-*`, `orange-*`, `amber-*`, `:43-49`, `:145-164`) i nie jest na liście `GUARDED` w `scripts/ui-literals.mjs`. Strony edycji nie mogą kopiować jego markupu. W `src/components/ui/` jest `Input.astro` (przepuszcza atrybuty, np. `maxlength`), ale nie ma komponentu `textarea`.
- `new.astro:12-16` czyta echo przez `get() ?? ""`. Edycja potrzebuje rozróżnienia między „pole wyczyszczone” a „brak echa”, bo inaczej wyczyszczone uwagi wróciłyby z bazy.
- Ten sam 23505 (`error.code`) bez nazwy ograniczenia wystarcza, bo każda akcja edycji aktualizuje jedną tabelę i trafia w jedno ograniczenie unikalności (`src/lib/services/substitutes.ts:153-158`).
- Lekcja `name_key` (`context/foundation/lessons.md:19-24`): zmiana nazwy składnika aktualizuje `name` i `name_key` razem, a nazwa przechodzi wcześniej przez `normalizeName`.

## What We're NOT Doing

- Przenoszenie zamiennika do innej kategorii lub innego składnika (zmiana `ingredient_category_id`).
- Scalanie składników przy zmianie nazwy na już zajętą. Taki zapis jest odrzucany.
- Zmiana `is_best` z formularza edycji. Oznaczanie zostaje na liście (`/api/substitutes/best`).
- Wspólny formularz „składnik + zamiennik” i RPC do edycji.
- Zawężanie grantu UPDATE na `ingredient_categories` (bez polityki UPDATE zapis i tak jest zablokowany) oraz indeksy FK z review S-01 (F7).
- Check w bazie, że `ingredients.name_key` odpowiada `name`. Zgodność utrzymuje aplikacja, zgodnie z lekcją.
- Optymistyczna blokada lub wykrywanie równoległej edycji (last write wins).
- Usuwanie wpisów (S-05).

## Implementation Approach

Bezpośredni UPDATE przez PostgREST, chroniony dwiema warstwami. Grant kolumnowy określa, które kolumny wolno zmienić, a polityka RLS, które wiersze. To ten sam wzorzec co w S-02.

Każda akcja edycji robi jeden `update(...).eq("id", …).select(...).maybeSingle()`, więc jest atomowa. Pusty wynik oznacza „nie znaleziono”: RLS ukrywa cudze wiersze, więc UPDATE zmienia 0 wierszy, a nie zwraca błędu. Kod 23505 oznacza duplikat.

Kontekst widoku i limity pól są wydzielone do wspólnych modułów, bo korzystają z nich teraz trzy endpointy. Strony edycji biorą z `new.astro` tylko logikę (odczyt echa, ukryte pola, komunikat błędu), a markup budują z tokenów i komponentów z `src/components/ui/` (`Card`, `Label`, `Input`, `Alert`, `buttonVariants()` + `focusRing`), na wzór `index.astro` i `SubstituteCard.astro`. Obie strony trafiają na listę `GUARDED` (`npm run lint:ui`) i do kitchen-sink.

Kolejność: najpierw baza z testami pgTAP, potem dwa pionowe plastry (zamiennik, składnik), każdy z UI i krokami smoke.

## Critical Implementation Details

- **Kolejność w migracji.** `revoke update on public.ingredients` musi poprzedzać `grant update (name, name_key)`. Revoke na tabeli zdejmuje też uprawnienia kolumnowe, więc w odwrotnej kolejności grant by zniknął.
- **Prod przed merge.** CI deployuje tylko Workera. Migrację trzeba wypchnąć na prod (`npx supabase db push`) przed scaleniem PR. Inaczej edycja na prod skończy się błędem uprawnień (komunikat ogólny). Migracja tylko dodaje uprawnienia, więc wypchnięcie jej przed kodem jest bezpieczne.
- **Lokalnie** `npx supabase migration up`, nie `db reset` (dane lokalne zostają).

## Faza 1: Baza — granty i polityka UPDATE

### Overview

Migracja otwiera edycję dokładnie tych kolumn, które obejmuje S-04. Testy pgTAP przypinają nowe granty i izolację.

### Changes Required:

#### 1. Migracja

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_edit_entries.sql` (nowy)

**Intent**: Poszerzyć grant na `substitutes` o pola edycji i otworzyć UPDATE własnych składników tylko na `name` i `name_key`. Nagłówek opisuje, czego celowo nie grantujemy i dlaczego.

**Contract**:
- `grant update (name, ratio, notes) on public.substitutes to authenticated`. Grant na `is_best` zostaje, bo potrzebuje go `set_best_substitute`. Nie grantujemy `name_key` (kolumna generowana), `user_id`, `ingredient_category_id`, `id` ani `created_at`.
- `revoke update on public.ingredients from anon, authenticated`, a potem `grant update (name, name_key) on public.ingredients to authenticated`.
- Polityka `ingredients_update_own`: `for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))`.
- Komentarz z rollbackiem: revoke dodanych kolumn, drop policy i przywrócenie `grant update on public.ingredients to anon, authenticated`.

#### 2. Test istniejący

**File**: `supabase/tests/best-substitute.sql`

**Intent**: Asercja `:104-110` („A cannot update columns other than is_best”) przestaje być prawdziwa. Zastępujemy ją asercją kolumny, która nadal jest zablokowana.

**Contract**: `throws_ok(update public.substitutes set ingredient_category_id = '20000000-0000-0000-0000-0000000000a2' where id = …a1, '42501', …)` z opisem „A cannot move a substitute to another pair”. `plan(14)` bez zmian.

#### 3. Test nowy

**File**: `supabase/tests/edit-entries.sql` (nowy)

**Intent**: Przypiąć granty, polityki i reguły z FR-006 na poziomie bazy, w stylu istniejących plików: `begin … rollback`, setup jako postgres, role przez `set local role` i `request.jwt.claims`.

**Contract** (asercje):
- A zmienia `name`, `ratio` i `notes` swojego zamiennika z `is_best = true` → `lives_ok`. Potem `is` sprawdza, że `is_best` dalej `true`, a `name_key` równa się `lower(nowa nazwa)`.
- A zmienia nazwę zamiennika na nazwę innego zamiennika z tej samej pary, inną wielkością liter → `23505`.
- A ustawia `name_key` zamiennika → `throws_ok`. Oczekiwane `42501`, bo uprawnienia są sprawdzane przed ograniczeniem kolumny generowanej. Jeśli przyjdzie `428C9`, wpisać faktyczny kod z komentarzem.
- A ustawia `user_id` zamiennika → `42501`.
- A zmienia `name` i `name_key` swojego składnika → `lives_ok`. A zmienia nazwę składnika na nazwę innego swojego składnika → `23505`.
- A ustawia `user_id`, `id` lub `created_at` składnika → `42501` (wystarczy jedna asercja na `user_id` i jedna na `created_at`).
- B robi UPDATE na składniku i zamienniku konta A → bez błędu, ale po `reset role` `is` sprawdza, że nazwy konta A są niezmienione (0 wierszy).
- anon robi UPDATE `ingredients set name` → `42501`.

### Success Criteria:

#### Automated Verification:

- Migracja wchodzi na lokalną bazę: `npx supabase migration up`
- Testy bazy przechodzą, w tym nowy `edit-entries.sql` i zmieniony `best-substitute.sql`: `npx supabase test db`
- Granty w lokalnej bazie odpowiadają kontraktowi. Zapytanie do `information_schema.column_privileges` pokazuje UPDATE dla `authenticated`: `substitutes` → `is_best, name, notes, ratio`, `ingredients` → `name, name_key`, a dla `anon` brak UPDATE na obu tabelach.

#### Manual Verification:

- Przegląd migracji: nagłówek wyjaśnia, czego nie grantujemy, i zawiera rollback

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na potwierdzenie weryfikacji ręcznej, zanim przejdziesz dalej.

---

## Faza 2: Edycja zamiennika end-to-end

### Overview

Wspólne helpery, serwis, endpoint, strona edycji, link w karcie i kroki smoke. Po tej fazie użytkownik edytuje zamiennik z listy.

### Changes Required:

#### 1. Wspólny kontekst widoku listy

**File**: `src/lib/list-view.ts` (nowy); `src/pages/api/substitutes/best.ts`

**Intent**: Przenieść `ListView` i `listRedirect` z `best.ts` do wspólnego modułu i dodać parser kontekstu z formularza. W ten sposób trzy endpointy wracają do listy identycznie. `best.ts` korzysta z modułu bez zmiany zachowania.

**Contract**:
- `ListView {ingredient, category, q, match}`.
- `parseListView(form): ListView | null`, z tą samą walidacją co dziś w `best.ts:55-68`. Niepoprawne id dają `null`, `q` przechodzi przez `normalizeQuery`, a `match` przez `parseMatchMode` (nieznana wartość daje `""`).
- `listRedirect(view, extra)` z niezmienioną kolejnością parametrów.
- Istniejące kroki smoke dla `/api/substitutes/best` przechodzą bez zmian.

#### 2. Wspólne limity i walidacja pól

**File**: `src/lib/entry-fields.ts` (nowy); `src/pages/api/ingredients.ts`

**Intent**: Przenieść `MAX_NAME`, `MAX_RATIO`, `MAX_NOTES`, `charLength` i `truncate` z `ingredients.ts:7-24`, żeby dodawanie i edycja walidowały tak samo i z tymi samymi komunikatami.

**Contract**: Te same nazwy i wartości. Komentarz o odpowiedniości z checkami w bazie zostaje. Zachowanie `POST /api/ingredients` się nie zmienia.

#### 3. Serwis

**File**: `src/lib/services/substitutes.ts`; `src/types.ts`

**Intent**: Dodać odczyt zamiennika do edycji i jego aktualizację. Pusty wynik oznacza „nie znaleziono”, a 23505 duplikat. Przy okazji zaktualizować nieaktualny komentarz `:94-95`: polityka UPDATE na `substitutes` istnieje od S-02, a upsert zostaje DO NOTHING z innego powodu.

**Contract**:
- `getSubstituteForEdit(client, substituteId): ServiceResult<SubstituteForEdit | null>`. Zwraca `{id, name, ratio, notes, is_best, ingredientId, ingredientName, categoryName}` z embedded select przez `ingredient_categories(ingredient_id, ingredients(name), categories(name))`. `ingredientId` służy stronie jako zapasowy kontekst powrotu. Relacje czytane defensywnie (obiekt albo tablica), jak w `listIngredientSubstitutes`. `null` oznacza wiersz nieistniejący albo ukryty przez RLS.
- `updateSubstitute(client, substituteId, {name, ratio, notes}): ServiceResult<{name: string}>`:
  - nazwa przez `normalizeName`, `ratio` przez trim, `notes` przez trim albo `null`;
  - `.update({name, ratio, notes}).eq("id", …).select("name").maybeSingle()`;
  - 23505 → `Zamiennik „${name}” jest już zapisany dla tego składnika w tej kategorii.` (ten sam tekst co `:156`);
  - brak wiersza → „Nie znaleziono zamiennika.”;
  - inny błąd → `GENERIC_ERROR`.
- Nigdy nie wysyła `is_best` ani `name_key`.
- Typy w `src/types.ts`: `SubstituteForEdit` i `UpdateSubstituteInput`.

#### 4. Endpoint

**File**: `src/pages/api/substitutes/update.ts` (nowy)

**Intent**: Odebrać formularz edycji, zwalidować go jak dodawanie, zapisać i wrócić na listę albo do formularza.

**Contract**:
- `POST`. Pola: `substitute_id`, `name`, `ratio`, `notes` oraz kontekst `ingredient`, `category`, `q`, `match`.
- Kolejność kontroli jak w `best.ts`: klient null → brak użytkownika → `/auth/signin` → `formData()` w try/catch → `parseListView`.
- Niepoprawny kontekst daje `/ingredients?error=Nieprawidłowe dane formularza.`.
- Niepoprawne `substitute_id` daje redirect na listę z kontekstem i „Nie znaleziono zamiennika.”.
- Walidacja: nazwa i proporcja wymagane, limity i komunikaty jak w `ingredients.ts:86-96`.
- Błąd walidacji albo błąd serwisu → `/ingredients/edit-substitute?` z `substitute`, kontekstem i echem. Echo zawsze ustawia klucze `name`, `ratio` i `notes`, także gdy są puste, przycięte do limitów. Do tego `error`.
- Sukces → `listRedirect(view, { notice: "Zapisano zmiany." })`.

#### 5. Strona edycji

**File**: `src/pages/ingredients/edit-substitute.astro` (nowy)

**Intent**: Formularz edycji zamiennika na wzór `new.astro`, z wartościami z bazy i echem po błędzie. Dla nieznanego lub cudzego id strona pokazuje komunikat zamiast formularza.

**Contract**:
- GET `?substitute=<id>[&ingredient&category&q&match][&error][&name&ratio&notes]`. Chroniona przez middleware (`/ingredients` prefix).
- Wartość pola pochodzi z echa, gdy jego klucz jest obecny (`searchParams.has`), w przeciwnym razie z bazy.
- Składnik i kategoria są pokazane jako tekst tylko do odczytu. Przy `is_best` jest informacja „Najlepszy w tej kategorii — oznaczenie zostaje”.
- Ukryte pola niosą `substitute_id` i kontekst. Przycisk „Zapisz zmiany”.
- Gdy `ingredient` z URL nie jest poprawnym uuid (wejście z zakładki, ucięty link), ukryte pole `ingredient` dostaje `ingredientId` z bazy, a `category` zostaje puste. Inaczej `parseListView` odrzuci zapis i edycja przepadnie.
- Link „Anuluj” prowadzi do tego samego widoku listy (te same parametry co `listRedirect`).
- Nieznane, cudze lub niepoprawne id daje „Nie znaleziono zamiennika.” i link do listy. W tym stanie strona nie pokazuje `Alert` z `?error=` (po nieudanym zapisie cudzego wpisu komunikat byłby podwójny).
- `maxlength` z `entry-fields.ts`.
- Markup z tokenów i komponentów: `Card`, `Label`, `Input`, `Alert`, przycisk i linki przez `cn(buttonVariants(...), focusRing)`. Uwagi przez nowy `Textarea.astro` (§8). Bez literałów kolorów i arbitralnych `px`/`rem`, bez `dark:`.

#### 6. Link w karcie

**File**: `src/components/ingredients/SubstituteCard.astro`

**Intent**: Dodać link „Edytuj” w karcie zamiennika, obok formularza „Oznacz jako najlepszy” (`:47-63`), z kontekstem widoku z propsów karty.

**Contract**:
- `href` budowany w karcie z propsów: `URLSearchParams` w kolejności `substitute`, `ingredient`, `category`, `q`, `match`, z pominięciem pustych wartości (jak `withParams` w `index.astro:145-152`).
- Tekst „Edytuj”, `aria-label` „Edytuj: <nazwa>”. Klasy przez `cn(buttonVariants({ variant: "link" }) albo "outline", focusRing, …)`.
- Bez renderowania nazwy jako tekstu i bez pola `name="substitute_id"`. Komentarz `:10-13` dopisuje ten warunek do listy zależności smoke.
- Komunikat `notice` (`index.astro:192-196`) wyświetla już „Zapisano zmiany.” bez zmian.

#### 7. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć edycję end-to-end i izolację. Oczekiwane redirecty niosą tekst komunikatu, nie sam prefiks `?error=`.

**Contract** (nowe kroki):

Konto A, po kroku „ingredient view without a category shows both categories in sort order”:
- „edit substitute form shows the current values”: pobiera listę `listPath`, łapie id trzeciego zamiennika (obecnie najlepszego) przez `substituteIdFor` i otwiera stronę edycji → 200, body zawiera `value="${thirdSubstitute}"`.
- „account A edits the best substitute”: nowa nazwa `smoke-edited-${runId}`, proporcja i uwagi → 302 na `listPath`, `locationIncludes: "notice=Zapisano+zmiany."`.
- „edited substitute keeps the best badge”: na liście `>${editedSubstitute}<` jest przed `data-best-badge` w tej samej karcie, a `>${thirdSubstitute}<` nie występuje.
- „edit form echoes values after a validation error”: pusta proporcja → 302 na `/ingredients/edit-substitute?`, `locationIncludes` `error=Podaj+proporcj` oraz `name=`.
- „account A cannot rename a substitute to a name already in the pair”: `secondSubstitute.toUpperCase()` → 302 na `/ingredients/edit-substitute?`, z prefiksem komunikatu duplikatu (zakodowanym jak w kroku `:273`).

Konto B, po kroku „account B cannot mark account A's substitute”:
- „account B cannot edit account A's substitute”: POST z `firstSubstituteId` → 302, `locationIncludes: "error=Nie+znaleziono+zamiennika."`.
- „account B edit page for account A's substitute shows not found”: 200, body zawiera „Nie znaleziono zamiennika” i nie zawiera `value="${substituteMarker}"`.

Pomocnicza zmienna `thirdSubstituteId` dochodzi do bloku „Values captured…”.

#### 8. Kontrakt UI

**File**: `src/components/ui/Textarea.astro` (nowy); `scripts/ui-literals.mjs`; `src/pages/dev/kitchen-sink.astro`

**Intent**: Strona edycji i karta trzymają się kontraktu z CLAUDE.md § UI, a CI to pilnuje.

**Contract**:
- `Textarea.astro` na wzór `Input.astro` (new-york, te same tokeny, `focusRing`, `aria-invalid`), przepuszcza atrybuty (`maxlength`, `rows`).
- `GUARDED` w `scripts/ui-literals.mjs` dostaje `src/pages/ingredients/edit-substitute.astro` i `src/components/ui/Textarea.astro` (`SubstituteCard.astro` jest już objęty przez `src/components/ingredients/*.astro`).
- Kitchen-sink: karta z linkiem „Edytuj” (fixture już renderuje `SubstituteCard`) oraz formularz edycji zamiennika w stanach: wartości z bazy, błąd walidacji z echem, „Nie znaleziono zamiennika.”.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Skan literałów UI przechodzi z nowymi plikami na liście `GUARDED`: `npm run lint:ui`
- Typy przechodzą przy zatrzymanym dev, uruchomione po smoke (przy działającym dev psuje `deps_ssr`): `npx astro check`
- Smoke przechodzi z nowymi krokami fazy 2 i bez zmian w istniejących krokach `/api/substitutes/best`: `BASE_URL=http://localhost:4321 npm run smoke`
- Testy bazy dalej przechodzą: `npx supabase test db`

#### Manual Verification:

- Każdy nowy krok smoke fazy 2 został raz celowo zepsuty (np. zmieniony oczekiwany komunikat) i wtedy zawiódł
- W przeglądarce: „Edytuj” z widoku bez kategorii, z kategorią i z wyników wyszukiwania wraca po zapisie i po „Anuluj” do tego samego widoku
- Wyczyszczenie uwag z jednoczesnym błędem walidacji (pusta proporcja) zostawia uwagi puste w formularzu po błędzie; po poprawnym zapisie uwagi znikają z karty
- Edycja najlepszego zamiennika zostawia znaczek „Najlepszy”

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na potwierdzenie weryfikacji ręcznej, zanim przejdziesz dalej.

---

## Faza 3: Zmiana nazwy składnika end-to-end

### Overview

Serwis, endpoint, strona edycji, link przy nagłówku składnika i kroki smoke. Na końcu migracja trafia na prod przed merge.

### Changes Required:

#### 1. Serwis

**File**: `src/lib/services/substitutes.ts`; `src/types.ts`

**Intent**: Dodać odczyt składnika i zmianę nazwy, która aktualizuje `name` i `name_key` razem (lekcja `name_key`).

**Contract**:
- `getIngredient(client, ingredientId): ServiceResult<IngredientListItem | null>`. `null` oznacza wiersz nieistniejący albo ukryty przez RLS.
- `renameIngredient(client, ingredientId, name): ServiceResult<{name: string}>`:
  - `normalizeName`, potem `toNameKey`;
  - `.update({name, name_key}).eq("id", …).select("name").maybeSingle()`;
  - 23505 → `Składnik „${name}” jest już zapisany.`;
  - brak wiersza → „Nie znaleziono składnika.”;
  - inny błąd → `GENERIC_ERROR`.
- Zmiana nazwy na tę samą nazwę albo na inną wielkość liter tego samego składnika przechodzi, bo to ten sam wiersz.

#### 2. Endpoint

**File**: `src/pages/api/ingredients/rename.ts` (nowy)

**Intent**: Odebrać formularz zmiany nazwy, zwalidować, zapisać i wrócić na listę albo do formularza.

**Contract**:
- `POST`. Pola: `ingredient_id`, `name` oraz kontekst `ingredient`, `category`, `q`, `match`.
- Kolejność kontroli jak w fazie 2.
- Niepoprawne `ingredient_id` daje redirect na listę z kontekstem i „Nie znaleziono składnika.”.
- Walidacja: nazwa wymagana, `MAX_NAME`, komunikaty jak w `ingredients.ts:80-83`.
- Błąd → `/ingredients/edit-ingredient?` z `ingredient_id`, kontekstem, echem `name` (klucz zawsze obecny) i `error`.
- Sukces → `listRedirect(view, { notice: "Zapisano zmiany." })`.
- Plik leży obok istniejącego `src/pages/api/ingredients.ts`. Istniejące kroki smoke dodawania potwierdzają, że `POST /api/ingredients` dalej działa.

#### 3. Strona edycji

**File**: `src/pages/ingredients/edit-ingredient.astro` (nowy)

**Intent**: Formularz zmiany nazwy składnika z informacją, że nazwa zmieni się we wszystkich kategoriach.

**Contract**:
- GET `?ingredient_id=<id>[&ingredient&category&q&match][&error][&name]`.
- Wartość pola pochodzi z echa (`has`) albo z bazy. Ukryte pola niosą `ingredient_id` i kontekst.
- Gdy `ingredient` z URL nie jest poprawnym uuid, ukryte pole `ingredient` dostaje `ingredient_id`, a `category` zostaje puste (jak w fazie 2).
- „Zapisz zmiany” i „Anuluj” działają jak w fazie 2.
- Nieznane, cudze lub niepoprawne id daje „Nie znaleziono składnika.” i link do listy, bez `Alert` z `?error=`.
- Markup z tokenów i komponentów jak w fazie 2 (`Card`, `Label`, `Input`, `Alert`, `buttonVariants()` + `focusRing`). Strona trafia na listę `GUARDED` w `scripts/ui-literals.mjs`, a jej stany (wartość z bazy, błąd z echem, nie znaleziono) do kitchen-sink.

#### 4. Link przy nagłówku

**File**: `src/pages/ingredients/index.astro`

**Intent**: Dodać link „Zmień nazwę” przy `<h2>` składnika (`:259`), tylko gdy `view.ingredient` istnieje.

**Contract**:
- `href` przez `withParams("/ingredients/edit-ingredient", {ingredient_id: view.ingredient.id, ingredient: view.ingredient.id, category: viewCategory, q: query, match: mode})`.
- `aria-label` „Zmień nazwę: <nazwa>”. Bez renderowania nazwy jako dodatkowego tekstu. Klasy przez `textLinkClass` (`:183`) albo `cn(buttonVariants(...), focusRing)`.

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Pokryć zmianę nazwy z kontekstem wyszukiwania, duplikat i izolację. Poprawić krok B, któremu zmiana nazwy odebrałaby sens.

**Contract**:

Nowe kroki konta A, po krokach fazy 2:
- „account A renames the search ingredient from a search”: nowa nazwa `smoke-renamed-search-${runId}` (zawiera `searchFragment`), kontekst `ingredient`, `q=searchFragment`, `match=contains` → 302 na `/ingredients?ingredient=<id>&q=…&match=contains&notice=Zapisano+zmiany.` (kolejność jak `listRedirect`).
- „renamed ingredient shows its new name”: widok składnika zawiera `>${renamedIngredient}<` i nie zawiera `>${searchIngredient}<`.
- „account A cannot rename an ingredient to an existing name”: `smoke-ingredient-${runId}`.toUpperCase() → 302 na `/ingredients/edit-ingredient?`, z prefiksem `Składnik „SMOKE-INGREDIENT-…”`.

Nowy krok konta B, po krokach B z fazy 2:
- „account B cannot rename account A's ingredient” → 302, `locationIncludes: "error=Nie+znaleziono+sk%C5%82adnika."`.

Zmiana istniejącego kroku:
- „account B search does not find account A's ingredient” szuka po `searchFragment` zamiast `searchIngredient`, bo po zmianie nazwy stare zapytanie nic by nie znalazło nawet bez izolacji. `bodyExcludes: searchIngredientId` zostaje.

#### 6. Roadmapa

**File**: `context/foundation/roadmap.md`

**Intent**: Lekcja „Backlog Handoff”: wiersz S-04 w `## Backlog Handoff` ma Notes „Planned” od `/10x-plan`.

**Contract**: Robione przy zapisie tego planu. W tej fazie tylko sprawdzić, że wiersz nie przeczy statusowi.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Skan literałów UI przechodzi z `edit-ingredient.astro` na liście `GUARDED`: `npm run lint:ui`
- Typy przechodzą przy zatrzymanym dev, uruchomione po smoke (przy działającym dev psuje `deps_ssr`): `npx astro check`
- Smoke przechodzi ze wszystkimi nowymi krokami: `BASE_URL=http://localhost:4321 npm run smoke`
- Testy bazy dalej przechodzą: `npx supabase test db`
- Build przechodzi przy zatrzymanym dev: `npm run build`

#### Manual Verification:

- Każdy nowy lub zmieniony krok smoke fazy 3 został raz celowo zepsuty i wtedy zawiódł
- W przeglądarce: zmiana nazwy składnika z wyników wyszukiwania wraca do widoku z kontekstem (link „Wszystkie wyniki dla …” działa, gdy nowa nazwa dalej pasuje), a nowa nazwa jest widoczna we wszystkich kategoriach
- Zmiana nazwy „Masło” na „masło” (ten sam składnik) przechodzi, a zmiana na nazwę innego składnika daje komunikat i zostawia wpisaną nazwę w formularzu
- Migracja wypchnięta na prod przed merge: `npx supabase db push`; po deployu edycja zamiennika i zmiana nazwy działają na https://kuchenny-zamiennik.rszymanski.workers.dev

**Implementation Note**: Po zakończeniu fazy i przejściu weryfikacji automatycznej zatrzymaj się na potwierdzenie weryfikacji ręcznej.

---

## Testing Strategy

### Unit Tests:

Projekt nie ma frameworka testów jednostkowych. Reguły bazy pokrywa pgTAP (`supabase/tests/edit-entries.sql`, faza 1), a logikę aplikacji smoke.

### Integration Tests:

- **pgTAP:** granty kolumnowe (dozwolone i zablokowane kolumny), polityka `ingredients_update_own`, zachowanie `is_best`, regeneracja `substitutes.name_key`, 23505 dla obu tabel, izolacja kont A/B, anon.
- **Smoke:**
  - edycja zamiennika (sukces z komunikatem, zachowany znaczek „Najlepszy”, echo po błędzie walidacji, duplikat);
  - zmiana nazwy składnika (powrót z kontekstem wyszukiwania, duplikat);
  - izolacja konta B (POST i GET strony edycji).

### Manual Testing Steps:

1. Z widoku składnika bez kategorii kliknij „Edytuj” przy zamienniku w drugiej sekcji, zmień proporcję i zapisz. Wracasz do widoku bez kategorii z „Zapisano zmiany.”.
2. Wyszukaj fragment nazwy, wejdź w składnik i kliknij „Zmień nazwę”. „Anuluj” wraca do wyników z tym samym `q` i `match`.
3. W formularzu edycji zamiennika wyczyść uwagi i proporcję, potem zapisz. Po błędzie oba pola są puste. Uzupełnij proporcję i zapisz: uwagi znikają z karty.
4. Otwórz URL strony edycji z id zamiennika drugiego konta. Widzisz „Nie znaleziono zamiennika.” bez formularza.

## Performance Considerations

Każda akcja to jeden UPDATE po kluczu głównym oraz jeden odczyt przy wejściu na stronę. Wpływu na NFR (< 1 s) nie ma.

## Migration Notes

- Migracja jest addytywna dla `substitutes` (nowe kolumny w grancie). Dla `ingredients` wymienia szeroki grant na wąski i dodaje politykę. Dane się nie zmieniają.
- Lokalnie: `npx supabase migration up`. Na prod: `npx supabase db push` przed merge PR (CI deployuje tylko Workera).
- Rollback w komentarzu migracji: revoke `update (name, ratio, notes)` na `substitutes`, drop policy `ingredients_update_own`, revoke `update (name, name_key)` i przywrócenie `grant update on public.ingredients to anon, authenticated`.

## References

- Research: `context/changes/edit-entries/research.md`
- Wzorzec grantu kolumnowego i polityki UPDATE: `supabase/migrations/20261011201658_best_substitute.sql:20-27`
- Wzorzec endpointu z kontekstem listy: `src/pages/api/substitutes/best.ts`
- Wzorzec formularza z echem: `src/pages/ingredients/new.astro`
- Wzorzec pgTAP: `supabase/tests/best-substitute.sql`, `supabase/tests/rls-isolation.sql`
- Lekcje: `context/foundation/lessons.md` (null z klienta Supabase, `class:list` vs `cn()`, `name_key`, Backlog Handoff)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza — granty i polityka UPDATE

#### Automated

- [x] 1.1 Migracja wchodzi na lokalną bazę: `npx supabase migration up` — 6125368
- [x] 1.2 Testy bazy przechodzą, w tym nowy `edit-entries.sql` i zmieniony `best-substitute.sql`: `npx supabase test db` — 6125368
- [x] 1.3 Granty w lokalnej bazie odpowiadają kontraktowi (`information_schema.column_privileges`) — 6125368

#### Manual

- [x] 1.4 Przegląd migracji: nagłówek wyjaśnia, czego nie grantujemy, i zawiera rollback — 6125368

### Phase 2: Edycja zamiennika end-to-end

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint`
- [x] 2.2 Skan literałów UI przechodzi z nowymi plikami na liście `GUARDED`: `npm run lint:ui`
- [x] 2.3 Typy przechodzą przy zatrzymanym dev, uruchomione po smoke (przy działającym dev psuje `deps_ssr`): `npx astro check`
- [x] 2.4 Smoke przechodzi z nowymi krokami fazy 2 i bez zmian w istniejących krokach `/api/substitutes/best`
- [x] 2.5 Testy bazy dalej przechodzą: `npx supabase test db`

#### Manual

- [x] 2.6 Każdy nowy krok smoke fazy 2 został raz celowo zepsuty i wtedy zawiódł
- [x] 2.7 „Edytuj” z widoku bez kategorii, z kategorią i z wyników wyszukiwania wraca po zapisie i po „Anuluj” do tego samego widoku
- [x] 2.8 Wyczyszczenie uwag z jednoczesnym błędem walidacji zostawia uwagi puste; po poprawnym zapisie uwagi znikają z karty
- [x] 2.9 Edycja najlepszego zamiennika zostawia znaczek „Najlepszy”

### Phase 3: Zmiana nazwy składnika end-to-end

#### Automated

- [ ] 3.1 Lint przechodzi: `npm run lint`
- [ ] 3.2 Skan literałów UI przechodzi z `edit-ingredient.astro` na liście `GUARDED`: `npm run lint:ui`
- [ ] 3.3 Typy przechodzą przy zatrzymanym dev, uruchomione po smoke (przy działającym dev psuje `deps_ssr`): `npx astro check`
- [ ] 3.4 Smoke przechodzi ze wszystkimi nowymi krokami
- [ ] 3.5 Testy bazy dalej przechodzą: `npx supabase test db`
- [ ] 3.6 Build przechodzi przy zatrzymanym dev: `npm run build`

#### Manual

- [ ] 3.7 Każdy nowy lub zmieniony krok smoke fazy 3 został raz celowo zepsuty i wtedy zawiódł
- [ ] 3.8 Zmiana nazwy składnika z wyników wyszukiwania wraca do widoku z kontekstem, a nowa nazwa jest widoczna we wszystkich kategoriach
- [ ] 3.9 Zmiana „Masło” na „masło” przechodzi, a zmiana na nazwę innego składnika daje komunikat i zostawia wpisaną nazwę
- [ ] 3.10 Migracja wypchnięta na prod przed merge (`npx supabase db push`); po deployu edycja działa na prod
