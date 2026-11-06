# Werkplan: transportronde 6 (november 2026)

Bron: het document "Feedback nieuwe website", sectie **Feedback ronde 6**
(30/10/2026). Zevenentwintig punten: de transportplanning, de statistieken, wie
wat mag aanvragen, en een paar dingen die stilletjes niets doen.

> **Let op de nummering.** De taakcodes (`F6.1` ... `F6.27`) volgen de volgorde van
> het document, zodat "punt 9 van ronde 6" aan beide kanten hetzelfde is. De
> bestanden in de repo tellen apart (zie `logistiek-transport-ronde-5.md`, dat
> "Feedback ronde 4" uit het document is).

Bouwt voort op `docs/logistiek-feedback-plan.md`, `logistiek-feedback-ronde-2.md`
en `logistiek-transport-ronde-3.md` tot en met `-5.md`.

Technische kaart van de module: `docs/uitleendienst.md`.
Productkeuzes: `docs/design-decisions.md` (§ Uitleendienst).

## Hoe je dit gebruikt

1. Kies een fase (of één taak) en geef die in plan-modus.
2. Taken met **🗄️** vragen een Prisma-migratie in `packages/db/prisma/schema.prisma`.
3. Taken met **📝** vragen een sectie in `docs/design-decisions.md`.
4. Vink af in dit bestand als iets af is; zet er het commit-hashje bij.

Prioriteiten: **P1** = bug of dagelijkse ergernis, **P2** = duidelijke
verbetering, **P3** = groter of "ooit".

Alles wordt op **390px breed** nagekeken, in licht én donker.

## Beslissingen die al gevallen zijn

- **D1. Externen zien enkel het materiaal niet meer.** Een externe (geen enkele
  groep) ziet op `/materiaal` enkel de melding "nog niet open voor externen" met
  het mailadres van Logistiek, geen catalogus. Vervoer en het bezettingsoverzicht
  blijven zichtbaar. Dit keert "kijken mag, indienen niet" (S1) gedeeltelijk om.
  Zie F6.23.
