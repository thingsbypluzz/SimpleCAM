# src/components/preview3d — podgląd 3D (Three.js)

Ładowany leniwie (`React.lazy` w `App.tsx`), poza głównym bundle'em.
Ścieżka narzędzia każdej operacji rysowana wprost z listy ruchów silnika
(`toolpathLines3D()`, `lib/toolpath.ts`) — podgląd nie liczy ścieżki sam.

## Mapowanie współrzędnych

CNC `(x, y, z)` → Three `(x, z, -y)` (`toThree()`): CNC Z = pionowa oś
kamery. Minus przy Y jest konieczny — sama zamiana Y↔Z odwraca
chiralność, a `lookAt()` buduje bazę prawoskrętną. Każda pozycja budowana
z `p.x`/`p.y` **musi** iść przez `toThree()`; przy zmianie mapowania
grepować `.position.set(` z `p.x`/`p.y`.

## Materiał

- Jeden model `stockModel()` (`lib/stockModel.ts`) dla wszystkiego, co
  widać — żywy wzorzec albo wszystkie presety Overlay — w zasięgu
  siatki/płaszczyzny (`stockSheetRect()` z `preview/drawToolpath.ts`,
  wspólny z 2D). Wzorce nie rysują własnych brył, więc nic się nie
  przenika. Przy `cutShape` (Settings → Appearance) pustki mają kształt
  po frezie — zaokrąglone narożniki wewnętrzne (kroki 15°, poniżej progu
  linii krawędzi, więc bez pionowych kresek). `buildStockModelObjects()`:
  - lico na Z=0 i dna kieszeni — `stockFaceMesh()` (`THREE.Shape` +
    `holes`; wyspy zamknięte pustkami to osobne kształty);
  - ściany — `stockWallMesh()`, jeden mesh na pas Z, wzdłuż pierścieni
    przekroju; pierścienie obchodzone z materiałem po lewej, więc przód
    każdej ściany patrzy na zewnątrz materiału;
  - spód — tylko dla części.
- **Arkusz** (bez Outline Outside): lico, dna i ściany `DoubleSide` —
  widoczne z wnętrza pustki i od spodu; krawędź arkusza bez ścian.
  **Część** (Outline Outside): zamknięta bryła, wszystko `FrontSide`, spód
  `BackSide` — bliska i daleka ściana nigdy nie blendują się przez siebie.
- **Surface** poza modelem: blok „pozostały materiał” przez
  `buildRectWallMesh()` (zamknięty), górna ściana na `Z = -totalDepth`,
  wysokość = `feeds.safeZ`.
- **Facing** poza modelem (`buildFacingPatternObjects()`): zamknięty blok
  przez `buildRectWallMesh()` od gotowej krawędzi w głąb detalu do brzegu
  siatki/płaszczyzny (drugi wymiar detalu nie jest znany), od Z0 do
  `-totalDepth`; zbierany pas bez ścian — sam kreskowany obrys
  (`LineDashedMaterial`), żeby surowa krawędź została widoczna.
- Materiał zawsze od **Z=0** — Start Z go nie przesuwa (`BL-37`); odcinek
  ścieżki Start Z → Z0 celowo wystaje ponad materiał (najazd w powietrzu).
  Mostki ignorowane.
- `SOLID_CAP_Z_LIFT` (0.02 mm) — lico i górna ściana bloku Surface
  podniesione, żeby nie z-fightować z płaszczyzną (Y=0) i siatką (0.01).
- **Dwa wyglądy** (`stockMaterial()`, przycisk Solid/Transparent Stock,
  stan sesyjny w `App.tsx`, tylko 3D):
  - **przezroczysty** (domyślny) — `MeshBasicMaterial`, `theme.hole`,
    opacity 0.3, bez zapisu głębi; ścieżkę widać przez materiał;
  - **lity** — `MeshLambertMaterial` w kolorze `theme.hole`, nieprzezroczysty,
    z zapisem głębi: materiał zasłania ścieżkę (widać ją w pustkach i nad
    materiałem), a odcień każdej ściany daje światło. `polygonOffset`
    odsuwa go o włos w głębi, żeby siatka i linie na powierzchni nie
    migotały; siatka podniesiona nad lico (inaczej lity arkusz by ją
    zasłonił), a półprzezroczysta płaszczyzna Z=0 pominięta — przy
    widoku pod kątem przykrywała lico i ściany poniżej Z0, zlewając
    oświetlony materiał w jeden ciemny ton. Ściany mają płaskie normalne (`computeVertexNormals()` na
    geometrii nieindeksowanej).
- **Krawędzie** (`stockEdgeMesh()`, `THREE.LineSegments` w kolorze palety
  `stockEdge`, w obu wyglądach; wyłączane w Settings → Appearance,
  `appearance.stockEdges3DEnabled`): obrys każdej powierzchni poziomej
  (lico, dna kieszeni, spód części) i pionowa linia w każdym narożniku
  ściany ostrzejszym niż `EDGE_CORNER_DEG` (20°) — segmenty okręgów i
  łuków (5°) zostają gładkie. Krawędź arkusza nie jest obrysowana (arkusz
  nie ma tam ścian). Blok Surface: `THREE.EdgesGeometry`. Bez nich lico,
  dna i ściany o tym samym odcieniu zlewają się w jedną plamę.
- Światła (`Scene3D.tsx`): `AmbientLight` + `DirectionalLight` z pozycji
  (1, 1.5, 1), stałe w świecie; natężenia × π (Lambert dzieli przez π) —
  lico w pełnym kolorze, ściany od strony światła ok. 0.8, odwrócone 0.45.
  Oświetlony jest tylko lity materiał.

