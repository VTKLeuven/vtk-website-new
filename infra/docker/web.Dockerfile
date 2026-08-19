# syntax=docker/dockerfile:1
# De `RUN --mount=type=cache` hieronder heeft de BuildKit-frontend nodig; die
# regel bovenaan pint ze expliciet in plaats van op de ingebouwde versie van de
# daemon te vertrouwen.
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages ./packages
COPY infra/docker/install-alpine-optional-natives.cjs infra/docker/install-alpine-optional-natives.cjs
# De npm-cache overleeft de build. Wijzigt er iets in packages/ (die hierboven
# volledig gekopieerd wordt), dan draait deze laag opnieuw, maar downloadt ze
# niets meer.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
  npm install --no-audit --no-fund \
  && node infra/docker/install-alpine-optional-natives.cjs

FROM node:${NODE_VERSION}-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages
COPY . .

RUN npx --yes prisma generate --schema packages/db/prisma/schema.prisma
# Turbopack schrijft haar buildcache naar .next/cache. Als cache mount
# overleeft die de build, dus een volgende deploy hercompileert enkel wat
# echt veranderd is. De mount zit niet in de laag, dus de runner-image
# krijgt de cache ook niet meer mee.
RUN --mount=type=cache,target=/repo/apps/web/.next/cache,sharing=locked \
  npm run build --workspace=@vtk/web

FROM node:${NODE_VERSION}-alpine AS runner
RUN apk add --no-cache libc6-compat openssl tini tzdata
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=Europe/Brussels

COPY --from=builder /repo/apps/web/.next ./apps/web/.next
COPY --from=builder /repo/apps/web/public ./apps/web/public
COPY --from=builder /repo/apps/web/next.config.ts ./apps/web/next.config.ts
# next.config.ts wordt bij ELKE start opnieuw getranspileerd (Next 16 doet dat
# los van de build, zie next/dist/build/next-config-ts/transpile-config.js). Dat
# gebeurt per bestand: relatieve imports worden geen bundel maar blijven een
# `require()` naar de bron. De config moet dus haar eigen imports naast zich
# hebben in de image, anders start de container niet ("Cannot find module
# './lib/...'"), en dat merk je pas op de server want tijdens het builden staat
# de volledige repo er nog wel. Zie test/nextConfigRuntimeDeps.test.ts.
COPY --from=builder /repo/apps/web/lib ./apps/web/lib
COPY --from=builder /repo/apps/web/package.json ./apps/web/package.json
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/node_modules ./node_modules

WORKDIR /app/apps/web
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
# next is hoisted to /app/node_modules; cwd must stay the app dir for .next.
# Migrations run on every start (safe, versioned). So does the config sync
# (packages/db/prisma/sync.ts): it only mirrors code-owned registries into the
# DB (permissions + the admin system role's grants), so a new permission is
# actually usable after a deploy. It creates no users, roles or groups.
# The seed does NOT run on every start: it only runs when RUN_SEED=true, so a
# redeploy never re-asserts seeded/admin-managed content (header tabs, pages,
# partners, ...) over edits made in /admin. For a fresh DB, run it once (README
# "First-time database init") or set RUN_SEED=true for a single start. Keep both
# scripts in a subshell: `cd /app` must not leak into `next start`, which needs
# cwd = /app/apps/web to find .next.
CMD ["/bin/sh", "-c", "npx prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma && (cd /app && npx tsx packages/db/prisma/sync.ts) && if [ \"$RUN_SEED\" = \"true\" ]; then (cd /app && npx tsx packages/db/prisma/seed.ts); else echo 'Skipping seed (set RUN_SEED=true to run it)'; fi && exec node /app/node_modules/next/dist/bin/next start -p 3000"]
