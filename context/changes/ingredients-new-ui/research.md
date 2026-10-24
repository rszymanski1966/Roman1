---
date: 2026-10-22T19:12:50+02:00
researcher: Claude Code (claude-opus-5-5)
git_commit: 3cdbead
branch: feat/ingredients-new-ui
repository: rszymanski1966/Roman1
topic: "ingredients-new-ui: audyt widoku /ingredients/new pod kontrakt design systemu (10x-ui)"
tags: [research, codebase, ui, tailwind, shadcn, design-tokens, ingredients, forms, a11y, error-state]
status: complete
last_updated: 2026-10-22
last_updated_by: Claude Code (claude-opus-5-5)
---

# Research: ingredients-new-ui

**Date**: 2026-10-22T19:12:50+02:00
**Researcher**: Claude Code (claude-opus-5-5)
**Git Commit**: 3cdbead (main po PR #23; gałąź `feat/ingredients-new-ui` bez własnych commitów)
**Branch**: feat/ingredients-new-ui
**Repository**: rszymanski1966/Roman1

## Research Question

Dwukierunkowy audyt widoku `src/pages/ingredients/new.astro` (formularz „Dodaj zamiennik”) według `/10x-ui`:

- **źródło → widoki:** gdzie żyją tokeny i komponenty i ile z nich używają widok oraz jego sąsiedzi;
- **widok → źródło:** który token albo komponent powinien pokryć każdy literał.

Wynik to 3–5 zarzutów (file:line i skutek dla użytkownika), potwierdzony wariant kontraktu, macierz 7 stanów oraz fakty do decyzji o follow-upie F1 z S-04 (`error_field`). Brief i wstępne zarzuty są w `change.md` (`## Notes`).

Zakres: jeden widok plus to, czego dotyka jego przepływ (`/api/ingredients`). Research nie uruchamiał aplikacji, smoke ani buildu i nie robił zrzutów. Twierdzenia o wyglądzie to wnioski z kodu do potwierdzenia zrzutem w implementacji.

## Summary

- **Wariant kontraktu: istniejący design system.** Tokeny są w `src/styles/global.css` (motyw kitchen z ingredients-list-ui: `--primary` = orange-700 `:31`, `--ring` = orange-600 `:44`, `--destructive` = red-700 `:39`, `bg-kitchen` `:141-143`). Komponenty są w `src/components/ui/` (Input, Label, NativeSelect, Textarea, Card, Alert, Badge, `buttonVariants`, `focusRing`/`focusOutline`). Sąsiednie widoki (`index.astro`, `edit-substitute.astro`, `edit-ingredient.astro` i ich formularze) mają 0 trafień skanu literałów. Ta zmiana nie potrzebuje nowych wartości tokenów ani nowej biblioteki: faza „środowisko” i faza „wartości tokenów” są puste.
- **`new.astro` nie czyta systemu.** 0 importów z `@/components/ui/`, 0 odwołań do `buttonVariants`/`focusRing`/`focusOutline`, jedyna klasa tokenowa to `bg-kitchen` (`new.astro:48`). Skan z `/10x-ui` daje 23 trafienia w 12 liniach. Ostrzejszy wzorzec repo (`scripts/ui-literals.mjs:30-31`) daje 25 (dodatkowo `placeholder-stone-400` w `:43` i `accent-orange-600` w `:145`). Plik nie jest na liście `GUARDED` (`scripts/ui-literals.mjs:11-25`), więc CI go nie sprawdza.
- **Cztery zarzuty (szczegóły w `## Charges`):**
  - C1: literały zamiast tokenów, w tym przycisk „Zapisz” na `bg-orange-600` z białym tekstem;
  - C2: ręcznie zbudowane pola, przycisk, karta, komunikat i checkbox zamiast `ui/`, limity długości wpisane liczbami;
  - C3: wejścia z listy gubią kontekst, a jedyne wyjście prowadzi na `/dashboard`;
  - C4: błąd zapisu nie wskazuje pola (follow-up F1).
- **F1 jest tani i bezpieczny dla smoke.** Spośród 13 ścieżek błędu, które wracają na `/ingredients/new`, 10 wskazuje jednoznacznie jedno pole, a 3 dotyczą całego formularza (`src/pages/api/ingredients.ts:44-95`). Smoke sprawdza przekierowania prefiksem i `includes` (`scripts/smoke.mjs:627-633`). Kroki `:253` i `:291` wymagają, żeby `error` był **pierwszym** parametrem, więc `error_field` musi iść po nim (najprościej na końcu).
- **Wzorzec docelowy już istnieje:** powłoka strony z `edit-substitute.astro:57-73` (`bg-kitchen` + `Card`) i formularz wydzielony do komponentu jak `SubstituteEditForm.astro` / `IngredientRenameForm.astro`, renderowany w kitchen-sink z `idPrefix`. Pełne wiązanie błędu z polem (`aria-invalid` + `aria-describedby` + `id` na `Alert`) jest w `IngredientRenameForm.astro:32,42,64-65`.

## Charges

| ID  | Kategoria                             | Gdzie                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Skutek dla użytkownika                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Brakujące tokeny                      | `src/pages/ingredients/new.astro:43` (`border-stone-300 bg-white text-stone-900 placeholder-stone-400 focus:ring-orange-400`), `:44` (`text-stone-700`), `:49` (`border-amber-900/10 bg-white/70 text-stone-900`), `:50`, `:53` i `:152` (`border-red-300 bg-red-50 text-red-700`), `:78` i `:82` (`text-black` na `<option>`), `:145` (`accent-orange-600`), `:147`, `:156` (`bg-orange-600 text-white hover:bg-orange-700`), `:163`, `:164` (`text-orange-700`) | Główna akcja „Zapisz” ma biały tekst na `orange-600`. Dla tej pary ingredients-list-ui zmierzył ok. 3,6:1, poniżej 4,5:1 dla tekstu 14 px (`context/archive/2026-10-19-ingredients-list-ui/research.md:39`), więc osoby słabiej widzące gorzej ją czytają. Jest też innego odcienia niż „Dodaj składnik” na liście (`bg-primary` = orange-700), z którego użytkownik tu przyszedł. Komunikat błędu ma inną czerwień niż błędy na liście i na stronach edycji (`destructive`).                                                                                                             |
| C2  | Brakujący wspólny komponent           | `new.astro:42-44` (stałe `inputClass`/`labelClass`), pola `:56-137`, checkbox `:141-149`, komunikat `:152`, przycisk `:154-159`, karta `:49`; limity `maxlength={100}` `:66`, `:99`, `:116` i `maxlength={500}` `:132`                                                                                                                                                                                                                                            | Pola mają fokus `focus:ring-orange-400` (`:43`), który pojawia się także po kliknięciu myszą i ma inny kolor niż token `--ring` (orange-600, 3,59:1 na karcie, `context/archive/2026-10-19-ingredients-list-ui/theme-values.md`) używany na wszystkich innych formularzach. Checkbox „Najlepszy zamiennik” nie ma `focusOutline` (`:145`), więc fokus z klawiatury zależy od domyślnego stylu przeglądarki. Limity wpisane liczbami mogą rozjechać się z walidacją API, która czyta `MAX_NAME`/`MAX_RATIO`/`MAX_NOTES` (`src/pages/api/ingredients.ts:3`, `src/lib/entry-fields.ts:5-7`). |
| C3  | Przypadkowa architektura              | wyjście: `new.astro:163-167` (jedyny link „Wróć do panelu” → `/dashboard`); wejścia: `src/components/ingredients/IngredientsHeader.astro:11` (goły link), `src/pages/ingredients/index.astro:156-161` (prefill bez `q`/`match`); zapis: `src/pages/api/ingredients.ts:98-107`; błąd ładowania: `new.astro:52-53`                                                                                                                                                  | Użytkownik przychodzi tu z listy (z widoku składnika, kategorii albo wyników wyszukiwania), ale „wycofać się” może tylko na `/dashboard`, czyli dwa kliknięcia od miejsca, w którym był, i bez swojego wyszukiwania. Po zapisie zawsze ląduje w widoku nowego składnika zawężonym do kategorii z formularza, a link „← Wszystkie wyniki” znika, bo `q` przepada. Gdy nie wczytają się kategorie, formularz znika i zostaje tylko czerwony komunikat i link do panelu.                                                                                                                     |
| C4  | Przypadkowa architektura (stan błędu) | `new.astro:152` (`<p>` po checkboxie, przed „Zapisz”, bez `role="alert"`); `src/pages/api/ingredients.ts:23-39` (`errorRedirect` odsyła sam tekst, bez nazwy pola)                                                                                                                                                                                                                                                                                                | Formularz ma 5 pól, a komunikat (np. „Podaj proporcję.”) nie oznacza żadnego z nich: brak czerwonej ramki i `aria-invalid`, brak `aria-describedby`. Użytkownik czytnika ekranu nie dowie się, które pole poprawić, a widzący musi sam porównać tekst z etykietami. To ten sam brak co follow-up F1 z S-04 (`context/archive/2026-10-17-edit-entries/follow-ups/review-fixes.md:5`).                                                                                                                                                                                                      |

Nie ma zarzutu deferred w obrębie tego widoku. Poza zakresem: `src/pages/dashboard.astro:10,19` (te same literały, osobny widok) i formularz edycji zamiennika (patrz „Decyzje dla planu”, punkt 3).

## Detailed Findings

### Źródło → widoki

Liczby z regexów opisanych niżej, policzone na stanie `3cdbead`.

| Plik                                                    | Klasy tokenowe   | Importy z `@/components/ui/` | `buttonVariants`/`focusRing`/`focusOutline` | Trafienia `ui-literals` |
| ------------------------------------------------------- | ---------------- | ---------------------------- | ------------------------------------------- | ----------------------- |
| `src/pages/ingredients/new.astro`                       | 1 (`bg-kitchen`) | 0                            | 0                                           | 25                      |
| `src/pages/ingredients/index.astro`                     | 6                | 4                            | 4                                           | 0                       |
| `src/pages/ingredients/edit-substitute.astro`           | 5                | 2                            | 0                                           | 0                       |
| `src/pages/ingredients/edit-ingredient.astro`           | 5                | 2                            | 0                                           | 0                       |
| `src/components/ingredients/SubstituteEditForm.astro`   | 5                | 6                            | 6                                           | 0                       |
| `src/components/ingredients/IngredientRenameForm.astro` | 1                | 5                            | 6                                           | 0                       |

- Klasy tokenowe: prefiks `bg|text|border|ring|outline|accent|placeholder|…` plus nazwa tokenu z `global.css` (`primary`, `muted-foreground`, `destructive`, `card`, `border`, `input`, `kitchen` …). Niskie liczby w widokach wynikają z tego, że style niosą komponenty, nie klasy w widoku.
- Trafienia `ui-literals` liczone wzorcem `PATTERN` z `scripts/ui-literals.mjs:30-31`.
- Tokeny dostępne dla tego widoku (`src/styles/global.css:23-61`, publikowane w `@theme inline` `:101-139`): `background`, `foreground`, `card`, `primary` (orange-700), `muted-foreground` (stone-600), `accent`, `destructive` (red-700), `success`, `border` (stone-200), `input` (stone-300), `ring` (orange-600), promienie `sm..xl`, `--kitchen-from/-via/-to` (`:45-47`). Nie ma tokenu dla stone-700 (etykiety) ani stone-400 (placeholder) ani amber-900/10 (ramka karty). Przejście na komponenty zmienia więc te trzy odcienie na `text-foreground` / `placeholder:text-muted-foreground` / `border-border`. To świadoma, drobna zmiana wyglądu, taka sama jak na stronach edycji.
- Dark mode: „deferred, contract ready” (`context/archive/2026-10-19-ingredients-list-ui/plan.md:52-57`). `.dark` nie ma wartości `--kitchen-*` (`global.css:82`). Ta zmiana nie dotyka `.dark`.

### Widok → źródło (literał → token / komponent)

| `new.astro`                  | Literał / konstrukcja                                                                                                                                               | Zastępuje                                                                                                                                                                                                                                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `:42-43`                     | `inputClass` (`rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 placeholder-stone-400 … focus:ring-2 focus:ring-orange-400 focus:outline-none`) | `Input.astro`, `NativeSelect.astro`, `Textarea.astro` (każdy ma `border-input bg-card text-foreground`, `focusRing`, styl `aria-invalid`; `src/components/ui/Input.astro:12-16`, `NativeSelect.astro:13-17`, `Textarea.astro:14-18`). Kształt zmienia się z `rounded-lg py-2` na `h-9 rounded-md py-1`. |
| `:44`                        | `labelClass` (`mb-1 block text-sm text-stone-700`)                                                                                                                  | `<Label>` w opakowaniu `div.space-y-2`, jak `SubstituteEditForm.astro:63`                                                                                                                                                                                                                               |
| `:48`                        | wrapper `bg-kitchen flex min-h-screen items-center justify-center p-4`                                                                                              | bez zmian (identyczny w `edit-substitute.astro:58`)                                                                                                                                                                                                                                                     |
| `:49`                        | `div` z `border border-amber-900/10 bg-white/70 text-stone-900`                                                                                                     | `<Card class="w-full max-w-md rounded-2xl border-border bg-card/70 p-8 text-foreground shadow-sm backdrop-blur-xl">` (`edit-substitute.astro:59`, `edit-ingredient.astro:55`)                                                                                                                           |
| `:50`                        | `h1 … text-center text-stone-900`                                                                                                                                   | `text-foreground`; strony edycji nie mają `text-center` (`edit-substitute.astro:60`)                                                                                                                                                                                                                    |
| `:53`, `:152`                | `<p class="rounded-lg border border-red-300 bg-red-50 … text-red-700">`                                                                                             | `<Alert role="alert" variant="destructive">` (`src/components/ui/Alert.astro:10`)                                                                                                                                                                                                                       |
| `:78`, `:82`                 | `<option class="text-black">`                                                                                                                                       | usunąć klasę; opcje idą w slot `NativeSelect` (`NativeSelect.astro:6,21`), jak w `LookupForms.astro:70-79`                                                                                                                                                                                              |
| `:135`                       | wartość `<textarea>` jako dziecko (`{echoedNotes}`)                                                                                                                 | `Textarea` przyjmuje wartość jako **prop** `value` (`Textarea.astro:6-10`); przeniesienie dziecka 1:1 zgubiłoby echo uwag                                                                                                                                                                               |
| `:145`                       | checkbox `h-4 w-4 accent-orange-600`                                                                                                                                | `cn("accent-primary", focusOutline)`, wzorzec natywnych radio z `LookupForms.astro:25`. Komponentu `Checkbox` w `ui/` nie ma i żaden inny widok nie ma checkboxa.                                                                                                                                       |
| `:147`                       | etykieta checkboxa `text-sm text-stone-700`                                                                                                                         | `<Label for="is_best" class="font-normal">` (`LookupForms.astro:48`)                                                                                                                                                                                                                                    |
| `:154-159`                   | przycisk `bg-orange-600 … text-white hover:bg-orange-700`                                                                                                           | `cn(buttonVariants(), focusRing)` (`src/components/ui/button.tsx:12`, `focus.ts:4`)                                                                                                                                                                                                                     |
| `:163-164`                   | `text-stone-600`, link `text-orange-700 hover:underline`                                                                                                            | `IngredientsFooter` (`src/components/ingredients/IngredientsFooter.astro:7-20`) albo `buttonVariants({ variant: "link" })` + `focusRing`. `IngredientsFooter` dodaje „Wyloguj się” i `border-t`, czyli zmianę zachowania.                                                                               |
| `:66`, `:99`, `:116`, `:132` | `maxlength={100}` ×3, `maxlength={500}`                                                                                                                             | `MAX_NAME`, `MAX_RATIO`, `MAX_NOTES` (`src/lib/entry-fields.ts:5-7`), jak `SubstituteEditForm.astro:71,84,92`                                                                                                                                                                                           |

Lekcja `class:list` vs `cn()` (`context/foundation/lessons.md:12-17`) wymienia `new.astro` jako przykład łączenia przez `class:list`. Po przejściu na komponenty ten przypadek znika, bo stałe `inputClass`/`labelClass` przestają istnieć.

### Wejścia i wyjścia

Wejścia, wszystkie znalezione grepem `src/` i `scripts/` na `3cdbead`:

| Źródło                                                                           | Link                                 | Przekazywany kontekst listy                                                                          | Gubiony                                 |
| -------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `IngredientsHeader.astro:11` („Dodaj składnik”, renderowany w `index.astro:201`) | `/ingredients/new`                   | nic (komponent nie ma propsów)                                                                       | składnik, kategoria, `q`, `match`       |
| `index.astro:156-159` (pusty stan składnika, „Dodaj zamiennik”)                  | `?ingredient=<id>&category=<id>`     | id składnika (prefill nazwy przez `listIngredients`, `new.astro:33-38`) i kategoria (wybór w select) | `q`, `match`                            |
| `index.astro:161` (brak dopasowań wyszukiwania, „Dodaj składnik”)                | `?ingredient_name=<q>&category=<id>` | `q` jako prefill nazwy (nie jako kontekst listy), kategoria                                          | `match`; `q` nie wraca jako widok listy |
| `index.astro:219` (pusta lista, „Dodaj pierwszy składnik”)                       | `/ingredients/new`                   | — (nie ma czego nieść)                                                                               | —                                       |
| `src/pages/dashboard.astro:19`                                                   | `/ingredients/new`                   | —                                                                                                    | —                                       |

Konflikt nazw do rozstrzygnięcia w planie: na `new.astro` parametr `ingredient` to id składnika do prefillu (`new.astro:9`), tak samo jak `ListView.ingredient` (`src/lib/list-view.ts`). Pole POST `ingredient` to natomiast **nazwa** składnika (`src/pages/api/ingredients.ts:27,67`), a echo nazwy wraca jako `ingredient_name`. Ukryte pola kontekstu listy z `SubstituteEditForm.astro:58-61` (`name="ingredient"`) zderzyłyby się z polem nazwy w tym formularzu.

Wyjścia:

- `new.astro:163-167`: jedyny link „Wróć do panelu” → `/dashboard`. Brak „Anuluj”, brak `IngredientsFooter`, brak ukrytych pól widoku listy.
- Strony edycji, dla porównania: `parseListView` z URL i zapasowy widok z bazy (`edit-substitute.astro:18,39-46`, `edit-ingredient.astro:19,40-47`), ukryte pola widoku (`SubstituteEditForm.astro:58-61`, `IngredientRenameForm.astro:49-52`), „Anuluj” na `listRedirect(view)` (`SubstituteEditForm.astro:31,99-101`), `IngredientsFooter` (`edit-substitute.astro:70`, `edit-ingredient.astro:66`). Po zapisie `listRedirect(view, { notice: "Zapisano zmiany." })` (`src/pages/api/substitutes/update.ts:84`, `src/pages/api/ingredients/rename.ts:69`).
- Sukces `/api/ingredients` (`src/pages/api/ingredients.ts:98-107`): `/ingredients?ingredient=<nowy/istniejący id>&category=<kategoria z formularza>` plus opcjonalnie `notice` (zamiana najlepszego) albo `error` (nieudane oznaczenie najlepszego, bez `error_for`, więc trafia do górnego `Alert`, `index.astro:208-212`). `q` i `match` przepadają w każdym przypadku sukcesu.

### Wejścia brzegowe

| Przypadek                                        | Ścieżka                                                                                                              | Co widzi użytkownik                                                                                                                                                                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Niezalogowany, GET                               | `src/middleware.ts:18-21` (`startsWith("/ingredients")`)                                                             | 302 na `/auth/signin`; prefill przepada                                                                                                                                                                                                                                                       |
| Niezalogowany, POST `/api/ingredients`           | `src/pages/api/ingredients.ts:47-49`                                                                                 | 302 na `/auth/signin`; wpisane dane przepadają                                                                                                                                                                                                                                                |
| Klient Supabase `null`                           | middleware ustawia `user = null` (`src/middleware.ts:14-15`) i przekierowuje na signin, zanim strona się wyrenderuje | Gałąź `new.astro:23-24` („Baza danych nie jest skonfigurowana.”) jest nieosiągalna przez HTTP; tak samo komunikat z `api/ingredients.ts:43-44` ginie po drodze przez middleware                                                                                                               |
| Błąd `listCategories`                            | `new.astro:26-28`                                                                                                    | `<p>` z komunikatem ogólnym (`new.astro:52-53`), formularz ukryty, tylko link do panelu                                                                                                                                                                                                       |
| Zero kategorii                                   | `new.astro:77-86`                                                                                                    | Select ma tylko „Wybierz kategorię” (`required`), przeglądarka blokuje wysyłkę bez komunikatu aplikacji. W praktyce nieosiągalne: 3 kategorie są seedowane, a `categories` ma dla `authenticated` tylko politykę SELECT (`supabase/migrations/20261004120000_substitute_database.sql:17-25`). |
| Nieznane / cudze / zniekształcone `?ingredient=` | `new.astro:33-38` (RLS + `find`)                                                                                     | Puste pole „Składnik”, bez komunikatu (zachowanie poprawne: brak prefillu)                                                                                                                                                                                                                    |
| Nieznane `?category=`                            | `new.astro:78,82`                                                                                                    | Żadna opcja nie pasuje, select pokazuje placeholder                                                                                                                                                                                                                                           |

### Stan błędu: `/api/ingredients` → `new.astro`

`errorRedirect(message, values?)` (`src/pages/api/ingredients.ts:23-39`) buduje `/ingredients/new?error=<msg>` i dopisuje echo tylko niepustych wartości w kolejności `ingredient_name`, `category` (tylko poprawny UUID), `substitute`, `ratio`, `notes`, `is_best=1`. Parametr `error` jest zawsze pierwszy.

| Linia                                           | Komunikat                                                                   | Pole                                  |
| ----------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------- |
| `:44`                                           | Baza danych nie jest skonfigurowana. (bez echa)                             | formularz (nieosiągalne, patrz wyżej) |
| `:56`                                           | Nieprawidłowe dane formularza. (bez echa)                                   | formularz                             |
| `:67`, `:69`                                    | Podaj nazwę składnika. / Nazwa składnika może mieć najwyżej 100 znaków.     | `ingredient`                          |
| `:71`, `:72`                                    | Wybierz kategorię. / Wybrana kategoria jest nieprawidłowa.                  | `category_id`                         |
| `:73`, `:75`                                    | Podaj nazwę zamiennika. / Nazwa zamiennika może mieć najwyżej 100 znaków.   | `substitute`                          |
| `:77`, `:79`                                    | Podaj proporcję. / Proporcja może mieć najwyżej 100 znaków.                 | `ratio`                               |
| `:82`                                           | Uwagi mogą mieć najwyżej 500 znaków.                                        | `notes`                               |
| `:95` (z `src/lib/services/substitutes.ts:164`) | Zamiennik „X” jest już zapisany dla tego składnika w tej kategorii. (23505) | `substitute`                          |
| `:95` (z `substitutes.ts:121-165`)              | komunikat ogólny bazy                                                       | formularz                             |
| `:103` (z `substitutes.ts:180`)                 | Zamiennik zapisany, ale nie udało się oznaczyć go jako najlepszy.           | trafia na listę, nie do formularza    |

To daje 13 ścieżek błędu wracających na `/ingredients/new` (12 wywołań `errorRedirect`, z czego `:95` rozdziela się na duplikat i błąd ogólny): 10 z jednoznacznym polem i 3 formularzowe (`:44`, `:56`, ogólny błąd bazy). Ogólny błąd bazy obejmuje też poprawny UUID nieistniejącej kategorii (FK), czego kod nie odróżnia (wniosek ze schematu, nie sprawdzony uruchomieniem).

Asercje smoke dotyczące tego formularza (`scripts/smoke.mjs`, porównanie w `:627-633`: `location` = `startsWith`, `locationIncludes` = `includes`):

| Krok                                                       | Żądanie                              | Sprawdzenie                                                                                                      |
| ---------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `:125-133`                                                 | POST anonimowo                       | prefiks `/auth/signin`                                                                                           |
| `:151-160`                                                 | GET `/ingredients/new`               | 200, treść zawiera `<option value=`; krok parsuje `<option value="<uuid>"`, więc ten kształt markupu musi zostać |
| `:163-179`, `:181-194`, `:294-305`, `:391-399`, `:562-580` | POST sukces                          | prefiks `/ingredients?ingredient=`                                                                               |
| `:240-254`                                                 | POST z pustą proporcją i `is_best=1` | prefiks `/ingredients/new?error=` + `includes("is_best=1")`                                                      |
| `:255-274`                                                 | POST sukces z najlepszym             | prefiks `listPath` + `includes` notice                                                                           |
| `:275-293`                                                 | POST duplikat                        | prefiks `/ingredients/new?error=Zamiennik+%E2%80%9E<MARKER>%E2%80%9D`                                            |

Wniosek: kroki `:253` i `:291` wymagają `error` jako pierwszego parametru (`:291` nawet całego komunikatu zaraz po `?`). `error_field` może stać w dowolnym miejscu **po** `error`; dopisanie go na końcu zachowuje kształt „błąd, potem echo”. Przekierowania sukcesu się nie zmieniają, o ile `error_field` nie trafi na przekierowanie na listę.

### Ten sam mechanizm dla formularza edycji zamiennika

- `formRedirect` w `src/pages/api/substitutes/update.ts:25-33` buduje `/ingredients/edit-substitute?substitute=<id>&ingredient[&category][&q][&match]&name&ratio&notes&error`, czyli `error` jest **ostatni**.
- Komunikaty z polem: nazwa (`:72`, `:73`, duplikat z `substitutes.ts:361`), proporcja (`:74`, `:75`), uwagi (`:76`). Formularzowe: ogólny błąd bazy i „Nie znaleziono zamiennika.” (`substitutes.ts:362`, `:364`).
- Smoke dla `update.ts` (`scripts/smoke.mjs:425-431`, `:447-459`, `:460-474`, `:531-541`) używa prefiksu ścieżki i `includes`, więc `error_field` w dowolnym miejscu ich nie łamie.
- `SubstituteEditForm.astro:41-45` ma `Alert` bez `id`; pola mają już stabilne id z `idPrefix` (`:32`). `Input`, `Textarea` i `NativeSelect` przekazują atrybuty `aria-*` przez `...rest` (`Input.astro:8,18`, `Textarea.astro:10,20`, `NativeSelect.astro:9,19`).

Koszt objęcia formularza edycji to jedna funkcja w `update.ts`, wiązanie w `SubstituteEditForm.astro` i ewentualny krok smoke. To jednak drugi widok, a `/10x-ui` zakłada jeden widok na zmianę. Decyzja należy do planu (punkt 3 niżej).

### Macierz 7 stanów dla `/ingredients/new`

| Stan          | Dziś                                                                             | Po zmianie (kandydat)                                                                                                                                                                                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| default       | literały (C1, C2)                                                                | tokeny i komponenty `ui/`                                                                                                                                                                                                                                                                                 |
| hover         | `hover:bg-orange-700` na przycisku (`:156`), `hover:underline` na linku (`:164`) | z `buttonVariants` (`hover:bg-primary/90`) i wariantu `link`/`outline`                                                                                                                                                                                                                                    |
| focus-visible | `focus:ring-orange-400` także po kliknięciu (`:43`), checkbox bez stylu (`:145`) | `focusRing` na polach, select, textarea i przyciskach; `focusOutline` na checkboxie                                                                                                                                                                                                                       |
| disabled      | brak kontrolek nieaktywnych                                                      | **N/A w widoku**: formularz nie ma kontrolek, które bywają nieaktywne, a wysyłka to pełne przeładowanie strony (to samo uzasadnienie co `context/archive/2026-10-19-ingredients-list-ui/plan.md:317-327`). Stany disabled komponentów już są w kitchen-sink (`src/pages/dev/kitchen-sink.astro:154-259`). |
| error         | `<p>` bez powiązania z polem (C4)                                                | `Alert` z `id` + pole z `aria-invalid` i `aria-describedby` wskazane przez `error_field`; błąd formularzowy tylko w `Alert`                                                                                                                                                                               |
| empty         | błąd ładowania kategorii ukrywa formularz (`:52-53`)                             | stan „nie udało się wczytać” z wyjściem do listy; zero kategorii praktycznie nieosiągalne (patrz wejścia brzegowe)                                                                                                                                                                                        |
| loading       | —                                                                                | **N/A**: SSR, strona bez `<script>`, nic nie dociąga się po renderze (jak w ingredients-list-ui)                                                                                                                                                                                                          |

Kitchen-sink (`src/pages/dev/kitchen-sink.astro`, 633 linie) ma sekcje komponentów (`:154-338`), widok `/ingredients` z tabelą macierzy (`:340-508`, `:596-630`) i sekcje stron edycji, które renderują wydzielone formularze w kilku stanach z `idPrefix` (`:510-551`, `:553-594`). Sekcji `/ingredients/new` i przykładu checkboxa nie ma.

## Code References

- `src/pages/ingredients/new.astro:7-14` - odczyt `error`, prefill (`ingredient`, `category`) i echo (`ingredient_name`, `substitute`, `ratio`, `notes`, `is_best`)
- `src/pages/ingredients/new.astro:20-39` - klient Supabase, `listCategories`, prefill nazwy przez `listIngredients`
- `src/pages/ingredients/new.astro:42-44` - lokalne stałe klas `inputClass`/`labelClass`
- `src/pages/ingredients/new.astro:48-167` - markup: powłoka, formularz, komunikat błędu, przycisk, link do panelu
- `src/pages/api/ingredients.ts:23-39` - `errorRedirect` (kolejność parametrów)
- `src/pages/api/ingredients.ts:44-107` - walidacja, zapis, przekierowanie po sukcesie
- `src/pages/ingredients/edit-substitute.astro:57-73` - docelowa powłoka strony
- `src/components/ingredients/SubstituteEditForm.astro:28-103` - docelowy wzorzec wydzielonego formularza
- `src/components/ingredients/IngredientRenameForm.astro:30-70` - wiązanie błędu z polem
- `src/components/ingredients/LookupForms.astro:25,39-50` - natywne radio z `accent-primary` + `focusOutline`
- `src/components/ingredients/IngredientsFooter.astro:7-20` - stopka z powrotem do panelu i wylogowaniem
- `src/lib/list-view.ts` - `parseListView`, `setListViewParams`, `listRedirect`
- `src/lib/entry-fields.ts:5-7` - `MAX_NAME`, `MAX_RATIO`, `MAX_NOTES`
- `scripts/ui-literals.mjs:11-25,30-31` - lista `GUARDED` i wzorzec
- `scripts/smoke.mjs:151-160,240-293,627-633` - asercje formularza i porównanie lokacji
- `src/pages/dev/kitchen-sink.astro:23-28,510-594` - bramka dev i sekcje formularzy

## Architecture Insights

- Kontrakt UI jest kompletny i stosowany. Widoki z S-04 pokazują, że nowy formularz da się złożyć wyłącznie z `ui/` bez nowych tokenów. Brakujące elementy to drobne wzorce, nie komponenty: checkbox (natywny, jak radio), opakowanie pola (`div.space-y-2` powtarzane ręcznie) i powłoka strony (kopiowana ręcznie w 3 widokach i w kitchen-sink).
- Formularz wydzielony do `src/components/ingredients/` z `idPrefix` to ustalony sposób na pokazanie stanów w kitchen-sink (`context/archive/2026-10-17-edit-entries/plan.md`, sekcja Deviations). Glob `src/components/ingredients/*.astro` w `GUARDED` obejmie nowy komponent automatycznie.
- Kolejność parametrów w przekierowaniach jest częścią kontraktu z smoke: `listRedirect` ma ustaloną kolejność (`list-view.ts`), `errorRedirect` stawia `error` na początku, `formRedirect` w `update.ts` na końcu.

## Historical Context (from prior changes)

- `context/archive/2026-10-04-first-substitute-lookup/plan.md:156` - źródło dryfu: „Strony Fazy 3 mają naśladować `src/pages/ingredients/new.astro`” (tło `bg-kitchen`, karta `bg-white/70`, paleta stone/orange). Zarzut C5 w ingredients-list-ui wskazał to jako mechanizm kopiowania literałów (`context/archive/2026-10-19-ingredients-list-ui/research.md:43,54`).
- `context/archive/2026-10-19-ingredients-list-ui/change.md:36` i `plan.md:50` - `new.astro` świadomie poza zakresem, „dostanie własną zmianę”; jedyny zamierzony wpływ to kolor fokusu z `--ring` (sprawdzony w a74b99a).
- `context/archive/2026-10-19-ingredients-list-ui/reviews/impl-review.md:104` (F6) - czerwony ring pola z `aria-invalid` naprawiony w `Input`/`Textarea`/`NativeSelect` z myślą o „pierwszym widoku formularza, który użyje `aria-invalid` (`ingredients/new`)”.
- `context/archive/2026-10-19-ingredients-list-ui/theme-values.md` - wartości tokenów i kontrasty; ramka pola (stone-300) 1,49:1 zaakceptowana, bo każde pole ma widoczną etykietę (F7). Checkbox `is_best` ma etykietę po prawej stronie, więc warunek F7 jest spełniony.
- `context/archive/2026-10-17-edit-entries/plan.md:39,61` i `reviews/plan-review.md:28-37` (F1) - strony edycji biorą z `new.astro` tylko logikę (echo, ukryte pola, komunikat), a markup z `ui/`; kopiowanie markupu `new.astro` było zarzutem CRITICAL.
- `context/archive/2026-10-17-edit-entries/reviews/impl-review.md:28-36` (F1) i `follow-ups/review-fixes.md:5` - wiązanie błędu z polem zrobione w formularzu zmiany nazwy (jedno pole); formularz zamiennika i `new.astro` czekają na `error_field`.
- Bramka wizualna w ingredients-list-ui: kitchen-sink plus zrzuty desktop i 375 px jako punkty Manual, bez Playwrighta (`context/archive/2026-10-19-ingredients-list-ui/plan.md:58,75`). S-04 nie miał kryteriów zrzutów.

## Related Research

- `context/archive/2026-10-19-ingredients-list-ui/research.md` - audyt `/ingredients`, wprowadzenie wartości tokenów
- `context/archive/2026-10-17-edit-entries/research.md` - formularze edycji, kontekst listy, echo

## Decyzje dla planu

Fakty są ustalone; poniższe to wybory produktowe albo zakresowe dla `/10x-plan`.

1. **Kontekst listy w formularzu dodawania (C3).** Czy „Anuluj” wraca do widoku, z którego użytkownik przyszedł (wymaga przekazania `q`/`match` przez linki wejścia i nazw parametrów, które nie zderzą się z polem `ingredient` = nazwa), czy wystarczy „Anuluj” na `/ingredients`? Osobno: czy przekierowanie po sukcesie zostaje „widok nowego wpisu” (pokazuje efekt zapisu), czy też ma wracać do widoku źródłowego.
2. **Stopka.** `IngredientsFooter` (spójnie ze stronami edycji, ale dodaje „Wyloguj się”) czy sam link powrotu.
3. **Zakres F1.** `error_field` dla `/api/ingredients` + `new.astro` jest w zakresie C4. Objęcie `update.ts` + `SubstituteEditForm` to ten sam mechanizm i niski koszt, ale drugi widok; do wyboru: tutaj albo deferred do osobnej małej zmiany.
4. **Wydzielenie formularza** do `src/components/ingredients/` (np. `SubstituteCreateForm.astro`) z `idPrefix`, żeby kitchen-sink pokazał stany default / echo + błąd pola / błąd formularzowy / błąd ładowania. Wzorzec jest ustalony; nazwa do wyboru.
5. **Checkbox.** Natywny z `accent-primary` + `focusOutline` (bez nowej zależności, zgodnie z radio) zamiast shadcn `Checkbox` (React + Radix, wyspa JS).

## Open Questions

- Brak pytań blokujących. Niezweryfikowane uruchomieniem: kontrast białego tekstu na `orange-600` (przyjęty z pomiaru ingredients-list-ui), ścieżka FK dla poprawnego UUID nieistniejącej kategorii (wniosek ze schematu) oraz efekt `rows={3}` przy `field-sizing-content` w `Textarea` (S-04 impl-review F4: bez efektu w przeglądarkach z `field-sizing`).
