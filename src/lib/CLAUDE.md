# src/lib — silnik G-code i czysta logika

Wszystko tutaj to czyste funkcje TS, bez UI (`download.ts` to jedyny
świadomy efekt uboczny). Publiczne generatory mają kształt
`(params: WizardParams, machine: MachineSettings) => string[]` i są wołane
wyłącznie przez `OPERATION_META[op].generate()` (`config/operationMeta.ts`).
Opis stanu obecnego — historia w `CHANGELOG.md`.

## Szkielet programu (`program.ts`)

- **Dialekt** (`MachineSettings.dialect`: `'grbl' | 'marlin' | 'mach3'`,
  domyślnie GRBL) rozstrzyga trzy rzeczy: preambułę (`modalPreamble()` —
  `G21 G90 G17`, dla GRBL/Mach3 dodatkowo `G91.1 G94 G40 G49`; Marlin tych
  kodów nie implementuje, jego I/J są zawsze przyrostowe), `G4 P` (sekundy
  dla GRBL/Mach3, ×1000 ms dla Marlina) oraz `endOfProgramCode()` — `M30`
  (GRBL/Mach3) / `M2` (Marlin), zawsze faktycznie ostatnia linia pliku.
- **Wrzeciono:** tylko `M3`; `S` = `machine.spindleSpeed`, `G4 P` =
  `machine.dwellSeconds` (0 = bez dwell) — tylko gdy w Kroku 4 zaznaczono
  start wrzeciona.
- `assembleProgram()` owija program: opcjonalny user header
  (`headerText`, dosłownie, z komentarzami `; --- User header ---` /
  `; --- Application code ---` tylko gdy niepusty), `buildHeader()`, pętla
  po punktach (toolpath punktu + `G0 Z<Safe Z>` po **każdym**, łącznie z
  ostatnim), `buildFooter()`, opcjonalny user footer (`; --- User footer
  ---`), na końcu `M30`/`M2`. Pętla nie robi rapidu do surowego XY punktu —
  każdy toolpath sam emituje wejście do swojego rzeczywistego startu.
  Operacje jednokształtowe (Outline, Surface, Pocket) podają jeden
  syntetyczny punkt.
- `buildFooter()` **celowo nie robi** retraktu (zrobiła go pętla) —
  tylko `M5` (`output.spindleStopEnd`) i `G0 X0 Y0` (`returnOriginEnd`).
- **Ruch między otworami:** retrakt na Safe Z przed `G0` do kolejnego XY.
- **Start Z** to margines najazdu na posuwie roboczym ponad wierzchem
  materiału (Z0), nie wysokość materiału — dno cięcia zawsze
  `-totalDepth`. Ujemny Start Z dozwolony (wznowienie), ale z ostrzeżeniem.

## Wspólna lista ruchów (`toolpath.ts`)

Każdy silnik buduje jedną listę ruchów (`ToolpathBuilder`: linia/łuk ×
`rapid`/`cut`/`plunge`/`link`/`finish` — `finish` = cięcie z posuwem
`feeds.finish`, rysowane jak `cut`), z której powstaje G-code
(`toolpathToGcode()` — jedyny formatter: `G0` tylko zmienianych osi albo
jawnie `xy`/`z`, `G1 Z… F<plunge>`, `G1 X Y Z F`, `G2/G3 … I J F`) i podgląd
3D (`toolpathLines3D()`, `movePoints()` próbkuje łuki tak samo jak G1 —
72 odcinki na obrót). Podgląd nie może się rozjechać z plikiem. Łuk pełnego
obrotu (`fullTurn`) kończy się dokładnie w punkcie startu. Opcjonalne
`exact: { from, radius }` przy łuku daje I/J i próbkowanie z dokładnego
promienia. `ToolpathBuilder(start, skipZeroLength)` — pomijanie ruchów
zerowej długości tylko dla Adaptive.

Budowniczowie: `buildHelixCircleToolpath()`/`buildStandardCircleToolpath()`
(Hole(s), Outline Circle), `buildRectRampToolpath()`/
`buildRectStandardToolpath()` (Outline Rectangle), `buildSurfaceToolpath()`,
`buildPocketToolpath()`. Każdy startuje nad punktem wejścia na Safe Z i
zaczyna od `zTo('rapid', startZ)`; końcowy retrakt robi `assembleProgram()`.

