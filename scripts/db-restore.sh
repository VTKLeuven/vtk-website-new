#!/usr/bin/env bash
#
# Load one dump written by scripts/db-backup.sh back into a database.
#
#   scripts/db-restore.sh backups/2026-08-20_030000/vtk.sql.gz
#   STACK=deploy scripts/db-restore.sh backups/2026-08-20_030000/vtk.sql.gz
#
# This throws away what is in the target database. The confirmation lives here
# rather than in the Makefile, so it also protects anyone calling the script
# straight from a shell; FORCE=1 skips it for a scripted restore.
set -euo pipefail
umask 077

source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/db-stack.sh"

FILE="${1:-${FILE:-}}"
[ -n "$FILE" ] || die "Usage: scripts/db-restore.sh <file.sql.gz>
Pick one from 'make backups'."
[ -f "$FILE" ] || die "No such file: $FILE"

# Checked before anything is dropped, not halfway through: a dump that was
# truncated on its way off the server decompresses fine for a few hundred
# megabytes and then stops.
gzip -t "$FILE" 2>/dev/null || die "$FILE is not a readable gzip file (truncated download?)."

require_postgres

# The file is named after the database it came from, so that is the target.
# DB=... overrides it, which is how a production dump goes into a local database
# under another name.
DB="${DB:-$(basename "$FILE" .sql.gz)}"

cat <<EOF

Restoring into the $STACK stack.

  file:      $FILE ($(du -h "$FILE" | cut -f1 | tr -d ' '), $(date -r "$FILE" '+%Y-%m-%d %H:%M'))
  stack:     $COMPOSE_FILE
  database:  $DB on service $PG_SERVICE

Everything in '$DB' is dropped and replaced by what is in this dump. Stop the
applications first if they are running, or they will keep writing to a database
that is being replaced under them.
EOF

# Production gets a sentence to type, not a reflex three letters: 'yes' is what
# you answer to 'make reset' on your laptop half a dozen times a week.
if [ "$STACK" = "deploy" ]; then
  expected="restore production"
else
  expected="yes"
fi

if [ "${FORCE:-}" != "1" ]; then
  read -r -p "Type '$expected' to continue: " answer || die "Aborted."
  [ "$answer" = "$expected" ] || die "Aborted."
fi

if ! db_exists "$DB"; then
  echo "Database '$DB' does not exist here yet; creating it."
  compose_exec createdb -U "$PG_USER" "$DB"
fi

# One transaction: the restore either lands completely or changes nothing.
# Without it a dump that fails halfway leaves a database with half its tables,
# which looks like it works until you hit the missing half.
gunzip -c "$FILE" |
  compose exec -T "$PG_SERVICE" psql -U "$PG_USER" -d "$DB" \
    --quiet --output=/dev/null --single-transaction -v ON_ERROR_STOP=1

echo
echo "Restored $FILE into '$DB'."
echo "Older than the current migrations? Run 'make migrate' to catch it up."
