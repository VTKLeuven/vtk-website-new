# VTK Website

Modular site for **Vlaamse Technische Kring (VTK)**: an npm **workspaces** monorepo
with **Next.js 16** (React 19), **Prisma** + PostgreSQL, Hetzner S3 object storage,
an integrated **Immich** gallery, and
shared-session checks for subdomains (`*.vtk.be`). The public homepage follows
the editorial system under `design/` and `apps/web/app/design/`; admin uses the
same tokens via scoped CSS.

## Layout

```
apps/
  web/         Main site (vtk.be) — pages, calendar, photos, admin, API
  logistiek/   First submodule scaffold (logistiek.vtk.be)
packages/
  db/          Prisma schema, client, seeds, permission codes
  auth/        argon2id hashing, sessions, RBAC helpers, remote session verify
  i18n/        NL/EN dictionaries and helpers
  storage/     S3 client, sharp image pipeline, ZIP streaming
  ui/          Shared UI primitives
  tsconfig/    Shared base tsconfig
infra/
  docker-compose.yml  Postgres, web, logistiek, ticket worker, and Immich
  docker/             Dockerfiles for apps
  immich/             Immich configuration, data, and optional demo seeding
docs/
  immich-gallery.md   Immich-backed public media gallery setup
```

## Requirements

- Node.js 20+
- npm 10+
- Docker 24+ with Docker Compose (for Postgres, Immich, and production)

---

## Development

### 1. First-time setup

```bash
# Clone and install
git clone <repo> vtk-website-new
cd vtk-website-new
npm install

# Configure environment
cp .env.example .env
#   Edit .env if you want different credentials. The defaults work for local dev.

# Link the root .env into each Next.js app so the dev-server workers pick it up.
# Next.js auto-loads .env from each app's own directory; it does NOT read from
# the monorepo root. These symlinks are gitignored via the .env* pattern.
# these don't work on windows :(( you have to manually copy every time something changes
ln -sf ../../.env apps/web/.env
ln -sf ../../.env apps/logistiek/.env

# Start local PostgreSQL
docker compose -f infra/docker-compose.yml up -d postgres
```

**Postgres reachable from your host:** the default Compose file does **not**
publish Postgres on `localhost` (to avoid clashing with an existing install).
Either add a `ports` mapping under `postgres` (see the comment in
`infra/docker-compose.yml`) or use a `DATABASE_URL` that points at a Postgres you
already run locally. Prisma CLI and `npm run dev` run **on the host**, so
`@postgres:5432` only works from **inside** Docker, not from your shell.

```bash
# Generate the Prisma client, apply the schema, seed baseline data
# (groups, header tabs, permissions, partners strip, homepage defaults, …).
npm run db:generate
npm run db:push          # quick local iteration; use db:migrate for migration files
npm run db:seed          # optional SEED_ADMIN_* in root .env → first superadmin
```

### 2. Running the dev server

```bash
npm run dev
```

- Main site (dev): `http://localhost:3000`
- Full Docker stack (`web` in Compose): `http://127.0.0.1:3011` (see `infra/docker-compose.yml`)
- Immich (when started): `http://127.0.0.1:2283`
- Postgres: only on `localhost:5432` if you publish that port or use a local instance; defaults in `.env.example` assume `vtk` / `vtk`

To run the `logistiek` submodule against the same main app:

```bash
npm run dev --workspace=@vtk/logistiek   # listens on :3100
```

### 3. Daily workflow

```bash
# If Docker services aren't already running:
docker compose -f infra/docker-compose.yml up -d postgres

# Start Next.js
npm run dev
```

### 4. Schema changes

After editing `packages/db/prisma/schema.prisma`:

```bash
# Quick local iteration (no migration file):
npm run db:push

# Or, to create a migration:
npm run db:migrate
```

Both commands also regenerate the Prisma client.

### 5. Useful commands

