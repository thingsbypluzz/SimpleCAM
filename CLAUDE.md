# OnlyPaths

Lekki, w pełni client-side generator G-code dla pojedynczych operacji
wiercenia/kieszeniowania na frezarkach CNC (GRBL/Marlin/Mach3). Użytkownik
przechodzi przez 4-krokowy wizard i na końcu dostaje gotowy plik `.gcode` —
bez logowania, bez backendu, bez CAD-a.

## Jak zorganizowana jest dokumentacja

- Ten plik — przegląd, zasady i decyzje przekrojowe (ładowany zawsze).
- **Szczegóły mechanizmów żyją w zagnieżdżonych `CLAUDE.md`** w katalogu,
  którego dotyczą (Claude Code ładuje je przy pracy w tym katalogu):
  `src/lib/CLAUDE.md` (silnik G-code, operacje, walidacja, storage, model
  Feedrate Calculator, testy), `src/components/preview3d/CLAUDE.md`
  (podgląd 3D), `src/components/preview/CLAUDE.md` (podgląd 2D),
  `src/components/wizard/CLAUDE.md` (kroki, pola, kolejność pól),
  `src/components/CLAUDE.md` (Settings Modal, Feedrate Calculator UI),
  `src/config/CLAUDE.md` (rejestry, motywy, palety), `scripts/CLAUDE.md`
  (deploy). Przed zmianą w obszarze przeczytać jego plik; po zmianie
  mechanizmu zaktualizować go (ten plik tylko wtedy, gdy zmienia się
  przegląd albo zasada przekrojowa).
- **`CHANGELOG.md`** — jedyna historia (co i dlaczego, wersja po wersji).
- **`ideas.md`** — backlog (`BL-#`), przyszłe operacje (`OP-#`),
  nieuzgodnione wnioski z `/grill-me`, zasada synchronizacji z Artifactem
  „OnlyPaths Backlog”.

## Stack

- **Vite + React + TypeScript** (SPA, bez SSR/routingu).
- **Tailwind CSS v4** (`@tailwindcss/vite`, bez `tailwind.config.js` —
  CSS-first, motywy w `src/index.css`).
- **Vitest** — testy silnika G-code.
- Podglądy: **Canvas API** (2D, `src/components/preview/`) i **Three.js**
  (3D, `src/components/preview3d/`, ładowany leniwie przez `React.lazy`).
- Zero backendu, bazy danych i kont. Generowanie G-code i podglądy zawsze w
  100% po stronie klienta (nie wyklucza przyszłego lekkiego kodu
  server-side gdzie indziej, np. licencji — dziś nic takiego nie ma).

## Stan projektu

Cztery operacje (`WizardParams.operation`):

- **Hole(s)** — okrągłe otwory; metody Helix / Standard Hole × wzorce
  Single / Rectangular Grid / Grid Centered / N-Holes on Circle / Custom
  List; opcjonalne mostki.
- **Outline** — kontur Rectangle Cornered / Centered / Circle z offset mode
  Inside / Outside / On-line; metody Ramp/Standard (prostokąt) albo
  Helix/Standard (okrąg); opcjonalne mostki.
- **Surface** — planowanie po prostokącie; Zigzag / Unidirectional,
  kierunek rastra X/Y, stepover % średnicy, wejście Plunge/Helix.
- **Pocket** — kieszeń Rectangle Cornered / Centered / Circle; metody
  Spiral i Adaptive (stałe zaangażowanie); opcjonalny przejazd
  wykończeniowy ścian (Stock to Leave, Finish Feed).

## Kluczowe decyzje (przekrojowe)

- Jednostki tylko mm. Dialekt: wspólny podzbiór GRBL/Marlin/Mach3,
  `MachineSettings.dialect` rozstrzyga preambułę, `G4 P` i `M30`/`M2`.
- Wrzeciono tylko `M3`; obroty i dwell globalne (Settings → Machine).
  Jedno narzędzie na plik. Kierunek cięcia: zawsze climb pod M3 (wewnątrz
  CCW, na zewnątrz CW), Adaptive ma przełącznik Climb/Conventional.
- Interpolacja okręgów: przełącznik G2/G3 vs G1 w Kroku 4; mostki i
  prostokąty wymuszają G1 (zapisana wartość zostaje).
