# Best Substitute Highlight Implementation Plan

## Overview

Użytkownik może oznaczyć jeden zamiennik jako „najlepszy" dla pary składnik + kategoria (np. masło / Ciasta) i widzi go na górze listy z plakietką „Najlepszy" i wyróżnioną ramką. Oznaczenie ustawia się przyciskiem na liście albo checkboxem w formularzu dodawania. Oznaczenie nowego najlepszego automatycznie zdejmuje poprzednie, a lista pokazuje wtedy komunikat „Najlepszy zamiennik zmieniony: X → Y". Oznaczenie można też zdjąć (para bez najlepszego). Roadmapa: S-02, PRD: FR-003, US-01, Business Logic.

## Current State Analysis

- Zamienniki wiszą na parze składnik–kategoria: `substitutes.ingredient_category_id` (`supabase/migrations/20261004120000_substitute_database.sql:86-94`). Para to naturalny zakres „najlepszego".
- `substitutes` ma tylko polityki SELECT i INSERT (`...substitute_database.sql:99-117`). Komentarz w nagłówku migracji odkłada UPDATE do S-04, a S-02 potrzebuje UPDATE pierwsze.
- `listSubstitutes` sortuje po `created_at` i zwraca `id, name, ratio, notes` (`src/lib/services/substitutes.ts:113-133`).
- Lista `/ingredients` to czyste Astro z formularzem GET (`src/pages/ingredients/index.astro`). Nie wyświetla dziś `?error=` ani żadnego komunikatu informacyjnego.
- `addSubstitute` robi upsert składnika, upsert pary i insert zamiennika jako osobne zapytania; zwraca `ServiceResult` z krótkim, bezpiecznym komunikatem (`src/lib/services/substitutes.ts:10-20, 60-110`).
- `/api/ingredients` waliduje formularz, odsyła błędy z echem pól na `/ingredients/new`, a po sukcesie przekierowuje na listę z `?ingredient=&category=` (`src/pages/api/ingredients.ts`).
- Projekt nie ma jeszcze funkcji SQL (RPC). Testy: pgTAP w `supabase/tests/` (`rls-isolation.sql`, `unique-substitutes.sql`) i smoke w `scripts/smoke.mjs`.

## Desired End State

- Każda para składnik + kategoria ma zero albo jeden najlepszy zamiennik; gwarantuje to indeks częściowy w bazie.
- Na liście najlepszy zamiennik stoi pierwszy (reszta od najstarszego), ma plakietkę „Najlepszy" i pomarańczową ramkę. Każda pozycja ma przycisk: „Oznacz jako najlepszy" albo, przy najlepszym, „Usuń wyróżnienie".
- Formularz `/ingredients/new` ma checkbox „Najlepszy zamiennik w tej kategorii"; przy błędzie walidacji jego stan jest zachowany.
- Gdy nowe oznaczenie (z listy albo z formularza) zastępuje istniejące, lista pokazuje komunikat `Najlepszy zamiennik zmieniony: <poprzedni> → <nowy>.` Oznaczenie bez poprzednika i zdjęcie oznaczenia nie pokazują komunikatu (zmiana jest widoczna na liście).
- Użytkownik nie może oznaczyć ani odznaczyć cudzego zamiennika i nie może przez API zmienić innych kolumn `substitutes` niż `is_best`.
- Weryfikacja: `npx supabase test db`, `npm run lint`, `npm run build`, `BASE_URL=http://localhost:4321 npm run smoke`.

### Key Discoveries:

- Kanał komunikatów: `ServiceResult.error` → przekierowanie z `?error=` (`src/pages/api/ingredients.ts:35-50`, CLAUDE.md). Komunikat informacyjny idzie analogicznie jako `?notice=`.
- Unikalność wymuszana indeksem jest sprawdzana wiersz po wierszu, więc zamiana jednym `UPDATE ... set is_best = (id = X)` może dać fałszywe `23505`. Zamiana to dwa UPDATE-y w kolejności: najpierw zdjęcie starego, potem ustawienie nowego, w jednej transakcji (funkcja SQL).
- Lekcja „class:list czy cn()" (`context/foundation/lessons.md`): ramka najlepszego nadpisuje bazowe `border-stone-200` / `bg-white/80`, więc klasy karty łączy `cn()` z `@/lib/utils`, nie `class:list`.
- Lekcja „Zawsze sprawdzaj null z klienta Supabase": nowy endpoint tworzy klienta i musi obsłużyć `null` przekierowaniem z `?error=`.
- Smoke wyciąga identyfikatory z HTML regexem (`scripts/smoke.mjs:94-97`); tak samo można wyciągnąć `substitute_id` z formularza oznaczania.