| Command                                  | What it does                                |
|------------------------------------------|---------------------------------------------|
| `npm run dev`                            | Main site dev server (webpack)              |
| `npm run dev --workspace=@vtk/logistiek` | Submodule dev server on :3100             |
| `npm run build`                          | Build `@vtk/db` + `@vtk/web` for production |
| `npm run start`                          | Start the built main site                   |
| `npm run lint`                           | Lint the main site                          |
| `npm run db:generate`                    | Regenerate Prisma client                    |
| `npm run db:push`                        | Apply schema without a migration file       |
| `npm run db:migrate`                     | Create + apply a migration                  |
| `npm run db:seed`                        | Seed baseline rows (idempotent; reads root `.env` via `@vtk/db` script) |

### 6. Immich media gallery

The public Media page can read albums directly from Immich. Only albums whose
Immich description contains `[gallery]` are shown. Photos are not committed to
this repo; they stay in Immich and are served through Immich Public Proxy.

See [docs/immich-gallery.md](docs/immich-gallery.md) for the required Immich API
key, public proxy URL, face-search database settings, local setup script, and
troubleshooting.

### 7. Stopping / resetting local infra

```bash
# Stop but keep data
docker compose -f infra/docker-compose.yml stop

# Stop and wipe named Postgres/model-cache volumes (destructive). Immich photos
# and its database use bind mounts under infra/immich/data and are not deleted.
docker compose -f infra/docker-compose.yml down -v
```

---

## Integrated ticketing

The main app includes event-scoped ticket sales, Mollie hosted checkout
(Bancontact, card, and the other methods enabled on the Mollie profile),
PDF/QR tickets, refunds, and an authenticated entrance scanner. Public sales
live at `/tickets`, event administration at `/admin/tickets`, and a scanner
session at `/scan/<ticket-event-id>`.

### Local mock-payment flow

The mock gateway is intended for local development only and is rejected when
`NODE_ENV=production`.

1. Configure the root `.env` and link it into `apps/web` as described above.
   Keep `TICKETING_PAYMENT_PROVIDER=mock`, and replace both ticketing secrets
   with local random values.
2. Apply the migrations and seed an administrator:

   ```bash
   npm run db:generate
   npm run db:migrate
   npm run db:seed
   npm run dev
   ```

3. Sign in as the seeded superadmin (or as a group lead with
   `tickets.create`), create an event under `/admin/tickets`, add a ticket type,
   set its sales window, and publish it.
4. Open `/tickets`, complete an order, and accept the mock payment redirect.
   The order is marked paid and its signed QR tickets are issued immediately.
5. Run the maintenance endpoint once to process the confirmation-mail outbox:

   ```bash
   set -a
   . ./.env
   set +a
   curl --fail --silent --show-error \
     -X POST \
     -H "Authorization: Bearer $TICKETING_MAINTENANCE_SECRET" \
     http://localhost:3000/api/tickets/maintenance
   ```

   Without `SMTP_HOST`, development logs the message to the web-server console.
   Use the event administration's scanner link to test a first scan, a duplicate
   scan, and a reversal.

Run the focused ticketing unit tests with:

```bash
npm run test --workspace=@vtk/web
```

### Mollie hosted checkout

Create a Mollie account for the organisation, complete the onboarding, and
enable the desired payment methods (at minimum **Bancontact** and **card**) on
the Mollie profile. The integration uses the Mollie **Payments API**: it creates
a single payment for the order total in EUR and redirects the buyer to Mollie's
hosted checkout, where they pick a method. Payment details stay on Mollie-hosted
pages and are never handled by this application.

Configure production with a live-mode API key:

```dotenv
TICKETING_PAYMENT_PROVIDER="mollie"
TICKETING_PUBLIC_URL="https://vtk.be"
TICKETING_RESERVATION_MINUTES="31"
TICKETING_TOKEN_SECRET="<openssl rand -base64 48>"
TICKETING_MAINTENANCE_SECRET="<openssl rand -base64 48>"
MOLLIE_API_KEY="live_..."
```

Mollie calls back at this endpoint whenever a payment or one of its refunds
changes state:

```text
https://vtk.be/api/tickets/mollie/webhook
```

