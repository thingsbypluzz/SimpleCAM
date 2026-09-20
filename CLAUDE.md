# OnlyPaths

Lekki, w pełni client-side generator G-code dla pojedynczych operacji
wiercenia/kieszeniowania na frezarkach CNC (GRBL/Marlin/Mach3). Użytkownik
przechodzi przez 4-krokowy wizard i na końcu dostaje gotowy plik `.gcode` —
bez logowania, bez backendu, bez CAD-a.

## Stack

- **Vite + React + TypeScript** (SPA, brak SSR/routingu — świadomie lżejsze
  niż Next.js, bo cała appka jest client-side).
- **Tailwind CSS v4** (`@tailwindcss/vite` plugin, bez `tailwind.config.js` —
  konfiguracja przez CSS-first API).
- **Vitest** do testów logiki G-code.
- Wizualizacja: **Canvas API** (2D, `src/components/preview/`) +
  **Three.js** (3D, `src/components/preview3d/`) — Three.js ładowany
  leniwie (`React.lazy`), nie wchodzi do głównego bundle'a (opcjonalny
  z założenia — 3D Preview to jedna z trzech zakładek, nie musi obciążać
  startowego bundle'a).
- Zero backendu. Zero bazy danych. Zero kont użytkowników. (Zawsze
  dotyczy generowania G-code i podglądów 2D/3D — muszą zostawać w 100%
  po stronie klienta. Nie wyklucza to lekkiego kodu server-side gdzie
  indziej, np. do weryfikacji licencji, gdyby appka kiedyś dostała
  płatny wariant — po prostu nic takiego dziś nie istnieje ani nie jest
  planowane.)

## Stan projektu

Appka obsługuje dziś trzy operacje (`WizardParams.operation`):

- **Hole(s)** — wiercenie/frezowanie okrągłych otworów. Dwie metody
  (`MethodType`: Helix / Standard Hole) × pięć wariantów pozycjonowania
  (`PositioningMode`: Single / Rectangular Grid / Rectangular Grid
  Centered / N-Holes on Circle / Custom List).
- **Outline** — kontur wzdłuż zamkniętego kształtu, z trybem offsetu
  (Inside/Outside/On-line). Trzy kształty: Rectangle Cornered, Rectangle
  Centered, Circle.
- **Surface** — planowanie/frezowanie powierzchni (raster face milling)
  po obszarze prostokątnym (Rectangle Cornered/Centered — Circle
  odłożone, `BL-30`). Dwie metody (`SurfaceMethodType`: Zigzag /
  Unidirectional), kierunek rastra X/Y, stepover jako % średnicy
  narzędzia.

Pełne uzasadnienie i historia każdej decyzji — łącznie z tym, jak
appka doszła do dzisiejszego stanu, wersja po wersji — żyje wyłącznie w
**`CHANGELOG.md`**; ten plik opisuje tylko to, co jest prawdą dziś.
Planowane rozszerzenia (Pocket, Surface, i cała reszta odłożonych
pomysłów) — patrz **`ideas.md`**.

## Backlog i pomysły na przyszłość

Wszystkie odłożone pomysły — techniczny dług ze stałym ID (`BL-#`) i
przyszłe, duże operacje CNC (`OP-#`, każda wymaga własnej sesji
`/grill-me` przed implementacją) — żyją w **`ideas.md`**, razem z
regułą numeracji i zasadą synchronizacji z opublikowanym Artifactem
("OnlyPaths Backlog"). `ideas.md` trzyma też nieuzgodnione jeszcze
wnioski z sesji `/grill-me` (rzeczy, które nie są jeszcze zaakceptowaną
decyzją projektową).

## Kluczowe decyzje projektowe (stan obecny)

- **Jednostki:** tylko mm, bez cali.
- **Dialekt G-code:** wspólny podzbiór GRBL/Marlin/Mach3, preambuła
  `G21 G90 G17`. Realny wybór dialektu przez `MachineSettings.dialect`
  (`'grbl' | 'marlin' | 'mach3'`, domyślnie `'grbl'`, Settings → Machine)
  rozstrzyga dwie rzeczy w `src/lib/program.ts`: wartość `G4 P` (sekundy
  dla GRBL/Mach3, ×1000 milisekund dla Marlina) oraz
  `endOfProgramCode(dialect)` — `M30` dla GRBL/Mach3, `M2` dla Marlina —
  emitowane bezwarunkowo jako faktycznie ostatnia linia pliku.
- **Dwie metody Hole(s):** Helix (spiralne rampowanie w dół, ruch X/Y/Z
  jednocześnie) i Standard Hole (pełny okrąg 360° na danej głębokości,
  potem stepdown w Z, powtórz).
- **Interpolacja okręgów:** przełącznik w UI (Toggle) — G2/G3 (natywne
  łuki) albo G1 (segmenty liniowe). Obie metody zaimplementowane w
  silniku. Wymuszone na G1 dla całego programu, gdy włączone są Tabs
  (patrz niżej) — Toggle wyszarza się z wyjaśnieniem, zapisana wartość
  `output.interpolation` zostaje nietknięta, tylko ignorowana na czas
  mostków.
- **5 wariantów pozycjonowania (Hole(s)):** Single (0,0), Rectangular
  Grid (4 rogi), Rectangular Grid Centered (rogi wyśrodkowane), N-Holes
  on Circle (`circleHoleCount`/`circleDiameter`/`circleStartAngle`,
  0°=+X, rośnie przeciwnie do wskazówek zegara), Custom List (dowolne
  punkty `X,Y` wpisane ręcznie). Brak importu DXF/SVG (`BL-7` w
  `ideas.md`). Grid i Grid Centered kolapsują do 2 rzeczywistych
  punktów (albo 1, gdy oba wymiary naraz), kiedy `gridX` lub `gridY`
  wynosi dokładnie `0` (`===`, bez epsilon) — zamiast wiercić
  nakładające się "rogi" wielokrotnie; mechanizm żyje w `rawPoints()`
  (`lib/positioning.ts`), ograniczony świadomie tylko do tych dwóch
  trybów (nie dotyczy `circle`/`custom`). Etykiety (`positioningMeta.ts`)
  rozpoznają kolaps do 2 otworów (`"2 HOLES (Nmm apart)"`), nie do 1.
  Globalny offset X/Y (`geometry.offsetX/offsetY`) doliczany jednym
  krokiem post-processingu na końcu `resolvePoints()` — działa
  automatycznie dla każdego trybu, obecnego i przyszłego.
- **Outline — 3 kształty + tryb offsetu:** Rectangle Cornered (origin w
  lewym dolnym rogu), Rectangle Centered (origin w środku), Circle
  (tylko wyśrodkowany) — bez dowolnego konturu. Każdy z trybem **Inside
  / Outside / On-line**. Kierunek ruchu wyprowadzony z trybu cięcia pod
  stałe `M3` (CW): Outside → CW, Inside → CCW (konwencjonalne
  frezowanie), On-line → CW (arbitralnie, brak znaczenia fizycznego przy
  zerowym offsecie). Circle reużywa wprost silnika Helix/Standard
  Hole(s) (`helixCircleToolpath`/`standardCircleToolpath`,
  `lib/outlineCircle.ts`). Rectangle ma własną parę metod **Ramp /
  Standard** (`lib/outlineRectangle.ts`): Ramp = ciągłe zejście wzdłuż
  dłuższego boku (mirror spirali Helixa), Standard = prosty odpowiednik
  `standardHoleToolpath` dla 4 boków. Tabs dla Rectangle liczone **per
  bok** (`lib/outlineRectangleTabs.ts`), nie razem jak w Circle/Hole(s).
  Zaokrąglone rogi prostokąta poza zakresem.
