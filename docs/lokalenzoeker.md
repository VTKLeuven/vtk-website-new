# Lokalenzoeker

Een student tikt "200K 00.06" of "Rosalind Franklin" en ziet binnen twee tikken
waar dat lokaal ligt: op de campuskaart, en daarna op de verdiepingsplattegrond
van het gebouw. Van daaruit kan hij de wandeling naar de deur laten uitzetten.

Dit document legt vast wat er al binnen is, welke keuzes gemaakt zijn en in welke
volgorde het gebouwd wordt.

## Wat er al is

Er zijn **twee bronnen**, en ze doen bewust niet hetzelfde.

`scripts/scrape-kulag.ts` haalt de KU Leuven Access Guide en de KU Leuven
kaart-API leeg en schrijft `scripts/kulag-gebouwen.json`. Vandaag staat daar
Celestijnenlaan 200 in: 20 gebouwen en 154 lokalen.

`scripts/scrape-osm.ts` haalt OpenStreetMap op via Overpass en schrijft
`scripts/osm-campus.json`: **987 knopen en 1105 bogen wandelnetwerk**, 58
ingangen, 5 bushaltes en 66 gebouwcontouren als context (Alma, IMEC, het
kasteel). 57 kB.

```
npx tsx scripts/scrape-kulag.ts                    # Celestijnenlaan 200
npx tsx scripts/scrape-kulag.ts --campus 30 --all  # heel Arenberg (109 gebouwen)
npx tsx scripts/scrape-osm.ts                      # wandelnetwerk en ingangen
npm run import:lokalen                             # KULag-JSON naar de databank
```

**KU Leuven heeft de gebouwen en de lokalen; OSM heeft de paden ertussen.** Dat
is de hele taakverdeling. KU Leuven publiceert geen wandelnetwerk, en zonder dat
netwerk is "breng me erheen" niet meer dan een speld op een kaart. OSM tagt een
universiteitsgebouw met `ref` = het gebouwnummer van KU Leuven, dus de twee
bronnen koppelen op dezelfde sleutel als `kulag_id` (12 van de 17 exact; de rest
op naam of op overlappende geometrie).

De OSM-gegevens zijn ODbL. **"© OpenStreetMap contributors" hoort zichtbaar bij
elke kaart die hiermee getekend wordt**; dat is geen nette gewoonte maar de
licentie.

Per gebouw: gebouwnummer (`490-13`), naam, **korte code** (`200K`), adres, foto,
de contour als lat/lng-veelhoek, het zwaartepunt daarvan, en de
toegankelijkheidsplannen als PDF. Per lokaal: KULag-id, lokaalnummer (`00.06`),
naam (`Aula Rosalind Franklin`) en rubriek (aula, les- en vergaderlokaal,
sanitair, inkom, lift, kringlokaal).

Drie dingen die tijdens het scrapen tijd gekost hebben en die je niet opnieuw
hoeft uit te zoeken:

- **De lat/lng op de KULag-gebouwpagina is voor élk gebouw dezelfde.** Dat is het
  middelpunt van de kaart, niet van het gebouw; `building=490-13` in dezelfde URL
  doet het werk. De echte positie komt uit het zwaartepunt van de contour.
- **De kaart-API wil als token gewoon een PHPSESSID.** `/maps/api/showbuilding/
  <id>/<tkn>` geeft zonder geldige sessie een **leeg antwoord met status 200**,
  niet een fout. De scraper haalt daarom eerst `/maps/kaart` op voor een cookie.
- **De zoekfunctie van KULag zelf is de sitebrede KU Leuven-zoek**, geen
  lokalenindex. `/json/buildings` negeert elke zoekparameter stil en geeft altijd
  alles terug. Zoeken doen we dus zelf, op onze eigen kopie.
- **Overpass weigert een verzoek zonder herkenbare User-Agent met een 406** en
  zegt er niet bij waarom. `fetch` in Node stuurt er geen, `curl` wel, dus dit
  werkt in je terminal en faalt in je script.
