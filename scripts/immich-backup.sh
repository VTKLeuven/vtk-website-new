#!/usr/bin/env bash
#
# Off-site backup of Immich media and database dumps to Google Drive via rclone.
#
# Runs on the cloud server (liv) where the NFS share (/mnt/immich) and the
# Immich Docker containers are present.
#
# What this does:
#   1. Verifies that the NFS storage server (leen) is mounted and ready.
#   2. Verifies or generates a fresh PostgreSQL database dump.
#   3. Keeps a local mirror of the database dump on liv's SSD (defense in depth).
#   4. Syncs original media (upload, library, profile) to Google Drive.
#      - Excludes thumbs/ and encoded-video/ (regenerable cache, saves huge quota).
#      - Moves deleted or modified files to deleted_or_modified/<date>/ (versioning).
#   5. Uploads the database dumps and configuration files to Google Drive.
#   6. Optionally pings an Uptime Kuma / healthcheck heartbeat URL upon success.
#
# Usage:
#   scripts/immich-backup.sh            # Normal incremental run
#   scripts/immich-backup.sh --dry-run  # Dry-run test (no changes on remote)
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Configuration (can be overridden via environment)
IMMICH_DIR="${IMMICH_DIR:-/mnt/immich}"
RCLONE_REMOTE="${RCLONE_REMOTE:-drive vtk:Archive/immich}"
LOCAL_DB_BACKUP_DIR="${LOCAL_DB_BACKUP_DIR:-$ROOT_DIR/backups/immich}"
LOCAL_KEEP_DAYS="${LOCAL_KEEP_DAYS:-14}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT_DIR/infra/docker-compose.yml}"
HEARTBEAT_URL="${IMMICH_BACKUP_HEARTBEAT_URL:-}"

DRY_RUN=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h|--help)
      echo "Usage: $0 [--dry-run]"
      echo "Backs up Immich media, database dumps, and config to $RCLONE_REMOTE"
      exit 0
      ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
  esac
done

