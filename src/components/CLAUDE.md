# src/components — modale i komponenty najwyższego poziomu

## Układy i dotyk (`useViewport.ts`)

- `useLayoutMode()` → `'wide' | 'medium' | 'narrow'` z szerokości okna
  (progi `WIDE_MIN_WIDTH` = 1280, `MEDIUM_MIN_WIDTH` = 900). `App.tsx`
  składa każdy układ z tych samych kawałków (`presetBar`,
  `renderStepPanel()`, `previewTabs`, `previewViewport`, `railWizard`) —
  różni się tylko rozmieszczenie, nie zawartość kroków ani podglądów.
- `useCoarsePointer()` — `pointer: coarse`. Steruje zachowaniem dotykowym
  niezależnie od układu (duży tablet poziomo ma układ szeroki i dotyk).
- `useVisibleHeight()` — na dotyku publikuje wysokość widocznego obszaru
  (`visualViewport`) jako `--app-h`; korzeń aplikacji ma
  `h-[var(--app-h,100dvh)]`, więc klawiatura systemowa (pola tekstowe)
  skraca układ zamiast zasłaniać jego dół. Pomijane przy powiększeniu
  strony gestem.
- Przewija się zawsze panel (Active Step Panel, treść okna), nigdy strona.
- Cele dotyku: wariant `pointer-coarse:` w klasach (`inputClass`,
  przełączniki tekstowe, zakładki podglądu, Next); tekst pól 16 px — reguła
  w `index.css` (iOS powiększa stronę przy mniejszym).

## Preset Bar (`PresetBar.tsx`) i menu projektu (`ProjectMenu.tsx`)

- `PresetBar` — sloty `[1]…[7]` i oko Overlay; stan i akcje dostaje z
  `App.tsx`. Napisy trybów („Overlay Mode — …”, „Auto-save Mode Enabled”)
  przychodzą jako `labels`: w układzie szerokim wiszą na lewo od ramki, w
  wąskim stoją między slotami a okiem, w średnim rysuje je `App.tsx` w
  wierszu Preview Tabs. Na telefonie (`phone:`) sloty i oko mają 36 px z
  odstępem 4 px (siedem slotów i oko mieszczą się w 360 px), a napisy
  trybów znikają — stan pokazują znaczki na slotach.
- `touch`: znaczki są wtedy tylko wskaźnikami stanu; przytrzymanie slotu
  (`LONG_PRESS_MS` = 500) otwiera menu (`role="menu"`), a kliknięcie, które
  przychodzi po puszczeniu palca, jest pomijane. Menu zamyka dotknięcie
  poza nim albo Escape. Podpowiedź o przytrzymaniu pokazuje się, dopóki
  użytkownik jej nie zamknie albo nie przytrzyma slotu (`hintStorage.ts`).
- `ProjectMenu` — przycisk z nazwą projektu (kropka przy niezapisanych
  zmianach) i menu Load project / Save project; używany w układzie średnim
  i wąskim. Ukryty `<input type="file">` jest jeden, w `App.tsx`.

## Klawiatura numeryczna (`NumericKeypad.tsx`, `keypadContext.ts`)

- Tylko na dotyku. Własna, bo systemowej nie da się ograniczyć do cyfr
  (iPad pokazuje pełną), nie zawsze ma klawisz chowania i zasłania stronę
  bez zmiany jej rozmiaru.
- `KeypadProvider` (w `main.tsx`, wokół `<App />`) trzyma pole, w które się
  pisze. `NumberInput` na dotyku jest polem `type="text"` z
  `inputMode="none"` i atrybutem `data-keypad`; przy fokusie woła
  `attach()`. Tekstowe, bo pole liczbowe wyczyściłoby liczbę w trakcie
  pisania („47.”, „-”).
