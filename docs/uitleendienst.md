# Uitleendienst (logistiek.vtk.be) — architectuur & file map

De uitleendienst van VTK Logistiek: leden reserveren materiaal (tools, audio,
frigoboxen, ...) en de camionette via `apps/logistiek`, het team keurt goed en
verwerkt afhaling/terugbrengen/betaling. Dit vervangt het e-mailproces van de
oude site. Productkeuzes staan in `docs/design-decisions.md` (sectie
"Uitleendienst"); dit document is de technische kaart.

## End-to-end flow

1. **Aanvragen** — een ingelogd vtk.be-lid (sessie gedeeld via het
   `.vtk.be`-cookie, remote geverifieerd via `@vtk/auth/remote`) kiest in de
   catalogus (`/materiaal`) een periode en items, of vraagt op `/camionette`
   een rit aan (tijdvenster, doel, adressen). Status: `REQUESTED`; prijzen en
   waarborgen worden per lijn gesnapshot.
2. **Beslissen** — het team (permissie `logistiek.manage`) keurt goed of wijst
   af in `/beheer/aanvragen` en `/beheer/camionette`. Bij goedkeuring kiest het
   team de betaalwijze (`ONLINE` of `OFFLINE`) en gebeurt de **harde
   beschikbaarheidscheck** in een Serializable-transactie: voorraad min
   overlappende `APPROVED`/`PICKED_UP`-reservaties; de camionette weigert
   overlappende goedgekeurde ritten. `REQUESTED` neemt dus nog geen voorraad in.
3. **Betalen** — bij `ONLINE` toont de detailpagina een betaalknop
   (`startPaymentAction` → hosted checkout van de provider). Enkel de huurprijs
   gaat online; de waarborg blijft cash bij afhaling. Bij `OFFLINE` (of voor de
   waarborg) markeert het team "betaald" aan de balie.
4. **Afhalen/terugbrengen** — het team markeert `PICKED_UP`, later `RETURNED`,
   en daarna "waarborg terug". Ritten worden `COMPLETED`.

## Datamodel (packages/db/prisma/schema.prisma)

| Model | Wat |
| --- | --- |
| `UitleenCategory` / `UitleenItem` | Catalogus. Items soft-deleten via `active=false`; `photoKey` bestaat al maar upload-UI komt later. |
| `UitleenReservation` + `UitleenReservationLine` | Aanvraag met dagbereik (`@db.Date`), snapshots van naam/prijs/waarborg per lijn, statusmachine `REQUESTED → APPROVED/REJECTED/CANCELLED → PICKED_UP → RETURNED`. |
| `UitleenVanBooking` | Camionette: tijdvenster, doel, chauffeur (`driverId`), uurtarief-snapshot en prijs (herberekend bij goedkeuring). |
| `UitleenPayment` / `UitleenPaymentWebhook` | Spiegel van `TicketPayment`/`TicketPaymentWebhook` zonder refunds; `provider` is een vrije string. Precies één van `reservationId`/`vanBookingId` is gezet. |

## Toegang

- **Leden**: elke ingelogde vtk.be-gebruiker (`requireSession`,
  `apps/logistiek/lib/session.ts`). Geen groepsvereiste meer; de vroegere check
  op groep "Logistiek" (met verkeerde casing) is verwijderd.
- **Beheer**: `hasPermission(session, "logistiek.manage")` (`requireManage`).
  De seed maakt een rol `logistiek` met `logistiek.manage` +
  `modules.logistiek.access` en hangt die aan de post `LOGISTIEK` (DEFAULT).
- Server actions herchecken altijd zelf; verwachte invoerfouten komen terug als
  `ActionResult`/`SaveState`, nooit als throw.

## Betalingen: @vtk/payments

De Mollie/mock-gateways zijn uit `apps/web/lib/ticketing/payments/` gehoist naar
**`packages/payments`** (`@vtk/payments`) en app-agnostisch gemaakt via
constructor-config (`webhookUrl`, `idempotencyNamespace`, optioneel `apiKey`;
mock: `completePath`). `apps/web/lib/ticketing/payments/index.ts` en `.../mollie.ts`
zijn dunne wrappers zodat alle ticketing-callsites ongewijzigd bleven.

Logistiek-kant (`apps/logistiek/lib/payments.ts`):

- Provider uit `LOGISTIEK_PAYMENT_PROVIDER` (`mock` standaard buiten productie,
  `mollie` verplicht in productie); base-URL uit `LOGISTIEK_PUBLIC_URL`.