- **Neem enkel de grootste samenhangende component van het wandelnetwerk.** Een
  los stukje fietspad aan de rand van de bbox is geen route maar wel een val: het
  dichtstbijzijnde knooppunt bij een gebouw kan erin liggen, en dan vindt de
  zoektocht niets. `service` moet mee in de weg-selectie, anders valt het netwerk
  bij de parkings uiteen.

### Wat de bron niet dekt

KULag is een toegankelijkheidsgids, geen lokalenregister: er staan enkel lokalen
in die gescreend zijn. In de praktijk dekt dat wat een burgie zoekt (de aula's
van 200K/L/M/N, Aula A-D in 200C, de leslokalen van 200B, de seminarielokalen van
Quadrivium en 200S), maar het is **geen volledige lijst**. Een bureau of een labo
staat er niet in. Zeg dat in de interface: "gebaseerd op de KU Leuven Access
Guide", en laat een niet-gevonden zoekopdracht doorverwijzen naar KULag zelf in
plaats van te doen alsof het lokaal niet bestaat.

## De twee harde randvoorwaarden

**1. Geen nieuwe native module.** `mobile/AGENTS.md` is daar expliciet in: er is
geen Apple Developer-account, de enige weg naar een iPhone is Expo Go, en Expo Go
laadt enkel wat er in de SDK-client zit. `react-native-maps` en `expo-maps` staan
niet in het rijtje dat we vandaag gebruiken. Een kaart bouwen die een nieuwe
native module nodig heeft, betekent dat niemand de app nog op een iPhone kan
bekijken.

**2. Een WebView is hier geen uitweg.** Regel 2 laat een WebView toe voor
identiteit en geld, niet voor eigen inhoud. Een Leaflet-in-WebView zou de regel
omzeilen en levert bovendien een kaart die niet in de vormtaal van de site staat.

Daaruit volgt de vorm van de kaart, en dat is de kernkeuze van deze feature:

> **We tekenen de campuskaart zelf met `react-native-svg`, uit de vectoren van
> OSM en KU Leuven.** Geen tegels, geen API-sleutel, geen native module. Wat we
> hebben zijn echte gebouwvoetafdrukken en een echt padennet in lat/lng; die
> Mercator-projecteren naar een `viewBox` geeft een correcte plattegrond van
> Celestijnenlaan 200.

**Dit is ook waarom we geen OSM-rastertegels gebruiken.** De verleiding is groot
(een tegel is maar een afbeelding, en `expo-image` kan die tonen), maar de
gebruiksvoorwaarden van `tile.openstreetmap.org` staan app-gebruik op schaal niet
toe; daar een app op richten is de tegelserver van een vrijwilligersproject
gebruiken als eigen CDN. De alternatieven zijn een provider met een sleutel
(MapTiler, Thunderforest) of zelf tegels hosten, en allebei kosten ze meer dan ze
hier opleveren. De vectoren die we al hebben tekenen kost niets, werkt offline,
en levert een kaart in de vormtaal van de site in plaats van de wereldkaart van
iemand anders.

Dat is niet de goedkope oplossing die we nemen omdat het moet: het is de betere.
Een Google-basemap met veertig irrelevante labels erop staat haaks op de
vormtaal, en een eigen tekening kan het ene gebouw dat je zoekt in geel zetten en
de rest laten zwijgen. `react-native-svg` en `react-native-reanimated` zitten al
in de app, en `Skyline.tsx` bewijst dat dit patroon hier al eens gewerkt heeft.

## Architectuur

### De server is de waarheid

De gescrapete JSON is een **bron voor een seed**, niet het bestand dat de app
inleest. Redenen: regel 1 van de app (de server beslist), de app krijgt zo de
bestaande leescache van `useResource` gratis, de website kan dezelfde gegevens
tonen, en VTK moet kunnen bijsturen waar KULag te kort komt (het kringlokaal, de
fakbar, de naam die iedereen gebruikt in plaats van de officiële).

```
scripts/kulag-gebouwen.json          bron, in git, herbruikbaar via de scraper
  -> packages/db  Building / Room     met een import-script, create-or-update
    -> apps/web  /api/app/v1/lokalen  zoeken + detail
      -> mobile   src/screens/lokalen zoekscherm, kaart, plattegrond
      -> apps/web /lokalen            dezelfde gegevens op de site
```

