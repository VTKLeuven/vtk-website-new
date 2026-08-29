# syntax=docker/dockerfile:1
ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/fakbar/package.json apps/fakbar/package.json
COPY packages ./packages
COPY infra/docker/install-alpine-optional-natives.cjs infra/docker/install-alpine-optional-natives.cjs
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
RUN --mount=type=cache,target=/repo/apps/fakbar/.next/cache,sharing=locked \
  npm run build --workspace=@vtk/fakbar

FROM node:${NODE_VERSION}-alpine AS runner
RUN apk add --no-cache libc6-compat tini tzdata
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV TZ=Europe/Brussels
COPY --from=builder /repo/apps/fakbar/.next ./apps/fakbar/.next
COPY --from=builder /repo/apps/fakbar/public ./apps/fakbar/public
COPY --from=builder /repo/apps/fakbar/next.config.ts ./apps/fakbar/next.config.ts
COPY --from=builder /repo/apps/fakbar/package.json ./apps/fakbar/package.json
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/node_modules ./node_modules
WORKDIR /app/apps/fakbar
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "/app/node_modules/next/dist/bin/next", "start", "-p", "3000"]