- Klawisz wpisuje tekst natywnym setterem i zdarzeniem `input`, więc pole
  dostaje zwykły `onChange` — zatwierdzanie i walidacja działają jak przy
  klawiaturze fizycznej. Logika klawiszy: `lib/keypadInput.ts`
  (`applyKey()`): klawiatura edytuje tylko koniec tekstu i zawsze dopisuje
  — wejście w pole niczego nie kasuje, ⌫ zdejmuje ostatni znak, nową
  liczbę zaczyna klawisz **C** (Clear, w prawym dolnym rogu). Bez
  zaznaczania tekstu — zaznaczenie wywołuje na Androidzie systemowy pasek
  Cut / Copy.
- Klawisze działają na `pointerdown` z `preventDefault` — nie zabierają
  fokusu polu. Done robi `blur()` (to zatwierdza
  wartość); dotknięcie poza klawiaturą i poza polami liczbowymi też ją
  zamyka.
- Pasek nad klawiszami: ‹ › (małe, bez ramki) — poprzednie / następne
  pole, po widocznych polach `data-keypad` w tym samym oknie dialogowym
  albo na stronie; nazwa pola; **− / +** — tekst pola o krok (atrybut
  `step` pola, bez niego 1) przez `stepText()` z `lib/keypadInput.ts`:
  liczy od tego, co widać (także od liczby wpisanej i jeszcze
  niezatwierdzonej), zaokrągla do miejsc po przecinku kroku (co najmniej
  1/100), przy tekście, który nie jest liczbą, nic nie robi; zmiana idzie
  tym samym zdarzeniem `input` co klawisz, więc zatwierdza się jak
  pisanie. Przytrzymanie powtarza krok (`useHoldRepeat()`, jak przyciski
  pola na komputerze); bez obcinania do `min`/`max`, jak na komputerze.
  Done na telefonie węższy, żeby nazwa pola się mieściła.
- Klawiatura jest `fixed`, przypięta do dołu widocznego obszaru
  (`top: var(--app-h)` i przesunięcie o własną wysokość — nie `bottom: 0`,
  bo Firefox na Androidzie potrafi podać obszar układu wyższy niż ekran;
  z tego samego powodu okna pełnoekranowe mają wysokość `--app-h`, a nie
  `inset-0`), nad oknami pełnoekranowymi, i ustawia
  `--keypad-h` — dolny padding korzenia aplikacji i okien pełnoekranowych,
  więc treść się skraca i przewija, a edytowane pole jest dosuwane na
  środek. W układzie wąskim dolny pasek widoków znika na czas pisania
  (`useKeypad().open`).
- Pola tekstowe (napis w Text, nazwa projektu, Custom List) zostają przy
  klawiaturze systemowej.

## Simple / Advanced Mode (`uiModeContext.ts`)

- `App.tsx` trzyma tryb w `appearance.uiMode` i podaje go przez
  `SimpleModeContext`; kroki wizarda i Settings czytają `useSimpleMode()`
  i chowają swoje pola (lista w `src/components/wizard/CLAUDE.md`). Wartości
  schowanych pól pilnuje `App.tsx` (`simplifyParams()` w `updateParams()`,
  przy wczytaniu i uzbrojeniu presetu i w `handleSaveAppearance()` przy
  przejściu na Simple — wtedy też przemontowanie Kroków 2/3), nie
  komponenty.
- Przełącznik w Header (`modeSwitch` w `App.tsx`, wspólny dla trzech
  układów): dwie połówki `DuckIcon` | `EagleIcon` (ikony 24 px, kreska 1 i
  detale 0,8 — cieńsze od reszty, wzory w Artifakcie „OnlyPaths Mode
  Icons”), wybrana na tokenach akcentu, `aria-pressed` na obu. Na dotyku i w
  układach średnim / wąskim połówki 44 px; na telefonie (`phone:`) schowany.
  Ten sam wybór w Settings → Appearance („Interface Mode”, `TextToggle`) —
  na telefonie jedyny.
