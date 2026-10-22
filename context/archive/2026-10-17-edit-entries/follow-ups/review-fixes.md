# Review fixes — follow-ups

Poprawki z `reviews/impl-review.md`, odłożone poza S-04.

- **F1 (część: formularz zamiennika).** `SubstituteEditForm.astro` pokazuje błąd zapisu tylko w `Alert` nad formularzem; żadne pole nie dostaje `aria-invalid`/`aria-describedby`. Wskazanie pola wymaga, by `api/substitutes/update` odsyłał nazwę pola (np. `error_field=<name|ratio|notes>`) obok `error`. Ten sam brak ma `new.astro` — można zrobić razem przy `/10x-ui src/pages/ingredients/new.astro`.
- **F3 (`ingredients.name_key` w bazie).** Grant `update (name, name_key)` (i INSERT od S-01) pozwala zapisać przez PostgREST `name_key` niezgodny z `name`; skutek tylko na własnych danych (kolejność listy, możliwy duplikat w `addSubstitute`). Follow-up: trigger BEFORE INSERT/UPDATE `name_key := lower(name)` albo konwersja na kolumnę generowaną (jak w `substitutes`), potem `name_key` znika z grantu i z payloadów aplikacji (`toNameKey`). Przed migracją sprawdzić na danych prod, czy `lower()` w Postgresie daje to samo co `toLocaleLowerCase("pl")`.
