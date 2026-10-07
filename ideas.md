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
oznaczeniem 🟢/🟠/🔴 i filtrem statusu (domyślnie pokazuje
**Otwarte** i **W trakcie**) — jest opublikowana jako Artifact:
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
- **`BL-26`** *(Zrealizowany, 2026-09-30)* — **Przytrzymanie przycisku `NumberInput` (auto-repeat).**
  Dziś klik na strzałkę góra/dół (`src/components/wizard/NumberInput.tsx`,
  `useNumberField.onAdjust`) to zawsze dokładnie jeden krok — świadomie
  pominięte przy pierwszym wdrożeniu (zgłoszenie dotyczyło wyglądu
  natywnego spinnera, nie zachowania). Przytrzymanie mogłoby powtarzać
  krok co interwał, jak natywny spinner przeglądarki — wymaga
  timera/interwału uruchamianego na `onMouseDown`, czyszczonego na
  `onMouseUp`/`onMouseLeave`. Wdrożone: zdarzenia pointer (mysz i
  dotyk), pierwszy krok od razu, po 400 ms powtarzanie co 75 ms, stop na
  puszczeniu/zjechaniu z przycisku; działa też w Settings Modal.
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
- **`BL-41`** *(Zrealizowany, 2026-09-30)* 🟢 — **Konfigurowalna długość rampy dla Pocket
  Spiral.** Z sesji `/grill-me` `OP-2`, zrewidowane sesją weryfikacji
  wizualnej (2026-09-21): kąt rampy między pierścieniami Circle nie jest
  już stały — wyliczany per pierścień (`rampSweepDegFor()`) tak, żeby
  długość łuku rampy była proporcjonalna do `RAMP_LENGTH_FACTOR = 3`
  (stała, niekonfigurowalna) razy promieniowa zmiana tej transycji.
  Mogłaby stać się polem liczbowym (jak Helix Radius) do dostrajania per
  materiał/narzędzie — mechanizm już istnieje, to tylko odsłonięcie
  `RAMP_LENGTH_FACTOR` jako parametru + walidacja zakresu.
  Wdrożone: pole „Ramp Length [×]” (1–10, domyślnie 3) w wierszu
  Stepover (tylko Spiral) + odczyt Engagement (pierścień i szczyt na
  rampie, `+atan(1/mnożnik)`). Pełny opis: `CHANGELOG.md`, `[0.29.0]`.
- **`BL-42`** *(Zrealizowany, 2026-09-28)* 🟠 — **Finishing wall pass / stock-to-leave dla
  Pocket.** Z sesji `/grill-me` `OP-2`: v1 to roughing-only (zewnętrzny
  pierścień JEST ścianą). Osobny, dokładny przejazd
  wykończeniowy (nowy parametr `stockToLeave`, roughing zatrzymuje się
  tym promieniem przed granicą, potem jeden przejazd reużywający Outline
  Rectangle/Circle toolpath na granicy offsetu) dałby czystszą ścianę —
  większy zakres niż `BL-41`, dotyka kilku miejsc silnika na raz.
  Wdrożone (rozmowa 2026-09-28): checkbox Finishing Pass dla Spiral i
  Adaptive, okrążenie co Stepdown po całym roughingu, wejście/wyjście
  łukiem stycznym, osobny Finish Feed. Pełny opis: `CHANGELOG.md`,
  `[0.23.0]`.
- **`BL-66`** *(Zrealizowany, 2026-09-30)* 🟠 — **Wyróżnienie pól, które nie przeszły
  walidacji.** Dziś błąd to wyłącznie czerwony tekst pod polem — samo
  pole (`NumberInput`/`<select>`/textarea) wygląda tak samo jak poprawne,
  więc przy kilku błędach naraz trudno wskazać, które pole je powoduje.
  Ramka (i ewentualnie poświata w Arcade) w kolorze błędu pasującym do
  motywu — nowy token albo reużycie `status-error` we wszystkich czterech
  motywach, light i dark. Wymaga powiązania każdego walidatora z polem
  (lub polami — np. frez vs średnica otworu, Tab Count × Width), np. prop
  `invalid` w `FieldRow`/`NumberInput`, spójnie w Krokach 2 i 3 oraz w
  Settings.
  Wdrożone: `aria-invalid` na polach (ten sam warunek co tekst błędu,
  relacje — wszystkie pola w panelu, błędy międzykrokowe — tylko w kroku z
  komunikatem), styl w `inputClass` (ramka + ring `status-error`,
  `--glow-error` w Arcade); Kroki 2–3, Feedrate Calculator, Settings →
  Tool Diameters. Pełny opis: `CHANGELOG.md`, `[0.28.0]`.
- **`BL-70`** *(Otwarty)* 🟠 — **Sekcja Help w Settings Modal.** Część
  treści z Artifactu Interface Anatomy przeniesiona do appki jako nowy
  Settings Nav Item „Help”: rodzaje operacji (Hole(s), Outline, Surface,
  Pocket) z ich ikonami i krótkim opisem, co robią, oraz opis dostępnych
  metod obróbki per operacja. Treść najlepiej czytana wprost z istniejących
  rejestrów (`OPERATION_META`, `METHOD_META`, `OUTLINE_METHOD_LIST`,
  `SURFACE_METHOD_META`, `POCKET_METHOD_META` — ikony, tytuły, `description`),
  żeby Help nie rozjechał się z UI; brakujące opisy operacji do dopisania w
  `OPERATION_META`.
  **Termin: jak najpóźniej** — dopiero gdy projekt osiągnie większą
  dojrzałość i zestaw operacji/metod się ustabilizuje; wcześniej Help
  wymagałby ciągłego poprawiania przy każdej zmianie (adnotacja
  2026-09-30).
- **`BL-71`** *(Zrealizowany, 2026-09-28)* 🟢 — **Średnica freza w Feedrate Calculator z
  listy Settings.** Dziś kalkulator ma zwykłe pole liczbowe, więc można
  wpisać średnicę spoza listy i Apply zapisze ją do Kroku 2. Ma być tym
  samym Drop-downem co Tool Diameter w Kroku 2 — wspólna lista z Settings →
  Tool Diameters (`resolveToolDiameterSelectOptions()`), bez możliwości
  wybrania rozmiaru, którego na liście nie ma. Pełny opis: `CHANGELOG.md`,
  `[0.22.5]`.
- **`BL-72`** *(Zrealizowany, 2026-09-28)* 🟠 — **Kolejność pól w Kroku 2.** Po dodaniu
  kolejnych pól kolejność przestała być logiczna. Proponowana (dla każdej
  operacji analogicznie, z jej własnymi polami): Width × Height (albo
  średnica / pozycjonowanie), Total Depth, Tool Diameter (+ Flutes/fz),
  Method, opcje metody (Optimal Load, Direction, Stepover…), Z-Transition
  Mode, Ramp Angle (jeśli występuje), Offset. Dotyczy wszystkich czterech
  `Step2Geometry*.tsx`; komentarze „Field order” na górze plików do
  aktualizacji. Wdrożone z dwiema korektami: w Hole(s) wzorzec przed
  średnicą otworu, w Outline Offset Mode między Cutting Depth a Tool
  Diameter. Pełny opis: `CHANGELOG.md`, `[0.22.8]`.
- **`BL-73`** *(Zrealizowany, 2026-09-27)* 🔴 — **Pocket Raster tnie pełną
  szerokością freza na starcie każdego poziomu.** Po wejściu Helix jechał po
  przekątnej na pełnej głębokości do narożnika pierwszej linii, a pierwsza
  linia każdego rastra i tak jest szczeliną. Dwie sesje `/grill-me`
  (2026-09-27): najpierw ukryty (0.22.1), potem usunięty całkowicie — żaden
  przypadek użycia nie uzasadniał go obok Spiral/Adaptive (wygląd dna w
  drewnie to raczej `BL-42`). Pełny opis: `CHANGELOG.md`, `[0.22.1]` i
  `[0.22.2]`.
