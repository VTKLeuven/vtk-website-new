#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VTK_COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.yml"
DEFAULT_IMMICH_COMPOSE_FILE="$ROOT_DIR/infra/immich/docker-compose.yml"
IMMICH_COMPOSE_FILE="${IMMICH_COMPOSE_FILE:-}"
WEB_MODE="docker"
START_IMMICH="true"
CHECK_ONLY="false"
RUN_INSTALL="true"
DOCKER_RUNNING="false"

usage() {
  cat <<'EOF'
Usage:
  scripts/local-gallery-stack.sh [options]

Options:
  --docker-web              Start the production-like web container on :3011 (default)
  --dev                     Start local infrastructure and then run `npm run dev`
  --no-web                  Start/check dependencies only
  --skip-immich             Do not start an Immich compose stack
  --immich-compose <file>   Compose file for an external Immich stack
  --no-install              Do not run npm install when node_modules is missing
  --check                   Only report what is configured; do not start services
  -h, --help                Show this help

Environment:
  IMMICH_COMPOSE_FILE       Same as --immich-compose
EOF
}

log() {
  printf '\n==> %s\n' "$1"
}

ok() {
  printf '  OK  %s\n' "$1"
}

warn() {
  printf '  !!  %s\n' "$1"
}

fail() {
  printf 'Error: %s\n' "$1" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --docker-web)
      WEB_MODE="docker"
      shift
      ;;
    --dev)
      WEB_MODE="dev"
      shift
      ;;
    --no-web)
      WEB_MODE="none"
      shift
      ;;
    --skip-immich)
      START_IMMICH="false"
      shift
      ;;
    --immich-compose)
      [[ $# -ge 2 ]] || fail "--immich-compose requires a file path"
      IMMICH_COMPOSE_FILE="$2"
      shift 2
      ;;
    --no-install)
      RUN_INSTALL="false"
      shift
      ;;
    --check)
      CHECK_ONLY="true"
      shift
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown option: $1"
      ;;
  esac
done

cd "$ROOT_DIR"

has_command() {
  command -v "$1" >/dev/null 2>&1
}

require_command() {
  if has_command "$1"; then
    ok "$1 is installed"
  else
    fail "$1 is required"
  fi
}

file_env_value() {
  local file="$1"
  local key="$2"
  [[ -f "$file" ]] || return 0
  awk -F '=' -v key="$key" '
    $1 == key {
      value = substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]]+|[[:space:]]+$/, "", value)
      gsub(/^"|"$/, "", value)
      gsub(/^'\''|'\''$/, "", value)
      print value
    }
  ' "$file" | tail -n 1
}

env_value() {
  file_env_value "$ROOT_DIR/.env" "$1"
}

set_env_value() {
  local file="$1"
  local key="$2"
  local value="$3"
  local tmp_file

  tmp_file="$(mktemp)"
  if [[ -f "$file" ]]; then
    awk -v key="$key" -v value="$value" '
      BEGIN { written = 0 }
      $0 ~ "^" key "=" {
        print key "=" value
        written = 1
        next
      }
      { print }
      END {
        if (!written) print key "=" value
      }
    ' "$file" > "$tmp_file"
  else
    printf '%s=%s\n' "$key" "$value" > "$tmp_file"
  fi

  mv "$tmp_file" "$file"
}

immich_env_file() {
  local compose_file="$1"
  printf '%s/.env\n' "$(cd "$(dirname "$compose_file")" && pwd)"
}

docker_compose_immich() {
  local compose_file="$1"
  shift
  local env_file
  env_file="$(immich_env_file "$compose_file")"

  if [[ -f "$env_file" ]]; then
    docker compose --env-file "$env_file" -f "$compose_file" "$@"
  else
    docker compose -f "$compose_file" "$@"
  fi
}

compose_services() {
  local compose_file="$1"
  docker_compose_immich "$compose_file" config --services 2>/dev/null || true
}

compose_has_service() {
  local compose_file="$1"
  local service="$2"
  compose_services "$compose_file" | grep -qx "$service"
}

