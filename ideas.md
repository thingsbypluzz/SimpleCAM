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
- **`BL-43`** *(Otwarty)* 🟢 — **Rozmycie (blur) interfejsu pod Settings
  Modal.** Przy otwartym Settings Modal cała warstwa appki pod nim
  (Header, Wizard Section, Preview Section) rozmyta, żeby modal
  wyraźniej odcinał się od tła. Najpewniej `backdrop-blur` na
  istniejącym tle-nakładce modala w `SettingsModal.tsx`, spójnie we
  wszystkich motywach; do sprawdzenia wydajność przy żywym 3D Preview
  pod spodem.

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

- **`BL-44`** *(Otwarty)* 🟠 **[High]** — **"Conventional" to w
  rzeczywistości climb, a przełącznik Adaptive działa odwrotnie do
  etykiety.** Przy M3 CCW wewnątrz kieszeni = współbieżne (materiał po
  prawej). Dotyczy dokumentacji Outline/Pocket/Hole(s) i realnego wyboru
  użytkownika w Adaptive. Zdecydować konwencję, poprawić kierunki albo
  etykiety, dodać test przypinający kierunek.
- **`BL-45`** *(Otwarty)* 🟢 **[High]** — **Ułamkowy Tab Count wyrzuca
  Outline Rectangle poza narożniki na pełnej głębokości; 0 mostków
  przechodzi walidację.** Wymusić liczbę całkowitą ≥ 1 (pola, Settings,
  walidacja) i zaciskać ułamki w generatorach mostków.
- **`BL-46`** *(Otwarty)* 🟢 **[High]** — **Brak dolnych limitów Start Z,
  Safe Z, posuwów i wymiarów.** Ujemny Start Z = G0 w materiał, pusty
  Feedrate = `F0` (GRBL error 22). Dodać walidatory > 0 / ≥ 0.
- **`BL-47`** *(Otwarty)* 🟢 **[High]** — **Wczytanie presetu przy
  otwartym Kroku 2/3 zostawia stare wartości w polach; lista Custom
  potrafi nadpisać wczytane punkty** (także live-save w Edit Mode).
  Przemontować krok (klucz) przy wczytaniu presetu/resecie.
- **`BL-48`** *(Otwarty)* 🟢 **[Medium]** — **Błędne linie Custom List
  (`10 20`, `abc`, `10`) po cichu stają się otworami w (0,0)/(x,0).**
  Walidacja per linia z numerem linii, blokada Generate.
- **`BL-49`** *(Otwarty)* 🟢 **[Medium]** — **Frez równy otworowi przechodzi
  walidację → łuki o zerowym promieniu / wiercenie na Feedrate XY.**
  Zaostrzyć `<=` do `<` (Hole(s), Outline Circle Inside).
- **`BL-50`** *(Otwarty)* 🟠 **[Medium]** — **Kąt zejścia Helix/Ramp poza
  Adaptive jest nieograniczony** (mały promień / krótki bok → prawie
  pionowe zejście na Feedrate XY). Limit kąta rampy albo ograniczenie
  pionowej składowej do Plunge Rate.
- **`BL-51`** *(Otwarty)* 🟢 **[Medium]** — **Przełącznik interpolacji w
  Kroku 4 czyta mostki Hole(s) dla Surface/Pocket** — UI pokazuje
  zablokowane G1, a plik zawiera G2/G3.
- **`BL-52`** *(Otwarty)* 🟢 **[Medium]** — **W Edit Mode każda zmiana
  parametru resetuje kamerę 2D/3D i dwukrotnie przebudowuje scenę 3D**
  (nowa referencja `overlayParams`).
- **`BL-53`** *(Otwarty)* 🟢 **[Medium]** — **Obroty wrzeciona i dwell są
  na sztywno** (`M3 S12000`, `G4 P3`) — brak pól w UI; na Marlinie S bywa
  PWM 0–255.
- **`BL-54`** *(Otwarty)* 🟢 **[Medium]** — **Preambuła nie ustala trybu
  I/J ani posuwu** (`G91.1`, `G94`, `G40`, `G49`) — Mach3 w trybie
  absolutnym I/J poprowadzi łuki wokół złego środka.