- **`BL-74`** *(Zrealizowany, 2026-09-28)* 🟠 — **2D Preview: bryła/obrys materiału nie
  respektuje reguły otwarte/zamknięte z 3D.** W 3D Preview (`CLAUDE.md`,
  „Otwarta/zamknięta geometria bryły Outline w 3D”) Outside to zamknięta
  bryła, Inside pustka z podkładką z otworem, On-line hybryda (wewnętrzna
  wyspa + zewnętrzna ściana z podkładką). W 2D Preview stock jest zawsze
  rysowany jako zamknięty obiekt, niezależnie od Inside/Outside/On-line
  (Outline) — podgląd 2D sugeruje inne zachowanie niż 3D. Do ujednolicenia
  w `drawToolpath.ts` (wypełnienie kształtu vs. materiał wokół otworu),
  spójnie też dla Hole(s) i Pocket. Rozstrzygnięte sesją `/grill-me`
  (2026-09-28): arkusz materiału o zasięgu płaszczyzny 3D bez obrysu,
  pustki wycięte, Outside jako wyspa, On-line jak w 3D, w Overlay każdy
  preset rysuje swój arkusz. Pełny opis: `CHANGELOG.md`, `[0.22.9]`.
- **`BL-75`** *(Zrealizowany, 2026-09-29)* 🟠 — **Overlay: iluzoryczna podkładka, gdy nie
  ma litej bryły.** Punkt wyjścia: świadoma decyzja z `BL-3`
  (`CHANGELOG.md`, `[0.13.5]`) — w 3D Overlay podkładka pominięta, bo
  każdy nałożony preset pokazuje zasięg własną ścianą. Decyzja zostaje w
  mocy (widać wzajemne położenie operacji), z jednym wyjątkiem: gdy w
  Overlay są same pustki (otwory, kieszenie), wiszą w powietrzu, a
  dopiero lita bryła daje „materiał”. Reguła (rozmowa 2026-09-29):
  - jeśli **żaden** nałożony wzorzec nie jest litą bryłą — Outline
    Outside, Outline On-line, Surface — rysowana jest jedna wspólna,
    iluzoryczna podkładka na Z=0 o zasięgu siatki (`stockSheetRect()`),
    w stylu dzisiejszego stock capu (`buildStockCapObject()`); gdy
    któryś jest — bez podkładki, jak dziś;
  - podkładka **z pustkami**: otwory Hole(s), kieszenie Pocket, Outline
    Inside. Nachodzące pustki różnych presetów trzeba scalić (suma
    wielokątów — mała biblioteka albo własne scalanie okręgów/
    prostokątów), bo `THREE.Shape.holes` nie znosi nachodzących otworów;
  - **2D tą samą regułą** — jeden wspólny arkusz zamiast arkusza per
    preset z `BL-74`, żeby 2D i 3D pokazywały to samo.
  Łączenie podkładki z litymi bryłami w jedną spójną bryłę to już
  **`BL-77`**. Zgłoszone przy `/grill-me` `BL-74` (2026-09-28).
  Wdrożone: `lib/overlayStock.ts`, scalanie pustek w 3D przez
  `polygon-clipping`. Pełny opis: `CHANGELOG.md`, `[0.24.0]`.
- **`BL-76`** *(Zrealizowany, 2026-09-28)* 🟢 — **Podgląd nie pamięta widoku po
  przełączeniu zakładki.** Przełączenie 2D ↔ 3D (albo na G-Code i z
  powrotem) resetuje oba widoki: 3D wraca do kamery Front z auto-fitem, 2D
  do Fit View — utracone są obrót/zoom/pan ustawione przez użytkownika.
  Przyczyna: zakładki są renderowane warunkowo, więc `Scene3D` i
  `ToolpathCanvas` odmontowują się, a stan kamery żyje wewnątrz nich.
  Rozwiązanie: zapamiętać ostatnią kamerę każdego podglądu poza
  komponentem (np. ref/stan w `App.tsx` — 2D `Camera2D`, 3D pozycja +
  target) i odtwarzać ją przy ponownym zamontowaniu, zamiast trzymać oba
  podglądy zamontowane (kontekst WebGL, `BL-63`). Do ustalenia: czy
  pamięć ma przetrwać odświeżenie strony. Zgłoszone 2026-09-28.
  Wdrożone: pamięć tylko w sesji (refy w `App.tsx`), bez `localStorage`.
  Pełny opis: `CHANGELOG.md`, `[0.22.10]`.
- **`BL-77`** *(Zrealizowany, 2026-10-02)* 🔴 — **Overlay: jedna wspólna
  bryła materiału ze wszystkich presetów.** Po `BL-75` wspólny arkusz
  istniał w Overlay tylko wtedy, gdy wszystkie presety były pustkami; przy
  litej bryle (Outline Outside/On-line, Surface) zostawały przenikające
  się ściany, a kieszeń nie była wycięta z części. Zgłoszone 2026-09-28.
  Ustalenia (rozmowa 2026-10-01): materiał = suma wysp minus pustki, bez
  wysp arkusz; Pocket ma dno, pozostałe pustki są na wylot; dno wszędzie
  (Overlay i żywy wzorzec, 2D i 3D); Surface poza wspólną bryłą.
  Wdrożone: `lib/stockModel.ts` — jeden model dla żywego wzorca i Overlay,
  boole 2D na przekrojach (`polygon-clipping`), bez CSG. Pełny opis:
  `CHANGELOG.md`, `[0.33.0]`.
- **`BL-78`** *(Zrealizowany, 2026-09-30)* 🟢 — **Feedrate Calculator: Finish Feed i Stock
  to Leave dla Pocket Finishing Pass.** Dziś kalkulator ich nie liczy —
  Finish Feed startuje z bieżącego Feed XY (`BL-42`). Ustalenia (rozmowa
  2026-09-29):
  - **Finish Feed = RPM × z × fz × chip thinning** dla szerokości cięcia
    = Stock to Leave (wąski pas → cieńszy wiór; kompensacja utrzymuje
    fz — zwykle wyżej niż roughing, np. 0.3 mm przy Ø6 → ×~2.3), to samo
    RPM co reszta wyników, docięte do Max Feed (z notką);
  - **Stock to Leave z tabeli materiałów** — nowe `finishStock` [mm] w
    `config/materials.ts` (np. drewno/MDF 0.3, tworzywa 0.2–0.25,
    aluminium 0.15, mosiądz 0.1), przycięte do D/2, siatka 0.05 mm.
  Zakres mały — wzorzec istniejącego Linking Feed: nowe pola w
  `feedCalc.ts` (`MaterialSpec`, `FeedCalcInput`/`FeedCalcResult`,
  `suggestedFinishStock()`), dwa wiersze z checkboxami w
  `FeedCalculatorModal.tsx` tylko przy włączonym Finishing Pass (stock w
  mocy = sugerowany, gdy zaznaczony, jak `widthInEffect`), linia w „How
  it's calculated” i kolumna w „Material table”, `CalcPatch` +
  `OPERATION_META.pocket.withCalc()` zapisują `stockToLeave`/
  `finishFeed`; hint Finish Feed w Kroku 3 do aktualizacji; testy w
  `feedCalc.test.ts`/`operationMeta.test.ts`. Pełny opis: `CHANGELOG.md`,
  `[0.25.0]`.
