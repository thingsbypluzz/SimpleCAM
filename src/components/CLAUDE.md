# src/components — modale i komponenty najwyższego poziomu

## Settings Modal (`SettingsModal.tsx`)

- Nakładka `bg-black/50 backdrop-blur-sm`; podgląd 3D wstrzymany
  (`renderPaused`). Fokus/Escape/pułapka Tab — `useModalFocus.ts` (wspólne
  z kalkulatorem).
- Settings Nav w kolejności: **Machine**, **Controller**, **Tabs**,
  **Tool Diameters**, **Appearance**, **Privacy**, **Reset**, **About**
  (zawsze ostatnia); aktywna pozycja z `aria-current`.
- **Machine** — tylko fizyka maszyny: X/Y/Z travel (zapis `onBlur`, tylko
  `> 0`), Spindle Speed + Min/Max RPM w jednym wierszu (Min < Max, Min może
  być 0), Spin-up Dwell [s] (może być 0), Max Feed, Rigidity
  (Light/Medium/Rigid), Router (speed dial) — wybór ustawia Min/Max RPM na
  zakres pokrętła, pod spodem lista pozycji (`config/routers.ts`); przy
  Marlinie podpowiedź, że `S` bywa PWM 0–255. Min/Max RPM, Max Feed,
  Rigidity czyta tylko Feedrate Calculator. Domyślnie
  `DEFAULT_MACHINE_SETTINGS` (5000/5000/1000 mm, bez realnych limitów).
- **Controller** — sterowanie: G-Code Dialect (natychmiast, z opisem, co
  dialekt zmienia w programie) i Start/End G-Code (textarea, commit
  `onBlur`). Sekcja to tylko podział w UI — pola należą do
  `MachineSettings` i zapisują się w `simplecam.machine`, jak **Tabs**.
- **Tabs:** domyślne rozmiary mostków (Default Tab Count — ta sama
  walidacja co w wizardzie). **Tool Diameters:** edytowalna lista (dodaj/
  usuń, sufit `MAX_TOOL_DIAMETER_COUNT`, blokada usunięcia ostatniej, Reset
  to Default z potwierdzeniem; wpisy użytkownika z etykietą `"<wartość>
  mm"`; błąd dodania oznacza pole „New diameter” przez `aria-invalid`,
  poza błędem pełnej listy). **Appearance:** Theme (karty ze swatchami, `aria-pressed`),
  Preview Color Palette, Grid Labels 3D (checkbox + rozmiar).
- **Privacy:** statyczny tekst — brak backendu/kont/trackingu/cookies,
  dane tylko w `localStorage`; jawnie ujawniony jedyny wyjątek: arkusz
  Google Fonts (Space Grotesk dla Arcade) wysyła standardowe dane żądania
  (w tym IP) do Google. Deklaracja GDPR nie twierdzi zerowego przesyłu bez
  tego zastrzeżenia.
- **Reset:** "Reset All Settings to Defaults" (czerwony, tokeny
  `status-delete-*`, `window.confirm()`) czyści wszystkie klucze
  `simplecam.*`: Appearance, Tool Diameters, Machine, pamięć Feedrate
  Calculator i wszystkie sloty presetów łącznie z `"0"`
  (`clearAllSlots()`); nie rusza bieżących parametrów wizarda.
- **About:** nazwa, wersja (`__APP_VERSION__` z `package.json` przez
  `define` w `vite.config.ts`), "Envisioned by ThingsByPluzz".
- Pola liczbowe przez `NumberInput`, ale własny wzorzec commitu (bufor
  tekstu + `onBlur`, klik strzałki commituje od razu —
  `commitField()`/`handleAdjust()`), bo to zapis do `localStorage`, nie
  live Preview. Bufory ponownie inicjowane z `machine`, gdy obiekt zostanie
  podmieniony z zewnątrz (np. Reset przy otwartym modalu) — „adjust state
  while rendering”, nie efekt.

## Feedrate Calculator (`FeedCalculatorModal.tsx`)

- Otwierany Icon Buttonem (`CalculatorIcon`) na końcu wiersza Feedrate XY
  w Kroku 3. Wzorzec Settings Modal (blur, `renderPaused`,
  `useModalFocus()`).
- Wejścia: Method (`OPERATION_META[op].calcMethods()` — ta sama lista co w
  Kroku 2), materiał (`config/materials.ts`, 10 wpisów z notą), średnica
  freza (Drop-down z listy Settings → Tool Diameters,
  `resolveToolDiameterSelectOptions()`), liczba ostrzy, Carbide/HSS, fz (z
  tabeli × sztywność albo wpisane, „Use table” wraca), podsumowanie limitów
  maszyny.
- Wyniki „bieżąca → sugerowana” z checkboxami (domyślnie wszystkie):
  Spindle Speed (globalne), Feedrate XY, Plunge Rate, Stepdown, Stepover %
  albo Optimal Load % (brak dla szczeliny), Linking Feed (Adaptive), Stock
  to Leave i Finish Feed (tylko Pocket z Finishing Pass; Finish Feed
  liczony dla Stock to Leave w mocy — sugerowanego, gdy zaznaczony).
  Ostrzeżenia (docięcia RPM/posuwu), rozwijane „How it's calculated” z
  wartościami pośrednimi i „Material table”. Router z pokrętłem: pozycje
  tylko do odczytu, najbliższa RPM wyróżniona (`nearestDialPosition()`).
  Model — `lib/CLAUDE.md`. Błędne wejścia (średnica, Flutes — także
  wpisana, jeszcze niezatwierdzona liczba — chip load) z `aria-invalid`,
  jak w wizardzie.
- **Apply selected** (`handleApplyFeedCalc()` w `App.tsx`): metoda i
  średnica zawsze (kontekst wyliczenia), szerokość/Linking Feed przez
  `OPERATION_META[op].withCalc()` (Pocket także Stock to Leave i Finish
  Feed), posuwy i Stepdown do `feeds`, RPM
  nadpisuje `machine.spindleSpeed`. Dla Adaptive zapis Feed XY ustawia też
  `pocket.chipThinningBaseFeed` na posuw bez kompensacji. Kroki 2 i 3
  przemontowują się (`paramsLoadGeneration`).

## Inne

- `ErrorBoundary.tsx` — owija `<App />` (`main.tsx`); zamiast białego
  ekranu "Reload" i "Reset saved state" (usuwa klucze `simplecam.*` —
  auto-save `"0"` wczytuje się przy każdym starcie, więc błąd z zapisu
  powtarzałby się w nieskończoność).
- `icons.tsx` — własne ikony SVG; legenda w Artifakcie Interface Anatomy.
  Ikony kształtów Pocket: granica + cieńsza spirala CCW (kwadratowa dla
  Rectangle z kropką originu, Archimedesa dla Circle).
