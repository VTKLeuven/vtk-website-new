# Werkplan: feedbackronde 2 van Logistiek op de logistiek-app

Bron: tweede feedbackronde van het team Logistiek op `apps/logistiek` (augustus 2026).
Dit document bouwt voort op `docs/logistiek-feedback-plan.md` (feedbackronde 1,
volledig afgewerkt op 11 augustus 2026) en zet de nieuwe feedback om in
afgebakende opdrachten.

Technische kaart van de module: `docs/uitleendienst.md`.
Productkeuzes: `docs/design-decisions.md` (§ Uitleendienst).
Rechten: `docs/permissions.md`.
Ingebruikname: `docs/logistiek-ingebruikname.md`.

## Hoe je dit gebruikt

1. Kies een fase (of één taak) en geef die in plan-modus.
2. Taken met **🗄️** vragen een Prisma-migratie in `packages/db/prisma/schema.prisma`.
3. Taken met **📝** vragen een sectie in `docs/design-decisions.md`.
4. Vink af in dit bestand als iets af is; zet er het commit-hashje bij.

Prioriteiten: **P1** = bug of dagelijkse ergernis, **P2** = duidelijke
verbetering, **P3** = groter of "ooit".

## Afgevinkt

Een ✅ voor de taaktitel betekent: af, met het commit-hashje erbij. R8 staat er
ook bij maar werd anders opgelost dan gevraagd; de reden staat bij de taak.

## Statusoverzicht

| Fase | Inhoud | Taken | Status |
| --- | --- | --- | --- |
| 0 | Beslissingen die eerst moeten vallen | 4 vragen | ✅ beslist |
| 1 | Kleine bugs, UI-fixes en ergernissen | R1–R8 | 🟡 R5, R7 open |
| 2 | Navigatie, lay-out en overzichten | N1–N5 | ✅ af |
| 3 | Materiaal: opmerkingen, deelgoedkeuring, sjablonen | M1–M8 | 🟡 M6 open |
| 4 | Vervoer: terminologie, goedkeuring, weekoverzicht | T1–T13 | 🟡 T2 open |
| 5 | Flesserke en kalender | F1–F3 | ✅ af |
| 6 | Evenementen: post-overzicht, materiaallijst, C&G | E1–E7 | ✅ af |

---

# Fase 0: beslissingen die eerst moeten vallen

Deze vragen komen uit de feedback en bepalen wat er gebouwd wordt. Leg de
motivatie per keuze vast in `docs/design-decisions.md`.

Alle vier beslist op 22 augustus 2026; de motivatie staat in
`docs/design-decisions.md` § Feedbackronde 2 (augustus 2026): vier keuzes vooraf.

- **B1 = koppelen.** De Collect&Go-import bestaat al (commit 2d05b60); E5 voegt
  enkel de koppeling `CollectEnGoOrder` -> `UitleenEvent` toe, geen tweede
  invoerweg.
- **B2 = ja, voor iedereen, maar via de keuzelijst.** "Nieuw sjabloon" staat
  onderaan de lijst met bestaande sjablonen, zodat je er eerst langs moet.
  Iedereen ziet elk sjabloon; de post erop blijft een label, geen filter.
- **B3 = strikt.** Externen zien geen evenementkeuze, geen sjabloonkeuze en
  nooit de lijst van evenementen.
- **B4 = vast, afgeleid van de chauffeur-id.** Hash op een vast palet van
  tokens; geen kolom, geen kleurkiezer.

| # | Vraag | Context |
| --- | --- | --- |
| B1 | **C&G-bestellingen importeren via e-mail?** | De feedback stelt voor om een mailadres aan te maken waar Colruyt-bevestigingen naartoe gaan, zodat een ordernummer ingeven op de site de bestelling automatisch importeert. Dit vereist een mailbox-integratie (IMAP/webhook) en heeft security-implicaties. Alternatief: handmatige CSV/copy-paste import. |
| B2 | **Mogen posten en werkgroepen zelf sjablonen aanmaken?** | Ronde 1 beperkte sjablonen tot `logistiek.manage`. De feedback vraagt nu of posten/werkgroepen hun eigen sjablonen mogen beheren. |
| B3 | **Hoe zichtbaar zijn evenementen voor externen?** | Externen hoeven "hoort dit bij een evenement?" en de sjabloonselectie niet te zien/krijgen, en mogen niet zien welke evenementen er allemaal zijn. Hoe strikt afschermen? |
| B4 | **Chauffeurskleuren in het weekoverzicht — vast of instelbaar?** | De feedback wil dat elke chauffeur een kleur krijgt in het weekoverzicht, zoals op de Litus. Vaste kleuren of instelbaar? |

---

# Fase 1: kleine bugs, UI-fixes en ergernissen

Alles hier is klein, zichtbaar en zonder (of met een minimale) migratie.