- **`BL-55`** *(Otwarty)* 🟠 **[Medium–Low]** — **Limity bezpieczeństwa
  pętli (5000) po cichu obcinają poprawne zadania** — niewycięty
  materiał lub końcowe głębokie zejście. Zgłaszać obcięcie jako błąd
  walidacji.
- **`BL-56`** *(Otwarty)* 🟢 **[Low–Medium]** — **Po "Reset All Settings"
  Settings Modal pokazuje stare wartości, a blur potrafi je zapisać z
  powrotem.**
- **`BL-57`** *(Otwarty)* 🟠 **[Low–Medium]** — **Zagnieżdżone enumy w
  zapisanych danych nie są walidowane i brak ErrorBoundary** — uszkodzony
  zapis = biały ekran przy każdym starcie.
- **`BL-58`** *(Otwarty)* 🟢 **[Low]** — **Skrypt deploy: strona jest
  zepsuta w trakcie wysyłki (i po nieudanej); podpowiedź wyłączenia
  weryfikacji certyfikatu; roczny cache dla `favicon.svg`.**
- **`BL-59`** *(Otwarty)* 🟢 **[Low]** — **Surface Unidirectional: G0 przy
  powrocie schodzi dokładnie do dna poprzedniego poziomu, bez zapasu.**
- **`BL-60`** *(Otwarty)* 🟢 **[Low]** — **Etykieta Stepdown w Kroku 3
  zawsze z metody Hole(s)** ("Pitch per 360° turn" także dla
  Pocket/Surface/Outline).
- **`BL-61`** *(Otwarty)* 🔴 **[Low, kosztowne w czasie]** — **Podglądy
  duplikują geometrię silnika; łańcuchy ternary po `operation`** —
  docelowo jedna lista ruchów (jak Adaptive) i rejestr `OPERATION_META`;
  przy okazji martwy `lib/index.ts` i nieaktualne komentarze.
- **`BL-62`** *(Otwarty)* 🟠 **[Low]** — **Luki w testach** — brak testów
  przekrojowych (G0 na Safe Z, F > 0, osiągnięcie −totalDepth, łuki G2/G3
  we wszystkich operacjach), parsowania Custom List, logiki Kroku 4.
- **`BL-63`** *(Otwarty)* 🟠 **[Low]** — **Wydajność podglądów** — brak
  debounce, Adaptive przy 1% i cały G-code w jednym `<pre>`, podgląd
  1000 otworów przy literówce, domyślna zakładka 3D, `WebGLRenderer` bez
  `forceContextLoss()`.
- **`BL-64`** *(Otwarty)* 🟢 **[Low]** — **Dostępność: stan przełączników
  tylko kolorem** — brak `aria-pressed`/`radiogroup`.
- **`BL-65`** *(Otwarty)* 🟢 **[Low]** — **Rectangle Spiral z wejściem
  Helix ignoruje `helixRadius` przy budowaniu pierścieni** — pierwsze
  pierścienie jadą w powietrzu wewnątrz otworu helixa.

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

### `BL-44` — "Conventional" to climb; przełącznik Adaptive odwrotnie
- **Lokalizacja:** `src/lib/pocketAdaptive.ts:283-284`,
  `src/types/wizard.ts:29-31`, `Step2GeometryPocket.tsx:108-109`,
  `outlineRectangle.ts:35-38`, `outlineCircle.ts:14-18`,
  `pocketSpiral.ts:95`, `pocketZTransition.ts:40`, `CLAUDE.md` (Outline
  "Inside → CCW (konwencjonalne)", Pocket "zawsze konwencjonalne (CCW)").
- **Problem:** przy M3 wrzeciono obraca się CW patrząc z góry. Frez
  jadący CCW wewnątrz otworu ma materiał po prawej — ząb wchodzi w
  materiał z pełną grubością wióra, czyli frezowanie **współbieżne
  (climb)**; przeciwbieżne (conventional) to materiał po lewej (reguła
  frezarki ręcznej: krawędzie wewnętrzne CW, zewnętrzne CCW). Zewnętrzny
  obrys CW to również climb. Wszystko, co dokumentacja/komentarze nazywają
  "conventional" (Outline Inside/Outside, wejście Pocket, Hole(s)), jest
  climb — `circle.ts:24` zresztą już mówi "climb", sprzecznie z resztą.
  W Adaptive to widoczne dla użytkownika: `'conventional'` → `sign = 1` →
  CCW = climb, a "Climb" daje CW = conventional. (Zweryfikowane także
  niezależnie w sesji głównej.)
