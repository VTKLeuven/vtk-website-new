# Werkplan: cantus-check-in met studentenkaart en kleur per tickettype

Aanleiding: aan een cantus moet iedereen snel binnen, is er weinig bereik, en
moet de deurploeg meteen zien welk drankticket iemand heeft (water, bier of
eigen drank). De vraag is dus twee dingen tegelijk: **aanmelden met de
studentenkaart** en **de uitkomst kleuren per tickettype**.

Technische kaart van de module: `docs/ticketing.md`.
Kaartlezing: `apps/web/lib/student-card.ts`, `apps/web/lib/kul-card.ts`.
Rechten: `docs/permissions.md`.
Productkeuzes die hieruit volgen: `docs/design-decisions.md`.

## Hoe je dit gebruikt

1. Kies een fase en geef die in plan-modus. Elke fase is zelfstandig leesbaar.
2. Fase 0 zijn kringkeuzes en moet beslist zijn voor fase 3 en verder start.
3. Taken met **🗄️** vragen een Prisma-migratie.
4. Taken met **📝** vragen een sectie in `docs/design-decisions.md`.
5. Fase 1 en 2 (kleur) leveren op zichzelf al waarde en hangen niet af van de
   kaartlezer; fase 3 tot 6 vormen samen de kaart-check-in.

## Statusoverzicht

| Fase | Inhoud | Zwaarte | Hangt af van |
| --- | --- | --- | --- |
| 0 | Kringkeuzes vastleggen | klein | - |
| 1 | Kleur per tickettype in de databank en de admin | klein 🗄️ | 0 |
| 2 | Kleur tonen in scanner, deelnemerslijst en ticket | midden | 1 |
| 3 | R-nummer per deelnemer verzamelen bij aankoop | midden 🗄️ | 0 |
| 4 | Kaartcheck-in online | midden | 3 |
| 5 | Kaartcheck-in offline (manifest + wachtrij) | groot | 4 |
| 6 | Kaartlezer-invoer in de scanner-app | midden | 4 |
| 7 | Tests, documentatie en droogloop | midden | 5, 6 |

---

## Wat er vandaag al bestaat

Dit is het belangrijkste deel van het antwoord: het meeste is er al, en het
ontbrekende stuk is precies één ding.

### Ticketing en scannen (compleet)

- `/scan/<eventId>` is een installeerbare scanner-app (`ScannerApp.tsx`, 833
  regels) met camera, handmatige code, en een **Op naam**-lijst.
- **Offline scannen werkt al.** Bij het laden haalt het toestel een *manifest*
  op: de lijst geldige tickets (`code`, `version`, `checkedIn`, `name`, `type`)
  tot 5000 stuks. Valt het netwerk weg, dan beslist het toestel zelf
  (`verifyOffline` in `scanner/offline.ts`) en gaat de scan in een wachtrij in
  localStorage. Bij verbinding wordt die in blokken van honderd naar
  `scan/batch` gestuurd.
- Elke scan draagt een `clientScanId` met een unieke index op `TicketScanLog`,
  dus opnieuw versturen is veilig en dubbels komen bij het synchroniseren boven
  als `ALREADY_USED`.
- De check-in zelf is een race-vrije `UPDATE ... WHERE checkedInAt IS NULL` in
  een transactie (`scanTicket` in `lib/ticketing/scanner.ts`).
- Terugdraaien, gates, scantoestellen, statistieken en een scanlogboek bestaan.

**Gevolg: de "weinig bereik"-helft van de vraag is al opgelost.** De cantus
hoeft daar niets nieuws voor.

### Studentenkaart lezen (compleet, maar niet gekoppeld aan tickets)

- `parseScannedCard` / `resolveStudentCard` in `apps/web/lib/student-card.ts`
  zetten de ruwe scan (`serial;cardAppId`) om naar een r-nummer.
- `StudentCard` in de databank is de cache: na één geslaagde verificatie is er
  geen KU Leuven-call meer nodig. Dat houdt de lezers werkend wanneer
  `account.kuleuven.be` er even uit ligt.
- `verifyStudentCard` in `apps/web/lib/kul-card.ts` doet de eigenlijke
  KU Leuven-call (`client_credentials` → `idverification`).
