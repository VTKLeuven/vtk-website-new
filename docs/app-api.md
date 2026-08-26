# De app-API (`/api/app/v1`)

De JSON-API waar de **VTK-app** (Expo, iOS + Android, `mobile/` in deze repo) op draait.
Dit document beschrijft het contract en de regels errond. Voor een inventaris van
alles wat er voor de app aan deze site toegevoegd is (endpoints, migraties,
rechten, wat er nog moet gebeuren), zie [`app-toevoegingen.md`](./app-toevoegingen.md).
Het plan van de app zelf staat in `mobile/docs/plan.md`.

Niet te verwarren met de scanner: `vtk-scanner-app` praat met `/api/tickets/...`
en staat hier los van.

## Waarom een eigen boom

De bestaande API-routes zijn per stuk gegroeid voor één beller: `/api/shift` voor
de urenloop-app, `/api/tickets/events/[eventId]/scan/*` voor de scanner,
`/api/calendar/*` voor de agenda-feeds. Die mogen blijven zoals ze zijn.

`/api/app/v1` is iets anders: **een contract met een versie in het pad**, omdat de
beller een geïnstalleerde app is. Een gebruiker die zijn app een half jaar niet
bijwerkte, praat nog steeds met deze server. Breekt er iets aan een bestaande
vorm, dan komt er `/api/app/v2` naast en blijft v1 staan zolang er toestellen op
zitten.

## De vier regels

1. **Nooit een Prisma-vorm doorgeven.** Elke route bouwt een expliciete vorm uit
   `lib/app-api/contract.ts`. Dat is niet alleen de regel uit `AGENTS.md` dat
   `@vtk/db` zijn client-types niet exporteert; het is vooral dat een
   geïnstalleerde app maanden ouder kan zijn dan het schema.
2. **De teksten zijn al gekozen.** De app stuurt `?locale=nl|en` en krijgt
   `title`, niet `titleNl` + `titleEn`. Zonder die regel zou de app `pick()` uit
   `@vtk/i18n` moeten nabouwen en zou elke nieuwe vertaalde kolom een app-release
   vragen.
3. **Beeld-URL's zijn absoluut.** `publicUrl()` geeft een pad; een
   `<Image source={{ uri }}>` in React Native vult daar geen host bij aan.
   `absoluteMediaUrl()` in `lib/app-api/media.ts` doet dat, met de host **uit de
   aanvraag** en niet uit `VTK_MAIN_URL`: lokaal testen gaat via een
   cloudflared-tunnel en dan wijst die variabele naar een localhost waar de
   telefoon niet bij kan.
4. **Logica komt uit `lib/`, niet uit de route.** Waar de site een server-action
   heeft die hetzelfde doet, verhuist de kern naar een gewone functie in `lib/`
   die allebei roepen. De app mag nooit soepeler zijn dan de website; bij Theokot
   (bans, bestelvensters, voorraad) is dat het hele punt.

## Bestanden

| Bestand | Wat |
|---|---|
| `apps/web/lib/app-api/contract.ts` | Types en zod-schema's. **Geen server-imports**, want dit bestand wordt gekopieerd naar `mobile/src/api/contract.ts`. |
| `apps/web/lib/app-api/respond.ts` | `appJson`, `appError`, `appErrorResponse`, `readAppJson`. Eén plek voor de foutvorm en de CORS-headers. |
| `apps/web/lib/app-api/media.ts` | `requestOrigin`, `absoluteMediaUrl`, `absoluteUrl`. |
| `apps/web/lib/app-api/version.ts` | `minimumAppVersion()` en `compareVersions()`. |
| `apps/web/test/appApiContract.test.ts` | Bewaakt de vorm, en vergelijkt het contract met de kopie in de app-repo wanneer die naast deze staat. |

## Sessie en toegang

Dezelfde weg als de scanner: **het gedeelde better-auth sessiecookie**. De app
logt in met de gewone weblogin in een WebView; het cookie belandt in de
cookie-opslag van het besturingssysteem en `fetch` in React Native gebruikt
diezelfde opslag. Er wordt geen token bewaard, en KU Leuven-SSO werkt daardoor
vanzelf.