- Logika G-code to **czyste funkcje TS** w `src/lib/`
  (`(params, machine) => string[]`), odizolowane od UI. Każdy silnik buduje
  **jedną listę ruchów** (`lib/toolpath.ts`), z której powstaje G-code i
  podgląd 3D — podgląd nie liczy ścieżki sam.
- Start Z = margines najazdu na posuwie roboczym nad Z0, nie wysokość
  materiału; dno cięcia zawsze `-totalDepth`. Między punktami retrakt na
  Safe Z.
- Nazwa pliku `op-<wzorzec|kształt>-<data>.gcode` (`lib/download.ts`).
- Wizard nie zna zerowania materiału na stole — jedyny niezmiennik to
  rozpiętość wzorca ≤ skok maszyny na osi: twarde `min`/`max` na polach
  (sanity) + miękkie ostrzeżenie w Kroku 4 (`machineFitWarnings()`), które
  nie blokuje Generate i steruje kolorem Badge Kroku 4 (kształt = stan
  Generate, kolor = dopasowanie do maszyny).
- **Język UI: angielski.** Rozmowa z użytkownikiem i dokumenty (`CLAUDE.md`,
  `CHANGELOG.md`, `ideas.md`) — po polsku.
- Hosting: statyczny build na `https://onlypaths.pluzz.pl`; lokalnie
  `npm run dev`.

## Layout i zachowanie UI

Terminologia regionów UI (`Header`, `Wizard Section`, `Preview Section`,
`Active Step Panel`, `Step N Summary`, `Preview Tabs`, `Preview Viewport`,
`Settings Modal`/`Nav`/`Content`, `Entry Field`, `Drop-down`, `Hint
Button`, `Checkbox`, `Toggle`, `Tab`, `Badge`, `Icon Button`) — wg
Artifactu **Interface Anatomy**
(`https://claude.ai/code/artifact/ea21c02e-41ed-4bb5-90ec-48ae9a61c23e`);
aktualizować go tylko, gdy layout zmieni się na tyle, że mockup przestanie
być wierny.

- **Pionowy akordeon** 4 kroków: aktywny rozwinięty (~420px), pozostałe
  zwinięte do Step N Summary (80px); klik w dowolny przełącza, bez
  „Wstecz” i blokady kolejności.
- W panelu jedna kolumna, pary pól pokrewnych w jednym wierszu. Kolejność
  pól w Kroku 2: najpierw gdzie i jak duże, potem narzędzie, potem jak
  ciąć; pierwszy wiersz „Pattern:/Shape:” (szczegóły:
  `src/components/wizard/CLAUDE.md`).
- **Preview Tabs:** 2D / 3D (domyślna) / G-Code (najwyżej 5000 linii,
  pełny program w pobranym pliku). Podgląd dostaje odroczoną kopię
  parametrów (`useDeferredValue`) i pamięta widok przy przełączaniu
  zakładek (tylko w sesji). Hide/Show Stock i Hide/Show Toolpath — wspólny
  stan sesyjny obu podglądów.
- **Materiał w podglądach** wg fizycznego znaczenia: pustka (otwór, Outline
  Inside, Pocket) wycięta z arkusza materiału, Outline Outside = lita wyspa,
  On-line = wyspa + arkusz wycięty na zewnętrznej krawędzi; Surface =
  „pozostały materiał”.
- **Header:** Preset Bar `[1]…[5]`, oko Overlay, ołówek Edit Mode, dark/
  light (dark domyślny niezależnie od systemu), Settings.
- **Auto-save i presety** (`simplecam.storage`): slot `"0"` zapisywany przy
  Generate i wczytywany przy starcie (wizard na Kroku 4 z bannerem
  "Restored from your last session"); sloty `1`–`5` z auto-opisem
  (`presetLabel()`), zapis w Kroku 4 z potwierdzeniem nadpisania, usuwanie
  „×” z potwierdzeniem. Wczytanie presetu nie zmienia aktywnego kroku.
- **Overlay:** oko przełącza tryb, w którym klik w slot dodaje/usuwa preset
  z nakładki (ramka + checkmark), 2D i 3D naraz; żywy wzorzec wtedy
  ukryty (`showActivePattern`), Generate zablokowany (`canGenerate`), baner
  "Preview mode"; zmiana selekcji re-fituje kamerę (3D z zachowaniem
  kąta). Wyłączenie oka czyści selekcję. Ramka wokół grupy presetów
  widoczna, gdy Overlay albo Edit Mode jest aktywny (kolor, nie grubość —
  bez skoku layoutu).
