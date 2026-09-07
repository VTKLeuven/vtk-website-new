# Integrated ticketing: architecture & file map

Event-scoped ticket sales for the main web app (`apps/web`): create a ticketed
event, sell tickets to the public, take payment via **Mollie** or **directly via
Bancontact**, issue signed
PDF/QR tickets, refund, and scan at the entrance. This doc is the "where is
everything" map; the README's *Integrated ticketing* section covers operational
setup (env, webhook, SMTP).

## End-to-end flow

1. **Create/publish**: a group LEAD with `tickets.create` (or a superadmin)
   creates an event at `/admin/tickets/new`, adds ≥1 active ticket type with a
   price, then flips status to `PUBLISHED`. Creation auto-grants the creator an
   `OWNER` grant + the owner group's leads a `MANAGER` grant, and seeds a default
   inventory pool (`GENERAL`) and gate (`MAIN`).
2. **Buy**: a buyer picks tickets at `/tickets/<slug>` -> `POST /api/tickets/checkout`
   reserves inventory and creates a `TicketOrder` (`PENDING_PAYMENT`).
   Zero-cost tickets skip the gateway (provider `free`) but require a logged-in
   account.
   - With **one** enabled payment method, checkout also creates the
     `TicketPayment`, asks the gateway for a checkout URL and redirects there
     (unchanged behaviour).
   - With **more than one**, checkout redirects to the order page instead, which
     renders the method chooser; picking one calls
     `POST /api/tickets/orders/<orderId>/pay` -> `startOrderPayment`.
3. **Pay**: Mollie hosted checkout, or our own Bancontact page. On completion the
   provider calls its webhook, which re-fetches the payment and calls
   `fulfillPaidOrder` -> tickets issued, confirmation mail enqueued in the same
   transaction.
4. **Mail**: the confirmation carries the tickets themselves: one PDF with every
   valid ticket of the order, one Apple Wallet pass per ticket, and a Google
   Wallet save button per ticket (Google passes can only be links). The link to
   the ticket page stays the primary route; the attachments are the fallback at
   the door. See `docs/design-decisions.md` for the limits and the failure mode.
5. **Ticket**: buyer finds paid orders in the "Mijn VTK" section at
   `/account#mijn-vtk-tickets` and opens an order at
   `/tickets/bestelling/<orderId>`; each ticket renders a QR from a signed,
   PII-free credential.
6. **Scan**: an operator with `SCAN` capability opens `/scan/<eventId>` on a
   phone, scans the QR, and the server validates + marks it used (with duplicate
   detection and reversal).

## Payment provider abstraction

All providers implement one interface; the rest of the system is
provider-agnostic and keys off the `provider` string stored on each row
(`TicketPayment.provider`, `TicketRefund.provider`, `TicketPaymentWebhook.provider`,
which is a plain `String`, so adding/switching a provider needs **no DB migration**).

| Concern | Location |
| --- | --- |
| Gateway interface (`PaymentGateway`) + DTOs | `packages/payments/src/types.ts` |
| Provider factory (`paymentGateway`, `paymentGatewayFor`) | `apps/web/lib/ticketing/payments/index.ts` |
| **Mollie** gateway (raw REST via `fetch`, no SDK) | `packages/payments/src/mollie.ts` |
| **Bancontact** gateway (Bancontact Pro) | `packages/payments/src/bancontact.ts` |
| Mock gateway (local dev only, instant "paid") | `packages/payments/src/mock.ts` |
| Which providers are enabled, and in what order | `enabledPaymentMethods()` in `apps/web/lib/ticketing/config.ts` |
| Which method leads per locale | `apps/web/lib/ticketing/paymentMethods.ts` |
| Starting a payment on an existing order | `startOrderPayment()` in `apps/web/lib/ticketing/orders.ts` |

`configuredPaymentProvider()` returns `mollie`/`bancontact` when
`TICKETING_PAYMENT_PROVIDER` names it, `mock` when unset/`mock` outside
production, and throws in production otherwise. `enabledPaymentMethods()` reads
the comma-separated `TICKETING_PAYMENT_METHODS` and falls back to that single
provider, so leaving it empty keeps the old single-provider behaviour exactly.

