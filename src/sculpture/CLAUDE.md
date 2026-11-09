# src/sculpture — SculptureTool (prototyp)

Osobna strona w tym samym repo (`/sculpture.html`, drugi punkt wejścia Vite):
model 3D → warstwy do wycięcia z płyt → G-code w ZIP-ie. Założenia i zakres:
`design_sculpture_tool.md`. Zależności tylko w jedną stronę: importuje z
`src/lib/` (`toolpath.ts`, `program.ts`, `format.ts`, zapisane ustawienia
maszyny i wyglądu), OnlyPaths nigdy stąd nie importuje. `clipper-lib` trafia
tylko do tego bundle'a. Nie obowiązuje tu wizard ani zasada rejestrów.

## Przepływ

`parseStl()` → `normalizeMesh()` (najpierw `dropDuplicateTriangles()`, potem Up axis = oś cięcia staje
się Z, skala do Height, środek XY, stoi na Z = 0, mesh na lewą stronę odwracany) → `computeLayers()` →
`proposeHoles()` → `analyzeLayer()` → `gcode.ts` → `buildZip()`.

- **Demo bust** (Krok 1): binarny STL w `assets/demo-bust.stl` (ok. 17 tys.
  trójkątów, 94 × 94 × 150 mm, oś Z w górę), osobny plik w buildzie
  (`?url`), pobierany dopiero po kliknięciu i czytany przez `parseStl()` jak
  wczytany plik. Testy korzystają z syntetycznego torsu (`testTorso.ts`, tylko
  dla testów — ręce odchodzące od tułowia, więc wyspy są przewidywalne).

- **View up** (`viewUp`, `viewFlip`): oś pliku pokazywana w podglądzie 3D
  jako góra, domyślnie `'same'` (oś cięcia). Inna oś obraca tylko scenę 3D
  (stos, model, pręty, przekładki — kwaternion z `mesh.viewUp`, kamera
  dopasowuje się od nowa); warstwy, otwory, G-code i widok warstwy bez zmian.
  Height mierzy wysokość wzdłuż View up, więc długość stosu (`mesh.height`) i
  liczba warstw wynikają ze skali; limit 500 warstw liczony z długości stosu.
- **Turn every plate** (`plateTurn`, 0–315° co 45°, CCW): obrót wokół osi
  cięcia zaraz po Up axis — wszystkie warstwy, otwory, G-code i podgląd 3D
  obrócone na stole tak samo (np. żeby płyta zmieściła się na maszynie albo
  arkuszu); `viewUp` obraca się razem, więc rzeźba w 3D dalej stoi. Wielokrotności
  90° liczone dokładnie (`turnTrig()`). Model centrowany przed obrotem, więc
  obrót jest wokół X0 Y0: zmiana kąta w Kroku 1 obraca o tę różnicę istniejące
  otwory i środek piasty (`turnPlates()` w `SculptureApp`; otwory zapisane jako
  edycja nowego stosu, bez flagi „stale”). Stary zapis `turnPlates: true`
  wczytuje się jako 90°.
- **Największa płyta** (Krok 1): `layerBlank()` każdej warstwy — największa
  płyta (po powierzchni) i arkusz X × Y, który mieści każdą; porównane z
  zakresem maszyny w obu ułożeniach, z podpowiedzią obrotu. W zwiniętym
  Kroku 1 jako „Sheet” (i „Turn”).
- **Sheet X × Y** (Krok 1, `sheetX`/`sheetY`, 0 = brak): arkusz, z którego
  tnie się płyty, ze środkiem w X0 Y0 plus **Sheet offset X / Y**
  (`sheetOffsetX`/`Y`, pola widoczne przy podanym arkuszu). `blankOnSheet()`:
  płyta warstwy (`layerBlank()`) musi leżeć w całości na arkuszu — Krok 1
  wymienia warstwy, które wystają. W widoku warstwy kreskowany prostokąt o
  kryciu 0,45, czerwony, gdy płyta bieżącej warstwy wystaje; skala widoku go
  obejmuje. Obrót płyt go nie obraca (arkusz leży na stole).
