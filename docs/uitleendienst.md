# Uitleendienst (logistiek.vtk.be) — architectuur & file map

De uitleendienst van VTK Logistiek in `apps/logistiek`: leden vragen per
**evenement** materiaal, vervoer (kar/auto/bakfiets) en flesserke aan; het team
keurt goed en verwerkt afhaling/terugbrengen/betaling. Dit vervangt het
e-mailproces (zie "How to logi"). Productkeuzes: `docs/design-decisions.md`
(§ Uitleendienst). Dit is de technische kaart.

## End-to-end flow

1. **Aanvragen** — een ingelogd vtk.be-lid (sessie gedeeld via het
   `.vtk.be`-cookie, remote geverifieerd via `@vtk/auth/remote`) vraagt aan per
   evenement: naam, locatie, startuur, verwachte opkomst, contact, levering. Het
   **aanvragertype wordt automatisch uit de login afgeleid** (praesidiumlid in een
   post → INTERN namens die post; anders EXTERN met de eigen naam), server-side
   afgedwongen. Materiaal, vervoer (voertuigkeuze) en flesserke (aparte tab, enkel
   praesidium) zijn elk een eigen aanvraag/flow. Status `REQUESTED`;
   prijzen/waarborgen gesnapshot. Een lid mag zijn aanvraag bewerken zolang ze
   `REQUESTED` is.
2. **Beslissen** — het team (`logistiek.manage`) keurt goed of wijst af in
   `/beheer/aanvragen` (tabs per aanvragertype, last-minute badge) en
   `/beheer/vervoer`. Bij goedkeuring kiest het team `ONLINE`/`OFFLINE`. De
   **harde voorraadcheck** loopt in een Serializable-transactie: materiaal =
   quantity min overlappende `APPROVED`/`PICKED_UP` in de periode; flesserke =
   quantity min status-gebaseerd gereserveerd; vervoer = geen twee `APPROVED`
   ritten van hetzelfde voertuig op hetzelfde moment. Het team mag een `APPROVED`
   aanvraag bewerken; de save hercheckt dan de voorraad in dezelfde tx.
3. **Vervoer** — tarief per voertuig (team-configureerbaar: gratis/per uur/per
   km/vast). Chauffeur is optioneel bij goedkeuring en wordt later toegewezen; de
   keuzelijst is de post Logistiek plus de zelf toegevoegde chauffeurs (zie
   "Chauffeurs" hieronder).
   Prijs is `null` tot ze gekend is (per km: bij afronden voert het team de
   kilometers in). Het team kan het voertuig wisselen (re-snapshot + herberekening).
4. **Betalen** — enkel de huurprijs gaat online (Mollie/mock); de waarborg blijft
   cash bij afhaling. `OFFLINE` markeert het team aan de balie.
5. **Afhalen/terugbrengen** — `PICKED_UP` → `RETURNED`. Bij flesserke voert het
   team per lijn het teruggekeerde (gesloten) aantal in; het verbruik
   (`quantity − returned`) wordt in dezelfde tx van de flesserke-voorraad
   afgeboekt. Daarna "waarborg terug".

## Datamodel (packages/db/prisma/schema.prisma)

| Model | Wat |
| --- | --- |
| `UitleenCategory` / `UitleenItem` | Catalogus. `isSet` + `UitleenSetContent` (vrije-tekst inhoud, telt niet apart mee), `photoKey`, locatie (`locationShelf`/`Rack`), `condition` (informatief zolang het item geen exemplaren heeft). Soft-delete via `active`. |
| `UitleenItemUnit` | Eén fysiek exemplaar met een eigen staat, optioneel per item. Bestaan er exemplaren, dan is `item.quantity` de telling van de bruikbare (actief en niet KAPOT), bijgehouden door `syncItemQuantityFromUnits`. |
| `UitleenReservation` + `UitleenReservationLine` | Aanvraag met event-context + `requesterType` (+ `groupId`/`requesterName`), dagbereik, snapshots. Statusmachine `REQUESTED → APPROVED/REJECTED/CANCELLED → PICKED_UP → RETURNED`. Per lijn: `note` (M15) en `preparedAt`/`preparedById` (klaarzetten, A7). `pickupPart`/`returnPart` zijn een afspraak tussen mensen: de voorraad rekent op hele dagen. |
| `UitleenVehicle` | Voertuig (kar/auto/bakfiets); `pricingMode` (FREE/PER_HOUR/PER_KM/FLAT) + `rateCents`, team-configureerbaar. |
| `UitleenTransportBooking` | Rit met voertuig, tijdvenster, chauffeur, tarief-snapshot, `kilometers`/`priceCents` (nullable). |
| `UitleenDriver` | Chauffeur die het team zelf toevoegt (uniek per `userId`, met notitie en `addedById`). Niet werkingsjaar-gescoped; verwijderen laat toegewezen ritten staan. |
| `UitleenFlesserkeCategory` / `UitleenFlesserkeItem` / `UitleenFlesserkeLine` | Verbruiksstock (vervaldatum, merk, Colruyt-link). Lijnen hangen aan `UitleenReservation`. Beschikbaar wordt berekend, nooit opgeslagen; `returnedQuantity` legt het verbruik vast. |
| `UitleenPayment` / `UitleenPaymentWebhook` | Spiegel van `TicketPayment`; `provider` vrije string; precies één van `reservationId`/`transportBookingId`. |

