# Werkplan: transportronde 4 (september 2026)

Bron: feedback van Logistiek op `apps/logistiek`, september 2026. Negen punten,
bijna allemaal over de transportplanning (`/beheer/vervoer/week`).

Bouwt voort op `docs/logistiek-feedback-plan.md` (ronde 1),
`docs/logistiek-feedback-ronde-2.md` (ronde 2) en
`docs/logistiek-transport-ronde-3.md` (ronde 3), alle drie afgewerkt.

Technische kaart van de module: `docs/uitleendienst.md`.
Productkeuzes: `docs/design-decisions.md` (§ Uitleendienst).
Rechten: `docs/permissions.md`.

## Hoe je dit gebruikt

1. Kies een fase (of één taak) en geef die in plan-modus.
2. Taken met **🗄️** vragen een Prisma-migratie in `packages/db/prisma/schema.prisma`.
3. Taken met **📝** vragen een sectie in `docs/design-decisions.md`.
4. Vink af in dit bestand als iets af is; zet er het commit-hashje bij.

Prioriteiten: **P1** = bug of dagelijkse ergernis, **P2** = duidelijke
verbetering, **P3** = groter of "ooit".

Alles wordt op **390px breed** nagekeken, niet alleen op desktop.

## Beslissingen die al gevallen zijn

- **D1. Verwijderen mag, maar enkel voor wat het team zelf tekende.** Een rit die
  uit een ledenaanvraag komt, blijft afwijzen of annuleren; de aanvrager mag zijn
  rit nooit zien verdwijnen zonder reden in zijn scherm. Zie R1.
- **D2. "Andere" is niet factureerbaar.** De vrije naam wordt opgeslagen als
  `requesterType = WERKGROEP` + `requesterName`, dus `chargesRequester()` blijft
  false en er komt geen prijs of betaalstatus bij die rit. Zie R5.
- **D3. Sorteren wordt overal gelijkgetrokken**, niet enkel op het ene scherm dat
  het mist. Zie R3.

## Statusoverzicht

| Fase | Inhoud | Taken | Status |
| --- | --- | --- | --- |
| 0 | Uitzoeken, geen code | R6 | 🟡 script klaar, antwoord volgt van de server |
| 1 | Twee echte bugs | R8, R9 | ✅ af |
| 2 | De kalender bedienbaar maken | R2, R7 | ✅ af |
| 3 | Ritten beheren | R1, R5 | ✅ af |
| 4 | Lijsten en mail | R3, R4 | ✅ af |

Volgorde is niet vrijblijvend: fase 1 zijn twee fixes van enkele regels die het
team vandaag hinderen, fase 2 raakt hetzelfde bestand (`time-grid.tsx`) en fase 3
en 4 vragen een migratie.

---

# Fase 0: uitzoeken

### 🟡 R6. Welke omgeving hangt hieraan, en waarom kan ik niet meer in /admin?
**P1 · geen code, wel een antwoord**

Twee vragen in één, en ze hebben niets met elkaar te maken.

**Welke omgeving.** Dat staat niet in de repo: het komt uit het `.env` op de
server. Wat de code wél vastlegt:

- `apps/logistiek` heeft **geen eigen login**. `lib/session.ts` roept
  `fetchSession()` uit `packages/auth/src/remote.ts` aan, en die post de cookie
  naar `${VTK_MAIN_URL}/api/auth/remote/session`. **`VTK_MAIN_URL` is dus het
  antwoord op de vraag**, en de fallback in die regel is `https://vtk.be`.
- In `infra/docker-compose.yml` krijgt de `logistiek`-service
  `VTK_MAIN_URL: ${VTK_MAIN_URL:-https://vtk.be}`, geïnterpoleerd uit `infra/.env`,
  en `env_file: ../.env`. Dezelfde compose-stack draait op allebei de hosts:
  elise (dev, `deploy-dev.yml`) en liv (productie, `deploy-prod.yml`), telkens
  vanuit `/home/it/vtk-website-new`.
- De `logistiek`-container praat met **dezelfde Postgres als de `web`-container
  op diezelfde host**. Logistiek op de dev-host leest dus de dev-databank; op de
  prod-host de productiedatabank.

Nakijken, per host:

```sh
ssh it@<host> "grep -E '^(VTK_MAIN_URL|LOGISTIEK_PUBLIC_URL|SESSION_COOKIE_DOMAIN)=' /home/it/vtk-website-new/.env"
```

