# Changelog

Wszystkie znaczące zmiany w projekcie SimpleCAM są odnotowywane w tym pliku.
Format bazuje na [Keep a Changelog](https://keepachangelog.com/), wersjonowanie
zgodne z [SemVer](https://semver.org/). Ten plik pozostaje głównym, czytelnym
źródłem historii zmian — projekt ma teraz repo git (GitHub:
thingsbypluzz/SimpleCAM), ale to infrastruktura pod izolację pracy
(branch/worktree per zadanie), nie zamiennik tego changeloga.

## [0.10.0] — 2026-08-23

### Dodano

- **`BL-11` zamknięte — zoom/pan na 2D Preview.** Scroll myszki zooma
  do kursora (punkt pod kursorem zostaje na miejscu); prawy przycisk +
  przeciąganie panuje (menu kontekstowe przeglądarki wygaszone nad
  canvasem). Zoom ograniczony względnie do skali fit-to-data
  (`0.2×`–`20×`). Kamera zachowuje się jak w 3D Preview: auto-fit
  jednorazowo przy pierwszym montowaniu, edycje parametrów jej nie
  ruszają, zmiana selekcji overlayu (`BL-3`) wymusza pełne
  re-dopasowanie. Nowy przycisk **Fit View** w prawym dolnym rogu,
  taki sam jak w 3D Preview.
- **Nowy `src/components/preview/camera2d.ts`** — czysta matematyka
  kamery 2D (fit-to-data, zoom-to-cursor, pan, konwersje
  screen↔world), z testami. `drawToolpath.ts` przyjmuje teraz gotowy
  `Camera2D` zamiast liczyć skalę/offset od zera z danych przy każdym
  renderze — przy okazji naprawiony utajony bug: siatka/osie są teraz
  bounded do widocznego viewportu, nie do zasięgu danych, więc
  zoom-out poza fit nigdy nie odsłania obszaru bez siatki.

## [0.9.0] — 2026-08-23

### Dodano

- **`BL-12` zamknięte — palety kolorów podglądu 2D/3D w Settings.**
  Sesja `/grill-me` ustaliła zakres: paleta zmienia wyłącznie kolory
  "akcentowe" (`toolpath`/`rapid`/`hole`/`grid`/`background`), nie
  rusza osi X/Y, origin ani wektora offsetu — to konwencja
  CNC/semantyczna, nie stylistyka. Cztery gotowe palety
  (`src/config/palettes.ts`): **Default** (dokładnie dzisiejsze
  kolory, zero zmiany bez otwarcia Settings), **Ocean**, **Ember**,
  **Violet** — każda z osobnym wariantem light/dark, przełączanym tym
  samym dark-mode toggle'em co dziś. `palettes.ts` zastępuje dwa
  ręcznie duplikowane `LIGHT_THEME`/`DARK_THEME` (po jednym w
  `drawToolpath.ts` i `buildScene.ts`) jednym źródłem prawdy — 2D i 3D
  dzielą teraz te same literały kolorów, nie tylko konwencję.
- **Nowa sekcja "Appearance" w Settings** (`SettingsModal.tsx`) — rząd
  swatchy palet, klik = natychmiastowa zmiana bez potwierdzenia.
- **Nowy klucz `simplecam.appearance` w localStorage**
  (`src/lib/appearanceStorage.ts`) — osobny od `simplecam.machine`,
  bo wybór palety to preferencja UI, nie fizyczna cecha maszyny.

## [0.8.18] — 2026-08-22

### Dodano

- **`BL-13` zamknięte — sekcja "About" w Settings.** Zamiast numeru
  wersji w headerze (pierwotny plan `BL-13`), wersja wylądowała w
  nowej drugiej sekcji nawigacji Settings — "About" (obok "Machine") —
  pokazuje nazwę appki, `v<wersja>` i "Envisioned by ThingsByPluzz".
  `SECTIONS` w `SettingsModal.tsx` dostało realny `activeSection`
  state (dotąd czysto dekoracyjne, renderowało tylko "Machine"
  niezależnie od wyboru). Wersja wciągana z `package.json` przez
  `define` w `vite.config.ts` jako `__APP_VERSION__` (odczyt pliku w
  Node przy starcie configu) zamiast bezpośredniego importu JSON —
  nie wymaga włączania `resolveJsonModule` w `tsconfig.app.json` dla
  jednego stringa; typ zadeklarowany w nowym `src/vite-env.d.ts`.
- **"Envisioned by ThingsByPluzz"** doszło też w headerze appki, małą
  szarą czcionką zaraz pod podtytułem.

## [0.8.17] — 2026-08-22

### Dodano

- **`BL-13` dopisane do backlogu** (dokumentacja/planowanie,
  nieimplementowane) — numer wersji appki, niewielką szarą czcionką,
  zaraz za "SimpleCAM" w nagłówku.

### Zmieniono

- **Podtytuł w nagłówku.** "Fast G-code generator for CNC holes —
  client-side, no backend." → "Fast G-Code generator for your basic
  operations." — "CNC holes" było zawężone względem terminologii
  ustalonej w `0.8.12` (Hole(s) to dziś jedna z, docelowo kilku,
  operacji), nowy tekst nie zakłada z góry, że appka robi wyłącznie
  otwory.

## [0.8.16] — 2026-08-22

### Zmieniono

- **Ramka wokół presetów + oka pokazuje się tylko, gdy overlay jest
  aktywny.** Dotąd widoczna zawsze — teraz `border-transparent` poza
  trybem overlay (kolor, nie `border-width`, więc bez skoku layoutu przy
  włączaniu/wyłączaniu). Przy okazji więcej oddechu: `py-1.5` → `py-2`
  (+2px góra/dół) — było za ciasno.

## [0.8.15] — 2026-08-22

### Dodano

- **`BL-11` i `BL-12` dopisane do backlogu** (dokumentacja/planowanie,
  nieimplementowane) — zoom/pan na 2D Preview reagujący na scroll
  myszki + przycisk Fit View w rogu; oraz presety kolorów renderowania
  2D/3D w Settings.

### Zmieniono

- **Ramka zamiast podkreślenia wokół presetów + oka.** Cała grupa
  (presety `[1]…[5]` + ikonka oka) dostała jedną, delikatną ramkę
  (`rounded-lg border`) zamiast dotychczasowego podkreślenia tylko pod
  presetami — sugeruje, że oko i presety są jedną funkcjonalną całością,
  nie dwoma osobnymi elementami.
- **Pływający komunikat "Preview mode"** nad 2D i 3D Preview, gdy
  overlay jest aktywny — wyśrodkowany u góry, ten sam sygnał w obu
  podglądach.
- **Auto-Fit View przy zmianie zaznaczenia overlay w 3D.** Cofnięta
  wcześniejsza decyzja "user klika Fit View sam" — dodanie/usunięcie
  presetu z nakładki teraz automatycznie dopasowuje odległość/target
  kamery (jak klik w Fit View), **bez** zmiany kąta patrzenia. Zwykłe
  edytowanie żywego wzorca nadal nie rusza kamery — rozróżnione przez
  osobny ref śledzący poprzednią referencję `overlayParams`.
- **Krótki flash na ikonce właśnie załadowanego presetu** (poza trybem
  overlay) — potwierdza "to zostało właśnie wczytane" na 1.5s, ten sam
  wzorzec timingu co "Copied!"/"✓ Saved" gdzie indziej w appce.

## [0.8.14] — 2026-08-22

### Zmieniono

- **Poprawki UX overlay presetów po pierwszym użyciu.** Ikonka "oko"
  wyrównana rozmiarem do ikonek presetów (`h-11 w-11`, zamiast
  mniejszej `h-9 w-9`) i przeniesiona do wnętrza podkreślonej grupy —
  wspólna linia pod całym rzędem sugeruje teraz zależność oka i
  presetów, nie tylko samych presetów. Odstęp między ostatnim presetem
  a okiem zwiększony do szerokości jednej ikonki (`ml-11`).
- **Wyłączenie overlay resetuje widok.** Dotąd zaznaczenie presetów w
  `overlaySlots` przeżywało wyłączenie oka (świadoma decyzja na
  start — "zachowaj zestaw porównawczy") — w praktyce myliło, bo
  wyłączenie nie czyściło niczego w podglądzie. Teraz wyłączenie oka
  czyści zaznaczenie i przywraca zwykły, jednowzorcowy widok.
- **Żywy wzorzec ukryty domyślnie podczas overlay.** Mieszanie
  edytowanego wzorca z porównywanymi presetami utrudniało odczytanie,
  co jest czym. Nowy parametr `showActivePattern` w `drawToolpath()` i
  `buildToolpathScene()` — `false` podczas aktywnego overlay, więc
  widoczne są wyłącznie zaznaczone presety (żywy wzorzec wraca, gdy
  overlay wyłączony).
- **Generate zablokowany podczas overlay.** Skoro żywy wzorzec nie jest
  wtedy widoczny w podglądzie, generowanie dla niego G-code byłoby
  generowaniem "w ciemno" — `canGenerate` w `App.tsx` dostał dodatkowy
  warunek `&& !overlayEnabled`, z dedykowanym komunikatem pod
  przyciskiem tłumaczącym dlaczego (zamiast mylącego "Fix the
  highlighted errors...").

## [0.8.13] — 2026-08-22

### Dodano

- **`BL-3` — overlay zapisanych presetów w 2D/3D Preview.** Nowa
  ikonka "oko" w headerze, obok rzędu presetów `[1]…[5]`, przełącza
  tryb overlay: gdy aktywny, klik w zajęty slot dodaje/usuwa go z
  nakładki (zamiast ładować preset), z wizualnym zaznaczeniem (grubsza
  ramka + checkmark w lewym górnym rogu); usuwanie presetu jest
  ukryte, dopóki tryb jest aktywny. Sesja `/grill-me` (z mockupem od
  użytkownika) rozszerzyła pierwotny zakres z Backlogu — overlay działa
  **w 2D i 3D Preview jednocześnie**, nie tylko w 3D. Pełny render per
  nałożony preset (jak żywy wzorzec), bez rozróżnienia kolorem per-slot
  (świadomie odłożone). Nakładki rysowane pierwsze, żywy wzorzec na
  wierzchu. `drawToolpath.ts` i `buildScene.ts` przeszły równoległy
  refaktor pod wiele wzorców naraz (bounds z sumy wszystkich, każdy ze
  swoim promieniem/głębokością/Safe Z); nowy `src/lib/overlayParams.ts`
  z testem. 3D nie re-frame'uje kamery przy przełączaniu overlay (Fit
  View ręcznie); 2D automatycznie obejmuje nakładki, bo już zawsze
  przelicza kadr od zera przy każdym renderze.

## [0.8.12] — 2026-08-22

### Zmieniono

- **Terminologia "Operation" przepisana na przyszłą rodzinę operacji
  (Hole(s)/Outline/Pocket/Surface), stare znaczenie (Helix/Standard)
  przechrzczone na "Method".** Wynikło z drobnej prośby o zmianę
  nagłówka Kroku 1 ("Pattern" → "Operation & Pattern"), która ujawniła
  kolizję: "Operation" było już zajęte w kodzie (`OperationType`,
  `OPERATION_META`, pole `WizardParams.operation`) przez koncept
  Helix/Standard — od dawna user-facing nazywany "Method". Ustalono w
  rozmowie: user chce, żeby "Operation" znaczyło to, co dotąd nazywało
  się "rodzina"/"family" (Hole(s) dziś, Outline/Pocket/Surface w
  przyszłości). Czysto nazewnicza zmiana, zero różnicy w zachowaniu:
  - `OperationType`/`WizardParams.operation`/`OPERATION_META`/
    `OPERATION_LIST` (`config/operationMeta.ts`) → `MethodType`/
    `WizardParams.method`/`METHOD_META`/`METHOD_LIST`
    (`config/methodMeta.ts`, plik przemianowany). Bez migracji
    zapisanych presetów w `localStorage` — stary klucz `operation` w
    już zapisanym JSON-ie jest ignorowany, `method` wraca do domyślnego
    Helix (świadoma decyzja, jak przy `BL-2`).
  - `FAMILY_PLACEHOLDERS` (`Step1Positioning.tsx`) →
    `OPERATION_PLACEHOLDERS`; `FAM-#` (schemat referencyjny dla
    Outline/Pocket/Surface) → `OP-#`, sekcja CLAUDE.md "Przyszłe
    rodziny operacji" → "Przyszłe operacje". Renderowane napisy
    ("Hole(s)", "Outline", "Pocket", "Surface", "Coming soon") bez
    zmian. Backlog artifact zaktualizowany pod tym samym URL.

## [0.8.11] — 2026-08-22

### Dodano

- **`BL-1` — górny limit na Hole Count (N-Holes on Circle).** Nowa
  `isCircleHoleCountValid()` + stała `MAX_CIRCLE_HOLE_COUNT = 100` w
  `src/lib/validation.ts`, dołączona do `isGeometryValid` w `App.tsx` —
  ten sam wzorzec co Tool Diameter/Stepdown/Start Z (twardy blok
  Generate + czerwony inline error pod polem w Kroku 2), nie miękki
  soft-warning z `BL-9` — sesja `/grill-me` potwierdziła, że 101+
  otworów to "na pewno bez sensu", nie "może się nie zmieścić", więc
  pasuje tu pewność, nie ostrzeżenie. Limit czysto arbitralny (w
  odróżnieniu od `BL-9` nie ma tu żadnej fizycznej wielkości do
  wyprowadzenia progu) — walidacja jest wyciszona (`true`) poza trybem
  `circle`, żeby nie blokować Generate przez pole, którego w danym
  trybie nawet nie widać.

## [0.8.10] — 2026-08-22

### Zmieniono

- **Badge w rozwiniętym Kroku 4 wyrównany rozmiarem do zwiniętego
  paska.** `0.8.9` wprowadziło mniejszą wersję (`h-6 w-6`) w rozwiniętym
  panelu — nieczytelną. Teraz oba miejsca renderują ten sam rozmiar
  (`h-8 w-8`, ikona `h-4 w-4`).
- **Pomarańcz na badge'u ostrzeżenia zmieniony na pastelowy
  (`bg-orange-200` zamiast `bg-orange-500`).** Czarny wykrzyknik/check
  na nasyconym `orange-500` był słabo czytelny — jaśniejsze tło
  poprawia kontrast z czarnym symbolem w środku.

## [0.8.9] — 2026-08-22

### Zmieniono

- **Badge Kroku 4 przetrwał rozwinięcie panelu.** Dotąd znikał w
  momencie przejścia na Krok 4 (zwinięty pasek z ikonką zamieniał się
  w pełny panel bez żadnego odpowiednika), co sprawiało wrażenie, że
  problem zniknął. Ten sam badge (mniejsza wersja, `h-6 w-6`) jest teraz
  też w prawym górnym rogu rozwiniętego panelu, obok nagłówka "Step 4 ·
  G-Code". Logika wyciągnięta do wspólnej `step4Badge()` w `App.tsx`,
  współdzielonej przez zwinięty pasek i rozwinięty panel — jedno źródło
  prawdy zamiast dwóch kopii warunków.
- **Kombinacja "wygenerowano + nadal nie mieści się w maszynie" dostała
  własny, odróżnialny stan.** Kształt ikony śledzi wyłącznie to, czy
  Generate zostało kliknięte (X → check), kolor śledzi wyłącznie to, czy
  wzorzec mieści się w maszynie (amber/indigo → orange) — te dwa wymiary
  są niezależne (zmiana parametru może zostawić nieaktualny wygenerowany
  G-code, podczas gdy żywy wzorzec już nie pasuje). Efekt: po Generate
  z aktywnym ostrzeżeniem badge pokazuje **check na pomarańczowym tle**
  (zamiast wykrzyknika) — sygnalizuje "wygenerowano, ale sprawdź
  zakres", odróżnione od "jeszcze nie wygenerowano, i już wiadomo że nie
  zmieści się" (wykrzyknik na pomarańczowym).

## [0.8.8] — 2026-08-22

### Zmieniono

- **Czytelność `WarningIcon` na badge'u Kroku 4.** Pierwsza wersja
  (amber-100 tło, amber-700 ikona — te same odcienie co stan "nie
  wygenerowano") była za mało odróżnialna. Poprawione: stałe
  `bg-orange-500 text-black` (bez wariantu dark — świadomie ten sam
  mocny kontrast w obu motywach, ostrzeżenie nie ma się "wtapiać"),
  grubszy `strokeWidth` (3.2 zamiast wspólnego 1.8 z innych ikon) i
  większa kropka wykrzyknika.

## [0.8.7] — 2026-08-22

### Zmieniono

- **Badge zwiniętego Kroku 4 sygnalizuje przekroczenie zakresu
  maszyny.** Nowa `WarningIcon` (`components/icons.tsx`) zastępuje
  dotychczasowy `CheckIcon`/`XIcon` w pasku Kroku 4, gdy
  `machineFitWarnings()` zwraca choć jedno ostrzeżenie — ma priorytet
  nad stanem "wygenerowano"/"nie wygenerowano", bo "wygenerowane, ale
  nie mieści się w maszynie" nadal wymaga uwagi na pierwszy rzut oka.
  Tooltip paska pokazuje treść ostrzeżeń.

## [0.8.6] — 2026-08-22

### Dodano

- **`BL-9` — Machine Settings.** Guzik Settings w nagłówku, dotąd
  `disabled`, otwiera teraz modal (wzorowany na ustawieniach Claude:
  wyśrodkowana karta, menu sekcji po lewej — dziś jedna pozycja
  "Machine" — treść po prawej) z trzema polami: X/Y/Z travel maszyny
  CNC. Auto-save na blur (zapis tylko przy poprawnej wartości > 0),
  bez guzika Save. Trwałe w osobnym kluczu `localStorage`
  (`simplecam.machine`, `src/lib/machineStorage.ts`) — celowo
  odizolowane od `simplecam.storage` (sloty presetów), inny rodzaj
  danych, jeden globalny obiekt zamiast kilku wymiennych presetów.
  Domyślnie X=5000mm, Y=5000mm, Z=1000mm — na tyle duże, że bez
  konfiguracji appka zachowuje się jak dotąd; nie ma osobnej gałęzi
  "nieskonfigurowane".
- **Dwa mechanizmy wykorzystujące te ustawienia** (sesja `/grill-me`
  ustaliła, że wizard nie zna pozycji zerowania materiału na stole,
  więc jedynym sensownym sprawdzeniem jest rozpiętość wzorca, nie
  pojedyncze współrzędne względem ±zakresu):
  - Twardy `min`/`max` na polach przestrzennych (Width/Height,
    Circle Diameter, Offset X/Y, Total Depth, Safe Z) — sanity-ceiling
    wyprowadzony z realnej maszyny zamiast sztywnej stałej, częściowo
    zastępuje `BL-1` (nie w całości — `circleHoleCount`, licznik a nie
    odległość, zostaje bez limitu).
  - Miękki, nieblokujący warning na Step 4 (`machineFitWarnings()` w
    `src/lib/validation.ts`) — osobny komunikat per oś, tylko dla osi,
    która faktycznie przekracza skok maszyny (rozpiętość wzorca
    max−min ≤ travel, plus `safeZ + totalDepth ≤ travelZ` dla Z). Nie
    blokuje Generate — decyzja zostaje przy operatorze.

## [0.8.5] — 2026-08-22

### Zmieniono

- **`BL-2` — sprzątnięcie martwego pola `spindleStopEnd` przez zamianę
  ról z `returnSafeZEnd`.** `OutputOptions` miało trzy pola przy dwóch
  checkboxach Kroku 4: `spindleStopEnd` istniało w typie i w
  `DEFAULT_WIZARD_PARAMS`, ale nigdy nie było czytane, a checkbox
  "Return to Safe Z and stop spindle (M5) at the end" sterował
  `returnSafeZEnd`, który w `buildFooter()` emitował `G0 Z<safeZ>` **i**
  `M5` naraz. Przy analizie okazało się, że martwe/mylące jest raczej to
  drugie pole: `assembleProgram()` retraktuje na Safe Z po **każdym**
  punkcie, łącznie z ostatnim, więc `G0 Z<safeZ>` ze stopki był zawsze
  dosłownym duplikatem poprzedniej linii — jedyną realną treścią tego
  checkboxa było `M5`. Checkbox przeszedł więc na `spindleStopEnd`,
  `returnSafeZEnd` zniknęło z typu i z domyślnych parametrów, a etykieta
  została skrócona do uczciwego **"Stop spindle (M5) at the end"**.
  Drugi checkbox (`returnOriginEnd`, "Return to (0,0)…") bez zmian.
- **Z generowanego G-code wypada jedna redundantna linia** — końcówka
  programu to teraz `G0 Z<safeZ>` (z pętli po punktach) / `M5` /
  `G0 X0 Y0` zamiast dwóch identycznych `G0 Z<safeZ>` pod rząd. Poza tą
  jedną linią wyjście jest bit-w-bit identyczne.
- **Migracja zapisanych presetów świadomie pominięta** (`storage.ts` bez
  zmian). Preset zapisany przed tą zmianą ma `spindleStopEnd: true`
  (wartość domyślna, bo pole nigdy nie było edytowalne), więc komuś, kto
  odznaczył stary checkbox, `M5` po cichu wróci. Zaakceptowane: projekt
  jest dziś jednoosobowy/deweloperski, a `M5` na końcu programu jest
  bezpieczne.

## [0.8.4] — 2026-08-20

### Zmieniono

- **3D Preview jako domyślna zakładka.** `previewTab` w `App.tsx` startuje
  teraz na `'3d'` zamiast `'2d'` — w praktyce użytkownik i tak od razu
  przełączał się na 3D, 2D Preview przestało być pierwszym, co widać po
  starcie.
- **Domyślny/`Front` kąt kamery w 3D Preview zmieniony na podniesiony
  rzut wzdłuż osi Y** (`VIEW_PRESETS.front` w `cameraPresets.ts`) — kamera
  wyśrodkowana na granicy ćwiartek III/IV (na osi -Y, bez offsetu w X),
  patrząca wzdłuż +Y, z tym samym podniesieniem na Z co `isometric`
  (zamiast płaskiego, idealnie prostopadłego do osi Y rzutu, który dawał
  zerowy sygnał głębi). Ten sam preset jest teraz i domyślnym widokiem
  otwarcia sceny, i tym, na co wraca przycisk **Front**.

### Naprawiono

- **Domyślny widok 3D Preview czasem "zatrzaskiwał się" na zdegenerowanym
  kadrze (kamera dosłownie w punkcie (0,0,0), patrząca wzdłuż +Y, z
  zerowym promieniem orbitowania — OrbitControls wyglądały jak martwe).**
  Przyczyna: `hasFramedRef` w `Scene3D.tsx` (blokada "kadruj automatycznie
  tylko raz") nigdy nie była resetowana przy budowie nowej kamery. React
  `StrictMode` (włączony w `main.tsx`) celowo uruchamia efekty dwukrotnie
  przy montowaniu tej samej instancji komponentu (setup → cleanup →
  setup) — refy przeżywają między przebiegami, więc druga (docelowa)
  kamera zostawała bez wywołania `frameCamera()`, bo flaga była już
  `true` po pierwszym przebiegu. Naprawione: `hasFramedRef.current =
  false` na starcie efektu budującego scenę/kamerę, więc każda nowa
  kamera dostaje dokładnie jedno auto-kadrowanie. Błąd istniał od dawna
  (Etap 4), ale stał się widoczny dopiero teraz, gdy 3D Preview zostało
  domyślną zakładką.

## [0.8.3] — 2026-08-20

### Zmieniono

- **Krok 2 (Geometry) — powtórzony Pattern pod Method, kreska przed
  Offset.** Pod rzędem `Method: [Helix][Standard]` doszedł analogiczny
  rząd `Pattern: <nazwa>` + krótki, generyczny opis z
  `POSITIONING_META[...]` — spójny dla wszystkich 5 patternów, zamiast
  dawnych, niespójnych zdań przy niektórych z nich (Single: "zero the
  machine at the hole location", Grid Centered: "zero the machine at
  the pattern center", Circle: "starting at Start Angle and going
  counter-clockwise" — usunięte, zastąpione tym jednym generycznym
  blokiem). Sekcja **Offset** dostała `border-t` oddzielający ją
  wizualnie od pól powyżej (ten sam wzorzec co "Save to preset" w
  `Step4Output.tsx`) — czytelniej sygnalizuje, że offset to osobny,
  nakładający się na wszystko powyżej mechanizm, nie kolejne pole
  pattern-specific.
- **Krok 2 — etykiety Grid X/Y zmienione na "Width (X) [mm]" / "Height
  (Y) [mm]"** (Rectangular Grid i Rectangular Grid (Centered), ten sam
  współdzielony blok JSX) — czytelniejsze niż gołe "X"/"Y" dla kogoś,
  kto nie od razu kojarzy osie z wymiarami prostokąta.
- **Krok spinnera (up/down) na polach liczbowych: 0.1 zamiast 0.01** —
  Hole Diameter i Total Depth (`Step2Geometry.tsx`) miały `step="0.01"`,
  więc klik strzałki natywnego spinnera zmieniał wartość o setną
  milimetra, zbyt drobno w praktyce; teraz `step="0.1"` (precyzja
  setnych nadal osiągalna wpisaniem z klawiatury — `step` HTML wpływa
  tylko na skok spinnera). Stepdown (`Step3Feeds.tsx`) dostał
  `step="0.05"` zamiast `0.01` — świadomy wyjątek od `0.1` reszty pól,
  bo głębokość na przejście jest bardziej wrażliwa na wielkość skoku.
  Usunięto powiązaną, częściowo już nieaktualną notatkę z CLAUDE.md
  "Pomysły na przyszłość" (Circle Diameter miał już `step="0.1"`,
  notatka o tym nie wiedziała).

## [0.8.2] — 2026-08-20

### Zmieniono

- **Krok 1 (Family/Pattern) — rodziny ułożone pionowo, pattern picker
  skompresowany.** Wynik sesji `/grill-me` po feedbacku, że karty
  patternu (Single/Grid/Grid Centered/Circle/Custom) były za duże
  względem paska Family, a sam podział na dwie osobne sekcje nie
  oddawał relacji "pattern należy do Hole(s)". `Family` (dawny
  `grid-cols-4`) zamienia się na pionowy stos pełnej szerokości, jedna
  rodzina na wiersz — ten sam pomysł co akordeon 4 kroków wizarda,
  zagnieżdżony jeden poziom głębiej. **Hole(s)** to jedyna
  rozwinięta/aktywna sekcja: pogrubiony, większy nagłówek "Hole(s)"
  (podkreśla relację rodzic-dziecko), a pod nim skompresowana pionowa
  lista 5 patternów — ikona + tytuł (z `POSITIONING_META[...].title`,
  bez opisu, bez wartości liczbowych — Krok 1 zostaje bez
  pattern-specific pól, jak ustalone w Etapie 6), jeden wiersz na
  pattern zamiast dawnych dużych kart `p-5`. **Outline/Pocket/Surface**
  zostają zwiniętymi, wyszarzonymi, pełnej szerokości paskami
  (etykieta + "Coming soon"), tylko już jako osobne wiersze zamiast
  komórek grida. Czysta reorganizacja JSX w `Step1Positioning.tsx` —
  zero zmian w `WizardParams`/`positioningMeta.ts`.

## [0.8.1] — 2026-08-20

### Naprawiono

- **Poziomy scroll na Kroku 2 przy sparowanych polach X/Y** — wprowadzony
  w 0.8.0 razem z grupowaniem Grid X/Y i Offset X/Y w jednej linii.
  `<input>` bez jawnej szerokości ma domyślną min-content ~20 znaków, a
  flex items mają domyślnie `min-width: auto` — dwa pola obok siebie w
  420px panelu Kroku 2 nie mieściły się bez przycinania. Dodano
  `min-w-0` do obu `flex-1` wrapperów w `Step2Geometry.tsx` (Grid X/Y,
  Offset X/Y) — input i tak dostaje pełną dostępną (już zmniejszoną)
  szerokość przez `align-items: stretch` na `FieldRow`, bez potrzeby
  `w-full` na samym inputcie.

## [0.8.0] — 2026-08-20

### Zmieniono

- **Reorganizacja taksonomii wizarda: pattern na Krok 1, wszystko
  liczbowe na Krok 2** — wynik sesji `/grill-me` 2026-08-19 (pełny zapis
  w `ideas.md`), zainicjowany realnym problemem UX: dwa zapisane presety
  Helix (różny `PositioningMode`) wyglądały identycznie w headerze, bo
  ikona/etykieta presetu kluczowała się po **method** (Helix/Standard),
  nie po **pattern** (Single/Grid/Grid Centered/N-Holes Circle/Custom).
  Krok 1 (`Step1Positioning.tsx`, nowy plik) to teraz wyłącznie wybór
  patternu (karty) + placeholdery przyszłych rodzin — wizualnie lekki,
  bez pól liczbowych. Krok 2 (`Step2Geometry.tsx`) zostaje z Tool/Hole
  Diameter/Total Depth i przejmuje wszystko pozostałe: nowy kompaktowy
  toggle **Method** (`MethodPicker.tsx`, dawny `Step1Operation.tsx`,
  logika 1:1 ale przepisana na mały dwuprzyciskowy toggle — ten sam styl
  co Circle Interpolation na Kroku 4, nie duże karty), pattern-specific
  pola (grid X/Y, circle params, custom points) i Offset X/Y. Żadna
  zmiana w `WizardParams`/typach — `operation` i `geometry.positioning`
  były już niezależnymi polami, to czysta reorganizacja UI/wiring. Krok 1
  nie auto-advance'uje po kliknięciu patternu (w przeciwieństwie do
  dawnego Kroku 1 Operation) — spójność z resztą wizarda, wymaga
  przycisku Next jak pozostałe kroki (`STEPS_WITH_NEXT_BUTTON`).
  Dodatkowo: **analogiczne pary X/Y (Grid X/Y, Offset X/Y) renderowane
  teraz obok siebie w jednej linii** zamiast jeden pod drugim — świadomy,
  wąski wyjątek od zasady "pola w jednej kolumnie" (patrz CLAUDE.md),
  oszczędza miejsce w gęstym Kroku 2.
- **Nowy `src/config/positioningMeta.ts`** — analogiczny do
  `operationMeta.ts`, jedno źródło prawdy dla wszystkiego zależnego od
  `PositioningMode` (wcześniej rozproszone jako lokalne funkcje w
  `App.tsx`): `POSITIONING_META`/`POSITIONING_LIST` (karty Kroku 1),
  `positioningIcon`/`positioningLines`/`positioningSummary` (zwinięte
  paski), oraz nowe `patternLabel()`/`patternSlug()`.
- **Ikona/etykieta presetu w headerze i nazwa pliku pobieranego G-code —
  pattern jako główna tożsamość, method jako drugorzędny tekst.**
  `presetLabel()` (`src/lib/presetLabel.ts`) zmienia się z `"Helix •
  ⌀8mm, 4mm deep"` na `"5-Holes Circle • Helix • ⌀8mm"` — dwa różne
  presety Helix (różny pattern) mają teraz różne ikony/etykiety, nie
  identyczne. `buildFilename()` (`src/lib/download.ts`) zmienia sygnaturę
  z `(operation: OperationType)` na `(params: WizardParams)`, plik
  wynikowy `simplecam-<operacja>-<data>.gcode` →
  `simplecam-<pattern>-<data>.gcode` (np.
  `simplecam-5holes-circle-2026-08-20.gcode`). Zapisane presety w
  localStorage nie wymagały migracji schematu — `geometry.positioning`
  był już w zapisanym JSON-ie, zmieniła się tylko logika odczytu.
- **Placeholdery przyszłych rodzin operacji** (Outline/Pocket/Surface) —
  rząd 4 kafelków na górze Kroku 1, "Hole(s)" aktywny, pozostałe trzy
  wyszarzone/`disabled` z etykietą "Coming soon". Czysto wizualne, zero
  zmian w `WizardParams` — nie modelowane pole `family` w typach, dopóki
  istnieje tylko jedna realna rodzina.

## [0.7.2] — 2026-08-18

### Naprawiono

- **Sloty presetów w headerze nie były naprawdę wyśrodkowane** — 0.7.1
  wyśrodkowywał je tylko pionowo (`items-center`), zostawiając je
  przyklejone do prawej krawędzi obok dark mode/Settings. Header
  przebudowany na `grid grid-cols-[1fr_auto_1fr]`: tytuł po lewej,
  sloty presetów w środkowej (auto-szerokość) kolumnie z
  `justify-self-center`, dark mode/Settings po prawej z
  `justify-self-end` — sloty teraz naprawdę na środku belki, niezależnie
  od szerokości tytułu czy liczby przycisków po prawej.
- **3D Preview: zoom-in gubił przyciski widoku, trzeba było przełączyć
  się na 2D i z powrotem, żeby naprawić** — 0.7.1 poprawił tylko odczyt
  `devicePixelRatio`, ale prawdziwą przyczyną był kruchy CSS: kontener
  `ToolpathCanvas`/`Scene3D` używał `h-full w-full` bez `flex-1`,
  polegając na niepewnej kombinacji `flex-basis:auto` + procentowej
  wysokości + domyślnego `flex-shrink`, żeby wypełnić resztę wysokości
  w rodzicu `flex-col` — w przeciwieństwie do sąsiedniego panelu
  G-Code, który od początku poprawnie używał `flex-1`. Przy reflow
  wywołanym zoomem ta kombinacja czasem rozjeżdżała się (kontener
  chwilowo zerowej wysokości), co gubiło absolutnie pozycjonowane
  przyciski widoku i nie samo-naprawiało się bez odmontowania/
  zamontowania komponentu (przełączenie zakładki). Oba komponenty
  (`ToolpathCanvas.tsx`, `Scene3D.tsx`) mają teraz `flex-1 min-h-0`
  zamiast `h-full w-full` na korzeniu — ten sam solidny wzorzec co
  panel G-Code.

## [0.7.1] — 2026-08-18

### Zmieniono

- **Ikony presetów w headerze** — większe (`h-8 w-8` → `h-11 w-11`),
  header wyśrodkowany pionowo (`items-start` → `items-center`, tak żeby
  sloty `[1]…[5]` nie wisiały u góry obok dwuliniowego tytułu). Zajęte
  sloty pokazują teraz ikonę operacji, którą przechowują (`HelixIcon` /
  `StandardHoleIcon` z `OPERATION_META[preset.operation].Icon`), zamiast
  samego numeru slotu — puste sloty nadal pokazują numer.
- **Ikony "Save to preset" na Kroku 4** — ta sama zmiana rozmiaru
  (`h-8 w-8` → `h-11 w-11`) co w headerze, bez zmiany ikonografii (dalej
  numer/✓, nie ikona operacji — to sekcja zapisu, nie podglądu istniejącej
  zawartości slotu).

### Naprawiono

- **3D Preview nie przeskalowywał się przy zmianie rozmiaru okna/zoomie
  przeglądarki (Ctrl+/Ctrl-)** — `Scene3D.tsx` ustawiał
  `renderer.setPixelRatio(window.devicePixelRatio)` tylko raz, przy
  starcie sceny; przy zmianie zoomu `devicePixelRatio` się zmienia, ale
  bufor renderera zostawał przy starej wartości. Poprawka: odczyt
  `devicePixelRatio` przeniesiony do `handleResize()`, wołanego przy
  każdym resize (ten sam wzorzec, jaki `ToolpathCanvas.tsx` już stosował
  dla 2D Preview) — plus dodatkowy `window.addEventListener('resize', ...)`
  obok istniejącego `ResizeObserver` jako dodatkowe zabezpieczenie na
  wypadek, gdyby sam zoom nie zmienił `clientWidth`/`clientHeight`
  kontenera na tyle, żeby ResizeObserver się odpalił.

## [0.7.0] — 2026-08-18

### Dodano

- **localStorage — auto-save i presety wizarda** (Etap 5, ostatnia
  pozycja — teraz kompletny). Zaprojektowane w sesji `/grill-me`, łączy
  dwa wcześniej osobne pomysły (persystencja bieżącego stanu + wishlist
  "Presety operacji") na jednym mechanizmie storage:
  - Nowy moduł `src/lib/storage.ts` — jeden klucz `localStorage`
    (`simplecam.storage`), jeden JSON `{ version, slots }`, generyczne
    `saveSlot`/`loadSlot`/`deleteSlot`/`loadPresetSlots`. Każdy odczyt/
    zapis w try/catch — błąd (tryb prywatny, quota exceeded, uszkodzony
    JSON) daje cichy fallback do wartości domyślnych + `console.warn`,
    appka nigdy się nie wywala.
  - **Auto-save (slot "0"):** zapisywany wyłącznie przy kliknięciu
    **Generate**, nie przy każdej zmianie parametru. Wczytywany raz przy
    starcie appki — jeśli coś jest, wizard od razu otwiera się na Kroku 4
    z bannerem "Restored from your last session" (znika po pierwszej
    zmianie parametru albo Generate).
  - **Presety (sloty "1"–"5"):** numerowane `[1]…[5]` w headerze, obok
    dark mode toggle. Puste — wyszarzone/nieklikalne; zajęte — klik
    wczytuje natychmiast (bez potwierdzenia, spójnie z resztą appki),
    hover pokazuje ikonkę "×" do usunięcia (z potwierdzeniem). Zapis do
    slotu — nowa sekcja "Save to preset" na Kroku 4, z potwierdzeniem
    przy nadpisaniu i krótkim "✓ Saved" feedbackiem (wzorzec "Copied!").
  - Etykieta slotu to auto-opis z parametrów — nowy
    `src/lib/presetLabel.ts` (np. `"Helix • ⌀8mm, 4mm deep"`), bez
    nazwy wpisywanej ręcznie.
  - Migracja schematu: płytki merge per-sekcja z `DEFAULT_WIZARD_PARAMS`
    — snapshot zapisany starszą wersją appki, brakujący nowsze pola, i
    tak wczytuje się poprawnie.
  - 11 nowych testów (`storage.test.ts`, `presetLabel.test.ts`) —
    round-trip zapisu/odczytu, usuwanie, migracja, obsługa błędów.

## [0.6.22] — 2026-08-18

### Zmieniono

- **Badge Kroku 4 w zwiniętym pasku** — checkmark w indigo kółeczku
  pokazuje się teraz tylko gdy `generatedGCode` istnieje (czyli po
  kliknięciu Generate i zanim jakikolwiek parametr go unieważni — patrz
  Etap 2). W przeciwnym razie X w amber kółeczku, sugerujący że coś
  zostało do dokończenia — nowa `XIcon` (`src/components/icons.tsx`),
  obok istniejącej `CheckIcon`.

## [0.6.21] — 2026-08-18

### Dodano

- **PLUNGE i STARTZ w zwiniętym pasku Kroku 3** — dwa nowe `MiniStat` obok
  istniejących FEED/stepdown-a:
  - **PLUNGE** (`params.feeds.plungeRate`, mm/min) — zawsze widoczny,
    nowa `PlungeIcon` (strzałka pionowo w dół przez linię powierzchni —
    ruch Z podczas wcinania w materiał).
  - **STARTZ** (`params.feeds.startZ`, mm) — widoczny tylko gdy różny od
    domyślnego `0` (ten sam wzorzec co OFFSET w Kroku 2 —
    `params.feeds.startZ !== 0`), nowa `StartZIcon` (lustrzane odbicie
    PlungeIcon — strzałka w górę przez linię powierzchni — plus mały
    znak "+" przy grocie, zgodnie z sugestią użytkownika: "+Z" jako
    wizualny skrót "podniesionej" płaszczyzny startowej).

## [0.6.20] — 2026-08-18

### Zmieniono

- **N-Holes on Circle w pasku Kroku 2:** `(R…)` (promień) → `(⌀…)`
  (średnica) — spójne z tym, jak `circleDiameter` jest wpisywane w
  Kroku 2 i jak Rectangle pokazuje swój wymiar (`(X×Y)`), więc badge
  pokazuje ten sam wymiar co pole formularza, nie przeliczoną wartość.

## [0.6.19] — 2026-08-18

### Zmieniono

- **Podsumowanie Positioning w zwiniętym pasku Kroku 2** — opisowy tekst
  zamiast skróconego kodu: `SINGLE HOLE` / `RECTANGLE (X×Y)` /
  `RECTANGLE CENTERED (X×Y)` / `N-HOLES CIRCLE (R…)` / `CUSTOM POINTS (N)`,
  rozbity na kilka linijek (`positioningLines()` w `src/App.tsx`) zamiast
  jednej linii pill-a — wąska (80px) kolumna paska nie mieściła dłuższego
  tekstu w jednej linii. Circle pokazuje promień (`R`), nie średnicę —
  konwencja inna niż `circleDiameter` w danych, celowo pod czytelność
  ikony/etykiety.
- **Ikony trybu pozycjonowania** — dodano `SingleIcon`, `RectangleIcon`,
  `RectangleCenteredIcon`, `CircleHolesIcon`, `CustomPointsIcon`
  (`src/components/icons.tsx`), każda ilustrująca układ punktów danego
  trybu (patrz opis w `CLAUDE.md`), wyświetlana nad opisem w pasku Kroku 2
  — dokańcza ostatnią pozycję z listy "Pozostało" w Etapie 5.

## [0.6.18] — 2026-08-17

### Dodano

- **Nowy wariant pozycjonowania: "N-Holes on Circle"** — obok Single/
  Rectangular Grid/Grid Centered/Custom w Kroku 2. Parametry: liczba
  otworów (`circleHoleCount`), średnica okręgu (`circleDiameter`) i kąt
  startowy pierwszego punktu względem osi +X (`circleStartAngle`, w
  stopniach) — reszta rozłożona równomiernie po obwodzie, przeciwnie do
  wskazówek zegara (ta sama konwencja kąta co przy Offset X/Y —
  atan2/0°=+X). Okrąg wyśrodkowany na `(0,0)`, offset X/Y przesuwa go
  jak każdy inny tryb.
  - Nowy `case 'circle'` w `resolvePoints()` (`src/lib/positioning.ts`)
    — jedyne miejsce z nową logiką geometryczną. Silnik G-code, 2D i 3D
    Preview zadziałały bez żadnych zmian (wołają `resolvePoints()`
    bezpośrednio, dokładnie jak przewidziano w `CLAUDE.md`).
  - Zabezpieczone przed ułamkową/ujemną liczbą otworów
    (`Math.max(0, Math.round(...))`) — `circleHoleCount: 0` daje pusty
    wzorzec, tak samo jak pusta Custom List.
  - Podsumowanie w zwiniętym pasku Kroku 2: `CIRCLE N×⌀D`.

## [0.6.17] — 2026-08-17

### Dodano

- **Nowy wariant pozycjonowania: "Rectangular Grid (Centered)"** — obok
  Single/Rectangular Grid/Custom List w Kroku 2, tuż po zwykłym Grid.
  Osobna wartość `PositioningMode` (`'gridCentered'`), nie toggle
  wewnątrz Grid — reużywa te same pola `gridX`/`gridY` (te same X/Y
  inputy w UI, wspólny blok warunkowy z Grid), tylko liczy rogi
  wyśrodkowane: `(±gridX/2, ±gridY/2)` zamiast `(0,0)…(gridX,gridY)`,
  w tej samej kolejności co Grid (przeciwnie do wskazówek zegara od
  lewego-dolnego rogu). Nowy `case` w `resolvePoints()`
  (`src/lib/positioning.ts`) — automatycznie działa z offsetem X/Y,
  silnikiem G-code i 2D/3D Preview bez dodatkowych zmian (ten sam
  mechanizm co przy dodawaniu Offsetu w 0.6.13). Podsumowanie w
  zwiniętym pasku Kroku 2: `RECT X×Y (C)`.

## [0.6.16] — 2026-08-17

### Zmieniono

- **Adnotacja offsetu w Kroku 2 dostała etykietę "OFFSET"**, tak jak
  BIT/HOLE/DEPTH — dla spójności wizualnej ręcznie sklejany blok w
  `App.tsx` zastąpiony bezpośrednim użyciem współdzielonego komponentu
  `MiniStat` (ten sam, którego już używają pozostałe statystyki paska).

## [0.6.15] — 2026-08-17

### Zmieniono

- **`OffsetIcon` przerysowana wg wzoru dostarczonego przez użytkownika** —
  pełny krzyż osi (cienki, przez całą ikonę) zamiast małego "+" na środku,
  plus wyraźnie grubsza strzałka (`strokeWidth 2.4` vs `1` dla osi) niż
  poprzednia wersja — bliżej faktycznego symbolu układu kartezjańskiego ze
  strzałką offsetu, o który chodziło od początku.

## [0.6.14] — 2026-08-17

### Zmieniono

- **Ikona offsetu w zwiniętym pasku Kroku 2 uproszczona — statyczna,
  nie obraca się.** Poprzednia wersja (0.6.13) dynamicznie obracała
  `OffsetIcon` pod rzeczywisty kąt offsetu (`atan2`) — okazało się to
  nadinterpretacją: to ma być subtelny, stały znacznik "offset jest
  ustawiony", nie druga wizualizacja kierunku (od tego jest wektor w
  2D/3D Preview, bez zmian). Ikona zawsze wskazuje w prawy górny róg
  (ćwiartka I), w kolorze pozostałych ikon paska (`slate-500`/`slate-400`,
  jak `BitIcon`/`DiameterIcon`/`DepthIcon`) zamiast amber. `offsetSummary()`
  w `App.tsx` uproszczone z `{angleDeg, label}` na samo `string | null`.

## [0.6.13] — 2026-08-17

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