## What We're NOT Doing

- „Najlepszy" na całą kategorię (dosłowne brzmienie FR-003). Zakres to para składnik + kategoria; kontekst przygotowania (pieczenie vs smażenie) zostaje poza MVP, jak w PRD.
- Okno potwierdzenia przed zamianą i skrypt po stronie klienta. Informacja przychodzi po zapisie, a cofnięcie to ponowne oznaczenie poprzedniego.
- Komunikaty po oznaczeniu bez poprzednika i po zdjęciu oznaczenia.
- Edycja innych pól zamiennika. Grant UPDATE obejmuje tylko kolumnę `is_best`; S-04 rozszerzy go o pozostałe kolumny i musi zachować `is_best` przy edycji (FR-006).
- Wyszukiwanie po nazwie (S-03) i usuwanie (S-05). **Uwaga dla S-05:** usunięcie najlepszego zamiennika po prostu zostawia parę bez najlepszego; nie wymaga dodatkowej logiki.
- React: widok zostaje w Astro, akcje to formularze POST z przekierowaniem.

## Implementation Approach

Regułę pilnuje baza: kolumna `is_best boolean not null default false` i unikalny indeks częściowy na `ingredient_category_id where is_best`. Zmianę oznaczenia robi jedna funkcja SQL `set_best_substitute` (security invoker, więc RLS dalej obowiązuje), która w jednej transakcji zdejmuje poprzedniego najlepszego, ustawia nowego i zwraca nazwę zastąpionego. Funkcja obsługuje obie ścieżki: przycisk na liście (`POST /api/substitutes/best`) i checkbox w formularzu (`addSubstitute` wstawia zamiennik, potem woła funkcję). Komunikat o zamianie wraca na listę parametrem `?notice=`, błędy parametrem `?error=`, zgodnie z konwencją projektu.

## Critical Implementation Details

**Kolejność w funkcji:** najpierw `UPDATE ... set is_best = false` na poprzednim najlepszym w parze (z `returning name`), dopiero potem `set is_best = true` na wybranym. Odwrotna kolejność albo jeden UPDATE łamie indeks częściowy.

**Brak dostępu = brak wiersza:** pod RLS cudzy zamiennik jest niewidoczny, więc funkcja nie znajduje wiersza. Ma wtedy rzucić wyjątek z kodem `P0002` (a nie zwrócić pusty wynik), żeby API pokazało „Nie znaleziono zamiennika." zamiast udawać sukces.

**Dodawanie z checkboxem nie jest atomowe:** insert zamiennika i wywołanie funkcji to dwa wywołania. Jeśli oznaczenie się nie uda, zamiennik zostaje zapisany bez oznaczenia, a użytkownik trafia na listę (nie z powrotem do formularza, bo ponowne wysłanie dałoby konflikt duplikatu) z błędem „Zamiennik zapisany, ale nie udało się oznaczyć go jako najlepszy."

## Faza 1: Baza — kolumna, indeks, funkcja zamiany, test

### Overview

Migracja dodaje oznaczenie najlepszego z gwarancją „najwyżej jeden na parę", wąską politykę UPDATE i funkcję atomowej zamiany. Typy i test pgTAP odzwierciedlają nowy schemat.

### Changes Required:

#### 1. Migracja najlepszego zamiennika

**File**: `supabase/migrations/<YYYYMMDDHHmmss>_best_substitute.sql` (nowy; znacznik czasu z chwili implementacji)

**Intent**: Dodać kolumnę `is_best`, indeks częściowy, politykę UPDATE ograniczoną do własnych wierszy i kolumny `is_best` oraz funkcję `set_best_substitute`. Komentarz nagłówkowy wyjaśnia regułę „zero lub jeden najlepszy na parę" i to, że grant UPDATE jest celowo wąski do S-04.

