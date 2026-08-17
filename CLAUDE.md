# SimpleCAM

Lekki, w pełni client-side generator G-code dla pojedynczych operacji
wiercenia/kieszeniowania na frezarkach CNC (GRBL/Marlin/Mach3). Użytkownik
przechodzi przez 4-krokowy wizard i na końcu dostaje gotowy plik `.gcode` —
bez logowania, bez backendu, bez CAD-a.

Pełna specyfikacja koncepcyjna (operacje, GUI, wymagania) — patrz historia
konwersacji projektowej; skrót poniżej.

## Stack

- **Vite + React + TypeScript** (SPA, brak SSR/routingu — świadomie lżejsze
  niż Next.js, bo cała appka jest client-side).
- **Tailwind CSS v4** (`@tailwindcss/vite` plugin, bez `tailwind.config.js` —
  konfiguracja przez CSS-first API).
- **Vitest** do testów logiki G-code (Etap 1+).
- Wizualizacja: **Canvas API** (2D, Etap 3) + **Three.js** (3D, Etap 4,
  `src/components/preview3d/`) — Three.js ładowany leniwie (`React.lazy`),
  nie wchodzi do głównego bundle'a.
- Zero backendu. Zero bazy danych. Zero kont użytkowników.

## Status / Etapy

Projekt budowany etapami z checkpointami do akceptacji. Aktualny stan:

- [x] **Etap 0** — szkielet wizarda (4 kroki, nawigacja, formularze z
      hardkodowanymi domyślnymi wartościami, brak realnej logiki G-code).
- [x] **Etap 1** — silnik G-code jako czyste funkcje TS (`generateHelix`,
      `generateStandardHole`) + testy Vitest.
- [x] **Etap 2** — integracja silnika z wizardem (`OPERATION_META[...].generate`),
      podgląd G-code w prawym panelu na żądanie. Przycisk **Generate** żyje
      na Kroku 4 (nad Copy/Download), nie w globalnym prawym panelu —
      współdzieli miejsce z akcjami, które odblokowuje. Każda zmiana
      parametru czyści wygenerowany snapshot (`generatedGCode` w `App.tsx`),
      Copy/Download są zablokowane dopóki użytkownik nie kliknie Generate
      ponownie — chroni przed pobraniem/skopiowaniem nieaktualnego kodu
      (skoro wszystkie kroki są od razu dostępne, user może wejść od razu
      na Krok 4 i wygenerować z domyślnymi parametrami — to celowo
      dozwolone, nie ma wymogu przejścia sekwencyjnego).
