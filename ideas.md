# Pomysły i backlog OnlyPaths

Ten plik zbiera wszystko, co dziś **nie** jest zaimplementowane —
podzielone na trzy różne statusy. `CLAUDE.md` przechowuje wyłącznie stan
obecny (finalne decyzje), a historia tego, jak appka do niego doszła, żyje
w `CHANGELOG.md` — ten plik to jedyne miejsce na przyszłość appki.

## Pomysły w dyskusji (poza aktywnym zakresem)

Wnioski z sesji `/grill-me`, które **nie są jeszcze zaakceptowaną decyzją
projektową** (w przeciwieństwie do "Kluczowe decyzje projektowe" w
`CLAUDE.md` czy pozycji `BL-#`/`OP-#` niżej) — spisane wspólne
zrozumienie, punkt wyjścia do realnej implementacji w przyszłości, kiedy
padnie wyraźne "przechodzimy do X".

`OP-2` (Pocket) zaimplementowany — pełne rozstrzygnięcia sesji
`/grill-me` (2026-09-21) żyją teraz w `CLAUDE.md`, historia
implementacji w `CHANGELOG.md`, `[0.18.0]`/`[0.18.1]`. Z tej sesji
wyłoniły się też trzy świadomie odłożone pozycje: `OP-5` (Adaptive
Clearing), `BL-41` (konfigurowalny kąt rampy), `BL-42` (finishing wall
pass / stock-to-leave) — patrz niżej.

`OP-5` (Pocket Adaptive) zaimplementowany — rozstrzygnięcia sesji
`/grill-me` (2026-09-25) żyją teraz w `CLAUDE.md`, historia
implementacji (łącznie z korektą modelu zaangażowania po symulacji) w
`CHANGELOG.md`, `[0.19.0]`.

## Backlog (`BL-#`)

Techniczny dług i drobniejsze, jasno zakresowe pomysły — każdy ze stałym
numerem `BL-#`, nadawanym raz i niezmieniającym się przy regrupowaniu/
reprioritetyzacji (czysty identyfikator do odnoszenia się w rozmowie:
"zrób BL-4"), i jednym z czterech statusów:

- **Otwarty** — domyślny, czeka na realizację.
- **W trakcie** — rozpoczęte, ale zakres okazał się większy niż
  pojedyncza poprawka i wymaga rozbicia na mniejsze kroki (rzadki
  przypadek — większość pozycji idzie prosto z Otwarty do Zrealizowany).
- **Zrealizowany** — wdrożone; pełne "co i dlaczego" żyje w
  `CHANGELOG.md`, tu zostaje tylko krótki wpis jako ślad decyzji.
- **Odrzucony** — świadomie zdecydowano nie robić (z datą i, jeśli
  podane w rozmowie, powodem).

**Pozycja nigdy nie znika z tej listy — zmienia się tylko jej status.**
To zmiana względem wcześniejszej konwencji (zamknięte pozycje kiedyś
usuwane z pliku) — teraz cała historia decyzji zostaje widoczna
bezpośrednio tutaj, nie tylko rozproszona po `CHANGELOG.md`.

Ta sama lista, wizualnie — pogrupowana etapami trudności, z kolorowym
oznaczeniem 🟢/🟠/🔴 i filtrem statusu (domyślnie pokazuje tylko
**Otwarte**) — jest opublikowana jako Artifact:
**<https://claude.ai/code/artifact/e90a2f5c-932c-4772-804e-0fe155ab32a0>**.

**Zasada — trzymać oba źródła w zgodzie:** po wdrożeniu zmiany
odpowiadającej któremuś `BL-#`/`OP-#` — zmienić jego status na
**Zrealizowany** (nie usuwać bulleta) i zaktualizować Artifact pod tym
samym URL (republikacja z `url` ustawionym na powyższy link, nie nowa
publikacja) — poprawić status karty i liczniki w pasku statystyk na
górze. Zmiana statusu w `ideas.md`/Artifact to sama w sobie zmiana
procesu/dokumentacji, nie appki — **nie wymaga wpisu w `CHANGELOG.md`**
(ten opisuje appkę, nie narzędzia śledzenia backlogu). Bez
zsynchronizowania statusu Artifact szybko rozjeżdża się ze stanem
faktycznym.

