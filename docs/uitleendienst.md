# Uitleendienst (logistiek.vtk.be): architectuur & file map

De uitleendienst van VTK Logistiek in `apps/logistiek`: leden vragen per
**evenement** materiaal, vervoer (kar/auto/bakfiets) en flesserke aan; het team
keurt goed en verwerkt afhaling/terugbrengen/betaling. Dit vervangt het
e-mailproces (zie "How to logi"). Productkeuzes: `docs/design-decisions.md`
(§ Uitleendienst). Dit is de technische kaart; het invul- en testwerk dat het team
zelf doet staat in `docs/logistiek-ingebruikname.md`.

## End-to-end flow

1. **Aanvragen**: een ingelogd vtk.be-lid (sessie gedeeld via het
   `.vtk.be`-cookie, remote geverifieerd via `@vtk/auth/remote`) vraagt aan per
   evenement: naam, locatie, startuur, verwachte opkomst, contact, levering. Het
   **aanvragertype wordt automatisch uit de login afgeleid** (praesidiumlid in een
   post -> INTERN namens die post; anders EXTERN met de eigen naam), server-side
   afgedwongen. Materiaal, vervoer (voertuigkeuze) en flesserke (aparte tab, enkel
   praesidium) zijn elk een eigen aanvraag/flow. Status `REQUESTED`;
   prijzen/waarborgen gesnapshot. Een lid mag zijn aanvraag bewerken zolang ze
   `REQUESTED` is.
2. **Beslissen**: het team (`logistiek.manage`) keurt goed of wijst af in
   `/beheer/aanvragen` (tabs per aanvragertype, last-minute badge) en
   `/beheer/vervoer`. Bij goedkeuring kiest het team `ONLINE`/`OFFLINE`. De
   **harde voorraadcheck** loopt in een Serializable-transactie: materiaal =
   quantity min overlappende `APPROVED`/`PICKED_UP` in de periode; flesserke =
   quantity min status-gebaseerd gereserveerd; vervoer = geen twee `APPROVED`
   ritten van hetzelfde voertuig op hetzelfde moment. Het team mag een `APPROVED`
   aanvraag bewerken; de save hercheckt dan de voorraad in dezelfde tx.
3. **Vervoer**: tarief per voertuig (team-configureerbaar: gratis/per uur/per
   km/vast). Chauffeur is optioneel bij goedkeuring en wordt later toegewezen; de
   keuzelijst is de post Logistiek plus de zelf toegevoegde chauffeurs (zie
   "Chauffeurs" hieronder).
   Prijs is `null` tot ze gekend is (per km: bij afronden voert het team de
   kilometers in). Het team kan het voertuig wisselen (re-snapshot + herberekening).
4. **Betalen**: enkel de huurprijs gaat online (Mollie/mock); de waarborg blijft
   cash bij afhaling. `OFFLINE` markeert het team aan de balie.
5. **Afhalen/terugbrengen**: `PICKED_UP` -> `RETURNED`. Bij flesserke voert het
   team per lijn het teruggekeerde (gesloten) aantal in; het verbruik
   (`quantity - returned`) wordt in dezelfde tx van de flesserke-voorraad
   afgeboekt. Daarna "waarborg terug".

## Datamodel (packages/db/prisma/schema.prisma)

