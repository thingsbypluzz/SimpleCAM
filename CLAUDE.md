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
- [x] **Etap 2** — integracja silnika z wizardem (`METHOD_META[...].generate`),
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
      **2D Preview** / **G-Code** w nagłówku prawego panelu (pierwotnie
      domyślnie 2D Preview — od 0.8.4 domyślną zakładką jest **3D
      Preview**, patrz Etap 4). W przeciwieństwie do G-Code Preview, **2D
      Preview jest
      zawsze live** — nie wymaga klikania Generate, bo to widok
      poglądowy/read-only, nie artefakt do eksportu (ryzyko "nieaktualnych
      danych" dotyczy tylko Copy/Download).
- [x] **Etap 4** — wizualizator 3D (Three.js). Trzecia zakładka **3D
      Preview** obok 2D Preview / G-Code w prawym panelu (od 0.8.4:
      pierwsza, domyślnie aktywna zakładka — patrz Etap 3). `Scene3D`
      wczytywany przez `React.lazy()` — Three.js (~550KB) trafia do
      osobnego chunka, ładowanego dopiero po otwarciu zakładki (opcjonalny
      z założenia, więc nie ma obciążać startowego bundle'a). OrbitControls
      do rotacji/zoomu. Przyciski widoku: **Top / Isometric / Front / Side
      / Fit View** — presety ustawiają konkretny kąt + dopasowują odległość,
      Fit View dopasowuje odległość/target zachowując aktualny kąt kamery
      (patrz `cameraPresets.ts`). Domyślny widok przy otwarciu zakładki to
      dopasowany **Front** (do 0.8.3 był to Isometric — zmienione na
      życzenie użytkownika, patrz niżej) — ustawiany raz przy pierwszym
      zbudowaniu sceny, nie przy każdej zmianie parametru (nie zrzuca
      widoku użytkownikowi w trakcie edycji/obrotu). Isometric wciąż
      istnieje jako preset/przycisk, nadal zorientowany tak, żeby patrzeć w
      kierunku **+Y**, z kamerą nad ćwiartką **III (-X,-Y)** — obrabiane
      elementy najczęściej leżą w ćwiartce I (+X,+Y), więc kamera z
      przeciwległej ćwiartki patrzy "przez" obszar roboczy, nie "zza" niego
      (`VIEW_PRESETS.isometric.direction` w `cameraPresets.ts`). Osie X
      (czerwona) / Y (zielona) z grotem strzałki i
      etykietą na dodatnim końcu (kierunek, nie tylko orientacja) + etykieta
      "0,0" przez fizyczny origin, oraz pionowe linie `G0 Z` (zjazd na
      materiał / wyjazd na Safe Z) przy każdym otworze. Jak 2D Preview:
      zawsze live, nie wymaga Generate.
      - [x] **0.8.4 — Front stał się domyślnym widokiem (zamiast
        Isometric), i dostał podniesienie na Z.** Sesja `/grill-me`:
        użytkownik chciał domyślnego rzutu "prosto wzdłuż osi Y,
        wyśrodkowanego między ćwiartką III i IV, patrząc na I/II" —
        matematycznie to CNC-space kierunek `(0,-1,0)`, dokładnie to, co
        `front` już reprezentował (zweryfikowane podstawieniem do
        `toThree()`), więc zamiana defaultu z isometric na front nie
        wymagała nowej matematyki. Pierwsza wersja (czysto płaski,
        `(0,-1,0)`) okazała się jednak złym **domyślnym** kątem: brak
        sygnału głębi sprawiał, że drobne przeciągnięcia OrbitControls nie
        dawały widocznego efektu, co wyglądało jak "kamera nie reaguje".
        `VIEW_PRESETS.front.direction` dostał więc to samo podniesienie
        na Z co `isometric` (CNC `(0,-1,0.85)` zamiast `(0,-1,0)`), przy
        zachowanym `X=0` (środek między ćwiartkami III/IV, bez zsunięcia
        w bok jak przy isometric). To jednocześnie zmieniło znaczenie
        przycisku **Front** (już nie płaski rzut) i domyślny widok sceny
        — jedna wspólna wartość w `VIEW_PRESETS.front`.
      - [x] **0.8.4 — naprawiony bug: domyślna kamera czasem "zatrzaskiwała
        się" w punkcie (0,0,0), z martwymi OrbitControls.** Prawdziwa
        przyczyna nie miała nic wspólnego z kątem kamery: `hasFramedRef`
        w `Scene3D.tsx` (blokada "auto-kadruj tylko raz") nigdy nie była
        resetowana przy budowie nowej kamery. React `StrictMode`
        (`main.tsx`) celowo uruchamia efekt mountujący dwukrotnie na tej
        samej instancji komponentu (setup → cleanup → setup) — refy
        przeżywają między przebiegami, więc druga, docelowa kamera
        zostawała bez wywołania `frameCamera()` (flaga już `true` po
        pierwszym przebiegu), lądując na domyślnej pozycji Three.js
        `(0,0,0)` — dokładnie na origin, z zerowym promieniem orbitowania
        (`camera.position === controls.target`), stąd martwe sterowanie.
        Naprawione: `hasFramedRef.current = false` na starcie efektu
        setupowego, więc każda nowo zbudowana kamera dostaje dokładnie
        jedno auto-kadrowanie. Błąd istniał od Etapu 4, ujawnił się
        dopiero gdy 3D Preview zostało domyślną zakładką.
- [x] **Etap 5** — walidacje, localStorage, polish. Zrobione:
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
        opcje metody (Helix + Standard), każda z własną etykietą —
        aktywna w pełnym kolorze, nieaktywna wyszarzona/przygaszona.
        Iteruje po `METHOD_LIST` w `App.tsx`.
      - [x] **Domyślna interpolacja okręgów: G1 (segmented)** zamiast
        G2/G3 (arc) — `DEFAULT_WIZARD_PARAMS.output.interpolation`.
      - [x] **Rectangular Grid (Centered)** — nowy, osobny wariant
        `PositioningMode` (`'gridCentered'`, nie toggle wewnątrz Grid),
        zaraz po zwykłym Grid w Kroku 2. Reużywa `gridX`/`gridY` i te
        same pola UI; rogi wyśrodkowane `(±gridX/2, ±gridY/2)` zamiast
        `(0,0)…(gridX,gridY)`, ten sam porządek co Grid. Automatycznie
        działa z offsetem X/Y i podglądami (nowy `case` w
        `resolvePoints()`, zero innych zmian). Pasek: `RECT X×Y (C)`.
      - [x] **N-Holes on Circle** — nowy wariant `PositioningMode`
        (`'circle'`), po Grid Centered w Kroku 2. Parametry:
        `circleHoleCount`, `circleDiameter`, `circleStartAngle` (stopnie,
        0°=+X, rośnie przeciwnie do wskazówek zegara — ta sama konwencja
        co Offset X/Y). Okrąg wyśrodkowany na `(0,0)`. Jak Grid Centered:
        jedyna zmiana to nowy `case` w `resolvePoints()`, silnik G-code
        i podglądy 2D/3D zadziałały bez zmian. Pasek: `CIRCLE N×⌀D`.
      - [x] **Ikony w podsumowaniu Kroku 2** (zwinięty pasek), plus
        opisowy tekst zamiast skróconego kodu — `SINGLE HOLE` /
        `RECTANGLE (X×Y)` / `RECTANGLE CENTERED (X×Y)` /
        `N-HOLES CIRCLE (⌀…)` / `CUSTOM POINTS (N)`, rozbity na kilka
        linijek (`positioningLines()` w `src/App.tsx`, wąska 80px kolumna
        nie mieści dłuższego tekstu w jednej linii). Nowe komponenty SVG
        w `src/components/icons.tsx`: `SingleIcon` (crosshair + kropka na
        origin), `RectangleIcon` (4 punkty w prostokąt, większy w lewym
        dolnym rogu — tam jest 0,0), `RectangleCenteredIcon` (te same
        4 punkty, większy w środku), `CircleHolesIcon` (okrąg + kropki po
        obwodzie, większa kropka w środku), `CustomPointsIcon` (delikatne
        osie X/Y + kropka w ćwiartce +X/+Y). Dobór ikony/tekstu przez
        `positioningIcon()`/`positioningLines()`, exhaustive switch po
        `PositioningMode` jak wszędzie indziej.
      - [x] **PLUNGE i STARTZ w podsumowaniu Kroku 3** — nowe `MiniStat`
        obok FEED/stepdown-a. PLUNGE zawsze widoczny (`plungeRate`,
        `PlungeIcon` — strzałka w dół przez linię powierzchni). STARTZ
        widoczny tylko gdy `startZ !== 0` (ten sam wzorzec co OFFSET w
        Kroku 2), `StartZIcon` — lustrzana strzałka w górę + mały "+"
        przy grocie.
      - [x] **Badge Kroku 4** (zwinięty pasek) — indigo checkmark tylko
        gdy `generatedGCode` istnieje (po Generate, przed unieważnieniem
        przez zmianę parametru — patrz Etap 2); w przeciwnym razie amber
        X (`XIcon`), sygnalizujący że trzeba kliknąć Generate.
      - [x] **localStorage — auto-save + presety** (dawne "Pozostało"
        Etapu 5, połączone z wcześniejszym wishlist-pomysłem "Presety
        operacji" po sesji `/grill-me` 2026-08-18 — jeden mechanizm
        storage zamiast dwóch niezależnych). Nowy moduł
        `src/lib/storage.ts`: jeden klucz `localStorage`
        (`simplecam.storage`), jeden JSON `{ version, slots: { "0"…"5" } }`.
        Slot `"0"` = niewidoczny auto-save bieżącego stanu, zapisywany
        wyłącznie przy kliknięciu **Generate** (nie co zmianę
        parametru/keystroke — świadomie: "zapisujemy to, co user uznał
        za gotowe", akceptowane ryzyko utraty niezapisanej edycji przy
        zamknięciu karty bez Generate), wczytywany raz przy starcie
        appki (`loadInitialState()` w `App.tsx`, lazy `useState`
        initializer) — jeśli coś jest, wizard od razu otwiera się na
        **Kroku 4** z subtelnym bannerem "Restored from your last
        session" (znika po pierwszej zmianie parametru albo Generate).
        Sloty `"1"`–`"5"` = nazwane presety, widoczne jako `[1]…[5]` w
        headerze — puste wyszarzone/nieklikalne (pokazują numer slotu),
        zajęte klikalne (klik = load, natychmiastowy, bez potwierdzenia
        — spójnie z resztą appki, która nigdzie indziej nie pyta o
        niezapisane zmiany), pokazują ikonę metody, którą przechowują
        (`METHOD_META[preset.method].Icon` zamiast numeru — 0.7.1,
        na życzenie użytkownika: "niech ikonki presetów na górze
        zapisanych przyjmują obraz operacji jaką przechowują" — ówczesne
        słowo "operacja" znaczyło to, co dziś "metoda", patrz `0.8.12`
        niżej), i z
        ikonką "×" przy hoverze do usunięcia (z potwierdzeniem). Zapis
        do slotu — nowa sekcja "Save to preset" na Kroku 4
        (`Step4Output.tsx`), przycisk na slot, z potwierdzeniem przy
        nadpisaniu zajętego i krótkim "✓ Saved" feedbackiem (ten sam
        wzorzec co istniejące "Copied!" w tym samym pliku). Etykieta
        slotu to auto-opis z parametrów, nie nazwa wpisywana przez
        użytkownika — `presetLabel()` w nowym `src/lib/presetLabel.ts`
        (np. `"Helix • ⌀8mm, 4mm deep"`). Migracja schematu: płytki
        merge per-sekcja (`geometry`/`feeds`/`output`) z
        `DEFAULT_WIZARD_PARAMS` w `loadSlot()`/`loadPresetSlots()` —
        brakujące pola po dodaniu nowych w przyszłości dostają wartości
        domyślne. Błędy (private mode, quota exceeded, uszkodzony JSON)
        — cichy fallback do wartości domyślnych/stanu w pamięci +
        `console.warn`, appka nigdy się nie wywala. Świadomie poza
        zakresem: brak nazywania presetów przez usera (tylko
        auto-opis), brak "Reset to defaults"/"Clear saved state", brak
        grupowania kilku operacji pod jednym presetem (odrzucone
        wcześniej — jeden preset = jeden `WizardParams`, jak stała
        decyzja "Jedno narzędzie na wygenerowany plik" wymagała).
- [x] **Etap 6** — reorganizacja taksonomii wizarda: pattern na Krok 1,
      method na Krok 2. Wynik sesji `/grill-me` 2026-08-19 (pełny zapis
      dyskusji w `ideas.md`), zainicjowany realnym problemem UX: dwa
      zapisane presety Helix (różny `PositioningMode`, np. pojedynczy
      otwór vs 5 otworów na okręgu) wyglądały identycznie w headerze, bo
      ikona/etykieta presetu kluczowała się po **method**
      (`MethodType`: Helix/Standard), nie po **pattern**
      (`PositioningMode`: Single/Grid/Grid Centered/N-Holes Circle/
      Custom) — a to właśnie pattern odpowiada na pytanie "co user
      faktycznie zrobił", method tylko na "jak".
      - [x] **Krok 1 = tylko wybór patternu, Krok 2 = wszystko
        liczbowe.** Krok 1 (`Step1Positioning.tsx`, nowy plik) to
        wyłącznie kartowy picker patternu (Single/Grid/Grid Centered/
        N-Holes Circle/Custom) + placeholdery operacji (patrz niżej) —
        celowo "wizualnie lekki", **żadne** pattern-specific pola tam
        nie mieszkają. Krok 2 (`Step2Geometry.tsx`) zostaje z Tool
        Diameter/Hole Diameter/Total Depth i przejmuje **wszystko
        pozostałe**: nowy toggle **Method** (`MethodPicker.tsx`, rename
        dawnego `Step1Operation.tsx`, logika wyboru 1:1 ale przepisana
        na kompaktowy dwuprzyciskowy toggle — ten sam styl co
        Circle Interpolation (arcs/segments) na Kroku 4, nie duże karty
        jak w dawnym Kroku 1 Operation (ówczesna nazwa ekranu wyboru
        Helix/Standard, dziś Method — nie mylić z dzisiejszym znaczeniem
        słowa "Operation", patrz `0.8.12` niżej), bo tu jest to jedno z
        kilku pól
        drugorzędnych, nie jedyna treść kroku), pattern-specific pola
        (grid X/Y, circle count/diameter/start angle, custom points
        textarea) i blok Offset X/Y — dokładnie jak ustalono w
        `/grill-me` ("Krok 2 zostaje z tym, czym jest dziś sekcja
        Geometry minus sam wybór trybu positioning, plus dołożony
        toggle method"). Zero zmian w `WizardParams`/typach —
        `method` (nazwane wtedy `operation`, patrz `0.8.12` niżej) i
        `geometry.positioning` były już niezależnymi polami
        `WizardParams` (żadne nie zagnieżdżone w drugim), to czysta
        reorganizacja UI/wiring.
      - [x] **Podwójne parametry (X/Y) renderowane w jednej linii, nie
        jeden pod drugim** — Grid X/Y i Offset X/Y w `Step2Geometry.tsx`
        to teraz dwa `FieldRow` obok siebie (`flex gap-4`, każdy
        `min-w-0 flex-1`) zamiast osobnych wierszy, oszczędza pionowe
        miejsce w i tak już gęstym Kroku 2. Świadomy, wąski wyjątek od
        zasady "Layout wizarda: ... pola/opcje w jednej kolumnie" (patrz
        "Kluczowe decyzje projektowe" niżej) — dotyczy wyłącznie
        analogicznych par X/Y, nie ogólnej zmiany na siatkę/wiersze.
        Circle (Hole Count/Diameter/Start Angle — trzy pola o różnym
        znaczeniu, nie para X/Y) zostaje bez zmian, jeden pod drugim.
        `min-w-0` na obu `flex-1` wrapperach jest tu konieczny, nie
        kosmetyczny — bez niego pojawiał się poziomy scroll na Kroku 2
        (0.8.1): `<input>` bez jawnej szerokości ma domyślną
        min-content ~20 znaków (przeglądarkowy default dla `size`), a
        flex items mają domyślnie `min-width: auto`, więc flex-shrink
        nie mógł zejść poniżej tej szerokości formularza — dwa pola
        obok siebie (2×~20 znaków + gap + padding panelu) nie mieściły
        się w 420px panelu kroku. `min-w-0` znosi tę podłogę, a input i
        tak dostaje pełną dostępną szerokość przez `align-items: stretch`
        domyślne na `label.flex.flex-col` w `FieldRow` — bez potrzeby
        `w-full` na samym inputcie. Ten sam wzorzec przyda się przy
        każdym kolejnym grupowaniu pól w wiersz (np. Circle
        Diameter/Start Angle, gdyby kiedyś też miały iść obok siebie).
      - [x] **Krok 1 nie auto-advance'uje** po kliknięciu patternu (w
        przeciwieństwie do dawnego Kroku 1 Operation — ówczesna nazwa
        ekranu wyboru Helix/Standard, dziś Method — który
        auto-advance'ował na klik) — ustalone z userem: spójność z
        resztą wizarda, który nigdzie indziej nie auto-advance'uje na
        wybór, wymaga przycisku Next jak pozostałe kroki
        (`STEPS_WITH_NEXT_BUTTON` rozszerzony z `Set([2, 3])` na
        `Set([1, 2, 3])`).
      - [x] **Nowy `src/config/positioningMeta.ts`** — analogiczny do
        `config/methodMeta.ts`, jedno źródło prawdy dla wszystkiego
        zależnego od `PositioningMode` (wcześniej rozproszone jako
        lokalne funkcje w `App.tsx`): `POSITIONING_META`/
        `POSITIONING_LIST` (karty Kroku 1, tytuł/opis/ikona per mode),
        `positioningIcon()`/`positioningLines()`/`positioningSummary()`
        (zwinięte paski — przeniesione z `App.tsx` bez zmian w logice),
        oraz nowe `patternLabel()` (zwarta jednoliniowa etykieta, np.
        `"5-Holes Circle"`, `"Rectangle 50×30"`) i `patternSlug()`
        (filename-safe slug, np. `"5holes-circle"`, `"grid-centered"`).
      - [x] **Ikona/etykieta presetu w headerze — pattern jako główna
        tożsamość.** Header (`App.tsx`) i `presetLabel()`
        (`src/lib/presetLabel.ts`) przeszły z `METHOD_META[method]
        .Icon`/`shortLabel` na `positioningIcon(geometry.positioning)`/
        `patternLabel(geometry)`. `presetLabel()` zmienia się z
        `"Helix • ⌀8mm, 4mm deep"` na `"5-Holes Circle • Helix •
        ⌀8mm"` (pattern na początku, method drugorzędny, depth wypada z
        etykiety). To bezpośrednio rozwiązuje oryginalny problem UX: dwa
        różne presety Helix (różny pattern) dostają teraz różne
        ikony/etykiety zamiast identycznych.
      - [x] **Nazwa pliku wyjściowego — pattern zamiast method.**
        `buildFilename()` (`src/lib/download.ts`) zmienia sygnaturę z
        `(method: MethodType)` na `(params: WizardParams)`,
        `simplecam-<operacja>-<data>.gcode` →
        `simplecam-<pattern>-<data>.gcode` (np.
        `simplecam-5holes-circle-2026-08-20.gcode`).
      - [x] **Zapisane presety w localStorage nie wymagały migracji
        schematu** — `geometry.positioning` był już częścią zapisanego
        `WizardParams` JSON-u, zmieniła się wyłącznie logika odczytu
        (`presetLabel.ts`, header), nie sam zapis.
      - [x] **Placeholdery przyszłych operacji** (Outline/Pocket/
        Surface) w `Step1Positioning.tsx`: "Hole(s)" aktywny (dziś jedyna
        realna operacja), pozostałe trzy wyszarzone/nieklikalne z etykietą
        "Coming soon". Pierwotnie (0.8.0) rząd 4 kafelków w poziomym
        gridzie nad listą patternów — **w 0.8.2 przełożone na pionowy
        stos** (patrz bullet niżej), ale sam koncept placeholderów bez
        zmian. Czysto wizualne — świadomie **nie** modelowane jako pole
        `operation`/`family` w `WizardParams`/typach, dopóki istnieje
        tylko jedna realna operacja (unikanie projektowania pod
        hipotetyczne wymagania). Każda przyszła operacja — `OP-1`
        (Outline), `OP-2` (Pocket), `OP-3` (Surface), patrz sekcja
        "Przyszłe operacje" niżej — wymaga własnej sesji `/grill-me`
        przed realną implementacją — patrz `ideas.md` dla pełnego zapisu
        dyskusji nt. docelowej taksonomii (operacja → pattern/sub-choice
        → parametry; ta sesja jeszcze mówiła o "rodzinach", patrz `0.8.12`
        niżej po zmianę nazewnictwa).
      - [x] **0.8.2 — Krok 1 przebudowany na pionowy stos operacji**
        (zamiast poziomego gridu 4 kolumn + oddzielnej listy dużych kart
        patternu poniżej). Feedback po sesji `/grill-me`: karty patternu
        były za duże względem paska rodzin (dawna nazwa, patrz `0.8.12`),
        a podział na dwie sekcje nie oddawał relacji "pattern należy do
        Hole(s)". Operacje (Hole(s), Outline, Pocket, Surface) są teraz
        pełnej szerokości wierszami,
        jeden pod drugim — ten sam pomysł co akordeon 4 kroków wizarda,
        zagnieżdżony jeden poziom głębiej. **Hole(s)** to jedyna
        rozwinięta/aktywna sekcja: pogrubiony, większy nagłówek "Hole(s)"
        (podkreśla relację rodzic-dziecko), a pod nim skompresowana
        pionowa lista 5 patternów — ikona + tytuł (z
        `POSITIONING_META[...].title`, bez opisu), jeden wiersz na
        pattern zamiast dawnych dużych kart `p-5`. Outline/Pocket/Surface
        zostają zwiniętymi, wyszarzonymi, pełnej szerokości paskami.
        `POSITIONING_LIST` reużyty bez zmian — czysta reorganizacja JSX w
        `Step1Positioning.tsx`, zero zmian w `WizardParams`/
        `positioningMeta.ts`.
      - [x] **0.8.3 — Krok 2 dostał powtórzony "Pattern: `<nazwa>`" pod
        Method, plus kreska przed Offset.** Kontynuacja tej samej sesji:
        pod rzędem `Method: [Helix][Standard]` doszedł analogiczny rząd
        `Pattern: <nazwa>` + krótki, generyczny opis z
        `POSITIONING_META[...]` — spójny dla wszystkich 5 patternów,
        zastąpił dawne, niespójne zdania przy niektórych z nich (Single:
        "zero the machine at the hole location", Grid Centered: "zero the
        machine at the pattern center", Circle: "starting at Start Angle
        and going counter-clockwise" — usunięte; Grid i Custom wcześniej
        nie miały żadnego opisu). Sekcja **Offset** dostała `border-t`
        oddzielający ją wizualnie od pól powyżej (ten sam wzorzec co
        "Save to preset" w `Step4Output.tsx`). Przy okazji: etykiety Grid
        X/Y zmienione na "Width (X) [mm]" / "Height (Y) [mm]"
        (Rectangular Grid i Grid Centered, wspólny blok JSX), i krok
        spinnera (up/down) na Hole Diameter/Total Depth zmieniony z 0.01
        na 0.1, na Stepdown (Krok 3) na 0.05 — precyzja setnych nadal
        osiągalna wpisaniem z klawiatury, `step` HTML wpływa tylko na
        wielkość skoku spinnera.
      - [x] **`0.8.12` — terminologia "Operation" przepisana na rodzinę,
        stare znaczenie (Helix/Standard) przechrzczone na "Method".**
        Wynikło z drobnej prośby o zmianę tekstu nagłówka Kroku 1
        ("Pattern" → "Operation & Pattern"), która ujawniła kolizję: słowo
        "Operation" było już zajęte w kodzie (`OperationType`,
        `OPERATION_META`, pole `WizardParams.operation`) przez koncept
        Helix/Standard — od dawna zresztą user-facing nazywany "Method"
        (rząd "Method: [Helix][Standard]" na Kroku 2 istniał już od
        Etapu 6). Ustalono w rozmowie: user chce, żeby "Operation" znaczyło
        to, co dotąd nazywało się "rodzina"/"family" (Hole(s) dziś,
        Outline/Pocket/Surface w przyszłości) — bliższe temu, co user
        faktycznie kojarzy ze słowem w kontekście appki. Stąd
        dwukierunkowa zamiana, czysto nazewnicza (zero zmian w zachowaniu):
        - `OperationType`/`WizardParams.operation`/`OPERATION_META`/
          `OPERATION_LIST` (`config/operationMeta.ts`) → `MethodType`/
          `WizardParams.method`/`METHOD_META`/`METHOD_LIST`
          (`config/methodMeta.ts`, plik przemianowany). Bez migracji
          zapisanych presetów w `localStorage` (świadoma decyzja, jak
          przy `BL-2` — jednoosobowy projekt w fazie testów): stary klucz
          `operation` w już zapisanym JSON-ie jest po prostu ignorowany,
          `method` wraca do domyślnego Helix.
        - `FAMILY_PLACEHOLDERS` (`Step1Positioning.tsx`) →
          `OPERATION_PLACEHOLDERS`; `FAM-#` (schemat referencyjny dla
          Outline/Pocket/Surface) → `OP-#`, sekcja "Przyszłe rodziny
          operacji" → "Przyszłe operacje" (patrz niżej). Renderowane
          napisy ("Hole(s)", "Outline", "Pocket", "Surface", "Coming
          soon") bez zmian.
        Historyczne wzmianki gdzie indziej w tym pliku o dawnym "Kroku 1
        Operation" (sprzed reorganizacji Etapu 6, ekran wyboru
        Helix/Standard) dostały dopisek disambiguujący — to inny,
        wcześniejszy byt niż dzisiejsze znaczenie słowa "Operation", nie
        pomyłka.

## Backlog (`BL-#`)

Wszystkie niezaimplementowane pomysły/notatki "do rozważenia" w tym
pliku — niezależnie od tego, w której sekcji faktycznie mieszkają
(część jest tutaj, część przy „Kluczowe decyzje projektowe" czy
„Hosting testowy") — mają stabilny numer `BL-1`…`BL-13`, dopisany na
początku swojego bulletu. Numer nadawany jest raz i nie zmienia się przy
regrupowaniu/reprioritetyzacji — to czysty identyfikator do odnoszenia
się w rozmowie ("zrób BL-4"), świadomie odróżniony od **Etapu**
(Etap = ukończony, numerowany kamień milowy w historii projektu, patrz
"Status / Etapy" wyżej — BL-# to coś jeszcze nieruszonego). Osobna,
większa kategoria — całe przyszłe operacje (Outline/Pocket/Surface) —
dostaje własny, celowo odróżniony schemat `OP-#`, patrz sekcja
"Przyszłe operacje" niżej.

Ta sama lista, wizualnie — pogrupowana etapami trudności i z kolorowym
oznaczeniem 🟢/🟠/🔴 — jest opublikowana jako Artifact:
**<https://claude.ai/code/artifact/e90a2f5c-932c-4772-804e-0fe155ab32a0>**.

**Zasada — trzymać oba źródła w zgodzie:** po wdrożeniu zmiany
odpowiadającej któremuś `BL-#`/`OP-#` (patrz niżej) — usunąć/oznaczyć
jako zrobiony bullet w tym pliku (jak dotychczas przy Etapach) **i**
zaktualizować Artifact pod tym samym URL (republikacja z `url`
ustawionym na powyższy link, nie nowa publikacja) — usunąć pozycję z
listy, poprawić liczniki w pasku statystyk na górze. Bez tego kroku
Artifact szybko rozjeżdża się ze stanem faktycznym, dokładnie jak
wcześniej rozjechał się sam CLAUDE.md względem kodu (patrz poprawki z
2026-08-21 opisane przy Etapie 4).

## Przyszłe operacje (`OP-#`)

Osobna, celowo **nie** `BL-#` kategoria — Outline/Pocket/Surface (patrz
placeholdery w `Step1Positioning.tsx`, Etap 6) to nie drobne poprawki
tylko kamienie milowe wielkości całego Etapu, każdy z własną, dziś
nieznaną taksonomią (operacja → pattern/sub-choice → parametry, patrz
`ideas.md`). Numer `OP-#` jest identyfikatorem, nie kolejnością
realizacji — żadna z trzech nie jest dziś zaplanowana jako "następna"
względem pozostałych. (Do `0.8.12` ten schemat nazywał się `FAM-#`
["family"] — patrz nota niżej przy Etapie 6 po pełne uzasadnienie
zmiany.)

- **`OP-1` — Outline.** Frezowanie po konturze (kontur zamknięty lub
  otwarty) — najbliższe koncepcyjnie już zaplanowanemu `BL-6` (Rectangle
  Cut Out), który można traktować jako pierwszy, najprostszy przypadek
  tej operacji (prostokąt = szczególny przypadek konturu).
- **`OP-2` — Pocket.** Kieszeniowanie — wybieranie materiału wewnątrz
  zamkniętego konturu (nie tylko po samej linii), wymaga strategii
  wypełnienia (np. zigzag/spiral) nieobecnej dziś w silniku w ogóle.
- **`OP-3` — Surface.** Planowanie/frezowanie powierzchni (face
  milling) — inny paradygmat niż "otwór"/"kontur": wejściem jest
  obszar, nie ścieżka.

**Każda z `OP-#` wymaga własnej, pełnej sesji `/grill-me` przed
napisaniem jakiegokolwiek kodu** — nieporównywalnie większy zakres
otwartych decyzji niż `BL-#` (patrz `ideas.md` dla pełnego zapisu
wcześniejszej dyskusji nt. docelowej taksonomii). Z tego powodu
Artifact pokazuje je jako osobną sekcję, nie jako kolorowe
łatwe/średnie/trudne zadania — trudność jest dziś celowo nieoszacowana,
`/grill-me` to część definiowania zakresu, nie coś do zgadnięcia z góry.

## Pomysły na przyszłość (poza MVP, poza Etapem 5)

Większe rozszerzenia zakresu — nie polish istniejących operacji, tylko
nowa funkcjonalność. Nie zaczynać bez wyraźnego "przechodzimy do X".

- **`BL-5`** — **Przełącznik dialektu G-code (GRBL / Marlin / Mach3).**
  Pierwotnie planowany jako pole w `WizardParams.output` (per-preset) —
  sesja `/grill-me` 2026-08-22 przeniosła go koncepcyjnie do **Machine
  Settings** (`MachineSettings.dialect`, `BL-9`), obok `travelX/Y/Z`:
  dialekt sterownika jest fizyczną cechą Twojej maszyny (zmienia się,
  gdy zmienisz kontroler, nie między zadaniami), nie parametrem
  pojedynczego joba — ten sam podział, który już odróżnia
  `MachineSettings` od `WizardParams` dla reszty appki. Domyślnie
  `'grbl'` (najpopularniejszy w hobbystycznych sterownikach, zero zmiany
  zachowania dla kogoś, kto nigdy nie otworzy Settings — ten sam wzorzec
  co domyślne X=5000/Y=5000/Z=1000). Dziś jedyny znany, konkretny
  przypadek użycia: `G4 P<sekundy>` (dwell po starcie wrzeciona) jest
  poprawne dla GRBL/Mach3, ale Marlin interpretuje `P` jako milisekundy
  — patrz notatka przy `G4 P` w "Kluczowe decyzje projektowe" niżej.
  Styka się z `BL-10` (koniec programu `M30`/`M2`), który też może
  zależeć od tego samego pola — patrz tam. **Nieustalone jeszcze:**
  dokładna lista miejsc w silniku, które mają czytać to pole (na razie
  tylko `G4 P` jest potwierdzonym przypadkiem), i czy dialekt wpływa na
  cokolwiek poza `program.ts` (np. czy warto go pokazywać/używać gdzieś
  w UI Kroku 3/4). Wymaga własnej implementacji: `dialect` w
  `types/machine.ts`/`DEFAULT_MACHINE_SETTINGS`, pole wyboru w
  `SettingsModal.tsx`, warunkowa emisja w `buildHeader()`.
- **`BL-6`** — **Nowa metoda: "Rectangle Cut Out"** — trzecia metoda obok Helix i
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
  - Wymaga: nowej wartości `MethodType` (`'rectangleCutOut'`), nowego
    wpisu w `METHOD_META`, nowego modułu w `src/lib/` (z własnymi
    testami — offset/tabs to nietrywialna geometria, inna niż okrąg),
    nowej sekcji parametrów w UI (prawdopodobnie nowy krok albo
    rozszerzenie Kroku 2), oraz sprawdzenia czy podgląd 2D/3D (które dziś
    zakładają "okrąg" jako kształt operacji) w ogóle się do tego nadają
    czy potrzebują osobnej ścieżki rysowania.
- **`BL-8`** — **Responsywny UI na małych ekranach.** Dziś layout
  zakłada desktop: dwukolumnowy układ (akordeon wizarda + panel
  podglądu 2D/3D/G-Code obok siebie), gęste pola liczbowe w parach
  X/Y w jednej linii, kanwa Three.js z absolutnie pozycjonowanymi
  przyciskami widoku. Dotyka praktycznie każdego komponentu, nie
  jednego miejsca — wymaga przemyślenia, czy panel podglądu
  chowa się pod wizardem czy za zakładką, czy pary X/Y wracają do
  jednej kolumny na wąskim ekranie, itd. Do zrobienia zgodnie z
  aktualnymi best practices frontendowymi (breakpointy Tailwind już
  są w projekcie, ale nieużywane responsywnie poza defaultową
  szerokością).
- **`BL-10`** — **Brak zakończenia programu (`M30`/`M2`).** `buildFooter()`
  kończy plik na `M5` / `G0 X0 Y0`, bez formalnego "koniec programu" —
  część kontrolerów tego oczekuje (m.in. żeby wrócić do początku pliku i
  zresetować stan modalny). Sama zmiana to jedna linia, ale zostawia
  drobiazgi do rozstrzygnięcia: `M30` (koniec + rewind) czy `M2` (samo
  zakończenie), bezwarunkowo czy pod checkboxem w Kroku 4, i czy wybór
  zależy od `MachineSettings.dialect` (patrz `BL-5` wyżej — jeśli tak,
  to dwie różne przyszłe implementacje czytają to samo pole Machine
  Settings, nie dwa osobne mechanizmy).
- **`BL-11`** — **Zoom/pan na 2D Preview.** Dziś `drawToolpath()` nie ma
  żadnego stanu kamery — przelicza skalę/wycentrowanie od zera przy
  każdym renderze, zawsze dopasowując się do danych (patrz `BL-3`).
  User chciałby, żeby canvas reagował na scroll myszki (zoom in/out) i
  dostał osobny przycisk **Fit View** w prawym dolnym rogu (jak w 3D
  Preview) — wymaga wprowadzenia realnego stanu kamery (offset/zoom),
  którego 2D dziś celowo nie ma, plus obsługi zdarzenia `wheel` i
  przeliczenia `toPx()`/bounds pod kątem tego stanu zamiast zawsze liczyć
  je na nowo z danych.
- **`BL-12`** — **Presety kolorów renderowania 2D/3D w Settings.**
  Dziś `drawToolpath.ts`/`buildScene.ts` mają po dwa stałe motywy
  (`LIGHT_THEME`/`DARK_THEME`), przełączane wyłącznie dark/light
  mode'em. Dodać do `SettingsModal.tsx` (`BL-9`) wybór spośród kilku
  gotowych palet kolorów dla obu podglądów — wymaga zdefiniowania
  zestawu presetów kolorystycznych, sposobu ich przechowania (nowy klucz
  w `machineStorage.ts` czy osobny), i przekazania wybranej palety przez
  propsy do `ToolpathCanvas`/`Scene3D` zamiast dzisiejszych
  wbudowanych stałych. Styka się z odłożoną w `BL-3` decyzją o braku
  kolorów per-slot w overlay — dobry moment żeby to razem przemyśleć.
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
  w MVP (`BL-7` — możliwe rozszerzenie w przyszłości, patrz Backlog).
- **Ruch między otworami:** powrót na `Safe Z` przed `G0` do kolejnego
  punktu XY.
- **Wrzeciono:** tylko `M3` (bez `M4`) w MVP.
- **Jedno narzędzie na wygenerowany plik** — brak zmiany narzędzia.
- **Nazwa pliku wyjściowego:** `simplecam-<pattern>-<data>.gcode` (od
  Etapu 6 — pattern, nie method; patrz niżej).
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
  sobą), nie w siatce/wierszu — patrz `src/App.tsx`. Wyjątek: **analogiczne
  pary X/Y** (Grid X/Y, Offset X/Y w `Step2Geometry.tsx`) renderowane obok
  siebie w jednej linii (`flex gap-4`, po `flex-1`) zamiast jeden pod
  drugim — oszczędza miejsce, nie dotyczy pól o różnym znaczeniu (np.
  Circle: Hole Count/Diameter/Start Angle zostają w kolumnie) — patrz
  Etap 6.
- Nagłówek ma toggle dark/light mode (działający, klasa `.dark` na
  `<html>`, Tailwind skonfigurowany przez `@custom-variant dark` w
  `src/index.css`) oraz przycisk **Settings** — od `0.8.6` (`BL-9`)
  aktywny, otwiera `SettingsModal` (patrz "Machine Settings" niżej);
  wcześniej był `disabled`, przygotowany pod przyszłe ustawienia.
  **Dark mode jest domyślny** (niezależnie od preferencji systemowej)
  — toggle nadal pozwala przełączyć na light.
- **Machine Settings (`BL-9`, `0.8.6`).** Modal (`SettingsModal.tsx`)
  wzorowany na ustawieniach Claude: wyśrodkowana karta nad
  przyciemnionym tłem, menu sekcji po lewej (dziś "Machine" i "About",
  patrz `0.8.17` niżej — strukturalnie gotowe na kolejne, np.
  przełącznik dialektu G-code, `BL-5`), treść po prawej. Trzy pola: X/Y/Z travel
  maszyny CNC, auto-save na `onBlur` (zapis tylko przy poprawnej
  wartości > 0, bez guzika Save — świadomie inaczej niż presety
  wizarda, bo to żywa konfiguracja, nie "zatwierdzony gotowy preset").
  Trwałe w osobnym kluczu `localStorage` (`simplecam.machine`,
  `src/lib/machineStorage.ts`), celowo **nie** w `simplecam.storage`
  (sloty presetów) — inny rodzaj danych (jeden globalny obiekt vs.
  kilka wymiennych slotów), a rozdzielenie zostawia furtkę na
  przyszłość (np. ewentualną bramkę na dane maszyny) bez dotykania
  systemu presetów. Domyślnie `DEFAULT_MACHINE_SETTINGS`
  (X=5000mm, Y=5000mm, Z=1000mm, `src/types/machine.ts`) — na tyle
  duże, że bez konfiguracji appka zachowuje się jak wcześniej; nie ma
  osobnej gałęzi "nieskonfigurowane", logika jest jednolita.

  Sesja `/grill-me` ustaliła, że wizard nie zna pozycji zerowania
  materiału na stole — `resolvePoints()` liczy wszystko względem
  `(0,0)` programu, które fizycznie może leżeć gdziekolwiek na stole.
  Jedyny niezmiennik niezależny od zerowania to **rozpiętość wzorca
  (max−min) na osi ≤ całkowity skok maszyny na tej osi** — nie "każda
  współrzędna ≤ ±zakres" (to dopuszczałoby wzorce z rozpiętością 2×
  większą niż realny skok). Stąd dwa osobne mechanizmy korzystające z
  Machine Settings:
  - **Twardy `min`/`max` na polach przestrzennych** (Width/Height,
    Circle Diameter, Offset X/Y w `Step2Geometry.tsx`; Total Depth w
    `Step2Geometry.tsx`, Safe Z w `Step3Feeds.tsx`) — sanity-ceiling,
    nie gwarantuje dopasowania (nie zna zerowania), tylko nie pozwala
    wpisać absurdu. Częściowo zastępuje `BL-1` — `circleHoleCount` to
    licznik, nie odległość, więc nie ma naturalnego związku z zakresem
    maszyny i dostał osobny, czysto arbitralny limit zamiast tego
    (`isCircleHoleCountValid()`, `0.8.11`, patrz niżej).
  - **Miękki, nieblokujący warning na Step 4** (`machineFitWarnings()`
    w `src/lib/validation.ts`, korzysta z `patternSpan()`/`zSpan()`
    tamże) — osobny komunikat per oś, tylko dla osi, która faktycznie
    przekracza skok maszyny (`patternSpan` liczy rozpiętość
    `resolvePoints()` + promień otworu, świeżo w przestrzeni CNC —
    ten sam wzór co bounding box w `buildScene.ts`, ale bez importu
    `three`, celowo bez refaktoru tamtego pliku; `zSpan` to
    `safeZ + totalDepth`, bo `safeZ` jest zawsze ≥ `startZ`, patrz
    `isStartZValid`). **Nie** blokuje Generate — decyzja i
    odpowiedzialność zostają przy operatorze.

  Zwinięty pasek Kroku 4 pokazuje to samo ostrzeżenie jednym
  spojrzeniem — `WarningIcon` (`components/icons.tsx`) zastępuje
  `CheckIcon`/`XIcon` w badge'u, gdy `machineFitWarnings()` zwraca choć
  jeden komunikat, z priorytetem nad stanem wygenerowania (bo
  "wygenerowane, ale nie mieści się w maszynie" i tak wymaga uwagi).
  Kolorystyka celowo mocniejsza niż reszta badge'y: stałe
  `bg-orange-500 text-black`, bez wariantu dark (`0.8.8` — pierwsza
  wersja reużywała odcieni amber identycznych ze stanem "nie
  wygenerowano", co okazało się nieczytelne/za mało odróżnialne), plus
  grubszy `strokeWidth` na samej ikonie.

  **`0.8.9`** — dwie dalsze poprawki tego samego badge'u. Po pierwsze,
  przestał znikać przy rozwinięciu Kroku 4 — ten sam badge (mniejsza
  wersja, `h-6 w-6`) jest teraz też w prawym górnym rogu rozwiniętego
  panelu, obok nagłówka "Step 4 · G-Code"; logika wyciągnięta do
  wspólnej `step4Badge()` w `App.tsx`, współdzielonej przez zwinięty
  pasek i rozwinięty panel. Po drugie, kształt ikony i kolor stały się
  **niezależnymi wymiarami**: kształt śledzi wyłącznie stan Generate
  (X → check), kolor śledzi wyłącznie dopasowanie do maszyny
  (amber/indigo → orange) — bo param może zmienić się po Generate,
  zostawiając nieaktualny G-code w `generatedGCode` podczas gdy żywy
  wzorzec już nie mieści się w maszynie. Kombinacja "wygenerowano +
  nie mieści się" dostała własny wygląd: **check na pomarańczowym
  tle**, odróżniony od "jeszcze nie wygenerowano + już wiadomo że nie
  zmieści się" (wykrzyknik na pomarańczowym).

  **`0.8.10`** — dwie kosmetyczne korekty tego samego badge'u: rozmiar
  w rozwiniętym panelu zrównany z zwiniętym paskiem (oba `h-8 w-8`,
  ikona `h-4 w-4` — `0.8.9` wprowadziło mniejszą, nieczytelną wersję
  `h-6 w-6`), i tło zmienione na pastelowe `bg-orange-200` (z
  nasyconego `bg-orange-500`) — czarny symbol w środku miał za mało
  kontrastu na mocnym pomarańczu.

  **`0.8.17`** — druga sekcja w nawigacji Settings: **"About"**
  (`SECTIONS` w `SettingsModal.tsx` przestało być czysto dekoracyjne —
  dostało realny `activeSection` state i klikalną nawigację, dotąd
  renderowało tylko "Machine" bez względu na wybór). Pokazuje nazwę
  appki, numer wersji i `"Envisioned by ThingsByPluzz"`. Wersja
  wciągana z `package.json` jako `__APP_VERSION__` — stała wstrzyknięta
  przez `define` w `vite.config.ts` (odczyt pliku w Node przy starcie
  configu, `JSON.stringify` do stałej kompilowanej w bundlu), zamiast
  bezpośredniego importu JSON, żeby nie wymagać `resolveJsonModule` w
  `tsconfig.app.json` dla jednego stringa — typ deklarowany w nowym
  `src/vite-env.d.ts`. Ten sam tekst `"Envisioned by ThingsByPluzz"`
  (mniejszą, szarą czcionką) doszedł też w headerze appki, zaraz pod
  podtytułem.
- **Overlay presetów w 2D/3D Preview (`BL-3`, `0.8.13`).** W headerze,
  obok rzędu presetów `[1]…[5]`, nowa ikonka "oko" (`EyeIcon`) —
  wizualnie zgrupowana z presetami wspólnym podkreśleniem
  (`border-b-2` pod samym rzędem), sama lekko odsunięta. Klik = globalny
  toggle `overlayEnabled`. Gdy aktywny, klik w zajęty slot **nie ładuje**
  presetu — przełącza jego członkostwo w `overlaySlots` (grubsza ramka +
  checkmark w lewym górnym rogu), a usuwanie (hover "×") jest ukryte,
  żeby nie skasować czegoś przypadkiem podczas zaznaczania. Sesja
  `/grill-me` (z mockupem od użytkownika) ustaliła zakres szerszy niż
  pierwotny zapis w Backlogu: overlay renderuje się **w 2D i 3D
  jednocześnie**, nie tylko w 3D — bez auto-przełączania zakładek.
  Pełny render per nałożony preset (jak żywy wzorzec: otwory, ścieżka,
  przejazdy, wektor offsetu w 2D; cylindry, ścieżka helix/standard,
  linie Z w 3D), **bez** rozróżnienia kolorem per-slot — świadomie
  odłożone jako osobna decyzja do rewizji, gdyby się okazało że
  przeszkadza (użytkownik: "otwieramy tu puszkę Pandory"). Nakładki
  rysowane/dodawane pierwsze, żywy wzorzec (gdy w ogóle renderowany —
  patrz `0.8.14` niżej) ostatni (na wierzchu) — w 2D realnie decyduje o
  przesłanianiu, w 3D kosmetyczne (prawdziwa geometria z
  depth-testingiem). Kamera 3D **nie** re-frame'uje się przy
  przełączeniu overlay (`hasFramedRef` już to zapewniał, bez zmian
  logiki) — Fit View ręcznie. 2D nie ma pojęcia kamery w ogóle
  (`drawToolpath()` przelicza skalę/wycentrowanie od zera przy każdym
  renderze), więc automatycznie obejmuje nakładki bez dodatkowej logiki.

  Implementacja: `drawToolpath.ts` i `buildScene.ts` przeszły ten sam
  refaktor — wydzielenie `resolvePattern()` (matematyka jednego
  wzorca) i funkcji budującej/rysującej geometrię jednego wzorca
  atomowo, plus bounds liczone z **sumy** wszystkich renderowanych
  wzorców (każdy punkt rozszerzony o *własny* promień otworu/głębokość/
  Safe Z danego presetu, nie wzorca aktywnego). Nowy
  `src/lib/overlayParams.ts` (`deriveOverlayParams()`, z testem) — jedyna
  czysta funkcja w tym zestawie zmian, iteruje po `PRESET_SLOT_IDS` (nie
  po `Set`) dla stabilnej kolejności `[1]…[5]` niezależnie od kolejności
  klikania. `overlayParams` w `App.tsx` jest zmemoizowane (`useMemo`) —
  bez tego trafiałoby jako nowa referencja do zależności efektu
  przebudowującego scenę 3D przy każdym renderze `App`, wywołując zbędny
  dispose+rebuild całej geometrii THREE.

  **`0.8.14`** — poprawki po pierwszym realnym użyciu (feedback
  użytkownika). Ikonka oka wyrównana rozmiarem do ikonek presetów
  (`h-11 w-11`) i przeniesiona do wnętrza wspólnej grupy z presetami
  (wizualne opakowanie zmieniło się dwukrotnie potem, patrz `0.8.15`/
  `0.8.16` niżej), odstęp do presetów zwiększony do szerokości jednej
  ikonki (`ml-11`). Wyłączenie oka (`handleToggleOverlay()`) czyści
  teraz `overlaySlots` — dotychczasowe "zostaw jak jest" myliło, bo nic
  się wizualnie nie resetowało. Nowy parametr `showActivePattern` w
  `drawToolpath()`/`buildToolpathScene()` — `false` podczas aktywnego
  overlay, więc żywy wzorzec (user: "preset 0") **nie jest renderowany
  razem z** porównywanymi presetami — mieszanie ich utrudniało
  odczytanie, co jest czym; wraca automatycznie po wyłączeniu oka.
  `canGenerate` w `App.tsx` dostał `&& !overlayEnabled` — skoro żywy
  wzorzec nie jest wtedy widoczny w podglądzie, Generate byłby "w
  ciemno"; `Step4Output.tsx` dostał nowy prop `overlayActive` do
  wyświetlenia właściwego powodu blokady zamiast mylącego "Fix the
  highlighted errors...".

  **`0.8.15`** — podkreślenie pod samymi presetami (z `0.8.14`)
  zastąpione jedną, delikatną ramką (`rounded-lg border`) wokół całej
  grupy (presety + oko razem) — mocniej sugeruje, że to jedna
  funkcjonalna całość. Pływający baner "Preview mode" nad 2D i 3D
  Preview, gdy overlay aktywny. Cofnięta wcześniejsza decyzja "brak
  re-frame przy zmianie overlay" (patrz `0.8.13` wyżej) —
  dodanie/usunięcie presetu z nakładki w 3D teraz automatycznie
  dopasowuje odległość/target kamery (ta sama matematyka co Fit View),
  **bez** zmiany kąta patrzenia; rozróżnione od zwykłej edycji żywego
  wzorca (która nadal nie rusza kamery) przez `prevOverlayParamsRef`
  śledzący poprzednią referencję `overlayParams`. Krótki flash (1.5s,
  wzorzec "✓ Saved") na ikonce właśnie załadowanego presetu poza trybem
  overlay.

  **`0.8.16`** — ramka z `0.8.15` widoczna tylko, gdy overlay jest
  aktywny (`border-transparent` w przeciwnym razie — zmiana koloru, nie
  `border-width`, żeby nie skakał layout przy włączaniu/wyłączaniu) i
  więcej pionowego oddechu wokół ikonek (`py-1.5` → `py-2`).
- **`.gitignore` musi wykluczać `.claude/`** — Tailwind v4
  (`@tailwindcss/vite`) auto-skanuje cały katalog projektu pod kątem nazw
  klas i respektuje tylko `.gitignore` jako listę wykluczeń (bez niego
  dokumentacja zainstalowanych skilli w `.claude/skills/` też trafia do
  skanowania i winduje bundle CSS — realnie zaobserwowane: 16KB → 34KB).
- **`G4 P<sekundy>`** (dwell po starcie wrzeciona) jest poprawne dla
  GRBL/Mach3, ale Marlin interpretuje `P` jako milisekundy (jego `S` w
  sekundach nie jest wspierane przez GRBL/Mach3) — świadomie zostawione
  bez rozróżnienia dialektów (MVP nie ma przełącznika dialektu, `BL-5` —
  patrz Backlog), efekt na Marlinie to krótsza pauza niż zamierzona, nie
  dłuższa/niebezpieczna.

  Sesja `/grill-me` 2026-08-22 przeniosła koncepcyjnie przyszły
  przełącznik dialektu z `WizardParams.output` do
  `MachineSettings.dialect` (`BL-9`) — nic tu jeszcze nie
  zaimplementowane, pełne uzasadnienie i szczegóły przy `BL-5` w
  "Pomysły na przyszłość" wyżej.
- **`buildFooter()` celowo NIE robi retraktu na Safe Z** — emituje
  wyłącznie `M5` (pod `output.spindleStopEnd`) i ewentualne `G0 X0 Y0`
  (pod `returnOriginEnd`). Retrakt robi bezwarunkowo pętla po punktach w
  `assembleProgram()`, po **każdym** otworze łącznie z ostatnim, więc
  narzędzie jest na Safe Z zanim stopka w ogóle zacznie. Dodanie tam
  `G0 Z<safeZ>` powtarzałoby poprzednią linię dosłownie — dokładnie tak
  było do 0.8.5, gdzie zamiast osobnego pola na M5 istniało zbiorcze
  `returnSafeZEnd` robiące retrakt i M5 naraz (a `spindleStopEnd`, mimo
  pasującej nazwy, leżało nieczytane — to był `BL-2`). Przy zamianie ról
  pole zbiorcze zniknęło, checkbox Kroku 4 przeszedł na `spindleStopEnd`
  i dostał etykietę "Stop spindle (M5) at the end". Jeśli kiedyś
  retrakt w stopce zacznie wyglądać na "brakujący" — to jest ten
  komentarz, który tłumaczy, że nie brakuje.

## Hosting testowy

Aplikacja jest wdrażana ręcznie (nie CI/CD — jednoosobowy projekt w fazie
testów, deploy ma być kontrolowanym krokiem, nie automatycznym skutkiem
każdego pusha) na `https://simplecam.pluzz.pl` (subdomena na cPanelu
użytkownika, Apache 2.4.68, SSL aktywny) — ustalone w sesji `/grill-me`
2026-08-19. `npm run deploy` buduje (`vite build`) i wysyła `dist/` przez
FTP (`scripts/deploy.mjs`, biblioteka `basic-ftp`) — pierwotnie zakładane
SFTP okazało się w praktyce zwykłym FTP z opcjonalnym explicit FTPS
(`AUTH TLS`, port 21), więc skrypt domyślnie łączy się z `secure: true`
(dane logowania i transfer szyfrowane; `FTP_SECURE=false` w `.env` jako
awaryjny fallback do plain FTP, gdyby handshake TLS zawiódł). Każdy
deploy usuwa tylko zdalny `assets/` (zahashowane nazwy plików inaczej by
się bezterminowo kumulowały) i nadpisuje własne pliki po nazwie
(`index.html`, `.htaccess`, `robots.txt`, `favicon.svg`) — **świadomie
NIE** pełny `clearWorkingDir()`: root subdomeny na tym hostingu wcale nie
jest dedykowany wyłącznie SimpleCAM, jak pierwotnie założono w sesji
grill-me — zawiera też pliki zarządzane przez cPanel (`cgi-bin/`,
`php.ini`), których pełne wymiatanie katalogu by skasowało. Konto FTP
(`claude@simplecam.pluzz.pl`) miało też domyślnie katalog domowy
ustawiony na podfolder `claude/` wewnątrz docroota (typowe zachowanie
cPanela przy zakładaniu dodatkowego konta FTP — sugeruje podfolder od
nazwy usera), nie na sam docroot — trzeba to poprawić w cPanelu, inaczej
appka wychodzi pod `simplecam.pluzz.pl/claude/` zamiast pod rootem. Dane
logowania w lokalnym
`.env` (gitignored, szablon w `.env.example`) — czytane przez natywne
`node --env-file=.env` (Node ≥20.6, brak potrzeby paczki `dotenv`).
`public/robots.txt` (`Disallow: /`) blokuje indeksowanie na czas testów;
`public/.htaccess` ustawia długi cache dla zahashowanych assetów i
`no-cache` dla `index.html`. Brak GitHub Actions/CI mimo że repo jest na
GitHubie — `BL-4` — świadomie poza zakresem, do rozważenia dopiero gdy
appka wyjdzie z fazy testów. Slash command `/deploy` (`.claude/commands/deploy.md`)
odpala `npm run deploy` bez dodatkowej analizy — lokalny dla tej maszyny,
bo `.claude/` jest wykluczone z gita (patrz `.gitignore` w sekcji
"Kluczowe decyzje projektowe" wyżej).

## Struktura katalogów

```
src/
  types/wizard.ts          — typy WizardParams + DEFAULT_WIZARD_PARAMS
  types/machine.ts          — MachineSettings + DEFAULT_MACHINE_SETTINGS
                              (Machine Settings, `BL-9`) — celowo osobny plik
                              od `wizard.ts`, to inny rodzaj danych (jeden
                              globalny obiekt, nie WizardParams)
  config/methodMeta.ts      — rejestr metadanych per-method (Helix/Standard:
                              nazwy, ikony, etykiety, `generate()`) — jedno
                              źródło prawdy, nie hardkodować ternary po
                              `method` w komponentach
  config/positioningMeta.ts — rejestr metadanych per-pattern (Single/Grid/
                              Grid Centered/N-Holes Circle/Custom: nazwy,
                              ikony, opisy dla kart Kroku 1) — analogicznie
                              do `methodMeta.ts`, ale dla
                              `PositioningMode`. Też: `positioningIcon()`/
                              `positioningLines()`/`positioningSummary()`
                              (zwinięte paski Kroku 1), `patternLabel()`
                              (jednoliniowa etykieta presetu, używana przez
                              `lib/presetLabel.ts`), `patternSlug()`
                              (filename-safe slug, używany przez
                              `lib/download.ts`) — patrz Etap 6
  components/SettingsModal.tsx — modal Machine Settings (`BL-9`) — patrz
                              "Machine Settings" w sekcji "Kluczowe decyzje
                              projektowe" wyżej po pełny opis
  components/wizard/        — komponenty poszczególnych kroków wizarda.
                              `Step1Positioning.tsx` = wyłącznie pattern
                              picker + placeholdery operacji, nic liczbowego;
                              od 0.8.2 pionowy stos operacji (Hole(s)
                              rozwinięta z kompaktową listą patternów w
                              środku), nie poziomy grid + duże karty.
                              `Step2Geometry.tsx` = Tool/Hole Diameter,
                              Total Depth, `MethodPicker.tsx` (kompaktowy
                              toggle Helix/Standard, dawny
                              `Step1Operation.tsx`), powtórzony
                              "Pattern: <nazwa>" + generyczny opis (0.8.3),
                              pattern-specific pola (grid/circle/custom) i
                              Offset X/Y (za `border-t` od 0.8.3) — patrz
                              Etap 6
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
                               `handleResize()` odczytuje
                               `window.devicePixelRatio` na nowo przy
                               KAŻDYM resize (nie tylko raz przy starcie
                               sceny) i woła `renderer.setPixelRatio()`
                               ponownie — bez tego zoom przeglądarki
                               (Ctrl+/Ctrl-) zmienia `devicePixelRatio`,
                               ale bufor renderera zostawał przy starej
                               wartości (0.7.1, ten sam wzorzec co
                               `ToolpathCanvas.tsx` już stosował dla 2D).
                               Obok `ResizeObserver` (łapie resize
                               wywołany zmianą layoutu, np.
                               zwinięcie/rozwinięcie panelu kroku) wisi
                               też `window.addEventListener('resize', …)`
                               jako dodatkowe zabezpieczenie na wypadek,
                               gdyby sam zoom nie ruszył
                               `clientWidth`/`clientHeight` kontenera na
                               tyle, żeby ResizeObserver się odpalił.
                               Prawdziwą przyczyną tego, że zoom-in gubił
                               przyciski widoku (do naprawy potrzebne było
                               przełączenie na 2D i z powrotem), był
                               jednak kruchy CSS, nie sam JS: korzeń
                               komponentu (i analogicznie
                               `ToolpathCanvas.tsx`) używał `h-full w-full`
                               bez `flex-1` w rodzicu `flex-col`, polegając
                               na niepewnej kombinacji `flex-basis:auto` +
                               procentowej wysokości + domyślnego
                               `flex-shrink`, żeby wypełnić resztę
                               dostępnej wysokości — w przeciwieństwie do
                               sąsiedniego panelu G-Code w `App.tsx`, który
                               od początku poprawnie używał `flex-1`. Przy
                               reflow wywołanym zoomem ta kombinacja
                               czasem rozjeżdżała się (kontener chwilowo
                               zerowej wysokości), gubiąc absolutnie
                               pozycjonowane przyciski widoku bez
                               samo-naprawy. Naprawione w 0.7.2: korzeń
                               obu komponentów ma teraz `flex-1 min-h-0`
                               zamiast `h-full w-full`, ten sam solidny
                               wzorzec co panel G-Code.
                               Kamera auto-dopasowuje się (fit na preset
                               `front` — do 0.8.3 był to `isometric`, patrz
                               Etap 4) tylko przy pierwszym zbudowaniu sceny
                               (nie przy każdej zmianie parametru — nie
                               resetuje widoku użytkownikowi w trakcie
                               edycji/obrotu), pilnowane przez `hasFramedRef`.
                               Ten ref musi być zresetowany (`= false`) na
                               starcie efektu setupującego scenę/kamerę/
                               renderer/controls, nie tylko zainicjowany raz
                               przy `useRef(false)` — inaczej React
                               `StrictMode` (`main.tsx`, celowo podwójnie
                               uruchamiane efekty mountujące: setup →
                               cleanup → setup, na tej samej instancji
                               komponentu, więc refy przeżywają między
                               przebiegami) zostawiał DRUGĄ, docelową kamerę
                               bez wywołania `frameCamera()` — flaga była już
                               `true` po pierwszym przebiegu. Efekt: kamera
                               na domyślnej pozycji Three.js `(0,0,0)`,
                               dokładnie na origin, z zerowym promieniem
                               orbitowania (`camera.position ===
                               controls.target`) — OrbitControls wyglądały na
                               martwe, widok zdegenerowany (patrzący wzdłuż
                               +Y z dystansu zero). Błąd istniał od Etapu 4,
                               ujawnił się dopiero w 0.8.4, gdy 3D Preview
                               zostało domyślną zakładką.
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
                               poprawkę i wyjaśnienie). Przy tamtej poprawce
                               `front` zachował swoje liczby (przypadkiem
                               renderował się poprawnie już wcześniej); `top`,
                               `side`, `isometric` dostały wtedy nowe
                               wartości. `front` dostał własną zmianę
                               wartości później, w 0.8.4: doszło podniesienie
                               na Z (to samo co ma `isometric`, ale bez
                               offsetu w X) — zamienia płaski, pozbawiony
                               sygnału głębi rzut wzdłuż osi Y na widok, który
                               wciąż patrzy prosto wzdłuż Y (środek między
                               ćwiartkami III/IV) ale pokazuje wysokość
                               obrabianego elementu. Ten sam preset jest teraz
                               też domyślnym widokiem otwarcia sceny (patrz
                               Etap 4 i `Scene3D.tsx` wyżej).
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
                                 pokazują inline error w Kroku 2/3. Też:
                                 isCircleHoleCountValid (`BL-1`, `0.8.11`)
                                 — twardy limit, arbitralne 100, wyciszony
                                 poza trybem circle; i (od `BL-9`):
                                 patternSpan/zSpan/machineFitWarnings —
                                 nieblokujący soft-warning na Kroku 4,
                                 patrz "Machine Settings" w "Kluczowych
                                 decyzjach" wyżej
    download.ts                  — buildFilename/downloadTextFile — efekt
                                 uboczny (Blob/URL), celowo poza czystym
                                 rdzeniem lib/
    storage.ts                   — auto-save + presety w localStorage
                                 (Etap 5): saveSlot/loadSlot/deleteSlot/
                                 loadPresetSlots, jeden klucz
                                 `simplecam.storage`, sloty `"0"`–`"5"`,
                                 merge z DEFAULT_WIZARD_PARAMS przy
                                 wczytaniu (migracja schematu), try/catch
                                 + `console.warn` na każdym I/O — patrz
                                 Etap 5 wyżej po pełny opis
    presetLabel.ts                — presetLabel(params) → auto-opis
                                 zapisanego slotu z parametrów (operacja +
                                 ⌀otworu + głębokość), używane w
                                 tooltipach header/Step 4
    machineStorage.ts             — loadMachineSettings/saveMachineSettings
                                 (`BL-9`), osobny klucz `simplecam.machine`,
                                 ten sam try/catch + merge-z-defaultami co
                                 storage.ts, ale bez systemu slotów (jeden
                                 płaski obiekt)
    overlayParams.ts               — deriveOverlayParams() (`BL-3`, `0.8.13`)
                                 — jedyna czysta funkcja w overlay presetów,
                                 filtruje/mapuje overlaySlots względem
                                 presetSlots w stabilnej kolejności
                                 [1]…[5] (iteruje PRESET_SLOT_IDS, nie Set)
    *.test.ts                    — testy Vitest (96 testów, `npm run test`)
  App.tsx                    — orkiestracja stanu wizarda i nawigacji kroków
```

**Zasada:** wszystko co zależy od wybranego method (Helix vs Standard —
nazwa, ikona, etykiety pól, **oraz funkcja generująca G-code**: `generate`)
idzie przez `METHOD_META` w `config/methodMeta.ts`, nie przez
rozproszone `method === 'helix' ? ...` w komponentach. Wywołanie
`METHOD_META[params.method].generate(params)` to jedyne miejsce,
które powinno wołać silnik — nie importować `generateHelix`/
`generateStandardHole` bezpośrednio w komponentach UI. Analogicznie —
wszystko co zależy od wybranego patternu (Single/Grid/Grid Centered/
N-Holes Circle/Custom — ikona, tytuł/opis karty, etykieta presetu,
filename slug) idzie przez `POSITIONING_META`/pomocnicze funkcje w
`config/positioningMeta.ts` (patrz Etap 6), nie przez rozproszone
`switch (geometry.positioning)` w komponentach.

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

- Wersjonowanie i historia zmian: **`CHANGELOG.md`** pozostaje głównym,
  czytelnym źródłem historii zmian — projekt ma repo git (GitHub:
  `thingsbypluzz/SimpleCAM`), ale to nie zastępuje changeloga: każda
  znacząca zmiana/etap i tak dostaje wpis w `CHANGELOG.md`, commit
  messages są dodatkowe, nie jedynym miejscem historii.
- Brak testów E2E w MVP — tylko testy jednostkowe silnika G-code.
