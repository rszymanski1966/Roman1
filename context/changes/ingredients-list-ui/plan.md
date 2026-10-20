# Widok listy zamienników na kontrakcie design systemu (ingredients-list-ui) — plan implementacji

## Overview

Widok `/ingredients` (`src/pages/ingredients/index.astro`) przechodzi z literałów palety Tailwind na tokeny i komponenty z `src/components/ui/`. Wygląd „kitchen” zostaje, a kontrast głównych akcji wchodzi na poziom AA. Przy okazji:

- dochodzi pasek akcji z „Dodaj składnik” i „Wyloguj się”;
- błąd akcji „najlepszy” pojawia się przy karcie, której dotyczy;
- fokus klawiatury jest widoczny na każdej kontrolce;
- strona kitchen-sink pokazuje widok w 7 stanach;
- skrypt i reguła w `CLAUDE.md` pilnują, żeby następny agent trzymał się kontraktu.

Change prowadzi `/10x-ui` (Moduł 2, Lekcja 5).

## Current State Analysis

Na podstawie `research.md` (zarzuty C1–C5):

- **Tokeny są martwe.** `src/styles/global.css:6-111` ma poprawne `:root` / `.dark` / `@theme inline` z szarymi wartościami shadcn: `--primary` jest prawie czarny (`:14`), `--ring` szary (`:25`). W 17 sprawdzonych plikach poza `ui/` nie ma żadnej klasy tokenowej koloru.
- **Motyw żyje w literałach.** Widok ma 52 trafienia skanu w 30 liniach, w tym 12 stałych klas (`index.astro:161-177`). `new.astro:42-44` kopiuje część z nich. `bg-kitchen` (`global.css:113-115`) to trzy hexy bez roli.
- **Kontrast.** Biały tekst na `orange-600` daje ok. 3,6:1, poniżej AA dla `text-sm` (C1).
- **Komponenty.** `ui/` ma tylko `button.tsx` (React, cva, eksportuje `buttonVariants`, `:50`). Widok nie importuje stamtąd nic (C2).
- **Fokus.** Inputy mają `focus:ring-orange-400` (`:162`), a przyciski i linki nie mają własnego stylu. Zostaje bazowe `outline-ring/50` z szarym `--ring` (C3).
- **Nawigacja.** Z listy z danymi nie ma akcji „Dodaj” ani wylogowania (`:419-423`). Pełni tę rolę panel (`dashboard.astro:15-30`) (C4).
- **Reguły.** `CLAUDE.md` nie ma reguły o tokenach. Plan S-01 kazał „naśladować `new.astro`” (`context/archive/2026-10-04-first-substitute-lookup/plan.md:156`) (C5).
- **Błąd akcji.** Błąd z `POST /api/substitutes/best` ląduje na górze strony (`index.astro:190-194`), a nie przy karcie.

## Desired End State

- **Tokeny.** `:root` niesie motyw kitchen pod nazwami shadcn: `--primary` = orange-700 (AA z białym), `--ring` pomarańczowy, `--accent` jasny pomarańcz, stone dla `foreground`/`muted`/`border`/`input`. Do tego nowa para `--success` / `--success-foreground` i zmienne gradientu, które czyta `bg-kitchen`. Surowe wartości i ich źródło są w `context/changes/ingredients-list-ui/theme-values.md`.
- **Komponenty.** `src/components/ui/` ma komponenty Astro: `Input`, `Label`, `NativeSelect`, `Card`, `Alert`, `Badge`. Przyciski i linki-CTA dostają klasy z `buttonVariants()`.
- **Widok.** Widok i jego części wydzielone do `src/components/ingredients/` mają 0 trafień skanu literałów. Na górze jest pasek akcji z „Dodaj składnik” (primary) i „Wyloguj się”.
- **Błąd przy karcie.** Błąd akcji „najlepszy”, który dotyczy wyświetlonego zamiennika, pokazuje się w jego karcie, a przeglądarka przewija do niej. Pozostałe błędy zostają na górze.
- **Kitchen-sink.** `/dev/kitchen-sink` (w produkcji 404) pokazuje widok w 7 stanach na fixturach. Disabled i loading są w widoku N/A z uzasadnieniem, a disabled komponentów jest pokazany.
- **Strażnik.** `npm run lint:ui` (skrypt `scripts/ui-literals.mjs`) działa lokalnie i jako krok CI, a `CLAUDE.md` ma blok UI poza markerami `10x-cli`.
- **Weryfikacja.** `npm run lint`, `npm run lint:ui`, `npx astro check` i `npm run smoke` (z nowymi krokami) przechodzą. Zrzuty kitchen-sink w szerokości desktop i 375 px zgadzają się z macierzą.

### Key Discoveries:

