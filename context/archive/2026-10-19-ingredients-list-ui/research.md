---
date: 2026-10-19T18:54:02+02:00
researcher: Claude Code (claude-opus-5-5)
git_commit: 3de30462
branch: feat/ingredients-list-ui
repository: rszymanski1966/Roman1
topic: "ingredients-list-ui: audyt widoku /ingredients pod kontrakt design systemu (10x-ui)"
tags: [research, codebase, ui, tailwind, shadcn, design-tokens, ingredients, focus-visible]
status: complete
last_updated: 2026-10-19
last_updated_by: Claude Code (claude-opus-5-5)
---

# Research: ingredients-list-ui

**Date**: 2026-10-19T18:54:02+02:00
**Researcher**: Claude Code (claude-opus-5-5)
**Git Commit**: 3de3046 (main po PR #18; gałąź `feat/ingredients-list-ui` bez własnych commitów)
**Branch**: feat/ingredients-list-ui
**Repository**: rszymanski1966/Roman1

## Research Question

Dwukierunkowy audyt widoku `src/pages/ingredients/index.astro` według `/10x-ui`:

- **źródło → widoki:** gdzie żyją wartości i komponenty i kto ich używa;
- **widok → źródło:** który token albo komponent powinien pokryć każdy literał.

Wynik to 3–5 zarzutów (file:line i skutek dla użytkownika), potwierdzony wariant kontraktu i stan macierzy 7 stanów. Brief i wstępne zarzuty są w `change.md` (`## Notes`).

Zakres: jeden widok plus globalne tokeny. Research nie uruchamiał aplikacji ani nie robił zrzutów ekranu. Twierdzenia wizualne są oznaczone jako wnioski do potwierdzenia na zrzucie w fazie implementacji.

## Summary

- **Wariant kontraktu: „fresh starter with a dead token file”.** `global.css` ma poprawnie rozdzielone `:root` / `.dark` / `@theme inline` (`src/styles/global.css:6`, `:41`, `:75`). Wartości to szare domyślne shadcn, np. `--primary: oklch(0.205 0 0)` (`:14`), `--ring: oklch(0.708 0 0)` (`:25`). W 17 sprawdzonych plikach `.astro`/`.tsx` poza `components/ui/` nie ma ani jednej klasy tokenowej koloru. Prawdziwy motyw aplikacji (stone/orange/amber, „kitchen”) żyje wyłącznie w literałach.
- **Wniosek dla planu.** Samo przepięcie widoku na obecne tokeny zmieniłoby wygląd na szary. Pierwszy krok to przeniesienie istniejącego motywu na istniejące nazwy zmiennych (`--primary`, `--ring`, `--border`, `--muted-foreground` …), potem przepięcie widoku. Drugiego `shadcn init` nie robimy.
- **Widok ma 52 trafienia skanu w 30 liniach i 0 importów z `components/ui/`.** Lokalny „design system” to 12 stałych z klasami (`src/pages/ingredients/index.astro:161-177`). Część z nich `new.astro` kopiuje dosłownie (`src/pages/ingredients/new.astro:42-44`).
- **Pięć zarzutów (szczegóły w `## Charges`):**
  - C1: brak tokenów; kontrast białego tekstu na `bg-orange-600` wychodzi ok. 3,6:1, poniżej AA dla `text-sm`;
  - C2: trzy własne style przycisków obok `ui/button` oraz pola, karty i komunikaty jako stringi klas;
  - C3: fokus klawiatury bez własnego tokenu, oparty na szarym `outline-ring/50`;
  - C4: z listy z danymi nie da się dodać wpisu ani się wylogować, węzłem jest panel ze startera;
  - C5: żadna reguła agentów nie wskazuje tokenów, a historyczny plan kazał „naśladować `new.astro`”, czyli kopiować literały.
- **Smoke nie zależy od klas CSS.** Zależy od tekstów, `data-best-badge` i kolejności `>{nazwa}<` … `name="substitute_id" value=…` w HTML (`scripts/smoke.mjs:42-46`, `:188`). To twarde ograniczenie dla zmian markupu.

## Charges

| # | Kategoria | Dowód (file:line) | Skutek dla użytkownika |
|---|---|---|---|
| C1 | Brakujące tokeny | `src/pages/ingredients/index.astro:161-177` (stałe klas: `stone-*`, `orange-*`, `red-*`, `green-*`, `bg-white`), `:181-183` (karta strony: `border-amber-900/10 bg-white/70 text-stone-900`), `:236`, `:247` (`accent-orange-600`), `:259`, `:263`, `:290`, `:294`, `:306`, `:310` (`text-black` na `<option>`), `:276`, `:279` (`bg-stone-300`), `:381` (plakietka `bg-orange-600 text-white`), `:376-390`, `:419-420`; `src/styles/global.css:113-115` (`bg-kitchen` z trzema hexami, bez roli); `src/styles/global.css:6-39` (tokeny niezgodne z motywem) | Przyciski i plakietka „Najlepszy” mają biały tekst na `orange-600`. Kontrast wychodzi ok. 3,6:1, poniżej 4,5:1 wymaganego dla tekstu 14 px, więc osoby słabiej widzące gorzej czytają główne akcje. Poprawka wymaga dziś edycji literałów w wielu miejscach zamiast jednego tokenu, a nowe strony z S-04 skopiują kolejne odcienie. |
| C2 | Brakujący wspólny komponent | `src/pages/ingredients/index.astro:164-167` (`submitClass`, `ctaClass`), `:176-177` (`markButtonClass`): trzy przyciski obok `src/components/ui/button.tsx:7-48`; `:161-163` (`inputClass`, `labelClass`) skopiowane w `src/pages/ingredients/new.astro:42-44`; `:169-173` (`infoClass`, `errorClass`, `noticeClass`, `cardClass`) zamiast Card/Alert; `:379-384` (plakietka) zamiast Badge | Przyciski różnią się wysokością, zaokrągleniem (`rounded-lg` vs `rounded-md` w `ui/button`) i zachowaniem przy fokusie i hoverze, więc ta sama akcja wygląda inaczej na różnych stronach. Każda nowa strona składa formularz od nowa ze stringów i dziedziczy ich błędy (np. C3). |
| C3 | Stany (`focus-visible`), brakujący token | `src/pages/ingredients/index.astro:162` i `:177` (`focus:ring-2 focus:ring-orange-400 focus:outline-none`: `focus`, a nie `focus-visible`, i literał zamiast `ring`); `:164-168` (przyciski submit/CTA i linki bez stylu fokusu); `src/styles/global.css:119` (bazowe `outline-ring/50`) i `:25` (`--ring` szary, `oklch(0.708 0 0)`) | Osoba nawigująca klawiaturą po „Szukaj”, „Pokaż zamienniki”, CTA i linkach widzi tylko półprzezroczysty szary obrys na pomarańczowym albo jasnym tle, więc łatwo gubi, gdzie jest. Wniosek z CSS, do potwierdzenia na zrzucie. |
| C4 | Przypadkowa architektura (nawigacja) | `src/pages/ingredients/index.astro:419-423` (jedyna nawigacja: „Wróć do panelu”); CTA dodawania tylko w pustych stanach (`:202`, `:330`, `:364`); `src/pages/dashboard.astro:15-30` (panel ze startera trzyma „Znajdź zamiennik”, „Dodaj zamiennik” i „Wyloguj się”) | Użytkownik, który ma już składniki i chce dodać kolejny, nie znajdzie na liście żadnej akcji „Dodaj”. Musi wrócić do panelu albo trafić na pusty stan. Wylogowanie też jest tylko w panelu. Ekran odzwierciedla kolejność dodawania funkcji, a nie przepływ pracy. |
| C5 | Przypadkowa architektura (reguła agentów) | `CLAUDE.md:6-7` (reguły `cn()` i shadcn, brak reguły o tokenach i zakazie literałów); `context/archive/2026-10-04-first-substitute-lookup/plan.md:156` (aneks: strony „mają naśladować `src/pages/ingredients/new.astro`: tło `bg-kitchen`, karta `bg-white/70` z paletą stone/orange”) | Mechanizmem utrzymywania wyglądu było kopiowanie literałów z sąsiedniej strony. Bez reguły następny agent, np. przy stronach edycji z S-04, skopiuje te same stałe zamiast tokenów i komponentów, a użytkownik znów dostanie rozjeżdżające się odcienie i stany. |

Żaden zarzut nie jest teraz odłożony (deferred). Decyzje o odłożeniu podejmuje `/10x-plan`. Kandydaci do odłożenia są w `## Open Questions`.

## Detailed Findings

### Źródło wartości (source → views)

- Tokeny shadcn są kompletne i poprawnie publikowane: `@theme inline` (`src/styles/global.css:75-111`) zawiera tylko odwołania `var(--…)` i wyliczenia promienia, bez surowych kolorów. Znana pułapka trybu ciemnego (surowe kolory w `@theme inline`) tu nie występuje.
- Wartości to domyślne neutralne shadcn (`components.json`: `"baseColor": "neutral"`, `"cssVariables": true`). `--primary` jest prawie czarny (`global.css:14`), `--ring` szary (`:25`). `--chart-1: oklch(0.646 0.222 41.116)` (`:26`) przypadkiem równa się palecie `orange-600` z Tailwind v4, ale nikt jej nie używa.
- Liczby użyć: skrypt policzył klasy `bg|text|border|ring|outline-{primary,secondary,muted,accent,destructive,card,background,foreground,border,input,ring,*-foreground}` w 17 plikach `.astro`/`.tsx` z `git ls-files` poza `src/components/ui/`. Wynik: 0 w każdym pliku. Tokeny działają w widoku tylko pośrednio, przez warstwę bazową (`global.css:117-124`: `border-border outline-ring/50`, `bg-background text-foreground` na `body`). `bg-background` przykrywa `bg-kitchen` w kontenerze widoku.
- `bg-kitchen` (`global.css:113-115`) to `@utility` z gradientem `#fffbeb → #fff7ed → #fef3c7` (amber-50 / orange-50 / amber-100). Używa go 6 stron (`ingredients/index.astro:181`, `ingredients/new.astro:48`, `dashboard.astro:8`, `auth/{signin,signup,confirm-email}.astro`). Wartości nie mają nazwy roli ani wariantu `.dark`.
- Tryb ciemny: `@custom-variant dark` (`global.css:4`) i blok `.dark` istnieją. Skrypt nie znalazł w `src/` żadnego miejsca dodającego klasę `dark` (szukane wzorce: `class="dark`, `classList.add("dark"`). Wniosek: tryb ciemny jest N/A dla tego change'a.

### Komponenty (source → views)

- `src/components/ui/` zawiera `button.tsx` (shadcn new-york, React, cva) i `LibBadge.astro`. Jedynym konsumentem `Button` poza `ui/` jest `src/components/auth/SubmitButton.tsx:3`, który i tak nadpisuje kolory literałami (`:19`: `bg-orange-600 … hover:bg-orange-700`).
- `buttonVariants` jest eksportowany (`button.tsx:50`). Skrypt nie znalazł jego użycia poza `ui/`. Funkcję można wywołać w `.astro` jako string klas dla natywnego `<button>`/`<a>`, bez renderowania Reacta. To jedna z opcji dla C2.
- React w `.astro` występuje dziś tylko jako wyspy z `client:load` (`auth/signin.astro:12`, `auth/signup.astro:12`). Statyczny render komponentu React bez dyrektywy `client:*` nie ma precedensu w repo. Wiadomo z dokumentacji Astro, że daje czysty HTML bez hydratacji, ale w tym repo nie było to sprawdzane.
- Domyślne warianty `ui/button` mają `focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]` (`button.tsx:8`), czyli fokus oparty na tokenie. Stałe przycisków w widoku tego nie mają (C3).

### Widok → źródło: mapa literałów

Skan z `/10x-ui` dał 52 trafienia w 30 liniach. Rozkład: `text-stone` 12, `bg-orange` 7, `text-black` 6, `bg-white` 5, `text-white` 3, `text-orange` 3, `border-stone` 3, `ring-orange` 2, `border-orange` 2, `bg-stone` 2 oraz po 1: `text-red`, `border-red`, `bg-red`, `text-green`, `border-green`, `bg-green`, `border-amber`. Wartość arbitralna: `md:grid-cols-[1fr_auto_1fr]` (`index.astro:209`). Wzorzec skanu jej nie łapie, bo `-\[[0-9.]+(px|rem)\]` szuka tylko px/rem. To układ, nie kolor.

Proponowane pokrycie przez role (do decyzji w planie):

| Literał w widoku | Rola / token |
|---|---|
| `bg-orange-600` / `hover:bg-orange-700` + `text-white` (`:165`, `:167`, `:381`) | `bg-primary` / `hover:bg-primary/90` + `text-primary-foreground` |
| `text-orange-700` (linki, `:168`, `:420`) | `text-primary` (przy ciemniejszym `--primary`) |
| `text-stone-900` (`:172`, `:182-183`, `:376`) | `text-foreground` / `text-card-foreground` |
| `text-stone-700`, `-600`, `-500` (`:163`, `:169`, `:228`, `:275`, `:387`, `:390`, `:419`) | `text-foreground` albo `text-muted-foreground` (dziś trzy odcienie bez reguły) |
| `border-stone-300` / `-200`, `bg-stone-300` (`:162`, `:169`, `:173`, `:276`, `:279`) | `border-input` / `border-border`, separator `bg-border` |
| `bg-white`, `bg-white/60`, `bg-white/70`, `bg-white/80` (`:162`, `:169`, `:173`, `:177`, `:182`) | `bg-card` / `bg-background` (cztery poziomy przezroczystości bez reguły) |
| `ring-orange-400` (`:162`, `:177`) | `ring-ring` przez `focus-visible:` |
| `border-orange-400 bg-orange-50`, `border-orange-300`, `hover:bg-orange-100` (`:175`, `:177`) | `border-primary` + `bg-accent` (albo nowy token wyróżnienia, decyzja planu) |
| `border-red-300 bg-red-50 text-red-700` (`:170`) | `destructive` (`border-destructive/… text-destructive`) |
| `border-green-300 bg-green-50 text-green-800` (`:171`) | brak tokenu „success” w shadcn; decyzja planu (nowy token albo neutralny `muted`) |
| `accent-orange-600` (`:236`, `:247`) | `accent-primary` |
| `text-black` na `<option>` (6×) | pozostałość, patrz niżej; do usunięcia |
| `border-amber-900/10` (`:182`) | `border-border` |

Pozostałość: `class="text-black"` na `<option>` pochodzi z motywu „cosmic”. Tam pole miało `text-white` na `bg-white/10` (`git show e009821:src/pages/ingredients/new.astro:37`, `:73`), więc opcje listy rozwijanej potrzebowały czarnego tekstu. Po zmianie na jasne pola (`index.astro:162`: `bg-white … text-stone-900`) klasa nic już nie daje.

Kontrast (obliczenie przybliżone z wartości palety Tailwind v4, do potwierdzenia narzędziem w fazie tokenów):

| Para | Kontrast | Ocena |
|---|---|---|
| biały na `orange-600` (≈ `#f54900`) | ok. 3,6:1 | poniżej AA 4,5:1 dla `text-sm font-medium` |
| biały na `orange-700` (≈ `#ca3500`) | ok. 5,2:1 | spełnia AA |

### Macierz 7 stanów (stan dzisiejszy)

| Stan | Dziś w widoku | Ocena |
|---|---|---|
| default | literały palety (C1), 0 tokenów, 0 komponentów z `ui/` | do zrobienia |
| hover | przyciski `hover:bg-orange-700` (`:165`, `:167`), `hover:bg-orange-100` (`:177`), linki `hover:underline` (`:168`); karty wyników bez hovera (`:339`, link w środku ma underline) | jest, ale na literałach |
| focus-visible | patrz C3 | słabe / bez tokenu |
| disabled | `grep -c disabled` w widoku = 0. Wszystkie formularze to pełnostronicowe GET/POST bez JS. | Kandydat na N/A z uzasadnieniem (brak kontrolek, które mogą być nieaktywne), decyzja planu |
| error | `?error=` jako `<p role="alert">` na górze karty (`:190-194`). Błędy z `POST /api/substitutes/best` (np. „Nie znaleziono zamiennika.”, `src/pages/api/substitutes/best.ts:72`) też lądują na górze, a nie przy karcie, której dotyczą. `loadError` / `substitutesError` są w miejscu treści (`:196-197`, `:323-324`). Kolor `red-*` z rolą `alert`, więc nie tylko kolorem. | jest; „przy akcji” tylko częściowo |
| empty | prawdziwe puste stany z tekstem i CTA: brak składników (`:198-205`), stan początkowy (`:326`), brak dopasowań (`:327-333`), brak zamienników (`:357-367`), nieznany lub cudzy id (`:57-58`, `:356-367`) | jest |
| loading | strona renderowana na serwerze (SSR), widok nie ma `<script>`, formularze robią pełne przeładowanie. Po kliknięciu „Oznacz jako najlepszy” nie ma informacji zwrotnej do nawigacji. | Kandydat na N/A albo minimalny stan (decyzja planu); bez przeskoku układu, bo nic nie dociąga się po renderze |

Nazwy dostępne: pola mają `<label for>` (`:212`, `:255`, `:286`, `:302`), radio mają etykiety (`:238`, `:249`) i `fieldset`/`legend` (`:226-227`), przycisk wyróżnienia ma `aria-label` z nazwą zamiennika (`:400-404`). W tym widoku nie znaleziono kontrolki bez nazwy.

### Wejścia do widoku (pytanie o architekturę)

- **Wylogowany:** `src/middleware.ts:4` (`PROTECTED_ROUTES` zawiera `/ingredients`) i `:18-21` przekierowują na `/auth/signin`. Smoke to sprawdza (`scripts/smoke.mjs:96-97`).
- **Bez danych:** pusty stan z CTA (`index.astro:198-205`).
- **Z linku** z obcym lub uszkodzonym id: pusty stan, bez zapytania o zamienniki (`:44-47`, `:99-105`).
- **Po zalogowaniu:** signin przekierowuje na `/` (`scripts/smoke.mjs:123`, `:379`). Na landingu `Topbar` linkuje do `/dashboard` (`src/components/Topbar.astro:10`). Z panelu do listy prowadzi „Znajdź zamiennik” (`dashboard.astro:16`). Lista jest więc trzy kroki od logowania.

### Ograniczenia z testów

`scripts/smoke.mjs` sprawdza HTML widoku wyłącznie przez `bodyIncludes` / `bodyExcludes` i parser id:

- teksty: „Nie znaleziono składnika”, „Pasujące składniki (2)”, „Wszystkie wyniki dla”, „Brak zamienników”, nazwy zamienników (`:156`, `:180`, `:270-412`);
- atrybut `data-best-badge` (`:188`);
- `substituteIdFor`: nazwa zamiennika musi wystąpić jako `>{nazwa}<`, a po niej w HTML `name="substitute_id" value="<uuid>"` (`:42-46`);
- kolejność sekcji kategorii przez pozycję `>{nazwa}<` w HTML (`:362-367`).

Skrypt nie sprawdza klas CSS. Zmiana markupu jest bezpieczna dla smoke, dopóki zostają te teksty, atrybut i kolejność. Nazwa zamiennika musi zostać sama w elemencie, np. `<span>{name}</span>` jak dziś w `index.astro:377`. Komponent, który ją opakuje albo podzieli, zepsuje `substituteIdFor`.

## Code References

- `src/pages/ingredients/index.astro:161-177`: lokalne stałe klas (lokalny design system)
- `src/pages/ingredients/index.astro:181-183`: tło i karta strony
- `src/pages/ingredients/index.astro:185-194`: komunikaty `notice` / `error`
- `src/pages/ingredients/index.astro:209-321`: dwa formularze GET (wyszukiwanie i wybór z listy)
- `src/pages/ingredients/index.astro:369-412`: karty zamienników, plakietka „Najlepszy”, formularz wyróżnienia
- `src/pages/ingredients/index.astro:419-423`: jedyna nawigacja („Wróć do panelu”)
- `src/pages/ingredients/new.astro:42-44`: kopia `inputClass` / `labelClass`
- `src/styles/global.css:6-39`, `:41-73`, `:75-111`: wartości `:root`, `.dark`, publikacja `@theme inline`
- `src/styles/global.css:113-115`: `bg-kitchen` (hexy)
- `src/styles/global.css:117-124`: warstwa bazowa (`outline-ring/50`, `bg-background`)
- `src/components/ui/button.tsx:7-48`, `:52`: warianty przycisku, eksport `buttonVariants`
- `src/components/auth/SubmitButton.tsx:19`: jedyny konsument `Button`, z literałami
- `src/pages/dashboard.astro:15-30`: nawigacja i wylogowanie
- `scripts/smoke.mjs:42-46`, `:188`: zależności smoke od markupu
- `components.json`: shadcn new-york, `baseColor: neutral`, `iconLibrary: lucide`

## Architecture Insights

- Repo ma kompletną połowę „tokeny” kontraktu, której nikt nie czyta, i szczątkową połowę „komponenty” (jeden przycisk). Wygląd utrzymuje się przez kopiowanie stałych klas między stronami, nie przez kontrakt.
- Widok nie ma JS, wszystko to formularze GET/POST z przekierowaniami (konwencja z `CLAUDE.md`). Komponenty z `ui/` trzeba więc renderować statycznie: przez `buttonVariants(...)` jako klasę na natywnym elemencie albo jako React bez `client:*`. Interaktywne komponenty Radix (np. shadcn `Select`) nie pasują do natywnego `<select>` w formularzu GET bez hydratacji.
- Tokeny są globalne. Zmiana `--primary` i `--ring` dotknie też `ui/button` w `SubmitButton`, ale ten nadpisuje kolory literałami, więc stron auth nie zmieni. Pozostałe widoki nie czytają tokenów, więc przepięcie wartości `:root` nie zmieni ich wyglądu (wniosek z liczby użyć 0, do potwierdzenia na zrzucie po fazie tokenów).

## Historical Context (from prior changes)

- `context/archive/2026-10-04-first-substitute-lookup/plan.md:156`: aneks po impl-review fazy 2 (F1). Motyw zmieniono poza planem z „cosmic” na „kitchen” (commity `0485291`, `978223f`), a strony fazy 3 miały „naśladować `new.astro`”. To źródło mechanizmu kopiowania literałów (C5).
- `context/archive/2026-10-04-first-substitute-lookup/reviews/impl-review-phase-2.md:34`: rekomendacja aneksu o motywie kitchen (stone/orange).
- `context/archive/2026-10-11-best-substitute-highlight/plan.md:30`, `:157`: karta najlepszego jako `border-orange-400 bg-orange-50` łączona przez `cn()` (lekcja „class:list czy cn()”). Obecny `index.astro:174-175` jest z tym zgodny.
- `context/foundation/lessons.md` („class:list czy cn() w komponentach .astro”): `class:list` jest dozwolony, gdy klasy się nie wykluczają, a `cn()` obowiązuje przy nadpisywaniu. Dotyczy zmian w tym widoku, bo przy komponentach z wariantami nadpisań przybędzie.
- `context/changes/edit-entries/` (na gałęzi `feat/edit-entries`, `0ebf0bb`): S-04 doda dwie strony edycji i linki w kartach tego widoku. Po tym change'u wymaga `/10x-plan-review` pod nową regułę UI.

## Related Research

- `context/changes/edit-entries/research.md` (gałąź `feat/edit-entries`): dotyka tego samego widoku (linki „Edytuj” / „Zmień nazwę”)
- `context/archive/2026-10-12-ingredient-name-search/research.md`: wyszukiwarka i kontekst widoku

## Open Questions

Decyzje dla `/10x-plan`, nie luki w dowodach:

1. **Wartości motywu.** Które odcienie trafią do `--primary`? `orange-700` daje AA z białym tekstem, `orange-600` nie (C1). Czy separacja `foreground` / `muted-foreground` wystarczy dla trzech dzisiejszych odcieni stone? Gdzie zapisać surowe wartości (plik w folderze change'a, jak każe `/10x-ui`)?
2. **Wyróżnienie „najlepszy” i komunikat sukcesu.** Czy wyróżnienie mapować na `primary` + `accent`, czy dodać token (np. `--highlight`)? Czy dodać `--success` dla `notice` (shadcn go nie ma)?
3. **Sposób użycia komponentów w `.astro`.** Do wyboru:
   - `buttonVariants(...)` na natywnych elementach;
   - React z `ui/` renderowany statycznie (bez precedensu w repo);
   - komponenty Astro w `ui/` (np. `Card.astro`, `Alert.astro`).

   Które komponenty dodać przez `npx shadcn@latest add`? Kandydaci: `input`, `label`, `card`, `alert`, `badge`. Uwaga: `label` w shadcn przynosi zależność `@radix-ui/react-label`.
4. **`bg-kitchen`.** Czy gradient zamienić na tokeny (np. `--background` jako jeden odcień albo zmienne gradientu w `:root`), czy zostawić jako jawny wyjątek z opisem roli?
5. **Zakres C4 (nawigacja).** Akcja „Dodaj” i wylogowanie na liście to zmiana jednego widoku. Wspólny nagłówek aplikacji w `Layout` dotknąłby wszystkich stron. Plan decyduje o skali albo odkłada wspólny nagłówek z uzasadnieniem.
6. **Stany disabled / loading.** N/A z uzasadnieniem czy minimalny stan „wysyłanie” dla przycisku wyróżnienia (wymagałby JS, którego widok dziś nie ma)?
7. **Bramka wizualna.** W repo nie ma Playwrighta ani innego narzędzia do zrzutów. `/10x-ui` każe go nie instalować, więc bramką jest strona kitchen-sink. Gdzie ją umieścić (np. `src/pages/dev/ui-kitchen-sink.astro`) i jak ją chronić (dostępna tylko w trybie dev albo za logowaniem)?
8. **Strażnik reguły.** Repo ma ESLint i lint-staged (`package.json`). Skan literałów jako check: skrypt w `scripts/` podpięty do lint-staged czy reguła ESLint? Nowa zależność lintera to decyzja użytkownika.
