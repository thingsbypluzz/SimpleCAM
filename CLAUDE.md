# OnlyPaths

Lekki, w pełni client-side generator G-code dla pojedynczych operacji
wiercenia/kieszeniowania/obróbki boku/grawerowania napisów na frezarkach CNC (GRBL/Marlin/Mach3). Użytkownik
przechodzi przez 4-krokowy wizard i na końcu dostaje gotowy plik `.gcode` —
bez logowania, bez backendu, bez CAD-a.

## Jak zorganizowana jest dokumentacja

- Ten plik — przegląd, zasady i decyzje przekrojowe (ładowany zawsze).
- **Szczegóły mechanizmów żyją w zagnieżdżonych `CLAUDE.md`** w katalogu,
  którego dotyczą (Claude Code ładuje je przy pracy w tym katalogu):
  `src/lib/CLAUDE.md` (silnik G-code, operacje, walidacja, storage, model
  Feedrate Calculator, testy), `src/components/preview3d/CLAUDE.md`
  (podgląd 3D), `src/components/previewLite/CLAUDE.md` (uproszczony
  podgląd 3D bez WebGL), `src/components/preview/CLAUDE.md` (podgląd 2D),
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
  Build nie skraca kolorów z przezroczystością do zapisu `#RRGGBBAA` /
  `#RGBA` (`css.lightningcss.include` w `vite.config.ts`) — Android WebView
  w starszych aplikacjach takich kolorów nie przyjmuje.
- **Vitest** — testy silnika G-code.
- Podglądy: **Canvas API** (2D, `src/components/preview/`) i **Three.js**
  (3D, `src/components/preview3d/`, ładowany leniwie przez `React.lazy`).
- Zero backendu, bazy danych i kont. Generowanie G-code i podglądy zawsze w
  100% po stronie klienta (nie wyklucza przyszłego lekkiego kodu
  server-side gdzie indziej, np. licencji — dziś nic takiego nie ma).

## Stan projektu

Sześć operacji (`WizardParams.operation`):

- **Hole(s)** — okrągłe otwory; metody Helix / Standard Hole / Drill
  (wiercenie wiertłem z krokiem i wycofaniem, otwór o średnicy wiertła) × wzorce
  Single / Rectangular Grid / Grid Centered (siatka Columns × Rows w
  zadanym rozstawie, domyślnie 2 × 2) / N-Holes on Circle / Custom List;
  opcjonalne mostki.
- **Outline** — kontur Rectangle Cornered / Centered / Circle / **Lobed
  Circle** (okrąg główny z okręgami na okręgu podziałowym: dodanymi jako
  wypustki albo wyciętymi jako wcięcia — Add / Subtract) z offset mode Inside / Outside / On-line; metody
  Ramp/Standard (prostokąt, Lobed Circle) albo Helix/Standard (okrąg);
  opcjonalne mostki.
- **Surface** — planowanie po prostokącie; Zigzag / Unidirectional,
  kierunek rastra X/Y, stepover % średnicy, wejście Plunge/Helix.
- **Pocket** — kieszeń Rectangle Cornered / Centered / Circle; metody
  Spiral i Adaptive (stałe zaangażowanie); opcjonalny przejazd
  wykończeniowy ścian (Stock to Leave, Finish Feed). **Donut** — pierścień
  między średnicą a wyspą zostawioną w środku (Spiral od wyspy na
  zewnątrz albo Adaptive dookoła pierścienia). Kieszenie odciążające
  **Rectangle Lightened** (X-grid N×M / Triangles N×M) i **Circle
  Lightened** (szprychy, piasta) — każda komórka osobna kieszeń, Spiral
  albo Adaptive; przy **Bottom Open** (przelot) tylko kontur każdej komórki
  (Ramp / Standard, mostki na komórkę) — środek wypada.
- **Facing** — obróbka jednego boku detalu (Bottom / Top / Left / Right
  Side): frez jedzie bokiem wzdłuż krawędzi, wchodzi i wychodzi w
  powietrzu, zbiera zadany naddatek dosuwami bocznymi co Stepover, poziom
  Z po poziomie; Climb / Conventional; powrót obok materiału na Linking
  Feed.
- **Text** — grawerowanie napisu fontem jednoliniowym: frez jedzie po
  osi liter. Układ **Straight** (kilka linii, wyrównanie, origin, kąt
  obrotu) albo **On Circle** (jedna linia po okręgu, litery głowami na
  zewnątrz albo do środka); Mirror; narzędzie Generic V-Bit (kąt tylko do
  szerokości rowka w podglądzie) albo frez walcowy. Fonty (dziś Relief
  SingleLine, komplet polskich znaków) doczytują się przy pierwszym
  użyciu; bez Feedrate Calculator.