- Smoke nie sprawdza klas CSS. Zależy od tekstów, od `data-best-badge` i od `substituteIdFor`, czyli nazwy zamiennika jako `>{nazwa}<`, a po niej `name="substitute_id" value="<uuid>"` (`scripts/smoke.mjs:42-46`, `:188`). Porównuje `location` przez `startsWith` (`:425`), więc nowe parametry na końcu URL są zgodne wstecz.
- `best.ts` zna poprawny `substituteId` przy błędzie `is_best` (`src/pages/api/substitutes/best.ts:77`) i przy błędzie serwisu (`:83`; serwis zwraca „Nie znaleziono zamiennika.” dla P0002 oraz komunikat dla 23505, `src/lib/services/substitutes.ts:261-264`). Przy złym formacie id (`:72`) nie ma do czego się przypiąć.
- Krok smoke „account B cannot mark account A's substitute” (`smoke.mjs:381-386`) daje błąd z id, którego B nie widzi. To naturalny test powrotu komunikatu na górę.
- `output: "server"` (`astro.config.mjs:12`): strona może zwrócić `Response` 404, gdy `!import.meta.env.DEV`.
- Tailwind 4.3.3: dokładne wartości palety są w `node_modules/tailwindcss/theme.css` (np. `--color-orange-700: oklch(55.3% 0.195 38.402)`, `:29`). Szerokość pierścienia `ring-3` istnieje bez wartości arbitralnej.
- Lekcja „class:list czy cn()” (`context/foundation/lessons.md`): przy nadpisywaniu klas, np. `class` przekazanym do komponentu z wariantami, łączymy przez `cn()`.
- `SubmitButton.tsx:19` nadpisuje kolory `Button` literałami przez `cn()`, więc zmiana `--primary` nie zmieni stron auth.

## What We're NOT Doing

- Inne widoki (`ingredients/new.astro`, `dashboard.astro`, strony auth, landing, `Topbar`, `Welcome`, `Banner`) zostają na literałach. Dostaną własne change'e. Jedyny zamierzony wpływ na nie to kolor fokusu z tokenu `--ring`: bazowy obrys `outline-ring/50` na wszystkich stronach (`global.css:119`) oraz pierścień `focus-visible:ring-ring/50` przycisku `SubmitButton` na `/auth/signin` i `/auth/signup`, który przetrwa nadpisanie klas (`button.tsx:8`, `SubmitButton.tsx:18`). Patrz Faza 2. `border-border` nie zmieni nic widocznego, bo każda ramka poza `ui/` ma jawny kolor (plan-review F3).
- Wspólny nagłówek aplikacji w `Layout` (odłożony; pasek akcji tylko w tym widoku).
- Tryb ciemny jest odłożony, ale kontrakt jest na niego gotowy: kolory widoku idą wyłącznie przez tokeny, a komponenty nie mają wariantów `dark:`. Do `.dark` dopisujemy tylko parę `--success`, dla symetrii, z wartością tymczasową. Wartości `.dark` nie stroimy, bo bez przełącznika nie da się ich zobaczyć ani zmierzyć. Przyszły przełącznik (osobny change) będzie wymagał:
  - wartości motywu kitchen w `.dark`, w tym `--kitchen-*` i jaśniejszego `--success` (green-700 na ciemnym tle jest nieczytelny);
  - `color-scheme` per motyw w `global.css`, żeby natywne `<select>` / `<option>` i radio miały właściwe kolory (problem łatany kiedyś `text-black`);
  - przełącznika zapamiętywanego w ciasteczku (wzorzec jak `MATCH_MODE_COOKIE`), żeby serwer od razu renderował klasę `dark` na `<html>` i strona nie migała jasnym motywem;
  - kitchen-sink i tabeli kontrastu w `theme-values.md` dla obu motywów.
- Instalacja Playwrighta lub innego narzędzia do zrzutów. Bramką jest kitchen-sink plus zrzuty ręczne lub przez Chrome.
- Wtyczka ESLint dla Tailwinda.
- Aktywacja husky i lint-staged. Hook jest w repo nieaktywny, a jego włączenie zmieniłoby każdy commit, więc to osobna decyzja.
- JS w widoku: bez stanu „wysyłanie” po kliknięciu „Oznacz jako najlepszy”.
- Zmiany w `src/components/ui/button.tsx` (plik shadcn) i w `LibBadge.astro` (nieużywana pozostałość, poza strażnikiem).
- Ikony w Alert i Badge (`lucide-react` wymaga Reacta, widok jest statyczny).
- Zmiana wartości arbitralnej układu `md:grid-cols-[1fr_auto_1fr]` (`index.astro:209`). To układ, nie kolor, i skan jej nie łapie.

## Implementation Approach

Kolejność według routera `/10x-ui`: **biblioteka → wartości tokenów → widok → stany**, na końcu strażnik i reguła.

- Najpierw komponenty czytające tokeny po roli (z dzisiejszymi szarymi wartościami nic się w widoku nie zmienia, bo widok ich jeszcze nie używa).
- Potem wartości motywu w `:root`. Inne widoki nie czytają tokenów, więc zmiana ich nie rusza.
- Dalej widok przechodzi na komponenty, a jego części wydzielamy tak, żeby kitchen-sink renderował te same komponenty na fixturach.
- Na końcu stany: fokus, błąd przy karcie, pełna macierz w kitchen-sink.

Po każdej fazie wizualnej: zrzut desktop i 375 px oraz ponowny skan literałów na plikach widoku. Liczba trafień ma spadać, a wzrost to regresja.

## Critical Implementation Details

