<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Unique Substitutes Implementation Plan

- **Plan**: context/changes/unique-substitutes/plan.md
- **Mode**: Deep (local verification, no sub-agent)
- **Date**: 2026-10-10
- **Verdict**: SOUND
- **Findings**: 0 critical, 2 warnings, 1 observation

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | WARNING |
| Plan Completeness | PASS |

## Grounding
6/6 paths ✓, 5/5 symbols ✓, brief↔plan ✓, Progress↔Phase ✓. Verified: lower() is IMMUTABLE (allowed in a generated column); smoke compares location with startsWith; addSubstitute is the only insert into substitutes.

## Findings

### F1 — db reset w 1.1 kasuje duplikaty potrzebne do testu 1.4

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 1 — Success Criteria / Progress 1.1 vs 1.4
- **Detail**: Krok 1.1 (`npx supabase db reset`) wykonuje się przed ręcznym 1.4 i kasuje lokalne dane, w tym istniejącą grupę duplikatów potrzebną do sprawdzenia migracji na prawdziwych danych.
- **Fix**: Nota o kolejności w Fazie 1: najpierw `migration up` na obecnych danych (1.4), potem `db reset` (1.1).
- **Decision**: FIXED

### F2 — Wynik podglądu to jedyna kopia usuwanych wierszy

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Faza 3.1 + Migration Notes
- **Detail**: Migration Notes zakładały niezweryfikowany „dzienny backup” na planie Free. Zapytanie podglądowe zwraca pełne wiersze, ale plan kazał je tylko obejrzeć.
- **Fix**: Eksport wyniku podglądu do CSV przed `db push`; usunięto niezweryfikowane twierdzenie o backupie.
- **Decision**: FIXED

### F3 — Polskie znaki w lower() sprawdzone tylko lokalnie

- **Severity**: OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Current State Analysis / Faza 3.1
- **Detail**: `lower('ŻÓŁĆ') = żółć` zweryfikowano lokalnie (en_US.UTF-8); kolacji produkcji nie sprawdzono.
- **Fix**: Dodano do 3.1 zapytanie `select lower('ŻÓŁĆ'), datcollate ...` z oczekiwanym `żółć`.
- **Decision**: FIXED
