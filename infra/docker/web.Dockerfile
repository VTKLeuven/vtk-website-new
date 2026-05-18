ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY packages ./packages
COPY infra/docker/install-alpine-optional-natives.cjs infra/docker/install-alpine-optional-natives.cjs
RUN npm install --no-audit --no-fund \
  && node infra/docker/install-alpine-optional-natives.cjs

FROM node:${NODE_VERSION}-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /repo/node_modules ./node_modules
COPY . .

RUN npx --yes prisma generate --schema packages/db/prisma/schema.prisma
RUN npm run build --workspace=@vtk/web

FROM node:${NODE_VERSION}-alpine AS runner
RUN apk add --no-cache libc6-compat openssl tini
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /repo/apps/web/.next ./apps/web/.next
COPY --from=builder /repo/apps/web/public ./apps/web/public
COPY --from=builder /repo/apps/web/next.config.ts ./apps/web/next.config.ts
COPY --from=builder /repo/apps/web/package.json ./apps/web/package.json
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/node_modules ./node_modules

WORKDIR /app/apps/web
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
# next is hoisted to /app/node_modules; cwd must stay the app dir for .next
CMD ["/bin/sh", "-c", "npx prisma migrate deploy --schema=/app/packages/db/prisma/schema.prisma && (cd /app && npx tsx packages/db/prisma/seed.ts) && exec node /app/node_modules/next/dist/bin/next start -p 3000"]