### Only one live checkout per order

`startOrderPayment` closes every still-open checkout of the order before it
creates a new one, asking the provider rather than trusting our own row. If that
close reveals the order was just paid, it fulfils and refuses to start a second
payment; if the provider still reports `PENDING` after a cancel attempt, it gives
up rather than guessing. Without this, a buyer who opens Bancontact, returns, and
then picks Mollie can pay twice.

Each attempt gets its own number (`TicketPayment` count + 1), which feeds both the
idempotency key (`<orderId>:<attempt>`) and the gateway's `attempt`. A fixed key
would collide on `@@unique([provider, idempotencyKey])` and make the provider
silently hand back the first checkout.

### Mollie specifics

- **Payments API** (single amount for the order total, EUR). Mollie amounts are
  decimal strings (`"10.00"`); `mollie.ts` converts to/from integer cents.
- A Mollie payment id (`tr_...`) is **both** the checkout handle and the payment
  reference, so `providerCheckoutId` and `providerPaymentId` hold the same value.
- **Webhook** `apps/web/app/api/tickets/mollie/webhook/route.ts`: Mollie posts
  only `id=tr_...` (form-encoded), no signature. The route **re-fetches** the
  payment from Mollie (`?embed=refunds`) and applies the authoritative state.
  Dedup key = `id:status:amountRefunded` (Mollie has no event id), so genuine
  transitions (paid, then a refund) each get their own webhook row.
- Webhook URL is derived from `TICKETING_PUBLIC_URL` and auto-omitted for
  localhost (Mollie rejects non-public URLs); reconciliation is the fallback.
- Refunds are nested under a payment, so `getRefundStatus` takes
  `{ refundId, paymentId }` (not just a refund id like a top-level refund).
- Definitive (non-retryable) errors = any Mollie 4xx except 429.

### Bancontact specifics

This is **Bancontact Pro**, a direct merchant contract, not Bancontact through a
PSP. Bancontact Company is a scheme rather than an acquirer, so the card flow
still needs a PSP; what this gateway offers is the app payment.