### ✅ R1. Evenementnaam tonen bij vervoer in "Mijn reservaties"
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/reservaties/page.tsx` (transportsectie).
- **Nu:** onder vervoer wordt het voertuig en het doel getoond, maar niet de
  titel van het evenement waar de rit bij hoort.
- **Doen:** toon `event.name` als koptekst boven de ritten van dat event, of als
  tag voor elke rit. Gebruik de `eventId`-relatie die in ronde 1 (A8) is gebouwd.
- **Klaar wanneer:** je ziet bij je vervoerreservaties meteen voor welk
  evenement de rit is.

### ✅ R2. Afgelopen reservaties verbergen met optie tot openklappen
**P1 · code**

- **Raakt:** `apps/logistiek/app/reservaties/page.tsx`,
  `apps/logistiek/app/beheer/aanvragen/page.tsx`,
  `apps/logistiek/app/beheer/vervoer/page.tsx`.
- **Nu:** alle reservaties staan zichtbaar, ook afgelopen. Bij veel gebruik
  wordt de lijst onoverzichtelijk.
- **Doen:**
  1. Groepeer reservaties in "Lopend" en "Afgelopen" (op basis van `returnDate`
     < vandaag voor materiaal, `endAt` < vandaag voor vervoer).
  2. "Afgelopen" staat standaard ingeklapt achter een `<details>` met een
     teller ("Afgelopen (14)").
  3. Zelfde behandeling in de beheer-overzichten.
- **Klaar wanneer:** je ziet bij het openen alleen je actieve reservaties.

### ✅ R3. Soort aanvraag tonen in beheer aanvraaglijst
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/beheer/aanvragen/page.tsx`,
  `apps/logistiek/app/beheer/vervoer/page.tsx`.
- **Nu:** bij "aangevraagd", "goedgekeurd" etc. staat niet of het om materiaal
  of flesserke gaat.
- **Doen:** voeg een badge toe ("Materiaal", "Flesserke", of beide) op basis
  van of er `reservationLines` en/of `flesserkeLines` bestaan.
- **Klaar wanneer:** je ziet in één oogopslag welk type aanvraag het is.

### ✅ R4. Betaling verbergen voor interne posten en werkgroepen
**P2 · code · 📝**

- **Raakt:** aanvraagformulieren, beheer-detailpagina's, "Mijn reservaties".
- **Nu:** prijs en betaalstatus worden altijd getoond.
- **Doen:**
  1. Bepaal op basis van `requesterType` (POST, WERKGROEP) of de betaalkolom
     zichtbaar is.
  2. Verberg prijs, waarborg en betaalstatus voor interne aanvragen, zowel
     voor de aanvrager als in het beheer.
  3. Leg de regel vast in `docs/design-decisions.md`: welke typen intern zijn.
- **Klaar wanneer:** een postlid ziet bij zijn aanvraag geen bedrag.

### R5. Wijzigingen door logi highlighten voor de aanvrager
**P2 · code**

- **Raakt:** `apps/logistiek/app/reservaties/page.tsx`,
  `apps/logistiek/app/beheer/aanvragen/[id]/page.tsx`,
  de historiek uit ronde 1 (A6).
- **Nu:** een aanvrager moet zelf uitzoeken wat er veranderd is.
- **Doen:**
  1. Gebruik de `UitleenAuditLog` uit A6 om wijzigingen door het team te
     detecteren sinds het laatste bezoek van de aanvrager.
  2. Toon een badge "Gewijzigd" of een gele highlight op de reservatiekaart.
  3. Op de detailpagina markeer welke velden gewijzigd zijn (bv. een
     gele achtergrond of "Nieuw:" prefix).
  4. De highlight verdwijnt zodra de aanvrager de detail bekijkt (bewaar
     `lastSeenAt` per reservatie per user, of gebruik een simpelere heuristiek
     met `updatedAt` vs `lastViewedAt`).
- **Klaar wanneer:** een aanvrager ziet direct dat logi iets heeft aangepast.