- Drie plekken gebruiken dit al: de deur (`/api/door/scan`), de bar
  (`/api/fakscanner/scan`) en de Theokot-afhaalbalie
  (`components/theokot/PickupCounter.tsx`).
- `User.rNumber` is `@unique`, dus r-nummer → account is één query.

### Het patroon "kaartlezer in een browser" (compleet)

`PickupCounter.tsx` is het bestaande voorbeeld: de lezer gedraagt zich als een
toetsenbord, "typt" `serial;cardAppId` en drukt Enter. De component vangt zowel
een Enter als een geïnjecteerde newline op, heeft een `busyRef` tegen dubbel
zoeken, en geeft de focus meteen terug aan het veld. Dat patroon kopiëren we,
niet opnieuw uitvinden.

### Kleur (deels)

- De scanner kleurt vandaag de **uitkomst**: `.scanner-feedback.is-accepted`
  groen, `is-duplicate` oranje, `is-rejected`/`is-error` rood
  (`app/design/vtk-tickets.css`).
- Het **tickettype** heeft geen kleur. `TicketType` heeft wel al `code`,
  `nameNl`, `sortOrder` en een eigen inventarispool, dus water/bier/eigen drank
  zijn nu al drie gewone tickettypes; enkel het kleurveld ontbreekt.
- Het ticketontwerp (`lib/ticketing/design.ts`) heeft `backgroundColor`,
  `accentColor` en `textColor` per event, niet per type.
- `DashboardTile.color` is het bestaande patroon voor "key in een palet" in
  plaats van een vrije hexwaarde.

### Wat er echt ontbreekt

**Er bestaat geen enkele koppeling tussen een ticket en een r-nummer.** Een
`Ticket` hangt aan een `TicketOrderItem` met enkel `attendeeName` en
`attendeeEmail`; de koper kan een account hebben (`TicketOrder.buyerUserId`),
maar de deelnemer niet. Een gescande kaart geeft dus wel een r-nummer, maar dat
r-nummer leidt vandaag nergens naartoe. Dat is de kern van fase 3.

Daarnaast ontbreekt: kleur per tickettype (fase 1 en 2), een invoerkanaal voor
de lezer in de scanner-app (fase 6), en de kaartgegevens in het offline-manifest
(fase 5).

---

## Fase 0: kringkeuzes 📝

Deze vier vragen bepalen de rest. Ze zijn geen technisch detail.

**B1. Is het r-nummer verplicht bij aankoop van een cantusticket?**
Aanbevolen: **verplicht per deelnemer wanneer de organisator kaartcheck-in
aanzet**, met de naam en het r-nummer van de eigen account voorgevuld wanneer
de koper ingelogd is. Zonder r-nummer is er geen kaartcheck-in mogelijk voor dat
ticket; die persoon gaat dan via de QR of de naamlijst binnen. Dat is geen
uitzondering die we moeten wegwerken, het is de vangnetweg die er al is.

**B2. Wat met wie geen KU Leuven-kaart heeft?**
Externen, uitwisselingsstudenten, iemand die zijn kaart vergeten is. De QR en
de naamlijst blijven volwaardig; de kaart is een snelweg, geen enige weg. Zeg
dat expliciet in de communicatie, anders staat er iemand voor niets aan te
schuiven.

**B3. Kleurt de kaart de uitkomst of het tickettype?**
Aanbevolen: **beide, in die volgorde.** Zie fase 2 voor de uitwerking. Een
geweigerd bierticket mag nooit geel oplichten, want dan laat de deurploeg hem
binnen.

**B4. Mag het r-nummer van een deelnemer bewaard worden?**
Het is een persoonsgegeven. Aanbevolen: bewaren op `TicketOrderItem`, mee
verwijderen wanneer het event gearchiveerd wordt, en **nooit ruw in het
manifest op een telefoon** (zie fase 5). Neem dit op in
`docs/privacy-processors.md`.

---

## Fase 1: kleur per tickettype 🗄️

**T1.1** Voeg `color String @default("navy")` toe aan `TicketType` in
`packages/db/prisma/schema.prisma`, met een migratie. Een palet-key, geen vrije
hexwaarde, net zoals `DashboardTile.color`. Een redacteur die zelf hex kiest,
kiest vroeg of laat iets dat in het donker onleesbaar is.

