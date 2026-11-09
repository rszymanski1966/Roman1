---
change_id: testing-isolation-and-delete
title: Testy izolacji kont i usuwania (faza 1 planu testów)
status: implemented
created: 2026-11-04
updated: 2026-11-09
archived_at: null
---

## Notes

Rollout Phase 1 of `context/foundation/test-plan.md`: "Izolacja i usuwanie".

Risks covered: #1 (usunięcie zamiennika kasuje za dużo / kaskada niezgodna z ekranem potwierdzenia), #2 (dostęp do cudzych składników/zamienników przez URL lub formularz), #5 (testy lub bramka kasują lokalne dane dewelopera). Test types planned: runner TS (Vitest) + integracja (lokalny Supabase, dwa konta) + pgTAP.

Risk response intent:

- #1: po usunięciu jednego zamiennika pozostałe zamienniki składnika i sam składnik istnieją; składnik bez potwierdzenia się nie usuwa; kaskada usuwa dokładnie to, co pokazano przy potwierdzeniu.
- #2: konto B nie odczyta, nie zmieni ani nie usunie danych A przez URL ani formularz z cudzym id; odpowiedź nie zdradza istnienia cudzego wiersza.
- #5: pełny przebieg testów zostawia lokalne dane i konta deweloperskie bez zmian (bez `db reset`, bez fixture'ów w bazie deweloperskiej).