| Model | Wat |
| --- | --- |
| `UitleenCategory` / `UitleenItem` | Catalogus. `isSet` + `UitleenSetContent` (vrije-tekst inhoud, telt niet apart mee), `photoKey`, locatie (`locationShelf`/`Rack`), `condition` (informatief zolang het item geen exemplaren heeft). Soft-delete via `active`. |
| `UitleenEvent` | Optionele koepel boven materiaal-, flesserke- en vervoeraanvragen van hetzelfde evenement (A8). `onDelete: SetNull`: verwijderen is loskoppelen. `calendarEventId` koppelt aan een kalenderevenement op vtk.be: aangevinkt bij "Logistiek nodig", en naam/locatie/uren volgen dat evenement. |
| `UitleenRequestTemplate` / `...Line` | Vaste set materiaal die het aanvraagformulier invult (M17). Beheerd door Logistiek; aanmaken gebeurt vanaf een bestaande aanvraag. |
| `UitleenItemUnit` | Eén fysiek exemplaar met een eigen staat, optioneel per item. Bestaan er exemplaren, dan is `item.quantity` de telling van de bruikbare (actief en niet KAPOT), bijgehouden door `syncItemQuantityFromUnits`. |
| `UitleenReservation` + `UitleenReservationLine` | Aanvraag met event-context + `requesterType` (+ `groupId`/`requesterName`), dagbereik, snapshots. Statusmachine `REQUESTED -> APPROVED/REJECTED/CANCELLED -> PICKED_UP -> RETURNED`. Per lijn: `note` (M15) en `preparedAt`/`preparedById` (klaarzetten, A7). `pickupPart`/`returnPart` zijn een afspraak tussen mensen: de voorraad rekent op hele dagen. |
| `UitleenVehicle` | Voertuig (kar/auto/bakfiets); `pricingMode` (FREE/PER_HOUR/PER_KM/FLAT) + `rateCents`, team-configureerbaar. `pattern` = de arcering in de transportplanning. |
| `UitleenTransportBooking` | Rit met voertuig, tijdvenster, chauffeur, tarief-snapshot, `kilometers`/`priceCents` (nullable). `cargoNote` = wat er mee moet (ronde 3). |
| `UitleenTransportHelper` | Bijrijder op een rit: naam + optioneel nummer, `addedById`. Vervangt `helpersNote`/`helpersPhone`, die voor bestaande ritten blijven staan. Ook achteraf te wijzigen door de aanvrager, een collega van dezelfde post, of het team. |
| `UitleenDriver` | Chauffeur die het team zelf toevoegt (uniek per `userId`, met notitie en `addedById`). Niet werkingsjaar-gescoped; verwijderen laat toegewezen ritten staan. `colorIndex` overschrijft de kleur die uit zijn id volgt. |
| `UitleenDriverAvailability` | Wanneer een chauffeur kan rijden: vensters, geen rooster. Een hint voor de planning, geen blokkade. |
| `UitleenFeedToken` | Abonneerbare `.ics`-feed op de planning (`TEAM` of `DRIVER`). Enkel de sha256 staat opgeslagen; `revokedAt` in plaats van verwijderen. |
| `UitleenFlesserkeCategory` / `UitleenFlesserkeItem` / `UitleenFlesserkeLine` | Verbruiksstock (vervaldatum, merk, Colruyt-link). Lijnen hangen aan `UitleenReservation`. Beschikbaar wordt berekend, nooit opgeslagen; `returnedQuantity` legt het verbruik vast. |
| `CollectEnGoOrder` / `...Line` / `CollectEnGoProductMatch` | Een uitgelezen Collect&Go-bevestigingsmail, klaar om als ladingen in de flesserke-voorraad te zetten. Lijnen bewaren aantal, prijs, leeggoed en de notitie van de besteller ("Acti - livecantus"); `...ProductMatch` onthoudt naar welk item een Colruyt-product ging. Zie "Collect&Go-import" hieronder. |
| `UitleenPayment` / `UitleenPaymentWebhook` | Spiegel van `TicketPayment`; `provider` vrije string; precies één van `reservationId`/`transportBookingId`. |

## Toegang & zichtbaarheid