> **Let op de val hier.** Staat `VTK_MAIN_URL` niét in het `.env` van de
> dev-host, dan valt de dev-logistiek stil terug op `https://vtk.be` en
> **valideert hij sessies tegen productie** terwijl hij uit de dev-databank
> leest. Dat faalt zonder foutmelding en verklaart precies het soort verwarring
> waarin "ik heb toch rechten" en "hij zegt van niet" allebei waar zijn. Is dat
> zo, zet de regel er dan bij; dat is de fix voor deze taak.

**Waarom /admin niet meer opengaat.** Dat gaat over `apps/web`, niet over deze
app. `/admin` zelf vraagt enkel een sessie (`app/[locale]/admin/page.tsx`); de
onderliggende schermen vragen elk hun permissie. Drie kandidaten, in volgorde van
waarschijnlijkheid:

1. **De 15-juli-reset.** `UserRole` en `GroupMembership` zijn per werkingsjaar
   opgeslagen en de resolver telt enkel het lopende jaar
   (`packages/auth/src/lib/workingYear.ts`, cutover 15 juli). Vandaag is dat
   **2026 ("26-27")**. Staat je lidmaatschap van de post IT nog op 2025, dan zijn
   al je permissies weg, ook al is er niets veranderd aan je account.
   `User.isSuperAdmin` is het enige dat de cutover overleeft.
2. **Een gate in `apps/web/proxy.ts`** stuurt je van élke pagina weg, en dan lijkt
   dat op "ik raak niet in /admin": onboarding niet af, de studiebevestiging
   (`needsStudyConfirmation`, cutover 27 september) of de optionele
   `@vtk.be`-koppelgate. Kijk waar de browser naartoe redirect.
3. Pas als 1 en 2 uitgesloten zijn: een rol die de permissie niet meer bevat.

Diagnose zonder gokwerk: een scriptje dat voor één e-mailadres
`currentWorkingYear()`, `isSuperAdmin`, de `GroupMembership`-rijen per jaar, de
`UserRole`-rijen per jaar en de opgeloste permissielijst uitprint, te draaien
tegen beide databanken. **Zet het in `apps/web/scripts/`, niet in `apps/logistiek`:
het gaat over de hoofdsite.**

De fix is dan beheerwerk (het lidmaatschap voor 26-27 zetten in
/admin/groepen), geen code. Blijkt het toch code te zijn, dan wordt dat een eigen
taak in dit bestand.

---

# Fase 1: twee echte bugs

### ✅ R8. De vinkjes "Evenementen" en "Beschikbaarheid" zijn niet uit te zetten
**P1 · code**

Echte bug, één oorzaak, drie regels fix.

`apply()` in `components/transport-calendar/filters.tsx` wist vóór het schrijven
enkel vier van de zes sleutels:

```ts
for (const key of ['voertuig', 'chauffeur', 'status', 'aanvrager']) query.delete(key);
```

`evenementen` en `beschikbaar` staan er niet bij. `filtersToQuery()` laat een
sleutel weg zodra ze op haar standaard staat (leeg = alles), dus:

- **Beschikbaarheid aanzetten** schrijft `beschikbaar=1`. **Uitzetten** schrijft
  niets meer, maar `beschikbaar=1` blijft in de URL staan → het vinkje springt
  terug. Niet uit te zetten.
- **Evenementen uitzetten** schrijft `evenementen=0`. **Weer aanzetten** schrijft
  niets meer, en `evenementen=0` blijft staan → niet meer aan te zetten.
- Om precies dezelfde reden doet **"Alles tonen"** (`apply(EMPTY_FILTERS)`) niets
  aan deze twee.

**Fix.** Zet `evenementen` en `beschikbaar` in de delete-lijst. Beter nog: leid de
lijst af uit de sleutels die `filtersToQuery` kán schrijven, zodat een zevende
filter dit niet opnieuw stukmaakt. Dat vraagt een geëxporteerde
`FILTER_QUERY_KEYS` in `lib/transport-filters.ts` (bewust een niet-client module,
zie de comment bovenaan dat bestand).

**Test.** `test/transport-filters.test.ts` dekt `parseTransportFilters` en
`filtersToQuery` al, maar niet de round-trip via een bestaande query. Voeg toe:
een query met `beschikbaar=1` plus filters, `apply` met `showAvailability: false`,
en verwacht dat `beschikbaar` weg is. Idem voor `evenementen`.

