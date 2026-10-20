<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Widok listy zamienników na kontrakcie design systemu (ingredients-list-ui)

- **Plan**: context/changes/ingredients-list-ui/plan.md
- **Mode**: Deep (weryfikacja kodu przez niezależnego sub-agenta)
- **Date**: 2026-10-19
- **Verdict**: REVISE → SOUND po triage
- **Findings**: 0 critical, 3 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

- Ścieżki: 9/9 istniejących ✓. Nowe katalogi `src/components/ingredients/` i `src/pages/dev/` jeszcze nie istnieją, zgodnie z planem.
- Symbole: 3/3 ✓.
- Spójność briefu z planem: ✓.
- Progress a fazy: ✓ (5/5 faz, kryteria 1:1, checkboksy tylko w Progress).

Weryfikacja kodu potwierdziła:
- **Kontrakt `error_for` jest zgodny ze smoke.** `redirect: "manual"`, lokalizacja względna z kotwicą, porównanie przez `startsWith`. `"error_for="` nie koliduje z `locationExcludes: "error="`, a fetch pomija kotwicę przy GET.
- **Astro:** strona może zwrócić `Response` 404 we frontmatterze (`astro/dist/runtime/server/render/page.js:58`). Import `buttonVariants` w `.astro` jest poprawny.
- **Tailwind 4.3.3:** `ring-3`, `accent-primary` i `left-1/6` się generują.
- **Brak duplikatów:** nowe komponenty Astro niczego nie dublują. Najbliższe są `FormField` i `ServerError`, ale to komponenty React tylko dla auth.

## Findings

### F1 — Hook lint-staged nie działa, strażnik w commicie nie zadziała

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Faza 5 — Skrypt skanu, kryterium 5.6
- **Detail**: `.husky/pre-commit` istnieje, ale husky nie jest aktywny: nie ma skryptu `prepare`, `core.hooksPath` nie jest ustawiony, a `.git/hooks` nie ma aktywnych hooków. Lint-staged się nie uruchamia, więc kryterium 5.6 nie mogło przejść.
- **Fix A ⭐ Recommended**: Strażnik = CI + `npm run lint:ui`, bez lint-staged
  - Strength: Nie zmienia zachowania commitów; CI blokuje PR.
  - Tradeoff: Literał wychodzi dopiero w CI.
  - Confidence: HIGH — CI działa na każdym PR.
  - Blind spot: None significant.
- **Fix B**: Aktywować husky (`"prepare": "husky"`)
  - Strength: Informacja przy commicie.
  - Tradeoff: Włącza eslint --fix i prettier na każdym commicie, czyli zmianę poza zakresem.
  - Confidence: MED — hook nigdy nie działał.
  - Blind spot: Zachowanie na Windows/Git Bash niesprawdzone.
- **Decision**: FIXED (Fix A)
  - wpis lint-staged usunięty z kontraktu;
  - kryterium 5.6 brzmi teraz „CI na PR pokazuje krok lint:ui i przechodzi”;
  - aktywacja husky dopisana do „What We're NOT Doing”.

### F2 — Trwała reguła wskazuje plik, który przeniesie archiwizacja

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 2 p.1, Faza 5 p.3
- **Detail**: `## UI` w `CLAUDE.md` i komentarz przy `:root` odsyłały do `context/changes/ingredients-list-ui/theme-values.md`, który `/10x-archive` przeniesie.
- **Fix**: Komentarz przy `:root` z mapowaniem token → krok palety. `## UI` wskazuje tylko `global.css`. `theme-values.md` zostaje jako dowód change'a.
- **Decision**: FIXED

### F3 — Wpływ tokenów na inne strony opisany niedokładnie

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: What We're NOT Doing; Faza 2, kryteria 2.5 i 2.6
- **Detail**: Pierścień `focus-visible:ring-ring/50` w `SubmitButton` przetrwa nadpisanie klas (`button.tsx:8`, `SubmitButton.tsx:18`), więc zmieni kolor na `/auth/*`. `border-border` nie zmienia nic widocznego. Kryterium 2.6 nie dopuszczało zmiany koloru obrysu fokusu.
- **Fix**: Dokładna lista wyjątków, bez `border-border`, wyjątek dopisany w 2.6.
- **Decision**: FIXED

### F4 — Kontrakt ui-literals.mjs pomija ścieżki Windows i globale ESLint

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 5 p.1
- **Detail**: Argumenty mogą być ścieżkami absolutnymi (`C:/...`). ESLint dla `scripts/**/*.mjs` zna tylko globale `console`, `process`, `fetch` i `URLSearchParams` (`eslint.config.js:73-78`).
- **Fix**: Normalizacja argumentów do ścieżek względnych, Node API przez `node:fs` / `node:path`.
- **Decision**: FIXED

### F5 — Krok smoke dla błędu na górze sprawdza przypadek trywialny

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 4 p.5
- **Detail**: Po `smoke.mjs:386` konto B nie ma kart, więc brak `data-substitute-error` jest oczywisty. Krok B nie zapisywał też lokalizacji.
- **Fix**: Krok po utworzeniu przez B własnego składnika z zamiennikiem. Lokalizacje zapisane w nowych zmiennych, a GET sprawdza widoczne karty B i błąd na górze.
- **Decision**: FIXED (nowych kroków smoke jest teraz 4, a nie 3)

### F6 — SubstituteCard opisuje typ ręcznie zamiast użyć istniejącego

- **Severity**: 💡 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Faza 3 p.1
- **Detail**: Prop `substitute` to dokładnie `SubstituteListItem` (`src/types.ts:41`).
- **Fix**: Nazwać typ w kontrakcie.
- **Decision**: FIXED
