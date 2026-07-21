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
   km/vast). Chauffeur is optioneel bij goedkeuring en wordt later toegewezen.
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
| `UitleenCategory` / `UitleenItem` | Catalogus. `isSet` + `UitleenSetContent` (vrije-tekst inhoud, telt niet apart mee), `photoKey`, locatie (`locationShelf`/`Rack`), `condition` (informatief). Soft-delete via `active`. |
| `UitleenReservation` + `UitleenReservationLine` | Aanvraag met event-context + `requesterType` (+ `groupId`/`requesterName`), dagbereik, snapshots. Statusmachine `REQUESTED → APPROVED/REJECTED/CANCELLED → PICKED_UP → RETURNED`. |
| `UitleenVehicle` | Voertuig (kar/auto/bakfiets); `pricingMode` (FREE/PER_HOUR/PER_KM/FLAT) + `rateCents`, team-configureerbaar. |
| `UitleenTransportBooking` | Rit met voertuig, tijdvenster, chauffeur, tarief-snapshot, `kilometers`/`priceCents` (nullable). |
| `UitleenFlesserkeCategory` / `UitleenFlesserkeItem` / `UitleenFlesserkeLine` | Verbruiksstock (vervaldatum, merk, Colruyt-link). Lijnen hangen aan `UitleenReservation`. Beschikbaar wordt berekend, nooit opgeslagen; `returnedQuantity` legt het verbruik vast. |
| `UitleenPayment` / `UitleenPaymentWebhook` | Spiegel van `TicketPayment`; `provider` vrije string; precies één van `reservationId`/`transportBookingId`. |

## Toegang & zichtbaarheid

- **Leden**: elk ingelogd vtk.be-lid (`requireSession`) voor materiaal en vervoer;
  het aanvragertype wordt automatisch afgeleid (`deriveMemberRequester`). De
  **flesserke-tab** is enkel zichtbaar en bruikbaar voor het praesidium (leden met
  een post, `session.groups.length > 0`), server-side afgedwongen.
- **Beheer**: `hasPermission(session, "logistiek.manage")` (`requireManage`). Rol
  `logistiek` (seed) hangt aan de post `LOGISTIEK` (DEFAULT).
- Server actions herchecken altijd; verwachte fouten komen terug (SaveState/
  ActionResult), nooit als throw.

## Betalingen: @vtk/payments

Mollie/mock-gateways gehoist naar `packages/payments`. Logistiek-config in
`lib/payments.ts` (`LOGISTIEK_PAYMENT_PROVIDER`, `LOGISTIEK_PUBLIC_URL`).
Webhook `app/api/uitleen/mollie/webhook`, mock `.../mock/complete`, maintenance
`.../maintenance` (Bearer `LOGISTIEK_MAINTENANCE_SECRET`, `logistiek-worker` in
compose). Returnpagina reconciliëert bij `?betaling=1` (webhook wordt op
localhost weggelaten).

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
  (voertuigkeuze), `app/reservaties/` (overzicht + detail + edit).
- **Beheer** (`app/beheer/`): `aanvragen/` (tabs, last-minute, decision/edit/
  return-forms), `vervoer/` (decision + controls: chauffeur, voertuigwissel, km),
  `materiaal/` (inventaris + set-editor + foto-upload), `flesserke/` (stockscherm
  met inline voorraad + vervaldatum-highlight), `kalender/`, `instellingen/`
  (voertuigtarieven + huurprijs-toggle).
- **Actions**: `app/actions/uitleen.ts` (leden), `app/actions/beheer.ts` (team).
- **Lib**: `lib/uitleen.ts` (helpers), `lib/uitleen-server.ts` (queries +
  voorraad), `lib/reservation-form.ts` (`buildReservationData`, gedeeld),
  `lib/payments.ts`, `lib/runtime-config.ts`, `lib/storage.ts`, `lib/session.ts`.
- **Scripts**: `scripts/import-inventaris.ts` (materiaal + flesserke uit de xlsx).

## Env & infra

- `LOGISTIEK_PUBLIC_URL`, `LOGISTIEK_PAYMENT_PROVIDER`,
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