### ✅ R9. De agendafeed toont "Bezet" in plaats van de rit
**P1 · code · 📝**

De feed bevat de gegevens wél. `lib/calendar/transport-feed.ts` bouwt per rit een
`SUMMARY` ("Kar: Cantus"), een `DESCRIPTION` met waarvoor, lading, aanvrager,
telefoonnummers, bijrijders, chauffeur, status en een link, en een `LOCATION`.

Wat ze onzichtbaar maakt, is één regel in `lib/calendar/ics.ts`:

```ts
lines.push(`CLASS:${event.private ? "PRIVATE" : "PUBLIC"}`);
```

en `transport-feed.ts` zet `private: true` op elk event. Google Calendar verbergt
in een geabonneerde agenda de titel en de details van een event met
`CLASS:PRIVATE` en toont er "Bezet"/"Busy"; Outlook doet hetzelfde. Het is dus
geen ontbrekende data maar een instructie aan de client om ze niet te tonen.

**Fix.** Laat `private` weg in `transport-feed.ts`, zodat de VEVENTs
`CLASS:PUBLIC` krijgen. De vertrouwelijkheid van deze feed hangt aan het geheim
in de URL, `Cache-Control: private, no-store` en `X-Robots-Tag: noindex` (zie de
route); `CLASS` voegt daar niets aan toe en kost precies de leesbaarheid waarvoor
de feed bestaat.

- Laat het `private`-veld in `IcsEvent` gewoon bestaan: het is niet fout, het
  hoort enkel niet bij een feed die je zélf abonneert om iets te kunnen lezen.
- **De comment bij dat veld moet mee.** "Enkel voor events uit een persoonlijke
  feed" is precies de redenering die hier misging.
- `test/ics.test.ts` test `CLASS:PRIVATE`; die blijft geldig (de generator
  verandert niet). Voeg een test op `buildTransportFeed` toe die verwacht dat er
  **geen** `CLASS:PRIVATE` in de transportfeed staat, en dat `SUMMARY` het
  voertuig en het doel draagt.
- 📝 Zet de reden in `docs/design-decisions.md` § "De transportplanning is
  abonneerbaar, en die link is een geheim", als bullet: *het geheim zit in de URL
  en niet in `CLASS`; dat laatste maakt van elke rit "Bezet".*

> **Nazien, apart van deze taak.** `apps/web/lib/calendar/feeds.ts` zet
> `private: true` op de persoonlijke feed, en `lesbezoeken` en de
> theokot-verhuurfeed doen hetzelfde. Daar geldt dezelfde redenering, maar het is
> een ander scherm en een andere gebruiker; niet stilzwijgend meepakken.

---

# Fase 2: de kalender bedienbaar maken

### ✅ R2. Een rit mag de dagkolom niet volledig vullen
**P1 · code**

In `components/transport-calendar/time-grid.tsx` krijgt `TimeBlock`:

```ts
const laneWidth = 100 / block.lanes;
... left: `${block.lane * laneWidth}%`, width: `${laneWidth}%`
```

Bij één rit is dat 100% breed. `beginCreate()` start enkel wanneer
`event.target === event.currentTarget` (de dagkolom zelf), dus over de hele hoogte
van die rit valt er niets meer in te tekenen: je klikt altijd het blok aan.

**Fix.** Houd een strook rechts vrij, zoals elke agenda-app doet:

- `width: calc(${laneWidth}% - ${GUTTER}px)` met `GUTTER` rond 14px, als
  benoemde constante naast `RESIZE_GRIP_PX`. Bij overlap geeft dat meteen ook
  lucht tussen de banen; bij één rit een klikbare strook.
- Doe hetzelfde in `mobile-calendar.tsx` (regels 492-493 rekenen dezelfde
  lane-breedte uit) zodat de twee weergaven niet uit elkaar lopen.

**Meteen meenemen, zelfde klacht.** De uurlijnen in de dagkolom zijn
`<span className="absolute inset-x-0 border-t ...">` **zonder**
`pointer-events-none`. Een pointerdown die precies op zo'n lijn valt, heeft die
span als `target` en wordt door de `event.target !== event.currentTarget`-check
weggegooid: één dode lijn per uur, midden in het vlak waar je moet kunnen
tekenen. Dezelfde behandeling voor de nu-lijn (`border-t-2 border-red-500`). De
banden en het sleepblok hebben `pointer-events-none` al.