resolve_immich_compose_file() {
  if [[ -n "$IMMICH_COMPOSE_FILE" ]]; then
    printf '%s\n' "$IMMICH_COMPOSE_FILE"
    return
  fi

  if [[ -f "$DEFAULT_IMMICH_COMPOSE_FILE" ]]; then
    printf '%s\n' "$DEFAULT_IMMICH_COMPOSE_FILE"
    return
  fi

  local sibling_compose="$ROOT_DIR/../docker-compose.yml"
  if [[ -f "$sibling_compose" ]] && grep -q "immich-server" "$sibling_compose"; then
    printf '%s\n' "$sibling_compose"
  fi
}

is_default_immich_compose_file() {
  local compose_file="$1"
  [[ "$compose_file" == "$DEFAULT_IMMICH_COMPOSE_FILE" ]]
}

ensure_immich_env_file() {
  [[ "$START_IMMICH" == "true" ]] || return 0

  local compose_file env_file env_example
  compose_file="$(resolve_immich_compose_file)"
  [[ -n "$compose_file" && -f "$compose_file" ]] || return 0
  is_default_immich_compose_file "$compose_file" || return 0

  env_file="$(immich_env_file "$compose_file")"
  env_example="$(dirname "$compose_file")/.env.example"

  log "Immich environment"
  if [[ -f "$env_file" ]]; then
    ok "infra/immich/.env exists"
  elif [[ "$CHECK_ONLY" == "true" ]]; then
    warn "infra/immich/.env is missing; copy infra/immich/.env.example to infra/immich/.env"
  else
    cp "$env_example" "$env_file"
    ok "created infra/immich/.env from infra/immich/.env.example"
  fi
}

apply_integrated_gallery_env_defaults() {
  [[ "$CHECK_ONLY" == "false" ]] || return 0

  local compose_file immich_env proxy_url db_name db_user db_password
  compose_file="$(resolve_immich_compose_file)"
  [[ -n "$compose_file" && -f "$compose_file" ]] || return 0
  is_default_immich_compose_file "$compose_file" || return 0

  immich_env="$(immich_env_file "$compose_file")"
  [[ -f "$immich_env" && -f "$ROOT_DIR/.env" ]] || return 0

  proxy_url="$(file_env_value "$immich_env" PUBLIC_PROXY_URL)"
  db_name="$(file_env_value "$immich_env" DB_DATABASE_NAME)"
  db_user="$(file_env_value "$immich_env" DB_USERNAME)"
  db_password="$(file_env_value "$immich_env" DB_PASSWORD)"

  set_env_value "$ROOT_DIR/.env" GALLERY_PUBLIC_PROXY_URL "${proxy_url:-http://localhost:3001}"
  set_env_value "$ROOT_DIR/.env" GALLERY_DATABASE_PORT "5432"
  set_env_value "$ROOT_DIR/.env" GALLERY_DATABASE_NAME "${db_name:-immich}"
  set_env_value "$ROOT_DIR/.env" GALLERY_DATABASE_USER "${db_user:-postgres}"
  set_env_value "$ROOT_DIR/.env" GALLERY_DATABASE_PASSWORD "${db_password:-ImmichPortfolio123}"

  if [[ "$WEB_MODE" == "docker" ]]; then
    set_env_value "$ROOT_DIR/.env" GALLERY_IMMICH_API_URL "http://immich-server:2283/api"
    set_env_value "$ROOT_DIR/.env" GALLERY_DATABASE_HOST "database"
  fi
}