- **Smoke a markup.** Nazwa zamiennika musi zostać sama w swoim elemencie (dziś `<span>{substitute.name}</span>`, `index.astro:377`). W HTML za nią musi stać ukryte `name="substitute_id"`. Atrybut `data-best-badge` zostaje na plakietce. Teksty sprawdzane przez smoke („Nie znaleziono składnika”, „Pasujące składniki (N)”, „Wszystkie wyniki dla”, „Brak zamienników”) się nie zmieniają. Kolejność sekcji kategorii w HTML zostaje.
- **Skan a komponenty shadcn.** Wzorce new-york używają `ring-[3px]`, a skan to łapie. W komponentach Astro używamy `ring-3`.

---

## Faza 1: Komponenty w `ui/` i szkielet kitchen-sink

### Overview

Wspólne komponenty Astro dla pól, kart, komunikatów i plakietki, czytające tokeny po roli, oraz strona `/dev/kitchen-sink` pokazująca je we wszystkich stanach. Widok nie zmienia się w tej fazie.

### Changes Required:

#### 1. Komponenty formularza

**File**: `src/components/ui/Input.astro`, `src/components/ui/Label.astro`, `src/components/ui/NativeSelect.astro`

**Intent**: Zastąpić stringi `inputClass` / `labelClass`. Klasy wzorujemy na shadcn new-york (`input`, `label`, `native-select`) i budujemy wyłącznie z tokenów, z `focus-visible` na tokenie `ring` oraz stanami `disabled` i `aria-invalid`.

**Contract**: Każdy komponent przyjmuje atrybuty natywnego elementu (`...rest` na `<input>` / `<label>` / `<select>`) i `class` łączony przez `cn()`. `NativeSelect` renderuje natywny `<select>` z `<slot />` na `<option>` (bez Radix, działa w formularzu GET bez JS). Pierścień fokusu to `ring-3`, nie `ring-[3px]`. Wariantów `dark:` ze wzorców new-york (np. `dark:bg-input/30`) nie przenosimy. Ta zasada obowiązuje we wszystkich komponentach tego change'a, także w punkcie 2: tryb ciemny ma zmieniać się wyłącznie w tokenach.

#### 2. Karta, komunikat, plakietka

**File**: `src/components/ui/Card.astro`, `src/components/ui/Alert.astro`, `src/components/ui/Badge.astro`

**Intent**: Zastąpić `cardClass`, `infoClass`, `errorClass`, `noticeClass` i plakietkę „Najlepszy” komponentami z wariantami.

**Contract**:
- `Card`: kontener z `bg-card text-card-foreground border` i przekazywanym `class` (przez `cn()`).
- `Alert`: warianty przez `cva`: `default` (neutralny / info), `destructive` i `success`. Wariant `success` korzysta z tokenu dodanego w Fazie 2. Do tego czasu klasa jest martwa i nic nie renderuje, co jest akceptowalne.
- `Alert` przyjmuje `role` (`status` / `alert`) i resztę atrybutów, np. `data-*`, z `<slot />`.
- `Badge`: warianty `default` (primary) i `outline` oraz przekazywanie atrybutów (`data-best-badge` musi przejść).

#### 3. Przyciski

**File**: brak nowego pliku; konsumenci importują `buttonVariants` z `@/components/ui/button`

**Intent**: Przyciski i linki-CTA w `.astro` dostają klasy z `buttonVariants({ variant, size })` na natywnym `<button>` / `<a>`, bez renderowania Reacta.

**Contract**: Używane warianty: `default` (główne akcje), `outline` (oznaczanie najlepszego, wylogowanie), `link` (linki tekstowe), rozmiar `sm` dla akcji w karcie. Dodatkowe klasy, np. `w-full`, dokładamy przez `cn()`.

#### 4. Szkielet kitchen-sink

**File**: `src/pages/dev/kitchen-sink.astro`

**Intent**: Bramka wizualna. Strona pokazuje komponenty z punktów 1–3 w stanach default, hover (opis), focus-visible (opis „Tab”), disabled i error (`aria-invalid`) oraz warianty Alert, Badge i Button.

**Contract**: Gdy `!import.meta.env.DEV`, zwraca `new Response(null, { status: 404 })`. Używa `Layout`. Nie odpytuje bazy. Middleware jej nie chroni (`/dev` nie jest w `PROTECTED_ROUTES`), więc w trybie dev otwiera się bez logowania.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Skan literałów `/10x-ui` na nowych plikach `src/components/ui/{Input,Label,NativeSelect,Card,Alert,Badge}.astro` i `src/pages/dev/kitchen-sink.astro` daje 0 trafień

#### Manual Verification:

- `/dev/kitchen-sink` w `npm run dev` pokazuje wszystkie komponenty i ich stany. Wartości są jeszcze szare (domyślne shadcn), bo Faza 2 dopiero zmienia tokeny.
- `/ingredients` wygląda tak samo jak przed fazą (zrzut porównawczy)

**Implementation Note**: Po fazie i zielonych testach automatycznych zatrzymaj się na ręczne potwierdzenie.

---

## Faza 2: Wartości tokenów (motyw kitchen)

### Overview

