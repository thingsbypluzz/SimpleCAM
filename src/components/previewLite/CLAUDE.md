# src/components/previewLite — uproszczony podgląd 3D (Canvas API)

Podgląd zakładki 3D bez WebGL: rzut ortogonalny na zwykłej kanwie 2D.
`App.tsx` pokazuje go zamiast `Scene3D`, gdy urządzenie nie ma WebGL 2
(`hasWebGL2()`), gdy renderer pełnego podglądu nie wystartował
(`onUnavailable`) albo gdy włączono go w Settings → Appearance
(`appearance.simple3DPreview`). W głównym bundle'u — nie ładuje Three.js.

- **Co rysuje** (`drawLiteScene.ts`): siatkę arkusza na Z0
  (`stockSheetRect()`), model materiału (`previewStock()` z
  `preview/drawToolpath.ts` — ten sam model i ten sam cache co 2D) jako
  płaskie odcienie lica i den kieszeni plus krawędzie (obrysy na Z0 i na
  dnie każdego pasa ścian, pionowa kreska w narożniku ostrzejszym niż
  20°), osie X / Y / Z z originu i ścieżki wszystkich pokazywanych
  presetów. Style ruchów jak w pozostałych podglądach: cięcie ciągłe,
  rapid kreskowany, plunge i link kropkowane.
- **Ścieżka** pochodzi z `previewPolylines()` (`lib/previewPaths.ts`) —
  listy ruchów silnika, tej samej, z której rysuje pełny podgląd 3D.
- **Czego nie ma:** głębi (nic niczego nie zasłania, nic nie jest
  oświetlone), litego materiału, etykiet siatki, bloków „pozostały
  materiał” Surface i Facing, kresek napisu Text, wektora offsetu,
  wyróżnienia edytowanego presetu kolorem edycji (jego ścieżka zostaje, a
  ścieżki pozostałych presetów znikają — `dimOverlay`).
- **Kamera** (`camera3d.ts`, czyste funkcje): dwa kąty (`yaw` wokół Z,
  `pitch` — podniesienie nad stół, 0–90°), skala i środek w płaszczyźnie
  widoku. `fitCamera()` kadruje pudełko danych (zasięg kształtów z originem,
  od Safe Z do najgłębszego cięcia); `orbitBy()` obraca wokół środka tego
  pudełka, trzymając go w miejscu na ekranie. Widoki `LITE_VIEWS`: Top,
  Isometric (z ćwiartki III), Front, Side — te same co w pełnym podglądzie.
- **Sterowanie** (`LitePreview3D.tsx`, zdarzenia wskaźnika): lewy przycisk
  albo jeden palec obraca, prawy przycisk przesuwa, kółko powiększa do
  kursora, dwa palce powiększają i przesuwają. Gest liczony od kamery z
  jego początku. Pierwszy widok — Isometric; edycja parametrów nie rusza
  kamery, zmiana `fitKey` kadruje na nowo przy bieżącym kącie; pamięć
  widoku (`viewMemory`) jak w 2D.
- **Wydajność:** scena (`buildLiteScene()`) liczona raz na zmianę tego, co
  widać; obrót tylko rzutuje punkty od nowa. Podczas ruchu widoku ścieżka
  jest przerzedzana do `LITE_MOVING_POINT_BUDGET` punktów (co n-ty), po
  puszczeniu rysowana w całości.
- W rogu stoi krótka notka (`note`), dlaczego widać ten podgląd (schowana
  przy otwartym Simulate).
- **Simulate** (`drawLiteSimulation.ts`): stan z `useSimulation()`; własna
  pętla rAF tylko przy otwartym trybie, przerysowanie całości tylko po
  zmianie zegara. Scena nie ma wtedy ścieżki żywego wzorca — rysuje ją oś
  czasu: odcinki przejechane w kolorze zmieszanym z tłem (20%), do
  przejechania zwykłym, style jak wyżej; przy ruchu widoku przerzedzane do
  `LITE_MOVING_POINT_BUDGET`. Frez — otoczka wypukła rzutowanych obręczy
  (dół i góra walca, czubek V-bitu); półprzezroczysta
  plama z obrysem. Wskaźnik w dół / w górę i kółko — `holdForCamera()` /
  `releaseCamera()`. `renderPaused` z `App.tsx` pauzuje.
