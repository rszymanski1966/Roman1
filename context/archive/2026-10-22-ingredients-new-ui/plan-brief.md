# Formularz dodawania na kontrakcie UI (ingredients-new-ui) — Plan Brief

> Full plan: `context/changes/ingredients-new-ui/plan.md`
> Research: `context/changes/ingredients-new-ui/research.md`

## What & Why

Formularz „Dodaj zamiennik” (`/ingredients/new`) jako jedyny widok listy składników nie korzysta z design systemu: ma 25 literałów kolorów, ręcznie zbudowane pola i przycisk o słabym kontraście. Do tego jedyne wyjście prowadzi na `/dashboard`, a błąd zapisu nie mówi, którego z 5 pól dotyczy. Pole „Składnik” nie podpowiada zapisanych składników, więc dodanie zamiennika do istniejącego wymaga przepisania jego nazwy. Zmiana przenosi widok na kontrakt UI i domyka follow-up F1 z S-04 (błąd przy polu) dla obu formularzy zamiennika.

## Starting Point

Tokeny (motyw kitchen) i komponenty `ui/` istnieją i są używane przez `/ingredients` i strony edycji z S-04, które dają gotowy wzorzec powłoki i wydzielonego formularza. `new.astro` ma 0 importów z `ui/` i nie jest objęty skanem `lint:ui`.

## Desired End State

`/ingredients/new` wygląda i zachowuje się jak strony edycji: karta na `bg-kitchen`, pola z `ui/`, widoczny fokus z tokenu, „Anuluj” i stopka z powrotem do panelu i wylogowaniem. Pole „Składnik” rozwija listę zapisanych składników i mówi, czy nazwa trafi do istniejącego, czy utworzy nowy. Błąd przy konkretnym polu oznacza to pole w formularzu dodawania i w formularzu edycji zamiennika. Kitchen-sink pokazuje stany formularza dodawania.

## Key Decisions Made

| Decision              | Choice                                                                                                        | Why (1 sentence)                                                                    | Source   |
| --------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------- |
| Wariant kontraktu     | Istniejący design system, bez nowych tokenów i bibliotek                                                      | Sąsiednie widoki już działają na tych tokenach i komponentach                       | Research |
| „Anuluj”              | Do widoku składnika, gdy URL go niesie (link z pustego stanu dostaje też `q`/`match`); inaczej `/ingredients` | Używa istniejącego `list-view` bez zmian w API                                      | Plan     |
| Po zapisie            | Bez zmian: widok nowego wpisu                                                                                 | Pokazuje efekt zapisu; nie rusza smoke dla sukcesu                                  | Plan     |
| Stopka                | `IngredientsFooter`                                                                                           | Spójność ze stronami edycji (dochodzi „Wyloguj się”)                                | Plan     |
| Zakres F1             | Oba formularze: dodawanie i edycja zamiennika                                                                 | Jeden mechanizm zamiast dwóch; zamyka F1 w całości                                  | Plan     |
| Pozycja `error_field` | Zawsze po `error`                                                                                             | Smoke `:253`/`:291` sprawdza `error` jako pierwszy parametr                         | Research |
| Duplikat nazwy        | Błąd pola (`substitute` / `name`), rozpoznany po `duplicateSubstituteMessage`                                 | Serwis zwraca tylko tekst; porównanie z tym samym komunikatem jest deterministyczne | Plan     |
| Formularz             | Wydzielony `SubstituteCreateForm.astro` z `idPrefix`                                                          | Ustalony sposób na stany w kitchen-sink                                             | Research |
| Checkbox              | Natywny, `accent-primary` + `focusOutline`                                                                    | Wzorzec radio z `LookupForms`; bez nowej zależności                                 | Research |
| Wybór składnika       | Jedno pole + natywny `<datalist>` + etykieta „Istniejący”/„Nowy” (mały `<script>`, reguła `name_key`)         | Bez zmian w API i bez React; serwer i tak dopasowuje po `name_key`                  | Plan     |

## Scope

**In scope:**

