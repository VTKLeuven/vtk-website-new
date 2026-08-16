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

.PHONY: help up down db dev seed migrate reset fixtures verify psql logs status

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
	@echo "First time:  make up && make db && make dev"

## up: start the local database (Postgres on 127.0.0.1:5433)
up:
	$(COMPOSE) up -d
	@echo "Waiting for Postgres to be ready..."
	@until $(COMPOSE) exec -T postgres pg_isready -U vtk >/dev/null 2>&1; do sleep 1; done
	@echo "Database is up. Next: make db"

## down: stop the local database (data stays in the volume)
down:
	$(COMPOSE) down

## db: prepare the schema and fill the database (migrations + seed)
db: migrate seed

## migrate: apply the migrations to the local database
migrate:
	npm run db:migrate

## seed: fill the database with fixtures and prototype data
seed:
	npm run db:seed

## dev: start the website on http://localhost:3000
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
	$(MAKE) up
	$(MAKE) db