Routes gebruiken `requireSession()` of `getCurrentSession()` uit `lib/session.ts`
en laten fouten door `appErrorResponse` afhandelen. Foutcodes die de app kent:
`UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404),
`INVALID_REQUEST` (400 of 413) en `SERVER_ERROR` (500). De app beslist op de
code, niet op de tekst.

**De onboarding-gate is de app zijn eigen werk.** `proxy.ts` stuurt een lid zonder
afgewerkt profiel naar `/onboarding` en een lid dat zijn studie nog niet bevestigde
naar `/studie-bevestigen`, maar die gate staat op pagina's en niet op `/api`. De
app-API vertelt daarom in `bootstrap` of dat speelt (`needsOnboarding`,
`needsStudyConfirmation`), en de app toont dan het bijbehorende webscherm. Zonder
dat zit een nieuw lid in een app die overal leeg blijft zonder te zeggen waarom.

## Endpoints

### `GET /api/app/v1/bootstrap`

Wat de app bij elke start ophaalt, in één ronde: `viewer` (of `null`), de
headertabs uit het CMS, de aankondiging van dit moment, `minimumAppVersion`,
`webBaseUrl` en `abilities`. Werkt zonder sessie; de app is publiek bruikbaar.

`abilities` (`lib/app-api/abilities.ts`) zegt welke knoppen deze gebruiker mag
zien: scannen, bonnetjes aanvaarden, de afhaalbalie. Dat is **netheid en geen
beveiliging** (elke route controleert het daarna nog eens zelf); zonder dit zou de
app knoppen tonen die bij de helft "geen toegang" antwoorden, en dat is erger dan
een knop die er niet is.

### `GET /api/app/v1/vandaag`

Het beginscherm van de app. Bewust een eigen route naast `/home`: die laatste is
de voorpagina van de site in gegevensvorm (fotohero, aftermovies, career,
partners) en blijft staan zolang er toestellen op de oudere versie van de app
zitten. `/vandaag` beantwoordt de twee vragen waarmee iemand zijn telefoon
bovenhaalt: **wat is er open** en **wat wacht er op mij**.

- `services`: Theokot, cursusdienst en 't ElixIr, elk herleid tot `openNow` plus
  één regel `detail` ("tot 14:00", "opent 22:00", "do 12:00"). Het rekenwerk zit
  in `lib/app-api/serviceStatus.ts`, **op de Brusselse klok** en niet op die van
  de server: `isOpenAt` in `hoursUtils` gebruikt `Date#getHours()` en is dus stil
  fout zodra de container niet op Europe/Brussels staat.
- Een dag kan een bereik zijn (`12:00 - 14:00`) of één tijdstip (`22:00`). Dat
  tweede is 't ElixIr: een fakbar opent om tien uur en sluit wanneer ze sluit.
  `parseHoursRange` kent enkel het eerste, en daardoor stond de bar de hele week
  als gesloten op het beginscherm tot dit erbij kwam.
- `tasks`: wat er op deze gebruiker wacht, gesorteerd op dringendheid door de
  server. De app tekent enkel; zou ze zelf beslissen wat dringend is, dan stond
  die regel op twee plaatsen.
- `vouchers`: het openstaande bonnetjessaldo, of `null` zonder login.

### `POST /api/app/v1/push/register` en `/push/unregister`

Melden een Expo-pushtoken aan of af op de ingelogde gebruiker. De sleutel is het
**token** en niet de gebruiker: één lid heeft soms twee toestellen, en na een
herinstallatie geeft Expo een nieuw token voor hetzelfde toestel.

Er wordt vandaag **nog niets verstuurd.** De tabel `AppPushDevice` en deze twee
routes bestaan nu al omdat een pushtoken native code vraagt (`expo-notifications`)
en die niet via een OTA-update bijgezet kan worden. Kwam dit pas later, dan had
iedereen op dat moment een nieuwe build nodig. Opruimen gebeurt straks bij het
verzenden, wanneer Expo een token als `DeviceNotRegistered` afkeurt.

### `GET /api/app/v1/home`, `/kalender`, `/kalender/[id]`

