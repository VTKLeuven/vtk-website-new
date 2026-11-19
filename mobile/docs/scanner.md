# De scanner aan de deur

Tickets scannen aan de ingang van een evenement. Tot november 2026 was dit een
aparte app, **vtk-scanner-app**; die zit nu volledig in de VTK-app en dezelfde
code draait hier. De repo van de oude app staat enkel nog als archief.

## Wie ziet hem, en waar

De scanner aan de deur bestaat enkel voor wie iets te scannen heeft. De server
zegt dat in `abilities.scanTickets` (`apps/web/lib/app-api/abilities.ts`), en dat
volgt precies de lijst van `/api/app/v1/scan/events`: is die leeg, dan is er
geen knop. Een gewone student ziet de scanner dus niet.

Wie hem wel ziet:

- **elke praesidiumpost**, voor elk event, door de standaardregel
  (`TicketEvent.openScanning`), en een werkgroep voor haar eigen events;
- **wie als scanner toegevoegd is**: via de rollende uitnodigings-QR of op naam
  in het scannerspaneel. Zo komt een gewone student die komt shiften erbij.

Waar hij staat:

| Ingang | Voor wie | Opent |
|---|---|---|
| het scanicoon in de kop van **Tickets** | `scanTickets` | `deur.tsx` |
| **Meer → Aan de deur** | `scanTickets` | `deur.tsx` |
| een taak op **Home**, "Aan de deur: ..." | wie een `SCANNER`-toekenning heeft op een event dat binnen 24 uur begint | de scanner zelf |
| **Meer → Code scannen** | iedereen die ingelogd is | de camera voor de uitnodiging, de fakbar en de pas |

`Code scannen` (`scannen.tsx`) blijft voor iedereen, want de fakbar-QR en de
uitnodiging scant een gewone student zelf. Een ticket dat daar gescand wordt,
telt niet mee; het scherm verwijst naar Aan de deur.

Na een uitnodiging haalt de app de bootstrap opnieuw op, zodat `scanTickets`
meteen klopt en het icoon in Tickets verschijnt. Twaalf uur na het event valt het
event uit de lijst, en met het laatste event ook de knop.

## Hoe het in elkaar zit

```
deur.tsx  ──▶  /scan/<eventId>  (app/scan/[eventId].tsx, fullScreenModal)
                  │
                  └─ src/screens/scan/[eventId].tsx   tekent
                       └─ src/scanner/useScanner.ts   beslist alles
                            ├─ src/api/scanner.ts     de routes van de webscanner
                            ├─ src/scanner/offline.ts het offline oordeel
                            ├─ src/scanner/storage.ts manifest + wachtrij (SQLite)
                            └─ src/scanner/ids.ts     clientScanId, toestel-id
```

- **Het scherm ligt aan de wortel**, als `fullScreenModal` boven de tabbalk, en
  niet in een tab. Een tabbalk is aan een deur een rij knoppen waar je per ongeluk
  op tikt, en een veeg naar beneden mag de camera niet sluiten
  (`gestureEnabled: false`). Dicht gaat met het kruis.
- **Het is het enige donkere scherm van de app.** Het palet staat in de tokens als
  `SCANNER` en `TICKET_COLORS` en komt van de webscanner
  (`apps/web/app/design/vtk-tickets.css` en `vtk-ticket-colors.css`).
- **De scanner praat met de routes van de webscanner** (`/api/tickets/...`) en niet
  met `/app/v1`, net zoals afrekenen dat doet: daar zit de hele beoordeling en het
  scanlogboek. Enkel de lijst van events komt uit de app-API, want die draagt de
  stand per event al mee.

| Endpoint | Wanneer |
|---|---|
| `GET /api/app/v1/scan/events` | het keuzescherm Aan de deur |
| `GET /api/tickets/events/{id}/scanner/bootstrap` | bij het openen van een event: ingangen, stand, manifest |
| `POST /api/tickets/events/{id}/scan` | één scan, online |
| `POST /api/tickets/events/{id}/scan/batch` | de wachtrij leegmaken, max 100 per keer |
| `POST /api/tickets/events/{id}/scan/card` | inchecken met een studentenkaart |
| `POST /api/tickets/events/{id}/scan/reverse` | een check-in terugdraaien |
| `/api/tickets/events/{id}/scanners`, `.../scanners/invite`, `.../users/search` | het scannerspaneel |

Het contract staat in `docs/ticketing.md`. Eén regel draagt alles:
**`clientScanId` is de idempotentiesleutel.** `TicketScanLog.clientScanId` is
uniek, dus opnieuw versturen kan altijd en een synchronisatie die halverwege
afbreekt, mag gewoon opnieuw beginnen.

## Native modules, en waarom dat bestand apart staat

De scanner bracht drie native modules mee: `expo-crypto` (ids en de kaarthash),
`expo-haptics` (trillen bij een oordeel) en `expo-network` (online of niet).
`expo-keep-awake` zat al in elke build, want `expo` zelf hangt ervan af. Alle vier
zitten in Expo Go.

