# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Zawsze sprawdzaj null z klienta Supabase

- **Context**: Każdy kod serwerowy, który tworzy klienta Supabase przez src/lib/supabase.ts: middleware, API routes w src/pages/api/, strony .astro z logiką serwerową.
- **Problem**: Klient zwraca null, gdy brakuje SUPABASE_URL lub SUPABASE_KEY (zmienne są optional w env.schema). Kod, który od razu wywołuje metody klienta, rzuca TypeError i zwraca 500 zamiast czytelnego błędu, np. przy lokalnym uruchomieniu bez .dev.vars.
- **Rule**: Zawsze sprawdzaj wynik tworzenia klienta Supabase pod kątem null przed pierwszym użyciem. W API auth odpowiadaj przekierowaniem z ?error=<komunikat>, a nie wyjątkiem.
- **Applies to**: plan, implement, impl-review
