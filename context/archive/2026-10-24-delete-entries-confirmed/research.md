---
date: 2026-10-25T20:07:27+01:00
researcher: Claude (claude-opus-5-5) dla rszymanski1966
git_commit: b044673
branch: feat/delete-entries-confirmed
repository: 10x-astro-starter
topic: "S-05 delete-entries-confirmed: co trzeba wiedzieć, żeby zaplanować usuwanie składników i zamienników z potwierdzeniem"
tags: [research, codebase, supabase, rls, substitutes, ingredients, set_best_substitute, ui]
status: complete
last_updated: 2026-10-25
last_updated_by: Claude (claude-opus-5-5)
---

# Research: usuwanie wpisów z potwierdzeniem (S-05, FR-007)

**Date**: 2026-10-25T20:07:27+01:00
**Researcher**: Claude (claude-opus-5-5) dla rszymanski1966
**Git Commit**: b044673 (drzewo robocze: niezacommitowany tylko `context/changes/delete-entries-confirmed/`)
**Branch**: feat/delete-entries-confirmed
**Repository**: 10x-astro-starter

## Research Question

Na podstawie `change.md`: jak dziś wygląda baza, serwis, endpointy i widoki, które dotknie usuwanie własnego składnika albo zamiennika (składnik kaskadowo z zamiennikami, po jawnym potwierdzeniu)? Co z wcześniejszych decyzji wiąże S-05: ryzyko F1 (`set_best_substitute` bez `for update`), follow-up F3 (duplikat rozpoznawany po treści komunikatu) i kontrakt UI dla nowych widoków?

## Summary

- **Baza jest prawie gotowa.** Klucze obce kaskadują już `ingredients → ingredient_categories → substitutes` (`supabase/migrations/20261004120000_substitute_database.sql:57,89`). Brakuje tylko polityk RLS `DELETE`. Uprawnienie tabelowe `DELETE` `anon` i `authenticated` mają już na wszystkich 4 tabelach `public` (domyślne granty Supabase, sprawdzone w lokalnej bazie). Bez polityki `DELETE` usuwa po cichu 0 wierszy, bez błędu.
- **Kaskada omija RLS tabel podrzędnych.** Zweryfikowałem to w lokalnej bazie, w transakcji wycofanej na końcu. Do kaskady wystarczy polityka `DELETE` na `ingredients`, bez polityki na `ingredient_categories` i `substitutes`. Polityka na `substitutes` jest potrzebna tylko do usuwania pojedynczego zamiennika.
- **F1 jest twardym wymaganiem.** Polityka `DELETE` na `substitutes` (i pośrednio usunięcie składnika) otwiera wyścig w `set_best_substitute`: odczyt wiersza bez blokady (`supabase/migrations/20261011201658_best_substitute.sql:45-48`). Roadmapa wpisała poprawkę do ryzyka S-05 (`context/foundation/roadmap.md:126`). Potrzebna jest migracja `create or replace function` z `select … for update`.
- **F3 to osobne zadanie w tym samym serwisie.** Dwa miejsca porównują `result.error === duplicateSubstituteMessage(...)` (`src/pages/api/ingredients.ts:117`, `src/pages/api/substitutes/update.ts:99`). `ServiceResult` (`src/lib/services/substitutes.ts:21`) nie ma pola kodu. Przeczytane endpointy i strony (`ingredients.ts`, `rename.ts`, `best.ts`, `update.ts`, `index.astro`, `edit-*.astro`) poza tymi dwoma miejscami sprawdzają tylko `result.error !== null`, więc opcjonalne `code` w gałęzi błędu jest dla nich zgodne wstecz. `new.astro` i `LookupForms.astro` przejrzałem tylko grepem: nie porównują `result.error` z tekstem.
- **UX bez JS.** Cała aplikacja to formularze POST + redirect i strony SSR. Okno `confirm()` odrzucono już w S-02. Dla S-05 naturalny jest osobny widok potwierdzenia, na wzór stron edycji z S-04. Czy osobne potwierdzenie ma mieć też usuwanie pojedynczego zamiennika, to decyzja produktowa: FR-007 wiąże potwierdzenie z kaskadą składnika.
- **Pułapka UI:** wariant `destructive` w `buttonVariants` łamie kontrakt UI. Ma `text-white` i warianty `dark:` (`src/components/ui/button.tsx:13-14`), a w `global.css` nie ma tokenu `--destructive-foreground`. Nigdzie go dziś nie używamy.