**Contract**:
- `alter table public.substitutes add column is_best boolean not null default false;`
- `create unique index substitutes_one_best_per_pair_idx on public.substitutes (ingredient_category_id) where is_best;`
- Uprawnienia kolumnowe: `revoke update on public.substitutes from anon, authenticated;` i `grant update (is_best) on public.substitutes to authenticated;`.
- Polityka `substitutes_update_own`: `for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))`.
- Funkcja `public.set_best_substitute(p_substitute_id uuid, p_is_best boolean) returns table (substitute_name text, replaced_name text)`, `language plpgsql`, `security invoker`, `set search_path = ''`:
  - odczytuje `name` i `ingredient_category_id` wybranego zamiennika; brak wiersza → `raise exception ... using errcode = 'P0002'`;
  - `p_is_best = true`: zdejmuje `is_best` z innego najlepszego w tej parze (`returning name` → `replaced_name`), potem ustawia `is_best = true` na wybranym; ponowne oznaczenie już najlepszego zwraca `replaced_name = null`;
  - `p_is_best = false`: ustawia `is_best = false` na wybranym, `replaced_name = null`.
- `revoke execute on function public.set_best_substitute(uuid, boolean) from public, anon;` i `grant execute ... to authenticated;`.

#### 2. Typy współdzielone

**File**: `src/types.ts`

**Intent**: Odzwierciedlić nową kolumnę i dodać pole wejścia formularza.

**Contract**: `Substitute.is_best: boolean`; `SubstituteListItem` obejmuje `is_best`; `AddSubstituteInput.isBest: boolean`; `AddSubstituteResult` dostaje `replacedName: string | null` i `bestError: string | null` (komunikat, gdy zapis się udał, a oznaczenie nie).

#### 3. Test pgTAP najlepszego zamiennika

**File**: `supabase/tests/best-substitute.sql` (nowy, wzorowany na `supabase/tests/unique-substitutes.sql`; całość w `begin; ... rollback;`, więc nie zostawia danych w bazie)

**Intent**: Sprawdzić regułę i izolację na poziomie bazy, z wywołaniami jako zalogowany użytkownik (RLS aktywny).

**Contract**: przypadki:
- oznaczenie zamiennika bez poprzednika: `replaced_name` jest null, `is_best` = true;
- oznaczenie innego w tej samej parze: `replaced_name` = poprzedni, w parze dokładnie jeden `is_best`;
- najlepszy w innej parze tego samego użytkownika (ten sam składnik, inna kategoria) nie zostaje ruszony;
- zdjęcie oznaczenia: w parze zero `is_best`;
- bezpośredni insert drugiego `is_best = true` w parze kończy się `23505`;
- użytkownik B wywołujący funkcję na zamienniku A dostaje `P0002`, a stan A się nie zmienia;
- bezpośredni `UPDATE substitutes set name = ...` jako zalogowany użytkownik kończy się błędem uprawnień (`42501`).

### Success Criteria:

#### Automated Verification:

- Nowa migracja stosuje się na istniejącej bazie bez kasowania danych: `npx supabase migration up` (nie używać `db reset`)
- Testy bazy przechodzą (wszystkie pliki): `npx supabase test db`
- Lint przechodzi: `npm run lint`

#### Manual Verification:

- W Supabase Studio istniejące dane (konta, składniki, zamienniki) są nienaruszone po migracji, a zamienniki mają `is_best = false`

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przez użytkownika przed kolejną fazą.

---

## Faza 2: Lista — wyróżnienie, oznaczanie i zdejmowanie, komunikaty

### Overview

Lista pokazuje najlepszego na górze z plakietką i ramką, każda pozycja ma przycisk oznaczania/zdejmowania, a nowy endpoint zmienia oznaczenie i wraca na listę z komunikatem albo błędem.

### Changes Required:

#### 1. Serwis

**File**: `src/lib/services/substitutes.ts`

**Intent**: `listSubstitutes` zwraca `is_best` i sortuje najlepszego na górę. Nowa funkcja `setBestSubstitute` woła RPC i tłumaczy błędy na krótkie komunikaty.

**Contract**:
- `listSubstitutes`: select `id, name, ratio, notes, is_best`, sortowanie `is_best desc`, potem `created_at asc`.
- `setBestSubstitute(client, substituteId: string, isBest: boolean): Promise<ServiceResult<{ substituteName: string; replacedName: string | null }>>` przez `client.rpc("set_best_substitute", ...)`.
- Mapowanie błędów: `P0002` → „Nie znaleziono zamiennika."; `23505` (równoległa zmiana w innej karcie) → „Najlepszy zamiennik właśnie się zmienił. Odśwież listę i spróbuj ponownie."; reszta → `GENERIC_ERROR`.

