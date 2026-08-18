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
COPY packages ./packages
COPY infra/docker/install-alpine-optional-natives.cjs infra/docker/install-alpine-optional-natives.cjs
# De npm-cache overleeft de build. Wijzigt er iets in packages/ (die hierboven
# volledig gekopieerd wordt), dan draait deze laag opnieuw, maar downloadt ze
# niets meer.
RUN --mount=type=cache,target=/root/.npm,sharing=locked \
  npm install --no-audit --no-fund \
  && node infra/docker/install-alpine-optional-natives.cjs

FROM node:${NODE_VERSION}-alpine AS builder
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
