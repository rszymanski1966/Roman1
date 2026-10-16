---
change_id: ingredient-name-search
title: Ingredient name search
status: archived
created: 2026-10-12
updated: 2026-10-16
archived_at: 2026-10-16T17:44:45Z
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### Odstępstwa od planu (zatwierdzone)

Faza 2 (463ab1f), zatwierdzone przez użytkownika w trakcie implementacji:

- Nagłówki sekcji kategorii w widoku bez kategorii to `h3` (plan: `h2`), bo są podsekcjami pod `h2` z nazwą składnika.
- CTA „Dodaj zamiennik” w stanie pustym niesie `ingredient=<id>` tylko dla własnego składnika użytkownika (plan: „CTA jak dziś”, czyli każde poprawne UUID z URL).
- Oba formularze (wyszukiwanie i lista) stoją obok siebie od `md` w górę (karta `md:max-w-3xl`, pionowy separator „albo”); na wąskim ekranie jeden pod drugim (plan: wyszukiwanie nad listą).

Po impl-review (`reviews/impl-review.md`, F6), zatwierdzone w triage:

- Link „← Wszystkie wyniki dla „q”” w widoku składnika pokazuje się tylko wtedy, gdy to samo wyszukiwanie ma więcej niż jedno trafienie (plan: „bez liczenia trafień”). Strona liczy więc trafienia także przy `ingredient` + `q`, a z kategorią robi zapytanie filtra w tym samym `Promise.all`. Gdy filtr zawiedzie, link zostaje.
