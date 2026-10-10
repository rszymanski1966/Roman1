# Unique Substitutes — Plan Brief

> Full plan: `context/changes/unique-substitutes/plan.md`

## What & Why

Dziś ponowne wysłanie formularza (F5, podwójne kliknięcie, ponowne wpisanie) tworzy drugi identyczny zamiennik na liście. Zmiana blokuje duplikaty w parze składnik–kategoria, sprząta te, które już są, i pokazuje czytelny komunikat. Przy okazji formularz przestaje podpowiadać wartości z historii przeglądarki (na produkcji widać było dane z lokalnych testów).

## Starting Point

`substitutes` nie ma ograniczenia na nazwę; `addSubstitute` zamienia każdy błąd bazy na ogólny komunikat. `ingredients` ma już wzorzec `name_key` + `unique`, a API ma gotową ścieżkę `?error=` z echem pól formularza.

## Desired End State

Dodanie zamiennika o nazwie, która (bez względu na wielkość liter i spacje) już jest w tej parze, wraca na formularz z komunikatem `Zamiennik „<nazwa>” jest już zapisany dla tego składnika w tej kategorii.` i zachowanymi polami. Ta sama nazwa w innej parze lub u innego użytkownika przechodzi. Baza nie zawiera duplikatów i gwarantuje to ograniczeniem.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Definicja duplikatu | Ta sama nazwa w parze, bez wielkości liter; proporcja bez znaczenia | Ta sama reguła co dla składników; jeden zamiennik = jeden wpis |
| Klucz nazwy | Kolumna generowana `lower(name)` | Bez backfillu; S-04 (edycja) nie może zapomnieć aktualizacji klucza |
| Istniejące duplikaty | Zostaje najstarszy (`created_at`, potem `id`), reszta usunięta | Prosta, deterministyczna migracja; lista i tak pokazuje najstarszy pierwszy |
| UX konfliktu | Błąd w formularzu (`?error=`), pola zachowane | Istniejący wzorzec, zero nowego UI |
| Wykrywanie konfliktu | Ograniczenie w bazie + mapowanie kodu `23505` | Brak wyścigu, jedno źródło prawdy |
| Testy | Nowy plik pgTAP + krok duplikatu w smoke | Pokrywa bazę i ścieżkę komunikatu end-to-end |
| Produkcja | Zapytanie podglądowe przed `db push` | Brak niespodzianek z usuniętymi danymi |

## Scope

**In scope:**
- Migracja: `name_key`, usunięcie duplikatów, `unique (ingredient_category_id, name_key)`
- `Substitute.name_key` w `src/types.ts`
- Komunikat konfliktu w `addSubstitute`
- `autocomplete="off"` na 4 polach `new.astro`
- Test pgTAP, krok w smoke
- Podgląd produkcji, `db push`, jeden PR (z PR #8)

**Out of scope:**
- Scalanie uwag/proporcji z usuwanych duplikatów
- Link/przekierowanie do listy przy konflikcie
- Edycja i usuwanie (S-04/S-05). S-04 musi obsłużyć `23505` tym samym komunikatem
- Normalizacja diakrytyków, zmiany w kluczu składników, zmiany roadmapy

## Architecture / Approach

Baza jest jedynym źródłem prawdy: kolumna generowana + ograniczenie unikalności. Aplikacja tylko tłumaczy `23505` na komunikat przez istniejący kanał `ServiceResult.error` → `errorRedirect`. Migracja działa w kolejności: kolumna → usunięcie duplikatów → ograniczenie.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Baza | Migracja, typ, test pgTAP | Kolejność kroków migracji na danych z duplikatami |
| 2. Aplikacja | Komunikat konfliktu, autocomplete, krok smoke | Rozpoznanie kodu błędu z supabase-js |
| 3. Wydanie | Podgląd produkcji, `db push`, PR do `main` z PR #8 | Utrata danych z nowszych duplikatów na produkcji |

**Prerequisites:** lokalny Supabase uruchomiony (`npx supabase start`); gałąź `feat/unique-substitutes` od `chore/roadmap-sync`.
**Estimated effort:** ~1 sesja; fazy 1–2 małe, faza 3 ręczna.

## Open Risks & Assumptions

- Zakładamy, że istniejące nazwy zostały już znormalizowane (trim/spacje) przez `normalizeName`; wiersze wstawione inaczej mogą mieć klucz różny od oczekiwanego.
- Usunięcie duplikatów jest nieodwracalne, a dostępności backupu nie zakładamy — dlatego podgląd z eksportem CSV przed `db push`.
- `lower()` z polskimi znakami sprawdzono lokalnie; kolację produkcji sprawdza zapytanie w 3.1.

## Success Criteria (Summary)

- Ponowne dodanie tego samego zamiennika daje czytelny komunikat i nie tworzy wpisu.
- `npx supabase test db` i `npm run smoke` przechodzą z nowymi przypadkami.
- Produkcja ma migrację, PR #8 i ta zmiana weszły jednym deployem.