ensure_env_file() {
  log "Environment"

  if [[ -f "$ROOT_DIR/.env" ]]; then
    ok ".env exists"
  elif [[ "$CHECK_ONLY" == "true" ]]; then
    warn ".env is missing; copy .env.example to .env"
  else
    cp "$ROOT_DIR/.env.example" "$ROOT_DIR/.env"
    ok "created .env from .env.example"
  fi

  apply_integrated_gallery_env_defaults

  if [[ -f "$ROOT_DIR/.env" ]]; then
    local api_key api_url proxy_url db_host
    api_key="$(env_value GALLERY_IMMICH_API_KEY)"
    api_url="$(env_value GALLERY_IMMICH_API_URL)"
    proxy_url="$(env_value GALLERY_PUBLIC_PROXY_URL)"
    db_host="$(env_value GALLERY_DATABASE_HOST)"

    [[ -n "$api_key" ]] && ok "GALLERY_IMMICH_API_KEY is set" || warn "GALLERY_IMMICH_API_KEY is empty"
    [[ -n "$api_url" ]] && ok "GALLERY_IMMICH_API_URL is set" || warn "GALLERY_IMMICH_API_URL is empty"
    [[ -n "$proxy_url" ]] && ok "GALLERY_PUBLIC_PROXY_URL is set" || warn "GALLERY_PUBLIC_PROXY_URL is empty"

    if [[ "$WEB_MODE" == "docker" ]]; then
      if [[ "$api_url" == *"localhost"* || "$api_url" == *"127.0.0.1"* ]]; then
        warn "Docker web cannot reach Immich via localhost; use an Immich container hostname or host.docker.internal"
      fi
      if [[ -z "$db_host" || "$db_host" == "localhost" || "$db_host" == "127.0.0.1" ]]; then
        warn "Docker web needs GALLERY_DATABASE_HOST to point to the Immich database container/host for face search"
      fi
    fi
  fi
}

ensure_env_links() {
  log "Next.js env links"

  for app in apps/web apps/logistiek; do
    local env_path="$ROOT_DIR/$app/.env"
    if [[ -L "$env_path" ]]; then
      ok "$app/.env symlink exists"
    elif [[ "$CHECK_ONLY" == "true" ]]; then
      warn "$app/.env symlink is missing"
    else
      ln -sfn ../../.env "$env_path"
      ok "linked $app/.env"
    fi
  done
}

ensure_node_modules() {
  log "Node dependencies"

  if [[ -d "$ROOT_DIR/node_modules" ]]; then
    ok "node_modules exists"
    return
  fi

  if [[ "$CHECK_ONLY" == "true" ]]; then
    warn "node_modules is missing; run npm install"
    return
  fi

  if [[ "$RUN_INSTALL" == "true" ]]; then
    npm install
    ok "npm dependencies installed"
  else
    warn "node_modules is missing and --no-install was used"
  fi
}

