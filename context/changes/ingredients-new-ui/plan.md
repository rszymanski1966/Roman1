# Formularz dodawania na kontrakcie UI (ingredients-new-ui) Implementation Plan

## Overview

Widok `/ingredients/new` („Dodaj zamiennik”) przechodzi na tokeny i komponenty z `src/components/ui/`, według wzorca stron edycji z S-04. Przy okazji formularz dostaje wyjście z powrotem do listy, pole „Składnik” podpowiada zapisane składniki i mówi, czy wpisana nazwa trafi do istniejącego składnika, czy utworzy nowy, a błąd zapisu wskazuje pole, którego dotyczy. Ten sam mechanizm `error_field` obejmuje formularz edycji zamiennika (zamyka follow-up F1 z S-04).

## Current State Analysis

Źródło: `context/changes/ingredients-new-ui/research.md` (zarzuty C1–C4).

- `src/pages/ingredients/new.astro` nie importuje nic z `ui/`. Jedyna klasa tokenowa to `bg-kitchen` (`:48`). Wzorzec `scripts/ui-literals.mjs` daje 25 trafień, a pliku nie ma na liście `GUARDED` (`scripts/ui-literals.mjs:11-25`).
- Pola, etykiety, select, textarea, checkbox, komunikat błędu, przycisk i karta są zbudowane ręcznie (`new.astro:42-44`, `:49`, `:56-159`). Limity długości są wpisane liczbami (`:66`, `:99`, `:116`, `:132`).
- Jedyne wyjście to „Wróć do panelu” → `/dashboard` (`new.astro:163-167`). Link z pustego stanu składnika przekazuje `ingredient` + `category`, ale nie `q`/`match` (`src/pages/ingredients/index.astro:156-159`).
- Pole „Składnik” to zwykły tekst bez podpowiedzi (`new.astro:59-70`). Żeby dodać zamiennik do istniejącego składnika, trzeba przepisać jego nazwę. `listIngredients` jest wołane tylko przy prefillu (`new.astro:33-38`). Serwer i tak dopasowuje składnik po `name_key` (`normalizeName` + `toNameKey`, `src/lib/services/substitutes.ts:29-43`, użycie `:114-131`), więc inna wielkość liter lub nadmiarowe spacje trafiają w istniejący składnik.
- Komunikat błędu to `<p>` przed przyciskiem (`new.astro:152`), bez `role="alert"` i bez powiązania z polem. `/api/ingredients` odsyła sam tekst (`src/pages/api/ingredients.ts:23-39`), podobnie `api/substitutes/update.ts` (`:25-33`).
- Kontrakt UI jest gotowy: tokeny w `src/styles/global.css` (motyw kitchen), komponenty `Input`/`Label`/`NativeSelect`/`Textarea`/`Card`/`Alert`, `buttonVariants` + `focusRing`/`focusOutline`. Strony edycji (`edit-substitute.astro`, `edit-ingredient.astro`) mają 0 trafień skanu.

## Desired End State

- `/ingredients/new` wygląda jak strony edycji: `bg-kitchen` + `Card`, pola z `ui/`, przycisk `buttonVariants`, fokus z `--ring`, stopka `IngredientsFooter`. Skan `lint:ui` daje 0 trafień, a plik jest na liście `GUARDED`.
- Formularz żyje w `src/components/ingredients/SubstituteCreateForm.astro` i jest pokazany w kitchen-sink w stanach: puste pola, prefill, echo z błędem przy polu, błąd formularzowy.
- Pole „Składnik” ma listę zapisanych składników użytkownika (natywny `<datalist>`): klik lub ↓ ją rozwija, pisanie zawęża, a nazwę spoza listy można wpisać jak dotąd. Pod polem tekst pomocniczy, a przy włączonym JS etykieta „Istniejący składnik „…”” albo „Nowy składnik — zostanie utworzony przy zapisie”. Bez JS i bez zapisanych składników formularz działa jak dziś.
- „Anuluj” wraca do widoku składnika, gdy URL go niesie (wejście z pustego stanu składnika), w pozostałych przypadkach na `/ingredients`. Po zapisie bez zmian: widok nowego wpisu.
- Błąd przy konkretnym polu (np. pusta proporcja, duplikat nazwy) oznacza to pole czerwoną ramką i wiąże je z komunikatem (`aria-invalid`, `aria-describedby`). Dotyczy formularza dodawania i formularza edycji zamiennika. Błędy całego formularza zostają tylko w `Alert`.
- Smoke przechodzi z nowymi krokami na `error_field`; istniejące kroki bez zmian.

