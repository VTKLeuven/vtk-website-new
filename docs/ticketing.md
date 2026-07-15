# Integrated ticketing — architecture & file map

Event-scoped ticket sales for the main web app (`apps/web`): create a ticketed
event, sell tickets to the public, take payment via **Mollie**, issue signed
PDF/QR tickets, refund, and scan at the entrance. This doc is the "where is
everything" map; the README's *Integrated ticketing* section covers operational
setup (env, webhook, SMTP).

## End-to-end flow

1. **Create/publish** — a group LEAD with `tickets.create` (or a superadmin)
   creates an event at `/admin/tickets/new`, adds ≥1 active ticket type with a
   price, then flips status to `PUBLISHED`. Creation auto-grants the creator an
   `OWNER` grant + the owner group's leads a `MANAGER` grant, and seeds a default
   inventory pool (`GENERAL`) and gate (`MAIN`).
2. **Buy** — a buyer picks tickets at `/tickets/<slug>` → `POST /api/tickets/checkout`
   reserves inventory, creates a `TicketOrder` (`PENDING_PAYMENT`) + `TicketPayment`,
   asks the payment gateway for a checkout URL, and redirects there.
   Zero-cost tickets skip the gateway (provider `free`) but require a logged-in
   account.
3. **Pay** — Mollie hosted checkout. On completion Mollie calls the webhook,
   which re-fetches the payment and calls `fulfillPaidOrder` → tickets issued,
   confirmation mail enqueued in the same transaction.
4. **Ticket** — buyer views the order at `/mijn-tickets/<orderId>` (or
   `/tickets/bestelling/<orderId>`); each ticket renders a QR from a signed,
   PII-free credential.
5. **Scan** — an operator with `SCAN` capability opens `/scan/<eventId>` on a
   phone, scans the QR, and the server validates + marks it used (with duplicate
   detection and reversal).

## Payment provider abstraction

All providers implement one interface; the rest of the system is
provider-agnostic and keys off the `provider` string stored on each row
(`TicketPayment.provider`, `TicketRefund.provider`, `TicketPaymentWebhook.provider`
— a plain `String`, so adding/switching a provider needs **no DB migration**).

| Concern | Location |
| --- | --- |
| Gateway interface (`PaymentGateway`) + DTOs | `apps/web/lib/ticketing/payments/types.ts` |
| Provider factory (`paymentGateway`, `paymentGatewayFor`) | `apps/web/lib/ticketing/payments/index.ts` |
| **Mollie** gateway (raw REST via `fetch`, no SDK) | `apps/web/lib/ticketing/payments/mollie.ts` |
| Mock gateway (local dev only, instant "paid") | `apps/web/lib/ticketing/payments/mock.ts` |
| Which provider is active | `configuredPaymentProvider()` in `apps/web/lib/ticketing/config.ts` |

`configuredPaymentProvider()` returns `mollie` when `TICKETING_PAYMENT_PROVIDER=mollie`,
`mock` when unset/`mock` outside production, and throws in production unless
`mollie` is set.

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
  `{ refundId, paymentId }` (not just a refund id like a top-level Stripe refund).
- Definitive (non-retryable) errors = any Mollie 4xx except 429.

## File map

### Routes — public (`apps/web/app/[locale]/...`)
- `tickets/page.tsx` — public shop list (`/tickets`)
- `tickets/[slug]/page.tsx` — event + purchase page
- `mijn-tickets/[orderId]/page.tsx`, `tickets/bestelling/[orderId]` — order + QR

### Routes — admin (`apps/web/app/[locale]/admin/tickets/...`)
- `page.tsx` — event list / management
- `new/page.tsx` — create event
- `[eventId]/{instellingen,toegang,deelnemers,bestellingen}` — settings (ticket
  types), access/grants, attendees, orders

### Routes — scanner
- `apps/web/app/(scanner)/scan/[eventId]/page.tsx` — camera scanner (no locale
  prefix). Requires session + `SCAN` capability. Needs HTTPS or localhost for
  camera access.

### API (`apps/web/app/api/tickets/...`)
- `checkout/route.ts` — start an order + checkout
- `mollie/webhook/route.ts` — Mollie payment/refund callback
- `mock/complete/route.ts` — dev-only instant "payment complete"
- `maintenance/route.ts` — reconciliation + outbox flush (Bearer `TICKETING_MAINTENANCE_SECRET`)
- `events/[eventId]/scan`, `.../scan/reverse`, `.../scanner/bootstrap` — scanning
- `events/[eventId]/{stats,exports/*}`, `orders/[orderId]/{status,access}`,
  `[ticketId]/pdf` — supporting endpoints

### Domain logic (`apps/web/lib/ticketing/`)
- `orders.ts` — `createTicketCheckout`, `fulfillPaidOrder`, `expirePendingOrder`,
  `releaseExpiredOrders` (order lifecycle + gateway orchestration)
- `inventory.ts` — capacity reservation (race-safe)
- `refunds.ts` — `requestTicketRefund`, `completeTicketRefund`, `failTicketRefund`
- `reconciliation.ts` — polls PENDING payments/refunds against the provider
- `scanner.ts` — scan authorization + validation
- `authorization.ts` — capability checks (`canCreateTicketEventForGroup`, `requireTicketEventCapability`)
- `config.ts` — env-driven config (provider, base URL, secrets, reservation window)
- `crypto.ts` — signed ticket credentials + order access tokens
- `mail.ts`, `outbox.ts` — durable confirmation-mail queue
- `money.ts`, `time.ts`, `pdf.ts`, `csv.ts`, `http.ts`, `access.ts`, `queries.ts` — helpers

### Components (`apps/web/components/ticketing/`)
- `public/TicketShop.tsx` — buyer checkout UI (quantity steppers, attendee form)
- `public/TicketPass.tsx` — renders the QR from the ticket credential
- `public/OrderStatus.tsx`, `TicketEventCard.tsx`, `AccessExchange.tsx`
- `admin/TicketEventForm.tsx`, `TicketTypeManager.tsx`, `TicketQuestionManager.tsx`,
  `RefundOrderForm.tsx`, `EventAdminNav.tsx`, `StatusBadge.tsx`, `AdminMetric.tsx`
- `scanner/ScannerApp.tsx` — `@zxing/browser` camera scanner (rear camera)

### Styling
- `apps/web/app/design/vtk-tickets.css`

## Permissions

- Groups + per-group `MembershipRole` (`MEMBER` | `LEAD`) in
  `packages/db/prisma/schema.prisma`; fine-grained codes in
  `packages/db/src/permissions.ts`.
- `tickets.create` — create ticket events for own group (granted to `IT` and
  `GROEP5` by the seed). `tickets.manageAll` — global ticket admin (explicit).
- Per-event capabilities via grants: `OWNER`/`MANAGER` grants include `SCAN`.
  Superadmins bypass all checks.

## Local testing

- **Seed users** (`packages/db/prisma/seed.ts`): committee accounts
  `<group>@vtk.prototype` (e.g. `it@vtk.prototype`, an IT LEAD) with password
  `prototype` (override via `SEED_PROTOTYPE_PASSWORD`). No student account is
  seeded — create one via `/admin/gebruikers` or a small script (a user with no
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
- Dev server runs `next dev --webpack` (never Turbopack — see `AGENTS.md`).

## Tests
- Unit: `npm run test --workspace=@vtk/web` (`apps/web/test/*.test.ts`)
- Integration (needs an isolated Postgres, not the seeded dev DB):
  `apps/web/test/integration/ticketing-db.integration.ts` — includes the Mollie
  webhook fulfil + dedup test (mocks `fetch` to Mollie).
