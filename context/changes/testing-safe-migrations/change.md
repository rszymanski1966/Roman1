---
change_id: testing-safe-migrations
title: Test rollout phase 3 — migrations tested on a throwaway database with data
status: impl_reviewed
created: 2026-11-15
updated: 2026-11-20
archived_at: null
---

## Notes

Open a change folder for rollout Phase 3 of context/foundation/test-plan.md: "Bezpieczne migracje".
Risks covered: #3 (migracja wypchnięta na produkcję gubi lub przekłamuje dane użytkowników — wiersze, kategorie, oznaczenie „najlepszy”). Test types planned: integracja (jednorazowa baza z fixture'ami).
Risk response intent:

- #3: migracja uruchomiona na bazie z reprezentatywnymi danymi zachowuje liczbę wierszy, oznaczenia „najlepszy” i przypisania kategorii (poza zmianami zamierzonymi); nie przyjmować „przechodzi na pustej bazie, więc jest bezpieczna”; unikać testu na pustej bazie i `db reset` na bazie deweloperskiej.
  Constraint: żaden test nie wymaga `supabase db reset` ani nie zmienia lokalnych danych dev (test-plan §1); gotowe przed pierwszą migracją M-02.
  After creating the folder, follow the downstream continuation rule.