- **`BL-79`** *(Zrealizowany, 2026-09-30)* 🟠 — **Spindle RPM widoczne w wizardzie (z
  pozycją pokrętła routera).** Feedrate Calculator proponuje RPM, a Apply
  zapisuje je do Settings → Machine (`machine.spindleSpeed`, globalne), ale
  potem w wizardzie nigdzie go nie widać — żeby sprawdzić, jakie obroty
  ustawić, trzeba wracać do kalkulatora. Potrzebne miejsce w UI na
  bieżące RPM oraz, gdy w Settings wybrany jest router z pokrętłem
  (`machine.router`, `config/routers.ts`), zalecaną pozycję pokrętła (np.
  „Makita RT0700C: 3 (≈ 17 000 RPM)” — ta sama logika co w kalkulatorze,
  `nearestDialPosition()`). Zgłoszone 2026-09-30. Do ustalenia: miejsce
  (Krok 3 obok posuwów — wiersz tylko do odczytu, Step 3 Summary, Krok 4
  przed Generate, komentarz w nagłówku G-code?), czy edytowalne z
  wizarda (zapis do globalnego Settings) czy tylko podgląd z linkiem do
  Settings/kalkulatora, zachowanie bez wybranego routera (samo RPM) i przy
  Marlinie (`S` jako PWM). Wdrożone: edytowalne pole w Kroku 3 (zapis do
  Settings) + MiniStat SPINDLE w Step 3 Summary. Pełny opis:
  `CHANGELOG.md`, `[0.26.0]`.
- **`BL-80`** *(Zrealizowany, 2026-09-30)* 🟠 — **Helix Hole(s)/Outline Circle: brak Ramp
  Angle, kalkulator liczy Stepdown jak dla szczeliny.** Do przejrzenia
  (zgłoszone 2026-09-30). W Hole(s) (i Outline Circle) skok spirali =
  Stepdown, osobnego Ramp Angle nie ma (Surface/Pocket go mają, skok z
  kąta — `helixPitchForRampAngle()`). Kalkulator traktuje Hole(s)/Outline
  jako szczelinę (`OPERATION_RULES[op].engagement` → `slot`), więc
  Stepdown = D × `ap.slot` × sztywność. Przykład użytkownika: Delrin, frez
  6 mm, otwór 8 mm → Stepdown 0.75 × 6 = **4.5 mm**; promień ścieżki
  (8 − 6)/2 = 1 mm, obwód 6.28 mm → zejście atan(4.5 / 6.28) ≈ **36°**
  — praktycznie wiercenie na posuwie XY. `descentWarnings()` ostrzega od
  10° (`MAX_RECOMMENDED_DESCENT_DEG`), ale kalkulator tego nie bierze pod
  uwagę. Opcje do rozstrzygnięcia:
  - kalkulator dla metod Helix/Ramp ogranicza sugerowany Stepdown do
    skoku dającego ≤ docelowy kąt (`2π·r·tan(kąt)`), z notką „ograniczone
    przez kąt zejścia”;
  - albo osobne pole Ramp Angle dla Helix Hole(s)/Outline Circle (i
    Outline Rectangle Ramp), niezależne od Stepdown — jak Surface/Pocket;
  - przy małym promieniu helixa (otwór ledwie większy od freza) łagodny
    kąt = bardzo wiele obrotów na poziom — ewentualne ostrzeżenie albo
    sugestia metody Standard.
  Wdrożone: osobne pole Ramp [°] (0.5–30°, domyślnie 2°) + read-only
  Pitch dla Hole(s) Helix, Outline Circle Helix i Rectangle Ramp; skok =
  `min(Stepdown, L·tan(kąt))` (`cappedRampPitch()`); Rectangle Ramp
  rozkłada zejście na cały obwód; ostrzeżenie > 10 obrotów na Stepdown z
  sugestią Standard; kalkulator bez zmian. Pełny opis: `CHANGELOG.md`,
  `[0.27.0]`.
- **`BL-81`** *(Zrealizowany, 2026-10-06)* 🟠 — **Feedrate Calculator
  sugeruje Ramp Angle.** Kalkulator nie proponował kąta zejścia — Ramp
  Angle startował z 2° i był ustawiany ręcznie. Wdrożone: kolumna Ramp w
  tabeli materiałów × sztywność maszyny (siatka 0,5°), wiersz z checkboxem
  tylko dla metod z helixem albo rampą (także Adaptive), przy małym
  promieniu kąt podniesiony do limitu 10 obrotów na Stepdown (najwyżej
  10°). Pełny opis: `CHANGELOG.md`, `[0.39.0]`.
- **`BL-82`** *(Otwarty)* 🟠 — **Outline po trójkącie / wycinku
  (przelotowe okna).** Z sesji `/grill-me` `OP-6` (2026-09-30): Lightening
  Pocket zawsze wybiera całą komórkę, a przy cięciu na wylot
  oszczędniejszy byłby sam kontur Inside po trójkącie/wycinku (środek
  wypada, potrzebne mostki). Nowe kształty Outline reużywające geometrię
  komórek `OP-6` (te same układy X-grid/Triangles/Spokes), albo tryb
  „Contour only” w kształtach Lightened. Do ustalenia po etapie 1 `OP-6`.
- **`BL-83`** *(Zrealizowany, 2026-10-01)* 🔴 — **Adaptive dla kształtów Lightened (etap 2
  `OP-6`).** Etap 1 wybiera komórki tylko metodą Spiral (offset). Adaptive
  liczy stałe zaangażowanie analitycznie wyłącznie dla okręgu i
  prostokąta — trójkąty o ostrych kątach i wycinki pierścienia to nowe
  przypadki geometryczne (rozmiar zbliżony do `OP-5`). Wymaga własnej
  sesji `/grill-me` po sprawdzeniu geometrii komórek z etapu 1.
  **Sesja `/grill-me` (2026-09-30) i wdrożenie (`0.31.0`):** tylko
  trójkąty (Rectangle Lightened) — faza A do okręgu wpisanego + faza C
  uogólniona na kąt narożnika, bez fazy B; Direction także w Finishing
  komórki; wycinki → `BL-85`. Pełny opis: `CHANGELOG.md`, `[0.31.0]`.
- **`BL-85`** *(Zrealizowany, 2026-10-01)* 🔴 — **Adaptive dla Circle Lightened
  (wycinki).** Z sesji `/grill-me` `BL-83` (2026-09-30). Wycinki pierścienia
  mają ściany łukowe (zewnętrzna wypukła, przy piaście wklęsła), są
  wydłużone promieniowo (odpowiednik fazy B wzdłuż promienia), a ich
  „narożniki” to styk prostej z łukiem — każdy element to nowa geometria.
  Dziś Circle Lightened jest tylko Spiral. Wymaga własnej sesji
  `/grill-me`.
  **Rozstrzygnięte i wdrożone (`0.32.0`):** ogólny mechanizm „okrąg
  styczny do dwóch ścian przesuwany wzdłuż ich środkowej” (wąskie i
  szerokie wycinki, z piastą i bez), tylko dla wycinków — trójkąty i
  zwykły Adaptive zostają na swoim kodzie. Pełny opis: `CHANGELOG.md`,
  `[0.32.0]`.