Weryfikacja: `npm run lint`, `npm run lint:ui`, `npx astro check` (przy zatrzymanym dev), smoke przy działającym dev, zrzuty kitchen-sink i widoku na desktopie i 375 px.

### Key Discoveries:

- Wzorzec docelowy powłoki: `src/pages/ingredients/edit-substitute.astro:57-73`. Wzorzec formularza z `idPrefix`: `src/components/ingredients/SubstituteEditForm.astro:28-103`. Wiązanie błędu z polem: `src/components/ingredients/IngredientRenameForm.astro:30-70`.
- `Textarea` przyjmuje wartość jako prop `value`, nie jako dziecko (`src/components/ui/Textarea.astro:6-10`).
- Natywne kontrolki wyboru: `cn("accent-primary", focusOutline)` + `<Label class="font-normal">` (`src/components/ingredients/LookupForms.astro:25,39-50`). Komponentu `Checkbox` nie ma.
- `parseListView` zwraca widok tylko przy poprawnym id składnika (`src/lib/list-view.ts:31-34`); `listRedirect(null)` daje `/ingredients`.
- Smoke porównuje lokację prefiksem i `includes` (`scripts/smoke.mjs:627-633`). Kroki `:253` i `:291` wymagają `error` jako pierwszego parametru `/ingredients/new?…`. Krok `:151-160` parsuje `<option value="<uuid>"` z HTML formularza.
- Duplikat nazwy zamiennika daje komunikat z `duplicateSubstituteMessage` (`src/lib/services/substitutes.ts:95`, użycie `:164`, `:361`); funkcja nie jest eksportowana.
- Lekcja `class:list` vs `cn()` (`context/foundation/lessons.md:12-17`): `cn()`, gdy klasa nadpisuje utility z bazowego zestawu.

## What We're NOT Doing

- Nie zmieniamy przekierowania po udanym zapisie (`src/pages/api/ingredients.ts:98-107`): użytkownik dalej ląduje w widoku nowego wpisu.
- Nie przenosimy widoku listy przez POST formularza dodawania. Po błędzie walidacji URL niesie echo pól, ale nie id składnika z prefillu, więc „Anuluj” prowadzi wtedy na `/ingredients`. Przeniesienie wymagałoby zmiany nazwy pola `ingredient` (dziś: nazwa składnika).
- Nie odtwarzamy widoku wyników wyszukiwania przy „Anuluj” (wejście z „brak dopasowań”, `index.astro:161`): `listRedirect` nie wyraża widoku bez składnika.
- Nie restylujemy `src/pages/dashboard.astro` (osobny widok, osobna zmiana) ani strony edycji zamiennika poza stanem błędu.
- Nie dodajemy nowych tokenów, nie ruszamy `.dark`, nie instalujemy shadcn `Checkbox` ani narzędzia do zrzutów.
- Nie zmieniamy treści komunikatów ani reguł walidacji w API.
- Nie budujemy własnego comboboxa (React, shadcn `Command`/`Popover`) ani przełącznika „Z listy / Nowy”, nie wysyłamy `ingredient_id` z formularza i nie otwieramy listy programowo (`showPicker()`). O tym, czy składnik istnieje, dalej decyduje serwer po `name_key`; etykieta tylko to zapowiada. Wyglądu rozwijanej listy `datalist` nie stylujemy (rysuje ją przeglądarka).

## Implementation Approach

Kolejność z `/10x-ui`: środowisko → wartości tokenów → widok → stany. Dwie pierwsze są puste (research: brak nowych tokenów i bibliotek), więc Faza 1 to widok, a Faza 2 to stan błędu. Faza 1 nie zmienia API ani smoke, więc da się ją zweryfikować samym wyglądem i istniejącym smoke. Faza 2 dokłada zachowanie z własnymi krokami smoke.

## Critical Implementation Details

