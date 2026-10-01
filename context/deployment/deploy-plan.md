# Plan pierwszego wdrożenia: Cloudflare Workers (kuchenny-zamiennik)

## Context

`infrastructure.md` wskazuje Cloudflare Workers (static assets) jako platformę MVP. `tech-stack.md` jest zgodny (`deployment_target: cloudflare-workers`). Adapter `@astrojs/cloudflare` 14.3 obsługuje wyłącznie Workers, więc deploy robimy przez `wrangler deploy`, nigdy `wrangler pages deploy`.

Stan wyjściowy (zweryfikowany):
- `wrangler whoami`: **niezalogowany**.
- `wrangler.jsonc`: `name: "10x-astro-starter"`, `workers_dev: false`, `preview_urls: false`, `observability` wyłączone. Po deployu nie byłoby żadnego publicznego URL ani logów.
- Supabase: tylko lokalny (`supabase/config.toml`, brak migracji). Brak projektu chmurowego, więc brak wartości `SUPABASE_URL` / `SUPABASE_KEY` dla produkcji.
- `SUPABASE_*` są `optional` w schemacie env, więc bez sekretów aplikacja po cichu dostanie `null` i przekieruje wszystko na sign-in (ryzyko z pre-mortem).
- CI (`ci.yml`) deployuje każdy push do `main` bez bramki. Remote: `rszymanski1966/Roman1`.
- Repo ma niezacommitowane pliki (`context/`, `.agents/`, `AGENTS.md` itd.). Nie wpływają na build.

## Kroki

### A. Bramki ręczne (robi użytkownik)
1. `! npx wrangler login` (interaktywne, w tej sesji).
2. Utworzyć projekt Supabase w chmurze w regionie UE (np. Frankfurt), blisko użytkowników (ryzyko opóźnień edge↔DB). Skopiować Project URL i `anon` key (Settings → API).
3. W Supabase: Authentication → Email → decyzja o "Confirm email" (wpływa na smoke test signup/signin).
4. Utworzyć token API Cloudflare ograniczony do Workers tego konta (bez DNS/billing) → później do sekretów GitHub.

### B. Zmiany w repo (agent, po zatwierdzeniu planu)
1. `wrangler.jsonc`:
   - `observability.enabled: true` (i `logs.enabled: true`), żeby działał `wrangler tail`.
   - `workers_dev: true`, aby pierwszy deploy dostał URL `*.workers.dev` (potrzebny do weryfikacji). `preview_urls` zostaje `false` (podgląd odsłaniałby aplikację z Supabase; decyzja odłożona).
   - `name`: zmiana na `kuchenny-zamiennik` (zgodnie z projektem). Zmiana nazwy tworzy nowego Workera, więc robimy ją przed pierwszym deployem.
2. `tech-stack.md`: bez zmian (już `cloudflare-workers`). Poprawka sugerowana w `infrastructure.md` jest już spełniona.
3. `README.md`/`ci.yml`: bez zmian w tym kroku. Bramkę manualną na deploy w CI rozważamy osobno (nie w zakresie pierwszego wdrożenia).

### C. Sekrety i build
1. `npx astro sync` → `npm run lint` → `npm run build` (lokalna weryfikacja; do builda potrzebne `SUPABASE_*` w `.env`/`.dev.vars`).
2. Sekrety runtime (przed pierwszym deployem, wartości wpisuje użytkownik, nie trafiają do rozmowy):
   - `npx wrangler secret put SUPABASE_URL`
   - `npx wrangler secret put SUPABASE_KEY`
   Uwaga: `wrangler secret put` wymaga istniejącego Workera. Jeśli zawiedzie, kolejność to `wrangler deploy` → `secret put` → ponowny deploy (lub `wrangler versions secret put`). Plan zakłada tę drugą ścieżkę awaryjną.