- **`BL-84`** *(Zrealizowany, 2026-09-30)* 🟠 — **Lightened: obrys zewnętrzny i znaczenie
  wymiarów.** Zgłoszone 2026-09-30 przy testach `OP-6`. Podglądy
  Rectangle/Circle Lightened pokazują tylko komórki — nie widać obrysu
  zewnętrznego elementu, więc przy dokładanej ramce (Rim Width) nie wiadomo,
  jaki rozmiar właściwie się podaje. Do przedyskutowania i przemyślenia:
  - czy Width/Height/Diameter to **wymiar zewnętrzny elementu** (dziś:
    komórki w obszarze pomniejszonym o Rim Width), czy **obszar kieszeni**,
    a Rim Width leży na zewnątrz (element = wymiar + 2×Rim);
  - jak pokazać obrys zewnętrzny w 2D/3D (linia, krawędź arkusza, osobny
    kolor) i czy wpływa na footprint / dopasowanie do maszyny;
  - etykiety pól i podpowiedzi, żeby znaczenie wymiaru było jednoznaczne;
    zgodność zapisanych presetów przy ewentualnej zmianie znaczenia.
  **Rozstrzygnięte (2026-09-30):** Rim Width usunięty. Tak jak w
  pozostałych kształtach Pocket, wymiar opisuje dokładnie to, co jest
  wybierane — komórki dochodzą do granicy Width × Height / Diameter.
  OnlyPaths zakłada odpowiedzialność operatora: margines pod późniejszy
  Outline wlicza on sam w wymiary i sprawdza w Overlay (np. Outline
  Outside + Lightened). Hub i Rib Width zostają (materiał wewnątrz
  obszaru). Przed wydaniem `0.30.0`, więc bez migracji presetów.

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

- **`BL-86`** *(Zrealizowany, 2026-10-04)* 🟠 — **Podgląd: wynikowy kształt
  z zaokrągleniem narożników freza.** Zgłoszone 2026-09-30. Pustki w
  podglądach miały ostre narożniki z zadanego kształtu, a frez zostawia w
  narożnikach wewnętrznych zaokrąglenie o swoim promieniu. Ustalenia
  (2026-10-04): wyłącznik w Settings → Appearance (domyślnie włączony);
  2D i 3D; w 2D obrys nominalny ciągły + kropkowany kontur po frezie.
  Wdrożone w modelu materiału (`stockModel.ts`): Pocket Rectangle, komórki
  Lightened (do 300 komórek), Outline Rectangle Inside i zewnętrzna
  krawędź On-line. Pełny opis: `CHANGELOG.md`, `[0.37.0]`.
- **`BL-87`** *(Zrealizowany, 2026-10-01)* 🟢 — **Krok 4: styl slotów presetów 1–5 (pusty
  vs zapisany).** Zgłoszone 2026-09-30. Przyciski slotów [1]…[5] w Kroku 4
  słabo odróżniają slot pusty od zapisanego. Pomysł: inny styl dla obu
  stanów, np. po zapisaniu slot przyjmuje taki sam wygląd jak w Preset Bar
  w Header. Do przegadania: spójność z Header (ikona/kształt/kolor),
  czytelność stanu nie tylko kolorem (`aria-pressed`/etykieta), zachowanie
  przy nadpisaniu i usuwaniu.
  Wdrożone: zapisany slot wygląda jak w Preset Bar (ramka akcentu + ikona
  wzorca/kształtu presetu), pusty — przerywana, przygaszona ramka z numerem;
  stan widać po zawartości i ramce, nie tylko po kolorze, a etykieta
  (`title` + `aria-label`) mówi „Overwrite…” albo „Save… — empty”.
  Potwierdzenie nadpisania i zielony „✓” po zapisie bez zmian; usuwanie
  zostaje w Header.
- **`BL-88`** *(Zrealizowany, 2026-10-01)* 🟢 — **Settings Modal: osobna sekcja na
  sterowanie (G-Code / Dialect / Software).** Zgłoszone 2026-10-01. Dziś
  Settings → Machine miesza fizykę maszyny (travel X/Y/Z, Spindle, Min/Max
  RPM, Dwell, Max Feed, Rigidity, Router) z ustawieniami sterowania (G-Code
  Dialect, Start/End G-Code), co utrudnia czytelność. Nowa pozycja Settings
  Nav zaraz pod Machine, do której przechodzą Dialect i Start/End G-Code;
  Machine zostaje tylko fizyką maszyny. Do ustalenia: nazwa sekcji
  (G-Code / Dialect / Software), gdzie trafiają Spindle Speed i Spin-up
  Dwell (fizyka czy sterowanie), klucz w `localStorage` bez zmian
  (`simplecam.machine`) — tylko podział w UI.
  Wdrożone: sekcja **Controller** zaraz pod Machine z G-Code Dialect
  (z opisem, co dialekt zmienia w programie) i Start/End G-Code; Spindle
  Speed i Spin-up Dwell zostały w Machine (właściwości wrzeciona).
- **`BL-89`** *(Zrealizowany, 2026-10-07)* 🟠 — **Odroczone zatwierdzanie
  pól liczbowych (wydajność przy pisaniu).** Zgłoszone 2026-10-01 przy
  `BL-83`: `useNumberField` zatwierdzał przy każdym klawiszu, a walidacja
  liczy się synchronicznie — przy Lightened/Adaptive pisanie przycinało,
  stany pośrednie wywoływały błędy. Wdrożone: pola Kroków 2 i 3
  zatwierdzają przy wyjściu z pola, po Enter albo po ok. 0,5 s bez
  pisania; strzałki i klawisze ↑/↓ od razu; Escape cofa niezatwierdzony
  tekst; Feedrate Calculator zostaje żywy.
- **`BL-90`** *(Zrealizowany, 2026-10-01)* 🟢 — **Krok 2: etykieta Tool Diameter łamie
  wiersz.** Zgłoszone 2026-10-01. W wierszu Tool Diameter + Flutes + fz
  (`ToolChipLoad.tsx`) etykieta „Tool Diameter [mm]” zawija się do dwóch
  linii, więc Drop-down leży niżej niż pola Flutes i fz. Opcje: skrócić
  etykietę (np. „Tool Diam. [mm]”, pełna nazwa w podpowiedzi) albo
  wyrównać pola do dołu wiersza (`items-end`), żeby inputy zawsze stały w
  jednej linii niezależnie od długości etykiet. Sprawdzić też inne wiersze
  z parami pól (węższe kolumny, dłuższe etykiety).
  Wdrożone: etykieta „Tool Diam. [mm]” we wszystkich czterech operacjach
  i wyrównanie pól wiersza do dołu (`items-end` w `ToolChipLoad.tsx`).
- **`BL-91`** *(Zrealizowany, 2026-10-04)* 🟢 — **Podgląd: ukrywać ścieżkę przy
  niepoprawnych parametrach.** Zgłoszone 2026-10-01 przy `BL-85`. Podglądy
  2D/3D rysują ścieżkę dla każdej wpisanej wartości, także odrzuconej przez
  walidację (np. Helix Radius większy niż mieści komórka — helix narysowany
  poza kieszenią, choć pole jest czerwone, a Generate zablokowany). Pomysł:
  gdy `isWizardParamsValid()` jest fałszywe, zostają materiał i kształt, a
  ścieżka znika; w podglądzie krótki napis typu „Fix the highlighted fields
  to see the toolpath”. Dotyczy wszystkich operacji. Do ustalenia: czy
  także zakładka G-Code, zachowanie w Overlay, alternatywa — niepoprawna
  ścieżka w kolorze błędu (nowy kolor w paletach). Wdrożone: ścieżka
  znika w 2D i 3D, napis w kolorze błędu u góry podglądu; Overlay i
  zakładka G-Code bez zmian, bez nowego koloru w paletach. Pełny opis:
  `CHANGELOG.md`, `[0.35.0]`.
