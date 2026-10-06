# src/components/wizard — kroki wizarda

- `Step1Positioning.tsx` — tylko wybór operacji i wzorca/kształtu (pionowy
  stos operacji z listą wariantów). `Step2Geometry.tsx` — router na
  `params.operation` → `Step2GeometryHoles/Outline/Surface/Pocket/Facing.tsx`.
- `Step1Summary.tsx` — zwinięty Krok 1: wszystkie operacje w kolejności
  Kroku 1 (`OPERATION_LIST`). Aktywna podświetlona na swoim miejscu
  (tokeny `selected-*`, nazwa, duża ikona i opis wybranego wzorca/
  kształtu), pozostałe jako małe, wyszarzone przyciski z podpisem (ikona
  zapamiętanego wzorca z `pickIcon()`). Klik w nieaktywną przełącza
  operację i otwiera Krok 1; klik w aktywną albo w tło kolumny tylko
  otwiera Krok 1. Korzeń to `<div>` (zawiera własne przyciski), pozostałe
  Step N Summary są jednym `<button>`; każdy przycisk z `aria-pressed`.
- **Kolejność pól w Kroku 2** (komentarz „Field order” na górze każdego
  pliku): pierwszy wiersz `PickHeader.tsx` („Pattern: …” / „Shape: …” / „Side: …” z
  `OPERATION_META[op].pickKind` + `pick()`, opis pod Hint Button przy
  prawej krawędzi). Hole(s): pola wzorca z rozmiarem otworu (Grid: Width +
  Height + Depth, potem Hole Diameter; N-Holes: Hole Count + Diameter +
  Depth, potem Hole Diameter + Start Angle; Custom List: lista, potem Hole
  Diameter + Depth; Single: sama ta para) →
  Tool Diameter → Method → Ramp + Pitch (tylko Helix) → Tabs → Offset.
  Outline: wymiary + Depth → (Lobed Circle: grupa Lobes — Count + Pitch
  Diameter, potem Lobe Diameter + Start) → Offset Mode → Tool Diameter →
  Method → Ramp + Pitch (tylko Circle Helix / Rectangle i Lobed Circle
  Ramp) → Tabs (Circle i Lobed Circle: dodatkowo Tab Start w pierwszej z
  trzech kolumn) → Offset. Lobed Circle ma własne pole średnicy okręgu
  głównego (`lobeMainDiameter`), niezależne od Outline Circle. Surface:
  Width + Height + Depth → Tool Diameter → Method + Raster
  Direction → Stepover → Z-Transition + Helix Radius + Ramp Angle (jeden
  wiersz) → Offset.
  Pocket: wymiary + Depth → (Lightened: `LightenedFields.tsx` —
  Rectangle: Layout w osobnym wierszu, potem N + M + Rib Width; Circle:
  Spokes + Hub + Rib Width, potem Start w pierwszej z trzech kolumn; błąd „za mała
  komórka” oznacza też Tool Diameter) → Tool Diameter → Method (+ Direction) →
  Optimal Load albo Stepover + Ramp Length (Spiral, pod wierszem odczyt
  Engagement) → Z-Transition + Helix Radius + Ramp Angle
  (jeden wiersz) → Finishing Pass + Stock to Leave (jeden wiersz) →
  Offset. Facing: Length + Remove + Depth → Origin Along + Origin Across →
  Tool Diameter → Stepover mm + % (oba edytowalne, zapisywane mm; przy
  etykiecie liczba przejść) → Direction → Lead + Clearance → Offset.
  Błąd pod polem, którego dotyczy.
- **Błędne pola:** ten sam warunek, który pokazuje tekst błędu
  (`<p className="text-sm text-status-error">`), ustawia `aria-invalid`
  na polach, których dotyczy — przy relacji kilku pól na wszystkich
  uczestniczących w tym samym panelu (np. Tool Diameter + Hole Diameter,
  Tab Width + Tab Count, Start Z + Safe Z), przy błędzie międzykrokowym
  tylko na polu w kroku z komunikatem. Warunek wyciągnięty do stałej
  (`toolInvalid`, `limitInvalid`…) na górze komponentu. Styl w jednym
  miejscu — warianty `aria-invalid:` w `inputClass` (`FieldRow.tsx`):
  ramka + ring `status-error`, `--glow-error` w Arcade, kolor błędu także
  przy fokusie; pola tylko do odczytu bez oznaczenia.
- **Pary pól w jednym wierszu** (`flex gap-4`, `min-w-0 flex-1` —
  `min-w-0` konieczne, input ma min-content podłogę): Offset
  X/Y, Hole Diameter + Depth (Single, Custom List), Hole Diameter +
  Start Angle (N-Holes),
  Outline Circle Diameter + Depth, Pocket Circle Diameter + Depth,
  Tabs Height/Width/Count, Surface Method + Raster Direction, Pocket
  Method + Direction (Method `shrink-0`, drugi toggle po odstępie; "Conv."/
  "Climb" z pełną nazwą w tooltipie), Optimal Load %/mm/Engagement,
  Pocket Stepover %/mm/Ramp Length,
  Z-Transition + Helix Radius + Ramp Angle w Surface i Pocket (trzy
  kolumny, puste komórki, gdy nie Helix; skrócone etykiety „Helix R.”/
  „Ramp”; w Pocket powód blokady Helix w Adaptive pod Hint Button przy
  „Z-Transition”), Pocket
  Finishing Pass + Stock to Leave (checkbox na linii inputu), Ramp + Pitch
  w Hole(s)/Outline (`RampAngleFields.tsx` — wspólny komponent, renderuje
  się tylko gdy `rampDescent()` ≠ null; Pitch read-only z tej samej
  funkcji, jednostka mm/turn albo mm/lap; błędy zakresu i limitu obrotów
  pod wierszem). Reszta w
  jednej kolumnie.
