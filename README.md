# VTK Website

Modular digital platform for **Vlaamse Technische Kring (VTK)**: an npm **workspaces** monorepo featuring **Next.js 16** (React 19), **Prisma** with PostgreSQL 16, Hetzner S3 object storage, an integrated **Immich** photo gallery, an **Expo / React Native** mobile application, an integrated **OAuth2 / OpenID Connect Authorization Server**, and shared-session authentication across subdomains (`*.vtk.be`). The public website follows the design system in `design/` and `apps/web/app/design/`.

## Layout

```text
apps/
  web/         Main site (vtk.be): public CMS, calendar, ticketing, forms, media, member portal, admin, API
  logistiek/   Logistics application (logistiek.vtk.be): equipment rental, transport, 't Flesserke, Collect&Go
mobile/        Mobile application for iOS and Android (Expo and React Native)
packages/
  db/          Prisma schema, PostgreSQL client, migrations, seeds, permission registry
  auth/        Better-auth, Argon2 hashing, sessions, RBAC helpers, OAuth2/OIDC SSO provider
  i18n/        NL/EN dictionaries and localization helpers
  mail/        Shared transactional email delivery helper via nodemailer with STARTTLS
  payments/    Mollie and mock payment gateway abstractions
  storage/     Hetzner S3 client, Sharp image pipeline, and ZIP streaming
  ui/          Shared UI primitives and design components
  tsconfig/    Shared TypeScript configuration presets
infra/
  docker-compose.yml  Production stack: Postgres, web, logistiek, 9 background workers, Immich, Vaultwarden, Umami
  docker/             Multi-stage Alpine Dockerfiles
  immich/             Immich configuration, storage data, and seed manifests
  door/               Raspberry Pi door controller agent (Python, GPIO, Tailscale)
scripts/              CLI scripts for administration, exports, and data imports
docs/                 In-depth architectural, permission, and domain documentation
```

## Requirements

- Node.js 20+
- npm 10+
- Docker 24+ with Docker Compose (for PostgreSQL, Immich, workers, and production)

---

## Development

### 1. First-time setup

```bash
# Clone and install dependencies
git clone https://github.com/VTKLeuven/vtk-website-new.git
cd vtk-website-new
npm install

# Configure environment
cp .env.example .env

# Link root .env into each Next.js app for worker process compatibility
ln -sf ../../.env apps/web/.env
ln -sf ../../.env apps/logistiek/.env

# Start local PostgreSQL
docker compose -f infra/docker-compose.yml up -d postgres
```

On Windows, create copies instead of symlinks:

```powershell
Copy-Item .env apps/web/.env
Copy-Item .env apps/logistiek/.env
```

**Postgres host networking:** the default Compose configuration does not publish port 5432 to host loopback to prevent clashing with local databases. Either add a `ports: ["127.0.0.1:5432:5432"]` mapping in `infra/docker-compose.yml` or use `infra/compose.dev.yml` via `make up`.

```bash
# Generate Prisma client, apply schema, seed baseline data
npm run db:generate
npm run db:push          # quick local iteration; use db:migrate for versioned migration files
npm run db:seed          # seeds baseline groups, permissions, roles, and prototype accounts
```

To create or promote an admin account directly at any time:

```bash
npm run db:admin
```

### 2. Running the web applications

```bash
# Main website (listens on http://localhost:3000)
npm run dev

# Logistics application in a second terminal (listens on http://localhost:3100)
npm run dev --workspace=@vtk/logistiek
```

Both dev scripts run `next dev --webpack` to avoid PostCSS child process leaks in watch mode.

### 3. Running the mobile app (optional)

```bash
# Install mobile dependencies and start Expo Router
npm run app:install
npm run app
```

Press `i` for iOS Simulator, `a` for Android Emulator, or scan the terminal QR code using Expo Go.

### 4. Verification and checks

Run the complete verification suite before opening a pull request:

```bash
npm run verify
```

This runs:
1. `npm run verify:lockfile`: checks multi-platform native package declarations;
2. `npm run verify:types`: runs Prisma generation, Next.js type generation, and TypeScript checks across all workspaces;
3. `npm run lint`: runs ESLint;
4. `npm run test --workspace=@vtk/web` and `npm run test --workspace=@vtk/logistiek`: runs unit and integration test suites.

To check the mobile app:

```bash
npm run app:check
```

### 5. Useful commands