- **`BL-92`** *(Otwarty)* 🟠 — **Hole(s) Custom List: dodatkowe kolumny
  per punkt (średnica i/lub głębokość).** Zgłoszone 2026-10-01, do
  rozważenia — **sesja `/grill-me` obowiązkowa**. Dziś linia Custom List to
  dokładnie `X,Y`, a Hole Diameter i Total Depth są wspólne dla wszystkich
  punktów. Pomysł wyjściowy: trzecia wartość = głębokość (`10,15,5` = otwór
  w X=10, Y=15 o głębokości 5). Wątpliwość zgłaszającego: dlaczego
  głębokość, a nie średnica — może trzecia kolumna powinna być średnicą, a
  Total Depth zostaje wspólny? Do przegadania:
  - co jest częstsze w praktyce: różne średnice (jedno narzędzie, kilka
    rozmiarów otworów — Helix to umożliwia) czy różne głębokości (otwory
    nieprzelotowe obok przelotowych);
  - format: jedna opcjonalna kolumna czy dwie (`X,Y[,D[,Depth]]`), kolejność,
    jednoznaczność przy trzech liczbach, puste = wartość wspólna z pól;
  - walidacja per punkt: frez < każda średnica, Start Z/limity przejść i
    kąt zejścia Helix per otwór, mostki (obwód zależy od średnicy);
  - podglądy 2D/3D (różne promienie i głębokości brył), `patternSpan()`,
    etykieta presetu, Feedrate Calculator (bez zmian?);
  - czy tylko Custom List, czy także inne wzorce; zgodność zapisanych
    presetów (`customPointsText`/`customPoints`).
- **`BL-93`** *(Zrealizowany, 2026-10-01)* 🟢 — **Krok 2: Width, Height i Total Depth w
  jednym wierszu.** Zgłoszone 2026-10-01. Wszędzie tam, gdzie kształt/
  wzorzec ma wymiary Width, Height i Total Depth — trzy pola w jednym
  wierszu (dziś Total Depth stoi osobno). Wyjątki:
  - **Hole(s) Single** — bez zmian;
  - **Hole(s) N-Holes on Circle** — osobny układ: wiersz 1 = Hole Count,
    Diameter (okręgu), Total Depth; wiersz 2 = Hole Diameter, Start Angle;
  - **Hole(s) Custom List** — bez zmian (układ rozstrzygnie `BL-92`);
  - **Outline Circle**, **Pocket Circle**, **Pocket Circle Lightened** —
    bez zmian.
  Po zmianie zaktualizować kolejność pól w `src/components/wizard/CLAUDE.md`.
  Wdrożone: trzy kolumny w Hole(s) Grid/Grid Centered, Outline Rectangle,
  Pocket Rectangle (także Rectangle Lightened) i Surface; N-Holes wg opisu.
  Głębokość nazywa się „Depth [mm]” w każdej operacji i układzie (zamiast
  Total Depth / Cutting Depth / Depth to Remove), a podpowiedź Grid „0 = dwa otwory” przeszła z pól do
  opisu wzorca (Hint Button w wierszu „Pattern:”); etykiety Grid skrócone
  do „Width [mm]”/„Height [mm]”. Przy okazji Lightened: Rectangle — Layout
  w osobnym wierszu, pod nim Diagonals/Cells X, Rows/Cells Y, Rib Width;
  Circle — Spokes, Hub, Rib Width, a Start w wierszu poniżej.
- **`BL-94`** *(Zrealizowany, 2026-10-04)* 🟢 — **Step 1 Summary: ikony
  wszystkich operacji.** Zgłoszone 2026-10-02. Step 1 Summary pokazywał
  tylko wybraną operację, więc zmiana operacji to trzy kliknięcia:
  rozwinięcie Kroku 1, przełączenie operacji, wybór wzorca. Wdrożone
  (`Step1Summary.tsx`): cztery operacje w kolejności Kroku 1, aktywna
  podświetlona na swoim miejscu, pozostałe jako małe, wyszarzone ikony z
  podpisami (akcent po najechaniu); klik otwiera Krok 1 z tą operacją już
  wybraną. Pełny opis: `CHANGELOG.md`, `[0.34.0]`.
- **`BL-95`** *(Zrealizowany, 2026-10-04)* 🟠 — **3D Preview: przełącznik
  przezroczystości materiału.** Zgłoszone 2026-10-02. Materiał w 3D był
  zawsze półprzezroczysty. Ustalenia (2026-10-04): lity materiał zasłania
  ścieżkę (prawdziwa głębia), prawdziwe oświetlenie, stan tylko w sesji,
  etykieta „Solid Stock” / „Transparent Stock”. Wdrożone: przycisk obok
  Hide/Show Stock, w zwykłym podglądzie i w Overlay; przy okazji obrys
  krawędzi materiału w obu trybach (kolor w paletach, wyłącznik w
  Settings → Appearance). Pełny opis:
  `CHANGELOG.md`, `[0.36.0]`.
- **`BL-96`** *(Otwarty)* 🔴 — **Outline Rectangle: zaokrąglone narożniki
  (Corner Radius).** Zgłoszone 2026-10-04 — **sesja `/grill-me`
  obowiązkowa**. Dziś Outline Rectangle ma zawsze ostre narożniki
  (zaokrąglone rogi świadomie poza zakresem przy wdrożeniu `OP-1`). Pomysł:
  pole Corner Radius w Kroku 2, 0 = ostre jak dziś. Do przegadania:
  - znaczenie promienia przy Inside / Outside / On-line (promień konturu
    nominalnego; ścieżka środka narzędzia ma wtedy R ∓ promień freza;
    Inside z R mniejszym od promienia freza);
  - ruchy: łuki G2/G3 w narożnikach — prostokąt dziś wymusza G1, więc
    przełącznik interpolacji z Kroku 4 zacząłby go dotyczyć;
  - Ramp (zejście rozłożone po obwodzie, start w narożniku dłuższego
    boku) i mostki per bok — obwód i boki zmieniają długość;
  - walidacja (R ≤ połowa krótszego boku; R = połowa boku daje „stadion”
    albo okrąg), footprint bez zmian;
  - podglądy 2D/3D i model materiału (`stockModel.ts` — kontur
    zaokrąglony), etykieta presetu;
  - czy także Pocket Rectangle i Surface; relacja z `BL-86` (zaokrąglenie
    wynikające z promienia freza w podglądzie).
- **`BL-97`** *(Otwarty)* 🟠 — **Facing: przejście wykańczające (Finishing
  Pass).** Zgłoszone 2026-10-04, odłożone przy `OP-7`. Dziś Facing bierze
  równe dosuwy co Stepover, ostatni wyrównany do naddatku. Pomysł jak w
  Pocket: checkbox Finishing Pass + Stock to Leave + Finish Feed —
  zgrubne dosuwy do naddatku minus Stock to Leave, na końcu jedno cienkie
  przejście na wymiar. Do ustalenia: wykańczanie na każdym poziomie Z czy
  jednym przejściem na pełnej głębokości (lepsza powierzchnia, wymaga
  długości ostrza ≥ Depth); sugestie Feedrate Calculator.
- **`BL-98`** *(Zrealizowany, 2026-10-06)* 🟢 — **Więcej slotów na
  presety.** Było pięć slotów `[1]…[5]`; doszły `[6]` i `[7]`
  (`PRESET_SLOT_IDS`) — Preset Bar, Krok 4, Overlay i Edit Mode biorą listę
  z jednego miejsca. Pełny opis: `CHANGELOG.md`, `[0.40.0]`.
- **`BL-99`** *(Otwarty)* 🟠 — **Symbol kierunku posuwu freza na
  podglądzie ścieżki.** Zgłoszone 2026-10-06 — **do przedyskutowania przed
  implementacją**. Dziś kierunek widać tylko w 2D i tylko w Surface i
  Facing (grot na linii przejścia); reszta operacji i cały podgląd 3D nie
  pokazują, w którą stronę jedzie frez. Do ustalenia: forma (groty wzdłuż
  ścieżki, jeden grot na przejście, znacznik startu/końca, gradient
  koloru), gęstość przy długich ścieżkach (Adaptive, Lightened), 2D i 3D
  czy jedno z nich, stały rozmiar ekranowy w 3D, wyłącznik w podglądzie
  albo w Settings → Appearance, relacja z animacją (`BL-100`).
