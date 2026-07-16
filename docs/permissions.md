# Roles, posts & permissions — developer guide

How access control works in this codebase, and how to work with it. This is the living
reference; the step-by-step build history lives in `docs/roles-and-permissions.md` (archived).
Product/working decisions are in `docs/design-decisions.md`; UX + writing house rules in
`CLAUDE.md` / `AGENTS.md`.

## The model in one paragraph

A **permission** is an atomic capability with a string code (`users.view`, `theokot.pickup`, …).
Permissions are never assigned to people directly. A **role** bundles permissions and is
GUI-created. People get a role either **directly** (a `UserRole`) or **via a post** (a `Group` that
grants roles to its members). A user's **effective permissions** for the current working year are
the union of the permissions of all their roles, direct and post-granted, plus *everything* if
they are a super admin.

```
permission ──many──< role >──many── user            (direct: UserRole)
                       │
                       └──many── post (Group) ──many── user   (via GroupMembership + GroupRole)
```

Two words for the same thing: **"Post"** is the product word (the UI says "Posten"); **`Group`** is
the code/model word. They are the werkgroepen (IT, Cursusdienst, Theokot, …).

## Data model

Prisma schema: `packages/db/prisma/schema.prisma`.

| Model | What it is |
|-------|-----------|
| `Permission` | Atomic capability. `code` (unique), `labelNl/En`, `category`. Mirror of the code registry (see below). |
| `Role` | A GUI-created bundle. `code` (unique slug), `nameNl/En`, `descriptionNl/En?`, `color?`, `order`, `system` (GUI cannot delete a system role). |
| `RolePermission` | role ↔ permission. `@@id([roleId, permissionId])`. |
| `UserRole` | **Direct** role assignment, **per working year**. `@@id([userId, roleId, year])`. |
| `GroupRole` | A post grants a role. `kind` is `DEFAULT` (every member) or `LEADER` (only the lead). `@@id([groupId, roleId, kind])`. |
| `Group` (post) | `code` (unique **String**), `slug`, names, `orderInPraesidium`, `active`. Grants roles via `roleGrants`. |
| `GroupMembership` | Membership of a post, **per working year**. `role` is `MEMBER` or `LEAD`. `@@unique([userId, groupId, year])`. |
| `User` | Holds `isSuperAdmin` (a boolean, never resets) plus direct `roles` and `memberships`. |

Notes:
- `Group.code` is a plain `String` (not an enum), so posts are fully GUI-managed
  (create/edit/deactivate). Deactivating a post (`active = false`) hides it from new-shift choices
  but keeps its per-year membership history. `Shift.post` is a `String?` holding a post code.
- There is **no** direct permission-on-post model. (`GroupPermission` and the old `GroupCode` enum
  were removed; posts only ever grant *roles*.)

## How permissions resolve

`packages/auth/src/server/session.ts` (`getSession`) builds the session for `year =
currentWorkingYear()`:

1. **Direct roles** — `user.roles` for this `year` → add each role's permission codes.
2. **Post-granted roles** — for each `GroupMembership` this `year`, add the post's `GroupRole`s:
   `DEFAULT` for every member, `LEADER` only when `membership.role === 'LEAD'` → add those roles'
   permission codes.
3. **Super admin** — `user.isSuperAdmin` short-circuits every check to "allowed".

`SessionPayload.permissions` is a `string[]`; the *type safety* is on the check functions' inputs
(below), not on this array.

Because `UserRole` and `GroupMembership` are keyed by working year and the resolver only counts the
current year, **assignments reset by themselves at the 15 July cutover** — there is no cron job. The
only thing that survives the cutover is `User.isSuperAdmin`.

### Working year

`packages/auth/src/workingYear.ts` owns `currentWorkingYear()` (Europe/Brussels, cutover **15
July**) and `FIRST_WORKING_YEAR` (2026, i.e. "26-27"). `apps/web/lib/workingYear.ts` re-exports
these and adds app helpers: `formatWorkingYear`, `workingYearTabs`, `parseWorkingYear`.

## Checking permissions in code

Everything below is typed to the `Permission` union, so a typo in a permission string is a
**compile error**.

**Server components / pages** (`apps/web/lib/session.ts`):
```ts
const session = await requirePermission("users.view");        // throws FORBIDDEN otherwise
await requireAnyPermission(["shift.edit", "shift.reward"]);    // any-of gate for bundled screens
const canEdit = session.user.isSuperAdmin || session.permissions.includes("users.edit");
```
`requirePermission`/`requireAnyPermission` return the session so you can do finer per-widget gating
(e.g. show a page with `users.view` but hide the edit button unless `users.edit`).

**Anywhere with a session in hand** (`@vtk/auth`):
```ts
import { hasPermission, isMemberOfGroup } from "@vtk/auth";
if (hasPermission(session, "roles.manage")) { … }
if (isMemberOfGroup(session, "LOGISTIEK")) { … }   // takes a group CODE, not a permission
```

**API routes** — guard explicitly and return `authErrorResponse(err)` on the thrown auth errors;
see `apps/web/app/api/users/search/route.ts` for the pattern (it allows any of `users.view`,
`shift.edit`, `groups.manage`, `pocs.manage`, or super admin).