### Datamodel

Twee tabellen in `packages/db`, met de natuurlijke sleutel als unieke kolom zodat
een herimport bestaande rijen bijwerkt in plaats van te verdubbelen (zelfde regel
als bij de fixtures).

```prisma
model Building {
  id         String   @id @default(cuid())
  kulagId    String   @unique          // "490-13"
  shortCode  String?                   // "200K", waar studenten op zoeken
  name       String                    // "Auditoria K"
  address     String
  zipcode     String
  city        String
  lat         Float?
  lng         Float?
  outline     Json                     // [[lat, lng], ...]
  photoUrl    String?
  kulagUrl    String
  plans       Json                     // [{ title, url }]
  /** Door VTK toegevoegd of gecorrigeerd; blijft staan bij een herimport. */
  notes       String?
  rooms       Room[]
}

model Room {
  id         String   @id @default(cuid())
  kulagId    String   @unique          // "490-13-000006"
  buildingId String
  building   Building @relation(fields: [buildingId], references: [id])
  code       String?                   // "00.06"
  name       String                    // "Aula"
  category   String                    // "Aula (auditorium)"
  /** Uit `code`: "00" wordt verdieping 0, "01" verdieping 1. */
  floor      Int?
  kulagUrl   String
  aliases    String[]                  // "Aula Rosalind Franklin", "AULA K"
}
```

`aliases` is het veld dat de zoekfunctie bruikbaar maakt. Niemand zoekt op
"490-13-000006"; mensen zoeken op "aula K", "de grote aula van 200K", "Franklin".

### Zoeken

De zoekterm normaliseren (kleine letters, punten en spaties weg) en matchen op
`shortCode + code` samen, op `code`, op `name`, op `aliases` en op de naam van het
gebouw. "200k0006", "200K 00.06" en "aula k" moeten alle drie op hetzelfde
uitkomen. Sorteren op exacte treffer eerst, dan gebouw, dan lokaalnummer.

Dit is klein genoeg om in Postgres met een `ILIKE`-reeks te doen; er is hier geen
tweede zoekmachine nodig naast `searchSite`. Wel **apart houden van de sitebrede
zoek**: een lokaal is geen pagina, en tussen de zoekresultaten van de site zou het
verdrinken. Wel omgekeerd een regel toevoegen aan `/zoeken` die naar de
lokalenzoeker doorverwijst wanneer de term op een lokaalnummer lijkt.

### Endpoint

`apps/web/app/api/app/v1/lokalen/route.ts`, in de vorm van de bestaande routes
(`appJson`, `appErrorResponse`, `corsPreflight`, `appLocaleFrom`). Twee vormen:

- `GET /api/app/v1/lokalen` geeft alle gebouwen met hun contouren en lokalen.
  Dat is vandaag ~70 kB en dus in één keer op te halen en te cachen; de kaart
  heeft de contouren van álle gebouwen nodig om er één in te kunnen tonen.
- `GET /api/app/v1/lokalen?q=...` geeft enkel de treffers, voor het typen.

Het type komt in `apps/web/lib/app-api/contract.ts` en wordt overgenomen in
`mobile/src/api/contract.ts`, zoals elk ander app-type.

## De schermen

### Zoeken

Eén scherm, `mobile/src/screens/lokalen.tsx`, met `SearchField` bovenaan (bestaat
al) en de campuskaart eronder. Bij een lege zoekterm toont de kaart heel
Celestijnenlaan 200 met de gebouwlabels; bij een treffer zoomt ze naar het gebouw
en zet dat in geel.

Onder de kaart de resultaten als rijen: `200K 00.06` groot, `Aula` eronder,
`Auditoria K` als derde regel. Debounce en `sequence`-teller precies zoals in
`src/screens/zoeken.tsx`; dat patroon is er al en is er om een reden.

### De campuskaart

`mobile/src/components/CampusMap.tsx`.

- Web Mercator van lat/lng naar de `viewBox`, één keer berekend uit de bounding
  box van alle contouren en daarna een constante.