## Hole(s) (`positioning.ts`, `helix.ts`, `standardHole.ts`, `tabs.ts`)

- **Pozycjonowanie** (`resolvePoints()`): Single (0,0), Grid (4 rogi), Grid
  Centered, N-Holes on Circle (0° = +X, CCW; liczba przycięta do
  `MAX_CIRCLE_HOLE_COUNT` = 100), Custom List. Grid/Grid Centered kolapsują
  do 2 punktów (1, gdy oba wymiary), gdy `gridX`/`gridY` === 0 dokładnie —
  tylko te dwa tryby (`rawPoints()`); etykiety rozpoznają kolaps do 2.
  Globalny offset X/Y doliczany jako ostatni krok `resolvePoints()`.
- **Custom List:** źródło prawdy to surowy tekst `customPointsText`;
  `customPoints` to zapisywana razem lista poprawnych linii.
  `parseCustomPointsText()` (`customPoints.ts`): linia = dokładnie dwie
  liczby rozdzielone `,`/`;`/spacją; błędna linia albo pusta lista blokuje
  Generate (`isCustomPointsValid()`) — nigdy cichy otwór w (0,0).
- **Helix:** spirala od Start Z do `-totalDepth`, potem płaski obrót
  czyszczący. Skok na obrót `pitch` = `cappedRampPitch()` (`rampPitch.ts`)
  = `min(Stepdown, 2π·r·tan(Ramp Angle))` — `geometry.rampAngleDeg`
  (0.5–30°, domyślnie 2°); Stepdown zostaje górnym limitem. **Standard:** `G1 Z` o Stepdown + płaski
  pełny obrót, powtarzane. Promień ścieżki `(holeDiameter − toolDiameter)/2`,
  zawsze CCW (pod M3 wewnątrz otworu = climb). Opcje w
  `CircleToolpathOptions` (`holeCircleOptions()`), `appendFullTurn()`,
  G-code przez `circleToolpathGcode()`.
- **Interpolacja:** przełącznik G2/G3 vs G1 w Kroku 4; mostki wymuszają G1
  dla całego programu (zapisana wartość nietknięta, tylko ignorowana).
  `interpolation.ts::forcedLinearReason()` — powód blokady (prostokąt
  Outline, mostki).

## Outline (`outline.ts`, `outlineCircle.ts`, `outlineRectangle*.ts`)

- Kształty: Rectangle Cornered (origin w lewym dolnym rogu), Rectangle
  Centered, Circle (wyśrodkowany). Offset mode **Inside/Outside/On-line**.
- Kierunek pod M3: Outside → CW, Inside → CCW (w obu zachowywany materiał
  po prawej = climb), On-line → CW (arbitralnie).
- Circle reużywa silnika Hole(s) z `circleOutlineOptions()` (promień/
  kierunek z `circleOutlineRadiusAndDirection()`). `onLineCircleEdges()` —
  dwie krawędzie On-line (tylko podglądy).
- Circle Helix i Rectangle Ramp mają własny Ramp Angle
  (`outline.rampAngleDeg`), skok jak w Hole(s) (`cappedRampPitch()`).
- Rectangle: **Ramp** („prostokątny helix”: każde okrążenie schodzi o
  `rampPitch` = `min(Stepdown, obwód·tan(kąt))` rozłożone na wszystkie 4
  boki proporcjonalnie do długości — `rampLap(fromZ, toZ)`, stałe
  nachylenie; okrążenia startują w narożniku dłuższego boku,
  `longerEdgeIndex()`; potem płaskie okrążenie czyszczące) i **Standard** (plunge +
  płaskie okrążenie na poziom). Zawsze G1. `rectOutlineOptions()`,
  `rectCorners()`, `rectToolDimensions()`, `onLineRectDimensions()`.
- `generateOutline()` rozgałęzia po kształcie; nieprawidłowa para
  kształt/metoda spada na Standard. Zaokrąglone rogi poza zakresem.

## Mostki (Tabs) — Hole(s) i Outline