- **Edit Mode** (ołówek): klik w slot = wczytanie + uzbrojenie live-save
  (radio; ponowny klik rozbraja, tryb zostaje); każda poprawna zmiana
  zapisuje się od razu do slotu (tylko gdy `isWizardParamsValid`); napis
  "Edit Mode — select a preset" / "Auto-save Mode Enabled" (kolor błędu
  przy niepoprawnych parametrach). Overlay i Edit Mode wzajemnie się
  wyłączają; stan tylko w pamięci; Edit Mode nie blokuje Generate.
- **Settings Modal:** Machine, Tabs, Tool Diameters, Appearance, Privacy,
  Reset, About (szczegóły: `src/components/CLAUDE.md`).
- **Feedrate Calculator:** ikona przy Feedrate XY w Kroku 3; z materiału,
  freza i limitów maszyny liczy RPM, posuwy, Stepdown i szerokość, „Apply
  selected” zapisuje zaznaczone (UI: `src/components/CLAUDE.md`, model:
  `src/lib/CLAUDE.md`). Krok 2 pokazuje Flutes (wspólne z kalkulatorem) i
  rzeczywiste fz.
- **Motywy i palety** — dwie niezależne osie w Settings → Appearance
  (`simplecam.appearance`): Theme reskinuje chrom appki (4 motywy), Paleta
  tylko akcenty podglądów (szczegóły: `src/config/CLAUDE.md`).
- Każdy przełącznik niesie `aria-pressed` (zakładki: `role="tab"`,
  Settings Nav: `aria-current`) — stan nigdy tylko kolorem.
- `ErrorBoundary` wokół `<App />` — "Reload" / "Reset saved state" zamiast
  białego ekranu.

## Zasada rejestrów

Wszystko, co zależy od aktywnej **operacji**, idzie przez dwa rejestry, nie
przez łańcuchy `operation === … ? … : …` (przyczyna `BL-51`):
`OPERATION_META` (`config/operationMeta.ts` — UI i `generate`) oraz
`OPERATION_RULES` (`lib/validation.ts` — walidacja, głębokość, mostki,
footprint, zaangażowanie). Wyjątki: router Kroku 2 (`Step2Geometry.tsx`),
wybór operacji w Kroku 1, rysowanie w podglądach. Zależne od **metody** —
przez `METHOD_META`/`SURFACE_METHOD_META`/`POCKET_METHOD_META` (Outline:
`generateOutline()`), wołane wyłącznie przez
`OPERATION_META[op].generate()` — nie importować generatorów w
komponentach. Zależne od **wzorca/kształtu** — przez `positioningMeta.ts`/
`outlineMeta.ts`/`surfaceMeta.ts`/`pocketMeta.ts`. Kolory podglądów —
wyłącznie przez `config/palettes.ts`.

## Hosting testowy

Ręczny deploy (bez CI/CD, `BL-4`): `npm run deploy` (build + FTPS) i
`npm run deploy:check` (tylko połączenie i listing); dane w lokalnym
`.env`. Wysyła tylko pliki z `dist/`, `index.html` na końcu — **nigdy
pełny `clearWorkingDir()`** (root zawiera pliki cPanelu). Szczegóły
(certyfikaty, host, kolejność): `scripts/CLAUDE.md`.

## Struktura katalogów