#### 2. Endpoint oznaczania

**File**: `src/pages/api/substitutes/best.ts` (nowy)

**Intent**: Przyjąć formularz z listy, zmienić oznaczenie i przekierować z powrotem na tę samą listę, zgodnie z konwencją auth/API (redirect, nie JSON).

**Contract**:
- `POST`, pola formularza: `substitute_id`, `is_best` (`"1"` ustaw, `"0"` zdejmij), `ingredient`, `category` (do przekierowania).
- Brak klienta Supabase → przekierowanie z `?error=Baza danych nie jest skonfigurowana.`; brak użytkownika → `/auth/signin`; nieczytelne ciało → `?error=`.
- `ingredient` i `category` muszą być UUID, inaczej powrót na `/ingredients` bez parametrów pary; niepoprawny `substitute_id` → `?error=Nie znaleziono zamiennika.`.
- Sukces z `replacedName` → `/ingredients?ingredient=..&category=..&notice=Najlepszy zamiennik zmieniony: <replaced> → <name>.`; sukces bez poprzednika → ten sam adres bez `notice`; błąd → ten sam adres z `error`.

#### 3. Widok listy

**File**: `src/pages/ingredients/index.astro`

**Intent**: Wyróżnić najlepszego, dodać przyciski oznaczania i wyświetlić komunikat oraz błąd z parametrów URL.