- **Ułożenie warstwy na maszynie** (`layerPlacements`, numer warstwy →
  `LayerPlacement {turn, x, y}`): w wierszu nad widokiem warstwy obrót (dowolny
  kąt CCW), przesunięcie X / Y i Reset, do układania płyt na arkuszu. Punkt
  najpierw obracany wokół X0 Y0, potem przesuwany (`placePoint()` /
  `placeRegion()` w `geometry.ts`). Tylko wyjście: `placeLayer()` /
  `placeHoles()` w `gcode.ts` przenoszą kontur, otwory Cut, płytę
  (`layerBlank()` liczy z ułożeniem — komentarze, karta, arkusz, największa
  płyta) i własny plik otworów (przeniesiona warstwa dostaje go zawsze —
  `holes.gcode` w nią nie trafia). Silnik, stany otworów, stos 3D i
  Superimposed zostają w układzie rzeźby. Otwory przeniesionej warstwy mijają
  mufy przyrządu: w G-code i karcie „Screws: none (moved layer…)”, ostrzeżenie
  w UI — płytę trzyma się po obrzeżach. Widok warstwy rysuje ją na miejscu na
  maszynie (arkusz i osie stoją), wskaźnik mapowany z powrotem (przeciąganie
  otworów działa). Klucz to numer warstwy, więc po zmianie liczby warstw
  ułożenia zostają przy numerach. `sanitizeParams()` zostawia tylko całkowite
  numery z czymkolwiek ≠ 0 i czyta stare pole `layerTurns` (sam obrót).
- **Powtórzone trójkąty** (`dropDuplicateTriangles()` w `mesh.ts`, na
  początku `normalizeMesh()`; zapisany w projekcie surowy model bez zmian):
  trójkąty o tych samych trzech wierzchołkach (dokładnie te same liczby)
  grupowane; kopie odwrócone znoszą się z prostymi, z reszty zostaje jedna
  w przeważającej orientacji, przy remisie żadna. Inaczej slicer dostaje
  zdublowane i odwrócone odcinki, łańcuchy się rwą i kontur (np. noga Demo
  bust w warstwie przy Z ≈ 258 mm) znika.
- **`slice.ts`:** wierzchołek na płaszczyźnie liczy się jako nad nią, więc bez
  przypadków szczególnych. Odcinki skierowane tak, że materiał jest po lewej;
  łańcuchy chodzą najpierw od odcinków, do których nic nie prowadzi, więc
  kontur przerwany pęknięciem siatki wychodzi jako jeden otwarty kawałek. Otwarte
  kawałki są sklejane koniec → najbliższy początek (także własny) do 1 mm; reszta
  jest odrzucana i liczona (`openChains`).
- **`geometry.ts`:** region = kawałki (CCW) z dziurami (CW), wszystkie boole i
  offsety przez Clipper na mikrometrach. Unia niezerowa: nachodzące powłoki się
  zlewają, a prawdziwa pustka zostaje dziurą. `simplifyRing()` — Douglas-Peucker.
- **`layers.ts`:** warstwa `i` leży na `i × (grubość + dystans)`; dystans 0 =
  pełna rzeźba. Kolejno: uproszczenie, domknięcie szczelin, filtr powierzchni,
  mostki. `toolRegion()` — tor środka freza = przekrój powiększony o promień
  (wlot węższy niż frez sam się zamyka); `uncutRegion()` — czego frez nie sięga.
- **Piasta (`attachHub()` w `layers.ts`, parametry `hub*`):** okrąg o zadanej
  średnicy i środku dodawany do każdej warstwy; warstwa trzyma osobno `section`
  (sama rzeźba), `hub` i `bridges`, a `region` (to, co cięte) to ich suma.
  Przekrój pokrywa cały okrąg → piasta jest zwykłym materiałem (`hub` pusty).
  Inaczej piasta = okrąg minus przekrój powiększony o `hubSlot` (co najmniej
  średnica freza, inaczej szczelina zamknęłaby się pod frezem), a każdy kawałek
  niebędący kotwicą dostaje 1–2 mostki prosto w stronę środka piasty: mostek
  zaczyna się tam, gdzie ostatni raz opuszcza swój kawałek, i kończy na
  pierwszym celu (piasta albo inny kawałek po drodze — przecięcia odcinka z
  pierścieniami, nie próbkowanie). Kotwica = piasta, a gdy jej nie ma —
  kawałki zachodzące na okrąg (tors). Dwa mostki: skrajne punkty kawałka
  widziane ze środka, spośród nie dużo dalszych od najbliższego. Przy piaście
  mostki wysp (`islandMode: 'bridge'`) nie są dodawane. Wąski sierp
  (`thinHubPieces()` — znika po zmniejszeniu o otwór i ściankę) tylko
  ostrzeżenie i obrys w widoku warstwy. Mostki i piastę tnie się dopiero po
  sklejeniu: stos piast z prętami jest przyrządem do klejenia.