- **`BL-100`** *(Otwarty)* 🔴 — **Animacja ścieżki w podglądzie.**
  Zgłoszone 2026-10-06. Odtwarzanie programu ruch po ruchu z wyborem
  prędkości ×1…×16; frez pokazany jako walec o średnicy równej Tool
  Diameter. Źródłem jest lista ruchów silnika (`lib/toolpath.ts`) z jej
  posuwami, więc czas wynika z G-code. Do ustalenia: 3D, 2D czy oba;
  sterowanie (Play/Pause, suwak postępu, powrót na start); prędkość
  rapidów (G0 nie ma posuwu w programie); czy materiał ma ubywać w trakcie
  (dziś model materiału pokazuje tylko stan końcowy — to osobny, duży
  temat); wysokość walca; zachowanie w Overlay i przy `renderPaused`;
  wydajność przy ścieżkach rzędu setek tysięcy ruchów.
- **`BL-101A`** *(Zrealizowany, 2026-10-06)* 🟢 — **Podgląd tabel Feedrate
  Calculator w Settings Modal.** Wydzielone z `BL-101`. Wdrożone: sekcja
  Settings → Feed Tables (po Tool Diameters) z tabelą materiałów, notami
  i pokrętłami wszystkich routerów, tylko do odczytu; sekcja „Material
  table” w kalkulatorze zostaje (wspólny komponent). Pełny opis:
  `CHANGELOG.md`, `[0.42.0]`.
- **`BL-101B`** *(Otwarty)* 🔴 — **Edycja tabel Feedrate Calculator,
  eksport i import.** Zgłoszone 2026-10-06, wydzielone z `BL-101`; po
  `BL-101A` (edycja w tym samym miejscu co podgląd). Dziś wartości są
  wpisane w kod. Pomysł: edycja wartości w appce, własne materiały,
  eksport do pliku i wczytanie z zewnątrz — np. YAML; zakres do wyboru
  (sama edycja, sam eksport/import albo oba). Do ustalenia: format (YAML
  wymaga parsera — biblioteka albo własny podzbiór; JSON jest bez
  zależności), walidacja wczytanego pliku i komunikaty błędów, zapis w
  `localStorage` i Reset do wartości fabrycznych, wersjonowanie formatu,
  czy routery też, co z materiałem zapamiętanym w `simplecam.feedCalc`,
  gdy zniknie z tabeli.
- **`BL-102`** *(Otwarty)* 🟠 — **Pocket: kształt Lobed Circle.**
  Zgłoszone 2026-10-06, po `OP-8`. Kieszeń o obrysie okręgu z wypustkami.
  Wariant prosty: kształt jest sumą okręgów, więc wybranie każdego okręgu
  osobno istniejącym silnikiem Pocket Circle (Spiral i Adaptive, wejście
  Helix) daje dokładnie tę sumę — okrąg główny, potem wypustki, element
  po elemencie z retraktem jak w Lightened; pola i walidacja „wypustka
  przecina okrąg główny” z Outline (`outlineLobedGeometry.ts`), w modelu
  materiału jedna pustka z dnem. Kompromisy: część wypustki nachodząca na
  okrąg główny jest cięta drugi raz w powietrzu; frez musi mieścić się w
  wypustce; Helix Radius względem najmniejszego okręgu. Do ustalenia:
  Finishing Pass — okrąg po okręgu (puste przejazdy) czy jedno okrążenie
  po wspólnym konturze (pętla Inside z Outline, wymaga freza mieszczącego
  się w przewężeniach). Wariant bez pustych przejazdów (wybieranie samego
  „księżyca” wypustki) świadomie poza zakresem — pierścienie odsuwane od
  wspólnego konturu rozpadają się na osobne obszary.
- **`BL-103`** *(Otwarty)* 🔴 — **Przełącznik Simple / Advanced Mode.**
  Zgłoszone 2026-10-06 — **sesja `/grill-me` obowiązkowa**. Przełącznik w
  prawym górnym rogu (Header); w Simple Mode część dzisiejszych opcji
  jest schowana. Do przegadania: które pola i funkcje znikają w Simple
  (per operacja i per krok — np. Ramp Angle, Lead/Clearance, Linking
  Feed, Tab Start, Offset, Start Z, Feedrate Calculator, Overlay/Edit
  Mode, sekcje Settings); jakie wartości mają schowane pola (domyślne
  czy ostatnio ustawione — i co z presetem zapisanym w Advanced z
  wartością inną niż domyślna); czy Simple chowa też całe operacje,
  kształty albo metody; tryb domyślny dla nowego użytkownika; gdzie żyje
  wybór (`simplecam.appearance` czy osobny klucz); walidacja schowanego
  pola z błędem (jak go pokazać); oznaczenie w UI, że coś jest ukryte;
  miejsce przełącznika w Header obok dark/light i Settings oraz Artifact
  Interface Anatomy.
- **`BL-104`** *(Otwarty)* 🟢 — **Settings → About: link do kanału na
  Instagramie.** Zgłoszone 2026-10-06. Przy „Envisioned by ThingsByPluzz”
  dodać link do kanału na Instagramie (adres do podania przy
  implementacji). Do sprawdzenia: otwieranie w nowej karcie
  (`rel="noopener noreferrer"`), czy sekcja Privacy wymaga wzmianki (sam
  link nie wysyła nic, dopóki nie zostanie kliknięty).
- **`BL-105`** *(Zrealizowany, 2026-10-06)* 🟢 — **Overlay: napis przy
  Preset Bar.** Po włączeniu oka Overlay na lewo od presetów pojawia się
  napis jak w Edit Mode: „Overlay Mode — select preset(s)”, a po
  zaznaczeniu „Overlay Mode — N preset(s) shown”. Baner „Preview mode” w
  podglądzie zostaje (tłumaczy, czemu nie widać żywego wzorca).
- **`BL-106`** *(Zrealizowany, 2026-10-06)* 🟠 — **Outline Lobed Circle:
  tryb Add / Subtract.** Po `OP-8`. Okręgi na okręgu podziałowym można
  dodać do okręgu głównego (wypustki) albo z niego wyciąć (wcięcia).
  Ustalenia z rozmowy: przełącznik „Lobes: Add | Subtract” na prawo od
  Offset Mode; w Subtract wcięcia nie mogą się stykać; frez niemieszczący
  się we wcięciu (Outside) blokuje Generate — bez częściowego wcinania.
  Geometria lustrzana do Add (różnica okręgów, `outsetLoop()`), nadal
  dokładne łuki. Subtract w Pocket poza zakresem. Pełny opis:
  `CHANGELOG.md`, `[0.43.0]`.