There is **no webhook to register in a dashboard** and **no signing secret**:
Mollie posts only the payment id (`id=tr_...`, form-encoded), and the route
re-fetches the authoritative payment from Mollie's API to decide what to do —
so trust comes from the API key, not from the request body. The webhook URL is
derived automatically from `TICKETING_PUBLIC_URL` and sent on every payment.
Mollie rejects non-public webhook URLs, so the app omits the webhook URL when
`TICKETING_PUBLIC_URL` points at `localhost`; in that case fulfillment relies on
the return-page check plus reconciliation in the maintenance worker.

Refunds are settled from refund data embedded in the same webhook, with
reconciliation in the maintenance worker as a second path when a webhook is
delayed. Payment status maps as: `paid` → succeeded; `expired` → expired;
`canceled`/`failed` → failed; everything else stays pending.

For a **local Mollie test**, use a `test_...` API key and expose the app over a
public HTTPS tunnel so Mollie can redirect the buyer back and reach the webhook:

```bash
# 1. tunnel localhost:3000 (any HTTPS tunnel works)
cloudflared tunnel --url http://localhost:3000     # prints https://<random>.trycloudflare.com

# 2. point ticketing + auth at that origin in the root .env, then restart `npm run dev`
TICKETING_PAYMENT_PROVIDER="mollie"
TICKETING_PUBLIC_URL="https://<random>.trycloudflare.com"
MOLLIE_API_KEY="test_..."
BETTER_AUTH_TRUSTED_ORIGINS="http://localhost:3000,https://<random>.trycloudflare.com"
```

In test mode Mollie's hosted checkout lets you choose the outcome
(**paid / failed / expired**) with no real money. The webpack dev server already
allows `*.trycloudflare.com` via `allowedDevOrigins` in `apps/web/next.config.ts`.
Never mix test-mode and live-mode API keys.

### SMTP and the durable outbox

Paid orders enqueue their confirmation message in the same database transaction
that issues the tickets. Configure an authenticated SMTP relay in production:

```dotenv
SMTP_HOST="smtp.example.org"
SMTP_PORT="587"
SMTP_SECURE="false"
SMTP_USER="tickets@vtk.be"
SMTP_PASSWORD="..."
MAIL_FROM="VTK Tickets <tickets@vtk.be>"
MAIL_REPLY_TO="info@vtk.be"
```

`ticket-worker` in `infra/docker-compose.yml` calls
`POST /api/tickets/maintenance` every 15 seconds with the maintenance bearer
secret. Each call reconciles pending Stripe payments/refunds, releases expired
inventory reservations, and claims outbox rows using `FOR UPDATE SKIP LOCKED`.
Failed mail is retried with exponential backoff; after eight attempts the row is
marked `DEAD` and requires operational investigation. Keep the maintenance route
private, monitor worker/web logs and dead outbox rows, and never put its secret
in client-side environment variables.

Guest order links keep the capability token in the URL fragment, exchange it
for an expiring `HttpOnly`, `SameSite=Lax` cookie, and immediately navigate
to a clean order URL. Fragments are not sent in HTTP requests, so the token is
not included in reverse-proxy access logs or Stripe return URLs. The cookie and signed
link expire shortly after the event; resending a confirmation reuses that same
bounded capability.

Zero-cost tickets require an authenticated site account. This prevents an
anonymous client from draining event capacity by rotating unverified email
addresses; paid public tickets remain available to guests. Use member-only
ticket types when the audience must also be restricted to signed-in users.

### Event-scoped access

Access is evaluated against current database grants on every protected request;
granting access to one event does not reveal another event. A user or group grant
has one of these roles:

| Role | Intended access |
|------|-----------------|
| `OWNER` | Full event control, attendee and financial data, refunds, scanning, audit, and access grants |
| `MANAGER` | Event setup, inventory, attendees/orders, scanning, reports, and audit; no finance, refunds, or access grants |
| `FINANCE` | Attendees/orders, financial totals, refunds, reports, and audit; no event setup, scanning, or access grants |
| `SCANNER` | Scanner and the minimum event context needed at the entrance |
| `REPORTER` | Aggregate event reports only; no attendee or financial detail |