**Contract**:
- Karta najlepszego: pomarańczowa ramka i tło (np. `border-orange-400 bg-orange-50`), klasy łączone przez `cn()` (lekcja „class:list czy cn()"), plakietka z tekstem „Najlepszy" przy nazwie.
- Każda karta ma mały formularz `POST /api/substitutes/best` z ukrytymi `substitute_id`, `is_best`, `ingredient`, `category` i przyciskiem „Oznacz jako najlepszy" albo, przy najlepszym, „Usuń wyróżnienie".
- `?notice=` → neutralny/zielony pasek nad listą; `?error=` → czerwony pasek w stylu istniejących komunikatów błędu.

#### 4. Kroki smoke dla listy

**File**: `scripts/smoke.mjs`

**Intent**: Sprawdzić przepływ end-to-end oznaczania na liście i izolację akcji.

**Contract**: nowe kroki po „account A sees its substitute":
- konto A dodaje drugi zamiennik w tej samej parze;
- konto A oznacza pierwszy zamiennik jako najlepszy (id z HTML listy) → 302 na listę bez `notice`;
- lista pokazuje plakietkę „Najlepszy";
- konto A oznacza drugi zamiennik → 302 z `notice=` zawierającym nazwę pierwszego;
- (po zalogowaniu B) konto B wysyła oznaczenie z identyfikatorem zamiennika A → 302 z `error=`.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Smoke przechodzi z nowymi krokami listy: `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- Oznaczenie zamiennika na liście przenosi go na górę z plakietką „Najlepszy" i pomarańczową ramką
- Oznaczenie innego zamiennika w tej samej parze pokazuje komunikat „Najlepszy zamiennik zmieniony: X → Y." i tylko jeden wyróżniony
- „Usuń wyróżnienie" zostawia listę bez wyróżnionej pozycji, w kolejności od najstarszego
- Najlepszy w innej kategorii tego samego składnika pozostaje bez zmian

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przez użytkownika przed kolejną fazą.

---

## Faza 3: Formularz dodawania — checkbox „Najlepszy"

### Overview

Nowy zamiennik można od razu oznaczyć jako najlepszy; jeśli zastępuje istniejącego, lista pokazuje ten sam komunikat co przy oznaczaniu z listy.

### Changes Required:

#### 1. Serwis dodawania

**File**: `src/lib/services/substitutes.ts`

**Intent**: Przy `isBest` wstawić zamiennik, pobrać jego id i wywołać `setBestSubstitute`.

**Contract**: insert zamiennika z `.select("id").single()`; przy `isBest` wywołanie `setBestSubstitute(id, true)`; wynik zawiera `replacedName`, a przy nieudanym oznaczeniu `bestError` z komunikatem „Zamiennik zapisany, ale nie udało się oznaczyć go jako najlepszy." (dodanie i tak jest sukcesem). Obsługa `23505` duplikatu nazwy bez zmian.

#### 2. API dodawania

**File**: `src/pages/api/ingredients.ts`

**Intent**: Odczytać checkbox, echować go przy błędzie walidacji i przekazać komunikat zamiany lub błąd oznaczenia na listę.

**Contract**: pole formularza `is_best` (`"1"` = zaznaczony); `FormValues` i echo w `errorRedirect` obejmują `is_best`; sukces → `/ingredients?ingredient=..&category=..` z `notice=` (gdy `replacedName`) albo `error=` (gdy `bestError`).

#### 3. Formularz

**File**: `src/pages/ingredients/new.astro`

**Intent**: Dodać checkbox „Najlepszy zamiennik w tej kategorii" pod uwagami, zaznaczony, gdy wrócił w echu po błędzie.

**Contract**: `<input type="checkbox" name="is_best" value="1">` z etykietą powiązaną przez `for`/`id`.

#### 4. Krok smoke dla formularza

**File**: `scripts/smoke.mjs`

**Intent**: Sprawdzić, że dodanie z checkboxem zastępuje najlepszego i zwraca komunikat.

**Contract**: konto A dodaje trzeci zamiennik w tej samej parze z `is_best=1` → 302 na listę z `notice=` zawierającym nazwę dotychczasowego najlepszego.

### Success Criteria:

#### Automated Verification:

- Lint przechodzi: `npm run lint`
- Build przechodzi: `npm run build`
- Smoke przechodzi z krokiem formularza: `BASE_URL=http://localhost:4321 npm run smoke`

#### Manual Verification:

- Dodanie zamiennika z zaznaczonym checkboxem w parze bez najlepszego pokazuje go na górze z plakietką, bez komunikatu
- Dodanie z checkboxem w parze z najlepszym pokazuje komunikat zamiany i nowego najlepszego na górze
- Błąd walidacji (np. pusta proporcja) zachowuje zaznaczenie checkboxa
- Dodanie bez checkboxa nie zmienia obecnego najlepszego

**Implementation Note**: Po przejściu weryfikacji automatycznej zatrzymaj się na ręczne potwierdzenie przez użytkownika przed kolejną fazą.

---

## Faza 4: Wydanie — migracja produkcyjna i PR

### Overview

Migracja trafia na produkcyjną bazę przed merge'em, bo CI wdraża Workera przy każdym pushu do `main`, a nie migruje bazy (README, „Database migrations").

### Changes Required:

#### 1. Migracja produkcyjna

**Intent**: Zastosować migrację na produkcji przed wdrożeniem kodu, który z niej korzysta. Zmiana tylko dodaje kolumnę z domyślnym `false`, indeks, politykę i funkcję, więc nie wymaga podglądu danych.

**Contract**: `npx supabase db push` na podlinkowanym projekcie (uruchamia użytkownik); potwierdzenie przez listę migracji w panelu Supabase.

#### 2. PR do main

**Intent**: Otworzyć PR z gałęzi `feat/best-substitute-highlight` do `main` po zielonym CI.

**Contract**: tytuł w konwencji `feat(best-substitute-highlight): ...`.

### Success Criteria:

#### Manual Verification:

- Migracja zastosowana na produkcji (`npx supabase db push`) przed merge'em
- Po deployu na produkcji oznaczenie i zamiana najlepszego działają na koncie testowym

---

## Testing Strategy

### Unit Tests:

- Brak frameworka testów jednostkowych (CLAUDE.md); regułę testuje pgTAP.

### Integration Tests:

- pgTAP `supabase/tests/best-substitute.sql`: reguła „zero lub jeden", zamiana, zdjęcie, niezależność par, izolacja RLS, wąski grant UPDATE.
- Smoke: oznaczenie na liście, zamiana z komunikatem, odmowa dla cudzego zamiennika, dodanie z checkboxem.

### Manual Testing Steps:

1. Dodaj dwa zamienniki do pary masło / Ciasta, oznacz pierwszy — trafia na górę z plakietką.
2. Oznacz drugi — komunikat „Najlepszy zamiennik zmieniony: … → …", wyróżniony tylko drugi.
3. Kliknij „Usuń wyróżnienie" — brak wyróżnionej pozycji.
4. Dodaj trzeci z checkboxem — komunikat zamiany, trzeci na górze.
5. Sprawdź, że najlepszy w masło / Dania mięsne się nie zmienił.

## Performance Considerations

Indeks częściowy jest mały (najwyżej jeden wiersz na parę). Lista dalej korzysta z indeksu unikalnego `(ingredient_category_id, name_key)`; sortowanie po `is_best` dotyczy kilku-kilkunastu wierszy pary. Wymaganie NFR < 1 s nie jest zagrożone.

## Migration Notes

Zmiana addytywna: istniejące zamienniki dostają `is_best = false`, więc żadna para nie ma najlepszego do czasu oznaczenia. Wycofanie: nowa migracja usuwająca funkcję, politykę, indeks i kolumnę oraz przywracająca domyślne uprawnienia UPDATE.

## References

- Roadmapa: `context/foundation/roadmap.md` (S-02)
- PRD: `context/foundation/prd.md` (FR-003, US-01, Business Logic)
- Lekcje: `context/foundation/lessons.md`
- Poprzednia zmiana (wzorzec migracji, pgTAP, smoke, fazy wydania): `context/archive/2026-10-10-unique-substitutes/plan.md`
- Serwis: `src/lib/services/substitutes.ts`; API: `src/pages/api/ingredients.ts`; widoki: `src/pages/ingredients/index.astro`, `src/pages/ingredients/new.astro`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Baza — kolumna, indeks, funkcja zamiany, test

#### Automated

- [x] 1.1 Nowa migracja stosuje się na istniejącej bazie bez kasowania danych: `npx supabase migration up` (nie używać `db reset`) — 3f8184f
- [x] 1.2 Testy bazy przechodzą (wszystkie pliki): `npx supabase test db` — 3f8184f
- [x] 1.3 Lint przechodzi: `npm run lint` — 3f8184f

#### Manual

- [x] 1.4 W Supabase Studio istniejące dane (konta, składniki, zamienniki) są nienaruszone po migracji, a zamienniki mają `is_best = false` — 3f8184f

### Phase 2: Lista — wyróżnienie, oznaczanie i zdejmowanie, komunikaty

#### Automated

- [x] 2.1 Lint przechodzi: `npm run lint` — 31cd35d
- [x] 2.2 Build przechodzi: `npm run build` — 31cd35d
- [x] 2.3 Smoke przechodzi z nowymi krokami listy: `BASE_URL=http://localhost:4321 npm run smoke` — 31cd35d

#### Manual

- [x] 2.4 Oznaczenie zamiennika na liście przenosi go na górę z plakietką „Najlepszy" i pomarańczową ramką — 31cd35d
- [x] 2.5 Oznaczenie innego zamiennika w tej samej parze pokazuje komunikat „Najlepszy zamiennik zmieniony: X → Y." i tylko jeden wyróżniony — 31cd35d
- [x] 2.6 „Usuń wyróżnienie" zostawia listę bez wyróżnionej pozycji, w kolejności od najstarszego — 31cd35d
- [x] 2.7 Najlepszy w innej kategorii tego samego składnika pozostaje bez zmian — 31cd35d

### Phase 3: Formularz dodawania — checkbox „Najlepszy"

#### Automated

- [x] 3.1 Lint przechodzi: `npm run lint` — 1ea886b
- [x] 3.2 Build przechodzi: `npm run build` — 1ea886b
- [x] 3.3 Smoke przechodzi z krokiem formularza: `BASE_URL=http://localhost:4321 npm run smoke` — 1ea886b

#### Manual

- [x] 3.4 Dodanie zamiennika z zaznaczonym checkboxem w parze bez najlepszego pokazuje go na górze z plakietką, bez komunikatu — 1ea886b
- [x] 3.5 Dodanie z checkboxem w parze z najlepszym pokazuje komunikat zamiany i nowego najlepszego na górze — 1ea886b
- [x] 3.6 Błąd walidacji (np. pusta proporcja) zachowuje zaznaczenie checkboxa — 1ea886b
- [x] 3.7 Dodanie bez checkboxa nie zmienia obecnego najlepszego — 1ea886b

### Phase 4: Wydanie — migracja produkcyjna i PR

#### Manual

- [ ] 4.1 Migracja zastosowana na produkcji (`npx supabase db push`) przed merge'em
- [ ] 4.2 Po deployu na produkcji oznaczenie i zamiana najlepszego działają na koncie testowym
