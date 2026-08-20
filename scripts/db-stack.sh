# Shared by scripts/db-backup.sh and scripts/db-restore.sh. Sourced, not run.
#
# Finding "the database" is the part both scripts have to agree on: which
# compose file, which service, and which credentials that container actually
# runs with. Let them disagree and a restore quietly lands somewhere other than
# where the dump came from, which you find out about at the worst moment.
#
# Everything goes through `docker compose exec`, never over the published port.
# So the dump is written by the same Postgres that holds the data (a host
# pg_dump 14 refuses a server 16 anyway), the password never leaves the
# container, and both scripts work on the server, where there is no psql and no
# node.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

die() { printf '\n%s\n' "$*" >&2; exit 1; }

# `dev` is the laptop stack from infra/compose.dev.yml, `deploy` the server
# stack from infra/docker-compose.yml. Deliberately no autodetection: both wrong
# guesses are silent and expensive (dumping an empty dev database while thinking
# you have production, restoring a laptop dump over production). Picking the
# stack that is not running fails immediately and harmlessly instead.
STACK="${STACK:-dev}"
case "$STACK" in
  dev) COMPOSE_FILE="$ROOT_DIR/infra/compose.dev.yml" ;;
  deploy) COMPOSE_FILE="$ROOT_DIR/infra/docker-compose.yml" ;;
  *) die "Unknown STACK '$STACK'. Use STACK=dev (laptop) or STACK=deploy (server)." ;;
esac

PG_SERVICE="${PG_SERVICE:-postgres}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# `docker compose exec -T` attaches the caller's stdin to the container, so a
# helper that reads nothing still swallows it: the database list a loop is
# reading, or the answer to a confirmation prompt. Everything that does not
# deliberately pipe something in therefore reads from /dev/null.
compose_exec() { compose exec -T "$PG_SERVICE" "$@" </dev/null; }

# Fills PG_USER and PG_DB, and refuses to go on when the database is not up.
#
# The credentials are read out of the running container because that is the only
# place where they are right by definition: the deploy stack interpolates
# ${POSTGRES_USER} from infra/.env, the dev stack from its own defaults, and the
# root .env is a third answer again (it even names port 5432 while compose
# publishes 5433).
require_postgres() {
  local cid
  cid="$(compose ps -q "$PG_SERVICE" 2>/dev/null || true)"
  if [ -z "$cid" ] || [ "$(docker inspect -f '{{.State.Running}}' "$cid" 2>/dev/null)" != "true" ]; then
    die "No running '$PG_SERVICE' in the $STACK stack ($COMPOSE_FILE).
On a laptop that is STACK=dev, started with 'make up'; on the server it is
STACK=deploy. Check 'docker compose -f $COMPOSE_FILE ps'."
  fi

  PG_USER="$(compose_exec printenv POSTGRES_USER 2>/dev/null | tr -d '\r' || true)"
  PG_USER="${PG_USER:-vtk}"
  PG_DB="$(compose_exec printenv POSTGRES_DB 2>/dev/null | tr -d '\r' || true)"
  PG_DB="${PG_DB:-$PG_USER}"

  compose_exec pg_isready -U "$PG_USER" >/dev/null 2>&1 ||
    die "'$PG_SERVICE' is running but not accepting connections yet."
}

psql_q() {
  compose_exec psql -U "$PG_USER" -d "$PG_DB" -tAqc "$1" | tr -d '\r'
}

# Templates and the empty maintenance database `postgres` are not data; every
# other database in the cluster is (the website's own, and `umami` where the
# analytics profile is switched on).
list_databases() {
  psql_q "select datname from pg_database
          where datistemplate = false and datname <> 'postgres'
          order by datname"
}

db_exists() {
  [ "$(psql_q "select 1 from pg_database where datname = '$1'")" = "1" ]
}
