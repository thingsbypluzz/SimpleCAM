# src/config — rejestry i kolory

## Rejestry

- `operationMeta.ts` — `OPERATION_META: Record<OperationType, …>`: wszystko,
  co UI robi inaczej per operacja (etykieta, `pick*` z Kroku 1, metoda do
  wyświetlenia, statystyki Kroku 2, `generate`, slug nazwy pliku, etykieta
  presetu, dla kalkulatora `toolDiameter`/`methodValue`/`calcMethods`/
  `withCalc`, opcjonalnie `maxCalcWidthPercent` — sufit sugerowanej
  szerokości). Nowa operacja nie przejdzie typecheck bez wypełnienia.
  `OPERATION_LIST` — operacje w kolejności Kroku 1.
- Metody: `methodMeta.ts` (Hole(s): Helix/Standard), `surfaceMethodMeta.ts`,
  `pocketMethodMeta.ts` (`POCKET_METHOD_LIST`) — płaskie rejestry z
  `generate`; Outline przez `outlineMeta.ts` + `lib/outline.ts`
  (metody ograniczone per kształt).
- Wzorce/kształty: `positioningMeta.ts` (`POSITIONING_META`, ikony, linie
  i podsumowanie Kroku 1, `patternLabel()`, `patternSlug()` — rozpoznają
  kolaps grid do 2 otworów), `outlineMeta.ts` (rodzina metod
  `outlineMethodFamily()`: Ramp/Standard dla prostokątów i Lobed Circle,
  Helix/Standard dla okręgu), `surfaceMeta.ts`,
  `pocketMeta.ts` (`*_SHAPE_META` z `title`/`description` —
  używane też przez `PickHeader`), `facingMeta.ts` (`FACING_SIDE_META` —
  cztery boki; `FACING_METHOD` — jedyna metoda Facing, „Side Milling”,
  bez pickera).
- `materials.ts` (tabela Feedrate Calculator: Vc, fz 3/6/8+ mm,
  współczynnik Plunge, Stepdown per zaangażowanie, szerokości, Stock to
  Leave, Ramp Angle, nota),
  `routers.ts` (pozycje pokrętła → RPM, flaga `approximate`; Makita z
  instrukcji, reszta równomiernie w zakresie).

## Motywy (Theme)

- `ThemeId`/`THEME_LIST` (`types/theme.ts`); reskinują chrom appki przez
  CSS custom properties w `src/index.css` (`[data-theme="..."]` + `.dark`,
  rejestrowane przez `@theme inline` jako utility: `bg-bg`, `text-fg`,
  `border-field-border`, `text-accent`…). Cztery: **Sloppy Indigo**
  (domyślny, bez atrybutu), **Shopfloor Amber**, **Arcade Studio
  Restrained**, **Arcade Studio Full Neon** (specy w `design_*.md`).
  `useChromeTheme()` w `App.tsx` ustawia `data-theme` na `<html>`.
- Nowy motyw: blok light + `.dark` w `index.css` (definiujący **każdy**
  token z innych bloków — patrz banner nad blokami), wpis w `THEME_LIST`,
  `FIXED_COLORS`/`DEFAULT_ACCENTS` w `palettes.ts`; bez zmian w
  komponentach.
- **Kolor Edit** — drugi akcent w każdym motywie (`--edit`, `--edit-fg`,
  `--edit-bg`, `--edit-on` = tekst na `--edit`, `--glow-edit`): ołówek
  edycji (przycisk i znaczek na slocie) i edytowany slot; Overlay używa
  akcentu. Sloppy Indigo — bursztyn,
  Shopfloor Amber — cyjan, Arcade — róż. Nie może zlewać się z kolorem
  błędu ani ostrzeżenia danego motywu.
  Ten sam kolor ma swoją kopię dla podglądów: `FixedColors.edit` w
  `palettes.ts` (krawędzie edytowanego presetu) — przy zmianie `--edit`
  w `index.css` zmienić też tam.
- Arcade są dark-only (light i `.dark` identyczne). Dwa akcenty: cyjan =
  struktura/nawigacja (`--accent-*`), róż = wybór/dane użytkownika
  (`--selected-border`/`--selected-fg`/`--stat-value`; w innych motywach
  aliasy akcentu). Tylko Arcade: `--glow-*`/`--frame-glow`/
  `--preview-inset` (box-shadow przez `shadow-[var(--glow-…)]`), `--scan`
  (Full Neon), `--ui-font` (Space Grotesk z Google Fonts w `index.html`).
  W pozostałych motywach glow = `none`, z wyjątkiem `--glow-error`
  (poświata błędnego pola): łączy się z ringiem w jedną listę
  `box-shadow`, gdzie `none` unieważniłoby też ring, więc neutralnie
  `0 0 #0000`.
  Wordmark dwukolorowy (`--wordmark-only`/`--wordmark-paths`).
- Dark mode domyślny niezależnie od systemu (klasa `.dark` na `<html>`,
  `@custom-variant dark`).

## Palety podglądu (`palettes.ts`)

- Jedyne źródło kolorów 2D/3D, jako wartości JS (nie CSS custom
  properties). `getFixedColors(themeId, isDark)` — osie, origin, offset,
  tekst, `holeFill`, `pocketFloorFill` (dno kieszeni w 2D — połowa krycia
  `holeFill`), **tło** (per Theme, wspólne dla każdej Palety).
  `getPaletteAccents(paletteId, isDark, themeId)` — grid/toolpath/rapid/
  hole/stockEdge/linking (`stockEdge` — linie krawędzi materiału w 3D:
  `hole` przesunięty o 60% w stronę bieli w wariantach dark, czerni w
  light); **Default** czyta `DEFAULT_ACCENTS[themeId]`, **Ocean**/
  **Ember**/**Violet** z `ALTERNATE_PALETTES` (niezależne od Theme).
  `linking` wyraźnie inny niż `toolpath`, nigdy bursztyn (zarezerwowany dla
  wektora offsetu). `hexToThreeColor()` dla Three.js.
- Paleta nigdy nie zmienia tła ani osi/originu/offsetu — to własność Theme
  i konwencja CNC.