## Detailed Findings

### 1. Schemat, granty i RLS

- Klucze obce (`20261004120000_substitute_database.sql`):
  - `ingredient_categories.ingredient_id → ingredients on delete cascade` (`:57`)
  - `substitutes.ingredient_category_id → ingredient_categories on delete cascade` (`:89`)
  - `ingredient_categories.category_id → categories` bez kaskady (`:58`). To słownik, nikt go nie usuwa.
- Komentarz `:3`: „UPDATE/DELETE policies are intentionally absent (added with S-04/S-05)”. S-04 dodało tylko UPDATE (`20261021120000_edit_entries.sql:34-38`, `20261011201658_best_substitute.sql:23-27`).
- Polityki w lokalnej bazie (`pg_policies`, 2026-10-25): SELECT/INSERT na 3 tabelach użytkownika, UPDATE na `ingredients` i `substitutes`, SELECT na `categories`. Zero polityk `DELETE`. Lokalnie zastosowane są 4 migracje, te same co w repo.
- Granty: `has_table_privilege(..., 'DELETE')` = `t` dla `anon` i `authenticated` na `ingredients`, `ingredient_categories`, `substitutes` i `categories` (lokalnie). Migracje odbierają tylko UPDATE (`20261011201658_best_substitute.sql:20`, `20261021120000_edit_entries.sql:31`). Wcześniej odnotowano to w `context/archive/2026-10-17-edit-entries/research.md:85`.
- Weryfikacja empiryczna (lokalna baza, `begin … rollback`, użytkownik `authenticated` z własnym składnikiem, parą i zamiennikiem):
  - bez polityki `DELETE`: `delete from substitutes …` zwraca 0 wierszy, `delete from ingredients …` też 0, bez błędu;
  - po tymczasowym `create policy … on ingredients for delete to authenticated using (user_id = (select auth.uid()))`: usuwa 1 składnik, a jego para i zamiennik znikają, choć `ingredient_categories` i `substitutes` nie mają polityki `DELETE`.
- Wzorzec polityki „własne wiersze”: `using (user_id = (select auth.uid()))` (`20261004120000_substitute_database.sql:44`). Dla DELETE nie ma `with check`.
- Indeksy FK: `ingredient_categories.user_id`, `ingredient_categories.category_id` i `substitutes.user_id` nie mają indeksu. Decyzja: dodać je „w późniejszej migracji (np. z S-04/S-05)” (`context/archive/2026-10-04-first-substitute-lookup/reviews/impl-review.md:108-110`). Kaskada z `ingredients` idzie po `ingredient_categories.ingredient_id` (pierwsza kolumna unikalnego indeksu `(ingredient_id, category_id)`, `:60`) i `substitutes.ingredient_category_id` (pierwsza kolumna unikalnego indeksu, `20261010115230_unique_substitutes.sql:26-28,30`), więc tej ścieżce brak tych 3 indeksów nie szkodzi. Wniosek z definicji indeksów, nie z pomiaru.

### 2. `set_best_substitute` i F1

