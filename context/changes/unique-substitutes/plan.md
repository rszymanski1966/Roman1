# Unique Substitutes Implementation Plan

## Overview

Blokada zduplikowanych zamienników: w jednej parze składnik–kategoria może istnieć tylko jeden zamiennik o danej nazwie, porównywanej bez rozróżniania wielkości liter (po trim i scaleniu spacji). Migracja usuwa duplikaty już obecne w bazie (zostaje najstarszy wpis), a formularz pokazuje czytelny komunikat zamiast ogólnego błędu bazy. W tej samej zmianie pola formularza `/ingredients/new` dostają `autocomplete="off"`. Zmiana spoza roadmapy (dopracowanie S-01), wydawana jednym PR razem z PR #8 (`chore/roadmap-sync`).

## Current State Analysis

- Tabela `substitutes` nie ma żadnego ograniczenia na nazwę (`supabase/migrations/20261004120000_substitute_database.sql:86-94`). Ponowne wysłanie formularza (F5, podwójne kliknięcie, ponowne wpisanie) tworzy drugi identyczny wpis. Lokalnie istnieje dziś 1 grupa duplikatów.
- `ingredients` ma już analogiczny mechanizm: kolumna `name_key` + `unique (user_id, name_key)` (`...substitute_database.sql:34-36`), klucz liczony w aplikacji przez `toNameKey(normalizeName(...))` (`src/lib/services/substitutes.ts:25-39`).
- `addSubstitute` mapuje każdy błąd insertu zamiennika na `GENERIC_ERROR` (`src/lib/services/substitutes.ts:102-108`). API przekierowuje z `?error=` i echem pól (`src/pages/api/ingredients.ts:35-50, 102-104`), więc ścieżka komunikatu już istnieje — brakuje tylko rozpoznania konfliktu.
- `substitutes` ma tylko polityki SELECT/INSERT (brak UPDATE/DELETE). Migracja działa jako `postgres` (omija RLS), więc może usuwać duplikaty bez nowych polityk.
- Baza ma kolację `en_US.UTF-8`; `lower('ŻÓŁĆ')` = `żółć` (sprawdzone lokalnie) — `lower()` w Postgresie daje ten sam wynik co `toLocaleLowerCase("pl")` dla polskich znaków.
- Formularz `src/pages/ingredients/new.astro:59-130` nie ma `autocomplete`; przeglądarka podpowiadała na produkcji wartości z lokalnych testów (historia pól po `name`).

## Desired End State

- Próba dodania zamiennika o nazwie, która (bez względu na wielkość liter i nadmiarowe spacje) już istnieje w tej samej parze składnik–kategoria, kończy się powrotem na `/ingredients/new` z komunikatem `Zamiennik „<nazwa>” jest już zapisany dla tego składnika w tej kategorii.` i zachowanymi polami. Nic nie jest zapisywane.
- Ta sama nazwa w innej parze (inny składnik lub inna kategoria) albo u innego użytkownika jest dozwolona.
- W bazie nie ma duplikatów; ograniczenie `substitutes_ingredient_category_id_name_key_key` to gwarantuje.
- Pola formularza nie pokazują podpowiedzi przeglądarki.
- Weryfikacja: `npx supabase test db` (nowy test pgTAP), `npm run smoke` (nowy krok duplikatu), `npm run lint`, `npm run build`.

### Key Discoveries:

- Wzorzec klucza nazwy: `src/lib/services/substitutes.ts:24-39`, `...substitute_database.sql:34-36`.
- Kanał komunikatu błędu: `ServiceResult.error` jest „krótkim, bezpiecznym komunikatem” (`src/lib/services/substitutes.ts:10-12`) → `errorRedirect` (`src/pages/api/ingredients.ts:35`).
- Smoke używa unikalnych znaczników z `runId` (`scripts/smoke.mjs:8-13`), więc unikalność nie psuje istniejących kroków; krok duplikatu może użyć `substituteMarker.toUpperCase()`, żeby sprawdzić też niewrażliwość na wielkość liter.
- Lekcja „Zawsze sprawdzaj null z klienta Supabase” (`context/foundation/lessons.md`) — dotyczy istniejących ścieżek, ta zmiana nie dodaje nowego tworzenia klienta.

