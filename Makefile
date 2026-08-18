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

.PHONY: help up down db postgres admin dev seed migrate reset fixtures verify psql logs status

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

## fixtures: export the dev site's content (needs FIXTURES_SOURCE_DATABASE_URL)
fixtures:
	npm run fixtures:export

## verify: run what the pre-push hook and CI run
verify:
	npm run verify

## psql: open a psql shell on the local database
psql:
	$(COMPOSE) exec postgres psql -U vtk -d vtk

## logs: follow the local database logs
logs:
	$(COMPOSE) logs -f postgres

## status: show what is running
status:
	@$(COMPOSE) ps

# `reset` throws the local database away, including anything you put in it
# locally. Hence an explicit confirmation and no silent `-v`: this target sits
# one typo away from `make dev`.
## reset: throw the local database away and rebuild it (DESTRUCTIVE)
reset:
	@echo "This deletes the local database and everything in it."
	@read -p "Type 'yes' to continue: " ok; [ "$$ok" = "yes" ] || { echo "Aborted."; exit 1; }
	$(COMPOSE) down -v
	$(MAKE) db
