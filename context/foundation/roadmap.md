---
project: "Kuchenny Zamiennik"
version: 1
status: draft
created: 2026-10-02
updated: 2026-10-09
prd_version: 1
main_goal: low-complexity
top_blocker: time
milestone_id: mvp-substitute-database
milestone_seq: 1
milestone_status: open
---

# Roadmap: Kuchenny Zamiennik

> Derived from `context/foundation/prd.md` (v1) + `tech-stack.md` + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Milestone

**M-01: MVP bazy zamienników** — Status: open

- **Intent:** Zalogowany użytkownik buduje własną, prywatną bazę składników i zamienników (z proporcją i uwagami), wyszukuje w niej i widzi wyróżniony najlepszy zamiennik — z pełną izolacją danych między użytkownikami.
- **Source materials:** `context/foundation/prd.md` (v1)
- **Done when:** every F-NN and S-NN below is `done`.
- **Scope anchors:** FR-001…FR-007, US-01, NFR (wynik wyszukiwania < 1 s), sekcja Access Control, guardrail izolacji danych.

## Vision recap

Osoba gotująca w domu (na start autor projektu) nie ma wygodnego miejsca ze sprawdzonymi zamiennikami składników i ich proporcjami; dziś szuka w internecie za każdym razem od nowa, ryzykując zepsucie potrawy. Narzędzie zbiera tę wiedzę w jednym, przeszukiwalnym miejscu zorganizowanym według kategorii dania.

## North star

**S-01: Użytkownik dodaje składnik z zamiennikiem i odnajduje go na liście dla składnika i kategorii** — to najmniejszy przepływ end-to-end z kryterium Primary z PRD (zapis → odnalezienie), a przy `low-complexity` jego dostarczenie jako pierwsze weryfikuje, że produkt ma sens.

> „North star" = najmniejsza historyjka end-to-end, której dostarczenie dowodzi głównej tezy produktu; stoi najwcześniej, jak pozwalają zależności, bo reszta ma znaczenie tylko wtedy, gdy ona działa. Kryterium Primary w pełni domykają S-01 + S-02 (wyróżnienie „najlepszego") + S-03 (wyszukiwanie po nazwie).

## At a glance

| ID   | Change ID                  | Outcome (user can …)                                                                           | Prerequisites | PRD refs                 | Status   |
| ---- | -------------------------- | ---------------------------------------------------------------------------------------------- | ------------- | ------------------------ | -------- |
| S-01 | first-substitute-lookup    | dodać składnik z kategorią i zamiennik z proporcją/uwagami i zobaczyć go na liście dla składnika + kategorii | —             | FR-001, FR-002, US-01    | done |
| S-02 | best-substitute-highlight  | oznaczyć zamiennik jako „najlepszy" w kategorii i zobaczyć go wyróżnionego na liście           | S-01          | FR-003, US-01            | proposed |
| S-03 | ingredient-name-search     | wyszukać zamienniki po nazwie składnika, opcjonalnie zawężając do kategorii                    | S-01          | FR-004, FR-005, US-01    | proposed |
| S-04 | edit-entries               | edytować własny wpis składnika lub zamiennika                                                  | S-01          | FR-006                   | proposed |
| S-05 | delete-entries-confirmed   | usunąć własny wpis składnika lub zamiennika (kaskadowo, po potwierdzeniu)                      | S-01          | FR-007                   | proposed |

## Baseline

What's already in place in the codebase as of `2026-10-02` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them.

- **Frontend:** present — Astro + React + Tailwind, komponenty auth w `src/components/auth/`, layout w `src/layouts/Layout.astro`.
- **Backend / API:** partial — tylko `src/pages/api/auth/{signin,signup,signout}.ts`; brak endpointów domenowych.
- **Data:** absent — `supabase/config.toml` istnieje, ale brak `supabase/migrations/` i jakichkolwiek tabel.
- **Auth:** present — Supabase SSR (`src/lib/supabase.ts`), `src/middleware.ts` z `PROTECTED_ROUTES`, strony `/auth/*` i `/dashboard`.
- **Deploy / infra:** present — Cloudflare Workers (`wrangler.jsonc`), CI w `.github/workflows/ci.yml`, pierwszy deploy wykonany.
- **Observability:** absent — brak logowania/śledzenia błędów; PRD tego nie wymaga (Parked).

## Foundations

Brak. Jedyna brakująca warstwa wymagana przez PRD (dane + RLS) wchodzi do S-01, bo to pierwsza historyjka, która jej potrzebuje — osobna fundacja „warstwa danych" byłaby poziomym dryfem (zasada stopniowego wprowadzania elementów technicznych). Auth i deploy są obecne w baseline.

## Slices

### S-01: Pierwsze odnalezienie zamiennika (north star)

- **Outcome:** user can dodać składnik z kategorią z predefiniowanej listy i zamiennik z proporcją i uwagami, a następnie wybrać składnik + kategorię i zobaczyć listę zamienników (z czytelnym stanem pustym).
- **Change ID:** first-substitute-lookup
- **PRD refs:** FR-001, FR-002, US-01; Access Control i guardrail izolacji danych (dane widoczne tylko dla właściciela); NFR < 1 s dla wyniku listy.
- **Prerequisites:** — (auth obecny w baseline)
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Jaka dokładnie jest predefiniowana lista kategorii (PRD podaje tylko przykłady: ciasta, dania mięsne, wegetariańskie)? — Owner: user. Block: no.
- **Risk:** Wnosi całą nową warstwę danych razem z izolacją użytkowników; błąd w polityce izolacji łamie guardrail z PRD nawet gdy przepływ działa — dlatego izolację weryfikować w tej samej historyjce, nie odkładać.
- **Status:** done

