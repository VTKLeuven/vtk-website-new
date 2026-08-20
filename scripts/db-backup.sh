#!/usr/bin/env bash
#
# Dump every database of one Postgres stack to backups/<timestamp>/, then throw
# away all but the most recent KEEP runs.
#
# Written to be safe to run unattended, because that is the point: one line in
# the server's crontab.
#
#   0 3 * * *  cd /home/it/vtk-website-new && STACK=deploy make backup >>/var/log/vtk-backup.log 2>&1
#
# What this does NOT cover, and does not pretend to: the Immich database (its
# own container with its own image and extensions) and its photo library, and
# the S3 bucket. Those have their own retention; see docs/immich-remote-storage.md
# section 13 and README section 7. A dump of the website database alone is not a
# complete restore of the site.
set -euo pipefail

# The dump holds member data, orders, payments, door logs and the plaintext
# OAuth client secrets. It is not something to leave world-readable in a
# directory anyone on the server can read.
umask 077

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/db-stack.sh"

KEEP="${KEEP:-30}"

# Only ever the timestamp directories this script writes itself. Anything else
# someone parked in backups/ (a dump pulled off the server by hand, a note) is
# theirs and is never pruned.
run_dirs() {
  find "$BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d \
    -name '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_[0-9][0-9][0-9][0-9][0-9][0-9]' 2>/dev/null |
    sort
}

if [ "${1:-}" = "--list" ]; then
  if [ ! -d "$BACKUP_DIR" ] || [ -z "$(run_dirs)" ]; then
    echo "No backups in $BACKUP_DIR yet. Make one with 'make backup'."
    exit 0
  fi
  echo "Backups in $BACKUP_DIR:"
  while read -r dir; do
    [ -n "$dir" ] || continue
    printf '  %s  %5s  %s\n' \
      "$(basename "$dir")" \
      "$(du -sh "$dir" | cut -f1 | tr -d ' ')" \
      "$(find "$dir" -name '*.sql.gz' -exec basename {} .sql.gz \; | sort | tr '\n' ' ')"
  done < <(run_dirs)
  exit 0
fi

require_postgres

databases="$(list_databases)"
[ -n "$databases" ] || die "The $STACK stack has no databases to back up."

stamp="$(date +%Y-%m-%d_%H%M%S)"
work="$BACKUP_DIR/.incomplete-$stamp"
dest="$BACKUP_DIR/$stamp"

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# A run that dies halfway must not leave something that looks like a backup: the
# retention below would count it as one and push a good one out. So dump into a
# hidden directory and only give it its real name once every database is in.
trap 'rm -rf "$work"' EXIT
mkdir -p "$work"

version="$(compose_exec postgres --version | tr -d '\r')"
echo "Backing up the $STACK stack ($version)"

{
  echo "stack:    $STACK ($COMPOSE_FILE)"
  echo "taken:    $(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "host:     $(hostname)"
  echo "server:   $version"
  echo "restored with: make restore FILE=backups/$stamp/<database>.sql.gz"
  echo
} > "$work/manifest.txt"

while read -r db; do
  [ -n "$db" ] || continue
  out="$work/$db.sql.gz"
  printf '  %-24s' "$db"
  # --clean --if-exists so the dump loads into a database that already has
  # tables; --no-owner --no-privileges so it also loads under a role with
  # another name, which is what a laptop has.
  compose_exec pg_dump -U "$PG_USER" \
    --clean --if-exists --no-owner --no-privileges "$db" | gzip -9 >"$out"
  size="$(du -h "$out" | cut -f1 | tr -d ' ')"
  printf '%s\n' "$size"
  echo "database: $db -> $db.sql.gz ($size)" >>"$work/manifest.txt"
done <<<"$databases"

mv "$work" "$dest"
trap - EXIT
echo "Written to $dest"

if [ "$KEEP" -gt 0 ]; then
  total="$(run_dirs | wc -l | tr -d ' ')"
  if [ "$total" -gt "$KEEP" ]; then
    while read -r old; do
      [ -n "$old" ] || continue
      rm -rf "$old"
      echo "Pruned $(basename "$old") (keeping the last $KEEP)"
    done < <(run_dirs | head -n "$((total - KEEP))")
  fi
fi