- **`holes.ts`:** jeden zestaw otworów na rzeźbę. Pręty: `rodCount` (0–12) w obszarze
  wspólnym wszystkich warstw. Trzy to największy trójkąt, w miarę możliwości o
  bokach różnych o co najmniej 10%; kolejne jak najdalej od pozostałych, a ostatni
  tak, żeby układ nie pasował po obrocie o 180° (`canMountRotated()`). Gdy więcej
  się nie mieści, jest ich mniej, z ostrzeżeniem.
  Wyspy: kawałek bez pręta łączony w łańcuch przez kolejne warstwy, dopóki ma
  obszar wspólny; zgięta ręka dostaje kilka otworów. Stan otworu w warstwie:
  `mount`, `empty`, `waste`, `conflict`; `conflict` = warstwa dostaje własny plik
  otworów bez niego. Współrzędne edytowalne ręcznie.
  Każdy otwór ma zakres warstw `from`–`to` (puste = od pierwszej / do ostatniej):
  poza nim nie mocuje (`mount` → `empty`), ale plik główny nadal go wierci, więc
  konflikty liczą się na całej wysokości.
  **Cut** (`cut`, puste = wył.): plik konturu warstwy (`layer-NNN.gcode`)
  wierci otwór przed konturem, tą samą helisą co plik otworów — tylko w
  warstwach zakresu i tylko tam, gdzie otwór leży w warstwie (`cutIds`; nie w
  odpadzie ani przy konflikcie). W tych warstwach otwór nigdy nie jest `mount`
  (frez trafiłby w śrubę), więc nie liczy się do mocowania. `holes.gcode` i
  przyrząd bez zmian. W widoku warstwy kreskowany pierścień w kolorze akcentu.
  Otwory wysp dostają zakres swojego
  łańcucha, pręty — całość. Z piastą pręty stoją w okręgu piasty: tam, gdzie
  wszystkie warstwy dają miejsce, a gdy sierp gdzieś je zabiera — gdziekolwiek
  w okręgu (konflikt widać w tej warstwie).
- **`spacers.ts`** (tylko podgląd, bez G-code): przy dystansie > 0 przekładka na
  każdym obszarze wspólnym dwóch sąsiednich warstw (filtr powierzchni jak dla
  wysp) — krążek o zadanej średnicy w najgłębszym punkcie obszaru (mniejszy, gdy
  obszar węższy) albo sam obszar zmniejszony o zadany margines; otwory wycięte.
  Grubość = dystans; rysowane tylko w widoku całego stosu.
  Przekładki piasty (`computeHubSpacers()`): przy piaście i dystansie > 0
  krążek piasty z jej otworami między każdymi dwiema warstwami, w kolorze
  przyrządu. W ZIP-ie `hub-spacer-holes.gcode` (otwory w piaście) i
  `hub-spacer.gcode` (krążek, płyta grubości dystansu, Tabs tylko gdy niższe
  od niej), liczba sztuk w karcie mocowań.

## G-code (`gcode.ts`)

- **Układ:** Z0 na wierzchu ciętej płyty (zerowanie Z na każdej płycie;
  w `fixture.gcode` — na wierzchu przyrządu), X0 Y0 w środku przyrządu,
  wszystkie warstwy w układzie modelu. Spód płyty = `-thickness`, dno cięcia
  = `-(thickness + overshoot)` (w przyrząd), wierzch mostka = `tabHeight -
  thickness`, Safe Z = `safeAbove`.
- **Kontur:** zawsze G1, ciągłe zejście po własnej ścieżce (jeden Stepdown na
  okrążenie) i płaskie okrążenie na dnie; najpierw dziury, potem obrys, mniejsze
  kawałki pierwsze; pod M3 obrys CW, dziura CCW. Mostki równo po długości,
  przesunięte o pół kroku, pionowe podniesienie i zejście.
- **Otwory** (`boreHole()`, plik otworów, gniazda przyrządu i otwory Cut w
  konturze), metoda z Kroku 3: **Helix** — jedna helisa CCW w pełnych
  obrotach, skok `holePitch()` = mniejsza z Stepdown i długość obrotu ×
  tan(Ramp angle) (`cappedRampPitch()` z OnlyPaths, domyślnie 2°), potem
  płaski obrót na dnie; **Standard** — zejście pionowe i pełny okrąg co
  Stepdown. Otwór o średnicy freza zawsze wiercony krokami. Krok 3 pokazuje
  skok dla otworów płyt i gniazd.