- Checkbox "Enable Tabs": Tab Height / Tab Width (mm łuku) / Tab Count —
  jeden zestaw na job; Outline Rectangle liczy mostki **per bok**.
- Płycej niż `totalDepth − tabHeight` — bez zmian. W paśmie mostków płaskie
  przejścia co Stepdown z pominięciem mostka: podniesienie do góry pasma,
  przejazd, zejście — zawsze pionowo przy stałym XY, nigdy po przekątnej.
  Helix/Ramp: spirala (skok z Ramp Angle) kończy się na górze pasma + jeden
  płaski obrót czyszczący, dopiero potem przejścia z mostkami — te zawsze
  co Stepdown, nie co skok.
- Rozstawienie równomierne, przesunięte o pół kroku (start przejścia nigdy
  w mostku). `computeTabRanges()`/`appendTabbedCirclePass()` (`tabs.ts`) i
  `computeRectTabRanges()`/`appendTabbedRectanglePass()`/`sideRangesFor()`
  (`outlineRectangleTabs.ts`) — lista punktów = suma próbkowania i
  dokładnych granic mostków (dokładny rozmiar niezależnie od
  rozdzielczości); defensywny `Math.floor` liczby i zaciśnięcie zakresów.
- Walidacja: `0 < tabHeight < totalDepth`, `tabCount × tabWidth <` obwód,
  liczba całkowita 1–`MAX_TAB_COUNT` (20) (`isValidTabCount()`); prawdziwe
  wprost, gdy mostki wyłączone. Domyślne rozmiary z Settings → Tabs
  (`defaultTabHeight/Width/Count` = 1/3/3), aplikowane przy każdym
  włączeniu checkboxa.

## Surface (`surface*.ts`)

- Tylko Rectangle Cornered/Centered (Circle odrzucone, `BL-30`), bez
  wysp, bez mostków. Metody: **Zigzag** (ciągły G1 na poziom) i
  **Unidirectional** (retrakt na Safe Z między liniami, rapid w dół do
  `unidirectionalReentryZ()` — `UNIDIRECTIONAL_REENTRY_CLEARANCE` = 0.5 mm
  nad dnem poprzedniego poziomu, nie wyżej niż Safe Z — potem plunge; nie
  toggle Plunge/Helix).
- Kierunek rastra X/Y. **Overtravel o promień narzędzia** zawsze, symetrycznie
  na 4 boki (`surfaceToolBounds()`). Stepover `stepoverPercent` (1–100%,
  źródło prawdy) → mm przez `surfaceStepoverMm()`. Start każdego poziomu w
  rogu min-X/min-Y (`surfaceStartCorner()`). Linie rastra
  `computeLinePositions()` (domknięte do obu krawędzi) /
  `computeRasterLines()` / `zigzagWaypoints()`; limit `MAX_LINES` = 5000.
- **Poziomy Z** (`buildLevelDescents()` — lista `toZ`): poziom 0 od Start Z;
  kolejne: retrakt na Safe Z → `G0` do rogu → `G0` do `levelEntryZ()` (0.5 mm
  nad dnem poprzedniego, `LEVEL_REENTRY_CLEARANCE`, nie wyżej niż Start Z) →
  **Plunge** albo **Helix** (`ZTransitionMode`).
- **Helix wejścia** pod **Ramp Angle** (`rampAngleDeg`, 0.5–30°, domyślnie
  2°): skok `helixPitchForRampAngle()` = `2π·r·tan(kąt)`, niezależnie od
  Stepdown. Kierunek zależy od rastra (`helixDirectionFor()`): `'y'` → CCW
  ze środkiem przesuniętym o `helixRadius` w −X, `'x'` → CW ze środkiem w −Y
  (`helixCenterFor()`) — styczna wyjścia płynnie przechodzi w pierwszą
  linię rastra, a pętla leży poza materiałem. Helix Radius: `> 0`, ≤
  stepover mm; limit obrotów na poziom (`entryHelixExceedsTurnLimit()`).

## Pocket (`pocket*.ts`)