### ✅ R6. Historiek inklappen
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/beheer/aanvragen/[id]/page.tsx`,
  `apps/logistiek/app/beheer/vervoer/page.tsx`.
- **Nu:** de historiek (tijdlijn uit A6) staat altijd open.
- **Doen:** wikkel de historiek in een `<details>` element, standaard ingeklapt
  tenzij er ongelezen entries zijn.
- **Klaar wanneer:** de historiek neemt geen plek in als je er niet naar kijkt.

### R7. Verplichte velden markeren met sterretje en validatiefeedback
**P1 · code**

- **Raakt:** alle formulieren in `apps/logistiek/app/materiaal/`,
  `app/vervoer/`, `app/flesserke/`.
- **Nu:** bij indienen zonder verplicht veld is de feedback onduidelijk.
- **Doen:**
  1. Markeer verplichte velden met een rood sterretje (`*`) in het label.
  2. Bij submit zonder verplicht veld: scroll naar het eerste lege veld en
     toon een rode rand plus foutmelding eronder.
  3. Gebruik HTML5 `required` waar mogelijk, aangevuld met visuele feedback.
- **Klaar wanneer:** een gebruiker ziet vóór indienen wat nog ingevuld moet
  worden.

### ✅ R8. Waarschuwing als levering geselecteerd maar geen rit aangevraagd
**P2 · code**

- **Raakt:** `apps/logistiek/app/reservaties/page.tsx`,
  `apps/logistiek/app/materiaal/reservation-form.tsx`.
- **Nu:** als iemand bij materiaal "levering" kiest maar geen vervoer
  aanvraagt, is er geen waarschuwing.
- **Doen:**
  1. Na indienen van een materiaalaanvraag met `delivery = true`: controleer
     of er al een gekoppelde rit is (via `eventId` of `tripGroupId`).
  2. Zo niet: toon een waarschuwingsicoontje (⚠️) op de reservatiekaart in
     "Mijn reservaties" met de tekst "Je hebt levering gekozen maar nog geen
     rit aangevraagd".
  3. Zelfde waarschuwing voor de post/werkgroep op hun overzicht.
- **Klaar wanneer:** je krijgt een signaal als je vergeten bent een rit te
  boeken.
- **Anders opgelost (3a32181).** De premisse klopt niet meer sinds ronde 1: een
  lid vraagt zelf nooit een leveringsrit aan, Logistiek maakt ze met "Rit
  aanmaken" (zie `docs/design-decisions.md`, § "Levering nodig" wordt een echte
  rit). De gevraagde waarschuwing zou het lid dus aanzetten tot een tweede,
  overbodige rit. In de plaats zegt de aanvraag nu in welke toestand de levering
  zit: "Levering gevraagd; Logistiek plant de rit in", of "Levering gepland" met
  de datum en een link naar de rit.

---

# Fase 2: navigatie, lay-out en overzichten

### ✅ N1. Beheernavigatie herindelen
**P2 · code**

- **Raakt:** `apps/logistiek/app/beheer/beheer-nav.tsx`,
  `apps/logistiek/app/beheer/layout.tsx`.
- **Nu:** de navigatie is gegroepeerd als Uitleen / Vervoer / Overig (na
  ronde 1).
- **Gewenste indeling:**
  - Hoofdnavigatie: "Overzicht", "Evenementen", "Aanvragen", "Ritten",
    "Flesserke", "Kalender", "Transportplanning" (weekoverzicht vervoer)
  - Onder "Overig": "Inventaris", "Sjablonen", "Chauffeurs", "Teksten",
    "Instellingen"
- **Doen:**
  1. Pas de tabs in `beheer-nav.tsx` aan naar de gewenste indeling.
  2. "Transportplanning" linkt naar `/beheer/vervoer/week`.
  3. "Overig" wordt een dropdown of uitklapbare groep.
  4. Op mobiel: hamburger of schuifbaar.
- **Klaar wanneer:** de navigatie volgt de bovenstaande indeling.

### ✅ N2. Terugknop naar evenementenoverzicht
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/beheer/aanvragen/[id]/page.tsx`,
  `apps/logistiek/app/beheer/vervoer/transport-controls.tsx`.
- **Nu:** als je vanuit evenementen een aanvraag aanklikt, brengt de
  terugknop je niet terug naar het evenementenoverzicht.
- **Doen:**
  1. Voeg een breadcrumb toe bovenaan de detailpagina: "Evenementen > [naam]
     > Aanvraag #X".
  2. Elke breadcrumb is klikbaar en brengt je naar het juiste niveau.
  3. Alternatief: een expliciete "← Terug naar [evenement]" link als er een
     `eventId` is, naast de standaard terugknop.
- **Klaar wanneer:** je navigeert vlot heen en terug tussen evenement en
  aanvraag.

### ✅ N3. Scrollbalk bij veel events en eigen events bovenaan
**P2 · code**

- **Raakt:** `apps/logistiek/app/materiaal/event-fields.tsx` (evenementselectie),
  `apps/logistiek/app/vervoer/request-form.tsx`.
- **Nu:** bij veel evenementen wordt de lijst lang en staan je eigen events
  niet bovenaan.
- **Doen:**
  1. Geef de evenementenkeuzelijst een `max-height` met overflow scroll.
  2. Sorteer: events van de eigen post/werkgroep eerst, dan de rest
     alfabetisch.
  3. Visueel onderscheid (bold of groepskop) voor eigen events.
- **Klaar wanneer:** je vindt je eigen events snel, ook bij een lange lijst.

### ✅ N4. Batch-acties: afgehaald en teruggebracht markeren vanuit overzicht
**P2 · code**

- **Raakt:** `apps/logistiek/app/beheer/aanvragen/page.tsx`,
  `apps/logistiek/app/actions/beheer.ts`.
- **Nu:** om een aanvraag als afgehaald of teruggebracht te markeren, moet je
  elke aanvraag individueel aanklikken.
- **Doen:**
  1. Voeg checkboxes toe per aanvraag in de goedgekeurde lijst.
  2. Bulk-actieknoppen bovenaan: "Markeer als afgehaald" en "Markeer als
     teruggebracht".
  3. Server action die meerdere IDs verwerkt in één transactie.
  4. Bevestigingsdialoog met het aantal geselecteerde aanvragen.
- **Klaar wanneer:** je kan vijf aanvragen in twee kliks als afgehaald
  markeren.

### ✅ N5. Evenement-overzicht voor aanvragers (niet alleen logi)
**P2 · code**

- **Raakt:** nieuw: `apps/logistiek/app/evenementen/page.tsx` (of uitbreiding
  van `app/reservaties/`).
- **Nu:** `/beheer/evenementen` bestaat voor logi, maar een post/werkgroep
  heeft geen overzicht van hun eigen evenementen.