- **`fixture.gcode`:** gniazda na mufy plus znacznik zera w X0 Y0.
- **Numery śrub i rozmiar płyty** — komentarze na początku pliku warstwy oraz
  `mounting-card.txt`.
- **Lista plików** — `gcodeFiles()`: każdy plik ZIP-a (poza kartą) jako wpis z
  nazwą, rodzajem (`FileKind`), warstwą, płytą do podglądu i `build()`, które
  zwraca tekst, listę ruchów (`Toolpath` z `lib/toolpath.ts`) i Safe Z. Generate
  buduje wszystkie, podgląd tylko pokazywany — tekst i ścieżka 3D z tych samych
  ruchów. Funkcje `*Gcode()` zostają jako skróty zwracające sam tekst.

## Walidacja (`params.ts`)

`paramErrors()` blokuje Generate, m.in. mufa musi siedzieć głębiej niż
`overshoot`, a Safe Z mijać główki śrub o 2 mm. Reszta to ostrzeżenia w UI.

## UI

- **Cztery kroki** jak w OnlyPaths (układ szeroki): otwarty krok (320 px) obok
  trzech zwiniętych kolumn z kluczowymi wartościami; klik w kolumnę ją otwiera,
  bez kolejności. 1 Model — STL, oś, wysokość, grubość płyty, dystans; 2 Layers
  — płaszczyzna konturu i tolerancja, wyspy, przekładki; 3 Tool — frez z listy,
  posuwy, głębokość, mostki wł./wył.; 4 Holes — otwory i przyrząd, lista otworów. Pasek z
  Generate ZIP i oba podglądy bez zmian.
- **Settings Modal wspólny z OnlyPaths** (ten sam komponent, te same klucze:
  `simplecam.machine`, `.appearance`, `.toolDiameters`): przycisk Settings w
  Header. Zmiana w jednym narzędziu działa w drugim — przy odświeżeniu, a w
  SculptureTool od razu także ze zdarzenia `storage` (zmiana w karcie OnlyPaths).
  Bez sekcji Templates (`onLoadTemplate` niepodany). Reset kasuje to samo co
  w OnlyPaths (łącznie z presetami), parametry rzeźby zostają. Z ustawień:
  maszyna i dialekt do G-code, motyw, lista frezów (pole Tool diameter to
  wybór z niej; wartość spoza listy zostaje jako dodatkowa opcja), liczba i
  rozmiar mostków z Settings → Tabs (`withSettings()`; w Kroku 3 tylko
  włącznik `tabs`). Simple / Advanced wpływa tylko na to, co pokazuje modal.
  Ciemny / jasny — jak w OnlyPaths: tylko w sesji, domyślnie ciemny.
- `useSculpture.ts`: parametry w `simplecam.sculpture` (`sanitizeParams()` —
  pola znanego typu, reszta domyślna; to samo przy wczytaniu projektu), stos
  liczony po 150 ms bezczynności, na głównym wątku (milion trójkątów to ok.
  0,4 s).
- **Projekt** (`projectFile.ts`, Header: nazwa, Load project, Save project):
  jeden plik JSON `sculpture-<nazwa>-<data>.json` (`format:
  'simplecam-sculpture'`, `version` 1) — nazwa, nazwa modelu, `params` (bez
  `withSettings()`, czyli bez ustawień maszyny), lista otworów i sam model:
  surowe trójkąty (oś pliku, przed orientacją i skalą) jako float32 w
  base64 (ok. 48 bajtów na trójkąt). Save przez `ProjectNameModal` (własny
  opis i nazwa pliku), nieaktywny bez modelu. Load: plik obcy, uszkodzony
  model albo otwór, zdublowane id, nowszy format — odrzucony w całości
  (`window.alert()`); przy wczytanym modelu `window.confirm()`. Otwory wracają
  jako edycja stosu z wczytanych parametrów (`restoreHoles()`), więc bez
  flagi „stale”. Nazwa projektu tylko w sesji, bez znacznika zmian.
- **Ręczne otwory w widoku warstwy:** przy włączonym „Add rod” klik w puste
  miejsce dodaje pręt, przeciąganie przesuwa otwór, prawy klik go usuwa (krok
  0,5 mm, nowy otwór dostaje kolejny wolny numer — numery się nie zmieniają). W
  trakcie przeciągania liczony jest tylko stan na bieżącej warstwie, reszta
  strony dostaje pozycję po puszczeniu. Lista pokazuje dla każdego otworu, w ilu
  warstwach mocuje i w ilu ma konflikt (`holeSummary()`); typ Rod / Island
  zmienia się na liście, „Clear” zostawia pustą listę.