- **Scenariusz:** użytkownik hobbystycznej frezarki z luzami wybiera
  "Conv." w Adaptive, żeby uniknąć wciągania freza — dostaje climb na
  każdym łuku.
- **Proponowana zmiana:** zdecydować zamierzoną konwencję; albo odwrócić
  kierunki (Inside → CW, Outside → CCW dla prawdziwego conventional pod
  M3), albo zostawić kierunki i poprawić wszystkie etykiety/komentarze/
  `CLAUDE.md`. W każdym wariancie zamienić mapowanie `sign` w Adaptive
  (lub jego etykiety) i dodać test przypinający kierunek względem M3.
- **Nakład:** łatwy (etykiety) / średni (odwrócenie kierunków + podglądy
  + testy).

### `BL-45` — Ułamkowy / zerowy Tab Count
- **Lokalizacja:** `src/lib/outlineRectangleTabs.ts:27`
  (`k < tabCountPerSide`) i `:91` (`x = p0.x + (p1.x-p0.x)*frac` bez
  zaciśnięcia); `src/lib/tabs.ts:29`; `src/lib/validation.ts:59-71,
  103-116`; `Step2GeometryOutline.tsx:46`; `Step2GeometryHoles.tsx:85`;
  `SettingsModal.tsx:158-167` (`defaultTabCount` przyjmuje wszystko > 0).
- **Problem:** `tabCount` nigdy nie jest zaokrąglany ani sprawdzany jako
  dodatnia liczba całkowita (`MAX_TAB_COUNT` to tylko atrybut `max`).
  Przy 2.5 na bok pętla robi k = 0, 1, 2 z krokiem 0.4 — trzeci mostek
  ma środek na frac 1.0, `endFrac` > 1 — `tabbedRectanglePass`
  ekstrapoluje za narożnik wzdłuż kierunku boku, podnosi się tam na górę
  mostka, a "wychodząc z mostka" schodzi na pełne `cutZ` w
  ekstrapolowanym punkcie. `tabCount = 0` (wyczyszczone pole) albo 0.4 =
  brak mostków mimo zaznaczonego "Enable Tabs" i przechodzącej walidacji
  (`0 * w < L`). Settings → Tabs → Default Tab Count też przyjmie 2.5.
- **Scenariusz (zweryfikowany):** domyślny Outline (Rectangle Cornered
  50×30, Inside, frez 3.175), tabs włączone, Count 2.5, Width 3, Height 1.
  Oczekiwany zakres środka freza X 1.5875–48.4125, Y 1.5875–28.4125;
  wynik zawiera `X49.9125 Y1.5875 Z-4`, `X48.4125 Y29.9125 Z-4`, `X0.0875 …`
  — 1.5 mm za każdym narożnikiem na pełnej głębokości (wcina się w
  zachowywaną ścianę). Przy 0 mostków detal przy przecinaniu na wylot
  odpada.
- **Proponowana zmiana:** wymagać `Number.isInteger(tabCount) && 1 ≤
  tabCount ≤ MAX_TAB_COUNT` w walidacji (Hole(s), Outline), zaokrąglać
  przy commit w trzech polach i w Settings, defensywnie zaciskać `frac`
  do [0,1] i kąty do [0,2π] w generatorach przejść.
- **Nakład:** łatwy.

### `BL-46` — Brak dolnych limitów Start Z / Safe Z / posuwów / wymiarów
- **Lokalizacja:** `src/lib/validation.ts:29-35` (tylko `stepdown > 0` i
  `startZ <= safeZ`); `src/App.tsx:298-325`; `Step3Feeds.tsx:98,108`
  (`min="0"` nieegzekwowane, zgodnie z komentarzem w `NumberInput.tsx`);
  `src/lib/program.ts:14-16`.
