<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Usuwanie wpisów z potwierdzeniem (S-05)

- **Plan**: context/changes/delete-entries-confirmed/plan.md
- **Mode**: Deep
- **Date**: 2026-10-26
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

10/10 paths ✓, 9/9 symbols ✓, brief↔plan ✓, Progress↔Fazy ✓ (4/4 fazy, 29/29 kryteriów)

Sprawdzone w kodzie:

- `for update` w `set_best_substitute` ma potrzebny grant UPDATE i politykę `using` (`20261011201658_best_substitute.sql:21-27`, `20261021120000_edit_entries.sql:106`).
- `create or replace` zachowuje granty, ale klauzulę `SET` trzeba podać jeszcze raz. Plan to robi.
- `.maybeSingle()` przy 0 wierszach daje `data: null`. Ten wzorzec już działa w `updateSubstitute`, a smoke go sprawdza.
- Żaden test pgTAP nie sprawdza dziś `DELETE`.
- Konto A w smoke ma dokładnie 2 składniki, a składnik wyszukiwania ma po jednym zamienniku w dwóch kategoriach.

## Findings

### F1 — Ręczny test blokady się nie wykona i nie sprawdza F1

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Faza 1, #3 „Ręczny test blokady” (kryteria 1.4, 1.5)
- **Detail**: Procedura ma trzy problemy:
  - Każe trzymać dane testowe w transakcji, którą obie strony wycofują, więc druga sesja ich nie zobaczy. Jednocześnie każe zrobić commit.
  - Scenariusz (a) przechodzi także bez `for update`, bo UPDATE w funkcji i tak blokuje wiersz.
  - Lokalnie nie ma `psql`. Baza działa w kontenerze `supabase_db_10x-astro-starter`.
- **Fix**: Przepisać procedurę:
  - dane testowe zatwierdza wcześniej rola postgres;
  - sesje przez `docker exec … psql`;
  - scenariusz (b) raz przed `migration up` (fałszywy sukces) i raz po (`P0002`);
  - (a) jako zwykłe sprawdzenie;
  - sprzątanie przez usunięcie testowego użytkownika.
- **Decision**: FIXED (Fix in plan)

### F2 — Po usunięciu składnika z wyszukiwania z jednym wynikiem pojawia się „Nie znaleziono składnika”

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Desired End State, Faza 2 #5, Faza 4 #3
- **Detail**: Po usunięciu jedynego trafienia wyszukiwania `searchRedirect` wracał na `/ingredients?q=…`. Tam `index.astro:245-248` pokazuje „Nie znaleziono składnika „q”.” z przyciskiem „Dodaj składnik”. Plan nie podejmował tej decyzji wprost.
- **Fix A ⭐ Recommended**: Zostawić i opisać jako świadomą decyzję.
  - Strength: Nic nie zmienia w kodzie.
  - Tradeoff: Przycisk „Dodaj składnik” tuż po usunięciu bywa mylący.
  - Confidence: MED — to kwestia UX.
  - Blind spot: None significant.
- **Fix B**: Endpoint po usunięciu sprawdza wyszukiwanie (`hasSearchHits`). Przy 0 trafieniach wraca na gołe `/ingredients?notice=…`.
  - Strength: Żadnego „Nie znaleziono” po udanym usunięciu.
  - Tradeoff: Dodatkowe zapytanie, a kroki smoke trzeba przepisać.
  - Confidence: MED.
  - Blind spot: Wyszukiwanie z kategorią komplikuje warunek.
- **Decision**: FIXED (Fix B). Zmiany:
  - `hasSearchHits` w serwisie;
  - `searchRedirect(null, …)` przy 0 trafieniach;
  - błąd sprawdzenia nie wpływa na powrót (zostaje powrót do wyników);
  - kroki smoke pokrywają obie gałęzie;
  - zaktualizowane kryterium 4.8 i brief.

### F3 — Krok smoke „kaskada widoczna na liście” przechodzi niezależnie od kaskady

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 4 #6
- **Detail**: `index.astro:112-115` szuka składnika tylko na liście składników użytkownika i przy usuniętym składniku w ogóle nie pyta o zamienniki. Krok `GET /ingredients?ingredient=<searchIngredientId>` nic więc nie mówi o kaskadzie.
- **Fix**: Zastąpić go krokiem GET `/ingredients/delete-substitute?substitute=<foundSubstituteId>` z oczekiwaniem „Nie znaleziono zamiennika”.
- **Decision**: FIXED (razem z przepisaniem kroków smoke w F2)

### F4 — Brak sposobu na sprawdzenie dark mode i nieaktualne numery linii

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3, kryterium 3.9; Faza 2 #5; Faza 4 #4
- **Detail**: Klasa `.dark` nie jest nigdzie włączana, więc kryterium 3.9 nie dało się sprawdzić tak, jak je zapisano. Odwołania `backHref` `:233-236` i `renameHref` `:241-249` były nieaktualne. Właściwe miejsca to `:168-171` i `:176-184`.
- **Fix**: W 3.9 dopisać sposób sprawdzenia: klasa `dark` w devtools albo kontrast policzony z tokenów. Poprawić numery linii.
- **Decision**: FIXED (Fix in plan)