- Drie lagen, van onder naar boven: de **paden** uit OSM als dunne `--line`-lijnen,
  de **contextgebouwen** uit OSM in `--paper-2` zonder label, en onze eigen
  **gebouwen** als `<Path>` in `--surface` met een `--line`-rand. Het gezochte
  gebouw in `--yellow`. Geen schaduw, geen gradient.
- De paden zijn wat de kaart leesbaar maakt: zonder hen zijn het zeventien vormen
  die zweven, met hen is het een campus.
- Labels: de korte code (`200K`) in het zwaartepunt. **Veertien codes passen niet
  op een campus van 350 punten breed**; 200M, 200S en 200L vielen over elkaar.
  Een gebouw draagt zijn label daarom pas wanneer het breed genoeg in beeld staat
  (`LABEL_AT_WIDTH`), en de kleine komen erbij naarmate je inzoomt. Het gekozen
  gebouw houdt zijn label altijd, want dat is waar je naar zoekt. De tekengrootte
  deelt door de zoom, zodat een label op het scherm even groot blijft.
- De zoom komt met `useAnimatedReaction` naar de JS-kant, en enkel bij een stap
  van meer dan 0,3: elke frame een `setState` doen zou de hele kaart opnieuw
  laten renderen tijdens het knijpen, precies wanneer het vloeiend moet blijven.
- Pannen en zoomen met `react-native-gesture-handler` en `react-native-reanimated`
  (beide aanwezig): een `Animated.View` met een transform rond de vaste SVG, niet
  de `viewBox` per frame herberekenen.
- Een tik op een gebouw opent het gebouwdetail.

De drie "Terrein"-records (`490-90`, `493-30`, `492-90`) hebben geen contour en
geen lokalen; die horen niet op de kaart. Filter ze weg op `outline.length > 0`.

### Gebouwdetail

Foto onder een navy scrim als kop (de vormtaal van de site), daaronder de korte
code en het adres, de lokalen gegroepeerd per verdieping, en twee knoppen:
**Breng me erheen** en **Plattegrond**.

### Breng me erheen

Met het OSM-wandelnetwerk erbij is dit geen doorverwijzing meer maar een echte
route, en die tekenen we zelf.

De graaf is 987 knopen en 1105 bogen, ongeveer 40 kB. Dijkstra daarover kost
niets op een telefoon, dus de route wordt lokaal berekend: **geen routeerdienst,
geen sleutel, geen netwerk**. Dat laatste is hier niet academisch; wie in de
kelder van 200C staat te zoeken waar hij moet zijn, heeft precies daar geen
ontvangst.

Gemeten op de echte graaf, van zwaartepunt tot zwaartepunt:

| van | naar | route | hemelsbreed |
| --- | --- | --- | --- |
| QDV | 200K | 453 m | 359 m |
| 200B | De Moete | 278 m | 148 m |
| 200S | Chem&Tech | 387 m | - |

De route eindigt aan een **ingang** en niet in het zwaartepunt van het gebouw:
OSM heeft er 58 in deze bbox, waarvan 11 als hoofdingang getagd. Bij 200K ligt de
dichtstbijzijnde op 16 m van het zwaartepunt, dus dat scheelt in de praktijk de
laatste ronde om het gebouw.

Twee dingen om eerlijk over te zijn:

- **Niet elke route is al goed.** 200G naar 200N komt op 648 m voor 281 m
  hemelsbreed. Dat is een omweg van 2,3 en te veel; ergens ontbreekt een
  verbinding of hangt het gebouw aan de verkeerde kant van het net. De graaf
  heeft dus nog afstelwerk nodig, en dat hoort in fase 2 gemeten te worden en
  niet geloofd.
- **Het net stopt aan de rand van de bbox.** Voor "ik zit thuis en moet naar
  200K" blijft de kaart-app van het toestel de betere weg; die kent de bus en het
  verkeer. Hou daarom `Linking.openURL` als tweede knop naast de eigen route:
  de onze is voor op de campus, die van het toestel om er te geraken.

```
ios:      maps://?daddr=<lat>,<lng>&dirflg=w
android:  geo:<lat>,<lng>?q=<lat>,<lng>(<naam>)
```