- **Problem:** Start Z może być ujemny, a `rapidToTop()` emituje wtedy
  `G0 Z<startZ>` prosto w materiał (komentarz `program.ts:6-13` "powyżej
  +startZ jest powietrze, więc rapid jest bezpieczny" prawdziwy tylko dla
  startZ ≥ 0). Safe Z ≤ 0 = każdy przejazd XY po lub pod powierzchnią.
  `feedrateXY` i `plungeRate` nigdy nie są walidowane (`linkingFeed` jest)
  — wyczyszczenie pola commituje 0 (`Number('') === 0`, skończone).
  `totalDepth`, `holeDiameter`, `width`, `height`, `diameter` bez
  sprawdzenia > 0 (np. totalDepth 0 w Helix = jedno "płaskie" koło na
  Z = startZ).
- **Scenariusze (zweryfikowane):** Start Z −3 przechodzi walidację →
  `G0 X2.4125 Y0` / `G0 Z-3` — rapid 3 mm w materiał. Feedrate XY 0 →
  `G1 … F0` (GRBL error 22); ujemny Plunge Rate → GRBL error 4 — oba
  zatrzymują zadanie przy już pracującym wrzecionie.
- **Proponowana zmiana:** walidatory `startZ >= 0` (albo przynajmniej
  `> −totalDepth` z ostrzeżeniem), `safeZ > 0 && safeZ > startZ`,
  `feedrateXY > 0`, `plungeRate > 0`, `totalDepth > 0`, wymiary > 0 —
  podpięte pod `isGeometryValid` z komunikatami inline.
- **Nakład:** łatwy.

### `BL-47` — Wczytanie presetu przy otwartym Kroku 2/3
- **Lokalizacja:** `src/App.tsx:441-471` (od `BL-39` wczytanie nie
  zmienia `activeStep`); `useNumberField.ts:30-37` (tekst resynchronizuje
  się tylko z `syncWhenBlurred`); `Step2GeometryHoles.tsx:56-63` (leniwy
  `useState` textarea Custom); `Step3Feeds.tsx:42-45`.
- **Problem:** po `BL-39` wczytanie/uzbrojenie presetu (Edit Mode) nie
  odmontowuje aktywnego kroku. Każde pole `useNumberField` bez
  `syncWhenBlurred` (wszystkie w Kroku 2, Plunge Rate, Start Z, Safe Z,
  Linking Feed) i textarea Custom pokazują tekst poprzedniego presetu
  (wyjątek: zmiana operacji — router Kroku 2 montuje inny komponent).
  Pisanie w textarea parsuje stary tekst i zastępuje świeżo wczytane
  `customPoints`; w Edit Mode dodatkowo live-save do uzbrojonego slotu.
- **Scenariusz:** otwarty Krok 3, preset [1] ma Safe Z 5, [2] ma 1 — po
  kliknięciu [2] pole dalej pokazuje "5", a podgląd i G-code używają 1.
  Otwarty Krok 2 z Custom List: wczytanie presetu, dopisanie jednego
  punktu → punkty presetu zastąpione starą listą + nowy punkt.
- **Proponowana zmiana:** licznik `paramsLoadGeneration` inkrementowany w
  `handleLoadPreset`/`handlePresetSlotClick`/Reset, użyty jako `key` na
  zawartości Active Step Panel (remount kroków); alternatywnie
  `syncWhenBlurred` jako zachowanie domyślne.
- **Nakład:** łatwy.

### `BL-48` — Błędne linie Custom List → otwory w (0,0)
- **Lokalizacja:** `Step2GeometryHoles.tsx:29-38`.
- **Problem:** każdy nieparsujący się token zamieniany na 0, bez
  komunikatu. `"10;20"`, `"10 20"`, `"abc"` → (0,0); `"10"` → (10,0);
  europejskie `"10,5, 20,5"` dzielone po przecinkach → x = 10, y = 5.
- **Scenariusz:** użytkownik wpisuje `25 40` (spacja) → wiercenie w
  origin (+ offset), gdzie może stać docisk albo róg materiału.
- **Proponowana zmiana:** oznaczać każdą linię, która nie jest dokładnie
  dwiema skończonymi liczbami, jako błędną — komunikat z numerem linii i
  blokada Generate (`isCustomPointsValid`); opcjonalnie jawnie akceptować
  `;`/spację jako separator. Parser przenieść do `lib/` (patrz `BL-62`).
