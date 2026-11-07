# SculptureTool — rzeźby warstwowe z płyt

Wynik sesji `/grill-me` (2026-11-01/02). Spisane wspólne zrozumienie, punkt
wyjścia do prototypu. Nazwa robocza.

## Pomysł

Wrzucam model 3D (figura, popiersie, tors), program tnie go na warstwy do
wycięcia z płyt (MDF, sklejka) na frezarce. Po wycięciu składam warstwy w
całość i zostawiam jak jest albo pokrywam gipsem. Wariant ażurowy: warstwy z
dystansem, widać docelowy kształt, a bryła jest lżejsza wizualnie.

Pierwszy model w głowie: kobiecy tors w stylu greckim. Duży i ciężki wynik to
zaleta.

## Dla kogo

Głównie dla mnie, narzędzie warsztatowe. Surowy interfejs jest w porządku.
Bez naprawy uszkodzonych siatek, prowadzenia początkującego i optymalizacji
pod telefon. Model poprawiam w Blenderze.

## Architektura

- **Osobny moduł w tym samym repo:** drugi punkt wejścia Vite,
  `onlypaths.pluzz.pl/sculpture.html`. Kod w `src/sculpture/`.
- **Zależności w jedną stronę:** rzeźby importują z `src/lib/`, nigdy
  odwrotnie. Bundle OnlyPaths nie rośnie.
- **Reużywane:** `lib/toolpath.ts`, ustawienia maszyny (ta sama domena = te
  same zapisane dane), motywy (kolory, nie layout), `three`,
  `polygon-clipping`.
- **Nie obowiązują zasady OnlyPaths:** wizard, brak importu plików, jedna
  operacja. Bez linku w OnlyPaths, na razie adres znany tylko mnie.

Wspólny proces: przekrój → wielokąt z otworami → odejmowanie kształtów →
ścieżka narzędzia. Pręt, slot, przekładka i odciążenie to tylko różne kształty
do odjęcia.

## Warstwy

- **Grubość płyty:** jedna wartość, wpisana po zmierzeniu.
- **Dystans między płytami:** 0 = rzeźba pełna, równy grubości = „co druga
  warstwa”, dowolny inny też dozwolony. Nie ma osobnego trybu ażurowego.
- **Płaszczyzna konturu:** dół, środek albo góra płyty. Później także kontur
  wewnętrzny (część wspólna góry i dołu, pod gips) i zewnętrzny (pod
  szlifowanie).
- **Skala:** pole 450 × 450 ogranicza tylko przekrój, nie wysokość. Tors o
  barkach ok. 420 mm ma ok. 1 m wysokości, czyli ok. 55 warstw z płyty 18 mm.
- **Bez obracania:** warstwa jest cięta tak, jak leży w rzeźbie, górą do góry.

## Łączenie warstw

Docelowo wszystkie metody, wybierane pod projekt:

- **Pręty gwintowane z tulejkami:** bazowanie i dystans w jednym (pierwsza
  wersja).
- **Zakres prętów:** pręt nie musi iść przez całą wysokość — każdy otwór ma
  zakres warstw od–do (np. osobny pręt na każdą nogę). Przełącznik Cut dodaje
  otwór do pliku konturu warstw z tego zakresu (wiercony przed konturem; w
  tych warstwach nie trzyma śruby).
- **Przekładki między płytami** (w prototypie tylko podgląd): krążek albo obszar
  wspólny sąsiednich warstw pomniejszony o margines, z płyty o grubości dystansu.
- **Pionowy kręgosłup ze slotami.**
- **Klejone przekładki z otworami na kołki.**
- **Odciążanie (później):** ścianka plus żebra do prętów lub kręgosłupa. Pustka
  musi uwzględniać warstwy sąsiednie, inaczej pierścienie na stromych miejscach
  nie mają wspólnej powierzchni do klejenia. Przy dystansie widać środek.

## Wyspy

Ręka odchodząca od tułowia jest w przekroju osobnym kawałkiem. Metody, zależnie
od modelu:

- filtr drobnicy (minimalna powierzchnia),
- śruba lub pręt przez wyspę,
- automatyczny mostek do głównego kawałka,
- poprawka modelu w Blenderze.