start_immich_stack() {
  [[ "$START_IMMICH" == "true" ]] || return 0

  log "Immich stack"

  local compose_file
  compose_file="$(resolve_immich_compose_file)"
  if [[ -z "$compose_file" ]]; then
    warn "No Immich compose file found; set IMMICH_COMPOSE_FILE or pass --immich-compose"
    return
  fi

  if [[ ! -f "$compose_file" ]]; then
    warn "Immich compose file does not exist: $compose_file"
    return
  fi

  ok "using Immich compose file: $compose_file"
  if [[ "$CHECK_ONLY" == "true" ]]; then
    compose_services "$compose_file" | sed 's/^/      service: /'
    return
  fi

  cleanup_stale_immich_postgres_pid "$compose_file"

  local services=()
  compose_has_service "$compose_file" immich-server && services+=(immich-server)
  compose_has_service "$compose_file" immich-machine-learning && services+=(immich-machine-learning)
  compose_has_service "$compose_file" immich-public-proxy && services+=(immich-public-proxy)

  if [[ ${#services[@]} -eq 0 ]]; then
    warn "No standard Immich services found; starting the full Immich compose stack"
    docker_compose_immich "$compose_file" up -d
  else
    docker_compose_immich "$compose_file" up -d "${services[@]}"
  fi

  seed_integrated_immich "$compose_file"
}

cleanup_stale_immich_postgres_pid() {
  local compose_file="$1"
  is_default_immich_compose_file "$compose_file" || return 0

  local database_container pid_file
  database_container="$(docker_compose_immich "$compose_file" ps -q database 2>/dev/null | head -n 1 || true)"
  [[ -z "$database_container" ]] || return 0

  pid_file="$(dirname "$compose_file")/data/postgres/postmaster.pid"
  if [[ -f "$pid_file" ]]; then
    rm -f "$pid_file"
    warn "removed stale Immich Postgres pid file"
  fi
}

seed_integrated_immich() {
  local compose_file="$1"
  is_default_immich_compose_file "$compose_file" || return 0

  local seed_script
  seed_script="$(dirname "$compose_file")/scripts/seed-immich.sh"
  [[ -x "$seed_script" ]] || return 0

  if has_command jq; then
    "$seed_script"
  else
    warn "jq is missing; skipping Immich seed check"
  fi
}

start_vtk_infra() {
  log "VTK infrastructure"

  [[ -f "$VTK_COMPOSE_FILE" ]] || fail "Missing $VTK_COMPOSE_FILE"
  if [[ "$CHECK_ONLY" == "true" && "$DOCKER_RUNNING" != "true" ]]; then
    warn "Docker is not running; skipping VTK compose status"
    return
  fi
  if [[ "$CHECK_ONLY" == "true" ]]; then
    docker compose -f "$VTK_COMPOSE_FILE" ps
    return
  fi

  docker compose -f "$VTK_COMPOSE_FILE" up -d postgres minio minio-setup
}

connect_web_to_immich_network() {
  [[ "$START_IMMICH" == "true" ]] || return 0
  [[ "$WEB_MODE" == "docker" ]] || return 0

  local compose_file
  compose_file="$(resolve_immich_compose_file)"
  [[ -n "$compose_file" && -f "$compose_file" ]] || return 0
  compose_has_service "$compose_file" immich-server || return 0

  local immich_container web_container network
  immich_container="$(docker_compose_immich "$compose_file" ps -q immich-server 2>/dev/null | head -n 1 || true)"
  web_container="$(docker compose -f "$VTK_COMPOSE_FILE" ps -q web 2>/dev/null | head -n 1 || true)"
  [[ -n "$immich_container" && -n "$web_container" ]] || return 0

  network="$(docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$immich_container" | head -n 1)"
  [[ -n "$network" ]] || return 0

  if docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$web_container" | grep -qx "$network"; then
    ok "web container is already connected to Immich network $network"
  else
    docker network connect "$network" "$web_container"
    ok "connected web container to Immich network $network"
  fi
}

start_web() {
  log "Website"

  case "$WEB_MODE" in
    none)
      ok "web startup skipped"
      ;;
    docker)
      if [[ "$CHECK_ONLY" == "true" && "$DOCKER_RUNNING" != "true" ]]; then
        warn "Docker is not running; skipping web container status"
        return
      fi
      if [[ "$CHECK_ONLY" == "true" ]]; then
        docker compose -f "$VTK_COMPOSE_FILE" ps web
      else
        docker compose -f "$VTK_COMPOSE_FILE" up -d --build web
        connect_web_to_immich_network
      fi
      ;;
    dev)
      if [[ "$CHECK_ONLY" == "true" ]]; then
        ok "dev server would run with npm run dev"
      else
        npm run db:generate
        if npm run db:push; then
          npm run db:seed
        else
          warn "database schema setup failed; check DATABASE_URL or use --docker-web"
        fi
        log "Starting Next.js dev server"
        exec npm run dev
      fi
      ;;
    *)
      fail "Invalid web mode: $WEB_MODE"
      ;;
  esac
}

print_summary() {
  [[ "$CHECK_ONLY" == "true" || "$WEB_MODE" == "dev" ]] && return

  log "Ready"
  if [[ "$WEB_MODE" == "docker" ]]; then
    printf '  Website: http://127.0.0.1:3011/media\n'
  fi
  printf '  Immich:  http://localhost:2283\n'
  printf '  Proxy:   http://localhost:3001/share/healthcheck\n'
}

log "Prerequisites"
require_command docker
require_command node
require_command npm

if docker info >/dev/null 2>&1; then
  DOCKER_RUNNING="true"
  ok "Docker daemon is running"
elif [[ "$CHECK_ONLY" == "true" ]]; then
  warn "Docker is not running"
else
  fail "Docker is not running"
fi

ensure_immich_env_file
ensure_env_file
ensure_env_links
ensure_node_modules
start_immich_stack
start_vtk_infra
start_web
print_summary