## Toegang & zichtbaarheid

- **Leden**: elk ingelogd vtk.be-lid (`requireSession`) voor materiaal en vervoer;
  het aanvragertype wordt automatisch afgeleid (`deriveMemberRequester`). De
  **flesserke-tab** is zichtbaar en bruikbaar voor wie tot de interne werking
  behoort: een post, een werkgroep of een jaarwerking
  (`session.groups.length > 0`), server-side afgedwongen. Werkgroepen horen daar
  dus uitdrukkelijk bij; de teksten zeiden ooit "enkel praesidium" en dat is
  hersteld, want werkgroepen concludeerden daaruit dat het niets voor hen was.
  Ziet een werkgrooplid de tab toch niet, dan hangt zijn account dit werkingsjaar
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

Zonder `SMTP_HOST` wordt de mail gelogd in plaats van verstuurd. Draait er lokaal
een mailcatcher zonder STARTTLS (bv. op `127.0.0.1:1025`), dan mislukt de
verzending met `502 Command not implemented`: `requireTLS` staat bewust aan.
Zet `SMTP_HOST` leeg om de mails in de dev-log te lezen.

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
- **Beheer** (`app/beheer/`): `aanvragen/` (tabs, last-minute, decision/edit/
  return-forms, klaarzetlijst per lijn + printblad `[id]/print` en dag-afdruk
  `print?datum=`), `vervoer/` (decision + controls: chauffeur, voertuigwissel, km;
  `driver-select.tsx` groepeert de chauffeurs per bron), `chauffeurs/`
  (chauffeurslijst + user-picker op vtk.be-leden), `materiaal/` (inventaris +
  set-editor + foto-upload), `flesserke/` (stockscherm met inline voorraad +
  vervaldatum-highlight), `kalender/`, `instellingen/` (voertuigtarieven +
  huurprijs-toggle).
- **Actions**: `app/actions/uitleen.ts` (leden), `app/actions/beheer.ts` (team).
- **Lib**: `lib/uitleen.ts` (helpers), `lib/uitleen-server.ts` (queries +
  voorraad), `lib/reservation-form.ts` (`buildReservationData`, gedeeld),
  `lib/uitleen-mail.ts` (mails naar de aanvrager), `lib/payments.ts`,
  `lib/runtime-config.ts`, `lib/storage.ts`, `lib/session.ts`.
- **Scripts**: `scripts/import-inventaris.ts` (materiaal + flesserke uit de xlsx).

## Env & infra

- `LOGISTIEK_PUBLIC_URL`, `LOGISTIEK_PAYMENT_PROVIDER`, `LOGISTIEK_MAIL_FROM`,
  `LOGISTIEK_MAINTENANCE_SECRET` (`.env.example`); `MOLLIE_API_KEY` gedeeld;
  `BETTER_AUTH_SECRET` nodig voor S3-secret. Logistiek-container krijgt
  `DATABASE_URL` (directe Prisma) + `depends_on: postgres`.
- `infra/docker/logistiek.Dockerfile` draait `prisma generate`; web blijft
  eigenaar van `migrate deploy`.
- Deps `sharp` + `xlsx` toegevoegd: lockfile from scratch regenereren (AGENTS.md).
- Dev: `npm run dev -w @vtk/logistiek` (poort 3100, webpack; nooit Turbopack).

## Importscript

`npm run import:inventaris -w @vtk/logistiek -- "<pad>/Inventaris Loods.xlsx"`
(optioneel `--materiaal-only` / `--flesserke-only`). Idempotent (upsert op
naam+categorie), deletet nooit, telt created/updated/skipped. Niet-numerieke
hoeveelheden → aantal 1 + tekst in de beschrijving. Gereserveerd/Beschikbaar uit
de sheet worden genegeerd (live berekend).

## Lokaal testen

1. `npm run seed -w @vtk/db`. Login: team `logistiek@vtk.prototype` / `prototype`
   (LEAD van LOGISTIEK, krijgt `logistiek.manage`).
2. Web op 3000 + logistiek op 3100 (zelfde dev-Postgres); inloggen op de
   hoofdsite, het cookie geldt ook voor de logistiek-poort. Bij bezette poorten:
   `VTK_MAIN_URL`/`LOGISTIEK_PUBLIC_URL` inline op de gekozen poorten.
3. Betalingen: mock-provider (standaard in dev). Echte Mollie-test: zie
   `docs/ticketing.md` (tunnel), met `LOGISTIEK_PAYMENT_PROVIDER=mollie`.
- Server actions zonder browser aansturen: zie de memory
  `uitleendienst-module` voor de RSC-action-truc.