De homepage-inhoud, de agenda en één evenement. Alle drie bovenop de helpers die
de site zelf gebruikt (`readOpeningHoursSetting`, `getCursusdienstHours`,
`readBarStatus`, `resolveFrontpage`, `loadCalendarEvent`), zodat de openingsuren
en de doelgroepfilter niet twee keer berekend worden.

De kalender filtert op `end >= nu` en niet op `start`: anders verdwijnt een
festival op zijn tweede dag. Zonder categorie geldt de doelgroepfilter; met een
categorie niet, want wie om de eerstejaarskalender vraagt, wil ze zien.

### `POST`/`DELETE /api/app/v1/kalender/[id]/interesse`

De ster op een evenement: "ik ga hier waarschijnlijk naartoe". **Geen
inschrijving**: er hangt geen plaats aan, geen betaling en geen deelnemerslijst.
Wat ze wel doet is jouw eigen lijst maken (`?interesse=1` op de kalender) en de
herinnering van de dag ervoor eraan hangen.

Twee keer aanzetten is geen fout: een tik op een ster die al aan stond hoort niets
te doen en zeker niet te falen op een trage verbinding waar de eerste tik al
aankwam. Uitzetten controleert bewust niet of het evenement nog zichtbaar is; je
moet je eigen ster altijd weg kunnen halen.

`?interesse=1` negeert de doelgroepfilter, ook met opzet: wat jij ooit aanduidde
hoort in jouw lijst te blijven staan, ook wanneer je studiejaar intussen
verschoven is.

#### De teller en de aanwezigheidslijst

`interestedCount` staat sinds augustus 2026 op **elke** kalenderrij en niet enkel
op de detailpagina, want de site toont hem ook in het raster en op de homepage.
Drie regels erbij, alle drie aan de serverkant zodat app en website nooit een
ander antwoord geven op dezelfde vraag:

- Hij telt **leden én gasten** (`CalendarEventGuestInterest`, de weg waarlangs een
  alumnus zonder account kan aanduiden dat hij komt).
- Hij verschijnt pas vanaf `INTEREST_PUBLIC_THRESHOLD` uit
  `lib/calendar/interest.ts`; daaronder is de waarde `null`. Bewust `null` en
  geen `0`: een app-versie die het veld nog niet kent, valt daarmee vanzelf in de
  "toon niets"-tak, terwijl `0` een echt nulaantal zou suggereren.
- `attendees` op de detailrespons is de publieke aanwezigheidslijst, en staat
  **enkel** bij een alumni-evenement (`isAlumniEvent`). Er staat alleen in wie op
  de site zelf aanvinkte zichtbaar te willen zijn; wie dat niet deed, telt mee in
  het getal en verschijnt nergens.

`filteredByAudience` zegt of er effectief iets weggefilterd **wordt**, niet of we
het geprobeerd hebben. Sinds doelgroepevents standaard voor iedereen zichtbaar
zijn, is dat filter meestal leeg; zou de vlag toch true blijven, dan zet de app
een regel onder de lijst dat er activiteiten ontbreken terwijl er niets ontbreekt.

### `GET`/`PATCH /api/app/v1/mijn/meldingen`

Welke soorten bericht je wil, en welke kalendercategorieën je volgt. Die twee
staan in één endpoint omdat ze in één scherm horen: "waarvoor gaat mijn telefoon
af". Apart zetten zou betekenen dat je twee schermen moet bezoeken om te snappen
waarom je iets kreeg.

`PATCH` doet **één schakelaar per aanroep** en niet de hele set. Een scherm dat
telkens alles terugstuurt, overschrijft wat er intussen op een ander toestel
veranderde.

Enkel afwijkingen staan in `AppNotificationPreference`; geen rij betekent de
standaard uit `APP_NOTIFICATION_TOPICS` in het contract. Zo heeft een nieuw soort
bericht vanzelf de juiste standaard voor iedereen die al bestond.

### `GET /api/app/v1/mijn/bonnetjes` en `POST /api/app/v1/bonnetjes/{pas,inwisselen}`

Bonnetjes verdien je met shiften en geef je uit aan een toog.

