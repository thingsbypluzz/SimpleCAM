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

Obecnie pusty.

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
- **`BL-19`** *(Otwarty)* — **Własna lista średnic narzędzia w Settings.** Dziś
  `TOOL_DIAMETER_OPTIONS` (`config/toolDiameterOptions.ts`: 1–8mm całe mm
  + 1/8" i 1/4") jest zaszyta na sztywno w kodzie. Pomysł: nowa sekcja w
  Settings Modal pozwalająca edytować tę listę (dodawać/usuwać wartości),
  zapisywana w localStorage (nowy klucz albo rozszerzenie istniejącego
  wzorca Machine/Appearance/Tabs), plus przycisk "Reset to default"
  przywracający dzisiejszą, sztywną listę jako wartość domyślną.
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
- **`BL-25`** *(Otwarty)* — **Tryb edycji przywołanego presetu.** Pomysł: wczytanie
  presetu z Preset Bar podświetla/zaznacza go; póki jest zaznaczony,
  dalsze zmiany zapisują się automatycznie z powrotem do tego slotu
  presetu, zamiast tylko do ukrytego slotu sesji (dzisiejsze zachowanie
  auto-save wyłącznie do slotu `"0"`, `lib/storage.ts`). Ponowny klik w
  ten sam preset odznacza go, wracając do dzisiejszego zachowania (zmiany
  trafiają tylko do slotu sesji 0). To realna zmiana ustalonej, świadomej
  decyzji projektowej (presety są dziś jawnie zapisywane wyłącznie
  ręcznie, bez auto-nadpisywania) — wymaga pełnej dyskusji przed
  dopracowaniem zakresu, nie drobna poprawka.
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
- **`BL-31`** *(Otwarty)* — **Oś X/Y w 3D Preview: stała długość
  zamiast dopasowanej do renderowanego obszaru.** `axisLength =
  planeSize * 0.55` (`buildScene.ts::buildToolpathScene()`) to jeden
  skalar, symetryczny wokół originu (0,0) w obu kierunkach każdej osi —
  poprawne tylko gdy wzorzec leży mniej więcej centralnie wokół
  originu. Siatka/płaszczyzna materiału tymczasem rekalibruje swój
  środek do `gridCenterX`/`gridCenterZ` (centroid bounding-boxa
  wzorca — patrz "Etykiety siatki w 3D Preview" w `CLAUDE.md`), więc
  przy Rectangle Cornered (wzorzec leży w całości w jednej ćwiartce
  względem originu) albo dużym Offset X/Y oś wystaje poza faktycznie
  renderowaną siatkę w jednym kierunku, a w drugim może nie sięgać
  wystarczająco daleko. 2D Preview nie ma tego problemu — tam osie są
  zakotwiczone do krawędzi canvasu (`EDGE_MARGIN`, `drawToolpath.ts`),
  niezależnie od pozycji danych. Wymaga liczenia długości każdego
  ramienia osi osobno, względem faktycznych granic renderowanej
  płaszczyzny (`gridCenterX/Z` ± `gridSize/2`), nie jednego wspólnego
  skalara liczonego od originu.
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

elementów UI, dziś aktywnie używany w `CLAUDE.md`:
**<https://claude.ai/code/artifact/ea21c02e-41ed-4bb5-90ec-48ae9a61c23e>**.
Nie podlega zasadzie synchronizacji wyżej (nie jest listą backlogu) —
aktualizować go tylko jeśli realny layout appki zmieni się na tyle, że
mockup przestanie być wierny.

## Przyszłe operacje (`OP-#`)

Osobna, celowo **nie** `BL-#` kategoria — Pocket (patrz placeholder w
`Step1Positioning.tsx`) to nie drobna poprawka tylko kamień milowy
wielkości całego etapu implementacji, z własną, dziś nieznaną
taksonomią (operacja → pattern/sub-choice → parametry). Numer `OP-#`
jest identyfikatorem, nie kolejnością realizacji. `OP-1` (Outline) i
`OP-3` (Surface) zaimplementowane — patrz `CLAUDE.md`, "Kluczowe
decyzje projektowe" (pełne rozstrzygnięcia sesji `/grill-me` dla
Surface, 2026-09-12, i historia implementacji w `CHANGELOG.md`,
`[0.14.0]`).

- **`OP-2` — Pocket.** Kieszeniowanie — wybieranie materiału wewnątrz
  zamkniętego konturu (nie tylko po samej linii), wymaga strategii
  wypełnienia (np. zigzag/spiral) nieobecnej dziś w silniku w ogóle.
- **`OP-4` — Text/Font Tracing.** Wybór czcionki i generowanie ścieżki
  narzędzia po napisie — albo tracing obrysu (konturu) każdej litery,
  albo, dla specjalnych czcionek jednoliniowych, tracing wprost po
  osi/linii znaku (przydatne do małych napisów, grawerów słów, gdzie
  pełny obrys byłby zbyt drobny/skomplikowany). Wymaga parsowania
  glifów czcionki (najpewniej z plików fontowych, np. przez jakąś
  bibliotekę do path-data) — geometria wejściowa nieporównywalna z
  dzisiejszymi kształtami parametrycznymi (Rectangle/Circle).

**Każda z `OP-#` wymaga własnej, pełnej sesji `/grill-me` przed
napisaniem jakiegokolwiek kodu** — nieporównywalnie większy zakres
otwartych decyzji niż `BL-#`. Z tego powodu Artifact backlogu pokazuje je
jako osobną sekcję, nie jako kolorowe łatwe/średnie/trudne zadania —
trudność jest dziś celowo nieoszacowana, `/grill-me` to część definiowania
zakresu, nie coś do zgadnięcia z góry.