- **Doen:**
  1. Nieuw scherm (of sectie in `/reservaties`) waar een aanvrager de
     evenementen van zijn post/werkgroep ziet.
  2. Per evenement: naam, datum, locatie, verwachte opkomst, en alle
     gekoppelde aanvragen (materiaal, flesserke, transport) met status.
  3. Klikken op een aanvraag brengt je naar de detail.
  4. Alleen events van je eigen post/werkgroep tonen.
- **Klaar wanneer:** een postverantwoordelijke ziet in één scherm alles wat
  bij hun evenement hoort.

---

# Fase 3: materiaal — opmerkingen, deelgoedkeuring, sjablonen

### ✅ M1. Logi-opmerking per materiaalitem
**P1 · code · 🗄️**

- **Raakt:** `packages/db/prisma/schema.prisma` (`UitleenReservationLine`),
  `apps/logistiek/app/beheer/aanvragen/[id]/admin-edit-form.tsx`.
- **Nu:** een aanvrager kan een nota toevoegen per item (ronde 1, M15), maar
  logi kan dat niet. Er is geen visueel onderscheid.
- **Doen:**
  1. Voeg `adminNote String?` toe aan `UitleenReservationLine`.
  2. In het beheer per lijn een invulveld voor de logi-nota, visueel
     onderscheiden (andere kleur of "Logi:"-prefix).
  3. Beide nota's zichtbaar voor de aanvrager op de detailpagina, met
     duidelijk label wie de opmerking plaatste.
- **Klaar wanneer:** logi kan bij elk item een opmerking achterlaten die de
  aanvrager onderscheidt van zijn eigen opmerking.

### ✅ M2. Aanvraag bewerken na goedkeuring (met hergoedkeuring)
**P2 · code · 📝**

- **Raakt:** `apps/logistiek/app/materiaal/reservation-form.tsx`,
  `apps/logistiek/app/reservaties/page.tsx`,
  `apps/logistiek/app/actions/uitleen.ts`.
- **Nu:** een goedgekeurde aanvraag kan niet meer bewerkt worden door de
  aanvrager.
- **Doen:**
  1. Voeg een "Bewerken"-knop toe op goedgekeurde aanvragen voor de
     aanvrager.
  2. Bij bewerking: de status springt terug naar REQUESTED (of een nieuwe
     status MODIFIED) en moet opnieuw goedgekeurd worden.
  3. Logi wordt per mail op de hoogte gebracht (A9-infra).
  4. Markeer in de aanvraaglijst dat deze aanvraag gewijzigd is na
     goedkeuring ("Gewijzigd, hergoedkeuring nodig").
  5. Leg vast in `docs/design-decisions.md`: welke wijzigingen
     hergoedkeuring vereisen en welke niet (bv. alleen opmerking toevoegen
     niet).
- **Klaar wanneer:** een aanvrager kan na goedkeuring nog een tafel
  toevoegen, waarna logi opnieuw moet beslissen.

### ✅ M3. Gedeeltelijke goedkeuring van materiaal
**P2 · code · 🗄️ · 📝**

- **Raakt:** `packages/db/prisma/schema.prisma` (`UitleenReservationLine`),
  `apps/logistiek/app/actions/beheer.ts`,
  `apps/logistiek/app/beheer/aanvragen/[id]/decision-forms.tsx`.
- **Nu:** goedkeuring werkt op de hele aanvraag. Je kan niet één item
  goedkeuren en een ander nog openlaten.
- **Doen:**
  1. Voeg `lineStatus` toe aan `UitleenReservationLine` (REQUESTED,
     APPROVED, REJECTED) naast de bestaande reservatie-status.
  2. Logi kan per lijn goedkeuren of afwijzen.
  3. De reservatie-status wordt PARTIALLY_APPROVED als sommige lijnen
     goedgekeurd zijn maar niet allemaal.
  4. Toon in het overzicht bij "Te beslissen" ook deels goedgekeurde
     aanvragen, of maak een aparte sectie "Deels goedgekeurd".
  5. Afgewezen items blijven zichtbaar (doorstreept of apart) met de
     logi-opmerking erbij (M1).
  6. Noteer in `docs/design-decisions.md`.
- **Klaar wanneer:** logi kan 3 van 5 items goedkeuren en de andere 2 nog
  laten staan.

### ✅ M4. Sjablonen bruikbaar en duidelijk selecteerbaar
**P1 · code**

- **Raakt:** `apps/logistiek/app/materiaal/reservation-form.tsx`,
  `apps/logistiek/app/beheer/sjablonen/`.
- **Nu:** sjablonen bestaan (ronde 1, M17) maar de selectie-UI is onduidelijk:
  je ziet niet dat het sjabloon al geselecteerd is.
- **Doen:**
  1. Na selectie van een sjabloon: visuele feedback dat het is toegepast
     (bv. groene vink, "Sjabloon 'Cantus' toegepast", of highlight op de
     items die erbij gekomen zijn).
  2. Een "Wis selectie"-knop die alle items van het sjabloon weer verwijdert.
  3. Zorg dat het sjabloon correct selecteerbaar is voor alle groepen (niet
     alleen logi-posten).
- **Klaar wanneer:** iedereen kan een sjabloon selecteren en ziet duidelijk
  dat het is toegepast.

