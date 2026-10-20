# Widok listy zamienników na kontrakcie design systemu — Plan Brief

> Full plan: `context/changes/ingredients-list-ui/plan.md`
> Research: `context/changes/ingredients-list-ui/research.md`

## What & Why

Główny widok aplikacji (`/ingredients`) wygląda spójnie tylko dlatego, że agenci kopiowali stałe klas między stronami. Tokeny design systemu istnieją, ale nikt ich nie czyta. Change przepina widok na tokeny i wspólne komponenty, poprawia kontrast i fokus klawiatury, dodaje brakujące akcje i błąd przy karcie oraz zostawia strażnika. Dzięki temu kolejne widoki, zaczynając od stron edycji z S-04, dziedziczą kontrakt zamiast literałów.

## Starting Point

- `global.css` ma kompletne tokeny shadcn z szarymi wartościami domyślnymi.
- Widok ma 52 literały palety, 0 klas tokenowych i 0 komponentów z `ui/`.
- Biały tekst na `orange-600` ma kontrast ok. 3,6:1.
- Z listy z danymi nie da się dodać wpisu ani się wylogować.
- Błąd akcji „najlepszy” pokazuje się na górze strony.

## Desired End State

- Widok wygląda jak dziś („kitchen”), ale z ciemniejszym, czytelnym pomarańczem (AA).
- Ma pasek akcji z „Dodaj składnik” i „Wyloguj się”.
- Fokus klawiatury jest widoczny wszędzie.
- Błąd przy oznaczaniu najlepszego pojawia się w karcie, której dotyczy.
- `/dev/kitchen-sink` pokazuje widok w 7 stanach.
- `npm run lint:ui` w CI blokuje powrót literałów, a `CLAUDE.md` mówi, gdzie są tokeny i komponenty.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Wariant kontraktu | Martwy plik tokenów: motyw przenieść na istniejące nazwy shadcn | Samo przepięcie na obecne tokeny zrobiłoby aplikację szarą; drugi `shadcn init` jest zakazany | Research |
| `--primary` | orange-700 | Ok. 5,2:1 z białym (AA), linki i przyciski mają jeden odcień | Plan |
| Wyróżnienie i sukces | `border-primary bg-accent` dla najlepszego, nowa para `--success` dla notice | Każda rola ma token, a sukces zostaje zielony i odróżniony od błędu | Plan |
| Komponenty | Astro w `ui/` (Input, Label, NativeSelect, Card, Alert, Badge) plus `buttonVariants()` | Widok jest statyczny (bez JS), markup pod kontrolą smoke, bez nowych zależności | Plan |
| `bg-kitchen` | Hexy do zmiennych w `:root`, nazwa klasy bez zmian | Wartości w jednym źródle, a 6 stron dalej działa | Plan |
| Nawigacja (C4) | Pasek akcji tylko w tym widoku | Zgodnie z zasadą jednego widoku; wspólny nagłówek odłożony | Plan |
| Bramka wizualna | `/dev/kitchen-sink`, w produkcji 404, fixtury bez bazy | Nie trafia na prod ani do smoke, a zrzuty da się robić bez danych | Plan |
| Disabled / loading | N/A w widoku z uzasadnieniem, disabled komponentów pokazany | Widok nie ma JS ani kontrolek, które mogą być nieaktywne | Plan |
| Błąd akcji „najlepszy” | Przy karcie: `best.ts` dokłada `error_for` i kotwicę; gdy karty nie ma, błąd na górze | Pełna zgodność z macierzą; zmiana addytywna, smoke porównuje `location` przez `startsWith` | Plan |
| Strażnik | `scripts/ui-literals.mjs` w CI (i lokalnie), jawna lista plików; bez lint-staged, bo husky jest nieaktywny | Bez nowej zależności; CI blokuje PR zamiast polegać na pamięci agenta | Plan |
| Tryb ciemny | Odłożony, kontrakt gotowy: kolory tylko przez tokeny, komponenty bez `dark:`, reguła w `## UI` | Przyszły przełącznik zmieni tylko `.dark` w `global.css`, bez ruszania widoku; wartości `.dark` nie stroimy, bo bez przełącznika nie da się ich zmierzyć | Plan |