**T1.2** Definieer het palet op één plek, bijvoorbeeld
`apps/web/lib/ticketing/ticketColors.ts`: een handvol keys (`blue`, `amber`,
`violet`, `green`, `rose`, `slate`, `navy`) met per key een achtergrond en een
tekstkleur die daarop contrasteert. Zet de tokens in `vtk-tickets.css` als
CSS-variabelen; componenten verwijzen naar de tokens, nooit naar ruwe hexes
(conventie uit `CLAUDE.md`).

**T1.3** Kleurkiezer in `components/ticketing/admin/TicketTypeManager.tsx`: een
rij gekleurde radio-knoppen naast naam en prijs. De uitkomst is een `SaveState`
via `SaveForm`, met een toast.

**T1.4 (optioneel)** Sjabloon "Cantus" bij `/admin/tickets/new`: maakt meteen
drie tickettypes aan (`WATER` blauw, `BIER` amber, `EIGEN` violet) in één
inventarispool. Klein, maar het scheelt elke praeses drie formulieren en zorgt
dat de kleuren over events heen dezelfde betekenis houden.

---

## Fase 2: kleur tonen

**T2.1** Neem de kleur mee in het manifest en in het scan-antwoord. In
`lib/ticketing/scanner.ts`: `ticketDto` krijgt `typeColor`, de manifest-select
haalt `orderItem.ticketType.color` op, en `ScannerManifestEntry` in
`scanner/types.ts` krijgt `typeColor`. Let op: het manifest is er ook voor
offline, dus de kleur moet er *in* zitten en mag niet apart opgehaald worden.

**T2.2** Het feedbackvlak in `ScannerApp.tsx`. De voorgestelde werking:

- **Aanvaard**: het volledige vlak krijgt de kleur van het tickettype, met de
  naam van het type in grote kapitalen (`BIER`) en een groen vinkje in de hoek.
  De tapper leest de kleur van drie meter, de deurploeg leest het vinkje.
- **Dubbel** (oranje) en **geweigerd** (rood) overrulen de typekleur volledig.
  Dat is de belangrijkste regel van het hele scherm.
- Nooit kleur alleen. De naam van het type staat er altijd bij, in tekst. Een
  op de twaalf mannen ziet rood en groen niet uit elkaar, en aan een cantus staat
  die persoon even goed aan de deur als in de rij.

**T2.3** Zelfde kleur in de **Op naam**-lijst (een gekleurde rand of pil per rij)
en in de scangeschiedenis, zodat de kleurcode overal hetzelfde betekent.

**T2.4 (optioneel)** Kleur op het ticket zelf: een gekleurde balk in de PDF
(`lib/ticketing/pdf.ts`) en in de wallet-pass. Handig wanneer de rij zo lang is
dat iemand vooraan al kan sorteren.

---

## Fase 3: r-nummer per deelnemer 🗄️

Dit is het ontbrekende schakeltje.

**T3.1** Schema:
- `TicketEvent.cardCheckIn Boolean @default(false)`: zet de kaartcheck-in aan
  voor dit event. Een echte kolom en niet iets in `settings`, want zowel de
  bootstrap als de scanquery kijkt ernaar.
- `TicketOrderItem.rNumber String?`, genormaliseerd naar kleine letters, met een
  index op `(eventId, rNumber)`.

**T3.2** Verzamelen bij aankoop, in `components/ticketing/public/TicketShop.tsx`
en het zod-schema in `lib/ticketing/orders.ts` (rond regel 45). Wanneer
`cardCheckIn` aan staat, krijgt elke deelnemer een verplicht veld r-nummer,
gevalideerd op `/^[ru]\d{7}$/i`. Voor de ingelogde koper wordt het eigen
`User.rNumber` voorgevuld. Een dubbel r-nummer binnen hetzelfde event is een
**verwachte invoerfout**: die geef je terug als foutcode, je gooit hem niet
(conventie uit `CLAUDE.md`).

**T3.3** Corrigeerbaar in de admin. Iemand tikt zijn nummer verkeerd in, en dat
merk je pas aan de deur. Voeg een bewerkbaar r-nummer toe aan de
deelnemerslijst (`/admin/tickets/[eventId]/deelnemers`), zodat een ploeg met
bereik het ter plaatse rechtzet.

---

## Fase 4: kaartcheck-in online