- Kształty Rectangle Cornered/Centered i Circle; metody **Spiral** i
  **Adaptive** (każda dla każdego kształtu), opcjonalny przejazd
  wykończeniowy ścian (niżej), bez mostków. Zapisane dawne `'raster'` nie
  przechodzi strażnika enuma i wczytuje się jako Spiral.
- Czyszczenie zawsze od środka na zewnątrz, CCW (climb). Ściana
  (wykończeniowa) = nominał zainsetowany o promień freza
  (`pocketRectWallHalfDims()`/`pocketCircleWallRadius()`); roughing obu
  metod czyści do **ściany roughingu** (`pocketRoughRectWallHalfDims()`/
  `pocketRoughCircleWallRadius()` = ściana − `pocketStockToLeave()`, 0 gdy
  finishing wyłączony); środek `pocketCenter()` (origin jak
  `rectCorners()`). Stepover jak Surface (`pocketStepoverMm()`).
- **Wejście** w środku kieszeni (`pocketZTransition.ts`): Plunge w środku,
  Helix startuje w `(centerX + helixRadius, centerY)`
  (`pocketEntryPoint()` — pierwszy łuk musi zaczynać się na własnym
  okręgu, inaczej GRBL error 33), pod Ramp Angle, zakończony płaskim
  obrotem czyszczącym na `toZ`. Helix Radius ≤ promień freza i ≤ ściana
  roughingu (`pocketMaxHelixRadius()`) — większy zostawiłby słupek w środku.
- **Poziomy Z** jak Surface (`buildLevelDescents()`/`levelEntryZ()`).

### Spiral (`pocketSpiral.ts`)

- Każdy pierścień = **ramp** (zawsze G1 — dialekt nie ma G2/G3 o
  zmiennym promieniu) + **pełny płaski obrót** (nigdy pomijany).
- **Circle:** kąt rampy per pierścień `rampSweepDegFor()` — stała jest
  **długość łuku** rampy = `RAMP_LENGTH_FACTOR` (3, `BL-41`) × Δr tej
  transycji, dzielona przez średni promień; stosunek Δr/łuk stały na każdym
  promieniu. Sufit 360° defensywny (maksimum realne ≈ 343.8° przy
  `radiusFrom = 0`). Kąt startowy kolejnego rampu = poprzedni + sweep, bez
  zawijania. Pełny obrót respektuje G2/G3 vs G1.
- **Rectangle:** ten sam mechanizm na obwodzie — `fraction` 0–1
  (`rectPointAtPerimeterFraction()`, CCW od lewego dolnego rogu, każdy bok
  = 0.25), `rectRampSweepFor()` (Δ = √(ΔhalfW² + ΔhalfH²), średni obwód,
  ta sama stała, sufit 1 pętli — realnie osiągalny przy starcie od zera).
  `rectRingRampPoints()` interpoluje halfW/halfH/fraction razem, więc ramp
  kończy się gdzie wypadnie (nie w narożniku), a pełne okrążenie
  (`rectFullLapPoints()`) startuje tam, gdzie skończył ramp.
- **Bootstrap bez specjalnych przypadków:** Plunge = pierścień
  `{0, 0}` przy `fraction = 0`; Helix = kwadrat `{helixRadius,
  helixRadius}` przy `RECT_HELIX_ENTRY_FRACTION` (0.375) — środek prawego
  boku = koniec obrotu czyszczącego helixa. Przy Helix pierścienie w
  całości w promieniu helixa są pomijane (`pocketRectRingDims(…,
  helixRadius)`; Circle startuje od `helixRadius` w
  `pocketCircleRingRadii()`).
- Dla `width ≠ height` pierścienie rosną per oś ze wspólnego kroku
  (`computeLinePositions()` na dłuższej połówce), oś, która osiągnie cel,
  jest zaciskana. Początkowe `(0,0)` z `computeLinePositions()` odrzucane.

### Adaptive (`pocketAdaptive.ts`, `pocketAdaptiveMath.ts`)

Stałe zaangażowanie liczone analitycznie (wzory zamknięte + bisekcja), bez
symulacji materiału.