- **`BL-4`** *(Otwarty)* — **CI/CD (GitHub Actions).** Brak mimo że repo jest na
  GitHubie — świadomie poza zakresem do wyjścia z fazy testów. Build+test
  na push to standard, ale spięcie z `npm run deploy` (sekrety FTP,
  gating) dokłada realną decyzję projektową.
- **`BL-7`** *(Odrzucony, 2026-09-12)* — **Import DXF / SVG.** Dziś
  pozycjonowanie to wyłącznie Single/Grid/Grid Centered/Circle/Custom
  List (ręcznie wpisane punkty) — import pliku jako alternatywne źródło
  punktów. Parsowanie formatu, ekstrakcja geometrii, mapowanie na
  otwory/kontury.
- **`BL-8`** *(Otwarty)* — **Responsywny UI na małych ekranach.** Dziś layout zakłada
  desktop: dwukolumnowy układ (Wizard Section + Preview Section obok
  siebie), gęste pola liczbowe w parach X/Y w jednej linii, Preview
  Viewport 3D z absolutnie pozycjonowanymi przyciskami widoku. Dotyka
  praktycznie każdego komponentu — wymaga przemyślenia, czy Preview
  Section chowa się pod Wizard Section czy za zakładką, czy pary X/Y
  wracają do jednej kolumny na wąskim ekranie, itd.

  Koncepcja akordeonu 4 kroków (Active Step Panel + Step N Summary,
  patrz `CLAUDE.md`) zostaje — to nie jest do przeprojektowania, tylko do
  uelastycznienia. Dziś szerokości są sztywne w px (`w-[420px]` na
  rozwinięty panel, `w-20` na zwinięty pasek), nieskalujące się z oknem.
  Docelowo proporcjonalny podział szerokości między Wizard Section a
  Preview Section (np. ok. 40%/60%), z twardym minimalnym floorem dla
  Wizard Section — poniżej pewnej szerokości okna czytelność formularzy w
  Kroku 2/3 się rozpada. Dokładna wartość progu do ustalenia przy realnej
  implementacji, prawdopodobnie razem z sesją `/grill-me`.
- **`BL-18`** *(Otwarty)* — **Zweryfikować kompatybilność wsteczną ze starszymi
  przeglądarkami.** Zgłoszenie użytkownika: na Windows 8, w kilku
  przeglądarkach, tylko Preview Section miała kolory zgodne z ustawioną
  paletą — reszta (Header, Wizard Section) renderowała się na biało, a
  Settings Modal był półprzezroczysty i przez to nieczytelny. Podejrzenie:
  różnice w obsłudze nowoczesnego CSS (Tailwind v4 CSS-first `@theme`/
  `@custom-variant dark`, prawdopodobnie kolory w przestrzeni `oklch`,
  `backdrop-blur` na modalu) przez starsze silniki przeglądarek. Wymaga:
  ustalenia realnego zakresu wspieranych przeglądarek/wersji (projekt
  dotąd nie miał tej decyzji spisanej), zreprodukowania problemu na
  starszym silniku, zidentyfikowania, które konkretne właściwości CSS się
  nie renderują, i albo dodania fallbacków, albo świadomej decyzji "nie
  wspieramy X" udokumentowanej w `CLAUDE.md`.