## What We're NOT Doing

- Duplikat to **tylko nazwa** (bez wielkości liter); różna proporcja nie czyni wpisu odrębnym. Warianty proporcji użytkownik opisuje w uwagach.
- Brak scalania proporcji/uwag z usuwanych duplikatów — zostaje najstarszy wpis w całości, reszta jest usuwana (po podglądzie na produkcji, Faza 3).
- Brak linku „Pokaż zamienniki” ani przekierowania na listę przy konflikcie — tylko komunikat w formularzu.
- Brak polityk UPDATE/DELETE i edycji (to S-04/S-05). **Uwaga dla S-04:** edycja nazwy zamiennika musi obsłużyć `23505` tym samym komunikatem; `name_key` jako kolumna generowana zaktualizuje się sama.
- Brak normalizacji znaków diakrytycznych („maslo” ≠ „masło”) i brak zmian w kluczu składników.
- Brak zmian w roadmapie (zmiana bez pozycji w roadmapie).

## Implementation Approach

Ograniczenie w bazie jest jedynym źródłem prawdy (brak wyścigu, który dałby wstępny SELECT). `name_key` jest **kolumną generowaną** `lower(name)`, a nie wartością liczoną w aplikacji jak w `ingredients`: migracja nie potrzebuje backfillu, a przyszła edycja (S-04) nie może zapomnieć aktualizacji klucza. Trim i scalenie spacji robi już `normalizeName` przed zapisem, a dla istniejących wierszy robiło to od początku. Aplikacja rozpoznaje naruszenie unikalności po kodzie `23505` i zwraca konkretny komunikat przez istniejący kanał `ServiceResult.error`.

## Critical Implementation Details

**Kolejność w migracji:** dodać kolumnę generowaną → usunąć duplikaty po `(ingredient_category_id, name_key)` → dopiero potem dodać ograniczenie unikalności. Odwrotna kolejność zakończy się błędem na danych z duplikatami. Remis `created_at` rozstrzyga `id`, żeby wynik był deterministyczny.

**Kolejność w `addSubstitute`:** konflikt pojawia się dopiero na insercie zamiennika, po upsertach składnika i pary. To jest poprawne (duplikat oznacza, że para już istniała), więc nie trzeba niczego wycofywać.

## Faza 1: Baza — unikalność, porządek danych, test

### Overview

Nowa migracja wprowadza klucz nazwy i ograniczenie unikalności, usuwając wcześniej istniejące duplikaty. Typy i test pgTAP odzwierciedlają nowy schemat.

### Changes Required:

#### 1. Migracja unikalności

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_unique_substitutes.sql` (nowy; znacznik czasu z chwili implementacji)

**Intent**: Dodać do `substitutes` generowany klucz nazwy, usunąć duplikaty (zostaje najstarszy w grupie) i założyć unikalność per para. Komentarz nagłówkowy wyjaśnia regułę „najstarszy zostaje” i odsyła do zapytania podglądowego z Fazy 3.

**Contract**:
- `name_key text generated always as (lower(name)) stored` (NOT NULL wynika z `name not null`).
- Usunięcie: wiersze z `row_number() over (partition by ingredient_category_id, name_key order by created_at, id) > 1`.
- `constraint substitutes_ingredient_category_id_name_key_key unique (ingredient_category_id, name_key)` (nazwa zgodna z konwencją z migracji S-01). Indeks unikalny zaczyna się od `ingredient_category_id`, więc istniejący `substitutes_ingredient_category_id_idx` staje się zbędny — usunąć go w tej samej migracji.
- RLS bez zmian (brak nowej tabeli, brak nowych polityk).

#### 2. Typy współdzielone

**File**: `src/types.ts`

**Intent**: Dodać `name_key: string` do `Substitute`, żeby typ odzwierciedlał schemat (komentarz pliku mówi, że typy są ręcznie lustrzane wobec migracji — zaktualizować odwołanie, by obejmowało nową migrację).

**Contract**: `Substitute.name_key: string`; `SubstituteListItem` bez zmian.

#### 3. Test pgTAP unikalności

**File**: `supabase/tests/unique-substitutes.sql` (nowy, wzorowany na `supabase/tests/rls-isolation.sql`)

**Intent**: Udowodnić regułę na poziomie bazy, działając jako zalogowany użytkownik (rola `authenticated` + `request.jwt.claims`), nie jako `postgres`.

**Contract**: przypadki:
- duplikat o innej wielkości liter w tej samej parze → `throws_ok(..., '23505', ...)`;
- ta sama nazwa w innej parze tego samego użytkownika → `lives_ok`;
- ta sama nazwa w analogicznej parze innego użytkownika → `lives_ok`;
- `name_key` wiersza z polskimi znakami = wartość małymi literami (`is`).

### Success Criteria:

#### Automated Verification:

- Migracje stosują się od zera: `npx supabase db reset`
- Testy bazy przechodzą (stary i nowy plik): `npx supabase test db`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- Na bazie z istniejącym duplikatem (dodać dwa razy ten sam zamiennik przed migracją, potem `npx supabase migration up`) migracja przechodzi i zostaje tylko najstarszy wpis

**Kolejność weryfikacji:** najpierw 1.4 (`npx supabase migration up` na obecnej bazie lokalnej, która ma już 1 grupę duplikatów), dopiero potem 1.1 (`npx supabase db reset`). Reset kasuje lokalne dane, więc w odwrotnej kolejności nie zostanie nic do sprawdzenia.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Faza 2: Aplikacja — komunikat konfliktu, autocomplete, smoke

### Overview

Serwis rozpoznaje naruszenie unikalności i zwraca czytelny komunikat; formularz wyłącza podpowiedzi przeglądarki; smoke test sprawdza duplikat end-to-end.

### Changes Required:

#### 1. Obsługa konfliktu w serwisie

**File**: `src/lib/services/substitutes.ts`

**Intent**: Gdy insert zamiennika zwróci błąd z kodem `23505`, zwrócić komunikat o istniejącym zamienniku z jego (znormalizowaną) nazwą; pozostałe błędy dalej dają `GENERIC_ERROR`. Zaktualizować komentarz funkcji o tę regułę.

**Contract**: `addSubstitute` → `{ data: null, error: "Zamiennik „<nazwa>” jest już zapisany dla tego składnika w tej kategorii." }` przy `substituteInsert.error.code === "23505"`. Sygnatura bez zmian; API (`src/pages/api/ingredients.ts:102-104`) przekazuje komunikat dalej bez modyfikacji.

#### 2. autocomplete w formularzu

**File**: `src/pages/ingredients/new.astro`

**Intent**: Wyłączyć historię formularzy przeglądarki na polach tekstowych, żeby nie podpowiadała wartości z innych środowisk.

**Contract**: `autocomplete="off"` na `#ingredient`, `#substitute`, `#ratio`, `#notes`.

#### 3. Krok duplikatu w smoke

**File**: `scripts/smoke.mjs`

**Intent**: Po kroku „account A sees its substitute” wysłać ponownie ten sam składnik/kategorię z `substituteMarker.toUpperCase()` i inną proporcją; oczekiwać przekierowania z błędem na formularz.

**Contract**: nowy krok `"account A cannot add a duplicate substitute"` → `{ status: 302, location: "/ingredients/new?error=" }`.

