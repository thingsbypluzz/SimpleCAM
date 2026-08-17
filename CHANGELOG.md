# Changelog

Wszystkie znaczące zmiany w projekcie SimpleCAM są odnotowywane w tym pliku.
Format bazuje na [Keep a Changelog](https://keepachangelog.com/), wersjonowanie
zgodne z [SemVer](https://semver.org/). Ten plik pozostaje głównym, czytelnym
źródłem historii zmian — projekt ma teraz repo git (GitHub:
thingsbypluzz/SimpleCAM), ale to infrastruktura pod izolację pracy
(branch/worktree per zadanie), nie zamiennik tego changeloga.

## [Unreleased] — Geometry Offset X/Y

### Dodano

- **Globalny offset X/Y w Kroku 2 (Geometry)** — dwa nowe pola na samym
  dole kroku (`offsetX`, `offsetY` w `GeometryParams`, dowolne wartości,
  domyślnie `0`), przesuwające **cały** wzorzec otworów jednolicie,
  niezależnie od trybu pozycjonowania (Single/Grid/Custom — i każdego
  przyszłego trybu za darmo).
  - Wpięty jako jeden krok post-processingu **wewnątrz** `resolvePoints()`
    (`src/lib/positioning.ts`) — dodawany do każdego punktu tuż przed
    `return`. Silnik G-code, 2D Preview i 3D Preview wołają
    `resolvePoints()` bezpośrednio, więc żadne z nich nie wymagało zmian
    poza samym dodaniem offsetu do modelu danych.
  - Dla Custom List offset przesuwa cały zestaw punktów jednolicie
    (traktowany jako przesunięcie punktu `0,0`).
  - Fizyczny origin i osie X/Y w podglądach **nie** przesuwają się — to
    stały punkt odniesienia maszyny, niezależny od tego gdzie leżą otwory
    (ta sama zasada co przy Grid/Custom od dawna).
- **Adnotacja offsetu w zwiniętym pasku Kroku 2** — nowa ikona
  `OffsetIcon` (crosshair + strzałka, `src/components/icons.tsx`,
  narysowana w spoczynku pod 45°/ćwiartka I, obracana dynamicznie o
  `realAngle − 45°` przez `atan2(offsetY, offsetX)`) + wartość tekstowa
  `(X;Y)mm` — widoczna **tylko gdy offset ≠ (0,0)**, jako 2. pozycja (pod
  pigułką trybu pozycjonowania, nad BIT/HOLE/DEPTH).
- **Wektor offsetu w 2D i 3D Preview** — linia od `(0,0)` do
  `(offsetX,offsetY)` z grotem strzałki, w nowym kolorze **amber**
  (`#d97706` light / `#fbbf24` dark, zgodnie z istniejącym wzorcem
  `-600`/`-400`) — świadomie inna rodzina kolorów niż czerwona oś X /
  zielona oś Y / indigo origin, bo to adnotacja "meta" (przesunięcie
  układu), nie fizyczna oś czy ścieżka cięcia. Widoczna tylko gdy offset
  ≠ (0,0). 3D Preview reużywa istniejący `createArrowhead()` (już
  przyjmował dowolny kierunek, nie tylko osiowy — zero nowego kodu do
  grotu). 2D Preview dostał nową, generyczną `drawArrowhead()` (poprzednie
  groty osi X/Y były zahardkodowane pod kątem prostym, offset wymaga
  dowolnego kąta).

## [0.6.11] — 2026-08-17

### Dodano

- **"Start Z" dla obu operacji (Helix i Standard Hole)** — nowe pole
  `startZ` w `FeedsParams` (Krok 3, pod Plunge Rate), zawsze ≥0, domyślnie
  `0`. Semantyka: `startZ` "powiększa" obrabiany element — materiał
  traktowany jest jako wyższy o `startZ` (góra cięcia w `Z=+startZ`
  zamiast `Z0`), a dno cięcia zostaje bez zmian na `-totalDepth`. Czysto
  addytywne — przy `startZ=0` generowany G-code jest identyczny jak przed
  wprowadzeniem tej funkcji.
  - Wspólna funkcja `rapidToTop()` w `src/lib/program.ts` (używana przez
    oba silniki, zastąpiła zduplikowane `'G0 Z0'` w
    `helix.ts`/`standardHole.ts`) — zawsze `G0 Z<startZ>`: nad `+startZ`
    jest tylko powietrze, więc rapid jest zawsze bezpieczny, niezależnie
    od wartości.
  - Oba silniki liczą przejścia jako `computeDepthPasses(totalDepth +
    startZ, stepdown)`, startując od `currentZ = startZ` zamiast `0` —
    spirala/przejścia realnie pokonują `startZ + totalDepth` w pionie.
  - 3D Preview (`buildScene.ts`) w pełni odzwierciedla tę samą logikę:
    `helixPoints3D`/`standardHolePoints3D` przyjmują `startZ`, cylinder
    finalnego otworu rozciąga się od `+startZ` do `-totalDepth`, a
    przerywana linia zjazdu (Safe Z → góra cięcia) kończy się na
    `+startZ` zamiast zawsze na `Z0`.
  - Walidacja `isStartZValid()` (`startZ ≤ safeZ`) w `src/lib/validation.ts`
    — inline error w Kroku 3, blokuje **Generate** na Kroku 4 (tak samo jak
    istniejące walidacje). Sensowne również w nowej semantyce: `safeZ`
    musi dawać realny prześwit nad podniesionym materiałem.

### Zmieniono

- **Domyślna interpolacja okręgów zmieniona z G2/G3 (arc) na G1
  (segmented)** — `DEFAULT_WIZARD_PARAMS.output.interpolation` w
  `src/types/wizard.ts`.

## [0.6.12] — 2026-08-17

### Zmieniono

- **Collapsed pasek Kroku 1 pokazuje teraz obie operacje (Helix + Standard),
  nie tylko aktywną — każda z własną etykietą.** Wcześniej pasek renderował
  samo `activeOperation.Icon` + jedną wspólną etykietę aktywnej operacji;
  teraz iteruje po `OPERATION_LIST` (`src/config/operationMeta.ts`) i
  rysuje obie pary ikona+etykieta (`op.shortLabel`) jedną nad drugą
  (pionowo, wąski 80px pasek) — aktywna operacja w pełnym kolorze indigo
  (ikona i etykieta), nieaktywna wyszarzona/przygaszona (`opacity-50`,
  szary zamiast indigo, obie razem). `activeOperation` bez zmian — nadal
  używana do `generate`/`stepdown.shortLabel` — `src/App.tsx`.

## [0.6.10] — 2026-08-17

### Zmieniono

- **2D Preview dostał te same osie X/Y co 3D Preview** — czerwona oś X /
  zielona oś Y (dokładnie te same wartości hex co
  `preview3d/buildScene.ts`'owe `LIGHT_THEME`/`DARK_THEME`), każda z grotem
  strzałki i pogrubioną etykietą na dodatnim końcu. Wcześniej 2D Preview
  miał jedną wspólną, szarą linię osi (`theme.axis`, bez rozróżnienia X/Y,
  bez grotów, bez etykiet) — `src/components/preview/drawToolpath.ts`.
  Pole `axis` w `Theme` zastąpione przez `axisX`/`axisY`.

## [0.6.9] — 2026-08-17

### Zmieniono

- Etykiety osi X/Y w 3D Preview powiększone (sprite `span * 0.06` →
  `span * 0.09`, `buildScene.ts`) — na życzenie użytkownika, słabo czytelne
  przy standardowym oddaleniu.

## [0.6.8] — 2026-08-17

### Naprawiono

- **Cylinder otworu (półprzezroczysta "bańka" pokazująca finalną średnicę)
  w 3D Preview był w złym miejscu po poprawce mapowania z 0.6.7.** Zgłoszone
  ze zrzutem ekranu przez użytkownika: ścieżka helixa (rysowana przez
  `toThree()`) była poprawnie wyrównana z osiami, ale obrys cylindra
  otworu — nie. Przyczyna: `hole.position.set(p.x, -totalDepth/2, p.y)` w
  `buildScene.ts` ręcznie odtwarzał STARE mapowanie (`Three.z = CNC.y`
  wprost, bez negacji) zamiast wołać `toThree()` — jedyne miejsce w pliku
  poza grotem strzałki osi Y (już poprawionym w 0.6.7), które tego nie
  robiło. Fix: `hole.position.copy(toThree(p.x, p.y, -totalDepth/2))`.

### Zmieniono

- **Domyślny kąt widoku Isometric przesunięty znad ćwiartki IV (+X,-Y)
  znad ćwiartkę III (-X,-Y)**, na prośbę użytkownika — obrabiane elementy
  najczęściej leżą w ćwiartce I (+X,+Y), więc kamera patrząca znad
  przeciwległej ćwiartki III daje widok "przez" obszar roboczy zamiast
  "zza" niego. `VIEW_PRESETS.isometric.direction` w `cameraPresets.ts`:
  składowa X zmieniona z `1` na `-1` (`(-1, 0.85, 1)` zamiast
  `(1, 0.85, 1)`) — kierunek "patrzy w stronę +Y" (decyzja z 0.6.3) bez
  zmian.

## [0.6.7] — 2026-08-17

### Naprawiono — prawdziwa przyczyna serii bugów 3D Preview (Top/Isometric)

- **0.6.6 naprawiła X/Y w widoku Top kosztem osi Z — spirale helixa
  wizualnie "wystawały" ponad płaszczyznę materiału zamiast się w nią
  wcinać.** Zgłoszone przez użytkownika po przetestowaniu 0.6.6. Przyczyna:
  0.6.6 przestawiła `direction` presetu Top na `(0,-1,0)`, czyli kamerę
  fizycznie POD materiał (w przestrzeni Three) patrzącą w górę — to
  naprawiało X/Y na ekranie, ale odwracało też sens głębi: cięcia
  schodzące głębiej (bardziej ujemne Z) zbliżały się do kamery zamiast się
  od niej oddalać, co perspektywicznie wygląda jak "wyrastanie" z materiału
  do góry zamiast wcinania się w dół.
- **Rzeczywista przyczyna, znaleziona na żądanie użytkownika po
  dokładniejszej analizie:** mapowanie CNC→Three w `buildScene.ts`
  (`(x,y,z) → (x,z,y)`, zamiana Y↔Z) to permutacja **odwracająca
  chiralność** (transpozycja dwóch osi, wyznacznik -1). Baza kamery
  budowana przez `lookAt()` w Three.js jest zawsze prawoskrętna (iloczyn
  wektorowy), więc w tej "lewoskrętnej" (pod maską) przestrzeni **każdy**
  preset kamery renderuje jedną oś ekranu jako lustrzaną względem naiwnych
  oczekiwań z przestrzeni CNC — nie tylko Top. Matematycznie sprawdzone
  podstawieniem: **Isometric miał dokładnie ten sam problem** (oś "prawo"
  na ekranie wychodziła jako CNC(-1,-1,0) zamiast oczekiwanego CNC(+1,+1,0))
  — po prostu mniej rzucający się w oczy niż w Top, bo nie ma bezpośredniego
  odniesienia (jak porównanie z płaskim 2D Preview). Front/Side wcześniej
  "przypadkiem" renderowały się poprawnie — ich konkretny wybór
  `direction`/`up` akurat trafiał na tę stronę odwrócenia, która daje
  sensowny obraz.
- **Fix u źródła, nie po presetach:** `toThree()` w `buildScene.ts` zmienione
  z `(x,y,z) → (x,z,y)` na `(x,y,z) → (x,z,-y)` — jedna negacja przywraca
  mapowanie zachowujące chiralność (nie tylko przesuwa CNC-Y w slot Three-Z,
  ale też je neguje), więc standardowa, prawoskrętna matematyka `lookAt()`
  daje poprawny wynik dla KAŻDEGO presetu bez żadnych sztuczek typu
  przestawianie kamery na "złą" stronę. Wszystkie 4 presety w
  `cameraPresets.ts` przeliczone od zera z czystej matematyki CNC i
  zweryfikowane podstawieniem do wzorów iloczynu wektorowego (nie tylko
  wizualnie):
  - `top`: `direction (0,1,0)` (kamera z powrotem NAD materiałem — poprawna
    głębia), `up (0,0,-1)`.
  - `front`: bez zmian liczbowych — `direction (0,0,1)`, `up (0,1,0)`
    (renderowały się poprawnie już wcześniej, przypadkiem).
  - `side`: `direction` ze znakiem odwróconym, `(-1,0,0)` zamiast
    `(1,0,0)` — zachowuje dokładnie ten sam, dotychczas poprawny obraz.
  - `isometric`: `direction (1, 0.85, 1)` zamiast `(1, 0.85, -1)` — sama
    składowa Z zmienia znak (bo tylko ona niesie informację o CNC-Y w
    starym mapowaniu), reszta (`up`, kierunek "patrzy w +Y") bez zmian.
  - Dodatkowo poprawiony hardkodowany kierunek grotu strzałki osi Y
    (`createArrowhead` w `buildScene.ts`) — to jedyne miejsce w scenie,
    które nie przechodzi przez `toThree()`, więc wymagało ręcznej
    synchronizacji ze zmianą znaku.

## [0.6.6] — 2026-08-17 (niepełna poprawka, patrz 0.6.7)

### Naprawiono

- **0.6.5 naprawiła tylko połowę buga "Top" — X został jeszcze bardziej
  odwrócony.** Zgłoszone przez użytkownika ze zrzutami ekranu (2D Preview
  vs 3D Top view dla custom punktów `-10,2` i `10,10`): po 0.6.5 oś Y była
  już poprawna, ale X pokazywał lustrzane odbicie.
  - **Rzeczywista przyczyna** (głębsza niż zwykły zły znak): mapowanie
    CNC→Three w `buildScene.ts` (`(x,y,z) → (x,z,y)`, zamiana Y↔Z) to
    permutacja **odwracająca chiralność** (transpozycja dwóch osi = wyznacznik
    -1). Trójki `lookAt()` w Three.js są zawsze prawoskrętne (iloczyn
    wektorowy), więc dla widoku patrzącego dokładnie wzdłuż zamienionej osi
    (Top patrzy wzdłuż CNC Z = Three Y — dokładnie tej pary, którą zamieniono)
    nie istnieje żaden wybór `up`, który da jednocześnie poprawny **X w prawo
    i Y w górę** — jeden z nich zawsze wyjdzie lustrzany, niezależnie od znaku.
    Matematycznie wymagane jest ustawienie kamery po **przeciwnej stronie**
    (w przestrzeni Three) niż naiwnie by się wydawało. Front/Side nie mają
    tego problemu, bo patrzą wzdłuż osi, która nie brała udziału w zamianie
    Y↔Z.
  - **Fix:** `VIEW_PRESETS.top.direction` w
    `src/components/preview3d/cameraPresets.ts` zmienione z `(0,1,0)` na
    `(0,-1,0)` (obok `up: (0,0,1)` z 0.6.5) — kamera w przestrzeni Three
    siedzi teraz "pod" materiałem patrząc w górę, co matematycznie daje
    poprawne obie osie naraz na ekranie. Nie powoduje artefaktów renderowania:
    płaszczyzna materiału i cylindry otworów są `THREE.DoubleSide`, etykiety
    to sprite'y (zawsze zwrócone do kamery), a strzałki osi/origin to
    wypukłe bryły widoczne poprawnie z dowolnej strony.
  - **Nieprawdziwe (uzupełnienie post factum)** — X/Y faktycznie się
    naprawiły, ale przestawienie kamery pod materiał odwróciło percepcję
    głębi Z (cięcia wizualnie "wyrastały" z materiału zamiast się w niego
    wcinać) i nie objęło Isometric, który miał ten sam bug w utajonej
    formie. Patrz 0.6.7 dla poprawki u źródła.

## [0.6.5] — 2026-08-17 (niepełna poprawka, patrz 0.6.6)

### Naprawiono

- **3D Preview, widok "Top" miał odwrócone osie na ekranie.** X rosnące
  teraz idzie w prawo, Y rosnące w górę ekranu (standardowy układ maszyny
  patrzącej od przodu). Fix: `VIEW_PRESETS.top.up` w
  `src/components/preview3d/cameraPresets.ts` zmienione z `(0,0,-1)` na
  `(0,0,1)` — jedna zmiana znaku naprawiła obie osie naraz (sprzężone
  przez iloczyn wektorowy przy budowie bazy kamery w `lookAt`). Dotyczyło
  tylko presetu Top; Isometric/Front/Side (`up = (0,1,0)`) nie były
  dotknięte.
  - **Nieprawdziwe** — naprawiło tylko Y, złamało X w drugą stronę. Patrz
    0.6.6 dla rzeczywistej przyczyny i poprawki.

## [0.6.4] — 2026-08-17

### Zaplanowano (bug do naprawy, dopisane do Etapu 5)

- **3D Preview, widok "Top" ma odwrócone osie na ekranie.** Powinno być:
  X rosnące → w prawo, Y rosnące → w górę ekranu (standardowy układ
  maszyny patrzącej od przodu). Obecnie obie osie są odwrócone.
  Zdiagnozowane: `VIEW_PRESETS.top.up` w `cameraPresets.ts` ma zły znak
  (`(0,0,-1)` zamiast `(0,0,1)`) — jedna zmiana znaku naprawia obie osie
  naraz. Szczegóły w `CLAUDE.md`.

## [0.6.3] — 2026-08-17

### Zmieniono — 3D Preview

- Osie X/Y dostały grot strzałki (`createArrowhead()`) i etykietę tekstową
  ("X"/"Y") na dodatnim końcu — wcześniej linie osi nie pokazywały kierunku,
  tylko orientację.
- Domyślny widok Isometric (i tym samym Fit View bez wcześniejszej rotacji)
  patrzy teraz w kierunku **+Y** zamiast -Y — poprawiony znak składnika
  CNC-Y w `VIEW_PRESETS.isometric.direction` (`cameraPresets.ts`).

### Zaplanowano (poza Etapem 5 — nowa sekcja "Pomysły na przyszłość")

- Nowa operacja **Rectangle Cut Out**: tryb cięcia Inside/Outside/On-line,
  opcjonalne tabs (mostki podtrzymujące), punkt odniesienia prostokąta
  (środek albo lewy dolny róg). Większe rozszerzenie zakresu — nie zaczynać
  bez wyraźnego polecenia.

## [0.6.2] — 2026-08-17

### Dodano — 3D Preview: dopracowanie

- **Przyciski widoku:** Top, Isometric, Front, Side + Fit View. Presety
  ustawiają kamerę pod konkretnym kątem i dopasowują odległość do
  geometrii (`src/components/preview3d/cameraPresets.ts`); **Fit View**
  robi to samo, ale zachowując aktualny kąt kamery (dopasowuje
  odległość/target bez "przeskoku" widoku).
- **Domyślny widok = dopasowany Isometric** — ustawiany raz przy pierwszym
  zbudowaniu sceny (jak dotychczas), teraz przez wspólną `frameCamera()`.
- **Osie X (czerwona) / Y (zielona)** przechodzące przez fizyczny punkt
  (0,0) — niezależnie od tego, gdzie akurat leżą otwory (Grid/Custom mogą
  być daleko od origin). Etykieta "0,0" jako sprite z teksturą canvas
  (bez dodatkowej zależności).
- **Brakujące linie wysuwu narzędzia** — poprzednio widoczne było tylko
  boczne przemieszczanie między otworami (G0 XY na Safe Z), bez pionowych
  ruchów `G0 Z`. Dodano przy każdym otworze: zjazd z Safe Z na powierzchnię
  materiału przed cięciem oraz wyjazd z pełnej głębokości z powrotem na
  Safe Z po — tym samym stylem (przerywana linia) co przejazdy boczne.

## [0.6.1] — 2026-08-17

### Naprawiono

- **Zawieszanie zakładki przy `Stepdown/Pitch = 0`.** Pętla dzieląca
  głębokość na przejścia (`Math.min(stepdown, remaining)`, potem
  `remaining -= turnDepth`) nigdy nie zmniejszała `remaining` gdy
  `stepdown` wynosił 0 — nieskończona pętla blokująca główny wątek.
  Ponieważ podgląd 2D/3D jest live (przelicza się na każde naciśnięcie
  klawisza), wystarczyło przejściowo wpisać `0` w polu (np. kasując pole
  przed wpisaniem `0.1`), żeby zawiesić kartę — bez potrzeby klikania
  Generate.
  - Naprawa **w silniku, nie w UI**: debounce/blur na polu albo slider z
    minimum > 0 tylko odsuwałyby moment wystąpienia (np. przy Backspace
    do pustego pola), nie usuwałyby przyczyny.
  - Nowy `src/lib/depthPasses.ts` — `computeDepthPasses(totalDepth, stepdown)`,
    jedyne miejsce liczące podział na przejścia, z twardym limitem 5000
    przejść i fallbackiem na jedno pełne przejście gdy `stepdown <= 0`
    (obejmuje też `0`, wartości ujemne i `NaN`). Używane przez
    `generateHelix`/`generateStandardHole` ORAZ przez podgląd 3D
    (`buildScene.ts`) — wcześniej ta sama zapętlona logika była
    duplikowana w 3 miejscach, teraz jest w jednym.
  - Nowa walidacja `isStepdownValid()` (`src/lib/validation.ts`) — inline
    error w Kroku 3, blokuje **Generate** na Kroku 4 (tak samo jak
    istniejąca walidacja narzędzie/otwór).

## [0.6.0] — 2026-08-17

### Dodano — Etap 4: wizualizator 3D

- Trzecia zakładka **3D Preview** w prawym panelu (obok 2D Preview /
  G-Code), oparta na Three.js.
- `src/components/preview3d/`:
  - Płaszczyzna materiału na `Z=0` + siatka odniesienia.
  - Dla każdego otworu: półprzezroczysty cylinder finalnej średnicy
    (`D_hole`) na pełną głębokość + rzeczywista ścieżka narzędzia w 3D
    (spirala dla Helix, schodkowe pierścienie dla Standard Hole) —
    geometria liczona równolegle do silnika G-code (ten sam wzór na
    promień/stepdown, inny format wyjścia: `Vector3[]` zamiast stringów).
  - Przejazdy szybkie (G0) między otworami na wysokości Safe Z.
  - **OrbitControls** (obrót/pan/zoom myszką) + przycisk **Fit View** do
    ręcznego dopasowania kamery. Kamera auto-dopasowuje się tylko przy
    pierwszym zbudowaniu sceny — kolejne zmiany parametrów nie zrzucają
    widoku użytkownikowi w trakcie edycji.
  - Motyw jasny/ciemny, jak pozostałe podglądy.
- **Three.js ładowany leniwie** (`React.lazy` + `Suspense`) — biblioteka
  (~550KB) trafia do osobnego chunka pobieranego dopiero po otwarciu
  zakładki 3D, więc nie obciąża startowego bundle'a (główny plik JS wrócił
  do ~217KB po tej zmianie, zamiast ~764KB gdyby Three.js był bundlowany
  na sztywno).
- Jak 2D Preview: zawsze live (bez wymogu klikania Generate) — to widok
  poglądowy/read-only.

## [0.5.1] — 2026-08-17

### Zaplanowano (dopisane do Etapu 5)

- Rectangular Grid: nowa opcja "centered at 0,0" (0,0 w środku prostokąta,
  obok obecnego zachowania z 0,0 w rogu).
- Ikony w podsumowaniu Kroku 2 zamiast/obok tekstu: crosshair dla Single,
  prostokąt z większym punktem w rogu/środku dla Rectangle (zależnie od
  wariantu origin), delikatne osie X/Y z kropką dla Custom.
- Krok 1: zwinięty pasek ma pokazywać obie opcje operacji naraz (wybrana
  pełny kolor, niewybrana wyszarzona), nie tylko aktywną.
- Domyślna interpolacja okręgów zmieniona z G2/G3 (arc) na G1 (segmented).

## [0.5.0] — 2026-08-16

### Dodano — Etap 5 (częściowo)

- Tool Diameter (Krok 2) jako dropdown: 1–8mm (całe mm) + 1/8" (3.175mm) i
  1/4" (6.35mm), zamiast wolnego pola liczbowego.
- Walidacja `isToolDiameterValid()` (`src/lib/validation.ts`, z testami) —
  komunikat błędu pod polami w Kroku 2, przycisk **Generate** na Kroku 4
  zablokowany dopóki narzędzie jest większe niż otwór.
- Podsumowanie Kroku 2 (zwinięty pasek) ma teraz nagłówek z wybranym
  positioning: `0,0` / `RECT X×Y` / `Custom (N)`.

Pozostałe punkty Etapu 5 (Helix "Start from Z", "N-holes on circle",
localStorage, dalszy polish) — jeszcze nie zrobione.

## [0.4.2] — 2026-08-16

### Zaplanowano (dopisane do Etapu 5)

- Helix: opcja **"Start from Z"** — spirala zaczyna schodzić od
  skonfigurowanej wysokości (np. `Z0.5`) zamiast zawsze od `Z0`.
- Krok 2: nowy wariant pozycjonowania **"N-holes on circle"** — liczba
  otworów + średnica okręgu + start angle (kąt pierwszego punktu względem
  osi +X), pozostałe rozmieszczone równomiernie po obwodzie.

## [0.4.1] — 2026-08-16

### Naprawiono

- Pole **Custom List** (Krok 2) nie pozwalało dodać nowej linii — textarea
  była kontrolowana wartością odtworzoną z `formatCustomPoints(parseCustomPoints(text))`
  przy każdym keystroke, a `parseCustomPoints` odfiltrowuje puste linie, więc
  pusta linia po Enterze była natychmiast usuwana i pole "cofało" wciśnięcie
  klawisza. Textarea ma teraz własny lokalny stan surowego tekstu — parsowanie
  do `customPoints` nadal dzieje się przy każdej zmianie (dla podglądu 2D i
  silnika G-code), ale wyświetlana wartość już nie jest z niego odtwarzana.

## [0.4.0] — 2026-08-16

### Dodano — Etap 3: podgląd 2D

- Prawy panel dostał zakładki **2D Preview** / **G-Code** (domyślnie
  2D Preview) zamiast samego podglądu G-code.
- `src/components/preview/` — podgląd 2D na natywnym Canvas 2D API:
  - Siatka z automatycznym doborem "ładnego" kroku (sekwencja 1-2-5) +
    etykiety osi, oś X/Y przez punkt (0,0), oznaczenie origin.
  - Dla każdego otworu: obrys finalnej średnicy (`Hole Diameter`, delikatne
    wypełnienie) oraz ścieżka narzędzia — okrąg o promieniu
    `(D_hole - D_tool) / 2`, czyli dokładnie to, co faktycznie jedzie w
    G-code (reużywa `resolvePoints()` z silnika, żadnej duplikacji
    geometrii).
  - Przejazdy szybkie (G0) między otworami jako przerywana linia — widać
    kolejność cięcia przy Grid/Custom List.
  - Motyw jasny/ciemny, automatyczne skalowanie/centrowanie i responsywność
    (`ResizeObserver` + obsługa `devicePixelRatio` dla ostrego rysowania).
- **2D Preview jest zawsze live** (aktualizuje się przy każdej zmianie
  parametru) — w odróżnieniu od zakładki G-Code, która nadal wymaga
  kliknięcia Generate na Kroku 4. To świadoma asymetria: 2D Preview to
  widok poglądowy/read-only, więc nie ma ryzyka użycia "nieaktualnych
  danych" (to dotyczy tylko Copy/Download, które operują na eksportowanym
  artefakcie).

## [0.3.4] — 2026-08-16

### Naprawiono

- Rozwinięty panel aktywnego kroku nie miał prawej krawędzi (`border-r`),
  przez co wizualnie zlewał się z paskiem podsumowania kolejnego kroku.

## [0.3.3] — 2026-08-16

### Zmieniono

- **Wszystkie 4 kroki akordeonu są teraz widoczne od razu** zamiast
  odsłaniać się progresywnie w miarę postępu — tylko aktywny krok jest
  rozwinięty, reszta zawsze zwinięta do pasków z podsumowaniem. Klik w
  dowolny pasek (także "do przodu", np. od razu na Krok 4) przełącza
  aktywny krok — nie ma już wymogu przejścia sekwencyjnego.
- Usunięto stan `maxStepReached` (niepotrzebny — widoczność i nawigacja
  już od niego nie zależą).

## [0.3.2] — 2026-08-16

### Zmieniono

- Przycisk **Generate** przeniesiony z nagłówka prawego panelu na
  **Krok 4** (nad Copy/Download) — wcześniej był dostępny z każdego kroku,
  co pozwalało wygenerować G-code z niedokończonymi/domyślnymi parametrami
  zanim użytkownik w ogóle przeszedł przez wizard.
- **Dark mode jest teraz domyślny** (niezależnie od preferencji systemowej
  przeglądarki) — toggle w nagłówku nadal pozwala przełączyć na light.

### Zaplanowano (dopisane do Etapu 5)

- Podsumowanie Kroku 2 (zwinięty pasek) ma dostać nagłówek z wybranym
  reference pointem: `0,0` / `RECT (X × Y)` / `Custom`.

## [0.3.1] — 2026-08-16

### Zmieniono

- G-code w prawym panelu **nie generuje się już na bieżąco** przy każdej
  zmianie parametru — wymaga kliknięcia przycisku **Generate** (w
  nagłówku panelu podglądu). Każda kolejna zmiana parametru czyści
  wygenerowany snapshot, więc nie da się przypadkiem skopiować/pobrać
  nieaktualnego kodu po edycji, którą zapomniano zatwierdzić.
- Copy to clipboard / Download .gcode file na Kroku 4 są zablokowane
  dopóki nie ma świeżego wygenerowanego snapshotu.

### Zaplanowano (dopisane do Etapu 5)

- Tool Diameter w Kroku 2 jako dropdown: 1–8mm + 1/8" i 1/4" w mm.
- Walidacja: średnica narzędzia nie większa niż średnica otworu.

## [0.3.0] — 2026-08-16

### Dodano — Etap 2: integracja silnika z wizardem

- `OPERATION_META` (`src/config/operationMeta.ts`) dostał pole `generate`
  — wskazuje na `generateHelix`/`generateStandardHole` odpowiednio do
  wybranej operacji. To jedyne miejsce w UI, które woła silnik G-code.
- Prawy panel pokazuje teraz **żywy podgląd G-code** (aktualizuje się
  natychmiast przy każdej zmianie parametru w dowolnym kroku), zamiast
  placeholdera z Etapu 0.
- Krok 4: przyciski **Copy to clipboard** i **Download .gcode file** są
  teraz w pełni funkcjonalne (wcześniej `disabled`).
  - Copy: `navigator.clipboard.writeText`, z chwilowym feedbackiem
    "Copied!" na przycisku.
  - Download: `src/lib/download.ts` — `buildFilename()` generuje nazwę
    `simplecam-<operacja>-<data>.gcode`, `downloadTextFile()` tworzy
    Blob i wyzwala pobranie przez tymczasowy `<a download>`.

## [0.2.0] — 2026-08-16

### Dodano — Etap 1: silnik G-code

- `src/lib/` — silnik generowania G-code jako czyste funkcje TS, odizolowane
  od UI, pokryte 29 testami Vitest (`npm run test`):
  - `generateHelix(params)` — spiralne rampowanie: pełny obrót 360° na
    zadanym stepdown/pitch, powtarzane aż do głębokości, plus płaski
    przebieg wykańczający na dnie.
  - `generateStandardHole(params)` — pion w dół o stepdown, pełny okrąg na
    tej głębokości, powtórz aż do pełnej głębokości.
  - Obie operacje wspierają oba tryby interpolacji z Kroku 4 (G2/G3 — łuki,
    G1 — wielokąt 72 segmentów/5°) przez wspólną `fullCircleMove()`.
  - Obsługują wszystkie 3 warianty pozycjonowania z Kroku 2 (Single/Grid/
    Custom List) przez `resolvePoints()`.
  - Respektują wszystkie checkboxy Kroku 4 (spindle start + dwell, powrót
    do Safe Z + M5, powrót do (0,0)) oraz preambułę `G21 G90 G17`.
  - Ruch między otworami zawsze wraca na Safe Z przed `G0` do kolejnego
    punktu (niezależnie od checkboxów końcowych — to osobna, zawsze
    aktywna zasada bezpieczeństwa).
- Silnik jeszcze **niepodpięty** do wizarda — Krok 4 dalej pokazuje
  placeholder zamiast realnego G-code. To Etap 2.

### Naprawiono

- `.gitignore` nie wykluczał `.claude/` (projekt nie ma gita, więc plik
  nie istniał do tej pory w tej roli) — Tailwind v4 auto-skanował całą
  dokumentację zainstalowanych skilli pod kątem nazw klas, co winduje
  wygenerowany CSS z ~16KB do ~34KB. Dodano `.claude/` do `.gitignore`.

## [0.1.4] — 2026-08-16

### Naprawiono

- Brak spacji między wartością a jednostką w mini-podsumowaniach
  (`3.175mm` → `3.175 mm`).

### Zmieniono

- Etykieta stepdown w zwiniętym pasku Kroku 3 jest teraz dynamiczna:
  **PITCH** dla Helix, **STEP** dla Standard Hole (wcześniej stały tekst
  `"PITCH/STEP"`).
- Nowy rejestr **`src/config/operationMeta.ts`** — jedno źródło prawdy dla
  wszystkiego co zależy od wybranej operacji (nazwa, ikona, etykiety pól
  stepdown). Zastąpił 4 rozproszone `operation === 'helix' ? ... : ...`
  w `Step1Operation.tsx`, `Step3Feeds.tsx` i `App.tsx`.

## [0.1.3] — 2026-08-16

### Zmieniono

- Zwinięty pasek akordeonu poszerzony (64px → 80px), żeby zmieścić
  nagłówki i jednostki.
- Ikony w podsumowaniach Kroku 2/3 powiększone (16px → 24px).
- `MiniStat` dostał nagłówek (`label`) i opcjonalną jednostkę (`unit`):
  Krok 2 → **BIT** / **HOLE** / **DEPTH**, wartości z jednostką `mm`.
  Krok 3 → **FEED** (`mm/min`) / **PITCH/STEP** (`mm`).

## [0.1.2] — 2026-08-16

### Dodano

- Zestaw prostych ikon SVG (`src/components/icons.tsx`): Helix, Standard
  Hole, Bit, Diameter, Depth, Feed, Stepdown, Check — własne, spójne
  stylistycznie z ikonami w nagłówku (bez zależności zewnętrznych).
- Krok 1: karty operacji mają teraz ikonę obok tytułu.
- Zwinięte paski akordeonu pokazują teraz szybkie wizualne podsumowanie
  zamiast samej nazwy kroku:
  - Krok 1 → ikona wybranej operacji (Helix/Standard) + etykieta.
  - Krok 2 → Bit ⌀ / Hole ⌀ / Depth, każda z ikoną i wartością.
  - Krok 3 → Feed / Stepdown, każda z ikoną i wartością.
  - Krok 4 → bez zmian (checkmark + etykieta), nie wymaga podsumowania.
  - Każdy pasek ma pełny opis w atrybucie `title` (tooltip po najechaniu).

## [0.1.1] — 2026-08-16

### Zmieniono

- Layout kroków 1-3 przełączony z siatki/wiersza na pojedynczą kolumnę
  (operacje, pola geometrii, feeds & speeds — wszystko pod sobą), żeby
  wykorzystać wąski panel akordeonu.
- **Cały interfejs użytkownika przetłumaczony na angielski** — SimpleCAM
  jest aplikacją anglojęzyczną; komunikacja projektowa (ten changelog,
  `CLAUDE.md`) zostaje po polsku.
- Nagłówek: pod nazwą aplikacji dodano toggle dark/light mode (w pełni
  działający, przełącza klasę `.dark` na `<html>`, domyślnie zgodny z
  preferencją systemową) oraz przycisk Settings (na razie bez funkcji,
  `disabled`).
- Tailwind przełączony na dark mode sterowany klasą (`@custom-variant dark`)
  zamiast wyłącznie `prefers-color-scheme`, żeby toggle mógł nadpisać
  preferencję systemową.

## [0.1.0] — 2026-08-16

### Dodano — Etap 0: szkielet aplikacji

- Scaffold Vite + React + TypeScript + Tailwind CSS v4.
- 4-krokowy wizard (Operacja → Geometria → Feeds & Speeds → G-Code) jako
  pionowy akordeon: aktywny krok jest rozwinięty, ukończone kroki zwijają
  się do wąskich pionowych pasków z etykietą (klik cofa do dowolnego
  kroku, bez osobnego przycisku "Wstecz"); wspólny stan parametrów
  (`WizardParams`) zachowywany przy nawigacji w obie strony.
- Krok 1: wybór operacji (Helix Hole / Standard Hole) — wybór karty od
  razu rozwija krok 2 (auto-advance).
- Krok 2: parametry geometrii (średnica narzędzia/otworu, głębokość) oraz
  3 warianty pozycjonowania (Single / Rectangular Grid / Custom List).
- Krok 3: parametry skrawania (stepdown, feedrate XY, plunge rate, safe Z).
- Krok 4: checkboxy opcji nagłówka/stopki G-code, przełącznik interpolacji
  łuków (G2/G3 vs G1), przyciski kopiuj/pobierz (aktywne dopiero po
  Etapie 2).
- Prawy panel ekranu zarezerwowany na przyszły podgląd G-code i
  wizualizację 2D/3D (Etap 2-4) — na razie placeholder.
- `CLAUDE.md` z podsumowaniem stacku, roadmapy etapów i zaakceptowanych
  założeń projektowych.

### Uwagi

- Logika generowania G-code jeszcze nie istnieje — Krok 4 pokazuje tylko
  placeholder. Wprowadzona w Etapie 1.
- Brak podglądu 2D/3D — Etapy 3-4.