**T4.1** Trek in `lib/ticketing/scanner.ts` het stuk "van invoer naar ticket"
uit `scanTicket`. Vandaag zit dat verweven met de credential-verificatie
(`extractTicketCredential` → `verifyTicketCredential` → `publicCode`). Maak er
drie bronnen van die allemaal in dezelfde transactie en hetzelfde scanlogboek
uitkomen: een ondertekende QR, een handmatige code, en nu een kaart.

**T4.2** Nieuw endpoint `POST /api/tickets/events/[eventId]/scan/card`. Het
verloop:

```
serial;cardAppId
  -> resolveStudentCard()        (eigen kaarttabel, anders KU Leuven)
  -> rNumber
  -> TicketOrderItem waar eventId + rNumber matcht, met een geldig Ticket
  -> publicCode
  -> exact dezelfde check-in-transactie als een QR-scan
```

Alles na de derde regel is bestaande code. De eerste drie regels bestaan ook al,
alleen niet in deze volgorde.

**T4.3** Nieuwe uitkomsten voor het scanlogboek. `TicketScanResult` heeft
vandaag `ACCEPTED | ALREADY_USED | WRONG_EVENT | INVALID | VOID | REFUNDED |
EXPIRED | REVERSED`. Een kaart die wel gelezen wordt maar bij geen enkel ticket
hoort, is geen `INVALID` ticket; dat verschil moet je aan de deur kunnen zien.
Voorstel: hergebruik `INVALID` als resultaat en zet de reden in het bestaande
`TicketScanLog.metadata` (`{ via: "CARD", reason: "NO_TICKET" }`), zodat er geen
migratie op de enum nodig is. Zet `via: "CARD"` op elke kaartscan, ook op de
geslaagde; anders kan je achteraf niet zien hoe snel de kaartweg eigenlijk was.

**T4.4** Rechten: geen nieuwe permissie. `SCAN` (via een `OWNER`/`MANAGER`/
`SCANNER`-grant) dekt dit, en het endpoint gaat door dezelfde
`requireTicketEventCapability`.

---

## Fase 5: kaartcheck-in offline

De moeilijkste fase, en de reden waarom fase 4 eerst apart moet werken.

**Het probleem.** Offline kan het toestel geen `resolveStudentCard` doen: dat is
een databankquery en eventueel een KU Leuven-call. De kaart moet dus lokaal naar
een ticket te herleiden zijn, en dat betekent dat de koppeling kaart → r-nummer →
ticket in het manifest moet zitten. Ruwe r-nummers en kaartserials op een
telefoon die aan een cantusdeur ligt, is precies wat we niet willen.

**Voorstel.** Het manifest krijgt een event-specifieke salt en twee gehashte
lijsten:

- per ticket: `rHash = sha256(salt + rNumber)` naast de bestaande `code`;
- een kaartmap: `sha256(salt + serial + ";" + cardAppId)` → `rHash`, opgebouwd
  uit de `StudentCard`-rijen waarvan het r-nummer in de deelnemerslijst van dit
  event zit.

Het toestel hasht de gescande kaart, zoekt in de map, krijgt `rHash`, vindt het
ticket, en zet vervolgens gewoon de **publieke ticketcode** in de bestaande
wachtrij. De wachtrij, de dedup op `clientScanId` en `scan/batch` blijven dus
onveranderd; alleen `metadata.via = "CARD"` komt erbij. Dat is de reden om het
zo te doen: de hele offline-machinerie hoeft niet aangeraakt.

**Wees eerlijk over wat dit is.** De salt zit in hetzelfde bestand als de
hashes, dus dit is pseudonimisering, geen geheimhouding: wie de telefoon uitleest
én de kaart van iemand fysiek heeft, kan koppelen. Wat het wel doet, is voorkomen
dat een gestolen of geleende telefoon zomaar een leesbare lijst r-nummers
oplevert. Dat is dezelfde afweging als de bestaande keuze om de
handtekeningcontrole niet op het toestel te doen, en ze hoort in
`docs/ticketing.md` te staan naast die uitleg.

**Grenzen die je moet noemen.**
- Een kaart die nog nooit ergens gescand is (deur, bar, Theokot), staat niet in
  de `StudentCard`-tabel en werkt dus **offline niet**. Het toestel toont dan
  "Kaart niet gekend, zoek op naam"; de naamlijst is er al.