Group grants can target all members or leads only. A lead with the group-level
`tickets.create` permission may create ticket events for that group; the creator
becomes `OWNER` and the group's leads receive `MANAGER`. `tickets.manageAll` and
superadmin bypass event grants and therefore expose every event: assign that
permission only to the small operational team that genuinely needs it.

### Production checklist

- Back up PostgreSQL, run `prisma migrate deploy`, and verify the new migration
  before enabling ticket sales.
- Use unique high-entropy values for `BETTER_AUTH_SECRET`,
  `TICKETING_TOKEN_SECRET`, and `TICKETING_MAINTENANCE_SECRET`; keep them in the
  deployment secret store and document a rotation procedure.
- Set `TICKETING_PAYMENT_PROVIDER=stripe`, use Stripe live-mode keys, enable
  Bancontact, register the seven webhook events, and verify successful webhook
  deliveries in Stripe Workbench.
- Configure SPF, DKIM, and DMARC for `MAIL_FROM`; complete a confirmation-mail
  delivery test outside the organisation before opening sales.
- Confirm `web` and `ticket-worker` are healthy, monitor webhook errors and
  `FAILED`/`DEAD` outbox rows, and alert on sustained failures.
- Configure capacity, sales windows, terms version/URL, contact address, gates,
  and least-privilege event grants. Remove temporary scanner grants after the
  event and block unused device identifiers to keep the audit trail clean.
  Device identifiers are audit metadata, not authentication factors: for a
  lost device, removing the user's event grant is the security control.
- Rehearse one live purchase, webhook delivery, PDF/QR download, first and
  duplicate scan, reversal, full refund, expired reservation, and sold-out edge
  case. Entrance devices require HTTPS and camera permission.
- Include ticket tables in encrypted database backups and test restoration.
  Do not launch until the incident, refund, reconciliation, and support owners
  are named.

### Privacy and retention

Orders store buyer/attendee names and email addresses, accepted terms/version,
custom-question answers, payment references, and ticket status. Scan and audit
logs additionally record operational actors and timestamps. Stripe webhook
storage is deliberately reduced to identifiers and status metadata; QR secrets
and order access tokens are stored as hashes.

- Ask only event questions that are necessary, avoid free-text collection of
  sensitive data, state the purpose and retention period at collection time,
  and restrict attendee exports to authorised event roles.
- Treat order links and QR credentials as secrets. Do not include them in logs,
  analytics, chat, or support tickets; revoke/void affected tickets when leaked.
- Document the lawful basis, data-subject request process, processor agreements
  for Stripe/SMTP/hosting, and the separation between statutory financial
  retention and shorter operational attendee-data retention with the privacy
  owner and accountant.
- Archiving an event does **not** currently erase or anonymise its records, and
  scan/audit rows are append-only. Define an approved post-event
  anonymisation/purge procedure before production, including backups, while
  preserving only records that must remain for accounting, fraud handling, or
  audit obligations.

---

## Gotchas and local-dev constraints

A few non-obvious choices in this repo exist to keep local development usable.
**Do not revert them without reading why.**

### `npm run dev` uses webpack, not Turbopack