- **D2. Een herhaalde rit krijgt een `seriesId`.** Nullable kolom op
  `UitleenTransportBooking`; bestaande ritten blijven `NULL` ("geen deel van een
  reeks"), en dat is de enige eerlijke waarde: niemand kan achteraf weten welke
  oude ritten bij elkaar hoorden. Gevraagd en beslist op 6 november 2026. Zie F6.22.
- **D3. Een wijziging bij het goedkeuren is zichtbaar voor de aanvrager én het
  team.** Geen nieuwe kolom: het komt uit de bestaande auditlog. Zie F6.11.
- **D4. Jaarwerkingen worden werkgroepen.** In productie bestaan Duplex, Triplex,
  Halftime, Parttime en Fulltime niet als `Group` (gemeten op 6 november 2026: 15
  posten, 7 werkgroepen, nul jaarwerkingen). Ze worden aangemaakt als
  `type = WERKGROEP`. Zie F6.27.

## Aannames die ik maakte (zeg het als het anders moet)

- **Nota's en "Extra info van Logistiek" worden niet samengevoegd** maar naast
  elkaar gezet (F6.15). Ze betekenen iets anders: de ene is voor de aanvrager en
  hangt aan de mail, de andere is een werknota met een zichtbaarheid.
- **Nota's op de publieke planning zijn enkel voor de eigen post** (F6.16). Andere
  posten zien ze niet.
- **Een rit in het verleden kan enkel het team aanmaken** (F6.19), nooit een lid.
- **Herhaalde ritten zijn enkel voor het team** (F6.22), want het zijn de ritten
  van Logistiek zelf (C&G, containerpark, BO).
- **Elk praesidiumlid mag een bijrijder toevoegen aan elke rit, maar enkel eigen
  toevoegingen weer weghalen** (F6.24).
- **Bestaande ritten veranderen nooit mee** met een nieuwe standaard (F6.10).

## Statusoverzicht

| Fase | Inhoud | Taken | Status |
| --- | --- | --- | --- |
| 1 | Bugs en stille mislukkingen | F6.26, F6.14, F6.9, F6.10, F6.20, F6.19, F6.2 | open |
| 2 | Wie mag wat aanvragen en doen | F6.27, F6.23, F6.24, F6.21 | open |
| 3 | Leesbaarheid van de planning | F6.1, F6.17, F6.8, F6.7, F6.3 | open |
| 4 | Nota's en wijzigingen | F6.15, F6.16, F6.11, F6.12, F6.13 | open |
| 5 | Statistiek | F6.4, F6.5, F6.6, F6.25 | open (F6.25 wacht op een screenshot) |
| 6 | Herhaalde ritten | F6.22 | open |
| - | Geen code, een gesprek | F6.18 | open |

**Volgorde.** Fase 1 eerst: F6.26 en F6.14 zijn echte defecten, en F6.26 is precies
wat Logistiek tegenkomt bij het dubbel inplannen. **F6.27 en F6.23 gaan samen
live**, in die volgorde van maken: verbergen we het materiaal voor externen
terwijl een jaarwerkinglid nog geen groep heeft, dan sluiten we het vijf
jaarwerkingen buiten.

## Kritisch nagekeken

| Punt | Moet het? | Waarom |
| --- | --- | --- |
| F6.1 arcering bij dubbelboeking | Ja | `blockLook` zet de arcering bewust uit bij een conflict. |
| F6.2 "hele dag" past niet | Ja, eerst meten | De oorzaak is niet zeker; zie de taak. |
| F6.3 komende x dagen | Ja | Nieuwe weergave naast dag, week, maand. |
| F6.4 weekdagen per chauffeur | Ja | Data is er (zelfde wandeling), enkel de weergave ontbreekt. |
| F6.5 ander beeld voor "Op welk uur" | Ja | Klopt: in een gestapelde balk heeft enkel het onderste segment een gedeelde basislijn. |
| F6.6 heatmap volgt de chauffeur | Ja | Zelfde mechanisme als de andere panelen. |
| F6.7 meer kleuren | Ja, met een valkuil | `hash % 24` mag niet naar `% 40`, anders krijgt iedereen een andere kleur. |
| F6.8 icoon auto en bakfiets | Ja | Het `car`-icoon is een bak met twee wielen, de bakfiets een fiets zonder bak. |
| F6.9 extra info bij nieuwe rit | Ja | Het veld bestaat enkel in het bewerkformulier. |
| F6.10 standaardpost | Ja, voor de auto | Bij de bakfiets rijdt de aanvrager zelf; zie de taak. |
| F6.11 wijzigingen zichtbaar | Ja | De diff staat al in de historiek, niemand ziet hem. |
| F6.12 nota's onder Mijn reservaties | Ja, klein | Staan wel op de detailpagina, niet op de lijstkaart. |
| F6.13 "2x transport" | Ja | Het getal telt ritten; heen en terug is "2x". |
| F6.14 "nieuw evenement" werkt niet | Ja, vermoedelijk geen stuk knop | Zonder naam doet ze stil niets. |
| F6.15 nota's samenvoegen | **Nee, dichter bij elkaar** | Twee betekenissen in één veld. |
| F6.16 nota's op de publieke planning | Ja, enkel eigen post | Nu staat dat hard op `null`. |
| F6.17 gele rail valt weg | Ja | Geel op een pasteltint is onzichtbaar. |
| F6.18 update over evenementen | Geen code | Een antwoord en een gespreksagenda. |
| F6.19 startmoment in het verleden | Ja, enkel team | Lid blijft geweigerd. |
| F6.20 "Interne post" | Ja | Eén label. |
| F6.21 voertuig aanvraagbaar | Ja | Nieuwe vlag op het voertuig. |
| F6.22 herhaalde rit | Ja, klein beginnen | Aanmaken en verwijderen van een reeks. |
| F6.23 externen en materiaal | Ja (D1) | Hangt samen met F6.27. |
| F6.24 bijrijder voor elk praesidiumlid | Ja | Uitbreiding van een bestaand recht. |
| F6.25 meer dan 24u in een dag | **Niet te beoordelen** | De screenshot ontbreekt in het document. |
| F6.26 knoppen bij dubbel inplannen | Ja, bevestigd bug | Zie de taak. |
| F6.27 jaarwerkingen ontbreken | Ja | Ze bestaan niet als groep. |

---

# Fase 1: bugs en stille mislukkingen

### F6.26. Een bewust dubbele rit laat niets meer opslaan
**P1 · code**

*"Als ik ritjes dubbel inplan zitten nog wat problemen met de knoppen, wnr ik bvb
een extra info toevoeg."*

Gelezen in `adminEditTransportAction` (`app/actions/beheer.ts`): bij een
goedgekeurde rit loopt `overlappingBookings` bij **elke** opslag, ook wanneer het
uur en het voertuig niet veranderen. Een rit die je met opzet over een andere
zette, geeft dus bij een nota of een nieuw adres "Botst met ...", en je moet op
"Toch verschuiven" drukken, een knop die zegt dat er iets verschuift terwijl er
niets verschuift. Elke zo'n opslag schrijft bovendien opnieuw een overlap-nota
in de historiek.

**Plan.** De overlapcontrole en de overlap-nota enkel uitvoeren wanneer `startAt`,
`endAt` of het voertuig verandert. Bij een ongewijzigd venster: gewoon opslaan.
Hetzelfde nagaan voor de andere knoppen van het paneel op een bewust dubbele rit
(chauffeur toewijzen, voertuig wisselen, "post kiest zelf de chauffeur"), want
het punt zegt "knoppen", meervoud. Test: een extra info opslaan op een rit die
over een andere ligt, zonder `allowOverlap`.

### F6.14. "Maak hier een nieuw evenement van" doet niets
**P1 · code · eerst reproduceren**

Wat ik in de code vind: `resolveEventId` (`app/actions/uitleen.ts`) geeft stil
`null` terug wanneer het vakje aanstaat maar de naam leeg is. Op het vervoerformulier
is de naam het veld "Evenement (optioneel)" **onder** de keuzelijst, terwijl de
tekst bij het vakje zegt "de naam die je **hierboven** invult". Wie het vakje
aanvinkt en het optionele veld overslaat, krijgt een aanvraag zonder evenement en
geen foutmelding. Dat leest als een knop die niet werkt.

**Plan.**

- Reproduceren in de browser op het vervoer-, het materiaal- en het
  flesserkeformulier voor ik iets zeker zeg.
- Is de naam leeg terwijl het vakje aanstaat: een inline fout met focus op het
  veld (het `missing`-patroon van R7), en aan de serverkant een fout in plaats van
  `null`.
- De hinttekst volgt de plek van het veld per formulier.
- Na het indienen zegt het scherm dat het evenement aangemaakt is ("Evenement X
  aangemaakt; je volgende aanvraag kan eronder"), want nu merk je dat enkel aan
  `/evenementen`.

### F6.9. "Extra info van Logistiek" bij een nieuwe rit
**P1 · code**

`adminNote` bestaat enkel in `trip-edit-form.tsx`. `new-trip-form.tsx` heeft het
veld niet en `adminCreateTransportAction` schrijft het niet weg.

**Plan.** Veld toevoegen aan het intekenformulier met dezelfde tekst en
placeholder, en meegeven aan de actie. Geen migratie: de kolom bestaat al.
Bij een rit die het team zelf inplant gaat er geen mail naar de aanvrager
(`plannedByTeam`), dus de placeholder "Staat mee in de mail naar de aanvrager"
klopt daar niet: de tekst moet zeggen wat er echt gebeurt.

### F6.10. De aanvragende post staat standaard bij "Post kiest zelf de chauffeur"
**P1 · code**

`createVanBookingAction` laat `assignedGroupId` leeg, dus elke rit die via de site
binnenkomt staat bij het goedkeuren op "Logistiek regelt het". F4.17 deed dit al
voor ritten die het team zelf intekent (`new-trip-form.tsx`), maar niet voor
aanvragen van leden.

**Plan.** Bij het indienen `assignedGroupId` zetten op de gekozen post of
werkgroep, voor elk voertuig dat geen kar is (`!needsVanDriver`, dezelfde regel
als het formulier). Daarbij twee dingen die bij het nakijken opvielen:

- **Bij een werkgroep is `groupId` leeg** (`deriveMemberRequester` geeft
  `groupId: null` en de naam als `requesterName`). `assignedGroupId` mag wel de
  werkgroep zijn, en dan lost dit meteen iets anders op: de rit verschijnt onder
  "Ritten van mijn post" voor de leden van die werkgroep, en collega's mogen er
  bijrijders aan toevoegen (`vanBookingForMember` heeft een derde tak op
  `assignedGroupId`).
- **De bakfiets heeft geen chauffeur** (`needsDriver: false`, de aanvrager rijdt
  zelf), maar de keuzelijst staat er wel (enkel de kar verbergt hem). Het
  feedbackpunt vraagt "auto of bakfiets". Voorstel: de standaard zetten voor beide,
  en de keuzelijst bij een voertuig zonder chauffeur verbergen, zoals hij bij de kar
  verborgen is.

**Bestaande aanvragen en ritten blijven zoals ze zijn.** Geen backfill: een
bestaande rit verandert niet mee met een nieuwe feature. Test in
`trip-access.test.ts`.

### F6.20. "Interne post" hoort Logistiek te heten
**P1 · code**

`requesterLabel` (`lib/uitleen.ts`) valt voor `INTERN` zonder groep terug op
`REQUESTER_TYPE_LABELS.INTERN`, "Interne post". Een rit die het team voor
Logistiek zelf intekent heeft precies dat: `INTERN`, geen groep.

**Plan.** Een rit met `plannedByTeam`, `INTERN` en zonder groep heet "Logistiek".
Op `plannedByTeam` en niet enkel op "geen groep", want een post die later wordt
verwijderd (`onDelete: SetNull`) mag niet als Logistiek gaan lezen. Het label
wijzigt ook voor bestaande ritten; dat is een weergave en geen gegeven. De
historiekregel van `adminEditTransportAction` zegt al "Logistiek zelf"; één woord
kiezen: "Logistiek".

### F6.19. Een rit in het verleden kunnen invoeren
**P2 · code**

*"'Het startmoment ligt in het verleden' sure, goed dat deze melding er is, ma ik
wil nog steeds die rit er (voor administratieve redenen) in kunnen zetten."*

De melding komt uit `parseTripWindow` (`lib/transport-form.ts`), en die draait
voor leden én voor het team.

**Plan.** Een optie `allowPast` die enkel de teamacties meegeven
(`adminCreateTransportAction`, `createTransportForReservationAction`). Een lid
blijft geweigerd, aan de serverkant. De rit komt binnen zoals elke rit die het
team inplant (goedgekeurd), en wordt afgerond via "Rit afronden" zodat de
kilometers erbij kunnen. Het formulier zegt dat het verleden is ("telt mee in de
statistieken") en de historiek krijgt een regel "ingepland met terugwerkende
kracht".

### F6.2. "Hele dag" toont niet de hele dag
**P1 · meten, dan code**

De berekening trekt de kop (met de evenementenstrook) al af van de pane. Wat ik
dus nog niet weet, is waarom het toch scrolt. Kandidaten, in volgorde van
waarschijnlijkheid:

1. **`MIN_HOUR_PX = 22`** (`components/transport-calendar/types.ts`): 24 uur is
   minstens 528 px. Op een laptopscherm, met de sitekop, de werkbalk en een
   evenementenstrook erboven, is er minder dan dat, en dan scrolt "hele dag" bij
   zoom 1.
2. **De evenementenstrook zelf**: bij veel evenementen op één dag groeit de kop en
   krimpt de dag.
3. **Een eigen fout onderweg**: `measure()` mengt `getBoundingClientRect` (visuele
   pixels) met `offsetHeight` (layout-pixels). Onder het 90%-zoom van de site op
   een laptop (zie `CLAUDE.md`) loopt dat 10% uit elkaar. Dat geeft eerder een
   leeg stuk onderaan dan een scrollbalk, maar het hoort er rechtgezet te worden.

**Plan.** Eerst meten op 1440x900 en 1280x720, met en zonder evenementen, en kijken
wat de scrollhoogte is. Dan kiezen: de evenementenstrook beperken (twee rijen en
"+3 meer"), de ondergrens verlagen, of beide. Niet op gevoel de drempel verlagen.

---

# Fase 2: wie mag wat aanvragen en doen

### F6.27. De jaarwerkingen ontbreken in "Voor welke post of werkgroep"
**P1 · data · 📝**

*"Zitten deze al in het systeem? En hoe kunnen die hun bijrijders doorgeven?"*

**Antwoord: nee.** Productie telt 15 posten (plus Lustrum, niet actief) en 7
werkgroepen: BEST, Biomedix, Chemix, Existenz, Mechanix, Revue, Statix. In de code
staan de jaarwerkingen enkel als vaste lijst in het bestuursorgaan
(`BO_EXTRA_POSTS`), zonder leden. Gevolgen nu:

- Een jaarwerkinglid hoort bij geen enkele groep, telt dus als **externe**
  (`requestsAsExternal`), en komt niet in "Voor welke post of werkgroep".
- Ze zien geen ritdetails (`canSeeTripDetails` vraagt een praesidiumpost of een
  werkgroep).
- Ze kunnen geen bijrijders doorgeven: dat mag de aanvrager, een collega van
  dezelfde post, of wie `logistiek.helpers` heeft.
- `docs/uitleendienst.md` zegt "een post, een werkgroep of een jaarwerking", wat
  voor jaarwerkingen niet klopt. Die zin moet recht.

**Plan.**

1. Vijf `Group`-rijen met `type = WERKGROEP` aanmaken via `/admin/werkgroepen` (geen
   code, wel een handeling in productie). Leden per werkingsjaar via het
   ledenbeheer; ze verlopen op 15 juli net als alle anderen.
2. Daarna kunnen ze aanvragen als werkgroep, staan ze in de keuzelijst van het
   team, en geldt voor hun bijrijders het antwoord van F6.10 en F6.24.
3. De doc-zin corrigeren en 📝 vastleggen: jaarwerkingen zijn werkgroepen.

**Let op bij het aanmaken.** Een werkgroep komt ook op de publieke pagina
`/werkgroepen`. Willen de jaarwerkingen daar niet staan, dan is dat een vlag op
`Group` in `apps/web`, en dus een eigen taak. Staan ook Kanweek, Overtime, Skireis
en Studentenwelkom in dit rijtje? Het bestuursorgaan telt er negen.

### F6.23. Een externe ziet het materiaal niet, enkel de melding
**P1 · code · 📝**

*"Fix dat een gewone niet werkgroep/praesidium student, als die materiaal wil
aanvragen ook gwn de melding krijgt dat het nog niet open is voor externen, zonder
dat hij onze hele inventaris kan zien."*

Beslist (D1). `app/materiaal/page.tsx` haalt `getCatalog()` nu voor iedereen op en
zet de melding in de plaats van de knop. De catalogus staat dus in de HTML.

**Plan.** Is `externalRequestsBlocked` waar, dan haalt de pagina de catalogus niet
op en toont ze enkel `ExternClosed`. Hetzelfde voor `/materiaal/[id]`, want een
rechtstreekse link toont anders het item. Zoals bij de evenementen en sjablonen
voor externen: wat niet opgehaald wordt, staat ook niet in de HTML. Vervoer en
`/vervoer/bezetting` blijven zoals ze waren. 📝 De sectie "De uitleendienst gaat in
fases open" in `design-decisions.md` krijgt de uitzondering erbij. Test met een
pure helper die zegt of de catalogus zichtbaar is.

**Afhankelijkheid: F6.27.** Zonder die eerst gaat de poort ook dicht voor de
jaarwerkingen.

### F6.24. Elk praesidiumlid kan bij elke rit een bijrijder toevoegen
**P2 · code · 📝**

Nu mag dat de aanvrager, een collega van dezelfde post en wie `logistiek.helpers`
heeft (`canEditAllHelpers`, `addTripHelperAction`, `vanBookingForMember`).

**Plan.** Een lid van een praesidiumpost mag op het ritkaartje van
`/vervoer/bezetting` een bijrijder **toevoegen** aan elke goedgekeurde of
aangevraagde rit. Weghalen mag enkel wie hem toevoegde (`addedById`), de aanvrager,
de post en het team. Het nummer van een bijrijder blijft bij de post van de rit
(bestaande regel): de lezer ziet namen, geen nummers van andere posten. Server
herchecken in de actie en de regel in `lib/uitleen.ts` en `uitleen-server.ts` gelijk
houden; `test/trip-access.test.ts` dwingt dat al af.

### F6.21. Per voertuig instellen of leden het mogen aanvragen
**P2 · code · 🗄️ (op `UitleenVehicle`, niet op de rit)**

*"Handig voor Dockx busje en 'logistiek als bijrijder'."*

**Plan.** Kolom `requestableByMembers Boolean @default(true)` op `UitleenVehicle`.
Bestaande voertuigen blijven aanvraagbaar (de default is hier wel juist: er
verandert niets). Schakelaar in `/beheer/instellingen`, "Voertuigen & tarieven".

- `activeVehicles()` voor het aanvraagformulier filtert erop; het team kiest er
  gewoon uit in de planning.
- **De poort staat in de actie** (`createVanBookingAction`), niet enkel in het
  formulier, zoals bij `externalGate`: een verborgen keuze houdt niemand tegen die de
  actie rechtstreeks aanroept.
- Het voertuig blijft getekend in de planning en op het publieke overzicht.

**Vraag:** wat is "logistiek als bijrijder"? Een voertuig? Dat is geen voertuig maar
een bijrijder (`UitleenTransportHelper`), en een fake voertuig bezet een slot dat het
niet bezet. Zie de open punten.

---

# Fase 3: leesbaarheid van de planning

### F6.1. Een dubbelboeking toont nog steeds het voertuig
**P2 · code**

In `blockLook` (`components/transport-calendar/trip-block.tsx`) staat
`block.conflict ? '' : vehiclePatternClass(...)`: bij een conflict gaat de arcering
bewust weg, "want dan is de rode vulling het enige wat je moet zien". Maar bij een
botsing is het voertuig juist de reden.

**Plan.** De arcering blijft staan bij een conflict, op de rode vulling (donkerder
patroonkleur uit dezelfde tokens, zodat ze in beide modi leest). Plus altijd het
icoon en de naam van het voertuig bij een conflict, ook wanneer "Weergave" ze uit
heeft. De legende tekent al de echte blokken en krijgt een conflictblok mét
arcering erbij. Eén plek (`blockLook`), dus dag, week en maand volgen vanzelf.

### F6.17. De ritten van je eigen post vallen niet op
**P2 · code**

De gele rail (`.trip-mine`, 3px links) valt weg op een pastelkleur die zelf geel is
(Boter, Amber) en in het algemeen tussen een volle week.

**Plan.** De rail navy en 4px met een witte binnenrand, zodat hij op alle kleuren in
beide modi zichtbaar is, plus een klein merkteken in het blok. En: de ritten die
niet van jou zijn lichter zetten zodra je een post hebt, met één klik "Enkel mijn
post" in de filters (de postfilter van F4.1 bestaat al). Nakijken tegen álle
kleuren, ook de nieuwe van F6.7.

### F6.8. Een echt autoicoon en een echte bakfiets
**P2 · code**

De `car`-tekening in `components/logistics-icon.tsx` is een bak met twee wielen; de
`cargobike` een fiets zonder bak. In het ritblok staan ze op 12 px.

**Plan.** Beide opnieuw tekenen op het 24px-raster: een auto in zijaanzicht met
ruiten en wielkasten, een bakfiets met de grote bak vooraan en twee wielen. Een
proefblad met kandidaten op 12, 16 en 24 px in licht en donker, en daarop kiezen
(het icoon moet op 12 px nog een auto blijken). `VEHICLE_ICONS` en de keuzelijst in
de instellingen volgen vanzelf.

### F6.7. Meer kleuren voor chauffeurs
**P2 · code**

*"Maar laat ieder zijn huidige kleur behouden. En bij toevoegen nieuwe chauffeur,
geef die automatisch Salie als kleur."*

**De valkuil.** De automatische kleur is `hash(id) % DRIVER_COLOR_COUNT`. Wordt die
24 → 40, dan krijgt iedereen zonder gekozen kleur een andere. Dus twee constanten:
`AUTO_COLOR_COUNT = 24` (de hash, nooit wijzigen) en `DRIVER_COLOR_COUNT = 40` (wat
te kiezen valt).

**Plan.**

- Zestien tokens `--driver-25` tot `--driver-40` in `app/design/theme.css`, in het
  lichte én het donkere blok, gekozen op afstand van de bestaande vierentwintig en
  van elkaar (anders heb je enkel meer bijna-gelijke pasteltinten).
- `DRIVER_COLOR_NAMES` aanvullen; `isDriverColorIndex` gebruikt het grote aantal.
- `createDriverRow` zet `colorIndex` op 24 (Salie) bij een **toegevoegde** chauffeur.
  Wie via de post Logistiek chauffeur is, heeft geen rij en houdt zijn hashkleur.
- Een test die voor een reeks id's vastlegt dat de automatische kleur niet
  verandert: "iedereen houdt zijn kleur" als vergrendeling.
- Het statistiekenscherm meldt al wanneer twee chauffeurs samenvallen; meerdere
  nieuwe chauffeurs in Salie triggeren dat vanzelf.

### F6.3. Weergave "komende x dagen"
**P2 · code**

**Plan.** Een vierde weergave naast dag, week en maand: `?weergave=dagen&aantal=5`.
Het anker is vandaag (niet de maandag), de meest linkse dag is dus vandaag en
daarnaast de volgende `x - 1`. Vorige en volgende verschuiven met `x` dagen, en
"Vandaag" zet terug.

- `lib/calendar-range.ts`: `CALENDAR_VIEWS`, `calendarRange(view, anchor, count)`,
  `shiftAnchor` en `isCurrentPeriod`, met tests.
- Een aantal tussen 2 en 14; de keuze blijft bewaard zoals de zoom.
- Dezelfde `TransportCalendar` op de teamplanning en op `/vervoer/bezetting`, dus
  één wijziging. Op een telefoon in volledig scherm blijft `mobile-calendar` de
  dagweergave; het venster volgt het aantal daar niet.

---

# Fase 4: nota's en wijzigingen

### F6.15. Nota's en "Extra info van Logistiek" dichter bij elkaar
**P2 · code · 📝**

Samenvoegen zou ik niet doen. `adminNote` is de tekst die in de mail naar de
aanvrager staat en de afwijzingsreden; `UitleenTransportNote` is een werknota met een
zichtbaarheid (`PRIVE`, `POST`, `POST_EN_LOGISTIEK`). F4.20 koos er bewust voor ze
gescheiden te houden ("een tekst die op twee plaatsen staat, loopt bij de eerste
wijziging uiteen"). Een samengevoegd veld heeft twee betekenissen en één
zichtbaarheid.

**Plan.** In het paneel van de planning, op `/ritten` en op het kaartje één blok
"Nota's": bovenaan "Extra info van Logistiek" (met erbij wie het leest), eronder de
eigen nota's. Nu staat het veld in het bewerkformulier en de nota's er ver onder.

### F6.16. Nota's zichtbaar op de publieke transportplanning
**P2 · code**

`/vervoer/bezetting` zet `memberNote` en `adminNote` voor een post hard op `null`
("het werkblad van Logistiek"), en `TripNotes` staat er niet.

**Plan.** Bij een rit van je eigen post (`ownsTransportBooking`) en bij een rit die
je zelf rijdt: "Extra info van Logistiek" en de nota's met zichtbaarheid `POST` of
`POST_EN_LOGISTIEK` (`tripNotesFor` filtert al op wat je mag lezen; `PRIVE` blijft
van de auteur). Bij andermans rit niets. Het team krijgt `TripNotes` er ook bij,
want dat laagje ziet nu wel `adminNote` maar geen eigen nota's. Dezelfde regel op de
server en in de tekening, met een test zoals `trip-access.test.ts`.

### F6.11. Wijzigingen bij het goedkeuren zijn zichtbaar
**P2 · code · 📝**

De diff ("Uren: ... werd ...", "Voertuig: ...") staat al in de auditlog en in de
mail bij een wijziging. Bij het goedkeuren ziet de aanvrager er niets van.

**Plan (D3).** Een helper die de `EDITED`-regels van een teamlid sinds de aanvraag
ophaalt (geen nieuwe kolom).

- **Aanvrager:** een blok "Logistiek paste je aanvraag aan" op de ritkaart onder Mijn
  reservaties en op `/vervoer/[id]`, en hetzelfde bovenaan de goedkeuringsmail.
- **Team:** een badge "gewijzigd t.o.v. aanvraag" in `/beheer/vervoer` en in het
  paneel van de planning.
- Controleren dat ook "voertuig wisselen" een leesbare auditregel schrijft; zo niet
  die toevoegen.
- Logistiekmails staan niet in het register van `/admin/it/flows`
  (`apps/web/lib/mailPreviews.ts`). Eerst bekijken of dat register ze mag kennen
  zonder een Docker-buildafhankelijkheid te scheppen (`dockerBuildInputs.test.ts`).

### F6.12. Nota's onder "Mijn reservaties"
**P2 · code**

De nota van het lid en de nota van Logistiek staan op de detailpagina's, niet op de
kaart in de lijst (`app/reservaties/page.tsx`). **Plan:** beide op de kaart, op
twee regels ingekort met "Lees meer", voor materiaal en voor vervoer.

### F6.13. "2x transport" zegt niets
**P2 · code**

`countByKind` in `app/evenementen/page.tsx` telt ritten, en een heen- en terugrit is
er twee: "2× transport" voor één aanvraag. **Plan:** per aanvraag één regel met
soort, datum en uur, voertuig en status ("Rit za 14/11 18:00 tot 23:00, Auto,
Goedgekeurd"; "Materiaal, 12 stuks, aangevraagd"), de eerste drie en "en 2 meer".

---

# Fase 5: statistiek

### F6.4. Wie rijdt op welke weekdag
**P2 · code**

**Plan.** `DriverStat.perWeekday: number[7]`, gevuld in dezelfde wandeling
(`eachQuarter`) als `perHour`: de weekdag is daar al bekend. Geen tweede wandeling
over de ritten (zie `docs/uitleendienst.md`). Het paneel "Op welk uur er gereden
wordt" wordt "Wanneer er gereden wordt" met een schakelaar **Uur van de dag |
Weekdag**; de weekdagversie is dezelfde gestapelde balk, met zeven kolommen. Het
rekenwerk komt in `lib/driver-hours.ts` (puur, getest); ook de tabelweergave blijft
bestaan, want kleur is nooit de enige uitleg.

### F6.5. Een ander beeld voor "Op welk uur er gereden wordt"
**P2 · code**

Terecht: in een gestapelde balk heeft enkel het onderste segment een gedeelde
basislijn, dus enkel die vergelijk je betrouwbaar.

**Plan.** Naast "Gestapeld" een tweede weergave **Per chauffeur**: een kleine
kolomgrafiek per chauffeur (de top acht, plus "Overige"), allemaal op dezelfde
schaal, gesorteerd op uren. Gestapeld blijft bestaan. Een heatmap chauffeur x uur
schaalt beter naar veertig chauffeurs, maar leest op kleur alleen; als Per chauffeur
tekortschiet, is dat de volgende stap.

### F6.6. De drukteweergave volgt de gekozen chauffeur
**P2 · code**

"Wanneer de voertuigen weg zijn" (`Heatmap`) krijgt `focus` zoals "Op welk uur" al
heeft. **Plan:** `DriverStat.heat: number[]` (168 getallen, weekdag x uur) per
chauffeur uit dezelfde wandeling; klik je iemand aan bij "Wie reed het meest", dan
toont ook de heatmap enkel zijn weekdag-en-uur. Samen met F6.4 geeft dat precies
"Op welk uur, maar dan ook met weekdag erbij". Het paneel zegt "bezette uren": zonder
chauffeur is het de som over alle voertuigen.

### F6.25. "Er zit blijkbaar meer dan 24u in een dag"
**P2 · wacht op een screenshot**

Het document noemt een screenshot die in de tekst niet staat. Zonder kan ik niet
zeggen welk scherm dit is. Een sterke verdachte: het dubbel inplannen van F6.26.
`transportStats` telt elke goedgekeurde of afgeronde rit, dus twee ritten van
dezelfde chauffeur over elkaar tellen allebei. Een chauffeur kan zo 30 uur op één
dag "rijden", en dat is precies wat gebeurt wanneer het team eerst dubbel inplant
en daarna schuift. Als het dit is, tellen de uren per chauffeur bij overlap één keer
(de unie van de vensters), en de overlap staat apart vermeld.

---

# Fase 6: herhaalde ritten

### F6.22. Een rit herhalen
**P3 · code · 🗄️ · 📝**

*"Optie tot herhaaldelijke rit instellen (bv c&g rit, containerparkrit, BO rit)."*

**🗄️ Migratie** (D2): `seriesId String?` op `UitleenTransportBooking`. **Wat bestaande
ritten krijgen: `NULL`, "geen deel van een reeks".** Dat is het eerlijke antwoord en er
komt geen backfill; schrijf dat in de comment van de migratie. Het scherm moet "geen
reeks" aankunnen. `test/rit-kolommen.test.ts` faalt tot de kolom daar mét die
beslissing staat, en `test/integration/oude-rit.integration.ts` haalt een rit zonder
`seriesId` door `tripsForDriver`, `tripsForGroups` en `buildTransportFeed`.

**Plan (klein beginnen).**

- In het intekenformulier een blok "Herhalen": wekelijks op gekozen weekdagen (elke 1
  tot 4 weken), of maandelijks (dezelfde datum, of dezelfde weekdag-positie zoals "de
  eerste maandag"), tot een einddatum of een aantal (hoogstens 52).
- **Een voorvertoning vóór het opslaan**: de lijst van datums, met erbij welke botsen.
  Twaalf ritten aanmaken om er twee te zien botsen is de fout om te vermijden.
- `lib/recurrence.ts`, puur en getest. **De klok is die van Brussel**: een wekelijkse
  rit om 18:00 blijft 18:00 over de zomertijdwissel; "plus zevenmaal 24 uur" breekt
  dat, dus getest rond eind maart en eind oktober.
- Aanmaken in één transactie met dezelfde `seriesId`; het team plant ze, dus
  `plannedByTeam`.
- In het paneel staat "Deel van een reeks (7 van 24)" met **"Verwijder deze en alle
  volgende"** achter een bevestigingsdialoog die zegt hoeveel ritten weggaan en dat de
  eerdere blijven. Wijzigen blijft per rit in deze eerste versie (en dat zeggen we).

---

# Een gesprek, geen code

### F6.18. Hoe zijn evenementen nu geïntegreerd?
**geen code**

*"Het lijkt mij dat die nu aan de algemene site 'vasthangen'."*

**Hoe het nu zit.**

- `UitleenEvent` is een **eigen tabel** (naam, locatie, begin en einde, post,
  verwachte opkomst, nota) en geen kopie van een kalenderevenement.
- Er is een **optionele 1-op-1-koppeling** naar een kalenderevenement op vtk.be
  (`calendarEventId`). Zet iemand daar "Logistiek nodig" aan, dan ontstaat het
  logistiekevenement en volgen naam, locatie en uren het kalenderevenement.
- **Een evenement dat niet publiek is, kan nu al**: een lid maakt het aan bij het
  aanvragen ("Maak hier een nieuw evenement van", het vakje uit F6.14), en het team
  maakt er een via "Nieuw evenement" in `/beheer/evenementen`. Een
  praesidiumweekend hoeft dus nergens in de publieke kalender te staan.
- Materiaal, flesserke en transport verwijzen met een **optionele** `eventId`. Een
  aanvraag zonder evenement bestaat dus ook.

**Wat niet klopt met "alle logi-aanvragen hangen aan een evenement".** Het
evenement is optioneel, het makkelijkste pad loopt via de publieke kalender, en de
knop om er zelf een te maken werkt in de praktijk niet (F6.14).

**Voorstel voor de agenda van een meet.**

1. Wordt een evenement verplicht bij elke aanvraag, en wat is dan het geval "gewoon
   een rit naar de loods"?
2. Wie mag een niet-publiek evenement aanmaken, en wie ziet het in de keuzelijst
   (nu zien alle leden de evenementen van anderen)?
3. Is het evenement de eenheid voor de klaarzetlijst en de afdruk?
4. Wat gebeurt er met een evenement wanneer het kalenderevenement verdwijnt of
   verschuift?

---

## Open punten voor Maxime

1. **Screenshot voor F6.25.** Het document noemt er een, de tekst niet.
2. **"Logistiek als bijrijder" (F6.21)**: wat is dat precies? Een bijrijder op een
   rit lijkt me een bijrijder en geen voertuig.
3. **Jaarwerkingen (F6.27):** alleen de vijf uit het document, of ook Kanweek,
   Overtime, Skireis en Studentenwelkom? En mogen ze op `/werkgroepen` staan?
4. **F6.10 bij de bakfiets:** de keuzelijst verbergen omdat de aanvrager zelf rijdt?
5. **F6.19:** akkoord dat een rit in het verleden gewoon goedgekeurd binnenkomt en
   daarna afgerond wordt?
