---
date: 2026-10-17T13:07:00+02:00
researcher: Claude Code (claude-opus-5-5)
git_commit: 2062fa548b2a17ae5fc3b3f6579fa0f6938742d6
branch: feat/edit-entries
repository: rszymanski1966/Roman1
topic: "S-04 edit-entries: co kod i baza już robią, i co edycja wpisów musi uwzględnić"
tags: [research, codebase, supabase, rls, grants, substitutes, ingredients, smoke, pgtap]
status: complete
last_updated: 2026-10-17
last_updated_by: Claude Code (claude-opus-5-5)
---

# Research: S-04 edit-entries

**Date**: 2026-10-17T13:07:00+02:00
**Researcher**: Claude Code (claude-opus-5-5)
**Git Commit**: 2062fa5 (main po PR #17; gałąź `feat/edit-entries` bez własnych commitów)
**Branch**: feat/edit-entries
**Repository**: rszymanski1966/Roman1

## Research Question

Co baza (granty, RLS, ograniczenia, funkcje) i aplikacja (serwisy, API, strony, smoke, pgTAP) już robią w zakresie zapisu składników i zamienników? Które z tych rzeczy S-04 (FR-006: „zalogowany użytkownik może edytować własny wpis składnika lub zamiennika”) musi zmienić, a które zachować? Dotyczy to zwłaszcza grantu UPDATE, `is_best`, unikalności (23505) i `name_key`.

## Summary

- **Baza dziś nie pozwala na żadną edycję poza `is_best`.**
  - `substitutes` ma grant UPDATE wyłącznie na kolumnę `is_best` oraz politykę `substitutes_update_own` (`supabase/migrations/20261011201658_best_substitute.sql:20-27`).
  - `ingredients` i `ingredient_categories` mają domyślny grant UPDATE Supabase na wszystkie kolumny, ale nie mają żadnej polityki UPDATE. RLS odrzuca więc każdy wiersz. Potwierdza to odczyt `information_schema` i `pg_policies` w lokalnej bazie z 3 zastosowanymi migracjami (sekcja „Baza”).
- **Aplikacja nie ma dziś żadnego wywołania `.update(`** (grep po `src/` i `scripts/`). Jedyną mutacją istniejących wierszy jest RPC `set_best_substitute` (`src/lib/services/substitutes.ts:252`). Edycja wymaga nowej ścieżki od zera: serwisu, endpointu, formularza i odczytu pojedynczego wpisu po id. Żadnej z tych rzeczy dziś nie ma.
- **Ustalone wymagania z dokumentów i archiwum** (szczegóły w „Historical Context”):
  1. Edycja nadpisuje pola, `is_best` zostaje przy wpisie (`context/foundation/prd.md:94-99`).
  2. Grant UPDATE na `substitutes` trzeba poszerzyć o pozostałe kolumny edycji, nie ruszając `is_best` (`context/archive/2026-10-11-best-substitute-highlight/plan.md:39`).
  3. Rename zamiennika obsługuje 23505 tym samym komunikatem co dodawanie (`context/archive/2026-10-10-unique-substitutes/plan.md:36`).
  4. `ingredients.name_key` aktualizuje się razem z nazwą (`context/foundation/lessons.md:19-24`).
- **`substitutes.name_key` to kolumna generowana.** Zaktualizuje się sama po zmianie `name`. Nie wolno jej wysyłać w UPDATE: Postgres odrzuca to błędem `428C9` (sprawdzone na tabeli tymczasowej). Uwaga „nie grantować `name_key`” dotyczy więc `substitutes`. Dla `ingredients` `name_key` musi być w grancie, bo liczy go aplikacja.
- **Test pgTAP pinuje dzisiejszy wąski grant** i zepsuje się po S-04: `supabase/tests/best-substitute.sql:104-110` oczekuje `42501` dla `update public.substitutes set name = …`.
- **Otwarte decyzje dla `/10x-plan`** (sekcja „Open Questions”):
  - czy edycja składnika obejmuje coś poza nazwą, np. zmianę kategorii lub przeniesienie;
  - co zrobić przy rename na nazwę już istniejącą;
  - kształt UI;
  - czy dokręcić granty `ingredient_categories`.

## Detailed Findings

### Baza: tabele, ograniczenia, granty, polityki

Źródło: trzy migracje, przeczytane w całości.
- `supabase/migrations/20261004120000_substitute_database.sql` (S-01).
- `…20261010115230_unique_substitutes.sql` (unikalność zamienników).
- `…20261011201658_best_substitute.sql` (S-02).

Stan lokalnej bazy potwierdziłem zapytaniami tylko do odczytu: `information_schema.role_table_grants`, `information_schema.column_privileges`, `pg_policies` i `supabase_migrations.schema_migrations`. Pokazują 3 wersje: `20261004120000`, `20261010115230` i `20261011201658`. Produkcji nie sprawdzałem (sekcja „Ograniczenia”).

**`ingredients`** (`…20261004120000_substitute_database.sql:30-49`)
- Kolumny: `id`, `user_id` (default `auth.uid()`, FK z `on delete cascade`), `name` (check 1–100 znaków), `name_key` (bez defaultu, liczony w aplikacji), `created_at`.
- Ograniczenie: `ingredients_user_id_name_key_key unique (user_id, name_key)` (`:36`).
- Polityki: tylko `ingredients_select_own` i `ingredients_insert_own` (`:41-49`).
- Granty: `authenticated` i `anon` mają table-level UPDATE na wszystkie 5 kolumn, ale bez polityki UPDATE RLS odrzuca wszystkie wiersze.

**`ingredient_categories`** (`:54-81`)
- Ograniczenie: `unique (ingredient_id, category_id)` (`:60`).
- Polityka INSERT sprawdza, że `ingredient_id` należy do użytkownika (`:70-81`).
- Brak polityki UPDATE. Grant UPDATE ma ten sam kształt co w `ingredients`: wszystkie kolumny, dla `anon` i `authenticated`.

**`substitutes`** (`:86-117` + dwie późniejsze migracje)
- Kolumny edytowalne z natury: `name` (1–100), `ratio` (1–100) i `notes` (null albo ≤ 500) (`…20261004120000_substitute_database.sql:90-92`).
- `name_key text generated always as (lower(name)) stored` (`…20261010115230_unique_substitutes.sql:11-12`). Komentarz w migracji: „Generated, so a future UPDATE of name (S-04) keeps the key in sync” (`:10`).
- Unikalność: `substitutes_ingredient_category_id_name_key_key unique (ingredient_category_id, name_key)` (`…20261010115230_unique_substitutes.sql:26-28`).
- `is_best boolean not null default false` oraz częściowy indeks unikalny `substitutes_one_best_per_pair_idx … where is_best`, czyli najwyżej jeden najlepszy na parę (`…20261011201658_best_substitute.sql:8-15`).
- Grant UPDATE: `revoke update … from anon, authenticated; grant update (is_best) … to authenticated` (`:20-21`). W lokalnej bazie `column_privileges` pokazuje dla `substitutes` dokładnie jeden wiersz UPDATE: `authenticated`/`is_best`.
- Polityka `substitutes_update_own` istnieje i obejmuje cały wiersz: `using` i `with check` na `user_id = (select auth.uid())` (`:23-27`). Komentarz nagłówka: „S-04 (edit) widens the column grant and must preserve is_best” (`:5-6`).

**`set_best_substitute(p_substitute_id, p_is_best)`** (`…20261011201658_best_substitute.sql:36-80`)
- `security invoker` i `search_path = ''`, więc działa pod RLS wywołującego.
- Czyta wiersz bez `for update` (`:45-48`).
- Przy `p_is_best = true` najpierw zdejmuje poprzedni najlepszy, potem ustawia nowy (`:57-68`).
- Rzuca `P0002`, gdy wiersz nie istnieje albo jest ukryty przez RLS (`:50-53`).
- EXECUTE dostaje tylko `authenticated` (`:79-80`).
- Funkcja potrzebuje grantu UPDATE na `is_best`, bo jest security invoker. Ten grant musi więc zostać po S-04.

**Kolumna generowana a UPDATE.** Sprawdziłem na tabeli tymczasowej (`begin … rollback`) w lokalnym Postgresie. `update t set b = 'y'` na kolumnie `generated always … stored` kończy się błędem `428C9: column "b" can only be updated to DEFAULT`. Edycja zamiennika nie może więc wysyłać `name_key`, a grant na nią nic by nie dał.

**Obserwacja poza zakresem.** `anon` i `authenticated` mają table-level `DELETE`, `INSERT`, `TRUNCATE` itp. na 4 tabelach `public` (wynik `role_table_grants`). To domyślne granty Supabase. Wiersze chroni RLS, a PostgREST nie wystawia `TRUNCATE`. Nie wpływa to na S-04. Podaję to tylko jako kontekst dla decyzji o dokręcaniu grantów.

### Aplikacja: ścieżki zapisu i obsługa błędów

Źródło: `src/lib/services/substitutes.ts`, `src/pages/api/ingredients.ts` i `src/pages/api/substitutes/best.ts`, przeczytane w całości przez agenta. Decydujące fragmenty sprawdziłem sam.

**`addSubstitute`** (`src/lib/services/substitutes.ts:101-177`)
- Składnik: upsert `{name, name_key}` z `onConflict: "user_id,name_key", ignoreDuplicates: true`, potem osobny odczyt id (`:108-122`).
- Para: ten sam wzorzec dla `ingredient_categories` (`:124-140`).
- Zamiennik: insert `ingredient_category_id, name, ratio (trim), notes (trim albo null)` (`:142-152`).
- Komentarz `:94-95` („ON CONFLICT DO UPDATE would need an UPDATE RLS policy that does not exist”) jest prawdziwy dla `ingredients` i `ingredient_categories`. Dla `substitutes` od S-02 jest nieaktualny, bo tam polityka UPDATE już istnieje. Nowa polityka UPDATE na `ingredients` nie wymusza zmiany tego upserta, który robi DO NOTHING.

**Normalizacja**
- `normalizeName` (`:27-29`) robi trim i scalanie białych znaków.
- `toNameKey` (`:39-41`) to `toLocaleLowerCase("pl")`. Używa go tylko kod składnika (`:106`).
- `ratio` i `notes` są wyłącznie trimowane (`:148-149`).

**Walidacja w route** (`src/pages/api/ingredients.ts`)
- Ręczna, bez zod. Limity `MAX_NAME = 100`, `MAX_RATIO = 100` i `MAX_NOTES = 500` (`:8-10`) odpowiadają checkom w bazie.

**Mapowanie błędów**
- `addSubstitute` sprawdza wyłącznie `error.code === "23505"`, bez nazwy ograniczenia. Mapuje go na `Zamiennik „${substituteName}” jest już zapisany dla tego składnika w tej kategorii.` (`:153-158`). Każdy inny błąd daje `GENERIC_ERROR` (`:16`).
- `setBestSubstitute` mapuje `P0002` na „Nie znaleziono zamiennika.”, a `23505` na „Najlepszy zamiennik właśnie się zmienił…” (`:259-266`).
- W całym inspekcjonowanym kodzie nie ma rozróżniania ograniczeń po nazwie. Ma to znaczenie, gdy jedna akcja edycji mogłaby trafić w dwa różne 23505, czyli rename składnika i rename zamiennika w jednym żądaniu.

**Kontrakt serwisów**
- Błędy są zwracane jako `ServiceResult<T>` (`:14`), a nie rzucane.

**Wywołania mutujące dziś** (grep po `src/` i `scripts/`)
- `.update(`: 0.
- `.delete(`: 0.
- `.rpc(`: 1 (`:252`).
- `.upsert(`: 2 (`:109-111`, `:124-129`).
- `.insert(` na `substitutes`: 1 (`:143-152`).

**Wniosek, nie sprawdzony w kodzie.** Gdy RLS ukryje wiersz albo wiersz zniknie, `UPDATE … where id = X` nie zwraca błędu, tylko aktualizuje 0 wierszy. To semantyka Postgresa dla polityk `using`. Serwis edycji musi więc wykryć „nie znaleziono” sam, np. przez `.select()` po update i brak wiersza. Inaczej obca albo nieistniejąca pozycja da fałszywy sukces. To odpowiednik `P0002` z RPC. Zachowania supabase-js i PostgREST nie sprawdzałem (Open Questions, pkt 7).

### Aplikacja: przekierowania, kontekst widoku, odczyt

**Dodawanie** (`src/pages/api/ingredients.ts:36-52`)
- Błąd: `errorRedirect` wraca na `/ingredients/new?error=…` z echem pól `ingredient_name`, `category`, `substitute`, `ratio`, `notes` i `is_best`. Używa `URLSearchParams`, więc spacja staje się `+`. Smoke na tym polega (`scripts/smoke.mjs:196`, `:232`, `:251`).
- Sukces: przekierowanie na `/ingredients?ingredient=<id>&category=<id>`, bez `q` i `match`.

**Oznaczanie najlepszego** (`src/pages/api/substitutes/best.ts`)
- Kontekst `ListView {ingredient, category, q, match}` (`:14`) przychodzi z ukrytych pól formularza.
- `listRedirect` (`:23`) składa parametry w stałej kolejności: ingredient, category, q, match, potem notice lub error. Puste wartości pomija. Smoke sprawdza dokładnie tę kolejność (`scripts/smoke.mjs:323-332`).

**Brak wspólnego helpera URL.** W inspekcjonowanych plikach są 3 lokalne budowniczowie URL: `errorRedirect` (ingredients.ts:36), `listRedirect` (best.ts:23) i `withParams` (`src/pages/ingredients/index.astro:134`).

**Strona listy** (`src/pages/ingredients/index.astro`)
- Nagłówek składnika `<h2>`: `:356`.
- Karta zamiennika `<li>`: `:375`.
- Nazwa w `<span>`: `:377`.
- Znacznik `data-best-badge`: `:378-385`.
- Formularz „Oznacz jako najlepszy”: `:391-407`, z ukrytymi polami `substitute_id`, `is_best`, `ingredient`, `category` (= `viewCategory`), `q` i `match`.
- Odczyt idzie przez `listIngredientSubstitutes`. Jej typ `SubstituteListItem` (`src/types.ts:41`) nie niesie `ingredient_category_id`.
- **Nie ma serwisu „pobierz jeden zamiennik/składnik po id”.** Strona edycji go potrzebuje.

**Haki smoke, których nie wolno rozjechać**
- `substituteIdFor` (`scripts/smoke.mjs:42`) szuka pierwszego `>${name}<`, a po nim pierwszego `name="substitute_id" value="<uuid>"`.
- Nowy element renderujący `>nazwa<` przed kartą przesunąłby to dopasowanie.
- Nowy `name="substitute_id"` między nazwą a formularzem best jest bezpieczny tylko z tym samym id.
- Link `?substitute=<id>` nie ma atrybutu `name=`, więc jest bezpieczny.

**Formularz dodawania** (`src/pages/ingredients/new.astro`)
- Pola: `ingredient`, `category_id`, `substitute`, `ratio`, `notes`, `is_best`. `maxlength` jest wpisany literałami w markupie.
- Echo wartości po błędzie i prefill przez `?ingredient=<id>`.
- Wspólnego komponentu formularza nie ma; klasy `inputClass` i `labelClass` są zduplikowane między stronami.
- Edycja może powielić ten markup. Musi przy tym dodać prefill z bazy po id i pierwszeństwo echa nad wartościami z bazy. Musi też rozstrzygnąć `is_best`: FR-006 sugeruje, żeby tego pola na formularzu edycji nie było.

**Middleware** (`src/middleware.ts:4`, `:18`)
- `PROTECTED_ROUTES = ["/dashboard", "/ingredients"]` jest dopasowywane przez `startsWith`. Każda ścieżka `/ingredients…`, w tym np. `/ingredients/edit`, jest więc chroniona automatycznie.
- `/api/…` nie jest objęte. Każdy endpoint sam sprawdza `context.locals.user`. Kolejność kontroli jest taka sama w obu istniejących endpointach: klient null, potem brak użytkownika, potem `formData()` w try/catch.

### Testy: pgTAP i smoke

- `supabase/tests/` ma 3 pliki: `best-substitute.sql` (plan 14), `rls-isolation.sql` (plan 14) i `unique-substitutes.sql` (plan 4).
- **`best-substitute.sql:104-110`** asercją `throws_ok(update … set name = 'Inna nazwa' …, '42501', …, 'A cannot update columns other than is_best')` przypina dzisiejszy grant. Po poszerzeniu grantu o `name` ta asercja zawiedzie i trzeba ją przerobić. Przykładowo: `user_id` i `ingredient_category_id` nadal dają `42501`, a `name` przechodzi i zachowuje `is_best`.
- `rls-isolation.sql:40-62` sprawdza izolację INSERT dla konta B. Odpowiednik dla UPDATE dziś nie istnieje.
- Smoke ma 40 kroków (`scripts/smoke.mjs:92-416`). Konwencje z archiwum opisuje „Historical Context”, pkt 5.

## Code References

- `supabase/migrations/20261004120000_substitute_database.sql:3` — „UPDATE/DELETE policies are intentionally absent (added with S-04/S-05)”
- `supabase/migrations/20261004120000_substitute_database.sql:30-49` — `ingredients`, `unique (user_id, name_key)`, polityki SELECT/INSERT
- `supabase/migrations/20261004120000_substitute_database.sql:54-81` — `ingredient_categories`, polityka INSERT ze sprawdzeniem właściciela składnika
- `supabase/migrations/20261010115230_unique_substitutes.sql:10-12` — generowany `substitutes.name_key`
- `supabase/migrations/20261010115230_unique_substitutes.sql:26-28` — `substitutes_ingredient_category_id_name_key_key`
- `supabase/migrations/20261011201658_best_substitute.sql:5-6` — nagłówek: S-04 poszerza grant, zachowuje `is_best`
- `supabase/migrations/20261011201658_best_substitute.sql:13-15` — `substitutes_one_best_per_pair_idx`
- `supabase/migrations/20261011201658_best_substitute.sql:20-27` — `grant update (is_best)`, `substitutes_update_own`
- `supabase/migrations/20261011201658_best_substitute.sql:36-80` — `set_best_substitute`
- `src/lib/services/substitutes.ts:27-29`, `:39-41` — `normalizeName`, `toNameKey`
- `src/lib/services/substitutes.ts:94-95` — komentarz o braku polityki UPDATE (nieaktualny dla `substitutes`)
- `src/lib/services/substitutes.ts:153-158` — mapowanie 23505 na komunikat duplikatu zamiennika
- `src/lib/services/substitutes.ts:247-270` — `setBestSubstitute`, mapowanie P0002/23505
- `src/pages/api/ingredients.ts:8-10`, `:36-52` — limity, `errorRedirect`
- `src/pages/api/substitutes/best.ts:14`, `:23` — `ListView`, `listRedirect`
- `src/pages/ingredients/index.astro:134`, `:356`, `:375-407` — `withParams`, nagłówek składnika, karta zamiennika z formularzem best
- `src/pages/ingredients/new.astro` — wzorzec formularza (echo, prefill)
- `src/types.ts:11`, `:27`, `:41`, `:54`, `:63` — `Ingredient`, `Substitute`, `SubstituteListItem`, `AddSubstituteInput`, `AddSubstituteResult`
- `src/middleware.ts:4`, `:18` — `PROTECTED_ROUTES`, dopasowanie prefiksem
- `supabase/tests/best-substitute.sql:104-110` — asercja wąskiego grantu (do przerobienia)
- `scripts/smoke.mjs:42`, `:49` — `substituteIdFor`, `bestForm`

## Architecture Insights

- **Dwie warstwy ochrony zapisu.** Grant kolumnowy decyduje, które kolumny można zmienić, a polityka RLS które wiersze. S-02 ustanowiło ten wzorzec dla `substitutes`. Dla `ingredients` i `ingredient_categories` dziś istnieje tylko warstwa RLS: brak polityki oznacza brak zapisu, a grant jest szeroki. Jeśli S-04 doda politykę UPDATE na `ingredients` i nie zawęzi grantu, użytkownik mógłby przez API zmienić np. `id` lub `created_at` własnego wiersza. Polityka `with check user_id = auth.uid()` blokuje tylko przepisanie na inne konto.
- **Mutacja z regułą międzywierszową idzie przez RPC, prosta zmiana pól może iść bezpośrednim UPDATE.** Jedynym RPC jest `set_best_substitute`, bo zamiana najlepszego dotyka dwóch wierszy. Edycja `name`, `ratio` i `notes` jednego wiersza nie ma takiej reguły. Archiwum nie rozstrzyga RPC kontra bezpośredni UPDATE (Historical Context, pkt 2).
- **`is_best` zostaje sam z siebie.** UPDATE, który nie wymienia `is_best`, go nie zmienia. Edycja zamiennika w obrębie tej samej pary nie może więc naruszyć `substitutes_one_best_per_pair_idx`. Ryzyko pojawia się dopiero przy zmianie `ingredient_category_id`, czyli przeniesieniu do innej pary (Open Questions, pkt 1).
- **Dwa sposoby liczenia klucza nazwy są świadome.** Dla `ingredients` klucz liczy aplikacja, dla `substitutes` baza (`context/foundation/lessons.md:19-24`). Edycja składnika musi wysłać `name` i `name_key` razem. Edycja zamiennika wysyła tylko `name`.
- **Konwencja URL to `URLSearchParams`, nie `encodeURIComponent`.** CLAUDE.md wspomina `encodeURIComponent`, ale kod i smoke używają `URLSearchParams` (spacja jako `+`). Nowy kod powinien iść za kodem.

## Historical Context (from prior changes)

Źródło: agent przeszukujący `context/archive/**` i `context/foundation/**`. Przeczytane pliki wymienia „Ograniczenia”.

1. **Wymagania wprost dla S-04**
   - `context/foundation/prd.md:94-99` (FR-006): „edycja po prostu nadpisuje wartości pól, bez dodatkowej logiki — oznaczenie "najlepszy" zostaje przy wpisie”. Status: obowiązuje.
   - `context/foundation/roadmap.md:107`, `:114`: ryzyko niskie, możliwe konflikty merge z widokami S-02. Status: S-02 jest już scalone, więc konfliktu równoległej pracy nie ma, ale widok `index.astro` i tak trzeba zmienić.
   - `context/foundation/roadmap.md:136`: „edycja nazwy musi respektować unikalność zamienników (23505, lessons.md)”. Status: obowiązuje.
   - `context/archive/2026-10-11-best-substitute-highlight/plan.md:39` i `plan-brief.md:64`: S-04 poszerza grant UPDATE i nie rusza `is_best`. Status: obowiązuje, potwierdzone w migracji `:5-6`.
   - `context/archive/2026-10-10-unique-substitutes/plan.md:36`: rename zamiennika obsługuje `23505` tym samym komunikatem, a `name_key` zaktualizuje się sam. Status: obowiązuje. Komunikat jest w `substitutes.ts:156`.
   - `context/foundation/lessons.md:19-24`: przy edycji `ingredients.name_key` aktualizuj klucz razem z nazwą. Status: obowiązuje.
   - `context/archive/2026-10-04-first-substitute-lookup/plan.md:29`, `:60`: polityki UPDATE dojdą z S-04. Status: częściowo nieaktualne. Dla `substitutes` polityka UPDATE doszła wcześniej, w S-02. Dla `ingredients` i `ingredient_categories` dalej jej brak.
2. **RPC kontra bezpośredni UPDATE.** Żaden dokument tego nie rozstrzyga. `is_best` idzie przez RPC, bo zamiana dotyka dwóch wierszy, a pojedynczy `UPDATE … set is_best = (id = X)` mógłby dać fałszywe 23505 (`…best-substitute-highlight/plan.md:29`, `:49`). Rollback S-02 przywraca szeroki grant (`plan.md:306`).
3. **Odłożone uwagi z review, które dotykają edycji**
   - `…first-substitute-lookup/reviews/plan-review.md:41`: WITH CHECK musi blokować zmianę `user_id`. Dotyczy nowej polityki UPDATE na `ingredients`.
   - `…unique-substitutes/reviews/impl-review.md:62-70` (F4, SKIPPED): klucz to `lower(name)`, a trim i scalanie spacji robi tylko `normalizeName`. Ścieżka edycji musi więc też wołać `normalizeName`.
   - `…unique-substitutes/reviews/impl-review.md:72-80` (F5, SKIPPED): podwójne wysłanie formularza pokazuje 23505 po udanym zapisie. Przy edycji jest to mniej prawdopodobne, bo drugi UPDATE z tymi samymi wartościami nie koliduje z samym sobą. To wniosek, nie test.
   - `…first-substitute-lookup/reviews/impl-review.md:102-110` (F7, ACCEPTED): brak indeksów na FK `ingredient_categories.user_id`, `ingredient_categories.category_id` i `substitutes.user_id`. Mają dojść „np. z S-04/S-05”, więc to opcja, nie wymóg.
   - `…best-substitute-highlight/reviews/impl-review.md:45-62` (F1): `set_best_substitute` czyta wiersz bez `for update`. Przypisane do S-05 (`roadmap.md:126`), bo dotyczy usuwania. Edycja nie usuwa wierszy ani nie zmienia `is_best`, więc S-04 tego nie dotyka.
4. **Przenoszenie i zmiana kategorii.** Żaden dokument o tym nie wspomina; wyszukiwanie „przenie”, „move” i „zmiana kategorii” nic nie znalazło. Lista kategorii to seed, który zmienia się tylko migracją (`…first-substitute-lookup/plan.md:33`).
5. **Konwencje testów dla kolejnych slice'ów**
   - Oczekiwany redirect w smoke ma zawierać tekst komunikatu, nie sam prefiks `?error=` (`…unique-substitutes/plan.md:140`).
   - Każdy nowy krok smoke trzeba celowo zepsuć raz, żeby sprawdzić, że potrafi zawieść (`…ingredient-name-search/plan.md`, faza 3, kryterium 3.3).
   - Konto B ma mieć własne dane bez wspólnych prefiksów nazw z kontem A (`…first-substitute-lookup/reviews/impl-review.md:33-41`).
   - Na istniejących danych używa się `npx supabase migration up`, nie `db reset` (`…best-substitute-highlight/plan.md:107`).
   - Przed merge trzeba zrobić `npx supabase db push` na prod, bo CI deployuje tylko Workera (`plan.md:256-264`).
   - Przy `/10x-plan` wiersz S-04 w `## Backlog Handoff` zmienia się na „Planned” (`context/foundation/lessons.md:26-31`).

## Related Research

Nie dotyczy. Żadna zarchiwizowana zmiana nie ma `research.md` ani `frame.md`.

## Open Questions

Decyzje produktowe i projektowe dla `/10x-plan`. Rekomendacje są wnioskiem z zebranych faktów, nie ustaleniem.

1. **Zakres edycji składnika.** Czy edycja to tylko zmiana nazwy (`ingredients.name` i `name_key`), czy też zmiana kategorii pary albo przeniesienie zamiennika do innej pary?
   - Przeniesienie zmienia `ingredient_category_id`. Może wtedy trafić w obie unikalności: nazwy w parze docelowej i jednego najlepszego na parę. Może też zostawić pustą parę.
   - Rekomendacja: składnik edytuje tylko nazwę, a zamiennik `name`, `ratio` i `notes` w obrębie swojej pary. Przenoszenia nie robić, bo FR-006 mówi o nadpisaniu pól.
2. **Rename na nazwę już istniejącą** (23505 na `ingredients_user_id_name_key_key`). Odrzucić z komunikatem czy scalić składniki? Rekomendacja: odrzucić z komunikatem w stylu komunikatu zamiennika. Scalanie to „dodatkowa logika”, której FR-006 nie chce.
3. **Granty.**
   - `substitutes`: dodać `grant update (name, ratio, notes)`, zostawić `is_best` i nie grantować `name_key`, `user_id`, `ingredient_category_id`, `id`, `created_at`.
   - `ingredients`: `revoke update` plus `grant update (name, name_key)` plus polityka `ingredients_update_own` z `using` i `with check` na `user_id`.
   - `ingredient_categories`: zostawić bez polityki czy też zawęzić grant? Bez polityki zapis i tak jest zablokowany. Zawężenie byłoby dokręceniem spójnym z wzorcem S-02, ale poza wymaganiem.
4. **Kształt UI.** Osobna strona `/ingredients/edit?…` (chroniona automatycznie przez middleware) na wzór `new.astro` czy edycja w karcie? Do tego: dokąd wraca po sukcesie i czy niesie `q` i `match` jak `best.ts`, czy nie jak dodawanie.
5. **Jedno czy dwa endpointy.** Osobne akcje dla składnika i zamiennika mają osobne 23505 i nie wymagają rozróżniania ograniczeń po nazwie, którego dziś w kodzie nie ma. Jedna akcja dla obu wymaga tego rozróżnienia.
6. **pgTAP.** Przerobić `best-substitute.sql:104-110` i dodać testy UPDATE:
   - konto B nie zmienia wierszy konta A, czyli 0 wierszy;
   - `user_id` i `ingredient_category_id` są niezmienialne, czyli `42501`;
   - `is_best` przetrwa zmianę `name`;
   - rename składnika i zamiennika na istniejącą nazwę daje `23505`.
7. **Do ewentualnego researchu zewnętrznego (Context7: supabase-js / PostgREST)**, tylko jeśli plan na tym zbuduje:
   - czy `update().eq().select()` na wierszu ukrytym przez RLS zwraca pustą tablicę bez błędu;
   - czy 23505 przy UPDATE przychodzi w `error.code` tak samo jak przy INSERT.
   Oba zachowania są tu wnioskiem z semantyki Postgresa, nie testem.

### Ograniczenia researchu

- Granty i polityki sprawdziłem w **lokalnej** bazie (3 migracje), nie na produkcji. Zakładam, że prod ma te same 3 migracje. Wynika to z procesu `db push` przed merge, a nie z bezpośredniego odczytu.
- Agent archiwum przeczytał część plików tylko fragmentami lub grepem: `…first-substitute-lookup/plan.md` (bez linii 140-195 i 268-324), `plan-brief.md` innych zmian, `tech-stack.md` i `infrastructure.md`. Grep tych miejsc nie dał nic o edycji.
- Nie sprawdzałem `dashboard.astro` ani `Layout.astro` pod kątem linków wejścia.
- Nie uruchamiałem smoke'a ani `npx supabase test db`, bo nie odpowiadały na pytania badawcze.
