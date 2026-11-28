# syntax=docker/dockerfile:1@sha256:572cebbc2b15e6f84c077742952674889cb63cd5e9b80abdffcbe587b6f19183
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/fakbar/package.json apps/fakbar/package.json
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
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
# Vaste heap voor `next build`, net zoals in web.Dockerfile (zie de uitleg daar).
ENV NODE_OPTIONS=--max-old-space-size=4096
# Geen typecheck in `next build`: de job "Types and lint" doet die al, en een
# deploy schakelt pas om wanneer die groen is (zie .github/workflows). Hier
# kostte ze per app een halve tot een hele minuut op de server.
ENV VTK_SKIP_BUILD_TYPECHECK=1
COPY --from=prisma /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages
# De Prisma-client zit al in node_modules, uit de stage `prisma` hierboven.
# Enkel wat deze build leest, en niet `COPY . .`: zo bouwt een deploy deze app
# niet opnieuw wanneer er enkel iets aan de website of in docs/ veranderde (zie
# web.Dockerfile). De packages die fakbar importeert, rechtstreeks of via een
# andere package; een import die hier ontbreekt, laat de build luid falen, en
# test/dockerBuildInputs.test.ts (in apps/web) vangt dat al voor de push.
COPY package.json ./
COPY packages/auth ./packages/auth
COPY packages/db ./packages/db
COPY packages/gallery ./packages/gallery
COPY packages/mail ./packages/mail
COPY packages/tsconfig ./packages/tsconfig
COPY packages/ui ./packages/ui
COPY apps/fakbar ./apps/fakbar
# Vaste sleutel voor de ID's van de server actions; zie web.Dockerfile en
# infra/deploy.sh.
ARG NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=""
RUN --mount=type=cache,target=/repo/apps/fakbar/.next/cache,sharing=locked \
  npm run build --workspace=@vtk/fakbar

FROM node:${NODE_VERSION}-alpine AS runner
RUN apk add --no-cache libc6-compat tini tzdata
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
COPY --from=builder /repo/apps/fakbar/.next ./apps/fakbar/.next
COPY --from=builder /repo/apps/fakbar/public ./apps/fakbar/public
COPY --from=builder /repo/apps/fakbar/next.config.ts ./apps/fakbar/next.config.ts
COPY --from=builder /repo/apps/fakbar/package.json ./apps/fakbar/package.json
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/package.json ./package.json
WORKDIR /app/apps/fakbar
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/node_modules/next/dist/bin/next", "start", "-p", "3000"]