- **Nakład:** łatwy.

### `BL-49` — Frez równy otworowi → łuki o zerowym promieniu
- **Lokalizacja:** `src/lib/validation.ts:12-14` (`<=`) i `:87` (Outline
  Circle Inside `<=`); `src/lib/circle.ts:29-40`.
- **Problem:** promień ścieżki = 0. W G2/G3 każdy obrót to
  `G3 X0 Y0 Z-0.3 I0 J0 F800` (znalezione fuzzowaniem) — kod łuków GRBL
  dzieli przez wyrażenie, które dla r = 0 daje NaN, Mach3 może zgłosić
  błąd promienia. W G1 — 72 odcinki o zerowym XY, czyli pionowe wiercenie
  na `feedrateXY` zamiast `plungeRate`. Pocket już używa ostrego `<`.
- **Scenariusz:** frez 6.35, otwór 6.35, Helix, łuki, stepdown 1 →
  powtarzane `G3 X0 Y0 Z-0.5 I0 J0 F800` — frez wierci pionowo z 800
  mm/min.
- **Proponowana zmiana:** oba sprawdzenia ostre (`<`), albo specjalny
  przypadek promienia < ε: dziobanie/plunge na `plungeRate` bez łuków.
- **Nakład:** łatwy.

### `BL-50` — Nieograniczony kąt zejścia Helix/Ramp
- **Lokalizacja:** `src/lib/helix.ts` (skok = stepdown na 360°);
  `outlineRectangle.ts:52-60` (cały stepdown na jednym boku);
  `surfaceZTransition.ts:73+`; `pocketZTransition.ts:46+`.
- **Problem:** skok spirali/rampy zawsze = `stepdown`, na `feedrateXY`;
  tylko Pocket Adaptive ma limit kąta rampy. Kąt = atan(stepdown / 2πr)
  lub atan(stepdown / długość boku).
- **Scenariusze:** otwór 3.5 frezem 3.175 (r = 0.1625), stepdown 1 → 44°
  (zweryfikowane): Z schodzi ~0.7 × 800 = 560 mm/min przy Plunge Rate
  300. Wejście Helix Pocket/Surface z helixRadius 0.1, stepdown 1 → ~58°.
  Outline Rectangle Ramp, bok 2 mm, stepdown 3 → 56°.
- **Proponowana zmiana:** ograniczyć skok do 2πr·tan(maxRampAngle) (więcej
  obrotów na stepdown) — pomysł `rampAngleDeg` z Adaptive jako globalne
  ustawienie — albo skalować posuw tak, żeby składowa pionowa nie
  przekraczała `plungeRate`. Minimum: nieblokujące ostrzeżenie.
- **Nakład:** średni.

### `BL-51` — Krok 4: przełącznik interpolacji czyta mostki Hole(s)
- **Lokalizacja:** `Step4Output.tsx:52-54`.
- **Problem:** `tabsForceLinear = operation === 'outline' ?
  outline.tabsEnabled : geometry.tabsEnabled` — dla Surface i Pocket
  czyta flagę mostków Hole(s): przełącznik wyszarzony, pokazuje "G1" i
  "Tabs (Step 2) require G1", a silniki Surface/Pocket używają zapisanego
  `output.interpolation` (może być `'arc'`).
- **Scenariusz:** mostki włączone w Hole(s) z łukami, przejście na
  Pocket — Krok 4 pokazuje zablokowane "G1 (segments)", plik zawiera
  G2/G3, użytkownik nie może tego zmienić.
- **Proponowana zmiana:** `tabsForceLinear = false` dla Surface/Pocket;
  lepiej wyprowadzać `forcedLinear` z rejestru per operacja (patrz
  `BL-61`).
- **Nakład:** łatwy.

### `BL-52` — Edit Mode resetuje kamerę i dubluje przebudowę 3D
- **Lokalizacja:** `App.tsx:337-350`; `lib/overlayParams.ts:9-16`;
  `Scene3D.tsx:204-221`; `ToolpathCanvas.tsx:135-140`.
