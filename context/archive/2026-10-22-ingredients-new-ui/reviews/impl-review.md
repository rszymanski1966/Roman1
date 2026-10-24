<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Formularz dodawania na kontrakcie UI (ingredients-new-ui)

- **Plan**: context/changes/ingredients-new-ui/plan.md
- **Scope**: Full plan
- **Reviewed phases**: 1, 2
- **Date**: 2026-10-24
- **Verdict**: NEEDS ATTENTION
- **Findings**: 0 critical, 4 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | WARNING |
| Architecture | WARNING |
| Pattern Consistency | WARNING |
| Success Criteria | WARNING |

Automated checks rerun on 2026-10-24 (HEAD c8006c1): `npm run lint` exit 0, `npm run lint:ui` exit 0, `npx astro check` 0 errors, 0 warnings, 0 hints (60 files, dev stopped), smoke 62/62 PASS (dev started afterwards).

The plan drift check found every planned contract item MATCH and no DRIFT or MISSING. The EXTRA items are benign and need no action:

- exported `ADD_ERROR_FIELDS` / `EDIT_ERROR_FIELDS` with derived types;
- `isInvalid` also requires a non-empty `error`;
- `addFieldErrorPath` in smoke;
- ids `add-ingredient` / `add-is-best` from the idPrefix scheme.

Smoke diff vs main: additions only.

## Findings

### F1 — Lista `datalist` w Firefoksie niesprawdzona przy `autocomplete="off"`

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Success Criteria
- **Location**: src/components/ingredients/SubstituteCreateForm.astro:78-83
- **Detail**: Pole „Składnik” ma jednocześnie `list=` i `autocomplete="off"`. Firefox od dawna ukrywa rozwijaną listę `datalist`, gdy pole ma `autocomplete="off"`. Krok 1.10 jest odhaczony, ale `change.md` mówi wprost, że sprawdzono go bez Firefoksa. Fallback z planu (plan-review F4) czeka więc na weryfikację, a smoke tego nie złapie, bo patrzy tylko na HTML.
- **Fix A ⭐ Recommended**: Sprawdzić `/ingredients/new` w Firefoksie przed PR. Jeśli lista się nie pokazuje, usunąć `autocomplete="off"` tylko z pola „Składnik” i zanotować to w Phase 1.
  - Strength: Decyzja oparta na fakcie. Chrome/Edge zostają bez historii formularza, jeśli Firefox działa.
  - Tradeoff: Trzeba zainstalować Firefoksa (albo wersję portable).
  - Confidence: HIGH — plan już przewiduje dokładnie ten fallback.
  - Blind spot: Safari (iOS/macOS) też niesprawdzone.
- **Fix B**: Od razu usunąć `autocomplete="off"` z pola „Składnik”, bez testu.
  - Strength: Lista działa wszędzie bez zależności od zachowania Firefoksa.
  - Tradeoff: Chrome/Edge pokazują wtedy wpisy z historii formularza obok zapisanych składników, a te wpisy mogą być nazwami, których nie ma na koncie.
  - Confidence: MED — zachowanie Chrome z `list` i włączonym autocomplete zależy od wersji.
  - Blind spot: Nie sprawdzono, jak bardzo historia zaśmieca listę w praktyce.
- **Decision**: ACCEPTED — użytkownik nie ma Firefoksa i akceptuje ryzyko (formularz działa bez listy); follow-up F1 w `follow-ups/review-fixes.md`.

### F2 — Tekst pomocniczy ogłaszany przy załadowaniu strony

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/components/ingredients/SubstituteCreateForm.astro:101, :231
- **Detail**: `<p data-ingredient-hint>` ma w markupie `aria-live="polite"`, a skrypt od razu przy załadowaniu woła `update()`. Przy prefillu albo echu po błędzie podmienia wtedy tekst na „Istniejący/Nowy składnik”. Część czytników ogłasza tę podmianę przy wejściu na stronę, a po błędzie konkuruje ona z `Alert role="alert"`. Ogłaszanie przy pisaniu jest poprawne, bo tekst zmienia się tylko przy zmianie stanu.
- **Fix**: Usunąć `aria-live` z markupu i ustawić `hint.setAttribute("aria-live", "polite")` w skrypcie po pierwszym `update()`. Bez JS region i tak niczego nie ogłasza.
- **Decision**: FIXED — `aria-live` usunięte z markupu, skrypt ustawia je po pierwszym `update()`.