### D. Deploy
- `npm run build && npx wrangler deploy` (komenda Workers; nie Pages).
- Przejrzeć wyjście pod kątem automatycznie utworzonych zasobów (KV `SESSION`, binding obrazów). W razie potrzeby skonfigurować jawnie / ustawić image service na `compile`.
- Wcześniejsza walidacja bez mutacji: `npx wrangler deploy --dry-run`.

### E. Weryfikacja
1. `BASE_URL=https://kuchenny-zamiennik.<subdomena>.workers.dev npm run smoke` (home, redirect auth, signup/signin).
2. Ręcznie: `/auth/signin` ładuje się, `/dashboard` bez sesji przekierowuje, po zalogowaniu działa (potwierdza obecność sekretów).
3. `npx wrangler tail` podczas żądań: sprawdzić błędy CPU limit (Free: 10 ms) i brakujące sekrety.
4. Pomiar opóźnienia strony z zapytaniem do Supabase (cel PRD: wyszukiwanie < 1 s). Jeśli błędy CPU → Workers Paid ($5/mies.).

### F. Przekazanie do CI
1. Dodać sekrety GitHub: `SUPABASE_URL`, `SUPABASE_KEY` (build), `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` (deploy). Dopiero potem push do `main`, bo CI deployuje automatycznie.
2. Wypchnąć zmiany (commit conventional, np. `chore(deploy): configure Workers observability and name`) — tylko na wyraźną prośbę.

### G. Artefakt
Po zatwierdzeniu zapisać ten plan jako `context/deployment/deploy-plan.md` (ścieżka spoza `context/archive/`, więc dozwolona) wraz z wynikiem wdrożenia (URL, wersja, przegląd sekretów).

## Granice bezpieczeństwa
- Agent wykonuje: `wrangler deploy`, `--dry-run`, `rollback`, `tail`, build/lint/smoke.
- Tylko człowiek: `wrangler login`, tworzenie projektu Supabase i tokenu, wpisywanie sekretów, kasowanie Workera, reset bazy, rotacja klucza.
- Rollback: `npx wrangler rollback` (kod tylko, nie schemat; brak migracji w MVP-start).

## Pytania otwarte przed wykonaniem
1. Zmienić nazwę Workera na `kuchenny-zamiennik`? (zalecane)
2. Włączyć `workers_dev: true` dla pierwszego URL? (zalecane)
3. Czy projekt Supabase w chmurze już istnieje, czy mam poczekać na jego utworzenie?

---

## Wynik wdrożenia (2026-10-01)

**Status:** pierwsze wdrożenie wykonane, smoke test 8/8 na produkcji.

| Pozycja | Wartość |
|---|---|
| Platforma | Cloudflare Workers (static assets), `wrangler deploy` |
| Worker | `kuchenny-zamiennik` |
| URL | https://kuchenny-zamiennik.rszymanski.workers.dev |
| Konto | `13bc9c84bd76667d8a7e8dfc5ae26f9c` |
| Pierwsza wersja | `fe090076-fd49-4611-8883-62fc43969d53` |
| Wersje po poprawkach sekretów | `7e2e0e4a-…`, `851d656d-…` (Secret Change), aktualna `de7ea526-7bac-41dc-a5ee-0c8978ad287c` |
| wrangler | 4.145.0 |
| Start Workera | 16 ms |

### Zmiany w repo
- `wrangler.jsonc`: `name` → `kuchenny-zamiennik`, `observability` + `logs` włączone, `workers_dev: true`, `preview_urls: false`.
- `scripts/smoke.mjs`: domena e-maila z `SMOKE_EMAIL_DOMAIN` (domyślnie `mailinator.com`), bo hostowany Supabase odrzuca `example.com`.
- `package.json` / lockfile: wrangler `^4.145.0`.

### Zasoby utworzone automatycznie przez adapter
- KV `kuchenny-zamiennik-session` (binding `SESSION`), id `754f1164e8254b64a609e1f7322da5f0`.
- Binding `IMAGES` (Images), `ASSETS`.