Motyw kitchen przechodzi z literałów do `:root` pod istniejące nazwy shadcn, z poprawionym kontrastem. Dochodzą `--success` i zmienne gradientu. Surowe wartości trafiają do folderu change'a.

### Changes Required:

#### 1. Wartości w `:root` i publikacja

**File**: `src/styles/global.css`

**Intent**: Przenieść motyw na role, z dokładnymi wartościami oklch z `node_modules/tailwindcss/theme.css`. Komentarz przy bloku `:root` zawiera krótkie mapowanie token → krok palety Tailwind 4.3 (np. `--primary: orange-700`), żeby źródło wartości żyło obok nich. Komentarz nie odsyła do folderu change'a, bo `/10x-archive` go przeniesie (plan-review F2).

**Contract**: Mapowanie (krok palety Tailwind v4 → token):

| Token | Krok palety |
|---|---|
| `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground` | stone-900 |
| `--muted-foreground` | stone-600 |
| `--muted`, `--secondary` | stone-100 |
| `--border` | stone-200 |
| `--input` | stone-300 |
| `--primary` | orange-700 |
| `--primary-foreground` | bez zmian, `oklch(0.985 0 0)` |
| `--accent` | orange-50 |
| `--accent-foreground` | orange-700 |
| `--ring` | orange-500 |
| `--success` | green-700 |
| `--success-foreground` | `oklch(0.985 0 0)` |
| `--background`, `--card`, `--popover`, `--destructive`, `--radius` | bez zmian |

- Nowe `--color-success` i `--color-success-foreground` dochodzą do `@theme inline` jako `var(--…)`, bez surowych kolorów.
- Do `.dark` dochodzi para `--success` dla symetrii.
- Tokeny `chart-*` i `sidebar-*` zostają bez zmian (nieużywane).

#### 2. Gradient `bg-kitchen`

**File**: `src/styles/global.css`

**Intent**: Hexy gradientu trafiają do zmiennych w `:root`. Nazwa klasy `bg-kitchen` się nie zmienia, więc 6 stron działa bez zmian.

**Contract**: `--kitchen-from: #fffbeb`, `--kitchen-via: #fff7ed`, `--kitchen-to: #fef3c7` w `:root`. `@utility bg-kitchen` używa `linear-gradient(to bottom, var(--kitchen-from), var(--kitchen-via), var(--kitchen-to))`.

#### 3. Zapis wartości

**File**: `context/changes/ingredients-list-ui/theme-values.md`

**Intent**: Wartości nie mogą żyć tylko w czacie. Plik jest dowodem change'a (archiwizuje się razem z nim), a nie odnośnikiem dla reguł. Zawiera tabelę token → krok palety → oklch, źródło (paleta Tailwind 4.3.3 i dzisiejsze literały widoku) oraz zmierzone pary kontrastu.

**Contract**: Pary kontrastu do wpisania:
- `primary-foreground` na `primary`;
- `foreground` i `muted-foreground` na `card`;
- `success` na `success/10`;
- `destructive` na `destructive/10`;
- `ring` na `card` (≥ 3:1 dla wskaźnika fokusu).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- `@theme inline` w `src/styles/global.css` nie zawiera surowych kolorów (grep `oklch(\|#[0-9a-f]` w bloku `@theme inline` daje 0)

#### Manual Verification:

- Kitchen-sink pokazuje motyw kitchen, a kontrast z `theme-values.md` spełnia AA (tekst ≥ 4,5:1, wskaźnik fokusu ≥ 3:1)
- `/dashboard`, `/auth/signin` i `/ingredients/new` wyglądają jak przed fazą (zrzut porównawczy). Wyjątek: kolor fokusu jest teraz pomarańczowy, a nie szary. Dotyczy bazowego obrysu (`outline-ring/50`) i pierścienia przycisku logowania lub rejestracji (`SubmitButton`).
- `/ingredients` wygląda jak przed fazą (widok jeszcze nie czyta tokenów). Wyjątek jak wyżej: kolor bazowego obrysu fokusu.

**Implementation Note**: Po fazie i zielonych testach automatycznych zatrzymaj się na ręczne potwierdzenie.

---

## Faza 3: Widok na komponentach i tokenach, pasek akcji

### Overview

`index.astro` przechodzi na komponenty z Fazy 1 i tokeny z Fazy 2. Części widoku wydzielamy do `src/components/ingredients/`, żeby kitchen-sink renderował te same komponenty. Dochodzi pasek akcji.

### Changes Required:

#### 1. Wydzielone części widoku

**File**: `src/components/ingredients/IngredientsHeader.astro`, `LookupForms.astro`, `SubstituteCard.astro`, `EmptyState.astro`

**Intent**: Rozbić widok na części z jawnymi propsami, które da się renderować na fixturach w kitchen-sink. Logika wyboru widoku (`View`, zapytania, `withParams`) zostaje w stronie.