- **Problem:** przy uzbrojonym slocie każda zmiana parametru robi
  `setPresetSlots({...prev})` → `useMemo` `overlayParams` zależy od
  `presetSlots` → `deriveOverlayParams` zwraca nową pustą tablicę nawet
  bez overlaya → oba podglądy traktują nową referencję jako "zmianę
  wyboru overlaya": 3D re-frame'uje odległość/target, 2D robi pełny
  re-fit (resetuje zoom/pan). Efekt treści 3D odpala się dwa razy na
  edycję (raz dla `params`, raz dla `overlayParams`). Łamie
  udokumentowaną zasadę "zwykła edycja nie rusza kamery". Zapis presetu
  z Kroku 4 też daje jeden zbędny re-fit.
- **Scenariusz:** Edit Mode, przybliżenie otworu w 2D, zmiana Depth —
  widok wraca do dopasowania całości.
- **Proponowana zmiana:** współdzielona zamrożona pusta tablica gdy
  `overlaySlots.size === 0`; lepiej: zależność tylko od wpisów samych
  nałożonych slotów albo porównanie zawartości zamiast referencji.
- **Nakład:** łatwy.

### `BL-53` — Obroty wrzeciona i dwell na sztywno
- **Lokalizacja:** `types/wizard.ts:227-228` (`spindleSpeed: 12000`,
  `dwellSeconds: 3`); `program.ts:23-31`; żaden `.tsx` ich nie używa.
- **Problem:** każdy plik ma `M3 S12000` i `G4 P3` (`P3000` na Marlinie).
  Krok 3 nazywa się "Feeds & Speeds", a pola obrotów nie ma. Na
  Marlinie `S` to często PWM 0–255 albo procent (zależnie od
  `CUTTER_POWER_UNIT`) — 12000 nie ma tam sensu.
- **Scenariusz:** wrzeciono z falownikiem 6000–24000 obr/min, aluminium
  na 18000 — zawsze dostaje 12000.
- **Proponowana zmiana:** pola Spindle Speed i Dwell (Krok 3 lub 4) z
  walidacją > 0.
- **Nakład:** łatwy.

### `BL-54` — Preambuła bez trybu I/J i posuwu
- **Lokalizacja:** `src/lib/program.ts:20`.
- **Problem:** jedyna linia preambuły to `G21 G90 G17`; wszystkie łuki
  używają przyrostowych I/J. Mach3 ma konfigurowalny "IJ Mode"
  (absolutny/przyrostowy) — w trybie absolutnym każdy G2/G3 idzie wokół
  złego środka. Brak też `G94`, `G40`, `G49` — pozostałe z poprzedniego
  zadania G93 (inverse time) albo kompensacja promienia zmienią
  zachowanie.
- **Scenariusz:** Mach3 w absolutnym IJ: `G3 X10 Y0 I-2.4 J0` ma środek w
  absolutnym (−2.4, 0) — ogromny zły łuk albo błąd promienia.
- **Proponowana zmiana:** per dialekt — `G91.1 G94 G40 G49` (albo
  obsługiwany podzbiór) dla Mach3, `G94` dla GRBL (GRBL 1.1 akceptuje
  `G91.1` jako no-op); sprawdzić z dokumentacją każdego kontrolera.
  Pewność review: średnia.
- **Nakład:** łatwy.

### `BL-55` — Limity pętli obcinają poprawne zadania
- **Lokalizacja:** `surfaceRaster.ts:8, 27-33`; `depthPasses.ts:7,19`;
  `pocketAdaptive.ts:123, 287, 306-312`.
- **Problem:** po osiągnięciu limitu (5000 linii/przejść/kroków) kod
  działa dalej, jakby wszystko było pokryte. `computeLinePositions`
  kończy na 5000 i dokleja `max` — ostatni "stepover" może mieć setki
  mm. Adaptive: skok helixa z kąta rampy × helixRadius — powyżej 5000
  obrotów "płaski" przejazd końcowy zabiera całą resztę głębokości w
  jednym obrocie. `phaseA` kończy na 5000 pierścieniach, zostawiając
  niewycięty pierścień przy ścianie.