- Zet de kaartmap onder dezelfde `MANIFEST_LIMIT`-logica als de ticketlijst. Bij
  1500 deelnemers is dit een paar tientallen kilobyte extra, ruim binnen de
  localStorage-grens die `offline.ts` al beschrijft.
- Ververs het manifest vlak voor de deur opengaat, op een plek met bereik.

---

## Fase 6: de kaartlezer in de scanner-app

**T6.1** Hardware: een **USB- of Bluetooth-kaartlezer die zich als toetsenbord
gedraagt**, in een telefoon via OTG of in een laptop of tablet aan de deur. Dat
is dezelfde soort lezer als aan de Theokot-balie en de bar.

**Web NFC is geen alternatief, en dat is het spaarzaamste dat je hier kan weten.**
De KU Leuven-kaart is een MIFARE DESFire; de Web NFC-API van Chrome leest enkel
NDEF-berichten en geeft je geen `serial;cardAppId`. Op iOS bestaat Web NFC
sowieso niet. Een lezer die als toetsenbord tikt, is niet de goedkope oplossing,
het is de enige die in een browser werkt.

**T6.2** Voeg in `ScannerApp.tsx` een altijd-gefocust, visueel verborgen
invoerveld toe wanneer de kaartmodus aanstaat, met exact het patroon van
`PickupCounter.run()`: newline én Enter afvangen, een `busyRef` tegen dubbel
verwerken, en de focus teruggeven via `requestAnimationFrame`. Een scan met een
`;` erin is een kaart; al de rest blijft een ticketcode. Dat onderscheid maakt
`PickupCounter` vandaag al op precies dezelfde manier.

**T6.3** Een knop **Kaartlezer** naast Camera, Handmatig en Op naam, met de
toestand bewaard in localStorage per toestel. Aan een deur met een lezer wil je
de camera uit; aan een deur zonder lezer wil je dit veld niet dat elke toetsaanslag
opslokt.

**T6.4** Doorlooptijd. Een kaartscan is offline puur lokaal, dus sneller dan een
QR: geen camera die moet scherpstellen, geen netwerk. Online, met een kaart die
nog niet in `StudentCard` staat, zit er wel een KU Leuven-call tussen. Toon in
dat geval een wachtindicator en laat de deurploeg door kunnen scannen; niets in
dit ontwerp vraagt dat de scans na elkaar gebeuren.

---

## Fase 7: tests, documentatie en droogloop

**T7.1** Unittests bij `apps/web/test/`: het offline kaartoordeel (gekende kaart,
onbekende kaart, kaart zonder ticket, dubbel), de r-nummer-validatie en het
weigeren van een dubbel r-nummer binnen een event.

**T7.2** Integratietest bij `apps/web/test/integration/ticketing-db.integration.ts`:
kaartscan → check-in → tweede kaartscan geeft `ALREADY_USED`, en een offline
wachtrij die halverwege afbreekt en opnieuw verstuurd wordt.

**T7.3** Documentatie: een sectie **Kaartcheck-in** in `docs/ticketing.md`
(naast "Offline scannen"), de kringkeuzes uit fase 0 in
`docs/design-decisions.md`, en het bewaren van r-nummers in
`docs/privacy-processors.md`.

**T7.4 Droogloop, en sla die niet over.** Test met tien mensen en een echte
lezer, met de wifi uit, voor je dit aan een cantus met driehonderd man hangt.
Waar dit misloopt is niet de code maar de rij: één kaart die niet gelezen wordt
en waar niemand weet wat dan, kost meer tijd dan het hele systeem wint.

---

## Wat we bewust niet bouwen

- **Zelf de kaart uitlezen in de browser via NFC.** Zie T6.1.
- **Kaarten koppelen aan de deur.** Een onbekende kaart ter plaatse aan een
  r-nummer koppelen vraagt een KU Leuven-call, dus bereik, dus precies wat er
  niet is. De naamlijst is daar het antwoord.
- **Een eigen Pi aan de cantusdeur.** De bestaande Pi-agents
  (`infra/door/vtk_door_agent.py`, `scripts/fakscanner/`) praten met een server.
  Aan een deur zonder bereik zou die Pi zijn eigen offline-laag nodig hebben,
  terwijl de scanner-app die al heeft.
- **Kleur als enige signaal.** Zie T2.2.