## Kluczowe decyzje (przekrojowe)

- Jednostki tylko mm. Dialekt: wspólny podzbiór GRBL/Marlin/Mach3,
  `MachineSettings.dialect` rozstrzyga preambułę, `G4 P` i `M30`/`M2`.
- Wrzeciono tylko `M3`; obroty i dwell globalne (Settings → Machine).
  Jedno narzędzie na plik. Kierunek cięcia: zawsze climb pod M3 (wewnątrz
  CCW, na zewnątrz CW), Adaptive ma przełącznik Climb/Conventional.
- Interpolacja okręgów: przełącznik G2/G3 vs G1 w Kroku 4; mostki i
  prostokąty Outline oraz Facing wymuszają G1 (zapisana wartość zostaje).
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
  Generate, kolor = dopasowanie do maszyny; ten sam znaczek stoi też na
  prawo od przycisku Generate).
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

- **Trzy układy, wybierane szerokością okna** (`useLayoutMode()`,
  `components/useViewport.ts`): **szeroki** (≥ 1280 px) — akordeon obok
  podglądu; **średni** (900–1279 px, tablet poziomo, mały laptop) — nad
  otwartym krokiem pasek czterech kroków (`StepRail`), wizard obok
  podglądu; **wąski** (< 900 px, tablet pionowo) — jeden widok naraz,
  przełączany dolnym paskiem Setup / 2D / 3D / G-code (Setup = pasek
  kroków + otwarty krok, bez osobnych Preview Tabs). **Telefon w pionie**
  (< 480 px, wariant `phone:` w `src/index.css`) dostaje układ wąski
  ciaśniej: logo „OP”, bez przełącznika Simple / Advanced w Header (tylko
  w Settings → Appearance), mniejsze sloty Preset Bar bez napisów trybów,
  Krok 4 w pasku kroków sam znaczek. Telefon w poziomie bez osobnego
  układu.
- **Zachowania dotykowe idą za wskaźnikiem, nie za szerokością**
  (`useCoarsePointer()` — `pointer: coarse`): własna klawiatura numeryczna
  dla pól liczbowych, Preset Bar z przytrzymaniem, większe cele dotyku
  (wariant `pointer-coarse:`), tekst pól 16 px. Settings, Feedrate
  Calculator i okno nazwy projektu zajmują cały ekran na dotyku **albo** w układzie średnim /
  wąskim. Szczegóły: `src/components/CLAUDE.md`.
- **Pionowy akordeon** 4 kroków (układ szeroki): Wizard Section zajmuje
  42% okna (od 660 do 760 px), aktywny krok bierze to, co zostaje po
  trzech zwiniętych Step N Summary (80px); klik w dowolny przełącza, bez
  „Wstecz” i blokady kolejności.
- W panelu jedna kolumna, pary pól pokrewnych w jednym wierszu. Kolejność
  pól w Kroku 2: najpierw gdzie i jak duże, potem narzędzie, potem jak
  ciąć; pierwszy wiersz „Pattern:/Shape:” (szczegóły:
  `src/components/wizard/CLAUDE.md`).
- **Preview Tabs:** 2D / 3D (domyślna) / G-Code (najwyżej 5000 linii,
  pełny program w pobranym pliku). Pełny podgląd 3D wymaga WebGL 2 — bez
  niego (albo po włączeniu w Settings → Appearance) zakładka 3D pokazuje
  uproszczony podgląd na zwykłej kanwie: ścieżka i obrys materiału w
  rzucie, obracane i skalowane tak samo, bez litego materiału. Podgląd dostaje odroczoną kopię
  parametrów (`useDeferredValue`) i pamięta widok przy przełączaniu
  zakładek (tylko w sesji). Hide/Show Stock i Hide/Show Toolpath — wspólny
  stan sesyjny obu podglądów; w 3D dodatkowo Solid/Transparent Stock (lity,
  oświetlony materiał, który zasłania ścieżkę — też tylko w sesji). Przy parametrach odrzuconych przez walidację
  (`isWizardParamsValid`) podglądy nie rysują ścieżki — zostają materiał i
  kształt, z napisem "Fix the highlighted fields to see the toolpath"; nie
  dotyczy Overlay (żywy wzorzec ukryty) ani zakładki G-Code.
