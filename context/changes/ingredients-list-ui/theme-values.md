# Wartości motywu kitchen — ingredients-list-ui

> Dowód Fazy 2 planu (`plan.md`). Wartości żyją w `src/styles/global.css` (`:root`); ten plik zapisuje ich źródło i zmierzony kontrast.

## Źródło

- **Paleta:** Tailwind CSS 4.3.3, `node_modules/tailwindcss/theme.css` (kroki `stone`, `orange`, `green`, `red`). Wartości przepisane 1:1, w zapisie `oklch(0.x …)` zgodnym z resztą `global.css` (np. `55.3%` → `0.553`).
- **Motyw:** dzisiejsze literały widoku `src/pages/ingredients/index.astro` (`text-stone-900`, `text-stone-600/700`, `border-stone-200/300`, `bg-orange-600`, `text-orange-700`, `bg-orange-50`, `focus:ring-orange-400`, `text-green-800`, `text-red-700`). Zmiana świadoma: główna akcja przechodzi z `orange-600` (biały tekst ok. 3,6:1) na `orange-700`.
- **Gradient:** hexy z dotychczasowego `@utility bg-kitchen`, bez zmian wartości.

## Tokeny (`:root`)

| Token | Krok palety | Wartość |
|---|---|---|
| `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground` | stone-900 | `oklch(0.216 0.006 56.043)` |
| `--muted-foreground` | stone-600 | `oklch(0.444 0.011 73.639)` |
| `--muted`, `--secondary` | stone-100 | `oklch(0.97 0.001 106.424)` |
| `--border` | stone-200 | `oklch(0.923 0.003 48.717)` |
| `--input` | stone-300 | `oklch(0.869 0.005 56.366)` |
| `--primary` | orange-700 | `oklch(0.553 0.195 38.402)` |
| `--primary-foreground` | bez zmian | `oklch(0.985 0 0)` |
| `--accent` | orange-50 | `oklch(0.98 0.016 73.684)` |
| `--accent-foreground` | orange-700 | `oklch(0.553 0.195 38.402)` |
| `--ring` | orange-600 ¹ | `oklch(0.646 0.222 41.116)` |
| `--success` | green-800 ¹ | `oklch(0.448 0.119 151.328)` |
| `--success-foreground` | — | `oklch(0.985 0 0)` |
| `--background`, `--card`, `--popover` | bez zmian | `oklch(1 0 0)` |
| `--destructive` | red-700 ¹ | `oklch(0.505 0.213 27.518)` |
| `--radius` | bez zmian | `0.625rem` |
| `--kitchen-from` | — | `#fffbeb` |
| `--kitchen-via` | — | `#fff7ed` |
| `--kitchen-to` | — | `#fef3c7` |

¹ Odchylenie od mapowania z planu (`--ring` orange-500, `--success` green-700, `--destructive` bez zmian), zatwierdzone przez użytkownika 2026-10-20. Mapowanie z planu nie spełniało AA (tabela „Mapowanie z planu (odrzucone)” niżej).

`chart-*` i `sidebar-*` bez zmian (nieużywane). `@theme inline` dostał `--color-success` i `--color-success-foreground` jako `var(--…)`.

`.dark`: dopisana para `--success: oklch(0.723 0.219 149.579)` (≈ green-500) i `--success-foreground: oklch(0.205 0 0)`. To wartości **tymczasowe, niestrojone i niezmierzone** — tryb ciemny jest odłożony (plan, „What We're NOT Doing”).

## Kontrast

Metoda: oklch → OKLab → liniowe sRGB (przycięte do gamutu) → luminancja względna → stosunek WCAG 2.x. `card` = biały. Pary `/10` liczone jako kolor z kryciem 10% nałożony na `card` w sRGB (tak składa przeglądarka). Skrypt jednorazowy, poza repo. Odpowiedniki hex: orange-700 `#ca3500`, orange-600 `#f54900`, stone-900 `#1c1917`, stone-600 `#57534d`, green-800 `#016630`, red-700 `#c10007`.

### Wartości przyjęte

| Para | Kontrast | Próg | Wynik |
|---|---|---|---|
| `primary-foreground` na `primary` | 5,01:1 | 4,5:1 | ✅ AA |
| `foreground` na `card` | 17,49:1 | 4,5:1 | ✅ AAA |
| `muted-foreground` na `card` | 7,64:1 | 4,5:1 | ✅ AAA |
| `success` na `success/10` | 6,07:1 | 4,5:1 | ✅ AA |
| `success-foreground` na `success` | 6,79:1 | 4,5:1 | ✅ AA |
| `destructive` na `destructive/10` | 5,33:1 | 4,5:1 | ✅ AA |
| biały na `destructive` | 6,42:1 | 4,5:1 | ✅ AA |
| `ring` na `card` | 3,59:1 | 3:1 | ✅ WCAG 1.4.11 |
| `ring` na `--kitchen-to` (najciemniejszy punkt gradientu) | 3,23:1 | 3:1 | ✅ WCAG 1.4.11 |

### Mapowanie z planu (odrzucone)

| Para | Kontrast | Próg | Wynik |
|---|---|---|---|
| `success` (green-700) na `success/10` | 4,31:1 | 4,5:1 | ❌ |
| `destructive` (`oklch(0.577 0.245 27.325)`) na `destructive/10` | 3,99:1 | 4,5:1 | ❌ |
| `ring` (orange-500) na `card` | 2,89:1 | 3:1 | ❌ |

### Otwarte punkty

- **Bazowy obrys `outline-ring/50`** (`global.css`, `@layer base`): przy 50% kryciu wskaźnik ma mniej niż 3:1. Faza 4 daje kontrolkom widoku pełne krycie `ring` na `focus-visible`. Pozostałe strony (poza zakresem) zostają z obrysem `/50`.