- **Leden**: elk ingelogd vtk.be-lid (`requireSession`) voor materiaal en vervoer;
   the request type is automatically derived (`deriveMemberRequester`). De
   **flesserke-tab** is zichtbaar en bruikbaar voor wie tot de interne werking
   behoort: een post, een werkgroep of een jaarwerking
   (`session.groups.length > 0`), server-side afgedwongen. Werkgroepen horen daar
   dus uitdrukkelijk bij; de teksten zeiden ooit "enkel praesidium" en dat is
   hersteld, want werkgroepen concludeerden daaruit dat het niets voor hen was.
   Ziet een werkgroeplid de tab toch niet, dan hangt zijn account dit werkingsjaar
   aan geen enkele groep: dat is ledenbeheer op vtk.be (`/admin/werkgroepen`), niet
   de uitleendienst.
- **Beheer**: `hasPermission(session, "logistiek.manage")` (`requireManage`). Rol
   `logistiek` (seed) hangt aan de post `LOGISTIEK` (DEFAULT).
- **Chauffeurs**: geen permissie, maar data. De keuzelijst (`driverOptions()` in
   `lib/uitleen-server.ts`) is de unie van de leden van de post `LOGISTIEK` in het
   huidige werkingsjaar en de rijen in `UitleenDriver`, die het team beheert in
   `/beheer/chauffeurs`. Een toegevoegde chauffeur krijgt daardoor géén
   `logistiek.manage`: die ziet enkel `/ritten` ("Mijn ritten"), gefilterd op
   `driverId = session.user.id` (`tripsForDriver`). `approveTransportAction` en
   `assignDriverAction` herchecken `isDriver()`, want een toewijzing is meteen
   leestoegang tot die rit.
- **Externen** (wie dit werkingsjaar bij geen enkele groep hoort) kunnen sinds
   ronde 3 kijken maar niets indienen, zolang `externalRequestsOpen` in
   `logistiek.settings` uitstaat. De poort zit in `externalGate` in
   `app/actions/uitleen.ts`, niet enkel in het formulier.
- **Beschikbaarheid en bijrijders horen bij de ledenkant**
   (`app/actions/uitleen.ts`): een chauffeur heeft geen `logistiek.manage`, en
   bijrijders mag ook een collega van dezelfde post wijzigen
   (`vanBookingForMember` bepaalt wie dat is).
- Server actions herchecken altijd; verwachte fouten komen terug (SaveState/
   ActionResult), nooit als throw.

## Betalingen: @vtk/payments

Mollie/mock-gateways gehoist naar `packages/payments`. Logistiek-config in
`lib/payments.ts` (`LOGISTIEK_PAYMENT_PROVIDER`, `LOGISTIEK_PUBLIC_URL`).
Webhook `app/api/uitleen/mollie/webhook`, mock `.../mock/complete`, maintenance
`.../maintenance` (Bearer `LOGISTIEK_MAINTENANCE_SECRET`, `logistiek-worker` in
compose). Returnpagina reconciliëert bij `?betaling=1` (webhook wordt op
localhost weggelaten).

## Mails: @vtk/mail

De SMTP-helper is gehoist van `apps/web/lib/mail.ts` naar `packages/mail`; beide
apps gebruiken hem, inclusief de EHLO- en STARTTLS-lessen die erin zitten.
`apps/web/lib/mail.ts` houdt enkel nog de Theokot-berichten over.

`lib/uitleen-mail.ts` stuurt bij vier momenten: goedgekeurd, afgewezen, gewijzigd
en teruggedraaid (`notifyReservation` / `notifyTransport`). Drie regels, alle drie
met een reden (zie `docs/design-decisions.md`):

1. **Ná de transactie aanroepen**, nooit erin: anders vertrekt er een mail over
   een wijziging die door een rollback niet gebeurd is.
2. **Falen mag de actie niet doen falen**: beide functies vangen zelf en loggen.
3. **De mail draagt de diff** die ook in de historiek staat
   (`describeReservationChanges` in `lib/uitleen.ts`).

`notifyEmail` op `UitleenReservation`/`UitleenTransportBooking` gaat in kopie; het
lid zelf krijgt de mail op zijn voorkeursadres (`emailPreference`).