- **`BL-107`** *(Zrealizowany, 2026-10-06)* 🔴 — **Overlay z jednoczesną edycją jednego z
  podglądanych presetów.** Zgłoszone 2026-10-06 — **sesja `/grill-me`
  obowiązkowa**. Dziś Overlay i Edit Mode wzajemnie się wyłączają, a w
  Overlay żywy wzorzec jest ukryty i Generate zablokowany. Pomysł:
  podglądać kilka presetów naraz i jeden z nich edytować na żywo.
  Pomysły na UI (od użytkownika): Overlay i Edit dostają różne kolory
  obwódki (w motywach Arcade są dwa dominujące kolory) — oko i wybrane
  presety świecą kolorem Overlay; kliknięcie ołówka (inny kolor) pozwala
  wybrać jeden preset do edycji: trafia do Overlay, jeśli go tam nie
  było, a kolor jego obwódki zmienia się na kolor Edit. Do przegadania:
  dokładna maszyna stanów (oko, ołówek, klik w slot w każdej kombinacji;
  wyjście z trybów); jak rozróżnić w podglądach preset edytowany od
  pozostałych (kolor ścieżki, krycie); live-save przy niepoprawnych
  parametrach i napis stanu; czy Generate działa dla edytowanego presetu;
  wspólny model materiału przy każdej zmianie (wydajność przy kilku
  presetach); kamera (dziś zmiana selekcji re-fituje); kolory w motywach
  bez drugiego akcentu (Sloppy Indigo, Shopfloor Amber) i reguła „stan
  nigdy tylko kolorem”; relacja z `BL-105` (napis przy Preset Bar).
  **Obsługa po pierwszych testach (zmieniona względem ustaleń niżej):**
  zamiast dwóch trybów — dwa znaczki na każdym slocie (ptaszek = Overlay,
  ołówek = edycja), niezależne; edycja nie dokłada presetu do nakładki;
  klik w slot wczytuje tylko, gdy nic nie jest w Overlay ani w edycji;
  oko = wyczyść nakładkę / pokaż wszystkie, ołówek w Header = zakończ
  edycję; usuwanie presetów w Kroku 4 (`BL-109`). Podglądy, Generate,
  kolory i kamera — jak ustalono.
  **Ustalenia z `/grill-me` (2026-10-06):**
  - *Maszyna stanów.* Oko i ołówek to niezależne przełączniki, mogą
    świecić naraz. Ołówek ma pierwszeństwo: gdy świeci, klik w slot
    wybiera preset do edycji (radio) i dokłada go do nakładki, jeśli go
    tam nie było; gdy nie świeci, klik dodaje/usuwa z nakładki jak dziś.
    Sam ołówek = dzisiejszy Edit Mode. Ponowny klik w edytowany slot
    rozbraja go, preset zostaje w nakładce. Wyłączenie oka w trybie
    łączonym zostawia zwykły Edit Mode z uzbrojonym presetem. Włączenie
    oka w Edit Mode nie gasi ołówka — edytowany preset staje się
    pierwszym w nakładce, kolejne kliki przełączają edycję i dokładają
    presety. Wyłączenie ołówka rozbraja edycję, nakładka zostaje.
  - *Podglądy.* Edytowany preset rysowany z żywych parametrów wizarda
    (nie z wersji w slocie), normalnie; ścieżki pozostałych przygaszone
    (mniejsze krycie). Materiał — wspólny model jak dziś. Przy
    niepoprawnych parametrach edytowanego: jego kształt zostaje, ścieżka
    znika, napis „Fix the highlighted fields…”, reszta bez zmian;
    live-save wtedy nie zapisuje.
  - *Generate.* Z uzbrojonym presetem Generate, Copy, Download i zakładka
    G-Code działają dla niego; bez uzbrojonego Overlay blokuje jak dziś
    (baner „Preview mode” tylko wtedy).
  - *Kolory.* Nowy token koloru Edit w każdym motywie (Arcade — magenta,
    Sloppy Indigo — bursztyn, Shopfloor Amber — turkus/cyjan; nie może
    mylić się z błędem ani ostrzeżeniem). Ołówek i edytowany slot zawsze
    w kolorze Edit (także w zwykłym Edit Mode), oko i podglądane sloty w
    kolorze Overlay. Poza kolorem: podglądane sloty mają ptaszek,
    edytowany — mały ołówek.
  - *Kamera.* Re-fit tylko, gdy zmienia się zestaw pokazywanych presetów;
    edycja pól i przełączenie edytowanego presetu już widocznego nie
    ruszają widoku.
  - *Napisy.* Gdy świecą oba tryby — dwa napisy w dwóch wierszach na lewo
    od Preset Bar: Overlay w kolorze Overlay nad napisem Edit w kolorze
    Edit (napis Edit po uzbrojeniu zielony/czerwony wg poprawności).
- **`BL-109`** *(Zrealizowany, 2026-10-07)* 🟢 — **Usuwanie presetów w
  Kroku 4.** Razem z `BL-107`: „×” po najechaniu na zapisany slot w Kroku
  4, z potwierdzeniem; z Preset Bar usuwanie zniknęło (prawy górny róg
  slotu zajął znaczek edycji). Usunięty preset wypada z Overlay i z
  edycji.
- **`BL-108`** *(Zrealizowany, 2026-10-07)* 🟠 — **Pocket: kształt Donut
  (kieszeń pierścieniowa).** Okrąg z zostawionym środkiem (wyspą) —
  wybierany jest pierścień między Diameter a Island ⌀. Ustalenia z
  rozmowy: tylko Spiral (Adaptive osobno — `BL-110`), od wyspy na
  zewnątrz; wejście Plunge albo Helix = zejście po pierwszym okrążeniu pod
  Ramp Angle (bez pola Helix Radius); Finishing Pass na obu ścianach
  (zewnętrzna CCW, wyspa CW); w modelu materiału pustka z dnem i wyspą.
- **`BL-110`** *(Otwarty)* 🔴 — **Pocket Donut: metoda Adaptive.**
  Zgłoszone 2026-10-07 przy `BL-108`. Stałe zaangażowanie w pierścieniu:
  helix w środku szerokości pierścienia, faza A do okręgu stycznego do
  obu ścian, potem okręgi styczne do wyspy i ściany zewnętrznej przesuwane
  dookoła (rodzina `wing` z `pocketSectorAdaptive.ts`, tu na pełne 360° i
  kończąca się na już wybranym okręgu startowym zamiast narożnikami). Do
  przegadania: jedno skrzydło dookoła czy dwa po 180°, wąski pierścień
  (okrąg wpisany mniejszy niż helix), kierunek Climb/Conventional na obu
  ścianach, limity kroków.
- **`BL-61`** *(Zrealizowany, 2026-09-27)* 🔴 **[Low, kosztowne w czasie]**
  — **Podglądy duplikują geometrię silnika** — jedna lista ruchów (jak
  Adaptive) dla G-code i podglądu 3D, po jednej operacji na raz. Etapy 1–2
  (porządki, rejestry `OPERATION_META`/`OPERATION_RULES`, `TextToggle`) w
  0.20.8; etap 3 (`lib/toolpath.ts`): Surface (0.20.9), Pocket (0.20.10),
  Hole(s) i Outline Circle (0.22.3), Outline Rectangle (0.22.4).
- **`BL-63`** *(Zrealizowany, 2026-09-28)* 🟠 **[Low]** — **Wydajność podglądów** — brak
  debounce, Adaptive przy 1% i cały G-code w jednym `<pre>`, podgląd
  1000 otworów przy literówce, domyślna zakładka 3D, `WebGLRenderer` bez
  `forceContextLoss()`. Rozwiązane: odroczony podgląd (`useDeferredValue`),
  G-Code do 5000 linii, wzorzec przycięty do 100 otworów,
  `forceContextLoss()`; domyślna zakładka świadomie zostaje 3D. Pełny opis:
  `CHANGELOG.md`, `[0.22.7]`.
- **`BL-64`** *(Zrealizowany, 2026-09-28)* 🟢 **[Low]** — **Dostępność: stan
  przełączników tylko kolorem** — `aria-pressed` na przełącznikach,
  `role="tab"`/`aria-selected` na zakładkach podglądu, `aria-current` w
  Settings Nav. Pełny opis: `CHANGELOG.md`, `[0.22.6]`.

## Przyszłe operacje (`OP-#`)

