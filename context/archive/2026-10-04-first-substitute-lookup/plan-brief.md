# First Substitute Lookup (S-01) — Plan Brief

> Full plan: `context/changes/first-substitute-lookup/plan.md`

## What & Why

Użytkownik dodaje składnik z kategorią i zamiennik (proporcja, uwagi), a potem wybiera składnik + kategorię i widzi listę zamienników albo stan pusty. To north star z roadmapy: najmniejszy przepływ dowodzący sensu produktu, wraz z całą warstwą danych i izolacją użytkowników.

## Starting Point

Auth Supabase, middleware z `PROTECTED_ROUTES` i deploy na Cloudflare już są. Nie ma żadnych tabel, migracji, typów domenowych, serwisów ani stron domenowych.

## Desired End State

Chronione strony `/ingredients/new` (formularz) i `/ingredients` (wybór i lista). Dane każdego użytkownika są niewidoczne dla innych, co potwierdzają smoke na dwóch kontach i test SQL polityk RLS.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Model kategorii | Tabela łącząca składnik–kategoria; zamienniki wiszą na parze | Wybór użytkownika; elastyczne pod S-02 (najlepszy na kategorię) | Plan |
| Lista kategorii | Tabela `categories` z seedem (ciasta, dania mięsne, wegetariańskie) | Jedno źródło prawdy; zmiana listy = nowa migracja | Plan |
| Duplikaty | Ten sam składnik (bez rozróżniania wielkości liter) dopisuje zamiennik do istniejącego | Brak rozproszenia wiedzy i najmniej tarcia dla użytkownika | Plan |
| UI | Osobne strony: `/ingredients/new` i `/ingredients` | Czytelny podział; formularze POST + redirect jak w auth | Plan |
| Test izolacji | Smoke na dwóch kontach + test pgTAP `supabase/tests/rls-isolation.sql` (`npx supabase test db`) | Bez nowych zależności, automatyczny, domyka guardrail w tej historyjce | Plan |
| Walidacja | Ręczna, bez zod | Zod nie jest zainstalowany; ograniczenia zdublowane checkami w bazie | Plan |
| Atomowość zapisu | Trzy zapisy bez RPC (składnik i para idempotentne, zamiennik nie) | Prostota przy celu low-complexity; osierocony składnik lub zdublowany zamiennik akceptowane | Plan |

## Scope

**In scope:** migracja z 4 tabelami i RLS, seed kategorii, endpoint dodawania, strona formularza, strona listy ze stanem pustym, rozszerzenie smoke, test SQL, poprawka README.

**Out of scope:** „najlepszy" zamiennik (S-02), wyszukiwanie po nazwie (S-03), edycja (S-04), usuwanie (S-05), zod, React islands, przeliczanie ilości.

## Architecture / Approach

`categories` ← `ingredient_categories` → `ingredients`; `substitutes` na parze. Każda tabela użytkownika ma `user_id default auth.uid()` oraz polityki SELECT/INSERT dla `authenticated`; INSERT sprawdza też własność rodzica. Strony SSR czytają przez serwis `src/lib/services/substitutes.ts`, a endpoint `POST /api/ingredients` zwraca redirecty z `?error=`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data layer + RLS | Migracja, seed, typy, serwis | Błąd w politykach RLS łamie guardrail |
| 2. Adding flow | Formularz i endpoint z obsługą duplikatów | Walidacja i logika upsertu bez frameworka testów |
| 3. Lookup list | Wybór pary, lista, stan pusty | Obsługa pustych i obcych id |
| 4. Isolation & verification | Smoke na dwóch kontach, test SQL | Wymaga lokalnego Supabase i działającego serwera |

**Prerequisites:** Docker i lokalny Supabase (`npx supabase start`). `.env` i `.dev.vars` dziś wskazują na hostowany projekt – na czas developmentu przepisz `SUPABASE_URL` (`http://127.0.0.1:54321`) i `SUPABASE_KEY` (anon key z wyjścia `supabase start`), zachowując poprzednie wartości do powrotu. Hostowany projekt dostaje migrację dopiero przed wdrożeniem (`npx supabase db push`). Push na `main` = deploy, więc pracuj na gałęzi feature albo zrób `db push` przed pierwszym pushem kodu z Fazy 2.
**Estimated effort:** ~4 sesje, po jednej na fazę.

## Open Risks & Assumptions

- Finalna lista kategorii jest otwartym pytaniem roadmapy; seed to 3 przykłady z PRD.
- Migrację trzeba zastosować na hostowanym Supabase (`db push`) przed wdrożeniem kodu; CI tego nie robi.
- `name_key` liczony w aplikacji (`toLocaleLowerCase("pl")`), więc baza nie wymusza tej normalizacji.

## Success Criteria (Summary)

- Dodany zamiennik jest widoczny na liście dla składnika i kategorii, z proporcją i uwagami.
- Pusta para pokazuje czytelny stan pusty, a nie pustą listę.
- Drugie konto nie widzi ani nie może podpiąć się pod dane pierwszego.
