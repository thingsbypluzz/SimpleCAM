# src/components/preview — podgląd 2D (Canvas API)

- `drawToolpath.ts` — rysowanie: siatka i etykiety osi liczone z
  **widocznego viewportu** (nie z danych), osie X (czerwona) / Y (zielona)
  z grotem, origin, dla każdego wzorca materiał + obrys + ścieżka + rapidy,
  wektor offsetu (amber). `buildTheme()` łączy stałe kolory Theme z akcentami
  Palety. `niceStep()` — ciąg 1-2-5-10… wspólny z 3D.
  `computeToolpathDataBounds()` — jedyny punkt styku z `ToolpathCanvas`
  (Fit View). Pocket rysowany z listy ruchów silnika (`drawToolpathMoves()`:
  cięcie ciągłe, rapid kreskowany, link kropkowany w kolorze `linking`),
  Surface z `surfaceGeometry`/`surfaceRaster` (linie skanu + strzałki).
  Facing (`drawFacingGeometry()`): blok od gotowej krawędzi w głąb detalu
  do brzegu arkusza (dalsza krawędź bez obrysu — detal idzie dalej),
  zbierany pas kropkowaną linią wzdłuż surowej krawędzi, ścieżka z listy
  ruchów silnika, grot kierunku na pierwszym przejściu.
- **Materiał:** z modelu `stockModel()` (`lib/stockModel.ts`, ten sam co
  w 3D), w zasięgu `stockSheetRect()` (footprint danych + 25%, z originem,
  kwadrat domknięty do `niceStep()` — płaszczyzna 3D). Rysowany raz, przed
  wzorcami, dla wszystkiego, co widać (żywy wzorzec albo presety Overlay):
  `fillRegion()` wypełnia lico (`holeFill`) i dna kieszeni
  (`pocketFloorFill`, słabsze krycie) jedną ścieżką even-odd, bez obrysu.
  Wzorce rysują tylko krawędzie (`holeStroke`): otwory, kontur nominalny
  Outline, obie krawędzie On-line, kontur kieszeni / komórek Lightened.
  Surface i Facing poza modelem — wypełniają własny obszar. Model jest pamiętany
  między rysowaniami (`cachedStockModel()` — kanwa rysuje się przy każdym
  kroku pan/zoom, a model zależy tylko od presetów, arkusza i opcji).
  Przy `cutShape` (Settings → Appearance) materiał ma kształt po frezie, a
  po obrysach nominalnych dochodzi kropkowana linia `cutContours()` —
  na prostych pokrywa się z obrysem, odchodzi od niego w narożnikach.
  Mostki: `drawGappedCircle()`/`drawGappedRectangle()` — przerywana linia
  (`TAB_DASH`) na łuku/odcinku mostka; materiał je ignoruje. Okrąg jest
  obrócony o kąt startu przejścia (Tab Start). Lobed Circle
  (`drawOutlineLobedGeometry()`): krawędzie materiału (obrys nominalny
  albo dwie krawędzie On-line) i pętla ścieżki z tych samych próbek i
  zakresów mostków, których używa silnik.
- `camera2d.ts` — czysta matematyka kamery (`Camera2D = { scale, centerX,
  centerY }`): `computeFitCamera()`, `zoomAt()`, `panBy()`,
  `worldToScreen()`/`screenToWorld()`, `clampScale()`.
- `ToolpathCanvas.tsx` — właściciel kamery: scroll = zoom do kursora, prawy
  przycisk + przeciąganie = pan (menu kontekstowe wyłączone), zoom
  `0.2×`–`20×` względem skali fitu. Fit przy pierwszym montażu; edycja
  parametrów nie rusza kamery; zmiana zestawu pokazywanych presetów (prop
  `fitKey`) = pełny re-fit. Fit
  View w prawym dolnym rogu. **Pamięć widoku** (`viewMemory`, ref z
  `App.tsx`) — kamera + skala fitu zapisywane przy każdej zmianie,
  odtwarzane przy ponownym montażu dla tego samego `fitKey`; tylko w
  sesji. Bez gestów dotykowych (`BL-8`).
- **Edycja presetu w Overlay** (`dimOverlay`): presety nakładki rysowane
  bez ścieżek i z kryciem `DIMMED_OVERLAY_OPACITY` (`globalAlpha` na cały
  wzorzec — obrys, wektor offsetu); żywy wzorzec — edytowany preset —
  normalnie i na wierzchu, a jego obrys (ściany modelu materiału samego
  tego presetu, `cachedStockModel(…, 'own')` — osobny slot cache) jest
  obwiedziony kolorem `theme.edit`, linią 2 px. Surface i Facing nie mają
  modelu materiału, więc nie mają obwódki.
  `activeToolpathVisible = false` ukrywa tylko jego ścieżkę (niepoprawne
  parametry); `toolpathVisible` to wyłącznie przełącznik Hide/Show.

- **Text:** kreski napisu z `layoutText()` rysowane kolorem obrysu o
  szerokości rowka (`textGrooveWidth()` × skala, co najmniej 1 px,
  zaokrąglone końce; kropka = kółko) + ścieżka z listy ruchów. Prop
  `fontEpoch` (liczba załadowanych fontów z `App.tsx`) wymusza
  przerysowanie i re-fit, gdy font dojdzie — parametry się wtedy nie
  zmieniają. On Circle: gdy Text jest żywym wzorcem (`isActive` —
  edytowanym w wizardzie), okrąg bazowy jest rysowany kropkowaną,
  przygaszoną linią jako prowadnica; presety nakładki go nie mają.