**Contract**:
- `IngredientsHeader`: tytuł „Zamienniki”, link-CTA „Dodaj składnik” (`buttonVariants()`, do `/ingredients/new`), formularz POST `/api/auth/signout` z przyciskiem „Wyloguj się” (`outline`).
- `LookupForms`: propsy `categories`, `ingredients`, `query`, `mode`, `viewCategory`, `ingredientParam`. Dwa formularze GET z tymi samymi `name` / `id` co dziś, na `Input`, `Label` i `NativeSelect`. Radio z `accent-primary`. Separator na `bg-border`.
- `SubstituteCard`: propsy `substitute` (typ `SubstituteListItem` z `src/types.ts:41`), widok powrotu (`ingredient`, `category`, `q`, `match`) i opcjonalny `error: string | null` (używany w Fazie 4). Wyróżnienie najlepszego: `border-primary bg-accent` przez `cn()`. Plakietka `Badge` z `data-best-badge`. Formularz POST `/api/substitutes/best` z tymi samymi ukrytymi polami i `aria-label` co dziś.
- `EmptyState`: komunikat (slot) i opcjonalny link-CTA (`href`, `label`).

#### 2. Strona

**File**: `src/pages/ingredients/index.astro`

**Intent**: Usunąć 12 stałych klas (`:161-177`) i wszystkie literały palety. Kontener strony przechodzi na `Card` / tokeny (`bg-card/70`, `border-border`). Komunikaty `notice` / `error` / `loadError` / `substitutesError` idą przez `Alert`. Puste stany przez `EmptyState`. Usuwamy `class="text-black"` z `<option>`, bo to pozostałość po motywie „cosmic”.

**Contract**: Te same parametry URL, ta sama logika i ta sama kolejność renderowania sekcji. Link „Wróć do panelu” zostaje (wariant `link`). Ograniczenia smoke z „Critical Implementation Details” są spełnione.

#### 3. Kitchen-sink: widok

**File**: `src/pages/dev/kitchen-sink.astro`

**Intent**: Dodać sekcję „Widok /ingredients” z częściami z punktu 1 na fixturach: pasek akcji, formularze, karta zwykła, karta najlepszego, lista dopasowań i puste stany.

**Contract**: Fixtury są lokalne w pliku strony i używają typów z `@/types`. Bez bazy.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Skan literałów `/10x-ui` na `src/pages/ingredients/index.astro` i `src/components/ingredients/*.astro` daje 0 trafień (dziś 52)
- Smoke przechodzi przy działającym `npm run dev`: `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- `/ingredients` z danymi: pasek akcji widoczny. „Dodaj składnik” prowadzi do `/ingredients/new`, „Wyloguj się” wylogowuje.
- Zrzuty `/ingredients` (desktop i 375 px) w stanach: lista z najlepszym, wyniki wyszukiwania, brak dopasowań. Motyw kitchen zostaje, przyciski są ciemniej pomarańczowe (AA).
- Kitchen-sink pokazuje sekcję widoku zgodną z prawdziwym `/ingredients`

**Implementation Note**: Po fazie i zielonych testach automatycznych zatrzymaj się na ręczne potwierdzenie.

---

## Faza 4: Stany, błąd przy karcie i macierz w kitchen-sink

### Overview

Zamykamy macierz 7 stanów: widoczny fokus na każdej kontrolce, błąd akcji „najlepszy” przy karcie (z powrotem na górę, gdy karty nie ma), N/A z uzasadnieniem dla disabled i loading w widoku, pełna macierz na kitchen-sink i nowe kroki smoke.

### Changes Required:

#### 1. Kontrakt przekierowania błędu

**File**: `src/pages/api/substitutes/best.ts`

**Intent**: Gdy błąd dotyczy poprawnego `substituteId`, przekierowanie niesie jego id i kotwicę karty. Widok może wtedy pokazać błąd przy karcie, a przeglądarka przewija do niej.

**Contract**:
- Dotyczy błędów z `:77` (zły `is_best`) i `:83` (błąd serwisu).
- `listRedirect` dostaje `error` oraz `error_for=<substituteId>`, a URL kończy się `#substitute-<substituteId>`.
- Kolejność parametrów: `ingredient`, `category`, `q`, `match`, `error`, `error_for`. Komentarz przy `listRedirect` (`:22`) zostaje zaktualizowany.
- Bez zmian: błędy bez poprawnego id (`:40`, `:52`, `:60`, `:72`), `notice` po zamianie (`:89`) i sukces bez komunikatu (`:91`).

#### 2. Widok: błąd przy karcie

**File**: `src/pages/ingredients/index.astro`, `src/components/ingredients/SubstituteCard.astro`

**Intent**: Gdy `error_for` wskazuje kartę obecną w `view.groups`, `Alert` (`destructive`, `role="alert"`, `data-substitute-error`) renderuje się w tej karcie, a górny komunikat błędu znika. W przeciwnym razie błąd jest na górze jak dziś.

**Contract**: Korzeń karty ma `id="substitute-<id>"`. `error_for` służy tylko do porównania z id wyświetlonych kart i nie trafia do HTML w surowej postaci. Kotwica nie może przesunąć nazwy zamiennika ani pola `substitute_id` (smoke).

#### 3. Fokus klawiatury

**File**: `src/components/ui/*.astro` (z Fazy 1), `src/components/ingredients/*.astro`, `src/pages/ingredients/index.astro`

**Intent**: Każda kontrolka widoku ma widoczny `focus-visible` z tokenu `ring`, a nie domyślny obrys przeglądarki ani `focus:`. Dotyczy pól, selectów, radio, przycisków, linków-CTA i linków tekstowych.