Sinds ronde 3 gaat er ook een mail de **andere kant** op: `notifyTeamNewRequest`
waarschuwt het team zodra er iets ingediend wordt, met per soort (materiaal,
flesserke, transport) een eigen lijst adressen in `logistiek.settings`. Een lege
lijst betekent geen mail, en `/beheer/instellingen` zegt dat in het rood. Dezelfde
drie regels gelden: ná de write, faalt nooit de actie, en enkel bij het indienen.

Zonder `SMTP_HOST` wordt de mail gelogd in plaats van verstuurd. Draait er lokaal
een mailcatcher zonder STARTTLS (bv. op `127.0.0.1:1025`), dan mislukt de
verzending met `502 Command not implemented`: `requireTLS` staat bewust aan.
Zet `SMTP_HOST` leeg om de mails in de dev-log te lezen.

## Agendafeed: `/api/kalender/<token>`

De transportplanning als `.ics`, met het geheim in de URL omdat een agenda-client
geen cookies meestuurt. `Cache-Control: private, no-store`, `X-Robots-Tag:
noindex`, 404 (niet 403) bij een onbekend of ingetrokken token. Twee scopes:
`TEAM` (de hele planning, vraagt `logistiek.manage`) en `DRIVER` (enkel de eigen
ritten, vraagt dat je chauffeur bent). De URL komt één keer terug, bij het
aanmaken; enkel de sha256 staat in de databank.

`lib/calendar/ics.ts` is een **kopie** van `apps/web/lib/calendar/ics.ts`. Hoisten
naar een gedeeld pakket is netter, maar dat dwingt een volledige
lockfile-regeneratie af (AGENTS.md) en die laat `better-auth` doorfloaten naar een
versie waarop `packages/auth` niet meer typecheckt. Wijzig je hier iets aan de
RFC-kant (vouwen, escapen, `DTSTAMP`), kijk dan of het daar ook moet.

## Foto's: @vtk/storage

`instrumentation.ts` registreert de S3-resolver (leest de `s3.config`-`Setting`
die de web-admin beheert; vereist `BETTER_AUTH_SECRET` om de secret te
ontsleutelen). Upload `app/api/uitleen/upload` (gate `logistiek.manage`,
sharp-jpeg), serveren via eigen `app/api/media/[...key]`. `lib/storage.ts` geeft
de same-origin `publicUrl`.

## File map (apps/logistiek)

- **Leden**: `app/page.tsx` (hub), `app/materiaal/` (catalogus met zoek/filter,
  gedeeld `reservation-form.tsx` incl. flesserke-sectie, `event-fields.tsx`,
  detailpagina `[id]` met set-inhoud + "vaak samen aangevraagd"), `app/vervoer/`
  (voertuigkeuze), `app/reservaties/` (overzicht + detail + edit), `app/ritten/`
  ("Mijn ritten" voor een chauffeur; link in de header en een banner op de hub,
  enkel voor wie chauffeur is of nog een rit heeft staan).
- **Transportplanning** (`/beheer/vervoer/week`, ronde 3): een agenda-app met
  dag-, week- en maandweergave, zoom, volledig scherm, filters, en een paneel
  waarin je een rit opent, aanpast of aanmaakt; dat paneel is op een breed
  scherm een kaartje naast het blok waar je op klikte. De kalendercomponenten staan in
  `components/transport-calendar/` (`time-grid`, `month-grid`, `mobile-calendar`,
  `event-bars`, `trip-block`, `trip-inspector`, `availability-board`, `filters`,
  `transport-calendar`);
  op een telefoon geeft volledig scherm een eigen dagweergave
  (`mobile-calendar`) in plaats van de week in het klein; de
  berekeningen zijn puur en getest (`lib/week-lanes.ts`, `lib/month-lanes.ts`,
  `lib/calendar-range.ts`, `lib/transport-filters.ts`, `lib/driver-colors.ts`).
  Het tijdrooster is gedeeld met het publieke `/vervoer/bezetting`. De zoom is
  een factor op "de hele dag past in beeld" en geen pixelmaat
  (`components/transport-calendar/types.ts`, getest in `test/calendar-zoom.test.ts`);
  waarom, staat in `docs/design-decisions.md`.
  **"Rit afronden" staat hier bewust niet**; dat blijft op `/beheer/vervoer`.
