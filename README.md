# VTK Website

Modular site for **Vlaamse Technische Kring (VTK)**: an npm **workspaces** monorepo
with **Next.js 16** (React 19), **Prisma** + PostgreSQL, **MinIO** (S3), and
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
  storage/     MinIO/S3 client, sharp image pipeline, ZIP streaming
  ui/          Shared UI primitives
  tsconfig/    Shared base tsconfig
infra/
  docker-compose.yml  Postgres, MinIO, web, logistiek, Nginx, Certbot
  docker/             Dockerfiles for apps
  nginx/conf.d/       Subdomain routing + TLS termination
```

## Requirements

- Node.js 20+
- npm 10+
- Docker 24+ (for Postgres, MinIO, and the production stack)

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
ln -sf ../../.env apps/web/.env
ln -sf ../../.env apps/logistiek/.env

# Start local infrastructure (Postgres, MinIO, and the bucket-creation one-shot)
docker compose -f infra/docker-compose.yml up -d postgres minio minio-setup
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
- MinIO console: `http://localhost:9001` (default login `minioadmin` / `minioadmin` from `.env.example`)
- Postgres: only on `localhost:5432` if you publish that port or use a local instance; defaults in `.env.example` assume `vtk` / `vtk`

To run the `logistiek` submodule against the same main app:

```bash
npm run dev --workspace=@vtk/logistiek   # listens on :3100
```

### 3. Daily workflow

```bash
# If Docker services aren't already running:
docker compose -f infra/docker-compose.yml up -d postgres minio minio-setup

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

### 6. Stopping / resetting local infra

```bash
# Stop but keep data
docker compose -f infra/docker-compose.yml stop

# Stop and wipe Postgres + MinIO volumes (destructive)
docker compose -f infra/docker-compose.yml down -v
```

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

The full stack — Postgres, MinIO, the main app, the submodule, Nginx, and
Certbot — is defined in `infra/docker-compose.yml`.

### 1. DNS

Point the following records at the server:

- `vtk.be`, `www.vtk.be` → main site
- `logistiek.vtk.be`     → logistiek submodule
- `cdn.vtk.be`           → public MinIO bucket

Add one record per future submodule (`<name>.vtk.be`).

### 2. Environment

On the server:

```bash
cp .env.example .env
```

Fill in at minimum (same **repo-root** `.env` Compose uses for variable substitution **and** for the `web` service via `env_file`):

```dotenv
POSTGRES_USER=vtk
POSTGRES_PASSWORD=<strong password>
POSTGRES_DB=vtk
DATABASE_URL=postgresql://vtk:<strong password>@postgres:5432/vtk?schema=public

SESSION_COOKIE_DOMAIN=.vtk.be
VTK_MAIN_URL=https://vtk.be

S3_ACCESS_KEY=<minio access key>
S3_SECRET_KEY=<minio secret key>
S3_BUCKET=vtk
S3_PUBLIC_URL=https://cdn.vtk.be

# Loaded into the web container for `npx tsx packages/db/prisma/seed.ts`
SEED_ADMIN_EMAIL=admin@vtk.be
SEED_ADMIN_PASSWORD=<strong password>
```

The `web` service sets `env_file: ../.env` so seeding inside the container sees
`SEED_ADMIN_*`. **`DATABASE_URL` and S3-related keys in the Compose `environment`
block override** values from `.env` so the app always targets the in-stack
Postgres and MinIO. After changing `.env`, recreate `web` so the container picks
up edits: `docker compose -f infra/docker-compose.yml up -d --force-recreate web`.

### 3. TLS certificates (first time)

The bundled `certbot` container does *renewal*; you have to mint the initial
certificates. The easiest way is a one-off standalone run before Nginx is up:

```bash
# Stop anything on :80
docker compose -f infra/docker-compose.yml stop nginx || true

docker run --rm -it \
  -p 80:80 \
  -v "$PWD/infra/nginx/letsencrypt:/etc/letsencrypt" \
  -v "$PWD/infra/nginx/www:/var/www/certbot" \
  certbot/certbot certonly --standalone \
  -d vtk.be -d www.vtk.be -d logistiek.vtk.be -d cdn.vtk.be \
  --email <ops@vtk.be> --agree-tos --no-eff-email
```

Certificates land in `infra/nginx/letsencrypt/live/<domain>/`. The paths in
`infra/nginx/conf.d/vtk.conf` already expect them there.

### 4. Launch the stack

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

This brings up:

| Service        | Role                                                   |
|----------------|--------------------------------------------------------|
| `postgres`     | PostgreSQL 16, data in the `postgres-data` volume      |
| `minio`        | S3-compatible object storage, data in `minio-data`     |
| `minio-setup`  | One-shot: creates the public `vtk` bucket              |
| `web`          | Main Next.js app on **127.0.0.1:3011** → container :3000 |
| `logistiek`    | Submodule app on **127.0.0.1:3100** → container :3000  |
| `nginx`        | TLS termination + subdomain routing on :80/:443        |
| `certbot`      | Background renew loop (every 12h)                      |

During image **build**, the `web` Dockerfile runs `prisma generate` and
`next build`. At **container start**, the default command runs
`prisma migrate deploy` (applies migrations under `packages/db/prisma/migrations`)
then `packages/db/prisma/seed.ts`, and then starts Next.js. The seed is
idempotent, so redeploys refresh prototype content safely.

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
versioned migrations. For a **greenfield** DB, starting `web` once now already
runs both `migrate deploy` and the seed via the container CMD; the explicit
`exec` commands above are safe and idempotent if you want to rerun them.

The seed is idempotent — groups, header tabs, permissions, partners, calendar
placeholder rows, prototype users, POCs, CMS pages, albums, homepage defaults,
etc. With **`SEED_ADMIN_EMAIL`** and
**`SEED_ADMIN_PASSWORD`** in repo-root `.env`, the seed upserts a superadmin and
refreshes their password hash on repeat runs. **Recreate `web`** after changing
those variables (`docker compose … up -d --force-recreate web`). The seed logs
`Seeding initial admin...` when both are set; **“Skipping initial admin”**
means they are missing inside the container (see env_file / recreate above).

### 6. Updates / redeploys

```bash
git pull
docker compose -f infra/docker-compose.yml up -d --build web logistiek
```

The rebuilt `web` container runs migrations and the idempotent seed on startup.

### 7. Backups

- **Postgres:** `docker compose exec postgres pg_dump -U vtk vtk > backup-$(date +%F).sql`
- **MinIO bucket:** back up the `minio-data` volume, or mirror the `vtk`
  bucket with `mc mirror local/vtk ./backup-vtk/`.

### 8. Logs and diagnostics

```bash
docker compose -f infra/docker-compose.yml logs -f web
docker compose -f infra/docker-compose.yml logs -f nginx
docker compose -f infra/docker-compose.yml ps
```

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
6. Add a `server` block to `infra/nginx/conf.d/vtk.conf` for `<name>.vtk.be`
   that proxies to the new container.
7. Add `<name>.vtk.be` to the Certbot `certonly` domain list (step 3 above).

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
