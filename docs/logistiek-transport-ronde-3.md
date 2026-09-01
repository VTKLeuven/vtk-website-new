# Werkplan: transportronde 3 (semester 2026-2027)

Bron: het overleg met Logistiek van 31 augustus 2026. Het team gaat dit semester
met de **transportkant** van `apps/logistiek` werken; materiaal, flesserke en
evenementen staan open voor praesidium en werkgroepen om naast hun Excels te
testen. Een gewone externe student kan voorlopig niets indienen.

Dit document bouwt voort op `docs/logistiek-feedback-plan.md` (ronde 1) en
`docs/logistiek-feedback-ronde-2.md` (ronde 2), beide volledig afgewerkt.

Technische kaart van de module: `docs/uitleendienst.md`.
Productkeuzes: `docs/design-decisions.md` (§ Uitleendienst).
Rechten: `docs/permissions.md`.
Ingebruikname: `docs/logistiek-ingebruikname.md`.

## Hoe je dit gebruikt

1. Kies een fase (of één taak) en geef die in plan-modus.
2. Taken met **🗄️** vragen een Prisma-migratie in `packages/db/prisma/schema.prisma`.
3. Taken met **📝** vragen een sectie in `docs/design-decisions.md`.
4. Vink af in dit bestand als iets af is; zet er het commit-hashje bij.

Prioriteiten: **P1** = blokkeert het semester, **P2** = duidelijke verbetering,
**P3** = groter of "ooit".

## Afbakening

**Enkel de transportplanning (`/beheer/vervoer/week`) wordt herbouwd.**
`/beheer/kalender` blijft het overzicht over de héle logistiek (afhalingen,
terugbrengen, transport) en verandert niet van vorm; daar wordt één link
rechtgezet (S3). De twee schermen beantwoorden een andere vraag: de kalender
"wat gebeurt er deze week in de loods", de planning "wie rijdt wanneer met wat".

Wat het team vandaag gebruikt is een externe tool met een `maand/week/dag`-agenda,
arcering per voertuig, en een venster "Reservatie bewerken" met start, eind,
reden, lading, extra info, bestuurder, passagier en de voertuigen als Y/N.
Fase 3 is die tool, in onze eigen app en op onze eigen data.

## Statusoverzicht

| Fase | Inhoud | Taken | Status |
| --- | --- | --- | --- |
| 0 | Werkplan vastleggen | dit bestand | ✅ af |
| 1 | Semesterstart | S1–S3 | ✅ af |
| 2 | Kleur en arcering | K1 | ✅ af |
| 3 | De planning wordt een agenda-app | P1–P5 | ✅ af |
| 4 | Meldingsmail per aanvraagsoort | M1 | ✅ af |
| 5 | Privé-agendafeed van transport | A1 | ✅ af |
| 6 | Logistiek-evenement bij een website-evenement | E1 | ✅ af |
| 7 | Beschikbaarheid en bijrijders | V1–V3 | ✅ af |

Alles wordt op **390px breed** nagekeken, niet alleen op desktop. Tijdens ronde 1
en 2 is dat tot twee keer toe blijven liggen.

---

# Fase 1: semesterstart

### ✅ S1. Externen kunnen nog niets aanvragen
**P1 · code**

- **Raakt:** `lib/uitleen-server.ts`, `lib/session.ts`, `app/actions/uitleen.ts`,
  `app/actions/beheer.ts`, `app/beheer/instellingen/settings-forms.tsx`,
  `app/materiaal/`, `app/vervoer/`, `app/page.tsx`, `lib/i18n.ts`.
- **Nu:** elk ingelogd vtk.be-lid kan indienen; wie bij geen enkele groep hoort,
  vraagt aan als EXTERN.
- **Doen:**
  1. `getLogistiekSettings()` krijgt `externalRequestsOpen` (default **false**),
     in dezelfde `logistiek.settings`-blob als `showRentPrices`.
  2. Een schakelaar op `/beheer/instellingen` die zegt wát er dichtgaat.
  3. De aanmaak- en bewerkacties weigeren met `EXTERN_GESLOTEN`; dat is een
     verwachte invoerfout, dus ze komt terug en wordt niet gegooid.
  4. Kijken mag: de catalogus en de voertuigen blijven zichtbaar, het formulier
     wordt vervangen door een paneel met het mailadres van Logistiek.