- Funkcja (`20261011201658_best_substitute.sql:36-77`): `security invoker`, `search_path = ''`. Czyta `name, ingredient_category_id` zwykłym `select … into`, bez blokady (`:45-48`). `P0002` przy braku wiersza (`:50-53`), potem jeden albo dwa `update`.
- Wyścig (wniosek z kodu, przy READ COMMITTED): jeśli wiersz zniknie między odczytem a `update`, oba `update … where s.id = p_substitute_id` trafiają w 0 wierszy i funkcja zwraca sukces z nazwą nieistniejącego zamiennika. Przy `p_is_best = true` pierwszy `update` (`:59-64`) zdąży jeszcze zdjąć wyróżnienie z poprzedniego najlepszego, więc para zostaje bez najlepszego, a komunikat mówi o zamianie. Z `for update` w `:45-48` współbieżne usunięcie czeka na koniec transakcji funkcji. Jeśli usunięcie wygrało wcześniej, odczyt nic nie znajduje i funkcja rzuca `P0002`, a serwis mapuje to na „Nie znaleziono zamiennika.” (`src/lib/services/substitutes.ts:264`).
- Wyścig obejmuje obie ścieżki usuwania: bezpośrednią (polityka na `substitutes`) i kaskadową (polityka na `ingredients`). Wniosek z §1: kaskada usuwa zamienniki z pominięciem RLS.
- `setBestSubstitute` woła tę funkcję z `/api/substitutes/best` i z `addSubstitute` przy `isBest` (`src/lib/services/substitutes.ts:170`).
- Testy pgTAP funkcji: `supabase/tests/best-substitute.sql` (`plan(14)`). Żaden test w `supabase/tests/*.sql` nie zawiera dziś `delete`, `for update` ani `cascade` (grep).

### 3. Serwis, `ServiceResult` i F3

- `ServiceResult<T> = { data: T; error: null } | { data: null; error: string }` (`src/lib/services/substitutes.ts:21`). Helpery `ok`/`fail` (`:25-31`), `GENERIC_ERROR` (`:23`).
- Wzorzec „0 wierszy = nie znaleziono”: `update(...).eq("id", …).select(...).maybeSingle()` i `if (!data) return fail("Nie znaleziono …")` (`updateSubstitute` `:345-360`, `renameIngredient` `:395-406`). Dla DELETE ta sama pułapka: bez `.select()` usunięcie cudzego albo nieistniejącego wiersza dałoby fałszywy sukces (wniosek z §1, 0 wierszy bez błędu).
- Komunikaty „nie znaleziono” już istnieją: „Nie znaleziono zamiennika.” (`:264`, `:360`), „Nie znaleziono składnika.” (`:406`).
- F3: `duplicateSubstituteMessage` (`:91-93`) jest używany w serwisie (`:160`, `:357`) i porównywany tekstowo w `src/pages/api/ingredients.ts:117` (`error_field=substitute`) oraz `src/pages/api/substitutes/update.ts:99` (`error_field=name`). Grep po `src/`: innych porównań nie ma. Serwis importuje 10 plików w `src/` (grep `lib/services/substitutes`). Przeczytane endpointy i strony (lista w Summary) sprawdzają tylko `result.error !== null`, więc `code?: "duplicate"` w gałęzi błędu nie łamie ich zawężania typów.
- Do zliczenia zamienników przed potwierdzeniem nadaje się istniejące `listIngredientSubstitutes(client, ingredientId, null)` (`:210-243`): grupy per kategoria z listą zamienników. `getIngredient` (`:369-380`) i `getSubstituteForEdit` (`:302-332`) dostarczają nazwy dla strony potwierdzenia.

### 4. Endpointy i przekierowania