- **Optimal Load** w % średnicy (`optimalLoadPercent`, 1–30%, domyślnie
  10%, źródło prawdy) ↔ mm; kąt `θ* = arccos(1 − 2·%/100)`
  (`engagementAngleFor()`). **Chip thinning** `1/sin θ*`
  (`chipThinningFactor()`, `chipThinnedFeed()`); baza posuwu
  `pocket.chipThinningBaseFeed` (Apply ją ustawia, ręczna edycja Feed XY
  kasuje, tolerancja „już skompensowany” ±5% `CHIP_THINNING_TOLERANCE`).
- **Wejście zawsze Helix** (`effectivePocketZTransitionMode()`), pod Ramp
  Angle. Helix Radius jak każdy w Pocket + podpowiedź, gdy < 25% D.
- **Fazy na poziom:** **A** — okręgi od `helixRadius` do krótszego wymiaru
  (Circle: do ściany), odstęp `nextConstantEngagementRadius()` dla
  `0.8·θ*`, spiralny ramp G1 (2°/odcinek) dokładający ≤ `0.2·θ*`, pełny
  obrót po każdym; **B** — tylko prostokąt niekwadratowy: rozciąganie
  wzdłuż dłuższej osi półłukami, każdy koniec osobno (cięcie wzdłuż ściany
  → półłuk → przejazd łączący przez wycięte koło); **C** — narożniki
  osobno, ćwierćłuki o malejącym promieniu do ostrego narożnika, na końcu
  prosty ruch w róg; kolejność narożników zgodna z kierunkiem cięcia.
- Kroki B/C: `largestStepWithin()` (bisekcja) tak, żeby
  `maxArcEngagement()` (zaangażowanie wzdłuż całego łuku, z odchyleniem
  kierunku ruchu) ≤ `θ*`; liczone raz na ścieżkę. Model trzyma `θ*` z
  dokładnością ~2–3° względem symulacji; w G1 łamana dodaje do ½ kąta
  odcinka.
- **Kierunek** Climb (CCW, domyślnie) / Conventional (CW), jednolity.
  **Przejazdy łączące** zawsze G1 z **Linking Feed** (`linkingFeed`), nigdy
  G0 poniżej Safe Z. **Bez retraktu między poziomami** — powrót do startu
  helixa na Linking Feed; retrakt dopiero na końcu. Stepdown: podpowiedź
  przy < 1×D, Apply = 1.5×D (`suggestedAdaptiveStepdown()`).
- `adaptiveExceedsLimits()` — czy któraś pętla trafiłaby w limit
  bezpieczeństwa (liczy tylko sekwencje).

### Finishing Pass (`pocketFinish.ts`)

- `finishingEnabled` + `stockToLeave` (mm, domyślnie 0.3) + `finishFeed`
  (Krok 3). Tylko ściany — dno zawsze do `-totalDepth`.
- `appendPocketFinish()` po **całym** roughingu (Spiral w tym samym
  builderze, Adaptive przez `pocketFinishMoves()` doklejane do jego listy):
  retrakt Safe Z → `G0` nad start lead-in → `G0` Start Z; na każdy poziom
  `buildLevelDescents()`: plunge do `toZ` (w wyciętym obszarze), lead-in,
  pełne okrążenie ściany wykończeniowej, lead-out, prosty powrót do startu
  lead-in (poza ostatnim poziomem — końcowy retrakt startuje z końca
  lead-outu) — bez retraktu między poziomami. Wszystko ruchami `finish`.
- Wejście: środek dłuższego boku (prostokąt; przy równych — dolny) albo
  punkt 0° (okrąg). Kierunek: Spiral CCW, Adaptive wg `cutDirection`.
  Okrążenie prostokąta po narożnikach (G1), okręgu pełnym łukiem (G2/G3
  wg przełącznika).
- Lead-in/out: ćwierćłuk styczny o promieniu jak najbliżej promienia
  freza, w przedziale, w którym oba końce leżą w obszarze roughingu
  (`quarterLeadRange()`); gdy przedział pusty — półłuk ze środka kieszeni
  (wraca do środka, bez powrotu prostego).
- Walidacja: `isPocketStockToLeaveValid()` (`0 < stock ≤ D/2`, ściana
  roughingu > 0), `isPocketFinishFeedValid()`; obie prawdziwe przy
  wyłączonym.

