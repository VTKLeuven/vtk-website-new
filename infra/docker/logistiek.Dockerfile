# syntax=docker/dockerfile:1
# De `RUN --mount=type=cache` hieronder heeft de BuildKit-frontend nodig; die
# regel bovenaan pint ze expliciet in plaats van op de ingebouwde versie van de
# daemon te vertrouwen.
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/logistiek/package.json apps/logistiek/package.json
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

FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/packages ./packages
# De Prisma-client hangt enkel van het schema af, dus die genereren we vóór de
# broncode binnenkomt: zo blijft deze laag gecached zolang het schema niet
# wijzigt, in plaats van bij elke commit opnieuw te draaien. De client landt in
# node_modules, en node_modules zit niet in de buildcontext, dus de `COPY . .`
# hieronder overschrijft ze niet.
COPY packages/db/prisma ./packages/db/prisma
RUN npx --yes prisma generate --schema packages/db/prisma/schema.prisma
COPY . .
# Turbopack schrijft haar buildcache naar .next/cache. Als cache mount
# overleeft die de build, dus een volgende deploy hercompileert enkel wat
# echt veranderd is. De mount zit niet in de laag, dus de runner-image
# krijgt de cache ook niet meer mee.
RUN --mount=type=cache,target=/repo/apps/logistiek/.next/cache,sharing=locked \
  npm run build --workspace=@vtk/logistiek

FROM node:${NODE_VERSION}-alpine AS runner
RUN apk add --no-cache libc6-compat tini tzdata
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=Europe/Brussels
COPY --from=builder /repo/apps/logistiek/.next ./apps/logistiek/.next
COPY --from=builder /repo/apps/logistiek/public ./apps/logistiek/public
COPY --from=builder /repo/apps/logistiek/next.config.ts ./apps/logistiek/next.config.ts
COPY --from=builder /repo/apps/logistiek/package.json ./apps/logistiek/package.json
# De beheerscripts horen mee in de image, want ze worden op de server gedraaid en
# nergens anders: `group-events.ts` groepeert de bestaande historiek, `test-mail.ts`
# controleert de SMTP-config, `import-inventaris.ts` leest de Excel in. Zonder deze
# regel staat er in de docs een commando dat op de server niet bestaat.
#
# Draai ze met tsx en niet via `npm run`: die scripts zetten `dotenv -e ../../.env`
# ervoor voor lokaal gebruik, en dat bestand zit niet in de container (de omgeving
# komt van compose). Dus:
#   docker compose exec -w /app/apps/logistiek logistiek npx tsx scripts/test-mail.ts adres@vtk.be
COPY --from=builder /repo/apps/logistiek/scripts ./apps/logistiek/scripts
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/node_modules ./node_modules
WORKDIR /app/apps/logistiek
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/node_modules/next/dist/bin/next", "start", "-p", "3000"]
