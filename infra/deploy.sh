#!/usr/bin/env bash
# Dit script draait OP de server, niet op de runner. Beide deploy-workflows
# pipen het naar `ssh <host> bash -s -- <sha> <nfs-modus>`, zodat de
# deploylogica in git staat in plaats van als quoted string in twee workflows.
# Dat liep al uiteen: dev had de NFS-controle in een `if` en prod niet, en een
# aanpassing aan de ene werd niet in de andere gedaan.
set -euo pipefail

SHA="${1:?geef de commit-sha mee}"
# `required` = weiger te deployen zonder NFS (prod), `auto` = enkel controleren
# wanneer .env effectief naar /mnt/immich wijst (dev).
NFS_MODE="${2:-auto}"

REPO_DIR="${REPO_DIR:-/home/it/vtk-website-new}"
# Het compose-project heet "infra", afgeleid van de map van het compose-bestand.
# Blijf dus naar de repo `cd`en en het bestand als `-f infra/...` meegeven: een
# andere projectnaam maakt elke bestaande container en elk volume in één keer wees.
COMPOSE=(docker compose -f infra/docker-compose.yml)
# De drie services met een `build:`-sectie; de rest zijn kant-en-klare images.
BUILD_SERVICES=(web logistiek fakbar)

# De buildcache mag groeien, maar niet ongelimiteerd. Dit is de bovengrens.
CACHE_KEEP="${CACHE_KEEP:-20GB}"
# Zakt de vrije ruimte hieronder, dan ruimen we wél agressief op: een volle
# schijf breekt de volgende deploy volledig, een koude cache maakt ze enkel traag.
MIN_FREE_BYTES="${MIN_FREE_BYTES:-$((15 * 1024 * 1024 * 1024))}"
# De web-container draait bij het starten haar migraties, dus geef ze tijd.
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-300}"

log() { printf '\n=== %s ===\n' "$*"; }

cd "$REPO_DIR"

log "Repo op $SHA zetten"
# `--all` haalde elke remote en elke tag op; we hebben enkel origin nodig.
git fetch --no-tags --prune origin
git reset --hard "$SHA"
git --no-pager log -1 --oneline

if [ "$NFS_MODE" = required ] || grep -qE '^IMMICH_MEDIA_LOCATION=.*/mnt/immich' .env 2>/dev/null; then
  log "NFS-opslag controleren"
  # De stat triggert de automount; de findmnt weigert te deployen tegen de
  # lokale fallbackmap wanneer het 12 TB NFS-volume er niet is.
  timeout 30 stat /mnt/immich/.immich-storage-ready >/dev/null
  findmnt -rn -M /mnt/immich -t nfs4 >/dev/null
fi

log "Compose-bestand valideren"
"${COMPOSE[@]}" config --quiet

# Bouwen terwijl de huidige containers verkeer blijven serveren.
#
# Niet via één `docker compose build`: compose bouwt in depends_on-volgorde, en
# omdat logistiek en fakbar van web afhangen, wachtten die twee ~6 minuten op
# een image dat niets met hun eigen build te maken heeft. Drie losse builds
# naast elkaar praten met dezelfde daemon, dus ze delen layercache en
# cachemounts, maar ze wachten niet op elkaar. (Met buildx geïnstalleerd zou
# compose dit zelf via bake doen; dat plugin staat er niet, vandaar deze lus.)
log "Images bouwen (${BUILD_SERVICES[*]} parallel)"
build_jobs=()
for svc in "${BUILD_SERVICES[@]}"; do
  "${COMPOSE[@]}" build "$svc" >"/tmp/vtk-build-$svc.log" 2>&1 &
  build_jobs+=("$!:$svc")
done

build_failed=()
for job in "${build_jobs[@]}"; do
  if wait "${job%%:*}"; then
    echo "build ${job##*:}: ok"
  else
    echo "build ${job##*:}: MISLUKT"
    build_failed+=("${job##*:}")
  fi