### ✅ M5. Posten en werkgroepen mogen sjablonen aanmaken
**P3 · code · 📝 · beslist: B2**

- **Raakt:** `apps/logistiek/app/beheer/sjablonen/`,
  `apps/logistiek/app/actions/beheer.ts`.
- **Nu:** alleen `logistiek.manage` kan sjablonen aanmaken.
- **Doen (indien B2 = ja):**
  1. Geef posten en werkgroepen de mogelijkheid om sjablonen aan te maken
     die aan hun groep gekoppeld zijn.
  2. Logi ziet alle sjablonen; een post ziet logi-sjablonen + eigen sjablonen.
  3. Rechtenbeheer: wie mag aanmaken, bewerken, verwijderen?
- **Klaar wanneer:** de post Feest kan hun eigen cantus-sjabloon beheren.

### M6. Foto-thumbnail bijsnijden bij materiaal
**P2 · code**

- **Raakt:** `apps/logistiek/app/beheer/materiaal/inventory-manager.tsx`
  (de foto-upload).
- **Nu:** als je foto's toevoegt aan materiaal, kan je niet bijsnijden of het
  thumbnailgedeelte selecteren.
- **Doen:**
  1. Voeg een crop-tool toe bij het uploaden (bv. `react-image-crop` of een
     canvas-gebaseerde oplossing).
  2. Sla de crop-parameters op of genereer een bijgesneden versie.
  3. Gebruik de bijgesneden versie als thumbnail in de catalogus.
- **Klaar wanneer:** je kan een foto uploaden en het relevante deel selecteren
  als thumbnail.

### ✅ M7. Lijstweergave voor materiaalcatalogus
**P2 · code**

- **Raakt:** `apps/logistiek/app/materiaal/reservation-form.tsx`.
- **Nu:** de catalogus toont altijd kaarten met foto's, wat bij veel items
  veel scrollen vereist.
- **Doen:**
  1. Voeg een toggle toe: "Kaartweergave" / "Lijstweergave".
  2. Lijstweergave: compacte rijen zonder foto (naam, categorie,
     beschikbaarheid, +/-knoppen). Geschikt als je weet wat je wilt.
  3. Bewaar de voorkeur in `localStorage`.
- **Klaar wanneer:** een aanvrager die weet wat hij wilt, hoeft niet door
  alle foto's te scrollen.

### ✅ M8. Evenementnaam tonen bij aanvraagoverzicht
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/beheer/aanvragen/page.tsx`.
- **Nu:** in het overzicht van aanvragen ontbreekt het evenement waartoe de
  aanvraag behoort.
- **Doen:** toon `event.name` als tag of subtekst op elke aanvraagregel in
  de beheerlijst.
- **Klaar wanneer:** je ziet bij elke aanvraag direct voor welk evenement
  ze is.

---

# Fase 4: vervoer — terminologie, goedkeuring, weekoverzicht

### ✅ T1. Terminologie: "transport" in plaats van "vervoer"
**P1 · code**

- **Raakt:** alle vervoer-gerelateerde pagina's, labels, navigatie, i18n.
- **Nu:** de term "vervoer" wordt overal gebruikt; logi gebruikt "transport".
- **Doen:** vervang in de UI alle instanties van "vervoer" door "transport"
  (labels, titels, knoppen). Laat routes en code-identifiers ongewijzigd
  tenzij er een goede reden is.
- **Klaar wanneer:** de UI zegt overal "transport" waar het team dat verwacht.

### T2. Heen- en terugrit apart goedkeuren
**P2 · code**

- **Raakt:** `apps/logistiek/app/beheer/vervoer/transport-decision-forms.tsx`,
  `apps/logistiek/app/actions/beheer.ts`.
- **Nu:** als heen- en terugrit samen worden aangevraagd (`tripGroupId`), kan
  je ze alleen samen goedkeuren of afwijzen.
- **Doen:**
  1. Voeg een optie "Apart beslissen" toe naast "Beide goedkeuren".
  2. Elke rit in de groep krijgt een eigen goedkeur/afwijsknop.
  3. Bij apart goedkeuren: de groep krijgt geen collectieve status maar
     elk individueel.
- **Klaar wanneer:** je kan de heenrit goedkeuren en de terugrit aanpassen.

### ✅ T3. "Te beslissen" ritten inklappen (zoals goedgekeurde)
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/beheer/vervoer/page.tsx`.
- **Nu:** "Te beslissen" ritten staan altijd open als kaarten; "Goedgekeurd"
  is al compacter.
- **Doen:** maak de "Te beslissen" lijst ook inklapbaar, zodat je bij veel
  aanvragen het overzicht behoudt. Details pas bij uitklappen.
- **Klaar wanneer:** je kan de lijst van te beslissen ritten inklappen.