- **Surface — raster face milling, tylko Rectangle w v1:** Circle
  świadomie odłożone (`BL-30`, przycinanie linii skanu do granicy koła
  to dodatkowa złożoność geometryczna). Brak wysp/przeszkód do ominięcia
  — poza zakresem v1. Dwie metody (`SurfaceMethodType`): **Zigzag**
  (ciągły `G1` bez podnoszenia między liniami — jedna nieprzerwana
  ścieżka na poziom Z) i **Unidirectional** (zawsze ten sam kierunek,
  pełny retrakt na Safe Z + reentry prostym plunge między liniami —
  wzorzec identyczny z `standardHole.ts`'s explicit plunge przed każdym
  passem). Płaski rejestr `config/surfaceMethodMeta.ts` (jak
  `METHOD_META`), **nie** bespoke-switch jak `lib/outline.ts` — metody
  Surface nie są ograniczone per-kształt jak Ramp/Helix w Outline.
  **Kierunek rastra** (`RasterDirection`): toggle X/Y w Step 2, bez
  dowolnego kąta. **Overtravel o promień narzędzia zawsze włączony** —
  bounding-box tool-center (`lib/surfaceGeometry.ts::surfaceToolBounds`)
  rośnie symetrycznie na wszystkich 4 bokach względem nominalnego
  prostokąta (inaczej niż `rectToolDimensions()` w Outline, który dla
  `outside` rośnie asymetrycznie per offset mode — Surface nie ma
  pojęcia offset mode). **Stepover**: pole `stepoverPercent` (1–100%,
  jedyne źródło prawdy) + pole obok tylko do odczytu z przeliczoną
  wartością mm (`surfaceStepoverMm()`). **Punkt startowy** każdego
  poziomu Z: zawsze róg min-X/min-Y bounding-boxa
  (`surfaceStartCorner()`), niezależnie od Cornered/Centered czy
  kierunku rastra. **Głębokość**: Total Depth + Stepdown (global
  `feeds.stepdown`), pełny raster całego obszaru na każdym poziomie —
  `buildLevelDescents()` zwraca wyłącznie listę docelowych głębokości
  (`toZ`) z `computeDepthPasses()`, bez własnego "fromZ" per poziom,
  bo faktyczne przejście Plunge/Helix zawsze zaczyna się z `startZ` (patrz
  niżej), nie z miejsca, w którym skończył się poprzedni poziom.
  **Przejście między poziomami Z** (poziom 0 zaczyna z `startZ` bez
  retraktu, jak pierwsze wejście w Hole(s)/Outline) — wspólny mechanizm
  dla obu metod, trzy kroki: **pełny retrakt na `Safe Z`** (na aktualnym
  XY — ta sama konwencja "powrót na Safe Z przed G0 do kolejnego
  punktu", co wszędzie indziej w appce), `G0` do rogu startowego (na
  wysokości Safe Z), **`G0` w dół do `Start Z`** (dokładnie ten sam
  `rapidToTop(startZ)`, co przy pierwszym wejściu — dopiero stąd
  zaczyna się właściwe zejście). Dopiero wtedy **Plunge** (prosty `G1
  Z`) albo **Helix** (mini-spirala) wg toggle'a `ZTransitionMode` w
  Step 2 — zejście zawsze liczone od `Start Z` do `toZ` tego poziomu,
  nigdy od `Safe Z` bezpośrednio (inaczej helix przelatywałby przez
  pustą przestrzeń nad `Start Z` i nie trafiał dokładnie w docelową
  głębokość w punkcie startu przejazdu rastra). Helix reużywa wprost
  `fullCircleMove()`/`computeDepthPasses()` z silnika Helix Hole(s), ale
  — inaczej niż tam — **kierunek obrotu zależy od `rasterDirection`**
  (`helixDirectionFor()`, `lib/surfaceZTransition.ts`): `'y'` → CCW,
  `'x'` → CW. Nie jest to dowolna konwencja jak w Hole(s) Helix (gdzie
  fizycznie nie ma znaczenia) — przy tym samym narożniku startowym
  (zawsze min-X/min-Y) każdy kierunek obrotu wymusza inne położenie
  środka spirali dla danej stycznej wyjścia, a tylko jedno z dwóch
  położeń leży poza obszarem materiału. Środek (`helixCenterFor()`) — dla
  `'y'` przesunięty o `helixRadius` w -X od narożnika (styczna wyjścia w
  +Y, zgodna z pierwszą linią rastra, i -X leży już poza materiałem, więc
  CCW zostaje), dla `'x'` przesunięty w -Y (styczna wyjścia w +X, a -Y
  leży poza materiałem pod CW — pod CCW to samo wymaganie stycznej
  wymuszałoby środek w +Y, czyli do wewnątrz obszaru rastra). Efekt tej
  pary: styczna helixa i pierwsza linia rastra zawsze się płynnie łączą
  (bez kantu 90°) I sama pętla helixa zawsze leży poza obszarem
  materiału, nie zawija się nad przyszłe przejazdy rastra. **Helix
  Radius** — osobne pole
  (tylko w trybie Helix), walidacja `isSurfaceHelixRadiusValid()`: `>
  0`, sufit = stepover (mm). Mini-helix reużywa istniejący toggle
  interpolacji G2/G3 vs G1 (`output.interpolation`). **Tabs nie
  dotyczą Surface w ogóle** — brak checkboxa, brak pola, poza zakresem
  koncepcyjnym
  (Surface nie izoluje/przewierca na wylot). **Feed rate**: jeden
  globalny (`feeds.feedrateXY` dla cięcia/spirali, `feeds.plungeRate`
  tylko dla prostych pionowych ruchów) — bez osobnego pola, ta sama
  konwencja co Hole(s)/Outline. Silnik: `lib/surfaceGeometry.ts`
  (bounding box + overtravel), `lib/surfaceRaster.ts` (pozycje linii
  rastra + waypointy zigzag), `lib/surfaceZTransition.ts` (mechanika
  Plunge/Helix + `buildLevelDescents()`), `lib/surface.ts`
  (`generateSurfaceZigzag`/`generateSurfaceUnidirectional`, spięte przez
  `assembleProgram()` tą samą konwencją co Outline — jeden syntetyczny
  punkt-narożnik startowy). Preview 2D — linie skanu + strzałki
  kierunku (`drawSurfaceGeometry()`); Preview 3D — płaski
  półprzezroczysty blok **"pozostały materiał"** (nie "usunięty" —
  odwrotny model niż Hole(s)/Outline Inside, ustalony w osobnej sesji
  `/grill-me`, 2026-09-12), przez **bezpośrednie, niezmodyfikowane**
  `buildRectWallMesh()` z Outline (agnostyczna na kolejność narożników,
  liczy bounding box z min/max), **zamknięty** (`closed=true`, jak
  Outline Outside — Surface nigdy nie reprezentuje pustki/kieszeni).
  Górna ściana zawsze na **`Z = -totalDepth`** (absolutnie — `startZ`
  wydłuża tylko dojazd z góry, nigdy nie przesuwa faktycznego dna
  cięcia, więc nie wpływa na pozycję tej bryły), dolna krawędź ścianek
  na `-totalDepth - feeds.safeZ` (wysokość bryły = `feeds.safeZ` —
  reużyta zamiast nowej stałej/ustawienia, bo jej domyślna wartość, 5mm,
  już wygląda sensownie jako umowna "reszta materiału pod spodem", o
  której appka nic nie wie). Niezależne od liczby przejść stepdown. Plus
  ciągła `THREE.Line` po trasie rastra (`buildSurfaceToolpathPoints3D()`);
  brak osobnego stock-cap-z-otworem (`buildStockCapObject()` zwraca
  `null` dla Surface — blok "pozostałego materiału" już jest tą
  wizualizacją).
- **Ruch między otworami:** powrót na `Safe Z` przed `G0` do kolejnego
  punktu XY.
- **Wrzeciono:** tylko `M3` (bez `M4`).
- **Jedno narzędzie na wygenerowany plik** — brak zmiany narzędzia.
- **Nazwa pliku wyjściowego:** `op-<pattern>-<data>.gcode`
  (`buildFilename()`, `src/lib/download.ts`) — `<pattern>` to
  `patternSlug(geometry.positioning)` dla Hole(s) albo odpowiednik z
  `outlineShapeSlug()` dla Outline, nie nazwa metody.
- **Hosting docelowy:** strona własna użytkownika (static build); lokalnie
  praca przez `npm run dev`.
- Logika generowania G-code musi być **czystymi funkcjami TS**
  (`(params: WizardParams, machine: MachineSettings) => string[]`),
  całkowicie odizolowanymi od warstwy UI — patrz `src/lib/`.
- **Język UI aplikacji: angielski** (OnlyPaths jest anglojęzyczna).
  Komunikacja projektowa z użytkownikiem oraz dokumenty typu ten plik,
  `CHANGELOG.md` i `ideas.md` zostają po polsku.

### Layout wizarda (terminologia: patrz Artifact „Interface Anatomy”)

Nazewnictwo regionów UI używane w tym pliku i w rozmowie odpowiada
opublikowanemu Artifactowi **Interface Anatomy**
(`https://claude.ai/code/artifact/ea21c02e-41ed-4bb5-90ec-48ae9a61c23e`)
— `Header` / `Wizard Section` / `Preview Section` na najwyższym
poziomie, dalej `Active Step Panel` / `Step N Summary` (Wizard Section),
`Preview Tabs` / `Preview Viewport` (Preview Section), `Settings Modal` /
`Settings Nav` / `Settings Nav Item` / `Settings Content` (modal), oraz
generyczne komponenty (`Entry Field`, `Drop-down`, `Section Header`,
`Hint Button`, `Checkbox`, `Toggle`, `Tab`, `Badge`, `Icon Button`). Ten
Artifact aktualizować tylko jeśli realny layout appki zmieni się na tyle,
że mockup przestanie być wierny.

