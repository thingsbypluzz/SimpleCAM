# src/components — modale i komponenty najwyższego poziomu

## Settings Modal (`SettingsModal.tsx`)

- Okno 920×640 px. Nakładka `bg-black/50 backdrop-blur-sm`; podgląd 3D wstrzymany
  (`renderPaused`). Fokus/Escape/pułapka Tab — `useModalFocus.ts` (wspólne
  z kalkulatorem).
- Settings Nav w kolejności: **Machine**, **Controller**, **Tabs**,
  **Tool Diameters**, **Feed Tables**, **Templates**, **Appearance**,
  **Privacy**, **Reset**, **About**
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
  Preview Color Palette, Cut Shape (checkbox — materiał w podglądach w kształcie
  po frezie, `cutShapeEnabled`), Stock Edges 3D (checkbox — obrys krawędzi materiału),
  Grid Labels 3D (checkbox + rozmiar).
- **Templates:** gotowe projekty wbudowane w aplikację
  (`PROJECT_TEMPLATES` w `src/templates/index.ts`). Każdy to zwykły plik
  projektu obok tego modułu, importowany jako tekst (`?raw`) i czytany tym
  samym parserem co plik wczytany z dysku (`templateSlots()`). Karta
  szablonu: nazwa, opis, lista presetów (`presetLabel()`) i **Load** →
  `onLoadTemplate` → `handleLoadTemplate()` w `App.tsx`: to samo co Load
  project (`applyProject()` — potwierdzenie przy zajętych slotach, Overlay
  dla wczytanych presetów, nazwa szablonu jako nazwa projektu), po czym
  Settings się zamyka. Tekst sekcji mówi wprost, że to przykłady do
  obejrzenia i przerobienia, nie programy na maszynę. Nowy szablon:
  zapisać projekt w aplikacji, wrzucić plik do `src/templates/`, dopisać
  wpis do `PROJECT_TEMPLATES` (`title` = nazwa projektu w pliku);
  `templates.test.ts` pilnuje, że każdy szablon się wczytuje, jego presety
  przechodzą walidację i generują G-code.
- **Feed Tables:** tabele Feedrate Calculator tylko do odczytu
  (`FeedTables.tsx`): `MaterialTable` (ten sam komponent co sekcja
  „Material table” w kalkulatorze — tam surowa tabela z wyróżnionym
  wybranym materiałem; tutaj z przełącznikiem Rigidity, który tylko
  zmienia widok: kolumny skalowane przez sztywność — fz, Stepdown dla
  szczeliny i stepover, Ramp Angle — są przeliczone i oznaczone ‡,
  domyślnie dla sztywności z Machine, oznaczonej ✓), `MaterialNotes` (noty wszystkich materiałów) i
  `RouterTable` (RPM na każdą pozycję pokrętła, wyróżniony router z
  Machine, gwiazdka przy wartościach rozłożonych równomiernie).
- **Privacy:** statyczny tekst — brak backendu/kont/trackingu/cookies,
  dane tylko w `localStorage`; jawnie ujawniony jedyny wyjątek: arkusz
  Google Fonts (Space Grotesk dla Arcade) wysyła standardowe dane żądania
  (w tym IP) do Google. Deklaracja GDPR nie twierdzi zerowego przesyłu bez
  tego zastrzeżenia.
- **Reset:** "Reset All Settings to Defaults" (czerwony, tokeny
  `status-delete-*`, `window.confirm()`) czyści wszystkie klucze
  `simplecam.*`: Appearance, Tool Diameters, Machine, pamięć Feedrate
  Calculator, nazwę projektu i wszystkie sloty presetów łącznie z `"0"`
  (`clearAllSlots()`); nie rusza bieżących parametrów wizarda.
- **About:** nazwa, wersja (`__APP_VERSION__` z `package.json` przez
  `define` w `vite.config.ts`), "Envisioned by ThingsByPluzz" z linkiem do
  Instagrama (`@thingsbypluzz`, nowa karta, `rel="noopener noreferrer"`;
  zwykły link — nic nie jest pobierane z Instagrama przed kliknięciem).
  Blok **Fonts**: fonty operacji Text z `TEXT_FONTS` — tytuł, autorzy,
  licencja (link do pliku w `public/licenses/`) i źródło; wymóg licencji
  otwartych fontów.
- Pola liczbowe przez `NumberInput`, ale własny wzorzec commitu (bufor
  tekstu + `onBlur`, klik strzałki commituje od razu —
  `commitField()`/`handleAdjust()`), bo to zapis do `localStorage`, nie
  live Preview. Bufory ponownie inicjowane z `machine`, gdy obiekt zostanie
  podmieniony z zewnątrz (np. Reset przy otwartym modalu) — „adjust state
  while rendering”, nie efekt.

## Projekt (`ProjectNameModal.tsx`, Header w `App.tsx`)

- Grupa na prawo od ramki presetów (poza nią), w kolejności: ramka z
  nazwą projektu, **Load project** (`OpenFileIcon`) — klika ukryty
  `<input type="file">` (wartość czyszczona po wyborze, żeby ten sam plik
  dało się wczytać ponownie), **Save project** (`SaveFileIcon`;
  nieaktywny bez presetów) — otwiera `ProjectNameModal`: pole nazwy z
  podpowiedzianą nazwą bieżącego projektu, podgląd nazwy pliku, Enter
  zapisuje, Escape zamyka (`useModalFocus`).
- Błąd pliku — `window.alert()` z `PROJECT_ERROR_MESSAGE`; zastąpienie
  zajętych slotów — `window.confirm()`.
- Ramka z nazwą: tokeny `--edit`, `max-w-40` z obcięciem, pełna nazwa w
  `title`; zmiany od ostatniego Save/Load — kropka + tekst `sr-only`
  „unsaved changes” (stan nie tylko kolorem).
- Otwarty modal pauzuje render 3D (`renderPaused`).

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
  liczony dla Stock to Leave w mocy — sugerowanego, gdy zaznaczony),
  Ramp Angle (tylko gdy wybrana metoda schodzi po helixie albo rampie;
  liczony dla Stepdown w mocy, z notką, gdy podniesiony z powodu krótkiej
  ścieżki).
  Ostrzeżenia (docięcia RPM/posuwu), rozwijane „How it's calculated” z
  wartościami pośrednimi i „Material table”. Router z pokrętłem: pozycje
  tylko do odczytu, najbliższa RPM wyróżniona (`nearestDialPosition()`).
  Model — `lib/CLAUDE.md`. Błędne wejścia (średnica, Flutes — także
  wpisana, jeszcze niezatwierdzona liczba — chip load) z `aria-invalid`,
  jak w wizardzie. Pola Flutes i Chip Load zatwierdzają przy każdym
  klawiszu (`useNumberField` z `commit: 'live'`), inaczej niż pola
  wizarda.
- **Apply selected** (`handleApplyFeedCalc()` w `App.tsx`): metoda i
  średnica zawsze (kontekst wyliczenia), szerokość/Linking Feed przez
  `OPERATION_META[op].withCalc()` (Pocket także Stock to Leave i Finish
  Feed; Ramp Angle do sekcji operacji), posuwy i Stepdown do `feeds`, RPM
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
