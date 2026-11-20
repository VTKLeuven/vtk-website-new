# syntax=docker/dockerfile:1@sha256:4edf897a3ffa55b89f906fc8cc78afdb3f1834cc9c7083565e611a8a7d5fe99e
# De `RUN --mount=type=cache` hieronder heeft de BuildKit-frontend nodig; die
# regel bovenaan pint ze expliciet in plaats van op de ingebouwde versie van de
# daemon te vertrouwen.
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
# Enkel de manifesten van de workspaces, niet hun bronnen: npm heeft voor het
# oplossen van de workspace-graaf niets anders nodig. Kopieerden we hier heel
# packages/, dan draaide `npm install` opnieuw zodra er één regel in een van die
# packages veranderde, en dat is bij bijna elke deploy zo. Docker kan met een
# glob geen mapstructuur bewaren, vandaar de opsomming; een package toevoegen
# zonder deze lijst bij te werken faalt luid op een missende workspace.
COPY packages/auth/package.json packages/auth/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/gallery/package.json packages/gallery/package.json
COPY packages/i18n/package.json packages/i18n/package.json
COPY packages/mail/package.json packages/mail/package.json
COPY packages/payments/package.json packages/payments/package.json
COPY packages/storage/package.json packages/storage/package.json
COPY packages/tsconfig/package.json packages/tsconfig/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY infra/docker/install-alpine-optional-natives.cjs infra/docker/install-alpine-optional-natives.cjs
# De npm-cache overleeft de build. Wijzigt er een package.json of de lockfile,
# dan draait deze laag opnieuw, maar downloadt ze niets meer.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
  npm install --no-audit --no-fund \
  && node infra/docker/install-alpine-optional-natives.cjs

# De Prisma-client in een eigen stage, los van de build. Ze hangt enkel af van
# de dependencies en het schema, dus een commit die enkel code raakt, laat ze
# gecached. De runner neemt ze als eigen kleine laag over de vaste node_modules
# heen (zie onderaan): een schemawijziging exporteert dan 56 MB in plaats van
# heel node_modules.
FROM deps AS prisma
COPY packages/db/prisma ./packages/db/prisma
RUN npx --yes prisma generate --schema packages/db/prisma/schema.prisma

FROM node:${NODE_VERSION}-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
# Node neemt standaard een kwart van het geheugen van de machine als heap. Op
# liv (30 GB) is dat ruim 4 GB, op een laptop met een Docker-VM van 8 GB net 2,
# en dan valt `next build` in de TypeScript-stap om met "heap out of memory".
# Vast op 4 GB: wat liv altijd al kreeg, maar nu overal hetzelfde.
ENV NODE_OPTIONS=--max-old-space-size=4096
# Geen typecheck in `next build`: de job "Types and lint" doet die al, en een
# deploy schakelt pas om wanneer die groen is (zie .github/workflows). Hier
# kostte ze per app een halve tot een hele minuut op de server.
ENV VTK_SKIP_BUILD_TYPECHECK=1

COPY --from=prisma /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages
# De Prisma-client zit al in node_modules, uit de stage `prisma` hierboven.
# Enkel wat deze build leest, en niet `COPY . .`. Met heel de repo veranderde
# deze laag bij elke commit (een regel in docs/ volstond), en bouwde elke deploy
# alle drie de apps opnieuw. Nu is een app waaraan niets veranderde een
# volledige cache-hit: dezelfde image, dus `up -d` herstart die container niet
# eens. De website gebruikt elke package, dus packages/ gaat hier in zijn geheel
# mee; logistiek en fakbar sommen op wat ze importeren. De app zelf als laatste,
# want die verandert het vaakst. Zie test/dockerBuildInputs.test.ts.
COPY package.json ./
COPY packages ./packages
COPY apps/web ./apps/web
# Turbopack schrijft haar buildcache naar .next/cache. Als cache mount
# overleeft die de build, dus een volgende deploy hercompileert enkel wat
# echt veranderd is. De mount zit niet in de laag, dus de runner-image
# krijgt de cache ook niet meer mee.
# Een vaste sleutel houdt de ID's van de server actions gelijk over deploys
# heen; zie infra/deploy.sh. Pas hier en niet hoger, zodat de lagen erboven hun
# cache houden. Leeg: Next kiest zelf een sleutel, en elke action krijgt na de
# deploy een andere ID. Een build-arg en geen secret-mount, omdat Next de
# sleutel toch in .next/server zet en een secret niet meetelt voor de cache.
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=""
RUN --mount=type=cache,target=/repo/apps/web/.next/cache,sharing=locked \
  npm run build --workspace=@vtk/web

FROM node:${NODE_VERSION}-alpine AS runner
RUN apk add --no-cache libc6-compat openssl tini tzdata
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=Europe/Brussels
# node_modules eerst, en uit `deps` en niet uit `builder`: die laag verandert
# enkel met de lockfile. Stond ze na .next, dan maakte elke codewijziging ze
# opnieuw aan, en exporteerde elke deploy per app heel node_modules (50 tot 90
# seconden "exporting layers"). De Prisma-client komt erbovenop als eigen laag.
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=prisma /repo/node_modules/.prisma ./node_modules/.prisma
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
# partners, ...) over edits made in /admin. For a fresh dev DB, run it once
# (README "First-time database init") or set RUN_SEED=true for a single start.
# On production the seed always refuses (packages/db/src/productionGuard.ts);
# that refusal must not keep the site down, hence the `|| echo`. Keep both
# scripts in a subshell: `cd /app` must not leak into `next start`, which needs
# cwd = /app/apps/web to find .next.
CMD ["/bin/sh", "-c", "npx prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma && (cd /app && npx tsx packages/db/prisma/sync.ts) && if [ \"$RUN_SEED\" = \"true\" ]; then (cd /app && npx tsx packages/db/prisma/seed.ts) || echo 'Seed failed or refused (see above); starting anyway'; else echo 'Skipping seed (set RUN_SEED=true to run it)'; fi && exec node /app/node_modules/next/dist/bin/next start -p 3000"]