- [x] **Etap 3** — podgląd 2D (Canvas) ścieżki narzędzia. Zakładki
      **2D Preview** / **G-Code** w nagłówku prawego panelu (domyślnie
      2D Preview). W przeciwieństwie do G-Code Preview, **2D Preview jest
      zawsze live** — nie wymaga klikania Generate, bo to widok
      poglądowy/read-only, nie artefakt do eksportu (ryzyko "nieaktualnych
      danych" dotyczy tylko Copy/Download).
- [x] **Etap 4** — wizualizator 3D (Three.js). Trzecia zakładka **3D
      Preview** obok 2D Preview / G-Code w prawym panelu. `Scene3D`
      wczytywany przez `React.lazy()` — Three.js (~550KB) trafia do
      osobnego chunka, ładowanego dopiero po otwarciu zakładki (opcjonalny
      z założenia, więc nie ma obciążać startowego bundle'a). OrbitControls
      do rotacji/zoomu. Przyciski widoku: **Top / Isometric / Front / Side
      / Fit View** — presety ustawiają konkretny kąt + dopasowują odległość,
      Fit View dopasowuje odległość/target zachowując aktualny kąt kamery
      (patrz `cameraPresets.ts`). Domyślny widok przy otwarciu zakładki to
      dopasowany Isometric — ustawiany raz przy pierwszym zbudowaniu sceny,
      nie przy każdej zmianie parametru (nie zrzuca widoku użytkownikowi w
      trakcie edycji/obrotu), świadomie zorientowany tak, żeby patrzeć w
      kierunku **+Y**, z kamerą nad ćwiartką **III (-X,-Y)** — obrabiane
      elementy najczęściej leżą w ćwiartce I (+X,+Y), więc kamera z
      przeciwległej ćwiartki patrzy "przez" obszar roboczy, nie "zza" niego
      (`VIEW_PRESETS.isometric.direction` w `cameraPresets.ts`). Osie X
      (czerwona) / Y (zielona) z grotem strzałki i
      etykietą na dodatnim końcu (kierunek, nie tylko orientacja) + etykieta
      "0,0" przez fizyczny origin, oraz pionowe linie `G0 Z` (zjazd na
      materiał / wyjazd na Safe Z) przy każdym otworze. Jak 2D Preview:
      zawsze live, nie wymaga Generate.
- [ ] **Etap 5** (w trakcie) — walidacje, localStorage, polish. Zrobione:
      - [x] Tool Diameter w Kroku 2 jako dropdown: 1–8mm (całe mm) + 1/8"
        (3.175mm) i 1/4" (6.35mm) jako dodatkowe opcje —
        `TOOL_DIAMETER_OPTIONS` w `Step2Geometry.tsx`.
      - [x] Walidacja: `isToolDiameterValid()` w `src/lib/validation.ts`
        (+ testy). Komunikat błędu pod polami w Kroku 2, oraz blokada
        przycisku **Generate** na Kroku 4 (`canGenerate` prop) dopóki
        narzędzie > otwór.
      - [x] Podsumowanie Kroku 2 (zwinięty pasek) ma nagłówek z wybranym
        positioning: `0,0` (Single), `RECT X×Y` (Grid), `Custom (N)`
        (Custom List) — `positioningSummary()` w `App.tsx`, użyte też w
        tooltipie paska.
      - [x] **Start Z** (obie operacje, nie tylko Helix) — pole `startZ`
        w `FeedsParams` (Krok 3, pod Plunge Rate), zawsze ≥0, domyślnie
        `0`. Semantyka: "powiększa" obrabiany element — materiał wyższy
        o `startZ` (góra cięcia w `Z=+startZ`), dno zawsze na
        `-totalDepth`. Wspólna `rapidToTop()` w `src/lib/program.ts`
        (zawsze `G0 Z<startZ>` — przy `startZ=0` identyczne z G-code
        sprzed tej funkcji). Oba silniki i 3D Preview
        (`buildScene.ts` — bryła otworu, linia zjazdu) w pełni spójne.
        Walidacja `isStartZValid()` (`startZ ≤ safeZ`).
      - [x] **Krok 1 (STEP 1 SUMMARY):** zwinięty pasek pokazuje obie
        opcje operacji (Helix + Standard), każda z własną etykietą —
        aktywna w pełnym kolorze, nieaktywna wyszarzona/przygaszona.
        Iteruje po `OPERATION_LIST` w `App.tsx`.
      - [x] **Domyślna interpolacja okręgów: G1 (segmented)** zamiast
        G2/G3 (arc) — `DEFAULT_WIZARD_PARAMS.output.interpolation`.
      - [x] **Rectangular Grid (Centered)** — nowy, osobny wariant
        `PositioningMode` (`'gridCentered'`, nie toggle wewnątrz Grid),
        zaraz po zwykłym Grid w Kroku 2. Reużywa `gridX`/`gridY` i te
        same pola UI; rogi wyśrodkowane `(±gridX/2, ±gridY/2)` zamiast
        `(0,0)…(gridX,gridY)`, ten sam porządek co Grid. Automatycznie
        działa z offsetem X/Y i podglądami (nowy `case` w
        `resolvePoints()`, zero innych zmian). Pasek: `RECT X×Y (C)`.

      Pozostało:
      - **Krok 2: nowy wariant pozycjonowania "N-holes on circle"** — obok
        Single/Grid/Grid Centered/Custom. Parametry: liczba otworów
        (np. 5), średnica okręgu na którym są rozmieszczone (np. 45mm),
        oraz start angle — kąt (względem osi +X, czyli 0°) pod którym
        leży pierwszy punkt, pozostałe rozłożone równomiernie po
        obwodzie. Wymaga: nowej wartości `PositioningMode` (`'circle'`),
        nowych pól w `GeometryParams` (np. `circleHoleCount`,
        `circleDiameter`, `circleStartAngle`), rozszerzenia
        `resolvePoints()` w `src/lib/positioning.ts`, nowej sekcji w
        `Step2Geometry.tsx` i dopasowania podsumowania w pasku Kroku 2
        (`App.tsx`) oraz podglądu 2D (już powinien zadziałać bez zmian,
        bo rysuje na podstawie `resolvePoints()`).
      - **Ikony w podsumowaniu Kroku 2** (zwinięty pasek) zamiast/obok
        samego tekstu (`0,0` / `RECT X×Y` / `RECT X×Y (C)` / `Custom (N)`)
        — nowe komponenty SVG w stylu `src/components/icons.tsx`:
        - **Single (0,0):** crosshair (celownik) + etykieta "0,0".
        - **Rectangle, origin w rogu (Grid):** 4 punkty połączone lekką
          kreską w prostokąt, punkt w lewym dolnym rogu narysowany
          wyraźnie większy (tam jest 0,0).
        - **Rectangle, origin w środku (Grid Centered):** te same
          4 punkty/kreski, ale większy punkt w **środku** prostokąta.
        - **Custom:** delikatne osie X/Y (kartezjańskie), z pojedynczą
          kropką gdzieś w ćwiartce +X/+Y (symbol dowolnego punktu).

## Pomysły na przyszłość (poza MVP, poza Etapem 5)

Większe rozszerzenia zakresu — nie polish istniejących operacji, tylko
nowa funkcjonalność. Nie zaczynać bez wyraźnego "przechodzimy do X".

- **Nowa operacja: "Rectangle Cut Out"** — trzecia operacja obok Helix i
  Standard Hole, wycinanie prostokątnego konturu. Parametry:
  - **Tryb cięcia:** Inside / Outside / On-line — offset ścieżki
    narzędzia względem narysowanego prostokąta (Inside: ścieżka do środka
    o promień narzędzia — dla wycinania kieszeni/otworu prostokątnego;
    Outside: ścieżka na zewnątrz — dla wycinania gotowej części o zadanych
    wymiarach zewnętrznych; On-line: środek narzędzia dokładnie na linii).
  - **Tabs (mostki podtrzymujące):** opcja włącz/wyłącz + prawdopodobnie
    liczba i szerokość — standardowa funkcja przy wycinaniu profilu, żeby
    część nie odpadła/nie przesunęła się przed końcem cięcia.
  - **Punkt odniesienia prostokąta:** offset od **środka** prostokąta albo
    od **lewego dolnego rogu** — do wyboru (analogicznie do pomysłu
    "Rectangular Grid centered at 0,0" wyżej, ale tu dla samego kształtu
    wycinanego, nie dla pozycjonowania wielu otworów).
  - Wymaga: nowej wartości `OperationType` (`'rectangleCutOut'`), nowego
    wpisu w `OPERATION_META`, nowego modułu w `src/lib/` (z własnymi
    testami — offset/tabs to nietrywialna geometria, inna niż okrąg),
    nowej sekcji parametrów w UI (prawdopodobnie nowy krok albo
    rozszerzenie Kroku 2), oraz sprawdzenia czy podgląd 2D/3D (które dziś
    zakładają "okrąg" jako kształt operacji) w ogóle się do tego nadają
    czy potrzebują osobnej ścieżki rysowania.

Nie przeskakuj etapów bez pytania — każdy kończy się checkpointem do
przeglądu przez użytkownika.

## Kluczowe decyzje projektowe (zaakceptowane założenia)

- **Jednostki:** tylko mm, bez cali.
- **Dialekt G-code:** wspólny podzbiór GRBL/Marlin/Mach3, preambuła
  `G21 G90 G17`.
- **Dwie operacje:** Helix (spiralne rampowanie w dół, ruch X/Y/Z
  jednocześnie) i Standard Hole (pełny okrąg 360° na danej głębokości,
  potem stepdown w Z, powtórz).
- **Interpolacja okręgów:** przełącznik w UI — G2/G3 (natywne łuki) albo
  G1 (segmenty liniowe, wielokąt przybliżający okrąg). Obie metody muszą
  być zaimplementowane w silniku.
- **3 warianty pozycjonowania:** Single (0,0), Rectangular Grid (4 rogi),
  Custom List (dowolne punkty `X,Y` wpisane ręcznie). Brak importu DXF/SVG
  w MVP (możliwe rozszerzenie w przyszłości).
- **Ruch między otworami:** powrót na `Safe Z` przed `G0` do kolejnego
  punktu XY.
- **Wrzeciono:** tylko `M3` (bez `M4`) w MVP.
- **Jedno narzędzie na wygenerowany plik** — brak zmiany narzędzia.
- **Nazwa pliku wyjściowego:** `simplecam-<operacja>-<data>.gcode`.
- **Hosting docelowy:** strona własna użytkownika (static build); lokalnie
  praca przez `npm run dev`.
- Logika generowania G-code musi być **czystymi funkcjami TS**
  (`(params: WizardParams) => string[]`), całkowicie odizolowanymi od
  warstwy UI — patrz `src/lib/`.
- **Język UI aplikacji: angielski** (SimpleCAM jest anglojęzyczna). Komunikacja
  projektowa z użytkownikiem oraz dokumenty typu ten plik i `CHANGELOG.md`
  zostają po polsku.
- **Layout wizarda: pionowy akordeon**, nie liniowy stepper. **Wszystkie
  4 kroki widoczne od razu** (nie odsłaniają się progresywnie w miarę
  postępu) — tylko aktywny jest rozwinięty (panel ~420px), pozostałe
  zawsze zwinięte do wąskich pionowych pasków (80px) z podsumowaniem
  wizualnym (ikony/wartości) — klik w dowolny pasek (także "do przodu")
  przełącza aktywny krok. Brak przycisku „Wstecz”, brak blokady kolejności
  — użytkownik może skoczyć od razu na Krok 4. Wewnątrz każdego
  rozwiniętego kroku pola/opcje układane są w **jednej kolumnie** (pod
  sobą), nie w siatce/wierszu — patrz `src/App.tsx`.
- Nagłówek ma toggle dark/light mode (działający, klasa `.dark` na
  `<html>`, Tailwind skonfigurowany przez `@custom-variant dark` w
  `src/index.css`) oraz przycisk Settings (na razie `disabled`,
  przygotowany pod przyszłe ustawienia). **Dark mode jest domyślny**
  (niezależnie od preferencji systemowej) — toggle nadal pozwala
  przełączyć na light.
- **`.gitignore` musi wykluczać `.claude/`** mimo że projekt nie używa
  gita — Tailwind v4 (`@tailwindcss/vite`) auto-skanuje cały katalog
  projektu pod kątem nazw klas i respektuje tylko `.gitignore` jako listę
  wykluczeń (bez niego dokumentacja zainstalowanych skilli w
  `.claude/skills/` też trafia do skanowania i winduje bundle CSS —
  realnie zaobserwowane: 16KB → 34KB).
- **`G4 P<sekundy>`** (dwell po starcie wrzeciona) jest poprawne dla
  GRBL/Mach3, ale Marlin interpretuje `P` jako milisekundy (jego `S` w
  sekundach nie jest wspierane przez GRBL/Mach3) — świadomie zostawione
  bez rozróżnienia dialektów (MVP nie ma przełącznika dialektu), efekt
  na Marlinie to krótsza pauza niż zamierzona, nie dłuższa/niebezpieczna.
- **`WizardParams.output.spindleStopEnd`** to martwe pole typu — checkbox
  w Kroku 4 ("Return to Safe Z and stop spindle (M5) at the end") steruje
  tylko `returnSafeZEnd`, który w silniku G-code gasi wrzeciono (M5) i
  robi retrakt razem. `spindleStopEnd` nigdy nie jest czytane — do
  ewentualnego posprzątania (usunąć pole albo spiąć z osobnym
  checkboxem), nieporuszone celowo poza zakresem Etapu 1.

## Struktura katalogów

```
src/
  types/wizard.ts          — typy WizardParams + DEFAULT_WIZARD_PARAMS
  config/operationMeta.ts   — rejestr metadanych per-operacja (nazwy, ikony,
                              etykiety zależne od Helix/Standard) — jedno
                              źródło prawdy, nie hardkodować ternary po
                              `operation` w komponentach
  components/wizard/        — komponenty poszczególnych kroków wizarda
  components/icons.tsx      — zestaw ikon SVG (własne, bez zależności)
  components/preview/       — podgląd 2D (Etap 3)
    ToolpathCanvas.tsx        — React wrapper: <canvas>, devicePixelRatio,
                               ResizeObserver, przerysowanie przy zmianie
                               params/motywu
    drawToolpath.ts            — właściwe rysowanie (Canvas 2D API): siatka,
                               osie X (czerwona) / Y (zielona) — te same
                               wartości hex co `preview3d/buildScene.ts`,
                               każda z grotem strzałki i etykietą na
                               dodatnim końcu (spójny styl z 3D Preview) —
                               punkt (0,0), dla każdego otworu — obrys
                               finalnego otworu (D_hole) + ścieżka
                               narzędzia (promień = (D_hole-D_tool)/2) +
                               przejazdy szybkie (G0) między otworami.
                               Reużywa `resolvePoints()` z `lib/positioning.ts`
                               — geometria liczona raz, wspólnie z silnikiem
  components/preview3d/     — podgląd 3D (Etap 4), doładowywany leniwie
    Scene3D.tsx                — React wrapper: scena/kamera/renderer/
                               OrbitControls, ResizeObserver, przyciski
                               widoku (Top/Isometric/Front/Side/Fit View).
                               Kamera auto-dopasowuje się (izometryczny fit)
                               tylko przy pierwszym zbudowaniu sceny (nie
                               przy każdej zmianie parametru — nie resetuje
                               widoku użytkownikowi w trakcie edycji/obrotu)
    cameraPresets.ts             — VIEW_PRESETS (kierunek + up-vector dla
                               top/isometric/front/side) + frameCamera() —
                               pozycjonuje kamerę wzdłuż kierunku, w
                               odległości dopasowanej do bounds. "Fit View"
                               w Scene3D.tsx używa tej samej funkcji, ale z
                               AKTUALNYM kierunkiem kamery (nie presetem) —
                               więc dopasowuje odległość/target bez zmiany
                               kąta, którym użytkownik akurat patrzy.
                               `direction` = pozycja kamery WZGLĘDEM celu
                               (kamera patrzy w stronę -direction). Wszystkie
                               4 presety są wyprowadzone z czystej matematyki
                               CNC (np. "kamera nad materiałem, patrząc w
                               dół, ekran-prawo = CNC+X, ekran-góra = CNC+Y"
                               dla `top`) i przepuszczone przez mapowanie
                               `toThree()` z `buildScene.ts` — każdy
                               zweryfikowany podstawieniem do wzorów
                               iloczynu wektorowego `lookAt`, nie tylko
                               wizualnie (historia błędnych podejść: 0.6.5,
                               0.6.6 — patrz CHANGELOG 0.6.7 po pełną
                               poprawkę i wyjaśnienie). `front` ma te same
                               liczby co przed poprawką mapowania (przypadkiem
                               renderował się poprawnie już wcześniej); `top`,
                               `side`, `isometric` miały błędne (lustrzane)
                               osie i dostały nowe wartości.
    buildScene.ts               — budowanie obiektów Three.js: płaszczyzna
                               materiału (Z=0) + siatka, osie X (czerwona) /
                               Y (zielona) przez fizyczny origin (0,0), każda
                               z grotem strzałki (`createArrowhead()`) i
                               etykietą tekstową na dodatnim końcu (X/Y) —
                               plus etykieta "0,0" przy origin — wszystko
                               przez sprite'y z canvas-texture (bez
                               dodatkowej zależności typu troika-three-text),
                               punkty helix/standard-hole liczone
                               samodzielnie (mirror pętli z
                               `lib/helix.ts`/`lib/standardHole.ts` — inny
                               format wyjścia, string vs Vector3 — ale
                               dzielenie głębokości na przejścia idzie przez
                               wspólne `computeDepthPasses()`, patrz niżej),
                               cylinder finalnego otworu, przejazdy szybkie
                               między otworami ORAZ pionowe ruchy szybkie
                               (G0 Z) wokół każdego otworu — zjazd na Safe Z
                               → Z0 przed cięciem i wyjazd z powrotem po.
                               Mapowanie CNC (x,y,z) → Three (x,z,-y), czyli
                               CNC Z = Three Y (pionowa oś kamery). Znak minus
                               przy Y jest celowy, nie kosmetyczny: sama
                               zamiana Y↔Z (bez negacji) to permutacja
                               odwracająca chiralność (wyznacznik -1), a
                               `lookAt()` w Three.js zawsze buduje bazę
                               kamery prawoskrętnie — bez tej negacji dla
                               KAŻDEGO presetu kamery jedna z osi ekranu
                               wychodzi lustrzana względem naiwnych oczekiwań
                               w przestrzeni CNC (patrz CHANGELOG 0.6.7,
                               dotyczyło to Top i po cichu też Isometric).
                               Ten sam znak jest zaszyty w hardkodowanym
                               kierunku grotu strzałki osi Y
                               (`createArrowhead` przy budowie osi) — jedyne
                               pozostałe miejsce, które NIE przechodzi przez
                               `toThree()`, więc przy ewentualnej kolejnej
                               zmianie mapowania trzeba pamiętać o ręcznej
                               synchronizacji. Cylinder finalnego otworu miał
                               dokładnie ten sam problem do 0.6.8 —
                               `hole.position.set(p.x, ..., p.y)` ręcznie
                               odtwarzał stare mapowanie zamiast wołać
                               `toThree()`, więc po poprawce z 0.6.7 ścieżka
                               narzędzia (przez `toThree()`) i obrys otworu
                               (poza nim) się rozjechały — teraz też idzie
                               przez `toThree()`. Wniosek na przyszłość: przy
                               kolejnych zmianach mapowania grepować całe
                               `buildScene.ts` pod kątem `.position.set(`
                               używających `p.x`/`p.y` bezpośrednio, nie tylko
                               pod kątem samej definicji `toThree()`.
  lib/                       — czysta logika generowania G-code (Etap 1)
    format.ts                 — formatowanie liczb w G-code (4 miejsca po
                                 przecinku, bez zbędnych zer, bez "-0")
    positioning.ts             — resolvePoints(geometry) → Point2D[]
                                 (single/grid/custom), plus globalny offset
                                 X/Y (`geometry.offsetX/offsetY`, Krok 2,
                                 na samym dole) doliczany jednym krokiem
                                 post-processingu na końcu funkcji —
                                 działa automatycznie dla każdego trybu,
                                 obecnego i przyszłego, bo silnik G-code
                                 oraz 2D/3D Preview wołają `resolvePoints()`
                                 bezpośrednio. Fizyczny origin/osie w
                                 podglądach się nie przesuwają — offset
                                 rusza tylko otwory. Kolor "meta" (amber,
                                 `#d97706`/`#fbbf24`) rezerwowany dla wektora
                                 offsetu w 2D/3D Preview, inny niż fizyczne
                                 osie (czerwień/zieleń) czy origin (indigo)
                                 — patrz CHANGELOG 0.6.13. Ikona `OffsetIcon`
                                 w zwiniętym pasku Kroku 2 jest natomiast
                                 statyczna (nie obraca się pod realny kąt) i
                                 w kolorze pozostałych ikon paska, nie amber
                                 — to tylko subtelny znacznik "offset
                                 ustawiony", nie druga wizualizacja kierunku
                                 (patrz CHANGELOG 0.6.14).
    circle.ts                  — fullCircleMove() — wspólna logika pełnego
                                 okręgu (płaskiego lub helikalnego) w obu
                                 trybach interpolacji (G2/G3 vs G1), używana
                                 przez obie operacje
    depthPasses.ts              — computeDepthPasses(totalDepth, stepdown)
                                 → number[] (lista przejść/obrotów). Jedyne
                                 miejsce dzielące głębokość przez stepdown —
                                 używane przez silnik ORAZ podgląd 3D. Ma
                                 twardy limit 5000 przejść i fallback na
                                 pojedyncze pełne przejście gdy stepdown<=0
                                 — patrz CHANGELOG 0.6.1 (był tu realny
                                 infinite loop przy stepdown=0, wywalał
                                 zakładkę przy live podglądzie 2D/3D)
    program.ts                  — buildHeader/buildFooter/assembleProgram —
                                 wspólny szkielet programu (preambuła,
                                 pętla po punktach, retrakt, stopka)
    helix.ts / standardHole.ts   — generateHelix(params) /
                                 generateStandardHole(params) — publiczne
                                 funkcje `(WizardParams) => string[]`
    validation.ts                — isToolDiameterValid, isStepdownValid —
                                 blokują przycisk Generate na Kroku 4 i
                                 pokazują inline error w Kroku 2/3
    download.ts                  — buildFilename/downloadTextFile — efekt
                                 uboczny (Blob/URL), celowo poza czystym
                                 rdzeniem lib/
    *.test.ts                    — testy Vitest (42 testy, `npm run test`)
  App.tsx                    — orkiestracja stanu wizarda i nawigacji kroków
```

**Zasada:** wszystko co zależy od wybranej operacji (Helix vs Standard —
nazwa, ikona, etykiety pól, **oraz funkcja generująca G-code**: `generate`)
idzie przez `OPERATION_META` w `config/operationMeta.ts`, nie przez
rozproszone `operation === 'helix' ? ...` w komponentach. Wywołanie
`OPERATION_META[params.operation].generate(params)` to jedyne miejsce,
które powinno wołać silnik — nie importować `generateHelix`/
`generateStandardHole` bezpośrednio w komponentach UI.

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
  typografia, kolorystyka) — szczególnie przydatne przy dalszym rozwoju
  wizarda i przyszłym podglądzie 2D/3D (Etapy 3-4), żeby nie osiadło na
  domyślnym "wyglądzie AI".
- **`threejs-*`** (fundamentals, geometry, materials, lighting, animation,
  interaction, loaders, shaders, textures, postprocessing) — osobne
  skille, nie jeden zbiorczy "threejs". Ładować przy pracy nad
  `src/components/preview3d/` — najczęściej przydatne: `threejs-fundamentals`
  (scena/kamera/renderer/dispose), `threejs-geometry` (linie, cylindry,
  BufferGeometry), `threejs-interaction` (OrbitControls).
- **`/grill-me`** — przed rozpoczęciem nowego Etapu albo większej pozycji z
  "Pozostało"/"Pomysły na przyszłość" (np. "N-holes on circle", "Rectangle
  Cut Out"), gdy specyfikacja w tym pliku jest szkicowa i zostawia otwarte
  decyzje projektowe do ustalenia przy implementacji — użyć zamiast
  zgadywać/zakładać, żeby dojść do wspólnego zrozumienia zakresu przed
  napisaniem kodu.

## Konwencje

- Wersjonowanie i historia zmian: **`CHANGELOG.md`** (projekt nie używa
  gita — każda znacząca zmiana/etap dostaje wpis tam, nie w commit message).
- Brak testów E2E w MVP — tylko testy jednostkowe silnika G-code.