**Sterowanie:** najpierw globalnie (poziom A), potem wyjątki dla wysp (poziom B).
Decyzja dotyczy całej wyspy 3D, czyli łańcucha przez kolejne warstwy, a nie
pojedynczej warstwy. Reguła: najpierw warstwy, potem wyjątki. W prototypie zmiana
warstw nie kasuje ręcznych współrzędnych otworów, tylko oznacza je ostrzeżeniem, a
ich stany są przeliczane. Pełna edycja warstw odpada, to byłby CAD.

## Przyrząd na stole

- **Jeden układ współrzędnych:** zero XY w środku przyrządu, wszystkie warstwy w
  układzie modelu. Pręty mają te same współrzędne w każdym pliku.
- **Z0 na wierzchu materiału:** standardowo — każdą płytę zeruje się w Z na
  jej wierzchu, cięcie idzie w ujemne Z do `-(grubość + overshoot)`; przyrząd
  w swoim pliku ma Z0 na swoim wierzchu. Przy nierównej grubości płyty
  przecięcie na wylot zależy od wpisanej grubości (zapas daje overshoot).
- **Punkty mocowania** to osobny element projektu, przy prętach pokrywają się z
  ich pozycjami.
- **Liczba prętów do wyboru (0–12).** Układ niesymetryczny, np. nieregularny
  trójkąt, żeby nie dało się założyć warstwy obróconej o 180°. Jeden lub dwa pręty
  tego nie dają, program o tym ostrzega.

### Otwory

Osobna operacja, z G-code albo ręcznie. Jeden główny `otwory.gcode` na całą
rzeźbę, a dodatkowe pliki tylko dla warstw, które potrzebują czegoś innego.
Program podaje, do których otworów przykręcam daną warstwę.

Stan pary otwór–warstwa:

| Stan | Znaczenie |
|---|---|
| mocowanie | Otwór w warstwie, tu wkręcam śrubę |
| pusty | Otwór w warstwie, niepotrzebny do mocowania |
| w odpadzie | Poza konturem, może trzymać pierścień odpadu |
| konflikt | Przecina kontur, warstwa dostaje własny plik bez tego otworu |

### Ryzyka do sprawdzania przez program

- **Mufa pod konturem:** kontur może przejść nad mufą, której warstwa nie używa.
  Mufy muszą być wpuszczone głębiej niż zapas przecięcia.
- **Główka śruby:** odległość od toru frezu i Safe Z ponad główkami.
- **Mocowanie tylko w szyi:** rozstaw wyznacza najwęższa warstwa, a bark wystaje
  ok. 200 mm. Dlatego mostki zostają, a śruby głównie pozycjonują.

## Cięcie warstwy

- Obrys po zewnętrznej stronie, otwory po wewnętrznej (kompensacja freza).
- Wyłącznie G1, kontur uproszczony z tolerancją ok. 0,1 mm.
- Miejsca węższe niż frez zostają niewycięte, podgląd je pokazuje.
- Mostki rozłożone po obwodzie, liczba na warstwę jako parametr.
- Kilka przejść Z, parametry jak w OnlyPaths.
- Najpierw otwory, na końcu obrys.

## Wynik

ZIP: `fixture.gcode`, `holes.gcode`, kontur każdej warstwy (`layer-017.gcode`) oraz
`mounting-card.txt` z rozmiarem płyty i listą śrub. Numery śrub także jako komentarz na
początku pliku warstwy. Numeracja na początek ołówkiem. Jedna warstwa, jeden
plik; układanie na arkuszu później.

## Piasta montażowa (Hub)

Ustalone w `/grill-me`, w prototypie (szczegóły: `src/sculpture/CLAUDE.md`). Problem: w warstwach z nogami (albo
innymi oddzielnymi kawałkami) nie ma miejsca wspólnego z resztą stosu, więc
każda taka warstwa mocuje się inaczej, a nogi przy klejeniu nie mają czego się
trzymać.

**Cel.** Każda warstwa dostaje ten sam sztuczny element wokół środka — piastę z
tymi samymi otworami. Każda płyta siada na przyrządzie tak samo, a po wycięciu
stos piast z prętami jest przyrządem do klejenia: trzyma nogi i wyspy na
miejscu. Mostki przecina się dopiero w sklejonej bryle.

- **Kształt:** okrąg, średnica ręcznie (podpowiedź minimalnej: trzy otwory z
  łbami i ścianką w niesymetrycznym trójkącie), środek domyślnie X0 Y0,
  przesuwalny. Ten sam w każdej warstwie.
