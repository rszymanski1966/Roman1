<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Ingredient Name Search Implementation Plan

- **Plan**: context/changes/ingredient-name-search/plan.md
- **Mode**: Deep (weryfikacja kodu inline, bez sub-agenta)
- **Date**: 2026-10-15
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

6/6 paths ✓, 7/7 symbols ✓, brief↔plan ✓. Potwierdzone w kodzie:
- `listSubstitutes` ma jedyny wywołujący w `index.astro:33`.
- `/ingredients/new` obsługuje `ingredient_name` i `category` (`new.astro:67,82`).
- Kolejność parametrów `best.ts` jest zgodna z `startsWith(listPath)` w smoke.
- Dotychczasowe kroki smoke przejdą bez zmian.

## Findings

### F1 — Krok smoke „konto B szuka nazwy A" nie może przejść

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 3 — Kroki smoke
- **Detail**: Składnik B nazywa się `smoke-ingredient-${runId}-b`, czyli zaczyna się od nazwy składnika A. Wyszukiwanie nazwy A z konta B w obu trybach trafia więc we własny składnik B. `substituteMarker` jest prefiksem zamiennika B, więc `bodyExcludes` też padnie. Krok „kategoria bez zamienników" potrzebuje drugiego id kategorii (smoke łapie tylko pierwsze, `smoke.mjs:120`).
- **Fix**: B oczekuje trafienia we własny składnik i braku A (zmiana asercji).
- **Decision**: FIXED (fix differently: wariant 2). Konto A dodaje składnik `smoke-search-${runId}` o nazwie rozłącznej z B, a jego id zapamiętuje się z przekierowania. Kroki wyszukiwania i krok B używają tej nazwy, krok B sprawdza „Nie znaleziono składnika" i brak id składnika A. Krok „add form" zapamiętuje `otherCategoryId`.

### F2 — Warunek linku „← Wszystkie wyniki" kłóci się z regułą „q tylko wypełnia pole"

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 2 — §1 vs §3
- **Detail**: Przy `ingredient` strona nie uruchamia wyszukiwania, a link miał się pokazywać tylko przy więcej niż jednym trafieniu. Strona tej liczby nie zna.
- **Fix**: Link zawsze, gdy URL ma `ingredient` i niepuste `q`.
- **Decision**: FIXED

### F3 — Sortowanie grup po `sort_order` w PostgREST to pułapka

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 — §4 `listIngredientSubstitutes`
- **Detail**: `.order(…, { referencedTable })` sortuje tylko osadzony zasób, a nie wiersze `ingredient_categories`.
- **Fix**: Sortowanie grup i zamienników w JS po pobraniu.
- **Decision**: FIXED

### F4 — W której fazie usunąć `listSubstitutes`

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 1 §4 / Faza 2 §1
- **Detail**: Usunięcie w fazie 1 psuje build 1.2, bo `index.astro:4,33` dalej importuje funkcję.
- **Fix**: Zostawić w fazie 1, usunąć w fazie 2.
- **Decision**: FIXED