- **Klaar wanneer:** iemand zonder groep de catalogus kan doorbladeren maar niets
  kan indienen, ook niet door de server action rechtstreeks aan te roepen, en het
  team dat met één schakelaar kan openzetten.

### ✅ S2. Geen waarborg voor posten en werkgroepen
**P1 · code · klein · 📝**

- **Raakt:** `app/materiaal/reservation-form.tsx`, `app/materiaal/[id]/page.tsx`.
- **Nu:** `chargesRequester()` (`lib/uitleen.ts`) verbergt prijs en waarborg al
  overal ná het indienen, maar het aanvraagformulier zelf toont de waarborg per
  item, in het totaal en in de zin eronder, ook voor een post of werkgroep.
- **Doen:** dezelfde regel toepassen in het formulier (het kent zijn
  aanvragertype via `values.requesterType`) en op de itemdetailpagina.
- **Klaar wanneer:** een praesidiumlid nergens een waarborgbedrag ziet, een
  externe wel.

### ✅ S3. Kalender opent de rit zelf
**P1 · code · klein**

- **Raakt:** `app/beheer/kalender/page.tsx`, `app/beheer/vervoer/page.tsx`,
  `app/beheer/vervoer/booking-row.tsx`.
- **Nu:** een transportregel in de kalender linkt naar `/beheer/vervoer`, en daar
  mag je de rit zelf gaan zoeken.
- **Doen:** `?rit=<id>` meegeven; de lijst zet die rij open, markeert ze en de
  browser scrollt ernaartoe via een anker.
- **Klaar wanneer:** één klik vanuit de kalender de rit opengeklapt toont.

---

# Fase 2: kleur en arcering

### ✅ K1. Kleur per chauffeur, arcering per voertuig
**P1 · code · 🗄️ 📝**

- **Raakt:** `packages/db/prisma/schema.prisma`, `lib/driver-colors.ts`,
  `app/globals.css`, `app/beheer/chauffeurs/driver-list.tsx`,
  `app/beheer/instellingen/settings-forms.tsx`, de planning.
- **Nu:** de kleur volgt uit de id van de chauffeur (djb2-hash) en is niet in te
  stellen; het voertuig staat enkel als icoon in het blok.
- **Gekozen beeld:** vulkleur = chauffeur, arcering = voertuig, en **geen
  chauffeur schreeuwt** (gele vulling, rode streepjesrand). "Nog te beslissen"
  houdt de bestaande diagonale strepen erbovenop.
- **Doen:**
  1. `UitleenDriver.colorIndex Int?` en `UitleenVehicle.pattern String?`
     (`none | diagonal | vertical | dots | grid`). `null` = de hash van vandaag,
     dus niets wat er staat verandert van kleur zolang niemand iets kiest.
  2. Kleurkiezer per chauffeur, patroonkeuze per voertuig, allebei met een levend
     voorbeeldblokje ernaast.
  3. De legende onder de planning toont beide assen.
- **Klaar wanneer:** je in één oogopslag ziet wie rijdt, waarmee, en welke ritten
  nog geen chauffeur hebben; en het team dat zelf kan bijstellen.

---

# Fase 3: de planning wordt een agenda-app

Nieuwe map `apps/logistiek/components/transport-calendar/`. Het tijdrooster wordt
gedeeld met het publieke `/vervoer/bezetting`, zodat dat mee profiteert van zoom
en van de mobiele weergave.

### ✅ P1. Dag-, week- en maandweergave
**P1 · code · groter**

- **Raakt:** `components/transport-calendar/`, `lib/month-lanes.ts` (nieuw),
  `lib/uitleen-server.ts`, `app/beheer/vervoer/week/`.
- **Doen:** weergave en datum in de URL (`?weergave=dag|week|maand&datum=…`),
  `‹ › vandaag`, en een maandrooster waarin een rit over meerdere dagen één balk
  is. Dag en week hergebruiken `placeForDay` uit `lib/week-lanes.ts` ongewijzigd.
