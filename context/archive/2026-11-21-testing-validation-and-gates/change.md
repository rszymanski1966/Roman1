---
change_id: testing-validation-and-gates
title: Test rollout phase 4 — input validation and CI gates
status: archived
created: 2026-11-21
updated: 2026-11-25
archived_at: 2026-11-25T06:39:14Z
---

## Notes

Open a change folder for rollout Phase 4 of context/foundation/test-plan.md: "Walidacja i bramki".
Risks covered: #7 (niepoprawne lub nietypowe wejście daje 500, duplikat albo klucz nazwy niezgodny z nazwą) + cross-cutting (bramki: unit, integracja, pgTAP, lint:db-access i test migracji w CI; decyzja o smoke w CI; lokalny post-edit hook dla szybkich testów unit). Test types planned: unit + integracja + gates + post-edit-hook.
Risk response intent:

- #7: złe wejście (POST bez formularza, puste/za długie pola, wielkość liter i spacje, podwójne wysłanie) daje czytelny błąd `?error=` na stronie źródłowej, nie 500; nazwy różniące się wielkością liter/spacjami nie tworzą duplikatu; klucz nazwy zawsze zgodny z nazwą. Must challenge: „formularz HTML waliduje, więc serwer nie musi”. Avoid: test tylko przez formularz; mock walidacji.
- cross-cutting: bramki z §5 oznaczone „CI required after §3 Phase 4” faktycznie blokują merge (wymaga lokalnego Supabase w CI); post-edit hook uruchamia tylko szybkie testy unit bez stosu i nie zastępuje CI.
  After creating the folder, follow the downstream continuation rule.