- **Materiał w podglądach** — jeden model (`lib/stockModel.ts`) dla
  żywego wzorca i dla wszystkich presetów w Overlay; 2D i 3D rysują tę samą
  geometrię. Pustki (otwór, Outline Inside, pas On-line, komórki Pocket z
  Bottom Open) wycięte na wylot, Pocket ma dno na swojej głębokości; otwór Hole(s) z przełącznikiem
  Bottom = Closed też dostaje dno (tylko wygląd, G-code bez zmian). Bazą jest arkusz materiału, a gdy
  któryś preset to Outline Outside — suma wysp (część), z której wycinane
  są pustki pozostałych presetów. Surface, Facing i Text poza modelem:
  Surface i Facing rysują własny „pozostały materiał” (Facing — blok od
  gotowej krawędzi w głąb detalu do brzegu widocznej płaszczyzny), Text —
  kreski napisu na powierzchni (w 2D o szerokości rowka). Domyślnie pustki mają kształt po frezie
  (narożniki wewnętrzne zaokrąglone promieniem freza; w 2D kropkowany
  kontur obok ciągłego obrysu nominalnego) — wyłącznik w Settings →
  Appearance.
- **Header:** Preset Bar `[1]…[7]` i oko Overlay (we wspólnej ramce), obok
  — poza ramką — nazwa projektu, Load i Save projektu; przełącznik Simple |
  Advanced (kaczka | orzeł), dark/light (dark domyślny niezależnie od
  systemu), Settings. W układzie średnim i wąskim
  nazwa projektu jest jednym przyciskiem w prawym górnym rogu, który
  rozwija menu z Load i Save (`ProjectMenu`); w wąskim Preset Bar ma
  własny, drugi wiersz Header.
- **Simple / Advanced Mode** (`appearance.uiMode`, przełącznik w Header):
  Simple chowa pola i funkcje, których początkujący nie potrzebuje (Flutes /
  fz, Spindle i kalkulator w Kroku 3, Ramp Angle / Pitch, Z-Transition,
  Start Z, Linking Feed, część pól Pocket / Facing / Text, kształty Lobed
  Circle, Donut, Lightened, Text On Circle, metodę Adaptive, w Settings
  Feed Tables i limity kalkulatora). **Zasada:** w Simple schowane pole ma
  zawsze wartość domyślną (część liczona z widocznych pól) — reset przy
  przełączeniu na Simple, przy każdej zmianie parametrów i każdym
  wczytaniu presetu; trwały (powrót do Advanced zostawia domyślne), w
  edycji presetu zapisywany do slotu; schowany kształt / metoda przechodzi
  na najbliższy widoczny z zachowaniem wymiarów. Sloty w Overlay i pliki
  projektu się nie zmieniają. Nowy użytkownik startuje w Simple, ktoś z
  zapisanymi danymi w Advanced. Reguły: `lib/simpleMode.ts`; co chowa który
  komponent: `src/components/wizard/CLAUDE.md`, `src/components/CLAUDE.md`.
- **Projekt** (`lib/projectFile.ts`, `simplecam.project`): siedem slotów
  presetów jako jeden plik JSON (`onlypaths-<nazwa>-<data>.json`) — bez
  ustawień maszyny, narzędzi i wyglądu; każdy preset tylko z sekcją
  własnej operacji, posuwami i opcjami wyjścia. Save pyta o nazwę
  (`ProjectNameModal`) i pobiera plik; Load zastępuje wszystkie sloty (z
  potwierdzeniem, gdy któryś jest zajęty), zaznacza wczytane presety w
  Overlay i rozbraja edycję; parametry w wizardzie zostają. Plik obcy albo
  z nowszego formatu jest odrzucany w całości, presety ze znanego pliku
  przechodzą przez te same strażniki pól co zapis w przeglądarce. Ramka w
  kolorze edycji pokazuje nazwę projektu ("Untitled", dopóki żadnego nie
  zapisano ani nie wczytano) i kropkę, gdy sloty różnią się od pliku;
  stoi na lewo od przycisków Load i Save;
  nazwa i odcisk slotów przeżywają odświeżenie.
- **Auto-save i presety** (`simplecam.storage`): slot `"0"` zapisywany przy
  Generate i wczytywany przy starcie (wizard na Kroku 4 z bannerem
  "Restored from your last session"); sloty `1`–`7` z auto-opisem
  (`presetLabel()`), zapis w Kroku 4 z potwierdzeniem nadpisania, usuwanie
  też w Kroku 4 („×” po najechaniu na zapisany slot albo Delete all dla wszystkich naraz, z potwierdzeniem). Wczytanie presetu nie zmienia aktywnego kroku.