**Test.** `test/week-lanes.test.ts` en `test/calendar-zoom.test.ts` raken dit
niet; de breedte is presentatie. Nakijken in de browser: dag- en weekweergave,
één rit, twee overlappende ritten, en op 390px.

### ✅ R7. Zelf kiezen wat er in een rit-blok staat, inclusief de post
**P2 · code · 📝**

Vandaag staat er in elk blok: uur, titel, voertuig, chauffeur. De **post of
werkgroep** waarvoor de rit rijdt staat er niet, terwijl `TripBlock.subtitle` die
al draagt (`requesterLabel(booking)` in `app/beheer/vervoer/week/page.tsx`): hij
komt enkel in de tooltip en de `aria-label` terecht, via `blockLabel()`.

**Bouwen.** Een knop **Weergave** in de werkbalk van `TransportCalendar`, naast
Filters, met dezelfde uitklapvorm als `TransportFilterBar` (paneel, buitenklik
sluit, Escape sluit). Vinkjes per veld:

| Veld | Bron | Standaard |
| --- | --- | --- |
| Uur | `block.start`/`end` | aan |
| Titel (evenement of doel) | `block.title` | aan |
| Voertuig | `vehicle.name` + icoon | aan |
| Chauffeur | `block.driver` | aan |
| **Post of werkgroep** | `block.subtitle` | **uit** |
| Bestemming | nieuw veld op `TripBlock` | uit |
| Lading | nieuw veld op `TripBlock` | uit |

- De eerste vijf vragen **geen serverwijziging**: alles staat al in `TripBlock`.
  Bestemming en lading wel: `TripBlock` in `components/transport-calendar/types.ts`
  uitbreiden en mappen in `week/page.tsx` (`booking.destination`,
  `booking.cargoNote`). Die twee zijn optioneel; laat ze weg als de taak te groot
  wordt en houd de post, want dat is wat gevraagd is.
- **Waar het blijft staan: `localStorage`, niet de URL.** De filters staan in de
  URL omdat een gefilterde week deelbaar hoort te zijn en omdat de server enkel
  moet ophalen wat je ziet. Dit is geen van beide: het verandert niets aan de
  query, het is een voorkeur van één persoon, en zes extra parameters maken elke
  gedeelde link onleesbaar. Volg de zoom (`ZOOM_STORAGE_KEY` in `types.ts`), met
  dezelfde try/catch eromheen: in een privévenster gooit de accessor zelf.
  Lezen in een effect en niet als beginwaarde, anders is het een hydratiefout.
- Geef het door aan `TimeGrid` → `BlockContent` → `blockLook`/`blockLabel` als één
  `fields`-object. **`blockLabel()` blijft alles tonen**: de tooltip en de
  screenreader zijn niet de plek om informatie weg te laten omdat het blok smal
  is. Dat is ook waarom `showDriver` blijft bestaan naast dit: dat is een
  server-beslissing (het publieke overzicht toont geen namen), geen voorkeur.
- Een blok van een kwartier is 24px hoog. Alles aanvinken vult dat niet; dat is
  de reden dat `compact` bestaat (`block.lanes > 1`). Laat de velden gewoon
  afkappen zoals nu, en zet er geen hoogte-logica bij.
- 📝 `docs/design-decisions.md`: waarom dit een voorkeur per browser is en geen
  teaminstelling, en waarom de tooltip volledig blijft.

---

# Fase 3: ritten beheren

### ✅ R1. Een rit verwijderen
**P1 · code · 🗄️ · 📝**

Vandaag kan het niet, en dat is een expliciete keuze geweest. Bovenaan
`app/beheer/vervoer/week/planner.tsx` staat:

> **Verwijderen.** Een rit gaat niet weg, ze wordt afgewezen of geannuleerd, en
> dat blijft in de historiek staan.

**Die keuze wordt bijgesteld, niet omgegooid (D1): enkel een rit die het team
zelf intekende, mag echt weg.** Een rit die uit een ledenaanvraag komt, blijft
afwijzen of annuleren; daar hangt een aanvrager aan die een reden hoort te zien
in plaats van een lege plek.

**🗄️ Migratie.** Er is vandaag geen veld dat de twee uit elkaar houdt.
`adminCreateTransportAction` schrijft meteen `status: APPROVED` plus een
auditregel met de note `'ingepland door Logistiek'`, en dat is de enige plek waar
die string geschreven wordt; een delete-knop op een stringvergelijking bouwen is
dat niet waard.