Osobna, celowo **nie** `BL-#` kategoria — każda to nie drobna poprawka
tylko kamień milowy wielkości całego etapu implementacji, z własną,
dziś nieznaną taksonomią (operacja → pattern/sub-choice → parametry).
Numer `OP-#` jest identyfikatorem, nie kolejnością realizacji. `OP-1`
(Outline), `OP-2` (Pocket), `OP-3` (Surface), `OP-5` (Pocket Adaptive),
`OP-6` (Lightened Pocket), `OP-7` (Facing) i `OP-8` (Lobed Circle)
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
- **`OP-6` — Lightening Pocket (kieszenie odciążające z ramionami).**
  Zgłoszone 2026-09-27. Kieszeniowanie, które celowo zostawia materiał w
  postaci ramion — odciążenie części bez utraty sztywności. **Prostokąt:**
  ramiona łączą narożniki (przekątne), więc kieszenie mają kształt
  trójkątów. **Okrąg:** ramiona biegną od środka do zewnętrznej krawędzi,
  kieszenie to wycinki koła („kawałki pizzy”). Liczba ramion i ich
  grubość wybierane przez użytkownika. Do rozstrzygnięcia sesją
  `/grill-me`: osobna operacja czy metoda/tryb Pocket, obrzeże (ramka)
  przy ścianie zewnętrznej i piasta w środku okręgu, zaokrąglenie
  narożników kieszeni (promień freza), strategia czyszczenia trójkątów/
  wycinków (reużycie Spiral/Adaptive wymaga dowolnego wielokąta — dziś
  silniki znają tylko prostokąt i okrąg), liczba ramion dla prostokąta
  (2 przekątne = 4 trójkąty; więcej?), podglądy 2D/3D, walidacja.
  **Ustalenia `/grill-me` (2026-09-30), stan: etap 1 zrealizowany
  (`0.30.0`), etap 2 — Adaptive dla trójkątów (`BL-83`, `0.31.0`) i
  wycinków (`BL-85`, `0.32.0`) zrealizowany; `OP-6` zamknięte:**
  - Zawsze pełne wybranie komórki; o przelocie decyduje Total Depth; bez
    mostków (kontur po trójkącie przy przelocie → `BL-82`).
  - Nowe kształty w **Pocket** (nie osobna operacja): **Rectangle
    Lightened** i **Circle Lightened**, origin w środku.
  - Prostokąt, pole **Layout**: **X-grid N×M** (komórki z przekątnymi,
    1×1 = X) albo **Triangles N×M** (M rzędów zygzaku, N = liczba
    ukośnych ramion w rzędzie, rząd ma N+1 komórek; M = 1
    = Warren, M ≥ 2 = isogrid). N wzdłuż X, M wzdłuż Y, trójkąty
    dopasowane do prostokąta, na końcach rzędów połówki/trapezy.
  - **Rib Width** (mm); Width/Height/Diameter = obszar wybierany przez
    komórki, bez ramki (`BL-84`). Narożniki komórek automatycznie =
    promień freza.
  - Okrąg: **Spokes**, **Hub Diameter**, **Start Angle** (0° = +X);
    komórki = wycinki pierścienia między piastą a obwodem.
  - Etap 1: tylko **Spiral (offset)** — kontury równoległe co Stepover z
    Ramp Length (`BL-41`), offsety analityczne (wielokąt wypukły,
    wycinek pierścienia), bez biblioteki. Adaptive → etap 2 (`BL-83`).
  - Z-Transition jak Pocket; Helix w środku okręgu wpisanego komórki,
    jeden Helix Radius walidowany względem najmniejszej komórki.
  - Finishing Pass w etapie 1 (okrążenie nominalnego konturu na poziom,
    wejście łukiem stycznym na środku najdłuższej krawędzi).
  - Komórka po komórce do pełnej głębokości, retrakt między komórkami,
    kolejność wężem (okrąg: kolejno CCW).
  - Komórka za mała dla freza (okrąg wpisany ≤ promień freza, z Stock to
    Leave) blokuje Generate, błąd przy polach, które ją powodują.
  - Przy implementacji: N, M 1–20; Spokes 3–24 (2 szprychy leżą na
    jednej prostej — komórki przestają być wycinkami); Rib > 0, 0 ≤ Hub < Diameter; domyślnie Rect 120×40 Triangles
    4×1, Circle Ø80 / 5 szprych / Hub 16 / 90°, Rib 4 (Rim usunięty — `BL-84`); podglądy —
    komórki jako pustki (reguła Pocket); plik `op-rect-lightened-…`.
- **`OP-7` — Facing (nie mylić z Surface).** Zgłoszone 2026-09-30.
  **Zrealizowany** (2026-10-04, `0.38.0`) — piąta operacja: obróbka
  jednego boku detalu. Ustalenia rozmowy (2026-10-04):
  - Osobna operacja w Kroku 1, który wybiera bok: Bottom / Top / Left /
    Right Side (jeden bok na program).
  - Użytkownik podaje długość boku, naddatek i głębokość (= wysokość
    rysowanego boku). Zero wzdłuż boku: Start / Center / End; w poprzek:
    krawędź surowa albo gotowa; do tego Offset X/Y.
  - Stepover w mm i w % średnicy, sprzężone; zapisywane mm (zmiana freza
    przelicza %).
  - Jednokierunkowo, Climb (domyślnie) / Conventional; poziom Z po
    poziomie; wybieg poza końce boku = promień + Lead; po przejściu
    odsunięcie o Clearance i powrót na G1 z Linking Feed (bez wyjątku od
    zasady „G0 w XY tylko na Safe Z”).
  - Podglądy: poza wspólnym modelem materiału (jak Surface) — blok od
    gotowej krawędzi do brzegu widocznej płaszczyzny.
  - Feedrate Calculator z sugestią Stepover. Finishing Pass odłożony →
    `BL-97`.
  Pełny opis: `CHANGELOG.md`, `[0.38.0]`.

- **`OP-8` — Outline: kształt Lobed Circle (okrąg z wypustkami).**
  Zgłoszone 2026-10-06 (kapsel felgi: okrąg z uszami na otwory).
  **Zrealizowany** (2026-10-06, `0.41.0`). Punktem wyjścia był pomysł
  „merge objects” — łączenia presetów w jeden obrys. **Rozważone i
  odrzucone:** wymagałoby odsuwania dowolnych wielokątów, ścieżek tylko z
  odcinków G1 i programów z kilku presetów naraz, czyli kroku w stronę
  CAD-a wbrew założeniu „jedna operacja, bez CAD-a”. Zamiast tego jeden
  parametryczny kształt. Ustalenia `/grill-me` (2026-10-06):
  - Obrys = suma okręgu głównego i N okręgów ze środkami na okręgu
    podziałowym; pola: Diameter, Depth, Lobes: Count (1–100), Pitch
    Diameter, Lobe Diameter, Start Angle. Otwory osobną operacją Hole(s).
  - Wypustki mogą nachodzić; odłączona albo schowana blokuje Generate.
  - Outside: frez tnie tyle, ile sięgnie (notka przy wąskiej szczelinie);
    Inside: frez musi mieścić się w wypustkach i przewężeniach (blokada).
  - Ramp + Standard; G2/G3 jak Outline Circle; mostki równo po długości
    ścieżki z polem Tab Start (także w Outline Circle).
  Pełny opis: `CHANGELOG.md`, `[0.41.0]`.

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
- **Stan:** etapy 1–2 zrobione w 0.20.8 — rejestry `OPERATION_META`
  (`config/operationMeta.ts`) i `OPERATION_RULES` (`lib/validation.ts`)
  zamiast łańcuchów ternary, `TextToggle` zamiast skopiowanych
  przełączników, usunięty `lib/index.ts`, poprawione komentarze. Etap 3
  (lista ruchów `lib/toolpath.ts`, po jednej operacji, każda osobnym
  commitem z wizualną weryfikacją podglądów): Surface w 0.20.9, Pocket w
  0.20.10, Hole(s) i Outline Circle w 0.22.3, Outline Rectangle w 0.22.4
  (G-code porównany znak po znaku ze wzorcem z `lib/fuzzParams.ts`).
  Zakończone: `buildScene.ts` nie ma już żadnego lustra pętli silnika.
  Podgląd 2D Hole(s)/Outline rysuje tylko rzut kształtu (okrąg/prostokąt,
  mostki jako linia przerywana), nie pętle silnika — świadomie zostaje.
- **Nakład:** trudny (lista ruchów).

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