- **Wymiary z głębokością w jednym wierszu** (trzy kolumny,
  `items-end`): Width + Height + głębokość wszędzie, gdzie kształt ma oba
  wymiary — Hole(s) Grid/Grid Centered, Outline i Pocket Rectangle (także
  Rectangle Lightened), Surface; N-Holes: Hole Count + Diameter + głębokość.
  Głębokość nazywa się **„Depth [mm]” w każdej operacji i w każdym
  układzie** (także w komunikatach i w tooltipie Step 2 Summary) — jedna
  nazwa, mieści się w trzech kolumnach.
  W trzech kolumnach nie ma miejsca na Hint Button przy polu z dłuższą
  wartością —
  podpowiedź Grid „0 = dwa otwory” jest w opisie wzorca (`PickHeader`).
- `ToolChipLoad.tsx` — wiersz Tool Diameter (etykieta skrócona do „Tool
  Diam. [mm]”, pola wyrównane do dołu wiersza `items-end` — inputy w
  jednej linii, nawet gdy etykieta się zawinie) + Flutes (ta sama pamięć co
  Feedrate Calculator, całkowita 1–6, błąd pod wierszem) + fz tylko do
  odczytu (`effectiveChipLoad()`, z Hint Button).
- Pickery metod (`MethodPicker`, `OutlineMethodPicker`,
  `SurfaceMethodPicker`, `PocketMethodPicker`, `OffsetModePicker`) i
  `TextToggle.tsx` (opcje w `toggleOptions.ts`) — każdy przycisk z
  `aria-pressed`; stan nigdy tylko kolorem.
- **Pola liczbowe** (`useNumberField.ts` + `NumberInput.tsx`): wyświetlany
  tekst oddzielony od zatwierdzonej wartości (pole da się wyczyścić), commit
  przy każdym klawiszu dającym skończoną liczbę, `onBlur` resynchronizuje
  tekst. `{ syncWhenBlurred: true }` — para pól tej samej wielkości (Optimal
  Load % ↔ mm, Facing Stepover mm ↔ %). `onAdjust(delta)` dla przycisków góra/dół (przytrzymanie
  powtarza krok: pierwszy od razu, po 400 ms co 75 ms, do puszczenia albo
  zjechania z przycisku — `useHoldRepeat()` w `NumberInput.tsx`, zawsze
  najnowszy `onAdjust` przez ref),
  `roundToStepPrecision()` (1/100 mm). Tekst nie śledzi wartości z
  zewnątrz — wczytanie presetu podbija `paramsLoadGeneration` (`key` Kroków
  2/3) w `App.tsx`. `NumberInput` chowa natywny spinner, dwa przyciski obok
  siebie, tokeny motywu.
- **Krok 3:** pierwszy wiersz Spindle [RPM] — edytuje
  `machine.spindleSpeed` z Settings → Machine przez `handleSaveMachine()`
  (tylko wartość > 0); przy wybranym routerze pole jest wąskie, a obok
  `RouterDial.tsx` (rząd pozycji pokrętła, najbliższa wyróżniona —
  `routerDialHint()`, `config/routers.ts`; ten sam komponent w Feedrate
  Calculator). Step 3 Summary: MiniStat SPINDLE (RPM, a z routerem
  „dial N”).
- **Krok 4, sloty presetów `[1]…[7]`:** zapisany slot wygląda jak w Preset
  Bar w Header (ramka akcentu + ikona z `OPERATION_META[op].pickIcon()`),
  pusty ma przerywaną, przygaszoną ramkę z numerem; odstęp `gap-1.5`, żeby
  siedem slotów zmieściło się w panelu razem z paskiem przewijania; `title` i `aria-label`
  mówią „Overwrite preset…” albo „Save… — empty”. Po zapisie krótki zielony
  „✓”; nadpisanie z potwierdzeniem, usuwanie tylko w Header.
- `Checkbox.tsx` — natywny input `sr-only`, własny box z `CheckIcon`, kolory
  zaznaczenia `selected-*` (jak zaznaczona opcja, nie `--accent`),
  `peer-focus-visible` dla fokusu klawiatury; `<label>` jest `relative`,
  żeby absolutny input nie wydłużał dokumentu w przewiniętym panelu.
  Wszystkie checkboxy appki.
- `InfoNote.tsx` — szare notki z kontekstem (Chip thinning, mały Helix
  Radius, Stepdown Adaptive): trójkąt + tytuł zwija/rozwija treść
  (`aria-expanded`), domyślnie rozwinięte, stan per `id` w pamięci modułu
  (tylko sesja, przetrwa zmianę kroku); opcjonalny `action` (Apply)
  widoczny także po zwinięciu.
- `FieldRow.tsx` (`label`/`hint`/`annotation`, `inputClass`),
  `HintPopover.tsx` (portal do `document.body`, `position: fixed`, clamp do
  viewportu — omija `overflow-y-auto` panelu; zamyka się na klik poza,
  Escape, scroll; jeden otwarty naraz).
- Adaptive w Kroku 2: Apply chip thinning (wpisuje Feed XY do Kroku 3 bez
  przełączania kroku i bez zabierania fokusu); Krok 3: adnotacja
  "(chip thinning applied)", Linking Feed obok Feedrate XY, Apply Stepdown
  1.5×D. Linking Feed pokazuje się też dla Facing (`facing.linkingFeed`).