- **Kolejność parametrów.** `error_field` stoi zawsze **po** `error`. W `errorRedirect` (`api/ingredients.ts`) `error` jest pierwszy, a echo po nim, więc `error_field` idzie na sam koniec. W `formRedirect` (`update.ts`) `error` jest ostatni, więc `error_field` idzie za nim. Inna kolejność łamie kroki smoke `:253` i `:291`.
- **Markup opcji.** `<option value={category.id} …>` musi zachować `value` jako pierwszy atrybut, bo smoke wyciąga id kategorii regexem `<option value="<uuid>"` (`scripts/smoke.mjs:151-160`). Opcje `datalist` niosą **nazwy** składników, nie id, więc regex ich nie łapie; `datalist` nie może dostać `value=<id>`.
- **Jedna reguła dopasowania.** Etykieta istniejący/nowy porównuje nazwy tą samą funkcją co serwer: skrypt importuje `normalizeName` i `toNameKey` z `@/lib/entry-fields` (moduł bez importów, bezpieczny dla klienta; patrz Faza 1 #6). Skrypt nie importuje nic z `src/lib/services/`: przyszły import wartości w serwisie (np. `@/lib/supabase` → `astro:env/server`) zepsułby paczkę klienta. Osobna kopia logiki rozjechałaby się z `name_key`.
- **Skrypt poza ESLint.** Obecna konfiguracja (`eslint.config.js`) nie lintuje bloków `<script>` w `.astro`: sonda z nieużytą zmienną i `any` dała `npx eslint` exit 0 (plan-review F3). Bramka 1.1 nie obejmuje więc skryptu. Skrypt ma być krótki, w pełni typowany (bez `any`, zawężanie `instanceof HTMLInputElement` / `HTMLDataListElement` zamiast rzutowań), a jego bramką jest `npx astro check` (1.3). Konfiguracji ESLint nie ruszamy w tej zmianie.

## Phase 1: Widok na komponentach

### Overview

`new.astro` składa formularz z komponentów `ui/` w powłoce stron edycji, dostaje „Anuluj”, stopkę i listę zapisanych składników przy polu „Składnik”, a kitchen-sink pokazuje jego stany. Bez zmian w API; smoke dostaje dwa kroki na listę składników, istniejące kroki bez zmian.

### Changes Required:

#### 1. Wydzielony formularz dodawania

**File**: `src/components/ingredients/SubstituteCreateForm.astro` (nowy)

**Intent**: Formularz „Dodaj zamiennik” jako komponent, żeby strona i kitchen-sink renderowały ten sam markup. Pola z `Input`/`Label`/`NativeSelect`/`Textarea`, limity z `MAX_*`, checkbox natywny, przycisk i „Anuluj” na `buttonVariants` + `focusRing`, błąd w `Alert` nad formularzem (jak `SubstituteEditForm`).

**Contract**:

- Props: `categories: Category[]`; `ingredientNames: string[]` (zapisane składniki użytkownika, kolejność z `listIngredients`); `values: { ingredient: string; categoryId: string; substitute: string; ratio: string; notes: string; isBest: boolean }` (prefill albo echo, liczone przez stronę); `cancelHref: string`; `error?: string | null`; `idPrefix?: string` (domyślnie `"add"`).
- Pola POST bez zmian: `ingredient`, `category_id`, `substitute`, `ratio`, `notes`, `is_best` (`value="1"`), `action="/api/ingredients"`.
- Id pól: `${idPrefix}-ingredient|category|substitute|ratio|notes|is-best`; do tego `${idPrefix}-ingredient-options` (datalist) i `${idPrefix}-ingredient-hint` (tekst pod polem).
- Select: pierwsza opcja `value=""` „Wybierz kategorię”, potem kategorie z `value` jako pierwszym atrybutem; bez `class="text-black"`.
- Checkbox: `class:list={cn("accent-primary", focusOutline)}`, etykieta `<Label for=… class="font-normal">` po nim.
- `Textarea` dostaje uwagi przez `value`, nie jako dziecko.
- Placeholdery bez zmian („np. masło”, „np. olej kokosowy”, „np. 1:1”, „np. lekki posmak kokosa”), poza polem „Składnik” przy niepustej liście (niżej).
- **Lista składników** (tylko gdy `ingredientNames` niepuste):
  - `<Input … list={`${idPrefix}-ingredient-options`} aria-describedby={`${idPrefix}-ingredient-hint`} placeholder="Wybierz z listy lub wpisz nowy">`; `autocomplete="off"` zostaje (w Chrome/Edge wyłącza historię przeglądarki, nie `datalist`). Fallback (plan-review F4): jeśli w kroku 1.10 Firefox nie pokazuje listy, usunąć `autocomplete="off"` tylko z pola „Składnik” (pozostałe pola bez zmian) i zanotować to w Phase 1.
  - `<datalist id={`${idPrefix}-ingredient-options`}>` z `<option value={name} />` na każdą nazwę, bez etykiet i bez id.
  - Pod polem `<p id={`${idPrefix}-ingredient-hint`} class="mt-1 text-sm text-muted-foreground" aria-live="polite" data-ingredient-hint>` z tekstem startowym „Zacznij pisać, aby zobaczyć zapisane składniki”. Bez JS ten tekst zostaje na stałe.
  - Przy pustej liście (nowe konto, błąd `listIngredients`): bez `list`, bez `datalist`, bez tekstu pomocniczego, placeholder „np. masło”.
- **Etykieta istniejący/nowy** (`<script>` w komponencie, bundlowany przez Astro, raz na stronę):
  - Obsługuje każde pole z `[data-ingredient-hint]` na stronie (kitchen-sink renderuje kilka formularzy); pole i listę znajduje po id z `aria-describedby`/`list`, nie po stałym id.
  - Nazwy z listy czyta z opcji `datalist` (bez osobnego JSON), klucze liczy `toNameKey(normalizeName(…))`.
  - Stany: puste pole → tekst startowy; klucz na liście → „Istniejący składnik „<zapisana nazwa>””; inaczej → „Nowy składnik — zostanie utworzony przy zapisie”.
  - Liczy stan przy załadowaniu (prefill, echo po błędzie) i na `input`; zmienia `textContent` tylko przy zmianie tekstu, żeby `aria-live` nie ogłaszał każdego znaku.
  - Kolor bez zmian (`text-muted-foreground`), bez ikon i bez literałów.
- Przyciski w `div.flex.flex-wrap.items-center.gap-3.pt-2`: „Zapisz” (`buttonVariants()`), „Anuluj” (`buttonVariants({ variant: "outline" })`, `href={cancelHref}`).

#### 2. Strona `/ingredients/new`

**File**: `src/pages/ingredients/new.astro`

**Intent**: Zostawić logikę strony (prefill, echo, `listCategories`, `listIngredients`), zastąpić markup powłoką z `edit-substitute.astro` i komponentem formularza. Usunąć `inputClass`/`labelClass`.

**Contract**:

- `listIngredients` wołane zawsze (nie tylko przy `?ingredient=`); prefill nazwy szuka w tym samym wyniku. Formularz dostaje `ingredientNames = data.map((item) => item.name)`. Błąd `listIngredients` nie blokuje formularza: pusta lista, bez `Alert` (podpowiedzi to wygoda, nie warunek zapisu).

- Powłoka: `bg-kitchen` wrapper bez zmian; `<Card class="w-full max-w-md rounded-2xl border-border bg-card/70 p-8 text-foreground shadow-sm backdrop-blur-xl">`; `h1` „Dodaj zamiennik” `mb-6 text-2xl font-bold text-foreground` (bez `text-center`, jak strony edycji).
- `cancelHref = listRedirect(parseListView(Astro.url.searchParams))`: widok składnika, gdy URL ma poprawne `ingredient` (+ `category`, `q`, `match`), inaczej `/ingredients`.
- Błąd ładowania kategorii: `<Alert role="alert" variant="destructive">` plus link „Wróć do listy” (`buttonVariants({ variant: "outline" })` + `focusRing`, `href={cancelHref}`) zamiast formularza.
- Na dole `<IngredientsFooter />` zamiast linku do panelu.
- Gałąź „Baza danych nie jest skonfigurowana.” zostaje (spójnie ze stronami edycji), choć przez HTTP nie jest osiągalna (research, wejścia brzegowe).

#### 3. Link z pustego stanu składnika

**File**: `src/pages/ingredients/index.astro`

**Intent**: Link „Dodaj zamiennik” z pustego stanu składnika niesie pełny widok listy, żeby „Anuluj” wracał także do wyszukiwania.

**Contract**: `addSubstituteHref` (`:156-159`) dostaje `q: query` i `match: mode` obok `ingredient` i `category`. Pozostałe linki do `/ingredients/new` bez zmian.

#### 4. Kitchen-sink

**File**: `src/pages/dev/kitchen-sink.astro`

**Intent**: Sekcja „Widok /ingredients/new” przed sekcją edit-substitute, w tym samym układzie (`viewFrameClass` > `Card` z `viewCardClass` > `h3`), na fixturach bez bazy. Pierwszy przykład checkboxa w kitchen-sink.

**Contract**: stany `SubstituteCreateForm`: puste pola (`idPrefix="ks-add-empty"`), prefill składnika i kategorii (`ks-add-prefill`), echo z błędem formularzowym (`ks-add-error`, np. komunikat ogólny bazy); plus błąd ładowania (`Alert` + „Wróć do listy”). Fixtura `ingredientNames` (np. „jajko”, „masło”, „mleko”) w stanach z listą; prefill z nazwą z fixtury (etykieta „Istniejący”), echo z nazwą spoza niej (etykieta „Nowy”); jeden stan z pustą listą (`ks-add-no-ingredients`, bez `datalist` i tekstu pomocniczego). Opis kolejności tabulacji: pola → checkbox → „Zapisz” → „Anuluj” → stopka. Notka: rozwiniętej listy `datalist` nie widać na zrzucie (rysuje ją przeglądarka), sprawdza się ją ręcznie.

#### 5. Strażnik

**File**: `scripts/ui-literals.mjs`

**Intent**: Objąć skanem oczyszczony widok (`CLAUDE.md`, `## UI`). Nowy komponent łapie glob `src/components/ingredients/*.astro`.

**Contract**: `"src/pages/ingredients/new.astro"` w `GUARDED`.

#### 6. Reguła nazwy w czystym module

**Files**: `src/lib/entry-fields.ts`, `src/lib/services/substitutes.ts`

**Intent**: Skrypt klienta bierze `normalizeName`/`toNameKey` z modułu bez importów zamiast z serwisu serwerowego (plan-review F2).

**Contract**:

- `normalizeName` i `toNameKey` przeniesione bez zmian treści i komentarzy (`substitutes.ts:28-31` i `:40-43`) do `src/lib/entry-fields.ts`; `entry-fields.ts` dalej bez importów.
- `substitutes.ts` importuje je z `@/lib/entry-fields` (używa ich w `addSubstitute`, `renameIngredient` itd.) i re-eksportuje (`export { normalizeName, toNameKey } from "@/lib/entry-fields";` albo import + `export {…}`), więc `api/ingredients.ts`, `api/ingredients/rename.ts` i `api/substitutes/update.ts` zostają bez zmian.

#### 7. Smoke: lista składników

**File**: `scripts/smoke.mjs`

**Intent**: Udowodnić, że formularz podpowiada składniki konta i tylko jego (RLS), bez zmiany istniejących kroków.

**Contract**: dwa nowe kroki:

- po „account A adds ingredient with substitute”: GET `/ingredients/new` jako A → `bodyIncludes: `<option value="smoke-ingredient-${runId}"``;
- po „account B adds its own ingredient”: GET `/ingredients/new` jako B (`cookies: jarB`) → `bodyIncludes: `value="smoke-ingredient-${runId}-b"`` (lista się renderuje, krok nie przechodzi na pusto) i `bodyExcludes: `value="smoke-ingredient-${runId}"`` (nazwa składnika A nie wycieka do B). Zamykający `"` jest obowiązkowy: nazwa A to prefiks nazwy B (`scripts/smoke.mjs:570`, por. komentarz `:611`).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Skan literałów przechodzi z `new.astro` na liście `GUARDED`: `npm run lint:ui`
- Typy przechodzą przy zatrzymanym dev, uruchomione po smoke: `npx astro check`
- Smoke przechodzi bez zmian w istniejących krokach (w tym GET `/ingredients/new` z `<option value=` i wszystkie POST `/api/ingredients`)
- Smoke przechodzi z dwoma nowymi krokami listy składników (A widzi swój składnik, B go nie widzi)

#### Manual Verification:

- Zrzuty `/ingredients/new` i sekcji kitchen-sink na desktopie i 375 px: karta, pola, checkbox i przyciski w motywie kitchen, wygląd spójny ze stronami edycji
- Fokus z klawiatury widoczny na każdym polu, checkboxie, „Zapisz”, „Anuluj” i linkach stopki; po kliknięciu myszą pole nie pokazuje pierścienia
- „Anuluj” z pustego stanu składnika (z kategorią i z wyników wyszukiwania) wraca do tego samego widoku; z „Dodaj składnik” w nagłówku wraca na `/ingredients`
- Echo po błędzie walidacji zachowuje wszystkie pola, w tym uwagi i zaznaczony checkbox
- Lista składników: klik lub ↓ w polu „Składnik” rozwija zapisane składniki, pisanie zawęża listę, wybór myszą i ↓ + Enter wpisuje nazwę (Chrome/Edge; Firefox: dwuklik lub ↓); na telefonie podpowiedzi są dostępne
- Etykieta istniejący/nowy zgodna z `name_key` (wielkość liter, spacje); zapis nazwy istniejącej inną wielkością liter nie tworzy duplikatu; bez JS zostaje tekst pomocniczy, a zapis działa

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przed Fazą 2.

---

## Phase 2: Stan błędu przy polu (F1)

### Overview

Oba endpointy zamiennika odsyłają nazwę pola z błędem, a oba formularze oznaczają to pole i wiążą je z komunikatem. Kitchen-sink pokazuje stan błędu przy polu, a macierz 7 stanów obejmuje `/ingredients/new`.

### Changes Required:

#### 1. Wspólny parametr pola błędu

**File**: `src/lib/entry-fields.ts`

**Intent**: Jedno miejsce na nazwę parametru i bezpieczny odczyt, żeby oba endpointy i obie strony mówiły tym samym językiem.

**Contract**: stała `ERROR_FIELD_PARAM = "error_field"`; funkcja odczytu z `URLSearchParams`, która zwraca nazwę pola tylko wtedy, gdy należy do przekazanej listy dozwolonych pól, inaczej `null` (wartość z URL nie trafia do markupu bez sprawdzenia).

#### 2. Rozpoznanie duplikatu

**File**: `src/lib/services/substitutes.ts`

**Intent**: Endpointy muszą odróżnić duplikat nazwy (błąd pola) od ogólnego błędu bazy (błąd formularza) bez parsowania SQL.

**Contract**: `duplicateSubstituteMessage` eksportowana bez zmiany treści komunikatu; endpoint porównuje `result.error` z `duplicateSubstituteMessage(<znormalizowana nazwa>)`.

#### 3. `/api/ingredients`

**File**: `src/pages/api/ingredients.ts`

**Intent**: Każde przekierowanie walidacji i duplikatu wskazuje pole.

**Contract**: `errorRedirect(message, values?, field?)` dopisuje `error_field=<field>` na końcu, po echu. Mapowanie: nazwa składnika → `ingredient`; kategoria (pusta, niepoprawna) → `category_id`; nazwa zamiennika i duplikat → `substitute`; proporcja → `ratio`; uwagi → `notes`. Bez pola: „Baza danych nie jest skonfigurowana.”, „Nieprawidłowe dane formularza.”, ogólny błąd bazy. Przekierowanie sukcesu bez zmian.

#### 4. `api/substitutes/update`

**File**: `src/pages/api/substitutes/update.ts`

**Intent**: To samo dla edycji zamiennika.

**Contract**: `formRedirect` dostaje opcjonalne pole i dopisuje `error_field` za `error`. Mapowanie: nazwa i duplikat → `name`; proporcja → `ratio`; uwagi → `notes`. Bez pola: ogólny błąd bazy i „Nie znaleziono zamiennika.”. Przekierowania na listę bez zmian.

#### 5. Formularze i strony

**Files**: `src/components/ingredients/SubstituteCreateForm.astro`, `src/components/ingredients/SubstituteEditForm.astro`, `src/pages/ingredients/new.astro`, `src/pages/ingredients/edit-substitute.astro`

**Intent**: Strona czyta `error_field` (tylko z listy pól swojego formularza) i przekazuje go do formularza; formularz oznacza pole jak `IngredientRenameForm`.

**Contract**:

- Nowy prop `errorField?: string | null` w obu formularzach.
- `Alert` błędu dostaje `id={`${idPrefix}-error`}`.
- Pole wskazane przez `errorField` (i tylko ono) dostaje `aria-invalid="true"` i `aria-describedby` z id błędu; przy błędzie bez pola żadne pole nie jest oznaczone. Pole „Składnik” z listą ma już `aria-describedby` tekstu pomocniczego (Faza 1): przy błędzie dostaje oba id, najpierw błąd (`"<id błędu> <id tekstu>"`).
- Dozwolone pola: dodawanie `ingredient`, `category_id`, `substitute`, `ratio`, `notes`; edycja `name`, `ratio`, `notes`.

#### 6. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Udowodnić, że endpointy wskazują pole i że strona je oznacza, bez zmiany istniejących asercji.

**Contract**: nowe kroki (dopisane obok istniejących, które zostają):

- POST `/api/ingredients` z pustą proporcją → lokacja zawiera `error_field=ratio`;
- POST `/api/ingredients` z duplikatem → lokacja zawiera `error_field=substitute`;
- GET `/ingredients/new?error=…&error_field=ratio` → treść zawiera `aria-invalid="true"`;
- POST `/api/substitutes/update` z pustą proporcją → lokacja zawiera `error_field=ratio`;
- POST `/api/substitutes/update` z duplikatem → lokacja zawiera `error_field=name`.

#### 7. Kitchen-sink i macierz

**File**: `src/pages/dev/kitchen-sink.astro`

**Intent**: Pokazać stan błędu przy polu w obu formularzach i opisać macierz 7 stanów `/ingredients/new`.

**Contract**:

- Stan `ks-add-field-error` (echo + błąd proporcji z `errorField="ratio"`), a dotychczasowy stan błędu edycji (`ks-edit-error`) dostaje `errorField="ratio"`.
- Krótka tabela macierzy dla `/ingredients/new`: default, hover, focus-visible, error (pole i formularz), empty (= błąd ładowania kategorii; brak zapisanych składników = pole bez listy), disabled N/A (brak kontrolek bywających nieaktywnymi, pełne przeładowanie), loading N/A (SSR; jedyny `<script>` podpisuje pole „Składnik” z danych już w HTML, niczego nie dociąga).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Skan literałów przechodzi: `npm run lint:ui`
- Typy przechodzą przy zatrzymanym dev, uruchomione po smoke: `npx astro check`
- Smoke przechodzi z nowymi krokami `error_field` i bez zmian w istniejących krokach

#### Manual Verification:

- Każdy nowy krok smoke został raz celowo zepsuty i wtedy zawiódł
- Pusta proporcja w obu formularzach: pole „Proporcja” ma czerwoną ramkę, a czytnik ekranu (albo inspektor dostępności) podaje komunikat przy tym polu
- Duplikat nazwy oznacza pole nazwy zamiennika w obu formularzach; błąd ogólny nie oznacza żadnego pola
- Zrzuty stanów błędu w kitchen-sink na desktopie i 375 px

**Implementation Note**: Po fazie i zielonej weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie.

---

## Testing Strategy

### Unit Tests:

- Brak frameworka testów jednostkowych (`CLAUDE.md`, Commands). Odczyt `error_field` sprawdza smoke przez GET z poprawną wartością; wartość spoza listy jest odrzucana przez funkcję odczytu (przegląd kodu).

### Integration Tests:

- Smoke przy działającym dev: istniejące kroki formularza dodawania i edycji bez zmian plus 2 nowe kroki listy składników z Fazy 1 i 5 nowych kroków z Fazy 2.

### Manual Testing Steps:

1. Wejść na `/ingredients/new` z „Dodaj składnik” w nagłówku, wypełnić z pustą proporcją, wysłać: echo, oznaczone pole „Proporcja”, „Anuluj” → `/ingredients`.
   - Na tym samym formularzu: kliknąć w „Składnik”, wybrać zapisany składnik z listy (etykieta „Istniejący”), potem wpisać nową nazwę (etykieta „Nowy”); zapisać z nazwą istniejącą inną wielkością liter i sprawdzić, że zamiennik trafił do istniejącego składnika.
2. Z widoku składnika z kategorią, pusty stan → „Dodaj zamiennik”: prefill nazwy i kategorii, „Anuluj” wraca do tego widoku.
3. Dodać duplikat nazwy: oznaczone pole „Zamiennik”.
4. Na stronie edycji zamiennika: pusta proporcja i duplikat nazwy oznaczają odpowiednio „Proporcja” i „Nazwa zamiennika”.
5. Przejść cały formularz klawiaturą: widoczny fokus na każdej kontrolce, w tym checkboxie.

## Performance Considerations

Jedno dodatkowe zapytanie na GET `/ingredients/new` bez prefillu: `listIngredients` (`id, name` użytkownika, to samo, co robi `/ingredients`). Przy prefillu bez zmian. `datalist` z kilkuset opcjami to kilka KB HTML; przeglądarka filtruje listę w trakcie pisania. Skrypt etykiety to kilkadziesiąt linii bez zależności.

## Migration Notes

Brak zmian w bazie i w danych.

## References

- Research: `context/changes/ingredients-new-ui/research.md`
- Follow-up F1: `context/archive/2026-10-17-edit-entries/follow-ups/review-fixes.md`
- Wzorzec powłoki i formularza: `src/pages/ingredients/edit-substitute.astro:57-73`, `src/components/ingredients/SubstituteEditForm.astro`
- Wiązanie błędu z polem: `src/components/ingredients/IngredientRenameForm.astro:30-70`
- Poprzednia zmiana UI: `context/archive/2026-10-19-ingredients-list-ui/plan.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Widok na komponentach

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint`
- [x] 1.2 Skan literałów przechodzi z `new.astro` na liście `GUARDED`: `npm run lint:ui`
- [x] 1.3 Typy przechodzą przy zatrzymanym dev, uruchomione po smoke: `npx astro check`
- [x] 1.4 Smoke przechodzi bez zmian w istniejących krokach (w tym GET `/ingredients/new` z `<option value=` i wszystkie POST `/api/ingredients`)
- [x] 1.5 Smoke przechodzi z dwoma nowymi krokami listy składników (A widzi swój składnik, B go nie widzi)

#### Manual

- [x] 1.6 Zrzuty `/ingredients/new` i sekcji kitchen-sink na desktopie i 375 px: karta, pola, checkbox i przyciski w motywie kitchen, wygląd spójny ze stronami edycji
- [x] 1.7 Fokus z klawiatury widoczny na każdym polu, checkboxie, „Zapisz”, „Anuluj” i linkach stopki; po kliknięciu myszą pole nie pokazuje pierścienia
- [x] 1.8 „Anuluj” z pustego stanu składnika (z kategorią i z wyników wyszukiwania) wraca do tego samego widoku; z „Dodaj składnik” w nagłówku wraca na `/ingredients`
- [x] 1.9 Echo po błędzie walidacji zachowuje wszystkie pola, w tym uwagi i zaznaczony checkbox
- [x] 1.10 Lista składników: klik lub ↓ w polu „Składnik” rozwija zapisane składniki, pisanie zawęża listę, wybór myszą i ↓ + Enter wpisuje nazwę (Chrome/Edge; Firefox: dwuklik lub ↓); na telefonie podpowiedzi są dostępne
- [x] 1.11 Etykieta istniejący/nowy zgodna z `name_key` (wielkość liter, spacje); zapis nazwy istniejącej inną wielkością liter nie tworzy duplikatu; bez JS zostaje tekst pomocniczy, a zapis działa

### Phase 2: Stan błędu przy polu (F1)

#### Automated

- [ ] 2.1 Lint przechodzi: `npm run lint`
- [ ] 2.2 Skan literałów przechodzi: `npm run lint:ui`
- [ ] 2.3 Typy przechodzą przy zatrzymanym dev, uruchomione po smoke: `npx astro check`
- [ ] 2.4 Smoke przechodzi z nowymi krokami `error_field` i bez zmian w istniejących krokach

#### Manual

- [ ] 2.5 Każdy nowy krok smoke został raz celowo zepsuty i wtedy zawiódł
- [ ] 2.6 Pusta proporcja w obu formularzach: pole „Proporcja” ma czerwoną ramkę, a czytnik ekranu (albo inspektor dostępności) podaje komunikat przy tym polu
- [ ] 2.7 Duplikat nazwy oznacza pole nazwy zamiennika w obu formularzach; błąd ogólny nie oznacza żadnego pola
- [ ] 2.8 Zrzuty stanów błędu w kitchen-sink na desktopie i 375 px