- **Superimposed** (widok warstwy): mapa pokrycia całego stosu zamiast bieżącej
  warstwy. Każdy przekrój zmniejszony o `screwClearance()` (otwór plus ścianka
  albo główka śruby), więc kolor mówi, w ilu warstwach śruba w tym miejscu się
  zmieści: od czerwonego (jedna) do zielonego (wszystkie, pełne krycie). Liczona
  na siatce co 2 px przez wypełnianie przekrojów w ukrytej kanwie; przeliczana
  tylko przy zmianie stosu albo rozmiaru widoku. Bieżąca warstwa zostaje jako
  obrys, otwory i ich przeciąganie działają jak zwykle.
- Ręczna edycja otworów przeżywa zmianę warstw, oznaczona ostrzeżeniem; stany i
  tak są przeliczane. „Re-propose” i zmiana liczby prętów ją kasują.
- Pręty w podglądzie 3D: każdy otwór rysowany na wysokości warstw, które mocuje
  (`mountRuns()`) — pręty stalowe, otwory wysp mosiężne.
- `LayerView.tsx`: dopóki użytkownik nie ruszył widoku, skala z całego stosu,
  otworów, piasty i arkusza (przecięcie osi = X0 Y0) — niezależna od ułożeń
  warstw, więc nic nie skacze przy zmianie warstwy ani ułożenia; proporcje
  zawsze 1:1. Kółko przybliża wokół kursora, przeciąganie pustego miejsca (poza
  trybem dodawania) albo środkowym przyciskiem przesuwa. Ręczny widok
  (`View {cx, cy, scale}`, tylko w komponencie) zostaje przy zmianie warstwy i
  ułożenia; „Fit View” w rogu dopasowuje go do bieżącej warstwy na maszynie
  z otworami, arkuszem i X0 Y0 (w Superimposed wraca do widoku całego stosu).
  Pod spodem siatka milimetrowa (krok 1 / 2 / 5 × 10ⁿ mm, co najmniej 40 px,
  podpisy przy lewej i dolnej krawędzi). Poza Superimposed prostokąt zasięgu
  cięcia w kolorze akcentu: obrys `toolRegion()` bieżącej warstwy na maszynie
  powiększony o promień freza, z rogami (X/Y min i max, do 0,1 mm) i
  wymiarem.
- **Show hub** (pasek podglądu, tylko przy włączonej piaście, stan w sesji):
  włączony — piasta i mostki w kolorze przyrządu (3D i widok warstwy), okrąg
  piasty kropkowany; wyłączony — sama rzeźba (`section`), bez przekładek
  piasty, a w widoku warstwy bez toru freza. Superimposed liczy pokrycie z
  `region`, czyli z piastą.
- **Zakładki podglądu** (lewa połowa, stan w sesji): **Stack** (stos 3D),
  **Toolpath** i **G-code** — jeden plik z listy File: pliki bieżącej warstwy
  (kontur, własne otwory) idą za suwakiem warstw, obok fixture, holes i pliki
  przekładek piasty. Toolpath (`ToolpathScene.tsx`): ruchy pliku jak w 3D
  OnlyPaths — `MOVE_STYLE` i `toolpathLineMaterial()` z `preview3d/buildScene.ts`,
  kolory palety (`buildTheme()`), na końcu powrót na Safe Z i do X0 Y0 jak w
  programie; pod spodem przezroczysta płyta (półfabrykat warstwy od
  `-thickness` do Z0, master holes na płycie bieżącej warstwy) z obrysem części na
  wierzchu, a dla fixture sama płaszczyzna Z0. Kamera dopasowana przy zmianie
  rodzaju pliku, przy przechodzeniu przez warstwy zostaje. G-code — najwyżej
  5000 linii, całość w ZIP-ie. **Copy G-code** (obie zakładki) kopiuje cały
  program pokazywanego pliku do schowka; przez 1,5 s napis „Copied”, błąd
  schowka — `window.alert()`. Przy błędach parametrów obie zakładki pokazują
  tylko napis.
- `StackScene.tsx` (Three.js, Z w górę) i `LayerView.tsx` (Canvas 2D) czytają
  kolory z tokenów motywu, więc klasa `dark` i `data-theme` muszą być ustawione w
  `useLayoutEffect`.

## Poza prototypem

Lista z `design_sculpture_tool.md`: wyjątki dla wysp, kontur wewnętrzny i
zewnętrzny, kręgosłup, przekładki, układanie na arkuszu, grawerowana numeracja,
odciążanie, Simulate.