- Szkielet endpointu akcji z listy (`src/pages/api/substitutes/best.ts:14-60`, `update.ts`, `rename.ts`): `createClient` → null → `listRedirect(null, {error})`, potem `!locals.user` → `/auth/signin`, potem `formData()` w try/catch, potem `parseListView(form)` (null → `INVALID_FORM`), potem `isUuid(id)`, potem serwis, potem `listRedirect(view, {notice|error})`.
- `/api/*` nie leży w `PROTECTED_ROUTES` (`src/middleware.ts:4`: tylko `/dashboard`, `/ingredients`), więc każdy endpoint sprawdza `locals.user` sam. `/ingredients/...` (np. strona potwierdzenia) jest chronione prefiksem.
- `listRedirect(view, extra, errorFor)` (`src/lib/list-view.ts:57-65`): stała kolejność parametrów, `errorFor` dodaje `error_for=<id>` i kotwicę `#substitute-<id>`. `parseListView` wymaga poprawnego `ingredient` (`:31-34`).
- **Po usunięciu składnika nie wolno wracać do widoku z jego `ingredient`.** `index.astro` dla nieznanego id ustawia `view = { kind: "ingredient", ingredient: null, groups: [] }` (`src/pages/ingredients/index.astro:110-116`). Widok renderuje wtedy EmptyState „Brak zamienników dla tego składnika.” z CTA (`:284-291`), co po usunięciu wprowadza w błąd. Lepiej przekierować do gołej listy albo do wyszukiwania (`q`, `match`, `category`) z `notice`. `listRedirect(view)` tego nie zrobi, bo zawsze ustawia `ingredient` (`list-view.ts:45-46`).
- Po usunięciu zamiennika `listRedirect(view, { notice })` wraca do tego samego widoku. Gdy był to ostatni zamiennik pary, para zostaje w `ingredient_categories`. Widoki ją pomijają: `listIngredientSubstitutes` pomija pary bez zamienników (`substitutes.ts:227`), `listIngredientIdsWithSubstitutes` używa `!inner` (`:187-190`). Ostatni zamiennik składnika daje EmptyState „Brak zamienników…” (poprawny stan).
- Komunikaty na liście: `?notice=` → `Alert variant="success"`, `?error=` → `Alert destructive`, a z `error_for` błąd trafia w kartę (`index.astro:34-39,187-194,206-215`).
- CSRF: Astro przy `output: "server"` domyślnie sprawdza `Origin` dla POST formularzy (`security.checkOrigin`), a `astro.config.mjs` tego nie wyłącza. Wniosek z dokumentacji Astro, nie sprawdzony w runtime.

### 5. Widoki i kontrakt UI

- Karta zamiennika (`src/components/ingredients/SubstituteCard.astro:64-90`): formularz „Oznacz jako najlepszy” i link „Edytuj”, oba `buttonVariants({ variant: "outline", size: "sm" })` + `focusRing`, `aria-label` = „<akcja>: <nazwa>”. Komentarz `:11-16` opisuje kontrakt ze smoke: nazwa jako `>name<`, po niej pierwszy `name="substitute_id"` z formularza best (`scripts/smoke.mjs:55-59` bierze pierwsze trafienie za nazwą). Link GET do potwierdzenia nie narusza kontraktu. Formularz POST z `name="substitute_id"` też nie, jeśli stoi za formularzem best.
- Nagłówek składnika (`index.astro:273-283`): `h2` z samą nazwą (zależy od niego smoke, komentarz `:275`) i link „Zmień nazwę” (`textLinkClass`). To naturalne miejsce na akcję „Usuń składnik”.
- Strony edycji (`src/pages/ingredients/edit-ingredient.astro`, `edit-substitute.astro`) dają gotowy szablon strony potwierdzenia: `Layout`, karta `max-w-md`, `h1`, `loadError` → `Alert`, id spoza RLS → „nie znaleziono”, `view` z URL albo zapasowy widok własny wpisu, `IngredientsFooter`.
- `buttonVariants` (`src/components/ui/button.tsx:7-31`): wariant `destructive` = `bg-destructive text-white … dark:bg-destructive/60` (`:13-14`). Zasady z `CLAUDE.md` (`## UI`) zabraniają literałów palety i wariantów `dark:` w komponentach. Tokeny: `--destructive` jest w `:root` i `.dark` (`src/styles/global.css:39,78`), `--destructive-foreground` nie ma. W `.dark` `--destructive` jest jasne (`oklch(0.704 …)`), więc biały tekst na nim zapowiada słaby kontrast (wniosek, nie zmierzony). `src/` nie używa dziś wariantu `destructive` przycisku (grep), a kitchen-sink go nie pokazuje (`src/pages/dev/kitchen-sink.astro:326-367`).
- Guard literałów: `GUARDED` w `scripts/ui-literals.mjs:11-26` obejmuje `src/components/ingredients/*.astro` (nowe komponenty w tym katalogu wejdą automatycznie) i wymienione z nazwy strony `src/pages/ingredients/*.astro`. Nowa strona potwierdzenia wymaga dopisania. `button.tsx` nie jest w `GUARDED`.
- Kitchen-sink ma matryce 7 stanów dla `/ingredients` i `/ingredients/new` (`kitchen-sink.astro:132,167`). Nowy widok i zmiany w karcie trzeba tam dopisać (`CLAUDE.md`, `## UI`).
- Jedyny `<script>` w widokach składników to `SubstituteCreateForm.astro:199`. Widoki listy i edycji działają bez JS (`kitchen-sink.astro:162`).