### S-02: Wyróżniony najlepszy zamiennik

- **Outcome:** user can oznaczyć zamiennik jako „najlepszy" w danej kategorii i zobaczyć go wizualnie wyróżnionego na liście.
- **Change ID:** best-substitute-highlight
- **PRD refs:** FR-003, US-01 (kryterium akceptacji: wyróżnienie najlepszego), Business Logic
- **Prerequisites:** S-01
- **Parallel with:** S-03, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** To reguła biznesowa odróżniająca narzędzie od płaskiej listy; sekwencjonowana zaraz po S-01, żeby kryterium Primary zostało domknięte jak najwcześniej. Jeden „najlepszy" na kategorię — kontekst przygotowania świadomie poza MVP.
- **Status:** proposed

### S-03: Wyszukiwanie po nazwie składnika

- **Outcome:** user can wyszukać zamienniki po nazwie składnika, opcjonalnie zawężając wynik do kategorii, i zobaczyć listę.
- **Change ID:** ingredient-name-search
- **PRD refs:** FR-004, FR-005, US-01, NFR (< 1 s)
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-04, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Dwa wymagania (FR-004/FR-005) dublują się — planować jako jedno wyszukiwanie; tolerancja literówek jest poza MVP.
- **Status:** proposed

### S-04: Edycja wpisów

- **Outcome:** user can edytować własny wpis składnika lub zamiennika (nadpisanie pól; oznaczenie „najlepszy" zostaje przy wpisie).
- **Change ID:** edit-entries
- **PRD refs:** FR-006
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-05
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Niskie; edycja bez dodatkowej logiki. Dotyka tych samych widoków co S-02, więc przy równoległej realizacji możliwe konflikty merge.
- **Status:** proposed

### S-05: Usuwanie wpisów z potwierdzeniem

- **Outcome:** user can usunąć własny wpis składnika lub zamiennika; usunięcie składnika kasuje kaskadowo jego zamienniki po jawnym potwierdzeniu.
- **Change ID:** delete-entries-confirmed
- **PRD refs:** FR-007
- **Prerequisites:** S-01
- **Parallel with:** S-02, S-03, S-04
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Utrata ręcznie zbudowanej bazy przy braku potwierdzenia — potwierdzenie jest częścią wymagania, nie ozdobą.
- **Status:** proposed

## Backlog Handoff

| Roadmap ID | Change ID                 | Suggested issue title                                                  | Ready for `/10x-plan` | Notes                                  |
| ---------- | ------------------------- | ---------------------------------------------------------------------- | --------------------- | -------------------------------------- |
| S-01       | first-substitute-lookup   | Dodawanie składnika i zamiennika oraz lista zamienników (z RLS)        | yes                   | Run `/10x-plan first-substitute-lookup` |
| S-02       | best-substitute-highlight | Oznaczanie i wyróżnianie najlepszego zamiennika                        | no                    | Czeka na S-01                          |
| S-03       | ingredient-name-search    | Wyszukiwanie zamienników po nazwie składnika (+ filtr kategorii)       | no                    | Czeka na S-01                          |
| S-04       | edit-entries              | Edycja składników i zamienników                                        | no                    | Czeka na S-01                          |
| S-05       | delete-entries-confirmed  | Usuwanie składników i zamienników z potwierdzeniem                     | no                    | Czeka na S-01                          |

## Open Roadmap Questions

1. **Czy i jak uwzględnić kontekst przygotowania (np. pieczenie vs smażenie) przy wskazywaniu „najlepszego" zamiennika w danej kategorii?** — Owner: user. Block: — (po MVP, bez sztywnej daty; nie blokuje żadnej historyjki).
2. **Jaka jest finalna, predefiniowana lista kategorii dań?** — Owner: user. Block: — (S-01 może ruszyć z przykładami z PRD i zmienić listę później).

## Parked

- **Realne przeliczanie ilości wg proporcji** — Why parked: PRD §Non-Goals; proporcja to tekst do ręcznego przeliczenia.
- **Dzielenie się zamiennikami / baza społecznościowa** — Why parked: PRD §Non-Goals; baza prywatna per użytkownik.
- **Kontekst przygotowania dla „najlepszego" zamiennika** — Why parked: PRD §Open Questions / FR-003; jeden „najlepszy" na kategorię na MVP.
- **Tolerancja literówek i odmiany w wyszukiwaniu** — Why parked: PRD FR-004; ulepszenie po MVP.
- **Podkategorie dań i nieliniowe proporcje** — Why parked: PRD FR-001 / FR-002; świadomie uproszczone na MVP.
- **Observability (logowanie, śledzenie błędów)** — Why parked: PRD tego nie wymaga; cel `low-complexity`.

## Milestone History

(Pusta — pierwszy milestone.)

## Done

- **S-01: user can dodać składnik z kategorią z predefiniowanej listy i zamiennik z proporcją i uwagami, a następnie wybrać składnik + kategorię i zobaczyć listę zamienników (z czytelnym stanem pustym).** — Archived 2026-10-09 → `context/archive/2026-10-04-first-substitute-lookup/`. Lesson: —.
