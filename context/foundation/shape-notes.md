---
project: "Kuchenny Zamiennik"
context_type: greenfield
product_type: web-app
target_scale:
  users: small
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
created: 2026-09-23
updated: 2026-09-23
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "primary persona scope"
      decision: "pojedynczy użytkownik — sam autor projektu, na start"
    - topic: "pain category"
      decision: "brak możliwości — nie istnieje dziś miejsce ze sprawdzonymi zamiennikami i proporcjami"
    - topic: "insight"
      decision: "własna, sprawdzona wiedza o zamiennikach/proporcjach jest dziś rozproszona; wartość to zebranie jej w jednym miejscu wg kategorii dania"
    - topic: "auth strategy"
      decision: "logowanie email+hasło, wykorzystujące istniejący scaffolding startera; płaski model bez ról"
    - topic: "MVP flow"
      decision: "logowanie → dodanie składnik+kategoria → dodanie zamiennika (proporcja, uwagi, opcjonalne oznaczenie 'najlepszy') → wyszukanie po składniku+kategorii z listą zamienników"
    - topic: "timeline"
      decision: "mvp_weeks: 3, mieści się bez skracania zakresu"
  frs_drafted: 7
  quality_check_status: accepted
---

# Shape Notes

Seed idea: narzędzie do zamienników kulinarnych do przepisów. Baza budowana od zera
(składnik + kategoria, np. ciasta / dania mięsne / wegetariańskie). Lista
zarejestrowanych odpowiedników z proporcją zamiany i uwagami (zmiana smaku, barwy).

Otwarte pytanie zgłoszone przez użytkownika (do rozstrzygnięcia w toku sesji, nie
ustalenie z góry): czy na start ograniczyć się do jednokierunkowego dopasowania
składnik → zamienniki, czy od razu uwzględnić różne proporcje w zależności od
kontekstu przygotowania (np. pieczenie vs smażenie).

## Vision & Problem Statement

Osoba gotująca w domu (na start: sam użytkownik/autor projektu), w trakcie
gotowania lub przygotowań do gotowania, gdy brakuje składnika albo trzeba go
zastąpić z powodu diety, alergii lub braku w domu, nie ma dziś żadnego wygodnego
miejsca ze sprawdzonymi zamiennikami wraz z proporcją zamiany. Dziś szuka
rozwiązania w internecie za każdym razem od nowa, ryzykując zepsucie potrawy
przez złą proporcję lub nieoczekiwaną zmianę smaku bądź barwy.

Wiedza o sprawdzonych zamiennikach i ich proporcjach jest dziś rozproszona —
częściowo we własnej pamięci/notatkach, częściowo w niedopasowanych do kontekstu
wynikach wyszukiwania, które nie uwzględniają kategorii dania (np. ciasto vs
danie mięsne) ani efektu ubocznego zamiany. Wartość narzędzia polega na zebraniu
tej wiedzy w jednym, przeszukiwalnym miejscu zorganizowanym według kategorii.

## User & Persona

Pojedynczy użytkownik — na start sam autor projektu, osoba gotująca w domu.
Sięga po narzędzie w momencie przygotowywania posiłku, gdy brakuje składnika lub
trzeba go zastąpić z powodu diety, alergii lub dostępności. Zna się na gotowaniu
na tyle, by samodzielnie budować i uzupełniać bazę zamienników.

## Access Control

Logowanie (email + hasło), oparte na istniejącym mechanizmie auth tego startera
(Supabase). Płaski model użytkownika — brak ról. Każdy zalogowany użytkownik
widzi i edytuje wyłącznie własną bazę składników i zamienników. Niezalogowany
użytkownik trafiający na chronioną trasę jest przekierowywany do logowania.

## Success Criteria

### Primary
- Użytkownik może zarejestrować składnik + kategorię + zamiennik z proporcją,
  uwagami (zmiana smaku/barwy) i opcjonalnym oznaczeniem "najlepszy", a następnie
  odnaleźć go po składniku i kategorii, widząc wyróżniony najlepszy zamiennik.

### Secondary
- Brak dodatkowego elementu nice-to-have na tym etapie — wyszukiwanie po nazwie
  (pierwotnie tu ujęte) zostało w toku Fazy 4 podniesione do must-have (FR-005).

### Guardrails
- Dane jednego użytkownika są w pełni izolowane od danych innych użytkowników —
  wymieszanie lub wyciek cudzej bazy zamienników jest regresem nawet jeśli
  Primary działa.

## Functional Requirements

### Zarządzanie bazą składników i zamienników
- FR-001: Zalogowany użytkownik może dodać składnik, wybierając kategorię z predefiniowanej listy (np. ciasta, dania mięsne, wegetariańskie). Priority: must-have
  > Socrates: Kontrargument rozważony: kategoria na poziomie dania bywa zbyt
  > ogólna, bo ten sam składnik zachowuje się różnie w różnych technikach w
  > obrębie tej samej kategorii. Rozstrzygnięcie: kategoria zostaje na poziomie
  > dania, ale jako zamknięta, predefiniowana lista (nie wolny tekst) — żeby
  > ręczne wpisywanie nie spowalniało budowania bazy. Dokładniejsze podkategorie
  > to rozszerzenie odłożone na później.
- FR-002: Zalogowany użytkownik może dodać do składnika zamiennik z proporcją zamiany i uwagami (np. zmiana smaku, barwy). Priority: must-have
  > Socrates: Kontrargument rozważony: proporcja jako pojedyncza wartość może
  > nie wystarczyć, bo zamiana bywa nieliniowa. Rozstrzygnięcie: ryzyko
  > zaakceptowane na MVP — uproszczona, pojedyncza proporcja zostaje bez zmian.