done

for svc in "${BUILD_SERVICES[@]}"; do
  log "buildlog $svc"
  # Bij een fout wil je het hele log; bij succes volstaat het staartje met de
  # timings en de export van het image.
  if [ ${#build_failed[@]} -gt 0 ]; then cat "/tmp/vtk-build-$svc.log"; else tail -n 25 "/tmp/vtk-build-$svc.log"; fi
done

if [ ${#build_failed[@]} -gt 0 ]; then
  echo "::error::Build mislukt voor: ${build_failed[*]}"
  exit 1
fi

# Eenmalige migratie van het oude IPv4-only default network. Expliciet doen
# voorkomt dat Compose een container hergebruikt die nog naar het verwijderde
# network-ID verwijst. Named volumes overleven dit.
if docker network inspect infra_default --format '{{.EnableIPv6}}' 2>/dev/null | grep -qx false; then
  log "IPv4-only network migreren"
  "${COMPOSE[@]}" down --remove-orphans
fi

log "Containers omschakelen"
"${COMPOSE[@]}" up -d --remove-orphans

# `up -d` zegt enkel dat de containers gestart zijn, niet dat ze antwoorden.
# Zonder deze poort was een crashloop een groene deploy.
wait_until_up() {
  local svc="$1" addr code deadline=$((SECONDS + HEALTH_TIMEOUT))
  addr="$("${COMPOSE[@]}" port "$svc" 3000 2>/dev/null || true)"
  if [ -z "$addr" ]; then
    echo "$svc: geen gepubliceerde poort, controle overgeslagen"
    return 0
  fi
  while :; do
    if [ "$(docker inspect -f '{{.State.Status}}' "$("${COMPOSE[@]}" ps -q "$svc")" 2>/dev/null)" = exited ]; then
      echo "::error::$svc is gestopt na het starten"
      break
    fi
    # Alles onder 500 is goed nieuws: de root redirect naar /nl, dus een 3xx
    # betekent dat Next draait.
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://$addr/" || true)"
    # Een geweigerde verbinding geeft code 000, dus de ondergrens hoort erbij.
    if [ -n "$code" ] && [ "$code" -ge 100 ] && [ "$code" -lt 500 ]; then
      echo "$svc: http $code op $addr na ${SECONDS}s"
      return 0
    fi
    if [ "$SECONDS" -ge "$deadline" ]; then
      echo "::error::$svc antwoordt niet binnen ${HEALTH_TIMEOUT}s (laatste code: ${code:-geen})"
      break
    fi
    sleep 3
  done
  "${COMPOSE[@]}" ps
  "${COMPOSE[@]}" logs --tail 80 "$svc" || true
  return 1
}

log "Wachten tot de apps antwoorden"
for svc in "${BUILD_SERVICES[@]}"; do
  wait_until_up "$svc"
done

# Opruimen na de switch. Bewust NIET `docker system prune -a` + `builder prune -a`:
# dat gooide ook de npm-cache, de Turbopack-cache in .next/cache, de basisimages
# en alle layercache weg, precies de dingen waar de Dockerfiles op gebouwd zijn.
# Elke deploy begon daardoor van nul (~10 min). Dangling images zijn de vorige
# versies van web/logistiek/fakbar; die mogen weg. Zonder --volumes, zodat
# database- en applicatiedata blijft staan.
log "Opruimen"
docker container prune -f || true
docker image prune -f || true
docker builder prune -f --keep-storage "$CACHE_KEEP" || true

avail="$(df --output=avail -B1 "$REPO_DIR" | tail -1)"
if [ "$avail" -lt "$MIN_FREE_BYTES" ]; then
  log "Nog maar $((avail / 1024 / 1024 / 1024)) GB vrij: agressief opruimen"
  docker image prune -a -f --filter until=24h || true
  docker builder prune -a -f || true
fi

docker system df
log "Deploy klaar"