- **`BL-20`** *(Odrzucony, 2026-09-12 — w zamian `BL-29` Privacy Policy:
  prostsze rozwiązanie, bez trackingu i bez implikacji RODO poniżej)* —
  🔒 **Licznik użytkowników (unikalne IP).** Wymaga własnej,
  pełnej sesji `/grill-me` przed jakąkolwiek decyzją implementacyjną —
  pomysł bezpośrednio dotyka fundamentalnej zasady projektu ("Zero
  backendu. Zero bazy danych."), nie jest to dopracowanie szczegółów.
  Wstępny, nierozstrzygnięty szkic z przerwanej sesji `/grill-me`:
  najpierw sprawdzić, czy obecny hosting cPanel udostępnia już
  AWStats/Webalizer/surowe logi Apache — jeśli tak, temat może rozwiązać
  się bez żadnych zmian w kodzie appki. Jeśli nie, realne opcje to własny
  licznik po stronie serwera (prawdziwy wyłom od "zero backendu") albo
  lekki skrypt analityki trzeciej strony w stylu Plausible/Fathom/
  GoatCounter (żądanie sieciowe przy każdym wejściu — też odejście od
  dzisiejszej appki bez jakiegokolwiek trackingu). Do rozważenia też:
  "unikalne IP" to tylko przybliżenie "unikalnych ludzi" (NAT zaniża,
  rotacja IP zawyża), oraz implikacje RODO przy liczeniu po IP (strona
  hostowana na `.pl`).
- **`BL-25`** *(Zrealizowany, 2026-09-20)* — **Tryb edycji przywołanego
  presetu.** Zakres dopracowany sesją `/grill-me`, wdrożony tego samego
  dnia — pełny opis w `CHANGELOG.md`, `[0.17.0]`, i w `CLAUDE.md` (sekcja
  "localStorage — auto-save + presety").
- **`BL-26`** *(Otwarty)* — **Przytrzymanie przycisku `NumberInput` (auto-repeat).**
  Dziś klik na strzałkę góra/dół (`src/components/wizard/NumberInput.tsx`,
  `useNumberField.onAdjust`) to zawsze dokładnie jeden krok — świadomie
  pominięte przy pierwszym wdrożeniu (zgłoszenie dotyczyło wyglądu
  natywnego spinnera, nie zachowania). Przytrzymanie mogłoby powtarzać
  krok co interwał, jak natywny spinner przeglądarki — wymaga
  timera/interwału uruchamianego na `onMouseDown`, czyszczonego na
  `onMouseUp`/`onMouseLeave`.
- **`BL-27`** *(Odrzucony, 2026-09-12)* — **Glow (bloom) na toolpath/osiach w motywach Arcade
  Studio.** Specy `design-arcade-restrained.md`/`design_arcade_full_neon.md`
  przewidują `path-glow` na toolpath i osiach — świadomie pominięte przy
  wdrożeniu obu motywów. 2D Preview to Canvas API, nie SVG (jak spec
  sugeruje) — dałoby się przez `ctx.shadowBlur`/`shadowColor`. 3D
  wymagałoby osobnego postprocessing passu (`UnrealBloomPass`), który
  same specy każą najpierw zweryfikować pod kątem wydajności — wymaga
  własnej oceny kosztu/efektu przed implementacją, nie oczywista
  poprawka.
- **`BL-29`** *(Zrealizowany, 2026-09-13)* — **Privacy Policy w Settings
  Modal.** Osobna sekcja Settings Nav "Privacy", statyczny tekst — pełny
  opis w `CHANGELOG.md`, `[0.15.0]`. Zastąpił `BL-20` jako prostsza
  odpowiedź na tę samą troskę (prywatność/RODO), bez budowania żadnego
  trackingu.

- **`BL-30`** *(Odrzucony, 2026-09-13)* — **Surface — obsługa kształtu
  Circle.** `OP-3` (Surface) zostaje wyłącznie Rectangle. Wymagałoby
  przycinania linii skanu (rastra) do granicy koła — dodatkowa
  złożoność geometryczna nieobecna przy Rectangle (gdzie linie rastra
  po prostu biegną od krawędzi do krawędzi).
- **`BL-32`** *(Zrealizowany, 2026-09-13)* — **Siatka w motywach Arcade
  Studio ledwie widoczna.** Pełny opis w `CHANGELOG.md`, `[0.15.4]`–
  `[0.15.5]`.
- **`BL-33`** *(Zrealizowany, 2026-09-13)* — **Uniwersalny komponent
  Checkbox.** Wszystkie 4 checkboxy appki, nie tylko Krok 4 — pełny opis
  w `CHANGELOG.md`, `[0.15.3]`.
- **`BL-34`** *(Zrealizowany, 2026-09-13)* — **BUG: ścieżka cięcia
  Outline Rectangle Cornered pokrywała się z granicą materiału zamiast
  być przesunięta o promień narzędzia.** Pełny opis w `CHANGELOG.md`,
  `[0.15.2]`.
- **`BL-35`** *(Zrealizowany, 2026-09-20)* — **Surface Unidirectional:
  reentry między liniami rastra plunge'uje na Plunge Rate przez cały
  dystans od Safe Z, zamiast tylko przez ostatni stepdown.** Naprawione:
  `G0` do `toZ + stepdown` przed finalnym `G1` plunge'em — wysokość
  względna do bieżącego poziomu (`toZ`), poprawna na każdym poziomie.
  Pełny opis: `CHANGELOG.md`, `[0.16.6]`.
- **`BL-36`** *(Zrealizowany, 2026-09-17)* — **Preview: przyciski
  Hide/Show Stock i Hide/Show Toolpath.** Rozwinięte przy sesji
  `/grill-me` — dwa niezależne przełączniki tekstowe w lewym górnym rogu
  obu podglądów, dostępne zawsze (także podczas overlay presetów), jeden
  wspólny stan między zakładkami 2D/3D, bez wpływu na `canGenerate` —
  pełny opis w `CHANGELOG.md`, `[0.16.1]`.
- **`BL-37`** *(Zrealizowany, 2026-09-20)* — **Ponownie rozważyć: bryła
  stock/otworu w 3D Preview rysowana od `Start Z`, nie zawsze od `Z=0`.**
  Rozstrzygnięte sesją `/grill-me`: bryła (Hole(s)/Outline, nie Surface)
  zawsze na `Z=0`, wysokość zawsze `totalDepth` — `Start Z` to margines
  najazdu na posuwie roboczym, nie wysokość materiału. Pełny opis:
  `CHANGELOG.md`, `[0.16.5]`.
- **`BL-38`** *(Zrealizowany, 2026-09-21)* — **Przycisk włącz/wyłącz
  etykiety siatki w 3D Preview, obok Hide Stock/Hide Toolpath.**
  Rozstrzygnięte bez sesji `/grill-me`: nowy przycisk czyta/zapisuje
  wprost `appearance.grid3DLabelsEnabled` (ten sam trwały stan co
  checkbox w Settings), nie osobny lokalny stan jak `BL-36`. Pełny
  opis: `CHANGELOG.md`, `[0.17.3]`.
- **`BL-39`** *(Zrealizowany, 2026-09-21)* — **Przełączanie presetu
  resetowało aktywny krok wizarda na Step 4.** Usunięte oba wywołania
  `setActiveStep(4)` w `handleLoadPreset`/`handlePresetSlotClick`
  (`src/App.tsx`) — aktywny krok akordeonu zostaje teraz bez zmian przy
  wczytaniu/przełączeniu presetu, w obu trybach. Drobna poprawka, bez
  wpisu w `CHANGELOG.md`.
- **`BL-40`** *(Zrealizowany, 2026-09-21)* — **Przycisk "Reset All
  Settings to Defaults" w Settings Modal.** Zakres rozszerzony w
  dyskusji poza pierwotny opis — czyści wszystkie cztery klucze
  `localStorage`, nie tylko trzy: Appearance, Tool Diameters, Machine
  Settings (dialekt/travel/G-code/mostki) i wszystkie sloty presetów
  łącznie z ukrytym `"0"`. Osobna pozycja Settings Nav "Reset" (między
  "Privacy" a "About"). Pełny opis: `CHANGELOG.md`, `[0.17.2]`.
- **`BL-41`** *(Otwarty)* 🟢 — **Konfigurowalna długość rampy dla Pocket
  Spiral.** Z sesji `/grill-me` `OP-2`, zrewidowane sesją weryfikacji
  wizualnej (2026-09-21): kąt rampy między pierścieniami Circle nie jest
  już stały — wyliczany per pierścień (`rampSweepDegFor()`) tak, żeby
  długość łuku rampy była proporcjonalna do `RAMP_LENGTH_FACTOR = 3`
  (stała, niekonfigurowalna) razy promieniowa zmiana tej transycji.
  Mogłaby stać się polem liczbowym (jak Helix Radius) do dostrajania per
  materiał/narzędzie — mechanizm już istnieje, to tylko odsłonięcie
  `RAMP_LENGTH_FACTOR` jako parametru + walidacja zakresu.
- **`BL-42`** *(Otwarty)* 🟠 — **Finishing wall pass / stock-to-leave dla
  Pocket.** Z sesji `/grill-me` `OP-2`: v1 to roughing-only (zewnętrzny
  pierścień/linia raster JEST ścianą). Osobny, dokładny przejazd
  wykończeniowy (nowy parametr `stockToLeave`, roughing zatrzymuje się
  tym promieniem przed granicą, potem jeden przejazd reużywający Outline
  Rectangle/Circle toolpath na granicy offsetu) dałby czystszą ścianę —
  większy zakres niż `BL-41`, dotyka kilku miejsc silnika na raz.
- **`BL-66`** *(Otwarty)* 🟠 — **Wyróżnienie pól, które nie przeszły
  walidacji.** Dziś błąd to wyłącznie czerwony tekst pod polem — samo
  pole (`NumberInput`/`<select>`/textarea) wygląda tak samo jak poprawne,
  więc przy kilku błędach naraz trudno wskazać, które pole je powoduje.
  Ramka (i ewentualnie poświata w Arcade) w kolorze błędu pasującym do
  motywu — nowy token albo reużycie `status-error` we wszystkich czterech
  motywach, light i dark. Wymaga powiązania każdego walidatora z polem
  (lub polami — np. frez vs średnica otworu, Tab Count × Width), np. prop
  `invalid` w `FieldRow`/`NumberInput`, spójnie w Krokach 2 i 3 oraz w
  Settings.

**`BL-17` zamknięte — "Interface Anatomy"**, Artifact z umownymi nazwami
elementów UI, dziś aktywnie używany w `CLAUDE.md`:
**<https://claude.ai/code/artifact/ea21c02e-41ed-4bb5-90ec-48ae9a61c23e>**.
Nie podlega zasadzie synchronizacji wyżej (nie jest listą backlogu) —
aktualizować go tylko jeśli realny layout appki zmieni się na tyle, że
mockup przestanie być wierny.

### Code review (2026-09-26)

Globalny code review całego kodu (subagent, bez zmian w repo, zweryfikowany
sondami testowymi i fuzzowaniem ~2 560 losowych, przechodzących walidację
zestawów parametrów). Każda pozycja poniżej to krótkie streszczenie —
pełny opis (lokalizacja w kodzie, scenariusz błędu, proponowana zmiana)
w sekcji **"Szczegóły code review (2026-09-26)"** na końcu tego pliku.
Waga z review w nawiasie kwadratowym.

- **`BL-61`** *(Otwarty)* 🔴 **[Low, kosztowne w czasie]** — **Podglądy
  duplikują geometrię silnika; łańcuchy ternary po `operation`** —
  docelowo jedna lista ruchów (jak Adaptive) i rejestr `OPERATION_META`;
  przy okazji martwy `lib/index.ts` i nieaktualne komentarze.
- **`BL-63`** *(Otwarty)* 🟠 **[Low]** — **Wydajność podglądów** — brak
  debounce, Adaptive przy 1% i cały G-code w jednym `<pre>`, podgląd
  1000 otworów przy literówce, domyślna zakładka 3D, `WebGLRenderer` bez
  `forceContextLoss()`.
- **`BL-64`** *(Otwarty)* 🟢 **[Low]** — **Dostępność: stan przełączników
  tylko kolorem** — brak `aria-pressed`/`radiogroup`.

## Przyszłe operacje (`OP-#`)

Osobna, celowo **nie** `BL-#` kategoria — każda to nie drobna poprawka
tylko kamień milowy wielkości całego etapu implementacji, z własną,
dziś nieznaną taksonomią (operacja → pattern/sub-choice → parametry).
Numer `OP-#` jest identyfikatorem, nie kolejnością realizacji. `OP-1`
(Outline), `OP-2` (Pocket), `OP-3` (Surface) i `OP-5` (Pocket Adaptive)
zaimplementowane — patrz `CLAUDE.md`, "Kluczowe decyzje projektowe"
(pełne rozstrzygnięcia sesji `/grill-me` dla Surface, 2026-09-12, dla
Pocket, 2026-09-21, i dla Adaptive, 2026-09-25; historia implementacji w
`CHANGELOG.md`, `[0.14.0]`, `[0.18.0]` i `[0.19.0]`).

- **`OP-4` — Text/Font Tracing.** Wybór czcionki i generowanie ścieżki
  narzędzia po napisie — albo tracing obrysu (konturu) każdej litery,
  albo, dla specjalnych czcionek jednoliniowych, tracing wprost po
  osi/linii znaku (przydatne do małych napisów, grawerów słów, gdzie
  pełny obrys byłby zbyt drobny/skomplikowany). Wymaga parsowania
  glifów czcionki (najpewniej z plików fontowych, np. przez jakąś
  bibliotekę do path-data) — geometria wejściowa nieporównywalna z
  dzisiejszymi kształtami parametrycznymi (Rectangle/Circle).
- **`OP-5` — Adaptive Clearing dla Pocket.** Alternatywna strategia
  roughingu z utrzymaniem stałego zaangażowania narzędzia
  (trochoidalne/adaptacyjne czyszczenie) — lepsza żywotność narzędzia
  przy twardszych materiałach niż dzisiejsze Raster/Spiral. Świadomie
  odłożone podczas sesji `/grill-me` `OP-2` (2026-09-21) jako zbyt duży
  dodatkowy zakres na start Pocket v1. **Zrealizowany** — własna sesja
  `/grill-me` 2026-09-25, trzecia metoda Pocket (Circle + Rectangle,
  stałe zaangażowanie liczone analitycznie). Pełny opis: `CHANGELOG.md`,
  `[0.19.0]`.

**Każda z `OP-#` wymaga własnej, pełnej sesji `/grill-me` przed
napisaniem jakiegokolwiek kodu** — nieporównywalnie większy zakres
otwartych decyzji niż `BL-#`. Z tego powodu Artifact backlogu pokazuje je
jako osobną sekcję, nie jako kolorowe łatwe/średnie/trudne zadania —
trudność jest dziś celowo nieoszacowana, `/grill-me` to część definiowania
zakresu, nie coś do zgadnięcia z góry.

## Szczegóły code review (2026-09-26)

Pełne ustalenia z globalnego code review (subagent, tylko odczyt).
Stan wyjściowy: `tsc -b` i lint czyste, 364/364 testów. Hipotezy
potwierdzane sondami testowymi w scratchpadzie sesji (poza repo), w tym
fuzzowaniem ~2 560 losowych, przechodzących walidację zestawów parametrów
dla każdej operacji/metody pod kątem: NaN, F ≤ 0, niezgodność promienia
G2/G3, G0 w XY poniżej Safe Z, osiągnięcie pełnej głębokości. Numery
wierszy — stan kodu z dnia review (`main` @ `b867d4f`).

### `BL-61` — Duplikacja geometrii w podglądach, ternary po operacji
- **Lokalizacja:** `preview3d/buildScene.ts:135-579` (`helixPoints3D`,
  `standardHolePoints3D`, `tabbedCirclePoints3D`,
  `tabbedRectanglePoints3D`, `rectRampPoints3D`,
  `buildSurfaceToolpathPoints3D`, łańcuch Pocket) — odtwarzają pętle
  `helix.ts`, `standardHole.ts`, `tabs.ts`, `outlineRectangle*.ts`,
  `surface.ts`, `pocket.ts` krok po kroku; `drawToolpath.ts` podobnie.
  Powtarzane łańcuchy `operation === 'outline' ? … : 'surface' ? … :
  'pocket' ? …` w `App.tsx:281-325, 410-418`, `validation.ts:298-331`,
  `download.ts`, `Step4Output.tsx:52-54`.
- **Problem:** komentarze w kodzie dokumentują kilka błędów rozjazdu
  podgląd/silnik złapanych dopiero wizualnie (np. cięciwa pierścienia w
  3D, kąt startowy helixa Surface). Adaptive pokazuje lepszy wzorzec:
  jedna lista ruchów dla G-code i podglądów. Łańcuchy ternary to
  przyczyna `BL-51` (naprawionego w 0.20.0). Drobniejsze: `RasterDirectionToggle`/
  `ZTransitionModeToggle` skopiowane między Step 2 Surface i Pocket;
  `src/lib/index.ts` to martwy barrel (dwie funkcje, zero importów).
  Nieaktualne komentarze: `helix.ts:30`,
  `standardHole.ts:17` ("startZ = materiał wyższy" — sprzeczne z
  `BL-37`), `Step2Geometry.tsx:20` ("three focused ones" — są cztery).
- **Proponowana zmiana:** stopniowo przenieść każdy silnik na
  strukturalną listę ruchów (line/arc/rapid/plunge + rodzaj) z jednym
  formaterem G-code i jednym adapterem podglądu; rejestr `OPERATION_META`
  (walidacja/generate/footprint/slug/forcedLinear). Usunąć `lib/index.ts`,
  poprawić nieaktualne komentarze.
- **Nakład:** trudny (lista ruchów) / łatwy (porządki).

### `BL-63` — Wydajność podglądów
- **Problem:** każde naciśnięcie klawisza przebudowuje całą scenę 3D i
  przelicza Adaptive, bez debounce. Przy 1% Optimal Load (wpisywane w
  drodze do "10"/"15") domyślna kieszeń buduje się ~100 ms (36k ruchów),
  G-code ~1.2 s dla 453k linii; najgorszy przypadek z fuzzowania ~11 s dla
  2.27M linii — zakładka G-code renderuje wszystko w jednym `<pre>`.
  `circleHoleCount` ograniczony tylko dla Generate — literówka "1000"
  buduje w podglądzie 1000 otworów. `previewTab` domyślnie `'3d'` —
  leniwie ładowana paczka Three.js i tak pobierana przy każdym starcie.
  Każde przełączenie 2D↔3D tworzy nowy `WebGLRenderer` bez
  `forceContextLoss()`, kamera za każdym razem się re-frame'uje.
- **Proponowana zmiana:** debounce przebudowy podglądów (albo Adaptive w
  workerze), zaciśnięcie liczby otworów w podglądzie, rozważyć domyślną
  zakładkę 2D, `renderer.forceContextLoss()` przy sprzątaniu.
- **Nakład:** średni.

### `BL-64` — Dostępność przełączników
- **Lokalizacja:** brak `aria-pressed` w całym kodzie (grep: 0). Dotyczy
  przycisków overlay/Edit Mode (`App.tsx:640, 662`), przycisków
  metod/opcji, przełącznika interpolacji, X/Y, Plunge/Helix, Conv/Climb.
- **Problem:** stan przełącznika przekazywany wyłącznie kolorem —
  niedostępny dla czytników ekranu.
- **Proponowana zmiana:** `aria-pressed` na przyciskach-przełącznikach,
  albo `role="radiogroup"`/`radio` z `aria-checked` dla grup wzajemnie
  wykluczających się.
- **Nakład:** łatwy.

### Sprawdzone i bez uwag (zakres review)
- Składanie programu: kolejność nagłówka/stopki/user header/footer,
  `M30`/`M2` jako faktycznie ostatnia linia, `G4 P` sekundy vs ms,
  zaokrąglanie `fmt()` i "-0", retrakt na Safe Z po każdym punkcie.
- Spójność łuków: każdy G2/G3 w ~2 560 losowych konfiguracjach (wszystkie
  operacje/metody, mostki, oba kierunki) w granicy 0.002 mm; poprawka
  0.18.2 i `pocketEntryPoint` działają.
- Brak G0 w XY poniżej Safe Z; przejazdy Adaptive "stay down" to G1 przez
  wycięty obszar; przejścia między poziomami zgodne z projektem.
- Głębokość: każdy program osiąga dokładnie −totalDepth (poza obcięciem
  z `BL-55`).
- Mostki o całkowitej liczbie, geometria Outline Rectangle (`BL-34`),
  overtravel Surface i położenie helixa poza materiałem, inset Pocket i
  sufit Helix Radius (≤ promień freza).
- Podglądy Pocket Spiral i Adaptive reużywają funkcji silnika; lustra
  Surface/Hole(s) w 3D dziś zgodne z silnikiem.
- Zwalnianie zasobów Three.js (geometrie, materiały, tekstury sprite'ów),
  reset kadrowania pod StrictMode.
- `localStorage`: try/catch wszędzie, merge per sekcja, straże dialektu/
  motywu/palety/rozmiaru etykiet, walidacja listy średnic.
- Settings Modal: focus trap, Escape, przywracanie fokusu; paski
  zwiniętych kroków to prawdziwe `<button>`.
- Deploy: sekrety z ignorowanego `.env`, jawne FTPS domyślnie.