**Server actions** must re-check (`await requirePermission(...)`) — never trust the client. Expected
input errors are *returned* as `saveError(code)`, not thrown (see `CLAUDE.md`).

## Adding a permission (code) vs. a role (GUI)

**A new permission is a code change** — permissions are the fixed vocabulary of the app:
1. Add one line to the registry `packages/db/src/permissions.ts`
   (`{ code, labelNl, labelEn, category }`).
2. Run `npm run seed -w @vtk/db` to upsert it into the `Permission` table (safe while the dev
   server runs).
3. Use it: `requirePermission("your.code")` / `hasPermission(session, "your.code")` now type-check
   against it. Tick it onto roles in `/admin/roles`.

The registry is the **single source of truth**; the DB table is a mirror (so permissions are
queryable in SQL). It is exposed to client bundles without pulling in Prisma via the
`@vtk/db/permissions` subpath export. `@vtk/auth` re-exports `type Permission` (the union),
`PERMISSIONS`, `isPermission()`, and `permissionCodes()`.

**A new role is a GUI action** — create it in `/admin/roles`, tick its permissions, and assign it to
people or have a post grant it. No code change. (System roles like `admin` are seeded and cannot be
deleted from the GUI.)

## Admin surfaces

Left-nav config is a single declarative tree in `apps/web/app/[locale]/admin/layout.tsx` using
`item(...)` / `group(...)` helpers — **source order = display order**, and each entry carries its own
permission guard. The people screens sit in a collapsible **"Ledenbeheer"** group (client
`AdminNav.tsx`, with active-link highlighting).

The four Ledenbeheer screens share one pattern built on
`apps/web/app/[locale]/admin/admin-table.tsx` (`useTableControls` for search/sort/expand, plus
`SearchBar`, `SortHeader`, `Panel`, `Avatar`, `Modal`, `ToggleDot`): a compact, searchable, sortable
table whose rows expand into per-category editors, with create/import in modals.

| Screen | Gate | Notes |
|--------|------|-------|
| `/admin/roles` (`RolesTable`) | `roles.manage` | Row = role + effective holder count. Expands to: direct holders, posts that grant it (edit needs `groups.manage`), permissions. |
| `/admin/groepen` (`PostsTable`) | `groups.manage` | Per working-year tabs. Row = post + member count. Expands to: members, roles this post grants (DEFAULT/LEADER), post settings (incl. `active`). Posts are deactivated, never hard-deleted. |
| `/admin/gebruikers` | `users.view` (edit needs `users.edit`) | **Server-driven** table (URL `?q&sort&dir&page`, `count` + `findMany` with `take`/`skip`, no memberships join) — built to scale to tens of thousands of users. Editing opens `/admin/gebruikers/[id]`. |
| `/admin/pocs` (`PocsTable`) | `pocs.manage` | Row = POC + representative count. Expands to representatives (added via the `/api/users/search` typeahead) and POC settings. |

User pickers everywhere use the server-side typeahead `GET /api/users/search` (capped results), not
a full user load, so they scale.

## Seeded baseline

`packages/db/prisma/seed.ts` seeds the role set and wires posts to them (all grants `DEFAULT`, so
every member of the post gets the role):

| Role | Permissions | Granted to (post → DEFAULT) |
|------|-------------|-----------------------------|
| `admin` (system) | all | IT, Groep 5 |
| `praesidium` | `calendar.create`, `photos.upload` | every post |
| `werkgroep` | none (fill in the GUI) | — |
| `medewerker` | none (fill in the GUI) | — |
| `theokot` | `theokot.manage`, `theokot.pickup` | Theokot |
| `post-<code>` (one per post) | none (container to fill in the GUI) | its own post |

The per-post roles (`post-it`, `post-cursusdienst`, …) are empty containers so you can hang
post-specific permissions off each werkgroep over time. `werkgroep`/`medewerker` are seeded as
available roles but not auto-assigned to any post. Your seeded admin account is a member of IT
(which grants `admin`), so it can see every admin screen.

## Operational notes

- **Windows dev + Prisma:** a running dev server locks `query_engine-windows.dll.node`, so
  `prisma generate` / `prisma migrate dev` fail with `EPERM` while it runs. Stop the dev server
  before migrating and restart it after (the node process caches the old generated client).
- **Migrate:** `npm run migrate -w @vtk/db -- --name <name>`. Check
  `npx dotenv -e ../../.env -- npx prisma migrate status` first (read-only). An enum→string column
  change needs a hand-written `USING ::text` cast — Prisma won't generate it.
- **Seed:** `npm run seed -w @vtk/db` — idempotent upserts; safe while the dev server is up.
- **Typecheck (no server needed):** `cd apps/web && npx tsc --noEmit`;
  `cd packages/auth && npx tsc --noEmit -p tsconfig.json`.
- **Route health without auth:**
  `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/nl/admin/roles` → `307` (login
  redirect). A `500` is a runtime error; the first hit may compile on demand, so allow a long
  timeout.
- Do **not** switch dev off `next dev --webpack`, and do **not** re-export Prisma client types from
  `@vtk/db` (import model types from `@prisma/client` at the call site). See `AGENTS.md`.