- FR-003: Zalogowany użytkownik może oznaczyć zamiennik jako "najlepszy" dla danej kategorii. Priority: must-have
  > Socrates: Kontrargument rozważony: najlepszy zamiennik zależy też od
  > kontekstu przygotowania (pieczenie vs smażenie), nie tylko kategorii dania —
  > powiązane z otwartym pytaniem z początku sesji. Rozstrzygnięcie: na MVP
  > zostaje jeden "najlepszy" zamiennik na kategorię; kontekst przygotowania to
  > świadomie odłożone rozszerzenie (patrz Open Questions).
- FR-006: Zalogowany użytkownik może edytować własny wpis składnika lub zamiennika. Priority: must-have
  > Socrates: Kontrargument rozważony: edycja zamiennika oznaczonego jako
  > "najlepszy" mogłaby komplikować logikę, jeśli zmiana proporcji zmienia sens
  > rekomendacji. Rozstrzygnięcie: edycja po prostu nadpisuje wartości pól, bez
  > dodatkowej logiki — oznaczenie "najlepszy" zostaje przy wpisie niezależnie
  > od edytowanych pól.
- FR-007: Zalogowany użytkownik może usunąć własny wpis składnika lub zamiennika; usunięcie składnika kasuje kaskadowo jego zamienniki po potwierdzeniu przez użytkownika. Priority: must-have
  > Socrates: Kontrargument rozważony: usunięcie składnika z przypiętymi
  > zamiennikami wymaga decyzji (kaskadowo czy blokować), a brak potwierdzenia
  > groziłby przypadkową utratą ręcznie zbudowanej bazy — koliduje z guardrail
  > trwałości danych. Rozstrzygnięcie: usunięcie kaskadowe, ale dopiero po
  > jawnym potwierdzeniu przez użytkownika.

### Wyszukiwanie
- FR-004: Zalogowany użytkownik może wyszukać zamienniki po składniku, opcjonalnie zawężając wynik do kategorii, i zobaczyć listę z wyróżnionym najlepszym zamiennikiem. Priority: must-have
  > Socrates: Kontrargument rozważony: wymóg podania obu pól naraz (składnik +
  > kategoria) to zbędne tarcie, a dokładne dopasowanie nazwy nie wybaczy
  > literówki czy liczby mnogiej. Rozstrzygnięcie: kategoria staje się
  > opcjonalnym zawężeniem wyniku, nie wymogiem. Tolerancja literówek/odmiany
  > pozostaje ulepszeniem odłożonym na później.
- FR-005: Zalogowany użytkownik może wyszukiwać/filtrować zarejestrowane składniki po nazwie. Priority: must-have
  > Socrates: Kontrargument rozważony: dubluje się z FR-004, a przy bazie
  > jednego użytkownika na MVP pełne wyszukiwanie może być zbędne na start.
  > Rozstrzygnięcie: mimo to zostaje w zakresie MVP (must-have) — baza może
  > urosnąć szybciej niż zakładano.

## Business Logic

Dla podanego składnika (opcjonalnie zawężonego do kategorii) aplikacja wskazuje
spośród zarejestrowanych zamienników ten oznaczony jako "najlepszy" dla danej
kategorii, wyróżniając go na tle pozostałych.

Regułą operuje na danych wprowadzonych wcześniej przez samego użytkownika:
składnikach, kategoriach i przypisanych do nich zamiennikach z proporcją zamiany
i uwagami. Wyjściem jest uporządkowana lista zamienników dla wyszukiwanego
składnika, z jedną pozycją wyróżnioną jako rekomendowana. Użytkownik trafia na tę
regułę w momencie wyszukiwania (US-01) — to ona odróżnia narzędzie od zwykłej,
płaskiej listy zapisanych par składnik-zamiennik.

Realne przeliczanie ilości (np. "200 g masła → X g oleju kokosowego" na
podstawie zarejestrowanej proporcji) zostało rozważone jako rozszerzenie reguły,
ale świadomie odłożone poza MVP — patrz `## Non-Goals`. Na start proporcja jest
wyłącznie informacją tekstową do ręcznego przeliczenia przez użytkownika.

## Non-Functional Requirements

- Wynik wyszukiwania zamienników pojawia się użytkownikowi odczuwalnie natychmiast
  (poniżej 1 sekundy) — moment użycia to trwające gotowanie, gdzie każda zwłoka
  kosztuje.

## Non-Goals

- **Realne przeliczanie ilości składników wg proporcji.** Proporcja zostaje
  informacją tekstową do ręcznego przeliczenia przez użytkownika; kalkulator
  ilości to świadomie odłożone rozszerzenie (patrz `## Business Logic`).
- **Dzielenie się zamiennikami między użytkownikami / baza społecznościowa.**
  Każdy użytkownik buduje wyłącznie własną, prywatną bazę — brak udostępniania
  czy publicznej listy zamienników na MVP.

## User Stories

### US-01: Zalogowany użytkownik znajduje zamiennik dla składnika w danej kategorii

- **Given** zalogowany użytkownik ma zarejestrowany składnik z co najmniej jednym
  zamiennikiem w wybranej kategorii
- **When** wybiera składnik + kategorię
- **Then** widzi listę zamienników z proporcją i uwagami, a zamiennik oznaczony
  jako "najlepszy" jest wyróżniony wizualnie

#### Acceptance Criteria
- Lista zamienników pokazuje proporcję zamiany i uwagi dla każdej pozycji
- Zamiennik oznaczony jako "najlepszy" w danej kategorii jest wizualnie wyróżniony
- Gdy dla wybranego składnika i kategorii nie ma zarejestrowanych zamienników,
  użytkownik widzi czytelny stan pusty z zachętą do dodania pierwszego zamiennika
  (nie pustą/mylącą listę)