Both `apps/web` and `apps/logistiek` run `next dev --webpack`. Next.js 16 +
Turbopack + Tailwind v4's PostCSS plugin has a known leak where every CSS
recompile spawns a fresh `.next/dev/build/postcss.js` child process that is
never reaped; in this monorepo it quickly balloons to hundreds of workers and
tens of GB of RAM. See
[vercel/next.js#77102](https://github.com/vercel/next.js/discussions/77102).
`next build` (Turbopack) is single-shot and unaffected.

If you *want* to try Turbopack anyway: `npm run dev:turbopack -w @vtk/web` —
but watch `pgrep -f postcss.js | wc -l` and kill it if that number grows.

### Workspace root is pinned

Both `next.config.ts` files set `turbopack.root` and `outputFileTracingRoot` to
the monorepo root. Without this, Next walks upwards looking for a lockfile and
can latch onto a stray `package-lock.json` in `$HOME`, then try to scan things
like OrbStack container mounts (which contain symlink cycles).

### Tailwind v4 source scanning is explicit

Each `apps/*/app/globals.css` uses `@import "tailwindcss" source(none);` plus
explicit `@source` directives. Don't switch back to auto-detection; the oxide
scanner follows symlinks and can walk outside the monorepo.

### `@vtk/db` does not re-export from `@prisma/client`

`packages/db/src/index.ts` exports only the `prisma` singleton. The generated
`@prisma/client/index.d.ts` is ~28k lines and re-exporting it through the
workspace forces every importer through that graph, which is pathologically
slow. Import model types directly from `@prisma/client` at the call site if
you need them.

### `.env` lives at the monorepo root

The canonical file is `/.env`. Prisma CLI scripts load it via
`dotenv-cli -e ../../.env`. The dev servers load it through
`apps/*/env` symlinks (see setup step 1). Don't duplicate the file per app.

---

## Production (self-hosted, Docker)

The application stack is defined in `infra/docker-compose.yml`: the website,
logistics app, ticket worker, PostgreSQL, Immich, machine learning, Valkey, and
Immich Public Proxy. Caddy runs on the host and owns public routing and TLS.
MinIO, Nginx, and Certbot are deliberately not part of this stack.

### 1. DNS

Point the following records at the server:

- `vtk.be`, `www.vtk.be` → main site
- `logistiek.vtk.be`     → logistiek submodule
- `immich.vtk.be`        → Immich management interface (choose any hostname)
- `photos.vtk.be`        → Immich Public Proxy (choose any hostname)

Add one record per future submodule (`<name>.vtk.be`).

### 2. Environment

On the server:

```bash
test -f .env || cp .env.example .env
test -f infra/immich/.env || cp infra/immich/.env.example infra/immich/.env
```

Fill in at minimum in the repo-root `.env`:

```dotenv
POSTGRES_USER=vtk
POSTGRES_PASSWORD=<strong password>
POSTGRES_DB=vtk
DATABASE_URL=postgresql://vtk:<strong password>@postgres:5432/vtk?schema=public

SESSION_COOKIE_DOMAIN=.vtk.be
VTK_MAIN_URL=https://vtk.be

GALLERY_IMMICH_API_KEY=<create this in Immich after first start>
GALLERY_PUBLIC_PROXY_URL=https://photos.vtk.be

# Loaded into the web container for `npx tsx packages/db/prisma/seed.ts`
SEED_ADMIN_EMAIL=admin@vtk.be
SEED_ADMIN_PASSWORD=<strong password>
```

In `infra/immich/.env`, replace all example passwords and set
`PUBLIC_BASE_URL=https://photos.vtk.be`. Keep the `DB_*`, `POSTGRES_*`, and
`GALLERY_DATABASE_*` credentials identical as the file comments instruct.

Configure Hetzner object storage after login under **Admin → IT**. Its encrypted
database setting is authoritative; root `S3_*` variables are only an optional
fallback. After editing either env file, recreate the affected containers.

### 3. Caddy reverse proxy

All published container ports bind to `127.0.0.1`; Caddy is the only public
edge. A minimal host Caddyfile is:

```bash
vtk.be, www.vtk.be {
    reverse_proxy 127.0.0.1:3011
}

logistiek.vtk.be {
    reverse_proxy 127.0.0.1:3100
}

immich.vtk.be {
    reverse_proxy 127.0.0.1:2283
}

photos.vtk.be {
    reverse_proxy 127.0.0.1:3014
}
```

Caddy obtains and renews certificates itself. Keep the Immich management
hostname access-controlled if it should not be generally reachable.

### 4. Launch the stack

```bash
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
```

`--remove-orphans` is important for the first deployment after this change: it
stops and removes old `infra-minio-1`, `infra-nginx-1`, and `infra-certbot-1`
containers. It does not delete their volumes or files.

This brings up:

| Service        | Role                                                   |
|----------------|--------------------------------------------------------|
| `postgres`     | PostgreSQL 16, data in the `postgres-data` volume      |
| `web`          | Main Next.js app on **127.0.0.1:3011** → container :3000 |
| `logistiek`    | Submodule app on **127.0.0.1:3100** → container :3000  |
| `ticket-worker` | Reconciliation, reservation expiry, and mail outbox (every 15s) |
| `immich-server` | Immich API/UI on **127.0.0.1:2283**                   |
| `immich-machine-learning` | Immich face recognition and search          |
| `immich-redis` | Private Immich queue/cache                             |
| `immich-database` | Private Immich PostgreSQL with face embeddings      |
| `immich-public-proxy` | Public gallery proxy on **127.0.0.1:3014**      |

During image **build**, the `web` Dockerfile runs `prisma generate` and
`next build`. At **container start**, the default command runs
`prisma migrate deploy` (applies migrations under `packages/db/prisma/migrations`),
then the **config sync** (`packages/db/prisma/sync.ts`), and then starts Next.js.
The seed runs on start **only when `RUN_SEED=true`**; otherwise it is skipped.
This keeps redeploys from re-asserting seeded and admin-managed content (header
tabs, CMS pages, partners, ...) over changes made in `/admin`. Seed a fresh DB
explicitly (next section) or set `RUN_SEED=true` for a single start.

The **config sync** does run on every start, because it only mirrors registries
that live in code into the DB: the permission list
(`packages/db/src/permissions.ts`) and the grants of the `admin` system role.
Without it a permission added in code never reached the deployed DB and its
screens stayed unreachable until someone reseeded by hand. It creates no users,
roles or groups (those are GUI actions here) and it never overwrites
admin-managed content; missing posts or header tabs are only reported in the
container log. Run it manually with `npm run sync -w @vtk/db`, or
`npm run sync:check -w @vtk/db` for a dry run.

### 5. First-time database init (once, on the server)

With `postgres` healthy and `web` built (migrations apply on first `web` start,
or run deploy explicitly):

```bash
docker compose -f infra/docker-compose.yml exec web \
  sh -c "cd /app && npx prisma migrate deploy --schema packages/db/prisma/schema.prisma"

docker compose -f infra/docker-compose.yml exec web \
  sh -c "cd /app && npx tsx packages/db/prisma/seed.ts"
```

Use **`migrate deploy`** in production (not `db push`) so the database matches
versioned migrations. For a **greenfield** DB, starting `web` runs
`migrate deploy` but **not** the seed (unless `RUN_SEED=true`), so run the
`exec ... seed.ts` command above once to populate it. The seed is idempotent, so
rerunning it is safe.

The seed is **create-only**: it fills in missing rows (groups, header tabs,
permissions, partners, calendar placeholder rows, prototype users, POCs, CMS
pages, albums, homepage defaults, etc.) but never overwrites existing ones. So
rerunning it against a populated DB is a no-op for anything already there, and
edits made in `/admin` always survive. With **`SEED_ADMIN_EMAIL`** and
**`SEED_ADMIN_PASSWORD`** in repo-root `.env`, the seed creates a superadmin **if
that email does not exist yet**. It no longer resets the password of an existing
admin on repeat runs (that was a destructive update); to change an existing
admin's password, use the admin UI, or delete the row and reseed. The seed logs
`Seeding initial admin...` when both are set; **“Skipping initial admin”**
means they are missing inside the container (see env_file / recreate above).

### 6. Updates / redeploys

```bash
git pull
docker compose -f infra/docker-compose.yml pull
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
```

The rebuilt `web` container runs migrations and the config sync on startup, so
permissions added in this release land in the DB. It does **not** reseed (the
seed only runs when `RUN_SEED=true`), so admin-managed content survives the
redeploy.

### 7. Backups

- **Postgres:** `docker compose -f infra/docker-compose.yml exec -T postgres pg_dump -U vtk vtk > backup-$(date +%F).sql`
- **Immich:** back up `infra/immich/data/library` and dump `immich-database`;
  both the library and database are required for a complete restore.
- **Hetzner S3:** enable provider-side protections and maintain a separate
  bucket backup according to the organisation's retention policy.

After confirming all former MinIO objects exist in Hetzner, inspect the legacy
volume with `docker volume ls` and remove it explicitly if it is no longer
needed. A normal redeploy intentionally never deletes volumes.

### 8. Logs and diagnostics

```bash
docker compose -f infra/docker-compose.yml logs -f web
docker compose -f infra/docker-compose.yml logs -f immich-server immich-public-proxy
docker compose -f infra/docker-compose.yml ps
```

If `ticket-worker` is unhealthy, inspect its logs first. An empty
`TICKETING_MAINTENANCE_SECRET` disables it intentionally; a `401` means `web`
and `ticket-worker` were not recreated with the same secret. Set a strong value
in the root `.env`, then force-recreate both services.

---

## Adding a new submodule

1. Copy `apps/logistiek` to `apps/<name>` and rename the package to
   `@vtk/<name>`.
2. Adjust the port in `package.json` dev/start scripts if you want a different
   local port.
3. Edit `apps/<name>/lib/session.ts` to require the appropriate group
   (e.g. `isMemberOfGroup(session, "Cursusdienst")`).
4. Symlink the root `.env` in: `ln -sf ../../.env apps/<name>/.env`.
5. Add a service block to `infra/docker-compose.yml` (copy the `logistiek`
   block, rename, pick a free loopback port) and a matching Dockerfile in
   `infra/docker/`.
6. Add a matching `<name>.vtk.be` site to the host Caddyfile and reverse proxy
   it to the new loopback port. Caddy handles its TLS certificate.

No main-app code changes are needed; the submodule verifies sessions by
calling `GET ${VTK_MAIN_URL}/api/auth/session` and receives the full
`SessionPayload` (user, groups, permissions) to make RBAC decisions locally.

---

## Locales

- Default locale is **NL** at `/…`.
- English lives under **`/en/…`** (same routes, `LocaleSwitcher` toggles prefix).

---

## Authentication flow (SSO)

- `apps/web` issues an opaque session cookie on `.vtk.be`.
- Any submodule reads the same cookie via `@vtk/auth/remote`, which calls
  `GET ${VTK_MAIN_URL}/api/auth/session` with the cookie forwarded.
- The main site returns the full `SessionPayload` (user, groups, permissions)
  so submodules can enforce RBAC without a direct DB connection.

---

## Theokot broodjes-reservatiesysteem

Post Theokot beheert de broodjesbar-reservaties onder `/admin/theokot` (rechten
`theokot.manage` / `theokot.pickup`); studenten reserveren op `/theokot`. De
niet-vanzelfsprekende werkingskeuzes staan in [`docs/design-decisions.md`](docs/design-decisions.md).

### No-show-mails (SMTP)

Niet-opgehaalde bestellingen worden 15 min na sluitingstijd automatisch verwerkt
(scheduler in `apps/web/instrumentation.ts`) en de student krijgt een
waarschuwingsmail via **nodemailer** (`apps/web/lib/mail.ts`).

**Zonder `SMTP_HOST` worden mails niet verstuurd maar enkel gelogd** naar de
serverconsole (`[mail] SMTP niet geconfigureerd …`). Zo werkt lokale ontwikkeling
zonder mailserver; voor productie zet je de SMTP-variabelen in de repo-root `.env`:

```dotenv
SMTP_HOST="smtp.example.com"   # verplicht om écht te versturen; leeg = enkel loggen
SMTP_PORT="587"                # 587 = STARTTLS (aanrader), 465 = impliciete TLS
SMTP_SECURE="false"            # "true" bij poort 465, "false" bij 587/25 (STARTTLS)
SMTP_USER="theokot@vtk.be"     # SMTP-login; laat leeg voor een server zonder auth
SMTP_PASS="<app- of mailboxwachtwoord>"
MAIL_FROM="Theokot VTK <theokot@vtk.be>"   # afzender in de mails
```

Uitleg per veld:

| Variabele     | Betekenis                                                                 |
|---------------|---------------------------------------------------------------------------|
| `SMTP_HOST`   | Hostname van de SMTP-server. **Leeg laten = mails worden enkel gelogd.**   |
| `SMTP_PORT`   | `587` (STARTTLS, standaard) of `465` (SSL/TLS). Default `587`.             |
| `SMTP_SECURE` | `"true"` ⇒ meteen TLS (poort 465). `"false"` ⇒ STARTTLS/plain (587/25).    |
| `SMTP_USER` / `SMTP_PASS` | Login. Bij Gmail/Microsoft 365: gebruik een **app-wachtwoord**, geen accountwachtwoord. Zonder `SMTP_USER` verbindt nodemailer zonder authenticatie. |
| `MAIL_FROM`   | Afzender, formaat `Naam <adres>`. Default `Theokot VTK <theokot@vtk.be>`.  |

In de Docker-stack lezen de containers dezelfde repo-root `.env` (zie de
productie-sectie hierboven); herstart `web` na een wijziging
(`docker compose … up -d --force-recreate web`).

**Testen zonder te wachten op de scheduler:** de no-show-verwerking is idempotent en
kan handmatig getriggerd worden. Plaats een testbestelling, zet de `pickupEnd` van die
sessie in het verleden en roep `processDueNoShows()` aan (bv. via een tijdelijke
route/script), of wacht op de interval van 5 min. Is SMTP niet gezet, dan verschijnt de
mailinhoud in de serverlog i.p.v. in een mailbox.

### Studentenkaart-scanner (KU Leuven idverification)

De afhaalbalie (`/admin/theokot/afhalen`) accepteert zowel een handmatig r-nummer als
een **kaartscan**. De scanner gedraagt zich als een toetsenbord: hij tikt
`serial;cardAppId` gevolgd door Enter in het invoerveld. De server
(`lib/kul-card.ts`, aangeroepen door `lookupPickupByCardAction`) wisselt dan
client-credentials in voor een token en roept de KU Leuven `idverification`-endpoint
aan; het teruggekregen r-nummer (`userName`) wordt gebruikt om de reservatie op te zoeken.

Configureer in `.env` (zie `.env.example`) — dit zijn **aparte** credentials van de
OIDC-login:

```dotenv
KUL_CARD_CLIENT_ID="<client id voor de idverification-API>"
KUL_CARD_CLIENT_SECRET="<client secret>"
# Optioneel, defaults zijn de KU Leuven-productie-endpoints:
KUL_CARD_AUTH_ENDPOINT="https://idp.kuleuven.be/auth/realms/kuleuven/protocol/openid-connect/token"
KUL_CARD_ID_ENDPOINT="https://account.kuleuven.be/api/v1/idverification"
```

Zonder `KUL_CARD_CLIENT_ID`/`KUL_CARD_CLIENT_SECRET` blijft het handmatige
r-nummerveld werken; de scan geeft dan een nette "niet geconfigureerd"-melding. Voor
een match moet het `User.rNumber` in de databank het r-nummer bevatten dat KU Leuven
teruggeeft (bv. `r0123456`).

---

## Troubleshooting

**`Environment variable not found: DATABASE_URL` on first request**
The `.env` symlinks in step 1 of setup are missing. Run:
```bash
ln -sf ../../.env apps/web/.env
ln -sf ../../.env apps/logistiek/.env
```

**`Can't reach database server at localhost:5432`**
Postgres is not reachable at the host URL in `DATABASE_URL`. Start Compose
Postgres **and** publish port `5432` if you use `localhost`, or point
`DATABASE_URL` at a running instance.

**`npm run db:seed` → `missing script: seed`**
Dependencies are not installed (`node_modules` missing). Run **`npm install`**
from the **monorepo root** (not only inside `apps/web`).

**Runaway memory / fan spinning when running `npm run dev`**
You probably switched the dev script back to plain `next dev` (Turbopack). See
the *Gotchas* section. Check with `pgrep -f postcss.js | wc -l` — if that is
more than a handful, Turbopack is leaking. Kill it and use `next dev --webpack`.

**Old sessions stuck after changing `SESSION_COOKIE_DOMAIN`**
Browsers cache the old cookie on the old domain scope. Clear cookies for
`.vtk.be` and `vtk.be` in your browser.

**Seed / admin user**
The seed **upserts** the admin by email and updates `passwordHash` when
`SEED_ADMIN_*` are set. If you intentionally remove those env vars, the seed
skips the admin block and logs “Skipping initial admin”.