**Names changed in 2026 and the old ones are still everywhere.** What used to be
"Payconiq by Bancontact" is now **Bancontact Pay** (the buyer's app) and
**Bancontact Pro** (the merchant solution we integrate with); the company is
**Bancontact Company** as of spring 2026, and the Payconiq brand disappears
during 2026. The API still runs on the payconiq host, so do not read the
endpoint as the current brand name.

- **No hosted checkout page.** The provider returns a deeplink plus a QR, so we
  host the page: `CheckoutResult.url` points at
  `/tickets/bestelling/<orderId>/bancontact` and the deeplink is stored in
  `TicketPayment.providerDeeplink`. The QR is drawn from that deeplink by
  `/api/tickets/orders/<orderId>/bancontact/qr`, using the same generator as the
  ticket QR, so the page does not depend on an external image host.
- Amounts are **integer cents**, unlike Mollie's decimal strings. `description`
  and `reference` are capped at 35 characters and truncated locally.
- **Webhook** `apps/web/app/api/tickets/bancontact/webhook/route.ts`: same
  posture as Mollie, the callback body is never trusted and the payment is
  re-fetched. Two differences: the provider does **not** carry our order id (only
  a reference), so the order is resolved through our own `TicketPayment` row by
  `providerCheckoutId`, and amount plus currency are checked against that row
  before anything is issued. A failure only expires the order when no other
  payment attempt is still open.
- **Refunds are off by default.** `BANCONTACT_REFUNDS_ENABLED=true` enables the
  API path; otherwise `refund()` throws `BancontactRefundUnsupportedError` without
  sending a request, and the refund is handled manually by bank transfer.
- **Verify against your own contract before going live**: endpoint version, field
  names and status values depend on the product in the merchant contract.
  Everything provider-specific sits in `packages/payments/src/bancontact.ts`.

## File map

### Routes: public (`apps/web/app/[locale]/...`)
- `tickets/page.tsx`: public shop list (`/tickets`)
- `tickets/[slug]/page.tsx`: event + purchase page
- `account/page.tsx`: personal ticket overview in the "Mijn VTK" section
- `tickets/bestelling/[orderId]`: order + QR

### Routes: admin (`apps/web/app/[locale]/admin/tickets/...`)
- `page.tsx`: event list / management
- `new/page.tsx`: create event
- `[eventId]/{instellingen,toegang,deelnemers,bestellingen}`: settings (ticket
  types), access/grants, attendees, orders

### Routes: scanner
- `apps/web/app/(scanner)/scan/[eventId]/page.tsx`: camera scanner (no locale
  prefix). Requires session + `SCAN` capability. Needs HTTPS or localhost for
  camera access.

### Offline scannen

Een deur zonder bereik (kelder, tent, hal) is de regel, niet de uitzondering.
Voorheen weigerde de scanner elke scan zolang `navigator.onLine` false was; nu
werkt hij door.

**Hoe het werkt.** Bij het laden haalt het toestel een *manifest* op: de lijst
geldige tickets van dit event (`code`, `version`, `checkedIn`, naam, type). Valt
het netwerk weg, dan beslist het toestel daarmee zelf en gaat de scan in een
wachtrij in localStorage. Zodra er weer verbinding is, wordt die wachtrij in
blokken van honderd naar `scan/batch` gestuurd.

**Waarom geen handtekeningcontrole op het toestel.** De QR is een HMAC-token
(`createTicketCredential`). Dat op het toestel verifiëren vraagt
`TICKETING_TOKEN_SECRET`, en wie die telefoon uitleest kan dan zelf tickets
maken. Offline controleren we dus op lidmaatschap van het manifest plus het
versienummer. Gevolg: wie een geldige code van iemand anders kent, geraakt
offline binnen. Dat conflict komt bij het synchroniseren alsnog boven, want de
server doet de volledige controle en meldt de tweede scan als `ALREADY_USED`; de
scanner toont die gevallen in een balk die blijft staan tot iemand ze wegklikt.

**Waarom opnieuw versturen veilig is.** Elke scan draagt een `clientScanId` en
`TicketScanLog.clientScanId` is uniek: een synchronisatie die halverwege afbreekt
kan gewoon opnieuw. Ook een offline *geweigerde* scan gaat mee, zodat het
scanlogboek compleet blijft.

**Grenzen.** Boven de 5000 geldige tickets (`MANIFEST_LIMIT` in `scanner.ts`)
krijgt het toestel geen manifest en scant het enkel online; met een halve lijst
zou het geldige tickets weigeren. Dubbels *aan dezelfde deur* worden offline
herkend, dubbels *tussen deuren* pas bij het synchroniseren: daarvoor is
communicatie tussen de toestellen nodig. Wil je dat live, zet dan een lokale
router of hotspot aan de ingang; LoRa-mesh (Meshtastic) haalt de EU-duty-cycle
niet bij de toeloop van een galabal, en Web Bluetooth bestaat niet op iOS.

### Kleur per tickettype

Een tickettype draagt een `color`: een key uit het palet in
`apps/web/lib/ticketing/ticketColors.ts`, geen vrije hexwaarde. De kleur reist mee
tot in de scanner: bij een **aanvaard** ticket vult ze het volledige
feedbackvlak en staat de naam van het type als grootste woord op het scherm. Aan
een cantus is dat het verschil tussen water, bier en eigen drank, van drie meter
zichtbaar voor wie tapt.

**Twee regels die niet mogen schuiven.** Bij *dubbel* of *geweigerd* overrulen
oranje en rood die typekleur volledig; een geweigerd bierticket dat geel oplicht,
gaat binnen. En de kleur is nooit het enige signaal: type en oordeel staan er
altijd als tekst bij, want een op de twaalf mannen ziet rood en groen niet uit
elkaar en die staat even goed aan de deur.

De kleur komt live van `TicketType`, niet van een kopie op de bestelregel zoals
`ticketTypeName`. Die naamkopie bestaat om de geschiedenis vast te houden bij een
hernoeming; een kleur wil je net kunnen bijsturen tot vlak voor de deur opengaat.
De palet-keys zitten als CSS-variabelen (`--ticket-color-*`) in
`apps/web/app/design/vtk-tickets.css`.

### Kaartcheck-in met de studentenkaart

Aan een cantus moet iedereen snel binnen, en een QR opzoeken op een telefoon in
een rij van tweehonderd man is traag. Staat `TicketEvent.cardCheckIn` aan, dan kan
de deurploeg de **studentenkaart** laten lezen in plaats van de QR te scannen.

**Hoe de kaart aan een ticket raakt.** `TicketOrderItem.rNumber` (uniek per event)
is het aanknopingspunt. Bij een aankoop vult `createTicketCheckout` daar het
r-nummer van de **ingelogde koper** in, op de eerste bestelregel. Wie vier tickets
koopt voor zijn vrienden, levert dus drie regels zonder r-nummer op: die gaan met
de QR binnen, of iemand vult het nummer bij op
`/admin/tickets/<event>/deelnemers`. Botst het r-nummer met een regel die er al is,
dan blijft het veld leeg; een aankoop mag nooit stukvallen op deze index.

**Online.** De lezer gedraagt zich als een toetsenbord en tikt `serial;cardAppId`.
Dat gaat naar `POST /api/tickets/events/[eventId]/scan/card`, dat de kaart via de
gedeelde `resolveStudentCard` (eigen `StudentCard`-tabel, anders KU Leuven) tot een
r-nummer herleidt, daarmee de bestelregel opzoekt en vanaf de ticketcode door
dezelfde `scanTicket` loopt als een QR. Zelfde transactie, zelfde logboek, zelfde
uitkomsten voor een al gescand, geannuleerd of terugbetaald ticket. De
handtekening ontbreekt, net als bij een handmatig ingetikte code; de kaart is hier
het bewijs.

**Offline.** Het manifest draagt een tabel `gehashte kaart -> ticketcode`, plus de
salt waarmee ze gehasht is (`lib/ticketing/cardHash.ts`). Het toestel zoekt de
kaart daarin op en gaat vanaf de gevonden ticketcode door de gewone offline-weg:
manifestcontrole, wachtrij, `clientScanId`, synchroniseren. Er is dus geen tweede
soort wachtrij en geen tweede soort conflict.

- Enkel kaarten die bij ons al eens gelezen zijn (Theokot, deur, fakscanner)
  staan in die tabel: alleen die kennen we zonder KU Leuven te bellen. Wie zijn
  kaart nog nooit ergens liet lezen, moet zonder netwerk zijn QR bovenhalen.
- De hash is pseudonimisering, geen geheimhouding: de salt staat in hetzelfde
  bestand op hetzelfde toestel. Wat ze wél doet, is voorkomen dat er een lijst
  echte kaartnummers van achthonderd mensen in de localStorage van een
  ledentelefoon staat, en dat twee manifesten aan elkaar te leggen zijn.

**Een kaart die niets oplevert** gaat evengoed het logboek in, als `INVALID` met de
reden in `TicketScanLog.metadata` (`CARD_UNREADABLE`, `NO_TICKET`,
`CARD_CHECKIN_DISABLED`) en zonder `credentialFingerprint`. Een hash van het
kaartnummer zou een stabiele verwijzing naar één persoon zijn die het archiveren
overleeft, en dat is net wat het wissen hieronder wil vermijden.

**Bewaartermijn.** Bij het archiveren van een event wist `saveTicketEventStatusAction`
alle `rNumber`-velden van dat event. Het logboek en de bestellingen blijven, het
r-nummer verdwijnt: na de cantus heeft het geen functie meer.

**Waarom een lezer en geen NFC in de browser.** De KU Leuven-kaart is MIFARE
DESFire; Web NFC leest enkel NDEF en bestaat sowieso niet op iOS. Een
keyboard-wedge lezer (USB of bluetooth) is de enige variant die in een browser
werkt, en het is dezelfde lezer die al aan de Theokot-balie ligt.

### Zoeken op naam

Naast de camera en het handmatige codeveld heeft de scanner een knop **Op naam**:
die opent de deelnemerslijst uit hetzelfde manifest, met een zoekveld op naam of
code. Inchecken vanuit de lijst loopt door exact dezelfde `processCredential` als
een gescande QR, dus de dedup, de wachtrij en het scanlogboek gelden onverkort.
Werkt dus ook offline. Wie al binnen is, staat als "Binnen" met een uitgeschakelde
knop; dat komt uit `checkedIn` in het manifest plus wat dit toestel zelf scande.

### Op het beginscherm zetten

De scanner is installeerbaar als aparte app ("VTK Scanner"), zodat er geen
browserbalk over het camerabeeld staat en de deurploeg met één tik start. Drie
stukken horen bij elkaar:

- `app/manifest.ts`: `id`/`scope`/`start_url` op `/scan`. Die `scope` doet meer
  dan het lijkt: buiten `/scan` is de pagina niet installeerbaar, dus de browser
  biedt dit nooit aan op de publieke site. Eén manifest op de conventionele plek
  volstaat daardoor; een tweede op een geneste route werkt trouwens niet, want de
  bestandsconventie wint van `metadata.manifest` in een geneste layout.
- `public/sw.js`: een smalle service worker. Nodig omdat Chrome zonder
  geregistreerde worker met fetch-handler nooit `beforeinstallprompt` vuurt, én
  omdat de scanner anders offline niet eens opstart. Cachet enkel `/scan*` en de
  gehashte build-assets; API-antwoorden nooit (een hergebruikt scan-antwoord zou
  iemand een tweede keer binnenlaten). Registratie gebeurt enkel in productie:
  in dev zou hij hot-reloadchunks vasthouden.
- `components/ticketing/scanner/InstallButton.tsx`: vangt `beforeinstallprompt`
  op (Android/Chrome) of toont de Deel-instructie (iOS/Safari, waar dat event
  niet bestaat), en verdwijnt zodra de app in `display-mode: standalone` draait.

`/scan` zelf is het keuzescherm met de evenementen waarvoor je scanrechten hebt
(`listScannableTicketEvents`, van twaalf uur na afloop tot een maand vooruit).
Dat scherm bestaat omdat het icoon ergens moet landen dat volgende maand nog
klopt; een scanner-URL van één event is dat niet.

### De native app

Naast de PWA bestaat er een native scanner voor iOS en Android: **VTK Scanner**,
een Expo-app in een eigen repo (`~/vtk-scanner-app`, op expo.dev onder het account
`vtk-it`). Ze doet exact hetzelfde werk en praat met dezelfde endpoints; de
webscanner blijft staan als webweg en als vangnet.

- **Ze bevat geen tweede kopie van de regels.** De app roept `scanner/bootstrap`,
  `scan`, `scan/batch`, `scan/card` en `scan/reverse` aan zoals `ScannerApp.tsx`
  dat doet, met dezelfde `clientScanId` als idempotentiesleutel. De offline-
  beslissing is een poort van `components/ticketing/scanner/offline.ts`.
- **Ze meldt zich aan met een sessiecookie, niet met een token.** De app toont
  `/inloggen` in een WebView; `fetch` deelt in React Native de cookie-opslag van
  het toestel met die WebView, dus het better-auth cookie reist vanzelf mee. Dat
  is bewust: er ís geen tokenpad naar deze endpoints (de OAuth-provider geeft
  opaque tokens die enkel voor UserInfo gelden, en `TicketScanDevice.tokenHash`
  authenticeert niets), en zo werkt een KU Leuven-login ook gewoon.
- **`GET /api/tickets/scanner/events` bestaat enkel voor haar.** Het webkeuzescherm
  is een server component en roept `listScannableTicketEvents()` rechtstreeks aan;
  de app kan dat niet en heeft dezelfde lijst nodig.
- Wijzig je hier het scan-contract, het manifestformaat of het hashformaat van
  `cardHash.ts`, werk dan die repo mee bij. Het hashformaat faalt stil: de app
  vindt dan offline geen enkele kaart meer.

### API (`apps/web/app/api/tickets/...`)
- `checkout/route.ts`: start an order + checkout
- `mollie/webhook/route.ts`: Mollie payment/refund callback
- `bancontact/webhook/route.ts`: Bancontact payment callback
- `orders/[orderId]/pay/route.ts`: start a payment with a chosen method
- `orders/[orderId]/bancontact/qr/route.ts`: QR for a live Bancontact payment
- `mock/complete/route.ts`: dev-only instant "payment complete"
- `maintenance/route.ts`: reconciliation + outbox flush (Bearer `TICKETING_MAINTENANCE_SECRET`)
- `scanner/events/route.ts`: de evenementen waarvoor je scanrechten hebt, voor de native app
- `events/[eventId]/scanners`: scanners van dit event opvragen (`GET`), toevoegen
  (`POST {userId}`) of weghalen (`POST {grantId}`); enkel `MANAGE_SCANNERS`, en
  enkel de rol `SCANNER`, zodat deze weg nooit een OWNER kan degraderen
- `events/[eventId]/users/search`: iemand zoeken op naam, e-mail of r-nummer om
  als scanner toe te voegen; gescoped op de capability van het event en niet op de
  globale `users.search`-permissie
- `events/[eventId]/scanners/invite`: een verse uitnodigings-QR (`MANAGE_SCANNERS`).
  Het token (`vtks1.<base64url(eventId)>.<base36 vervaltijd>.<hmac>`, zie
  `lib/ticketing/crypto.ts`) leeft 30 seconden en het paneel ververst om de 20;
  daardoor is een doorgestuurde screenshot dood. De landingspagina is
  `app/(scanner)/scan/uitnodiging/page.tsx`, die na het inloggen de rol `SCANNER`
  toekent en doorverwijst naar `/scan/<eventId>` of naar de app
  (`vtk-scanner://scan/<eventId>`)
- `events/[eventId]/scan`, `.../scan/batch`, `.../scan/card`, `.../scan/reverse`,
  `.../scanner/bootstrap`: scanning (`scan/batch` leegt de offline wachtrij,
  `scan/card` checkt in met een studentenkaart)
- `events/[eventId]/{stats,exports/*}`, `orders/[orderId]/{status,access}`,
  `[ticketId]/pdf`: supporting endpoints

### Domain logic (`apps/web/lib/ticketing/`)
- `orders.ts`: `createTicketCheckout`, `fulfillPaidOrder`, `expirePendingOrder`,
  `releaseExpiredOrders` (order lifecycle + gateway orchestration)
- `inventory.ts`: capacity reservation (race-safe)
- `refunds.ts`: `requestTicketRefund`, `completeTicketRefund`, `failTicketRefund`
- `reconciliation.ts`: polls PENDING payments/refunds against the provider
- `scanner.ts`: scan authorization + validation
- `authorization.ts`: capability checks (`canCreateTicketEventForGroup`, `requireTicketEventCapability`)
- `config.ts`: env-driven config (provider, base URL, secrets, reservation window)
- `crypto.ts`: signed ticket credentials + order access tokens
- `ticketColors.ts`: het palet per tickettype (key, geen hex)
- `cardHash.ts`: het hashformaat van de studentenkaart in het offline-manifest;
  draait bewust aan beide kanten
- `mail.ts`, `outbox.ts`: durable confirmation-mail queue
- `mailBundle.ts`: the ticket PDF and the Apple Wallet passes that ride along
  with that mail, plus the Google Wallet save links (best effort: a failing
  generator or provider never blocks the confirmation itself)
- `money.ts`, `time.ts`, `pdf.ts`, `csv.ts`, `http.ts`, `access.ts`, `queries.ts`: helpers

### Components (`apps/web/components/ticketing/`)
- `public/TicketShop.tsx`: buyer checkout UI (quantity steppers, attendee form)
- `public/TicketPass.tsx`: renders the QR from the ticket credential
- `public/OrderStatus.tsx`, `TicketEventCard.tsx`, `AccessExchange.tsx`
- `admin/TicketEventForm.tsx`, `TicketTypeManager.tsx`, `TicketQuestionManager.tsx`,
  `RefundOrderForm.tsx`, `EventAdminNav.tsx`, `StatusBadge.tsx`, `AdminMetric.tsx`
- `scanner/ScannerApp.tsx`: `@zxing/browser` camera scanner (rear camera)

### Styling
- `apps/web/app/design/vtk-tickets.css`

## Permissions

- Groups + per-group `MembershipRole` (`MEMBER` | `LEAD`) in
  `packages/db/prisma/schema.prisma`; fine-grained codes in
  `packages/db/src/permissions.ts`.
- `tickets.create`: create ticket events for own group (granted to `IT` and
  `GROEP5` by the seed). `tickets.manageAll`: global ticket admin (explicit).
- Per-event capabilities via grants: `OWNER`/`MANAGER` grants include `SCAN`.
  Superadmins bypass all checks.
- `SCANNER` draagt **enkel `SCAN`**, bewust zonder `VIEW_EVENT`: die capability
  bewaakt `admin/tickets/[eventId]/layout.tsx`, en wie aan de deur staat hoort niet
  in het beheer. Om dezelfde reden telt scannen niet mee in
  `canAccessAnyTicketEvent()`, dat de Tickets-tab in de adminnavigatie bepaalt.
- `MANAGE_SCANNERS`: smaller than `MANAGE_ACCESS`: scanners toevoegen en
  weghalen, en niets anders. `OWNER` en `MANAGER` dragen ze, zodat de leads van
  de organiserende post een deurploeg kunnen samenstellen zonder het
  eigenaarschap of de financiële rollen te kunnen verzetten.

### Standaard scantoegang

Naast de grants staat één regel in code: **elke praesidiumpost mag elk event
scannen, en een werkgroep enkel de events van haar eigen werkgroep.** Ze geeft de
rol `SCANNER` (`VIEW_EVENT` + `SCAN`) en niets meer, en `TicketEvent.openScanning`
zet ze per event uit voor een gevoelige gastenlijst. De kringkeuze en het gevolg
(wie kan scannen, ziet alle deelnemersnamen, want het manifest reist mee) staan in
`docs/design-decisions.md`.

De regel staat als twee pure functies in `lib/ticketing/authorization.ts`:
`hasOpenScanAccess` voor de capability-kant en `openScanningWhere` voor de twee
SQL-kanten (`listScannableTicketEvents`, `canAccessAnyTicketEvent`). Ze zijn
bewust puur, want dezelfde regel stond hier al drie keer in een eigen vorm en
groeit anders uit elkaar; `apps/web/test/authorization.test.ts` legt ze vast.

## Local testing

- **Seed users** (`packages/db/prisma/seed.ts`): committee accounts
  `<group>@vtk.prototype` (e.g. `it@vtk.prototype`, an IT LEAD) with password
  `prototype` (override via `SEED_PROTOTYPE_PASSWORD`). No student account is
  seeded: create one via `/admin/gebruikers` or a small script (a user with no
  group membership = a plain student).
- **Mock provider** (default, offline): `TICKETING_PAYMENT_PROVIDER=mock`,
  `TICKETING_PUBLIC_URL=http://localhost:3000`. Payment "completes" instantly via
  `mock/complete`.
- **Mollie test provider** (real hosted checkout, choose paid/failed): set
  `TICKETING_PAYMENT_PROVIDER=mollie`, a `test_...` `MOLLIE_API_KEY`, and point
  `TICKETING_PUBLIC_URL` + `BETTER_AUTH_TRUSTED_ORIGINS` at an HTTPS tunnel
  (e.g. `cloudflared tunnel --url http://localhost:3000`) so Mollie can redirect
  back and reach the webhook. Restart `npm run dev` after env changes. See the
  README *Mollie hosted checkout* section for the full walkthrough.
- **Camera/scanner** needs HTTPS or `localhost`; a phone on a LAN IP is refused,
  so use the tunnel URL for `/scan/<eventId>` on mobile.
- Dev server runs `next dev --webpack` (never Turbopack: see `AGENTS.md`).

## Tests
- Unit: `npm run test --workspace=@vtk/web` (`apps/web/test/*.test.ts`)
- Integration (needs an isolated Postgres, not the seeded dev DB):
  `apps/web/test/integration/ticketing-db.integration.ts`: includes the Mollie
  webhook fulfil + dedup test (mocks `fetch` to Mollie).