- `UitleenTransportBooking.plannedByTeam Boolean @default(false)`, met een
  comment die zegt waarvoor het veld bestaat (verwijderen mag, afwijzen is voor
  de rest) en niet enkel wat het is.
- Zet hem in `adminCreateTransportAction` en in
  `createTransportForReservationAction` (die maakt de levering bij een
  materiaalaanvraag; ook teamwerk).
- Backfill in de migratie, precies omdat die string maar uit één plek komt:
  ```sql
  UPDATE "UitleenTransportBooking" SET "plannedByTeam" = true
   WHERE id IN (SELECT "transportBookingId" FROM "UitleenAuditLog"
                 WHERE note = 'ingepland door Logistiek');
  ```

**De actie.** `deleteTransportAction(bookingId)` in `app/actions/beheer.ts`, naar
het model van `deleteEventAction`:

- `await requireManage()`. Geen nieuwe permissie: `logistiek.manage` is de
  beheerpermissie en staat in `packages/db/src/permissions.ts`; er hoeft niets bij
  in de registry of in `apps/web/lib/mcp/policy.ts` (die blokkeert
  transportplanning al voor agents).
- Weigeren, elk met een eigen foutmelding die zegt wát er in de weg staat:
  - `!booking.plannedByTeam` → "Deze rit komt van een aanvraag; wijs ze af of
    laat de aanvrager annuleren."
  - `status === 'COMPLETED'` → een gereden rit is geschiedenis.
  - er hangt een `UitleenPayment` aan. **Dit is geen keuze maar een DB-regel:**
    `UitleenPayment.transportBooking` staat op `onDelete: Restrict`, dus een
    delete faalt daar met een Prisma-fout in plaats van met een zin. Vang het
    vooraf af.
- `tripGroupId`: hoort er een bij, verwijder dan de hele groep, zoals
  `cancelVanBookingAction` en `rejectTransportAction` de groep in haar geheel
  behandelen. Zeg in de bevestiging hoeveel ritten er weggaan.
- Wat mee verdwijnt: `UitleenAuditLog` en `UitleenTransportHelper` staan allebei
  op `onDelete: Cascade`. **De historiek van die rit is dus weg**, en dat hoort
  de bevestigingsdialoog te zeggen (CLAUDE.md: zeg wat er precies weg is en wat
  blijft).
- `revalidateBeheer()` plus de rittenpagina van het lid.

**De knop.** In de inspector van de planning (`planner.tsx`), onderaan bij "Rit
aanpassen", en op `/beheer/vervoer` in de detailweergave. Gebruik
`components/ui/confirm-action-button.tsx` (`ConfirmActionButton`, `destructive`,
`variant="danger"`): die bundelt bevestiging, icoon en toast al. Bouw het patroon
niet opnieuw en gebruik geen `confirm()`.

- `components/logistics-icon.tsx` heeft nog geen `trash`. Zet er een bij in de
  `IconName`-union in plaats van `close` te lenen: een kruisje betekent daar al
  "sluiten".
- Toon de knop **niet** bij een rit die niet verwijderbaar is. Een knop die
  altijd weigert, leert mensen op knoppen te klikken die niets doen.

📝 `docs/design-decisions.md`, § Uitleendienst: de bijgestelde regel, met de reden
(een rit van een lid verdwijnt niet zonder reden; een rit die het team zelf
tekende is een tekening en geen afspraak met iemand) en wat er bij het
verwijderen meegaat.

**De comment bovenaan `planner.tsx` moet mee.** Die staat er nu als "wat hier
bewust níét staat"; ze wordt "wat hier voor welke rit staat". Een doc-comment die
het tegenovergestelde beweert van de code eronder, is erger dan geen comment.

### ✅ R5. "Andere" bij "Voor welke post of werkgroep"
**P2 · code**

In `app/beheer/vervoer/week/new-trip-form.tsx` (regel 157) staat de keuzelijst:
"Logistiek zelf" plus alle posten en werkgroepen uit `activeGroups()`. Wie voor
iets anders rijdt, kan dat nergens kwijt.

**Bouwen.**

- Een optie `Andere…` onderaan de lijst. Gekozen → er verschijnt een tekstveld
  "Naam" eronder. Verplicht zodra "Andere" gekozen is, anders is het alsnog een
  rit zonder aanvrager.