## Scope

**In scope:**
- tokeny w `:root` (motyw, `--success`, gradient) i plik `theme-values.md`;
- 6 komponentów Astro w `ui/`;
- 4 części widoku w `src/components/ingredients/`;
- przepięcie `index.astro`;
- pasek akcji;
- `error_for` w `best.ts`;
- fokus;
- kitchen-sink;
- 4 kroki smoke;
- `lint:ui` w CI;
- sekcja `## UI` w `CLAUDE.md`.

**Out of scope:**
- inne widoki (`new`, dashboard, auth, landing);
- wspólny nagłówek w `Layout`;
- tryb ciemny;
- Playwright;
- wtyczka ESLint;
- JS w widoku;
- zmiany w `button.tsx` i `LibBadge.astro`;
- ikony.

## Architecture / Approach

Router `/10x-ui`: biblioteka → tokeny → widok → stany, na końcu strażnik. Komponenty czytają tokeny po roli, więc najpierw powstają bez zmian wizualnych. Potem wartości motywu trafiają do `:root`; inne widoki ich nie czytają, więc się nie zmieniają. Następnie widok przechodzi na komponenty, a jego części są wydzielone tak, żeby kitchen-sink renderował te same komponenty na fixturach. Na koniec stany i kontrakt błędu. Po każdej fazie wizualnej robimy zrzuty desktop i 375 px oraz skan literałów.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Komponenty w `ui/` | 6 komponentów Astro plus szkielet kitchen-sink | Wzorce new-york mają `ring-[3px]`; zamiana na `ring-3` |
| 2. Wartości tokenów | Motyw kitchen w `:root`, AA, `--success`, gradient, `theme-values.md` | Kolor fokusu (obrys bazowy i pierścień przycisku logowania) zmienia się na wszystkich stronach (zamierzone) |
| 3. Widok | `index.astro` z 0 literałami, części w `components/ingredients/`, pasek akcji | Zależności smoke od markupu (nazwa zamiennika, `substitute_id`, teksty) |
| 4. Stany | Fokus, błąd przy karcie (`error_for`), pełna macierz, 4 kroki smoke | Kotwica i Alert w karcie nie mogą rozbić parsowania smoke |
| 5. Strażnik i reguła | `lint:ui` w CI, sekcja `## UI` w `CLAUDE.md` | Fałszywe trafienia regexu przy kolejnych plikach |

**Prerequisites:** gałąź `feat/ingredients-list-ui` od `main` (`3de3046`), działający `npm run dev` i lokalny Supabase do smoke.
**Estimated effort:** ok. 2–3 sesje, 5 faz.

## Open Risks & Assumptions

- Kontrast liczony z wartości palety jest przybliżony. Faza 2 mierzy go i zapisuje w `theme-values.md`.
- Kitchen-sink nie wymusi `:hover` / `:focus-visible` w zrzucie bez JS. Te stany pokazujemy opisem i ręcznym przejściem klawiaturą.
- S-04 po merge'u wymaga `/10x-plan-review` (`listRedirect`, `SubstituteCard`, reguła UI).
- Przełącznik trybu ciemnego to osobny change. Wymaga wartości kitchen w `.dark`, `color-scheme` per motyw (natywne `<select>`), ciasteczka renderowanego przez serwer (bez mignięcia) oraz kitchen-sink i kontrastu dla obu motywów. Lista jest w „What We're NOT Doing” w planie.

## Success Criteria (Summary)

- Użytkownik widzi ten sam motyw z czytelniejszymi akcjami. Z listy dodaje wpis i się wyloguje, a błąd widzi przy karcie, której dotyczy.
- Osoba korzystająca z klawiatury widzi fokus na każdej kontrolce.
- Następny agent dostaje tokeny, komponenty i regułę, a `lint:ui` zatrzymuje literały w strzeżonych plikach.