**Het saldo is geen kolom.** Het is `Shift.reward` min `ShiftParticipant.rewardPaid`
over alle voorbije shiften. Er bestond al een beheerscherm dat bonnetjes in geld
uitbetaalt en een afhaalbalie die er twee afboekt voor een broodje; die schrijven
allemaal in diezelfde kolom. Een tweede saldo ernaast zou betekenen dat de twee
uit elkaar kunnen lopen, en dan is geen van beide nog te vertrouwen.
`lib/app-api/vouchers.ts` voegt enkel de derde weg toe om ze uit te geven.

- `/mijn/bonnetjes` geeft saldo, historiek en **de pas**: de QR die je aan een
  balie toont. Die zit in dezelfde aanvraag als het saldo omdat ze samen op één
  scherm staan; twee rondjes voel je aan een toog wel degelijk.
- `/bonnetjes/pas` is de leeskant voor wie aanvaardt: wie is dit, hoeveel staat er
  open, en (met `theokot.pickup`) de broodjesbestelling van vandaag.
- `/bonnetjes/inwisselen` boekt af. Allebei achter het recht `shift.rewardRedeem`.

**De pas gaat mee bij het afboeken, niet het `userId` uit de vorige stap.** Zonder
dat zou wie dit recht heeft bij eender wie kunnen afboeken zonder dat die persoon
erbij staat. De pas leeft twee minuten, dus hij dwingt af dat het echt om deze
scan gaat. En je kan **niet bij jezelf** afboeken: wie mag aanvaarden heeft zelf
ook bonnetjes, en zijn eigen pas scannen is de kortste weg naar een gratis pint
zonder dat er iemand meekijkt.

Opzoeken en afboeken zijn bewust twee stappen. Wie achter een toog scant, hoort
de naam en het saldo te zien voor er iets afgaat.

### `GET /api/app/v1/scan/events` en `POST /api/app/v1/scan/uitnodiging`

De evenementen waarvoor je tickets mag scannen, en het inwisselen van een
uitnodigings-QR.

De lijst komt uit `listScannableTicketEvents()`, dezelfde als het keuzescherm van
de webscanner: van twaalf uur na afloop tot een maand vooruit, met de
standaardregel plus je grants. Een lege lijst is een geldig antwoord en geen
fout.

De uitnodiging is hetzelfde token en dezelfde schrijfweg (`grantScannerRole`) als
`/scan/uitnodiging` op de site, waar diezelfde QR op uitkomt met de gewone camera
van een telefoon. Eén soort code die overal werkt is makkelijker uit te leggen aan
wie hem aan de deur moet tonen, en er is maar één plek waar een grant ontstaat.
De app mag ook de volledige URL doorsturen; dat is wat een camera leest.

**Scannen zelf loopt niet langs `/app/v1`.** De app post naar
`/api/tickets/events/[eventId]/scan`, want die route draagt de hele beoordeling
(geldig, al gescand, verkeerd evenement, terugbetaald) plus het scanlogboek.

### `POST /api/app/v1/fakbar/checkin`

Inchecken aan de bar met je telefoon in plaats van met je studentenkaart. Naast de
kaartlezer hangt een QR met een ondertekende code (te vinden in
/admin/fakscanner); de check-in zelf is dezelfde `registerCheckin` als de Pi
gebruikt.

**De eerlijke beperking**: die code hangt daar maanden en verloopt dus niet. Wie
er een foto van neemt, heeft hem voorgoed. De tegenmaatregel zit niet in het token
maar in de check-in: ze telt enkel wanneer 't ElixIr op dat moment ook **open
gemeten** wordt (`readBarStatus`, niet stale), en nog steeds maar één keer per
bardag. Zie `docs/design-decisions.md`.

### `GET /api/app/v1/theokot` en `POST`/`DELETE /api/app/v1/theokot/order`

Broodjes bij het Theokot. **De logica staat in `lib/theokot-orders.ts` en wordt
gedeeld met de server-actions van de website**; deze routes vertalen alleen een
`TheokotOrderError` naar een code die de app kent. Zie de vierde regel hierboven:
de app mag hier niet soepeler zijn dan de site, en bans, bestelvensters en
voorraad zijn precies waar dat zou mislopen.

