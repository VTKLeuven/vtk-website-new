# Werkplan: feedback van Logistiek op de nieuwe logistiek-app

Bron: feedbackronde van het team Logistiek op `apps/logistiek` (augustus 2026).
Dit document zet die feedback om in afgebakende opdrachten. Elke opdracht is
zelfstandig leesbaar: je kan één sectie in plan-modus geven zonder de rest.

Technische kaart van de module: `docs/uitleendienst.md`.
Productkeuzes: `docs/design-decisions.md` (§ Uitleendienst).
Rechten: `docs/permissions.md`.

## Hoe je dit gebruikt

1. Kies een fase (of één taak) en geef die in plan-modus.
2. Fase 0 (de kringkeuzes) is beslist op 10 augustus 2026. Taken die eruit
   volgen dragen "beslist: B*"; de motivatie staat in
   `docs/design-decisions.md` (§ Uitleendienst, "Feedbackronde augustus 2026").
3. Taken met **🗄️** vragen een Prisma-migratie in `packages/db/prisma/schema.prisma`.
4. Taken met **📝** vragen een sectie in `docs/design-decisions.md`, want de
   gewenste werking is een kringkeuze en geen technisch detail.
5. Vink af in dit bestand als iets af is; zet er het commit-hashje bij.

Prioriteiten: **P1** = bug of dagelijkse ergernis, **P2** = duidelijke
verbetering, **P3** = groter of "ooit".

## Statusoverzicht

| Fase | Inhoud | Taken | Zwaarte |
| --- | --- | --- | --- |
| 0 | Beslissingen die eerst moeten vallen | 9 vragen | ✅ beslist 10 aug 2026 |
| 1 | Kleine bugs en ergernissen | A3, M8, M9, M10, M11, M14, V4, V10, V11, F1, F4 | ✅ af 10 aug 2026 |
| 2 | Beheer-overzichten (kalender, lijsten) | A1, A2, V3, V7 | ✅ af 10 aug 2026 |
| 3 | Statussen terugdraaien en historiek | A5, A6 | ✅ af 10 aug 2026 |
| 4 | Materiaal: catalogus en aanvragen | M3, M4, M5, M6, M13, M15 | ✅ af 11 aug 2026 |
| 5 | Vervoer | V2, V5, V8, V9, V12, V13 | ✅ af 11 aug 2026 |
| 6 | Flesserke | F2, F3, F5, F6, F7 | ✅ af 11 aug 2026 |
| 7 | Grote stukken | ~~A7~~, A8, ~~A9~~, ~~M1~~, M2, M12, M17, M18, V1 | bezig; A7 + A9 + M1 af 11 aug 2026 |

Vervallen: **M7** (gas wordt een gewoon catalogusitem, dus geen code) en **M16**
(geen barcodes). Zie fase 0.

---

# Fase 0: beslissingen ✅ afgerond op 10 augustus 2026

Deze vragen kwamen uit de feedback zelf ("willen we...", "wat met...") en
bepaalden wat er gebouwd wordt. De motivatie per keuze staat in
`docs/design-decisions.md` (§ Uitleendienst, "Feedbackronde augustus 2026");
hieronder enkel de beslissing en wat ze aan het plan verandert.

| # | Vraag | Beslissing | Gevolg |
| --- | --- | --- | --- |
| B1 | Klaarzetten: printen of online afvinken? | **Beide.** Online afvinken per item met opmerking, plus een printbare A4 per aanvraag. | A7 gaat door zoals beschreven. |
| B2 | Alles onder één evenement? | **Ja, als optionele koepel.** Losse aanvragen blijven werken. | A8 gaat door zoals beschreven. |
| B3 | Hoe zichtbaar is de inventaris? | **Achter de login (zoals nu), en schap/rek enkel voor `logistiek.manage`.** | M6 wordt een echte taak; zie fase 4. |
| B4 | Wat met gas? | **Gewoon catalogusitem.** Geen aparte flow, geen verplichte waarschuwingstekst; wat er gezegd moet worden, staat in de omschrijving. | M7 vervalt: geen code, enkel de items invoeren. |
| B5 | Vanaf wanneer last minute? | **7 dagen**, instelbaar door het team. | M3 gaat door, met 7 als default in plaats van 14. |
| B6 | Conflicterende aanvraag? | **Indienen toestaan met zichtbare conflictwaarschuwing**, en Logistiek kan beide aanvragers mailen en met de periodes schuiven zodat ze samen passen. | M2 groeit: conflict tonen plus een schuif- en mailactie. |
| B7 | Transportoverzicht zonder login? | **Ja, geanonimiseerd:** enkel voertuig, dag en uur; geen namen, doelen of adressen. | V13 gaat door en verhuist naar fase 5, samen met V7. |
| B8 | Barcodes op al het materiaal? | **Nee.** | M16 vervalt. |
| B9 | Per dag of per dagdeel? | **Dagdeel erbij** (voormiddag/namiddag/avond); de voorraadberekening blijft op hele dagen. | M12 gaat door zoals beschreven. |

Twee keuzes halen een eerdere beslissing onderuit; dat staat ook in
`docs/design-decisions.md`:

- **"Geen mails in v1" vervalt** (B6 en A9): een wijziging door Logistiek moet de
  aanvrager bereiken zonder dat die inlogt.
- **`condition` is niet langer puur informatief** zodra de staat per exemplaar
  bijgehouden wordt (M1): een kapot exemplaar telt niet meer mee voor de
  beschikbaarheid.

Nog steeds intern werk voor Logistiek zelf, zonder code:

- Sets correct invoeren met hun inhoud (`/beheer/materiaal`, set-editor).
- Inventaris nakijken op ontbrekende items en foute aantallen.
- De gasflessen als gewone catalogusitems invoeren (B4).

Ook uit de feedback, maar puur intern werk voor Logistiek zelf (geen code):

- Sets correct invoeren met hun inhoud (`/beheer/materiaal`, set-editor).
- Inventaris nakijken op ontbrekende items en foute aantallen.

---

# Fase 1: kleine bugs en ergernissen ✅ af op 10 augustus 2026

Alles hier is klein, zichtbaar en zonder migratie. Wat er per taak effectief
gebeurd is, staat hieronder bij de taak zelf; twee dingen die tijdens het werk
naar boven kwamen:

- **F1 lost het maar half op, en dat ligt aan de data.** De kolom "Inhoud" staat
  er nu, maar de geïmporteerde waarden zijn kale getallen (0.7, 1.5): het
  importscript neemt de Excel-kolom "Hoeveelheid [kg of L]" over, en daar staat
  de eenheid enkel in de kolomtitel. De eenheid per item invullen kan pas zinvol
  wanneer flesserke-items bewerkbaar zijn (**F2**, fase 6).
- **Het aantalveld deelt nu één component** (`components/quantity-input.tsx`)
  tussen materiaal en flesserke, dus M9 geldt voor beide flows.

### A3. Kalender toont post en evenement, niet enkel de aanvrager ✅
**P1 · code · ❗quick win**

- **Raakt:** `apps/logistiek/app/beheer/kalender/page.tsx`,
  `apps/logistiek/lib/uitleen-server.ts` (`adminAgenda`).
- **Nu:** elke regel is `"<naam aanvrager>: <items>"`. `adminAgenda` haalt enkel
  `user.name` op; `group` en `eventName` staan niet in de include.
- **Doen:**
  1. `adminAgenda` uitbreiden: `select`/`include` met `eventName`,
     `requesterType`, `requesterName` en `group: { select: { nameNl: true } }`
     op zowel `pickups` als `returns`, en `eventName` + `group` op `vanBookings`.
  2. De regel opbouwen als `<post of werkgroep> · <evenement> · <aanvrager>`,
     met de items op een tweede, gedempte lijn. Hergebruik de `requesterLabel`
     logica uit `app/beheer/aanvragen/page.tsx`; til die naar `lib/uitleen.ts`
     zodat beide schermen dezelfde labels tonen.
  3. Bij vervoer ook de voertuignaam vooraan zetten (zie V6, zelfde regel).
- **Klaar wanneer:** een kalenderregel toont post/werkgroep, evenementnaam,
  aanvrager en (bij vervoer) het voertuig, zonder dat je moet doorklikken.

### M8. De "+"-knop valt buiten beeld bij materiaalaanvraag bewerken als logi ✅
**P1 · code**

- **Raakt:** `apps/logistiek/app/beheer/aanvragen/[id]/admin-edit-form.tsx`,
  `apps/logistiek/app/materiaal/reservation-form.tsx`.
- **Nu:** het aanvraagformulier wordt in het beheer in een smallere kolom
  gerenderd; de itemkaart houdt zijn `flex items-center justify-between` met
  drie ronde knoppen en loopt over de rand.
