# Follow-ups z impl-review (ingredients-new-ui)

Źródło: `context/changes/ingredients-new-ui/reviews/impl-review.md` (2026-10-24).

## F1 — `datalist` w Firefoksie przy `autocomplete="off"`

- **Gdzie**: `src/components/ingredients/SubstituteCreateForm.astro:78-83` (pole „Składnik”).
- **Ryzyko**: Firefox może nie rozwijać listy zapisanych składników, gdy pole ma `autocomplete="off"`. Krok 1.10 sprawdzono tylko w Chrome/Edge i na telefonie. Użytkownik zaakceptował ryzyko 2026-10-24, bo nie ma Firefoksa. Formularz działa bez listy: tekst pomocniczy i etykieta „Istniejący/Nowy” zostają, a serwer dopasowuje nazwę po `name_key`.
- **Do zrobienia**: przy pierwszej okazji otworzyć `/ingredients/new` w Firefoksie (i Safari). Jeśli lista się nie pokazuje, usunąć `autocomplete="off"` tylko z pola „Składnik” (fallback z planu, plan-review F4) i sprawdzić, czy Chrome/Edge nie zaśmiecają listy historią formularza.

## F3 — Duplikat rozpoznawany po treści komunikatu

- **Gdzie**: `src/pages/api/ingredients.ts:117`, `src/pages/api/substitutes/update.ts:99` (porównanie `result.error === duplicateSubstituteMessage(name)`).
- **Ryzyko**: zmiana treści komunikatu w `duplicateSubstituteMessage` albo budowanie go z nazwy innej niż ta, którą znormalizował endpoint, po cichu zamieni błąd pola (`error_field=substitute` / `name`) na błąd całego formularza. Dziś pilnują tego dwa kroki smoke z duplikatem (dodawanie i edycja), ale smoke nie działa w CI. Zaakceptowane 2026-10-24 (Fix A).
- **Do zrobienia**: przy najbliższej zmianie serwisu zamienników (np. S-05) dodać do wyniku `addSubstitute` / `updateSubstitute` kod błędu (np. `code: "duplicate"`) i rozpoznawać duplikat po kodzie; tekst zostaje tylko do wyświetlenia. Sprawdzić wszystkich konsumentów `ServiceResult`.

## F5 — Limit podpowiedzi przy dużych kontach

- **Gdzie**: `src/pages/ingredients/new.astro:42-56` (`listIngredients` przy każdym GET `/ingredients/new`, wszystkie nazwy w `datalist`).
- **Ryzyko**: brak limitu. Przy tysiącach składników HTML formularza rośnie liniowo (plan zaakceptował to w Performance Considerations; to samo zapytanie robi `/ingredients`). Zaakceptowane 2026-10-24.
- **Do zrobienia**: jeśli konta zaczną mieć setki lub tysiące składników, ograniczyć listę (np. ostatnio używane albo `limit` w zapytaniu) i zrobić to samo na `/ingredients`.

## F6 — Wspólny helper błędu pola

- **Gdzie**: `src/components/ingredients/SubstituteCreateForm.astro:60-65`, `src/components/ingredients/SubstituteEditForm.astro:40-43`, `src/components/ingredients/IngredientRenameForm.astro:65`.
- **Ryzyko**: trzy formularze mają własne kopie `isInvalid` / `invalid` / `describedBy`, a kolejność id w `aria-describedby` się różni (dodawanie: najpierw błąd, potem tekst pomocniczy; zmiana nazwy: odwrotnie). Obie kolejności są poprawne, ale kolejny formularz nie wie, którą wybrać. Zaakceptowane 2026-10-24.
- **Do zrobienia**: przy następnym formularzu z błędem przy polu wydzielić mały helper (np. w `src/lib/entry-fields.ts`) i ujednolicić kolejność: najpierw id błędu, potem tekst pomocniczy (także w `IngredientRenameForm`).