## Walidacja (`validation.ts`)

- `OPERATION_RULES` — rejestr per operacja (walidacja Generate, głębokość,
  mostki, footprint do ostrzeżeń o maszynie, `rampDescent()`/
  `descentAngleDeg()`, `engagement()` dla Feedrate Calculator).
  `rampDescent()` — helix/rampa Hole(s)/Outline aktywnej metody (`unit`
  turn/lap, długość ścieżki, `pitch`, Stepdown, głębokość, kąt) wprost z
  `holeCircleOptions()`/`circleOutlineOptions()`/`rectOutlineOptions()`;
  z niego walidacja, ostrzeżenia i read-only Pitch w Kroku 2. `isWizardParamsValid()` — cała reguła Generate (i live-save
  Edit Mode), jedno źródło prawdy dla `App.tsx` i testu niezmienników.
- Blokujące (inline error w Kroku 2/3): frez ostro mniejszy od
  otworu/krótszego boku (`isToolDiameterValid`, `isOutlineToolDiameterValid`,
  `isSurfaceToolDiameterValid`, `isPocketToolDiameterValid`), Stepdown, Safe
  Z/Feed XY/Plunge > 0, wymiary i głębokość > 0 (`is*SizeValid`), Start Z
  powyżej dna cięcia (z mostkami — powyżej pasma; `minStartZ()`/
  `isStartZAboveCut()`), mostki, stepover, Helix Radius, Ramp Angle
  (Hole(s)/Outline: `isRampAngleValid()`, limit obrotów
  `isRampTurnCountWithinLimit()`),
  Optimal Load, Linking Feed, `MAX_CIRCLE_HOLE_COUNT`, Custom List, limity
  pętli (`isPassCountWithinLimit`, `isSurfaceLineCountWithinLimit`,
  `isPocketToolpathWithinLimits` — ścieżka nie może trafić w limit, bo
  zostałaby obcięta).
- Nieblokujące: `feedsWarnings()` (Start Z < 0), `descentWarnings()` (kąt
  zejścia helixa/rampy > `MAX_RECOMMENDED_DESCENT_DEG` = 10° — przy
  Hole(s)/Outline z efektywnego skoku, więc tylko przy Ramp > 10°; oraz
  `rampTurnsPerStepdown()` > `MAX_RECOMMENDED_TURNS_PER_STEPDOWN` = 10 —
  mały promień helixa, sugestia metody Standard),
  `isPocketHelixRadiusSmall`, `isAdaptiveStepdownShallow`,
  `machineFitWarnings()` (rozpiętość wzorca/głębokości > skok maszyny —
  `patternSpan()`/`zSpan()`, footprinty per operacja; steruje kolorem
  Badge Kroku 4, nie blokuje).
- `isToolDiameterEntryValid()`/`MAX_TOOL_DIAMETER_COUNT` — tylko przycisk
  "Add" w Settings → Tool Diameters.
- Limity pętli: `MAX_PASSES` = 5000 (`depthPasses.ts`,
  `computeDepthPasses()` — jedyne dzielenie głębokości przez Stepdown,
  fallback na jedno przejście przy `stepdown <= 0`), `MAX_LINES` = 5000
  (raster) — ochrona podglądu przed zamrożeniem, walidacja blokuje Generate
  wcześniej.

## localStorage (`storage.ts`, `*Storage.ts`)

- `simplecam.storage`: `{ version, slots: { "0"…"5" } }`. Slot `"0"` =
  auto-save przy **Generate**, wczytywany przy starcie (wizard otwiera się
  na Kroku 4 z bannerem "Restored from your last session"); `"1"`–`"5"` =
  presety. `mergeSection()` — merge per pole z `DEFAULT_WIZARD_PARAMS`:
  typ jak domyślny, enum ze znanych wartości, nieznane klucze odrzucane;
  stare zapisy bez `customPointsText` dostają tekst z punktów.
  `clearAllSlots()` czyści też slot `"0"`.
