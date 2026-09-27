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

Appka obsługuje dziś cztery operacje (`WizardParams.operation`):

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
- **Pocket** — kieszeniowanie (usuwanie materiału wewnątrz zamkniętego
  konturu). Rectangle Cornered/Centered i Circle. Dwie metody: Spiral i
  Adaptive.

Pełne uzasadnienie i historia każdej decyzji — łącznie z tym, jak
appka doszła do dzisiejszego stanu, wersja po wersji — żyje wyłącznie w
**`CHANGELOG.md`**; ten plik opisuje tylko to, co jest prawdą dziś.
Planowane rozszerzenia (Text/Font Tracing, Adaptive Clearing, i cała
reszta odłożonych pomysłów) — patrz **`ideas.md`**.

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
- **Dialekt G-code:** wspólny podzbiór GRBL/Marlin/Mach3. Realny wybór
  dialektu przez `MachineSettings.dialect` (`'grbl' | 'marlin' |
  'mach3'`, domyślnie `'grbl'`, Settings → Machine) rozstrzyga trzy
  rzeczy w `src/lib/program.ts`: preambułę (`modalPreamble()` — `G21 G90
  G17`, a dla GRBL/Mach3 dodatkowo druga linia `G91.1 G94 G40 G49`:
  przyrostowe I/J łuków, posuw na minutę, bez kompensacji promienia i
  długości narzędzia — Marlin żadnego z tych kodów nie implementuje, jego
  I/J są zawsze przyrostowe), wartość `G4 P` (sekundy dla GRBL/Mach3,
  ×1000 milisekund dla Marlina) oraz
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
  punkty `X,Y` wpisane ręcznie — surowy tekst textarea to
  `geometry.customPointsText`, źródło prawdy zapisywane w presetach;
  `customPoints` to zawsze zapisywana razem z nim lista samych poprawnie
  sparsowanych linii, czytana przez silnik/podglądy. Linia poprawna =
  dokładnie dwie skończone liczby rozdzielone `,`/`;`/spacją
  (`parseCustomPointsText()`, `lib/customPoints.ts`); każda inna linia
  to błąd z numerem linii i blokada Generate (`isCustomPointsValid()`,
  też pusta lista) — nigdy cichy otwór w `(0,0)`). Brak importu DXF/SVG (`BL-7` w
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
  stałe `M3` (CW): Outside → CW, Inside → CCW — w obu przypadkach
  zachowywany materiał jest po prawej stronie kierunku ruchu, czyli
  frezowanie współbieżne (climb), ta sama konwencja co każdy inny kontur
  w appce (Hole(s) i Pocket też tną CCW wewnątrz); On-line → CW (arbitralnie, brak znaczenia fizycznego przy
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
  passem; rapid w dół zatrzymuje się `UNIDIRECTIONAL_REENTRY_CLEARANCE`
  = 0.5 mm nad dnem poprzedniego poziomu, nie na nim, i nigdy powyżej
  Safe Z — `unidirectionalReentryZ()`, `lib/surface.ts`, reużyte przez
  podgląd 3D). Płaski rejestr `config/surfaceMethodMeta.ts` (jak
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
  (`toZ`) z `computeDepthPasses()`; wysokość, od której zaczyna się
  przejście Plunge/Helix danego poziomu, daje osobno `levelEntryZ()`
  (patrz niżej).
  **Przejście między poziomami Z** (poziom 0 zaczyna z `startZ` bez
  retraktu, jak pierwsze wejście w Hole(s)/Outline) — wspólny mechanizm
  dla obu metod, trzy kroki: **pełny retrakt na `Safe Z`** (na aktualnym
  XY — ta sama konwencja "powrót na Safe Z przed G0 do kolejnego
  punktu", co wszędzie indziej w appce), `G0` do rogu startowego (na
  wysokości Safe Z), **`G0` w dół do `levelEntryZ()`** — 0.5 mm
  (`LEVEL_REENTRY_CLEARANCE`) nad dnem poprzedniego poziomu, nigdy
  powyżej `Start Z` (obszar wejścia jest już wycięty poziom wyżej, więc
  zejście przez niego drugi raz cięłoby powietrze). Dopiero wtedy
  **Plunge** (prosty `G1 Z`) albo **Helix** (mini-spirala) wg toggle'a
  `ZTransitionMode` w Step 2 — zejście liczone od tej wysokości do `toZ`,
  nigdy od `Safe Z` bezpośrednio (helix przelatywałby przez pustą
  przestrzeń i nie trafiał dokładnie w docelową głębokość w punkcie
  startu rastra). Helix schodzi pod kątem z pola **Ramp Angle**
  (`surface.rampAngleDeg`, 0.5–30°, domyślnie 2°) — skok na obrót
  `helixPitchForRampAngle()` = `2π·r·tan(kąt)`, niezależnie od Stepdown
  (głęboki Stepdown z Feedrate Calculator nie robi z wejścia stromego
  zagłębienia). Helix reużywa wprost pełne obroty (łuk pełnego obrotu z
  `lib/toolpath.ts`) i `computeDepthPasses()` jak silnik Helix Hole(s), ale
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
  0`, sufit = stepover (mm); Ramp Angle pod spodem
  (`isSurfaceRampAngleValid()`, limit obrotów na poziom
  `isSurfaceEntryHelixWithinLimit()`). Mini-helix reużywa istniejący toggle
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
  cała trasa narzędzia narysowana wprost z listy ruchów silnika
  (`buildSurfaceToolpath()`, `lib/surface.ts` — patrz "Wspólna lista
  ruchów" niżej);
  brak osobnego stock-cap-z-otworem (`buildStockCapObject()` zwraca
  `null` dla Surface — blok "pozostałego materiału" już jest tą
  wizualizacją).
- **Pocket — kieszeniowanie, tylko roughing w v1:** rozstrzygnięcia sesji
  `/grill-me` (2026-09-21). **Dwie metody** (`PocketMethodType`:
  `'spiral' | 'adaptive'`, płaski rejestr `config/pocketMethodMeta.ts` jak
  `SURFACE_METHOD_META`; Adaptive — osobny punkt niżej), obie dla każdego
  kształtu (Rectangle Cornered/Centered i Circle) — bez bramkowania metody
  po kształcie. Brak metody rastrowej: pierwsza linia każdego rastra to
  szczelina pełną szerokością freza, a Spiral/Adaptive kontrolują
  zaangażowanie (`BL-73`); zapisane presety z dawnym `'raster'` nie
  przechodzą strażnika enuma w `mergeSection()` i wczytują się z domyślną
  metodą (Spiral).

  **Kierunek czyszczenia:** zawsze inside-out (środek → ściana), zawsze
  CCW, czyli pod `M3` frezowanie współbieżne (climb — nieobrobiony
  materiał po prawej stronie ruchu) — Pocket nie ma pojęcia offset mode
  jak Outline, to zawsze cięcie od wewnątrz. **Wejście** zawsze w
  **centrum kieszeni** (`pocketCenter()`, ten sam origin-convention co
  `rectCorners()` — Cornered: origin w lewym dolnym rogu, Centered:
  wyśrodkowany), przez `ZTransitionMode` (Plunge/Helix,
  `lib/pocketZTransition.ts::pocketZTransitionMoves()`) — wyśrodkowana
  wersja mechanizmu Surface'a (`surfaceZTransition.ts`), prostsza niż
  jego narożnikowy `helixCenterFor`/`helixDirectionFor` (brak stycznej
  do wyprowadzania — okrąg wyśrodkowany na kieszeni nie ma
  uprzywilejowanego kierunku wyjścia, bo pierwszy pierścień i tak zaczyna własnym, niezależnym punktem odniesienia).
  Helix Radius ≤ promień freza (i ≤ ściana kieszeni): spirala wycina
  pierścień `r − R`…`r + R` wokół środka, więc większy promień zostawiłby
  w środku niewycięty słupek, którego pierścienie Spiral/Adaptive (rosnące
  od `r` na zewnątrz) już nie zbierają.
  Helix schodzi pod kątem z pola **Ramp Angle** (`pocket.rampAngleDeg`,
  wspólne dla wszystkich metod — widoczne przy każdym wejściu Helix,
  `helixPitchForRampAngle()`), nie o cały Stepdown na obrót.
  Pozycjonowanie XY przed zejściem (`pocketEntryPoint()`): środek
  kieszeni dla Plunge, ale **punkt startowy spirali** `(centerX +
  helixRadius, centerY)` dla Helix — pierwszy łuk G2/G3 musi zaczynać
  się na własnym okręgu (inaczej GRBL error 33). Tryb
  Helix kończy się **płaskim przejazdem czyszczącym** na promieniu
  `helixRadius`, dokładnie na `toZ` (mirror `helix.ts`'s Hole(s) Helix
  "flat finishing pass") — spiralne rampowanie w dół zostawia śrubową,
  nie płaską, powierzchnię (tylko jeden punkt obrotu faktycznie trafia
  w `toZ`), a to, co następuje potem (pierwszy ramp pierścienia), przechodzi przez ten promień tylko przelotnie
  blisko własnego punktu startowego — bez tego przejazdu większość
  obwodu wejścia Helix zostawałaby nietknięta na docelowej głębokości.
  Wychwycone sesją weryfikacji wizualnej użytkownika (2026-09-21, bez
  dostępu do maszyny), naprawione w tej samej, jeszcze
  niescommitowanej turze co reszta OP-2.

  **Geometria Spiral (`lib/pocketSpiral.ts`):** każdy pierścień to
  **ramp + pełny flat obrót**. Flat — pełny, domknięty obrót na
  docelowym rozmiarze, gwarantujący kompletną ścianę pierścienia,
  spójnie z tym, że wszystko inne w silniku (Standard Hole, Helix
  cleanup przy tabsach, `pocketZTransitionMoves()`'s finishing pass
  niżej) zawsze generuje pełne 360°, nigdy częściowe — **nigdy nie
  pomijany, niezależnie od kąta rampy** (patrz niżej), bo ramp dotyka
  promienia docelowego tylko w jednym punkcie, nigdy na całym obwodzie.

  Ramp dla **Circle** — kąt **wyliczany per pierścień**
  (`rampSweepDegFor()`), nie stała (poprzednia wersja, stała 90°,
  okazała się błędna sesją weryfikacji wizualnej, 2026-09-21: przy
  stałym kącie długość łuku rośnie z promieniem, a Δr rampu zostaje
  ~stały, więc promieniowe zaangażowanie freza na jednostkę przebytego
  łuku skaluje się jak 1/promień — agresywnie blisko środka,
  niepotrzebnie długo przy ścianie). Zamiast kąta, stała jest **długość
  łuku** rampy — `RAMP_LENGTH_FACTOR = 3` (niekonfigurowalna, `BL-41`
  gdyby miała stać się polem UI) razy Δr tej konkretnej transycji
  (`radiusTo - radiusFrom`, nie zakładany stepover — pierwszy/ostatni
  pierścień mogą mieć inny Δr), podzielona przez średni promień
  transycji (`(radiusFrom+radiusTo)/2` — dla pierwszego pierścienia,
  `radiusFrom=0`, to dodatkowo obniża efektywny promień, żądając
  jeszcze łagodniejszego/dłuższego rampu tam, gdzie krzywizna jest
  najostrzejsza). Wynik: `Δr / długość_łuku = 1/RAMP_LENGTH_FACTOR`,
  stałe na każdym promieniu. Sufit 360° w kodzie jest defensywny, nie
  realnie osiągalny przy `RAMP_LENGTH_FACTOR=3` — najgorszy fizycznie
  możliwy przypadek (`radiusFrom=0`) daje zawsze dokładnie `2 ×
  RAMP_LENGTH_FACTOR` radianów (~343.8° przy 3), niezależnie od
  `radiusTo`, poniżej pełnego obrotu. Ramp to G1-owa aproksymacja
  spirali (promień rośnie liniowo przez wyliczony kąt — dialekt
  G-code, wspólny podzbiór GRBL/Marlin/Mach3, nie wspiera natywnego
  G2/G3 ze zmiennym promieniem, więc ramp zawsze emituje G1
  niezależnie od przełącznika interpolacji, z gęstością 5°/segment jak
  wszędzie indziej, ale liczbą segmentów skalowaną do rzeczywistego
  kąta), potem pełny obrót (łuk pełnego obrotu na liście ruchów)
  (respektuje przełącznik G2/G3 vs G1 jak wszędzie indziej). Kąt
  startowy kolejnego rampu to zawsze `poprzedni + rampSweepDegFor(...)
  tej transycji`, bez zawijania do 0 — pierścienie faktycznie
  spiralnie "obracają się" wokół siebie.

  Ramp dla **Rectangle** — ten sam mechanizm co Circle, przeniesiony z
  promienia na obwód prostokąta (sesja weryfikacji wizualnej,
  2026-09-22 — poprzednia wersja, pojedynczy prosty odcinek G1 z
  narożnika do narożnika, okazała się dokładnie tym samym błędem co
  Circle sprzed `RAMP_LENGTH_FACTOR`: cały skok Δ (stepover) pokonywany
  w jednym, krótkim ruchu na pełnej głębokości — 100% zaangażowania
  natychmiast, niezależnie czy po przekątnej, czy rozbity na dwa
  odcinki jednoosiowe). Zamiast kąta na okręgu, `fraction` (0–1,
  `rectPointAtPerimeterFraction()`) lokalizuje punkt na obwodzie
  prostokąta (halfWidth, halfHeight) — CCW od lewego-dolnego narożnika,
  każdy z 4 boków to dokładnie 0.25 pętli niezależnie od proporcji
  boków (przybliżenie, ta sama rzetelność co liniowa interpolacja
  promień/kąt w Circle — nie fizycznie dokładna parametryzacja).
  `rectRampSweepFor()` — bezpośredni odpowiednik `rampSweepDegFor()`:
  `deltaK = √(ΔhalfWidth² + ΔhalfHeight²)` zamiast Δr, `avgPerimeter`
  (obwód, nie promień) zamiast `avgRadius`, ta sama stała
  `RAMP_LENGTH_FACTOR` (reużyta wprost z Circle, nie duplikat), wynik
  jako **ułamek 0–1** pełnej pętli (Circle zwraca stopnie — Rectangle
  nie ma naturalnych "stopni", ułamek trafia bezpośrednio do
  `rampSegmentCountFor(sweep × 360)`, reużytego bez zmian). Sufit **1**
  (pełna pętla) jest tu realnie osiągalny (w odróżnieniu od Circle) —
  kwadratowy wzrost od zera (pierwszy pierścień, wejście Plunge) daje
  zawsze ułamek tuż powyżej 100%, niezależnie od rozmiaru pierścienia
  (patrz `pocketSpiral.test.ts`).

  `rectRingRampPoints()` interpoluje `(halfWidth, halfHeight, fraction)`
  razem, liniowo, przez wyliczoną liczbę segmentów — halfWidth/halfHeight
  rosną **stopniowo** w trakcie ruchu wzdłuż obwodu, nie skokiem na
  końcu. Kluczowa konsekwencja: ramp **nie kończy się już w narożniku**
  nowego pierścienia — kończy się tam, gdzie wylądował ułamek (czasem w
  połowie boku) — więc pełny obrót pierścienia (`rectFullLapPoints()`)
  **też przestaje zawsze zaczynać się w lewym-dolnym rogu**: startuje
  dokładnie tam, gdzie skończył ramp, okrąża pozostałe narożniki w
  kolejności CCW i domyka się z powrotem do tego samego (niekoniecznie
  narożnikowego) punktu. `fraction` startowy kolejnego rampu to zawsze
  `poprzedni + rectRampSweepFor(...)`, bez zawijania — dokładnie ten sam
  wzorzec "nigdy nie resetuj się do 0" co kąt w Circle.

  **Bootstrap Z-entry, bez specjalnych przypadków:** Plunge wchodzi jako
  degenerate `{halfWidth: 0, halfHeight: 0}` przy `fraction=0` (każdy
  ułamek zwija się do środka kieszeni — naturalny przypadek brzegowy
  `rectPointAtPerimeterFraction()`). Helix wchodzi jako kwadrat
  `{halfWidth: helixRadius, halfHeight: helixRadius}` przy
  `fraction=RECT_HELIX_ENTRY_FRACTION` (stała `0.375`) — środek prawego
  boku tego kwadratu wypada dokładnie w `(centerX+helixRadius,
  centerY)`, czyli dokładnie tam, gdzie kończy się płaski przejazd
  czyszczący Helixa (ten sam punkt, kąt 0, co circle'owy odpowiednik).
  Dzięki temu `rectRingMoves()` obsługuje pierwszy pierścień dokładnie
  tak samo jak każdy kolejny — brak osobnej gałęzi bootstrap w
  `pocket.ts` ani w żadnym z podglądów. Przy wejściu Helix
  `pocketRectRingDims(…, helixRadius)` pomija pierścienie, których
  wszystkie pozycje środka freza (także narożniki, `hypot(halfWidth,
  halfHeight)`) mieszczą się w promieniu helixa — leżą w całości w
  otworze, który helix już wyciął (odpowiednik startu
  `pocketCircleRingRadii()` od `helixRadius` w Circle).

  Dla `width ≠ height` pierścienie rosną **per-oś**, ze wspólnego kroku
  (`computeLinePositions()` reużyty wprost z `surfaceRaster.ts`, liczony
  na dłuższej z dwóch połówek wymiaru) — oś, która pierwsza osiągnie
  swój cel, przestaje rosnąć i zostaje zaciśnięta (`Math.min`), druga
  rośnie dalej. Mechanizm gradual-rampu obejmuje **każde** przejście
  jednolicie, także ten "stan ustalony" wydłużonej kieszeni (bez
  osobnej gałęzi/uproszczenia do prostego ruchu jednoosiowego, jak w
  poprzedniej wersji) — nawet wtedy pełny skok Δ rozkłada się na
  dłuższym torze zamiast jednego krótkiego ruchu.
  Degenerate leading `(0,0)` (zawsze pierwszy element
  `computeLinePositions(0, max, ...)`) jest odrzucany — to nie
  prawdziwy pierścień do wycięcia, tylko punkt środka.

  **Głębokość:** per-poziom pełny XY clear, 1:1 reużycie
  `buildLevelDescents()` z Surface'a — między poziomami pełny retrakt na
  `Safe Z`, reposition nad punkt wejścia i `G0` do `levelEntryZ()` (0.5
  mm nad dnem poprzedniego poziomu); poziom 0 zaczyna od `Start Z`.

  **Roughing-only w v1** (`BL-42` dla finishing passa/stock-to-leave) —
  zewnętrzny pierścień (Spiral) JEST ścianą, bez
  osobnego, dokładnego przejazdu wykończeniowego. **Bez Tabs** — jak
  Surface, Pocket nie przewierca na wylot, nic do przytrzymania
  mostkiem. **Stepover** — identyczny mechanizm co Surface
  (`stepoverPercent` + `pocketStepoverMm()`, pole mm tylko-do-odczytu).
  **Adaptive Clearing** (alternatywna strategia roughingu ze stałym
  zaangażowaniem narzędzia) świadomie odłożone jako `OP-5`.

  **Preview 2D** (`drawToolpath.ts::drawPocketGeometry()` →
  `drawToolpathMoves()`) i **Preview 3D** (`toolpathLines3D()`) rysują
  każdą metodę wprost z listy ruchów silnika (`buildPocketToolpath()`,
  `lib/pocket.ts` — patrz `lib/toolpath.ts`): wejście Helix/Plunge,
  rampy i pełne pierścienie Spiral, przejazdy Adaptive —
  dokładnie to, co trafia do G-code, bez osobnego odtwarzania pętli. 2D
  dokłada znacznik punktu wejścia. Wizualizacja bryły 3D reużywa wprost modelu
  Outline Inside (otwarta ściana — `DoubleSide`, brak nakrywek — + stock
  cap z otworem w kształcie granicy zewnętrznej, ten sam
  `buildRectWallMesh()`/`circlePath()`/`rectPath()`) — Pocket fizycznie
  jest dokładnie tym samym zjawiskiem co Outline Inside (pustka
  wewnątrz zachowanego materiału), nie ma własnego modelu bryły jak
  Surface.
- **Pocket Adaptive — stałe zaangażowanie narzędzia, liczone
  analitycznie** (sesja `/grill-me` `OP-5`, 2026-09-25). Bez symulacji
  materiału (pełne adaptive w stylu Fusion/FreeCAD ma sens dopiero dla
  dowolnych konturów, których appka nie ma) — cała geometria to wzory
  zamknięte + bisekcja, `lib/pocketAdaptive.ts` (ścieżka) i
  `lib/pocketAdaptiveMath.ts` (matematyka). Dla Circle i Rectangle.

  **Parametr:** Optimal Load w **% średnicy** (źródło prawdy,
  `optimalLoadPercent`, 1–30%, domyślnie 10%) ↔ **mm** — oba pola
  edytowalne, wzajemnie przeliczane (`useNumberField(…, { syncWhenBlurred:
  true })`), zmiana freza przelicza mm, % zostaje. Kąt zaangażowania
  `θ* = arccos(1 − 2·%/100)` tylko do odczytu (to na nim pracuje
  algorytm, z Hint Button wyjaśniającym pojęcie). Etykiety skrócone do
  "Opt. Load [%]"/"Opt. Load [mm]" — trzy pola w jednym wierszu. Obok
  podpowiedź **chip thinning** (`chipThinningFactor() = 1/sin θ*` +
  sugerowany Feed XY, `chipThinnedFeed()`) z przyciskiem **Apply** —
  wpisuje sugerowany Feed XY do Kroku 3 bez przełączania kroku i bez
  zabierania fokusu; bez kliknięcia appka nigdy sama nie zmienia posuwu.
  Apply zapamiętuje posuw bazowy (`pocket.chipThinningBaseFeed`), żeby
  kolejna sugestia liczyła się od niego, a nie od już skompensowanej
  wartości (inaczej mnożyłaby się przy każdym kliknięciu); zmiana Optimal
  Load bazę zachowuje, ręczna edycja Feed XY w Kroku 3 ją kasuje (nowy
  świadomy wybór). Gdy Feed XY mieści się w ±5%
  (`CHIP_THINNING_TOLERANCE`) od `baza × mnożnik`, Krok 3 pokazuje przy
  etykiecie Feedrate XY adnotację "(chip thinning applied)"
  (`FieldRow`'s `annotation`), a Krok 2 zamiast Apply informuje, że posuw
  jest już skompensowany.

  **Wejście zawsze Helix** (`effectivePocketZTransitionMode()` zwraca
  `'helix'` dla Adaptive; toggle Z-Transition wyszarzony z wyjaśnieniem,
  zapisany `zTransitionMode` nietknięty — wzorzec Tabs→G1): pierścienie o
  stałym zaangażowaniu nie mogą wyrosnąć z otworu o średnicy freza
  (rekurencja daje z promienia 0 znowu 0). Skok spirali z pola
  **Ramp Angle** (`rampAngleDeg`, 0.5–30°, domyślnie 2°, to samo pole co
  wejście Helix w Spiral) — `2π·r·tan(kąt)`, niezależnie od
  Stepdown. Helix Radius — istniejące pole (sufit = promień
  freza, jak dla każdego Helixa w Pocket — patrz walidacja) +
  nieblokująca podpowiedź, gdy < 25% D.

  **Trzy fazy na każdym poziomie Z:**
  - **A — okręgi** wokół środka od `helixRadius` do krótszego wymiaru
    ściany (dla Circle — do ściany; to całe czyszczenie). Odstęp z
    `nextConstantEngagementRadius()` (odwrócone prawo cosinusów, gęsto
    przy środku, ku ścianie → `R(1 − cos θ)`), liczony dla `0.8·θ*`;
    spiralny ramp między okręgami (G1, 2°/odcinek) dokładnie tak długi, żeby
    jego odchylenie na zewnątrz dołożyło ≤ `0.2·θ*`. Pełny obrót po każdym
    rampie (respektuje G2/G3 vs G1).
  - **B — wydłużanie** (tylko prostokąt niekwadratowy): okrąg z fazy A
    rozciągany wzdłuż dłuższej osi półłukami o promieniu = krótszy wymiar,
    **każdy koniec osobno**. Krok: cięcie wzdłuż ściany startowej → półłuk →
    przejazd łączący z powrotem w poprzek wyciętego koła.
  - **C — narożniki**, **każdy osobno**, ćwierćłuki o malejącym promieniu
    aż do ostrego narożnika ścieżki narzędzia (kieszeń identyczna jak z
    Spiral), na końcu jeden prosty ruch w sam narożnik. Narożniki w
    kolejności obrotu zgodnej z kierunkiem cięcia, żeby przejazd między
    nimi zawsze biegł po już wyciętej ścianie. Kwadrat = A + C.

  Kroki faz B i C dobiera `largestStepWithin()` (bisekcja) tak, żeby
  **zaangażowanie wzdłuż całego łuku** (`maxArcEngagement()`: kąt z
  prawa cosinusów względem poprzedniej granicy + odchylenie kierunku ruchu
  od jej środka) nie przekroczyło `θ*` — sam wierzchołek łuku to za mało,
  przy przesuniętych środkach maksimum leży na początku łuku. Kroki są
  identyczne na każdym poziomie i dla wszystkich narożników — liczone raz
  na ścieżkę. Model trzyma `θ*` z dokładnością do ~2–3° względem dokładnej
  symulacji (siatka 0.002 mm, najgorszy narożnik); w trybie G1 łamana
  łuków dodaje do ½ kąta odcinka.

  **Kierunek:** toggle Climb/Conventional (`cutDirection`, domyślnie
  Climb = CCW jak reszta Pocket; Conventional = CW — pod `M3` wewnątrz
  kieszeni CCW ma nieobrobiony materiał po prawej, czyli współbieżne),
  jednolity we wszystkich fazach i w helixie. **Przejazdy łączące** (powroty po łukach, między końcami i
  narożnikami, do środka przed kolejnym poziomem) — zawsze G1 z polem
  **Linking Feed** (`linkingFeed`, Krok 3 obok Feedrate XY, widoczne tylko
  dla Pocket + Adaptive), nigdy G0 poniżej Safe Z. **Głębokość:** globalny
  Stepdown + nieblokująca podpowiedź, gdy < 1×D (głębokie, lekkie
  przejścia to główna korzyść Adaptive), z przyciskiem **Apply**
  ustawiającym Stepdown na 1.5×D (`suggestedAdaptiveStepdown()`). **Bez retraktu między poziomami**
  — kieszeń jest pusta na poprzedniej głębokości, więc powrót do startu
  helixa na Linking Feed i helix tylko nowego Stepdown; retrakt na Safe Z
  dopiero na końcu (`assembleProgram()`). **Ściany:** bez przejazdu
  wykończeniowego — drobne ząbki między punktami styczności łuków zostają
  (`BL-42`).

  **Jedna lista ruchów** (`buildAdaptiveToolpath()` → lista ruchów
  `lib/toolpath.ts`: linia/łuk × `'cut' | 'link'`) — konsumowana przez silnik
  (`generatePocketAdaptive()` w `lib/pocket.ts` — Adaptive ma własną
  strukturę poziomów, `buildPocketToolpath()` dokłada tylko dojazd do
  Start Z) i oba podglądy
  (`adaptiveMovePoints()`), więc nie ma ręcznego "mirrorowania" geometrii
  jak w starszych metodach. Przejazdy łączące rysowane **kropkowaną linią
  w kolorze `linking`** palety (2D i 3D). Testy (`pocketAdaptive.test.ts`):
  granica zaangażowania odtworzona niezależnie z samych wyemitowanych
  ruchów, pełne pokrycie kieszeni i brak wyjazdu za ścianę przez
  symulację siatki (`pocketAdaptiveSim.ts`, tylko testy), spójność łuków
  G2/G3 (`gcodeTestUtils.ts`).
- **Ruch między otworami:** powrót na `Safe Z` przed `G0` do kolejnego
  punktu XY.
- **Wrzeciono:** tylko `M3` (bez `M4`). Obroty (`S`) i czas rozpędzenia
  (`G4 P`, 0 = bez dwell) to `MachineSettings.spindleSpeed`/
  `dwellSeconds` (Settings → Machine, globalne, nie per preset) —
  emitowane tylko, gdy w Kroku 4 zaznaczono start wrzeciona.
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
  Method+Raster Direction, Pocket Method+Direction (Adaptive; tu
  Method ma szerokość własnych przycisków, `shrink-0`, a drugi toggle
  zaczyna się po wyraźnym odstępie w tej samej linii; Direction jako "Conv."/"Climb", pełne
  nazwy w tooltipie), Pocket
  Optimal Load %/mm/Engagement (Adaptive), Surface Z-Transition Mode+Helix Radius (drugie
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
G-Code Dialect (Drop-down, zapis natychmiastowy), Spindle Speed [RPM] z
Min RPM / Max RPM w tym samym wierszu, Spin-up Dwell [s], Max Feed
[mm/min] i Rigidity (Drop-down Light/Medium/Rigid, zapis natychmiastowy)
— liczby tym samym wzorcem `onBlur` co travel (dwell i Min RPM mogą być 0,
Min RPM < Max RPM; przy Marlinie podpowiedź, że `S` bywa PWM 0–255). Min/
Max RPM, Max Feed i Rigidity czyta wyłącznie Feedrate Calculator (patrz
niżej), nigdy silnik G-code; domyślnie `0`/`60000`/`50000`/Light, czyli
bez realnego limitu. Router (speed dial) — Drop-down routerów z ręcznym
pokrętłem (`config/routers.ts`, `machine.router`, domyślnie brak); wybór
ustawia Min/Max RPM na zakres pokrętła, pod spodem lista pozycji. Start G-Code / End
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

### Feedrate Calculator

Icon Button z `CalculatorIcon` na końcu wiersza Feedrate XY w Kroku 3
(każda operacja) otwiera `FeedCalculatorModal` (wzorzec Settings Modal:
`backdrop-blur-sm`, `renderPaused` podglądu 3D, `useModalFocus()`). Dwie
kolumny: **wejścia** — Method (lista `OPERATION_META.calcMethods()`, ta sama
co w Kroku 2 dla bieżącego kształtu), materiał (`config/materials.ts`, 10
wpisów z krótką notą), średnica freza (edytowalna), liczba ostrzy,
Carbide/HSS, fz (z tabeli × sztywność albo wpisane ręcznie, „Use table”
wraca do tabeli), plus podsumowanie limitów z Settings → Machine tylko do
odczytu; **wyniki** — tabela „bieżąca → sugerowana” z checkboxem przy
każdym wierszu (domyślnie wszystkie zaznaczone): Spindle Speed (z adnotacją,
że jest globalne), Feedrate XY, Plunge Rate, Stepdown, Stepover % albo
Optimal Load % (brak dla szczeliny), Linking Feed (tylko Adaptive).
Pod spodem ostrzeżenia (RPM docięty do zakresu wrzeciona, RPM obniżony dla
Max Feed, posuw docięty do Max Feed ze spadkiem fz) i rozwijane „How it's
calculated” z wartościami pośrednimi. Wszystko liczone na żywo.

**Model** (`lib/feedCalc.ts`, czyste funkcje, `computeFeeds()`): RPM =
środek zakresu Vc materiału (HSS × 0.4) × 1000 / (π·D), zaokrąglony do 100
i docięty do [Min RPM, Max RPM]; fz = tabela 3/6/8+ mm (liniowo pomiędzy,
proporcjonalnie poniżej 3 mm, stałe powyżej 8 mm) × sztywność (Light 0.75 /
Medium 1 / Rigid 1.25), chyba że wpisane; chip thinning `1/sin θ`
(`chipThinningFactor()` z `pocketAdaptiveMath.ts`) tylko dla szerokości
< 50% D, dla szczeliny 1; Feed = RPM × z × fz × chip thinning. Powyżej Max
Feed — gdy sugerowany RPM jest przyjmowany — najpierw RPM w dół (nie
poniżej Min RPM), żeby utrzymać fz; co nadal za dużo, zostaje docięte do Max Feed.
Plunge = posuw bez chip thinning × współczynnik materiału; Stepdown = D ×
`ap` (szczelina / stepover / Adaptive) × sztywność (dla Adaptive bez
sztywności — wąskie skrawanie samo pozwala na głębokość, a fz już jest
skalowane), siatka 0.05 mm; Linking
Feed = 2 × Feed (≤ Max Feed). RPM, dla którego liczony jest posuw, to
sugerowany, gdy jego checkbox jest zaznaczony, inaczej bieżący z Settings;
szerokość do chip thinning analogicznie (sugerowana albo bieżąca).

**Rodzaj zaangażowania** daje `OPERATION_RULES[op].engagement(params)`
(`lib/validation.ts`): Hole(s) i Outline — szczelina (ae = D), Surface i
Pocket Spiral — stepover %, Pocket Adaptive — Optimal Load %. Modal
liczy go na parametrach z podmienioną metodą i średnicą
(`OPERATION_META[op].withCalc()`).

**Apply selected** (`handleApplyFeedCalc()`, `App.tsx`): metoda i średnica
trafiają do sekcji operacji zawsze (to kontekst wyliczenia — modal pokazuje,
co się zmieni), szerokość/Linking Feed przez `withCalc()`, posuwy i Stepdown
do `feeds`, a zaznaczony RPM nadpisuje globalne `machine.spindleSpeed`.
Dla Adaptive zapis Feed XY ustawia też `pocket.chipThinningBaseFeed` na
posuw bez kompensacji — Apply chip thinning w Kroku 2 i adnotacja w Kroku 3
rozpoznają posuw jako już skompensowany. Istniejące Apply (chip thinning,
Stepdown 1.5×D) zostają. Po zapisie Kroki 2 i 3 przemontowują się (ten sam
`paramsLoadGeneration` co przy wczytaniu presetu).

**Router z pokrętłem** (`machine.router`): router ignoruje `S`, więc modal
pokazuje pod Spindle Speed pozycje pokrętła tylko do odczytu (najbliższa
RPM, dla którego liczony jest posuw, wyróżniona — `nearestDialPosition()`),
a wiersz RPM mówi, którą pozycję ustawić. Tabele w `config/routers.ts`:
Makita z instrukcji, pozostałe (`approximate`) — równomiernie w
publikowanym zakresie. Pod „How it's calculated” rozwijana **Material
table** — cała tabela materiałów do wglądu, bieżący wyróżniony.

**Pamięć** (`lib/feedCalcStorage.ts`, klucz `simplecam.feedCalc`):
materiał, liczba ostrzy (całkowita 1–6), Carbide/HSS — globalna, nie per
preset; wpisane fz nie jest pamiętane i zeruje się przy zmianie materiału.
**Krok 2** ma obok Tool Diameter (każda operacja, `ToolChipLoad.tsx`)
edytowalne pole Flutes — ta sama wartość z tej pamięci co w modalu, zmiana
w jednym miejscu zmienia oba; zapisywana tylko liczba całkowita 1–6, inna
wartość pokazuje błąd pod wierszem (nie blokuje Generate) — oraz
rzeczywiste fz tylko do odczytu, liczone na żywo (`effectiveChipLoad()`: Feed XY ÷ (Spindle Speed × z), ÷ chip thinning
dla szerokości < 50% D).

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
renderze). Bez zaznaczonych slotów zwraca zawsze tę samą zamrożoną pustą
tablicę — oba podglądy traktują nową referencję `overlayParams` jako
zmianę selekcji overlaya (re-frame kamery), a live-save w Edit Mode
podmienia `presetSlots` przy każdej edycji.

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
zmienia tylko kolory "akcentowe" — `toolpath`/`rapid`/`hole`/`grid`/
`linking` (2D i 3D; `linking` — przejazdy łączące Pocket Adaptive, odcień
wyraźnie inny niż `toolpath` tej samej palety, nigdy bursztyn zarezerwowany
dla wektora offsetu) — nie rusza osi X/Y, origin, wektora offsetu ani **tła** podglądu
(`background`), bo to konwencja CNC/semantyczna i, dla tła, własność
Theme, nie Palety. 4 palety: **Default** (natywny wygląd aktywnego
Theme — jedyna, która różni się per Theme), **Ocean**, **Ember**,
**Violet** (theme-independent, te same wartości niezależnie od
wybranego Theme). `getFixedColors(themeId, isDark)` (osie/origin/
offset/tekst/**tło** — jeden zestaw per Theme, wspólny dla każdej
Palety) i `getPaletteAccents(paletteId, isDark, themeId)`
(grid/toolpath/rapid/hole/linking — `Default` czyta `DEFAULT_ACCENTS[themeId]`,
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
(pierwszy ruch listy ruchów silnika) jest tym niedotknięty — to osobny, realny odcinek
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

### Styl linii ruchu narzędzia w 3D Preview

Wszystkie linie reprezentujące ruch narzędzia — cięcie, ruch szybki
(G0), nieskrawający pionowy ruch G1 — dzielą **jeden wspólny kolor**
(`theme.toolpath`); nie ma osobnego koloru "rapid" w 3D (2D Preview ma
swój własny, niezależny — `drawToolpath.ts` — bez zmian). Rozróżnienie
idzie wyłącznie przez **styl linii** (`ToolpathLineStyle` w
`buildScene.ts`):

- **`solid`** — realne skrawanie: pełne okręgi/spirale/łuki Helixa,
  linie rastra Surface, ramp Outline.
- **`dashed`** — prawdziwy ruch szybki G0: przejazd między otworami,
  najazd Safe Z → Start Z i retrakt (z listy ruchów silnika), retrakt/
  reposition między poziomami i (Unidirectional) między liniami rastra
  Surface.
- **`dotted`** — nieskrawający, pionowy ruch G1: krok w dół między
  pełnymi przejściami Standard Hole/Outline (i tabbowana faza Helixa/
  Rampu, gdy przechodzą na płaskie przejścia), tryb Plunge przejścia Z
  Surface, ostatni odcinek plunge'a reentry Unidirectional (BL-35).
- **`linking`** — przejazdy łączące Pocket Adaptive (G1 przez już
  wycięty obszar): kropkowane jak `dotted`, ale jako jedyny styl we
  **własnym kolorze** — akcencie `linking` palety, nie `theme.toolpath`.

Trzy różne style na tym, co koncepcyjnie jest "jedną ścieżką", wymagają
**wielu osobnych obiektów `THREE.Line`** — `LineDashedMaterial` ma jeden
wzór kreski na całą długość linii (liczony od jej własnej skumulowanej
odległości, `computeLineDistances()`), więc nie da się zmieszać stylów
w jednym obiekcie. `createSegmentBuilder3D()` akumuluje kolejne odcinki
(każdy dzieli wspólny punkt graniczny z poprzednim — brak przerwy
wizualnej), `buildToolpathLines3D()` zamienia je na rzeczywiste
`THREE.Line` (pomijając zdegenerowane odcinki < 2 punktów).
Każda operacja buduje wspólną listę ruchów, a ścieżkę narzędzia rysuje
`toolpathLines3D()` — styl wynika wprost z rodzaju ruchu (`MOVE_STYLE`:
`cut` → `solid`, `rapid` → `dashed`, `plunge` → `dotted`, `link` →
`linking`), a kolejne ruchy tego samego stylu dzielą jeden `THREE.Line`.

Przed tą zmianą: rapidy miały osobny kolor (`theme.rapid`) i były już
kreskowane, ale nieskrawający ruch G1 (krok Standard Hole, Plunge
Surface) był po prostu wtopiony w tę samą pełną linię co realne
skrawanie — nierozróżnialny wzrokowo. Surface był najgorszym
przypadkiem: jego ówczesne lustro silnika w podglądzie świadomie sklejało nawet
retrakt/reposition (prawdziwe G0) w jedną ciągłą linię razem z
cięciem — dosłownie żadnego wskazania, że tam jest ruch szybki, nie
skrawanie.

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
origin/osie zostają zawsze widoczne niezależnie od niego. **Drugi,
szybszy dostęp do tego samego pola** (`BL-38`): przycisk "Hide/Show
Grid Labels" w lewym górnym rogu 3D Preview, w tym samym rzędzie co
"Hide Stock"/"Hide Toolpath" (`BL-36`) — w odróżnieniu od tamtych
dwóch (lokalny, sesyjny stan widoku) ten przycisk czyta/zapisuje
wprost `appearance.grid3DLabelsEnabled` przez ten sam
`handleSaveAppearance`, co checkbox w Settings — jedno źródło prawdy,
zawsze zgodne, trwałe w `localStorage`. Tylko 3D — 2D Preview ma
etykiety stałego rozmiaru, nieskonfigurowalne, bez odpowiednika.

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
pole/końcową kropkę), nie bramkuje aktualizacji Preview. Opcja
`{ syncWhenBlurred: true }` — dla pary pól pokazujących tę samą wielkość w
różnych jednostkach (Optimal Load % ↔ mm w Pocket Adaptive): tekst pola
bez fokusu nadąża za wartością zmienianą przez drugie pole; domyślnie
wyłączona, każde inne pole zmienia się wyłącznie samo. Stosowane do
wszystkich pól liczbowych Kroków 2 i 3. Ponieważ tekst pola nie śledzi
wartości z zewnątrz, wczytanie presetu (`handleLoadPreset`/
`handlePresetSlotClick`) podbija licznik `paramsLoadGeneration` w
`App.tsx`, używany jako `key` komponentów Kroku 2 i 3 — otwarty krok
przemontowuje się i pokazuje wartości nowego presetu. Pola liczbowe w
Settings Modal używają osobnego wzorca (bufor tekstu + commit wyłącznie
`onBlur`, bo to zapis do `localStorage`, nie live Preview) — ich
`onChange` zapisuje surowy string wprost, bez przechodzenia przez
`Number()` przed wyświetleniem. Bufory (także Start/End G-Code) są
ponownie inicjowane z `machine`, gdy obiekt zostanie podmieniony z
zewnątrz (np. "Reset All Settings" przy otwartym modalu) — wzorzec
"adjust state while rendering", nie efekt.

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
`computeTabRanges()`/`appendTabbedCirclePass()` (`src/lib/tabs.ts`,
Hole(s) i Outline Circle) i `computeRectTabRanges()`/`appendTabbedRectanglePass()`
(`src/lib/outlineRectangleTabs.ts`, Outline Rectangle, per bok) liczą
listę kątów/pozycji jako **sumę** równomiernego próbkowania **i**
dokładnych granic każdego mostka wymuszonych jako punkty łamania —
gwarantuje dokładny rozmiar każdego mostka niezależnie od rozdzielczości
próbkowania.

Wymusza interpolację G1 dla całego programu (patrz wyżej).
Walidacja (`src/lib/validation.ts`): `isTabHeightValid()` — `0 <
tabHeight < totalDepth`; `isTabWidthValid()` — `tabCount × tabWidth <`
obwód ścieżki narzędzia; `isTabCountValid()`/`isOutlineTabCountValid()`
(wspólne `isValidTabCount()`) — liczba całkowita od 1 do `MAX_TAB_COUNT
= 20` (arbitralny sufit). Wszystkie prawdziwe wprost, gdy tabs
wyłączone. Settings → Tabs → Default Tab Count odrzuca tę samą klasę
wartości. `computeTabRanges()`/`computeRectTabRanges()` dodatkowo
defensywnie obcinają ułamek (`Math.floor`) i zaciskają zakresy do
[0, 2π]/[0, 1] — podglądy renderują się przed bramką Generate.

Podglądy 2D i 3D renderują realne przerwy: `drawGappedCircle()`/
`drawGappedRectangle()` (`drawToolpath.ts`) rysują przerwaną linię
(`ctx.setLineDash()`, stała `TAB_DASH`) na łuku/odcinku mostka zamiast
zwykłej pustki; 3D rysuje ścieżkę wprost z listy ruchów silnika, razem
z podniesieniami nad mostkami.
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
(numer slotu), zajęte klikalne, pokazują ikonę metody/patternu, którą
przechowują, z Icon Button "×" przy hoverze do usunięcia (z
potwierdzeniem). Zapis do slotu — sekcja "Save to preset" na Kroku 4, z
potwierdzeniem przy nadpisaniu zajętego (bez zmian, patrz `BL-25` niżej —
ten mechanizm zostaje niezależny od Preset Bar). Etykieta slotu to
auto-opis z parametrów (`presetLabel()`, `src/lib/presetLabel.ts`, np.
`"5-Holes Circle • Helix • ⌀8mm"` dla Hole(s), `"Rectangle 50×30
(Inside) • Ramp"` dla Outline — pattern/kształt jako główna tożsamość,
method drugorzędny). Migracja schematu: merge per-sekcja i per-pole z
`DEFAULT_WIZARD_PARAMS` przy wczytaniu (`mergeSection()` w
`lib/storage.ts`) — każde pole musi mieć typ wartości domyślnej, a pola
enumowe znaną wartość, inaczej dostaje domyślną; nieznane klucze są
odrzucane; zapisane dawne Pocket `'raster'` przechodzi na Spiral.
`machineStorage.ts` sprawdza pola maszyny tak samo. Błędy (private mode,
quota exceeded, uszkodzony JSON) — cichy fallback do wartości domyślnych +
`console.warn`. Ostatnia linia obrony to `ErrorBoundary`
(`components/ErrorBoundary.tsx`, owija `<App />` w `main.tsx`) — zamiast
białego ekranu komunikat z przyciskami "Reload" i "Reset saved state"
(usuwa wszystkie klucze `simplecam.*` i przeładowuje), bo auto-save slot
`"0"` wczytuje się przy każdym starcie i błąd wywołany zapisanymi danymi
powtarzałby się w nieskończoność. Świadomie poza zakresem:
nazywanie presetów przez usera (tylko auto-opis), "Reset to defaults",
grupowanie kilku operacji pod jednym presetem (sprzeczne z "jedno
narzędzie na wygenerowany plik").

**Tryb edycji przywołanego presetu (`BL-25`).** Osobny Icon Button
"ołówek" (`PencilIcon`) tuż obok "oka" Overlay w Header — globalny toggle
`editModeEnabled`, ten sam wizualny wzorzec co oko (aktywny =
`border-2 border-accent`), ta sama bordered ramka wokół grupy presetów
teraz aktywuje się dla **obu** trybów. Poza Edit Mode Preset Bar to
najprostsze możliwe zachowanie: klik na zajęty slot = zwykły,
natychmiastowy load, bez żadnej pamięci który slot był ostatnio
załadowany. W Edit Mode klikanie w presety działa jak **radio button**:
klik na zajęty slot ładuje jego parametry do wizarda I jednocześnie
uzbraja go do live-save w jednej akcji (jawny toggle ołówka to już
wystarczająco świadomy gest, więc load+arm naraz jest bezpieczne) — każda
kolejna zmiana parametru zapisuje się natychmiast z powrotem do tego
slotu, bez czekania na Generate (inaczej niż ukryty auto-save slotu
`"0"`, który zostaje Generate-gated bez zmian). Klik na INNY zajęty slot
przełącza wybór (ładuje nowy, cicho rozbraja poprzedni — bez
potwierdzenia, poprzedni jest już bezpiecznie zsynchronizowany
live-save'ami); klik na już uzbrojony slot go odznacza (`editingSlot =
null`), ale Edit Mode zostaje włączony — "nic nie wybrane" to legalny
stan trybu, nie tylko przejściowy. Live-save pisze tylko, gdy bieżące
parametry przechodzą tę samą `isGeometryValid`, którą sprawdza przycisk
Generate — nigdy nie zapisuje transientnego/połamanego stanu (np. pustego
pola w trakcie wpisywania); miękkie `fitWarnings` tego nie blokują.
Wskaźnik wyboru na ikonie uzbrojonego slotu to dokładnie ten sam wzorzec
co zaznaczenie w Overlay (`border-2 border-accent` + checkmark-badge w
rogu), nie osobny styl — to naprawdę ta sama "wybrane w trybie X"
semantyka. Stały napis po lewej stronie grupy ikon Preset Bar ma dwa
stany: "Edit Mode — select a preset" (neutralny kolor), dopóki nic nie
jest uzbrojone, potem "Auto-save Mode Enabled" — kolor (nie treść)
zmienia się na `status-error`, gdy bieżące parametry akurat nie
przechodzą walidacji (live-save w tym momencie nic nie zapisuje). Edit
Mode i Overlay są wzajemnie wykluczające się i symetryczne: włączenie
jednego automatycznie wyłącza drugi (czyści `overlaySlots` albo
`editingSlot` odpowiednio) — oba przyciski zawsze klikalne, nigdy
`disabled`. W przeciwieństwie do Overlay, Edit Mode **nie** wpływa na
`canGenerate` — nie ukrywa żywego wzorca jak Overlay
(`showActivePattern`), więc Generate działa normalnie niezależnie od
niego. Usunięcie uzbrojonego slotu czyści wybór, ale zostawia sam Edit
Mode włączonym. Stan `editModeEnabled`/`editingSlot` żyje wyłącznie w
pamięci (nie w `localStorage`) — odświeżenie strony zawsze startuje
wyłączone/rozbrojone. Ręczna siatka "Save current settings as preset" w
Kroku 4 zostaje bez zmian, bez żadnej interakcji z trybem edycji.

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
`FTP_SECURE=false` w `.env` jako awaryjny fallback do plain FTP.
Certyfikat FTPS jest **zawsze weryfikowany** (brak opcji wyłączenia —
wyłączona weryfikacja wystawiała hasło FTP na przechwycenie, a
podstawiony serwer mógłby podmienić JS dla użytkowników). Dwa warunki,
żeby weryfikacja przechodziła na tym hostingu: `FTP_HOST=v101.vh.net.pl`
(certyfikat serwera jest wystawiony na `*.v101.vh.net.pl`; nazwa z
cPanelu `ftp.vh11566.vh.net.pl` to ten sam serwer, ale jej nie ma w
certyfikacie) oraz dołożony łańcuch Let's Encrypt — serwer wysyła tylko
certyfikat końcowy, więc pośredni YR1 i cross-sign ISRG Root YR ↔ X1
leżą w repo (`scripts/certs/lets-encrypt-yr1-chain.pem`, ważne do
2028/2032) i są ufane obok wbudowanych rootów Node; `FTP_CA_FILE`
nadpisuje ten plik, gdy wystawca się zmieni (przy błędzie weryfikacji
skrypt podpowiada oba warunki). `npm run deploy:check` — łączy się,
weryfikuje certyfikat, loguje i listuje katalog zdalny, niczego nie
wysyła. Kolejność wysyłki: najpierw nowe pliki do `assets/` (obok
starych), potem pozostałe pliki roota (`.htaccess`, `robots.txt`,
`favicon.svg`), **`index.html` na końcu**, a dopiero potem usunięcie z
`assets/` plików, których nowy build już nie zawiera — przerwany albo
nieudany upload zostawia poprzednią wersję w pełni działającą (żywy
`index.html` nigdy nie wskazuje na brakujące paczki). Dotyka wyłącznie
plików z `dist/` — **świadomie NIE** pełny `clearWorkingDir()`: root
subdomeny zawiera też pliki zarządzane przez cPanel (`cgi-bin/`,
`php.ini`), których pełne wymiatanie by skasowało. Konto FTP (`claude@onlypaths.pluzz.pl`) ma
domyślnie katalog domowy ustawiony na podfolder `claude/` wewnątrz
docroota — trzeba to poprawić w cPanelu, inaczej appka wychodzi pod
`onlypaths.pluzz.pl/claude/` zamiast pod rootem. Dane logowania w
lokalnym `.env` (gitignored, szablon w `.env.example`) — czytane przez
natywne `node --env-file=.env` (Node ≥20.6, brak potrzeby paczki
`dotenv`). `public/robots.txt` (`Disallow: /`) blokuje indeksowanie na
czas testów; `public/.htaccess` ustawia roczny, niezmienny cache wyłącznie
dla `/assets/` (zahashowane nazwy), dobę dla `favicon.svg` (stała nazwa)
i `no-cache` dla `index.html`. Brak GitHub Actions/CI mimo że
repo jest na GitHubie — `BL-4` w `ideas.md`, świadomie poza zakresem do
wyjścia z fazy testów. Slash command `/deploy`
(`.claude/commands/deploy.md`) odpala `npm run deploy` bez dodatkowej
analizy — lokalny dla tej maszyny, bo `.claude/` jest wykluczone z gita.

## Struktura katalogów

```
src/
  types/wizard.ts          — typy WizardParams + DEFAULT_WIZARD_PARAMS.
                              `operation: 'holes' | 'outline' | 'surface' |
                              'pocket'`, `geometry`/`method` (Hole(s)),
                              `outline` (Outline), `surface` (Surface) i
                              `pocket` (Pocket) żyją obok siebie — każdy
                              zawsze obecny w WizardParams niezależnie od
                              aktywnej operacji.
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
  types/toolDiameters.ts    — `ToolDiameterOption` (`{value, label}`) +
                              `DEFAULT_TOOL_DIAMETER_OPTIONS` (`BL-19`) —
                              lista dropdowna Tool Diameter na Kroku 2,
                              edytowalna w Settings → Tool Diameters.
                              Osobny plik/klucz `localStorage` od
                              `machine.ts`/`appearance.ts`: rosnąca lista,
                              nie stały zestaw pól.
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
  config/pocketMethodMeta.ts — analogicznie dla Pocket (Spiral/Adaptive):
                              `POCKET_METHOD_META`/`POCKET_METHOD_LIST`,
                              płaski rejestr jak `surfaceMethodMeta.ts`.
  config/pocketMeta.ts      — analogicznie dla Pocket (kształt):
                              `POCKET_SHAPE_META`/`POCKET_SHAPE_LIST`
                              (Rectangle Cornered/Centered/Circle),
                              `pocketShapeLabel()`/`pocketShapeSlug()`/
                              `pocketShapeLines()`/`pocketSummary()`.
  config/operationMeta.ts   — `OPERATION_META`: wszystko, co UI robi
                              inaczej per operacja — etykieta, ikona/linie/
                              opis tego, co wybiera Krok 1 (`pick*`),
                              wyświetlana metoda, statystyki i tooltip
                              podsumowania Kroku 2, `generate`, slug nazwy
                              pliku, etykieta presetu, a dla Feedrate
                              Calculator `toolDiameter`/`methodValue`/
                              `calcMethods`/`withCalc` (zapis metody,
                              średnicy, szerokości i Linking Feed do sekcji
                              operacji). `Record<OperationType,
                              …>` — nowa operacja nie przejdzie typecheck,
                              dopóki nie wypełni każdego pola.
  config/materials.ts       — tabela materiałów Feedrate Calculator
                              (`MATERIALS`, `MaterialId`): zakres Vc, fz dla
                              3/6/8+ mm, współczynnik Plunge, Stepdown per
                              zaangażowanie, sugerowane szerokości, nota.
  config/routers.ts         — routery z ręcznym pokrętłem (`ROUTERS`,
                              pozycja → RPM, flaga `approximate`),
                              `nearestDialPosition()`.
  components/FeedCalculatorModal.tsx — modal Feedrate Calculator (patrz
                              „Feedrate Calculator” wyżej).
  components/useModalFocus.ts — wspólne zachowanie klawiatury modali
                              (fokus przy otwarciu i powrót przy zamknięciu,
                              Escape, pułapka Tab) — Settings i kalkulator.
  components/wizard/ToolChipLoad.tsx — wiersz Tool Diameter w Kroku 2 z
                              edytowalnym Flutes (wspólnym z kalkulatorem)
                              i rzeczywistym fz tylko do odczytu.
  components/ErrorBoundary.tsx — klasowy error boundary owijający
                              `<App />` (`main.tsx`): zamiast białego ekranu
                              komunikat z "Reload" i "Reset saved state"
                              (usuwa klucze `simplecam.*`).
  components/SettingsModal.tsx — Settings Modal (nakładka `bg-black/50
                              backdrop-blur-sm` — cała appka pod nim
                              rozmyta). Siedem Settings Nav
                              Items, w tej kolejności: **Machine** (X/Y/Z
                              travel, dialekt, Start/End G-Code),
                              **Tabs** (Default Tab Sizes), **Tool
                              Diameters** (edytowalna lista średnic dla
                              dropdownów Tool Diameter na Kroku 2 —
                              dodawanie/usuwanie, sufit
                              `MAX_TOOL_DIAMETER_COUNT` w
                              `lib/validation.ts`, blokada usunięcia
                              ostatniej pozycji, "Reset to Default" z
                              potwierdzeniem), **Appearance**
                              (Theme, Preview Color Palette, Grid Labels 3D
                              — patrz "Motywy (Theme) i Palety..." niżej),
                              **Privacy**, **Reset** (`BL-40`), **About**
                              (nazwa/wersja appki) — ta ostatnia zawsze na
                              końcu nawigacji. **Reset** to jeden przycisk
                              "Reset All Settings to Defaults" —
                              `onResetAll` (`App.tsx`), czerwony styl
                              (tokeny `status-delete-*`, żeby odróżnić od
                              węższego "Reset to Default" w Tool
                              Diameters), `window.confirm()` przed akcją —
                              czyści naraz wszystkie pięć kluczy
                              `localStorage`, które appka posiada:
                              Appearance, Tool Diameters, Machine Settings,
                              pamięć Feedrate Calculator
                              i wszystkie sloty presetów (`clearAllSlots()`
                              w `lib/storage.ts`, łącznie z ukrytym
                              auto-save sesji `"0"`, nie tylko widoczne
                              `"1"`–`"5"` jak `deleteSlot()`). Nie rusza
                              bieżących, aktualnie edytowanych w wizardzie
                              parametrów — czyści to, co zapisane, nie to,
                              co na ekranie. **Privacy** to statyczny tekst w czterech
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
                              stos operacji (Hole(s)/Outline/Surface/
                              Pocket, wszystkie rozwinięte z kompaktową
                              listą wariantów w środku).
                              `Step2Geometry.tsx` = cienki router na
                              `params.operation` → `Step2GeometryHoles.tsx`
                              / `Step2GeometryOutline.tsx` /
                              `Step2GeometrySurface.tsx` /
                              `Step2GeometryPocket.tsx`
                              (`SurfaceMethodPicker.tsx`/
                              `PocketMethodPicker.tsx` — wzorzec
                              `OutlineMethodPicker`; tekstowe przełączniki
                              — Raster Direction, Z-Transition Mode, Cut
                              Direction, a w Kroku 4 interpolacja — idą
                              przez jeden `TextToggle.tsx`, z listami opcji
                              w `toggleOptions.ts`). Wszystkie pola liczbowe na
                              Krokach 2/3 idą przez `useNumberField()`.
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
                              Pełna legenda (każda ikona, pogrupowana po
                              operacjach + Step Summary + Header/kontrolki)
                              w Artifakcie Interface Anatomy. Kształty
                              Pocket mają własne ikony: granica (linia 1.0)
                              + cieńsza (0.7) spirala CCW od środka, 1.75
                              obrotu — kwadratowa dla Rectangle (kropka
                              origin w rogu/środku), Archimedesa dla
                              Circle.
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
                               Prop `renderPaused` (`App.tsx`: `true`, gdy
                               Settings Modal albo Feedrate Calculator jest
                               otwarty) — pętla wtedy
                               przerysowuje scenę tylko po realnej zmianie
                               (przebudowa sceny, resize), nie co klatkę;
                               inaczej rozmyte tło modala
                               (`backdrop-blur-sm`) byłoby przeliczane 60
                               razy na sekundę.
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
                               ścieżka narzędzia każdej operacji rysowana
                               wprost z listy ruchów silnika przez
                               `toolpathLines3D()` (podgląd nie liczy
                               ścieżki sam), bryła
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
    customPoints.ts            — `parseCustomPointsText()` (punkty +
                                 numery błędnych linii) i
                                 `formatCustomPoints()` dla Custom List —
                                 wyjęte z komponentu, reużyte przez
                                 walidację i migrację w `storage.ts`
                                 (stare zapisy bez `customPointsText`
                                 dostają tekst odtworzony z punktów).
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
    depthPasses.ts              — `computeDepthPasses(totalDepth, stepdown)
                                 → number[]` (lista przejść/obrotów).
                                 Jedyne miejsce dzielące głębokość przez
                                 stepdown — używane przez silnik ORAZ
                                 podgląd 3D. Twardy limit `MAX_PASSES` =
                                 5000 przejść (ochrona przed zamrożeniem
                                 podglądu przy wartościach w trakcie
                                 wpisywania), fallback na pojedyncze pełne
                                 przejście gdy `stepdown <= 0`.
                                 `exceedsPassLimit()` — walidacja blokuje
                                 Generate, zanim limit obciąłby realne
                                 zadanie.
    program.ts                  — `buildHeader`/`buildFooter`/
                                 `assembleProgram` — wspólny szkielet
                                 programu, przyjmuje `Dialect` i
                                 `MachineSettings` — patrz "`G4 P` i
                                 `buildFooter()`" wyżej.
    helix.ts / standardHole.ts   — `generateHelix(params, machine)` /
                                 `generateStandardHole(params, machine)`
                                 — publiczne funkcje
                                 `(WizardParams, MachineSettings) =>
                                 string[]`. Silnik to
                                 `buildHelixCircleToolpath()`/
                                 `buildStandardCircleToolpath()` — lista
                                 ruchów (`toolpath.ts`) dla jednego okręgu
                                 z jawnego obiektu opcji
                                 (`CircleToolpathOptions`: Hole(s) z
                                 `holeCircleOptions()`, Outline Circle z
                                 `circleOutlineOptions()`), z której
                                 powstaje G-code (`circleToolpathGcode()`,
                                 mostki wymuszają G1) i podgląd 3D.
                                 `appendFullTurn()` — pełny obrót (płaski
                                 albo helikalny), `direction: 'cw'|'ccw'`
                                 (Hole(s) zawsze `'ccw'`). Gdy mostki
                                 włączone, przełączają się na płaskie
                                 przejścia z pominięciem łuków mostków —
                                 patrz "Tabs (mostki)..." wyżej.
    tabs.ts                      — `computeTabRanges()`/
                                 `appendTabbedCirclePass()` — geometria
                                 mostków dla Hole(s)/Outline Circle,
                                 współdzielona przez
                                 `helix.ts`/`standardHole.ts`. Kąty
                                 mostków to suma równomiernego
                                 próbkowania i dokładnych granic każdego
                                 mostka wymuszonych jako punkty łamania.
    outlineCircle.ts             — Outline Circle: reużywa silnika
                                 Hole(s) z opcjami z
                                 `circleOutlineOptions()`.
                                 `onLineCircleEdges()` — dwie krawędzie
                                 (wewnętrzna/zewnętrzna) dla On-line,
                                 czysto wizualne (3D).
    outlineRectangle.ts / outlineRectangleGeometry.ts — Outline Rectangle:
                                 metody Ramp/Standard
                                 (`buildRectRampToolpath()`/
                                 `buildRectStandardToolpath()` — lista
                                 ruchów dla G-code i podglądu 3D, opcje z
                                 `rectOutlineOptions()`), geometria boków
                                 (`longerEdgeIndex()`,
                                 `onLineRectDimensions()`).
    outlineRectangleTabs.ts      — `computeRectTabRanges()`/
                                 `appendTabbedRectanglePass()` — mostki per bok
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
                                 Limit `MAX_LINES` = 5000 z tym samym
                                 podziałem ról co `MAX_PASSES`:
                                 `exceedsLineLimit()`/
                                 `rasterExceedsLineLimit()` dla walidacji.
    surfaceZTransition.ts         — `zTransitionMoves()` (Plunge = prosty
                                 `G1 Z`; Helix = pętla
                                 `computeDepthPasses()` + pełny obrót
                                 per obrót, dokładnie jak nietabbed branch
                                 `helix.ts`, środek spirali przesunięty o
                                 `helixRadius` żeby start/koniec wypadł na
                                 rogu, skok `helixPitchForRampAngle()` z
                                 Ramp Angle), `buildLevelDescents()` (lista
                                 docelowych głębokości poziomów),
                                 `levelEntryZ()` (skąd zaczyna się zejście
                                 poziomu: Start Z albo 0.5 mm nad dnem
                                 poprzedniego), `entryHelixExceedsTurnLimit()`
                                 (walidacja).
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
                                 `standardHole.ts`. Obie metody budują
                                 jedną listę ruchów
                                 (`buildSurfaceToolpath()`, `toolpath.ts`),
                                 z której powstaje G-code i podgląd 3D.
                                 `appendZTransition()` w
                                 `surfaceZTransition.ts` dopisuje do niej
                                 Plunge/Helix.
    pocketGeometry.ts              — `pocketCenter()` (origin-convention
                                 jak `rectCorners()`), `pocketRectWallHalfDims()`/
                                 `pocketCircleWallRadius()` (ściana =
                                 nominał zainsetowany o promień narzędzia —
                                 odwrotny znak niż Surface'owy overtravel),
                                 `pocketStepoverMm()` (jedyne źródło prawdy
                                 % → mm, jak Surface).
    pocketSpiral.ts                 — geometria metody Spiral.
                                 `rampSweepDegFor()` (kąt rampy per
                                 pierścień, z `RAMP_LENGTH_FACTOR = 3`,
                                 stałą niekonfigurowalną — `BL-41` gdyby
                                 miała być polem UI — trzymającą stałą
                                 DŁUGOŚĆ ŁUKU rampy zamiast stałego kąta,
                                 patrz "Kluczowe decyzje projektowe"
                                 wyżej). `pocketCircleRingRadii()`/
                                 `pocketRectRingDims()` — sekwencje
                                 pierścieni (`computeLinePositions()`
                                 reużyty z `surfaceRaster.ts`), rosnące od
                                 punktu wejścia Z-entry do ściany, per-oś
                                 clampowane dla Rectangle. `circleRingMoves()`/
                                 `rectRingMoves()` — jeden pierścień = gradual
                                 ramp (zawsze G1, dialekt nie wspiera G2/G3 ze
                                 zmiennym promieniem/rozmiarem) + pełny flat
                                 obrót (łuk pełnego obrotu dla Circle,
                                 respektuje toggle interpolacji;
                                 `rectFullLapPoints()` dla Rectangle, zawsze
                                 G1, start w punkcie gdzie skończył się ramp,
                                 nie zawsze w narożniku). `rectRampSweepFor()`/
                                 `rectPointAtPerimeterFraction()`/
                                 `rectRingRampPoints()` — odpowiedniki
                                 `rampSweepDegFor()`/`circleRingRampPoints()`
                                 dla Rectangle, obwód zamiast promienia,
                                 ułamek 0–1 zamiast stopni. `RECT_HELIX_ENTRY_
                                 FRACTION` — punkt bootstrapu dla wejścia
                                 Helix, patrz "Kluczowe decyzje projektowe"
                                 wyżej.
    pocketAdaptiveMath.ts           — matematyka zaangażowania Adaptive:
                                 `engagementAngleFor()` (% → θ),
                                 `optimalLoadMm()`/`optimalLoadPercentFromMm()`,
                                 `chipThinningFactor()`, `arcEngagement()`
                                 (prawo cosinusów), `nextConstantEngagementRadius()`
                                 (jego odwrotność), `maxArcEngagement()`
                                 (wzdłuż całego łuku, z odchyleniem ruchu),
                                 `largestStepWithin()` (bisekcja kroku).
    pocketAdaptive.ts               — ścieżka Adaptive: `buildAdaptiveToolpath()`
                                 (fazy A/B/C, patrz "Kluczowe decyzje
                                 projektowe") → lista ruchów `toolpath.ts`
                                 (`AdaptiveMove`/`adaptiveMovePoints()`/
                                 `adaptiveMovesToGcode()` to nazwy-aliasy
                                 wspólnego modułu),
                                 `adaptiveExceedsLimits()` (czy któraś
                                 pętla — obroty helixa, pierścienie fazy
                                 A, stacje B, promienie C — zatrzymałaby
                                 się na limicie przed ścianą/pełną
                                 głębokością; liczy tylko sekwencje, nie
                                 listę ruchów).
    toolpath.ts                     — wspólna lista ruchów (`BL-61`, etap 3):
                                 `Move` (linia/łuk × `rapid`/`cut`/
                                 `plunge`/`link`), `ToolpathBuilder`,
                                 `movePoints()` (próbkowanie łuków — to samo
                                 próbkowanie trafia do G1 i do podglądów,
                                 więc dają identyczne punkty) i
                                 `toolpathToGcode()` (jedyny formatter: `G0`
                                 tylko zmienianych osi albo jawnie `xy`/`z`,
                                 `G1 Z… F<plunge>`, `G1 X Y Z F`, `G2/G3 … I
                                 J F`). Silnik buduje listę raz, G-code i
                                 podgląd 3D ją konsumują — podgląd nie może
                                 rozjechać się z plikiem. Każda operacja:
                                 Hole(s) i Outline Circle
                                 (`buildHelixCircleToolpath()`/
                                 `buildStandardCircleToolpath()`), Outline
                                 Rectangle (`buildRectRampToolpath()`/
                                 `buildRectStandardToolpath()`), Surface
                                 (`buildSurfaceToolpath()`) i Pocket
                                 (`buildPocketToolpath()`).
    fuzzParams.ts                   — tylko testy: deterministyczny PRNG +
                                 losowe `WizardParams` per operacja (test
                                 niezmienników, porównania przy refaktorze).
    pocketAdaptiveSim.ts            — tylko testy: symulacja materiału na
                                 siatce (pokrycie kieszeni, wyjazd za ścianę,
                                 kontakt przejazdów łączących). Nie
                                 importowany przez appkę.
    gcodeTestUtils.ts               — tylko testy: `arcRadiusMismatches()` —
                                 śledzi pozycję narzędzia przez program i
                                 sprawdza, że każdy G2/G3 ma start i koniec w
                                 tej samej odległości od środka (GRBL
                                 error 33).
    gcodeInvariants.test.ts         — test właściwościowy po wszystkich
                                 operacjach i metodach: deterministyczny
                                 PRNG losuje zestawy parametrów, te
                                 przechodzące `isWizardParamsValid()` muszą
                                 dać G-code spełniający niezmienniki: G0 w
                                 XY tylko na Safe Z, każde F > 0, brak
                                 NaN/Infinity, najniższe Z = dokładnie
                                 −totalDepth, spójne łuki G2/G3, brak łuków,
                                 gdy Krok 4 pokazuje G1, ostatnia linia
                                 M30/M2, środek freza w granicach Surface /
                                 w ścianach Pocket. `GCODE_FUZZ_SCALE=10` /
                                 `GCODE_FUZZ_SEED=…` — większy przebieg
                                 lokalnie.
    interpolation.ts                — `forcedLinearReason()` — dlaczego
                                 przełącznik interpolacji w Kroku 4 jest
                                 zablokowany na G1 (prostokąt Outline,
                                 mostki) albo `null`; czysta funkcja, żeby
                                 test niezmienników mógł sprawdzić zgodność
                                 z silnikiem.
    pocketZTransition.ts            — `pocketZTransitionMoves()` — wersja
                                 Plunge/Helix wyśrodkowana na
                                 `pocketCenter()` (bez narożnikowej
                                 matematyki stycznej Surface'a), zawsze CCW.
                                 `buildLevelDescents()` reużyte wprost z
                                 `surfaceZTransition.ts`, bez kopii.
                                 `pocketEntryPoint()` (środek dla Plunge,
                                 start spirali dla Helix),
                                 `effectivePocketZTransitionMode()`
                                 (Adaptive → zawsze Helix).
    pocket.ts                       — `buildPocketToolpath()` — jedna lista
                                 ruchów dla każdej metody (`toolpath.ts`),
                                 z której powstaje G-code
                                 (`generatePocketSpiral`/
                                 `Adaptive`) i oba podglądy. Spiral:
                                 ten sam szkielet co `surface.ts` (jeden
                                 syntetyczny punkt-środek,
                                 `assembleProgram()`), per-poziom pełny XY
                                 clear (`buildLevelDescents()`), wejście
                                 `appendPocketZTransition()`, poziom przez
                                 `LEVEL_CLEAR` (rozgałęzia się po
                                 kształcie; pierścienie
                                 `appendCircleRing()`/`appendRectRing()`
                                 z `pocketSpiral.ts`). Adaptive: własna
                                 struktura poziomów bez retraktu
                                 (`buildAdaptiveToolpath()`), dokładany
                                 tylko dojazd do Start Z.
    validation.ts                — `OPERATION_RULES` (rejestr per operacja,
                                 patrz „Zasada” niżej; także
                                 `engagement()` dla Feedrate Calculator). `isWizardParamsValid()` — cała reguła
                                 bramkująca Generate (i live-save Edit
                                 Mode) dla aktywnej operacji, jedno źródło
                                 prawdy dla `App.tsx` i testu
                                 niezmienników. `minStartZ()`/
                                 `isStartZAboveCut()` — Start Z może być
                                 ujemny, ale musi leżeć powyżej dna cięcia
                                 (z mostkami: powyżej górnej granicy pasma
                                 mostków). `isToolDiameterValid` (ostre `<` —
                                 frez równy otworowi to ścieżka o zerowym
                                 promieniu), `isStepdownValid`,
                                 `isSafeZValid` (> 0)/
                                 `isFeedrateXYValid`/`isPlungeRateValid`
                                 (> 0), `isHolesSizeValid`/
                                 `isOutlineSizeValid`/`isSurfaceSizeValid`/
                                 `isPocketSizeValid` (głębokość i wymiary
                                 kształtu > 0), `feedsWarnings()`
                                 (nieblokujące: Start Z < 0 — rapid
                                 schodzi poniżej wierzchu materiału;
                                 pokazywane w Kroku 3 i na liście ostrzeżeń
                                 Kroku 4, ale nie zmienia koloru Badge'a,
                                 który oznacza wyłącznie dopasowanie do
                                 maszyny), `descentAngleDeg()`/
                                 `descentWarnings()` (nieblokujące, ta sama
                                 ścieżka wyświetlania: helix/ramp Hole(s)
                                 i Outline schodzi o cały Stepdown na
                                 obrót/okrążenie na Feedrate XY, wejście
                                 Helix Surface/Pocket pod Ramp Angle —
                                 ostrzeżenie powyżej
                                 `MAX_RECOMMENDED_DESCENT_DEG` = 10°),
                                 `isPassCountWithinLimit`/
                                 `isSurfaceLineCountWithinLimit`/
                                 `isPocketToolpathWithinLimits` (blokujące:
                                 ścieżka nie może trafić w limity
                                 bezpieczeństwa pętli, bo wtedy byłaby
                                 obcięta),
                                 `isCircleHoleCountValid` (limit 100),
                                 `isCustomPointsValid`,
                                 `isTabHeightValid`/`isTabWidthValid`/
                                 `isTabCountValid`,
                                 `isOutlineToolDiameterValid` (Circle
                                 Inside też ostre `<`)/
                                 `isOutlineTabHeightValid`/
                                 `isOutlineTabWidthValid`/
                                 `isOutlineTabCountValid`,
                                 `isSurfaceToolDiameterValid`/
                                 `isSurfaceStepoverValid`/
                                 `isSurfaceHelixRadiusValid`,
                                 `isPocketToolDiameterValid`/
                                 `isPocketStepoverValid`/
                                 `isPocketHelixRadiusValid` (sufit
                                 `pocketMaxHelixRadius()` = mniejsze z:
                                 najmniejszy promień/połówka wymiaru ściany
                                 kieszeni, promień freza — szerszy helix
                                 zostawia niewycięty słupek `r − R` w
                                 środku; nie stepover jak Surface; dla
                                 Adaptive zawsze sprawdzany),
                                 `isPocketOptimalLoadValid`/
                                 `isPocketRampAngleValid`/
                                 `isPocketLinkingFeedValid` (tylko Adaptive)
                                 — blokują Generate i pokazują inline error
                                 w Kroku 2/3. `isPocketHelixRadiusSmall`/
                                 `isAdaptiveStepdownShallow` — nieblokujące
                                 podpowiedzi Adaptive.
                                 `outlineFootprint`/`outlineZSpan`,
                                 `surfaceFootprint`/`surfaceZSpan`,
                                 `pocketFootprint`/`pocketZSpan`,
                                 `patternSpan`/`zSpan`/
                                 `machineFitWarnings()` — nieblokujący
                                 soft-warning na Kroku 4, rozgałęziony po
                                 `operation`. `isToolDiameterEntryValid()`/
                                 `MAX_TOOL_DIAMETER_COUNT` (`BL-19`) —
                                 osobna kategoria: bramkuje przycisk "Add"
                                 w Settings → Tool Diameters, nie Generate.
    feedCalc.ts                  — model Feedrate Calculator:
                                 `computeFeeds()` (RPM, fz, chip thinning,
                                 posuwy, Stepdown, docięcia do limitów
                                 maszyny), `tableChipLoad()`/
                                 `suggestedChipLoad()`,
                                 `engagementChipThinning()`,
                                 `effectiveChipLoad()` (fz w Kroku 2), typ
                                 `Engagement`.
    feedCalcStorage.ts           — `loadFeedCalcSettings`/
                                 `saveFeedCalcSettings`, klucz
                                 `simplecam.feedCalc`, straże per pole.
    download.ts                  — `buildFilename(params)`/
                                 `downloadTextFile` — efekt uboczny
                                 (Blob/URL), celowo poza czystym rdzeniem
                                 `lib/`.
    storage.ts                   — auto-save + presety w localStorage —
                                 `saveSlot`/`loadSlot`/`deleteSlot`/
                                 `loadPresetSlots`, klucz
                                 `simplecam.storage`, sloty `"0"`–`"5"`,
                                 merge per-pole z `DEFAULT_WIZARD_PARAMS`
                                 przy wczytaniu (straże typów i enumów,
                                 `mergeSection()`), try/catch +
                                 `console.warn` na każdym I/O.
    presetLabel.ts                — `presetLabel(params)` → auto-opis
                                 zapisanego slotu z parametrów (pattern/
                                 kształt jako główna tożsamość, method
                                 drugorzędny).
    machineStorage.ts             — `loadMachineSettings`/
                                 `saveMachineSettings`, klucz
                                 `simplecam.machine`, bez systemu slotów
                                 (jeden płaski obiekt), każde pole
                                 sprawdzane przy wczytaniu.
    appearanceStorage.ts          — `loadAppearanceSettings`/
                                 `saveAppearanceSettings`, klucz
                                 `simplecam.appearance`, walidacja
                                 zapisanego `palette` względem znanych
                                 `PaletteId` (fallback `'default'`).
    toolDiameterStorage.ts        — `loadToolDiameterOptions`/
                                 `saveToolDiameterOptions` (`BL-19`), klucz
                                 `simplecam.toolDiameters`, cały obiekt
                                 (tablica) w try/catch z fallbackiem do
                                 `DEFAULT_TOOL_DIAMETER_OPTIONS` — jak
                                 `machineStorage.ts`, nie field-by-field
                                 jak `appearanceStorage.ts` (dane
                                 tablicowe nie mają stałego zestawu pól do
                                 scalenia).
    toolDiameterOptions.ts        — `resolveToolDiameterSelectOptions()`
                                 (`BL-19`) — dokleja syntetyczną opcję do
                                 listy, gdy aktualnie wybrana wartość
                                 `toolDiameter` (Hole(s)/Outline/Surface)
                                 nie jest już na liście (np. usunięta w
                                 Settings), żeby dropdown nie rozjechał
                                 się z realnie wybraną liczbą — pole i tak
                                 jest zwykłą, niewalidowaną liczbą,
                                 przynależność do listy nigdy nie była
                                 sprawdzana. `formatToolDiameterLabel()` —
                                 etykieta `"<wartość> mm"` dla wpisów
                                 dodanych przez użytkownika (`fmt()`),
                                 różna od ręcznie pisanych etykiet
                                 `DEFAULT_TOOL_DIAMETER_OPTIONS`
                                 (`1/8"`/`1/4"`).
    overlayParams.ts               — `deriveOverlayParams()` — jedyna
                                 czysta funkcja w overlay presetów, patrz
                                 "Overlay presetów..." wyżej.
    *.test.ts                    — testy Vitest (`npm run test`).
  App.tsx                    — orkiestracja stanu wizarda i nawigacji kroków.
```

**Zasada:** wszystko, co zależy od aktywnej **operacji**, idzie przez dwa
rejestry, nie przez łańcuchy `operation === 'outline' ? … : …` (takie
łańcuchy były przyczyną `BL-51`): `OPERATION_META`
(`config/operationMeta.ts` — UI i wywołanie `generate`) oraz
`OPERATION_RULES` (`lib/validation.ts` — czysta logika: walidacja
Generate, głębokość, mostki, rozmiar do ostrzeżeń o maszynie). Wyjątki to
router komponentów Kroku 2 (`Step2Geometry.tsx`), wybór operacji w Kroku 1
i rysowanie w podglądach 2D/3D. Wszystko co zależy od wybranego method (Helix vs Standard —
nazwa, ikona, etykiety pól, **oraz funkcja generująca G-code**: `generate`)
idzie przez `METHOD_META` w `config/methodMeta.ts`, nie przez
rozproszone `method === 'helix' ? ...` w komponentach. Rejestry metod
(`METHOD_META`, `SURFACE_METHOD_META`, `POCKET_METHOD_META`, a dla Outline
`generateOutline()`) wołane są wyłącznie przez
`OPERATION_META[params.operation].generate(params, machine)` — to jedyne
miejsce w UI, które uruchamia silnik; nie importować `generateHelix`/
`generateStandardHole` bezpośrednio w komponentach UI. Analogicznie —
wszystko co zależy od wybranego patternu idzie przez `POSITIONING_META`/
pomocnicze funkcje w `config/positioningMeta.ts`, nie przez rozproszone
`switch (geometry.positioning)` w komponentach; Outline analogicznie przez
`config/outlineMeta.ts`, Surface analogicznie przez `config/surfaceMeta.ts`
(kształt) i `config/surfaceMethodMeta.ts` (metoda, z własnym `generate` —
płaski rejestr, nie bespoke-switch jak `lib/outline.ts`, bo metody Surface
nie są ograniczone per-kształt), Pocket analogicznie przez
`config/pocketMeta.ts` (kształt) i `config/pocketMethodMeta.ts` (metoda,
z własnym `generate` — płaski rejestr jak Surface). Wszystkie kolory podglądu 2D/3D
idą przez
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
- Brak testów E2E w MVP — tylko testy jednostkowe silnika G-code plus
  test właściwościowy niezmienników (`gcodeInvariants.test.ts`).
- Nie przeskakuj większych pozycji z `ideas.md` bez pytania — każda
  wymaga checkpointu do przeglądu przez użytkownika, duże pozycje
  (`OP-#`) też sesji `/grill-me`.