- **Mobiel, anders opgelost dan gepland:** het plan was de week onder ~700px op
  drie dagen te zetten. Het is een horizontale scroller geworden met een
  vastgeplakte urenkolom: dan veeg je van dag naar dag zonder dat de app moet
  raden hoeveel dagen er passen, en de klok blijft staan. Wie één dag wil, neemt
  de dagweergave; die is op een telefoon sowieso de bruikbare.
- **Klaar wanneer:** je van maand naar dag kan en terug zonder de context te
  verliezen, ook op een gsm.

### ✅ P2. Zoom en volledig scherm
**P2 · code**

- **Doen:** de vaste `HOUR_PX = 42` wordt een zoomfactor op "de hele dag past in
  beeld", met knoppen en met ctrl/⌘+scroll; onthouden in `localStorage` (in een
  try/catch, want privémodus gooit). Volledig scherm via `requestFullscreen()`
  met een `position: fixed`-fallback voor iOS Safari.
- **Bijgesteld na het eerste gebruik.** De eerste versie zette de zoom in pixels
  per uur, en dan doet volledig scherm niets: het venster wordt groter, de uren
  blijven even hoog, en enkel het wit eromheen groeit. Nu wordt de hoogte van een
  uur gemeten (`ResizeObserver` op de scroller en de dagkop) in plaats van
  gekozen, loopt het rooster altijd van 00:00 tot 24:00, en zoomt scrollen rond
  de muis. Zie `docs/design-decisions.md` § Zoom is "hoeveel dag past er in
  beeld".
- **~~Geen pinch-zoom.~~ Teruggedraaid.** De redenering was dat knijpen op een
  telefoon het gebaar van de paginazoom is. Klopt, maar daardoor waren de twee
  knopjes op het scherm waar zoom het hardst nodig is de enige weg, en dat is
  het eerste wat iedereen probeert. `touch-action: pan-x pan-y` claimt enkel het
  knijpgebaar op de kalender zelf; ernaast werkt de paginazoom gewoon.
- **Klaar wanneer:** een drukke week op één scherm past, en een rustige week
  leesbaar groot staat.

### ✅ P3. Filters
**P2 · code**

- **Doen:** voertuig, chauffeur (met "geen chauffeur"), status, aanvragertype, en
  een schakelaar voor de evenementenstrook. (De schakelaar voor de
  beschikbaarheid komt bij V1, samen met de gegevens die ze toont.) URL-parameters plus geheugen,
  hetzelfde stramien als `app/beheer/kalender/kalender-filters.tsx`. Onder de balk
  staat wát er verborgen is, zodat een lege week niet als "niets gepland" leest.
- **Mobiel:** de balk klapt samen tot één knop `Filters (3)`.

### ✅ P4. Rit openen, aanpassen en aanmaken
**P1 · code · groter · 🗄️**

- **Doen:**
  1. Een inspector in de plaats van de huidige modal: rechts op desktop, een
     bottom sheet op mobiel, met **alles** van de rit erin.
  2. Bewerken in dat paneel, één op één met hun huidige "Reservatie bewerken":
     start, eind, reden, lading (`cargoNote`, nieuw), extra info, bestuurder,
     passagiers, voertuigen.
  3. Slepen om te verplaatsen of te rekken (snapt op 15 min); slepen op lege
     ruimte opent het aanmaakformulier met die uren ingevuld. Op touch staat
     slepen uit, anders verschuift elke scroll een rit.
  4. Een rit aanmaken door het team zelf, via `buildTransportBookings`.
  5. **"Rit afronden" verdwijnt hier.** De knop blijft op `/beheer/vervoer`; in
     de planning staat enkel een link erheen.
- **Klaar wanneer:** de transportverantwoordelijke een week kan plannen zonder
  het scherm te verlaten, en per ongeluk niets meer kan afronden.

### ✅ P5. Evenementen in de planning
**P2 · code**

