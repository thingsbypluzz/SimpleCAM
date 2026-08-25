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
- [x] **Etap 7** — **OP-1: Outline (Rectangle Cornered/Centered + Circle
      cut-out), `0.13.0`.** Trzecia operacja obok Hole(s) — pierwsza z
      rodziny `OP-#` domknięta (po tym zostają tam już tylko OP-2/OP-3,
      patrz "Przyszłe operacje" niżej). Poprzedzony pełną sesją
      `/grill-me` (wymóg dla każdego `OP-#`), w tym research-em nt.
      dobrych praktyk CNC odnośnie ramp entry (potwierdził: ramping na
      każdym przejściu głębokości, nie tylko na pierwszym zanurzeniu —
      patrz "Method" niżej). Domyka też `BL-6` ("Rectangle Cut Out") —
      ten sam pomysł, zaimplementowany jako część OP-1 zamiast osobnej
      trzeciej metody Hole(s).

      **Zakres:** trzy kształty, bez dowolnego konturu — **Rectangle
      Cornered** (origin w lewym dolnym rogu), **Rectangle Centered**
      (origin w środku), **Circle** (tylko wyśrodkowany). Każdy z
      trybem offsetu **Inside / Outside / On-line**. Zaokrąglone rogi
      prostokąta świadomie poza zakresem — do przypisania jako nowy
      `BL-#` przy okazji kolejnej sesji `/grill-me`.

      **Nowe pole `WizardParams.operation: 'holes' | 'outline'`**
      (`src/types/wizard.ts`) — pierwsze realne użycie dawnego
      placeholdera `OPERATION_PLACEHOLDERS` w `Step1Positioning.tsx`
      (Etap 6). Uwaga historyczna: nazwa `operation` była już raz użyta
      w tym projekcie — przed Etapem 6 tak nazywało się dzisiejsze
      `method` (Helix/Standard), zanim zostało przemianowane (patrz
      nota przy `0.8.12` wyżej). To nowe użycie to celowo inny,
      niezwiązany koncept (Hole(s) vs Outline) — nie pomyłka, nie
      powrót starego znaczenia. Nowa sekcja `OutlineParams`
      (shape/offsetMode/method/toolDiameter/totalDepth/width/height/
      diameter/offsetX/Y/tabs*) żyje **obok**, nie zamiast, istniejącego
      `geometry`/`method` — Hole(s) nietknięty, zero zmian w zachowaniu
      domyślnym (`operation: 'holes'`).

      **Offset i kierunek nawrotu (winding):** Circle reużywa wprost
      matematyki promienia Hole(s) (`(D ∓ toolDiameter)/2`). Rectangle
      insetuje/offsetuje każdy bok o promień narzędzia. Kierunek ruchu
      wyprowadzony z trybu cięcia pod stałe `M3` (CW): Outside → CW,
      Inside → CCW (konwencjonalne frezowanie, zasada dla słabszych,
      hobbystycznych maszyn), On-line → CW (arbitralnie, brak
      fizycznego znaczenia przy zerowym offsecie). Wymagało dodania
      parametru `direction: 'cw'|'ccw'` do `fullCircleMove()`/
      `tabbedCirclePass()` (`lib/circle.ts`/`lib/tabs.ts`, wcześniej
      zawsze CCW) — zero zmian w zachowaniu Hole(s) (wszystkie miejsca
      wywołania jawnie przekazują `'ccw'`).

      **Method:** Circle reużywa silnika Helix/Standard Hole(s)
      dosłownie — `helixToolpath`/`standardHoleToolpath` w
      `lib/helix.ts`/`lib/standardHole.ts` przepisane na przyjmowanie
      jawnego obiektu opcji (`CircleToolpathOptions`) zamiast czytania
      `params.geometry` bezpośrednio, eksportowane jako
      `helixCircleToolpath`/`standardCircleToolpath` i reużyte przez
      nowy `lib/outlineCircle.ts`. Rectangle dostaje nową parę
      **Ramp / Standard** (`lib/outlineRectangle.ts`): Ramp = ciągłe
      zejście wzdłuż dłuższego boku, jeden `stepdown` na okrążenie
      (mirror spirali Helixa, bez parametru kąta rampy — kąt niejawny,
      ten sam pryncyp co niejawny skok Helixa), z okrążeniem
      czyszczącym przed pasmem mostków i na samym dnie (ten sam
      mechanizm co Helix+tabs, patrz `0.12.0`/`BL-14`) — ramp edge
      zawsze ta sama fizyczna krawędź (`longerEdgeIndex()`,
      `lib/outlineRectangleGeometry.ts`). Standard = prosty odpowiednik
      `standardHoleToolpath` dla 4 boków.

      **Tabs:** Circle bez zmian (reużywa `lib/tabs.ts`). Rectangle
      liczy tabs **per bok** (nie razem, jak Circle) — `tabCount=2`
      daje 8 mostków (2×4 boki), z tym samym trikiem przesunięcia fazy
      o pół kroku co Circle (środek pierwszego mostka na środku boku,
      nie na jego krawędzi) — nowy `lib/outlineRectangleTabs.ts`
      (`computeRectTabRanges()`, ułamki wzdłuż boku zamiast kątów;
      `tabbedRectanglePass()`, ta sama logika "unii breakpointów" co
      `tabbedCirclePass()`, ale bez potrzeby próbkowania kątowego —
      prosta krawędź nie wymaga aproksymacji wielokątem). **`BL-21`
      (naprawione w `0.13.1`):** przejście "opuszczam mostek" w
      `tabbedRectanglePass()` przejeżdżało do KOLEJNEGO breakpointu
      wciąż podniesione, zamiast zanurzyć się od razu na własnej
      granicy mostka — przy jednym mostku na środku boku dawało to
      podniesiony odcinek sięgający niemal do rogu. Ten sam wzorzec
      (skopiowany przy budowie OP-1) istniał też w `lib/tabs.ts`'s
      `tabbedCirclePass()` (Hole(s)/Circle Outline), tam niewidoczny
      dzięki gęstemu próbkowaniu kątowemu. Naprawione w obu
      generatorach G-code i ich odpowiednikach w `buildScene.ts` — pełny
      opis w CHANGELOG `0.13.1`.

      **UI:** Krok 1 (`Step1Positioning.tsx`) — "Outline" przestaje być
      wyszarzonym placeholderem, rozwija się w listę 3 kształtów tym
      samym wzorcem co "Hole(s)". Krok 2 (`Step2Geometry.tsx`) to teraz
      cienki router na `params.operation` — dotychczasowa zawartość
      wyekstrahowana bez zmian do `Step2GeometryHoles.tsx`, nowy
      `Step2GeometryOutline.tsx` z kolejnością pól: Tool Diameter →
      Cutting Depth → Offset Mode → Method → wymiary kształtu → Tabs →
      Offset X/Y. Nowe `OffsetModePicker.tsx`/`OutlineMethodPicker.tsx`
      (ten sam wzorzec toggle co `MethodPicker.tsx`). Wspólny
      `TOOL_DIAMETER_OPTIONS` wydzielony do
      `config/toolDiameterOptions.ts` (reużywany przez oba Kroki 2,
      pierwszy krok w stronę `BL-19`).

      **Walidacja/presety/nazwy plików:** nowe
      `isOutlineToolDiameterValid`/`isOutlineTabHeightValid`/
      `isOutlineTabWidthValid`/`outlineFootprint`/`outlineZSpan` w
      `lib/validation.ts`, `machineFitWarnings()` rozgałęziona na
      `operation`. `presetLabel()`/`buildFilename()` mają teraz gałąź
      Outline (`config/outlineMeta.ts`'s `outlineShapeLabel()`/
      `outlineShapeSlug()`) — etykieta presetu Outline:
      `"Rectangle 50×30 (Inside) • Ramp"`, bez końcowej średnicy (w
      przeciwieństwie do Hole(s), gdzie `outlineShapeLabel` już
      zawiera wymiary).

      **Podgląd 2D/3D:** oba pliki (`preview/drawToolpath.ts`,
      `preview3d/buildScene.ts`) dostały dyskryminowany typ
      `ResolvedPattern` (`'holes' | 'outlineCircle' | 'outlineRect'`)
      zamiast zakładać tylko okrąg. Bryła materiału w 3D: Circle
      reużywa `CylinderGeometry` (jak Hole(s)), Rectangle dostał
      `BoxGeometry` — działa bez żadnej dodatkowej rotacji, bo stałe
      mapowanie CNC→Three (`toThree()`) to czysta permutacja osi +
      negacja, więc oś-wyrównany box nie wymaga ręcznych wierzchołków
      (odrzucona wcześniej rozważana opcja `ExtrudeGeometry`).

      **Testy:** każdy nowy moduł silnika ma własny plik testowy
      (`outlineCircle.test.ts`, `outlineRectangleGeometry.test.ts`,
      `outlineRectangleTabs.test.ts`, `outlineRectangle.test.ts`,
      `outline.test.ts`, `config/outlineMeta.test.ts`), plus
      rozszerzone istniejące (`circle.test.ts`/`tabs.test.ts` o
      kierunek, `program.test.ts` o jawną listę punktów,
      `validation.test.ts`/`presetLabel.test.ts` o Outline) — 219
      testów łącznie po OP-1 (ze 150 przed). Brak nowych testów dla
      `drawToolpath.ts`/`buildScene.ts` — zgodnie z dotychczasową
      konwencją (weryfikacja wzrokowa, nie unit testy renderowania).

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

