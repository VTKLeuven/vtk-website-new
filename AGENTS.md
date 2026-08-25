<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# De mobiele app staat in `mobile/`

De VTK-app (Expo, iOS + Android) zit in deze repo maar **buiten de workspaces**:
alles onder `apps/*` en `packages/*` wordt automatisch een npm-workspace, en de
dependencies van React Native samenvoegen met die van de website zou de lockfile
van de hele repo opnieuw laten oplossen. Dat is hier een bekende val (zie
"Never hand-edit deps" verderop).

De app heeft dus zijn eigen `node_modules` en zijn eigen lockfile. `npm install`
in de wortel raakt hem niet aan; gebruik `npm run app:install`, `npm run app` en
`npm run app:check`. De handleiding staat in **`docs/app-ontwikkelen.md`**.

# Local setup: `make up && make db && make dev`

The root `Makefile` is a thin layer over the npm scripts; `make help` lists
everything. The npm scripts stay the source of truth (CI runs those), so never
put logic in a make target that exists only through `make`.

- **The local database lives in `infra/compose.dev.yml`**, not in
  `infra/docker-compose.yml`. That second file is the **deploy stack**: it builds
  the web and logistiek images and starts Immich, Umami and five workers. Bring
  it up on your laptop and you get two Postgres containers on the same data
  volume; that is one data directory with two postmasters, with everything that
  follows from it. Locally, run only `make up`.
- Postgres listens on **127.0.0.1:5433**, deliberately not on every interface:
  otherwise a database with password `vtk` is open to the whole wifi network.
- **MinIO runs alongside it** on 9000 (console on 9001), because without object
  storage every `/api/media/...` is a 404 and every upload field in the admin
  fails, so no photo anywhere on the site can be tried out locally. The `S3_*`
  block in `.env.example` points at it; those credentials are not secrets.
  `make db` finishes with `npm run db:images`, which uploads placeholder partner
  logos generated from `fixtures/partners.json`.

# Seed: content comes from fixtures, not from constants

`packages/db/prisma/fixtures/*.json` holds the editorial content of the dev site
(navigation, CMS pages, calendar categories, POCs, partners, some homepage
settings). `prisma/seed.ts` uses them; if they are missing it falls back to the constants in
`packages/db/src/groups.ts`.

That split exists because the seed is **create-only**: a reseed must not
overwrite work done in the admin. As a result the constants drift away from the
real site from their first use onwards. That once cost half an evening chasing a
"bug" in the site header that only existed locally: local had eleven tabs, the
site had nine, and the navigation therefore ran over the search button.

- Updating is done by someone with access to the dev database:
  `FIXTURES_SOURCE_DATABASE_URL="postgresql://..." make fixtures`, and they
  commit the result.
- **Never `pg_dump` for fixtures.** This rule is about what lands in the
  repository; a real backup is the other story and dumps everything on purpose
  (`make backup`, into a gitignored `backups/`). That database carries member
  data, orders, payments, door logs and mailing lists, `Setting` holds
  `s3.config`, `sentry.config`, `door.config` and `brevo.lists`, and
  `OauthClient.clientSecret` is stored in plaintext. `scripts/export-fixtures.ts` therefore exports per table, from a
  fixed list and with a per-key allowlist for settings.
- If you add a table to that export, two rules hold without exception: no
  personal data, and key on the natural key (`code`, `slug`) instead of the
  `cuid`, or the fixtures can only be imported into an empty database.
- **A storage key never travels into the fixtures.** Production keys are random
  (`logos/<hash>.png`) and point at a bucket a laptop cannot read, so they would
  all 404. The header tab photo is dropped entirely; the partner logo is rewritten
  to a deterministic `partners/seed/<slug>.svg` that `npm run db:images` fills
  with a placeholder.

# Dev server: do NOT use Turbopack

