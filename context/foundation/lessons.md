# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Zawsze sprawdzaj null z klienta Supabase

- **Context**: Każdy kod serwerowy, który tworzy klienta Supabase przez src/lib/supabase.ts: middleware, API routes w src/pages/api/, strony .astro z logiką serwerową.
- **Problem**: Klient zwraca null, gdy brakuje SUPABASE_URL lub SUPABASE_KEY (zmienne są optional w env.schema). Kod, który od razu wywołuje metody klienta, rzuca TypeError i zwraca 500 zamiast czytelnego błędu, np. przy lokalnym uruchomieniu bez .dev.vars.
- **Rule**: Zawsze sprawdzaj wynik tworzenia klienta Supabase pod kątem null przed pierwszym użyciem. W API auth odpowiadaj przekierowaniem z ?error=<komunikat>, a nie wyjątkiem.
- **Applies to**: plan, implement, impl-review

## class:list czy cn() w komponentach .astro

- **Context**: src/pages/ingredients/index.astro:67, :119 (oraz src/pages/ingredients/new.astro). Łączenie klas Tailwind w komponentach .astro.
- **Problem**: CLAUDE.md każe łączyć klasy przez cn(). Strony .astro używają class:list={[stała, "mt-4"]}, czyli łączenia bez tailwind-merge. Dziś nic się nie gryzie, a new.astro robi to samo. Kod jest więc spójny z sąsiednim plikiem, ale niezgodny z regułą, i agent przy kolejnej stronie nie wie, który wzorzec wybrać.
- **Rule**: W plikach .astro `class:list` jest dozwolony, gdy łączone klasy się nie wykluczają. Gdy klasa ma nadpisać utility z bazowego zestawu (np. inny `px-*` albo `bg-*`), użyj `cn()` z `@/lib/utils`. W komponentach React zawsze używaj `cn()`.
- **Applies to**: plan, implement, impl-review

## Klucz nazwy (name_key) jako kolumna generowana

- **Context**: supabase/migrations/20261010115230_unique_substitutes.sql:11-12 (substitutes.name_key) vs src/lib/services/substitutes.ts:37-39 (ingredients.name_key liczony w aplikacji).
- **Problem**: Projekt ma dwa sposoby wyliczania klucza porównania nazw: `ingredients.name_key` liczy aplikacja (`toLocaleLowerCase("pl")`), `substitutes.name_key` to kolumna generowana `lower(name)`. Bez reguły kolejna tabela może wybrać dowolny wariant, a klucz liczony w aplikacji łatwo rozjeżdża się z nazwą przy edycji (S-04).
- **Rule**: Nowe klucze porównania nazw rób jako kolumnę `generated always as (lower(name)) stored` z ograniczeniem unikalności w bazie. Trim i scalanie spacji robi `normalizeName` przed zapisem. `ingredients.name_key` (liczony w aplikacji) jest wyjątkiem z S-01. Przy jego edycji aktualizuj klucz razem z nazwą.
- **Applies to**: plan, implement, impl-review