De 5 bushaltes uit OSM zijn een goed vertrekpunt zolang er nog geen eigen positie
is: een route vanaf de halte waar je uitstapt is bruikbaar zonder één
toestemmingsvraag. **Neem daarvoor niet zomaar de eerste uit de lijst**; OSM geeft
beide richtingen van dezelfde halte terug en de volgorde is toeval. `arrivalStop`
kiest de halte die het dichtst bij het midden van het padennet ligt, en dat komt
op "Heverlee Campus Arenberg" uit.

**Waar sta ik zelf** vraagt `expo-location`. Dat is een Expo-module en dus
vermoedelijk in Expo Go beschikbaar, **maar test dat eerst op een iPhone**. Is
het er niet, dan valt de hele iOS-kant stil, en dat is precies de fout die
`mobile/AGENTS.md` beschrijft. Zonder `expo-location` werkt al de rest gewoon;
het is een verrijking, geen voorwaarde, en het hoort daarom in fase 3.

### Binnen in het gebouw

Dit is het onzekere stuk en het hoort daarom achteraan.

De toegankelijkheidsplannen van KULag zijn vector-PDF's uit AutoCAD, één pagina
met de verdiepingen naast elkaar. Goed nieuws: `pdftotext -bbox` haalt er de
lokaalnummers **met coördinaten** uit; op het plan van Quadrivium staan `100`,
`110`, `180` als losse tekstelementen op de juiste plek. Slecht nieuws: de tekst
is geroteerd en gefragmenteerd, en de verdiepingen zitten als blokken op één
pagina die je eerst moet segmenteren.

Aanpak, server-side in `scripts/`, niet in de app:

1. Per gebouw de PDF omzetten naar één afbeelding per verdieping (`pdftoppm`, of
   naar SVG met `pdf2svg` als de bestandsgrootte meevalt).
2. Uit `pdftotext -bbox` de labels halen, per verdiepingsblok groeperen, en
   `00.100` koppelen aan het label `100` in het blok van verdieping 00.
3. Het resultaat opslaan als `Room.planX` / `Room.planY` plus een
   `FloorPlan`-record met de afbeelding en de afmetingen.

In de app is het dan een `expo-image` met een `<Circle>` van `react-native-svg`
erop, in dezelfde pan/zoom-schil als de campuskaart.