| Command | Description |
| --- | --- |
| `npm run dev` | Main web application dev server (`next dev --webpack` on :3000) |
| `npm run dev --workspace=@vtk/logistiek` | Logistics dev server on :3100 |
| `npm run app` | Start Expo mobile app |
| `npm run app:check` | Run mobile TypeScript, lint, and route checks |
| `npm run verify` | Full repository verification (lockfile, types, lint, tests) |
| `npm run build` | Production build for database and web workspaces |
| `npm run db:generate` | Regenerate Prisma client |
| `npm run db:push` | Synchronize local database directly without a migration |
| `npm run db:migrate` | Create and apply a new versioned migration |
| `npm run db:seed` | Idempotent database seed script |
| `npm run db:admin` | Create or promote a local superadmin account |
| `npm run fixtures:export` | Export test database fixtures |
| `npm run probe:elixir` | Test Munisense sound meter connection and bar status |

---

## Core features

### Integrated ticketing

The main app includes event-scoped ticket sales, Mollie hosted checkout (Bancontact, card, iDEAL), customizable ticket designs, live PDF previews, Apple/Google Wallet digital passes with geofencing, refunds, offline camera ticket scanning (`/scan/<eventId>`), and a durable transactional email outbox.

- **Local Mock Payment**: set `TICKETING_PAYMENT_PROVIDER="mock"` in `.env` for instant checkout completion without contacting external gateways.
- **Mollie Payments**: set `TICKETING_PAYMENT_PROVIDER="mollie"` with `MOLLIE_API_KEY`. Mollie webhooks are received at `/api/tickets/mollie/webhook` and authoritative payment state is always re-queried using the API key.
- **Durable Email Outbox**: ticket confirmation emails are inserted in the same transaction as ticket issuance. `ticket-worker` calls `POST /api/tickets/maintenance` every 15 seconds to release expired reservations, reconcile payments/refunds, and deliver outbox emails via SMTP.

### Custom forms module

The forms module (`/formulieren` and `/admin/formulieren`) provides a custom form builder supporting:

- 16 field types (text, choices, rating scale, file uploads, legal consent, profile autofill);
- Immutable field codes (`fieldCode`) ensuring historical exports never lose column alignment;
- Multi-step section branching and dynamic conditional field display logic;
- Choice option capacity quotas and automated waitlists;
- Response reviews, reviewer notes, status updates (`NEW`, `ACCEPTED`, `REJECTED`), and CSV/PDF/ZIP exports;
- `forms-worker` running every 60 seconds to dispatch outbox confirmation emails and daily summary digests.

### Single Sign-On (SSO) provider

VTK acts as an OpenID Connect Authorization Server built on `@better-auth/oauth-provider` in `@vtk/auth`:

- External applications (such as Cursusdienst at `cudi.vtk.be` and Vaultwarden at `wachtwoorden.vtk.be`) authenticate members with their VTK accounts via `/oauth2/authorize` and `/oauth2/token`.
- Client access modes: `OPEN` (any active member) vs `RESTRICTED` (enforces client permissions like `vault.access`).
- Scoped identity claims with explicit user consent (`/inloggen/consent`).
- Self-service connected app management under `/account/verbonden-apps`.

### Logistics and lending v2

The logistics application (`apps/logistiek` on `logistiek.vtk.be`) manages equipment rental, event packages, transport bookings, 't Flesserke beverage distribution, and grocery logistics:

- Rich material catalog with category drill-down, item alternatives, specifications, and package sets;
- Vehicle and van reservation requests with driver assignments and hourly rates;
- Driver register managed directly by the logistics team;
- 't Flesserke beverage crate and bottle deposit tracking;
- `collectengo-worker` polling IMAP every 5 minutes to import Colruyt Collect&Go grocery orders;
- `logistiek-worker` running every 60 seconds to reconcile payments and expire abandoned checkouts.

### Member tools and shifts

- **Shifts (`/shift`)**: volunteer signups, instructions, leaderboards, and sandwich vouchers (shiftersbonnen);
- **Theokot Sandwiches (`/theokot`)**: weekly sessions, sandwich ordering, voucher redemption, card/r-number pickup counter, and automated no-show handling;
- **Castle Piano Room (`/piano`)**: member practice slot bookings;
- **Committee Meetings (`/grocomeet`, `/bureau`)**: meal orders for working group meetings;
- **Classroom Visits (`/lesbezoeken`)**: lecture visit scheduling for student representatives with automated teacher emails;
- **Physical Door Access**: Raspberry Pi door agent, student card verification via KU Leuven API, and Apple Shortcut Bearer tokens (`DoorShortcutToken`) generated on `/account`.

### Media and storage

- **Hetzner S3 (`@vtk/storage`)**: handles profile photos, CMS attachments, magazines, and form uploads.
- **Immich Public Gallery**: public albums marked with `[gallery]` are rendered on `/media` via Immich Public Proxy (`photos.vtk.be`).
- **Face Search**: biometric face recognition within albums. Disabled by default (`GALLERY_FACE_SEARCH_ENABLED="false"`) until formal organizational approval and consent procedures are complete.

---

## Technical gotchas and constraints

### 1. Webpack development server