- Idempotency-namespace `vtk-uitleen`; checkout-keys `res:<id>:<attempt>` /
  `van:<id>:<attempt>`. Een lopende, niet-verlopen checkout wordt hergebruikt.
- **Webhook** `app/api/uitleen/mollie/webhook/route.ts`: Mollie post enkel
  `id=tr_...`; we her-fetchen de betaling en passen de authoritative status toe.
  Dedup op `id:status` (geen refunds hier). Webhook-URL wordt op localhost
  weggelaten (Mollie weigert die), dus:
- **Returnpagina-reconciliatie**: de detailpagina's pollen de provider wanneer
  `?betaling=1` met een `PENDING`-betaling, en
- **Maintenance** `app/api/uitleen/maintenance/route.ts` (Bearer
  `LOGISTIEK_MAINTENANCE_SECRET`) reconciliëert als vangnet en laat oude
  checkouts vervallen; de `logistiek-worker` in `infra/docker-compose.yml`
  curl't die elke minuut.
- **Mock**: `app/api/uitleen/mock/complete/route.ts` (dev-only, instant "paid").

## File map (apps/logistiek)

- **Leden**: `app/page.tsx` (hub met CTA-kaarten, cudi-stijl), `app/materiaal/`
  (catalogus + aanvraag), `app/camionette/` (info + aanvraag),
  `app/reservaties/` (overzicht + detail incl. betalen/annuleren),
  `app/camionette/[id]/` (ritdetail).
- **Beheer** (`app/beheer/`): `layout.tsx` (guard + subnav), `page.tsx`
  (dashboard), `aanvragen/` (wachtrij + beslispagina), `camionette/` (wachtrij,
  chauffeur, betaald/afgerond), `materiaal/` (inventaris-CRUD),
  `kalender/` (daglijst 30 dagen).
- **Actions**: `app/actions/uitleen.ts` (leden, `ActionResult`),
  `app/actions/beheer.ts` (team, `SaveState` voor formulieren).
- **Lib**: `lib/uitleen.ts` (pure helpers: euro, datums, van-prijs, labels),
  `lib/uitleen-server.ts` (queries + `reservedQuantities`), `lib/payments.ts`,
  `lib/session.ts`, `lib/saveState.ts` (kopie van web).
- **UI**: `components/ui/{save-form,toast,confirm-action-button}.tsx` zijn
  minimale kopieën van `apps/web/components/ui`; kandidaat om te hoisten naar
  `@vtk/ui`. Verder `components/{site-header,site-footer,login-gate,page-shell,
  status-badge,cancel-button,pay-button}.tsx`.
- **Styling**: Tailwind v4 met `vtk-*` tokens in `app/globals.css`, hertuned
  naar het koele palet van `apps/web/app/design/vtk-base.css`. Geen aparte
  design-CSS-bestanden.

## Env & infra

- `LOGISTIEK_PUBLIC_URL`, `LOGISTIEK_PAYMENT_PROVIDER`,
  `LOGISTIEK_MAINTENANCE_SECRET` (zie `.env.example`); `MOLLIE_API_KEY` wordt
  gedeeld met ticketing. `DATABASE_URL` is nu ook voor de logistiek-container
  nodig (directe Prisma-toegang; `depends_on: postgres`).
- `infra/docker/logistiek.Dockerfile` draait `prisma generate`;
  **migraties blijven bij de web-container** (`migrate deploy` in web's CMD).
- Dev: `npm run dev -w @vtk/logistiek` (poort 3100, webpack; nooit Turbopack).

## Lokaal testen

1. `npm run seed -w @vtk/db` (idempotent). Logins: team
   `logistiek@vtk.prototype` / `prototype` (LEAD van post LOGISTIEK, krijgt
   `logistiek.manage` via de geseedde rol); een gewoon lid is elk account
   zonder rollen.
2. Web op 3000 en logistiek op 3100 starten (zelfde dev-Postgres); inloggen
   gebeurt op de hoofdsite, het cookie geldt ook voor de logistiek-poort
   (zelfde host). Met bezette poorten: zet `VTK_MAIN_URL`/`BETTER_AUTH_URL`/
   `LOGISTIEK_PUBLIC_URL` inline op de gekozen poorten.
3. Betalingen testen met de mock-provider (standaard in dev): "Betaal online"
   leidt naar `mock/complete`, dat de betaling meteen op `SUCCEEDED` zet en
   terugkeert naar de detailpagina. Voor echte Mollie-testcheckouts: zelfde
   tunnelaanpak als ticketing (zie `docs/ticketing.md`), met
   `LOGISTIEK_PAYMENT_PROVIDER=mollie` en een publieke `LOGISTIEK_PUBLIC_URL`.