- **Beheer** (`app/beheer/`): `aanvragen/` (tabs, last-minute, decision/edit/
  return-forms, klaarzetlijst per lijn + printblad `[id]/print` en dag-afdruk
  `print?datum=`), `vervoer/` (decision + controls: chauffeur, voertuigwissel, km;
  `driver-select.tsx` groepeert de chauffeurs per bron), `chauffeurs/`
  (chauffeurslijst + user-picker op vtk.be-leden), `materiaal/` (inventaris +
  set-editor + foto-upload), `flesserke/` (stockscherm met inline voorraad +
  vervaldatum-highlight), `collectengo/` (klaarstaande Collect&Go-mails +
  importscherm per bestelling), `kalender/`, `instellingen/` (voertuigtarieven +
  huurprijs-toggle).
- **Actions**: `app/actions/uitleen.ts` (leden), `app/actions/beheer.ts` (team),
  `app/actions/collectengo.ts` (mails ophalen, plakken, importeren).
- **Lib**: `lib/uitleen.ts` (helpers), `lib/uitleen-server.ts` (queries +
  voorraad), `lib/reservation-form.ts` (`buildReservationData`, gedeeld),
  `lib/uitleen-mail.ts` (mails naar de aanvrager), `lib/payments.ts`,
  `lib/runtime-config.ts`, `lib/storage.ts`, `lib/session.ts`,
  `lib/collectengo/` (`parse.ts` + `match.ts` zijn puur en getest; `imap.ts`,
  `store.ts`, `server.ts` en `eml.ts` doen de rest),
  `lib/calendar/` (`ics.ts` is een **kopie** van `apps/web/lib/calendar/ics.ts`;
  `feed-token.ts` en `transport-feed.ts` bouwen de privéfeed).
- **Scripts**: `scripts/import-inventaris.ts` (materiaal + flesserke uit de xlsx),
  `scripts/group-events.ts` (historische aanvragen onder een evenement groeperen;
  dry-run tenzij `--apply`, via `npm run group:events -w @vtk/logistiek`),
  `scripts/collectengo-poll.ts` (de mailbox één keer nakijken:
  `npm run collectengo:poll -w @vtk/logistiek`).

## Env & infra

- `LOGISTIEK_PUBLIC_URL`, `LOGISTIEK_PAYMENT_PROVIDER`, `LOGISTIEK_MAIL_FROM`,
  `LOGISTIEK_MAINTENANCE_SECRET` (`.env.example`); `MOLLIE_API_KEY` gedeeld;
  `BETTER_AUTH_SECRET` nodig voor S3-secret. Logistiek-container krijgt
  `DATABASE_URL` (directe Prisma) + `depends_on: postgres`.
- `infra/docker/logistiek.Dockerfile` draait `prisma generate`; web blijft
  eigenaar van `migrate deploy`.
- `COLLECTENGO_IMAP_HOST/PORT/USER/PASSWORD/MAILBOX/FROM` voor de
  Collect&Go-import; leeg = uit. De `collectengo-worker` in
  `infra/docker-compose.yml` POST elke vijf minuten naar
  `/api/uitleen/collectengo` met `LOGISTIEK_MAINTENANCE_SECRET`.
- Deps `sharp` + `xlsx` toegevoegd: lockfile from scratch regenereren (AGENTS.md).
  Idem voor `imapflow` + `mailparser` (Collect&Go).
- Dev: `npm run dev -w @vtk/logistiek` (poort 3100, webpack; nooit Turbopack).

## Importscript