- **Relacja z przekrojem:** piasta w całości w przekroju jest zwykłym
  materiałem rzeźby. W każdym innym przypadku to osobny element: piasta minus
  przekrój powiększony o szczelinę (co najmniej średnica freza). Wąski sierp w
  warstwach przejściowych dozwolony — program tylko ostrzega (warstwa, otwór,
  minimalna szerokość) i podświetla go w podglądzie; decyzja (przesunąć,
  zmienić średnicę) po stronie użytkownika.
- **Mostki piasty:** z piastą łączony każdy kawałek, który jej nie zawiera.
  Prosto do najbliższego punktu kawałka; mostek, który po drodze trafia na inny
  kawałek, kończy się na nim. Pełna grubość płyty, jedna szerokość, liczba na
  kawałek parametrem (1 albo 2; przy dwóch jak najszerzej rozstawione). To nie
  są Tabs do arkusza.
- **Otwory:** pręty w piaście, przez całą wysokość — wspólny obszar istnieje z
  definicji. Obecny mechanizm (otwory wysp, pręty z zakresem od–do) zostaje
  jako dodatkowe mocowanie poza piastą. `fixture.gcode` bez zmian.
- **Dystans > 0:** przekładki piasty — krążek o średnicy piasty z jej otworami,
  grubości dystansu, cięte z osobnej płyty: `hub-spacer.gcode`, liczba sztuk
  (warstwy − 1) w `mounting-card.txt`. To nie są przekładki rzeźby.
- **G-code:** piasta, mostki i kawałki to jeden obrys warstwy, kolejność jak
  dziś. Tabs do arkusza jak dziś, z własnym włącznikiem.
- **Przełączniki:** „Hub” w ustawieniach (zmienia warstwy, otwory, G-code) oraz
  „Show hub” w podglądzie (3D i widok warstwy) — przyrząd albo sama rzeźba po
  złożeniu. Wyłącznik tylko w podglądzie odrzucony: podgląd musi pokazywać to,
  co jest cięte.
- **UI:** Krok 4 „Holes and fixture”, sekcja Hub: Hub on/off, Diameter (z
  podpowiedzią minimalnej), Center X / Y, Slot, Bridges per piece (1 / 2),
  Bridge width. „Show hub” obok Show model / Show rods. Superimposed przy
  włączonej piaście liczy pokrycie z piastą.
- **Później:** automatyczny dobór środka, kształty inne niż okrąg, automatyczne
  usuwanie sierpów, Tabs zależne od odległości od piasty.

## Orientacja: oś cięcia i widok (BL-124)

Ustalone w `/grill-me` (2026-11-05), w prototypie. Up axis w Kroku 1 już wybiera
oś cięcia, więc „płyty wzdłuż X albo Y” to Up axis = X / Y. Dodatkowo **View up**
(„Same as Up axis”, X, Y, Z — osie pliku) i **View upside down**: obracają tylko
podgląd 3D (stos, model, pręty, przekładki; kamera od nowa). **Height** to
wysokość rzeźby wzdłuż View up, więc skala idzie za podglądem, a długość stosu
i liczba warstw z niej wynikają (pokazane obok). Warstwy, otwory, G-code i
widok warstwy bez zmian. Pionowe płyty mają pełną wysokość rzeźby — na stole
450 × 450 tylko rzeźby do ok. 440 mm (ostrzeżenie o zasięgu maszyny już jest).

## Zakres

**Pierwsza wersja:** STL, oś „do góry”, skala przez wysokość; grubość, dystans,
płaszczyzna konturu; pręty i punkty mocowania (program proponuje układ, współrzędne
edytowalne na liście); filtr wysp; podgląd stosu i pojedynczej warstwy ze stanem
otworów; ZIP.

**Później, w tej kolejności:** wyjątki dla wysp, kontur wewnętrzny/zewnętrzny,
kręgosłup, przekładki, układanie na arkuszu, grawerowana numeracja, odciążanie,
Simulate.

## Pierwszy test fizyczny

Fragment torsu o wysokości 150 mm, 6–8 warstw. Ma odpowiedzieć, czy mocowanie w
szyi plus mostki trzymają bark bez drgań. Jeśli nie, zmienia się projekt
przyrządu.
