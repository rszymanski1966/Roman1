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