- **Doen:** de logistiek-evenementen die het venster raken staan als balken boven
  het tijdrooster, uitklapbaar naar wat eraan hangt, en aanklikbaar om naam,
  locatie, uren en nota ter plekke aan te passen.

---

# Fase 4: meldingsmail per aanvraagsoort

### ✅ M1. Mail naar het juiste adres bij een nieuwe aanvraag
**P1 · code · 📝**

- **Raakt:** `lib/uitleen-mail.ts`, `app/actions/uitleen.ts`,
  `app/beheer/instellingen/`, `lib/uitleen-server.ts`.
- **Nu:** de app mailt enkel de **aanvrager**, en enkel bij goedkeuren, afwijzen,
  wijzigen en terugdraaien. Bij een nieuwe aanvraag vertrekt er niets; het team
  moet zelf gaan kijken.
- **Doen:** per soort (materiaal, flesserke, transport) een eigen lijst adressen,
  in te vullen op `/beheer/instellingen`. Dezelfde drie regels als de bestaande
  mails: ná de transactie, faalt nooit de actie, en niet elke stap mailt.
- **Let op:** een lege lijst betekent geen mail, en het scherm zégt dat daar.
  Stil niets versturen is precies de bug die deze taak oplost.

---

# Fase 5: privé-agendafeed van transport

### ✅ A1. De planning als agenda-abonnement
**P2 · code · 🗄️**

- **Raakt:** `lib/calendar/ics.ts` (nieuw, kopie), `app/api/kalender/[token]/`,
  `packages/db/prisma/schema.prisma`, `/beheer/instellingen`, `/ritten`.
- **Doen:** dezelfde opzet als de eerstejaarskalender op vtk.be, maar privé: het
  geheim zit in de URL, `Cache-Control: private, no-store`, `noindex`, en een
  token dat ingetrokken kan worden. `TEAM` geeft de hele planning, `DRIVER` enkel
  de eigen ritten.
- **De ics-generator wordt gekopieerd, niet gehoist.** Een nieuw workspace-pakket
  dwingt een volledige lockfile-regeneratie af (AGENTS.md), en die laat
  `better-auth` doorfloaten naar 1.7.1 waarop `packages/auth` niet meer
  typecheckt. De generator is afhankelijkheidsvrij en getest; de kopie kost
  minder dan die val.

---

# Fase 6: logistiek-evenement bij een website-evenement

### ✅ E1. Vinkje "Logistiek nodig" op een kalenderevenement
**P2 · code · 🗄️ 📝**

- **Raakt:** `apps/web/app/actions/calendar.ts`,
  `apps/web/app/[locale]/admin/kalender/EventForm.tsx`,
  `packages/db/prisma/schema.prisma`, `/beheer/evenementen`.
- **Nu:** `docs/design-decisions.md` zegt uitdrukkelijk dat een evenement niet
  vanzelf ontstaat, omdat elke uitlening van twee tafels er anders een krijgt.
- **Waarom dit toch mag:** een website-evenement is geen aanvraag maar een
  gecureerde activiteit van de kring, en het vinkje houdt de beslissing bij een
  mens. Wie het niet aanvinkt, krijgt niets.
- **Doen:** `UitleenEvent.calendarEventId` (uniek, `SetNull`), aanmaken bij het
  vinkje, en naam/locatie/uren meeduwen bij een wijziging — op dezelfde plek waar
  `ticketEvent.updateMany` dat al doet.

---

# Fase 7: beschikbaarheid en bijrijders

### ✅ V1. Chauffeurs geven hun beschikbaarheid door
**P2 · code · 🗄️ 📝**

- **Doen:** `UitleenDriverAvailability` (vensters, geen rooster), een
  `/ritten/beschikbaarheid` met hetzelfde tijdrooster om ze in te slepen, en een
  schakelaar in de planning die ze als lichte band achter het rooster legt, in de
  kleur van de chauffeur. Iemand toewijzen buiten zijn venster geeft een
  waarschuwing, geen blokkade: de app kent zijn agenda niet, hij wel.
- **Acties horen in `app/actions/uitleen.ts`**, niet in `beheer.ts`: een chauffeur
  heeft geen `logistiek.manage`.