### F3 — Pole duplikatu rozpoznawane porównaniem tekstu komunikatu

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architecture
- **Location**: src/pages/api/ingredients.ts:117, src/pages/api/substitutes/update.ts:99
- **Detail**: Endpointy przypisują pole przez `result.error === duplicateSubstituteMessage(name)`. Działa, bo serwis buduje komunikat z `normalizeName`, endpoint podaje nazwę już znormalizowaną, a `normalizeName` daje ten sam wynik przy ponownym użyciu. Zmiana treści komunikatu albo budowanie go z nazwy zwróconej przez bazę po cichu zamieni błąd pola na błąd formularza. Taki był kontrakt planu (Phase 2 #2, „bez parsowania SQL”).
- **Fix A ⭐ Recommended**: Zaakceptować i dopisać follow-up „kod błędu w `ServiceResult`”.
  - Strength: Zgodne z planem. Dwa kroki smoke (duplikat w dodawaniu i w edycji) zrobią się czerwone, gdy tekst się rozjedzie, więc regresja nie przejdzie po cichu.
  - Tradeoff: Kruchy kontrakt zostaje do czasu S-05 albo osobnej zmiany.
  - Confidence: HIGH — break-check 2.5 potwierdził, że te kroki łapią zepsucie.
  - Blind spot: Smoke działa tylko lokalnie i na prod, nie w CI.
- **Fix B**: Dodać `code?: "duplicate"` do wyniku `addSubstitute`/`updateSubstitute` i rozpoznawać duplikat po kodzie.
  - Strength: Usuwa zależność od tekstu u źródła.
  - Tradeoff: Zmiana typu `ServiceResult` i dwóch funkcji serwisu poza zakresem planu, więc trzeba znów puścić smoke i `astro check`.
  - Confidence: MED — typ jest wspólny dla wielu funkcji serwisu, łatwo rozlać zmianę.
  - Blind spot: Nie sprawdzono innych konsumentów `ServiceResult`.
- **Decision**: ACCEPTED — Fix A; follow-up F3 w `follow-ups/review-fixes.md` (kod błędu w `ServiceResult`).

### F4 — Prop `errorField` typowany jako `string`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ingredients/SubstituteCreateForm.astro:34, src/components/ingredients/SubstituteEditForm.astro:27
- **Detail**: `entry-fields.ts` eksportuje `AddErrorField` i `EditErrorField`, a strony przekazują wyniki `readErrorField` dokładnie tych typów. Prop jako `string` pozwala na literówkę, np. `errorField="category"` w kitchen-sink, która przejdzie `astro check` i po cichu nic nie oznaczy.
- **Fix**: Typować propy jako `AddErrorField | null` i `EditErrorField | null`.
- **Decision**: FIXED — propy i parametry `isInvalid`/`invalid`/`describedBy` w obu formularzach typowane `AddErrorField` / `EditErrorField`.

### F5 — `listIngredients` bez limitu przy każdym GET formularza

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: src/pages/ingredients/new.astro:42-56
- **Detail**: Formularz ładuje teraz wszystkie `id, name` składników użytkownika i wstawia je do `datalist`. Plan to zaakceptował (Performance Considerations): to samo zapytanie co `/ingredients`, równolegle z kategoriami. Przy tysiącach składników HTML rośnie liniowo.
- **Fix**: Zaakceptować i dopisać do follow-upów obserwację „limit podpowiedzi przy dużych kontach”.
- **Decision**: ACCEPTED — follow-up F5 w `follow-ups/review-fixes.md`.

### F6 — Różna kolejność id w `aria-describedby` między formularzami

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: src/components/ingredients/SubstituteCreateForm.astro:63-65 vs src/components/ingredients/IngredientRenameForm.astro:65
- **Detail**: Formularz dodawania stawia najpierw id błędu, potem tekst pomocniczy, tak jak każe plan (Phase 2 #5). `IngredientRenameForm` z S-04 robi odwrotnie. Obie wersje są poprawne. Trzy formularze mają też własne domknięcia `invalid`/`describedBy`, więc to kandydat na wspólny helper.
- **Fix**: Zostawić. Przy wydzielaniu helpera ujednolicić kolejność (najpierw błąd), dopisać jako follow-up.
- **Decision**: ACCEPTED — kod bez zmian; follow-up F6 w `follow-ups/review-fixes.md`.

### F7 — Zbędne `bodyIncludes` w kroku smoke oznaczenia pola

- **Severity**: 💬 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: scripts/smoke.mjs:297
- **Detail**: Deklarowane `bodyIncludes: 'aria-invalid="true"'` pasuje też do CSS, który dev wstawia do strony. Nie szkodzi, bo prawdziwy dowód (jeden tag z `aria-invalid`, na polu proporcji, powiązany z `id="add-error"`) siedzi w funkcji kroku. Deklaracja sugeruje jednak słabszą asercję, niż jest.
- **Fix**: Zamienić na `bodyIncludes: 'id="add-error"'`.
- **Decision**: FIXED — deklaracja kroku zamieniona na `id="add-error"`.

## Triage summary (2026-10-24)

- Fixed: F2, F4, F7 (3)
- Accepted: F1, F3 (Fix A), F5, F6 (4), follow-ups in `follow-ups/review-fixes.md`

Verification after the fixes:

- `npm run lint`: exit 0
- `npm run lint:ui`: exit 0
- smoke: 62/62 PASS (dev running)
- `npx astro check`: 0 errors, 0 warnings, 0 hints (60 files, dev stopped)
- kitchen-sink markup has 4 hints and no `aria-live` in the markup.

The plan gained a `## Deviations` section.