- `NewTripValues` krijgt een `requesterName: string` erbij naast `groupId`.
- Meesturen naar `adminCreateTransportAction`: die neemt `requesterType` en
  `requesterName` al aan; ze worden vandaag gewoon niet doorgegeven door dit
  formulier (de actie valt terug op `'INTERN'`).
- **D2: `requesterType: 'WERKGROEP'`, niet `'EXTERN'`.** `chargesRequester()` in
  `lib/uitleen.ts` geeft enkel bij `EXTERN` true, en dan duiken prijs, tarief en
  betaalstatus op bij die rit, aan beide kanten van het scherm. Dat is niet wat
  "andere" hier betekent.
- Serverkant meevalideren: `requesterName` verplicht zodra `requesterType !==
  'INTERN'`, en afkappen zoals de andere velden in `buildTransportBookings` dat
  doen. De client is niet de poort.
- Weergeven hoeft niets: `requesterLabel()` toont bij niet-INTERN al
  `requesterName`, dus de planning, de lijst, het paneel en de agendafeed pikken
  het vanzelf op.

---

# Fase 4: lijsten en mail

### ✅ R3. Sorteren in beide richtingen, overal hetzelfde
**P2 · code**

Nagekeken, scherm per scherm. Vijf van de zes draaien de richting al om bij een
tweede klik; **één niet**, en één lijst heeft helemaal geen sortering:

| Scherm | Vandaag |
| --- | --- |
| `/beheer/aanvragen` | ✅ `sort` + `dir` in de URL, tweede klik draait om |
| `/beheer/chauffeurs` (`driver-list.tsx`) | ✅ `useSort`, chips met ↑/↓ |
| `/beheer/materiaal` (`inventory-manager.tsx`) | ✅ `SortHeader` |
| `/beheer/flesserke` (`flesserke-manager.tsx`) | ✅ `SortHeader` |
| **`/beheer/evenementen`** | ❌ `?sorteer=datum\|naam\|post`, **altijd oplopend** |
| **`/beheer/vervoer`** | ❌ geen sortering; vast op `startAt` oplopend |

**Werk.**

1. **`/beheer/evenementen`**: een richting erbij. Het is een server-component, dus
   het patroon van `/beheer/aanvragen` (een tweede queryparameter, tweede klik op
   dezelfde sleutel draait om) en niet `useSort`, dat client-state is. Houd
   `sorteer=datum` zonder parameter als standaard, zodat bestaande links blijven
   werken, en geef de chips dezelfde ↑/↓ als `driver-list.tsx`.
   Let op `sortEvents`: bij "post" is de tweede sleutel de naam, en die tweede
   sleutel hoort **niet** mee om te draaien; anders krijg je binnen dezelfde post
   een omgekeerde namenlijst zonder dat iemand daarom vroeg. Zelfde regel als in
   `sortDrivers`, dat `compareText(a.name, b.name, 'asc')` hardcodeert als
   tiebreak.
2. **`/beheer/vervoer`**: sorteren op startuur, voertuig, chauffeur en aanvrager,
   beide richtingen, per sectie (Openstaand / Goedgekeurd / Rest). De drie
   `.sort((a, b) => a.startAt.getTime() - b.startAt.getTime())` op regel 108, 126
   en 131 worden één gedeelde vergelijker.
   **De groepering van heen- en terugritten mag er niet door breken**: `openGroups`
   bouwt per `tripGroupId` één kaart, en die volgorde bínnen een groep blijft
   chronologisch, wat de sortering buiten de groep ook doet.
3. **Gelijktrekken.** `app/beheer/sortable-header.tsx` heeft `useSort`,
   `compareText` en `SortHeader`, maar `driver-list.tsx` tekent zijn eigen chips
   en `/beheer/aanvragen` en `/beheer/evenementen` hebben elk hun eigen
   URL-variant. Trek het samen tot twee gedeelde vormen: `SortHeader` voor een
   tabelkop, en een `SortChips` voor een lijst zonder tabelkop, allebei met
   dezelfde pijl en dezelfde `aria-sort`.
   Server-componenten kunnen `useSort` niet gebruiken; laat die de sleutel en de
   richting uit de query halen en enkel de **presentatie** delen.

**Test.** `test/sortable-header.test.ts` dekt `compareText` al. Voeg een test toe
op de gedeelde vergelijker van `/beheer/vervoer` (secundaire sleutel, ritten met
hetzelfde startuur) en op de omkeerbaarheid van `sortEvents`.