- **Scenariusze (zweryfikowane):** Surface 1000×1000, frez 1, stepover
  10%, Zigzag → maksymalna przerwa między liniami 501 mm (połowa
  powierzchni nieobrobiona). Adaptive: helixRadius 0.05, rampa 0.5°,
  stepdown 20, głębokość 20, frez 6 (wszystko poprawne) → 5072 obroty,
  potem zejście o 6.29 mm w jednym obrocie o obwodzie 0.3 mm na posuwie
  roboczym.
- **Proponowana zmiana:** helpery zgłaszają obcięcie (np. flaga w
  wyniku), wyświetlane jako blokujący błąd walidacji; limity tylko jako
  ochrona przed zamrożeniem UI, nie jako część semantyki wyniku.
- **Nakład:** średni.

### `BL-56` — Settings Modal po "Reset All Settings"
- **Lokalizacja:** `SettingsModal.tsx:84-100, 180-185`; `App.tsx:390-404,
  1195-1204` (brak `key`, modal nie zamykany).
- **Problem:** bufory `text`/`codeText` inicjalizowane raz z `machine`.
  Po resecie maszyna wraca do domyślnych, ale modal zostaje zamontowany:
  sekcja Machine dalej pokazuje stare skoki osi i Start/End G-Code. Blur
  textarea nagłówka (`handleCodeBlur`) — bufor różni się od pustego już
  `machine.headerText`, więc stary nagłówek zapisuje się z powrotem.
- **Scenariusz:** Reset All → Machine → klik w Start G-Code i poza nie →
  stary nagłówek użytkownika wraca.
- **Proponowana zmiana:** zamknąć modal po resecie, albo przemontować go
  zmiennym `key`, albo resynchronizować bufory z `machine` w efekcie.
- **Nakład:** łatwy.

### `BL-57` — Niewalidowane enumy w zapisie, brak ErrorBoundary
- **Lokalizacja:** `lib/storage.ts:69-80`; `lib/machineStorage.ts:140-144`;
  `src/main.tsx` (brak ErrorBoundary).
- **Problem:** pilnowane tylko `operation` i `method`. `geometry.positioning`,
  `outline.shape/offsetMode/method`, enumy `surface.*`,
  `pocket.shape/method/cutDirection`, `output.interpolation`, typ
  `customPoints`, typy pól liczbowych — przechodzą bez sprawdzenia. Np.
  `resolvePoints` zwraca `undefined` dla nieznanego pozycjonowania i
  `.map` rzuca; `POCKET_METHOD_META[zły].title` rzuca w
  `collapsedStepTitle`; `machine.headerText` nie-string → `.trim()` rzuca.
  Slot "0" jest przywracany automatycznie przy starcie, a ErrorBoundary
  nie ma — jedna zła wartość = biały ekran przy każdym przeładowaniu, do
  ręcznego wyczyszczenia `localStorage`. Dziś tylko przy uszkodzonych
  danych albo przyszłej zmianie nazwy enuma — dokładnie scenariusz, pod
  który powstał `isOperationType`.
- **Proponowana zmiana:** straże per pole (listy enumów już istnieją jako
  `*_LIST`) + poprawka `pocketMethodAllowed`; ErrorBoundary na najwyższym
  poziomie z przyciskiem "Reset saved state".
- **Nakład:** średni.

### `BL-58` — Skrypt deploy
- **Lokalizacja:** `scripts/deploy.mjs:55-59`; `.env.example`
  (`FTP_REJECT_UNAUTHORIZED`); `public/.htaccess`.
- **Problem:** `assets/` usuwane przed wysłaniem nowego buildu — w trakcie
  (i na stałe przy nieudanym uploadzie) żywy `index.html` wskazuje na
  usunięte paczki. `.env.example` podpowiada
  `FTP_REJECT_UNAUTHORIZED=false` na błędy certyfikatu — hasło FTP
  wystawione na przechwycenie, a podstawiony serwer mógłby wstrzyknąć JS
  użytkownikom. Reguła `\.(js|css|svg…)` w `.htaccess` daje
  niezahashowanemu `favicon.svg` roczny, niezmienny cache.
- **Proponowana zmiana:** najpierw nowe assety, potem `index.html`, na
  końcu usunięcie starych plików spoza nowego buildu; zamiast wyłączania
  weryfikacji — przypięcie CA/certyfikatu hosta; niezmienny cache tylko
  dla `assets/`.