- **Pionowy akordeon**, nie liniowy stepper. Wszystkie 4 kroki widoczne
  od razu w Wizard Section — tylko aktywny krok jest rozwinięty jako
  Active Step Panel (~420px), pozostałe zwinięte do Step N Summary
  (80px, ikony/wartości). Klik w dowolny Step N Summary (także "do
  przodu") przełącza aktywny krok. Brak przycisku „Wstecz”, brak
  blokady kolejności — można od razu wejść na Krok 4 z domyślnymi
  parametrami.
- Wewnątrz Active Step Panel pola/opcje w **jednej kolumnie**, z
  wyjątkiem: analogicznych par/trójek pól o pokrewnym znaczeniu
  renderowanych w jednym wierszu (`flex gap-4`, `min-w-0 flex-1` na
  każdym elemencie — `min-w-0` konieczne, bo `<input>` bez jawnej
  szerokości ma domyślną min-content podłogę, której flex-shrink nie
  może ominąć) — Grid X/Y, Offset X/Y, Hole Diameter+Total Depth,
  Circle Count/Diameter/Start Angle, Tabs Height/Width/Count, Surface
  Method+Raster Direction, Surface Z-Transition Mode+Helix Radius (drugie
  pole puste, gdy tryb ≠ Helix — para zostaje w jednym wierszu, żeby
  uniknąć scrollowania). Pola o niepowiązanym znaczeniu zostają w
  kolumnie.
- Header: dark/light Icon Button (klasa `.dark` na `<html>`, Tailwind
  `@custom-variant dark` w `src/index.css`) — **dark mode jest domyślny**
  niezależnie od preferencji systemowej — oraz Settings Icon Button,
  otwierający Settings Modal.

### Machine Settings

Settings Modal, Settings Nav item „Machine”. Pola: X/Y/Z travel maszyny
(auto-save `onBlur`, zapis tylko przy poprawnej wartości `> 0`),
G-Code Dialect (Drop-down, zapis natychmiastowy), Start G-Code / End
G-Code (dwa `<textarea>` — `headerText`/`footerText`, tekst wolny,
commit `onBlur`). Trwałe w `localStorage` pod kluczem
`simplecam.machine` (`src/lib/machineStorage.ts`), osobno od presetów
wizarda. Domyślnie `DEFAULT_MACHINE_SETTINGS` (X=5000mm, Y=5000mm,
Z=1000mm, `src/types/machine.ts`) — appka bez konfiguracji zachowuje
się jak z bardzo dużym stołem, jedna wspólna logika (brak osobnej
gałęzi "nieskonfigurowane").

Wizard nie zna pozycji zerowania materiału na stole — `resolvePoints()`
liczy wszystko względem `(0,0)` programu, które fizycznie może leżeć
gdziekolwiek. Jedyny niezmiennik niezależny od zerowania to **rozpiętość
wzorca (max−min) na osi ≤ całkowity skok maszyny na tej osi**. Dwa
mechanizmy z tego korzystają:
- **Twardy `min`/`max`** na polach przestrzennych (Width/Height, Circle
  Diameter, Offset X/Y, Total Depth, Safe Z) — sanity-ceiling, nie
  gwarantuje dopasowania (nie zna zerowania), tylko nie pozwala wpisać
  absurdu.
- **Miękki, nieblokujący warning na Step 4** (`machineFitWarnings()`,
  `src/lib/validation.ts`, korzysta z `patternSpan()`/`zSpan()`) —
  osobny komunikat per oś, która faktycznie przekracza skok maszyny.
  Nie blokuje Generate.

Ten warning steruje kształtem/kolorem Badge w Step 4 Summary i w Step
Panel Header (`step4Badge()` w `App.tsx`, wspólna dla obu miejsc) —
kształt śledzi wyłącznie stan Generate (X → check), kolor śledzi
wyłącznie dopasowanie do maszyny (indigo/amber → orange, `bg-orange-200
text-black`). Kombinacja "wygenerowano, ale nie mieści się" ma własny
wygląd: check na pomarańczowym tle.

Settings Nav ma też sekcję **„About”** — nazwa appki, numer wersji
(`__APP_VERSION__`, wstrzyknięty z `package.json` przez `define` w
`vite.config.ts`, typ w `src/vite-env.d.ts`) i "Envisioned by
ThingsByPluzz" (ten sam tekst też pod podtytułem w Header).

### Overlay presetów w 2D/3D Preview

W Header, obok Preset Bar (`[1]…[5]`), jest Icon Button "oko"
(`EyeIcon`) — globalny toggle `overlayEnabled`. Gdy aktywny, klik w
zajęty slot presetu **nie ładuje** go — przełącza jego członkostwo w
`overlaySlots` (grubsza ramka + checkmark), usuwanie (hover "×") jest
ukryte. Renderuje się **w 2D i 3D jednocześnie**, bez auto-przełączania
zakładek — pełny render per nałożony preset, bez rozróżnienia kolorem
per-slot. Nakładki rysowane/dodawane pierwsze, żywy wzorzec (gdy w
ogóle renderowany) ostatni. Wyłączenie oka czyści `overlaySlots`.

Żywy wzorzec ("preset 0") **nie jest renderowany razem z** nałożonymi
presetami — `showActivePattern` w `drawToolpath()`/
`buildToolpathScene()` jest `false` podczas aktywnego overlaya, wraca
`true` po wyłączeniu. `canGenerate` (`App.tsx`) jest `false`, gdy
overlay aktywny — Generate byłby "w ciemno", skoro żywy wzorzec nie
jest widoczny.

Kamera 3D re-frame'uje się (odległość/target, **bez** zmiany kąta) przy
zmianie zestawu nałożonych presetów — ta sama matematyka co Fit View.
Zwykła edycja żywego wzorca nadal nie rusza kamery. 2D Preview nie ma
pojęcia kamery-kąta, więc zmiana selekcji overlaya zawsze wymusza pełny
re-fit. Pływający baner "Preview mode" pokazuje się nad Preview
Viewport, gdy overlay jest aktywny. Ramka wokół grupy presetów + oka
widoczna tylko, gdy overlay jest aktywny (kolor, nie `border-width` —
bez skoku layoutu).

`src/lib/overlayParams.ts` (`deriveOverlayParams()`) to jedyna czysta
funkcja w tym mechanizmie — iteruje po `PRESET_SLOT_IDS` (stabilna
kolejność `[1]…[5]`), zmemoizowana w `App.tsx` (bez tego trafia jako
nowa referencja do efektu przebudowującego scenę 3D przy każdym
renderze).

### Motywy (Theme) i Palety kolorów podglądu 2D/3D

Dwie niezależne, komplementarne osie wizualne, obie sterowane z
Settings Nav item **"Appearance"**, obie trwałe w `localStorage` pod
kluczem `simplecam.appearance` (`src/lib/appearanceStorage.ts`,
`AppearanceSettings`) — osobno od `simplecam.machine`, bo to
preferencja UI, nie fizyczna cecha maszyny.

**Theme** (`ThemeId`, `src/types/theme.ts`, `THEME_LIST`) reskinuje
cały chrom appki (Header, Wizard Section, Preview Section, Settings
Modal) przez CSS custom properties w `src/index.css`
(`[data-theme="..."]` bloki + `.dark` warianty, `@theme inline`
rejestruje je jako realne utility Tailwinda: `bg-bg`, `text-fg`,
`border-field-border`, `text-accent`, ...). Cztery motywy: **Sloppy
Indigo** (domyślny, brak atrybutu `data-theme`), **Shopfloor Amber**,
**Arcade Studio Restrained**, **Arcade Studio Full Neon** — pełne specy
w `design_shopfloor_amber.md`/`design-arcade-restrained.md`/
`design_arcade_full_neon.md`. Wybór w Settings — rząd kart ze swatchami
(light+dark dot), pierwsza kontrolka w sekcji Appearance.
`useChromeTheme(themeId)` w `App.tsx` ustawia/usuwa atrybut
`data-theme` na `<html>`. Dodanie nowego motywu: nowy blok
`[data-theme="..."]` (light) + `.dark` wariant w `index.css`, wpis w
`THEME_LIST`, wpis w `FIXED_COLORS`/`DEFAULT_ACCENTS` w `palettes.ts` —
**żadnych zmian w komponentach**, pod warunkiem że nowy blok definiuje
KAŻDY token, który istnieje w pozostałych blokach (patrz
komentarz-banner nad blokami motywów w `index.css` — łatwo przeoczyć
nowo dodany token przy kolejnym motywie).

Oba warianty Arcade Studio są **dark-only** — blok light i `.dark` mają
identyczną zawartość (przełącznik dark/light fizycznie działa, po
prostu nie zmienia niczego wizualnie przy tych motywach), zamiast
sprzęgać Theme z dark/light (formalnie dwie niezależne osie). Arcade
wprowadza też dwu-akcentową semantykę: **cyjan** = struktura/nawigacja
(ikony, aktywny Tab, aktywny blok, wolny slot presetu w Step 4 — patrz
niżej), **róż** = dane użytkownika/wybór/commit (zaznaczona opcja w
OptionButton/toggle, wartości liczbowe w `MiniStat`, główne przyciski)
— przez nowe tokeny `--selected-border`/`--selected-fg`/`--stat-value`
obok istniejących `--accent-*`; dla Sloppy Indigo/Shopfloor Amber to
zwykłe aliasy (`var(--accent-strong)` itd.), więc wyglądają identycznie
jak przed wprowadzeniem Arcade. Dodatkowe efekty tylko-Arcade:
`--glow-*`/`--frame-glow`/`--preview-inset` (box-shadow, `none` dla
pozostałych motywów, konsumowane wprost przez `shadow-[var(--glow-
accent)]` w JSX, bez wpisu do `@theme`), `--scan` (CRT scanline, tylko
Full Neon), `--ui-font` (Space Grotesk z Google Fonts w `index.html`,
pozostałe motywy dziedziczą domyślny stos Tailwinda przez fallback w
`var(--ui-font, ...)`). Wordmark "OnlyPaths" w Headerze jest
dwukolorowy (`--wordmark-only`/`--wordmark-paths`, + opcjonalny
`--wordmark-*-glow` text-shadow tylko dla Arcade) zamiast wprost
`text-fg`/`text-accent`.

**Preview Color Palette** (`PaletteId`, `src/config/palettes.ts`)
zmienia tylko kolory "akcentowe" — `toolpath`/`rapid`/`hole`/`grid` (2D
i 3D) — nie rusza osi X/Y, origin, wektora offsetu ani **tła** podglądu
(`background`), bo to konwencja CNC/semantyczna i, dla tła, własność
Theme, nie Palety. 4 palety: **Default** (natywny wygląd aktywnego
Theme — jedyna, która różni się per Theme), **Ocean**, **Ember**,
**Violet** (theme-independent, te same wartości niezależnie od
wybranego Theme). `getFixedColors(themeId, isDark)` (osie/origin/
offset/tekst/**tło** — jeden zestaw per Theme, wspólny dla każdej
Palety) i `getPaletteAccents(paletteId, isDark, themeId)`
(grid/toolpath/rapid/hole — `Default` czyta `DEFAULT_ACCENTS[themeId]`,
pozostałe trzy z `ALTERNATE_PALETTES`, ignorując `themeId`) — jedyne
źródło prawdy dla kolorów obu podglądów, konsumowane bezpośrednio jako
JS hex/numeryczne wartości przez `drawToolpath.ts`/`buildScene.ts`
(`hexToThreeColor()` konwertuje hex-string na numeryczny kolor
Three.js), nie przez CSS custom properties. **Tło (`background`) żyje w
`FixedColors`, nie w `PaletteAccents`** — świadoma decyzja: przełączanie
Preview Color Palette nigdy nie zmienia tła 2D/3D Preview, tylko Theme
robi to.

Kolor wypełnienia bryły materiału/otworu w podglądzie (`opacity`, oba
podglądy, wszystkie motywy): **0.3** — jednolita wartość, dobrana
wzrokowo w zewnętrznym "Palette Bench" (poza repo, jednorazowy design
tool, nie utrzymywany w projekcie).

### Otwarta/zamknięta geometria bryły Outline w 3D (+ "stock" cap)

Otwarte/zamknięte zależy od **fizycznego znaczenia trybu offsetu**, nie
kształtu — **Outside** = kształt to lita, zachowana część → zamknięta
geometria (`BoxGeometry`/`CylinderGeometry` bez otwartych końców);
**Inside** = materiał usunięty ze środka, pustka jak otwór/kieszeń →
otwarta geometria; **On-line** = bez znaczenia fizycznego przy zerowym
offsecie → zostaje otwarta. Jednolicie dla Circle i Rectangle — dla
Rectangle realizowane przez ukrycie górnej/dolnej ściany `BoxGeometry`
(indeksy grup materiałów `+y`/`-y`, dokładnie oś pionowa/głębokości w
mapowaniu `toThree()`) osobnym niewidocznym materiałem, nie przez
ręczną geometrię "tunelu". Hole(s) bez zmian — brak konceptu offset
mode, zawsze otwarte.

Płaska "podkładka" (stock cap, `buildStockCapObject()` w `buildScene.ts`)
na wysokości `Z=0`, zbudowana `THREE.Shape` + `shape.holes` (natywna
tesselacja Three.js, bez CSG), ogranicza się do tego samego zasięgu
widocznej siatki/płaszczyzny Z=0. **Zakres:** Hole(s) — zawsze, jedna
wspólna podkładka z N okrągłymi otworami. Outline Inside — zawsze,
jeden otwór w kształcie nominalnej granicy. Outline Outside — bez
podkładki (zamknięta bryła wystarcza). Outline On-line — hybrydowo: dwie
realne krawędzie (`nominal − toolRadius` i `nominal + toolRadius`,
`onLineCircleEdges()`/`onLineRectDimensions()`) — wewnętrzna renderowana
jak Outside (zamknięta, samodzielna bryła — pokazuje, że bez mostków
byłaby fizycznie odseparowaną wyspą), zewnętrzna jak Inside (otwarta
ściana + podkładka z otworem na tym promieniu). Kolor podkładki:
`theme.hole` przy opacity 0.3 (ten sam co ściany). Podkładka i ściany
ignorują tabs (mostki), tak jak bryły otworu/kształtu już wcześniej.
Podkładka pomijana w trybie overlay — `showActivePattern` już to
rozstrzyga.

**`Start Z` nie wpływa w ogóle na pozycję ani wysokość podkładki/bryły**
(`BL-37`, ponownie rozważone) — górna ściana zamkniętej bryły (Outline
Outside/On-line inner) i stock cap zawsze siedzą na `Z=0`, wysokość
bryły to zawsze dokładnie `totalDepth`. Wcześniej (przed `BL-37`)
siedziały na `Z=+startZ`, na założeniu, że cała ścieżka narzędzia
(łącznie z odcinkiem powyżej rzeczywistego materiału, pokonywanym na
posuwie roboczym zanim frez faktycznie dotknie materiału) powinna
zostać wizualnie "w środku" bryły. Sesja `/grill-me`
(2026-09-20) obaliła to założenie: `Start Z` to margines ostrożnego
najazdu na posuwie roboczym (na wypadek niedokładnego zerowania Z), nie
wysokość materiału — `totalDepth` jest i tak zakotwiczone do `Z=0`
niezależnie od `Start Z` (dno cięcia to zawsze `-totalDepth`, patrz
`helix.ts`/`standardHole.ts`). Dziś odcinek ścieżki narzędzia między
`Start Z` a `Z=0` celowo wystaje ponad bryłę — to uczciwy obraz tego, co
faktycznie się dzieje (najazd na posuwie roboczym w powietrzu, zanim
frez dotknie materiału), nie błąd. Ruch szybki `Safe Z → Start Z`
(`rapidZLineObjects()`) jest tym niedotknięty — to osobny, realny odcinek
G0, niezwiązany z pozycją bryły. Dotyczy tylko Hole(s) i Outline —
Surface ma osobną, już wcześniej ustaloną logikę bryły "pozostałego
materiału" (patrz sekcja Surface w "Kluczowe decyzje projektowe" wyżej).

Podkładka renderuje się `SOLID_CAP_Z_LIFT` (0.02mm) powyżej `Z=0`, nie
dokładnie na nim — inaczej podkładka i płaszczyzna materiału (zawsze
`Y=0`) lądowałyby dokładnie w tej samej płaszczyźnie, co z-fightuje
(widoczne jako migotanie/mora). Odkąd podkładka/bryła zawsze siedzą na
`Z=0` (nie tylko przy domyślnym `Start Z = 0` jak dawniej), epsilon
dotyczy teraz **zawsze**, nie tylko warunkowo. Epsilon większy niż
odstęp siatki od płaszczyzny (0.01) też, żeby nie kolidować z siatką.
**Ten sam epsilon dotyczy każdej zamkniętej ściany Outline** —
Circle/Rectangle w trybie Outside i wewnętrzna "wyspa" w On-line mają
realną górną ścianę bryły dokładnie na wysokości `Z=0` (to nie osobny
obiekt jak stock cap, tylko domyślna geometria
`CylinderGeometry`/`BoxGeometry`), więc bez tego samego traktowania
z-fightowałyby z płaszczyzną materiału identycznie jak podkładka.
`buildRectWallMesh()` podnosi się, gdy `closed`;
`buildOutlineCirclePatternObjects()` — tylko te dwie gałęzie, gdzie
ściana jest faktycznie zamknięta. Otwarte ściany (Inside, zewnętrzna
ściana On-line) nie mają tam żadnej geometrii, więc zostają bez zmian.

### Przezroczystość i kolejność renderowania brył 3D

Trzy reguły materiałowe, ustalone po tym jak bryła "pozostałego
materiału" Surface (i analogicznie zamknięte ściany Outline) potrafiła
znikać albo zmieniać jasność zależnie od kąta kamery i Offset X/Y —
wyłącznie warstwa renderowania Three.js, silnik G-code nigdy nie był
dotknięty:

- **`depthWrite: false` na WSZYSTKICH przezroczystych obiektach sceny** —
  płaszczyźnie materiału, siatce, stock capie (`buildToolpathScene()`/
  `buildStockCapObject()`) i **każdej bryle wzorca** (cylinder wiercenia
  Hole(s), ściana/cap Outline Circle w `wallMaterial()`,
  `buildRectWallMesh()` — więc też Outline Rectangle i Surface). Wszystkie
  są z założenia czysto wizualnym odniesieniem, nigdy realnym
  przesłaniaczem — ale przy 0.6 opacity w dark mode są wystarczająco
  "gęste", że domyślny `depthWrite: true` pozwalał transparent-sortowi
  Three.js (sortowanie po odległości od kamery) narysować jeden obiekt PO
  drugim siedzącym za nim i wyczyścić go z bufora głębokości — czysty
  efekt "znika/pojawia się", nie migotanie. Stock cap ma dodatkowo swój
  własny wariant tego problemu: to jeden duży płaski quad rozciągnięty na
  cały widoczny obszar siatki, z wyciętym otworem dokładnie na śladzie
  każdego otworu/konturu — przy patrzeniu pod ostrym kątem (typowo dla
  otworu najbliższego kamerze, z powodu perspektywy) promień patrzenia w
  głąb otworu przecina płaszczyznę capu POZA wyciętym otworem, zanim
  dotrze do głębokiego punktu toolpath. Bryły wzorca (cylinder/ściany)
  dostały tę samą poprawkę osobno, później — pojedynczy wzorzec cierpiał
  na to najwyżej w niewielkim stopniu (własne nakładanie się bliskiej/
  dalekiej ściany tej samej bryły, patrz `FrontSide` niżej), ale tryb
  **overlay presetów** (BL-3) prowadzi kilka NIEZALEŻNYCH wzorców przez
  ten sam `allPatterns`/`buildPatternObjects()` loop
  (`buildToolpathScene()`) — ich bryły mogą wylądować blisko siebie na
  ekranie, i bez tej poprawki bryła jednego presetu potrafiła wygrać test
  głębokości przeciw bryle/toolpathowi innego presetu, twardo go
  chowając zamiast blendować, z tym, "który wygrywa", zmieniającym się
  przy najmniejszym ruchu kamery. `depthTest` zostaje włączony wszędzie
  (wciąż poprawnie chowają się za realnie nieprzezroczystymi obiektami,
  np. znacznikiem originu).
- **`renderOrder = -1` na płaszczyźnie materiału, siatce i stock capie.**
  Samo wyłączenie `depthWrite` usuwało całkowite znikanie, ale nie
  niespójną jasność — kolejność blendowania (tło PRZED czy PO bryle)
  nadal zależała od transparent-sortu. Wymuszenie tła jako
  zawsze-rysowanego-najpierw usuwa tę niejednoznaczność: każda bryła
  wzorca blenduje się na wierzchu w stałej kolejności, niezależnie od
  kamery.
- **`side: THREE.FrontSide` zamiast `DoubleSide` dla każdej zamkniętej
  bryły** (`buildRectWallMesh()`, `buildOutlineCirclePatternObjects()`)
  — WebGL nie sortuje trójkątów wewnątrz jednego draw call po
  głębokości, więc `DoubleSide` na przezroczystej, zamkniętej bryle
  potrafi pod pewnym kątem pokazać bliską i daleką ścianę TEGO SAMEGO
  obiektu naraz, blendując je w przypadkowej kolejności (niespójne
  pociemnienie zależne od kąta). Zamknięta bryła nie ma niczego pustego
  do zajrzenia do środka, więc `FrontSide` (tylko bliższa ściana) jest
  poprawny i przy okazji usuwa ten artefakt. Otwarte ściany (Inside,
  zewnętrzna ściana On-line, i cylinder wiercenia Hole(s), zawsze
  otwarty) zostają `DoubleSide` — tam trzeba widzieć wnętrze z góry/od
  środka. Stock cap (`buildStockCapObject()`), jako płaski, zerowej
  grubości kształt (nie bryła objętościowa), nie podlega temu artefaktowi
  wcale — jego `DoubleSide` zostaje bez zmian.
  Skutek uboczny `FrontSide`: przypadkowe nakładanie się ścian
  `DoubleSide` było jedyną wizualną wskazówką, że zamknięta bryła to
  w ogóle 3D (goły `MeshBasicMaterial` nie ma modelu oświetlenia) — bez
  niego bryła czytała się jako płaski zabarwiony kształt. Naprawione
  **sztucznym cieniowaniem**: ścianki boczne KAŻDEJ bryły — otwartej i
  zamkniętej, box i cylinder, łącznie z cylindrem wiercenia Hole(s) —
  rysowane odcieniem `theme.hole` pomnożonym przez `WALL_SHADE_FACTOR`
  (`buildScene.ts`, dziś `0.5`) niż górna/dolna nakrywka (albo, dla
  otwartych brył bez własnej nakrywki, niż sąsiadujący stock cap) —
  identycznie jak płasko cieniowany sprite izometryczny, niezależne od
  kamery. Pierwotnie (`0.6`, i tylko dla zamkniętych brył) ściany
  otwarte zostawały jednolitym kolorem na założeniu, że widoczne wnętrze
  przez brakującą nakrywkę samo w sobie wystarczy jako wskazówka 3D — to
  założenie okazało się fałszywe, gdy sąsiadujący, osobny stock cap
  używa dokładnie tego samego, niepociemnionego koloru: ściana i cap
  zlewały się w jedną płaską plamę. Stąd jednolita zasada dziś: KAŻDA
  ściana boczna (otwarta czy zamknięta) jest ciemniejsza niż KAŻDA
  sąsiadująca nakrywka/góra, bez wyjątków.

### Etykiety siatki w 3D Preview

Siatka 3D (`GridHelper`, `buildScene.ts`) jest wyrównana do "ładnych"
wartości CNC (ciąg 1-2-5-10-20-50..., `niceStep()` — eksportowana z
`preview/drawToolpath.ts`, współdzielona z 2D) zamiast starych stałych
10 podziałów wyśrodkowanych na bounding-boxie wzorca: środek siatki
jest domykany do najbliższej wielokrotności kroku (`gridCenterX`/
`gridCenterZ`), liczba komórek dobrana tak, by pokryć dzisiejszy zasięg
(`gridHalfCells`/`gridSize`/`gridDivisions`) — linie siatki są więc
realnymi współrzędnymi, nie tylko dekoracją. Płaszczyzna materiału
(`plane`) i stock cap dzielą ten sam, domknięty do kroku środek/rozmiar.

Etykiety liczbowe (osobne sprite'y tekstowe, `createTextSprite()`) są
na zewnątrz płyty, na wszystkich **czterech brzegach** kwadratu siatki
(nie jeden bok na oś, jak w 2D) — kamera 3D swobodnie orbituje, więc
któraś krawędź zawsze jest zwrócona do niej. `0` pokazuje się jak każda
inna wartość — brzeg to kompletna, niezależna skala, nie zakłada, że
etykieta originu `"0,0"` akurat jest w kadrze. Tekst w canvasie jest
centrowany (`ctx.textAlign = 'center'`, na `canvas.width/2,
canvas.height/2`) — stare lewe wyrównanie było niezauważalne dla
pojedynczych znaków ("X"/"Y"), ale wielocyfrowe liczby widocznie
"uciekały" w lewo od swojej linii siatki.

**Stały rozmiar ekranowy niezależny od zoomu.** Wszystkie sprite'y
tekstowe w scenie (origin `"0,0"`, końce osi `"X"`/`"Y"`, etykiety
siatki) mają `sprite.userData.pixelHeight` (piksele CSS) i są
przeskalowywane **co klatkę** w pętli `animate()` (`Scene3D.tsx`) przez
`rescaleLabelForConstantScreenSize()` (`buildScene.ts`) — standardowa
formuła billboardu dla kamery perspektywicznej (`2 * distance *
tan(fov/2) / viewportHeightPx` = jednostki świata na piksel). Bez tego
etykiety w jednostkach świata kurczyłyby się do nieczytelnych kropek
przy oddaleniu kamery i puchły przy mocnym przybliżeniu.

Rozmiar (`GRID_LABEL_SIZE_PX`, Small/Medium/Large — nazwane rozmiary,
nie dowolna wartość w pikselach, bo sensowny zakres jest wąski) jest
wspólny dla originu/`"X"`/`"Y"`/etykiet siatki — jedno ustawienie na
wszystko, Settings → Appearance → "Grid Labels"
(`AppearanceSettings.grid3DLabelSize`, `Grid3DLabelSize` w
`types/appearance.ts`). Checkbox "Show grid coordinate labels"
(`grid3DLabelsEnabled`) wyłącza wyłącznie budowanie sprite'ów siatki —
origin/osie zostają zawsze widoczne niezależnie od niego.

### Zoom/pan na 2D Preview

Scroll = zoom-to-cursor (punkt pod kursorem zostaje na miejscu), prawy
przycisk myszy + przeciąganie = pan (menu kontekstowe przeglądarki
wygaszone nad Preview Viewport). Zoom ograniczony względnie do skali
fit-to-data (`0.2×`–`20×`, `MIN_ZOOM_FACTOR`/`MAX_ZOOM_FACTOR`,
`src/components/preview/camera2d.ts`). Bez gestów dotykowych (poza
zakresem, `BL-8`). Pierwsze zamontowanie auto-dopasowuje kamerę
jednorazowo; dalsze edycje parametrów nie ruszają kamery; zmiana
selekcji overlaya wymusza pełny re-fit (2D nie ma pojęcia "kąta" do
zachowania jak 3D). Fit View — Icon Button w prawym dolnym rogu Preview
Viewport, ta sama pozycja/styl co w 3D Preview.

`camera2d.ts` to czysty moduł matematyki kamery 2D (analogiczny do
`preview3d/cameraPresets.ts`, bez rotacji — `Camera2D = { scale,
centerX, centerY }`): `computeFitCamera()`, `zoomAt()`, `panBy()`,
`worldToScreen()`/`screenToWorld()`, `clampScale()`. Siatka i etykiety
osi w `drawToolpath.ts` liczą się z **widocznego viewportu** (pochodnego
z kamery), nie z zasięgu danych — gęstość siatki skaluje się z zoomem,
a zoom-out poza fit nigdy nie odsłania obszaru bez siatki.

### Pola liczbowe w wizardzie

Wszystkie `<input type="number">` na Kroku 2/3 idą przez hook
`useNumberField(value, onCommit)`
(`src/components/wizard/useNumberField.ts`) — oddziela wyświetlany
tekst inputa od zatwierdzonej wartości, żeby pole dało się realnie
wyczyścić (bezpośrednie sterowanie `value={Number(text)}` cofa puste
pole do `"0"` w locie, bo `Number('')` daje `0`). Commit dzieje się na
**każdym** naciśnięciu klawisza, które parsuje się do skończonej liczby
(`Number.isFinite`) — Preview zostaje live. `onBlur` resynchronizuje
wyświetlany tekst z powrotem do `String(value)` (porządkuje puste
pole/końcową kropkę), nie bramkuje aktualizacji Preview. Stosowane do
wszystkich 9 pól Kroku 2 i 5 pól Kroku 3. Pola X/Y/Z travel w Settings
Modal używają osobnego wzorca (bufor tekstu + commit wyłącznie
`onBlur`, bo to zapis do `localStorage`, nie live Preview) — ich
`onChange` zapisuje surowy string wprost, bez przechodzenia przez
`Number()` przed wyświetleniem.

Wszystkie te pola renderują się przez `NumberInput`
(`src/components/wizard/NumberInput.tsx`), nie goły `<input
type="number">` — patrz opis w Struktura katalogów niżej.

### Pola checkbox

Wszystkie 4 checkboxy appki (Enable Tabs w Step2Geometry Hole(s)/Outline,
3 opcje w Step4Output, "Show grid coordinate labels" w Settings →
Appearance) idą przez `Checkbox`
(`src/components/wizard/Checkbox.tsx`), nie goły `<input
type="checkbox">` — ten sam wzorzec co `NumberInput` (chowa natywny,
niestylowalny box i rysuje własny, `<input>` zostaje zamontowany
`sr-only` dla realnej semantyki/klawiatury/screen-readera). Kolor
zaznaczonego stanu to dokładnie ten sam zestaw tokenów co zaznaczona
opcja w `OptionButton`/toggle (`border-selected-border`/`bg-selected-bg`/
`text-selected-fg` + `shadow-[var(--glow-selected)]` dla Arcade) — nie
`--accent` — bo checkbox to ta sama kategoria "wybór/commit użytkownika"
(róż w Arcade Studio), patrz "Motywy (Theme) i Palety..." niżej. Patrz
opis w Struktura katalogów niżej.

### Tabs (mostki) dla operacji Hole(s) i Outline

Zapobiegają całkowitemu odseparowaniu wyciętej części przy
przewierceniu na wylot — bez nich pierścień/kontur po zamknięciu nie
jest niczym trzymany. Checkbox "Enable Tabs" w Step2Geometry (za
`border-t`), odsłania Tab Height / Tab Width (długość łuku w mm, nie
stopnie) / Tab Count — jeden zestaw parametrów na job, jednolicie dla
każdego otworu we wzorcu (Hole(s)) albo per bok (Outline Rectangle).

**Mechanika:** cięcie płycej niż `totalDepth − tabHeight` jest bez
zmian (pełny pierścień/kontur). W ostatnich `tabHeight` mm ("pasmo
mostków") ruch przechodzi na płaskie przejścia co `stepdown`, pomijając
łuk/odcinek mostka: najazd na wysokość góry pasma, przejazd nad
mostkiem, powrót w dół — najazd/powrót zawsze osobne, pionowe linie G1
przy stałym XY, nigdy ruch po przekątnej przez materiał mostka. Dla
Helixa spirala kończy się dokładnie na górze pasma (druga, niezależna
`computeDepthPasses()`), plus jedno dodatkowe w pełni płaskie przejście
tuż po spirali (czyści rampę śrubową spirali do jednej płaskiej
powierzchni, zanim zacznie się zagłębianie z pomijaniem mostków — bez
tego pierwsze przejście w paśmie ścinałoby nierówno, bo spirala nie
zostawia płaskiej powierzchni na granicy).

Rozstawienie mostków automatyczne i równomierne, przesunięte w fazie o
pół kroku (środek pierwszego mostka na połowie kroku, nie na kącie/
pozycji 0 — punkt startowy przejścia nigdy nie trafia w mostek).
`computeTabRanges()`/`tabbedCirclePass()` (`src/lib/tabs.ts`, Hole(s) i
Outline Circle) i `computeRectTabRanges()`/`tabbedRectanglePass()`
(`src/lib/outlineRectangleTabs.ts`, Outline Rectangle, per bok) liczą
listę kątów/pozycji jako **sumę** równomiernego próbkowania **i**
dokładnych granic każdego mostka wymuszonych jako punkty łamania —
gwarantuje dokładny rozmiar każdego mostka niezależnie od rozdzielczości
próbkowania.

Wymusza interpolację G1 dla całego programu (patrz wyżej).
Walidacja (`src/lib/validation.ts`): `isTabHeightValid()` — `0 <
tabHeight < totalDepth`; `isTabWidthValid()` — `tabCount × tabWidth <`
obwód ścieżki narzędzia. `MAX_TAB_COUNT = 20` (arbitralny sufit
spinnera). Obie prawdziwe wprost, gdy tabs wyłączone.

Podglądy 2D i 3D renderują realne przerwy: `drawGappedCircle()`/
`drawGappedRectangle()` (`drawToolpath.ts`) rysują przerwaną linię
(`ctx.setLineDash()`, stała `TAB_DASH`) na łuku/odcinku mostka zamiast
zwykłej pustki; `tabbedCirclePoints3D()`/`tabbedRectanglePoints3D()`
(`buildScene.ts`) emitują `Vector3` tą samą matematyką co silnik.
Świadomie poza zakresem: bryła otworu/kształtu (półprzezroczysty
cylinder/box) zostaje pełnym, niepodziurawionym kształtem — tylko linia
ścieżki narzędzia dostała dokładną geometrię przerw.

Domyślne rozmiary mostków konfigurowalne w Settings Nav item **"Tabs"**
(`defaultTabHeight`/`defaultTabWidth`/`defaultTabCount` w
`MachineSettings`, domyślnie `1`/`3`/`3`) — aplikowane w
`Step2Geometry.tsx` przy każdym przejściu checkboxa "Enable Tabs" z
false na true (zawsze nadpisuje bieżące wartości pól świeżymi
domyślnymi, także po wcześniejszym odznaczeniu w tej samej sesji).

### localStorage — auto-save + presety

Jeden klucz `localStorage` (`simplecam.storage`, `src/lib/storage.ts`),
jeden JSON `{ version, slots: { "0"…"5" } }`. Slot `"0"` = niewidoczny
auto-save bieżącego stanu, zapisywany wyłącznie przy kliknięciu
**Generate** (nie co zmianę parametru), wczytywany raz przy starcie
appki — jeśli coś jest, wizard od razu otwiera się na Kroku 4 z
bannerem "Restored from your last session" (znika po pierwszej zmianie
parametru albo Generate). Sloty `"1"`–`"5"` = nazwane presety, widoczne
jako `[1]…[5]` w Preset Bar (Header) — puste wyszarzone/nieklikalne
(numer slotu), zajęte klikalne (klik = load, natychmiastowy, bez
potwierdzenia), pokazują ikonę metody/patternu, którą przechowują, z
Icon Button "×" przy hoverze do usunięcia (z potwierdzeniem). Zapis do
slotu — sekcja "Save to preset" na Kroku 4, z potwierdzeniem przy
nadpisaniu zajętego. Etykieta slotu to auto-opis z parametrów
(`presetLabel()`, `src/lib/presetLabel.ts`, np. `"5-Holes Circle •
Helix • ⌀8mm"` dla Hole(s), `"Rectangle 50×30 (Inside) • Ramp"` dla
Outline — pattern/kształt jako główna tożsamość, method drugorzędny).
Migracja schematu: płytki merge per-sekcja z `DEFAULT_WIZARD_PARAMS`
przy wczytaniu. Błędy (private mode, quota exceeded, uszkodzony JSON) —
cichy fallback do wartości domyślnych + `console.warn`, appka nigdy się
nie wywala. Świadomie poza zakresem: nazywanie presetów przez usera
(tylko auto-opis), "Reset to defaults", grupowanie kilku operacji pod
jednym presetem (sprzeczne z "jedno narzędzie na wygenerowany plik").

### `G4 P<sekundy>` i `buildFooter()`

`G4 P` (dwell po starcie wrzeciona) konwertowane per dialekt — patrz
"Dialekt G-code" wyżej. `buildFooter()` **celowo nie robi** retraktu na
Safe Z — emituje wyłącznie `M5` (pod `output.spindleStopEnd`) i
ewentualne `G0 X0 Y0` (pod `returnOriginEnd`). Retrakt robi
bezwarunkowo pętla po punktach w `assembleProgram()`, po **każdym**
otworze łącznie z ostatnim — narzędzie jest już na Safe Z, zanim stopka
w ogóle zacznie. `assembleProgram()` (`src/lib/program.ts`) owija cały
program: opcjonalny user header (`MachineSettings.headerText`, dosłowny
tekst) z komentarzami `; --- User header ---`/`; --- Application code
---` **tylko** gdy `headerText` niepuste, istniejący `buildHeader()`,
pętla po punktach, `buildFooter()`, opcjonalny user footer
(`footerText`, też dosłowny) pod komentarzem `; --- User footer ---`,
i na końcu bezwarunkowe `M30`/`M2` — musi być faktycznie ostatnią
linią, więc user footer ląduje przed nim, nie po.

## Hosting testowy

Aplikacja jest wdrażana ręcznie (nie CI/CD) na
`https://onlypaths.pluzz.pl` (subdomena na cPanelu użytkownika, Apache
2.4.68, SSL aktywny). `npm run deploy` buduje (`vite build`) i wysyła
`dist/` przez FTP (`scripts/deploy.mjs`, biblioteka `basic-ftp`) —
domyślnie explicit FTPS (`AUTH TLS`, port 21, `secure: true`);
`FTP_SECURE=false` w `.env` jako awaryjny fallback do plain FTP. Każdy
deploy usuwa tylko zdalny `assets/` (zahashowane nazwy plików inaczej
kumulowałyby się bezterminowo) i nadpisuje własne pliki po nazwie
(`index.html`, `.htaccess`, `robots.txt`, `favicon.svg`) —
**świadomie NIE** pełny `clearWorkingDir()`: root subdomeny zawiera też
pliki zarządzane przez cPanel (`cgi-bin/`, `php.ini`), których pełne
wymiatanie by skasowało. Konto FTP (`claude@onlypaths.pluzz.pl`) ma
domyślnie katalog domowy ustawiony na podfolder `claude/` wewnątrz
docroota — trzeba to poprawić w cPanelu, inaczej appka wychodzi pod
`onlypaths.pluzz.pl/claude/` zamiast pod rootem. Dane logowania w
lokalnym `.env` (gitignored, szablon w `.env.example`) — czytane przez
natywne `node --env-file=.env` (Node ≥20.6, brak potrzeby paczki
`dotenv`). `public/robots.txt` (`Disallow: /`) blokuje indeksowanie na
czas testów; `public/.htaccess` ustawia długi cache dla zahashowanych
assetów i `no-cache` dla `index.html`. Brak GitHub Actions/CI mimo że
repo jest na GitHubie — `BL-4` w `ideas.md`, świadomie poza zakresem do
wyjścia z fazy testów. Slash command `/deploy`
(`.claude/commands/deploy.md`) odpala `npm run deploy` bez dodatkowej
analizy — lokalny dla tej maszyny, bo `.claude/` jest wykluczone z gita.

## Struktura katalogów

```
src/
  types/wizard.ts          — typy WizardParams + DEFAULT_WIZARD_PARAMS.
                              `operation: 'holes' | 'outline' | 'surface'`,
                              `geometry`/`method` (Hole(s)), `outline`
                              (Outline) i `surface` (Surface) żyją obok
                              siebie — każdy zawsze obecny w WizardParams
                              niezależnie od aktywnej operacji.
  types/machine.ts          — MachineSettings + DEFAULT_MACHINE_SETTINGS
                              (Machine Settings) — osobny plik od
                              `wizard.ts`, inny rodzaj danych (jeden
                              globalny obiekt, nie WizardParams). Też
                              `Dialect`, `headerText`/`footerText`,
                              `defaultTabHeight`/`Width`/`Count`.
  types/theme.ts             — ThemeId + THEME_LIST (metadane: label,
                              swatchLight/swatchDark dla Settings) — patrz
                              "Motywy (Theme) i Palety..." niżej. Osobny od
                              `config/palettes.ts`: Theme reskinuje chrom
                              appki (przez `index.css`), Palette reskinuje
                              tylko akcenty 2D/3D Preview.
  types/appearance.ts       — AppearanceSettings + DEFAULT_APPEARANCE_SETTINGS:
                              `theme`/`palette` (dwie niezależne osie —
                              patrz niżej) oraz `grid3DLabelsEnabled`/
                              `grid3DLabelSize` (`Grid3DLabelSize`, tylko
                              3D Preview) — osobny od `machine.ts`:
                              preferencje UI, nie fizyczna cecha maszyny.
  index.css                  — `@import "tailwindcss"` + definicje motywów
                              (`:root`/`.dark`/`[data-theme="..."]` bloki
                              CSS custom properties, `@theme inline`
                              rejestruje je jako realne utility Tailwinda)
                              — patrz "Motywy (Theme) i Palety..." niżej.
                              NIE pokrywa kolorów 2D/3D Preview — te żyją
                              w `config/palettes.ts` i trafiają do
                              `drawToolpath.ts`/`buildScene.ts` jako gołe
                              wartości JS, nie przez te custom properties.
  config/palettes.ts        — jedyne źródło prawdy dla kolorów podglądu 2D
                              (`preview/drawToolpath.ts`) i 3D
                              (`preview3d/buildScene.ts`), sparametryzowane
                              po `ThemeId` I `PaletteId` naraz — patrz
                              "Motywy (Theme) i Palety..." niżej.
                              `getFixedColors(themeId, isDark)` — osie
                              X/Y, origin, offset, tekst, holeFill ORAZ
                              **tło** (`background`) — jeden zestaw per
                              Theme, ten sam dla każdej Palety.
                              `getPaletteAccents(paletteId, isDark,
                              themeId)` — grid/toolpath/rapid/hole;
                              `Default` czyta `DEFAULT_ACCENTS[themeId]`
                              (jedyna paleta, która różni się per Theme),
                              Ocean/Ember/Violet z `ALTERNATE_PALETTES`
                              (theme-independent, ignorują `themeId`).
                              `hexToThreeColor()` konwertuje hex-string
                              na numeryczny kolor Three.js — 2D i 3D
                              dzielą też literały kolorów, nie tylko
                              strukturę.
  config/methodMeta.ts      — rejestr metadanych per-method (Helix/Standard:
                              nazwy, ikony, etykiety, `generate()`) — jedno
                              źródło prawdy, nie hardkodować ternary po
                              `method` w komponentach.
  config/surfaceMethodMeta.ts — analogicznie dla Surface (Zigzag/
                              Unidirectional): `SURFACE_METHOD_META`,
                              płaski rejestr jak `methodMeta.ts` (nie
                              bespoke-switch jak `lib/outline.ts` — metody
                              Surface nie są ograniczone per-kształt).
  config/positioningMeta.ts — rejestr metadanych per-pattern (Single/Grid/
                              Grid Centered/N-Holes Circle/Custom: nazwy,
                              ikony, opisy dla kart Kroku 1). Też:
                              `positioningIcon()`/`positioningLines()`/
                              `positioningSummary()` (Step 1 Summary),
                              `patternLabel()` (jednoliniowa etykieta
                              presetu, używana przez `lib/presetLabel.ts`),
                              `patternSlug()` (filename-safe slug, używany
                              przez `lib/download.ts`) — rozpoznają kolaps
                              grid/gridCentered do 2 otworów.
  config/outlineMeta.ts     — analogicznie dla Outline: `outlineShapeLabel()`/
                              `outlineShapeSlug()`.
  config/surfaceMeta.ts     — analogicznie dla Surface (kształt):
                              `SURFACE_SHAPE_META`/`SURFACE_SHAPE_LIST`
                              (Rectangle Cornered/Centered),
                              `surfaceShapeLabel()`/`surfaceShapeSlug()`/
                              `surfaceShapeLines()`/`surfaceSummary()`.
  config/toolDiameterOptions.ts — `TOOL_DIAMETER_OPTIONS`, współdzielone
                              przez Step 2 Hole(s) i Step 2 Outline.
  components/SettingsModal.tsx — Settings Modal. Pięć Settings Nav
                              Items, w tej kolejności: **Machine** (X/Y/Z
                              travel, dialekt, Start/End G-Code),
                              **Tabs** (Default Tab Sizes), **Appearance**
                              (Theme, Preview Color Palette, Grid Labels 3D
                              — patrz "Motywy (Theme) i Palety..." niżej),
                              **Privacy**, **About** (nazwa/wersja appki) —
                              ta ostatnia zawsze na końcu nawigacji.
                              **Privacy** to statyczny tekst w czterech
                              blokach: co appka robi (brak backendu/bazy/
                              kont, wszystko liczone lokalnie), co i gdzie
                              jest przechowywane (`localStorage`, per-
                              przeglądarka, czyszczone razem z danymi
                              strony albo automatycznie w oknie prywatnym),
                              cookies/tracking (brak w ogóle — nic do
                              opt-outu), i **jawnie ujawniony jedyny wyjątek**:
                              arkusz stylów Google Fonts (`Space Grotesk`,
                              ładowany bezwarunkowo w `index.html` dla
                              motywów Arcade Studio) wysyła standardowe dane
                              żądania (w tym adres IP) do Google — to jedyne
                              połączenie sieciowe appki z osobą trzecią.
                              Sekcja GDPR świadomie **nie** twierdzi zerowego
                              przesyłu danych bez zastrzeżeń — powołuje się
                              wprost na ten jeden wyjątek zamiast go pomijać,
                              żeby deklaracja została prawdziwa, nie tylko
                              uspokajająca. Bez samodzielnej podstrony —
                              appka nie ma routingu, treść tylko wewnątrz
                              modala. Pola liczbowe Machine/
                              Tabs idą przez `NumberInput` jak w wizardzie
                              (patrz "Pola liczbowe w wizardzie" niżej),
                              ale zachowują własny wzorzec commit
                              (`commitField()`/`handleAdjust()` — bufor
                              tekstu + `onBlur`, klik strzałki commituje
                              od razu zamiast czekać na blur, który mógłby
                              nigdy nie nadejść).
  components/wizard/        — komponenty poszczególnych kroków wizarda.
                              `Step1Positioning.tsx` = wyłącznie operacja +
                              pattern picker, nic liczbowego — pionowy
                              stos operacji (Hole(s)/Outline/Surface
                              rozwinięte z kompaktową listą wariantów w
                              środku; Pocket jako wyszarzone "Coming
                              soon"). `Step2Geometry.tsx` = cienki router
                              na `params.operation` →
                              `Step2GeometryHoles.tsx` /
                              `Step2GeometryOutline.tsx` /
                              `Step2GeometrySurface.tsx`
                              (`SurfaceMethodPicker.tsx` — Zigzag/
                              Unidirectional, wzorzec `OutlineMethodPicker`;
                              toggle Raster Direction/Z-Transition Mode
                              inline w `Step2GeometrySurface.tsx`, bez
                              osobnych plików — dwuopcjowy tekstowy toggle
                              bez rejestru do współdzielenia). Wszystkie
                              pola liczbowe na Krokach 2/3 idą przez
                              `useNumberField()`.
  components/wizard/useNumberField.ts — hook `useNumberField(value, onCommit)`
                              — oddziela wyświetlany tekst inputa od
                              zatwierdzonej wartości, żeby pole dało się
                              realnie wyczyścić bez gubienia live Preview.
                              Zwraca też `onAdjust(delta)` (krok liczony
                              od ostatniej potwierdzonej wartości, nie od
                              transient tekstu — dla `NumberInput`'owych
                              przycisków góra/dół) oraz eksportuje
                              `roundToStepPrecision()` (zaokrągla do
                              1/100mm — bez tego powtarzane dodawanie
                              kroku dziesiętnego trafia na szum float,
                              np. `0.30000000000000004`), reużywaną przez
                              `SettingsModal.tsx`.
  components/wizard/NumberInput.tsx — zamiennik gołego `<input
                              type="number">`: chowa natywny, niestylowalny
                              spinner przeglądarki i renderuje własne dwa
                              małe przyciski góra/dół **obok siebie** (nie
                              jeden nad drugim) w prawym brzegu pola, w
                              pełni na tokenach motywu. Używany wszędzie —
                              w wizardzie (przez `{...xField}` z
                              `useNumberField()`) i w `SettingsModal.tsx`
                              (przez osobny `onAdjust`, patrz wyżej).
  components/wizard/Checkbox.tsx — zamiennik gołego `<input
                              type="checkbox">` (`BL-33`): chowa natywny box
                              (`sr-only`, nie `display:none` — semantyka/
                              klawiatura/screen-reader zostają) i renderuje
                              własny, z `CheckIcon` (`icons.tsx`) w środku
                              gdy zaznaczony. Kolor zaznaczonego stanu —
                              `border-selected-border`/`bg-selected-bg`/
                              `text-selected-fg` + `shadow-[var(--glow-
                              selected)]` — dokładnie ten sam trio co
                              zaznaczona opcja `OptionButton`/toggle
                              (`Step4Output`'owy toggle interpolacji), nie
                              `--accent` — checkbox to ta sama kategoria
                              "wybór/commit użytkownika" (patrz "Motywy
                              (Theme) i Palety..." niżej). `peer`/
                              `peer-focus-visible:` na natywnym incie daje
                              widoczny pierścień fokusu klawiatury (inaczej
                              połknięty przez custom box). Używany wszędzie
                              — w wizardzie (Step2Geometry Hole(s)/Outline
                              "Enable Tabs") i w `SettingsModal.tsx` (Grid
                              Labels), przez `label`/`className`/`children`
                              (ten ostatni dla doczepionego `HintPopover`).
  components/wizard/FieldRow.tsx — `label`/pole/`hint` per wiersz
                              formularza (`Entry Field` + `Hint Button`),
                              `inputClass` (współdzielone stylowanie
                              inputów).
  components/wizard/HintPopover.tsx — Hint Button (ikona "?") + popover z
                              tekstem podpowiedzi, renderowany przez
                              `createPortal` do `document.body`
                              (`position: fixed`, pozycjonowany z
                              `getBoundingClientRect()` ikony + clamp do
                              granic viewportu — omija przycinanie przez
                              `overflow-y-auto` Active Step Panel).
                              Zamyka się na klik na zewnątrz/Escape/scroll;
                              tylko jeden otwarty naraz.
  components/icons.tsx      — zestaw ikon SVG (własne, bez zależności).
  components/preview/       — podgląd 2D.
    ToolpathCanvas.tsx        — React wrapper: <canvas>, devicePixelRatio,
                               ResizeObserver, przerysowanie przy zmianie
                               params/motywu/kamery. Właściciel stanu
                               kamery (`Camera2D`) i natywnych listenerów
                               zoom/pan (wheel, contextmenu, mousedown/
                               move/up na `window`).
    camera2d.ts                — czysta matematyka kamery 2D — patrz
                               "Zoom/pan na 2D Preview" wyżej.
    drawToolpath.ts             — właściwe rysowanie (Canvas 2D API):
                               siatka, osie X (czerwona) / Y (zielona)
                               z grotem strzałki i etykietą na dodatnim
                               końcu, punkt (0,0), dla każdego otworu/
                               kształtu obrys + ścieżka narzędzia +
                               przejazdy szybkie (G0). `buildTheme()`
                               łączy stałe kolory CNC z akcentami
                               wybranej palety. Przyjmuje gotowy
                               `Camera2D` zamiast liczyć skalę/offset od
                               zera z danych przy każdym renderze.
                               Eksportuje `computeToolpathDataBounds()` —
                               jedyny punkt styku z `ToolpathCanvas.tsx`.
                               Reużywa `resolvePoints()` z
                               `lib/positioning.ts`. `drawGappedCircle()`/
                               `drawGappedRectangle()` — przerywana linia
                               na łuku/odcinku mostka, gdy tabs włączone.
                               `niceStep()` (ciąg 1-2-5-10-20-50... dla
                               kroku siatki) eksportowana i reużywana
                               przez `preview3d/buildScene.ts`, żeby
                               siatki 2D i 3D lądowały na tych samych
                               "ładnych" wartościach CNC. `drawSurfaceGeometry()`
                               — linie skanu Surface (ciągła polilinia dla
                               Zigzag, osobne odcinki + przerywany rapid
                               dla Unidirectional) + strzałki kierunku,
                               geometria z `lib/surfaceGeometry.ts`/
                               `lib/surfaceRaster.ts` (te same czyste
                               funkcje, których używa silnik G-code).
  components/preview3d/     — podgląd 3D, doładowywany leniwie.
    Scene3D.tsx                — React wrapper: scena/kamera/renderer/
                               OrbitControls, ResizeObserver +
                               `window.addEventListener('resize', …)`
                               (dodatkowe zabezpieczenie), przyciski
                               widoku (Top/Isometric/Front/Side/Fit
                               View). `handleResize()` odczytuje
                               `window.devicePixelRatio` na nowo przy
                               każdym resize i woła
                               `renderer.setPixelRatio()` ponownie —
                               inaczej zoom przeglądarki zostawia bufor
                               renderera przy starej wartości. Korzeń
                               komponentu (i `ToolpathCanvas.tsx`)
                               używa `flex-1 min-h-0`, nie `h-full
                               w-full` — ten drugi wzorzec (kombinacja
                               `flex-basis:auto` + procentowa wysokość +
                               domyślny `flex-shrink`) potrafi się
                               rozjechać przy reflow. Kamera
                               auto-dopasowuje się (fit na preset
                               `front`) tylko przy pierwszym zbudowaniu
                               sceny, pilnowane przez `hasFramedRef` —
                               **ten ref musi być zerowany na starcie
                               efektu setupującego scenę/kamerę/
                               renderer/controls**, nie tylko
                               inicjowany raz przy `useRef(false)`:
                               React `StrictMode` (`main.tsx`) celowo
                               uruchamia efekt mountujący dwukrotnie na
                               tej samej instancji komponentu (refy
                               przeżywają między przebiegami), więc bez
                               resetu druga, docelowa kamera zostaje bez
                               wywołania `frameCamera()` i ląduje na
                               `(0,0,0)` z zerowym promieniem
                               orbitowania (OrbitControls martwe).
                               `animate()` woła też co klatkę
                               `rescaleLabelForConstantScreenSize()` na
                               każdym sprite'cie etykiety (origin/osie/
                               siatka) — patrz "Etykiety siatki w 3D
                               Preview" wyżej.
    cameraPresets.ts             — `VIEW_PRESETS` (kierunek + up-vector dla
                               top/isometric/front/side) + `frameCamera()`
                               — pozycjonuje kamerę wzdłuż kierunku, w
                               odległości dopasowanej do bounds. Fit View
                               w `Scene3D.tsx` używa tej samej funkcji z
                               AKTUALNYM kierunkiem kamery (nie
                               presetem) — dopasowuje odległość/target
                               bez zmiany kąta. `direction` = pozycja
                               kamery WZGLĘDEM celu (kamera patrzy w
                               stronę `-direction`), wyprowadzona z
                               czystej matematyki CNC i zweryfikowana
                               podstawieniem do wzorów `lookAt`. `front`
                               (domyślny widok otwarcia sceny) patrzy
                               wzdłuż osi Y (środek między ćwiartkami
                               III/IV) z lekkim podniesieniem na Z (daje
                               sygnał głębi przy obrocie OrbitControls —
                               czysto płaski `(0,-1,0)` sprawiał, że
                               drobne przeciągnięcia nie dawały
                               widocznego efektu). `isometric` patrzy w
                               kierunku `+Y` z kamerą nad ćwiartką III
                               (`-X,-Y`) — obrabiane elementy leżą
                               zwykle w ćwiartce I, więc kamera z
                               przeciwległej ćwiartki patrzy "przez"
                               obszar roboczy, nie "zza" niego.
    buildScene.ts               — budowanie obiektów Three.js: płaszczyzna
                               materiału (Z=0) + siatka, osie X/Y przez
                               fizyczny origin z grotem strzałki i
                               etykietą (sprite'y z canvas-texture),
                               punkty helix/standard-hole/outline/surface
                               liczone samodzielnie (mirror pętli silnika,
                               ale `Vector3` zamiast stringów G-code —
                               dzielenie głębokości na przejścia idzie
                               przez wspólne `computeDepthPasses()`;
                               `buildSurfaceToolpathPoints3D()` mirror'uje
                               `lib/surface.ts` dokładnie), bryła
                               finalnego kształtu, `buildStockCapObject()`
                               (patrz "Otwarta/zamknięta geometria..."
                               wyżej — zwraca `null` dla Surface, blok
                               "usuniętego materiału" z `buildRectWallMesh()`
                               już jest tą wizualizacją), przejazdy szybkie
                               między otworami oraz pionowe `G0 Z` wokół
                               każdego otworu.
                               Mapowanie CNC `(x,y,z) → Three (x,z,-y)`
                               (`toThree()`) — CNC Z = Three Y (pionowa
                               oś kamery); minus przy Y jest celowy, nie
                               kosmetyczny: sama zamiana Y↔Z bez negacji
                               to permutacja odwracająca chiralność, a
                               `lookAt()` zawsze buduje bazę kamery
                               prawoskrętnie. Grot strzałki osi Y i
                               (historycznie) pozycja obiektów budowane
                               ręcznie z `p.x`/`p.y` **muszą** przechodzić
                               przez `toThree()`, nie odtwarzać mapowania
                               ręcznie — przy każdej zmianie mapowania
                               grepować `buildScene.ts` pod kątem
                               `.position.set(` używających `p.x`/`p.y`
                               bezpośrednio. Patrz też "Etykiety siatki w
                               3D Preview" wyżej — siatka/płaszczyzna
                               wyrównane do `niceStep()`, etykiety jako
                               sprite'y ze stałym rozmiarem ekranowym
                               (`rescaleLabelForConstantScreenSize()`).
  lib/                       — czysta logika generowania G-code.
    format.ts                 — formatowanie liczb w G-code (4 miejsca po
                                 przecinku, bez zbędnych zer, bez "-0").
    positioning.ts             — `resolvePoints(geometry) → Point2D[]`
                                 (single/grid/gridCentered/circle/custom +
                                 kolaps grid do 2/1 punktów + globalny
                                 offset X/Y jako ostatni krok). Silnik
                                 G-code oraz 2D/3D Preview wołają tę
                                 funkcję bezpośrednio — fizyczny origin/
                                 osie w podglądach się nie przesuwają,
                                 offset rusza tylko otwory. Kolor "meta"
                                 (amber) zarezerwowany dla wektora offsetu
                                 w 2D/3D Preview, inny niż fizyczne osie
                                 czy origin (indigo).
    circle.ts                  — `fullCircleMove()` — wspólna logika pełnego
                                 okręgu (płaskiego lub helikalnego) w obu
                                 trybach interpolacji, z parametrem
                                 `direction: 'cw'|'ccw'` (Hole(s) zawsze
                                 przekazuje `'ccw'`).
    depthPasses.ts              — `computeDepthPasses(totalDepth, stepdown)
                                 → number[]` (lista przejść/obrotów).
                                 Jedyne miejsce dzielące głębokość przez
                                 stepdown — używane przez silnik ORAZ
                                 podgląd 3D. Twardy limit 5000 przejść,
                                 fallback na pojedyncze pełne przejście
                                 gdy `stepdown <= 0`.
    program.ts                  — `buildHeader`/`buildFooter`/
                                 `assembleProgram` — wspólny szkielet
                                 programu, przyjmuje `Dialect` i
                                 `MachineSettings` — patrz "`G4 P` i
                                 `buildFooter()`" wyżej.
    helix.ts / standardHole.ts   — `generateHelix(params, machine)` /
                                 `generateStandardHole(params, machine)`
                                 — publiczne funkcje
                                 `(WizardParams, MachineSettings) =>
                                 string[]`. Wewnętrznie przyjmują jawny
                                 obiekt opcji (`CircleToolpathOptions`)
                                 zamiast czytać `params.geometry`
                                 bezpośrednio, eksportowane też jako
                                 `helixCircleToolpath`/
                                 `standardCircleToolpath` i reużyte przez
                                 `lib/outlineCircle.ts`. Gdy
                                 `geometry.tabsEnabled`, przełączają się
                                 na płaskie przejścia z pominięciem łuków
                                 mostków — patrz "Tabs (mostki)..." wyżej.
    tabs.ts                      — `computeTabRanges()`/`tabbedCirclePass()`
                                 — geometria mostków dla Hole(s)/Outline
                                 Circle, współdzielona przez
                                 `helix.ts`/`standardHole.ts`. Kąty
                                 mostków to suma równomiernego
                                 próbkowania i dokładnych granic każdego
                                 mostka wymuszonych jako punkty łamania.
    outlineCircle.ts             — Outline Circle: reużywa
                                 `helixCircleToolpath`/
                                 `standardCircleToolpath`.
                                 `onLineCircleEdges()` — dwie krawędzie
                                 (wewnętrzna/zewnętrzna) dla On-line,
                                 czysto wizualne (3D).
    outlineRectangle.ts / outlineRectangleGeometry.ts — Outline Rectangle:
                                 metody Ramp/Standard, geometria boków
                                 (`longerEdgeIndex()`,
                                 `onLineRectDimensions()`).
    outlineRectangleTabs.ts      — `computeRectTabRanges()`/
                                 `tabbedRectanglePass()` — mostki per bok
                                 dla Outline Rectangle, ta sama logika
                                 unii breakpointów co `tabs.ts`, bez
                                 próbkowania kątowego (prosta krawędź nie
                                 wymaga aproksymacji wielokątem).
    surfaceGeometry.ts            — `surfaceNominalBounds()`/
                                 `surfaceToolBounds()` (bounding box +
                                 overtravel o promień narzędzia,
                                 symetryczny na 4 boki — inna matematyka
                                 niż `rectToolDimensions()`, Surface nie
                                 ma offset mode), `surfaceStepoverMm()`
                                 (jedyne źródło prawdy % → mm),
                                 `surfaceStartCorner()` (zawsze
                                 min-X/min-Y).
    surfaceRaster.ts              — `computeLinePositions()` (pozycje
                                 linii rastra, zawsze domykane do obu
                                 krawędzi bez duplikatu przy równym
                                 podziale), `computeRasterLines()`
                                 (kierunek X/Y), `zigzagWaypoints()`
                                 (jedna ciągła ścieżka naprzemienna).
    surfaceZTransition.ts         — `zTransitionMoves()` (Plunge = prosty
                                 `G1 Z`; Helix = pętla
                                 `computeDepthPasses()` + `fullCircleMove()`
                                 per obrót, dokładnie jak nietabbed branch
                                 `helix.ts`, środek spirali przesunięty o
                                 `helixRadius` żeby start/koniec wypadł na
                                 rogu), `buildLevelDescents()` (lista
                                 poziomów Z: poziom 0 bez retraktu, kolejne
                                 retraktują o `stepdown` przed zejściem).
    surface.ts                    — `generateSurfaceZigzag`/
                                 `generateSurfaceUnidirectional` — spięte
                                 przez `assembleProgram()` tą samą
                                 konwencją co Outline (jeden syntetyczny
                                 punkt-narożnik startowy, cała reszta ruchu
                                 wewnątrz `toolpathForPoint`). Zigzag:
                                 ciągły `G1` bez `G0` w środku poziomu.
                                 Unidirectional: pełny retrakt na Safe Z +
                                 prosty plunge (NIE toggle Plunge/Helix)
                                 między liniami, wzorzec z
                                 `standardHole.ts`.
    validation.ts                — `isToolDiameterValid`, `isStepdownValid`,
                                 `isCircleHoleCountValid` (limit 100),
                                 `isTabHeightValid`/`isTabWidthValid`,
                                 `isOutlineToolDiameterValid`/
                                 `isOutlineTabHeightValid`/
                                 `isOutlineTabWidthValid`,
                                 `isSurfaceToolDiameterValid`/
                                 `isSurfaceStepoverValid`/
                                 `isSurfaceHelixRadiusValid` — blokują
                                 Generate i pokazują inline error w Kroku
                                 2/3. `outlineFootprint`/`outlineZSpan`,
                                 `surfaceFootprint`/`surfaceZSpan`,
                                 `patternSpan`/`zSpan`/
                                 `machineFitWarnings()` — nieblokujący
                                 soft-warning na Kroku 4, rozgałęziony po
                                 `operation`.
    download.ts                  — `buildFilename(params)`/
                                 `downloadTextFile` — efekt uboczny
                                 (Blob/URL), celowo poza czystym rdzeniem
                                 `lib/`.
    storage.ts                   — auto-save + presety w localStorage —
                                 `saveSlot`/`loadSlot`/`deleteSlot`/
                                 `loadPresetSlots`, klucz
                                 `simplecam.storage`, sloty `"0"`–`"5"`,
                                 merge z `DEFAULT_WIZARD_PARAMS` przy
                                 wczytaniu, try/catch + `console.warn` na
                                 każdym I/O.
    presetLabel.ts                — `presetLabel(params)` → auto-opis
                                 zapisanego slotu z parametrów (pattern/
                                 kształt jako główna tożsamość, method
                                 drugorzędny).
    machineStorage.ts             — `loadMachineSettings`/
                                 `saveMachineSettings`, klucz
                                 `simplecam.machine`, bez systemu slotów
                                 (jeden płaski obiekt).
    appearanceStorage.ts          — `loadAppearanceSettings`/
                                 `saveAppearanceSettings`, klucz
                                 `simplecam.appearance`, walidacja
                                 zapisanego `palette` względem znanych
                                 `PaletteId` (fallback `'default'`).
    overlayParams.ts               — `deriveOverlayParams()` — jedyna
                                 czysta funkcja w overlay presetów, patrz
                                 "Overlay presetów..." wyżej.
    *.test.ts                    — testy Vitest (`npm run test`).
  App.tsx                    — orkiestracja stanu wizarda i nawigacji kroków.
```

**Zasada:** wszystko co zależy od wybranego method (Helix vs Standard —
nazwa, ikona, etykiety pól, **oraz funkcja generująca G-code**: `generate`)
idzie przez `METHOD_META` w `config/methodMeta.ts`, nie przez
rozproszone `method === 'helix' ? ...` w komponentach. Wywołanie
`METHOD_META[params.method].generate(params, machine)` to jedyne miejsce,
które powinno wołać silnik — nie importować `generateHelix`/
`generateStandardHole` bezpośrednio w komponentach UI. Analogicznie —
wszystko co zależy od wybranego patternu idzie przez `POSITIONING_META`/
pomocnicze funkcje w `config/positioningMeta.ts`, nie przez rozproszone
`switch (geometry.positioning)` w komponentach; Outline analogicznie przez
`config/outlineMeta.ts`, Surface analogicznie przez `config/surfaceMeta.ts`
(kształt) i `config/surfaceMethodMeta.ts` (metoda, z własnym `generate` —
płaski rejestr, nie bespoke-switch jak `lib/outline.ts`, bo metody Surface
nie są ograniczone per-kształt). Wszystkie kolory podglądu 2D/3D idą przez
`config/palettes.ts` (`getFixedColors()`/`getPaletteAccents()`/
`hexToThreeColor()`), nie przez osobne stałe kolorów w
`drawToolpath.ts`/`buildScene.ts`.

## `.gitignore` musi wykluczać `.claude/`

Tailwind v4 (`@tailwindcss/vite`) auto-skanuje cały katalog projektu pod
kątem nazw klas i respektuje tylko `.gitignore` jako listę wykluczeń —
bez tego dokumentacja zainstalowanych skilli w `.claude/skills/` też
trafia do skanowania i winduje bundle CSS (realnie zaobserwowane: 16KB
→ 34KB).

## Komendy

```bash
npm run dev       # dev server (Vite)
npm run build     # tsc -b && vite build
npm run test      # vitest
npm run lint      # oxlint
```

## Skille do wykorzystania

W tym projekcie zainstalowane są dodatkowe skille — warto je ładować przy
odpowiednich zadaniach:

- **`tailwind`** — Tailwind CSS v4 performance/best practices. Ładować
  przy pisaniu, przeglądaniu lub refaktorze klas Tailwind (utility
  classes, `@theme`, dark mode, responsywność) — projekt intensywnie
  korzysta z Tailwind v4 (`@tailwindcss/vite`, `@custom-variant dark`).
- **`frontend-design`** — wskazówki dot. wyrazistego, nieszablonowego
  designu UI. Ładować przy podejmowaniu decyzji wizualnych (layout,
  typografia, kolorystyka).
- **`threejs-*`** (fundamentals, geometry, materials, lighting, animation,
  interaction, loaders, shaders, textures, postprocessing) — osobne
  skille, nie jeden zbiorczy "threejs". Ładować przy pracy nad
  `src/components/preview3d/` — najczęściej przydatne: `threejs-fundamentals`
  (scena/kamera/renderer/dispose), `threejs-geometry` (linie, cylindry,
  BufferGeometry), `threejs-interaction` (OrbitControls).
- **`/grill-me`** — przed rozpoczęciem większej pozycji z `ideas.md`
  (`BL-#`/`OP-#`), gdy specyfikacja jest szkicowa i zostawia otwarte
  decyzje projektowe — użyć zamiast zgadywać/zakładać, żeby dojść do
  wspólnego zrozumienia zakresu przed napisaniem kodu.

## Konwencje

- Wersjonowanie i historia zmian: **`CHANGELOG.md`** jest jedynym,
  pełnym źródłem historii projektu — każda znacząca zmiana dostaje tam
  wpis (co się zmieniło i dlaczego). Ten plik (`CLAUDE.md`) opisuje
  wyłącznie stan obecny — bez numerów wersji, dat, cytatów z sesji
  `/grill-me` ani opisów naprawionych błędów; jeśli coś tu jest, to
  dlatego, że jest prawdą dzisiaj, niezależnie od tego, kiedy się taką
  stała.
  - **Twarda reguła:** po każdej **większej** zmianie (nowa
    funkcjonalność, nowy motyw, przeprojektowanie mechanizmu, poprawka
    realnego buga widocznego dla użytkownika) — zaktualizować
    `CHANGELOG.md` **z automatu**, bez pytania, w tej samej turze co
    implementacja (nowy wpis `## [X.Y.Z]` + bump wersji w
    `package.json`, ten sam wzorzec co dotychczasowe commity "Version
    X.Y.Z: ..."). Po **mniejszej** zmianie (drobna poprawka stylu,
    literówka, jednolinijkowy tweak, coś bez realnego wpływu na
    zachowanie appki) — zapytać użytkownika, czy chce wpis, zamiast
    zakładać którąkolwiek odpowiedź. Nie czekać, aż użytkownik sam
    zapyta "czy CHANGELOG jest zaktualizowany" — to sygnał, że ta
    reguła została pominięta.
- Odłożone pomysły i przyszłe operacje: **`ideas.md`**.
- Brak testów E2E w MVP — tylko testy jednostkowe silnika G-code.
- Nie przeskakuj większych pozycji z `ideas.md` bez pytania — każda
  wymaga checkpointu do przeglądu przez użytkownika, duże pozycje
  (`OP-#`) też sesji `/grill-me`.