**`BL-17` zamknięte — "Interface Anatomy", Artifact z umownymi
nazwami elementów UI:**
**<https://claude.ai/code/artifact/ea21c02e-41ed-4bb5-90ec-48ae9a61c23e>**.
Wszystkie mockupy jako ręcznie napisane SVG — po pierwszym realnym
użyciu (feedback użytkownika: pomarańczowe tagi nachodzące
bezpośrednio na wąskie regiony bywały nieczytelne/przycięte)
przeprojektowane na pływające etykiety odsunięte poza mockup,
połączone przerywaną linią + kropką-znacznikiem z regionem, który
opisują. Po drugim realnym użyciu (prośba użytkownika o pełną
hierarchię, nie tylko dwa oddzielne mockupy) rozbudowane do
trzypoziomowej struktury "od ogółu do szczegółu":
- **Poziom 1 — cała strona:** jeden mockup dzielący całą appkę na
  `Header` / `Wizard Section` / `Preview Section`.
- **Poziom 2 — wnętrze każdej sekcji:** trzy osobne mockupy, każdy
  zoomowany na jeden region z Poziomu 1 — Wizard Section (`Step N
  Summary`, `Active Step Panel`, `Step Panel Header`), Preview Section
  (`Preview Tabs`, `Preview Viewport`), i Settings Modal (`Settings
  Nav`, `Settings Nav Item`, `Settings Content`) — Settings Modal
  dostał tu nowy termin `Settings Nav Item` (jeden wiersz listy sekcji,
  np. "Machine"), którego wcześniej brakowało.
- **Poziom 3 — słownictwo komponentów:** jeden mockup z 9 generycznymi
  kontrolkami powtarzającymi się na każdym poziomie wyżej —
  `Entry Field`, `Drop-down`, `Section Header`, `Hint Button`,
  `Checkbox`, `Toggle`, `Tab`, `Badge`, `Icon Button`.

Dwa osobne słowniczki pod mockupami (nazwy regionów, i osobno
słownictwo komponentów) zamiast jednej wspólnej listy — inna kategoria
pojęć. `Step Rail` z pierwszej wersji przemianowany na `Wizard Section`
(ten sam fizyczny region, jedna nazwa zamiast dwóch dla tego samego
miejsca — `Wizard Section` to nazwa wprowadzona przez użytkownika na
Poziomie 1, `Step Rail` był zbędnym duplikatem). Czysto dokumentacyjne
— zero zmian w kodzie appki, brak bumpa wersji/CHANGELOG. Ten Artifact
nie podlega zasadzie synchronizacji wyżej (nie jest listą backlogu) —
aktualizować go tylko jeśli realny layout appki się zmieni na tyle, że
mockup przestanie być wierny.

## Przyszłe operacje (`OP-#`)

Osobna, celowo **nie** `BL-#` kategoria — Pocket/Surface (patrz
placeholdery w `Step1Positioning.tsx`, Etap 6) to nie drobne poprawki
tylko kamienie milowe wielkości całego Etapu, każdy z własną, dziś
nieznaną taksonomią (operacja → pattern/sub-choice → parametry, patrz
`ideas.md`). Numer `OP-#` jest identyfikatorem, nie kolejnością
realizacji — żadna z dwóch nie jest dziś zaplanowana jako "następna"
względem drugiej. (Do `0.8.12` ten schemat nazywał się `FAM-#`
["family"] — patrz nota przy Etapie 6 po pełne uzasadnienie zmiany.)
`OP-1` (Outline) zamknięte w Etapie 7 — patrz "Status / Etapy" wyżej.

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

  Doprecyzowanie od użytkownika: koncepcja akordeonu 4 kroków
  (rozwinięty panel + zwinięte paski, patrz "Layout wizarda" w
  "Kluczowe decyzje projektowe") zostaje — to nie jest do
  przeprojektowania, tylko do uelastycznienia. Dziś szerokości są
  sztywne w px (`w-[420px]` na rozwinięty panel kroku, `w-20` na
  zwinięty pasek — `App.tsx`), nieskalujące się z oknem. Docelowo
  proporcjonalny podział szerokości między panel kroków a panel
  podglądu 2D/3D/G-Code (np. ok. 40%/60%), ale z twardym minimalnym
  szerokim floorem dla panelu kroków — poniżej pewnej szerokości
  okna czytelność/wygoda formularzy w Kroku 2/3 (gęste pola, pary
  X/Y w jednej linii z ikoną hint) się rozpada, więc proporcja nie
  może schodzić do zera. Dokładna wartość progu/minimalnej szerokości
  do ustalenia przy realnej implementacji, prawdopodobnie razem z
  sesją `/grill-me` dla całego BL-8.
- **`BL-18`** — **Zweryfikować kompatybilność wsteczną ze starszymi
  przeglądarkami.** Zgłoszenie użytkownika: na Windows 8, w kilku
  przeglądarkach, tylko sekcja Preview miała kolory zgodne z ustawioną
  paletą — reszta (header, menu, STEP-y) renderowała się na biało, a
  `SettingsModal` był półprzezroczysty i przez to nieczytelny.
  Podejrzenie: różnice w obsłudze nowoczesnego CSS (Tailwind v4
  CSS-first `@theme`/`@custom-variant dark`, prawdopodobnie kolory w
  przestrzeni `oklch`, `backdrop-blur` na modalu) przez starsze silniki
  przeglądarek. Wymaga: ustalenia realnego zakresu wspieranych
  przeglądarek/wersji (projekt dotąd nie miał tej decyzji spisanej),
  zreprodukowania problemu na starszym silniku, zidentyfikowania,
  które konkretne właściwości CSS się nie renderują, i albo dodania
  fallbacków, albo świadomej decyzji "nie wspieramy X" udokumentowanej
  w tym pliku.