**Val terug op het eenvoudige wanneer stap 2 tegenvalt**: toon de plattegrond
zonder speld, met de verdieping en het lokaalnummer erboven. Dat is nog altijd
sneller dan wat een student vandaag doet. Handmatig een handvol lokalen pinnen
(de aula's, de fakbar, het kringlokaal) is dan de tussenstap, geen mislukking.

Een echte binnennavigatie ("links, dan de trap op") bouwen we niet. Daar is een
looproutegraaf per verdieping voor nodig die niemand onderhoudt, en die vervalt
zodra er een deur dichtgaat.

## Volgorde

**Fase 1, de kern. Staat er.** Prisma-model (`Building`, `Room`), importscript
(`npm run import:lokalen`), `/api/app/v1/lokalen` met zoeken, het zoekscherm
`mobile/src/screens/lokalen.tsx`, en de tegel op home. Zonder kaart nog, want een
lijst die "200K 00.06, Aula, Auditoria K, gelijkvloers" zegt is op zichzelf al
bruikbaar; zo staat er iets op een toestel voor de kaart af is.

**Fase 2, de kaart en de route. Staat er.** `mobile/src/components/CampusMap.tsx`
met de drie lagen, `campus/geo.ts` voor de projectie en `campus/route.ts` voor
Dijkstra. Pannen, knijpen en dubbeltikken om terug te zetten. Het endpoint stuurt
de OSM-ondergrond mee (`AppCampusMap`), zodat de route offline berekend wordt.
Gemeten op het echte antwoord: **vijf routes in 4 ms**, dus de bewering dat dit
zonder netwerk kan is geen schatting.

**De kaart is nog niet op een toestel gezien.** Er is geen simulator op deze
machine, dus de projectie, de laagvolgorde en de labelregel zijn geverifieerd
door de echte modules in Node te draaien en de SVG te renderen. Gebaren en het
gedrag van `react-native-svg` zelf zijn dus nog ongetest.

### De omweg was niet OSM, maar wij

De eerste meting gaf een mediane omweg van x1,43 en een uitschieter van **x9,07**:
200G naar Quadrivium was 508 meter voor 56 meter hemelsbreed. De verleiding is
dan om OSM de schuld te geven en gaten in het padennet te gaan dichten. Meten gaf
een ander antwoord; er zaten twee fouten in onze eigen code.

- **Een deur werd gekozen op afstand tot het zwaartepunt.** Bij een lang gebouw
  ligt elke deur ver van het midden, en de dichtstbijzijnde kan aan de verkeerde
  kant staan. Welke deur de juiste is, hangt af van waar je vandaan komt, dus dat
  hoort de route te beslissen. `shortestPathToAny` doet dat in één zoektocht:
  Dijkstra bezoekt de knopen toch al op volgorde van afstand, dus de eerste deur
  die afgehandeld wordt is de beste.
- **Deuren werden door twee gebouwen tegelijk geclaimd.** Quadrivium en 200G
  staan tegen elkaar, en met "elke deur binnen 25 meter" nam 200G er van
  Quadrivium over. De koppeling deur-gebouw gebeurt nu op de server en is
  exclusief: een deur hoort bij het gebouw waar ze het dichtst tegenaan ligt, en
  bij precies één.

| | ervoor | erna |
| --- | --- | --- |
| mediane omweg | x1,43 | **x1,10** |
| slechtste | x9,07 | **x2,01** |
| paren boven x1,6 | 50 van 132 | **6 van 132** |

De zes die overblijven zitten tussen x1,6 en x2,0, en dat is gewoon wat het kost
om rond een gebouw te lopen. 132 paren doorrekenen duurt 35 ms.

**De les is de volgorde: eerst meten over alle paren, dan pas de bron
verdenken.** Er zijn wel degelijk tien plekken waar twee paden elkaar tot op vier
meter raken zonder een knoop te delen, goed voor omwegen tot 340 meter tussen die
knopen. Ze liggen allemaal langs de Celestijnenlaan en ze zaten geen van alle
achter dit probleem. Wie die wil dichtnaaien: verbind knopen die dichter dan een
meter of vier bij elkaar liggen maar geen boog delen, en sla ways met `bridge`,
`tunnel` of `layer` over, anders knoop je een brug aan de weg eronder vast.

**Fase 3, de verrijking.** `expo-location` (na controle in Expo Go) voor de eigen
positie en dus een route vanaf waar je staat in plaats van vanaf de halte, en
`/lokalen` op de site met dezelfde gegevens.

**Fase 4, binnen.** De PDF-pijplijn, met de terugval hierboven.

Uitbreiden naar heel Arenberg is geen fase maar een vlag: `--campus 30 --all`
geeft 109 gebouwen. Doe dat pas wanneer fase 2 staat, anders debug je een kaart
met vijf keer te veel vormen erop.

## Onderweg niet vergeten

- **Routes.** Een nieuw scherm betekent een regel in `TAB_ROUTES` in
  `mobile/src/navigation.ts` en daarna `npm run routes`; `npm run routes:check`
  vangt het anders in de verify. Het scherm hoort onder **Meer** (het is iets wat
  je opzoekt) en waarschijnlijk ook onder **Studeren**, want daar zoek je waar je
  les hebt. Staat het in beide tabs, dan hoort het in beide lijsten.
- **`nativeRoute.ts`.** Komt er ooit een CMS-pagina die naar `/lokalen` linkt, dan
  hoort daar een regel bij, anders opent ze een browser.
- **`AppNavTab` en Meer.** Het scherm in `src/screens/meer.tsx` zetten met een
  icoon uit `lucide-react-native` (`MapPin` of `Compass`), geen emoji.
- **EAS Update.** Na elke app-wijziging op `main` meteen
  `cd mobile && npx eas update --branch preview`.
- **Geen kaart in een kaart.** De campuskaart staat direct op het papier, niet in
  een witte kaart met een rand; anders krijg je het geneste-kaartprobleem dat de
  styleguide verbiedt.
- **Kringkeuzes horen in `docs/design-decisions.md`**, niet hier. Welke lokalen
  VTK zelf toevoegt en onder welke naam is zo'n keuze.