**Contract**: Wskaźnik fokusu ma kontrast ≥ 3:1 z tłem (WCAG 1.4.11). Przy `--ring` = orange-500 na `card` oznacza to pełne krycie tam, gdzie `ring-ring/50` nie wystarcza. Kolejność tabulacji zgodna z kolejnością wizualną: pasek akcji → formularz wyszukiwania → formularz listy → karty → link do panelu.

#### 4. Kitchen-sink: pełna macierz

**File**: `src/pages/dev/kitchen-sink.astro`

**Intent**: Sekcja widoku pokazuje każdy wiersz macierzy 7 stanów albo N/A z uzasadnieniem, w tym kartę z błędem i górny błąd (fallback).

**Contract**: Wiersze:

| Stan | Co pokazuje kitchen-sink |
|---|---|
| default | widok na tokenach |
| hover | opis i stan przycisków / linków |
| focus-visible | instrukcja „Tab” i komponenty z wymuszonym stanem do zrzutu, jeśli to możliwe |
| disabled | N/A w widoku (brak kontrolek, które mogą być nieaktywne; pełne przeładowanie stron); pokazany disabled `Button` / `Input` / `NativeSelect` |
| error | karta z błędem; górny `Alert` destructive; pole z `aria-invalid` |
| empty | 4 puste stany: brak składników, stan początkowy, brak dopasowań, brak zamienników |
| loading | N/A (SSR, widok bez `<script>`, nic nie dociąga się po renderze) |

#### 5. Smoke

**File**: `scripts/smoke.mjs`

**Intent**: Zabezpieczyć nowy kontrakt błędu i powrót na górę.

**Contract**: Nowe kroki dla konta A, po istniejących krokach „best”:
1. POST `/api/substitutes/best` z `bestForm(firstSubstituteId, "x")` daje 302, `location` startuje od `listPath`, a `locationIncludes` zawiera `error_for=${firstSubstituteId}`.
2. GET tej lokalizacji (bez kotwicy) daje 200 i `bodyIncludes: "data-substitute-error"`.

Dla konta B, powrót błędu na górę (plan-review F5). Krok sprawdzamy w miejscu, gdzie B ma już własne karty, bo wcześniej brak `data-substitute-error` byłby oczywisty:
1. Istniejący krok „account B adds its own ingredient” (`smoke.mjs:387-402`) zapisuje lokalizację przekierowania, czyli widok B z jego składnikiem, w nowej zmiennej, tak jak `listPath` dla konta A.
2. Po nim POST `/api/substitutes/best` jako B z id zamiennika A (`firstSubstituteId`) i widokiem B (jego składnik i `categoryId`) daje 302 i `locationIncludes` z `error_for=${firstSubstituteId}`. Lokalizacja trafia do nowej zmiennej.
3. GET tej lokalizacji jako B daje 200, `bodyIncludes: 'role="alert"'` i `bodyExcludes: "data-substitute-error"`. Treść strony zawiera też nazwę zamiennika B (`smoke-substitute-${runId}-b`), czyli karty B są widoczne, a błąd i tak jest na górze.