```
src/
  App.tsx              stan wizarda, nawigacja kroków, presety/Overlay/Edit Mode, pamięć widoku
  main.tsx             wejście (StrictMode, ErrorBoundary)
  index.css            Tailwind + tokeny motywów
  types/               wizard.ts (WizardParams, domyślne), machine.ts, theme.ts,
                       appearance.ts, toolDiameters.ts
  config/              rejestry: operationMeta, methodMeta, surfaceMethodMeta,
                       pocketMethodMeta, positioningMeta, outlineMeta, surfaceMeta,
                       pocketMeta; palettes, materials, routers           → CLAUDE.md
  components/
    SettingsModal.tsx, FeedCalculatorModal.tsx, ErrorBoundary.tsx,
    useModalFocus.ts, icons.tsx                                          → CLAUDE.md
    wizard/            Step1Positioning, Step2Geometry(+Holes/Outline/Surface/Pocket),
                       Step3Feeds, Step4Output, pickery metod, PickHeader, MiniStat, ToolChipLoad,
                       TextToggle, NumberInput, useNumberField, Checkbox,
                       FieldRow, HintPopover                              → CLAUDE.md
    preview/           ToolpathCanvas, drawToolpath, camera2d (2D)       → CLAUDE.md
    preview3d/         Scene3D, buildScene, cameraPresets (3D)            → CLAUDE.md
  lib/                 silnik G-code (czyste funkcje)                     → CLAUDE.md
    program.ts           szkielet programu, dialekty
    toolpath.ts          wspólna lista ruchów i formatter G-code
    positioning.ts, customPoints.ts        wzorce Hole(s)
    helix.ts, standardHole.ts, tabs.ts     Hole(s) i Outline Circle, mostki
    outline.ts, outlineCircle.ts, outlineRectangle*.ts   Outline
    surface*.ts                            Surface
    pocket*.ts                             Pocket (Spiral, Adaptive, wejście Z)
    depthPasses.ts, interpolation.ts, format.ts
    validation.ts        OPERATION_RULES, walidacja, ostrzeżenia
    feedCalc.ts          model Feedrate Calculator
    storage.ts, *Storage.ts, presetLabel.ts, toolDiameterOptions.ts, overlayParams.ts
    download.ts          plik do pobrania (jedyny efekt uboczny)
    fuzzParams.ts, gcodeTestUtils.ts, pocketAdaptiveSim.ts   tylko testy
    *.test.ts            Vitest (w tym gcodeInvariants.test.ts)
scripts/               deploy.mjs, certs/                                 → CLAUDE.md
public/                .htaccess, robots.txt, favicon.svg
```

## `.gitignore` musi wykluczać `.claude/`

Tailwind v4 skanuje cały projekt pod kątem klas i respektuje tylko
`.gitignore` — bez tego dokumentacja skilli w `.claude/skills/` trafia do
skanowania i winduje bundle CSS. Z tego samego powodu `src/index.css` wyklucza
dokumentację (`@source not` dla `*.md` — `CLAUDE.md`, `CHANGELOG.md`,
`ideas.md`, specy `design_*.md`), bo pełno w niej nazw klas w prozie.

## Komendy

```bash
npm run dev       # dev server (Vite)
npm run build     # tsc -b && vite build
npm run test      # vitest
npm run lint      # oxlint
npm run deploy    # build + wysyłka na hosting
```

## Skille do wykorzystania

- **`tailwind`** — przy pisaniu/refaktorze klas Tailwind v4.
- **`frontend-design`** — przy decyzjach wizualnych.
- **`threejs-*`** (fundamentals, geometry, materials, interaction, …) —
  przy pracy nad `src/components/preview3d/`.
- **`/grill-me`** — przed większą pozycją z `ideas.md` o szkicowej
  specyfikacji, zamiast zgadywać.
- **`backlog-sync`** — synchronizacja `ideas.md` z Artifactem backlogu
  (pozycja zrealizowana zmienia status, nie znika — reguła z `ideas.md`).

## Konwencje

- **`CHANGELOG.md`** — jedyna pełna historia. `CLAUDE.md` (wszystkie)
  opisują wyłącznie stan obecny — bez numerów wersji, dat, cytatów z
  `/grill-me` ani opisów naprawionych błędów.
  - **Twarda reguła:** po każdej **większej** zmianie (funkcjonalność,
    motyw, przeprojektowanie mechanizmu, poprawka realnego buga) —
    `CHANGELOG.md` **z automatu** w tej samej turze (nowy wpis
    `## [X.Y.Z]` + bump wersji w `package.json`, commit "Version X.Y.Z:
    ..."). Po **mniejszej** (styl, literówka, drobny tweak) — zapytać, czy
    wpis jest potrzebny. Zmiany samej dokumentacji/backlogu — bez wpisu.
- Odłożone pomysły i przyszłe operacje: **`ideas.md`**. Nie przeskakiwać
  większych pozycji bez pytania; `OP-#` zawsze z sesją `/grill-me`.
- Brak testów E2E — testy jednostkowe silnika + test właściwościowy
  niezmienników (`gcodeInvariants.test.ts`).
