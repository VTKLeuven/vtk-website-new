ARG NODE_VERSION=20
FROM node:${NODE_VERSION}-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /repo
COPY package.json package-lock.json* ./
COPY apps/logistiek/package.json apps/logistiek/package.json
COPY packages ./packages
RUN npm install --no-audit --no-fund \
  && LIGHTNINGCSS_VERSION="$(node -e "const fs=require('fs'); console.log(JSON.parse(fs.readFileSync('node_modules/lightningcss/package.json','utf8')).version)")" \
  && ARCH="$(uname -m)" \
  && if [ "$ARCH" = "x86_64" ]; then \
       npm install --no-save "lightningcss-linux-x64-musl@${LIGHTNINGCSS_VERSION}"; \
     elif [ "$ARCH" = "aarch64" ]; then \
       npm install --no-save "lightningcss-linux-arm64-musl@${LIGHTNINGCSS_VERSION}"; \
     else \
       echo "Unsupported arch for Alpine lightningcss: $ARCH" >&2; exit 1; \
     fi

FROM node:${NODE_VERSION}-alpine AS builder
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /repo/node_modules ./node_modules
COPY . .
RUN npm run build --workspace=@vtk/logistiek

FROM node:${NODE_VERSION}-alpine AS runner
RUN apk add --no-cache libc6-compat tini
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=builder /repo/apps/logistiek/.next ./apps/logistiek/.next
COPY --from=builder /repo/apps/logistiek/public ./apps/logistiek/public
COPY --from=builder /repo/apps/logistiek/next.config.ts ./apps/logistiek/next.config.ts
COPY --from=builder /repo/apps/logistiek/package.json ./apps/logistiek/package.json
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/package.json ./package.json
COPY --from=builder /repo/node_modules ./node_modules
WORKDIR /app/apps/logistiek
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