Nazwa kroku i jej komentarz opisują intencję w stylu istniejących kroków.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Typy przechodzą: `npx astro check`
- Skan literałów `/10x-ui` na plikach widoku, `src/components/ingredients/*.astro`, nowych `src/components/ui/*.astro` i `src/pages/dev/kitchen-sink.astro` daje 0 trafień
- Smoke z nowymi krokami przechodzi przy działającym `npm run dev`: `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- Zrzuty kitchen-sink (desktop i 375 px) pokazują każdy wiersz macierzy albo jego N/A z uzasadnieniem
- Nawigacja klawiaturą po `/ingredients`: fokus widoczny na każdej kontrolce, kolejność zgodna z wizualną
- Błąd przy karcie w prawdziwym widoku: po kroku z `is_best=x` (albo ręcznej modyfikacji formularza) strona przewija się do karty z komunikatem
- `/dev/kitchen-sink` po `npm run build` + `npm run preview` zwraca 404. Nie uruchamiać buildu przy działającym `npm run dev`.

**Implementation Note**: Po fazie i zielonych testach automatycznych zatrzymaj się na ręczne potwierdzenie.

---

## Faza 5: Strażnik i reguła

### Overview

Kontrakt utrzymuje się dłużej niż jedną sesję. Pilnują go skrypt skanu uruchamiany w CI oraz blok UI w `CLAUDE.md`. Lint-staged nie wchodzi w grę: `.husky/pre-commit` istnieje, ale husky nie jest aktywny (brak skryptu `prepare`, brak `core.hooksPath`), więc hook nigdy się nie uruchamia (plan-review F1).

### Changes Required:

#### 1. Skrypt skanu

**File**: `scripts/ui-literals.mjs`, `package.json`

**Intent**: Uruchamiać skan literałów `/10x-ui` na plikach objętych kontraktem i kończyć się błędem przy trafieniu, zamiast polegać na pamięci agenta.

**Contract**:
- Na początku pliku jest jawna lista strzeżonych ścieżek: `src/pages/ingredients/index.astro`, `src/components/ingredients/*.astro`, nowe komponenty `src/components/ui/{Input,Label,NativeSelect,Card,Alert,Badge}.astro` oraz `src/pages/dev/kitchen-sink.astro`. Lista rośnie z kolejnymi change'ami.
- Bez argumentów skrypt sprawdza całą listę. Z argumentami (lista plików) sprawdza tylko ich część wspólną z listą.
- Wyjście: `plik:linia: dopasowanie` i kod 1 przy trafieniach, kod 0 bez trafień.
- Wzorzec jest taki sam jak w `/10x-ui`. Skrypt działa w Node 22 bez zależności, w stylu `scripts/smoke.mjs`.
- Argumenty normalizujemy do ścieżek względnych wobec katalogu repo, z ukośnikami `/`, zanim porówna się je z listą. Na Windows mogą przyjść ścieżki absolutne (`C:/Users/...`) albo z `\`.
- Node API tylko przez importy `node:fs` i `node:path`. ESLint dla `scripts/**/*.mjs` zna wyłącznie globale `console`, `process`, `fetch` i `URLSearchParams` (`eslint.config.js:73-78`), więc inne globale dadzą `no-undef` (plan-review F4).
- `package.json`: skrypt `"lint:ui": "node scripts/ui-literals.mjs"`. Konfiguracji lint-staged nie zmieniamy.

#### 2. CI

**File**: `.github/workflows/ci.yml`

**Intent**: Strażnik działa też na PR-ach, nie tylko lokalnie.

**Contract**: Krok `- run: npm run lint:ui` po `npm run lint`, przed `npm run build`.

#### 3. Reguła UI

**File**: `CLAUDE.md`

**Intent**: Następny agent ma wiedzieć, gdzie są tokeny i komponenty, i że literałów w widokach objętych kontraktem nie wolno używać.

**Contract**: Nowa sekcja `## UI` w części ręcznej `CLAUDE.md` (przed `## Git`, poza blokiem `<!-- BEGIN @przeprogramowani/10x-cli -->`). Zawiera:
- tokeny w `src/styles/global.css` (`:root` / `.dark`, publikacja przez `@theme inline`); źródło wartości opisuje komentarz przy `:root`. Bez odnośników do folderów change'ów, bo archiwizacja je przenosi;
- komponenty w `src/components/ui/`: Astro dla widoków statycznych, `buttonVariants()` dla przycisków i linków. Przed utworzeniem komponentu sprawdź `ui/`. Nowe komponenty React dodawaj przez `npx shadcn@latest add`, a statyczne Astro wzoruj na new-york i buduj z tokenów;
- zakaz literałów kolorów i wartości arbitralnych (px/rem) w widokach, tylko tokeny po roli; `npm run lint:ui` pilnuje plików z listy w `scripts/ui-literals.mjs`, a wyczyszczony widok dopisujesz do listy;
- kitchen-sink: `src/pages/dev/kitchen-sink.astro` (tylko dev), aktualizowany przy zmianie widoku lub komponentu;
- tryb ciemny zmienia się tylko w `.dark` w `global.css`; w widokach i komponentach nie używaj wariantów `dark:` ani kolorów spoza tokenów.

Istniejący punkt o shadcn w `## Key conventions` (`CLAUDE.md:7`) zostaje albo odsyła do sekcji `## UI`, bez sprzeczności.

### Success Criteria:

#### Automated Verification:

- `npm run lint:ui` przechodzi (kod 0)
- `npm run lint:ui` kończy się kodem 1, gdy do strzeżonego pliku dopisać tymczasowo `text-orange-600` (sprawdzenie i cofnięcie zmiany)
- Lint przechodzi: `npm run lint`
- Krok `npm run lint:ui` jest w `.github/workflows/ci.yml` przed `npm run build`

#### Manual Verification:

- Sekcja `## UI` w `CLAUDE.md` leży poza markerami `10x-cli` i nie przeczy `## Key conventions`
- Na PR tego change'a workflow CI pokazuje krok `npm run lint:ui` i przechodzi

**Implementation Note**: Po fazie i zielonych testach automatycznych zatrzymaj się na ręczne potwierdzenie. Potem `/10x-impl-review`, a ustalenia UI triażujemy według skutku dla użytkownika (checklista `.claude/skills/10x-ui/references/ui-quality-checklist.md`).

---

## Testing Strategy

### Unit Tests:

- Repo nie ma frameworka testów jednostkowych (`CLAUDE.md`, sekcja Commands). Skrypt `ui-literals.mjs` sprawdzamy ręcznie przypadkiem z trafieniem i bez (Faza 5).

### Integration Tests:

- `npm run smoke` przy działającym `npm run dev`: istniejące 40 kroków plus 4 nowe (Faza 4: 2 dla konta A, 2 dla konta B).
- `npx astro check` jako bezpieczne sprawdzenie typów przy działającym dev.

### Manual Testing Steps:

1. Otwórz `/dev/kitchen-sink` (desktop i 375 px) i porównaj każdy wiersz macierzy z opisem.
2. Na `/ingredients` przejdź klawiszem Tab przez wszystkie kontrolki. Fokus ma być widoczny i iść w kolejności wizualnej.
3. Oznacz zamiennik jako najlepszy, potem zamień najlepszego: plakietka i komunikat sukcesu (`success`) działają.
4. Wywołaj błąd przy karcie: strona przewija się do karty z komunikatem.
5. Sprawdź `/dashboard`, `/auth/signin`, `/ingredients/new`: bez zmian poza kolorem fokusu (obrys i pierścień przycisku logowania).

## Performance Considerations

Brak istotnych: zmiany CSS i markupu SSR, bez nowych zapytań. Kitchen-sink nie działa w produkcji.

## Migration Notes

- Brak migracji danych. Zmiana kontraktu przekierowania `best.ts` jest addytywna: stare URL-e bez `error_for` dalej działają (błąd na górze).
- S-04 (`edit-entries`, gałąź `feat/edit-entries`, `0ebf0bb`) planuje wyciągnięcie `listRedirect` do wspólnego helpera i dodanie linków w kartach. Po merge'u tego change'a S-04 przechodzi `/10x-plan-review` pod nową regułę UI, `SubstituteCard` i `error_for`.

## References

- Research: `context/changes/ingredients-list-ui/research.md` (zarzuty C1–C5, macierz stanów, ograniczenia smoke)
- Skill: `.claude/skills/10x-ui/SKILL.md`, checklista `.claude/skills/10x-ui/references/ui-quality-checklist.md`
- Widok: `src/pages/ingredients/index.astro:161-177`, `:369-412`
- Tokeny: `src/styles/global.css:6-124`
- Przycisk: `src/components/ui/button.tsx:7-50`
- Kontrakt błędu: `src/pages/api/substitutes/best.ts:23-34`, `:70-84`
- Smoke: `scripts/smoke.mjs:42-46`, `:381-386`, `:418-429`
- Lekcja: `context/foundation/lessons.md` („class:list czy cn() w komponentach .astro”)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Komponenty w ui/ i szkielet kitchen-sink

#### Automated

- [x] 1.1 Lint przechodzi: `npm run lint` — 73867c3
- [x] 1.2 Typy przechodzą: `npx astro check` — 73867c3
- [x] 1.3 Skan literałów na nowych komponentach ui/ i kitchen-sink daje 0 trafień — 73867c3

#### Manual

- [x] 1.4 Kitchen-sink pokazuje wszystkie komponenty i ich stany (wartości jeszcze szare) — 73867c3
- [x] 1.5 /ingredients wygląda tak samo jak przed fazą — 73867c3

### Phase 2: Wartości tokenów (motyw kitchen)

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — a74b99a
- [x] 2.2 Typy przechodzą: `npx astro check` — a74b99a
- [x] 2.3 @theme inline nie zawiera surowych kolorów — a74b99a

#### Manual

- [x] 2.4 Kitchen-sink pokazuje motyw kitchen, kontrast z theme-values.md spełnia AA — a74b99a
- [x] 2.5 Dashboard, signin i ingredients/new bez zmian poza kolorem obrysu fokusu — a74b99a
- [x] 2.6 /ingredients wygląda jak przed fazą — a74b99a

### Phase 3: Widok na komponentach i tokenach, pasek akcji

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint`
- [x] 3.2 Typy przechodzą: `npx astro check`
- [x] 3.3 Skan literałów na widoku i src/components/ingredients daje 0 trafień
- [x] 3.4 Smoke przechodzi przy działającym dev

#### Manual

- [x] 3.5 Pasek akcji: Dodaj składnik i Wyloguj się działają
- [x] 3.6 Zrzuty /ingredients (desktop i 375 px) w trzech stanach, motyw kitchen z AA
- [x] 3.7 Kitchen-sink pokazuje sekcję widoku zgodną z /ingredients

### Phase 4: Stany, błąd przy karcie i macierz w kitchen-sink

#### Automated

- [ ] 4.1 Lint przechodzi: `npm run lint`
- [ ] 4.2 Typy przechodzą: `npx astro check`
- [ ] 4.3 Skan literałów na wszystkich strzeżonych plikach daje 0 trafień
- [ ] 4.4 Smoke z nowymi krokami przechodzi przy działającym dev

#### Manual

- [ ] 4.5 Zrzuty kitchen-sink (desktop i 375 px) pokazują każdy wiersz macierzy albo N/A
- [ ] 4.6 Fokus klawiatury widoczny na każdej kontrolce, kolejność zgodna z wizualną
- [ ] 4.7 Błąd przy karcie przewija do karty z komunikatem
- [ ] 4.8 /dev/kitchen-sink zwraca 404 po build + preview

### Phase 5: Strażnik i reguła

#### Automated

- [ ] 5.1 npm run lint:ui przechodzi
- [ ] 5.2 npm run lint:ui kończy się kodem 1 przy wstrzykniętym literale
- [ ] 5.3 Lint przechodzi: `npm run lint`
- [ ] 5.4 Krok lint:ui jest w CI przed build

#### Manual

- [ ] 5.5 Sekcja UI w CLAUDE.md poza markerami 10x-cli, bez sprzeczności
- [ ] 5.6 CI na PR pokazuje krok lint:ui i przechodzi