### ✅ T4. Evenementnaam bij dichtgeklapte ritten; prijs/betaald weg
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/beheer/vervoer/page.tsx`.
- **Nu:** dichtgeklapte ritten tonen prijs en betaalstatus, maar niet het
  evenement.
- **Doen:**
  1. Toon `event.name` bij dichtgeklapte ritten als die gelinkt zijn.
  2. Verberg prijs en "betaald" in de compacte weergave (zie ook R4).
- **Klaar wanneer:** je ziet het evenement zonder uit te klappen, en er staan
  geen irrelevante bedragen.

### ✅ T5. Rit bewerken na goedkeuring (met hergoedkeuring)
**P2 · code**

- **Raakt:** `apps/logistiek/app/vervoer/request-form.tsx`,
  `apps/logistiek/app/reservaties/page.tsx`.
- **Nu:** een goedgekeurde rit kan niet meer bewerkt worden door de aanvrager.
- **Doen:** zelfde aanpak als M2: bewerken zet de status terug, logi wordt
  genotificeerd.
- **Klaar wanneer:** een aanvrager kan na goedkeuring een rit wijzigen.

### ✅ T6. Snellere link naar bezettingsoverzicht
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/beheer/vervoer/page.tsx`,
  `apps/logistiek/app/beheer/beheer-nav.tsx`.
- **Nu:** `/vervoer/bezetting` is lastig te bereiken.
- **Doen:** voeg een prominente knop/link toe vanuit het vervoerbeheer en
  eventueel de beheernavigatie.
- **Klaar wanneer:** je bereikt het bezettingsoverzicht in één klik.

### ✅ T7. Weekoverzicht herwerken: moment → voertuig (Litus-stijl)
**P1 · code · groter**

- **Raakt:** `apps/logistiek/app/beheer/vervoer/week/page.tsx`,
  `apps/logistiek/lib/uitleen-server.ts`.
- **Nu (ronde 1, V7):** het weekoverzicht toont aparte overzichten per
  voertuig. De gewenste layout is zoals de Litus: moment → voertuig (rijen
  zijn tijdsloten, kolommen zijn voertuigen).
- **Doen:**
  1. Herwerk het raster: tijdsloten verticaal, voertuigen horizontaal.
  2. Arcering of kleur per voertuig om het onderscheid duidelijk te maken.
  3. **Chauffeurskleuren** (beslist: B4): elke rit krijgt de kleur van de
     toegewezen chauffeur.
  4. Afgeronde ritten ook tonen (eventueel in een lichtere kleur).
  5. Klik op een rit opent een **popup-venster** (modal/dialog) waar je de
     rit kan aanpassen, goedkeuren, chauffeur wijzigen — zonder weg te
     navigeren.
  6. De transportverantwoordelijke werkt primair vanuit dit overzicht.
- **Klaar wanneer:** het weekoverzicht lijkt op de Litus met moment → voertuig.

### ✅ T8. Publiek weekoverzicht: zelfde lay-out als logi, alleen goedgekeurde ritten
**P2 · code**

- **Raakt:** `apps/logistiek/app/vervoer/bezetting/` (of de publieke route
  uit V13).
- **Nu:** praesidium en werkgroepen zien een ander overzicht dan logi.
- **Gewenst:** zelfde Litus-stijl lay-out als T7, maar alleen goedgekeurde
  ritten. Plus chauffeurskleuren, zodat je ziet wie welk ritje doet.
- **Doen:**
  1. Gebruik dezelfde component als T7, maar met een gefilterde dataset
     (alleen APPROVED).
  2. "Gestreept" (of lichter) voor aangevraagd-maar-niet-beslist, zodat je
     ziet welk moment nog kan vrijkomen.
  3. Toon evenementnaam en chauffeur.
- **Klaar wanneer:** een praesidiumlid ziet hetzelfde overzicht als logi,
  minus de beslisknoppen.

### ✅ T9. Chauffeurs: klik op "ritten gereden" voor overzicht
**P2 · code**

- **Raakt:** `apps/logistiek/app/beheer/chauffeurs/driver-list.tsx`.
- **Nu:** er staat "2 ritten gereden" maar je kan er niet op klikken.
- **Doen:**
  1. Maak het aantal klikbaar; opent een overzicht van alle ritten van die
     chauffeur.
  2. Toon per rit: datum, uren, evenement, voertuig, en of het een nachtrit
     was (bv. na 22:00).
  3. Handig om te checken dat niet één iemand altijd de nachtritten krijgt.
- **Klaar wanneer:** je ziet alle ritten van een chauffeur na een klik.

### ✅ T10. Sorteren op functie bij chauffeurs
**P2 · code · klein**

- **Raakt:** `apps/logistiek/app/beheer/chauffeurs/driver-list.tsx`.
- **Nu:** geen sorteermogelijkheid.
- **Doen:** voeg sorteren toe (naam, functie/groep, aantal ritten) met de
  bestaande `SortHeader`-component.
- **Klaar wanneer:** je kan de chauffeurslijst sorteren.

### ✅ T11. Conflicterende rit: gewijzigde uren opslaan
**P1 · code · bug**

- **Raakt:** `apps/logistiek/app/beheer/vervoer/transport-decision-forms.tsx`,
  `apps/logistiek/app/actions/beheer.ts`.
- **Nu:** als je bij een conflicterende rit de uren aanpast om het conflict
  op te lossen, wordt de nieuwe input niet opgeslagen. Het systeem onthoud de
  oude uren en zegt dat de rit conflicterend is.