- **Doen:**
  1. Reproduceer op `/beheer/aanvragen/<id>` met "Aanvraag bewerken" op een
     scherm van 1280px en op 390px breed.
  2. Fix in de kaart zelf, niet in de wrapper: de itemgrid moet onder een
     bepaalde containerbreedte naar één kolom vallen. Gebruik container queries
     (`@container`) op de lijst, zodat de kaart zich naar zijn kolom schikt en
     niet naar het venster; het formulier wordt namelijk in twee verschillende
     breedtes hergebruikt.
  3. Controleer dat de aantalknoppen niet krimpen (`shrink-0` staat er al) en
     dat de itemnaam mag afbreken (`min-w-0` op de tekstkolom).
- **Klaar wanneer:** op elke breedte staan `−`, aantal en `+` volledig binnen de
  kaart, zowel op `/materiaal` als in het beheer-bewerkscherm.

### M9. Aantal intypen in plaats van dertig keer klikken ✅
**P1 · code**

- **Raakt:** `apps/logistiek/app/materiaal/reservation-form.tsx` (rond regel
  272-297), `apps/logistiek/app/flesserke/request-form.tsx`.
- **Nu:** enkel `−` en `+`; 30 cantuskannen zijn 30 kliks.
- **Doen:**
  1. Vervang het vaste `<span>` met het aantal door een smal `<input
     type="number" inputMode="numeric" min="0">` met dezelfde pill-styling.
  2. Klemmen op de beschikbaarheid: `max` = beschikbaar in de gekozen periode
     (`availability[item.id]`), anders `item.quantity`. Bij een te hoge invoer
     zet je terug op het maximum en toon je de bestaande "niet beschikbaar"-tekst.
  3. Lege invoer betekent 0 (rij verdwijnt uit het overzicht rechts), niet `NaN`.
  4. Zelfde behandeling in het flesserke-formulier.
  5. Test in `apps/logistiek/test/reservation-form.test.ts`: invoer boven het
     maximum wordt geklemd, lege invoer wordt 0.
- **Klaar wanneer:** je kan `30` typen in het veld en de aanvraag bevat 30 stuks.

### M10. Layout "flipt" bij een grote aanvraag ✅
**P1 · code**

- **Raakt:** `apps/logistiek/app/reservaties/page.tsx`,
  `apps/logistiek/app/beheer/aanvragen/page.tsx`,
  `apps/logistiek/app/materiaal/reservation-form.tsx` (de `aside`).
- **Nu:** de rijen gebruiken `flex flex-wrap items-center` met een
  `min-w-0 flex-1`-tekstblok en een badge ernaast. Zodra de itemopsomming lang
  wordt, wrapt de badge naar een eigen lijn en springt de rij van vorm; in het
  aanvraagformulier duwt de lange lijst in de `aside` de sticky kolom voorbij de
  vensterhoogte.
- **Doen:**
  1. Reproduceer met een aanvraag van 15+ verschillende items.
  2. Zet de rijen om naar een expliciete grid met vaste kolommen
     (`grid-cols-[minmax(0,1fr)_auto]`) in plaats van `flex-wrap`, zodat de
     badge altijd rechts blijft.
  3. Kort de itemopsomming af: toon de eerste drie plus "+ N andere", met de
     volledige lijst op de detailpagina. Gebruik `line-clamp-1` en `truncate`
     consequent.
  4. In de `aside` van het aanvraagformulier: geef de gekozen-items-lijst een
     `max-height` met eigen scroll, zodat de knop "Aanvraag indienen" zichtbaar
     blijft.
- **Klaar wanneer:** een aanvraag met 20 items ziet er in `/reservaties`, in
  `/beheer/aanvragen` en in het formulier hetzelfde uit als eentje met 2 items.

### M11. Aanvragen sorteren op datum ✅
**P1 · code**

- **Raakt:** `apps/logistiek/lib/uitleen-server.ts` (`adminReservations`),
  `apps/logistiek/app/beheer/aanvragen/page.tsx`.
- **Nu:** `orderBy: [{ createdAt: 'desc' }]`, dus op indienmoment. Voor het team
  is de afhaaldatum de relevante volgorde.
- **Doen:**
  1. Standaardvolgorde per sectie: "Te beslissen" en "Lopend" op `pickupDate`
     oplopend (eerstvolgende afhaling bovenaan), "Afgerond" op `returnDate`
     aflopend.
  2. Voeg een sorteerschakelaar toe (afhaaldatum / aanvraagdatum / post) met
     de bestaande `SortHeader`/`useSort` uit
     `apps/logistiek/app/beheer/sortable-header.tsx`.
  3. Zet de sortering in de URL (`?sort=pickup&dir=asc`), zodat een link
     deelbaar is en een refresh niets vergeet.
- **Klaar wanneer:** de eerstvolgende afhaling staat bovenaan zonder scrollen.

### M14. "Filters wissen"-knop op materiaal ✅
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/materiaal/reservation-form.tsx` (zoek + categorie),
  `apps/logistiek/app/beheer/materiaal/inventory-manager.tsx`.
- **Doen:** toon naast de zoek/categorie-rij een knop "Filters wissen" zodra er
  een filter actief is; die zet `search` leeg en `activeCategory` terug op
  `'all'`. Tekstknop, geen icoon (geen rij-actie).
- **Klaar wanneer:** één klik brengt je terug naar de categorie-landing.

### V4. Mijn reservaties toont welk voertuig je aanvroeg ✅
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/reservaties/page.tsx` (transportsectie).
- **Nu:** `myVanBookings` haalt `vehicle: { nameNl, nameEn }` al op, maar de
  pagina toont enkel `purpose`, de uren en de prijs.
- **Doen:** zet de voertuignaam als pill vóór het doel van de rit, net zoals in
  `/beheer/vervoer`. Respecteer de locale (`nameEn` bij `en`).
- **Klaar wanneer:** je ziet op `/reservaties` of je de kar, de auto of de
  bakfiets aanvroeg.

### V10. De limiet van 12 uur op een rit verdwijnt ✅
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/actions/uitleen.ts` (regel 234 en 254-259).
- **Nu:** `MAX_VAN_BOOKING_HOURS = 12` met de foutmelding "mail logistiek@vtk.be
  voor langere ritten". Praesidiumweekend en karroadtrip duren langer.
- **Doen:**
  1. Verwijder de constante en de check.
  2. Zet er een ruime bovengrens voor tikfouten in de plaats (bv. 30 dagen) met
     een eigen foutcode, zodat een verkeerd getypt jaartal nog steeds wordt
     tegengehouden.
  3. Behoud de check `endAt > startAt`.
  4. Pas de tekst in `apps/logistiek/lib/i18n.ts` aan als de oude limiet daar
     ergens vermeld staat.
- **Klaar wanneer:** een rit van drie dagen kan gewoon aangevraagd worden.

### V11. Van- en tot-uren van een rit staan altijd op het kwartier ✅
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/vervoer/request-form.tsx` (de twee
  `datetime-local`-velden), `apps/logistiek/app/actions/uitleen.ts`
  (`createVanBookingAction`), `apps/logistiek/app/actions/beheer.ts`
  (`approveTransportAction`, en het uren-schuiven uit V5).
- **Doen:**
  1. Client: `step={900}` op beide inputs, zodat de browserpicker per kwartier
     springt.
  2. Server: rond af of weiger. Voorkeur is weigeren met een duidelijke fout
     ("Kies een tijdstip op het kwartier"), want stil afronden verschuift een
     rit zonder dat de aanvrager het ziet.
  3. Unittest in `apps/logistiek/test/`: `10:07` wordt geweigerd, `10:15` niet.
- **Klaar wanneer:** elke rit in de database heeft minuten uit {0, 15, 30, 45}.

### F1. Eenheid staat bij een flesserke-item ✅
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/beheer/flesserke/flesserke-manager.tsx`
  (voorraadtabel), `apps/logistiek/app/flesserke/request-form.tsx`.
- **Nu:** `contentAmount` (bv. "0,5 L") bestaat en wordt in het aanvraagscherm
  getoond, maar ontbreekt in de beheertabel.
- **Doen:** voeg een kolom "Inhoud" toe aan de voorraadtabel, tussen "Item" en
  "Categorie". Gebruik bij een leeg veld hetzelfde lege-waardeteken als de
  kolom "Vervalt". Neem `contentAmount` mee in de
  zoekfilter.
- **Klaar wanneer:** je ziet in het beheer of een lijn over blikjes van 33 cl of
  flessen van 1,5 L gaat.

### F4. Colruyt-link is terug te vinden ✅
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/beheer/flesserke/flesserke-manager.tsx`,
  `apps/logistiek/app/flesserke/request-form.tsx`.
- **Nu:** `colruytUrl` kan ingevuld worden maar wordt nergens getoond.
- **Doen:** maak de itemnaam een link naar `colruytUrl` wanneer die bestaat
  (`target="_blank" rel="noopener noreferrer"`), met een klein extern-link-icoon
  uit de gedeelde iconenset. Zonder link blijft het gewone tekst.
- **Klaar wanneer:** vanuit de flesserke-lijst klik je door naar het product.

---

# Fase 2: beheer-overzichten ✅ af op 10 augustus 2026