### ✅ R4. Niet één mail per rit, maar één per uur
**P2 · code · 🗄️ · 📝**

**Wat er vandaag gebeurt.** `createVanBookingAction` roept
`notifyTeamNewRequest('transport', ...)` aan: één mail per **aanvraag**, met heen
en terug er allebei in. Wie vijf ritten na elkaar indient, stuurt dus vijf mails
naar dezelfde teammailbox. (`adminCreateTransportAction` mailt niets; het team
vraagt niets aan zichzelf. Ritten die het team zelf intekent zijn dus niet het
probleem.)

**Bouwen: een uurlijkse digest, geen wachtrij.** Er is al een wekker:
`logistiek-worker` in `infra/docker-compose.yml` post elke 60 seconden naar
`/api/uitleen/maintenance`. Er hoeft dus geen worker bij en geen outbox-tabel
zoals `TicketOutboxMessage`.

- **🗄️** `teamNotifiedAt DateTime?` op `UitleenTransportBooking` en op
  `UitleenReservation` (dezelfde melding bedient materiaal en flesserke).
  **Backfill in de migratie op `createdAt`**, anders mailt de eerste tick na de
  deploy elke aanvraag die er ooit geweest is.
- `notifyTeamNewRequest` verdwijnt uit de aanvraag-acties. De rij komt binnen met
  `teamNotifiedAt = null`; dat ís de wachtrij.
- In `/api/uitleen/maintenance`: per soort (`materiaal`, `flesserke`,
  `transport`) kijken wanneer de laatste digest vertrok. Is dat ≥ 1 uur geleden
  en staat er iets open, dan **één mail met alles erin**, en daarna
  `teamNotifiedAt` stempelen. Het moment van de laatste digest hoort bij de
  andere teaminstellingen: `Setting`-sleutel `logistiek.settings` naast
  `notifyEmails`, of een eigen sleutel ernaast.
- **Hergebruik `transportSummary()`/`reservationSummary()`** uit
  `lib/uitleen-mail.ts` per aanvraag en zet er een kop boven ("3 nieuwe
  ritaanvragen"). Elke aanvraag houdt dan haar eigen beslis-link, want dat is
  waarvoor de mail bestaat.
- **Naar één adres met de rest in kopie**, zoals nu. Een lege adressenlijst
  betekent nog steeds geen mail; stempel dan wél, anders blijft de wachtrij
  groeien.
- **De drie regels uit `lib/uitleen-mail.ts` blijven gelden**: ná de write,
  falen mag de aanvraag niet doen falen, en niet elke stap mailt. De eerste is nu
  vanzelfsprekend (de digest draait later), de tweede vraagt aandacht: een
  mislukte verzending mag `teamNotifiedAt` **niet** stempelen, anders is de
  melding stil weg.
- **Een last-minute aanvraag wacht niet.** Begint de rit binnen 24 uur, dan
  vertrekt de mail meteen bij het indienen en wordt de rij gestempeld. Zonder die
  uitzondering ligt een aanvraag voor vanavond een uur stil, en dat is precies
  wat M1 in ronde 3 kwam oplossen. Bewust 24 uur en niet `lastMinuteDays` (7):
  met zeven dagen zou bijna alles de digest omzeilen en verandert er niets.

📝 `docs/design-decisions.md` § "Een nieuwe aanvraag mailt het team, per soort een
ander adres": de bullet "enkel bij het indienen" wordt "gebundeld, hoogstens één
mail per uur per soort", met de reden (vijf mails naar dezelfde mailbox lezen als
vijf aanvragen, precies de klacht die deze mail moest oplossen) en de
24-uursuitzondering erbij.

**Buiten scope, bewust.** De mails naar de **aanvrager** (`notifyTransport`, bij
goedkeuren, afwijzen, wijzigen) blijven per beslissing vertrekken. Dat is de
andere richting: daar wacht iemand op een antwoord, en die een uur laten liggen
is geen verbetering.

---

## Wat er per taak nagekeken wordt

- `npm run verify` (lockfile, typegen + `tsc --noEmit`, eslint, unit tests) draait
  toch al bij elke push via `.githooks/pre-push`.
- Met een migratie erbij: `make up && make db` en de dev-server, niet enkel de
  typecheck.
- Alles op **390px breed**. Dat is tijdens ronde 1 en 2 twee keer blijven liggen.
