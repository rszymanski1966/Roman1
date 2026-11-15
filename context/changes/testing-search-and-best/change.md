---
change_id: testing-search-and-best
title: Test rollout phase 2 — name search, category filter and best-substitute rule
status: impl_reviewed
created: 2026-11-09
updated: 2026-11-15
archived_at: null
---

## Notes

Open a change folder for rollout Phase 2 of context/foundation/test-plan.md: "Wyszukiwanie i najlepszy".
Risks covered: #4 (wyszukiwanie po nazwie, tryb prefiksu lub filtr kategorii zwraca złe wyniki — gubi pasujące składniki, miesza kategorie, pokazuje stan pusty mimo istniejących danych), #6 (oznaczenie „najlepszy” błędne — dwa albo żaden w kategorii, znika po edycji, albo zamiana zgłasza sukces mimo równoległego usunięcia wiersza). Test types planned: unit + integracja + pgTAP.
Risk response intent:

- #4: dla zestawu nazw (wielkość liter, polskie znaki, prefiks, brak trafień) i kombinacji filtr kategorii / URL / cookie wynik zgadza się z regułami z PRD i roadmapy; wyrocznia z PRD, nie z implementacji; scenariusze bez trafień też.
- #6: w każdej kategorii co najwyżej jeden „najlepszy”; zamiana atomowa; edycja zachowuje oznaczenie; usunięcie w trakcie zamiany nie daje fałszywego sukcesu; nie tylko ścieżka sekwencyjna.
  Constraint: żaden test nie wymaga `supabase db reset` ani nie zmienia lokalnych danych dev (test-plan §1); reuse harness z fazy 1 (tests/harness/, cookbook §6).
  After creating the folder, follow the downstream continuation rule.