Annuleren is `DELETE` met het order-id in de **body** en niet in het pad: een id
in een URL komt in server- en proxylogs terecht. "Bestaat niet" en "niet van jou"
geven hetzelfde antwoord.

### `GET /api/app/v1/tickets` en `/tickets/[slug]`

De ticketverkoop, uit dezelfde `listPublishedTicketEvents` /
`getPublishedTicketEventBySlug` als de webshop. De lijst draagt geen tickettypes;
die zijn pas op het detailscherm nodig.

**Afrekenen heeft geen eigen app-route.** De app post rechtstreeks naar het
bestaande `POST /api/tickets/checkout` en opent de `checkoutUrl` die daaruit komt
(Mollie, of de bestelpagina bij een gratis ticket) in een browser. Een wrapper
zou hier niets doen dan doorgeven, en de bestaande route zet bovendien het
order-toegangscookie dat de app daarna nodig heeft om
`/api/tickets/orders/[orderId]/status` te mogen lezen. Dat cookie deelt `fetch`
in React Native met de browser, dus dat werkt vanzelf.

### `GET /api/app/v1/mijn/tickets` en `/mijn/profiel`

Onder `/mijn/` en niet onder `/tickets/mijn`, zodat het nooit botst met een event
met de slug "mijn".

Een ticket draagt zijn `credential`: de **inhoud** van de QR-code, niet een
afbeelding. De app tekent de code zelf. Dat scheelt een rondje, en belangrijker:
een getekende QR werkt ook wanneer er net aan de ingang geen netwerk is.

### `GET /api/app/v1/categorie/[slug]` en `/paginas/[slug]`

De inhoud uit het CMS. De categorie toont dezelfde selectie als het uitklapmenu
in de header (zichtbaar én gepubliceerd), inclusief de menu-items die naar een
andere site wijzen.

Een pagina komt **altijd als Markdown**, ook wanneer ze in de database nog als
tiptap-JSON staat; `lib/app-api/pageContent.ts` zet dat om, met exact dezelfde
terugvalregels als `PageView`. Markdown is de bron van waarheid: zodra een taal
een markdown-waarde heeft, ook een lege, telt het tiptap-JSON van die taal niet
meer mee. Die lege-string-regel is de plek waar dit stil kan mislopen, en er
staat een test op.

De kop-index wordt uit diezelfde Markdown afgeleid en niet uit het JSON, zodat de
ankers per definitie bij de getoonde tekst horen.

### `GET /api/app/v1/zoeken`

Bovenop `searchSite`, met de twee dingen die daar uit de sessie komen expliciet
meegegeven: de doelgroepen van de kijker, en of hij ingelogd is. Dat tweede
bepaalt of het uitleenmateriaal meezoekt; die catalogus zit achter een login, en
materiaalnamen in een publieke resultatenlijst zetten zou die keuze langs de
achterdeur ongedaan maken.

Snippets gaan als platte tekst naar de app. De markeringstekens die Postgres rond
een treffer zet, zouden hier een eigen opmaakformaat worden, en dat is meer
machinerie dan een grijze regel onder een zoekresultaat waard is.

### `GET /api/app/v1/media` en `/media/[slug]`

Albums (uit Immich, en nergens anders), aftermovies en de magazines. Een foto
komt in twee maten: een thumbnail en een schermklare versie. Het **origineel**
zit er bewust niet bij; dat zijn bestanden van tien megabyte en meer, en op
mobiele data is dat een galerij die niet laadt.

Valt Immich weg, dan blijft de albumlijst leeg en gaan de aftermovies en
magazines gewoon door; die staan er los van.

### `GET /api/app/v1/praesidium`

Het praesidium per werkingsjaar. De jarenlijst komt uit de data zelf en niet uit
`workingYearTabs()`: die klemt op `FIRST_WORKING_YEAR`, en de historiek gaat
verder terug. Inactieve (afgestudeerde) leden horen erbij; tombstones van
verwijderde accounts (`deletedAt`) niet.

### `GET /api/app/v1/shiften`