### ✅ V2. Bijrijders met naam en nummer, ook achteraf
**P2 · code · 🗄️**

- **Nu:** `helpersNote` (vrije tekst) en één `helpersPhone`. Twee bijrijders met
  elk hun nummer passen daar niet in.
- **Doen:** `UitleenTransportHelper` (naam + nummer per rij), toe te voegen bij
  het aanvragen én achteraf, door de aanvrager of door een collega van dezelfde
  post of werkgroep. De ritmail en "Mijn ritten" tonen ze met `tel:`-links, want
  daarvoor dient het nummer.

### ✅ V3. Documentatie bijwerken
**P2 · docs**

- `docs/uitleendienst.md`: de nieuwe modellen, de feed, de meldingen, de file map.
- `docs/logistiek-ingebruikname.md`: wat het team zelf invult (kleuren, patronen,
  mailadressen per soort, de externen-schakelaar, de abonnementen).
- Dit bestand: alles afgevinkt.

---

# Nog manueel na te kijken

Wat er tijdens de bouw niet doorgeklikt kon worden, of wat enkel met testdata
werkte. Hier begin je bij het testen.

1. **De mails vertrekken echt.** Alles is lokaal in de log nagekeken (inhoud,
   ontvangers, en dat een mislukte verzending de aanvraag niet doet falen), maar
   er is nooit iets vertrokken: lokaal draait er geen mailserver. Zie punt 1 van
   `docs/logistiek-ingebruikname.md`.
2. **De agendafeed in een echte agenda-app.** De feed is met `curl` nagekeken
   (headers, inhoud, `.ics`-suffix, 404 na intrekken), niet in Google Agenda of
   Apple Agenda.
3. **Volledig scherm op een echt toestel.** In de testbrowser viel de planning
   terug op het vaste paneel omdat een gescripte klik geen echte gebruikersactie
   is. Beide vormen werken, maar welke je krijgt hangt van de browser af; kijk
   zeker eens op iOS.
4. **Slepen met een echte muis en op een echt touchscreen.** Verplaatsen, rekken
   en intekenen zijn met gesimuleerde pointer-events nagekeken. Op touch staat
   slepen bewust uit; controleer dat scrollen daar gewoon scrollt.
5. **Een collega van dezelfde post die een bijrijder toevoegt.** De autorisatie
   hergebruikt `vanBookingForMember` (dezelfde regel die al bepaalt wie een rit
   van zijn post mag zien), maar de test-persona's hebben één lid per post, dus
   dat pad is niet doorgeklikt.
6. **Alles op een gsm, met echte vingers.** De schermen zijn op 390px nagekeken
   in een browser.

---

# Wat er per taak sowieso bij hoort

Geldt voor elke opdracht hierboven; herhaal het niet in de plannen zelf.

- `npm run verify` moet groen zijn vóór de push (`.githooks/pre-push` draait het
  automatisch): lockfile-check, typegen plus `tsc --noEmit`, eslint, unit tests.
- Nieuwe of gewijzigde server actions geven `SaveState`/`ActionResult` terug;
  verwachte invoerfouten komen terug als foutcode, onverwachte fouten gooien.
- Destructieve acties krijgen een bevestigingsdialoog die zegt wat er weg is en
  wat blijft; rij-acties zijn icoonknoppen met `label` en `srLabel`.
- `revalidatePath` raakt ook de beheerpagina, niet enkel de publieke route.
- Styling volgt de tokens uit `apps/web/app/design/vtk-base.css`; geen ruwe hexes.
- **Elk scherm wordt op 390px nagekeken.** Een breed raster in een horizontale
  scroller krijgt `position: relative` op de wrapper, anders ankert een `sr-only`
  op de pagina in plaats van op het raster en zoomt een gsm het hele scherm uit.
- Raakt een taak de werking van de kring, dan hoort er een sectie in
  `docs/design-decisions.md`; raakt ze de architectuur, dan werk je
  `docs/uitleendienst.md` bij.
- Dev draait met `npm run dev -w @vtk/logistiek` (poort 3100, webpack; nooit
  Turbopack).