`apps/web` and `apps/logistiek` both run `next dev --webpack` in their `dev`
script. This is intentional. Next.js 16 + Turbopack + Tailwind v4's PostCSS
plugin has a severe memory leak where every CSS recompile spawns a fresh
`.next/dev/build/postcss.js` child process that is never reaped. In this
monorepo that quickly balloons to hundreds of workers and tens of GB of
memory (see https://github.com/vercel/next.js/discussions/77102).

- Do NOT change the dev script back to plain `next dev`.
- If you need to experiment with Turbopack, use the explicit
  `npm run dev:turbopack -w @vtk/web` script and watch
  `pgrep -f postcss.js | wc -l` — if that number keeps growing, kill it.
- `next build` uses Turbopack and is fine (single-shot, no leak).

# Workspace root is pinned

Both `next.config.ts` files set `turbopack.root` and `outputFileTracingRoot`
to the monorepo root. Do not remove these. Without them Next.js walks
upwards to find a lockfile and can latch onto a stray `package-lock.json`
in the user's home directory, then try to scan things like OrbStack
container mounts (which contain symlink cycles).

# Tailwind v4 source scanning is explicit

`apps/*/app/globals.css` uses `@import "tailwindcss" source(none);` plus
explicit `@source` directives. Do not switch back to auto-detection: the
oxide scanner follows symlinks and was walking `~/OrbStack/**`.

# Never hand-edit deps; regenerate the lockfile

npm drops other platforms' native binaries from `package-lock.json` on an
incremental `npm install` (npm/cli#4828). The lockfile keeps working on the
machine that wrote it, so this ships unnoticed: `npm ci` on Linux (the server
and CI) or macOS then installs a binding package with no `.node` file in it,
and the failure only surfaces at build/dev time as a cryptic "cannot find
native binding". It has bitten us twice: `@rolldown/binding-*` (fixed in
691f554) and `lightningcss-*` (fixed after `cee7046` shipped it broken again).

- After changing dependencies, do NOT commit an incrementally-updated lockfile.
  Regenerate it: `rm -rf node_modules package-lock.json && npm install`.
  A clean resolve pulls in every platform's optional deps.
- `npm run verify:lockfile` (`scripts/check-lockfile-platforms.mjs`) asserts
  that every declared platform binding has a lockfile entry. CI runs it before
  `npm ci`, so a pruned lockfile fails the PR instead of the deploy.
- Symptom on Windows: every page 500s in dev with a lightningcss error.
  Installing just the one missing binary (`npm install --no-save
  lightningcss-win32-x64-msvc`) unblocks your machine but leaves the lockfile
  broken for Linux and macOS. Fix the lockfile instead.

# Prisma client must not be re-exported from @vtk/db

`packages/db/src/index.ts` exports `prisma` only. Do NOT re-export from
`@prisma/client` (not even as types). The generated `index.d.ts` is
~28k lines and pulling it through the bundler is pathologically slow.
Import Prisma model types directly from `@prisma/client` at the call site
if you need them.

# `npm run verify` draait automatisch voor elke push

`.githooks/pre-push` draait `npm run verify` (lockfile-check, `next typegen` +
`tsc --noEmit`, eslint en de unit tests van `@vtk/web`). Dat zijn dezelfde
checks als de `verify`-job in `.github/workflows/deploy.yml`, minus wat een
database, een browser of een volledige build nodig heeft. Een mislukte verify op
main blokkeert de deploy, dus je wil dat lokaal weten en niet uit de pipeline.

- De hook installeert zichzelf: het `prepare`-script zet bij `npm install`
  `core.hooksPath` op `.githooks`. Na een verse clone volstaat `npm install`.
  Handmatig kan ook: `git config core.hooksPath .githooks`.
- Overslaan doe je met `git push --no-verify` of `SKIP_VERIFY=1 git push`.
  Enkel doen als je zeker weet dat de checks elders al groen stonden.
- Voeg je een check toe aan de CI-job, voeg ze dan ook toe aan `npm run verify`
  wanneer ze zonder database en zonder build kan draaien.