`npm run import:inventaris -w @vtk/logistiek -- "<pad>/Inventaris Loods.xlsx"`
(optioneel `--materiaal-only` / `--flesserke-only`). Idempotent (upsert op
naam+categorie), deletet nooit, telt created/updated/skipped. Niet-numerieke
hoeveelheden -> aantal 1 + tekst in de beschrijving. Gereserveerd/Beschikbaar uit
de sheet worden genegeerd (live berekend).

## Collect&Go-import

Boodschappen voor de kring worden bij Colruyt Collect&Go besteld. De
bevestigingsmail bevat alle producten, aantallen en prijzen en een
reservatienummer; die overtypen in `/beheer/flesserke` was een half uur per
bestelling en leverde dubbele items op.

1. **Binnenkomen**: `collectengo-worker` POST naar
   `app/api/uitleen/collectengo/route.ts` (zelfde bearer-secret als de
   maintenance-route). Die roept `pollCollectEnGoMailbox()` aan: ongelezen mails
   **van de Collect&Go-afzender** worden geparsed, bewaard en als gelezen
   gemarkeerd; andere post in dezelfde mailbox blijft ongemoeid. Staat de
   IMAP-config niet in de omgeving, dan is alles uit en toont het beheer enkel
   het plakveld. Vangnet: mail plakken of een `.eml` uploaden op
   `/beheer/collectengo`.
2. **Parsen** (`lib/collectengo/parse.ts`, puur, getest op de echte mail in
   `test/fixtures/collectengo-mail.txt`). Let op de vier vormen die je niet mag
   missen: een hoeveelheidsregel kan `12 stuk(s)€ 2,69/Kg` of `1,0 Kg€ 1,49/Kg`
   zijn (die tweede heeft geen stuksaantal, `unit: WEIGHT`); een
   `leeggoed`-regel hoort bij het product **erboven**; de prijs per lijn is die
   ná promo terwijl het subtotaal ze nog niet aftrekt; en na tag-strippen kan de
   eenheidsprijs op een eigen regel staan.
3. **Voorstellen** (`lib/collectengo/match.ts`). "BONI Choco Bubbles 750g" wordt
   gesplitst in merk, naam en inhoud en vergeleken met de catalogus; een eerdere
   keuze (`CollectEnGoProductMatch`) wint altijd. Dezelfde naam met een andere
   inhoud is een voorstel, geen match: 2 L hoort niet bij het item van 1,5 L.
4. **Importeren**: `/beheer/collectengo/[id]` toont de lijnen per categorie met
   bestemming, aantal en vervaldatum (de mail bevat geen houdbaarheidsdatums).
   `importCollectEnGoOrderAction` maakt in één transactie per lijn een
   `UitleenFlesserkeBatch` (met `syncFlesserkeItemTotals`), onthoudt de keuze en
   zet de bestelling op `IMPORTED`. Een tweede poging geeft `ALREADY_IMPORTED`.

## Lokaal testen

1. `npm run seed -w @vtk/db`. Login: team `logistiek@vtk.prototype` / `prototype`
   (LEAD van LOGISTIEK, krijgt `logistiek.manage`).
2. Web op 3000 + logistiek op 3100 (zelfde dev-Postgres); inloggen op de
   hoofdsite, het cookie geldt ook voor de logistiek-poort. Bij bezette poorten:
   `VTK_MAIN_URL`/`LOGISTIEK_PUBLIC_URL` inline op de gekozen poorten.
3. Betalingen: mock-provider (standaard in dev). Echte Mollie-test: zie
   `docs/ticketing.md` (tunnel), met `LOGISTIEK_PAYMENT_PROVIDER=mollie`.
4. Collect&Go zonder mailbox: plak de mail uit
   `apps/logistiek/test/fixtures/collectengo-mail.txt` op `/beheer/collectengo`.
   Met een echte mailbox: `npm run collectengo:poll -w @vtk/logistiek`.