## Przezroczystość i kolejność renderowania

- `depthWrite: false` na **wszystkich** przezroczystych obiektach
  (płaszczyzna, siatka, każda ściana przezroczystego materiału) — inaczej sortowanie po
  odległości potrafi wymazać obiekt za innym (szczególnie w Overlay).
  `depthTest` zostaje.
- `renderOrder = -1` na płaszczyźnie, siatce i licu przezroczystego
  materiału — tło zawsze najpierw, stała kolejność blendowania.
- Zamknięte bryły `FrontSide` (DoubleSide pokazywał bliską i daleką ścianę
  naraz w losowej kolejności); arkusz — `DoubleSide`.
- Sztuczne cieniowanie przezroczystego materiału: każda ściana boczna =
  `theme.hole` × `WALL_SHADE_FACTOR` (0.5), ciemniejsza niż każda ściana
  pozioma. Opacity 0.3.

## Styl linii ścieżki (`MOVE_STYLE`)

Jeden kolor `theme.toolpath`, rozróżnienie stylem: `cut` → `solid`,
`rapid` → `dashed` (G0: przejazdy, Safe Z ↔ Start Z, retrakty), `plunge` →
`dotted` (pionowe G1 bez skrawania), `link` → `linking` (przejazdy łączące
Adaptive, kropkowane w kolorze `linking` palety). Każdy styl = osobne
`THREE.Line` (`LineDashedMaterial` ma jeden wzór na linię);
`createSegmentBuilder3D()` łączy odcinki wspólnym punktem,
`buildToolpathLines3D()` pomija odcinki < 2 punktów.

## Siatka i etykiety

- `GridHelper` wyrównany do `niceStep()` (1-2-5-10-…), środek domknięty
  do kroku — linie to realne współrzędne. Etykiety (`createTextSprite()`,
  tekst centrowany) na wszystkich 4 brzegach, `0` jak każda inna wartość.
- Stały rozmiar ekranowy: `sprite.userData.pixelHeight`, przeskalowanie co
  klatkę w `animate()` przez `rescaleLabelForConstantScreenSize()`.
  `GRID_LABEL_SIZE_PX` Small/Medium/Large (Settings → Appearance), wspólny
  dla originu, "X"/"Y" i siatki. "Show grid coordinate labels" wyłącza
  tylko etykiety siatki; przycisk "Hide/Show Grid Labels" w podglądzie
  zapisuje to samo `appearance.grid3DLabelsEnabled`.

## Scene3D.tsx

- Kamera: fit na preset `front` tylko przy pierwszym zbudowaniu sceny
  (`hasFramedRef`) — **ref zerowany na starcie efektu setupu** (StrictMode
  uruchamia go dwa razy na tej samej instancji; bez resetu kamera ląduje w
  (0,0,0) i OrbitControls są martwe). Edycja parametrów nie rusza kamery;
  zmiana zestawu pokazywanych presetów (prop `fitKey`) re-fituje odległość
  przy zachowanym kącie.
- **Pamięć widoku** (`viewMemory`, ref z `App.tsx`): przy odmontowaniu
  zapis position/target/up/near/far + `fitKey`; przy następnym
  montażu odtworzenie zamiast Front (inny `fitKey` → re-fit odległości).
  Tylko w sesji.
- **Edycja presetu w Overlay** (`dimOverlay`): presety nakładki rysowane
  bez ścieżek, ich pozostałe linie (obrys, wektor offsetu) dostają krycie
  `DIMMED_OVERLAY_OPACITY` (`dimLines()`; siatki — bloki Surface/Facing —
  bez zmian), żywy wzorzec normalnie. Krawędzie edytowanego presetu:
  osobny `stockModel([params])` i `stockEdgeMesh()` w kolorze
  `theme.edit`, bez testu głębi i z wysokim `renderOrder` — widać je
  także przez materiał. Surface i Facing nie mają modelu materiału, więc
  nie mają wyróżnienia. `activeToolpathVisible = false` ukrywa tylko
  ścieżkę żywego wzorca.
- Presety widoku `cameraPresets.ts` (`VIEW_PRESETS`, `frameCamera()`;
  `direction` = pozycja kamery względem celu). `front` patrzy wzdłuż +Y z
  lekkim podniesieniem; `isometric` z ćwiartki III. Fit View = te same
  obliczenia przy bieżącym kącie.
- `handleResize()` czyta `devicePixelRatio` przy każdym resize (zoom
  przeglądarki); korzeń `flex-1 min-h-0`, nie `h-full w-full`.
- `renderPaused` (modal otwarty) — pętla rysuje tylko po realnej zmianie.
  Sprzątanie: `renderer.forceContextLoss()` (limit kontekstów WebGL).
- Przyciski w podglądzie: Hide/Show Stock, Solid/Transparent Stock (stan
  sesyjny, tylko 3D), Hide/Show Toolpath (stan sesyjny, wspólny z 2D, jak
  Hide/Show Stock), Hide/Show Grid Labels, presety widoku, Fit View.

- **Text:** kreski napisu jako jedno `LineSegments` tuż nad powierzchnią
  materiału (linia WebGL nie ma szerokości — szerokość rowka pokazuje
  tylko 2D) + ścieżka przez `toolpathLines3D()`. Prop `fontEpoch`
  przebudowuje scenę, gdy font się załaduje. On Circle: dla żywego wzorca
  (`isActive`) okrąg bazowy jako kropkowana, przygaszona linia-prowadnica.
