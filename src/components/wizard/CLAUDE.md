# src/components/wizard — kroki wizarda

- `Step1Positioning.tsx` — tylko wybór operacji i wzorca/kształtu (pionowy
  stos operacji z listą wariantów). `Step2Geometry.tsx` — router na
  `params.operation` → `Step2GeometryHoles/Outline/Surface/Pocket.tsx`.
- **Kolejność pól w Kroku 2** (komentarz „Field order” na górze każdego
  pliku): pierwszy wiersz `PickHeader.tsx` („Pattern: …” / „Shape: …” z
  `OPERATION_META[op].pickKind` + `pick()`, opis pod Hint Button przy
  prawej krawędzi). Hole(s): pola wzorca → Hole Diameter + Total Depth →
  Tool Diameter → Method → Tabs → Offset. Outline: wymiary + Cutting Depth
  → Offset Mode → Tool Diameter → Method → Tabs → Offset. Surface:
  Width/Height + Depth to Remove → Tool Diameter → Method + Raster
  Direction → Stepover → Z-Transition + Helix Radius + Ramp Angle (jeden
  wiersz) → Offset.
  Pocket: wymiary + Total Depth → Tool Diameter → Method (+ Direction) →
  Optimal Load albo Stepover → Z-Transition + Helix Radius + Ramp Angle
  (jeden wiersz) → Finishing Pass + Stock to Leave (jeden wiersz) →
  Offset. Błąd pod polem, którego dotyczy.
- **Pary pól w jednym wierszu** (`flex gap-4`, `min-w-0 flex-1` —
  `min-w-0` konieczne, input ma min-content podłogę): Grid X/Y, Offset
  X/Y, Hole Diameter + Total Depth, Circle Count/Diameter/Start Angle,
  Outline Circle Diameter + Cutting Depth, Pocket Circle Diameter + Total
  Depth, Tabs Height/Width/Count, Surface Method + Raster Direction, Pocket
  Method + Direction (Method `shrink-0`, drugi toggle po odstępie; "Conv."/
  "Climb" z pełną nazwą w tooltipie), Optimal Load %/mm/Engagement,
  Z-Transition + Helix Radius + Ramp Angle w Surface i Pocket (trzy
  kolumny, puste komórki, gdy nie Helix; skrócone etykiety „Helix R.”/
  „Ramp”; w Pocket powód blokady Helix w Adaptive pod Hint Button przy
  „Z-Transition”), Pocket
  Finishing Pass + Stock to Leave (checkbox na linii inputu). Reszta w
  jednej kolumnie.
- `ToolChipLoad.tsx` — wiersz Tool Diameter + Flutes (ta sama pamięć co
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
  Load % ↔ mm). `onAdjust(delta)` dla przycisków góra/dół,
  `roundToStepPrecision()` (1/100 mm). Tekst nie śledzi wartości z
  zewnątrz — wczytanie presetu podbija `paramsLoadGeneration` (`key` Kroków
  2/3) w `App.tsx`. `NumberInput` chowa natywny spinner, dwa przyciski obok
  siebie, tokeny motywu.
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
  1.5×D.
