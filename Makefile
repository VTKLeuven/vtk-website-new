# Short entry points for day-to-day work.
#
# This is deliberately a thin layer. The npm scripts in package.json stay the
# source of truth: CI runs those, AGENTS.md describes those, and every target
# below is at most a few lines around one. So do not put logic here that exists
# only through `make`, or the documentation stops being true for anyone who does
# not use make, and CI stops matching your laptop.
#
# Everything is .PHONY: no target produces a file whose freshness make could
# derive. The state lives in Docker and in Postgres, and make cannot see into
# either.

SHELL := /bin/bash
COMPOSE := docker compose -f infra/compose.dev.yml

.DEFAULT_GOAL := help

.PHONY: help up down db postgres admin dev logistiek seed migrate generate deps \
        lint test verify psql logs status backup backups restore reset fixtures

## help: show this list
help:
	@echo "VTK website; local development"
	@echo
	@# Split on the first colon only. `column -t -s :` broke on every colon in
	@# the text, and so on 127.0.0.1:5433 and on http://.
	@awk '/^## / { \
		line = substr($$0, 4); \
		i = index(line, ":"); \
		printf "  make %-10s %s\n", substr(line, 1, i - 1), substr(line, i + 2); \
	}' $(MAKEFILE_LIST)
	@echo
	@echo "First time:  make db && make up"

# Everything you need to work, in one command: the database in the background,
# the website in the foreground. The website deliberately stays in the
# foreground, so its compile output lands in your terminal; detaching it would
# hide exactly the errors you are waiting for. Ctrl-C stops the website and
# leaves the database running; `make down` stops that too.
## up: start the database and the website (http://localhost:3000)
up: postgres
	@# An empty database produces a wall of Prisma errors that says nothing about
	@# the actual problem, so check first and name it.
	@if ! $(COMPOSE) exec -T postgres psql -U vtk -d vtk -tAc \
		"select to_regclass('public.\"HeaderTab\"')" 2>/dev/null | grep -q HeaderTab; then \
		echo; \
		echo "The database is empty. Run 'make db' first, then 'make up' again."; \
		exit 1; \
	fi
	npm run dev

## down: stop the database (its data stays in the volume)
down:
	$(COMPOSE) down

## db: start the database and prepare it (migrations + seed)
db: postgres migrate seed
	@echo
	@echo "Database ready. Start the website with 'make up'."

# Internal: bring the container up and wait until it accepts connections. No `##`
# comment, so it stays out of `make help`; `up` and `db` both depend on it.
postgres:
	@$(COMPOSE) up -d
	@until $(COMPOSE) exec -T postgres pg_isready -U vtk >/dev/null 2>&1; do sleep 1; done

# Only ever the local database; the script refuses any other host. See the
# explanation at the top of scripts/create-local-admin.ts.
## admin: create a local superadmin so you can open /admin
admin: postgres
	npm run db:admin

## migrate: apply the migrations to the local database
migrate:
	npm run db:migrate

## seed: fill the database with fixtures and prototype data
seed:
	npm run db:seed

## dev: start only the website, assuming the database already runs
dev:
	npm run dev

## logistiek: start the uitleendienst app (http://localhost:3100)
logistiek:
	npm run dev --workspace=@vtk/logistiek

## generate: regenerate the Prisma client after a schema change
generate:
	npm run db:generate

# The one command in this file that is slow on purpose. An incremental
# `npm install` drops the other platforms' native binaries from the lockfile
# (npm/cli#4828), which keeps working here and breaks `npm ci` on Linux; see
# AGENTS.md. So after touching dependencies you resolve from scratch.
## deps: reinstall dependencies and regenerate the lockfile from scratch
deps:
	rm -rf node_modules package-lock.json
	npm install

## lint: run eslint on the website
lint:
	npm run lint

## test: run the unit tests of both apps
test:
	npm run test --workspace=@vtk/web
	npm run test --workspace=@vtk/logistiek

## verify: run what the pre-push hook and CI run
verify:
	npm run verify

## fixtures: export the dev site's content (needs FIXTURES_SOURCE_DATABASE_URL)
fixtures:
	npm run fixtures:export

## psql: open a psql shell on the local database
psql:
	$(COMPOSE) exec postgres psql -U vtk -d vtk

## logs: follow the local database logs
logs:
	$(COMPOSE) logs -f postgres

## status: show what is running
status:
	@$(COMPOSE) ps

# Backups. The logic lives in `scripts/db-backup.sh` and `scripts/db-restore.sh`,
# per the note at the top of this file: both have to keep working when they are
# called straight from a shell or from the server's crontab, and the restore
# confirmation has to protect that caller too, not only the one who types
# `make restore`.
#
# Both take STACK=dev (the laptop, the default) or STACK=deploy (the server
# stack from infra/docker-compose.yml). There is no autodetection on purpose:
# guessing wrong is silent in both directions.
## backup: dump every database to backups/ (STACK=deploy on the server)
backup:
	scripts/db-backup.sh

## backups: list the backups on disk
backups:
	@scripts/db-backup.sh --list

## restore: load a dump back in; FILE=backups/<run>/vtk.sql.gz (DESTRUCTIVE)
restore:
	scripts/db-restore.sh "$(FILE)"

# `reset` throws the local database away, including anything you put in it
# locally. Hence an explicit confirmation and no silent `-v`: this target sits
# one typo away from `make dev`.
## reset: throw the local database away and rebuild it (DESTRUCTIVE)
reset:
	@echo "This deletes the local database and everything in it."
	@read -p "Type 'yes' to continue: " ok; [ "$$ok" = "yes" ] || { echo "Aborted."; exit 1; }
	$(COMPOSE) down -v
	$(MAKE) db