- `new.astro` na `Card` + `ui/` + `IngredientsFooter`, `SubstituteCreateForm.astro`, `MAX_*`, „Anuluj”
- link z pustego stanu składnika z `q`/`match`
- lista zapisanych składników przy polu „Składnik” (`datalist`), etykieta istniejący/nowy, 2 kroki smoke (A widzi swój składnik, B nie)
- `normalizeName`/`toNameKey` przeniesione do `entry-fields.ts` (re-eksport z `substitutes.ts`), żeby skrypt klienta nie importował serwisu
- `error_field` w `/api/ingredients` i `api/substitutes/update`, oznaczenie pola w obu formularzach
- kitchen-sink: sekcja `/ingredients/new`, stany błędu przy polu, macierz 7 stanów
- `new.astro` na liście `GUARDED`, 5 nowych kroków smoke

**Out of scope:**

- przekierowanie po zapisie, przenoszenie widoku listy przez POST (po błędzie „Anuluj” → `/ingredients`)
- powrót do wyników wyszukiwania z „Anuluj”
- `dashboard.astro`, restyling strony edycji, nowe tokeny, `.dark`, shadcn `Checkbox`
- własny combobox (React/shadcn `Command`), przełącznik „Z listy / Nowy”, `ingredient_id` w POST, stylowanie rozwijanej listy `datalist`

## Architecture / Approach

Strona `new.astro` liczy prefill/echo i `cancelHref` (`listRedirect(parseListView(url))`), a renderuje `SubstituteCreateForm` w powłoce stron edycji. Endpointy dopisują `error_field` za `error`; strony czytają go przez wspólny helper z `entry-fields.ts` (tylko dozwolone pola) i przekazują do formularza, który ustawia `aria-invalid` i `aria-describedby` na wskazanym polu.

## Phases at a Glance

| Phase                        | What it delivers                                                                | Key risk                                                     |
| ---------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Widok na komponentach     | Formularz na `ui/`, „Anuluj”, stopka, lista składników, kitchen-sink, `GUARDED` | Zmiana markupu `<option>` łamie parsowanie kategorii w smoke |
| 2. Stan błędu przy polu (F1) | `error_field` w obu API i formularzach, 5 kroków smoke, macierz                 | Zła kolejność parametrów łamie istniejące asercje smoke      |

**Prerequisites:** lokalny Supabase i działający dev do smoke; `astro check` tylko przy zatrzymanym dev.
**Estimated effort:** ~1–2 sesje, 2 fazy.

## Open Risks & Assumptions

- Kontrast białego tekstu na `orange-600` (ok. 3,6:1) przyjęty z pomiaru ingredients-list-ui; po zmianie przycisk ma `primary` (orange-700, 5,01:1).
- Etykiety i placeholder zmieniają odcień (stone-700 → `foreground`, stone-400 → `muted-foreground`), bo brak tokenów pośrednich; tak samo jak na stronach edycji.
- Zmiana komunikatu duplikatu w serwisie musi iść razem z porównaniem w endpointach (ta sama funkcja).
- `datalist` zachowuje się różnie w przeglądarkach (Firefox bez strzałki, iOS podpowiedzi nad klawiaturą); tekst pomocniczy pod polem mówi, że lista istnieje. W najgorszym razie zostaje zwykłe pole tekstowe, jak dziś.
- Etykieta istniejący/nowy jest zapowiedzią; o dopasowaniu decyduje serwer. Ta sama funkcja (`toNameKey(normalizeName())`, z czystego `entry-fields.ts`) po obu stronach trzyma je w zgodzie.

## Success Criteria (Summary)

- `/ingredients/new` przechodzi `lint:ui` i wygląda spójnie ze stronami edycji na desktopie i telefonie.
- Z formularza da się wrócić do listy, z której się przyszło (przy wejściu z widoku składnika).
- Istniejący składnik da się wybrać z listy przy polu „Składnik”, a etykieta odróżnia go od nowego.
- Błąd pola (np. pusta proporcja, duplikat) jest widoczny i ogłaszany przy tym polu w obu formularzach zamiennika.
