# Edycja wpisów (S-04) — Plan Brief

> Full plan: `context/changes/edit-entries/plan.md`
> Research: `context/changes/edit-entries/research.md`

## What & Why

Użytkownik może poprawić własne wpisy: zmienić nazwę składnika oraz nazwę, proporcję i uwagi zamiennika (FR-006). Dziś literówki lub zła proporcja zostają w bazie na stałe, bo jedyną zmianą istniejących wierszy jest oznaczanie „najlepszego”.

## Starting Point

Baza pozwala na UPDATE tylko kolumny `substitutes.is_best`. `ingredients` nie ma polityki UPDATE, ale ma szeroki domyślny grant. Aplikacja nie ma żadnego `.update(` ani odczytu wpisu po id. Kontekst powrotu do listy (`listRedirect`) i limity pól żyją lokalnie w dwóch endpointach.

## Desired End State

Na liście każda karta zamiennika ma link „Edytuj”, a nagłówek składnika link „Zmień nazwę”. Prowadzą do dwóch osobnych stron z formularzem wypełnionym z bazy. Po zapisie użytkownik wraca do tego samego widoku (kategoria, wyszukiwanie) z „Zapisano zmiany.”. Duplikat nazwy daje czytelny komunikat. Cudzy wpis daje „nie znaleziono”. Oznaczenie „najlepszy” zostaje.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Zakres edycji | Składnik: nazwa. Zamiennik: nazwa, proporcja, uwagi. Bez przenoszenia | FR-006 mówi o nadpisaniu pól, a przeniesienie zderza się z unikalnościami pary i „jednym najlepszym” | Plan |
| Zmiana nazwy na zajętą | Odrzucić z komunikatem | Unikalność `(user_id, name_key)` już to egzekwuje; scalanie to dodatkowa logika i usuwanie (S-05) | Plan |
| Zakres migracji | Tylko to, czego wymaga S-04 | `ingredient_categories` bez polityki UPDATE i tak jest zablokowane; indeksy FK (F7) bez zysku przy tej skali | Plan |
| UI | Dwie osobne strony edycji, form POST i redirect | Każdy zapis to jeden atomowy UPDATE z jednym rodzajem 23505; nie rusza haków smoke | Plan |
| Powrót po zapisie/anulowaniu | Do widoku, z którego przyszedł, z `notice=Zapisano zmiany.` | Spójne z `best.ts`; kontekst wyszukiwania nie przepada | Plan |
| Mechanizm zapisu | Bezpośredni UPDATE z grantem kolumnowym i RLS, nie RPC | Edycja nie ma reguły międzywierszowej; wzorzec grantu jak w S-02 | Research |
| „Nie znaleziono” | `update().select().maybeSingle()`, pusty wynik oznacza brak wiersza | RLS ukrywa cudze wiersze bez błędu, więc bez tego cudzy wpis dałby fałszywy sukces | Research |
| `name_key` | Składnik: aplikacja liczy go razem z nazwą. Zamiennik: generowany, nie wysyłany ani grantowany | Lekcja `name_key`; UPDATE kolumny generowanej daje 428C9 | Research |
| `is_best` | Nie pojawia się w formularzu ani w UPDATE | FR-006: oznaczenie zostaje przy wpisie | Research |

## Scope

**In scope:**
- migracja z grantami i polityką UPDATE oraz testy pgTAP;
- wspólne helpery (kontekst listy, limity pól);
- serwisy get i update;
- `POST /api/substitutes/update`, `POST /api/ingredients/rename`;
- strony `edit-substitute` i `edit-ingredient`;
- linki na liście;
- kroki smoke;
- `db push` na prod.

**Out of scope:**
- przenoszenie zamiennika do innej kategorii lub innego składnika;
- scalanie składników;
- zmiana `is_best` z formularza edycji;
- RPC;
- dokręcanie `ingredient_categories`, indeksy FK;
- check zgodności `name_key` w bazie;
- wykrywanie równoległej edycji;
- usuwanie (S-05).

## Architecture / Approach

Link na liście niesie kontekst widoku (`ingredient`, `category`, `q`, `match`). Strona edycji czyta wpis po id: RLS sprawia, że cudzy wpis nie istnieje. Formularz trafia do endpointu z ukrytym kontekstem. Endpoint waliduje jak dodawanie, potem robi jeden UPDATE po id na jednej tabeli i mapuje wynik: brak wiersza oznacza „nie znaleziono”, 23505 duplikat. Sukces daje `listRedirect` z komunikatem. Błąd wraca do strony edycji z echem pól; klucze echa są zawsze obecne, więc wyczyszczone uwagi nie wracają z bazy.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza — granty i polityka UPDATE | Migracja i pgTAP (`edit-entries.sql`, poprawiona asercja w `best-substitute.sql`) | Kolejność revoke/grant; za szeroki grant |
| 2. Edycja zamiennika end-to-end | Helpery, serwis, endpoint, strona, link „Edytuj”, smoke | Refaktor `listRedirect` zmienia kolejność parametrów; link przesuwa `substituteIdFor` |
| 3. Zmiana nazwy składnika end-to-end | Serwis, endpoint, strona, link „Zmień nazwę”, smoke, `db push` na prod | `name_key` rozjedzie się z nazwą; brak migracji na prod przed merge |

**Prerequisites:** lokalny Supabase uruchomiony (`npx supabase start`), `npm run dev` do smoke; dostęp do prod (`npx supabase link`) przed merge.
**Estimated effort:** ~2–3 sesje w 3 fazach.

## Open Risks & Assumptions

- Zakładamy, że supabase-js przy UPDATE na wierszu ukrytym przez RLS zwraca pusty wynik bez błędu. Plan jest odporny na oba warianty (brak wiersza daje „nie znaleziono”), a smoke konta B to sprawdza.
- Kod błędu przy UPDATE kolumny generowanej bez grantu: oczekiwany `42501`, możliwy `428C9`. Test pgTAP wpisze faktyczny kod.
- Dwie równoległe edycje tego samego wpisu: wygrywa ostatni zapis (świadomie bez blokady).

## Success Criteria (Summary)

- Użytkownik poprawia nazwę, proporcję i uwagi zamiennika oraz nazwę składnika i wraca do tego samego widoku z potwierdzeniem; „najlepszy” zostaje.
- Duplikat nazwy i cudzy wpis dają czytelny komunikat bez zmiany danych.
- pgTAP i smoke przechodzą lokalnie, a edycja działa na produkcji po `db push` i deployu.