log() {
  printf '[%s] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

# ---------------------------------------------------------------------------
# 1. Verify requirements and mounts
# ---------------------------------------------------------------------------
command -v rclone >/dev/null 2>&1 || die "rclone is not installed or not in PATH."

log "Starting Immich backup $( $DRY_RUN && echo '[DRY-RUN]' || true )"
log "Source media directory: $IMMICH_DIR"
log "Target remote: $RCLONE_REMOTE"

# Never run against an unmounted or stale mount; that could wipe the remote sync!
[ -d "$IMMICH_DIR" ] || die "Directory $IMMICH_DIR does not exist."
if [ ! -f "$IMMICH_DIR/.immich-storage-ready" ]; then
  die "Marker file $IMMICH_DIR/.immich-storage-ready is missing. NFS share may be unmounted or storage server offline."
fi

# ---------------------------------------------------------------------------
# 2. Verify database dumps and maintain local SSD copy
# ---------------------------------------------------------------------------
BACKUP_SOURCE_DIR="$IMMICH_DIR/backups"
mkdir -p "$BACKUP_SOURCE_DIR"
mkdir -p "$LOCAL_DB_BACKUP_DIR"

LATEST_DUMP="$(find "$BACKUP_SOURCE_DIR" -maxdepth 1 -type f -name '*.sql.gz' | sort -r | head -n 1 || true)"

# If no dump found or latest dump is older than 26 hours, trigger an immediate pg_dump
NEED_MANUAL_DUMP=false
if [ -z "$LATEST_DUMP" ]; then
  log "No existing database dump found in $BACKUP_SOURCE_DIR. A manual dump is required."
  NEED_MANUAL_DUMP=true
else
  # Check age of latest dump in seconds
  DUMP_MTIME="$(stat -c %Y "$LATEST_DUMP" 2>/dev/null || stat -f %m "$LATEST_DUMP" 2>/dev/null || echo 0)"
  NOW="$(date +%s)"
  AGE_HOURS=$(( (NOW - DUMP_MTIME) / 3600 ))
  if [ "$AGE_HOURS" -ge 26 ]; then
    log "Latest dump $(basename "$LATEST_DUMP") is $AGE_HOURS hours old. Triggering fresh database dump."
    NEED_MANUAL_DUMP=true
  else
    log "Using recent database dump: $(basename "$LATEST_DUMP") ($AGE_HOURS hours old)"
  fi
fi

if [ "$NEED_MANUAL_DUMP" = true ]; then
  NEW_DUMP="$BACKUP_SOURCE_DIR/immich-manual-backup-$(date +%Y%m%dT%H%M%S).sql.gz"
  if [ "$DRY_RUN" = true ]; then
    log "[DRY-RUN] Would create database dump at $NEW_DUMP"
    LATEST_DUMP="$NEW_DUMP"
  else
    log "Dumping Immich database from infra-immich-database-1..."
    docker exec infra-immich-database-1 pg_dump -U immich --clean --if-exists immich | gzip -9 > "$NEW_DUMP"
    chmod 644 "$NEW_DUMP"
    LATEST_DUMP="$NEW_DUMP"
    log "Database dump created: $(basename "$LATEST_DUMP") ($(du -h "$LATEST_DUMP" | cut -f1))"
  fi
fi

# Mirror latest dump to local SSD for fast recovery
if [ -f "$LATEST_DUMP" ] && [ "$DRY_RUN" = false ]; then
  cp -u "$LATEST_DUMP" "$LOCAL_DB_BACKUP_DIR/" 2>/dev/null || cp "$LATEST_DUMP" "$LOCAL_DB_BACKUP_DIR/"
  # Prune local dumps older than LOCAL_KEEP_DAYS
  find "$LOCAL_DB_BACKUP_DIR" -type f -name '*.sql.gz' -mtime "+$LOCAL_KEEP_DAYS" -delete 2>/dev/null || true
fi

# ---------------------------------------------------------------------------
# 3. Synchronize media to Google Drive with Versioning
# ---------------------------------------------------------------------------
TODAY="$(date +%Y-%m-%d)"
if [ "$DRY_RUN" = true ]; then
  EXTRA_RCLONE_FLAGS=(--dry-run -v)
else
  EXTRA_RCLONE_FLAGS=(--stats=1m --stats-one-line)
fi

# Common rclone options for Google Drive
RCLONE_BASE_OPTS=(
  --drive-chunk-size=64M
  --drive-acknowledge-abuse
  --fast-list
  --retries=3
  --low-level-retries=10
  --stats-log-level=NOTICE
)

log "Syncing media to $RCLONE_REMOTE/upload..."
# sync upload/ folder. Exclude thumbs and encoded-video!
# Move deleted/modified files to deleted_or_modified/ for protection against accidental deletion & ransomware.
rclone sync "$IMMICH_DIR/upload" "$RCLONE_REMOTE/upload" \
  "${RCLONE_BASE_OPTS[@]}" \
  "${EXTRA_RCLONE_FLAGS[@]}" \
  --backup-dir "$RCLONE_REMOTE/deleted_or_modified/$TODAY/upload" \
  --exclude '/thumbs/**' \
  --exclude '/encoded-video/**'

if [ -d "$IMMICH_DIR/library" ]; then
  log "Syncing external library to $RCLONE_REMOTE/library..."
  rclone sync "$IMMICH_DIR/library" "$RCLONE_REMOTE/library" \
    "${RCLONE_BASE_OPTS[@]}" \
    "${EXTRA_RCLONE_FLAGS[@]}" \
    --backup-dir "$RCLONE_REMOTE/deleted_or_modified/$TODAY/library"
fi

if [ -d "$IMMICH_DIR/profile" ]; then
  log "Syncing profiles to $RCLONE_REMOTE/profile..."
  rclone sync "$IMMICH_DIR/profile" "$RCLONE_REMOTE/profile" \
    "${RCLONE_BASE_OPTS[@]}" \
    "${EXTRA_RCLONE_FLAGS[@]}" \
    --backup-dir "$RCLONE_REMOTE/deleted_or_modified/$TODAY/profile"
fi

# ---------------------------------------------------------------------------
# 4. Copy database dumps to Google Drive
# ---------------------------------------------------------------------------
log "Copying database dumps to $RCLONE_REMOTE/database..."
rclone copy "$BACKUP_SOURCE_DIR" "$RCLONE_REMOTE/database" \
  "${RCLONE_BASE_OPTS[@]}" \
  "${EXTRA_RCLONE_FLAGS[@]}"

# ---------------------------------------------------------------------------
# 5. Backup docker-compose and environment configuration
# ---------------------------------------------------------------------------
log "Backing up configuration files to $RCLONE_REMOTE/config..."
CONFIG_TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$CONFIG_TMP_DIR"' EXIT

if [ -f "$COMPOSE_FILE" ]; then
  cp "$COMPOSE_FILE" "$CONFIG_TMP_DIR/docker-compose.yml"
fi
if [ -f "$ROOT_DIR/infra/immich/.env" ]; then
  cp "$ROOT_DIR/infra/immich/.env" "$CONFIG_TMP_DIR/immich.env"
fi
if [ -f "$ROOT_DIR/.env" ]; then
  grep -E '^(IMMICH|GALLERY|S3)' "$ROOT_DIR/.env" > "$CONFIG_TMP_DIR/root-immich-subset.env" 2>/dev/null || true
fi

rclone copy "$CONFIG_TMP_DIR" "$RCLONE_REMOTE/config" \
  "${RCLONE_BASE_OPTS[@]}" \
  "${EXTRA_RCLONE_FLAGS[@]}"

# ---------------------------------------------------------------------------
# 6. Heartbeat / Monitoring notification
# ---------------------------------------------------------------------------
if [ "$DRY_RUN" = false ] && [ -n "$HEARTBEAT_URL" ]; then
  log "Pinging heartbeat URL..."
  curl -fsS --retry 3 "$HEARTBEAT_URL" >/dev/null 2>&1 || log "Warning: Heartbeat ping failed."
fi

log "Immich backup finished successfully."