Een route laadt pas wanneer het scherm opent (expo-router geeft React Navigation
een `getComponent`). Een APK van vóór de scanner die deze JavaScript via
`eas update` krijgt, valt daarom enkel om op het scanscherm, en niet bij de start,
**zolang niets dat bij de start laadt een van die modules importeert**. Daarom:

- `src/scanner/storage.ts` gebruikt enkel SQLite. Het wordt ook bij het uitloggen
  geladen (`auth/session.ts` wist de manifesten).
- `src/scanner/ids.ts` draagt `expo-crypto` en wordt enkel door de scanner geladen.
- `deur.tsx` leest de wachtrij uit `storage.ts`, niet uit `useScanner`.

Toch geldt de gewone regel: **bouw een nieuwe APK voor je deze update publiceert**,
en vraag om de vorige te vervangen.

## Offline scannen

Een deur zonder bereik is de regel, niet de uitzondering: een kelder, een tent,
een hal aan de andere kant van de campus. De scanner werkt daar gewoon door.

Bij het openen van een event haalt het toestel een **manifest** op: de lijst
geldige tickets van dat event (`code`, `version`, `checkedIn`, naam, type,
typekleur). Valt het netwerk weg, dan beslist het toestel daarmee zelf en gaat de
scan in een **wachtrij**. Zodra er weer verbinding is, vertrekt die wachtrij in
blokken van honderd naar `scan/batch`, en daarna om de twintig seconden opnieuw.

Manifest en wachtrij staan in SQLite (`vtk_scanner.db`), in een eigen bestand en
niet bij de leescache: die leegmaken (andere server, uitloggen) mag nooit een
scan meenemen die nog naar de server moet.

### Waarom geen handtekeningcontrole op het toestel

De QR is een HMAC-token. Dat op het toestel verifiëren vraagt
`TICKETING_TOKEN_SECRET`, en wie die telefoon uitleest, kan dan zelf tickets maken.
Offline controleren we dus op **lidmaatschap van het manifest plus het
versienummer**.

Gevolg: wie een geldige code van iemand anders kent, geraakt offline binnen. Dat
komt bij het synchroniseren alsnog boven, want de server doet de volledige
controle en meldt de tweede scan als `ALREADY_USED`. De app toont die gevallen in
een balk die blijft staan tot iemand ze wegklikt. Ook een offline **geweigerde**
scan gaat mee naar de server, zodat het scanlogboek compleet blijft.

### De namen op het toestel

Het manifest draagt de naam van elke deelnemer, en deze app staat ook op de
telefoon van wie één avond kwam helpen. Daarom:

- een manifest blijft hoogstens **twee dagen** liggen (bij het opstarten van de
  app opgeruimd); wie het event opnieuw opent, haalt een vers op;
- **uitloggen wist elk manifest**;
- de **wachtrij blijft** bij het uitloggen staan: daar zitten scans in die aan de
  deur echt gebeurd zijn. Ze vertrekken wanneer iemand met scanrechten dat event
  weer opent.

Voor een gastenlijst die niet bij het hele praesidium hoort, zet je op de site de
standaard scantoegang van dat event uit; zie "Wie mag scannen aan de deur" in
`docs/design-decisions.md`.

### Grenzen

- Boven de **5000 geldige tickets** stuurt de server geen manifest
  (`MANIFEST_LIMIT`). Het toestel scant dan enkel online; met een halve lijst zou
  het geldige tickets weigeren.
- Dubbels **aan dezelfde deur** worden offline herkend, dubbels **tussen deuren**
  pas bij het synchroniseren.

### De studentenkaart offline

Staat `TicketEvent.cardCheckIn` aan, dan draagt het manifest een tabel
`gehashte kaart -> ticketcode`, plus de salt waarmee ze gehasht is. Het toestel
zoekt de kaart daarin op en gaat vanaf de gevonden ticketcode door de gewone
offline-weg.

Het hashformaat staat in `src/scanner/cardHash.ts` en moet **letterlijk** gelijk
blijven aan `apps/web/lib/ticketing/cardHash.ts`. Loopt dat uiteen, dan vindt de
app offline geen enkele kaart meer, en dat faalt stil.

## Het scannerspaneel

Wie `MANAGE_SCANNERS` heeft (de organisatoren), ziet in de kop van de scanner een
knop om mensen toe te voegen: zoeken op naam, e-mail of r-nummer, of een **QR
tonen** die de ander scant onder Meer → Code scannen, of met de gewone camera. Die
QR rolt: het token leeft dertig seconden en het paneel haalt om de twintig
seconden een nieuwe op, zodat een screenshot niets meer doet.

Het paneel werkt enkel online: iemand toegang geven is geen deurbeslissing die je
in een wachtrij wil laten wachten. Het kan enkel de rol `SCANNER` geven en
weghalen. Dat is ook waarom dit geen admin is in de zin van regel 3 in
`AGENTS.md`: het is de vraag "Jan komt bijspringen, zet hem erbij", aan de deur.