- **Doen:**
  1. Debug de state-handling in het goedkeurformulier: de gewijzigde uren
     moeten correct naar de server action gestuurd worden.
  2. Vermoedelijk gelinkt aan het kwartierensysteem (V11 uit ronde 1).
  3. Zorg dat de conflict-hercheck de nieuwe uren gebruikt, niet de originele.
- **Klaar wanneer:** je kan een conflicterende rit goedkeuren na het
  aanpassen van de uren.

### ✅ T12. Voertuigselectie: automatisch deselecteren
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/vervoer/request-form.tsx`.
- **Nu:** als je Bakfiets selecteert, wordt Angela niet automatisch
  gedeselecteerd. Veel mensen zullen per ongeluk meerdere voertuigen
  selecteren.
- **Doen:**
  1. Als de selectie een single-select is (standaard): maak het een radio
     group in plaats van checkboxes.
  2. Als multi-select gewenst is (V1 uit ronde 1): maak het duidelijker dat
     meerdere geselecteerd zijn (visuele feedback, teller).
- **Klaar wanneer:** een gebruiker selecteert niet per ongeluk twee
  voertuigen.

### T13. Diverse vervoer-verbeteringen
**P2 · code**

- **Raakt:** meerdere bestanden.
- **Doen (per item):**
  1. **Optie chauffeur: blank** voor bakfiets (niet iedereen heeft een
     chauffeur nodig).
  2. **Optie aanvraag bewerken** voor transport (voor de aanvrager), zelfde
     als M2/T5.
  3. **Link in externe mail:** als een externe een rit aanvraagt en een
     mailadres opgeeft, controleer dat de link in de mail naar de juiste
     pagina verwijst (niet `/ritten` van logistiekers maar een publieke
     statuspagina).
  4. **Meerdere mailadressen** bij "Extra adres dat op de hoogte blijft":
     sta komma-gescheiden adressen toe en vermeld dit in de placeholder
     ("Splits mailadressen met een komma").

---

# Fase 5: flesserke en kalender

### ✅ F1. Overzicht aangevraagde flesserke-items
**P2 · code**

- **Raakt:** `apps/logistiek/app/flesserke/request-form.tsx`.
- **Nu:** bij materiaal heb je een overzicht (aside) van wat je al hebt
  aangevraagd. Bij flesserke ontbreekt dit.
- **Doen:** voeg een gelijkaardige aside/samenvatting toe aan het
  flesserke-aanvraagformulier met de geselecteerde items en aantallen.
- **Klaar wanneer:** je ziet in het flesserke-formulier een overzicht van
  je selectie.

### ✅ F2. Tekst bij terugdraaien "teruggebracht" verduidelijken
**P1 · code · klein**

- **Raakt:** `apps/logistiek/app/actions/beheer.ts`,
  `apps/logistiek/lib/i18n.ts`.
- **Nu:** bij terugdraaien van "teruggebracht" naar "uitgeleend" staat er:
  "het flesserke-verbruik dat bij het terugbrengen afgeboekt werd, komt terug
  in de voorraad." Dit is onduidelijk.
- **Doen:** herschrijf de tekst in begrijpelijk taalgebruik, bv.:
  "Let op: de flessen/blikken die als verbruikt werden afgeboekt bij het
  terugbrengen, worden weer bij de voorraad opgeteld. Controleer of de
  voorraadtelling nog klopt."
- **Klaar wanneer:** de bevestigingstekst is helder voor iedereen.

### ✅ F3. Kalender: materiaal/flesserke onderscheiden met kleuren
**P2 · code**

- **Raakt:** `apps/logistiek/app/beheer/kalender/page.tsx`,
  `apps/logistiek/app/beheer/kalender/kalender-kinds.ts`.
- **Nu:** de kalender toont aanvraagsoorten, maar het is niet direct
  zichtbaar of het om materiaal of flesserke gaat.
- **Doen:**
  1. Voeg kleurcodering toe per soort (bv. blauw voor materiaal, groen
     voor flesserke, oranje voor transport).
  2. Optioneel: de kleuren instelbaar maken via `/beheer/instellingen`.
  3. Legenda bovenaan of onderaan de kalender.
- **Klaar wanneer:** je ziet in de kalender in één oogopslag of iets
  materiaal of flesserke is.

---

# Fase 6: evenementen — post-overzicht, materiaallijst, C&G

### ✅ E1. Aanvrager kan eigen evenement zien en beheren
**P1 · code**

- **Raakt:** nieuw: `apps/logistiek/app/evenementen/[id]/page.tsx`.
- **Nu:** een aanvrager (niet-logi post) kan zijn evenement niet zien of
  bewerken.
- **Doen:**
  1. Bouw een evenement-detailpagina voor de aanvrager (niet het beheer).
  2. Toon: locatie, verwachte opkomst, startuur, en alle gekoppelde
     aanvragen.
  3. De aanvrager kan locatie/startuur/opkomst wijzigen.
  4. Optie om per onderdeel (bv. een specifieke materiaalaanvraag) een
     andere locatie/startuur op te geven.
- **Klaar wanneer:** een postverantwoordelijke kan zijn evenement bekijken
  en de basisgegevens wijzigen.

### ✅ E2. Evenement: extra velden en verbeteringen
**P2 · code · 🗄️**

- **Raakt:** `packages/db/prisma/schema.prisma` (`UitleenEvent`),
  `apps/logistiek/app/beheer/evenementen/`.
- **Doen:**
  1. **Einddatum** optioneel toevoegen.
  2. **Uur niet verplicht** maken bij aanmaken evenement.
  3. **Sorteren op functie** in het evenementen-overzicht (post/werkgroep,
     datum, naam).
- **Klaar wanneer:** evenementen ondersteunen een einddatum en uur is
  optioneel.

### ✅ E3. Evenementen: afscherming voor externen
**P2 · code · beslist: B3**

- **Raakt:** `apps/logistiek/app/materiaal/event-fields.tsx`,
  `apps/logistiek/app/vervoer/request-form.tsx`.
- **Nu:** externen zien de optie "hoort dit bij een evenement?" en de
  sjabloonselectie.
- **Doen (indien B3 = strikt):**
  1. Verberg de evenementselectie en sjabloonkeuze als `requesterType`
     extern is.
  2. Toon niet de lijst van alle evenementen aan externen.
- **Klaar wanneer:** een externe ziet een eenvoudiger formulier.

### ✅ E4. Afdrukbare materiaallijst per evenement (alles-in-één)
**P1 · code · groter**

- **Raakt:** `apps/logistiek/app/beheer/evenementen/[id]/`,
  nieuw: print-route.
- **Nu:** de printfunctie werkt per aanvraag (ronde 1, A7). De feedback
  vraagt een afdrukbare materiaallijst per evenement.
- **Gewenst op de afdruk:**
  - Logi-materiaal met locatie, nota's, klaarzet-vinkjes
  - Niet-logi materiaal (theokot, vicepraeses, eigen materiaal)
  - C&G-bestelling
  - Flesserke
  - Ritten (optioneel)
  - Alles op één fysiek papier (landscape A4)
- **Doen:**
  1. Bouw een printroute per evenement: `/beheer/evenementen/[id]/print`.
  2. Verzamel alle aanvragen (materiaal, flesserke, transport) van het
     evenement.
  3. Groepeer op type, met kolommen: item, aantal, locatie, klaar, nota.
  4. CSS `@media print` voor landscape, geen header/navigatie.
  5. Toon ook materiaal dat niet van logi komt (indien beschikbaar via een
     vrij tekstveld of apart model, zie E5).
- **Klaar wanneer:** je print één blad per evenement met alles erop.

### ✅ E5. Niet-logi materiaal en C&G op de materiaallijst
**P2 · code · 🗄️ · 📝 · beslist: B1**

- **Raakt:** `packages/db/prisma/schema.prisma`,
  `apps/logistiek/app/beheer/evenementen/`.
- **Nu:** alleen logi-materiaal zit in het systeem. De feedback vraagt ook
  ander materiaal (theokot, vicepraeses, eigen spullen) en C&G-bestellingen.
- **Doen:**
  1. **Niet-logi materiaal:** voeg een vrij tekst- of lijstveld toe aan het
     evenement waar een aanvrager extra materiaal kan noteren (bron, item,
     aantal). Geen voorraadberekening, puur informatief.
  2. **C&G-bestelling:** afhankelijk van B1:
     - **Optie A (handmatig):** vrij tekstveld of gestructureerd formulier
       waar het ordernummer en de items ingevoerd worden.
     - **Optie B (e-mail import):** mailadres aanmaken, ordernummer ingeven,
       bestelling automatisch importeren.
     - **Forwarding:** zorg dat het nieuwe mailadres alles doorstuurt naar
       transport@vtk.be als backup.
  3. Noteer de keuze in `docs/design-decisions.md`.
- **Klaar wanneer:** de materiaallijst bevat ook niet-logi materiaal en
  C&G-bestellingen.

### ✅ E6. Materiaallijst in mail bij aanvraag
**P2 · code**

- **Raakt:** de mailinfrastructuur uit ronde 1 (A9), `packages/mail`.
- **Nu:** de mail die gestuurd wordt over een materiaalaanvraag bevat niet
  de opmerkingen bij het materiaal.
- **Doen:**
  1. Voeg de opmerkingen per item toe aan de e-mailtemplate voor
     materiaalaanvragen.
  2. Als een item afgewezen is: toon het niet tussen het goedgekeurde
     materiaal, maar apart of doorstreept, met de logi-opmerking erbij.
- **Klaar wanneer:** de mail bevat alle relevante opmerkingen en
  afgewezen items zijn herkenbaar.

### ✅ E7. Afgewezen materiaal zichtbaar houden in aanvraag
**P1 · code**

- **Raakt:** `apps/logistiek/app/reservaties/page.tsx`,
  `apps/logistiek/app/beheer/aanvragen/[id]/page.tsx`.
- **Nu:** als logi materiaal afwijst, verdwijnt het uit de aanvraag.
- **Doen:**
  1. Toon afgewezen items apart (doorstreept of in een "Afgewezen" sectie).
  2. De logi-opmerking bij het afgewezen item is zichtbaar voor de aanvrager.
  3. Niet tussen het goedgekeurde materiaal maar duidelijk gescheiden.
- **Klaar wanneer:** een aanvrager ziet wat logi heeft afgewezen en waarom.

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
