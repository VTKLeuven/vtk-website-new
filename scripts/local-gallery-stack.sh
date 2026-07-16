#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.yml"
IMMICH_ENV="$ROOT_DIR/infra/immich/.env"
WEB_MODE="docker"
START_IMMICH="true"
CHECK_ONLY="false"
RUN_INSTALL="true"
DOCKER_RUNNING="false"

usage() {
  cat <<'EOF'
Usage: scripts/local-gallery-stack.sh [options]

Options:
  --docker-web    Start the production-like web container on :3011 (default)
  --dev           Start dependencies, then run the Next.js development server
  --no-web        Start/check dependencies only
  --skip-immich   Do not start the Immich services
  --no-install    Do not install missing Node dependencies
  --check         Validate and report status without starting services
  -h, --help      Show this help
EOF
}

log() { printf '\n==> %s\n' "$1"; }
ok() { printf '  OK  %s\n' "$1"; }
warn() { printf '  !!  %s\n' "$1"; }
fail() { printf 'Error: %s\n' "$1" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --docker-web) WEB_MODE="docker" ;;
    --dev) WEB_MODE="dev" ;;
    --no-web) WEB_MODE="none" ;;
    --skip-immich) START_IMMICH="false" ;;
    --no-install) RUN_INSTALL="false" ;;
    --check) CHECK_ONLY="true" ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
  shift
done

cd "$ROOT_DIR"

for command in docker node npm; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

if docker info >/dev/null 2>&1; then
  DOCKER_RUNNING="true"
else
  [[ "$CHECK_ONLY" == "true" ]] && warn "Docker is not running" || fail "Docker is not running"
fi

log "Environment"
if [[ ! -f .env ]]; then
  if [[ "$CHECK_ONLY" == "true" ]]; then
    warn ".env is missing; copy .env.example to .env"
  else
    cp .env.example .env
    ok "created .env from .env.example"
  fi
else
  ok ".env exists"
fi

if [[ "$START_IMMICH" == "true" && ! -f "$IMMICH_ENV" ]]; then
  if [[ "$CHECK_ONLY" == "true" ]]; then
    warn "infra/immich/.env is missing; copy infra/immich/.env.example and replace its passwords"
  else
    cp infra/immich/.env.example "$IMMICH_ENV"
    warn "created infra/immich/.env; replace its example passwords before non-local use"
  fi
else
  [[ "$START_IMMICH" == "false" ]] || ok "infra/immich/.env exists"
fi

for app in apps/web apps/logistiek; do
  if [[ -L "$app/.env" ]]; then
    ok "$app/.env symlink exists"
  elif [[ "$CHECK_ONLY" == "true" ]]; then
    warn "$app/.env symlink is missing"
  else
    ln -sfn ../../.env "$app/.env"
    ok "linked $app/.env"
  fi
done

if [[ ! -d node_modules ]]; then
  if [[ "$CHECK_ONLY" == "true" || "$RUN_INSTALL" == "false" ]]; then
    warn "node_modules is missing"
  else
    npm install
  fi
fi

log "Compose"
docker compose -f "$COMPOSE_FILE" config --quiet
ok "Compose configuration is valid"

if [[ "$CHECK_ONLY" == "true" ]]; then
  docker compose -f "$COMPOSE_FILE" config --services | sed 's/^/      service: /'
  if [[ "$DOCKER_RUNNING" == "true" ]]; then
    docker compose -f "$COMPOSE_FILE" ps
  else
    warn "skipping container status because Docker is not running"
  fi
  exit 0
fi

services=(postgres)
if [[ "$START_IMMICH" == "true" ]]; then
  services+=(immich-server immich-machine-learning immich-public-proxy)
fi
docker compose -f "$COMPOSE_FILE" up -d "${services[@]}"

if [[ "$START_IMMICH" == "true" && -x infra/immich/scripts/seed-immich.sh ]]; then
  if command -v jq >/dev/null 2>&1; then
    infra/immich/scripts/seed-immich.sh
  else
    warn "jq is missing; skipping optional Immich sample-data seed"
  fi
fi

case "$WEB_MODE" in
  none) ;;
  docker)
    docker compose -f "$COMPOSE_FILE" up -d --build web
    ;;
  dev)
    npm run db:generate
    npm run db:push
    npm run db:seed
    exec npm run dev
    ;;
esac

log "Ready"
[[ "$WEB_MODE" == "docker" ]] && printf '  Website: http://127.0.0.1:3011/media\n'
[[ "$START_IMMICH" == "true" ]] && printf '  Immich:  http://127.0.0.1:2283\n  Proxy:   http://127.0.0.1:3014/share/healthcheck\n'