### 6. Testy

- pgTAP: `supabase/tests/{rls-isolation,best-substitute,edit-entries,unique-substitutes}.sql`. Wzorzec: setup jako `postgres`, potem `set local role authenticated` + `request.jwt.claims` (`best-substitute.sql:1-40`). Test „B nie zmienia wierszy A” dla UPDATE: brak błędu, dane bez zmian (`edit-entries.sql:120-150`). To wzór dla DELETE.
- Smoke (`scripts/smoke.mjs`): helpery formularzy (`bestForm`, `editForm`, `renameForm` `:63-83`), osobne konto B do izolacji. Smoke nie działa w CI (`.github/workflows/ci.yml`: z kontroli są tam `astro sync`, lint, lint:ui i build).

## Code References

- `supabase/migrations/20261004120000_substitute_database.sql:3,44,57,89` – brak polityk DELETE, wzorzec polityki, kaskady FK
- `supabase/migrations/20261011201658_best_substitute.sql:36-77` – `set_best_substitute`, odczyt bez blokady `:45-48`
- `src/lib/services/substitutes.ts:21` – `ServiceResult`; `:91-93` duplikat; `:210-243` lista zamienników składnika; `:339-408` wzorzec update + „nie znaleziono”
- `src/pages/api/ingredients.ts:117`, `src/pages/api/substitutes/update.ts:99` – porównanie tekstu duplikatu (F3)
- `src/pages/api/substitutes/best.ts:14-60` – szkielet endpointu akcji z listy
- `src/lib/list-view.ts:31-65` – `parseListView`, `listRedirect`
- `src/pages/ingredients/index.astro:110-116,273-291` – zachowanie dla nieznanego `ingredient`, nagłówek składnika
- `src/components/ingredients/SubstituteCard.astro:11-16,64-90` – kontrakt ze smoke, akcje karty
- `src/components/ui/button.tsx:13-14` – wariant `destructive` poza kontraktem tokenów
- `scripts/ui-literals.mjs:11-26` – `GUARDED`
- `scripts/smoke.mjs:55-59` – `substituteIdFor`

## Architecture Insights

- Granty kolumnowe decydują o kolumnach, RLS o wierszach. Dla DELETE nie ma kolumn, więc wystarczą polityki „własne wiersze”. Można rozważyć odebranie `DELETE` roli `anon` na wzór UPDATE (`revoke update … from anon` w obu migracjach), ale żaden dokument tego nie wymaga.
- Wszystkie akcje to POST + redirect z `?notice=`/`?error=` budowanymi przez `URLSearchParams`, a powrót do widoku przez `ListView`. Usuwanie składnika to pierwsza akcja, po której widok źródłowy przestaje istnieć. Potrzebuje więc wariantu powrotu bez `ingredient`.
- Błędy serwisu są przyjazne dla użytkownika i bez szczegółów SQL. „0 wierszy” to „nie znaleziono”, nie sukces.

## Historical Context (from prior changes)