Waar je voor ingeschreven staat en waar je nog op kan, in één aanvraag.

**In- en uitschrijven loopt hier niet langs.** Dat gaat naar het bestaande
`/api/shift/register?id=`, en dat is geen gemakzucht: die route bewaakt
overlappende shiften en de 24-uursgrens, en ze duwt een cursusdienst-shift door
naar cudi. Een tweede implementatie zou betekenen dat een uitschrijving in de app
op cudi kan blijven staan.

`canUnregister` is de uitkomst van de 24-uursgrens plus de bedenktijd, berekend
op de server zodat de app die twee regels niet nabouwt. De twee constanten staan
wel op twee plaatsen; het ergste dat een verschil oplevert is een knop die de
server weigert, en dat is een melding en geen fout in de data.

### `GET /api/app/v1/werkgroepen` en `/pocs`

De werkgroepen per werkingsjaar, en alle POC's. De jarenlijst van de werkgroepen
loopt wél via `workingYearTabs()`, anders dan bij het praesidium: werkgroepen
bestaan pas sinds `FIRST_WORKING_YEAR`, dus die klem doet daar geen kwaad.

## Pushberichten versturen

`lib/app-api/push.ts`, over Expo's push-dienst en niet rechtstreeks over APNs en
FCM. Rechtstreeks zou een Apple-certificaat en een Google-servicesleutel op onze
server betekenen, allebei met een vervaldatum en een eigen manier om stil te
breken.

- `sendPushToUsers(userIds, message)` **gooit niet.** Een pushbericht is nooit de
  kern van wat de beller aan het doen was; een bestelling mag niet mislukken
  omdat Expo even onbereikbaar is.
- Een token dat Expo als `DeviceNotRegistered` afkeurt, wordt meteen gewist. Dat
  is het enige moment waarop we horen dat de app van een toestel verdwenen is.
- `pruneStalePushDevices()` ruimt toestellen op die maanden niet meer opstartten.
De automatische berichten staan in `lib/app-api/notifications.ts`. **Wanneer een
bericht gerechtvaardigd is, is een kringkeuze**; ze staat in
`docs/design-decisions.md`, sectie "Wanneer de app een pushbericht stuurt".

Vier vertrekken uit `POST /api/app/v1/push/maintenance` (worker,
`APP_PUSH_MAINTENANCE_SECRET`):

| bericht | markering | wanneer |
|---|---|---|
| Je broodje ligt klaar | `TheokotOrder.pickupPushedAt` | de afhaal begint |
| De broodjes staan open | `TheokotSession.orderOpenPushedAt` | het bestelvenster opent |
| Nieuw in wat je volgt | `CalendarEvent.announcedPushAt` | een evenement bijkomt in een gevolgde categorie |
| Herinnering aan wat je aanduidde | `CalendarEventInterest.remindedAt` | een dag voor het evenement |

Daarnaast vertrekt **de shift-herinnering** uit `processDueShiftReminders`, binnen
dezelfde claim als de mail; twee wekkers voor één herinnering lopen vroeg of laat
uit elkaar. **Met de hand** kan het via Admin -> Pushberichten, achter het recht
`app.push`; elke verzending komt in het logboek met de tekst erbij.

Alle automatische berichten claimen eerst en versturen dan: de markering gaat om
in een voorwaardelijke `updateMany`, en enkel wie die wint verstuurt. Een mislukte
verzending zet de markering niet terug. Iemand twee keer wakker maken voor
hetzelfde broodje is erger dan het één keer missen.

Drie dingen die bij die vier horen en makkelijk vergeten worden:

- **De claim valt vóór de voorkeurscontrole.** Zou hij erna vallen, dan blijft de
  markering leeg voor wie dat soort bericht uitgezet heeft, en kondigt de volgende
  beurt hetzelfde broodje alsnog aan zodra hij het weer aanzet.
- **"Nieuw in wat je volgt" kijkt enkel naar wat de laatste 24 uur gepubliceerd
  is.** Zonder die grens zou de eerste beurt na het uitrollen de volledige
  kalendergeschiedenis aankondigen, want die evenementen dragen allemaal nog geen
  markering.