Both web apps run `next dev --webpack`. Next.js 16 with Turbopack and Tailwind v4 PostCSS in development watch mode can spawn unreaped child processes that consume excessive memory. Production builds single-shot with Turbopack and are unaffected.

### 2. Pinned workspace roots

Both `next.config.ts` files set `turbopack.root` and `outputFileTracingRoot` to the monorepo root to prevent parent directory traversal.

### 3. Explicit Tailwind v4 source boundaries

Each application's `globals.css` specifies `@import "tailwindcss" source(none);` with explicit `@source` patterns to prevent recursive directory scanning.

### 4. Prisma client import rule

`packages/db/src/index.ts` exports only the singleton `prisma` instance. Always import Prisma model types directly from `@prisma/client`.

### 5. Multi-platform lockfile safety

npm can prune optional native binaries during incremental installs. After updating dependencies, always regenerate the lockfile cleanly:

```bash
rm -rf node_modules package-lock.json
npm install
npm run verify:lockfile
```

---

## Production deployment (Docker)

Production runs on self-hosted Docker Compose with Caddy on the host as the public TLS edge.

### Public port bindings

| Hostname | Target Service | Loopback Port |
| --- | --- | --- |
| `vtk.be`, `www.vtk.be` | `web` | `127.0.0.1:3011` |
| `logistiek.vtk.be` | `logistiek` | `127.0.0.1:3100` |
| `photos.vtk.be` | `immich-public-proxy` | `127.0.0.1:3014` |
| `immich.vtk.be` | `immich-server` | `127.0.0.1:2283` |
| `wachtwoorden.vtk.be` | `vaultwarden` | `127.0.0.1:3015` |
| `umami.vtk.be` | `umami` (profile) | `127.0.0.1:3016` |

### Services and background workers

- `postgres`: PostgreSQL 16 main database.
- `web`: central Next.js web application.
- `logistiek`: logistics and lending application.
- `ticket-worker` (15s): ticket reservations, payments, refunds, and outbox mail.
- `logistiek-worker` (60s): lending payments reconciliation and checkout expiry.
- `collectengo-worker` (300s): Colruyt Collect&Go IMAP email intake.
- `forms-worker` (60s): form confirmation emails and daily digests.
- `elixir-worker` (180s): Munisense sound meter polling for 't ElixIr bar status.
- `shift-worker` (300s): automated shift reminder emails and push alerts.
- `app-push-worker` (300s): automated mobile push notifications.
- `vault-worker` (300s): Vaultwarden post membership synchronization.
- `google-worker` (300s): Google Workspace group address synchronization.
- `immich-server`, `immich-machine-learning`, `immich-redis`, `immich-database`, `immich-public-proxy`: photo management.
- `vaultwarden`: Bitwarden-compatible password vault.
- `umami-db-init`, `umami`: self-hosted visitor analytics (profile `umami`).

### Launching production

```bash
docker compose -f infra/docker-compose.yml up -d --build --remove-orphans
```

The web container runs `prisma migrate deploy` on startup before launching Next.js. The database seed runs only when `RUN_SEED=true`.

### Backups

- **Main PostgreSQL**:
  ```bash
  docker compose -f infra/docker-compose.yml exec -T postgres \
    pg_dump -U vtk vtk > backup-main-$(date +%F).sql
  ```
- **Immich PostgreSQL**:
  ```bash
  docker compose -f infra/docker-compose.yml exec -T immich-database \
    pg_dump -U immich immich > backup-immich-$(date +%F).sql
  ```
- **Immich Media**: filesystem snapshots on the 12 TB storage server (`/mnt/immich`).
- **S3 Objects**: versioning and offsite bucket replication.

---

## Documentation

For full guides and operational instructions, visit the developer wiki in `vtk-website-new.wiki` or consult focused documents under `docs/`:

- [docs/forms.md](docs/forms.md): Custom forms module architecture.
- [docs/app-api.md](docs/app-api.md): Versioned mobile app API contract.
- [docs/sso.md](docs/sso.md): OpenID Connect Authorization Server.
- [docs/ticketing.md](docs/ticketing.md): Integrated ticketing and outbox queue.
- [docs/uitleendienst.md](docs/uitleendienst.md): Logistics and equipment rental.
- [docs/permissions.md](docs/permissions.md): Capabilities and role hierarchy.
- [docs/google-workspace.md](docs/google-workspace.md): Google Workspace group sync.
- [docs/wachtwoorden.md](docs/wachtwoorden.md): Vaultwarden password vault integration.
- [docs/door-apple-shortcut.md](docs/door-apple-shortcut.md): Door access Apple Shortcut.
- [docs/elixir-barstatus.md](docs/elixir-barstatus.md): Munisense 't ElixIr bar status integration.
- [docs/immich-gallery.md](docs/immich-gallery.md): Immich public gallery.