- Osobne klucze: `simplecam.machine` (`machineStorage.ts`, każde pole
  sprawdzane), `simplecam.appearance` (`appearanceStorage.ts`),
  `simplecam.toolDiameters` (`toolDiameterStorage.ts`, całość z fallbackiem),
  `simplecam.feedCalc` (`feedCalcStorage.ts`: materiał, liczba ostrzy
  całkowita 1–6, Carbide/HSS). Błędy I/O — cichy fallback + `console.warn`.
- `presetLabel()` — auto-opis slotu (pattern/kształt najpierw, metoda
  potem). `toolDiameterOptions.ts::resolveToolDiameterSelectOptions()` —
  dokleja do listy bieżącą średnicę, gdy nie ma jej na liście.

## Feedrate Calculator — model (`feedCalc.ts`)

`computeFeeds()`: RPM = środek zakresu Vc materiału (HSS × 0.4) × 1000 /
(π·D), do 100, docięty do [Min RPM, Max RPM]; fz = tabela 3/6/8+ mm
(liniowo pomiędzy, proporcjonalnie poniżej 3 mm, stałe powyżej 8 mm) ×
sztywność (Light 0.75 / Medium 1 / Rigid 1.25), chyba że wpisane; chip
thinning `1/sin θ` tylko dla szerokości < 50% D (szczelina = 1); Feed =
RPM × z × fz × chip thinning. Powyżej Max Feed — najpierw RPM w dół (nie
poniżej Min RPM), potem docięcie posuwu. Plunge = posuw bez chip thinning
× współczynnik materiału; Stepdown = D × `ap` (szczelina / stepover /
Adaptive) × sztywność (Adaptive bez sztywności), siatka 0.05 mm; Linking
Feed = 2 × Feed (≤ Max Feed). Pocket Finishing Pass: Stock to Leave =
`finishStock` materiału [mm] ≤ D/2, siatka 0.05 (`suggestedFinishStock()`);
Finish Feed = RPM × z × fz × chip thinning dla szerokości = Stock to Leave
w mocy (`FeedCalcInput.finishStock`), ≤ Max Feed. Rodzaj zaangażowania z
`OPERATION_RULES[op].engagement()`: Hole(s)/Outline — szczelina,
Surface/Pocket Spiral — stepover, Adaptive — Optimal Load.
`effectiveChipLoad()` — rzeczywiste fz w Kroku 2.

## Inne

- `format.ts` — liczby w G-code: 4 miejsca, bez zbędnych zer i `-0`.
- `download.ts::buildFilename()` — `op-<pattern|shape slug>-<data>.gcode`.
- `overlayStock.ts` — wspólna podkładka Overlay dla obu podglądów:
  `stockVoids()` (pustki presetu albo `null` dla litej bryły),
  `overlaySheetVoids()`, `sheetMinusVoids()` (arkusz minus suma pustek,
  `polygon-clipping`, okręgi po 72 odcinki).
- `overlayParams.ts::deriveOverlayParams()` — parametry nałożonych presetów
  w stałej kolejności `[1]…[5]`; bez zaznaczeń zawsze ta sama zamrożona
  pusta tablica (nowa referencja = zmiana selekcji dla podglądów).

## Testy

- Vitest (`*.test.ts`). `gcodeInvariants.test.ts` — test właściwościowy:
  losowe parametry (`fuzzParams.ts`, deterministyczny PRNG) przechodzące
  `isWizardParamsValid()` muszą dać G-code spełniający niezmienniki (G0 w
  XY tylko na Safe Z, F > 0, brak NaN, najniższe Z = −totalDepth, spójne
  łuki, brak łuków przy G1 w Kroku 4, ostatnia linia M30/M2, ścieżka w
  granicach Surface/ścian Pocket; roughing Pocket w ścianie roughingu, a
  finishing dotyka ściany — na liście ruchów). `GCODE_FUZZ_SCALE`/
  `GCODE_FUZZ_SEED`.
- `gcodeTestUtils.ts::arcRadiusMismatches()` — spójność G2/G3 (GRBL error
  33). `pocketAdaptiveSim.ts` — symulacja materiału na siatce (tylko
  testy).
- Przy refaktorze silnika: nagrać wzorzec G-code z `fuzzParams.ts` przed
  zmianą i porównać znak po znaku po zmianie.
