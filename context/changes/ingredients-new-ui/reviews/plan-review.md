<!-- PLAN-REVIEW-REPORT -->

# Plan Review: Formularz dodawania na kontrakcie UI (ingredients-new-ui)

- **Plan**: context/changes/ingredients-new-ui/plan.md
- **Mode**: Deep
- **Date**: 2026-10-23
- **Verdict**: SOUND
- **Findings**: 0 critical, 1 warning, 4 observations

## Verdicts

| Dimension             | Verdict |
| --------------------- | ------- |
| End-State Alignment   | PASS    |
| Lean Execution        | PASS    |
| Architectural Fitness | PASS    |
| Blind Spots           | WARNING |
| Plan Completeness     | PASS    |

## Grounding

14/14 ścieżek ✓ (`SubstituteCreateForm.astro` nowy z założenia), 9/9 symboli ✓, brief↔plan ✓. Weryfikacja kodu: sub-agent + sonda ESLint na tymczasowym komponencie (usunięty).

## Findings

### F1 — Krok smoke „B nie widzi składnika A” może przejść na pusto

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — #7 Smoke: lista składników (przed F2: #6)
- **Detail**: Krok dla konta B ma tylko `bodyExcludes`. Jeśli `datalist` w ogóle się nie wyrenderuje, krok i tak przejdzie. Nazwa A `smoke-ingredient-${runId}` jest prefiksem nazwy B `smoke-ingredient-${runId}-b` (`scripts/smoke.mjs:570`, ostrzeżenie w komentarzu `:611`); wzorzec bez zamykającego cudzysłowu dałby fałszywy błąd.
- **Fix**: Dla B: `bodyIncludes: value="smoke-ingredient-${runId}-b"` + `bodyExcludes: value="smoke-ingredient-${runId}"` (z zamykającym `"`, zapisane w planie wprost).
- **Decision**: FIXED

### F2 — Skrypt klienta importuje z modułu serwisu serwerowego

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Architectural Fitness
- **Location**: Critical Implementation Details — „Jedna reguła dopasowania”
- **Detail**: Dziś bezpieczne: `src/lib/services/substitutes.ts:1-12` ma tylko `import type`, `normalizeName`/`toNameKey` są czyste. To pierwszy import klienta z `src/lib/services/`; przyszły import wartości (np. `@/lib/supabase` → `astro:env/server`) psuje paczkę klienta. `src/lib/entry-fields.ts` nie ma importów i już służy obu stronom.
- **Fix A ⭐ Recommended**: Przenieść `normalizeName` i `toNameKey` do `src/lib/entry-fields.ts`; `substitutes.ts` je importuje i re-eksportuje.
  - Strength: Skrypt importuje z czystego modułu; 3 wywołujące API bez zmian dzięki re-eksportowi.
  - Tradeoff: +1 plik w fazie 1.
  - Confidence: HIGH — `entry-fields.ts` bez importów, już importowany przez API.
  - Blind spot: None significant.
- **Fix B**: Zostawić import, dopisać komentarz w `substitutes.ts` o imporcie przez skrypt klienta.
  - Strength: Zero przenosin.
  - Tradeoff: Strażnik tylko w komentarzu.
  - Confidence: MED — zależy od dyscypliny kolejnego agenta.
  - Blind spot: None significant.
- **Decision**: FIXED (Fix A)

### F3 — ESLint nie sprawdza `<script>` w plikach .astro

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — Success Criteria 1.1
- **Detail**: Sonda: nieużyta zmienna i `any` w `<script>` → `npx eslint` exit 0. Bramka 1.1 nic nie mówi o skrypcie; typy łapie `astro check` (1.3).
- **Fix**: Notka w Critical Implementation Details: skrypt nie jest lintowany, ma być krótki i w pełni typowany, bramką jest `astro check`; konfiguracji ESLint nie ruszamy w tej zmianie.
- **Decision**: FIXED

### F4 — `autocomplete="off"` obok `datalist` niezweryfikowane w Firefoksie

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 — #1 Lista składników
- **Detail**: Plan zakłada, że `autocomplete="off"` wyłącza historię, a nie `datalist` — prawda dla Chrome; dla Firefoksa niepewne (niska pewność, nie sprawdzone w przeglądarce). Krok 1.10 testuje Firefox, ale nie mówi, co zrobić, gdy lista się nie pokaże.
- **Fix**: Fallback w kontrakcie: jeśli Firefox nie pokazuje listy, usunąć `autocomplete="off"` tylko z pola „Składnik”.
- **Decision**: FIXED

### F5 — Progress 1.11 rozjeżdża się z punktem Success Criteria; indeksy przenumerowane

- **Severity**: ℹ️ OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Progress — Phase 1
- **Detail**: Tytuł 1.11 jest skrótem ostatniego punktu manualnego (pozostałe kroki powtarzają go dosłownie). Przy dopisaniu 2026-10-23 przenumerowano 1.5–1.8 → 1.6–1.9 wbrew „never renumbered”; bez szkody, bo nic nie jest odhaczone ani przywołane.
- **Fix**: Skrócić punkt Success Criteria do tekstu 1.11; numeracji nie ruszać, kolejne kroki tylko na końcu.
- **Decision**: FIXED