Twee dingen die tijdens het werk naar boven kwamen:

- **Constanten mogen niet uit een `'use client'`-module komen.** De kalender
  importeerde `CALENDAR_KINDS` uit de filterbalk, en in een client-module wordt
  élke export een client-referentie: de server-component kreeg geen array maar
  een proxy en de pagina viel om met "CALENDAR_KINDS is not iterable". Dat komt
  enkel bij het draaien boven, niet uit `tsc`. Gedeelde constanten staan nu in
  `kalender-kinds.ts`.
- **V13 (publiek transportoverzicht) is half gebouwd**: `transportWeekPublic()`
  staat er al, met een eigen smalle `select`. Er ontbreekt enkel nog de route.

### A1. Kalender: aanvinken wat je wil zien ✅
**P2 · code**

- **Raakt:** `apps/logistiek/app/beheer/kalender/page.tsx` (nieuw
  client-filtercomponent), `apps/logistiek/lib/uitleen-server.ts`.
- **Doen:**
  1. Filterbalk bovenaan met checkboxes: Afhaling, Terugbrengen, Vervoer, en
     daarnaast een voertuigfilter (meerkeuze, gevoed door `adminVehicles()`).
  2. Zet de keuze in de URL (`?soort=afhaling,vervoer&voertuig=<id>`) zodat het
     de refresh en een deelbare link overleeft; de pagina blijft een server
     component die de searchParams leest, met enkel de balk als client component.
  3. Onthoud de laatste keuze in `localStorage` en herstel ze wanneer er geen
     searchParams staan.
  4. Het lege scherm zegt welke filters actief zijn ("Niets gepland met deze
     filters"), plus een knop "Filters wissen".
- **Klaar wanneer:** de transportverantwoordelijke kan in twee kliks enkel de
  ritten van de kar zien.

### A2. Kalender: zelf de periode kiezen ✅
**P2 · code**

- **Raakt:** `apps/logistiek/app/beheer/kalender/page.tsx` (`DAYS_AHEAD = 30`).
- **Doen:**
  1. Snelkeuzes (7 / 30 / 90 dagen) plus een vrije van/tot-datumkeuze.
  2. Ook in de URL (`?van=2026-09-01&tot=2026-09-30`), met 30 dagen vanaf
     vandaag als default; `adminAgenda(from, to)` neemt de grenzen al aan.
  3. De titel volgt de keuze: "1 tot 30 september" in plaats van "Komende 30
     dagen".
  4. Let op de grens in `adminAgenda`: `vanBookings` telt er nu een dag bij
     (`to + 24u`) omdat `startAt` een timestamp is en `to` middernacht. Behoud
     dat gedrag bij een zelfgekozen einddatum, anders valt de laatste dag weg.
- **Klaar wanneer:** je kan de kalender van het weekend van de 24 urenloop
  opvragen zonder te scrollen door drie weken.

### V3. Vervoeraanvragen compacter ✅
**P2 · code**

- **Raakt:** `apps/logistiek/app/beheer/vervoer/page.tsx` (`BookingCard`).
- **Nu:** elke rit is een kaart van vijf tekstlijnen plus de beslisknoppen. Bij
  veel aanvragen scrol je eindeloos.
- **Doen:**
  1. Zet "Goedgekeurd" en "Historiek" om naar een dichte tabel: datum, uren,
     voertuig, aanvrager, doel, chauffeur, status, betaald. Wikkel de tabel in
     een `overflow-x-auto`-container met `position: relative` (zie CLAUDE.md:
     `sr-only` in een scroller zonder gepositioneerde ouder zoomt de pagina uit).
  2. Details (laadadres, bestemming, bijrijders, nota's) achter een uitklapbare
     rij of een detailvenster, niet standaard zichtbaar.
  3. "Te beslissen" blijft kaarten, want daar moet je alles zien vóór je beslist.
  4. Rij-acties worden icoonknoppen met verplichte `label` en `srLabel`
     (CLAUDE.md); "Goedkeuren" en "Afwijzen" blijven tekstknoppen.
- **Klaar wanneer:** twintig goedgekeurde ritten passen op één scherm.

### V7. Weekoverzicht voor vervoer ✅
**P2 · code · groter**

- **Raakt:** nieuw: `apps/logistiek/app/beheer/vervoer/week/page.tsx` (of een
  weergavetoggle op `/beheer/kalender`), `apps/logistiek/lib/uitleen-server.ts`.
- **Nu:** enkel een daglijst. Het oude `vtk.be/nl/logistics/transport` had een
  weekraster en dat werd veel gebruikt.
- **Doen:**
  1. Nieuwe query `transportWeek(from, to)`: alle `APPROVED` (en optioneel
     `REQUESTED`, in een lichtere kleur) boekingen in het venster, met voertuig,
     chauffeur en aanvrager.
  2. Raster van 7 dagen × voertuigen; elke rit een blok met begin- en einduur.
     Overlappende ritten van hetzelfde voertuig naast elkaar en visueel
     gemarkeerd als conflict (dat is precies wat V5 moet oplossen).
  3. Vorige/volgende week, en "deze week" als default; weeknummer in de titel.
  4. Op smal scherm valt het raster terug op de daglijst; bouw geen horizontale
     scroller (CLAUDE.md).
  5. Styling volgt de navy/paper-tokens uit `apps/web/app/design/vtk-base.css`;
     geen nieuwe kleuren.
- **Klaar wanneer:** je ziet in één blik welk voertuig wanneer bezet is.
- **Let op:** hangt samen met V13 (publieke versie zonder login); bouw de query
  zo dat een publieke variant enkel "bezet/vrij" kan tonen zonder namen.

---

# Fase 3: statussen terugdraaien en historiek ✅ af op 10 augustus 2026

Wat er tijdens het werk bijkwam:

- **Terugbrengen terugdraaien is de zwaarste van de reeks**, want het flesserke-
  verbruik moet terug op de plank én het materiaal komt weer uit de voorraad.
  Dat loopt in één Serializable-transactie met dezelfde check als het
  goedkeuren; end-to-end nagekeken met een aanvraag van 5 stuks waarvan er 2
  terugkwamen (voorraad 6 → 3 → 6 na het terugdraaien).
- **De historiek is één tabel voor aanvragen én ritten** (`UitleenAuditLog`,
  precies één van beide id's gezet, zoals `UitleenPayment`). `fromStatus`/
  `toStatus` zijn `String`: de twee soorten hebben elk hun eigen statusenum.
- De vervoerlijst haalt de historiek van alle getoonde ritten in **één** query
  op; de details staan wel ingeklapt, maar worden server-side gerenderd.

### A5. Ont-afronden, ont-goedkeuren en ont-markeren als betaald ✅
**P1 · code · 📝**

- **Raakt:** `apps/logistiek/app/actions/beheer.ts` (naast
  `approveReservationAction`, `markPickedUpAction`, `markReturnedAction`,
  `markPaidOfflineAction`, `markDepositReturnedAction`,
  `approveTransportAction`, `completeTransportAction`,
  `markTransportPaidOfflineAction`),
  `apps/logistiek/app/beheer/aanvragen/[id]/decision-forms.tsx`,
  `apps/logistiek/app/beheer/vervoer/transport-controls.tsx`.
- **Nu:** elke overgang is eenrichtingsverkeer. Eén verkeerde klik en het team
  moet in de database.
- **Doen:**
  1. Nieuwe acties, expliciet benoemd (niet één generieke "zet status"):
     - materiaal: `reopenReservationAction` (APPROVED/REJECTED → REQUESTED),
       `undoPickedUpAction` (PICKED_UP → APPROVED),
       `undoReturnedAction` (RETURNED → PICKED_UP),
       `undoPaidOfflineAction` (`paidOfflineAt = null`),
       `undoDepositReturnedAction`.
     - vervoer: `reopenTransportAction`, `undoCompleteTransportAction`,
       `undoTransportPaidOfflineAction`.
  2. Elke actie `requireManage()`, en teruggeven via `SaveState`/`ActionResult`;
     verwachte fouten gooien niet (CLAUDE.md).
  3. **Voorraadcheck bij het terugdraaien.** APPROVED → REQUESTED geeft
     voorraad vrij: dat is veilig. PICKED_UP → APPROVED en RETURNED → PICKED_UP
     nemen voorraad opnieuw in; draai die in dezelfde Serializable-transactie
     als `approveReservationAction` en weiger met een nette melding wanneer de
     periode intussen volzet is.
  4. **Betaling is de gevaarlijke.** "Ont-markeren als betaald" mag enkel
     `paidOfflineAt` wissen. Een geslaagde online betaling
     (`hasSucceededPayment`) mag je niet wegklikken; toon daar geen knop maar de
     zin dat een terugbetaling via de betaalprovider moet.
  5. Alle knoppen zijn `ConfirmActionButton` met een dialoog die zegt wat er
     precies verandert (CLAUDE.md), bv. "De aanvraag gaat terug naar
     'aangevraagd'. Het materiaal komt weer vrij voor anderen in die periode."
  6. Elke terugdraaiing schrijft een regel in de historiek uit A6.
  7. Zet de sectie in `docs/design-decisions.md`: wat mag teruggedraaid worden,
     wat niet, en waarom (online betalingen).
- **Klaar wanneer:** een foute klik is met twee kliks recht te zetten, en de
  voorraad klopt daarna nog.

### A6. Historiek: wie deed wat wanneer ✅
**P2 · 🗄️ · code**

- **Raakt:** `packages/db/prisma/schema.prisma`,
  `apps/logistiek/app/actions/beheer.ts`,
  `apps/logistiek/app/beheer/aanvragen/[id]/page.tsx`.
- **Nu:** `decidedAt`/`decidedById`, `pickedUpAt`, `returnedAt` bewaren enkel de
  laatste toestand. Wie goedkeurde staat er wel in, maar wordt nergens getoond,
  en een terugdraaiing (A5) overschrijft het.
- **Doen:**
  1. Nieuw model `UitleenReservationEvent` (of breder: `UitleenAuditLog` met
     precies één van `reservationId`/`transportBookingId`, zoals
     `UitleenPayment` dat doet): `id`, `kind` (enum: STATUS_CHANGED,
     EDITED, PAYMENT_MARKED, NOTE), `fromStatus`, `toStatus`, `note`,
     `actorId`, `createdAt`. Indexen op `(reservationId, createdAt)` en
     `(transportBookingId, createdAt)`.
  2. Schrijf een regel in dezelfde transactie als de statuswijziging, in élke
     beheer-actie (goedkeuren, afwijzen, afhalen, terugbrengen, betalen,
     bewerken, en alle terugdraaiingen uit A5).
  3. Toon de historiek onderaan de detailpagina als tijdlijn: "12 sep 14:03 ·
     Jan keurde goed", "13 sep 09:10 · Mie draaide 'afgerond' terug".
  4. Bewaar de vrije opmerkingen van het team hier, niet als overschrijving van
     `adminNote`.
- **Klaar wanneer:** je kan op de detailpagina zien wie een aanvraag goedkeurde
  en wanneer, ook na een terugdraaiing.

---

# Fase 4: materiaal ✅ af op 11 augustus 2026

Wat er tijdens het werk bijkwam:

- **`AuthGroup` draagt nu een `type`**, en dat raakt beide apps: de
  preview-sessie in `apps/web/lib/authorization-preview.ts` bouwt ook een
  `SessionPayload` en moest mee. De sessie komt bij logistiek over de lijn van
  de hoofdsite, dus `requesterOptions` behandelt een ontbrekend type als post:
  tijdens een deploy waarin enkel logistiek al nieuw is, blijft de keuzelijst
  dan werken zoals voordien.
- **Er was geen testgebruiker met een post én een werkgroep**, dus de gegroepeerde
  keuzelijst was niet te zien. Persona `beide` (Frank: post Cultuur + werkgroep
  Revue) is erbij gekomen; met enkel één groep toont het formulier sowieso geen
  keuze.
- **De ledencatalogus haalt de loodsvelden niet meer op** in plaats van ze weg te
  laten uit de weergave (`memberItemSelect`). De staat (`condition`) hoort daar
  ook bij: zolang M1 niet af is, telt een kapot exemplaar nog gewoon mee voor de
  beschikbaarheid, en dan is "Kapot" tonen aan een lid dat het toch kan
  aanvragen enkel verwarrend.
- **Alternatieven staan onder de beschikbaarheidsregel**, niet erboven: eerst
  lezen dat het niet kan, dan wat wel kan. Andersom las de kaart als een
  aanbeveling voor iets wat je niet gevraagd had.
- **De datalist van de alternatieven-editor krijgt een `useId()`**: het
  toevoegformulier en een geopende bewerkrij staan tegelijk op de pagina, en twee
  datalists met dezelfde id laten er één winnen.

### M3. Last minute op 7 dagen, instelbaar en zichtbaar voor het lid ✅
**P2 · code · beslist: B5**

- **Raakt:** `apps/logistiek/lib/uitleen.ts` (`isLastMinute`, nu 14 dagen hard),
  `apps/logistiek/app/beheer/instellingen/`, `lib/uitleen-server.ts`
  (`getLogistiekSettings`), `app/materiaal/reservation-form.tsx`.
- **Doen:**
  1. Voeg `lastMinuteDays` toe aan de bestaande `logistiek.settings`-`Setting`
     (JSON-blob, geen migratie nodig) met **7** als default. De oude 14 was te
     ruim: bijna elke aanvraag kreeg de badge.
  2. `isLastMinute(pickupDate, requestedAt, days)`; de badge in
     `/beheer/aanvragen` gebruikt de instelling.
  3. Toon het aan het lid **vóór** indienen: zodra de gekozen afhaaldatum binnen
     de termijn valt, verschijnt in de `aside` een gele nota ("Dit is een
     last-minute aanvraag; Logistiek kan ze weigeren").
  4. Beheerveld op `/beheer/instellingen` naast de voertuigtarieven.
- **Klaar wanneer:** het team past de termijn zelf aan zonder deploy.

### M4. Werkgroepen staan niet meer onder "posten" ✅
**P1 · code**

- **Raakt:** `apps/logistiek/app/materiaal/event-fields.tsx`,
  `app/materiaal/event-values.ts`, `packages/auth/src/index.ts` (`AuthGroup`),
  `packages/auth/src/server/session.ts`.
- **Nu:** `session.groups` bevat posten én werkgroepen zonder onderscheid;
  `AuthGroup` heeft geen `type`. De keuzelijst noemt alles "post", terwijl
  `deriveMemberRequester` server-side wél correct `WERKGROEP` afleidt uit
  `Group.type`. De UI liegt dus tegenover de server.
- **Doen:**
  1. Voeg `type: GroupType` toe aan `AuthGroup` en vul het in
     `packages/auth/src/server/session.ts` (`membership.group.type`). Let op:
     dit raakt beide apps; controleer of niets op de vorm van `AuthGroup`
     assumeert.
  2. In de keuzelijst groepeer je met `<optgroup>`: "Posten" en
     "Werkgroepen en jaarwerkingen".
  3. Het label boven de keuze wordt "Namens" in plaats van "Post".
  4. Controleer `apps/logistiek/lib/test-users.ts`: er moet een testgebruiker
     met enkel een werkgroep-membership zijn, anders test je dit nooit.
- **Klaar wanneer:** een werkgroeplid ziet zijn werkgroep als werkgroep staan.

### M5. Items "uit de catalogus" bewerken en doorzoeken ✅
**P2 · code**

- **Raakt:** `apps/logistiek/app/beheer/materiaal/inventory-manager.tsx`
  (regels 249-272 voor de zoekfilter, 464-477 voor de inactieve lijst).
- **Nu:** de zoekfunctie draait enkel over `activeItems`; inactieve items staan
  in een `<details>` onderaan met enkel de knop "Terugzetten". Bewerken kan niet.
- **Doen:**
  1. Filter ook de inactieve lijst met dezelfde zoekterm en categoriekeuze, en
     toon in de `summary` hoeveel treffers erin zitten ("Uit de catalogus (3 van
     28)"), zodat je ziet dat je zoekterm daar iets raakt.
  2. Geef inactieve items dezelfde uitklapbare bewerkrij als actieve items
     (naam, categorie, aantal, waarborg, locatie, staat), zodat je een item kan
     corrigeren voor je het terugzet.
  3. Houd het visuele onderscheid: gedempte rij plus badge "uit de catalogus".
- **Klaar wanneer:** je vindt een gearchiveerd item via de zoekbalk en kan het
  bewerken zonder het eerst terug te zetten.

### M13. Set-inhoud uitklappen in de catalogus ✅
**P2 · code**

- **Raakt:** `apps/logistiek/app/materiaal/reservation-form.tsx` (de itemkaart),
  `apps/logistiek/app/materiaal/[id]/page.tsx` (toont de inhoud al),
  `lib/uitleen-server.ts` (`getCatalog` moet `setContents` meenemen).
- **Doen:**
  1. `getCatalog()` uitbreiden met `setContents` voor items met `isSet`.
  2. Op de kaart, naast de "Set"-badge, een uitklapper "Wat zit erin?" die de
     inhoud toont (label + aantal). Zuiver informatief; de inhoud telt niet mee
     voor de voorraad (zie `docs/uitleendienst.md`).
  3. Zelfde uitklapper in de beheertabel, zodat het team ziet wat er in een set
     hoort te zitten bij het klaarzetten.
- **Klaar wanneer:** je hoeft niet naar de detailpagina om te weten wat er in de
  cantusset zit.

### M6. Locatie van een item enkel voor Logistiek ✅
**P2 · code · beslist: B3**

- **Raakt:** `apps/logistiek/lib/uitleen-server.ts` (`getCatalog`, `itemDetail`),
  `app/materiaal/[id]/page.tsx`, `app/materiaal/reservation-form.tsx`.
- **Nu:** `locationShelf`/`locationRack` staan op `UitleenItem` en worden in het
  beheer getoond. Controleer of ze ook in de ledencatalogus lekken; de
  beslissing is dat wat we hebben elk lid mag zien, waar het ligt niet.
- **Doen:**
  1. Laat de locatievelden weg uit de **queries** die de ledencatalogus voeden,
     niet enkel uit de weergave. Een `select` zonder die velden is de enige
     variant die niet later per ongeluk terug opduikt in een payload.
  2. Toon ze op de detailpagina en in de klaarzetlijst (A7) enkel wanneer
     `canManage(session)`.
  3. Ga meteen na of er nog velden zijn die enkel het team aangaan
     (`conditionNote`, `adminNote`); pas dezelfde regel toe.
- **Klaar wanneer:** een gewoon lid krijgt nergens, ook niet in de netwerkrespons,
  het schap of rek van een item te zien.

### M15. Alternatief item ("is dit ook ok?") en opmerking per materiaallijn ✅
**P2 · 🗄️ · code · 📝**

- **Raakt:** `packages/db/prisma/schema.prisma` (`UitleenItem`,
  `UitleenReservationLine`), `apps/logistiek/app/beheer/materiaal/`,
  `app/materiaal/reservation-form.tsx`, `app/beheer/aanvragen/[id]/`.
- **Doen:**
  1. **Alternatief:** zelfrelatie op `UitleenItem`
     (`alternativeForId`/`alternatives`), of een tussentabel `UitleenItemAlternative`
     wanneer het wederzijds moet zijn (actieve en passieve boxen zijn elkaars
     alternatief). Kies de tussentabel; de zelfrelatie geeft eenrichtingsverkeer
     en dat blijkt in de praktijk altijd te weinig.
  2. In de catalogus: staat een item op 0 beschikbaar in de gekozen periode, dan
     toon je "Ook mogelijk: <alternatief>" met een knop die dat item toevoegt.
  3. **Opmerking per lijn:** `note String?` op `UitleenReservationLine`, in te
     vullen door zowel het lid ("liefst de zwarte") als het team ("zie vorig
     event"). Toon ze in het beheer en op de klaarzetlijst (A7).
  4. Beheer van alternatieven in de item-editor van `/beheer/materiaal`.
  5. Sectie in `docs/design-decisions.md`: een alternatief is een suggestie, geen
     automatische vervanging; de aanvrager kiest.
- **Klaar wanneer:** een lid dat geen actieve box meer kan krijgen, ziet meteen
  dat de passieve vrij is.

---

# Fase 5: vervoer ✅ af op 11 augustus 2026

Wat er tijdens het werk bijkwam:

- **`SaveState` heeft er een optionele `detail` bij gekregen**, in beide apps
  tegelijk (de twee bestanden waren identiek en horen dat te blijven). Zonder dat
  veld kon de conflictmelding de botsende rit niet noemen: `saveError(code)` mapt
  clientside op een vaste zin, en een onbekende code valt terug op "er ging iets
  mis". Een clientvertaling voor dezelfde code blijft voorgaan.
- **Goedkeuren en afwijzen werken op de hele aanvraag** (`tripGroupId`), en het
  goedkeurformulier draagt de uren van elke helft apart. Zo blijft V5 (schuiven)
  werken zonder dat V12 de conflictcheck moest leren omgaan met twee vensters per
  rij.
- **De karvlag staat op de chauffeur én op het voertuig.** Een check op
  `code == "kar"` zou een tweede aanhangwagen stil buiten de regel laten vallen.
  Postleden krijgen pas een `UitleenDriver`-rij zodra je die vlag zet; het gevolg
  (ze blijven na de post in de lijst staan) staat in `docs/design-decisions.md`.
- **De beheernavigatie is gegroepeerd** (Uitleen / Vervoer / Overig). "Chauffeurs"
  stond al in de nav, maar tussen negen losse tegels; het toevoegformulier stond
  bovendien onderaan de pagina achter een uitklapper, en dát was de eigenlijke
  vindbaarheidsklacht.

### V2. Chauffeurs toevoegen is vindbaar ✅
**P2 · code · klein**

- **Raakt:** `apps/logistiek/app/beheer/beheer-nav.tsx`,
  `apps/logistiek/app/beheer/chauffeurs/page.tsx`, `docs/uitleendienst.md`.
- **Nu:** `/beheer/chauffeurs` bestaat en doet precies wat gevraagd wordt (oud-
  logi toevoegen zonder `logistiek.manage`), maar de feedback vraagt "waar kan
  ik chauffeurs toevoegen". Het is dus een vindbaarheidsprobleem.
- **Doen:**
  1. Controleer of "Chauffeurs" in de beheer-navigatie staat en prominent genoeg
     is; zet het onder een kop "Vervoer" samen met Ritten en Voertuigen.
  2. Zet bovenaan `/beheer/chauffeurs` één zin uitleg: de lijst is de post
     Logistiek plus wie je hier toevoegt, en toevoegen geeft géén beheerrechten,
     enkel "Mijn ritten".
  3. De lege staat op `/beheer/vervoer` linkt er al heen; behoud dat.
- **Klaar wanneer:** iemand die "Jos is vanaf nu chauffeur" wil regelen, vindt
  het scherm zonder te vragen.

### V5. Twee aanvragen voor hetzelfde voertuig: uren verschuiven bij goedkeuring ✅
**P2 · code**

- **Raakt:** `apps/logistiek/app/actions/beheer.ts` (`approveTransportAction`,
  regel 543), `app/beheer/vervoer/transport-decision-forms.tsx`.
- **Nu:** de voorraadcheck weigert twee `APPROVED` ritten van hetzelfde voertuig
  die overlappen. Het team kan dus enkel goedkeuren of afwijzen, terwijl beide
  ritten vaak passen na een halfuur schuiven.
- **Doen:**
  1. Voeg begin- en einduur toe aan het goedkeurformulier, voorgevuld met de
     gevraagde uren (stap 15 minuten, zie V11). Bij goedkeuring slaat de actie de
     eventueel gewijzigde uren op, in dezelfde Serializable-transactie als de
     conflictcheck.
  2. Botst het toch, dan geeft de actie een nette fout mét de conflicterende rit
     ("Botst met de rit van Feest op za 12 sep 14:00-18:00"), niet enkel
     "voertuig bezet".
  3. Toon vóór de beslissing de andere ritten van datzelfde voertuig die dag,
     zodat je meteen ziet waar je naartoe kan schuiven.
  4. Verschoven uren zijn een wijziging aan de aanvraag: die moet gemeld worden
     (zie A9) en in de historiek (A6).
- **Klaar wanneer:** twee kar-aanvragen op dezelfde dag kunnen allebei
  goedgekeurd worden zonder database-ingreep.

### V8. Telefoonnummer van de bijrijder ✅
**P2 · 🗄️ · code · klein**

- **Raakt:** `packages/db/prisma/schema.prisma` (`UitleenTransportBooking`),
  `app/vervoer/request-form.tsx`, `app/beheer/vervoer/page.tsx`.
- **Nu:** `helpersNote` is vrije tekst over bijrijders; er is geen
  contactnummer, terwijl de chauffeur dat nodig heeft bij een werkgroeprit.
- **Doen:**
  1. Veld `helpersPhone String?` toevoegen (en overweeg meteen `contactPhone`
     voor de aanvrager zelf, zoals `UitleenReservation` dat al heeft).
  2. Optioneel veld in het aanvraagformulier, met een `tel:`-link in het beheer
     en in "Mijn ritten" (`app/ritten/page.tsx`), zodat een chauffeur vanop de
     baan kan bellen.
- **Klaar wanneer:** de chauffeur bereikt de bijrijder zonder in de mail te
  zoeken.

### V9. Chauffeurs: auto of kar ✅
**P2 · 🗄️ · code**

- **Raakt:** `packages/db/prisma/schema.prisma` (`UitleenDriver`),
  `lib/uitleen-server.ts` (`driverOptions`, `driverPool`),
  `app/beheer/chauffeurs/driver-list.tsx`, `app/beheer/vervoer/driver-select.tsx`.
- **Doen:**
  1. Veld op `UitleenDriver`: `canDriveTrailer Boolean @default(false)` (elke
     karchauffeur is ook autochauffeur, dus één vlag volstaat; een enum met
     AUTO/KAR suggereert ten onrechte dat het elkaar uitsluit).
  2. Chauffeurs uit de post Logistiek hebben geen `UitleenDriver`-rij. Kies:
     ofwel maak je bij het aanvinken automatisch een rij aan, ofwel verhuis je de
     vlag naar een apart model `UitleenDriverProfile` op `userId`. Neem het
     eerste: één tabel blijft eenvoudiger, en `driverPool()` vult de post-leden
     al aan.
  3. In `driver-select.tsx`: bij een rit met de kar toon je enkel karchauffeurs
     bovenaan en de rest onder een kop "Niet met de kar", uitgegrijsd maar
     kiesbaar (het team beslist).
  4. Toon de vlag als badge in de chauffeurslijst.
- **Klaar wanneer:** je kan niet per ongeluk een autochauffeur op een karrit
  zetten zonder het te merken.

### V12. Heen- en terugrit in één aanvraag ✅
**P3 · 🗄️ · code · 📝**

- **Raakt:** `UitleenTransportBooking`, `app/vervoer/request-form.tsx`,
  `app/actions/uitleen.ts`, `/beheer/vervoer`.
- **Doen:**
  1. Kies het model, en noteer de keuze in `docs/design-decisions.md`:
     - **A:** één boeking met een tweede tijdvenster (`returnStartAt`/
       `returnEndAt`). Eenvoudig, maar elke query over "wanneer is de kar bezet"
       moet twee vensters kennen; dat raakt de conflictcheck, de kalender en het
       weekoverzicht.
     - **B:** twee boekingen met een gedeelde `tripGroupId`. De conflictcheck
       blijft ongewijzigd, de UI toont ze als één aanvraag. **Aanbevolen.**
  2. Bij B: `tripGroupId String?` met index; goedkeuren/afwijzen werkt op de hele
     groep, tenzij het team er expliciet één uit haalt.
  3. Het formulier krijgt een schakelaar "heen en terug" met een tweede
     tijdvenster; de prijs is de som van beide ritten.
- **Klaar wanneer:** een aanvrager hoeft niet twee keer hetzelfde formulier in
  te vullen voor een gewone heen-en-terug.

### V1. Meerdere voertuigen tegelijk aanvragen
**P3 · code**

- **Raakt:** `app/vervoer/request-form.tsx`, `app/actions/uitleen.ts`.
- **Nu:** de voertuigkeuze is een radio; per voertuig een aparte aanvraag.
- **Doen:** meerkeuze in het formulier, die server-side N boekingen aanmaakt met
  hetzelfde `tripGroupId` (zie V12). Bouw dit dus **na** V12, want het deelt de
  groepering. Komt zelden voor: laag in de lijst.

### V13. Publiek transportoverzicht zonder login ✅
**P2 · code · beslist: B7**

- **Raakt:** nieuwe publieke route in `apps/logistiek`, `lib/uitleen-server.ts`.
- **Doen:** een read-only weekraster dat enkel voertuig, dag en tijdvenster
  toont, zonder naam, doel, adres of chauffeur. Schrijf daarvoor een **eigen
  query met een smalle `select`**, en filter niet de beheerquery uit V7: die
  laatste sleept naam, adres en chauffeur mee en lekt vroeg of laat een veld in
  de payload. Zet `robots: noindex` op de pagina.
- **Klaar wanneer:** je kan de link doorsturen naar iemand zonder VTK-account en
  er staat niets privacygevoelig op.

---

# Fase 6: flesserke ✅ af op 11 augustus 2026

Wat er tijdens het werk bijkwam:

- **F5 was geen bug.** Een werkgrooplid komt gewoon door de gate: nagekeken met de
  personas mechanix, post en student, en enkel die laatste (zonder groep) wordt
  tegengehouden. Wat wél fout stond, waren de teksten: "enkel voor het
  praesidium" op de pagina, in de foutmeldingen en in `docs/uitleendienst.md`.
  Die zijn rechtgezet. Ziet een werkgrooplid de tab toch niet, dan hangt zijn
  account dit werkingsjaar aan geen enkele groep; dat is ledenbeheer op vtk.be.
- **De aanname in F7 klopte niet:** het gedeelde `ReservationForm` heeft géén
  flesserke-sectie. De team-editor gebruikt daarom `FlesserkeForm` met een derde
  modus (`admin-edit`) en een eigen actie, want de voorraadcheck van flesserke is
  een andere dan die van materiaal (niet per periode, maar in zijn geheel tot het
  terugkomt).
- **De migratie draagt een backfill mee:** elk bestaand item werd één lading met
  het aantal en de datum die het had. Zonder die stap zou elk item op nul komen
  te staan zodra de app de som van de ladingen als voorraad neemt.
- **Aantal en vervaldatum staan niet meer op het itemformulier bij het bewerken.**
  Twee plaatsen om hetzelfde getal te zetten is een uitnodiging om ze uit elkaar
  te laten lopen; bij het aanmaken vraagt het formulier ze wel, want dat wordt de
  eerste lading.

### F2. Bestaande flesserke-items bewerken ✅
**P1 · code**

- **Raakt:** `apps/logistiek/app/beheer/flesserke/flesserke-manager.tsx`,
  `apps/logistiek/app/actions/beheer.ts` (`saveFlesserkeItemAction` bestaat al en
  aanvaardt een `id`).
- **Nu:** de tabel biedt enkel snel-bewerken van het aantal en "uit lijst". De
  `ItemFields`-component ondersteunt een bestaand item (`item?.brand` enz.) maar
  wordt enkel voor "nieuw" gebruikt.
- **Doen:**
  1. Maak elke voorraadrij uitklapbaar met een `SaveForm` rond `ItemFields`,
     met `id` en `expectedUpdatedAt` als hidden inputs (zelfde patroon als de
     categorieën verderop in datzelfde bestand).
  2. Toasts en foutcodes via `ITEM_ERRORS`; geen redirect naar dezelfde pagina
     (CLAUDE.md), wel `revalidatePath('/beheer/flesserke')`.
- **Klaar wanneer:** een tikfout in een merk of vervaldatum is ter plekke recht
  te zetten.

### F3. Identieke items met verschillende vervaldata ✅
**P2 · 🗄️ · code · 📝**

- **Raakt:** `UitleenFlesserkeItem` (nu één `expiryDate` en één `quantity`),
  `flesserke-manager.tsx`, `lib/uitleen-server.ts` (`flesserkeReserved`,
  `flesserkeAvailability`).
- **Nu:** één rij per product, dus twee ladingen cola met verschillende
  vervaldata passen niet.
- **Doen:**
  1. Kies het model en leg het vast in `docs/design-decisions.md`:
     - **A:** batches. Nieuw model `UitleenFlesserkeBatch` (`itemId`, `quantity`,
       `expiryDate`); `item.quantity` wordt de som. Correct, maar raakt de
       voorraadberekening, het aanvraagscherm en het afboeken bij terugbrengen.
     - **B:** enkel de eerstvolgende vervaldatum bijhouden (huidig gedrag) en het
       team laat de oudste eerst opgaan. Nul code, maar de vraag blijft.
     - **Aanbevolen: A**, want de rode "vervalt binnen 3 weken"-markering slaat
       nu op de hele stapel en dat is fout zodra er twee ladingen liggen.
  2. Bij A: het afboeken bij terugbrengen (`markReturnedAction`) haalt van de
     oudste batch eerst (FIFO).
  3. De beheertabel toont "3 batches, eerstvolgende 12/09" met de batches in de
     uitklapper van F2.
- **Klaar wanneer:** twee ladingen van hetzelfde product met verschillende
  vervaldata staan correct in de voorraad.

### F5. Werkgroepen en jaarwerkingen kunnen flesserke aanvragen ✅
**P1 · code**

- **Raakt:** `apps/logistiek/app/flesserke/page.tsx` (regel 18: de gate
  `session.groups.length === 0`), `app/actions/uitleen.ts`
  (`createFlesserkeReservationAction` en de server-side hercheck),
  `docs/uitleendienst.md`.
- **Nu:** de gate is "heeft minstens één groep". In theorie zit een werkgroeplid
  daar al in; de feedback zegt dat ze de optie niet zien.
- **Doen:**
  1. **Eerst reproduceren.** Log in als een testgebruiker met enkel een
     werkgroep-membership (`lib/test-users.ts`; voeg er eentje toe als die niet
     bestaat) en kijk of `/flesserke` toegankelijk is en of de tab in de header
     staat.
  2. Is de gate het probleem, dan hangt het waarschijnlijk aan de header/hub:
     controleer waar de flesserke-link verborgen wordt (`components/site-header.tsx`,
     `app/page.tsx`) en of die dezelfde voorwaarde gebruikt als de pagina.
  3. Is het membership het probleem (werkgroepleden staan niet als
     `GroupMembership` in de DB), dan is dit geen logistiek-taak maar een
     ledenbeheer-taak; meld dat expliciet in plaats van de gate open te zetten.
  4. Werk `docs/uitleendienst.md` bij: daar staat nu "enkel praesidium".
- **Klaar wanneer:** een werkgroeplid ziet de flesserke-tab en kan indienen.

### F6. "Van tot" bij flesserke ✅
**P3 · code**

- **Raakt:** `app/flesserke/request-form.tsx`, `lib/reservation-form.ts`.
- **Nu:** flesserke hangt aan `UitleenReservation` en erft dus afhaal- én
  terugbrengdatum, terwijl verbruiksgoed niet terugkomt (behalve wat gesloten
  blijft).
- **Doen:** hernoem de labels naar "Klaarzetten tegen" en "Rest terug tegen", en
  maak de tweede optioneel met een default van dezelfde dag. Geen schemawijziging:
  `returnDate` blijft nodig voor het afboeken van het verbruik.
- **Klaar wanneer:** het formulier leest zoals het werkt.

### F7. Flesserke-aanvraag bewerken als logistieker ✅
**P2 · code**

- **Raakt:** `app/beheer/aanvragen/[id]/admin-edit-form.tsx` (materiaal kan het
  al), `app/flesserke/edit-form.tsx` (lid-versie), `app/actions/beheer.ts`
  (`adminEditReservationAction`, regel 449).
- **Nu:** `adminEditReservationAction` werkt op de materiaallijnen; de
  flesserke-lijnen van dezelfde reservatie kan het team niet aanpassen.
- **Doen:**
  1. Breid de admin-edit uit met de flesserke-sectie (het gedeelde
     `ReservationForm` heeft die sectie al; geef ze door in team-modus).
  2. De voorraadhercheck in dezelfde Serializable-transactie moet ook de
     flesserke-beschikbaarheid opnieuw nagaan (`flesserkeReserved`).
  3. Let op reeds ingevulde `returnedQuantity`: een lijn die al afgeboekt is,
     mag je niet zomaar in aantal wijzigen. Blokkeer dat met een duidelijke fout.
- **Klaar wanneer:** het team kan een flesserke-aanvraag corrigeren zonder ze te
  laten hermaken.

---

# Fase 7: de grote stukken

Deze veranderen het model of de werking. Doe ze één per één, elk met een eigen
sectie in `docs/design-decisions.md`.

### A9. Communiceren wanneer Logistiek een aanvraag wijzigt ✅
**P1 in belang, groot in werk · 🗄️ · code · 📝** · af op 11 augustus 2026

Wat er tijdens het werk bijkwam:

- **De diff kwam in `lib/uitleen.ts` terecht, niet in de mailmodule.**
  `describeReservationChanges` is puur en getest, en de historiek gebruikt hem
  net zo goed als de mail: de auditregel bij een team-edit was "3 materiaallijnen
  na de wijziging" en zegt nu "Tafel: 5 → 3; Afhalen: za 12 → zo 13 september".
  Eén beschrijving, twee bestemmingen.
- **Een heen-en-terugaanvraag krijgt één mail, geen twee.** `notifyTransport`
  neemt een lijst id's: beide ritten worden samen beslist (V12), dus twee mails
  vlak na elkaar over dezelfde aanvraag zouden lezen als een fout.
- **`SaveState` kreeg geen nieuw veld nodig**, maar `sendMail` wel: `cc` voor het
  meelezende adres. Dat zit nu in `packages/mail` en is dus ook voor de hoofdsite
  beschikbaar.
- **Lokaal met een mailcatcher zonder STARTTLS zie je niets.** `requireTLS` staat
  bewust aan (juli 2026), dus een catcher op `127.0.0.1:1025` antwoordt met
  `502 Command not implemented` en er vertrekt niets; de actie zelf gaat wel door,
  wat precies de bedoeling is. Zet `SMTP_HOST` leeg om de mails in de dev-log te
  lezen. Staat in `docs/uitleendienst.md`.

- **Raakt:** nieuw gedeeld mailpakket, `apps/logistiek/app/actions/beheer.ts`
  (alle beslis- en bewerkacties), `packages/db/prisma/schema.prisma`.
- **Nu:** `apps/logistiek` verstuurt geen enkele mail. De mailhelper zit in
  `apps/web/lib/mail.ts` en is niet gedeeld. Wie iets wijzigt aan een aanvraag,
  laat de aanvrager in het ongewisse.
- **Doen:**
  1. **Eerst de infrastructuur.** Hijs `apps/web/lib/mail.ts` naar
     `packages/mail` (net zoals `@vtk/payments` gehoist werd) en laat beide apps
     die gebruiken. Neem de EHLO- en STARTTLS-lessen mee die in dat bestand
     staan; die hebben al een avond gekost (zie de commits van juli 2026).
     Regenereer de lockfile from scratch na het toevoegen van de dep (AGENTS.md).
  2. **Waar de mail heen gaat.** Voeg `notifyEmail String?` toe aan
     `UitleenReservation` en `UitleenTransportBooking`, met een optioneel veld in
     het aanvraagformulier ("Extra adres dat op de hoogte blijft, bv.
     logistiek.existenz@vtk.be"). Mail altijd naar de aanvrager, en in kopie
     naar dat adres.
  3. **Welke momenten mailen.** Goedgekeurd, afgewezen, gewijzigd door het team
     (materiaal, uren, voertuig), en teruggedraaid (A5). Niet: elke
     statusstap in het beheer, anders leest niemand het nog.
  4. **Wat er in staat.** Zeg wat er veranderd is, niet enkel dat er iets
     veranderd is: "3 van de 5 tafels goedgekeurd", "rit verschoven naar 14:30".
     Bouw de diff uit de historiek van A6.
  5. Verzending mag de server action niet doen falen: log de fout en ga door,
     zoals de ticketing-outbox dat doet.
  6. Respecteer `smtpConfigured()`: in dev zonder SMTP wordt er gelogd, niet
     stilzwijgend "verstuurd" gemeld.
- **Klaar wanneer:** een aanvrager weet zonder in te loggen dat zijn aanvraag
  gewijzigd is, en de werkgroepmailbox weet het mee.

### A7. Materiaal klaarzetten: afvinken en afdrukken ✅
**P2 · 🗄️ · code · beslist: B1** · af op 11 augustus 2026

Wat er tijdens het werk bijkwam:

- **`prepareNote` is er niet gekomen.** De lijn-nota uit M15 dekt het volledig, en
  het plan gaf zelf al aan dat de twee overlappen; twee notitievelden per lijn
  worden in de praktijk allebei half ingevuld.
- **Twee bugs die pas bij het klikken zichtbaar werden.** De lijnen hadden geen
  `orderBy`, dus een afgevinkte lijn sprong naar onderen (de rij verhuist in de
  heap na een update): dat schuift de lijst weg onder de handen van wie staat af
  te vinken. En de doorhaling van een klaargezette lijn erfde door naar de
  plaatscode, wat leest als een plaats die niet meer klopt.
- **Een team-edit wist de vinkjes.** De edit vervangt de lijnen, dus wie enkel de
  datum verschoof, mocht opnieuw beginnen. Een lijn die niet veranderde (zelfde
  item, zelfde aantal) behoudt nu haar vinkje.
- **De gewone materiaallijst verdwijnt zodra er klaargezet kan worden**, want de
  klaarzetlijst is diezelfde lijst met vinkjes erbij; twee keer tonen leest als
  twee lijsten.
- **De print-CSS staat in `globals.css`, niet als `print:hidden` per component.**
  Header, voetnoot en beheernavigatie horen op geen enkele afdruk thuis, van welke
  pagina ook.

- **Raakt:** `packages/db/prisma/schema.prisma`
  (`UitleenReservationLine`), `app/beheer/aanvragen/[id]/`, nieuwe printroute.
- **Doen:**
  1. Per lijn: `preparedAt DateTime?`, `preparedById String?`, `prepareNote
     String?` (die laatste overlapt met de lijn-nota uit M15; doe M15 eerst en
     hergebruik het veld).
  2. Op de detailpagina een klaarzet-modus: elk item een vinkje, met de locatie
     (schap/rek) ernaast en een teller "7 van 12 klaargezet". Bewaart per klik,
     zonder de hele pagina te herladen.
  3. Printbare weergave (`/beheer/aanvragen/[id]/print`): één A4 per aanvraag met
     evenement, post, afhaal- en terugbrengdatum, alle lijnen met locatie en
     nota, en een handtekeningvak. Puur CSS `@media print`; geen PDF-generator.
  4. De lijst van vandaag afdrukken in één keer, vanaf de kalender ("Print alle
     afhalingen van deze dag").
- **Klaar wanneer:** een logikot-shift kan met de printjes werken én online
  afvinken, zonder dubbel werk.

### A8. Alles onder één evenement
**P3 · 🗄️ · code · beslist: B2 · grootste stuk**

- **Nu:** `UitleenReservation` (materiaal + flesserke) en
  `UitleenTransportBooking` dragen elk hun eigen `eventName` als vrije tekst.
  Er is geen enkele koppeling tussen de aanvragen van hetzelfde evenement.
- **Doen:**
  1. Nieuw model `UitleenEvent`: naam, locatie, start, post/werkgroep, aanvrager,
     notities. `UitleenReservation.eventId` en
     `UitleenTransportBooking.eventId`, beide nullable, zodat bestaande
     aanvragen blijven werken.
  2. Migratiescript dat bestaande aanvragen groepeert op (`eventName`
     genormaliseerd, `groupId`, datumbereik binnen dezelfde week) en er een
     `UitleenEvent` van maakt. Draai het als dry-run en laat het team de
     groepering nakijken vóór je het echt uitvoert.
  3. Nieuw scherm `/beheer/evenementen`: per evenement zie je materiaal,
     flesserke en transport naast elkaar, met per onderdeel de status en een
     waarschuwing wanneer er iets ontbreekt ("geen transport aangevraagd").
  4. De transportverantwoordelijke ziet per evenement het aantal en het volume
     van het materiaal, om de lading in te schatten. Dat vraagt een
     `volumeLiters`- of `sizeClass`-veld op `UitleenItem`; anders is het een
     itemtelling en zeg dat dan ook zo in de UI.
  5. Het aanvraagformulier krijgt bovenaan "Hoort bij een bestaand evenement?"
     met een zoekveld; nieuw evenement blijft de default.
  6. De losse overzichten (`/beheer/aanvragen`, `/beheer/vervoer`) blijven
     bestaan. Het evenementscherm komt erbij, het vervangt niets.
- **Klaar wanneer:** je ziet per evenement in één scherm wat er aangevraagd is
  en wat ontbreekt.
- **Waarschuwing:** dit raakt de aanvraagflow, alle beheerschermen, de kalender
  en de mails. Doe het niet vóór fase 1 tot en met 6 afgewerkt zijn.

### M1. Staat per exemplaar ✅
**P2 · 🗄️ · code · 📝** · af op 11 augustus 2026

Wat er tijdens het werk bijkwam:

- **`quantity` wordt de bijgehouden telling**, zoals bij de flesserke-ladingen,
  in plaats van elke beschikbaarheidscheck te laten uitzoeken of dit item
  exemplaren heeft. Dat scheelde een aanpassing in zes call-sites en houdt de
  voorraadberekening één kolom.
- **Een knop "opsplitsen in n exemplaren"** was nodig: handmatig twaalf
  exemplaren toevoegen doet niemand, en dan blijft de staat per exemplaar
  ongebruikt liggen.
- **Twee plaatsen die de voorraad konden overschrijven** zijn dichtgezet: de
  snelle voorraadbijstelling in de tabel weigert nu met uitleg, en het
  itemformulier laat de telling winnen (het veld staat er read-only, maar een
  oud tabblad post nog het oude getal).
- **De staatkolom in de tabel toont bij exemplaren iets anders**: "1 kapot van 3"
  in plaats van de staat van de rij, die dan niets meer zegt. Op de detailpagina
  staat per afwijkend exemplaar wat eraan scheelt.

- **Nu:** `UitleenItem.condition` geldt voor de hele rij van N stuks. Van vier
  frigo's kan er dus geen enkele als kapot gemarkeerd worden zonder ze alle vier
  te markeren.
- **Doen:**
  1. Nieuw model `UitleenItemUnit` (`itemId`, `label` bv. "Box 3",
     `condition`, `conditionNote`, `active`). `item.quantity` wordt de telling
     van de actieve units zodra er units bestaan; zonder units blijft de huidige
     `quantity` gelden, zodat je niet de hele inventaris moet opsplitsen.
  2. Beschikbaarheid trekt kapotte units af (`condition = KAPOT` telt niet mee);
     dat is een gedragswijziging tegenover vandaag (`condition` is nu puur
     informatief), dus noteer ze in `docs/design-decisions.md`.
  3. Reserveren blijft op itemniveau, niet per exemplaar. Een specifiek
     exemplaar toewijzen hoort bij het klaarzetten (A7), niet bij het aanvragen.
  4. In de item-editor: uitklapbare unitlijst met per unit de staat en een nota.
- **Klaar wanneer:** één kapotte box haalt één stuk uit de beschikbaarheid.

### M2. Conflicterende aanvragen doorgeven, en ze uit elkaar schuiven
**P2 · code · beslist: B6**

- **Raakt:** `app/materiaal/reservation-form.tsx`, `app/actions/uitleen.ts`,
  `app/beheer/aanvragen/page.tsx` en `[id]/`, `lib/uitleen-server.ts`.
- **Nu:** een lid dat materiaal wil dat al volledig geboekt is, ziet enkel "niet
  beschikbaar in je periode" en kan de aanvraag niet indienen. Er is geen kanaal.
- **Doen:**
  1. Sta indienen toe met een teveel, maar markeer de lijn als conflict.
     Bereken dat **altijd opnieuw** (afgeleid, nooit opgeslagen): de situatie
     verandert zodra een andere aanvraag goedgekeurd of geannuleerd wordt.
  2. Het lid ziet vóór indienen exact wat er niet past en bevestigt expliciet.
  3. Het team ziet in `/beheer/aanvragen` een badge "conflict" en op de
     detailpagina met welke aanvraag het botst, wie er eerst was, en de periodes
     van beide naast elkaar.
  4. **Schuiven in plaats van afwijzen.** Vanaf de detailpagina kan het team de
     afhaal- en terugbrengdatum van elk van beide aanvragen aanpassen, met een
     live hercheck of ze daarmee samen passen. Dat is dezelfde ingreep als V5
     bij vervoer; hergebruik de aanpak.
  5. **Mailen vanuit het scherm.** Een knop die beide aanvragers aanschrijft met
     de voorgestelde verschuiving. Vraagt de mailinfrastructuur uit A9; bouw M2
     dus na A9, of laat de knop in eerste instantie een `mailto:` openen met een
     voorgevulde tekst.
  6. De harde voorraadcheck bij **goedkeuren** blijft ongewijzigd: een conflict
     kan aangevraagd worden, niet goedgekeurd. Zo blijft de voorraad kloppen.
- **Klaar wanneer:** een tweede aanvrager kan zijn vraag kwijt, en Logistiek kan
  de twee periodes uit elkaar schuiven zonder de tweede af te wijzen.

### M12. Reserveren per dagdeel
**P2 · 🗄️ · code · beslist: B9**

- **Nu:** `pickupDate`/`returnDate` zijn hele dagen (`@db.Date`); de uren spreekt
  het team af. De feedback wil "starten op de middag" kunnen aangeven.
- **Doen (indien B9 = dagdelen):**
  1. Enum `UitleenDayPart { VOORMIDDAG, NAMIDDAG, AVOND }` plus
     `pickupPart`/`returnPart` op `UitleenReservation`, beide optioneel.
  2. **Belangrijk:** laat de voorraadberekening op hele dagen. Dagdelen zijn een
     afspraak tussen mensen, geen boekingseenheid; anders moet elke
     overlapquery herschreven worden voor halve dagen en wint niemand daarbij.
     Zeg dat expliciet in `docs/design-decisions.md`.
  3. Toon het dagdeel in de kalender en op de klaarzetlijst.
- **Klaar wanneer:** "afhalen dinsdagnamiddag" staat in het systeem in plaats van
  in een mail.

### M17. Sjabloon-aanvraag (bv. cantus)
**P3 · 🗄️ · code**

- **Doen:**
  1. Model `UitleenRequestTemplate` (`name`, `description`, `groupId?`,
     `createdById`, lijnen naar items met aantallen). Beheerd door
     `logistiek.manage`; posten mogen hun eigen sjablonen niet zelf maken in v1.
  2. In het aanvraagformulier bovenaan: "Start van een sjabloon" met een
     keuzelijst; kiezen vult de aantallen in, alles blijft daarna bewerkbaar.
  3. Vanuit een bestaande aanvraag "Bewaar als sjabloon" in het beheer.
- **Klaar wanneer:** een cantus aanvragen is één keuze plus wat bijstellen.

### M18. Aanvraag later afwerken (concept)
**P2 · 🗄️ · code**

- **Nu:** verlaat je het formulier, dan ben je alles kwijt.
- **Doen:**
  1. Eenvoudigste versie eerst: bewaar de formulierstaat in `localStorage` per
     gebruiker en herstel ze met een banner ("Je had een aanvraag in
     opbouw; verder werken of weggooien?"). Geen migratie, dekt 90 procent.
  2. Echte concepten (zichtbaar op een ander toestel) vragen een status `DRAFT`
     op `UitleenReservation`. Dan moet élke query die vandaag "alle reservaties"
     zegt, `DRAFT` uitsluiten: voorraad, kalender, beheerlijsten, mijn
     reservaties. Doe dat pas als versie 1 te kort blijkt.
  3. Bij A8: een concept hangt logisch onder het evenement.
- **Klaar wanneer:** een half ingevulde aanvraag overleeft een gesloten tabblad.

### M16. Barcodes op het materiaal: vervallen
**Beslist op 10 augustus 2026: nee (B8).**

Het afvinken bij het klaarzetten (A7) beantwoordt dezelfde vraag ("wanneer is
dit stuk laatst gezien") zonder labels, scanners of een model per exemplaar.
Komt de vraag terug, dan bouwt ze voort op `UitleenItemUnit` uit M1.

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
- Raakt een taak de werking van de kring, dan hoort er een sectie in
  `docs/design-decisions.md`; raakt ze de architectuur, dan werk je
  `docs/uitleendienst.md` bij.
- Dev draait met `npm run dev -w @vtk/logistiek` (poort 3100, webpack; nooit
  Turbopack).