_Adaptacja przy implementacji (impl-review F2):_ oczekiwany `location` zawężono do prefiksu z treścią komunikatu konfliktu (`/ingredients/new?error=Zamiennik „<MARKER>”`, kodowanie jak w `URLSearchParams`). Sam prefiks `?error=` przechodził też przy ogólnym `GENERIC_ERROR`, więc nie chronił mapowania `23505` (wykazał to deliberate-break check).

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Smoke przechodzi z nowym krokiem duplikatu: `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- Dodanie istniejącego zamiennika z inną wielkością liter pokazuje komunikat „Zamiennik „…” jest już zapisany…”, pola formularza są zachowane, lista nie ma drugiego wpisu
- Ta sama nazwa zamiennika w innej kategorii tego samego składnika zapisuje się poprawnie
- Pola składnik/zamiennik/proporcja/uwagi nie pokazują podpowiedzi przeglądarki

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Faza 3: Wydanie — podgląd produkcji, db push, PR

### Overview

Ręczna lista kontrolna przed merge: sprawdzić, co migracja usunie na produkcji, zastosować migrację, otworzyć jeden PR do `main`, który zabierze ze sobą PR #8. Faza nie zmienia kodu.

### Changes Required:

#### 1. Zapytanie podglądowe na produkcji

**File**: brak (Supabase Dashboard → SQL Editor projektu produkcyjnego)

**Intent**: Przed `db push` zobaczyć wiersze, które migracja usunie. Tylko odczyt.

**Contract**: zapytanie musi używać tej samej reguły co migracja:

```sql
select s.id, s.user_id, s.ingredient_category_id, s.name, s.ratio, s.notes, s.created_at
from (
  select *, row_number() over (
    partition by ingredient_category_id, lower(name)
    order by created_at, id
  ) as rn
  from public.substitutes
) s
where s.rn > 1
order by s.ingredient_category_id, lower(s.name), s.created_at;
```

Wynik wyeksportować do CSV (eksport w SQL Editorze) i zachować poza repo przed `db push` — to jedyna kopia wierszy, które migracja usunie. Podgląd uruchomić **tuż przed** `db push` (bez dodawania zamienników w międzyczasie) i zanotować liczbę wierszy.

Sprawdzić też, czy `lower()` na produkcji obsługuje polskie znaki (oczekiwane `żółć`):

```sql
select lower('ŻÓŁĆ'), datcollate from pg_database where datname = current_database();
```

#### 2. Migracja produkcyjna i PR

**File**: brak

**Intent**: Po akceptacji wyniku podglądu: `npx supabase db push` (CI wdraża tylko Workera), potem PR `feat/unique-substitutes` → `main` z merge commitem; PR #8 zostanie oznaczony jako scalony.

**Contract**: `npx supabase migration list` pokazuje nową migrację po obu stronach (Local = Remote) przed merge. Liczba zamienników po push = liczba przed push − liczba wierszy w CSV (`select count(*) from public.substitutes` przed i po).

### Success Criteria:

#### Manual Verification:

- Zapytanie podglądowe uruchomione na produkcji, wynik zaakceptowany przez użytkownika
- `npx supabase db push` wykonany, `npx supabase migration list` pokazuje Local = Remote
- PR do `main` scalony, deploy CI zielony, PR #8 oznaczony jako scalony
- Na produkcji ponowne dodanie istniejącego zamiennika pokazuje komunikat konfliktu

---

## Testing Strategy

### Unit Tests:

- Brak frameworka testów jednostkowych w projekcie; logika bazy pokryta pgTAP.

### Integration Tests:

- pgTAP `supabase/tests/unique-substitutes.sql`: duplikat (inna wielkość liter) → 23505; ta sama nazwa w innej parze / u innego użytkownika → OK; `name_key` z polskimi znakami.
- Smoke: duplikat przez HTTP → `302` na `/ingredients/new?error=`.

### Manual Testing Steps:

1. Lokalnie przed migracją dodać dwa razy ten sam zamiennik, uruchomić `npx supabase migration up`, sprawdzić, że na liście jest jeden (najstarszy).
2. W formularzu dodać „OLEJ  kokosowy” do pary, która ma „Olej kokosowy” → komunikat, pola zachowane.
3. Dodać „Olej kokosowy” do innej kategorii tego samego składnika → sukces.
4. Kliknąć w puste pole formularza → brak podpowiedzi przeglądarki.

## Performance Considerations

Indeks unikalny `(ingredient_category_id, name_key)` zastępuje dotychczasowy indeks po `ingredient_category_id` dla zapytań listy (`listSubstitutes` filtruje po `ingredient_category_id`). Brak innego wpływu.

## Migration Notes

- Migracja nieodwracalnie usuwa nowsze duplikaty. Na produkcji wykonać ją dopiero po podglądzie i eksporcie CSV usuwanych wierszy (Faza 3.1). Nie zakładamy dostępności backupu Supabase.
- Ręczny rollback (gdyby był potrzebny): `alter table public.substitutes drop constraint substitutes_ingredient_category_id_name_key_key;`, `create index substitutes_ingredient_category_id_idx on public.substitutes (ingredient_category_id);`, `alter table public.substitutes drop column name_key;`, a usunięte wiersze odtworzyć z CSV (insert jako `postgres` z zachowaniem `id`, `user_id`, `created_at`). Kod Fazy 2 działa też bez ograniczenia.
- `db push` przed merge — kod Fazy 2 zakłada istnienie ograniczenia (bez niego duplikaty po prostu przejdą, więc kolejność odwrotna nie psuje aplikacji, tylko opóźnia blokadę).

## References

- Poprzednia zmiana (schemat, serwis, formularz): `context/archive/2026-10-04-first-substitute-lookup/plan.md`
- Schemat: `supabase/migrations/20261004120000_substitute_database.sql:86-117`
- Serwis: `src/lib/services/substitutes.ts:56-111`
- API: `src/pages/api/ingredients.ts:35-107`
- Formularz: `src/pages/ingredients/new.astro:54-141`
- Wzorzec testu: `supabase/tests/rls-isolation.sql`
- Smoke: `scripts/smoke.mjs:100-118`
- Notatki z poprzedniej sesji: `rozmowa4.txt` (sekcja 4)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza — unikalność, porządek danych, test

#### Automated

- [x] 1.1 Migracje stosują się od zera: `npx supabase db reset` — f05b9da
- [x] 1.2 Testy bazy przechodzą (stary i nowy plik): `npx supabase test db` — f05b9da
- [x] 1.3 Lint przechodzi: `npm run lint` — f05b9da

#### Manual

- [x] 1.4 Na bazie z istniejącym duplikatem migracja przechodzi i zostaje tylko najstarszy wpis — f05b9da

### Phase 2: Aplikacja — komunikat konfliktu, autocomplete, smoke

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — b3ed517
- [x] 2.2 Build przechodzi: `npm run build` — b3ed517
- [x] 2.3 Smoke przechodzi z nowym krokiem duplikatu: `BASE_URL=http://localhost:4321 npm run smoke` — b3ed517

#### Manual

- [x] 2.4 Dodanie istniejącego zamiennika z inną wielkością liter pokazuje komunikat konfliktu, pola zachowane, brak drugiego wpisu — b3ed517
- [x] 2.5 Ta sama nazwa zamiennika w innej kategorii tego samego składnika zapisuje się poprawnie — b3ed517
- [x] 2.6 Pola składnik/zamiennik/proporcja/uwagi nie pokazują podpowiedzi przeglądarki — b3ed517

### Phase 3: Wydanie — podgląd produkcji, db push, PR

#### Manual

- [x] 3.1 Zapytanie podglądowe uruchomione na produkcji, wynik zaakceptowany przez użytkownika
- [x] 3.2 `npx supabase db push` wykonany, `npx supabase migration list` pokazuje Local = Remote
- [ ] 3.3 PR do `main` scalony, deploy CI zielony, PR #8 oznaczony jako scalony
- [ ] 3.4 Na produkcji ponowne dodanie istniejącego zamiennika pokazuje komunikat konfliktu
