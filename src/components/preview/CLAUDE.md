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
- **Materiał:** z modelu `stockModel()` (`lib/stockModel.ts`, ten sam co
  w 3D), w zasięgu `stockSheetRect()` (footprint danych + 25%, z originem,
  kwadrat domknięty do `niceStep()` — płaszczyzna 3D). Rysowany raz, przed
  wzorcami, dla wszystkiego, co widać (żywy wzorzec albo presety Overlay):
  `fillRegion()` wypełnia lico (`holeFill`) i dna kieszeni
  (`pocketFloorFill`, słabsze krycie) jedną ścieżką even-odd, bez obrysu.
  Wzorce rysują tylko krawędzie (`holeStroke`): otwory, kontur nominalny
  Outline, obie krawędzie On-line, kontur kieszeni / komórek Lightened.
  Surface poza modelem — wypełnia własny obszar.
  Mostki: `drawGappedCircle()`/`drawGappedRectangle()` — przerywana linia
  (`TAB_DASH`) na łuku/odcinku mostka; materiał je ignoruje.
- `camera2d.ts` — czysta matematyka kamery (`Camera2D = { scale, centerX,
  centerY }`): `computeFitCamera()`, `zoomAt()`, `panBy()`,
  `worldToScreen()`/`screenToWorld()`, `clampScale()`.
- `ToolpathCanvas.tsx` — właściciel kamery: scroll = zoom do kursora, prawy
  przycisk + przeciąganie = pan (menu kontekstowe wyłączone), zoom
  `0.2×`–`20×` względem skali fitu. Fit przy pierwszym montażu; edycja
  parametrów nie rusza kamery; zmiana selekcji Overlay = pełny re-fit. Fit
  View w prawym dolnym rogu. **Pamięć widoku** (`viewMemory`, ref z
  `App.tsx`) — kamera + skala fitu zapisywane przy każdej zmianie,
  odtwarzane przy ponownym montażu dla tej samej selekcji Overlay; tylko w
  sesji. Bez gestów dotykowych (`BL-8`).