- **Nakład:** łatwy.

### `BL-59` — Surface Unidirectional: powrót bez zapasu
- **Lokalizacja:** `src/lib/surface.ts:105`.
- **Problem:** `G0 Z(toZ + stepdown)` zjeżdża szybkim ruchem dokładnie na
  dno poprzedniego poziomu nad startem następnej linii; na poziomie 0 z
  startZ = 0 to dokładnie wierzch materiału. Każdy błąd Z albo zgubione
  kroki = kontakt na rapidzie. Pewność review: średnia.
- **Proponowana zmiana:** rapid do `min(safeZ, toZ + stepdown +
  zapas)` albo `max(startZ, …)` + mały margines, potem plunge.
- **Nakład:** łatwy.

### `BL-60` — Etykieta Stepdown w Kroku 3 z metody Hole(s)
- **Lokalizacja:** `Step3Feeds.tsx:73`.
- **Problem:** `METHOD_META[method]` to zawsze metoda Hole(s), niezależnie
  od aktywnej operacji. Przy zapisanym Hole(s) Helix — Pocket, Surface i
  Outline pokazują "Stepdown / Pitch [mm per 360° turn]"; dla Pocket
  Adaptive szczególnie mylące (tam skok helixa jest z kąta rampy).
- **Proponowana zmiana:** użyć metadanych metody aktywnej operacji
  (`activeMethodDisplay.stepdown`).
- **Nakład:** łatwy.

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
  przyczyna `BL-51`. Drobniejsze: `RasterDirectionToggle`/
  `ZTransitionModeToggle` skopiowane między Step 2 Surface i Pocket;
  `src/lib/index.ts` to martwy barrel (dwie funkcje, zero importów).
  Nieaktualne komentarze: `program.ts:6-13`, `helix.ts:30`,
  `standardHole.ts:17` ("startZ = materiał wyższy" — sprzeczne z
  `BL-37`), `Step2Geometry.tsx:20` ("three focused ones" — są cztery),
  komentarze "conventional" (`BL-44`).
- **Proponowana zmiana:** stopniowo przenieść każdy silnik na
  strukturalną listę ruchów (line/arc/rapid/plunge + rodzaj) z jednym
  formaterem G-code i jednym adapterem podglądu; rejestr `OPERATION_META`
  (walidacja/generate/footprint/slug/forcedLinear). Usunąć `lib/index.ts`,
  poprawić nieaktualne komentarze.
- **Nakład:** trudny (lista ruchów) / łatwy (porządki).

### `BL-62` — Luki w testach
- **Problem:** `arcRadiusMismatches` (`gcodeTestUtils.ts`) używany tylko w
  testach Pocket. Brak testu przekrojowego po wszystkich operacjach:
  G0 w XY tylko na Safe Z, F > 0, program osiąga −totalDepth. Bez testów:
  mostki z ułamkową/zerową liczbą, parsowanie Custom List (siedzi w
  komponencie), logika `forcedLinear` w Kroku 4, synchronizacja pól po
  wczytaniu presetu, reguła "przechodząca walidacja ⇒ poprawny G-code".
- **Proponowana zmiana:** test właściwościowy z ziarnem (jak fuzzowanie
  użyte w review): losowe poprawne parametry → niezmienniki per operacja.
  `parseCustomPoints` przenieść do `lib/` i przetestować.
- **Nakład:** średni.

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

### `BL-65` — Rectangle Spiral + Helix ignoruje helixRadius
- **Lokalizacja:** `src/lib/pocket.ts:56-65` vs `:33-34`.
- **Problem:** Circle zaczyna pierścienie od `helixRadius`, Rectangle
  zawsze od jednego stepoveru od środka. Gdy `helixRadius > stepover`,
  pierwsze pierścienie leżą wewnątrz już wywierconego otworu helixa —
  rampy idą do środka, część pierścieni tnie powietrze. Bezpieczne, tylko
  strata ruchu i niespójność z Circle.
- **Proponowana zmiana:** pominąć pierścienie z `max(halfWidth,
  halfHeight) <= helixRadius` albo zasiać `pocketRectRingDims` od
  `helixRadius`.
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