- **`BL-19`** — **Własna lista średnic narzędzia w Settings.** Dziś
  `TOOL_DIAMETER_OPTIONS` (`Step2Geometry.tsx`: 1–8mm całe mm + 1/8" i
  1/4") jest zaszyta na sztywno w kodzie. Pomysł: nowa sekcja w
  `SettingsModal.tsx` pozwalająca edytować tę listę (dodawać/usuwać
  wartości), zapisywana w localStorage (nowy klucz albo rozszerzenie
  istniejącego wzorca Machine/Appearance/Tabs), plus przycisk "Reset to
  default" przywracający dzisiejszą, sztywną listę jako wartość
  domyślną.
- **`BL-20`** — **Licznik użytkowników (unikalne IP).** 🔒 Wymaga
  własnej, pełnej sesji `/grill-me` przed jakąkolwiek decyzją
  implementacyjną — pomysł bezpośrednio dotyka fundamentalnej zasady
  projektu ("Zero backendu. Zero bazy danych."), nie jest to dopracowanie
  szczegółów. Wstępny, nierozstrzygnięty szkic z przerwanej sesji
  `/grill-me`: najpierw sprawdzić, czy obecny hosting cPanel udostępnia
  już AWStats/Webalizer/surowe logi Apache (sekcja Metrics) — jeśli tak,
  temat może rozwiązać się bez żadnych zmian w kodzie appki. Jeśli nie,
  realne opcje to własny licznik po stronie serwera (prawdziwy wyłom od
  "zero backendu") albo lekki skrypt analityki trzeciej strony w stylu
  Plausible/Fathom/GoatCounter (żądanie sieciowe przy każdym wejściu —
  też odejście od dzisiejszej appki bez jakiegokolwiek trackingu). Do
  rozważenia też: "unikalne IP" to tylko przybliżenie "unikalnych ludzi"
  (NAT zaniża, rotacja IP zawyża), oraz implikacje RODO przy liczeniu po
  IP (strona hostowana na `.pl`).
- **`BL-22`** — **Wyraźniejszy ślad obrabianego materiału w podglądzie
  (Outline i Hole(s)), może suwak opacity.** Dzisiejsze stałe, niskie
  wypełnienie (`theme.holeFill`, `opacity: 0.12` w `buildScene.ts`,
  analogicznie `holeFill` w `drawToolpath.ts`) czyta się za słabo. Czy
  rozwiązaniem jest mocniejszy default, suwak opacity dla użytkownika,
  czy coś innego — otwarte, wymaga sesji do przedyskutowania przed
  dopracowaniem zakresu.
- **`BL-25`** — **Tryb edycji przywołanego presetu.** Pomysł: wczytanie
  presetu z headera podświetla/zaznacza go; póki jest zaznaczony,
  dalsze zmiany zapisują się automatycznie z powrotem do tego slotu
  presetu, zamiast tylko do ukrytego slotu sesji (dzisiejsze zachowanie
  auto-save wyłącznie do `AUTO_SAVE_SLOT`, `lib/storage.ts`). Ponowny
  klik w ten sam preset odznacza go, wracając do dzisiejszego
  zachowania (zmiany trafiają tylko do slotu sesji 0). To realna zmiana
  ustalonej, świadomej decyzji projektowej (presety są dziś jawnie
  zapisywane wyłącznie ręcznie, bez auto-nadpisywania) — wymaga pełnej
  dyskusji przed dopracowaniem zakresu, nie drobna poprawka.

Nie przeskakuj etapów bez pytania — każdy kończy się checkpointem do
przeglądu przez użytkownika.

## Kluczowe decyzje projektowe (zaakceptowane założenia)

- **Jednostki:** tylko mm, bez cali.
- **Dialekt G-code:** wspólny podzbiór GRBL/Marlin/Mach3, preambuła
  `G21 G90 G17`. Realny per-dialekt wybór (`MachineSettings.dialect`)
  od `0.11.0` — patrz "G-Code Dialect + Start/End G-Code" niżej w tej
  sekcji.
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
  przyciemnionym tłem, menu sekcji po lewej (dziś "Machine", "Appearance"
  i "About", patrz `0.8.17`/`BL-12` niżej), treść po prawej. Trzy pola
  X/Y/Z travel maszyny CNC, auto-save na `onBlur` (zapis tylko przy poprawnej
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

  **`0.11.1`** — naprawiony realny bug wniesiony przez `0.9.0`, zgłoszony
  przez użytkownika ("zmienił się kolor siatki płaszczyzny w 3D"). BL-12
  scaliło osobne kolory siatki 2D i 3D w jeden współdzielony
  `accents.grid`, zachowując wartość z 2D (`#e2e8f0`/`#1e293b`) — dużo
  subtelniejszą niż to, co miał wcześniej sam 3D (`#94a3b8`/`#475569`).
  Przy dodatkowym mnożniku `opacity: 0.4` na `GridHelper` w
  `buildScene.ts` siatka płaszczyzny stała się w praktyce prawie
  niewidoczna, zwłaszcza w jasnym motywie — czysta regresja, nie
  świadoma decyzja (ten sam bug podważał tekst "Default odtwarza
  dokładnie przedpaletowe kolory" kawałek wyżej — nieprawdziwy
  akurat dla `grid`). Naprawa: świeże wartości `#c0bfbc`/`#5e5c64`,
  wspólne dla wszystkich 4 palet (nie tylko `default`) — `grid` to
  wizualna pomoc orientacyjna, nie akcent odróżniający palety od
  siebie, więc nie musi się różnić między nimi tak jak `toolpath`.
  Wartości dobrane przez użytkownika w osobnym narzędziu — publicznym
  Artifactcie "Palette Bench" (poza repo, jednorazowy design tool),
  który renderuje statyczny widok Front pojedynczego Helixa
  prawdziwym, wbudowanym Three.js (przez `vite build --lib` w trybie
  ESM z `node_modules/three`, złączonym w jeden plik bez zewnętrznych
  importów) i pozwala edytować każdy kolor palety z podglądem na
  żywo — nie część aplikacji, nie utrzymywane w repo.
- **Palety kolorów podglądu 2D/3D w Settings (`BL-12`, `0.9.0`).** Sesja
  `/grill-me` rozstrzygnęła zakres: paleta zmienia tylko kolory
  "akcentowe" — `toolpath`/`rapid`/`hole`/`grid`/`background` (2D) i
  `toolpath`/`rapid`/`hole`/`grid`/`material` (3D) — nie rusza osi
  X/Y (czerwień/zieleń), origin (indygo) ani wektora offsetu (amber),
  bo to konwencja CNC/semantyczna, nie stylistyka. 4 gotowe palety
  (`src/config/palettes.ts`, `PaletteId`): **Default** (dokładnie
  dzisiejsze kolory — brak zmiany dla kogoś, kto nigdy nie otworzy
  Appearance), **Ocean** (cyjan/turkus), **Ember** (spalona pomarańcz —
  celowo inna niż amber offsetu, żeby akcent ścieżki narzędzia nigdy nie
  wyglądał jak wektor offsetu), **Violet** (fiolet) — każda z osobnym
  wariantem light/dark, wybieranym tym samym przełącznikiem dark mode co
  dziś (paleta i dark/light to niezależne osie). `palettes.ts` to teraz
  jedyne źródło prawdy dla kolorów obu podglądów — zastępuje dwa ręcznie
  duplikowane `LIGHT_THEME`/`DARK_THEME` (po jednym w
  `drawToolpath.ts` i `buildScene.ts`, pilnowane dotąd tylko
  komentarzem "muszą się zgadzać"); `hexToThreeColor()` konwertuje
  jednorazowo hex-string na numeryczny kolor Three.js zamiast trzymać
  dwie kopie każdej wartości w różnych formatach. Wybór palety
  przechowywany w nowym, osobnym kluczu `simplecam.appearance`
  (`src/lib/appearanceStorage.ts`, `AppearanceSettings` w
  `src/types/appearance.ts`) — nie w `simplecam.machine` — bo to
  preferencja UI, nie fizyczna cecha maszyny (ten sam podział co
  `simplecam.storage` vs `simplecam.machine`); merge z walidacją
  nieznanego/uszkodzonego `palette` w zapisanym JSON-ie (fallback do
  `'default'`), ten sam wzorzec try/catch co `machineStorage.ts`.
  Nowa trzecia sekcja **"Appearance"** w `SettingsModal.tsx` (obok
  Machine/About) — rząd swatchy, klik = natychmiastowa zmiana, bez
  potwierdzenia (spójnie z resztą appki). Świadomie **nie** rusza
  odłożonej w `BL-3` decyzji o braku kolorów per-slot w overlay —
  paleta reskinuje jednolicie żywy wzorzec i każdy nałożony preset,
  bez wprowadzania nowego rozróżnienia kolorem per-slot.
- **Zoom/pan na 2D Preview (`BL-11`, `0.10.0`).** Sesja `/grill-me`
  ustaliła zakres: scroll = zoom-to-cursor (punkt pod kursorem zostaje
  na miejscu), prawy przycisk myszy + przeciąganie = pan (kontekstowe
  menu przeglądarki wygaszone nad canvasem), zoom ograniczony
  względnie do skali fit-to-data (`0.2×`–`20×`, nie stałe px/mm — patrz
  `MIN_ZOOM_FACTOR`/`MAX_ZOOM_FACTOR` w nowym
  `src/components/preview/camera2d.ts`). Bez obsługi gestów dotykowych
  (touch/pinch) — poza zakresem, to terytorium `BL-8`. Zachowanie
  kamery lustrzane do 3D Preview: pierwsze zamontowanie auto-dopasowuje
  (jednorazowo, `hasFittedRef` — analogiczny do `hasFramedRef` w
  `Scene3D.tsx`), dalsze edycje parametrów **nie** ruszają kamery,
  zmiana selekcji overlayu `BL-3` wymusza pełne re-dopasowanie (2D nie
  ma odpowiednika "kąta" do zachowania jak 3D, więc to zawsze pełny
  fit, nie tylko re-dopasowanie dystansu/targetu). Przycisk **Fit
  View** w prawym dolnym rogu, ta sama pozycja/styl co w 3D Preview.

  `src/components/preview/camera2d.ts` — czysty moduł matematyki kamery
  2D (analogiczny do `preview3d/cameraPresets.ts`, ale bez rotacji: tu
  kamera to tylko `{ scale, centerX, centerY }`). `computeFitCamera()`,
  `zoomAt()` (zoom-to-cursor), `panBy()`, `worldToScreen()`/
  `screenToWorld()`, `clampScale()` — wszystkie czyste funkcje z
  testami (`camera2d.test.ts`, pierwszy plik testowy poza `src/lib/`;
  `vitest.config.ts` nie ogranicza lokalizacji plików testowych, więc
  to działało bez zmian konfiguracji). `ToolpathCanvas.tsx` przechowuje
  stan kamery (`useState<Camera2D | null>`) i podłącza natywne listenery
  (`wheel` z `{ passive: false }`, `contextmenu`, `mousedown`/
  `mousemove`/`mouseup` na `window`) — ten sam wzorzec "manual
  addEventListener zamiast React synthetic events" co `Scene3D.tsx`
  stosuje dla resize.

  Refaktor `drawToolpath.ts`: `toPx()` przestał liczyć skalę/offset od
  zera z danych przy każdym renderze — teraz przyjmuje gotowy
  `Camera2D` jako parametr. Przy okazji naprawiony utajony bug, który
  ujawniłby się dopiero z realnym zoomem: siatka/etykiety osi były
  wcześniej bounded do prostokąta danych (`dataMinX`…`dataMaxX`), więc
  po wprowadzeniu zoom-out poza fit obszar poza danymi zostałby bez
  siatki. Siatka i osie liczą się teraz z **widocznego viewportu**
  (`camera.centerX/Y ± width/height / (2×scale)`), nie z zasięgu
  danych — grubość kroku siatki (`niceStep`) skaluje się więc razem z
  zoomem (gęstsza siatka przy przybliżeniu), zamiast być stała
  niezależnie od poziomu przybliżenia. Etykiety osi X/Y i ich groty
  zmieniły punkt odniesienia z "krawędzi dopasowanego prostokąta
  danych + padding" na "krawędź widocznego canvasa - stały margines"
  (`EDGE_MARGIN`), bo po BL-11 nie ma już jednego kanonicznego
  narysowanego prostokąta do którego by się przypiąć.
- **G-Code Dialect + Start/End G-Code (`BL-5`, `BL-10`, `0.11.0`).**
  Propozycja użytkownika (wzorowana na sliverach: edytowalny
  header/footer joba) trafiła na `/grill-me`, który połączył ją z
  dwoma zawieszonymi wcześniej pozycjami backlogu — `BL-5` (dialekt
  sterownika) i `BL-10` (brak formalnego końca programu) — w jedną
  spójną implementację zamiast trzech osobnych. Kluczowe ustalenie: te
  dwa mechanizmy są od siebie niezależne, nie warstwami tego samego
  wyboru. `MachineSettings.dialect` (`'grbl' | 'marlin' | 'mach3'`,
  domyślnie `'grbl'`, `src/types/machine.ts`) rozstrzyga wyłącznie dwie
  rzeczy, obie w `src/lib/program.ts`:
  - `buildHeader()` — wartość `G4 P` (sekundy dla GRBL/Mach3, ×1000
    milisekund dla Marlina). To faktycznie **naprawia** wcześniej tylko
    udokumentowany bug (patrz historyczna notatka przy `G4 P` niżej) —
    dwell na Marlinie był krótszy niż zamierzony, teraz jest poprawny
    na wszystkich trzech.
  - Nowe `endOfProgramCode(dialect)` — `M30` dla GRBL/Mach3, `M2` dla
    Marlina (M2 działa też na GRBL, ale M30 to konwencjonalny wybór dla
    GRBL/Mach3). Emitowane **bezwarunkowo**, bez checkboxa na Kroku 4
    — to cecha maszyny, nie wybór per-zadanie — zawsze jako faktycznie
    ostatnia linia pliku (większość kontrolerów nie gwarantuje
    wykonania czegokolwiek po `M30`/`M2`).

  Start/End G-Code (`headerText`/`footerText` w `MachineSettings`) to
  **osobna, dialekt-niezależna** para pól wolnego tekstu — `/grill-me`
  odrzucił pierwotny pomysł "dropdown z presetami per dialekt +
  Custom": poza samym kodem końca programu (już objętym przez
  `dialect` powyżej) nie ma realnego, ugruntowanego standardu na
  zawartość headera/footera per sterownik, więc wymyślanie takich
  presetów byłoby fabrykowaniem treści bez pokrycia. Tekst wstawiany
  **dosłownie** (`split('\n')`, zero walidacji/escapingu — spójne z
  resztą appki, zero potwierdzeń). `assembleProgram()` w
  `src/lib/program.ts` (współdzielone przez obie operacje, patrz
  "Zasada" niżej) robi całe owijanie:
  ```
  ; --- User header ---        (tylko gdy headerText niepuste)
  <headerText, dosłownie>
  ; --- Application code ---   (tylko gdy headerText niepuste)
  G21 G90 G17 ...               ← istniejący buildHeader()
  ... pętla po punktach ...
  ... M5 / G0 X0 Y0 ...         ← istniejący buildFooter()
  ; --- User footer ---        (tylko gdy footerText niepuste)
  <footerText, dosłownie>
  M30 | M2                     (zawsze, bezwarunkowo, ostatnia linia)
  ```
  Znaczniki komentarzy są parą związaną wyłącznie z headerem — plik z
  samym footerem nie dostaje osieroconego "Application code" na
  górze, bo nie ma co nim domykać. Kolejność ustalona świadomie: `M30`/
  `M2` musi być faktycznie ostatnią linią (większość kontrolerów
  zatrzymuje/przewija plik na tej linii), więc user footer ląduje
  **przed** nim, nie po — inaczej byłby martwym kodem na większości
  sterowników. `generateHelix`/`generateStandardHole`/
  `MethodMeta.generate` dostały nowy parametr `machine: MachineSettings`
  (obok istniejącego `params`), przekazywany bez zmian aż do
  `assembleProgram()` — jedyne miejsce z realną logiką owijania.
  2D/3D Preview nie ruszone — liczą geometrię ścieżki bezpośrednio z
  `WizardParams`, nigdy nie wołają `generate()`, a ta funkcja dotyczy
  wyłącznie tekstowego wyjścia G-code.

  UI: nowy dropdown "G-Code Dialect" i dwa `<textarea>` "Start
  G-Code"/"End G-Code" w tej samej sekcji "Machine" w
  `SettingsModal.tsx`, pod istniejącymi polami X/Y/Z travel, za
  `border-t` (ten sam wzorzec wizualnego oddzielenia co Offset w
  `Step2Geometry.tsx`). Dialekt zapisuje się natychmiast po zmianie
  (bez stanu nieprawidłowego pośredniego, w przeciwieństwie do pól
  liczbowych); header/footer trzymają lokalny bufor tekstu i
  zapisują się `onBlur` — dokładnie ten sam wzorzec co pola X/Y/Z
  travel (`text`/`savedField`), tu wyłącznie po to, żeby nie zapisywać
  do `localStorage` przy każdym naciśnięciu klawisza, nie z powodu
  walidacji (każdy string jest poprawną wartością). Stare zapisane
  `simplecam.machine` bez tych pól dostają domyślne wartości przez
  istniejący mechanizm merge w `loadMachineSettings()` — zero migracji
  potrzebne. Dodany `isDialect()` type guard (ten sam wzorzec co
  `isPaletteId()` w `appearanceStorage.ts`) na wypadek nieznanej/
  uszkodzonej wartości `dialect` w zapisie — fallback do `'grbl'`.

  Trzy poprawki po pierwszym realnym użyciu (feedback użytkownika, ta
  sama sesja): **(1)** przycisk zamknięcia (×) był potomkiem
  przewijalnego panelu treści — po dodaniu dialektu i Start/End
  G-Code sekcja "Machine" urosła na tyle, że przycisk znikał poza
  widocznym obszarem przy przewinięciu; przeniesiony na rodzeństwo
  panelu (kotwiczony do nieprzewijalnej karty modala), zostaje teraz
  zawsze widoczny w rogu, niezależnie od scrolla wewnątrz. **(2)**
  zmiana dialektu/header/footer w `handleSaveMachine()` (`App.tsx`)
  czyści `generatedGCode` (ten sam mechanizm co `updateParams()` już
  robi dla parametrów wizarda) — te pola realnie wpływają na treść
  wygenerowanego G-code, więc stary snapshot musi zostać
  unieważniony, inaczej Copy/Download mogłyby po cichu działać na
  nieaktualnej treści. Świadomie **nie** dotyczy X/Y/Z travel — to
  pole wpływa tylko na miękkie `machineFitWarnings()`, nie na treść
  pliku. **(3)** okno Settings powiększone (`420×640` → `640×820`) —
  sekcja "Machine" nie mieściła się wygodnie w poprzednich wymiarach.
- **Pola liczbowe w wizardzie (`0.11.2`).** Zgłoszony przez użytkownika
  bug: wszystkie `<input type="number">` na Kroku 2/3 były kontrolowane
  bezpośrednio przez skonwertowaną liczbę (`value={geometry.x}` /
  `onChange={(e) => update({ x: Number(e.target.value) })}`) —
  `Number('')` daje `0`, więc w momencie wyczyszczenia pola (np. Tab →
  zaznaczenie całości → Backspace, żeby wpisać nową wartość) `value`
  natychmiast wracała do `"0"` w kolejnym renderze i pole nigdy
  realnie się nie opróżniało; cokolwiek wpisane później lądowało za
  tym widmowym zerem. Użytkownik zaproponował przejście na aktualizację
  Preview przy `blur` — odrzucone: to złamałoby udokumentowaną,
  świadomą decyzję z Etapu 3 ("2D Preview jest zawsze live"), a
  prawdziwy problem leżał gdzie indziej — w tym, że wyświetlany tekst
  inputa był błędnie wyprowadzany z zatwierdzonej liczby, bez żadnego
  sposobu na reprezentację stanu "puste" pomiędzy.
  `SettingsModal.tsx` już rozwiązuje dokładnie ten problem dla pól
  X/Y/Z travel (osobny bufor `text`, commit dopiero w `handleBlur`) —
  ale tamten wzorzec commituje **wyłącznie** na blur, co dla
  konfiguracji maszyny ma sens (nie zapisywać do localStorage na
  każde naciśnięcie klawisza), a dla pól wizarda zabiłoby live
  reaktywność Preview.

  Nowy hook `useNumberField(value, onCommit)`
  (`src/components/wizard/useNumberField.ts`) łączy oba: lokalny
  bufor tekstu (`text`, inicjalizowany raz z `String(value)`)
  odizolowany od `value`/`onChange`/`onBlur` inputa, ale **commit
  dzieje się na każdym naciśnięciu klawisza**, które parsuje się do
  skończonej liczby (`Number.isFinite`) — dokładnie ta sama
  częstotliwość co wcześniej, więc Preview zostaje tak samo live jak
  było. `text` nigdy nie jest nadpisywany przez wynikowy re-render z
  zewnątrz (dopóki komponent nie odmontuje się i nie zamontuje na
  nowo — Step2Geometry/Step3Feeds renderują się tylko gdy dany Krok
  jest aktywny, więc to bezpieczne, ten sam argument co przy
  `customPointsText`), tylko `onBlur` resynchronizuje wyświetlany
  tekst z powrotem do `String(value)` — porządkuje puste pole (wraca
  do "0", bo `Number('')` i tak już to commitowało live) czy
  końcowej kropki ("4." → "4"), ale **nie** bramkuje kiedy Preview się
  aktualizuje. Zastosowany do wszystkich 9 pól na Kroku 2
  (`holeDiameter`, `totalDepth`, `gridX`/`gridY`,
  `circleHoleCount`/`circleDiameter`/`circleStartAngle`,
  `offsetX`/`offsetY`) i 5 na Kroku 3 (`stepdown`, `feedrateXY`,
  `plungeRate`, `startZ`, `safeZ`) — jedna linijka na pole (wywołanie
  hooka + spread na istniejący `<input>`, bez ruszania jego własnych
  `type`/`step`/`min`/`max`). `SettingsModal.tsx` świadomie
  nieruszany — jego `onChange` już zapisuje surowy string wprost do
  `text`, bez przechodzenia przez `Number()` przed wyświetleniem, więc
  nigdy nie miał tego buga.
- **Tabs (mostki) dla operacji Hole(s) (`BL-14`, `0.12.0`).** Helix i
  Standard Hole tną pojedynczy pierścień (promień ścieżki =
  (holeDiameter−toolDiameter)/2), nie czyszczą kieszeni — przy
  przewierceniu na wylot środkowy "korek" jest całkowicie wolny, gdy
  pierścień się zamknie, chyba że coś go trzyma. Sesja `/grill-me`
  ustaliła pełny design, dodatkowo zweryfikowany przez osobny przegląd
  poprawności matematyki/algorytmu PRZED implementacją (wychwycił dwa
  realne bugi w pierwszym szkicu, oba opisane niżej) — coś, czego
  wcześniejsze sesje w tym projekcie nie robiły, uzasadnione tym, że
  błąd tutaj ma realne znaczenie fizyczne (mostki to jedyne, co trzyma
  wyciętą część, nie tylko kosmetyka UI).

  **Zakres:** obie metody (Helix i Standard Hole), jednolicie dla
  każdego otworu we wzorcu — jeden zestaw parametrów mostków na job,
  spójne z resztą appki ("jedno narzędzie/operacja na wygenerowany
  plik"). Nowa sekcja na Kroku 2 (`Step2Geometry.tsx`), schowana za
  checkboxem "Enable Tabs", za tym samym `border-t` co Offset (Offset
  zostaje ostatnią sekcją). Trzy pola przez istniejący
  `useNumberField()`: **Tab Height** [mm] (jak głęboko od dna sięga
  pasmo mostków), **Tab Width** [mm] — długość łuku, nie stopnie, bo
  fizyczny mostek mierzy się w mm niezależnie od średnicy otworu —
  **Tab Count**. Rozstawienie automatyczne i równomierne, bez pola na
  kąt startowy.

  **Mechanika (silnik, `src/lib/tabs.ts` + `helix.ts`/`standardHole.ts`):**
  wszystko płycej niż `totalDepth − tabHeight` tnie się bez zmian (pełny
  pierścień — korek trzyma jeszcze materiał poniżej). Gdy cięcie
  dochodzi do ostatnich `tabHeight` mm ("pasmo mostków"), ruch
  przechodzi na **płaskie** przejścia co `stepdown` (reużywa istniejący
  parametr, żadnego nowego) — dla Standard Hole to nic nowego (jego
  przejścia są już płaskie, wybór między pełnym okręgiem a wersją z
  mostkami jest atomowy per-przejście, bez przebudowy pętli); dla
  Helixa spirala celowo skraca się dokładnie do góry pasma (drugie,
  niezależne wywołanie `computeDepthPasses()` na skróconą głębokość),
  po czym płaskie przejścia z mostkami przejmują resztę, **zastępując**
  dawną pojedynczą płaską "flat finishing pass" na końcu. Każde
  przejście w paśmie pomija łuk mostka: najazd dokładnie na
  `−(totalDepth − tabHeight)` (góra pasma — reużyta jako wysokość
  najazdu, żadnego osobnego parametru), przejazd nad mostkiem na tej
  wysokości, powrót w dół. Najazd/powrót to zawsze osobne, czysto
  pionowe linie G1 przy stałym XY — nigdy ruch po przekątnej przez
  materiał mostka.

  **Interpolacja:** mostki wymuszają G1 dla **całego** programu, nie
  tylko przejść w paśmie — prościej niż emitowanie dzielonych łuków
  G2/G3 wokół przerw. Przełącznik interpolacji na Kroku 4
  (`Step4Output.tsx`) wyszarza się (wymuszone G1, nieklikalne) z
  komunikatem wyjaśniającym, gdy mostki są włączone; sama zapisana
  wartość `output.interpolation` zostaje nietknięta (tylko ignorowana
  na czas mostków, znów aktywna po ich wyłączeniu — bez ukrytego stanu
  "zapamiętanej" poprzedniej wartości).

  **Walidacja** (`src/lib/validation.ts`, ten sam wzorzec co reszta):
  `isTabHeightValid()` — `0 < tabHeight < totalDepth`;
  `isTabWidthValid()` — `tabCount × tabWidth <` obwód ścieżki narzędzia
  (inaczej mostki nachodzą na siebie albo konsumują cały pierścień).
  Obie prawdziwe wprost, gdy mostki wyłączone. `MAX_TAB_COUNT = 20` —
  czysto arbitralny sufit spinnera, ta sama kategoria co
  `MAX_CIRCLE_HOLE_COUNT` (`BL-1`).

  **`src/lib/tabs.ts`** — jedyne nowe źródło geometrii.
  `computeTabRanges(tabCount, tabWidth, radius)`: kąty mostków
  równomierne, przesunięte w fazie o pół kroku (środek pierwszego
  mostka na `step/2`, nie na kącie 0) — punkt startowy każdego
  przejścia (kąt 0) nigdy nie trafia w mostek, i przy założeniu
  walidacji (`tabCount×tabWidth < obwód`) żaden zakres mostka nigdy nie
  wychodzi poza `[0, 2π]` — zero obsługi zawijania kąta gdziekolwiek.
  `tabbedCirclePass()`: **nie** jest zwykłym próbkowaniem co 5° (72
  segmenty, jak `circle.ts`) — pierwszy szkic tak robił i przegląd
  poprawności wychwycił realny bug: mostek węższy niż jedna próbka
  mógł wypaść między próbkami i zostać wycięty w całości, a nawet gdy
  wykryty, najazd/powrót łapały się na najbliższą próbkę zamiast na
  prawdziwą granicę, więc ocalałe mostki wychodziły systematycznie
  szersze niż zadane. Naprawione: lista kątów to **suma** równomiernego
  próbkowania (płynny ruch tnący między mostkami) **i** dokładnych
  granic każdego mostka wymuszonych jako punkty łamania — gwarantuje
  wykrycie i dokładny rozmiar każdego mostka niezależnie od
  rozdzielczości próbkowania, bez potrzeby osobnej walidacji
  "minimalnej szerokości mostka".

  **Drugi bug złapany w przeglądzie:** stara, bezwarunkowa "flat
  finishing pass" na końcu `helixToolpath()` musiała zniknąć dla ścieżki
  z mostkami — bez tego ostatnie przejście pętli pasma mostków (już
  poprawnie kończące się na `−totalDepth`) zostałoby przykryte jeszcze
  jednym, zwykłym pełnym okręgiem, po cichu kasując wszystkie mostki.
  Ustrukturyzowane jako dwie w pełni osobne gałęzie (`if (tabsEnabled)
  {...} else {...}`, ta druga bit-identyczna z kodem sprzed tej
  zmiany), nie warunek doklejony na wspólny ogon — żeby nie dało się
  tego przypadkiem cofnąć. Test `helix.test.ts` sprawdza to wprost:
  dokładnie jedna linia `G1 Z-4 F300` (jedyne miejsce, skąd taka goła
  linia Z może pochodzić — spirala nigdy jej nie emituje).

  **Podglądy 2D i 3D renderują realne przerwy** (nie odłożone na
  później — to fizycznie istotna funkcja, nieaktualny podgląd byłby
  tu bardziej ryzykowny niż zwykle). `drawToolpath.ts`:
  `drawGappedCircle()` zamiast pojedynczego pełnego łuku dla obrysu
  otworu i ścieżki narzędzia — konwertuje kąty świata (matematyczna
  konwencja, jak w `tabs.ts`) na kąty canvasa (odwrócone, bo
  `worldToScreen` odbija oś Y). `buildScene.ts`:
  `tabbedCirclePoints3D()` lustrzane wobec `tabbedCirclePass()`, ta
  sama unia próbkowania+granic, tylko emituje `Vector3` zamiast linii
  G-code — `helixPoints3D`/`standardHolePoints3D` dostały opcjonalny
  parametr `tabs` i te same dwie gałęzie co silnik. **Świadomie poza
  zakresem:** bryła otworu (półprzezroczysty cylinder) zostaje pełnym,
  niepodziurawionym kształtem — to i tak było już zgrubne przybliżenie
  (opacity 0.12), nie dosłowny kształt; tylko **linia ścieżki narzędzia**
  (2D i 3D) dostała dokładną geometrię przerw, bo to ona precyzyjnie
  pokazuje, gdzie narzędzie faktycznie jedzie. Wypełnienie otworu w 2D
  (`holeFill`) też zostaje pełnym dyskiem z tego samego powodu — sam
  obrys (`holeStroke`) i ścieżka narzędzia dostały przerwy.

  **`BL-15` zamknięte w `0.13.2`:** te przerwy w 2D renderowały się jako
  zwykła pustka (nic nie rysowane na łuku/odcinku mostka) — czytało się
  jak brakujący fragment ścieżki, nie jak fizyczny mostek. Naprawione
  przerywaną linią (`ctx.setLineDash()`) w tym samym kolorze co reszta
  łuku/odcinka — zero nowego koloru w `config/palettes.ts` (rozważana
  alternatywa: osobny kolor per paleta/motyw, odrzucona jako niepotrzebny
  narzut utrzymaniowy dla czysto kosmetycznej poprawki). Dotyczy obu
  `drawGappedCircle()`/`drawGappedRectangle()` (ten drugi doszedł przy
  OP-1, po oryginalnym zgłoszeniu BL-15 — dostał tę samą poprawkę od
  razu, jednym współdzielonym stałym `TAB_DASH`).

  **Branch `add-tabs`**, nie prosto na `main` (w przeciwieństwie do
  wcześniejszych sesji w tym projekcie) — świadoma decyzja użytkownika:
  ta zmiana dotyka silnika G-code nową geometrią o realnym znaczeniu
  fizycznym, warto ją odizolować do potwierdzenia.

  **Trzeci bug, złapany przez użytkownika na wizualizacji (nie przez
  przegląd przed implementacją).** Spirala Helixa nie zostawia płaskiej
  powierzchni na granicy pasma mostków — zostawia rampę śrubową: ostatni
  obrót spirali schodzi *ciągle* w miarę zamiatania kątem od 0° do 360°,
  więc tylko punkt startowy/końcowy (kąt szwu) faktycznie osiąga
  docelową głębokość (górę pasma mostków); reszta obwodu jest w tym
  momencie płycej, aż do połowy zamierzonego `stepdown` przy samym
  starcie ostatniego obrotu. Efekt: pierwsze płaskie przejście w paśmie
  mostków (to, które zanurza się o kolejny `stepdown`) ścinało nierówno
  — poprawną głębokość tuż przy szwie spirali, ale aż 2× tyle po
  drugiej stronie rampy (np. przy `stepdown=0.5mm` realnie ścinało do
  1mm w jednym przejściu). Poprawka: dodatkowe, w pełni płaskie,
  niedotabowane przejście dokładnie na górze pasma (`zStart === zEnd`,
  zero głębokości netto) wstawione **po** spirali, **przed** pętlą
  pasma mostków — czyści rampę do jednej płaskiej powierzchni, zanim
  zacznie się właściwe zagłębianie z pomijaniem mostków. To dokładnie
  ten sam mechanizm, co dotychczasowa "flat finishing pass" na samym
  dnie niedotabowanej ścieżki (istniała od zawsze właśnie po to, żeby
  wyczyścić tę samą rampę na dnie) — tylko teraz potrzebny też na nowej
  granicy przejścia spirala→płaskie cięcie, nie tylko na końcu. Dotyczy
  wyłącznie Helixa (Standard Hole nigdy nie ma spirali, więc nigdy nie
  ma rampy do czyszczenia) i wyłącznie **pierwszego** przejścia w
  paśmie (każde kolejne płaskie przejście zawsze zostawia płaską
  powierzchnię, więc problem się nie powiela). Test regresyjny w
  `helix.test.ts` używa dokładnie przykładu z rozmowy z użytkownikiem
  (głębokość 5mm, mostek 1mm, skok 0.5mm) i liczy linie na głębokości
  szwu przed pierwszym zanurzeniem w pasmo — dokładnie 73 (72 z nowego
  przejścia czyszczącego + 1 z domkniętego ostatniego punktu spirali).

  **Domyślne rozmiary mostków (kosmetyczna dołka przed mergem).** Nowe
  pola w `MachineSettings`: `defaultTabHeight`/`defaultTabWidth`/
  `defaultTabCount` (domyślnie `1`/`3`/`3` — te same liczby co
  `DEFAULT_WIZARD_PARAMS.geometry` dla tabów, więc świeży wizyta i
  nieotwarte Settings dają identyczny wynik). Własna, czwarta sekcja
  nawigacji Settings — **"Tabs"** (`SettingsModal.tsx`, nie w środku
  "Machine" — pierwsza wersja tak to umieściła, przeniesione na
  wyraźną prośbę użytkownika, bo to inny rodzaj ustawienia niż
  fizyczne cechy maszyny), z sekcją "Default Tab Sizes" w środku. Ten
  sam wzorzec bufora tekstu+onBlur+"✓ Saved" co pola X/Y/Z travel, typ
  `TravelField` poszerzony do `NumericField` — jeden generyczny
  `handleBlur()` obsługuje teraz oba zestawy pól, mimo że renderują się
  w dwóch różnych sekcjach nawigacji. Aplikowane w
  `Step2Geometry.tsx`, gdy checkbox "Enable Tabs" przechodzi z
  false→true (`machine` prop już tam był dostępny) — świadomie
  **zawsze** nadpisuje `tabHeight`/`tabWidth`/`tabCount` świeżymi
  wartościami z Settings przy każdym zaznaczeniu, także po odznaczeniu
  i ponownym zaznaczeniu w tej samej sesji (czyli niestandardowa
  edycja sprzed odznaczenia przepada) — brak czystego sposobu
  odróżnienia "user to dostosował w tej sesji" od "to tylko to, co
  ostatnio wsiane" bez nowego stanu do śledzenia, a przewidywalne
  "zawsze zaczyna od Twojego defaultu" uznane za lepsze niż
  półpamiętające zachowanie.
- **`BL-16` zamknięte — Krok 3: kolejność pól (`0.12.3`).** Nowa
  kolejność w `Step3Feeds.tsx`: Feedrate XY, Plunge Rate, Stepdown/
  Pitch, Start Z, Safe Z — dotąd Stepdown/Pitch renderował się jako
  pierwsze pole, nie trzecie. Walidacje (`isStepdownValid`,
  `isStartZValid`) przeniosły się razem ze swoimi polami, bez zmian
  treści. Kolejność ikon w zwiniętym pasku Kroku 3 (`App.tsx`)
  ujednolicona do tej samej kolejności: FEED, PLUNGE, STEPDOWN, STARTZ
  (Safe Z nie ma tam odpowiednika MiniStat — bez zmian, nie dodawano
  nowego). Czysto porządkowa zmiana JSX, zero zmian w logice/typach/
  testach.
- **Step 2: pogrupowanie pól w poziome wiersze, tipy jako popover pod
  ikoną "?", TABS w zwiniętym pasku Kroku 2 (`0.12.2`).** Sesja
  `/grill-me` — wyłącznie oszczędność miejsca na Krokach (mniej
  scrollowania, zwłaszcza na Kroku 2), zero zmian w logice/typach/
  testach. Trzy niezależne decyzje:
  - **Poziome pary/trójki pól**, ten sam wzorzec `flex gap-4`/
    `min-w-0 flex-1` co istniejące Width/Height i Offset X/Y: Hole
    Diameter + Total Depth (mimo że nie są parą X/Y — czysto
    oszczędność miejsca), Circle (Hole Count + Circle Diameter + Start
    Angle, wszystkie 3 w jednym wierszu, nie 2+1), Tabs (Tab Height +
    Tab Width + Tab Count, też wszystkie 3 w wierszu). Komunikaty
    walidacji (`isToolDiameterValid`, `isCircleHoleCountValid`,
    `isTabHeightValid`, `isTabWidthValid`) przeniesione pod cały
    wiersz (pełna szerokość), nie przypięte do jednej kolumny.
  - **Podpowiedzi jako popover pod ikoną "?".** Konwersji podlegają
    dokładnie 4 rzeczy: hint Width, hint Height, hint Custom Points
    (`"e.g. 10,10"`) i opis pod checkboxem "Enable Tabs" — świadomie
    **nie** opis "Pattern: `<nazwa>`", który zostaje zwykłym, zawsze
    widocznym tekstem (user: CNC-owiec i tak wie co to Pattern, ale
    "Enable Tabs" też uznany za wystarczająco znany, żeby schować pod
    popover — decyzja o zakresie, nie o wiedzy usera). Dla pól: ikona
    `HintIcon` (nowa w `icons.tsx`) siedzi na prawo od samego inputa,
    w tym samym wierszu (input się zwęża) — nie pod labelem jak
    dotąd. Dla "Enable Tabs": ikona na prawo od tekstu nagłówka, w
    tym samym `<label className="flex items-center gap-2">`. Klik
    otwiera/zamyka (nie hover), popover renderuje się pod ikoną, tylko
    jeden otwarty naraz (zamyka pozostałe), zamyka się też na klik na
    zewnątrz/Escape. Nowy `components/wizard/HintPopover.tsx` —
    "tylko jeden otwarty naraz" wychodzi "za darmo" z per-instancyjnego
    `mousedown`-poza-komponentem nasłuchu (klik w inną ikonę zamyka
    poprzedni popover, zanim otworzy nowy — bez współdzielonego stanu
    między instancjami). `FieldRow.tsx` przebudowany: `hint` prop
    (sygnatura bez zmian) renderuje teraz `HintPopover` zamiast
    tekstu pod inputem — `inputClass` dostał jawne `w-full`, bo input
    przestał być bezpośrednim dzieckiem `flex-col` labela (traci
    domyślny `align-items: stretch`), które dotąd rozciągało go do
    pełnej szerokości bez potrzeby jawnej klasy.
  - **TABS w zwiniętym pasku Kroku 2** (`App.tsx`) — nowy `MiniStat`
    zaraz po DEPTH: etykieta "TABS", nowa ikona `TabBridgeIcon`
    (profil niski-podniesiony-niski, jak przekrój mostka), wartość
    "YES". Widoczny tylko gdy `tabsEnabled` — ten sam warunkowy wzorzec
    co istniejące OFFSET (nie zawsze YES/NO). Wcześniej pasek Kroku 2
    nie miał żadnej wzmianki o tabs.
  Brak nowego `BL-#` — zaimplementowane od razu w tej samej sesji, nie
  odłożone do Backlogu.

  Dwie poprawki po pierwszym realnym użyciu (feedback użytkownika, ta
  sama sesja). **(1)** Popover przycinał się pod zwiniętym paskiem
  Kroku 1 — panel Kroku 2 ma `overflow-y-auto`, co per spec CSS
  wymusza `overflow-x: auto` na tym samym elemencie (nie da się mieć
  jednej osi `auto` a drugiej faktycznie `visible`), więc treść
  wystająca poza lewą krawędź panelu była po cichu przycinana; sam
  wyższy `z-index` by tego nie naprawił, bo to przycinający przodek,
  nie problem kolejności warstw. Naprawione renderowaniem popovera
  przez `createPortal` do `document.body`, `position: fixed`
  pozycjonowane z `getBoundingClientRect()` ikony — omija
  przycinającego przodka całkowicie — plus przesuwanie w granicach
  viewportu (pion: flip nad ikonę gdy brak miejsca poniżej; poziom:
  clamp do `[EDGE_MARGIN, innerWidth-width-EDGE_MARGIN]`), więc
  popover zostaje w pełni na ekranie niezależnie od pozycji ikony.
  Zamyka się dodatkowo na scroll (`capture: true`, łapie scroll panelu
  Kroku 2, nie tylko okna) — prostsze niż śledzenie pozycji w locie.
  **(2)** "Circle Diameter [mm]" (20 znaków) łamał się na dwie linie w
  wąskiej 1/3 kolumnie trzy-polowego wiersza Circle — skrócone do
  "Diameter [mm]" (kontekst z nagłówka "Pattern: N-Holes on Circle").
  Ten sam ryzykowny rozmiar miały "Tab Height [mm]"/"Tab Width [mm]" w
  grupie Tabs (nie zrzutowane w zgłoszeniu, bo tabs były wyłączone, ale
  identyczna szerokość kolumny) — skrócone prewencyjnie do
  "Height [mm]"/"Width [mm]", kontekst z nagłówka "Enable Tabs".
- **Grid/Grid Centered: kolaps do 2 symetrycznych otworów (`0.12.1`).**
  Sesja `/grill-me` — punkt wyjścia: dwa otwory oddalone o zadaną z
  rysunku technicznego odległość dają się dziś zrobić na 3 sposoby
  (dwa Single Hole, Custom List, 2-Holes on Circle), ale najwygodniej
  byłoby po prostu wpisać tę odległość jako Width albo Height w
  istniejącym Rectangular Grid i zostawić drugi wymiar na 0 —
  wcześniej silnik tego nie rozpoznawał i wiercił ten sam punkt
  dwu-/czterokrotnie (4 nominalne rogi nakładają się parami, gdy jeden
  bok = 0). Rozstrzygnięcia z grilla:
  - **Zakres:** obie odmiany prostokąta — zwykły `grid` (róg-origin) i
    `gridCentered` — dostają ten sam kolaps, mimo że tylko
    `gridCentered` daje geometrycznie symetryczny wynik (`grid` daje
    parę otwór-w-origin + otwór-przesunięty, nie symetryczną wokół
    środka) — obie i tak rozwiązują ten sam problem "dwa otwory w
    zadanej odległości".
  - **Mechanizm:** specjalny przypadek wewnątrz gałęzi `'grid'`/
    `'gridCentered'` w `rawPoints()` (`lib/positioning.ts`), **nie**
    generyczny dedup w `resolvePoints()` — świadomie ograniczone tylko
    do tych dwóch trybów. `circle` (np. `circleDiameter=0` wiercące N
    razy w tym samym miejscu) i `custom` (zduplikowane wiersze w
    textarea) zostają nietknięte — osobna decyzja, żeby nie zmieniać
    niepowiązanego, wcześniej istniejącego zachowania przy okazji.
  - **Warunek:** porównanie dokładne (`gridX === 0` / `gridY === 0`),
    bez epsilon — spójne z tym, że pola idą przez `useNumberField()` i
    komponują się z resztą UI, gdzie `0` wpisane wprost znaczy `0`.
  - **Kolaps do 1 otworu** (oba wymiary `0` naraz) dozwolony po cichu
    — silnik i tak wierci tylko raz, bez żadnej dodatkowej walidacji
    blokującej Generate.
  - **Etykiety** (`config/positioningMeta.ts`, `positioningLines()`/
    `patternLabel()`): rozpoznają kolaps do 2 otworów i pokazują
    `"2 HOLES (Nmm apart)"` / `"2 Holes (Nmm apart)"` zamiast
    zdegenerowanie wyglądającego `"RECTANGLE (0×N)"`. Kolaps do 1
    otworu (oba `0`) świadomie **nie** dostaje własnej etykiety —
    zbyt rzadki przypadek, zostaje przy zwykłym `"(0×0)"` tekście.
  - **Bez zmian:** ikona (`RectangleIcon`/`RectangleCenteredIcon`
    zostają kluczowane wyłącznie po `PositioningMode`, nie po
    wartościach `gridX`/`gridY`) i `patternSlug()` (nazwa pliku dalej
    `grid`/`grid-centered`, bez kodowania kolapsu).
  - **2D/3D Preview i `machineFitWarnings()`/`patternSpan()` bez
    zmian** — wszystkie wołają `resolvePoints()` jako jedyne źródło
    prawdy, więc dziedziczą poprawkę automatycznie; bounding box
    (max−min) jest niewrażliwy na usunięcie zduplikowanych punktów.
  - Nowa podpowiedź w UI pod polami Width/Height na Kroku 2
    (`Step2Geometry.tsx`, przez istniejący `hint` prop `FieldRow` —
    ten sam mechanizm co podpowiedź `"e.g. 10,10"` przy Custom Points)
    — bo bez niej trik "ustaw 0" nie był w żaden sposób odkrywalny z
    samego UI.
- **`.gitignore` musi wykluczać `.claude/`** — Tailwind v4
  (`@tailwindcss/vite`) auto-skanuje cały katalog projektu pod kątem nazw
  klas i respektuje tylko `.gitignore` jako listę wykluczeń (bez niego
  dokumentacja zainstalowanych skilli w `.claude/skills/` też trafia do
  skanowania i winduje bundle CSS — realnie zaobserwowane: 16KB → 34KB).
- **`G4 P<sekundy>`** (dwell po starcie wrzeciona) było historycznie
  poprawne tylko dla GRBL/Mach3 — Marlin interpretuje `P` jako
  milisekundy, więc dostawał krótszą pauzę niż zamierzona. **Naprawione
  w `0.11.0`** wraz z zamknięciem `BL-5`/`BL-10` — patrz pełny opis
  "G-Code Dialect + Start/End G-Code" wyżej: `buildHeader()` konwertuje
  wartość `G4 P` per `MachineSettings.dialect` (×1000 dla Marlina).
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
  komentarz, który tłumaczy, że nie brakuje. Od `0.11.0`
  (`BL-10`, patrz "G-Code Dialect + Start/End G-Code" wyżej)
  `assembleProgram()` dokłada po `buildFooter()` (i po ewentualnym user
  footerze) bezwarunkową, dialekt-zależną linię `M30`/`M2` — to
  osobny, świeżo dodany mechanizm, `buildFooter()` sam w sobie się nie
  zmienił.

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
                              globalny obiekt, nie WizardParams). Od `0.11.0`
                              (`BL-5`/`BL-10`) też `Dialect` (`'grbl' |
                              'marlin' | 'mach3'`) i pola `dialect`/
                              `headerText`/`footerText` — patrz "G-Code
                              Dialect + Start/End G-Code" w "Kluczowe
                              decyzje projektowe" po pełny opis
  types/appearance.ts       — AppearanceSettings + DEFAULT_APPEARANCE_SETTINGS
                              (paleta kolorów podglądu, `BL-12`) — osobny od
                              `machine.ts`: preferencja UI, nie fizyczna cecha
                              maszyny
  config/palettes.ts        — jedyne źródło prawdy dla kolorów podglądu 2D
                              (`preview/drawToolpath.ts`) i 3D
                              (`preview3d/buildScene.ts`), `BL-12`.
                              `FIXED_COLORS_LIGHT`/`FIXED_COLORS_DARK` — osie
                              X/Y, origin, offset, 2D-owe text/holeFill —
                              te same we wszystkich paletach (konwencja
                              CNC/semantyczna, nie stylistyka). `PALETTES`/
                              `PALETTE_LIST` — 4 palety akcentów
                              (toolpath/rapid/hole/grid/background), każda
                              z wariantem light/dark; `default` odtwarza
                              przedpaletowe kolory — poza `grid`, naprawionym
                              w `0.11.1` (patrz "Palety kolorów podglądu
                              2D/3D w Settings" w "Kluczowe decyzje
                              projektowe" po pełny opis regresji), wspólnym
                              dla wszystkich 4 palet, nie tylko `default`.
                              `hexToThreeColor()` konwertuje hex-string na
                              numeryczny kolor Three.js — 2D i 3D dzielą też
                              literały kolorów, nie tylko strukturę
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
                              `lib/download.ts`) — patrz Etap 6. Od `0.12.1`:
                              `positioningLines()`/`patternLabel()`
                              rozpoznają kolaps grid/gridCentered do 2
                              otworów (`gridX===0` xor `gridY===0`, patrz
                              `lib/positioning.ts` niżej) i pokazują
                              `"2 HOLES (Nmm apart)"` zamiast zdegenerowanego
                              `"RECTANGLE (0×N)"`; kolaps do 1 otworu (oba
                              wymiary 0) świadomie NIE jest tu rozpoznawany,
                              zostaje przy zwykłym tekście `"(0×0)"` —
                              `patternSlug()`/ikona (`RectangleIcon`/
                              `RectangleCenteredIcon`) bez zmian w obu
                              przypadkach
  components/SettingsModal.tsx — modal Machine Settings (`BL-9`) — patrz
                              "Machine Settings" w sekcji "Kluczowe decyzje
                              projektowe" wyżej po pełny opis. Trzecia
                              sekcja "Appearance" (`BL-12`) — picker palety
                              kolorów podglądu, patrz `config/palettes.ts`.
                              Sekcja "Machine" ma od `0.11.0` (`BL-5`/
                              `BL-10`) też dropdown G-Code Dialect i dwa
                              `<textarea>` Start/End G-Code — patrz
                              "G-Code Dialect + Start/End G-Code" wyżej.
                              Od `0.12.0` (`BL-14`) czwarta, osobna sekcja
                              nawigacji **"Tabs"** — "Default Tab Sizes",
                              świadomie nie w środku "Machine" (na
                              wyraźną prośbę użytkownika) — patrz "Tabs
                              (mostki)..." wyżej. Od `0.12.4`: pola X/Y/Z
                              travel (Machine) i sekcja "Default Tab
                              Sizes" (Tabs, przemianowana na "Default
                              Tab Settings") renderują się w poziomym
                              wierszu, ten sam wzorzec `flex gap-4`/
                              `min-w-0 flex-1` co Krok 2 (`0.12.2`) —
                              spójność wizarda i Settings. Etykiety pól
                              skrócone do "Height [mm]"/"Width [mm]"/
                              "Count" (kontekst z nagłówka sekcji).
                              Czysto kosmetyczne
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
                              Etap 6. Wszystkie pola liczbowe na tym Kroku
                              (i na `Step3Feeds.tsx`) idą od `0.11.2` przez
                              `useNumberField()` — patrz niżej i "Pola
                              liczbowe w wizardzie" w "Kluczowe decyzje
                              projektowe". Od `0.12.0` (`BL-14`) też sekcja
                              Tabs (checkbox "Enable Tabs" + Height/Width/
                              Count, za kolejnym `border-t`, przed Offset)
                              — patrz "Tabs (mostki)..." w "Kluczowe
                              decyzje projektowe". Od `0.12.2`: Hole
                              Diameter+Total Depth, Circle
                              (Count/Diameter/Start Angle) i Tabs
                              (Height/Width/Count) renderują się w
                              poziomym wierszu (`flex gap-4`/`min-w-0
                              flex-1`, jak Width/Height); Width/Height/
                              Custom Points hint i opis "Enable Tabs"
                              przez `HintPopover` zamiast zawsze
                              widocznego tekstu — patrz "Step 2:
                              pogrupowanie pól..." w "Kluczowe decyzje
                              projektowe"
  components/wizard/useNumberField.ts — hook `useNumberField(value, onCommit)`
                              (`0.11.2`) — oddziela wyświetlany tekst
                              inputa od zatwierdzonej wartości, żeby pole
                              dało się realnie wyczyścić. Patrz "Pola
                              liczbowe w wizardzie" w "Kluczowe decyzje
                              projektowe" po pełny opis
  components/wizard/FieldRow.tsx — `label`/pole/`hint` per wiersz formularza,
                              `inputClass` (współdzielone stylowanie
                              inputów). Od `0.12.2`: `hint` renderuje się
                              jako ikona `HintPopover` obok pola (nie tekst
                              pod spodem) — `inputClass` dostał jawne
                              `w-full`, bo input przestał być
                              bezpośrednim dzieckiem `flex-col` labela
                              (traci domyślny `align-items: stretch`)
  components/wizard/HintPopover.tsx — (`0.12.2`) klikalna ikona "?"
                              (`HintIcon`) + popover z tekstem podpowiedzi,
                              renderowany przez `createPortal` do
                              `document.body` (`position: fixed`,
                              pozycjonowany z `getBoundingClientRect()`
                              ikony + clamp do granic viewportu) — omija
                              przycinanie przez `overflow-y-auto` panelu
                              Kroku 2 (patrz "Step 2: pogrupowanie
                              pól..." w "Kluczowe decyzje projektowe" po
                              pełny opis buga i poprawki). Zamyka się na
                              klik na zewnątrz/Escape/scroll
                              (`useEffect`+`document.addEventListener`,
                              ten sam wzorzec co `SettingsModal.tsx`/
                              `ToolpathCanvas.tsx`); tylko jeden otwarty
                              naraz — konsekwencja per-instancyjnego
                              nasłuchu na `mousedown`, bez współdzielonego
                              stanu
  components/icons.tsx      — zestaw ikon SVG (własne, bez zależności). Od
                              `0.12.2`: `HintIcon` (kółko + znak zapytania,
                              dla `HintPopover`), `TabBridgeIcon` (profil
                              niski-podniesiony-niski, dla TABS w zwiniętym
                              pasku Kroku 2)
  components/preview/       — podgląd 2D (Etap 3)
    ToolpathCanvas.tsx        — React wrapper: <canvas>, devicePixelRatio,
                               ResizeObserver, przerysowanie przy zmianie
                               params/motywu/kamery. Od `BL-11` też
                               właściciel stanu kamery (`Camera2D`) i
                               natywnych listenerów zoom/pan (wheel,
                               contextmenu, mousedown/move/up) — patrz
                               "Zoom/pan na 2D Preview" w "Kluczowe decyzje
                               projektowe" po pełny opis
    camera2d.ts                — czysta matematyka kamery 2D (`BL-11`) —
                               odpowiednik `preview3d/cameraPresets.ts`,
                               ale bez rotacji (`Camera2D = { scale,
                               centerX, centerY }`). `computeFitCamera()`,
                               `zoomAt()` (zoom-to-cursor), `panBy()`,
                               `worldToScreen()`/`screenToWorld()`,
                               `clampScale()` — z testami
                               (`camera2d.test.ts`)
    drawToolpath.ts            — właściwe rysowanie (Canvas 2D API): siatka,
                               osie X (czerwona) / Y (zielona) — te same
                               wartości hex co `preview3d/buildScene.ts`
                               (od `BL-12` dosłownie ta sama stała, obie
                               strony importują z `config/palettes.ts`
                               zamiast trzymać zsynchronizowane ręcznie
                               kopie), każda z grotem strzałki i etykietą na
                               dodatnim końcu (spójny styl z 3D Preview) —
                               punkt (0,0), dla każdego otworu — obrys
                               finalnego otworu (D_hole) + ścieżka
                               narzędzia (promień = (D_hole-D_tool)/2) +
                               przejazdy szybkie (G0) między otworami.
                               `buildTheme(paletteId, isDark)` łączy stałe
                               kolory CNC (`getFixedColors`) z akcentami
                               wybranej palety (`getPaletteAccents`) —
                               `BL-12`. Od `BL-11` przyjmuje gotowy
                               `Camera2D` zamiast liczyć skalę/offset od
                               zera z danych przy każdym renderze — siatka
                               i osie są bounded do widocznego viewportu
                               (pochodnego z kamery), nie do zasięgu
                               danych, więc zoom/pan nigdy nie odsłania
                               obszaru bez siatki. Eksportuje
                               `computeToolpathDataBounds()` — jedyny
                               punkt styku z `ToolpathCanvas.tsx`, które
                               woła go, żeby policzyć fit-to-data kamerę
                               (mount, Fit View, zmiana selekcji overlayu).
                               Reużywa `resolvePoints()` z
                               `lib/positioning.ts` — geometria liczona raz,
                               wspólnie z silnikiem. Od `0.12.0` (`BL-14`):
                               `drawGappedCircle()` zamiast pojedynczego
                               pełnego `ctx.arc()` dla obrysu otworu i
                               ścieżki narzędzia, gdy `tabsEnabled` —
                               konwertuje kąty świata (`lib/tabs.ts`) na
                               kąty canvasa (odwrócone, bo `worldToScreen`
                               odbija oś Y)
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
                               Od `0.12.0` (`BL-14`): `tabbedCirclePoints3D()`
                               (lustrzane wobec `lib/tabs.ts`'s
                               `tabbedCirclePass()`, emituje `Vector3`
                               zamiast linii G-code) — `helixPoints3D`/
                               `standardHolePoints3D` dostały opcjonalny
                               parametr `tabs` i te same dwie gałęzie co
                               silnik. Bryła otworu (cylinder) świadomie
                               zostaje pełnym kształtem — patrz "Tabs
                               (mostki)..." w "Kluczowe decyzje projektowe"
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
                                 (patrz CHANGELOG 0.6.14). Od `0.12.1`:
                                 `grid`/`gridCentered` kolapsują do 2 (albo
                                 1, gdy oba wymiary są 0) rzeczywistych
                                 punktów, kiedy `gridX` lub `gridY` wynosi
                                 dokładnie 0 — bez tego wszystkie 4 "rogi"
                                 nakładałyby się parami, a silnik wierciłby
                                 to samo miejsce dwu-/czterokrotnie. Prosty
                                 sposób na "dwa otwory oddalone o zadaną
                                 odległość" bez sięgania po Custom List czy
                                 N-Holes Circle. Świadomie **nie** ruszone w
                                 `circle`/`custom` (`circleDiameter=0` czy
                                 duplikaty w Custom List zachowują dawne
                                 zachowanie — wiercenie tego samego miejsca
                                 wielokrotnie) — osobna decyzja z sesji
                                 `/grill-me`, żeby nie zmieniać
                                 niepowiązanego zachowania przy okazji.
                                 Porównanie dokładne (`=== 0`), bez epsilon.
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
                                 pętla po punktach, retrakt, stopka). Od
                                 `0.11.0` (`BL-5`/`BL-10`): buildHeader()
                                 przyjmuje `Dialect` (konwersja G4 P sekundy/
                                 ms), nowe endOfProgramCode(dialect) →
                                 M30/M2, assembleProgram() przyjmuje
                                 `MachineSettings` i owija program w user
                                 header/footer + bezwarunkowe M30/M2 — patrz
                                 "G-Code Dialect + Start/End G-Code" w
                                 "Kluczowe decyzje projektowe" po pełny opis
    helix.ts / standardHole.ts   — generateHelix(params) /
                                 generateStandardHole(params) — publiczne
                                 funkcje `(WizardParams) => string[]`. Od
                                 `0.12.0` (`BL-14`): gdy
                                 `geometry.tabsEnabled`, przełączają się na
                                 płaskie przejścia z pominięciem łuków
                                 mostków w ostatnich `tabHeight` mm —
                                 `helixToolpath()` skraca spiralę dokładnie
                                 do góry tego pasma (druga, niezależna
                                 `computeDepthPasses()`), zastępując dawną
                                 pojedynczą "flat finishing pass";
                                 `standardHoleToolpath()` przełącza
                                 pojedyncze przejścia atomowo, bez
                                 przebudowy pętli. Patrz "Tabs (mostki) dla
                                 operacji Hole(s)" w "Kluczowe decyzje
                                 projektowe" po pełny opis, oraz `tabs.ts`
                                 niżej
    tabs.ts                      — `computeTabRanges()`/`tabbedCirclePass()`
                                 (`BL-14`, `0.12.0`) — cała nowa geometria
                                 mostków, współdzielona przez
                                 `helix.ts`/`standardHole.ts`. Kąty mostków
                                 wymuszone jako dokładne punkty łamania w
                                 przejściu (nie tylko próbkowanie co 5°) —
                                 patrz "Tabs..." w "Kluczowe decyzje
                                 projektowe" po pełny opis dwóch bugów
                                 złapanych w przeglądzie przed
                                 implementacją
    validation.ts                — isToolDiameterValid, isStepdownValid —
                                 blokują przycisk Generate na Kroku 4 i
                                 pokazują inline error w Kroku 2/3. Też:
                                 isCircleHoleCountValid (`BL-1`, `0.8.11`)
                                 — twardy limit, arbitralne 100, wyciszony
                                 poza trybem circle; isTabHeightValid/
                                 isTabWidthValid (`BL-14`, `0.12.0`) — ten
                                 sam wzorzec, wyciszone gdy tabsEnabled
                                 false; i (od `BL-9`):
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
    appearanceStorage.ts          — loadAppearanceSettings/
                                 saveAppearanceSettings (`BL-12`), osobny
                                 klucz `simplecam.appearance` — ten sam
                                 wzorzec co machineStorage.ts, plus walidacja
                                 zapisanego `palette` względem znanych
                                 `PaletteId` (fallback do `'default'` przy
                                 nieznanej/uszkodzonej wartości)
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
`METHOD_META[params.method].generate(params, machine)` to jedyne miejsce,
które powinno wołać silnik — nie importować `generateHelix`/
`generateStandardHole` bezpośrednio w komponentach UI. Analogicznie —
wszystko co zależy od wybranego patternu (Single/Grid/Grid Centered/
N-Holes Circle/Custom — ikona, tytuł/opis karty, etykieta presetu,
filename slug) idzie przez `POSITIONING_META`/pomocnicze funkcje w
`config/positioningMeta.ts` (patrz Etap 6), nie przez rozproszone
`switch (geometry.positioning)` w komponentach. Analogicznie — wszystkie
kolory podglądu 2D/3D (`BL-12`) idą przez `config/palettes.ts`
(`getFixedColors()`/`getPaletteAccents()`/`hexToThreeColor()`), nie przez
osobne stałe kolorów w `drawToolpath.ts`/`buildScene.ts`.

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