- **Preset Bar — znaczki na slotach.** Zajęty slot ma dwa narożne
  znaczki: lewy górny (ptaszek, kolor akcentu) — Overlay, prawy górny
  (ołówek, kolor `--edit`) — edycja. Puste kółko po najechaniu/fokusie,
  wypełnione i stale widoczne, gdy włączone. Klik w sam slot wczytuje
  preset tylko wtedy, gdy nic nie jest w Overlay ani w edycji — inaczej
  nic nie robi. **Na dotyku** znaczki tylko pokazują stan (nie są
  przyciskami): dotknięcie slotu wczytuje preset na tej samej zasadzie, a
  przytrzymanie otwiera menu z dwiema opcjami — Show in overlay / Remove
  from overlay oraz Edit / Stop editing; jednorazowa podpowiedź o
  przytrzymaniu (`simplecam.hints`).
- **Overlay:** aktywny, gdy co najmniej jeden slot ma ptaszek (bez
  osobnego trybu); 2D i 3D naraz. Żywy wzorzec wtedy ukryty
  (`showActivePattern`), Generate zablokowany (`canGenerate`), baner
  "Preview mode", na lewo od Preset Bar napis "Overlay Mode — N presets
  shown"; zmiana zestawu pokazywanych presetów re-fituje kamerę (3D z
  zachowaniem kąta). Przycisk oka świeci przy aktywnym Overlay i wtedy
  klik czyści nakładkę; zgaszony — zaznacza wszystkie zapisane presety.
- **Edycja presetu** (live-save): ołówek na slocie wczytuje preset i
  uzbraja go (radio — ołówek na innym slocie przenosi edycję, na tym samym
  rozbraja); każda poprawna zmiana zapisuje się od razu do slotu (tylko
  gdy `isWizardParamsValid`); napis "Auto-save Mode Enabled" (kolor błędu
  przy niepoprawnych parametrach). Edycję kończy ołówek na edytowanym
  slocie (Header nie ma osobnego przycisku). Stan tylko w pamięci; edycja
  nie blokuje Generate.
- **Overlay + edycja naraz:** niezależne — edycja nie dokłada presetu do
  nakładki. Edytowany preset jest rysowany z żywych parametrów wizarda
  jako żywy wzorzec (także gdy ma ptaszek); jego krawędzie są w
  podglądach w kolorze edycji, a ścieżki pozostałych presetów nakładki
  znikają (ich obrysy zostają, przygaszone); Generate i zakładka G-Code działają dla niego, baner
  "Preview mode" znika. Przeniesienie edycji między pokazywanymi
  presetami i edycja pól nie ruszają kamery. Oba napisy przy Preset Bar w
  dwóch wierszach (Overlay nad edycją). Ramka wokół grupy presetów
  widoczna, gdy cokolwiek jest w Overlay albo w edycji.
- **Settings Modal:** Machine, Controller, Tabs, Tool Diameters, Feed
  Tables, Templates, Appearance, Privacy, Reset, About (szczegóły:
  `src/components/CLAUDE.md`). **Templates** — wbudowane przykładowe
  projekty (`src/templates/`), wczytywane jak plik projektu; przykłady do
  obejrzenia i przerobienia, nie gotowe programy.
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
komponentach. Zależne od **wzorca/kształtu/boku** — przez
`positioningMeta.ts`/`outlineMeta.ts`/`surfaceMeta.ts`/`pocketMeta.ts`/
`facingMeta.ts`/`textMeta.ts`; fonty Text — `textFonts.ts`. Kolory podglądów —
wyłącznie przez `config/palettes.ts`.

## Hosting testowy

Ręczny deploy (bez CI/CD, `BL-4`): `npm run deploy` (build + FTPS) i
`npm run deploy:check` (tylko połączenie i listing); dane w lokalnym
`.env`. Wysyła tylko pliki z `dist/`, `index.html` na końcu — **nigdy
pełny `clearWorkingDir()`** (root zawiera pliki cPanelu). Szczegóły
(certyfikaty, host, kolejność): `scripts/CLAUDE.md`.


## `.gitignore` musi wykluczać `.claude/`

Tailwind v4 skanuje cały projekt pod kątem klas i respektuje tylko
`.gitignore` — bez tego dokumentacja skilli w `.claude/skills/` trafia do
skanowania i winduje bundle CSS. Z tego samego powodu `src/index.css` wyklucza
dokumentację (`@source not` dla `*.md` — `CLAUDE.md`, `CHANGELOG.md`,
`ideas.md`, specy `design_*.md`), bo pełno w niej nazw klas w prozie.


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