- **De doelgroepfilter geldt ook voor push.** Een eerstejaarsevent hoort niet op
  de telefoon van iemand uit de master, ook niet wanneer die de categorie volgt.
  Een pushbericht heeft geen `where` op een lezer, dus dat gebeurt expliciet.

### `GET /api/app/v1/piano` en `POST`/`DELETE /piano/reservatie`

De pianoagenda en het reserveren. De logica staat in
`lib/piano-reservations.ts`, gedeeld met de server-actions. De belangrijkste
regel daar: **de starttijd wordt niet vertrouwd** maar moet terugkomen uit
dezelfde slotberekening die het scherm tekende, anders zou een zelfgemaakte
aanvraag om het even welk uur kunnen boeken.

De agenda vraagt een login en draagt de namen van wie een slot heeft, net als op
de site: dat is er met opzet, zodat je weet met wie je kan ruilen.

## `APP_MINIMUM_VERSION`

Optionele omgevingsvariabele, `major.minor.patch`. Staat een geïnstalleerde app
eronder, dan toont ze een bijwerkscherm in plaats van schermen die stuk kunnen
zijn. Bewust geen `Setting` met een beheerscherm: dit hoort bij een release van de
server, en een verkeerd getikte waarde in een adminveld zet iedereen buiten.
Verhoog het enkel wanneer een oudere app echt niet meer werkt, niet bij elke
release. Niet gezet of onzinnig ingevuld betekent `1.0.0`, en dus niemand buiten.

### `GET /api/app/v1/studeren`

Het volledige studeerscherm in één antwoord: je lopende sessie, je dagtotaal, je
week, je reeks, de vakken die je eerder intikte, en al je blokgroepen met hun
leden. Bewust niet opgesplitst: het is één scherm, en twee aanvragen zouden
betekenen dat de helft ervan ververst terwijl de andere helft achterloopt.

De app haalt dit ook op terwijl er niets verandert, want de zaal moet leven. Bij
een lopende sessie gebeurt dat via het levensteken hieronder; anders elke drie
kwartier zolang het scherm openstaat.

### `POST`/`PATCH`/`DELETE /api/app/v1/studeren/sessie`

Gaan zitten, pauzeren of hervatten, opstaan. Alle drie geven het volledige
overzicht terug, zodat de app na een tik niets extra hoeft op te halen.

- `POST` met `{ subject?, subjectHidden? }` start. Loopt er al een sessie, dan
  gebeurt er niets en krijg je die terug: twee keer op de knop hoort geen tweede
  sessie te maken.
- `PATCH` met `{ action: "pause" | "resume" | "heartbeat" }`. Het levensteken is
  geen beleefdheid maar meting: blijft het weg, dan telt de server de sessie tot
  het laatste moment waarop hij wist dat ze liep.
- `DELETE` sluit af en geeft `{ finishedSeconds, subject, overview }`.

Het rekenwerk staat in `lib/app-api/study.ts`; de regels erachter (pauzemarge,
maximumduur, aan welke dag een sessie toebehoort) staan in
`docs/design-decisions.md`.

### `POST /api/app/v1/studeren/groepen` en `/groepen/deelnemen`

Een groep maken (`{ name }`) of erbij komen met een code (`{ code }`). Allebei
geven ze `{ groupId, overview }`. Een onbekende of verkeerd overgetikte code geeft
`NOT_FOUND`; er wordt niet gegokt welk teken je bedoelde.

Foutcodes: `NOT_FOUND`, `GROUP_FULL`, `TOO_MANY_GROUPS`, `INVALID_NAME`.

### `PATCH`/`DELETE /api/app/v1/studeren/groepen/[id]`

Hernoemen of het groepsdoel zetten (enkel wie de groep maakte, anders
`NOT_OWNER`), en vertrekken. `DELETE` zonder parameters laat jezelf vertrekken;
`?lid=<userId>` zet iemand anders eruit en kan enkel de eigenaar.

### `PATCH /api/app/v1/studeren/doel`

`{ dailyGoalMinutes }`. Bepaalt wat de reeks telt en wanneer een dag "gehaald" is.
