# Ingredient Name Search — Plan Brief

> Full plan: `context/changes/ingredient-name-search/plan.md`

## What & Why

Użytkownik w trakcie gotowania wpisuje nazwę składnika (albo jej fragment) i od razu dostaje zamienniki, z opcjonalnym zawężeniem do kategorii. Realizuje to FR-004 i FR-005 z PRD (S-03 w roadmapie) i domyka kryterium Primary: zapis → szybkie odnalezienie (< 1 s).

## Starting Point

`/ingredients` ma jeden formularz GET z dwiema wymaganymi listami rozwijanymi (składnik + kategoria) i pokazuje zamienniki jednej pary, z wyróżnionym najlepszym (S-02). Strona już ładuje pełną listę składników użytkownika. Przycisk „Oznacz jako najlepszy" wraca zawsze na `?ingredient&category`.

## Desired End State

Na `/ingredients` jest pole wyszukiwania z przełącznikiem „zawiera / zaczyna się od" (ostatni wybór pamięta ciasteczko) i opcjonalną kategorią, a pod nim dotychczasowa lista rozwijana z kategorią opcjonalną. Kilka trafień daje listę składników do wyboru, jedno trafienie od razu zamienniki, brak trafień daje komunikat z CTA „Dodaj składnik". Bez kategorii zamienniki są w sekcjach per kategoria, każda z własnym „najlepszym". Oznaczenie najlepszego wraca do tego samego widoku.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Dopasowanie nazwy | Dwa tryby: „zawiera" (domyślny) i „zaczyna się od", przełączane przez użytkownika | Użytkownik chce wybierać między szerokim i wąskim dopasowaniem. |
| Zapamiętanie trybu | Ciasteczko; kolejność: `?match` w URL > ciasteczko > „zawiera" | Kto woli prefiks, nie musi przełączać przy każdej wizycie. |
| Kilka trafień | Lista pasujących składników, potem wybór; jedno trafienie → od razu zamienniki | Krótka strona i dosłowne pokrycie FR-005, bez zbędnego kliku przy jednym wyniku. |
| Dotychczasowy formularz | Zostaje obok wyszukiwania | Nic nie jest zabierane użytkownikowi. |
| Kategoria w liście rozwijanej | Opcjonalna („Wszystkie kategorie") | Oba formularze działają tak samo i jest jeden widok wyników. |
| Widok bez kategorii | Sekcje per kategoria, najlepszy na górze każdej, puste pominięte | Reguła „jeden najlepszy na kategorię" zostaje czytelna. |
| Filtr kategorii w wyszukiwaniu | Tylko składniki z co najmniej jednym zamiennikiem w tej kategorii | Filtr realnie zawęża wynik i nie prowadzi do pustych kliknięć. |
| Brak trafień / puste pole | Komunikat + CTA z wpisaną nazwą; puste pole = stan początkowy | Spójne z pustym stanem US-01, prowadzi do dodania brakującego składnika. |
| Gdzie dopasowanie | W aplikacji, na liście już pobranej dla listy rozwijanej (decyzja agenta) | Zero dodatkowych zapytań, ten sam `toNameKey` co przy zapisie, brak escapowania `LIKE`. |

## Scope

**In scope:**
- Funkcje serwisu: dopasowanie, tryb, filtr kategorii, zamienniki pogrupowane per kategoria
- Strona `/ingredients`: dwa formularze, wszystkie stany wyniku, ciasteczko trybu
- `api/substitutes/best.ts`: powrót do pełnego kontekstu widoku
- Nowe kroki smoke; poprawka wiersza S-02 w Backlog Handoff roadmapy (pierwszy commit)

**Out of scope:**
- Tolerancja literówek i odmiany, wyszukiwanie po nazwie zamiennika
- Wyszukiwanie w bazie (`ilike`, trigramy), migracje, limit trafień, paginacja
- Wyszukiwanie „na żywo" i JS; zmiany w `/ingredients/new` i `/api/ingredients`

## Architecture / Approach

Strona Astro rozstrzyga widok z URL: `ingredient` (widok składnika) > `q` (wyszukiwanie) > stan początkowy. Wyszukiwanie filtruje w pamięci listę z `listIngredients` przez `matchIngredients`, a przy kategorii przecina ją z `listIngredientIdsWithSubstitutes` (jedno zapytanie). Widok składnika używa `listIngredientSubstitutes` (jedno zapytanie z osadzonymi kategoriami i zamiennikami), które zastępuje `listSubstitutes`. Tryb zapisuje `Astro.cookies`. RLS dalej zapewnia izolację.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Serwis | Dopasowanie, tryb, filtr kategorii, grupy zamienników, typy | Grupowanie i sortowanie osadzonych wyników PostgREST |
| 2. Strona i przekierowanie | Formularze, stany wyniku, ciasteczko, powrót po oznaczeniu | Zepsucie istniejących kroków smoke (kolejność parametrów, tekst „Brak zamienników") |
| 3. Smoke | Kroki dla trybów, ciasteczka, kategorii, izolacji | Kroki zależne od stanu ciasteczka w słoiku |

**Prerequisites:** S-01 i S-02 zrobione (są); lokalny Supabase i `npm run dev` do smoke; nie odpalać `npm run build` przy działającym dev.
**Estimated effort:** ~1–2 sesje w 3 fazach.

## Open Risks & Assumptions

- Dopasowanie w pamięci zakłada małą bazę jednego użytkownika; przy tysiącach składników trzeba przenieść je do bazy.
- Zmiana przełącznika działa dopiero po kliknięciu „Szukaj" (brak JS); możliwe drobne zaskoczenie użytkownika.

## Success Criteria (Summary)

- Wpisanie fragmentu nazwy daje zamienniki w jednym albo dwóch krokach, z wyróżnionym najlepszym per kategoria.
- Wybrany tryb dopasowania jest pamiętany między wizytami.
- Dotychczasowe przepływy (dodawanie, oznaczanie, izolacja kont) przechodzą smoke bez zmian w krokach.
