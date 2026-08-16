# Content fixtures

The editorial content of the dev site as JSON: navigation, CMS pages, calendar
categories, POCs, partners and a handful of homepage settings. `prisma/seed.ts`
uses these files to fill a local database that resembles the real site.

If they are not here, the seed falls back to the constants in
`packages/db/src/groups.ts`. A fresh clone therefore works without access to the
dev database; you just get the navigation as it was when those constants were
written, and that gap once cost half an evening chasing a bug in the site header
that only existed locally.

## Updating

Someone with access to the dev database runs:

```
FIXTURES_SOURCE_DATABASE_URL="postgresql://user:pass@host:5432/vtk" make fixtures
```

and commits the result. Everyone else picks it up with a `git pull` and a
`make db`.

## What does not belong here

No personal data. No members, orders, payments, door logs, scan logs or mailing
lists, and from `Setting` only the keys on the allowlist in
`scripts/export-fixtures.ts`. That table also carries `s3.config`,
`sentry.config`, `door.config` and `brevo.lists`, which are live secrets.

**Read the diff before you commit.** These files go to the laptop of everyone
who clones the repo.