- `context/foundation/prd.md:100-105` – FR-007 i notatka Socratesa: usuwanie kaskadowe, „dopiero po jawnym potwierdzeniu”. Notatka powołuje się na „guardrail trwałości danych”, którego nie ma w sekcji Guardrails (`prd.md:52-55` wymienia tylko izolację). Trwałość wynika z wymagania, nie jest formalnym guardrailem.
- `context/foundation/roadmap.md:117-127` – S-05, ryzyko `:126`: potwierdzenie „jest częścią wymagania, nie ozdobą” i obowiązek `select … for update` (F1). **Wspierane** przez obecny kod (§2).
- `context/archive/2026-10-11-best-substitute-highlight/reviews/impl-review.md:45-62` – F1, decyzja „FIXED (Fix A)”: przeniesione do S-05. Fix B (osobna migracja) miał zastrzeżenie „Lock interaction with other updates hasn't been tested”.
- `context/archive/2026-10-11-best-substitute-highlight/plan.md:40` – „usunięcie najlepszego zamiennika … nie wymaga dodatkowej logiki”. **Częściowo aktualne:** prawdziwe co do danych (para zostaje bez najlepszego, częściowy indeks unikalny tego nie zabrania), nieaktualne co do współbieżności (F1).
- `context/archive/2026-10-11-best-substitute-highlight/plan.md:37` – S-02 odrzuciło okno potwierdzenia i skrypt po stronie klienta (dla zamiany najlepszego). To precedens no-JS, nie decyzja o S-05.
- `context/archive/2026-10-22-ingredients-new-ui/follow-ups/review-fixes.md:11-15` – F3: „przy najbliższej zmianie serwisu zamienników (np. S-05)” dodać kod błędu i „sprawdzić wszystkich konsumentów `ServiceResult`”. Konsumentów sprawdziłem w §3.
- `context/archive/2026-10-17-edit-entries/research.md:85` – domyślne granty DELETE. **Wspierane** (§1).
- `context/archive/2026-10-04-first-substitute-lookup/plan.md:34` – „podwójne wysłanie formularza dubluje zamiennik (usuwanie przyjdzie z S-05)”. Duplikaty blokuje dziś ograniczenie unikalności (`20261010115230_unique_substitutes.sql:26-28`), więc to uzasadnienie straciło wagę.
- `context/archive/2026-10-04-first-substitute-lookup/reviews/impl-review.md:108-110` – indeksy FK odłożone „np. z S-04/S-05”. Opcja, nie wymóg.
- `context/archive/2026-10-17-edit-entries/plan-brief.md:25`, `plan.md:203-204` – S-04: osobne strony, POST + redirect, „Anuluj” wraca do widoku, obcy id daje stan „nie znaleziono”. Wzór dla strony potwierdzenia.
- `context/foundation/lessons.md` – sprawdzanie null klienta, `class:list` kontra `cn()`, wiersz Backlog Handoff (przy `/10x-plan` zmienić Notes na „Planned”).

## Related Research

- `context/archive/2026-10-17-edit-entries/research.md` – granty, RLS UPDATE, wzorzec „nie znaleziono”
- `context/archive/2026-10-22-ingredients-new-ui/research.md` – kontrakt UI, `error_field`

## Open Questions

Decyzje produktowe i projektowe dla `/10x-plan` (nie luki w dowodach):

1. **Potwierdzenie usunięcia zamiennika.** FR-007 wymaga potwierdzenia przy kaskadzie składnika. Czy pojedynczy zamiennik też przechodzi przez stronę potwierdzenia, czy wystarczy przycisk POST z karty?
2. **Forma potwierdzenia.** Osobna strona SSR (spójna z S-04 i z hintem w `change.md`) czy natywny `<dialog>`/`<details>` bez JS na liście? Strona jest jedyną opcją już sprawdzoną w tej aplikacji.
3. **Treść potwierdzenia składnika.** Ile zamienników i w jakich kategoriach zniknie? Przy widoku zawężonym do kategorii kaskada i tak usuwa wszystkie kategorie składnika.
4. **Powrót po usunięciu składnika:** goła lista, wyszukiwanie (`q`/`match`/`category`) czy coś innego. Wymaga wariantu `listRedirect` bez `ingredient`.
5. **Przycisk destrukcyjny:** dodać token `--destructive-foreground` i naprawić wariant `destructive` (bez `text-white` i `dark:`), czy użyć `outline` + `text-destructive`?
6. **Puste pary** po usunięciu ostatniego zamiennika: zostawić (widoki je pomijają) czy sprzątać?
7. **Zakres migracji:** tylko polityki DELETE (`ingredients`, `substitutes`) i `for update`? Czy także indeksy FK z `impl-review.md:108-110` i odebranie `DELETE` roli `anon`?
