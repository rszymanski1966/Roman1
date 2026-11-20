<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Faza 3 rolloutu testów — bezpieczne migracje

- **Plan**: context/changes/testing-safe-migrations/plan.md
- **Mode**: Deep (sprawdzenie w kodzie bezpośrednio, bez sub-agenta)
- **Date**: 2026-11-18
- **Verdict**: REVISE → SOUND po triage
- **Findings**: 0 critical, 2 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | WARNING |

## Grounding

8/8 paths ✓, 6/6 symbols ✓ (runId, devSnapshot, describeSnapshotDiff, DB_URL, CLI 2.117.0 w package-lock, 6 migracji), brief↔plan ✓, Progress↔Phase ✓ (4/4 fazy, 21/21 kryteriów).

## Findings

### F1 — CLI odrzuci katalog roboczy z samym mutantem na klonie z historią

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 1 §4 (kontrakt `applyMigrations`), Phase 2 §4, Phase 3 §1
- **Detail**: Klon bazy wyjściowej dziedziczy `supabase_migrations.schema_migrations` z wersjami linii bazowej. Jeśli `--workdir` zawiera tylko plik mutanta, CLI 2.117.0 przerywa z „Remote migration versions not found in local migrations directory”. Ten komunikat i siostrzany „Found local migration files to be inserted before the last migration on remote database” są w `node_modules/@supabase/cli-windows-x64/bin/supabase-go.exe`. Test dymny (6 plików na pustej bazie) tego nie wykrywa.
- **Fix**: Katalog roboczy = pliki z historii bazy docelowej + pliki pod testem o wyższej wersji, bez `repair` i bez `--include-all`. Phase 2/3 doprecyzowane.
- **Decision**: FIXED

### F2 — Twarde ograniczenie z test-plan §1 nie dopuszcza nowych baz w klastrze

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §3
- **Detail**: `test-plan.md:32` dopuszcza zapisy testów TS tylko jako konta wzorca. Bramka tworzy i usuwa bazy `mig_test_*`, a faza 4 aktualizowała tylko §3–§8.
- **Fix**: Phase 4 §3 aktualizuje też §1 (bazy wzorca w lokalnym klastrze, nigdy `postgres`, sweep przed i po, pozostała baza oblewa przebieg). Brief zaktualizowany.
- **Decision**: FIXED

### F3 — Lokalne hasło to `postgres`, więc podmiana hasła psuje komunikaty i kryterium 1.7

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Details, Phase 1 §4, kryterium 1.7
- **Detail**: Podmiana gołego ciągu hasła zamieniłaby każde „postgres” w wyjściu CLI, a ręczne sprawdzenie 1.7 traciłoby sens.
- **Fix**: Maskować cały URL i segment `user:hasło@`. Kryterium 1.7 sprawdzane URL-em z fałszywym, wyróżniającym się hasłem.
- **Decision**: FIXED

### F4 — Sonda z kryterium 2.4 leży w `supabase/migrations/`

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 2 kryterium 2.4, Manual Testing Steps 2
- **Detail**: Ogólny `delete` w prawdziwym katalogu migracji trafiłby na dev przy `migration up`, a na produkcję przy zapomnianym `db push`.
- **Fix**: Sonda usuwa tylko wiersz o UUID z fixture'u (`3…01`).
- **Decision**: FIXED

### F5 — Nieaktualne odwołania do linii i jedno błędne uzasadnienie

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Current State Analysis, Critical Implementation Details, Phase 1 §5, References
- **Detail**: Plan cytował `global-setup.ts:95-121` i `:102-118`, a plik ma 35 linii. `pg-sessions.ts:80-93` nie jest wzorcem połączenia. Uzasadnienie o kolizji sweepów nie zgadzało się z Vitest 5.1.0, który odpala setupy przed pierwszym testem, a teardowny po ostatnim.
- **Fix**: Odwołania → `global-setup.ts:9-34` / `:21-34` i `pg-sessions.ts:30`. Uzasadnienie przepisane, decyzja bez zmian.
- **Decision**: FIXED