- `appearance` zapisuje się przy każdej zmianie i przy starcie, więc tryb
  wybrany nowemu użytkownikowi zostaje (`loadAppearanceSettings()`: brak
  klucza i brak presetów = Simple, brak klucza przy zapisanych presetach
  albo zapis bez `uiMode` = Advanced). Reset All Settings wraca do Simple.

## Settings Modal (`SettingsModal.tsx`)

- Okno 920×640 px. Nakładka `bg-black/50 backdrop-blur-sm`; podgląd 3D wstrzymany
  (`renderPaused`). Fokus/Escape/pułapka Tab — `useModalFocus.ts` (wspólne
  z kalkulatorem).
- `fullScreen` (dotyk albo układ średni / wąski): cały ekran bez nakładki,
  u góry przycisk Back i tytuł, Settings Nav jako jeden wiersz przewijany
  w bok; treść sekcji bez zmian.
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
  W Simple Mode Machine pokazuje tylko skoki osi, Spindle Speed (jedyne
  miejsce na obroty, bo Krok 3 go chowa) i Spin-up Dwell; Min/Max RPM, Max
  Feed, Rigidity i Router są ukryte (bez resetu), a z Settings Nav znika
  Feed Tables.
- **Controller** — sterowanie: G-Code Dialect (natychmiast, z opisem, co
  dialekt zmienia w programie) i Start/End G-Code (textarea, commit
  `onBlur`). Sekcja to tylko podział w UI — pola należą do
  `MachineSettings` i zapisują się w `simplecam.machine`, jak **Tabs**.
- **Tabs:** domyślne rozmiary mostków (Default Tab Count — ta sama
  walidacja co w wizardzie). **Tool Diameters:** edytowalna lista (dodaj/
  usuń, sufit `MAX_TOOL_DIAMETER_COUNT`, blokada usunięcia ostatniej, Reset
  to Default z potwierdzeniem; wpisy użytkownika z etykietą `"<wartość>
  mm"`; błąd dodania oznacza pole „New diameter” przez `aria-invalid`,
  poza błędem pełnej listy). **Appearance:** Interface Mode (Simple / Advanced — to samo co
  przełącznik w Header), Theme (karty ze swatchami, `aria-pressed`),
  Preview Color Palette, Cut Shape (checkbox — materiał w podglądach w kształcie
  po frezie, `cutShapeEnabled`), Simple 3D Preview (checkbox — uproszczony podgląd 3D także tam, gdzie
  działa pełny, `simple3DPreview`), Stock Edges 3D (checkbox — obrys krawędzi materiału),
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
  Blok **Diagnostics** (`DiagnosticsBlock.tsx`, dane z `diagnostics.ts`):
  co oferuje ta przeglądarka i urządzenie — user agent, rozmiar okna i
  układ, typ wskaźnika, WebGL 1 / 2 i nazwa układu graficznego, który
  podgląd 3D jest używany, motyw, styl gołego przycisku (tło, `appearance`,
  `color-scheme` — czy reset stylów wygrał z przeglądarką), brakujące funkcje CSS, na których opiera
  się arkusz stylów, dostępność `localStorage`. Czytane raz przy otwarciu
  sekcji, nigdzie nie zapisywane ani nie wysyłane; przycisk Copy kopiuje
  całość jako tekst (wiersze są też zaznaczalne ręcznie). Nowa funkcja
  przeglądarki, od której zależy aplikacja, dostaje tu swój wiersz.
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
- `fullScreen` jak w Settings (Back zamiast ✕); `stacked` (układ wąski) —
  pola wejściowe nad wynikami w jednej przewijanej kolumnie zamiast dwóch
  kolumn obok siebie.
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
- `PhoneLabel.tsx` — napis skracany na telefonie (`phone:`), np. przyciski
  podglądu 3D.
- `icons.tsx` — własne ikony SVG; legenda w Artifakcie Interface Anatomy.
  Ikony kształtów Pocket: granica + cieńsza spirala CCW (kwadratowa dla
  Rectangle z kropką originu, Archimedesa dla Circle).