### Sekrety
- Runtime (Cloudflare): `SUPABASE_URL`, `SUPABASE_KEY` ustawione ręcznie przez `wrangler secret put`.
- GitHub Actions: ustawione później (zob. „Aktualizacja po pierwszym wdrożeniu"): `SUPABASE_URL`, `SUPABASE_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

### Napotkane problemy
1. `wrangler login` (OAuth) kończył się `spawn UNKNOWN`, a potem timeoutem; `--browser=false` z ręcznym otwarciem linku zadziałało.
2. Smoke: `Invalid path specified in request URL`. Sekret `SUPABASE_URL` miał zły kształt; po ponownym wpisaniu zgodnie z `.dev.vars` błąd zniknął.
3. Smoke: `Email address ... is invalid`. Hostowany Supabase odrzuca domenę `example.com`; zmieniono domenę testową. W Supabase wyłączono „Confirm email".
4. Ostrzeżenie builda: sitemap wymaga opcji `site` w `astro.config.mjs` (załatwione, zob. niżej).

### Otwarte punkty
- Decyzja o ręcznej bramce deployu w CI i o `preview_urls`: **świadomie odłożona** (zob. niżej).
- „Confirm email" w Supabase wyłączone: włączyć przed dopuszczeniem obcych użytkowników.
- Konta testowe `smoke-*@mailinator.com`: każde `npm run smoke` na produkcji dodaje nowe, czyścić ręcznie (Supabase → Authentication → Users).
- Rollback: `npx wrangler rollback` (tylko kod, nie schemat).

---

## Aktualizacja po pierwszym wdrożeniu (2026-10-01)

| Punkt | Stan |
|---|---|
| Sekrety GitHub dla CI | **Zrobione.** Ustawione 4 sekrety. Token Cloudflare ograniczony do jednego konta (Workers Scripts: Edit, Workers KV Storage: Edit). |
| Pierwszy deploy przez CI | **Zrobione.** Push na `main` uruchomił CI (install → `astro sync` → lint → build → deploy). Wersja `adc527be-823d-480c-91a7-91642f946482`. |
| Smoke test po deployu z CI | **Zrobione.** 8/8 PASS na produkcji. |
| Pomiar CPU i opóźnień (`wrangler tail`) | **Zrobione.** 7 żądań (home, signin, POST signin, dashboard, POST signout), wszystkie `Ok`, brak błędów CPU limit. Przy założeniu kilku użytkowników uznane za wystarczające. Dokładne czasy: panel Cloudflare → Metrics. |
| Konta testowe w bazie produkcyjnej | **Zrobione.** Konta `smoke-*@mailinator.com` usunięte ręcznie. |
| Opcja `site` w `astro.config.mjs` | **Zrobione.** `site: "https://kuchenny-zamiennik.rszymanski.workers.dev"`, build tworzy `sitemap-index.xml`. Po zakupie własnej domeny podmienić. |
| Dokumenty `context/` i `AGENTS.md` | **Zrobione.** Zacommitowane. |

### Decyzje odłożone (świadomie)
- **Ręczna bramka deployu w CI** oraz **`preview_urls`** zostają bez zmian (auto-deploy z `main`, `preview_urls: false`). Uzasadnienie: jeden developer, kilku użytkowników, CI robi lint i build przed deployem, a wersję można cofnąć przez `wrangler rollback`.
  **Wrócić do decyzji, gdy:** pojawi się drugi developer, realni użytkownicy poza testowymi albo potrzeba pokazywania zmian przed scaleniem.
- **„Confirm email"** pozostaje wyłączone na potrzeby smoke testu. Włączyć przed dopuszczeniem obcych użytkowników (wtedy smoke test signup/signin wymaga zmiany).
- **Wzrost zakresu aplikacji** (cięższe operacje po stronie serwera): ponownie sprawdzić CPU w Metrics.
