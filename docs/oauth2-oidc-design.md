# Executive summary

VTK runs a Next.js 16 monorepo whose authentication already sits on **Better Auth**: users log in with KU Leuven OIDC (or a password), sessions are cookie-based and cross-subdomain, and authorisation flows through a home-grown role/post/permission model resolved per working year. On the `sso-provider` branch, the `@better-auth/oauth-provider` plugin has been added, configured, and migrated into Postgres. VTK is, on paper, already an Authorization Server.

In practice it is a scaffold. The plugin is mounted, four OAuth tables exist, and one permission code (`sso.client.edit`) has been reserved. There is no GUI, no consent page, no claim system, no per-client permission model, no audit trail, and the two page paths the plugin needs (`/sign-in`, `/consent`) point at routes that do not exist under the app's locale-prefixed router.

This document specifies the remaining work. It has two jobs. The first half teaches OAuth2 and OpenID Connect from first principles, because the protocols are full of decisions that look arbitrary until you know the attack they prevent. The second half is a concrete architecture for VTK: what the plugin already gives us, what we build on top, which tables to add, which endpoints to expose, which screens to draw, and in what order to ship them.

Six decisions shape everything that follows.

1. **The plugin owns the protocol; VTK owns the policy.** Every RFC-defined endpoint (`/oauth2/authorize`, `/token`, `/introspect`, `/revoke`, `/userinfo`, `/register`, discovery, JWKS) is already implemented by `@better-auth/oauth-provider` and will not be reimplemented. VTK's code lives strictly in the plugin's designated extension points: `clientPrivileges`, `customAccessTokenClaims`, `customIdTokenClaims`, `customUserInfoClaims`, and the consent page.

2. **Client management moves entirely into the existing admin GUI.** A new `/admin/sso` surface built from the same `admin-table` / `SaveForm` / `DeleteIconButton` primitives as `/admin/roles`, calling the plugin's `adminCreateOAuthClient` / `adminUpdateOAuthClient` server endpoints. No `.env` client registry, ever.

3. **Per-client permissions are a first-class VTK concept, delivered through a standards-shaped claim.** Each client declares a permission namespace (`crm.read`, `discord.admin`, …) in its own registry table; users are granted those permissions per client; the Authorization Server emits them in a `permissions` claim on the access token, scoped by an `entitlements` scope the client must request. Scopes stay coarse (what the app may ask for), permissions stay fine (what this user may do). This is the OAuth2 division of labour, not a deviation from it.

4. **Claims are data, not code.** A `SsoClaim` registry table maps claim names to user fields, with a small set of named transformers and a permission gate per claim. Adding `phone_number` to the profile becomes a row in a table and a tick in a GUI, not a deploy.

5. **Revocation is push-on-change plus pull-on-doubt.** Short-lived access tokens (10 minutes for permission-bearing tokens) mean a revoked permission dies on its own within one token lifetime; clients that need faster get introspection or a signed webhook. No custom sync protocol.

6. **Internal apps skip consent; partner apps never do.** `skipConsent` is already a per-client column. The trust tier is an explicit, audited, permission-gated switch, not an environment guess.

The roadmap in section 18 breaks this into seven phases, each independently shippable. Phase 1 (correctness fixes to the existing configuration) is roughly two days and unblocks everything else.

---

# 0. Repository analysis

This section records what is in the tree today, at commit `deebded` on branch `sso-provider`. Everything later in the document builds on these facts; where a design choice is constrained by something here, it is cross-referenced back.

## 0.1 Shape of the monorepo

```
vtk-website-new/
├── apps/
│   ├── web/          Next.js 16 (App Router): the main site + /admin
│   └── logistiek/    Next.js 16: a submodule app, session via HTTP callback
├── packages/
│   ├── auth/         Better Auth config, session resolution, API handlers
│   ├── db/           Prisma schema + client + the permission registry
│   ├── i18n/         NL/EN dictionaries
│   ├── storage/      object storage helpers
│   └── ui/           shared UI
└── docs/             permissions.md, design-decisions.md, ticketing.md, …
```

Both apps run `next dev --webpack` deliberately (Turbopack + Tailwind v4 leaks PostCSS workers), and both pin `turbopack.root` / `outputFileTracingRoot`. Neither constraint interacts with OAuth work, but both are load-bearing and must survive it.

## 0.2 Current Better Auth configuration

`packages/auth/src/auth.ts` is the single `betterAuth()` call. Reproduced in full below because nearly every later section refers to a line of it.

```ts
export const auth = betterAuth({
  appName: 'VTK',
  baseURL: process.env.BETTER_AUTH_URL,
  basePath: '/api/auth/better',
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: isProduction
    ? ['https://*.vtk.be']
    : ['http://localhost:3000', 'http://localhost:3001'],

  database: prismaAdapter(prisma, { provider: 'postgresql' }),

  plugins: [
    ...(kulConfig ? [genericOAuth({ config: [kulConfig] })] : []),
    jwt({ disableSettingJwtHeader: true }),
    oauthProvider({
      loginPage: '/sign-in',   // TODO juiste link
      consentPage: '/consent', // TODO juiste link
      clientPrivileges: async ({ action, headers, user, session }) => {
        return hasPermission(headers, 'sso.client.edit');
      },
    }),
    nextCookies(),
  ],

  disabledPaths: ['/token'], // disable for Oauth

  emailAndPassword: { enabled: true, disableSignUp: true, password: { hash, verify } },
  account: { accountLinking: { enabled: true, trustedProviders: [KUL_PROVIDER_ID] } },
  databaseHooks: { session: { create: { before: /* active-user gate */ } } },
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  advanced: {
    cookiePrefix: 'vtk',
    useSecureCookies: isProduction,
    crossSubDomainCookies: { enabled: isProduction, domain: process.env.BETTER_AUTH_COOKIE_DOMAIN },
  },
  user: { additionalFields: { avatarKey, locale, active, isSuperAdmin } },
});
```

Five observations matter downstream.

**`basePath` is `/api/auth/better`, not the default `/api/auth`.** Every plugin endpoint therefore lives under that prefix: the authorization endpoint is `https://vtk.be/api/auth/better/oauth2/authorize`, the token endpoint `…/oauth2/token`, JWKS `…/jwks`. This is legal, and it does *not* break discovery, contrary to what this section claimed before 2026-07-20. Because the issuer carries a path, OIDC Discovery 1.0 §4 puts the document at `<issuer>/.well-known/openid-configuration`, and the plugin serves it there already; the host root would be the wrong place for it. Only the RFC 8414 §3.1 issuer-path form needs help, and the proxy rewrites it. Section 16.3 has the detail and the evidence.

**The `jwt` plugin is enabled with `disableSettingJwtHeader: true`.** This is what makes signed, asymmetric (EdDSA/ES256) access tokens and ID tokens possible: the OAuth provider delegates signing to the JWT plugin's key set, persisted in the `Jwks` table. If the JWT plugin were absent, `disableJwtPlugin` would force opaque access tokens and HS256 ID tokens signed with each client secret: a materially weaker posture. Keep the JWT plugin.

**`disabledPaths: ['/token']` disables the *JWT plugin's* `/token` endpoint, not `/oauth2/token`.** The JWT plugin exposes `GET /token`, which mints a JWT for the *current browser session*. That is a session-to-bearer-token bridge with no client, no audience, and no consent: exactly the thing an Authorization Server should not hand out. Disabling it is correct and the comment (`disable for Oauth`) reads as though it might have been defensive rather than deliberate. It is deliberate and should stay. It does **not** affect the OAuth token endpoint, which is registered by the OAuth plugin at `/oauth2/token`.

**`clientPrivileges` currently returns `hasPermission(headers, 'sso.client.edit')` for every action.** The callback receives `action: "create" | "read" | "update" | "delete" | "list" | "rotate"` and ignores it. Two consequences: read/list are gated behind an edit permission (too strict: a support engineer cannot look at a client), and delete/rotate are gated behind the same permission as a cosmetic name change (too loose: rotating a secret breaks a live integration). Section 8.4 replaces this with a per-action mapping. Note also that `hasPermission` from `server/session.ts` runs a full `getSession`, a `findUnique` with three nested includes, on every call; the plugin may invoke `clientPrivileges` per request, so the replacement should resolve the session once.

**`loginPage: '/sign-in'` and `consentPage: '/consent'` do not resolve.** `apps/web` routes everything under `app/[locale]/…`; there is no `/sign-in` and no `/consent` route in the tree (`find apps/web/app -iname '*consent*' -o -iname '*sign-in*'` returns nothing). Any `prompt=login` or any client without `skipConsent` currently redirects the user to a 404. This is the single most important correctness bug on the branch and is Phase 1, item 1.

## 0.3 Current OAuth2 plugin configuration and defaults

Because `oauthProvider()` is called with only three options, every other option sits at its default. The defaults that matter:

| Option | Default in effect | Consequence for VTK |
|---|---|---|
| `scopes` | `["openid","profile","email","offline_access"]` | No VTK-specific scopes exist yet. Sections 9 and 11 add them. |
| `grantTypes` | `["authorization_code","client_credentials","refresh_token"]` | Client credentials is enabled server-wide today. Section 5.7 restricts it per client. |
| `accessTokenExpiresIn` | `3600` (1 h) | Too long for permission-bearing tokens. Section 10.6 sets scope-based expirations. |
| `idTokenExpiresIn` | `36000` (10 h) | Acceptable; ID tokens are consumed once at login. |
| `refreshTokenExpiresIn` | `2592000` (30 d) | Matches the browser session TTL. Keep. |
| `codeExpiresIn` | `600` (10 min) | Spec-recommended. Keep. |
| `allowDynamicClientRegistration` | `false` | Correct for VTK. Section 5.11 explains why it stays false. |
| `allowUnauthenticatedClientRegistration` | `false` | Correct. Never enable. |
| `storeClientSecret` | `"hashed"` (because the JWT plugin is on) | Secrets are unrecoverable after creation: the GUI must show-once. Section 5.3. |
| `storeTokens` | `"hashed"` | Opaque access/refresh tokens are hashed at rest. Good. |
| `rateLimit` | token 20/min, authorize 30/min, introspect 100/min, revoke 30/min, register 5/min, userinfo 60/min | Reasonable defaults; section 14.11 tunes introspection upward if we adopt it. |
| `customAccessTokenClaims` | unset | **The main gap.** No roles, permissions, or VTK identity data reaches any token today. |
| `customIdTokenClaims` | unset | Same. |
| `customUserInfoClaims` | unset | `/userinfo` returns only the built-in profile/email claims. |
| `pairwiseSecret` | unset | `subject_type: "pairwise"` is therefore unusable. Section 14.16. |
| `cachedTrustedClients` | unset | Internal clients hit the DB on every authorize. Section 4.7 revisits. |

## 0.4 Current OAuth endpoints (already live)

Registered by the plugin under `/api/auth/better`. Everything in this table exists and works today; none of it needs to be written.

| Path | Method | Auth | Purpose |
|---|---|---|---|
| `/oauth2/authorize` | GET | browser session | Authorization endpoint (RFC 6749 §3.1) |
| `/oauth2/token` | POST | client creds | Token endpoint: code, refresh, client_credentials |
| `/oauth2/introspect` | POST | client creds | RFC 7662 token introspection |
| `/oauth2/revoke` | POST | client creds | RFC 7009 token revocation |
| `/oauth2/userinfo` | GET/POST | bearer | OIDC UserInfo |
| `/oauth2/end-session` | GET | browser session | OIDC RP-Initiated Logout |
| `/oauth2/register` | POST | (gated) | RFC 7591 Dynamic Client Registration |
| `/oauth2/consent` | POST | session | Records a consent decision and resumes the flow |
| `/oauth2/continue` | POST | session | Resumes after select-account / signup / post-login |
| `/oauth2/create-client` | POST | session | Self-service client creation |
| `/oauth2/update-client` | POST | session | Self-service client update (owner only) |
| `/oauth2/get-client`, `/get-clients` | GET | session | Read own clients |
| `/oauth2/delete-client` | POST | session | Delete own client |
| `/oauth2/client/rotate-secret` | POST | session | Rotate own client's secret |
| `/oauth2/public-client`, `/public-client-prelogin` | GET | public | Client metadata for consent/login screens |
| `/oauth2/get-consent`, `/get-consents` | GET | session | Read consent grants |
| `/oauth2/update-consent`, `/delete-consent` | POST | session | Modify/revoke consent |
| `/admin/oauth2/create-client` | POST | `SERVER_ONLY` | Privileged create: can set restricted fields |
| `/admin/oauth2/update-client` | PATCH | `SERVER_ONLY` | Privileged update |
| `<basePath>/.well-known/oauth-authorization-server` | GET | public | RFC 8414 metadata (served; issuer-path form rewritten by the proxy, 16.3) |
| `<basePath>/.well-known/openid-configuration` | GET | public | OIDC Discovery (served as-is, 16.3) |
| `/jwks` | GET | public | JWKS, from the `jwt` plugin |

The `SERVER_ONLY` marker on the two `/admin/oauth2/*` endpoints means they are not routable over HTTP and are reachable only via `auth.api.adminCreateOAuthClient({ body, headers })` from server code. That is precisely the shape VTK's server actions need, and it is why section 5 builds the admin GUI on those two rather than on the session-scoped self-service pair.

## 0.5 Current database schema

`packages/db/prisma/schema.prisma` is 1509 lines and ~60 models. The OAuth-relevant subset:

**Better Auth core:** `User`, `Session`, `Account`, `Verification`, `Jwks`.

**OAuth provider (already migrated):** `OauthClient`, `OauthRefreshToken`, `OauthAccessToken`, `OauthConsent`. These map 1:1 onto the plugin's declared schema and are documented field-by-field in section 15.2.

Two schema defects are visible by inspection. The plugin's schema declares `index: true` on `oauthRefreshToken.clientId/userId/sessionId`, `oauthAccessToken.clientId/userId/sessionId/refreshId`, and `oauthConsent.clientId/userId`, but the generated Prisma models carry **no `@@index` directives at all**: only the implicit indexes behind `@id` and `@unique`. Consent lookup on every authorize (`where clientId + userId`) and revocation-by-user will do sequential scans as these tables grow. Second, `OauthAccessToken.token` is `@unique` but `OauthRefreshToken.token` is not, despite the plugin declaring it `unique: true`. Both are corrected in section 15.4 as an index-only migration.

**Permission model:** `Permission`, `Role`, `RolePermission`, `UserRole`, `GroupRole`, `Group`, `GroupMembership`. Section 0.7.

## 0.6 Current user model

`User` (schema.prisma:197) is unusually rich, which is why the claim system in section 12 has to be data-driven rather than hard-coded. Fields relevant as OIDC claims:

| Field | Type | Natural claim |
|---|---|---|
| `id` | cuid | `sub` |
| `name`, `firstName`, `lastName` | String / String? | `name`, `given_name`, `family_name` |
| `email`, `emailVerified` | String @unique, Boolean | `email`, `email_verified` |
| `personalEmail`, `emailPreference` | String?, enum | VTK-namespaced |
| `rNumber` | String? @unique | `vtk:student_number`: KU Leuven student number |
| `avatarKey`, `image` | String? | `picture` (via `publicUrl()`) |
| `locale` | enum NL/EN | `locale` |
| `birthDate` | DateTime? | `birthdate` |
| `street`, `houseNumber`, `bus`, `postalCode`, `city` | String? | `address` (composite) |
| `studyYears` | `StudyYear[]` | `vtk:study_years` |
| `studyProgrammes` | `StudyProgramme[]` | `vtk:study_programmes` |
| `notAtFaculty` | Boolean | `vtk:not_at_faculty` |
| `studyConfirmedYear` | Int? | freshness signal for the study claims |
| `mailCategories` | `MailCategory[]` | `vtk:mail_categories` (sensitive) |
| `onboardedAt` | DateTime? | gate: profile incomplete |
| `active` | Boolean | gate: deactivated member |
| `isSuperAdmin` | Boolean | never a claim; see 14.19 |

`studyYears` and `studyProgrammes` are arrays because a member can straddle two years or two programmes. Any claim mapping must therefore handle scalar *and* array sources: a requirement that drives the transformer design in 12.4.

Note also that `email` is the university address and `personalEmail` is separate, with `emailPreference` selecting which one the member wants used. A naive `email` claim would leak the wrong one to a partner running a mailing. Section 11.6 handles this.

## 0.7 Current permission and role model

Documented at length in `docs/permissions.md`; summarised here because sections 8–10 extend it rather than replace it.

```
Permission ──many──< Role >──many── User          (direct, per working year: UserRole)
                       │
                       └──many── Group(post) ──many── User
                                 (GroupRole DEFAULT|LEADER + GroupMembership, per year)
```

- A **permission** is an atomic code string. The canonical list is a TypeScript array in `packages/db/src/permissions.ts` (`PERMISSIONS`), mirrored into the `Permission` table by the seed. The registry is the source of truth; `type PermissionCode` is derived from it with `as const`, so a typo in `requirePermission("users.veiw")` is a compile error.
- Permissions are **never** assigned to users directly. Only roles carry them.
- A **role** is GUI-created in `/admin/roles`. Users get roles directly (`UserRole`) or through a post (`GroupRole`).
- Both `UserRole` and `GroupMembership` are keyed by **working year** (`year: Int`, 2026 = "26-27", cutover 15 July, `currentWorkingYear()` in `packages/auth/src/lib/workingYear.ts`). The resolver only counts the current year, so **all assignments reset by themselves at the cutover.** There is no cron job.
- `User.isSuperAdmin` is the one flag that survives the cutover and short-circuits every check.

Exactly one OAuth permission exists today, at the bottom of the registry:

```ts
// SSO provider
{ code: "sso.client.edit", labelNl: "Bewerk auth clients (SSO)",
  labelEn: "Edit auth clients (SSO)", category: "External" },
```

The 15-July reset is a genuine architectural hazard for OAuth. If an integration's owning administrator loses their role at the cutover, nobody can rotate that client's secret until roles are re-assigned, and if per-user *client* permissions (section 9) inherit the same year-scoping, every external application's user base silently empties every 15 July at 00:00 Brussels time. Section 9.5 makes this an explicit, per-permission decision rather than an accident.

## 0.8 Current session handling

`getSession(headers)` in `packages/auth/src/server/session.ts`:

1. `auth.api.getSession({ headers })`: validates the Better Auth cookie.
2. One `prisma.user.findUnique` with nested includes: memberships (this year) → group → roleGrants → role → permissions → permission, plus direct roles → role → permissions → permission.
3. Rejects if `!user.active`.
4. Unions permission codes from direct roles and post-granted roles (`LEADER` grants only apply when `membership.role === 'LEAD'`).
5. Returns a `SessionPayload`: token, expiry, a flattened `user`, `groups[]`, `permissions: string[]`, `roleIds: string[]`.

In `apps/web/lib/session.ts` this is wrapped in React `cache()` as `getCurrentSession()`, so several server components in one render share a single round-trip, with `requireSession` / `requirePermission` / `requireAnyPermission` as the gates and `authErrorResponse(err)` mapping thrown `FORBIDDEN` to 403 and everything else to 401.

`SessionPayload` is precisely the object the token-claims resolver in section 10 needs. Reuse it; do not write a second permission resolver.

**Cross-app sessions today are cookie-forwarding, not OAuth.** `packages/auth/src/remote.ts` exposes `fetchSession(headers)`, which submodule apps (`apps/logistiek`) call: it forwards the browser's `Cookie` header to `GET {VTK_MAIN_URL}/api/auth/remote/session` and gets a `SessionPayload` back. That works only because `crossSubDomainCookies` puts the cookie on `.vtk.be`, so it works for first-party subdomains and cannot work for anything else. It is the *reason* an Authorization Server is being built, and section 4.9 covers migrating `logistiek` onto OAuth without a flag day.

## 0.9 Frontend and admin architecture

- **Next.js 16 App Router**, server components by default, locale-prefixed routes `app/[locale]/…` with `hasLocale()` guarding the segment.
- **Server actions** for all mutations, returning `SaveState` (`saveOk()` / `saveError(code)`), never `void`. Expected input errors are *returned*; unexpected errors throw into the error boundary.
- **`SaveForm`** (`components/ui/SaveForm.tsx`) owns the `<form>` and submit button and renders the outcome as a toast. Success toasts auto-dismiss; error toasts stay (`duration: 0`).
- **`DeleteIconButton` / `DeleteButton`** bundle confirmation modal + icon + toast. Destructive actions must never use a bare button or native `confirm()`.
- **Row actions are icon buttons** (`IconButton` / `IconLink` + `icons.tsx`), with a mandatory `label` (becomes `title` and `aria-label`) and an `srLabel` carrying context. Primary and form buttons stay text.
- **`admin-table.tsx`** provides `useTableControls` (search/sort/expand), `SearchBar`, `SortHeader`, `Panel`, `Avatar`, `Modal`, `ToggleDot`. The four Ledenbeheer screens share one pattern: compact sortable table, rows expand into per-category editors, create/import in modals. `/admin/roles/RolesTable.tsx` is the closest model for the client screen.
- **Left nav** is a declarative tree in `app/[locale]/admin/layout.tsx`; source order equals display order, each entry carries its own guard (`{ perm }`, `{ anyPerm }`, `{ superAdminOnly }`), and a group disappears when the user may see none of its items.
- **User pickers** everywhere use the server-side typeahead `GET /api/users/search`, never a full user load.
- **Design tokens** are CSS custom properties defined once in `app/design/vtk-base.css`; admin styling is `vtk-admin.css`. Components reference tokens, never raw hex.

Section 7 draws every OAuth screen inside this system. No new UI framework, no new table component, no new form pattern.

## 0.10 Existing APIs and authorization middleware

There is no Next.js `middleware.ts` doing auth. Authorization is enforced **at each surface**: pages call `requirePermission`, server actions re-check, API routes guard explicitly and return `authErrorResponse(err)`. `apps/web/app/api/users/search/route.ts` is the reference pattern.

The auth API surface is a single catch-all, `apps/web/app/api/auth/[...all]/route.ts`, delegating to `ApiHandler()` in `packages/auth/src/apiHandlers/apiHandler.ts`, which routes on the first path segment: `better/*` → `toNextJsHandler(auth)`, `remote/*` → the session-fetch endpoint, anything else → 404. **Adding a third branch is the natural place to hang OAuth-adjacent VTK endpoints** if any are needed outside the plugin (section 16.7 concludes almost none are).

## 0.11 Existing Better Auth extensions

| Extension | File | Note |
|---|---|---|
| KU Leuven OIDC | `logins/kul.ts` (`genericOAuth`) | Registered only when env vars are present |
| Password hash/verify | `logins/password.ts` | Custom hash, sign-up disabled |
| Active-user session gate | `auth.ts` `databaseHooks.session.create.before` | Throws `FORBIDDEN`/`INACTIVE_USER` |
| Account linking | `auth.ts` `account.accountLinking` | KUL is a trusted provider |
| Additional user fields | `auth.ts` `user.additionalFields` | `avatarKey`, `locale`, `active`, `isSuperAdmin` |
| Permission-scoped session | `server/session.ts` | The VTK authorisation layer |
| Remote session fetch | `remote.ts` + `apiHandlers/` | Cookie-forwarding for subdomain apps |
| SSO client stub | `server/sso.ts` | **Empty**: checks the permission, then a comment saying to use `adminCreateOAuthClient` |

`packages/auth/src/server/sso.ts` in full:

```ts
export async function registerSSOClient(headers: Headers) {
  if (!(await hasPermission(headers, 'sso.client.edit'))) throw new AuthError('FORBIDDEN');
  //use adminCreateOAuthClient so we can also set restricted fields
}
```

The comment is the right instinct and section 5.2 implements exactly that.

## 0.12 What to reuse, what is missing

**Reuse without modification:** the plugin's entire protocol surface; the Prisma OAuth models; `getSession` / `SessionPayload`; `requirePermission` and friends; the `PERMISSIONS` registry mechanism; `SaveForm`, `DeleteIconButton`, `IconButton`, `admin-table`, `Modal`; the AdminNav guard tree; `/api/users/search`; `publicUrl()` from `@vtk/storage`; the i18n dictionaries.

**Missing, in rough dependency order:**

| # | Gap | Section |
|---|---|---|
| 1 | `/sign-in` and `/consent` routes do not exist; plugin points at 404s | 13, 18.1 |
| 2 | ~~Discovery + JWKS not mounted at host root~~ withdrawn: discovery is served under `basePath`, which is the spec-correct location for a path-carrying issuer (16.3) | 16.3, 18.1 |
| 3 | `clientPrivileges` ignores `action` | 8.4, 18.1 |
| 4 | Missing DB indexes on the three OAuth child tables | 15.4, 18.1 |
| 5 | No admin GUI for clients | 5, 7, 18.2 |
| 6 | No client metadata beyond the plugin's columns (owner group, trust tier, branding) | 5.10, 15.5 |
| 7 | No audit log | 5.8, 15.7 |
| 8 | No claim registry; no custom claims in any token | 11, 12, 18.4 |
| 9 | No per-client permission namespaces or assignments | 9, 18.5 |
| 10 | No consent customisation, no scope/claim descriptions for humans | 13, 18.3 |
| 11 | No token/session management UI, no revocation UI | 7.9, 18.6 |
| 12 | No tests of any kind for the OAuth surface | 19 |
| 13 | `sso.client.edit` is the only permission; ten more needed | 8.2 |

---

# 1. OAuth2 fundamentals

This section assumes you have built web applications and used OAuth as a *client* ("Sign in with Google"), but have never operated the other side. Every concept is introduced with the problem it solves, because OAuth2's design is almost entirely a list of answers to specific attacks.

## 1.1 The problem OAuth2 solves

Suppose the VTK Discord bot needs to know which members hold `theokot.manage`. The 1990s answer was for the member to give the bot their VTK password. This is catastrophic for reasons worth naming, because each one maps to an OAuth2 feature:

| Problem with password sharing | OAuth2's answer |
|---|---|
| The bot gets *full* account access | **Scopes**: a token limited to what was asked for |
| Access never expires | **Short-lived access tokens** |
| Revoking means changing the password, breaking every other app | **Per-client tokens and per-client revocation** |
| The user cannot see what they granted | **Consent screen and a grant list** |
| The bot must store a password in plaintext-equivalent form | **Tokens the bot can hold, that are useless elsewhere** |
| Multi-factor auth is impossible to proxy | **The user authenticates at the AS, never at the client** |

OAuth 2.0 (RFC 6749, 2012) is a **delegated authorisation** framework. Its one sentence: *a resource owner can let a third-party application access a resource server on their behalf, without giving that application their credentials.*

```
   ┌──────────┐   1. "I want to use the Discord bot"      ┌──────────────┐
   │ Resource │ ────────────────────────────────────────> │    Client    │
   │  Owner   │                                           │ (Discord bot)│
   │  (member)│ <──── 2. redirect to VTK to approve ───── └──────┬───────┘
   └────┬─────┘                                                  │
        │ 3. authenticate + consent                              │ 4. exchange
        v                                                        │    code for
   ┌──────────────────────┐                                      │    token
   │ Authorization Server │ <────────────────────────────────────┘
   │      (VTK)           │ ─────────── 5. access token ────────────┐
   └──────────────────────┘                                        │
                                                                   v
                              ┌───────────────────────────────────────┐
                              │ Resource Server (VTK API / CRM / …)   │
                              │  6. validate token, serve the data    │
                              └───────────────────────────────────────┘
```

## 1.2 Authentication versus authorisation

The distinction is the single most common source of OAuth bugs.

- **Authentication (AuthN)**: *who are you?* Output: a verified identity.
- **Authorisation (AuthZ)**: *what may you do?* Output: a permitted set of actions.

**OAuth2 is an authorisation protocol.** It was never designed to answer "who is this user". An access token says "the bearer may read the calendar"; it does not, by itself, reliably say who the bearer is. For years applications abused OAuth for login by calling some profile API and treating the returned user id as proof of identity, which is broken, because an access token issued to *app A* can be replayed by *app A* against *app B*'s profile endpoint, and B has no way to tell it was not issued for B. This is the **confused deputy** problem, and it is why OpenID Connect exists.

For VTK the split is: **KU Leuven authenticates our members** (we are an OIDC client there, via `genericOAuth`), and **VTK authorises access to VTK data** (we are the Authorization Server here). The same person can traverse both in one login: KUL proves identity, VTK proves entitlement.

## 1.3 OpenID Connect

OIDC (2014) is a thin identity layer *on top of* OAuth2. It adds:

1. **The ID Token**: a JWT, signed by the AS, with an `aud` claim naming the client it was issued to. Because the client verifies `aud` matches itself, a token stolen from another client is rejected. This is the fix for the confused deputy.
2. **The `openid` scope**: requesting it is what turns an OAuth2 request into an OIDC request.
3. **Standard claims**: `sub`, `name`, `email`, `picture`, `locale`, `birthdate`, `address`, … so clients do not need per-provider profile parsing.
4. **The UserInfo endpoint**: an OAuth-protected resource returning claims about the token's subject.
5. **Discovery**: `/.well-known/openid-configuration`.
6. **`nonce`**: replay protection for ID tokens.

The relationship in one line: **OAuth2 gives you an access token for an API; OIDC gives you, additionally, an ID token that tells you who logged in.** VTK is both, because `scopes` includes `openid`.

```
┌───────────────────── OpenID Connect ──────────────────────┐
│  ID Token · UserInfo · nonce · Discovery · standard claims│
├───────────────────────── OAuth 2.0 ───────────────────────┤
│  authorize · token · access/refresh tokens · scopes       │
├──────────────────────── HTTPS / TLS ──────────────────────┤
└───────────────────────────────────────────────────────────┘
```

## 1.4 The four roles

| Role | Definition | At VTK |
|---|---|---|
| **Resource Owner** | The entity that owns the data, usually a human | A VTK member |
| **Client** | The application requesting access | Discord bot, CRM, scheduling tool, `logistiek` |
| **Authorization Server (AS)** | Authenticates the owner and issues tokens | `vtk.be` + Better Auth OAuth provider |
| **Resource Server (RS)** | Hosts the API, validates tokens | VTK API routes; also partner-side APIs |

AS and RS are *roles*, not servers. VTK is both, in the same Next.js process: a common and entirely legitimate deployment. Keep the roles distinct in your head anyway: the AS mints tokens and knows about consent; the RS only validates tokens and knows about resources. Code that blurs them (an API route that reads the session cookie *and* a bearer token, without deciding which) is where privilege confusion creeps in.

An **Identity Provider (IdP)** is the AS in its authentication capacity: the thing that owns the login screen and the user database. VTK is an IdP for VTK members. KU Leuven is an IdP for VTK.

## 1.5 Public and confidential clients

The decisive question: **can this client keep a secret?**

**Confidential clients** run on a server the operator controls. The client secret lives in server memory or a secrets manager and is never sent to a browser. Examples: a Next.js app using server-side rendering, a Django CRM, the Discord bot's backend.

**Public clients** run on hardware the *user* controls: a SPA in a browser, a native mobile app, a CLI, a desktop app. Anything shipped to that device is readable: minified JS can be read, mobile binaries can be decompiled. Public clients therefore **have no secret at all**. Their `token_endpoint_auth_method` is `none`.

```
  Confidential                             Public
  ┌──────────────┐                         ┌──────────────┐
  │ Browser      │                         │ Browser SPA  │
  │  (no secret) │                         │  ALL code is │
  └──────┬───────┘                         │  visible     │
         │ session cookie                  └──────┬───────┘
  ┌──────▼───────┐                                │ talks to AS directly
  │ App server   │ ← secret lives here            │ no secret possible
  │  client_id + │                                │ → PKCE is mandatory
  │  client_secret                                │
  └──────┬───────┘                                │
         └────────── token endpoint ──────────────┘
```

A public client cannot prove it is itself. Anyone can send its `client_id`. All that protects the flow is (a) exact-match redirect URI registration and (b) PKCE. Both are mandatory for public clients; neither is optional in modern practice.

**VTK's position:** default every new client to confidential, require PKCE regardless, and make "public client" a deliberate switch that the GUI explains (section 5.9). `logistiek` and the Discord bot are confidential. A future member-facing SPA would be public.

## 1.6 The authorization code

An **authorization code** is a short-lived, single-use, opaque string that proves the user approved the request. It is handed to the client through the *browser* (a redirect query parameter) and exchanged for tokens over a *direct, server-to-server* HTTPS POST.

Why the indirection at all? Because the browser is a hostile transport. A redirect URL lands in browser history, in `Referer` headers, in proxy logs, in the address bar, sometimes on a shared screen. Putting an access token there, which is what the now-deprecated implicit flow did, leaks it. A code is safe there because it is useless without a second factor: the client secret (confidential clients) or the PKCE verifier (public clients). And because it is single-use, a replayed code is detectable: the AS sees a second redemption and, per RFC 6749 §4.1.2, should revoke everything issued from that code.

Plugin defaults: 10 minutes (`codeExpiresIn: 600`), single-use, bound to `client_id`, `redirect_uri`, and the PKCE challenge.

## 1.7 PKCE

**PKCE** ("pixie", RFC 7636, *Proof Key for Code Exchange*) closes the **authorization code interception attack**. On mobile, a malicious app can register the same custom URL scheme as a legitimate one and receive its redirect. On any platform, a code can leak via logs or a shady browser extension. Without PKCE, a stolen code plus a public `client_id` is a token.

PKCE makes the client prove it is the same party that *started* the flow:

```
1. Client generates a random, high-entropy string:      code_verifier
2. Client hashes it:            code_challenge = BASE64URL(SHA256(code_verifier))
3. Authorization request carries:  code_challenge, code_challenge_method=S256
                                    ── AS stores the challenge with the code ──
4. Token request carries:          code_verifier
5. AS checks:  SHA256(code_verifier) == stored code_challenge   → else reject
```

The attacker who intercepts the code never saw the verifier (it never left the client) and cannot derive it from the challenge (SHA-256 is one-way). The code is useless to them.

`code_challenge_method` must be `S256`. The alternative, `plain`, sends the verifier as the challenge and provides nothing.

**PKCE is not just for public clients.** OAuth 2.1 and RFC 9700 (*Best Current Practice*, 2025) require it for **all** clients, including confidential ones, because it also defends against code injection where the attacker has somehow obtained a valid code for a victim. The plugin exposes `requirePKCE` per client. **VTK should set it true for every client and expose it as an advanced, permission-gated override only** (section 6.8).

## 1.8 State

`state` is an opaque value the client generates, sends on the authorization request, and receives back unchanged on the redirect. Two jobs:

1. **CSRF protection.** Without it, an attacker completes an authorization flow with *their own* account, captures the resulting redirect URL (containing their code), and tricks the victim into visiting it. The victim's client redeems the attacker's code and silently links the victim's session to the attacker's identity, so anything the victim uploads goes into the attacker's account. With `state`, the client only accepts a callback whose `state` matches one it stored in *this browser's* session.
2. **Round-tripping application context**: "the user was trying to reach `/admin/tickets` when we bounced them to login".

`state` must be unguessable, bound to the user's session (cookie or session storage), single-use, and **verified before the code is redeemed**. The AS's only obligation is to echo it back verbatim, which the plugin does, including on error redirects.

## 1.9 Nonce

`nonce` is `state`'s counterpart for the **ID token**. The client generates it, sends it on the authorization request, and the AS copies it into the ID token's `nonce` claim. The client verifies it matches what it sent.

This defends against **ID token replay**: an attacker who captures a valid ID token (from logs, a compromised network, a previous session) cannot present it to the client later, because the client is expecting a `nonce` it generated for *this* login attempt and the stale token carries an old one.

`state` protects the *authorization response*; `nonce` protects the *token content*. You need both in an OIDC flow. `nonce` is REQUIRED for the implicit and hybrid flows and strongly RECOMMENDED for the code flow.

## 1.10 Access tokens

An **access token** is the credential the client presents to a resource server, as `Authorization: Bearer <token>`.

It is a **bearer** token: whoever holds it may use it, exactly like cash. There is no proof-of-possession in baseline OAuth2 (DPoP, RFC 9449, adds it; out of scope for VTK's first release, section 14.20). Every design decision around access tokens follows from bearer semantics: keep them short-lived, never put them in URLs, never log them, always require TLS.

Access tokens come in two shapes.

**JWT (structured, self-contained).** A signed JSON document the RS validates *locally* by checking the signature against the AS's public key. No network call. Payload:

```json
{
  "iss": "https://vtk.be/api/auth/better",
  "sub": "clx8f2k9a0000abcd1234",
  "aud": "https://api.vtk.be",
  "azp": "crm_7fa3b2",
  "exp": 1784563200,
  "iat": 1784559600,
  "scope": "openid profile entitlements",
  "sid": "sess_9d8c7b"
}
```

- Fast (no round-trip), scales horizontally, works across trust boundaries.
- Cannot be revoked before expiry. A JWT is valid until `exp` no matter what the AS thinks. This is *the* tradeoff, and it is why the token lifetime in section 10.6 is short for permission-bearing tokens.
- Contents are readable by anyone holding it (base64, not encrypted). Never put a secret in a JWT.

**Opaque (reference).** A random string that means nothing on its own; the RS calls the AS's introspection endpoint to learn what it represents.

- Instantly revocable: delete the row and the next introspection fails.
- Contents invisible to the client.
- Costs a network call per validation (mitigable with a short cache), and couples the RS to the AS's availability.

The plugin implements both and picks automatically: **when the token request carries a `resource` / audience that the AS can put in `aud`, it issues a signed JWT; when there is no audience to bind to, it issues an opaque token** stored in `oauthAccessToken`. The header comment on that model is explicit: opaque tokens exist "when there is no audience to assign to the JWT", they are created only at issue/refresh, destroyed at revoke, read at introspection, and never updated.

**VTK's position:** JWT access tokens for API access (`resource` = the API URL), short-lived, with permissions inside; opaque tokens are fine for the low-traffic and internal cases, and introspection is offered to partners who need immediate revocation. Section 10.7.

## 1.11 Refresh tokens

Short access token lifetimes would mean re-prompting the user every hour. A **refresh token** fixes that: a long-lived credential, presented at the token endpoint (never to a resource server), that mints a fresh access token without user interaction.

```
  t=0     authorization code  ──► access token (10 min)  +  refresh token (30 days)
  t=10m   access token expires
  t=10m   refresh token  ──► new access token (10 min)  [+ new refresh token]
  …
  t=30d   refresh token expires → the user logs in again
```

Refresh tokens are only issued when the client requests the **`offline_access`** scope (section 1.16). They are the most valuable credential in the system (a stolen refresh token is durable, silent access), so:

- Store them **hashed** at rest. The plugin does (`storeTokens: "hashed"`).
- Bind them to the client, and for public clients **rotate** on every use.
- Detect reuse: if a rotated token is presented twice, the family is compromised; revoke the whole chain.
- Allow revocation from the user's own account screen.

In the plugin's model, refresh tokens are linked to a **session** (`oauthRefreshToken.sessionId`, `onDelete: set null`) and carry `revoked: DateTime?` and `authTime`. That session link is valuable: killing a browser session can cascade to the OAuth grants it spawned. Section 14.8.

## 1.12 ID tokens

An **ID token** is a JWT asserting *that a user authenticated, and who they are*. It is for the **client**, not for any API. Never send an ID token to a resource server as a bearer credential.

```json
{
  "iss": "https://vtk.be/api/auth/better",
  "sub": "clx8f2k9a0000abcd1234",
  "aud": "crm_7fa3b2",
  "exp": 1784595600,
  "iat": 1784559600,
  "auth_time": 1784559580,
  "nonce": "n-0S6_WzA2Mj",
  "name": "Jan Janssens",
  "email": "jan.janssens@student.kuleuven.be",
  "email_verified": true,
  "sid": "sess_9d8c7b"
}
```

Mandatory client-side validation, in order: signature against the AS's JWKS; `iss` exactly matches the expected issuer; `aud` contains this client's `client_id`; `exp` in the future; `nonce` matches; `azp` equals this client if present with multiple audiences. Skipping any of these turns OIDC back into the broken pattern it was designed to replace.

`sub` is the **stable, permanent, opaque** identifier for the user at this AS. It must never be an email address (people change those) and never be reused for a different person. VTK uses the `User.id` cuid: correct.

## 1.13 JWT structure

Three base64url segments joined by dots: `header.payload.signature`.

```
eyJhbGciOiJFZERTQSIsImtpZCI6IjNmYSJ9 . eyJzdWIiOiJjbHg4ZjJrOSIsImV4cCI6MTc4 . MEUCIQD…
└────────── header ──────────────────┘ └────────── payload ──────────────────┘ └ signature ┘
```

- **Header**: `alg` (signing algorithm) and `kid` (which key, so rotation works).
- **Payload**: the claims. Registered ones (RFC 7519): `iss`, `sub`, `aud`, `exp`, `nbf`, `iat`, `jti`.
- **Signature**: over `base64url(header) + "." + base64url(payload)`.

Signing algorithms: `HS256` is symmetric (shared secret; every verifier can also *forge*), `RS256`/`ES256`/`EdDSA` are asymmetric (private key signs, public key verifies). **Asymmetric only** for an AS with more than one client; otherwise any client holding the shared secret can mint tokens for any other. The Better Auth `jwt` plugin defaults to EdDSA and stores the keypair in the `Jwks` table.

The classic JWT vulnerability is `alg: "none"` (a token declaring it needs no signature) and the `alg` confusion attack, where an attacker re-signs an RS256 token with HS256 using the *public* key as the HMAC secret. Both are defeated by pinning the accepted algorithm on the verifier and never trusting the header's `alg`. Any mature library (`jose`, which Better Auth uses) does this when you pass an expected algorithm.

## 1.14 Discovery

Rather than emailing eight URLs to every integrator, an AS publishes a JSON metadata document:

- **`/.well-known/openid-configuration`**: OpenID Connect Discovery 1.0
- **`/.well-known/oauth-authorization-server`**: RFC 8414

A client library fetches it once and configures itself. Abridged, as VTK will serve it:

```json
{
  "issuer": "https://vtk.be/api/auth/better",
  "authorization_endpoint": "https://vtk.be/api/auth/better/oauth2/authorize",
  "token_endpoint": "https://vtk.be/api/auth/better/oauth2/token",
  "userinfo_endpoint": "https://vtk.be/api/auth/better/oauth2/userinfo",
  "jwks_uri": "https://vtk.be/api/auth/better/jwks",
  "introspection_endpoint": "https://vtk.be/api/auth/better/oauth2/introspect",
  "revocation_endpoint": "https://vtk.be/api/auth/better/oauth2/revoke",
  "end_session_endpoint": "https://vtk.be/api/auth/better/oauth2/end-session",
  "scopes_supported": ["openid","profile","email","offline_access","entitlements","vtk:study"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code","refresh_token","client_credentials"],
  "code_challenge_methods_supported": ["S256"],
  "id_token_signing_alg_values_supported": ["EdDSA"],
  "subject_types_supported": ["public"],
  "token_endpoint_auth_methods_supported": ["client_secret_basic","client_secret_post"],
  "claims_supported": ["sub","iss","aud","exp","iat","name","email","picture","vtk:permissions"]
}
```

The plugin generates this (`authServerMetadata` / `oidcServerMetadata`) and `advertisedMetadata` lets us trim what is advertised: useful for scopes only a single partner may request (section 6.9). The plugin serves both under `basePath` via an `onRequest` hook, which for a path-carrying issuer is where OIDC Discovery wants them; only the RFC 8414 issuer-path form needs a proxy rewrite (16.3).

## 1.15 JWKS

The **JSON Web Key Set** at `jwks_uri` publishes the AS's *public* keys so clients and resource servers can verify signatures.

```json
{ "keys": [
  { "kty": "OKP", "crv": "Ed25519", "kid": "3fa85f64", "use": "sig", "alg": "EdDSA", "x": "11qYAY…" }
]}
```

`kid` is what makes **key rotation** non-breaking: publish the new key alongside the old, start signing with the new `kid`, and once every token signed with the old key has expired, remove it. Verifiers select by `kid`. Clients are expected to cache the JWKS and refetch on an unknown `kid` (with rate limiting, or an attacker forces unbounded refetches).

The `Jwks` Prisma model already stores `publicKey`, `privateKey`, `createdAt`, `expiresAt`: everything rotation needs. Section 14.13 specifies the procedure.

## 1.16 Scopes

A **scope** is a coarse, space-delimited label naming a category of access the *client* is asking for. `scope=openid profile email offline_access`.

Critical mental model: **a scope is a request from an application, not a grant to a user.** "This app may see your email" is a scope. "Jan may approve purchase orders" is a permission. Conflating them is the mistake that produces systems with four hundred scopes, an unreadable consent screen, and a `scope` parameter that exceeds URL length limits.

The effective access is always the **intersection**: what the client is registered for ∩ what the client requested ∩ what the user consented to ∩ what the user is actually allowed to do. The last term is invisible to OAuth and is entirely the AS's business, which is exactly where VTK's permission system plugs in (section 10).

Standard OIDC scopes and the claims they release:

| Scope | Claims |
|---|---|
| `openid` | `sub` (and makes it an OIDC request at all) |
| `profile` | `name`, `family_name`, `given_name`, `picture`, `locale`, `birthdate`, `updated_at`, … |
| `email` | `email`, `email_verified` |
| `address` | `address` |
| `phone` | `phone_number`, `phone_number_verified` |
| `offline_access` | *(no claims: requests a refresh token)* |

**`offline_access`** deserves its own note because it is frequently misunderstood. It does not release data. It asks: *may this application keep acting on my behalf when I am not present?* That is a genuinely different and larger consent than reading a name, and the consent screen must say so in those words (section 13.3). The plugin only issues a refresh token when this scope was granted.

**VTK's scope design** (section 11.2) keeps the standard set, adds a handful of coarse VTK scopes (`vtk:study`, `vtk:membership`, `entitlements`), and pushes all fine granularity into permissions rather than minting a scope per capability.

## 1.17 Claims

A **claim** is one assertion about a subject: a name/value pair in an ID token, an access token, or a UserInfo response. `"email": "jan@…"`, `"vtk:study_programmes": ["COMPUTER_SCIENCE"]`.

Scopes are the *request*; claims are the *response*. `scope=email` yields the claims `email` and `email_verified`.

Naming rules that matter for interoperability:

- **Standard claims** (OIDC Core §5.1) have fixed names *and fixed semantics*. If you emit `email`, it must be an email address. Do not repurpose a standard name.
- **Custom claims must be namespaced** to avoid collision with future standard ones. Two conventions exist: URI namespacing (`https://vtk.be/permissions`) and a short prefix (`vtk:permissions`). URIs are the letter of the spec and are what Auth0/Okta use; short prefixes are far more readable and are what Keycloak-style deployments use in practice. Section 11.4 chooses `vtk:` for VTK-specific claims and reserves the URI form for anything we ever need to hand to a third party with strict tooling.
- The plugin's docs recommend URI namespacing for `customIdTokenClaims`. We deviate deliberately and document why.

**Where should a claim go?** A three-way decision that section 11.5 formalises:

| Location | Good for | Bad for |
|---|---|---|
| ID token | Login-time identity the client needs immediately | Large or volatile data; it is cached client-side for the token's life |
| Access token | Authorisation data the RS needs on every call (permissions, roles) | Anything the RS does not need: it is sent on every request |
| UserInfo | Rich, volatile, or optional profile data | Anything needed without a network call |

## 1.18 Consent

**Consent** is the user's explicit, informed approval for a specific client to receive specific scopes. It is a legal requirement under GDPR for personal-data processing that has no other lawful basis, and a security control against **consent phishing**: where an attacker registers a plausible-looking client and lures users into granting it access.

An honest consent screen shows: which application (name, logo, publisher, and whether it is verified), what it wants in plain language (not raw scope strings), whether it will retain access while you are away (`offline_access`, called out separately), links to its privacy policy and terms, and a genuine, equally-weighted way to say no.

The plugin persists decisions in `oauthConsent` (`clientId`, `userId`, `scopes[]`, `referenceId?`). On a subsequent authorize, if the stored scopes cover the requested set, consent is skipped; if the client asks for something new, the user is re-prompted **for the delta**.

Consent can legitimately be skipped when the client is first-party: nobody expects a consent dialog moving between `vtk.be` and `logistiek.vtk.be`, both operated by VTK. That is the `skipConsent` column, and section 13.5 makes it a governed decision rather than a convenience toggle.

## 1.19 Token introspection

**RFC 7662.** A resource server posts a token to the AS and gets back its status and metadata.

```http
POST /oauth2/introspect
Authorization: Basic <base64(client_id:client_secret)>
Content-Type: application/x-www-form-urlencoded

token=2YotnFZFEjr1zCsicMWpAA&token_type_hint=access_token
```

```json
{ "active": true, "scope": "openid profile entitlements", "client_id": "crm_7fa3b2",
  "sub": "clx8f2k9a0000abcd1234", "exp": 1784563200, "token_type": "Bearer" }
```

The response is `{"active": false}` and nothing else when the token is unknown, expired, or revoked: deliberately, so introspection cannot be used as an oracle to probe token validity in bulk. The endpoint requires client authentication for the same reason.

Introspection is the answer to "JWTs cannot be revoked": a resource server that must honour revocation within seconds introspects instead of validating locally. The cost is a round-trip per request, usually softened with a 30–60 second cache. The plugin implements it and, importantly, runs `customAccessTokenClaims` for introspection responses too, so VTK's permissions appear there as well as in the JWT.

## 1.20 Revocation

**RFC 7009.** A client tells the AS to invalidate a token it holds.

```http
POST /oauth2/revoke
Authorization: Basic <base64(client_id:client_secret)>

token=<refresh_or_access_token>&token_type_hint=refresh_token
```

Always returns `200`, even for an unknown token: again to avoid an oracle. Revoking a refresh token SHOULD revoke the access tokens derived from it; the plugin's `oauthAccessToken.refreshId` foreign key makes that cascade possible.

Revocation has three distinct triggers, and a complete design handles all three:

1. **Client-initiated**: the app's logout. RFC 7009, done.
2. **User-initiated**: "disconnect this app" in the member's account screen. Deletes the `oauthConsent` row and revokes the token family. Section 7.10.
3. **Admin-initiated**: a compromised integration. Disable the client and revoke everything it holds. Section 7.9.

Note the asymmetry that catches people out: revoking an opaque access token is immediate; revoking a JWT is not, because the RS never asks. Until it expires, it is valid. This is the entire justification for short JWT lifetimes.

## 1.21 Dynamic client registration

**RFC 7591** lets a client register itself at runtime by POSTing metadata to `/oauth2/register`, receiving a `client_id` and `client_secret` back. It exists for ecosystems where clients cannot be enumerated in advance: MCP servers, federated protocols, mass-market IoT.

VTK's client population is a dozen applications, each corresponding to a real organisational relationship with a real owner. Self-registration would produce unowned, unreviewed clients and turn the consent screen into an attack surface (register "VTK Official Portal", phish members). The plugin's default is `allowDynamicClientRegistration: false`; **keep it false**, and keep `allowUnauthenticatedClientRegistration` false permanently. Section 5.11 revisits this if VTK ever hosts an MCP server, where authenticated DCR gated on a permission becomes defensible.

## 1.22 The UserInfo endpoint

An OAuth-protected resource returning claims about the access token's subject.

```http
GET /oauth2/userinfo
Authorization: Bearer <access_token>
```

```json
{ "sub": "clx8f2k9a0000abcd1234", "name": "Jan Janssens",
  "email": "jan.janssens@student.kuleuven.be", "email_verified": true,
  "picture": "https://cdn.vtk.be/avatars/…" }
```

`sub` MUST be present and MUST match the ID token's `sub`: a client that skips this check can be fed another user's profile.

Why have both ID token claims and UserInfo? The ID token is a *snapshot* at login, cached for hours; UserInfo is *live*. Put small, stable identity in the ID token and everything rich or volatile behind UserInfo. This is also the natural home for VTK's permission-gated claims (section 12.6), because UserInfo runs server-side per request and can re-evaluate the gate.

## 1.23 Concept map

```
                        ┌─────────────────────────────┐
                        │      Authorization Server   │
                        │            (VTK)            │
                        └──────────────┬──────────────┘
                                       │ publishes
              ┌────────────────────────┼────────────────────────┐
              v                        v                        v
      ┌───────────────┐      ┌──────────────────┐      ┌───────────────┐
      │   Discovery   │      │      JWKS        │      │   Endpoints   │
      │ .well-known/* │      │ public keys, kid │      │ authorize …   │
      └───────────────┘      └──────────────────┘      └───────────────┘

  ── flow ──────────────────────────────────────────────────────────────
   Client ──authorize(scope, state, nonce, PKCE challenge)──► AS
   AS ──login + consent──► User
   AS ──redirect(code, state)──► Client
   Client ──token(code, verifier, secret)──► AS
   AS ──► access token (JWT: scopes + claims + permissions)
          id token   (JWT: identity + nonce)
          refresh token (only if offline_access)
   Client ──Bearer access token──► Resource Server ──verify(JWKS | introspect)──►
```

# 2. OAuth2 flows

A **grant type** (or *flow*) is a procedure for obtaining a token. OAuth2 defined five; two are now formally deprecated, one was added later, and one is a special case with no user at all. This section walks each one, then states VTK's position.

Summary first:

| Flow | RFC | User present | Client type | VTK supports? |
|---|---|---|---|---|
| Authorization Code + PKCE | 6749 §4.1 + 7636 | Yes | Both | **Yes: the default and, for user flows, the only one** |
| Refresh Token | 6749 §6 | No | Both | **Yes: with `offline_access` and rotation for public clients** |
| Client Credentials | 6749 §4.4 | No | Confidential only | **Yes: per client, off by default** |
| Device Authorization | 8628 | Yes (other device) | Public | **Not now**: no input-constrained device use case |
| Implicit | 6749 §4.2 | Yes | Public | **No**: deprecated, insecure |
| Resource Owner Password | 6749 §4.3 | Yes | Both | **No**: deprecated, defeats the purpose |

## 2.1 Authorization Code

The original flow for confidential clients, and the foundation of everything else.

```
 User        Browser              Client (server)          Authorization Server
  │             │                       │                          │
  │ click login │                       │                          │
  ├────────────►│  GET /login           │                          │
  │             ├──────────────────────►│                          │
  │             │  302 → /oauth2/authorize?response_type=code       │
  │             │        &client_id&redirect_uri&scope&state        │
  │             │◄──────────────────────┤                          │
  │             ├─────────────────────────────────────────────────►│
  │             │                       │              (1) authenticate
  │◄────────────┤ login page            │                          │
  │ credentials │                       │                          │
  ├────────────►├─────────────────────────────────────────────────►│
  │             │                       │              (2) consent screen
  │◄────────────┤ "CRM wants profile"   │                          │
  │  approve    │                       │                          │
  ├────────────►├─────────────────────────────────────────────────►│
  │             │  302 → redirect_uri?code=…&state=…&iss=…         │
  │             │◄─────────────────────────────────────────────────┤
  │             ├──────────────────────►│                          │
  │             │                       │ (3) verify state         │
  │             │                       │ POST /oauth2/token       │
  │             │                       │  grant_type=authorization_code
  │             │                       │  code, redirect_uri,     │
  │             │                       │  client_id, client_secret│
  │             │                       ├─────────────────────────►│
  │             │                       │  { access_token, id_token,
  │             │                       │    refresh_token, … }    │
  │             │                       │◄─────────────────────────┤
  │             │  302 → app, session set│                         │
  │◄────────────┤◄──────────────────────┤                          │
```

**Authorization request** (browser navigation, `GET`):

```http
GET /api/auth/better/oauth2/authorize
  ?response_type=code
  &client_id=crm_7fa3b2
  &redirect_uri=https%3A%2F%2Fcrm.partner.be%2Fcallback
  &scope=openid%20profile%20email%20entitlements
  &state=xyzABC123
  &nonce=n-0S6_WzA2Mj
  &code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
  &code_challenge_method=S256
Host: vtk.be
```

**Successful redirect:**

```http
HTTP/1.1 302 Found
Location: https://crm.partner.be/callback?code=SplxlOBeZQQYbYS6WxSbIA
                                          &state=xyzABC123
                                          &iss=https%3A%2F%2Fvtk.be%2Fapi%2Fauth%2Fbetter
```

The `iss` parameter is RFC 9207 (*Authorization Server Issuer Identification*) and defends against **mix-up attacks**, where a client configured for several ASes is tricked into sending a code issued by a malicious AS to the honest one. The plugin emits it unconditionally: good.

**Token request** (server-to-server `POST`):

```http
POST /api/auth/better/oauth2/token
Content-Type: application/x-www-form-urlencoded
Authorization: Basic Y3JtXzdmYTNiMjpzM2NyM3Q=

grant_type=authorization_code
&code=SplxlOBeZQQYbYS6WxSbIA
&redirect_uri=https%3A%2F%2Fcrm.partner.be%2Fcallback
&code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

**Token response:**

```json
{
  "access_token": "eyJhbGciOiJFZERTQSIsImtpZCI6IjNmYSJ9…",
  "token_type": "Bearer",
  "expires_in": 600,
  "refresh_token": "vtk_rt_8f3a2b9c…",
  "id_token": "eyJhbGciOiJFZERTQSIsImtpZCI6IjNmYSJ9…",
  "scope": "openid profile email entitlements"
}
```

**Error response** (RFC 6749 §5.2), `400` with `error` from a fixed set: `invalid_request`, `invalid_client`, `invalid_grant`, `unauthorized_client`, `unsupported_grant_type`, `invalid_scope`.

**Security properties.** The token never touches the browser. The code is single-use, short-lived, and bound to `client_id` + `redirect_uri` + PKCE challenge. `state` blocks CSRF, `nonce` blocks ID-token replay, `iss` blocks mix-up.

**Attack vectors and their mitigations:**

| Attack | Mechanism | Mitigation |
|---|---|---|
| Code interception | Malicious app claims the redirect URI | PKCE |
| Code replay | Attacker redeems a captured code | Single-use + revoke-on-reuse |
| CSRF / login-CSRF | Victim redeems attacker's code | `state`, session-bound |
| Open redirect | `redirect_uri` with a wildcard or path traversal | **Exact string match**, no wildcards |
| Mix-up | Multi-AS client fooled about origin | `iss` (RFC 9207) |
| Referrer leak | Code in `Referer` from the callback page | Short TTL, single use, `Referrer-Policy` |
| ID token replay | Stale token presented later | `nonce`, `exp`, `aud` checks |

**Advantages:** tokens stay server-side; refresh tokens possible; works with client authentication; the only flow with a complete security story.
**Disadvantages:** two round-trips; requires a server (or PKCE): genuinely a non-issue.

**VTK: yes.** With PKCE mandatory. This is the flow for `logistiek`, the Discord bot's web login, the CRM, and every partner integration.

## 2.2 Authorization Code + PKCE

Not a separate flow: the same flow with two extra parameters (section 1.7). For public clients it is the *only* acceptable user-facing flow; for confidential clients RFC 9700 requires it too, because it also blocks code injection.

Sequence delta from 2.1:

```
  Client: verifier = random(43..128 chars, unreserved charset)
          challenge = BASE64URL(SHA256(verifier))
  ── authorize ──► code_challenge=<challenge>&code_challenge_method=S256
  AS: stores challenge alongside the code
  ── token ─────► code_verifier=<verifier>       (public client: no secret at all)
  AS: assert SHA256(verifier) == stored challenge, else invalid_grant
```

**VTK: yes, mandatory.** `requirePKCE = true` on every client; the GUI default is on and turning it off requires `sso.client.manage-restricted` and produces an audit entry (section 6.8).

## 2.3 Refresh token flow

```
 Client (server)                          Authorization Server
      │  POST /oauth2/token                        │
      │   grant_type=refresh_token                 │
      │   refresh_token=vtk_rt_8f3a2b9c…           │
      │   scope=openid profile          (optional, ⊆ original)
      │   Authorization: Basic <client creds>      │
      ├───────────────────────────────────────────►│
      │                                  ┌─────────┴─────────┐
      │                                  │ hash & look up    │
      │                                  │ not revoked?      │
      │                                  │ not expired?      │
      │                                  │ client matches?   │
      │                                  │ session alive?    │
      │                                  │ re-resolve claims │
      │                                  └─────────┬─────────┘
      │   { access_token, expires_in, [refresh_token], … }
      │◄───────────────────────────────────────────┤
```

The single most important property for VTK: **claims are recomputed on refresh.** The plugin calls `customAccessTokenClaims` again, so a permission granted or revoked in the admin GUI is reflected in the next refreshed token without any custom synchronisation protocol. This is the load-bearing fact behind section 10's recommendation.

**Rotation.** RFC 9700 requires that public clients get a *new* refresh token on every use, with the old one invalidated. If an old token is ever presented again, either the legitimate client retried or an attacker is replaying a stolen token; the AS cannot tell, so it must revoke the entire family. Confidential clients may keep a static refresh token because they can authenticate: though rotation is still recommended.

**Attack vectors:** refresh token theft (mitigate: hash at rest, rotate, detect reuse, bind to session and client, allow user revocation); overly long lifetimes (30 days, matching the browser session, is reasonable for VTK); scope escalation on refresh (the AS must reject a `scope` not a subset of the original: the plugin does).

**VTK: yes**, gated on `offline_access`, 30-day lifetime, rotation on for public clients, and a per-client refresh policy in the GUI (section 6.10).

## 2.4 Client credentials

No user. The client authenticates as *itself* and receives a token representing the application.

```
 Service                                  Authorization Server
   │ POST /oauth2/token                            │
   │  grant_type=client_credentials                │
   │  scope=crm.sync                               │
   │  Authorization: Basic <client_id:secret>      │
   ├──────────────────────────────────────────────►│
   │  { access_token, token_type, expires_in }     │
   │◄──────────────────────────────────────────────┤     (no id_token,
   │                                               │      no refresh_token)
```

There is no refresh token, because the client can simply request a new one; and no ID token, because there is no user to identify. The `sub` is the client itself.

**Use cases at VTK:** a nightly job pulling the mailing-list export; the Discord bot syncing role assignments without a member present; a partner's server-to-server data pull.

**Security:** the client secret is the *only* credential, so it is a permanent, high-value key. Compromise means full access to whatever the client is scoped for, with no user in the loop and nothing to revoke except the client. Mitigations: confidential clients only (the plugin refuses public clients here); a scope set distinct from and narrower than the user-facing one; short token lifetime (`m2mAccessTokenExpiresIn`); mandatory secret rotation policy; IP allow-listing where the partner has stable egress.

**Advantages:** simple, no user interaction, correct for machine-to-machine.
**Disadvantages:** no user context, so it cannot express "on behalf of Jan"; a leaked secret is total compromise; easy to over-scope.

**VTK: yes, but off by default per client.** `grantTypes` currently allows it server-wide; section 5.7 makes it a per-client checkbox that requires `sso.client.manage-restricted`, and section 9.9 forbids client-credentials tokens from ever carrying a `permissions` claim: there is no user, so per-user permissions are meaningless and emitting them would be a privilege-escalation footgun.

## 2.5 Device authorization flow

**RFC 8628**, for devices with no browser or no keyboard: a TV, a printer, a CLI on a headless box.

```
 Device                    AS                       User's phone
   │ POST /device_authorization                          │
   │  client_id, scope    │                              │
   ├─────────────────────►│                              │
   │ { device_code,       │                              │
   │   user_code: "WDJB-MJHT",                           │
   │   verification_uri: "https://vtk.be/device",        │
   │   interval: 5, expires_in: 1800 }                   │
   │◄─────────────────────┤                              │
   │                      │                              │
   │ shows "go to vtk.be/device, enter WDJB-MJHT"        │
   ├─────────────────────────────────────────────────────►
   │                      │◄─── user visits, logs in, ───┤
   │                      │     enters code, consents    │
   │ poll POST /token     │                              │
   │  grant_type=urn:ietf:params:oauth:grant-type:device_code
   │  device_code=…       │                              │
   ├─────────────────────►│  authorization_pending       │
   ├─────────────────────►│  slow_down                   │
   ├─────────────────────►│  { access_token, … }         │
```

**Security:** the `user_code` must be short enough to type and long enough to resist brute force (RFC 8628 recommends ≥20 bits of entropy plus rate limiting); the device polls, so `slow_down` and `interval` matter; and the flow is inherently phishable: an attacker can display a real `user_code` from *their* device session and ask a victim to approve it, which is why the verification page must state clearly what is being authorised.

**VTK: not now.** VTK has no input-constrained devices; ticket scanners (`TicketScanDevice`) are phone-based with a browser. The `@better-auth/oauth-provider` plugin does not implement device flow: Better Auth ships a separate `device-authorization` plugin. Adding it later is an isolated change (add the plugin, add a `/device` page, add the grant type to the per-client list) with no impact on this design. Revisit if VTK ever ships a Theokot kiosk or a physical bar terminal.

## 2.6 Implicit flow

**Deprecated.** Historically, browser apps could not make cross-origin token requests (pre-CORS), so the AS returned the access token *directly in the redirect fragment*:

```
https://app.example.com/callback#access_token=eyJ…&token_type=Bearer&expires_in=3600
```

Why it is dead: the token appears in the URL (history, `Referer`, screen, logs); there is no client authentication and no PKCE, so token injection is trivial; no refresh token is possible, so lifetimes get stretched dangerously long; and the fragment is accessible to any script on the page. CORS solved the original problem in 2014. OAuth 2.1 removes the flow entirely; RFC 9700 says do not use it.

**VTK: no.** The plugin's `response_types_supported` is `["code"]` only, so this is already structurally impossible. Nothing to do; but if a partner's SDK asks for `response_type=token`, the answer is "use code + PKCE", and section 16.2 documents the error they will see.

## 2.7 Resource owner password credentials

**Deprecated.** The client collects the user's username and password and posts them to the token endpoint:

```http
POST /oauth2/token
grant_type=password&username=jan&password=hunter2&scope=…
```

This is password sharing with extra steps: precisely what OAuth2 was invented to eliminate. It defeats MFA, it defeats federated login (a VTK member's credentials live at KU Leuven, not at VTK, so this could not work here even in principle), it trains users to type their password into third-party UIs, and it makes every client a credential-handling system subject to the same scrutiny as the AS.

**VTK: no, permanently.** The plugin does not implement it. If a partner asks, the answer is authorization code for user flows and client credentials for machine flows.

## 2.8 Choosing a flow

```
                 Is a human present and consenting?
                     │                        │
                    yes                       no
                     │                        │
        ┌────────────┴────────────┐           │
        │                         │           v
   Browser/native/SPA?    Input-constrained   Client Credentials
        │                  device?            (confidential only)
        v                       │
  Authorization Code            v
     + PKCE                Device Flow
        │                  (not at VTK)
        v
  Need access while the user is away?
        │
       yes ──► also request offline_access → refresh token
```

Applied to VTK's known and likely clients:

| Client | Type | Flow | Grants |
|---|---|---|---|
| `logistiek` (subdomain app) | Confidential web | Code + PKCE | `authorization_code`, `refresh_token` |
| Discord bot: member login | Confidential web | Code + PKCE | `authorization_code` |
| Discord bot: role sync job | Confidential service | Client credentials | `client_credentials` |
| Partner CRM | Confidential web | Code + PKCE | `authorization_code`, `refresh_token` |
| Scheduling tool | Confidential web | Code + PKCE | `authorization_code`, `refresh_token` |
| Future member SPA | Public | Code + PKCE | `authorization_code`, `refresh_token` (rotating) |
| Nightly export job | Confidential service | Client credentials | `client_credentials` |

---

# 3. The Better Auth OAuth2 plugin

This section documents `@better-auth/oauth-provider` v1.6.x as installed, so that later sections can say "call this" rather than "implement this". Everything here was read from `packages/auth/node_modules/@better-auth/oauth-provider/dist/`.

## 3.1 How Better Auth implements OAuth2

Better Auth is a plugin-composed auth framework. `betterAuth(config)` returns an object with an `api` surface built from every plugin's endpoint list; `toNextJsHandler(auth)` mounts that surface as Next.js route handlers. Endpoints are declared with `createAuthEndpoint(path, { method, body, query, use: [middleware], metadata }, handler)`, which gives Zod-validated input, typed output, an OpenAPI description, and, critically for VTK, a **direct server-side call path**: `auth.api.<endpointName>({ body, headers })` invokes the same handler in-process, with no HTTP.

Some endpoints are marked `metadata: { SERVER_ONLY: true }`. These are *excluded from the HTTP router* and reachable only via `auth.api.*`. The two `/admin/oauth2/*` client endpoints are marked this way, which is exactly the property VTK's server actions need: privileged operations that can never be reached by a crafted request from the internet.

Storage goes through Better Auth's **adapter** abstraction (`ctx.context.adapter.create/update/findOne/findMany/delete`), which the Prisma adapter maps onto the models generated from each plugin's `schema` declaration. The plugin therefore never writes SQL and never imports Prisma; VTK's Prisma models are the *materialisation* of the plugin's declared schema (section 15.2).

## 3.2 How it implements OIDC

OIDC support is conditional on `"openid"` being present in `scopes`, which it is, by default. When present:

- `oidcServerMetadata()` serves the full OpenID Discovery document (superset of the RFC 8414 one).
- The authorize endpoint honours `nonce`, `prompt`, `max_age`, `display`, `login_hint`, `id_token_hint`.
- The token endpoint returns an `id_token` alongside the access token.
- `/oauth2/userinfo` serves standard claims filtered by granted scope.
- `/oauth2/end-session` implements RP-Initiated Logout, gated per client by the `enableEndSession` column.
- `subject_type` supports `public` and `pairwise`; pairwise requires `pairwiseSecret` to be configured (it is not, today).

ID tokens are signed by the `jwt` plugin's key set (EdDSA by default, keys in the `Jwks` table) unless `disableJwtPlugin: true`, in which case they fall back to HS256 with the client secret as the key.

## 3.3 Plugin architecture

```
oauthProvider(options)
   │
   ├── schema        4 models: oauthClient, oauthAccessToken,
   │                 oauthRefreshToken, oauthConsent
   │
   ├── endpoints     protocol:  /oauth2/authorize  /token  /introspect
   │                            /revoke  /userinfo  /end-session  /register
   │                 flow:      /oauth2/consent  /oauth2/continue
   │                 client:    /oauth2/{create,update,get,get-clients,delete}-client
   │                            /oauth2/client/rotate-secret
   │                            /oauth2/{public-client,public-client-prelogin}
   │                 consent:   /oauth2/{get,get-all,update,delete}-consent
   │                 admin:     /admin/oauth2/create-client   (SERVER_ONLY)
   │                            /admin/oauth2/update-client   (SERVER_ONLY)
   │                 metadata:  /.well-known/oauth-authorization-server
   │                            /.well-known/openid-configuration
   │
   ├── hooks         clientPrivileges · clientReference
   │                 customAccessTokenClaims · customIdTokenClaims
   │                 customUserInfoClaims · customTokenResponseFields
   │                 formatRefreshToken · storeClientSecret · storeTokens
   │                 generateClientId/Secret/OpaqueAccessToken/RefreshToken
   │                 requestUriResolver
   │                 signup.shouldRedirect · selectAccount.shouldRedirect
   │                 postLogin.shouldRedirect · postLogin.consentReferenceId
   │
   ├── rateLimit     per-endpoint window/max
   │
   └── exports       oauthProviderAuthServerMetadata()
                     oauthProviderOpenIdConfigMetadata()
                     authServerMetadata() · oidcServerMetadata()
                     mcpHandler() · getOAuthProviderState()
```

## 3.4 Existing database models

Declared in the plugin's `schema` and already migrated into `schema.prisma`. Field-level documentation is in section 15.2; the shape:

| Model | Purpose | Key fields |
|---|---|---|
| `oauthClient` | Registered applications | `clientId` (unique), `clientSecret` (hashed), `disabled`, `skipConsent`, `requirePKCE`, `public`, `redirectUris[]`, `grantTypes[]`, `scopes[]`, `metadata` (JSON), `userId`/`referenceId` (owner) |
| `oauthAccessToken` | Opaque access tokens | `token` (unique, hashed), `clientId`, `userId?`, `sessionId?`, `refreshId?`, `scopes[]`, `expiresAt` |
| `oauthRefreshToken` | Refresh tokens | `token` (hashed), `clientId`, `userId`, `sessionId?`, `scopes[]`, `revoked?`, `authTime?`, `expiresAt` |
| `oauthConsent` | Persisted consent decisions | `clientId`, `userId`, `scopes[]`, `referenceId?`, timestamps |

Three design notes worth internalising, because VTK's extensions depend on them:

1. **`oauthClient.metadata` is a free-form JSON column.** It is round-tripped by the create/update endpoints and, crucially, is passed into `customAccessTokenClaims`, `customIdTokenClaims`, and `customTokenResponseFields` as `metadata`. It is therefore a *sanctioned* extension point for per-client configuration that the claim resolver needs at token time: no join required. Section 5.10 and 15.5 decide exactly what goes there versus in a relational table.
2. **Authorization codes are not a model.** They live in the `verification` table (Better Auth's generic short-lived-value store) as a signed, serialised `VerificationValue` containing the original query, session id, and reference id. There is nothing to migrate and nothing to clean up beyond Better Auth's own expiry sweep.
3. **Tokens link to `session`.** `oauthAccessToken.sessionId` and `oauthRefreshToken.sessionId` both reference the browser session with `onDelete: set null`. The plugin's own comment says access tokens are session-linked and "better-auth authors SHALL always check for valid session". This gives VTK a cheap, powerful lever: killing a member's session can be made to cascade into their OAuth grants (section 14.8).

## 3.5 Existing endpoints and middleware

Middleware in use:

- **`sessionMiddleware`**: on `/oauth2/authorize`, `/consent`, `/continue`, `/end-session`, and all session-scoped client/consent endpoints. Requires a valid Better Auth cookie; this is why the *browser* session is the root of trust for every user-facing OAuth step.
- **Client authentication**: on `/token`, `/introspect`, `/revoke`. Accepts `client_secret_basic` (HTTP Basic) and `client_secret_post` (form body); `none` for registered public clients.
- **Rate limiting**: per endpoint, from `options.rateLimit`.

Two behaviours worth knowing precisely, because VTK's consent page depends on them:

**Signed flow state.** When the authorize endpoint needs to bounce the user to a page (login, consent, select-account, signup, post-login), it does not store server-side state. It serialises the entire authorization query, appends `exp` and an issued-at, and **HMAC-signs it with `ctx.context.secret`**, then redirects to `?<params>&sig=<signature>`. The page must pass that whole query string back as `oauth_query` when calling `/oauth2/consent` or `/oauth2/continue`. The consequence for VTK: **the consent page must not reconstruct or edit the query: it must round-trip it verbatim.** Any tampering invalidates the signature. This is also why the consent page cannot be a purely static form; it needs the raw query string.

**Consent short-circuit.** `runOAuth2Authorize` checks `client.skipConsent` and, if set, redirects straight to the redirect URI with a code, never rendering consent. Otherwise it looks up `oauthConsent` for (client, user); if the stored scopes cover the request, it also proceeds. Only a genuine delta reaches the consent page.

**Scope validation** happens at authorize: requested scopes are intersected with the client's registered `scopes[]` and the server's `scopes` option; anything left over produces a redirect with `error=invalid_scope` and the offending scope names in `error_description`.

## 3.6 Hooks and extension points

The options interface (`OAuthOptions`) is the whole extension surface. The ones VTK will use, with exact signatures:

```ts
clientPrivileges?: (ctx: {
  headers: Headers;
  action: "create" | "read" | "update" | "delete" | "list" | "rotate";
  user?: User & Record<string, unknown>;
  session?: Session & Record<string, unknown>;
}) => Awaitable<boolean | undefined>;

customAccessTokenClaims?: (info: {
  user?: (User & Record<string, unknown>) | null;
  referenceId?: string;
  scopes: Scopes;
  resource?: string;
  metadata?: Record<string, any>;   // oauthClient.metadata
}) => Awaitable<Record<string, any>>;

customIdTokenClaims?: (info: {
  user: User & Record<string, unknown>;
  scopes: Scopes;
  metadata?: Record<string, any>;
}) => Awaitable<Record<string, any>>;

customUserInfoClaims?: (info: {
  user: User & Record<string, unknown>;
  scopes: Scopes;
  jwt: JWTPayload;                  // the access token payload
}) => Awaitable<Record<string, any>>;

customTokenResponseFields?: (info: {
  grantType: GrantType;
  user?: (User & Record<string, unknown>) | null;
  scopes: Scopes;
  metadata?: Record<string, any>;
  verificationValue?: VerificationValue;
}) => Awaitable<Record<string, unknown>>;

clientReference?: (ctx: { user?; session? }) => Awaitable<string | undefined>;
```

Plus the non-callback levers: `scopes`, `scopeExpirations`, `validAudiences`, `advertisedMetadata`, `prefix`, `cachedTrustedClients`, `storeClientSecret`, `storeTokens`, `pairwiseSecret`, `rateLimit`, `grantTypes`, `accessTokenExpiresIn` and siblings.

Read `customAccessTokenClaims`' own doc comment carefully, because it states VTK's design in the plugin's words:

> *Use the user and referenceId fields to fetch for membership roles/permissions to attach for the token. Note that scopes are those that requested, permissions are what the user can actually do which must be done in this function.*

The plugin author explicitly intends this hook to be where an application's permission model meets the token. Section 10 takes them up on it.

## 3.7 Configuration reference

Options grouped by what they control, with VTK's target value. "current" = what is in effect today on the branch.

| Option | Current | Target | Section |
|---|---|---|---|
| `loginPage` | `/sign-in` (404) | `/nl/aanmelden` resolver | 13.7 |
| `consentPage` | `/consent` (404) | `/nl/toestemming` resolver | 13.7 |
| `scopes` | default 4 | + `entitlements`, `vtk:study`, `vtk:membership`, `vtk:contact` | 11.2 |
| `grantTypes` | default 3 | unchanged (restricted per client) | 5.7 |
| `accessTokenExpiresIn` | 3600 | 3600 | 10.6 |
| `scopeExpirations` | unset | `{ entitlements: 600 }` | 10.6 |
| `m2mAccessTokenExpiresIn` | 3600 | 900 | 2.4 |
| `refreshTokenExpiresIn` | 2592000 | 2592000 | 2.3 |
| `clientPrivileges` | one permission, all actions | per-action mapping | 8.4 |
| `customAccessTokenClaims` | unset | permissions + roles resolver | 10.5 |
| `customIdTokenClaims` | unset | identity claims from registry | 12.5 |
| `customUserInfoClaims` | unset | full registry, gate-evaluated | 12.6 |
| `advertisedMetadata` | unset | trim partner-only scopes | 6.9 |
| `prefix` | unset | `vtk_at_`, `vtk_rt_`, `vtk_cs_` | 14.10 |
| `pairwiseSecret` | unset | set from env | 14.16 |
| `cachedTrustedClients` | unset | internal client ids | 4.7 |
| `allowDynamicClientRegistration` | false | false | 5.11 |
| `storeClientSecret` | `"hashed"` | `"hashed"` | 5.3 |
| `rateLimit` | defaults | introspect raised if adopted | 14.11 |

## 3.8 Limitations

Honest accounting of what the plugin does *not* do, and VTK's response.

| Limitation | Impact | Response |
|---|---|---|
| No authorization-server-side permission model | Permissions must be resolved in `customAccessTokenClaims` | By design: sections 9, 10 |
| No claim registry; claims are code callbacks | Adding a claim means editing a function | VTK builds a DB-driven registry *inside* the callback: section 12 |
| No consent UI | Must be built | Section 13 |
| No admin UI | Must be built | Sections 5, 7 |
| No audit log | No record of who changed a client | VTK table: section 15.7 |
| No Rich Authorization Requests (RFC 9396) | Cannot express fine-grained per-resource authorisation in the request | Not needed; section 9.10 explains why |
| No Pushed Authorization Requests (RFC 9126) natively | Long/sensitive requests go in the URL | `requestUriResolver` hook allows adding PAR later: section 14.21 |
| No device flow | Cannot authorise a TV/kiosk | Separate Better Auth plugin if ever needed: section 2.5 |
| No DPoP / mTLS sender constraining | Tokens are pure bearer | Out of scope; section 14.20 |
| No token exchange (RFC 8693) | Cannot swap a token for a downscoped one | Not needed today |
| No built-in "list all tokens for user" endpoint | Admin token screen needs direct Prisma reads | Acceptable; VTK owns the DB: section 7.9 |
| `clientPrivileges` returns a boolean only | Cannot express "may edit these fields but not those" | VTK enforces field-level policy in the server action *before* calling the endpoint: section 6.2 |
| Consent stores scopes only, not claims | Claim-level consent is not persisted by the plugin | VTK adds `SsoConsentDetail`: section 13.9 |

The last two are the only ones that force VTK-side structure rather than mere configuration, and both are contained.

## 3.9 Integration pseudo-code

How VTK's code should meet the plugin. Pseudo-code: intentionally not compilable.

**A. Configuration** (`packages/auth/src/auth.ts`)

```
oauthProvider({
  loginPage:   ssoPage("aanmelden"),      // locale-aware, section 13.7
  consentPage: ssoPage("toestemming"),

  scopes: VTK_SCOPES,                     // from the scope registry, section 11.2
  scopeExpirations: { entitlements: 600 },
  prefix: { opaqueAccessToken: "vtk_at_", refreshToken: "vtk_rt_", clientSecret: "vtk_cs_" },
  pairwiseSecret: env.OAUTH_PAIRWISE_SECRET,

  clientPrivileges: ({ headers, action }) =>
      can(headers, CLIENT_ACTION_PERMISSION[action]),      // section 8.4

  customAccessTokenClaims: (info) => resolveAccessTokenClaims(info),   // section 10.5
  customIdTokenClaims:     (info) => resolveIdTokenClaims(info),       // section 12.5
  customUserInfoClaims:    (info) => resolveUserInfoClaims(info),      // section 12.6
})
```

**B. Admin create, from a server action**

```
async function createClientAction(prev, formData):
    session = await requirePermission("oauth.client.create")
    input   = parseAndValidate(formData)                  // section 5.12
    if input.usesRestrictedFields and not can(session, "oauth.client.manage-restricted"):
        return saveError("RESTRICTED_FIELD_DENIED")

    result = await auth.api.adminCreateOAuthClient({
        body: {
          client_name: input.name,
          redirect_uris: input.redirectUris,
          grant_types: input.grantTypes,
          token_endpoint_auth_method: input.public ? "none" : "client_secret_basic",
          require_pkce: true,
          skip_consent: input.trustTier == "internal",
          scope: input.scopes.join(" "),
          metadata: buildClientMetadata(input),           // section 5.10
        },
        headers: await headers(),
    })

    await db.ssoClientProfile.create({ clientId: result.client_id, ...input.profile })
    await audit("oauth.client.created", session, { clientId: result.client_id })
    revalidatePath("/admin/sso")
    return saveOkWithSecret(result.client_secret)         // shown once, section 5.3
```

**C. Claims resolution** (the heart of it, expanded in sections 10 and 12)

```
async function resolveAccessTokenClaims({ user, scopes, resource, metadata }):
    if not user: return {}                       // client_credentials → no user claims
    claims = {}

    if "entitlements" in scopes:
        vtk = await resolveVtkSession(user.id)   // reuses getSession's resolver
        claims["vtk:roles"]       = vtk.roleCodes
        claims["vtk:permissions"] = vtk.permissions
        claims["permissions"]     = await clientPermissions(metadata.clientId, user.id)

    claims["vtk:groups"] = vtk.groups.map(g => g.code)   if "vtk:membership" in scopes
    return claims
```

**D. Consent page** (section 13.7)

```
page /[locale]/toestemming:
    raw   = the full incoming query string          // NEVER rebuild it
    query = parseSigned(raw)                        // client_id, scope, …
    client  = await auth.api.getOAuthClientPublic({ query: { client_id: query.client_id } })
    profile = await db.ssoClientProfile.find(query.client_id)
    render ConsentScreen(client, profile, describeScopes(query.scope), rawQuery = raw)

action approve(rawQuery, acceptedScopes):
    await auth.api.oauth2Consent({
      body: { accept: true, scope: acceptedScopes.join(" "), oauth_query: rawQuery },
      headers: await headers(),
    })
    // response contains redirect_uri → redirect the browser there
```

# 4. High-level architecture

## 4.1 System context

```
┌────────────────────────────────────────────────────────────────────────────┐
│                              BROWSER                                       │
│   member  ·  vtk.be  ·  logistiek.vtk.be  ·  crm.partner.be  ·  Discord    │
└───────┬────────────────────────────────────────────────────────────────────┘
         │ cookie (vtk*, .vtk.be)          │ OAuth redirects
         v                                 v
┌────────────────────────────────────────────────────────────────────────────┐
│                       apps/web   (Next.js 16)                              │
│                                                                            │
│  Public site        /admin surface        OAuth pages                      │
│  + member portal    /admin/sso/*          /aanmelden  /toestemming         │
│                          │ server actions      │ oauth_query               │
│ ────────────────────────────────────────────────────────────────────────── │
│                  packages/auth  :  betterAuth()                            │
│  genericOAuth       jwt              @better-auth/oauth-provider           │
│  (KU Leuven is      Jwks, EdDSA      authorize  token  introspect          │
│   our IdP)                           revoke  userinfo  end-session         │
│                                      consent  continue  client CRUD        │
│                                      │ hooks                               │
│ ────────────────────────────────────────────────────────────────────────── │
│           VTK POLICY LAYER   (new, specified by this document)             │
│  Permission    Claim        Consent      Client      Audit                 │
│  resolver      registry     describer    policy      logger                │
│       │            │            │           │           │                  │
│ ────────────────────────────────────────────────────────────────────────── │
│              packages/db  :  Prisma  ->  PostgreSQL                        │
│  user session account jwks   |  oauthClient  oauthAccessToken              │
│  permission role userRole    |  oauthRefreshToken  oauthConsent            │
│  group groupRole membership  |  ssoClientProfile  ssoClientPermission      │
│                              |  ssoUserClientPermission  ssoClaim          │
│                              |  ssoScope  ssoAuditLog                      │
└────────────────────────────────────────────────────────────────────────────┘
     ▲                        ▲                          ▲
     │ Bearer JWT             │ Bearer / introspect      │ client_credentials
  Internal apps           Partner apps              Machine clients
  logistiek, …            CRM, scheduling           Discord sync, jobs
  skipConsent=on          skipConsent=off           no user context
```

## 4.2 Components

**Users.** VTK members, authenticated by KU Leuven OIDC (or password for legacy/service accounts). Identity lives in `User`; entitlement lives in roles and posts, resolved per working year.

**Browser.** The only place the resource owner exists. All user-facing OAuth steps are browser redirects; the Better Auth session cookie (`vtk*`, domain `.vtk.be` in production) is the root of trust for authorize, consent, and continue.

**Authorization Server.** `apps/web` running the Better Auth instance from `packages/auth`. Not a separate deployment: co-locating the AS with the member portal means the login page, the consent page, and the user database are the same system, which removes an entire class of session-synchronisation bugs. If VTK later needs the AS on its own host, the only coupling to break is direct Prisma access from the policy layer.

**Better Auth core.** Session lifecycle, KU Leuven federation, account linking, the `active` gate in `databaseHooks.session.create.before`, the JWT key set.

**OAuth2 plugin.** Every protocol endpoint. Treated as a black box with a documented option surface.

**VTK policy layer.** The new code this document specifies. Five collaborators:

- *Permission resolver*: turns (user, client, scopes) into role and permission claims. Wraps the existing `getSession` resolution and adds per-client permissions.
- *Claim registry*: turns the `SsoClaim` table plus the user record into a claim bag for ID token / access token / UserInfo, applying transformers and permission gates.
- *Consent describer*: turns scope and permission codes into human sentences in NL/EN for the consent screen.
- *Client policy*: validates and normalises client configuration on write; decides which fields are restricted.
- *Audit logger*: append-only record of every administrative change and every security-relevant event.

**Internal applications.** First-party apps on `*.vtk.be`. Confidential, `skipConsent = true`, trust tier `internal`. Today `logistiek` uses cookie forwarding; section 4.9 migrates it.

**External applications.** Partner-operated. Confidential or public, `skipConsent = false` always, narrow scopes, explicit permission namespace, named owner, and a review date.

**Resource servers.** VTK API routes under `apps/web/app/api/**` that accept a Bearer token instead of (or in addition to) a cookie; plus partner-side APIs that accept VTK tokens. Section 4.6.

**Database.** One PostgreSQL instance. The OAuth tables sit alongside the domain tables, which is what makes the permission and claim joins cheap.

## 4.3 Authorization request, end to end

```
 Member    Browser         CRM (client)      VTK AS         Policy layer      DB
   │          │                 │              │                 │            │
   │ "log in" │                 │              │                 │            │
   ├─────────►├────────────────►│              │                 │            │
   │          │  302 authorize? │              │                 │            │
   │          │◄────────────────┤              │                 │            │
   │          ├────────────────────────────────►│                │            │
   │          │                 │   session cookie present?      │            │
   │          │                 │              ├────────────────────────────► │
   │          │                 │              │◄── session, user ─────────── │
   │          │   no session → 302 /aanmelden?<signed query>      │            │
   │          │◄───────────────────────────────┤                 │            │
   │  login   │                 │              │                 │            │
   ├─────────►├─── KU Leuven OIDC round-trip ──┤                 │            │
   │          ├────────────────────────────────►│  back at authorize          │
   │          │                 │  validate client, redirect_uri, scopes      │
   │          │                 │  skipConsent? consent row covers scopes?    │
   │          │   no → 302 /toestemming?<signed query>            │            │
   │          │◄───────────────────────────────┤                 │            │
   │          │  consent page: describe scopes ├────────────────►│            │
   │          │◄─────────────── NL/EN sentences ┤◄─ ssoScope, ssoClaim ────── │
   │ approve  │                 │              │                 │            │
   ├─────────►│  POST /oauth2/consent (accept, oauth_query)      │            │
   │          ├────────────────────────────────►│                │            │
   │          │                 │   write oauthConsent, mint code│            │
   │          │                 │              ├────────────────────────────► │
   │          │  302 redirect_uri?code&state&iss│                │            │
   │          │◄───────────────────────────────┤                 │            │
   │          ├────────────────►│              │                 │            │
   │          │                 │ POST /oauth2/token (code, verifier, secret) │
   │          │                 ├─────────────►│                 │            │
   │          │                 │              │ customAccessTokenClaims      │
   │          │                 │              ├────────────────►│            │
   │          │                 │              │      resolve roles,          │
   │          │                 │              │      permissions, claims ──► │
   │          │                 │              │◄────────────────┤            │
   │          │                 │◄─ access + id + refresh token ─┤            │
   │          │  app session set│              │                 │            │
   │◄─────────┤◄────────────────┤              │                 │            │
```

## 4.4 Permission system interaction

The permission system is consulted at three distinct moments, and keeping them separate prevents the usual muddle:

```
  ① ADMIN-TIME     "may this admin create/edit/delete a client?"
                   → existing role/permission system, oauth.* codes
                   → clientPrivileges + requirePermission in server actions

  ② CONSENT-TIME   "may this user grant these scopes to this client?"
                   → client's allowed scope set ∩ requested ∩ user-visible
                   → some scopes are admin-only and never offered to a member

  ③ TOKEN-TIME     "what may this user actually do in this client?"
                   → VTK permissions (roles/posts, current working year)
                   → plus per-client permissions (SsoUserClientPermission)
                   → emitted as claims, recomputed on every token and refresh
```

Failure to distinguish ① and ③ is the most common design error in this space: it produces a system where being able to *administer* an integration implies having *access through* it.

## 4.5 Claim system interaction

```
    User row ──┐
               │   ┌──────────────────────────────────────────┐
  SsoClaim  ───┼──►│  Claim resolver                          │
  (registry)   │   │   1. select claims for granted scopes    │──► ID token claims
               │   │   2. evaluate permission gate per claim  │──► access token claims
  Session   ───┘   │   3. read source field(s)                │──► UserInfo response
  (roles,          │   4. apply transformer                   │
   permissions)    │   5. drop empty / gated-out              │
                   └──────────────────────────────────────────┘
```

One registry, three consumers, one gate evaluation per claim per request. Section 12.

## 4.6 Resource server pattern

A VTK API route that must serve both a cookie session (the member portal) and a Bearer token (an OAuth client) should decide *explicitly* which it is honouring:

```
async function authorizeRequest(request):
    bearer = readBearer(request.headers)
    if bearer:
        payload = await verifyAccessToken(bearer, { audience: THIS_API })   // JWKS, local
        assertScope(payload, requiredScope)
        return { kind: "oauth", userId: payload.sub, permissions: payload["permissions"] ?? [] }

    session = await getSession(request.headers)                 // cookie path
    if session: return { kind: "session", userId: session.user.id,
                         permissions: session.permissions }

    throw AuthError("UNAUTHENTICATED")
```

Two rules that keep this safe. **Never fall back from a failed Bearer to the cookie**: if a Bearer header is present and invalid, reject; otherwise an attacker can strip a token and ride the victim's ambient cookie. And **always check scope in addition to permission**: a token that lacks the `entitlements` scope carries no `permissions` claim, and code that treats an absent claim as "no restriction" fails open.

`verifyAccessToken` is exported by `better-auth/oauth2` and used by the plugin's own `mcpHandler`; VTK should wrap it once in `packages/auth/src/server/resource.ts` rather than repeating JWKS handling per route.

## 4.7 Trust tiers

Three tiers, materialised as `SsoClientProfile.trustTier`:

| Tier | Consent | Scopes | Secret rotation | Review |
|---|---|---|---|---|
| `internal` | skipped | may request any registered scope | 12 months | annual |
| `partner` | always shown | explicit allow-list, no wildcards | 6 months | 6-monthly |
| `restricted` | always shown, with a warning banner | minimal, admin-approved per scope | 3 months | quarterly |

Tier is not cosmetic: it drives `skipConsent`, the default token lifetimes, the rotation reminder, and whether `oauth.client.manage-restricted` is needed to edit the client at all. Changing tier is always an audited, restricted operation.

`cachedTrustedClients` (a `Set<string>` of client ids) should be populated with the `internal` client ids at boot. The plugin caches those clients per request *and makes them immutable through the CRUD endpoints*: a useful safety property for `logistiek`, but it means changing an internal client requires a deploy or a cache-aware update path. Section 5.13 documents this tradeoff; the recommendation is to enable it only for clients whose configuration genuinely never changes.

## 4.8 Deployment and environment

| Variable | Purpose | Status |
|---|---|---|
| `BETTER_AUTH_URL` | Base URL; `issuer` derives from it | exists |
| `BETTER_AUTH_SECRET` | Signs the flow state and Better Auth internals | exists |
| `BETTER_AUTH_COOKIE_DOMAIN` | `.vtk.be` in production | exists |
| `KUL_OIDC_*` | KU Leuven federation | exists |
| `OAUTH_PAIRWISE_SECRET` | HMAC key for pairwise `sub` | **new** |
| `OAUTH_ISSUER` | Optional explicit issuer override | **new, optional** |

The **issuer must never change** once a client is registered: it is validated by every client on every ID token. Deriving it from `BETTER_AUTH_URL` is acceptable given the URL is stable per environment, but the value must be identical in the discovery document, the ID token `iss`, and the `iss` redirect parameter. Section 19.7 adds a conformance test asserting exactly that.

Dev/staging/production each run an independent AS with independent clients and keys. There is no promotion of clients between environments; a partner integrating against staging registers twice. This is deliberate: a shared client id across environments is how staging redirect URIs end up registered on production.

## 4.9 Migrating `logistiek` off cookie forwarding

Today `apps/logistiek` calls `fetchSession(headers)` → `GET vtk.be/api/auth/remote/session`, forwarding the browser cookie. This works, is fast, and should **not** be ripped out on day one. The migration is additive:

```
 Phase A  register "logistiek" as an internal client (skipConsent, code+PKCE)
 Phase B  add an OAuth login path alongside cookie forwarding; feature-flag it
 Phase C  run both; compare resolved permissions in logs for a working period
 Phase D  switch the flag; keep /api/auth/remote/session alive but unused
 Phase E  remove the remote endpoint once no app calls it for a full month
```

The value of the move is not `logistiek` itself: it is that the *second* internal app, and every partner, gets a documented, standard integration path instead of a bespoke cookie trick that only works on `.vtk.be`.

---

# 5. OAuth client management

**Requirement: everything from the GUI, nothing from a config file.** A client is registered, edited, disabled, rotated and deleted in `/admin/sso`, gated on the existing permission system, and every change is audited.

## 5.1 Client lifecycle

```
   ┌─────────┐  create   ┌──────────┐  publish  ┌────────┐
   │  DRAFT  ├──────────►│ INACTIVE ├──────────►│ ACTIVE │
   └─────────┘           └────┬─────┘           └───┬────┘
                              ▲  disable            │ disable
                              └─────────────────────┘
                                                    │ delete (soft, 30 d)
                                                    v
                                              ┌──────────┐  purge  ┌────────┐
                                              │ ARCHIVED ├────────►│ purged │
                                              └──────────┘         └────────┘
```

`disabled` is a real column on `oauthClient`; DRAFT/ARCHIVED are VTK-side states on `SsoClientProfile.status`. A draft has no usable secret and is rejected at authorize. Archiving revokes all tokens and consents but keeps the row (and the audit trail) for 30 days.

## 5.2 CRUD

All writes go through server actions calling the plugin's `SERVER_ONLY` admin endpoints, never through raw Prisma writes on `oauthClient`: the endpoints normalise fields, hash the secret, and validate redirect URIs.

| Operation | Permission | Plugin call | VTK side-effects |
|---|---|---|---|
| List | `oauth.client.view` | direct Prisma read (paged) | n/a |
| Read | `oauth.client.view` | `auth.api.getOAuthClient` or Prisma | join `SsoClientProfile` |
| Create | `oauth.client.create` | `adminCreateOAuthClient` | create profile, audit, show secret once |
| Update | `oauth.client.edit` | `adminUpdateOAuthClient` | update profile, audit, diff |
| Restricted update | `oauth.client.manage-restricted` | `adminUpdateOAuthClient` | audit with `restricted: true` |
| Enable/disable | `oauth.client.edit` | `adminUpdateOAuthClient` (`disabled`) | audit; disable revokes tokens |
| Rotate secret | `oauth.client.rotate-secret` | `rotateClientSecret` | audit, show once, notify owner |
| Delete | `oauth.client.delete` | soft first, then `deleteOAuthClient` | revoke all, audit, 30-day window |

```
async function updateClientAction(prev, formData):
    session = await requirePermission("oauth.client.edit")
    id      = formData.get("clientId")
    before  = await loadClientWithProfile(id)
    input   = parseClientForm(formData)

    changed = diffFields(before, input)
    if changed ∩ RESTRICTED_FIELDS and not can(session, "oauth.client.manage-restricted"):
        return saveError("RESTRICTED_FIELD_DENIED")
    if error = validateClient(input): return saveError(error)

    await auth.api.adminUpdateOAuthClient({
        body: { client_id: id, update: toPluginUpdate(input) }, headers: await headers() })
    await db.ssoClientProfile.update({ where: { clientId: id }, data: toProfile(input) })
    await audit("oauth.client.updated", session, { clientId: id, changed })

    revalidatePath("/admin/sso"); revalidatePath(`/admin/sso/${id}`)
    return saveOk()
```

Note the two `revalidatePath` calls: `CLAUDE.md` requires the *management* page to be revalidated, not only the detail page, or the list keeps showing stale values.

## 5.3 Secret generation and display

The plugin generates a 32-character secret (`A-Z`, `a-z`) and, with `storeClientSecret: "hashed"`, stores only a hash. **The plaintext exists exactly once, in the create/rotate response.** The GUI must therefore:

- Show the secret in a modal that cannot be dismissed by clicking outside.
- Offer copy-to-clipboard with a state change *in the icon* (a checkmark), per the house rules: not only a tooltip.
- Say plainly, in NL and EN: this value cannot be recovered; if you lose it, rotate.
- Never write it to a toast, a log line, a server-action return that gets serialised into the RSC payload more than once, or an audit record.
- Prefix it `vtk_cs_` (section 14.10) so secret scanners recognise a leak.

```
┌─────────────────────────────────────────────────────────────┐
│  Client secret: shown once                              ✕   │
├─────────────────────────────────────────────────────────────┤
│  Kopieer deze waarde nu. Ze wordt gehasht opgeslagen en     │
│  kan later niet meer getoond worden.                        │
│                                                             │
│   vtk_cs_4f9a2b7c1e8d6a3b5c0f9e2d7a4b1c8e        [ copy ]   │
│                                                             │
│  Client ID:  crm_7fa3b2                          [ copy ]   │
│                                                             │
│                              [ Ik heb de secret bewaard ]   │
└─────────────────────────────────────────────────────────────┘
```

## 5.4 Rotation

Rotation is the operation most likely to cause an outage, so the design is grace-period-aware even though the plugin's `rotateClientSecret` replaces the secret immediately.

The plugin's endpoint sets a single new `clientSecret`. There is no dual-secret support. VTK's options:

1. **Immediate rotation with a scheduled window** (recommended for v1). The GUI states the blast radius before confirming: "Deze integratie faalt tot de partner de nieuwe secret heeft ingesteld." The confirmation dialog names the client and its owner, and the action emails the `supportEmail` on the profile.
2. **Dual-secret via metadata** (deferred). Store a `previousSecretHash` and `previousSecretExpiresAt` in `SsoClientProfile` and extend client authentication: this requires intercepting the plugin's auth, which it does not expose. **Not recommended**; the coupling is too deep.

Rotation policy per tier lives in `SsoClientProfile.secretRotationDays`; a dashboard card lists clients past due (section 7.2). Rotation is never automatic: an auto-rotated secret nobody installed is an outage on a timer.

## 5.5 Enable / disable

`disabled = true` makes the client fail at authorize and token. It is the correct first response to a suspected compromise because it is instant and reversible. Disabling **must** also revoke outstanding tokens, otherwise a JWT already issued keeps working until `exp`:

```
async function disableClient(clientId, session, reason):
    await auth.api.adminUpdateOAuthClient({ body: { client_id: clientId,
                                                    update: { disabled: true } }, … })
    await db.oauthRefreshToken.updateMany({ where: { clientId, revoked: null },
                                            data: { revoked: now() } })
    await db.oauthAccessToken.deleteMany({ where: { clientId } })
    await audit("oauth.client.disabled", session, { clientId, reason })
```

Outstanding **JWT** access tokens still validate until expiry at any resource server doing local verification. Section 10.6's short lifetime for permission-bearing tokens bounds that window to ten minutes; the incident runbook (14.22) says to also flip the client's `disabled` flag *and* tell resource servers to introspect for the next hour if the compromise is serious.

## 5.6 Deletion and ownership

Deletion is destructive and irreversible for the integration, so per `CLAUDE.md` it uses `DeleteButton` with a confirmation dialog that states **what disappears and what remains**: "De client, al zijn tokens en alle toestemmingen van leden worden verwijderd. De auditlog blijft bewaard." Soft-delete for 30 days, then purge.

**Ownership** is deliberately *not* `oauthClient.userId`. The plugin's self-service endpoints check `client.userId === session.user.id`, which ties a client to a person, and people leave VTK every July. Instead:

- `oauthClient.referenceId` ← the owning **post** (`Group.id`), populated via the `clientReference` option.
- `SsoClientProfile.ownerGroupId` ← the same, relationally, for joins and display.
- `SsoClientProfile.technicalContactUserId` ← a named human, nullable, for notifications only. Never an authorisation input.

This makes "who owns the CRM integration" answerable as "the IT post", which survives the working-year reset. Section 9.5 discusses the reset in depth.

## 5.7 Grant types

Presented as checkboxes, defaulting to `authorization_code` only.

| Grant | Default | Gate | Note |
|---|---|---|---|
| `authorization_code` | on | `oauth.client.edit` | Always paired with PKCE |
| `refresh_token` | off | `oauth.client.edit` | Requires `offline_access` in the client's scopes |
| `client_credentials` | off | `oauth.client.manage-restricted` | Confidential only; never for public clients; never emits `permissions` |

The form must reject `client_credentials` on a public client at validation time with a specific error code (`PUBLIC_CLIENT_NO_CC`), not a generic failure: a public client with client credentials is a secretless machine identity, i.e. an open door.

## 5.8 Audit logging

Every mutation writes one `SsoAuditLog` row (schema in 15.7). Non-negotiable properties: append-only (no update or delete path in code, and the GUI offers none), actor recorded as a user id *and* a denormalised display name (the user may later be deleted), a structured `changes` JSON diff with **secrets and tokens redacted**, and a `restricted: boolean` flag so the security-relevant subset is filterable.

Events to log:

```
oauth.client.created      oauth.client.updated       oauth.client.deleted
oauth.client.enabled      oauth.client.disabled      oauth.client.secret-rotated
oauth.client.tier-changed oauth.client.scope-changed oauth.client.redirect-changed
oauth.permission.created  oauth.permission.deleted   oauth.permission.granted
oauth.permission.revoked  oauth.claim.created        oauth.claim.updated
oauth.consent.revoked     oauth.token.revoked        oauth.client.restricted-edit
```

Retention: 24 months. Section 15.7 adds the partial index that makes the per-client view fast.

## 5.9 Public versus confidential

A single control with real consequences, so the GUI presents it as a choice with explanations rather than a checkbox labelled "public":

```
  ( ) Vertrouwelijke client  (aanbevolen)
      Draait op een server die de partner beheert. Krijgt een client secret.
      → Next.js/Django/Node backend, een Discord-bot, een cronjob

  ( ) Publieke client
      Draait op het toestel van de gebruiker. Kan geen geheim bewaren.
      → SPA in de browser, mobiele app, CLI
      ⚠ Geen client secret. PKCE en exacte redirect-URI's zijn verplicht.
```

Selecting public forces `token_endpoint_auth_method = "none"`, forces `require_pkce = true` and disables the toggle, removes `client_credentials`, and enables refresh-token rotation. Switching an existing client between the two is a restricted operation that invalidates the secret.

## 5.10 Metadata: plugin JSON versus VTK table

The plugin's `oauthClient.metadata` JSON column is passed into the claim hooks; a relational `SsoClientProfile` is queryable, constrained, and joinable. Both are used, with a clear rule:

> **`metadata` holds only what the claim resolvers need at token time. Everything else lives in `SsoClientProfile`.**

`metadata` therefore stays small and denormalised (it is read on every token issue):

```json
{
  "clientId": "crm_7fa3b2",
  "trustTier": "partner",
  "permissionNamespace": "crm",
  "claimProfile": "partner-basic",
  "emitPermissions": true,
  "audience": "https://api.partner.be"
}
```

`SsoClientProfile` holds the human and governance data: display name, publisher, logo key, support email, privacy/terms URLs, description NL/EN, owner group, technical contact, status, review date, rotation policy, consent copy overrides, and notes. Writing `metadata` is always derived from the profile by one function (`buildClientMetadata`), never hand-edited in the GUI; otherwise the two drift and the token starts disagreeing with the admin screen.

## 5.11 Dynamic client registration

Stays **disabled**. If VTK ever hosts an MCP server (the plugin ships `mcpHandler` for exactly that), the defensible configuration is:

```
allowDynamicClientRegistration: true
allowUnauthenticatedClientRegistration: false        // never
clientRegistrationDefaultScopes: ["openid","profile"] // never entitlements
clientRegistrationClientSecretExpiration: "30 days"
clientPrivileges: ({ action, headers }) =>
    action === "create" ? can(headers, "oauth.client.register-dynamic") : …
```

with dynamically-registered clients forced to `trustTier: "restricted"`, `skipConsent: false`, and excluded from ever receiving a `permissions` claim. Until then: false.

## 5.12 Validation rules

Enforced in the server action *before* the plugin call, so errors come back as `saveError(code)` and render as a red toast rather than an error boundary.

| Field | Rule | Error code |
|---|---|---|
| `client_name` | 2–64 chars, required | `NAME_REQUIRED` |
| `redirect_uris` | ≥1; absolute URL; **https** unless host is `localhost`/`127.0.0.1`; no fragment; no wildcard; no open-redirect path (`//`, `..`); ≤10 entries | `REDIRECT_INVALID` |
| `redirect_uris` (public client) | no `http` except loopback; custom schemes allowed for native | `REDIRECT_INSECURE` |
| `post_logout_redirect_uris` | same as above, optional | `LOGOUT_URI_INVALID` |
| `scope` | every scope exists in `SsoScope` and is allowed for this tier | `SCOPE_UNKNOWN` / `SCOPE_NOT_ALLOWED` |
| `grant_types` | ⊆ server list; `client_credentials` ⇒ confidential; `refresh_token` ⇒ `offline_access` in scopes | `GRANT_INVALID` |
| `logo_uri`, `tos_uri`, `policy_uri`, `client_uri` | https, ≤512 chars | `URI_INVALID` |
| `contacts` / support email | valid address, ≥1 for partner tier | `CONTACT_REQUIRED` |
| `permissionNamespace` | `^[a-z][a-z0-9]{1,15}$`, globally unique, not a reserved VTK prefix | `NAMESPACE_INVALID` / `NAMESPACE_TAKEN` |
| `metadata` | ≤4 KB serialised | `METADATA_TOO_LARGE` |

Redirect URI validation deserves emphasis: it is the highest-severity field on the form. The AS matches redirect URIs by **exact string comparison**, and the only reason that is safe is that the registered value is trustworthy. A single `https://partner.be/*` entry, or a URL with an open redirect behind it, converts the AS into a code-delivery service for an attacker. Wildcards are rejected outright; a host with a known open redirect is a manual review item on the partner checklist (19.9).

## 5.13 Caching internal clients

`cachedTrustedClients: Set<string>` avoids a DB read per authorize and makes those clients immutable through the CRUD endpoints. That immutability is a feature for a stable internal client and a trap for one still being configured. Recommendation: leave it unset until an internal client's configuration has been unchanged for a full working year, then add its id, and document in the GUI that the client is cached (a badge on the detail page reading "gecached: wijzigingen vereisen een deploy").

---

# 6. Restricted client settings

Some settings change what a client can *see* or *do*; those are restricted. The split is enforced in two places: `RESTRICTED_FIELDS` in the server action (authoritative) and field-level disabling in the form (usability).

## 6.1 The restricted set

| Setting | Restricted? | Why |
|---|---|---|
| Display name, description, logo | no | Cosmetic |
| Support email, privacy/terms URL | no | Contact data |
| Redirect URIs | **yes** | Directly enables code exfiltration |
| Post-logout redirect URIs | **yes** | Open-redirect surface |
| Scopes | **yes** | Widens data access |
| Default / requested claims | **yes** | Widens data access |
| Grant types | **yes** | Enables machine access |
| `client_credentials` specifically | **yes, + tier check** | User-less access |
| Public/confidential | **yes** | Removes client authentication |
| `require_pkce = false` | **yes** | Removes an attack mitigation |
| `skip_consent` | **yes** | Removes the user from the loop |
| Token lifetimes | **yes** | Extends the revocation window |
| Refresh policy | **yes** | Extends offline access |
| Trust tier | **yes** | Drives all of the above |
| Permission namespace | **yes** | Defines an authorisation vocabulary |
| `subject_type` | **yes** | Changes `sub` for every user |
| Consent copy override | **yes** | Consent phishing surface |
| Enabled/disabled | no (`oauth.client.edit`) | Must be fast in an incident |

Anything not on this list defaults to restricted. New settings are restricted until someone argues otherwise, which is the correct direction for the default to fail.

## 6.2 Enforcement

The plugin's `clientPrivileges` returns a single boolean per action and cannot express field-level policy. VTK therefore enforces it *before* the plugin call:

```
RESTRICTED_FIELDS = { redirectUris, postLogoutRedirectUris, scopes, defaultClaims,
                      requestedClaims, grantTypes, public, requirePkce, skipConsent,
                      tokenLifetimes, refreshPolicy, trustTier, permissionNamespace,
                      subjectType, consentCopy }

function assertFieldPolicy(session, before, after):
    touched = diffFields(before, after)
    if touched ∩ RESTRICTED_FIELDS ≠ ∅:
        require(session, "oauth.client.manage-restricted")
        markAuditRestricted()
```

Because the check is a diff, an unprivileged editor may submit a form that *contains* restricted fields as long as they did not change them, which is what makes it possible to render one form for both roles with the restricted inputs disabled.

## 6.3 Consent page branding and copy

Per client, editable with `oauth.client.manage-restricted`:

- **Logo**: uploaded via the existing storage package, stored as `logoKey`, served through `publicUrl()`. Not a partner-controlled `logo_uri`: a remote URL is a tracking pixel on VTK's consent page and can be swapped after review. Upload, review, host.
- **Publisher**: the legal/organisational name shown as "door <publisher>". Never partner-editable.
- **Consent intro**: one optional sentence, NL and EN, ≤200 characters, plain text only, rendered escaped. Explicitly *not* markdown and not HTML: rich text on a consent screen is a phishing vector ("Klik hier om te bevestigen" as a link to anywhere).
- **Verified badge**: a boolean on the profile, set only by `oauth.client.manage-restricted` holders, meaning "VTK has reviewed this integration". Section 13.4.

## 6.4 Default and requested claims

Two distinct lists on the profile, both restricted:

- **Default claims**: always included when the corresponding scope is granted. The baseline for the client.
- **Requested claims**: additional claims the client may ask for per request (`claims` parameter or an extra scope), shown separately on the consent screen as optional items the user can decline.

Both validate against the `SsoClaim` registry; unknown names are rejected at save time rather than silently ignored at token time.

## 6.5 Prompt behaviour

The client controls `prompt` per request (`none`, `login`, `consent`, `select_account`, `create`), but per-client policy can constrain it:

| Setting | Effect |
|---|---|
| `forceConsentEveryTime` | Ignores the stored `oauthConsent`; re-prompts always. For high-sensitivity partner clients. |
| `maxAuthAge` | Feeds `max_age`; forces re-authentication if the session is older. |
| `allowPromptNone` | Whether the client may do silent renewal in an iframe. Off for public clients on third-party domains, since third-party cookies are unreliable anyway. |

## 6.6 OIDC and client metadata

Restricted, exposed as an "Advanced (OIDC)" panel that is collapsed by default and read-only without the permission:

`subject_type` (`public` | `pairwise`), `token_endpoint_auth_method`, `response_types` (always `["code"]`), `enable_end_session`, `software_id` / `software_version` / `software_statement`, `contacts[]`, `client_uri`.

`pairwise` gives each client a different `sub` for the same user, computed by HMAC over a sector identifier: genuinely valuable for a partner who should not be able to correlate members with another partner's dataset. It requires `pairwiseSecret` to be set, and **changing `subject_type` on a live client breaks every existing account link in that client**, so the GUI must warn in those words and the action must be audited as restricted.

## 6.7 Grant and refresh policy

Per client: which grants (5.7); refresh token lifetime (bounded by the server maximum); rotation on/off (forced on for public); `absoluteRefreshLifetime` (a hard cap regardless of rotation, so a rotating token cannot live forever); and idle expiry (revoke a refresh token unused for N days).

## 6.8 PKCE

`require_pkce` defaults to true and the toggle is disabled unless the user holds `oauth.client.manage-restricted`. Turning it off requires a typed reason, stored on the audit row. There is no legitimate modern reason; the escape hatch exists only for a partner running an unmaintained library, and the reason field makes that visible at the next review.

## 6.9 Advertised metadata

`advertisedMetadata.scopes_supported` lets VTK omit scopes from the public discovery document while still honouring them for clients registered with them. Use it for anything partner-specific: a scope nobody else may request should not be advertised to everyone, both to reduce the attack surface and to avoid integrators asking for scopes they will be denied. The list is computed from the `SsoScope` table (`advertised: boolean`), not hard-coded.

## 6.10 Extensibility

The three mechanisms for future settings, in order of preference:

1. **A column on `SsoClientProfile`**: for anything with a fixed type that the GUI must validate. Costs a migration; gains type safety and queryability. Default choice.
2. **A key in `oauthClient.metadata`**: only when the claim resolvers need it at token time. Documented in one TypeScript type (`ClientTokenMetadata`) and written only by `buildClientMetadata`.
3. **`SsoClientSetting` (key/value)**: a deliberate escape hatch for experiments, with a registry of known keys and a rule that anything living there for two releases graduates to a column.

The rule that keeps this from rotting: **no setting is read directly from JSON anywhere except one resolver function.** Grep for the JSON access and you find every consumer.

---

# 7. GUI design

Built entirely from the existing admin system: `admin-table.tsx` (`useTableControls`, `SearchBar`, `SortHeader`, `Panel`, `Modal`, `ToggleDot`), `SaveForm`, `DeleteIconButton`/`DeleteButton`, `IconButton`/`IconLink` with `icons.tsx`, and the declarative nav tree. No new primitives.

## 7.1 Navigation

One new group in `app/[locale]/admin/layout.tsx`, placed after "Ledenbeheer" (it is a members-and-access concern) and before "Website":

```ts
group('sso', [
  item('ssoDashboard',   '/sso',             { anyPerm: ['oauth.client.view', 'oauth.audit.view'] }),
  item('ssoClients',     '/sso/clients',     { perm: 'oauth.client.view' }),
  item('ssoScopes',      '/sso/scopes',      { perm: 'oauth.scope.manage' }),
  item('ssoClaims',      '/sso/claims',      { perm: 'oauth.claim.manage' }),
  item('ssoTokens',      '/sso/tokens',      { anyPerm: ['oauth.token.revoke', 'oauth.client.view'] }),
  item('ssoAudit',       '/sso/audit',       { perm: 'oauth.audit.view' }),
  item('ssoDiscovery',   '/sso/discovery',   { perm: 'oauth.client.view' }),
]),
```

The group vanishes entirely for users holding none of these, which the existing `AdminNav` already handles. Labels go in `packages/i18n` under `admin.sso*`.

## 7.2 OAuth dashboard: `/admin/sso`

```
┌──────────────────────────────────────────────────────────────────────────┐
│ SSO & OAuth                                                              │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐             │
│  │ Clients    │ │ Actief     │ │ Tokens     │ │ Toestem-   │             │
│  │    12      │ │    9       │ │  1 284     │ │ mingen 431 │             │
│  │ 3 inactief │ │            │ │ 24 u: 96   │ │            │             │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘             │
│                                                                          │
│  ⚠ Aandacht vereist                                                      │
│  ┌──────────────────────────────────────────────────────────────────┐    │
│  │ • CRM Partner: secret 214 dagen oud (beleid: 180)     [ bekijk ] │    │
│  │ • Scheduling : review verlopen op 2026-06-01          [ bekijk ] │    │
│  │ • Discord Bot: PKCE uitgeschakeld                     [ bekijk ] │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  Recente activiteit                          Endpoint-gezondheid         │
│  ┌────────────────────────────────────┐     ┌──────────────────────┐     │
│  │ 14:02 secret geroteerd  CRM   Witse│     │ discovery       ✓    │     │
│  │ 11:47 client aangemaakt Sched Lore │     │ jwks (1 sleutel)✓    │     │
│  │ 09:15 scope gewijzigd   Disc  Witse│     │ token 24 u: 96/0 ✓   │     │
│  └────────────────────────────────────┘     └──────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────┘
```

"Aandacht vereist" is the screen's reason to exist: rotation overdue, review overdue, PKCE off, a client with `skipConsent` in the `partner` tier, a client with no owner group, a scope granted to nobody. Each row deep-links to the offending field.

## 7.3 Client list: `/admin/sso/clients`

Server-driven table (URL `?q&tier&status&sort&dir&page`), following `/admin/gebruikers` rather than the client-side pattern, because clients grow and the filters are cheap in SQL.

```
┌──────────────────────────────────────────────────────────────────────────┐
│ OAuth-clients                                        [ Nieuwe client ]   │
│ [ zoek… ]  Tier: (alle▾)  Status: (alle▾)  Post: (alle▾)                 │
├───┬────────────────┬──────────┬─────────┬──────────┬─────────┬────────── ┤
│   │ Naam           │ Tier     │ Type    │ Eigenaar │ Secret  │           │
├───┼────────────────┼──────────┼─────────┼──────────┼─────────┼────────── ┤
│ ● │ Logistiek      │ intern   │ vertr.  │ IT       │ 42 d    │ ✎ ⟳ ⓘ 🗑   │
│ ● │ CRM Partner    │ partner  │ vertr.  │ Bedrijven│ 214 d ⚠ │ ✎ ⟳ ⓘ 🗑   │
│ ● │ Discord Bot    │ intern   │ vertr.  │ IT       │ 88 d    │ ✎ ⟳ ⓘ 🗑   │
│ ○ │ Scheduling     │ partner  │ publiek │ Cursus.  │ n.v.t.  │ ✎ ⟳ ⓘ 🗑   │
└───┴────────────────┴──────────┴─────────┴──────────┴─────────┴────────── ┘
   ● actief   ○ uitgeschakeld
```

Row actions are icon buttons per the house rules, each with a `label` and a contextual `srLabel`: `✎` "Bewerken: CRM Partner", `⟳` "Secret roteren: CRM Partner", `ⓘ` "Details", `🗑` via `DeleteIconButton`. Icons render only when the viewer holds the matching permission; a disabled icon that always 403s is worse than an absent one.

## 7.4 Client detail: `/admin/sso/clients/[clientId]`

Tabbed, all tabs server components, each form its own `SaveForm` so a save touches one concern:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ← Clients / CRM Partner                              ● Actief  [ ⋯ ]     │
│ ┌──────┬──────────┬────────┬────────┬──────────┬────────┬─────────────┐  │
│ │ Over │ OAuth    │ Scopes │ Claims │ Rechten  │ Tokens │ Audit       │  │
│ └──────┴──────────┴────────┴────────┴──────────┴────────┴─────────────┘  │
│                                                                          │
│  OVERZICHT                                                               │
│  Client ID     crm_7fa3b2                                    [ copy ]    │
│  Tier          partner            Type       vertrouwelijk               │
│  Eigenaar      Post Bedrijvenrelaties        Contact  lore@vtk.be        │
│  Aangemaakt    2026-03-04 door Witse Panneels                            │
│  Secret        geroteerd 214 dagen geleden ⚠ beleid: 180  [ roteren ]    │
│  Review        verlopen op 2026-06-01                     [ afronden ]   │
│                                                                          │
│  Branding                                                                │
│  Logo [ ▣ ]  Publisher [ Partner NV        ]  Support [ … ]              │
│  Beschrijving NL [                                             ]         │
│  Beschrijving EN [                                             ]         │
│                                              [ Opslaan ]                 │
└──────────────────────────────────────────────────────────────────────────┘
```

The **OAuth** tab holds redirect URIs, grant types, PKCE, public/confidential, token lifetimes, refresh policy, and consent behaviour: every field restricted, so for a plain `oauth.client.edit` holder the whole tab renders read-only with one line at the top: "Deze instellingen vereisen het recht 'Beperkte OAuth-instellingen beheren'."

## 7.5 Create client: `/admin/sso/clients/new`

A three-step wizard, because a single 30-field form for something this consequential invites mistakes:

```
  ①  Basis            naam · beschrijving · eigenaar-post · tier
  ②  Techniek         type (publiek/vertrouwelijk) · redirect-URI's · grants
  ③  Toegang          scopes · claims · permission-namespace
  ──► overzicht ──► aanmaken ──► secret-modal (eenmalig)
```

Step 3 shows a live preview of the consent screen the member will see, which is the cheapest available check against over-scoping: an admin who sees "Deze app krijgt toegang tot je adres, geboortedatum en mailinglijstvoorkeuren" tends to remove two of them.

## 7.6 Scopes: `/admin/sso/scopes`

Rows are `SsoScope` records: `code`, NL/EN label, NL/EN consent sentence, `sensitive`, `advertised`, `adminOnly`, and a count of clients using it. Expanding a row lists those clients. Deleting a scope in use is blocked with a message naming the clients (never a silent cascade).

## 7.7 Claims: `/admin/sso/claims`

The claim registry (section 12) as a table: claim name, source field, transformer, scope that releases it, permission gate, sensitivity, destinations (ID token / access token / UserInfo), and a **preview** column that resolves the claim against a chosen test user. The preview is what makes the registry safe to operate: an admin can see exactly what `vtk:study_programmes` yields for a real member before any client receives it.

## 7.8 Client permissions: the "Rechten" tab

Two panels (full design in section 9):

```
┌─ Permissienamespace: crm ──────────────────────────────────────────────┐
│  [ + Nieuwe permissie ]                                                │
│  ┌──────────────┬──────────────────────────┬────────┬────────┬───────┐ │
│  │ Code         │ Omschrijving             │ Leden  │ Rollen │       │ │
│  ├──────────────┼──────────────────────────┼────────┼────────┼───────┤ │
│  │ crm.read     │ Contacten bekijken       │   24   │   2    │ ✎ 🗑  │ │
│  │ crm.write    │ Contacten bewerken       │    6   │   1    │ ✎ 🗑  │ │
│  │ crm.admin    │ Volledig beheer          │    2   │   1    │ ✎ 🗑  │ │
│  └──────────────┴──────────────────────────┴────────┴────────┴───────┘ │
├─ Toekenningen ─────────────────────────────────────────────────────────┤
│  ( ) per lid      (•) via VTK-rol      ( ) via post                     │
│  ┌────────────────────────┬───────────────────────────────────────────┐│
│  │ VTK-rol                │ Krijgt in deze client                     ││
│  ├────────────────────────┼───────────────────────────────────────────┤│
│  │ praesidium             │ ☑ crm.read  ☐ crm.write  ☐ crm.admin      ││
│  │ post-bedrijvenrelaties │ ☑ crm.read  ☑ crm.write  ☐ crm.admin      ││
│  └────────────────────────┴───────────────────────────────────────────┘│
└────────────────────────────────────────────────────────────────────────┘
```

Per-member grants use the existing `/api/users/search` typeahead, never a full user load.

## 7.9 Tokens and revocation: `/admin/sso/tokens`

Filterable by client, user, type, and issue date. Columns: client, member, type (access/refresh), scopes, issued, expires, session. Actions: revoke one, revoke all for a client, revoke all for a member.

Every revoke is destructive and therefore goes through `DeleteButton` with a dialog that states the blast radius precisely ("Dit logt 24 leden uit van CRM Partner. Hun VTK-sessie blijft actief."), and the honest caveat that JWT access tokens already issued remain valid until they expire, with the actual remaining window shown.

## 7.10 Member self-service: `/[locale]/account/verbonden-apps`

Not an admin screen, but required for GDPR and for basic hygiene. Each granted application: name, logo, publisher, what it may access in plain language, when it was granted, when it was last used, and a "Verbinding verbreken" button that deletes the consent and revokes the token family.

## 7.11 Audit: `/admin/sso/audit`

Reverse-chronological, filterable by client, actor, event type, restricted-only, and date range. Expanding a row shows the redacted field diff. Export to CSV under `oauth.audit.view`. No edit or delete affordance anywhere on the screen.

## 7.12 Discovery viewer and testing tools: `/admin/sso/discovery`

Three panels:

1. **Discovery**: live fetch of both `.well-known` documents, pretty-printed, with a checklist of assertions (issuer matches `BETTER_AUTH_URL` + `basePath`; `code_challenge_methods_supported` contains `S256`; no `token` in `response_types_supported`; `jwks_uri` resolves and returns ≥1 key).
2. **JWKS**: current keys with `kid`, algorithm, creation and expiry, and a rotation action for super admins.
3. **Flow tester**: pick a client, pick scopes, pick a redirect URI from the registered list, and run a real authorization code flow against a VTK-hosted callback that displays the decoded ID token, access token claims, and UserInfo response side by side.

The flow tester is the single highest-value screen for the team supporting integrations: nearly every partner ticket is "we don't see claim X", and this answers it in fifteen seconds. Constraints: gated on `oauth.client.view`, only uses already-registered redirect URIs, never displays a client secret, and always uses the requester's own session so it can never impersonate another member.

# 8. Permission system integration

VTK already has a working role and permission system (section 0.7, `docs/permissions.md`). It is **not** replaced, wrapped, or duplicated. OAuth administration becomes eleven more permission codes in the same registry, checked with the same functions, assigned through the same `/admin/roles` screen.

## 8.1 What integration means concretely

1. Add rows to `PERMISSIONS` in `packages/db/src/permissions.ts`.
2. Run `npm run seed -w @vtk/db` to mirror them into the `Permission` table.
3. Use them: `requirePermission("oauth.client.create")` type-checks, because `PermissionCode` is derived from the registry with `as const`.
4. Tick them onto roles in `/admin/roles`. No new UI, no new model, no new resolver.

## 8.2 New permission codes

Appended to the registry, in the existing style. Note the category: the current `sso.client.edit` uses `category: "External"` while every other entry uses a lowercase category (`users`, `pages`, `general`). Normalise to `"sso"` and group all OAuth permissions under it.

```ts
// SSO / OAuth Authorization Server
{ code: "oauth.client.view", labelNl: "OAuth-clients bekijken",
  labelEn: "View OAuth clients", category: "sso" },
{ code: "oauth.client.create", labelNl: "OAuth-clients aanmaken",
  labelEn: "Create OAuth clients", category: "sso" },
{ code: "oauth.client.edit", labelNl: "OAuth-clients bewerken",
  labelEn: "Edit OAuth clients", category: "sso" },
{ code: "oauth.client.delete", labelNl: "OAuth-clients verwijderen",
  labelEn: "Delete OAuth clients", category: "sso" },
{ code: "oauth.client.rotate-secret", labelNl: "Client secrets roteren",
  labelEn: "Rotate client secrets", category: "sso" },
{ code: "oauth.client.manage-restricted", labelNl: "Beperkte OAuth-instellingen beheren",
  labelEn: "Manage restricted OAuth settings", category: "sso" },
{ code: "oauth.scope.manage", labelNl: "OAuth-scopes beheren",
  labelEn: "Manage OAuth scopes", category: "sso" },
{ code: "oauth.claim.manage", labelNl: "OAuth-claims beheren",
  labelEn: "Manage OAuth claims", category: "sso" },
{ code: "oauth.permission.manage", labelNl: "Client-permissies beheren",
  labelEn: "Manage client permissions", category: "sso" },
{ code: "oauth.audit.view", labelNl: "OAuth-auditlog bekijken",
  labelEn: "View OAuth audit log", category: "sso" },
{ code: "oauth.token.revoke", labelNl: "OAuth-tokens intrekken",
  labelEn: "Revoke OAuth tokens", category: "sso" },
```

**Migrating `sso.client.edit`.** It is referenced in exactly two places: `auth.ts`'s `clientPrivileges` and the stub in `server/sso.ts`. Neither is load-bearing yet. Options: keep it as a deprecated alias, or replace it. **Replace it**: it has never gated a real screen, so there is no data to migrate beyond any role that already has it ticked. The migration seeds the eleven new codes, copies `sso.client.edit` holders onto a new `oauth-beheerder` role carrying the full set, and deletes the old code from the registry and table.

## 8.3 Suggested role bundles

Roles are GUI-created, so these are seeds and suggestions rather than schema:

| Role | Permissions | For |
|---|---|---|
| `oauth-beheerder` | all eleven | IT post leads |
| `oauth-operator` | `view`, `edit`, `rotate-secret`, `audit.view`, `token.revoke` | Day-to-day integration support |
| `oauth-lezer` | `view`, `audit.view` | Board oversight, incident triage |
| `oauth-partnerbeheer` | `view`, `permission.manage` | A post that manages who may use *its* partner app, without touching client configuration |

`oauth-partnerbeheer` is the interesting one: it lets the Bedrijvenrelaties post decide who gets `crm.write` without being able to change the CRM's redirect URIs. That separation is the practical payoff of splitting permission management from client management.

## 8.4 `clientPrivileges` per action

Replacing the current all-actions-one-permission implementation:

```ts
const CLIENT_ACTION_PERMISSION: Record<ClientAction, Permission> = {
  list:   "oauth.client.view",
  read:   "oauth.client.view",
  create: "oauth.client.create",
  update: "oauth.client.edit",
  delete: "oauth.client.delete",
  rotate: "oauth.client.rotate-secret",
};

clientPrivileges: async ({ headers, action }) =>
    hasPermissionCached(headers, CLIENT_ACTION_PERMISSION[action]),
```

Two refinements matter.

**Cache the session.** The current `hasPermission(headers, code)` in `server/session.ts` performs a full `getSession`, a `findUnique` with three levels of nested includes, per call. The plugin may invoke `clientPrivileges` more than once per request. Add a request-scoped memo in `packages/auth/src/server/session.ts`:

```
const sessionCache = new WeakMap<Headers, Promise<SessionPayload | null>>()

function getSessionCached(headers):
    if not sessionCache.has(headers): sessionCache.set(headers, getSession(headers))
    return sessionCache.get(headers)

hasPermissionCached(headers, code) = hasPermission(await getSessionCached(headers), code)
```

Keying on the `Headers` object gives per-request identity without threading a context through the plugin. `apps/web` already has React `cache()` for the page path; this covers the plugin path, which does not run inside a React render.

**Return `undefined`, not `false`, for unknown actions.** The option's return type is `boolean | undefined`, and `undefined` means "no opinion" (fall through to the plugin's own default). If a future plugin version adds an action VTK has not mapped, returning `false` breaks it silently while `undefined` degrades to the plugin's behaviour. Map explicitly and return `undefined` for anything unmapped: with a `console.warn` so it surfaces.

## 8.5 Defence in depth

`clientPrivileges` guards the plugin's own endpoints. It does **not** guard VTK's server actions, VTK's admin pages, or VTK's Prisma reads. Every layer checks independently:

```
  page          requirePermission("oauth.client.view")     → 403 page
  server action requirePermission("oauth.client.edit")     → saveError / throw
  field policy  assertFieldPolicy(session, before, after)  → RESTRICTED_FIELD_DENIED
  plugin        clientPrivileges({ action })               → APIError
  DB            (no direct writes to oauthClient outside the actions)
```

This mirrors what `docs/permissions.md` already mandates ("Server actions must re-check: never trust the client") and is the reason a mistake in one layer is not a breach.

## 8.6 Super admin

`isSuperAdmin` short-circuits every check, including all eleven OAuth permissions. Accepted, consistent with the rest of the system, and the escape hatch when an integration breaks at 3 a.m. Two consequences to make explicit rather than discover: super admin actions must still be audited (the audit call sites are outside the permission check, so this is automatic), and the audit row should record `viaSuperAdmin: true` so a review can distinguish "held the permission" from "bypassed the permission".

## 8.7 The working-year reset and OAuth administration

`UserRole` and `GroupMembership` are year-scoped, so on 15 July every OAuth administrator loses their role until re-assigned. For admin permissions this is *correct*: a former IT lead should not keep the ability to rotate secrets. But it creates a window where nobody can administer an integration.

Mitigations, in order of preference: (a) `isSuperAdmin` survives the cutover and is the intended break-glass, so ensure at least two super admins exist; (b) the dashboard's "Aandacht vereist" panel gains a July check: "geen enkele gebruiker heeft momenteel oauth.client.edit"; (c) the seed's `admin` system role, granted via the IT post, is re-granted as part of the normal July role assignment.

What must **not** happen is year-scoping the *client* records or the per-client user permissions by accident. Section 9.5.

---

# 9. External application permissions

This is the requirement with the least off-the-shelf support and the most room to get wrong, so it gets the most careful treatment.

## 9.1 The requirement

Each OAuth client may define its own permission namespace, administered entirely through the GUI:

```
  CRM          crm.read       crm.write       crm.admin
  Scheduling   schedule.read  schedule.edit   schedule.approve
  Discord Bot  discord.read   discord.manage  discord.admin
```

Members are granted these per client, and the client learns which ones a given user holds.

## 9.2 Why not scopes

The instinct is to make each permission a scope, since scopes are the standard mechanism and the plugin already validates them. It is the wrong instinct, for reasons worth stating because someone will propose it again:

- **Scopes describe the client's request, not the user's rights.** `scope=crm.admin` means "this application would like admin access", and the AS grants it if the client is registered for it. It says nothing about *this user*. Two members using the same CRM would receive identical scopes and the CRM would learn nothing.
- **Scopes are global to the AS.** The plugin validates requested scopes against the server-wide `scopes` list. Thirty clients × five permissions is 150 entries in one flat namespace, all advertised in discovery.
- **Consent becomes noise.** "CRM wil: crm.read, crm.write, crm.admin, crm.export, crm.delete" is not informed consent; it is a wall the user clicks past.
- **Request size.** Scope lists live in a URL. Enough of them and you hit real limits.

The standards-aligned reading is that **scopes are coarse-grained delegation and per-user authorisation belongs in claims**: the same conclusion reached by RFC 9068 (JWT access token profile), which defines optional `roles`, `groups`, and `entitlements` claims precisely because scopes cannot carry per-user authorisation.

## 9.3 Recommended design

> **One scope per client for entitlements. Permissions ride as a claim.**

```
  scope    "entitlements"                  ← the client asks: tell me what this user may do
  claim    "permissions": ["crm.read", "crm.write"]   ← the AS answers, per user, per client
```

Three properties follow. The consent screen shows one honest line ("CRM mag zien welke rechten je hebt binnen CRM") instead of five opaque codes. The permission vocabulary lives in VTK's database, so adding `crm.export` is a GUI action rather than a redeploy of the AS's scope list. And the claim is recomputed on every token issue and every refresh, so revocation propagates within one access-token lifetime with no synchronisation protocol.

Claim naming: emit **both** a namespaced `vtk:permissions` and, when the client's `metadata.emitPermissions` is set, a bare `permissions` scoped to that client's namespace. RFC 9068 blesses `entitlements`; `permissions` is the de facto convention (Auth0 RBAC uses exactly this name) and is what an integrator's library will look for. Section 10.4 makes the final choice.

## 9.4 Storage

Four new tables (full DDL in section 15.6):

```
  SsoClientPermission          the vocabulary a client defines
    id, clientId, code, labelNl, labelEn, descriptionNl?, descriptionEn?,
    sortOrder, deprecated, createdAt, updatedAt
    @@unique([clientId, code])

  SsoUserClientPermission      a direct grant to one member
    id, clientId, permissionId, userId, grantedByUserId, grantedAt, expiresAt?
    @@unique([clientId, permissionId, userId])

  SsoRoleClientPermission      a grant via an existing VTK role
    id, clientId, permissionId, roleId
    @@unique([clientId, permissionId, roleId])

  SsoGroupClientPermission     a grant via an existing post
    id, clientId, permissionId, groupId, kind (DEFAULT|LEADER)
    @@unique([clientId, permissionId, groupId, kind])
```

The last two are what make this scale. Granting `crm.read` to 24 members individually is unmaintainable; granting it to the `praesidium` role or the Bedrijvenrelaties post is one row, and it inherits the existing year-scoped membership resolution for free.

## 9.5 Resolution and the working-year question

```
effectiveClientPermissions(userId, clientId):
    year = currentWorkingYear()
    direct  = SsoUserClientPermission where userId, clientId
              and (expiresAt is null or expiresAt > now)
    viaRole = SsoRoleClientPermission where clientId
              and roleId in (user's roleIds for `year`)          ← year-scoped
    viaPost = SsoGroupClientPermission where clientId
              and groupId in (user's group memberships for `year`)
              and (kind = DEFAULT or membership.role = LEAD)     ← year-scoped
    return distinct(codes(direct ∪ viaRole ∪ viaPost))
```

**The design decision:** role- and post-derived grants inherit the 15-July reset (they are computed from `session.roleIds` and `session.groups`, which are already year-scoped), while **direct grants do not**. A direct `SsoUserClientPermission` persists until explicitly revoked or until its optional `expiresAt`.

The rationale: role-derived access *should* follow the role, because that is the whole point of granting through a role, and a praesidium member who leaves the praesidium should lose CRM access on 15 July. But a direct grant to an external-facing account, or to the one person who maintains the Discord bot, is not a working-year concept, and silently emptying every partner application at midnight on 15 July would be an outage nobody predicted. Making direct grants permanent-until-revoked, with an optional expiry for the cases that genuinely are temporary, puts the choice in the granter's hands.

This must be visible in the GUI. The grant form shows "Vervalt: (nooit ▾ | einde werkingsjaar | datum…)", and the year-derived grants are rendered in the permission list with a "via rol praesidium (26-27)" annotation so nobody is surprised in July.

Add a dashboard check: "N directe toekenningen zijn ouder dan 2 werkingsjaren": the mechanism that stops permanent grants from silently accumulating.

## 9.6 Inheritance and conflicts

There is deliberately **no hierarchy**. `crm.admin` does not imply `crm.write`. Implication looks convenient and produces systems where nobody can predict effective access without running the resolver.

If a client wants hierarchy, it expresses it in its own code (`if (perms.includes("crm.admin") || perms.includes("crm.write"))`), or the admin grants both. The GUI can help without changing semantics: an optional `impliesCodes: String[]` on `SsoClientPermission` that the **grant form** expands at write time into explicit rows. The expansion happens once, at grant, and is visible in the resulting list, so the stored state is always the literal truth.

Conflicts do not arise, because the resolution is a set union with no negative grants. **There is no deny.** A "deny" rule interacting with three grant paths is an ordering problem with no good answer; if a member must not have `crm.write`, remove the grant that gives it. The GUI supports this by showing, for each effective permission, every path that produced it.

## 9.7 Validation

| Rule | Enforcement |
|---|---|
| Code matches `^[a-z][a-z0-9]*(\.[a-z][a-z0-9-]*){1,3}$` | Form + DB check constraint |
| Code starts with the client's namespace | Form; the namespace prefix is prefilled and read-only |
| Namespace globally unique across clients | `@@unique` on `SsoClientProfile.permissionNamespace` |
| Namespace is not a reserved VTK prefix (`vtk`, `oauth`, `openid`, `admin`) | Registry constant |
| Code unique within the client | `@@unique([clientId, code])` |
| Deleting a granted permission | Blocked; the dialog names the holder count and offers "deprecate instead" |
| Total codes per client | ≤64, so the claim cannot become unbounded |
| Total effective permissions per token | ≤128; over that, the resolver emits an empty claim, logs an error, and the client must use UserInfo (section 10.8) |

Deprecation rather than deletion is the safe default: `deprecated = true` hides the code from grant forms, keeps existing grants working, and shows a strikethrough in the list. A code is deleted only after its holder count reaches zero.

## 9.8 Versioning

The permission vocabulary evolves. Rather than a version number nobody increments, use two mechanisms that are self-maintaining:

1. **Deprecation with a replacement pointer.** `SsoClientPermission.replacedByCode` lets `crm.write` point at `crm.contacts.write`. During the transition the resolver emits *both* codes for anyone holding either, so the client can migrate at its own pace. A dashboard item lists deprecated codes still being emitted, with the date they were deprecated.
2. **An audit trail of vocabulary changes** (`oauth.permission.created` / `.deleted`), so "when did `crm.export` appear" is answerable.

An explicit `permissionsVersion` in the token, if a partner asks for one, is a value on `SsoClientProfile` emitted as a claim: cheap to add, and section 12 makes it a registry row rather than code.

## 9.9 Exposure to clients

| Channel | Contents | When |
|---|---|---|
| Access token claim `permissions` | Codes for this client, this user | `entitlements` scope granted, authorization_code or refresh grant |
| Access token claim `vtk:permissions` | The member's **VTK** permission codes | `entitlements` granted **and** the client is `internal` tier |
| Access token claim `vtk:roles` | VTK role codes | as above |
| UserInfo `permissions` | Same as the token claim, live | Any request with the scope |
| Introspection response | Same claims (the plugin runs `customAccessTokenClaims` for introspect too) | Client authenticates |

Three hard rules:

- **Never emit `vtk:permissions` to a non-internal client.** VTK's internal permission vocabulary (`theokot.pickup`, `pages.editAll`) is organisational information that a partner has no business seeing and cannot act on.
- **Never emit any permission claim on a `client_credentials` token.** There is no user; a `permissions` claim on a user-less token is an invitation for the client to treat it as "the app may do these things", which is not what it means.
- **Never emit permissions without the `entitlements` scope**, even to internal clients. The scope is what the consent screen showed the member; emitting without it makes consent a lie.

## 9.10 Standards considered

| Mechanism | RFC | Fit | Verdict |
|---|---|---|---|
| **Scopes** | 6749 | Coarse client-level delegation | **Use**: for categories of access, not per-user rights |
| **`roles` claim** | 9068 (optional) | Coarse user classification | **Use**: internal clients only |
| **`permissions` claim** | de facto (Auth0) | Fine-grained per-user rights | **Use**: the primary mechanism |
| **`entitlements` claim** | 9068 (optional), 7643 (SCIM) | Standard name for exactly this | **Use as the scope name**; `permissions` as the claim name |
| **`groups` claim** | 9068 (optional) | Org membership | **Use**: VTK posts, gated on `vtk:membership` |
| **Rich Authorization Requests** | 9396 | Per-request, structured, resource-specific authorisation (`authorization_details`) | **No.** Designed for high-value transactional consent ("transfer €500 to IBAN X"). VTK's model is durable role-based access, not per-transaction. The plugin does not support it. |
| **Resource Indicators** | 8707 | `resource=` parameter narrowing the token's audience | **Yes, partially.** The plugin already accepts `resource` and puts it in `aud`; VTK should document it for partners with multiple APIs so tokens are audience-bound rather than universal. |
| **Token Exchange** | 8693 | Downscoping / delegation between services | **No**: no use case, no plugin support |
| **SCIM** | 7643/7644 | Provisioning users and entitlements *into* a client | **Not now**: section 10.10 |
| **CAEP / Shared Signals** | OpenID SSF | Push revocation events | **Not now**: section 10.9 |

## 9.11 Worked example: the Discord bot

```
1.  Client "VTK Discord Bot", tier internal, confidential,
    grants: authorization_code + client_credentials,
    scopes: openid, profile, entitlements,
    namespace: "discord"

2.  Permissions defined in the GUI:
      discord.read     Kanalen en rollen bekijken
      discord.manage   Rollen toekennen
      discord.admin    Bot configureren

3.  Grants:
      via post IT (DEFAULT) → discord.manage, discord.read
      via role admin        → discord.admin
      direct, no expiry     → Witse: discord.admin  (bot maintainer)

4.  A member logs in through the bot's web panel:
      scope=openid profile entitlements
      → access token:
          { "sub": "clx8f2k9…", "azp": "discord_9a1f",
            "scope": "openid profile entitlements",
            "permissions": ["discord.read", "discord.manage"],
            "vtk:roles": ["praesidium", "post-it"],
            "exp": <now + 600> }

5.  The bot authorises locally: if "discord.manage" in permissions → show role UI.

6.  On 16 July, the member is no longer in the IT post.
    Their next refresh yields permissions: []: no code changed, nothing was synced.
    Witse's direct discord.admin grant survives, as intended.
```

---

# 10. Initial privilege provisioning

The requirement, restated: the Authorization Server must be able to tell a client *"this user already has these permissions"* and, later, *"these permissions have been revoked."*

## 10.1 The two halves

**Provisioning** is easy: it happens at token time, and section 9 covers it. **Revocation** is the hard half, because the client has already been told something that is now false, and OAuth's default answer, "wait for the token to expire", may or may not be fast enough.

The design space:

```
              PUSH                                      PULL
   AS tells the client something changed    Client asks the AS what is true now
   ├── webhook / event feed                 ├── introspection per request
   ├── SCIM provisioning                    ├── UserInfo per request
   └── CAEP / Shared Signals                └── short tokens + refresh
```

## 10.2 Options compared

| Approach | Freshness | Client effort | AS effort | Standard | Verdict |
|---|---|---|---|---|---|
| **Scopes** | per token | none | none | RFC 6749 | Wrong tool: not per-user (9.2) |
| **`roles` claim** | per token | trivial | trivial | RFC 9068 | Use, internal only |
| **`permissions` claim** | per token | trivial | small | de facto | **Primary mechanism** |
| **`groups` claim** | per token | trivial | trivial | RFC 9068 | Use for posts |
| **`entitlements` claim** | per token | trivial | small | RFC 9068 / SCIM | Use as the scope name |
| **UserInfo** | per call | one HTTP call | small | OIDC Core | **Secondary: for large or volatile sets** |
| **Introspection** | per call | one HTTP call | moderate | RFC 7662 | **Offered to partners needing instant revocation** |
| **Live lookup API** | per call | custom client code | custom endpoint | none | Avoid: reinvents introspection |
| **Cached in the client** | stale | cache logic | none | none | Fine as a client-side optimisation, never as the source of truth |
| **Push webhook** | seconds | endpoint + verification | delivery, retries, DLQ | none (CAEP is close) | Phase 7, opt-in |
| **SCIM** | seconds | full SCIM server | full SCIM client | RFC 7644 | Overkill for VTK's scale |

## 10.3 Recommendation

**A three-tier model, chosen per client.**

```
 Tier 1: DEFAULT: claims in a short-lived access token
   permissions ride in the JWT; access token 10 min when `entitlements` is granted
   revocation lands within 10 minutes, automatically, with zero client work
   → logistiek, Discord bot, scheduling tool, most partners

 Tier 2: OPT-IN: introspection
   client posts the token to /oauth2/introspect before sensitive operations
   revocation is immediate; costs a round-trip
   → a partner performing irreversible actions (payments, data deletion)

 Tier 3: OPT-IN: signed revocation webhook
   AS POSTs {event, sub, client_id, permissions?} on grant/revoke/disable
   near-real-time; the client still refreshes on the next token
   → a client maintaining its own mirrored user table (a Discord role sync)
```

Tier 1 covers everything by default. Tiers 2 and 3 are per-client flags on `SsoClientProfile`, not architecture changes.

**Why not push-only:** webhooks fail. The client is down, the network partitions, the payload is dropped. A design where a missed webhook means a member keeps access indefinitely is a design where security depends on delivery guarantees you do not have. Short tokens are *self-healing*: the worst case is a ten-minute window, always, regardless of what broke.

**Why not pull-only:** introspection on every request couples every partner's latency and availability to VTK's, for a benefit most of them do not need.

## 10.4 Claim shape

```json
{
  "iss": "https://vtk.be/api/auth/better",
  "sub": "clx8f2k9a0000abcd1234",
  "aud": "https://api.partner.be",
  "azp": "crm_7fa3b2",
  "exp": 1784559600,
  "iat": 1784559000,
  "scope": "openid profile entitlements",
  "sid": "sess_9d8c7b",

  "permissions": ["crm.read", "crm.write"],

  "vtk:roles":       ["praesidium", "post-bedrijvenrelaties"],
  "vtk:groups":      ["BEDRIJVENRELATIES"],
  "vtk:permissions": ["calendar.create", "photos.upload"],
  "vtk:working_year": 2026
}
```

Naming decisions, stated once and applied everywhere:

- **`permissions`**: unnamespaced, because it is scoped to the client by construction (only that client's namespace ever appears) and because unnamespaced is what integrator libraries expect. Emitted only when `metadata.emitPermissions` is true.
- **`vtk:*`**: everything about VTK itself is namespaced, because those names would otherwise collide with a client's own vocabulary.
- **`vtk:permissions` and `vtk:roles`**: internal-tier clients only (section 9.9).
- **`vtk:working_year`**: included deliberately, so a client can tell that its cached permission set belongs to a working year that has since rolled over.

## 10.5 Resolver

```
async function resolveAccessTokenClaims({ user, scopes, resource, metadata }):
    if not user:                                   // client_credentials
        return { "vtk:client_type": "service" }    // never any permission claim

    claims = {}
    clientId = metadata?.clientId
    tier     = metadata?.trustTier ?? "partner"

    if "entitlements" in scopes and clientId:
        perms = await effectiveClientPermissions(user.id, clientId)     // 9.5
        if perms.length > MAX_PERMISSION_CLAIM (128):
            log.error("permission claim overflow", { clientId, userId: user.id })
            claims["permissions"] = []
            claims["vtk:permissions_truncated"] = true                 // 10.8
        else if metadata?.emitPermissions:
            claims["permissions"] = perms

        if tier == "internal":
            vtk = await resolveVtkAuthz(user.id)      // wraps getSession's resolution
            claims["vtk:roles"]        = vtk.roleCodes
            claims["vtk:permissions"]  = vtk.permissions
            claims["vtk:working_year"] = currentWorkingYear()

    if "vtk:membership" in scopes:
        claims["vtk:groups"] = (await resolveVtkAuthz(user.id)).groups.map(g => g.code)

    return claims
```

`resolveVtkAuthz(userId)` is the one piece of genuinely new authorisation code, and it should be a **refactor rather than a rewrite**: extract the permission-union logic out of `getSession` in `packages/auth/src/server/session.ts` into `resolveVtkAuthz(userId)`, and have `getSession` call it. Two resolvers that can disagree about what a member may do is the worst possible outcome here.

Performance: this runs on every token issue and refresh. One query with the same nested includes `getSession` already uses, plus one query for client permissions. At VTK's scale (hundreds of members, thousands of tokens per day) that is nothing; if it ever matters, a 30-second in-memory cache keyed on `(userId, clientId)` bounds it without meaningfully affecting freshness.

## 10.6 Token lifetimes

```
scopeExpirations: { entitlements: 600 }   // 10 minutes
accessTokenExpiresIn: 3600                // 1 hour, no entitlements
m2mAccessTokenExpiresIn: 900              // 15 minutes, client_credentials
idTokenExpiresIn: 36000                   // 10 hours
refreshTokenExpiresIn: 2592000            // 30 days
codeExpiresIn: 600                        // 10 minutes
```

`scopeExpirations` is the plugin option that makes tier 1 work: *"the earliest expiration takes precedence"*, so any token carrying `entitlements` is capped at ten minutes while a plain `openid profile` token keeps the full hour. Ten minutes is the deliberate answer to "how long may a revoked permission keep working" and should be stated in the partner documentation in exactly those terms.

## 10.7 JWT versus opaque, revisited

The plugin issues a **JWT** when the token request carries a `resource` the AS can bind as `aud`, and an **opaque** token otherwise. That gives VTK a lever worth using intentionally:

- **Partners doing local validation** (fast, offline) pass `resource=https://api.partner.be` and get a JWT. They accept the ten-minute revocation window.
- **Clients that must have instant revocation** omit `resource`, get an opaque token, and introspect. Revocation is immediate because the row is gone.

Document both in the integration guide, with the tradeoff stated plainly rather than left for the partner to discover.

## 10.8 Size limits

A JWT lives in an `Authorization` header. Servers cap header size (nginx defaults to 8 KB, many CDNs to 8–16 KB). A hundred permission codes at ~20 bytes is 2 KB of base64: survivable but not comfortable, and it is sent on every single request.

Guards: 64 codes per client, 128 effective per token (section 9.7), and a monitored `vtk:permissions_truncated` flag if the ceiling is ever hit. A client legitimately needing more than 128 per-user permissions has a design problem that a coarser vocabulary solves better than a bigger token; the documented answer is to grant a role-shaped permission and let the client expand it.

## 10.9 Revocation webhooks (phase 7, opt-in)

```
POST https://partner.be/vtk/events
Content-Type: application/json
VTK-Signature: t=1784559600,v1=<HMAC-SHA256(t + "." + body, clientWebhookSecret)>

{ "id": "evt_01J…", "type": "permission.revoked", "issued_at": 1784559600,
  "client_id": "crm_7fa3b2", "sub": "clx8f2k9a0000abcd1234",
  "permissions": ["crm.write"] }
```

Requirements if built: a per-client webhook secret separate from the client secret; a timestamped signature with a five-minute tolerance window to stop replay; an `id` so the client can deduplicate; at-least-once delivery with exponential backoff and a dead-letter list visible in the admin GUI; and, most importantly, **the webhook is an optimisation, never the source of truth.** The client must still treat the next token as authoritative. Document that in the same sentence as the endpoint.

The event types worth emitting: `permission.granted`, `permission.revoked`, `user.deactivated`, `client.disabled`, `consent.revoked`.

If VTK ever needs this for more than one partner, implement it as the OpenID **Shared Signals Framework / CAEP** profile rather than a bespoke shape: it is the same design with a standard envelope, and partners with existing tooling get it for free.

## 10.10 What was rejected and why

- **SCIM (RFC 7643/7644)**: a full provisioning protocol with a `/Users` and `/Groups` REST surface. Correct for enterprise IdPs pushing into SaaS. For VTK it means implementing and maintaining a SCIM server for a handful of clients, most of which have no SCIM client. Revisit only if a partner arrives already speaking it.
- **A custom "sync API"** (`GET /api/sso/users/:id/permissions`): this is introspection with a different URL and no spec. If a client needs live lookup, the answer is `/oauth2/introspect` or `/oauth2/userinfo`, both of which already exist, are authenticated correctly, and are understood by every OAuth library.
- **Long-lived tokens plus a revocation list**: a JWT denylist the RS must consult. That is introspection with worse ergonomics and a distributed cache-invalidation problem.
- **Encoding permissions in the `scope` string**: covered in 9.2.

# 11. User claims

## 11.1 Requirement

Applications must be able to request profile information: display name, email, phone, picture, student number, study programme, department, year of study, employee id, address, and fields that do not exist yet. Every one of those must be governed: released only under a scope, only with consent, only to a client entitled to it.

## 11.2 Scope design

Standard OIDC scopes keep their standard meaning. VTK scopes are namespaced and deliberately few.

| Scope | Sensitive | Releases | Consent sentence (NL) |
|---|---|---|---|
| `openid` | no | `sub` | *(implied, not shown separately)* |
| `profile` | no | `name`, `given_name`, `family_name`, `preferred_username`, `picture`, `locale`, `updated_at` | "Je naam en profielfoto" |
| `email` | no | `email`, `email_verified` | "Je e-mailadres" |
| `address` | **yes** | `address` | "Je kotadres" |
| `phone` | **yes** | `phone_number`, `phone_number_verified` | "Je telefoonnummer" |
| `offline_access` | **yes** | *(refresh token)* | "Toegang houden wanneer je niet aangemeld bent" |
| `entitlements` | no | `permissions`, and for internal clients `vtk:roles`, `vtk:permissions` | "Zien welke rechten je hebt in deze toepassing" |
| `vtk:membership` | no | `vtk:groups`, `vtk:membership_year`, `vtk:is_praesidium` | "Van welke posten je lid bent" |
| `vtk:study` | **yes** | `vtk:study_programmes`, `vtk:study_years`, `vtk:student_number`, `vtk:not_at_faculty` | "Je studierichting, studiejaar en studentennummer" |
| `vtk:contact` | **yes** | `vtk:personal_email`, `vtk:email_preference`, `birthdate` | "Je persoonlijke contactgegevens en geboortedatum" |

Ten scopes, not fifty. Fineness lives in the claim registry (which claims a client is configured for) and in permission gates, not in the scope vocabulary. A partner who needs only the student number and not the full study profile gets `vtk:study` as the scope and a client-level claim allow-list containing only `vtk:student_number`; the member's consent screen then says "Je studierichting, studiejaar en studentennummer" and the actual token contains one of the three: an acceptable and deliberately conservative asymmetry (consent describes the maximum, the token delivers the minimum).

`SsoScope` is a table, not a constant, so scopes are GUI-managed (section 7.6). The plugin's `scopes` option is populated from it at boot; adding a scope therefore does require a restart, which is the right friction level for a vocabulary change.

## 11.3 Claim catalogue

Every claim maps to a `User` field (section 0.6) via the registry. Initial contents:

| Claim | Source | Transformer | Scope | Gate | Sensitive |
|---|---|---|---|---|---|
| `sub` | `id` | n/a | `openid` | n/a | no |
| `name` | `name` | n/a | `profile` | n/a | no |
| `given_name` | `firstName` | n/a | `profile` | n/a | no |
| `family_name` | `lastName` | n/a | `profile` | n/a | no |
| `preferred_username` | `email` | `localPart` | `profile` | n/a | no |
| `picture` | `avatarKey` ?? `image` | `storageUrl` | `profile` | n/a | no |
| `locale` | `locale` | `bcp47` (`NL`→`nl-BE`) | `profile` | n/a | no |
| `updated_at` | `updatedAt` | `unixSeconds` | `profile` | n/a | no |
| `email` | `email` | n/a | `email` | n/a | no |
| `email_verified` | `emailVerified` | n/a | `email` | n/a | no |
| `birthdate` | `birthDate` | `isoDate` | `vtk:contact` | n/a | yes |
| `address` | address fields | `oidcAddress` | `address` | n/a | yes |
| `vtk:student_number` | `rNumber` | n/a | `vtk:study` | n/a | yes |
| `vtk:study_programmes` | `studyProgrammes` | `enumArray` | `vtk:study` | n/a | yes |
| `vtk:study_years` | `studyYears` | `enumArray` | `vtk:study` | n/a | yes |
| `vtk:not_at_faculty` | `notAtFaculty` | n/a | `vtk:study` | n/a | no |
| `vtk:study_confirmed_year` | `studyConfirmedYear` | n/a | `vtk:study` | n/a | no |
| `vtk:personal_email` | `personalEmail` | n/a | `vtk:contact` | n/a | yes |
| `vtk:email_preference` | `emailPreference` | n/a | `vtk:contact` | n/a | yes |
| `vtk:preferred_email` | computed | `preferredEmail` | `email` | n/a | no |
| `vtk:groups` | memberships | `groupCodes` | `vtk:membership` | n/a | no |
| `vtk:is_praesidium` | memberships | `isPraesidium` | `vtk:membership` | n/a | no |
| `vtk:roles` | roles | `roleCodes` | `entitlements` | internal tier | no |
| `vtk:permissions` | permissions | n/a | `entitlements` | internal tier | no |
| `permissions` | client permissions | n/a | `entitlements` | `emitPermissions` | no |
| `vtk:onboarded` | `onboardedAt` | `isNotNull` | `profile` | n/a | no |

Fields the user model does not have yet, such as phone number, employee id and department, are **registry rows waiting for a column**. Section 12.8 shows adding `phone_number` end to end.

## 11.4 Namespacing

`vtk:` short prefix for VTK-specific claims. The OIDC spec and the plugin's own doc comment recommend URI namespacing (`https://vtk.be/permissions`), and the deviation is deliberate:

- URI claim names are unreadable in a debugger and awkward as JavaScript property accesses.
- The collision risk that URI namespacing prevents is a *future standard claim* taking the same name. `vtk:` cannot collide, because the IANA registry contains no claim names with a colon-prefixed vendor segment and the pattern is in wide production use (Keycloak, Ory, most self-hosted ASes).
- Should a partner's tooling ever reject a colon, the registry can emit the same claim under a second, URI-shaped name for that client: a `SsoClaim.aliasName` column, one row, no code.

The reserved prefixes (`vtk:`, `oauth:`, `openid`) are validated against on claim creation, so nobody registers `vtk:` claims for a partner namespace and vice versa.

## 11.5 Placement

| Claim group | ID token | Access token | UserInfo |
|---|---|---|---|
| `sub` | ✓ | ✓ | ✓ |
| `name`, `picture`, `locale` | ✓ | n/a | ✓ |
| `email`, `email_verified` | ✓ | n/a | ✓ |
| `permissions`, `vtk:roles` | n/a | ✓ | ✓ |
| `vtk:groups` | n/a | ✓ | ✓ |
| study, contact, address | n/a | n/a | ✓ |

The principle: the ID token carries only what the client needs to render a logged-in header. The access token carries only what a resource server needs to authorise a call. Everything else is UserInfo, because UserInfo is fetched when needed, is always live, and does not inflate every HTTP request for the token's whole lifetime.

The registry encodes this per claim as three booleans (`inIdToken`, `inAccessToken`, `inUserInfo`), so placement is a GUI decision with a sane default rather than a code path.

## 11.6 The email problem

VTK has `email` (university, the login identity), `personalEmail`, and `emailPreference` selecting which the member wants used. A client running a mailing needs the *preferred* one; a client matching identity needs the *university* one. Emitting `email` alone silently gives the wrong answer to one of them.

Resolution: `email` always means the university address (it is the OIDC identity claim and must stay stable and verified), and `vtk:preferred_email` is a computed claim returning `emailPreference === 'PERSONAL' && personalEmail ? personalEmail : email`. The scope table and the integration guide say which is which in one sentence each.

## 11.7 Consent and claims

The consent screen groups by *scope* and lists the claims underneath, in human language, not claim names:

```
  ☑ Je studiegegevens
      studierichting · studiejaar · studentennummer (r-nummer)
```

`SsoClaim.consentLabelNl/En` supplies those words. A claim without consent copy cannot be marked releasable: enforced at save time, because an unlabelled claim on a consent screen is exactly the opacity consent is supposed to remove.

## 11.8 Privacy

- **Data minimisation (GDPR art. 5).** A client receives a claim only if: the scope is registered on the client, the scope was requested, the user consented, the claim is in the client's allow-list, and the gate passes. Five conjunctive conditions, all defaulting to closed.
- **Sensitive claims** (`sensitive: true`) render with a distinct visual treatment on the consent screen and are always separately declinable.
- **Special-category data.** `birthDate` is personal but not special-category; VTK stores no health, religious, or political data. If that ever changes, such a claim must be `sensitive`, permission-gated, and excluded from tokens entirely (UserInfo only) so it is never cached in a client's logs.
- **Right of access.** The member's connected-apps screen (7.10) lists per app exactly which claims it has been granted, satisfying "what does this processor receive".
- **Retention.** Claims are never copied into VTK-side storage by the AS; they are computed per request from the live `User` row. There is no claim cache to purge on deletion.
- **Minors.** VTK members are adults; no age-gating is designed in.

## 11.9 GUI management

`/admin/sso/claims` (7.7) for the registry; the client detail "Claims" tab for the per-client allow-list, showing each claim with its scope, sensitivity, gate, and a preview against a test user. Claims not covered by any scope the client holds render greyed with "vereist scope vtk:study".

---

# 12. Future-proof claim system

The user model will grow. Adding `phoneNumber` must not require touching `auth.ts`, and it must not require a developer at all once the column exists.

## 12.1 Architecture

```
 ┌────────────────────────────────────────────────────────────────────┐
 │  SsoClaim registry (DB)                                            │
 │  name · source · transformer · args · scope · gate · destinations  │
 │  labels NL/EN · sensitive · enabled · aliasName                    │
 └──────────────────────────┬─────────────────────────────────────────┘
                            │ read (cached 60 s)
 ┌──────────────────────────▼─────────────────────────────────────────┐
 │  Claim resolver                                                    │
 │   1. candidates = claims where scope ∈ granted ∧ enabled           │
 │   2. filter by destination (id_token | access_token | userinfo)    │
 │   3. filter by client allow-list                                   │
 │   4. evaluate gate (permission / tier / custom)                    │
 │   5. read source from the loaded user + authz context              │
 │   6. apply transformer(value, args)                                │
 │   7. drop null/undefined/empty                                     │
 └──────────────────────────┬─────────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        v                   v                   v
  customIdTokenClaims  customAccessTokenClaims  customUserInfoClaims
```

One registry, one resolver, three plugin hooks.

## 12.2 Registry schema

```
SsoClaim
  id             String   @id
  name           String   @unique        // "vtk:study_programmes"
  aliasName      String?                 // optional URI-shaped alias
  sourceKind     enum(USER_FIELD, AUTHZ, COMPUTED, CONSTANT)
  sourceField    String?                 // "studyProgrammes"
  transformer    String   @default("identity")
  transformerArgs Json?
  scopeCode      String                  // → SsoScope.code
  gateKind       enum(NONE, PERMISSION, TIER, CLIENT_FLAG)
  gateValue      String?
  inIdToken      Boolean  @default(false)
  inAccessToken  Boolean  @default(false)
  inUserInfo     Boolean  @default(true)
  sensitive      Boolean  @default(false)
  enabled        Boolean  @default(true)
  labelNl/En     String
  consentLabelNl/En String
  descriptionNl/En  String?
  sortOrder      Int
  createdAt/updatedAt
```

## 12.3 Source kinds

- **`USER_FIELD`**: read `user[sourceField]`. Covers most claims. Validated against a generated list of `User` field names so a typo is caught at save, not at token time.
- **`AUTHZ`**: read from the resolved authorisation context (`roles`, `permissions`, `groups`, `clientPermissions`, `workingYear`).
- **`COMPUTED`**: a named resolver in a small code registry, for anything needing logic (`preferredEmail`, `isPraesidium`, `oidcAddress`). Deliberately code, not a DSL: an expression language in a claim registry is a sandbox-escape waiting to happen and an unreviewable one at that.
- **`CONSTANT`**: a fixed value from `transformerArgs`. Useful for `vtk:tenant` or a `permissionsVersion` a partner asked for.

## 12.4 Transformers

A closed, named set. Adding one is a code change *and that is the point*: it is the boundary where arbitrary logic is reviewed.

| Transformer | Input → output |
|---|---|
| `identity` | as-is |
| `string` | `String(v)` |
| `boolean` | truthiness |
| `isNotNull` | `v != null` |
| `unixSeconds` | Date → epoch seconds |
| `isoDate` | Date → `YYYY-MM-DD` |
| `localPart` | `a@b.c` → `a` |
| `storageUrl` | storage key → `publicUrl(key)` |
| `bcp47` | `NL` → `nl-BE`, `EN` → `en` |
| `enumArray` | Prisma enum[] → lowercased string[] |
| `enumValue` | enum → lowercase string |
| `join` | array → `args.separator`-joined string |
| `first` | array → first element |
| `count` | array → length |
| `mapValues` | via `args.map` lookup table |
| `redactExceptLast` | `r0123456` → `****3456` (`args.keep`) |

Every transformer is null-safe and total: given `null` it returns `null` and the claim is dropped. A transformer that can throw would take down token issuance for one bad row.

## 12.5 ID token resolution

```
customIdTokenClaims: async ({ user, scopes, metadata }) =>
    resolveClaims({ destination: "id_token", user, scopes,
                    clientId: metadata?.clientId, tier: metadata?.trustTier })
```

## 12.6 UserInfo resolution

```
customUserInfoClaims: async ({ user, scopes, jwt }) =>
    resolveClaims({ destination: "userinfo", user, scopes,
                    clientId: jwt.azp, tier: await clientTier(jwt.azp) })
```

Note that UserInfo receives the *access token payload*, so the client is `jwt.azp` rather than `metadata.clientId`. The gate is re-evaluated here, live, which is why permission-gated sensitive claims belong in UserInfo rather than in a token that was minted an hour ago.

## 12.7 Gates

| `gateKind` | `gateValue` | Passes when |
|---|---|---|
| `NONE` | n/a | always |
| `PERMISSION` | a VTK permission code | the **user** holds it |
| `TIER` | `internal` \| `partner` | the **client**'s tier matches or exceeds |
| `CLIENT_FLAG` | a key in `metadata` | the flag is true for this client |

`PERMISSION` gating is subtle and worth stating: it gates on the *user's* right to have the claim released, not the client's. `vtk:mail_categories` gated on `mailinglists.export` means "only members who themselves may export mailing lists have this claim released to any client", which is the correct semantics for a claim that is itself an administrative capability, and the wrong semantics for ordinary profile data. Most claims should use `NONE` and rely on scope plus consent.

## 12.8 Adding a claim: two paths

**Path A: the field already exists** (no code, no deploy):

```
1. /admin/sso/claims → "Nieuwe claim"
2. name: vtk:not_at_faculty · source: USER_FIELD/notAtFaculty
   transformer: boolean · scope: vtk:study · destination: UserInfo
   labels NL/EN · consent copy NL/EN
3. Preview against a test user → true
4. Save → the client's next UserInfo call includes it
```

**Path B: a new user field** (one migration, no auth change):

```
1. Migration: add User.phoneNumber String? and User.phoneVerified Boolean @default(false)
2. Add it to the onboarding/profile form (normal product work)
3. /admin/sso/scopes → the standard `phone` scope already exists in the seed
4. /admin/sso/claims → phone_number      USER_FIELD/phoneNumber   scope phone
                     → phone_number_verified USER_FIELD/phoneVerified scope phone
5. Client detail → Claims tab → allow-list the two for the clients that need them
```

Nothing in `packages/auth` changes in either path. That is the deliverable of this section.

## 12.9 Caching and invalidation

The registry is read on every token issue, so it is cached in-process for 60 seconds. Writes through the admin GUI call `revalidatePath` *and* bump an in-memory version counter, so a change is visible immediately in the process that made it and within a minute everywhere else. Sixty seconds of staleness on a claim *definition* (not a claim *value*) is harmless; values are always read live from `User`.

## 12.10 Failure behaviour

If claim resolution throws, token issuance must not fail: a broken registry row would otherwise lock every member out of every client. Per-claim isolation:

```
for claim in candidates:
    try:    value = transform(read(claim), claim)
    catch e: log.error("claim resolution failed", { claim: claim.name, e }); continue
    if value != null: out[claim.name] = value
```

A claim that fails is *absent*, logged, and surfaced on the dashboard as "claim X faalde N keer in de laatste 24 u". Absent is safe; a 500 at the token endpoint is not.

---

# 13. Consent screens

## 13.1 Purpose

Consent is where the member decides. It is also, in a phishing scenario, the last line of defence, so the screen's job is to make "what is about to happen" unmissable, and to make declining as easy as accepting.

## 13.2 Layout

```
┌────────────────────────────────────────────────────────────────┐
│                          [ VTK logo ]                          │
│                                                                │
│                        ┌──────────┐                            │
│                        │  ▣ logo  │                            │
│                        └──────────┘                            │
│                                                                │
│                CRM Partner  wil toegang tot je                 │
│                        VTK-account                             │
│                                                                │
│               door Partner NV  ·  ⚠ externe partner            │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  Deze toepassing krijgt:                                       │
│                                                                │
│   ✓  Je naam en profielfoto                                    │
│   ✓  Je e-mailadres                                            │
│        jan.janssens@student.kuleuven.be                        │
│   ✓  Zien welke rechten je hebt in CRM Partner                 │
│                                                                │
│   ⚠  Je studiegegevens                                    [ ☑ ]│
│        studierichting · studiejaar · studentennummer           │
│                                                                │
│   ⚠  Toegang houden wanneer je niet aangemeld bent        [ ☑ ]│
│        De toepassing kan je gegevens ook opvragen wanneer      │
│        je niet ingelogd bent, tot je de toegang intrekt.       │
│                                                                │
├────────────────────────────────────────────────────────────────┤
│  ☐ Onthoud deze keuze                                          │
│                                                                │
│  Privacybeleid ↗   Gebruiksvoorwaarden ↗                       │
│                                                                │
│  Je kan deze toegang altijd intrekken via                      │
│  Mijn account → Verbonden apps.                                │
│                                                                │
│         [   Weigeren   ]        [   Toestaan   ]               │
└────────────────────────────────────────────────────────────────┘
```

Design rules, each with a reason:

- **The application name is the largest text on the page.** Consent phishing works by making the user think they are approving something else.
- **Publisher and tier are always shown.** "⚠ externe partner" versus "VTK-toepassing" is the single most useful signal a member has.
- **Scopes are sentences, not codes.** From `SsoScope.consentLabelNl/En`.
- **Sensitive scopes are individually declinable** and pre-checked only when non-sensitive. The plugin's `/oauth2/consent` accepts a `scope` parameter listing the accepted subset, so partial consent is natively supported: use it.
- **`offline_access` gets its own block with an explanation**, never a bare "offline_access" bullet.
- **Both buttons look like buttons.** A greyed-out "Weigeren" next to a bright "Toestaan" is dark-patterned consent and is not consent.
- **The revocation path is stated on the screen**, so approving does not feel irreversible.

## 13.3 Copy

House rules apply: NL and EN, no em-dashes, no forced translation of technical terms. Consent copy is *product* copy, not admin copy, so it stays in plain Dutch: "Zien welke rechten je hebt in deze toepassing", not "entitlements".

Sentences come from three tables: `SsoScope.consentLabelNl/En` for the scope line, `SsoClaim.consentLabelNl/En` for the claim detail beneath it, `SsoClientProfile.consentIntroNl/En` for the optional one-liner. Nothing on the consent screen is hard-coded per client.

## 13.4 The verified badge

`SsoClientProfile.verified` renders a small check next to the publisher, meaning "VTK reviewed this integration". It is set only by `oauth.client.manage-restricted` holders and is audited. Its value is entirely a function of its scarcity: if every client gets a badge it signals nothing. The review checklist (19.9) is what earns it.

## 13.5 When consent appears, and when it does not

```
authorize
   │
   ├── client.disabled?                     → error, no consent
   ├── client.skipConsent?                  → skip  (internal tier only)
   ├── prompt=consent?                      → always show
   ├── profile.forceConsentEveryTime?       → always show
   ├── stored oauthConsent covers scopes?   → skip
   ├── stored consent covers some?          → show ONLY the delta
   └── otherwise                            → show all
```

`skipConsent` is permitted only for `internal` tier clients and the client form enforces that: selecting `partner` or `restricted` disables the toggle and clears it. The justification is first-party processing: a member moving from `vtk.be` to `logistiek.vtk.be` is not sharing data with a third party, and a consent dialog there trains people to click through dialogs, which is a net security loss.

**Admin overrides**: an administrator can neither grant consent on a member's behalf nor pre-seed `oauthConsent` rows. There is no such action in the GUI and none should be added. The only administrative levers are `skipConsent` (a property of the client, audited) and revocation (removing consent, never adding it).

## 13.6 Re-consent

Re-prompt when: the client requests a scope not previously granted (delta only); a granted scope's `sensitive` flag is newly set; the client's `permissionNamespace` changes; the client changes trust tier from `internal` to anything else; or 12 months pass on a `restricted`-tier client. The first is the plugin's own behaviour; the rest are VTK checks in the consent page before deciding to skip, implemented by comparing a `consentPolicyVersion` on the profile against one stored on the consent row (section 13.9).

## 13.7 Implementation

Routes, locale-aware, matching the site's Dutch-first convention:

```
apps/web/app/[locale]/toestemming/page.tsx     consent  (EN alias /consent)
apps/web/app/[locale]/aanmelden/page.tsx       login    (may already exist as a portal login)
```

The plugin's `loginPage` / `consentPage` are plain strings with no locale awareness. Two options: point them at unprefixed `/toestemming` and add a tiny route that reads the locale cookie and redirects preserving the query; or point them at `/nl/toestemming` and let the page itself redirect if the member's `locale` is `EN`. **The redirect shim is better**: it keeps the query string handling in one place and avoids a wrong-language flash:

```
app/toestemming/route.ts   (no locale segment)
    GET → redirect(`/${localeFromCookieOrDefault()}/toestemming?${request.nextUrl.search}`)
```

The critical constraint from section 3.5: **the signed `oauth_query` must be round-tripped verbatim.** The redirect must preserve the entire search string byte-for-byte, and the page must pass it back untouched:

```
page /[locale]/toestemming:
    raw = request.nextUrl.search.slice(1)          // the signed blob, unmodified
    if not raw: render InvalidRequest
    q = parseQuery(raw)                            // read-only

    client  = await auth.api.getOAuthClientPublic({ query: { client_id: q.client_id } })
    profile = await db.ssoClientProfile.findUnique({ where: { clientId: q.client_id } })
    if client.disabled: render ClientDisabled

    groups = describeScopes(q.scope.split(" "), locale)   // SsoScope + SsoClaim
    render <ConsentScreen client profile groups rawQuery={raw} />

action decide(rawQuery, accepted: string[], remember: boolean):
    session = await requireSession()
    res = await auth.api.oauth2Consent({
        body: { accept: accepted.length > 0,
                scope: accepted.join(" "),
                oauth_query: rawQuery },
        headers: await headers() })
    await audit(accepted.length ? "oauth.consent.granted" : "oauth.consent.denied", session, …)
    redirect(res.redirect_uri)
```

Deviations from the house form conventions, and why they are correct here: this is not a `SaveForm`, because the outcome is a redirect to the client rather than a toast; the "Weigeren" button is not a `DeleteButton`, because declining is not destructive and must not add a confirmation step. Both are documented in `docs/design-decisions.md` when built, so a later reviewer does not "fix" them.

## 13.8 Error states

| Condition | Screen |
|---|---|
| Missing/invalid/expired signature | "Deze aanvraag is verlopen of ongeldig. Start opnieuw vanuit de toepassing." No redirect (the `redirect_uri` is untrusted). |
| Unknown `client_id` | Same message. Never confirm whether a client exists. |
| Client disabled | "Deze toepassing is uitgeschakeld. Neem contact op met VTK IT." |
| User not onboarded | Redirect to onboarding, preserving the query, then return. |
| User deactivated | "Je account is niet actief." No redirect. |
| Scope unavailable to this client | Should not reach the page (authorize rejects earlier); if it does, fail closed. |

## 13.9 Persisted consent detail

The plugin's `oauthConsent` stores scopes only. VTK adds one table so the member's connected-apps screen can show *what* was shared and so re-consent policy has something to compare against:

```
SsoConsentDetail
  id, consentId → oauthConsent.id (cascade), clientId, userId
  claims           String[]      // claim names released at the time of consent
  policyVersion    Int           // SsoClientProfile.consentPolicyVersion when granted
  ipAddress        String?       // evidence of consent
  userAgent        String?
  grantedAt        DateTime
  @@unique([consentId])
```

This is the GDPR "demonstrate consent" record and the input to 13.6's re-consent triggers.

---

# 14. Security

Organised as: what the protocol requires, what the plugin does, what VTK must add.

## 14.1 PKCE

Required for every client, public and confidential (RFC 9700). `require_pkce = true` by default; disabling requires `oauth.client.manage-restricted` plus a typed reason, and is audited. `S256` only; `plain` is rejected. Verified by test 19.5.

## 14.2 State

The AS's obligation is to echo `state` verbatim on success and on error, which the plugin does. The *client's* obligation is generation, session binding, and verification: outside VTK's control but inside VTK's integration documentation, where it is stated as a requirement rather than a suggestion. VTK's own clients (`logistiek`) must use a library that does this rather than hand-rolling.

## 14.3 Nonce

Required for OIDC flows. The plugin copies it into the ID token. VTK's integration guide requires clients to verify it and the flow tester (7.12) shows whether it round-tripped, which catches the common "we generate it but never check it" mistake.

## 14.4 CSRF

Three surfaces:

- **Authorization endpoint**: `state` (client-side).
- **Consent form**: the signed `oauth_query` is itself HMAC-bound to the request, and `/oauth2/consent` additionally requires a valid session cookie. Next.js server actions carry their own origin checks. Better Auth's `trustedOrigins` (`https://*.vtk.be` in production) bounds it further.
- **Admin actions**: server actions plus `requirePermission` on every one.

The wildcard in `trustedOrigins` deserves a note: `https://*.vtk.be` trusts every subdomain. That is intentional for a monorepo of first-party apps, and it means a compromised or unclaimed subdomain becomes a trusted origin. Keep DNS hygiene (no dangling CNAMEs) on the security checklist.

## 14.5 Replay

| Artefact | Protection |
|---|---|
| Authorization code | Single-use, 10 min, bound to client + redirect + PKCE; reuse should revoke the issued tokens |
| ID token | `nonce`, `exp`, `iat`, `aud` |
| Access token | `exp`, short lifetime; opaque tokens revocable |
| Refresh token | Rotation + reuse detection for public clients |
| Consent submission | Signed query with `exp` |
| Webhook (if built) | Timestamped signature, 5 min tolerance, event `id` for dedup |

## 14.6 Redirect URI attacks

The highest-severity input in the whole system. Rules: exact string match (the plugin's behaviour); no wildcards accepted at registration; https required except loopback; no fragments; maximum ten per client; `//` and `..` rejected; and changing them is a restricted, audited operation. The partner review checklist includes checking the registered host for a known open redirect, because an open redirect at `partner.be/r?u=` turns an exact-match redirect URI into a wildcard.

## 14.7 Refresh token theft

Hashed at rest (`storeTokens: "hashed"`); rotation mandatory for public clients; reuse detection revokes the family; bound to `clientId` and `sessionId`; `revoked` timestamp rather than deletion, so forensics survive; 30-day absolute cap; idle expiry configurable per client; user-visible and user-revocable in connected apps.

## 14.8 Session-linked revocation

Because `oauthRefreshToken.sessionId` and `oauthAccessToken.sessionId` reference `session`, VTK can cascade a session kill into OAuth grants. Add a `session.delete` database hook:

```
databaseHooks: { session: { delete: { after: async (session) => {
    await prisma.oauthAccessToken.deleteMany({ where: { sessionId: session.id } })
    await prisma.oauthRefreshToken.updateMany({
        where: { sessionId: session.id, revoked: null }, data: { revoked: new Date() } })
}}}}
```

**This is a policy decision, not an obvious win**, and it should be made explicitly: it means "log out everywhere" also disconnects the member's apps, which is what most users expect from that phrase but not what every user wants (logging out of the browser should arguably not kill a background sync they authorised separately). Recommendation: cascade on *explicit* logout-everywhere and on account deactivation; do **not** cascade on ordinary session expiry, since `onDelete: set null` already handles that gracefully. Record the choice in `docs/design-decisions.md`.

Deactivation (`User.active = false`) must revoke everything: the existing `databaseHooks.session.create.before` gate blocks new sessions but does nothing about tokens already issued.

## 14.9 Client secret storage

`storeClientSecret: "hashed"` (the default while the JWT plugin is enabled). Consequences to design around: the secret is unrecoverable, so the GUI shows it once (5.3); recovery is rotation, not retrieval; and the hash must never appear in an audit record, a log, or a server-action response.

## 14.10 Token prefixes

```
prefix: { opaqueAccessToken: "vtk_at_", refreshToken: "vtk_rt_", clientSecret: "vtk_cs_" }
```

Prefixes let GitHub secret scanning, GitGuardian, and Trufflehog recognise a leaked VTK credential in a public repo. **Set these before the first production client is registered.** The plugin's documentation is explicit that adding a prefix later requires handling it in the custom generators, because the prefix is not stored in the database. This is a five-minute change now and a migration later.

## 14.11 Rate limiting

Plugin defaults are sensible. Adjustments: raise `introspect` if tier-2 clients are onboarded (100/min is low for a busy partner; consider 600/min per client rather than globally); keep `register` at 5/min even though DCR is disabled, as defence in depth; and add VTK-side limiting on the consent page's decide action to blunt automated consent-farming.

Rate limits are per the plugin's shared limiter, keyed on IP by default. For `token` and `introspect`, keying on `client_id` would be better: a single busy partner should not exhaust the limit for everyone. If the plugin does not support that, front it with limiting at the reverse proxy.

## 14.12 JWT signing

EdDSA via the `jwt` plugin, private key in `Jwks`. Requirements: asymmetric only (never HS256 with a shared secret across clients); `kid` in every header; verifiers pin the expected algorithm and never trust the token's `alg`; and the `Jwks.privateKey` column is encrypted at rest by Better Auth: verify this on the deployed version rather than assuming it, and if it is not, the column must be encrypted with a key from the environment.

## 14.13 Key rotation

```
 1. Generate a new keypair, publish it in JWKS alongside the old.   (both in /jwks)
 2. Wait ≥ 1 × max ID token lifetime (10 h) so every client has refetched.
 3. Switch signing to the new kid.
 4. Wait ≥ 1 × max token lifetime again.
 5. Set expiresAt on the old key; remove it from JWKS after 30 days.
```

Rotate annually, and immediately on suspected compromise (in which case steps 1–3 collapse into one and every token is revoked). The `/admin/sso/discovery` screen shows key age and flags keys older than 12 months.

## 14.14 Least privilege

Applies in four places: clients get the minimum scopes (the create wizard defaults to `openid profile` and nothing else); users get the minimum client permissions (no implication, no hierarchy: section 9.6); administrators get split permissions (eleven codes, not one); and tokens get the minimum audience (`resource` binding rather than a universal token).

## 14.15 Consent phishing

The attack: register a client named "VTK Ledenportaal" with a VTK-looking logo, send members a link, harvest tokens. Mitigations already designed in: no dynamic registration, so every client is human-reviewed; the publisher and the "externe partner" tier are always shown; logos are uploaded and reviewed, not hot-linked; consent intro text is plain text, escaped, and length-limited; and client *names* are validated against a reserved-word list (`VTK`, `KU Leuven`, `Ledenportaal`, `Login`) that requires `oauth.client.manage-restricted` to override.

## 14.16 Pairwise subject identifiers

Set `pairwiseSecret` from the environment so `subject_type: "pairwise"` becomes available. It gives each client a different, unlinkable `sub` for the same member: worth offering to partners handling sensitive data, and worth defaulting to for `restricted` tier. Two warnings the GUI must show: changing `subject_type` on a live client breaks every existing account link in that client, and losing `OAUTH_PAIRWISE_SECRET` does the same for every pairwise client at once. Back it up with the same seriousness as `BETTER_AUTH_SECRET`.

## 14.17 Transport

HTTPS everywhere; HSTS with a long max-age; `useSecureCookies` in production (already set); `SameSite=Lax` on the session cookie (the OAuth redirect is a top-level GET, so Lax is sufficient and Strict would break the return leg); `Referrer-Policy: strict-origin-when-cross-origin` at least on the callback and consent routes so codes do not leak in `Referer`.

## 14.18 Audit logging as a security control

Section 5.8 covers the mechanism. The security requirement is that the log is append-only in code (no update/delete path exists), retained 24 months, and reviewed: the dashboard surfaces restricted changes in the last 7 days, which is the difference between having a log and using one.

## 14.19 Claims that must never be emitted

`isSuperAdmin` (an invitation for a client to build its own admin gate on VTK's flag), password hashes or any `Account` field, session tokens, `Jwks` material, other members' data under any claim, and raw `mailCategories` to a non-internal client. The claim registry's create form validates the source field against a denylist so these cannot be registered even by mistake.

## 14.20 Sender-constrained tokens

DPoP (RFC 9449) and mTLS (RFC 8705) bind a token to a key the client holds, so a stolen bearer token is useless. Both are out of scope: the plugin does not implement them, and VTK's threat model (a small number of reviewed partners, short token lifetimes, TLS everywhere) does not justify the complexity. Revisit if VTK ever brokers access to payment or personal-health data.

## 14.21 PAR

Pushed Authorization Requests (RFC 9126) move the authorization parameters into a back-channel POST, so nothing sensitive appears in the browser URL. The plugin supports resolving a `request_uri` through the `requestUriResolver` hook, meaning VTK could add PAR without forking. Not needed now (VTK's authorization requests contain no secrets and are well under URL limits); the hook's existence means the decision stays reversible.

## 14.22 Incident runbook

```
 Suspected client compromise
   1. /admin/sso/clients/<id> → Uitschakelen              (instant, reversible)
   2. Revoke all tokens for the client                    (7.9)
   3. Rotate the secret                                   (5.4)
   4. Read the audit log for the client, last 90 days     (7.11)
   5. If JWTs were issued: instruct resource servers to introspect for 1 h
   6. Notify the technical contact and the owning post
   7. Re-enable only after the partner confirms remediation

 Suspected AS key compromise
   1. Rotate the JWKS keypair immediately (14.13, collapsed)
   2. Revoke every refresh token; delete every opaque access token
   3. Force re-authentication for all sessions
   4. Rotate BETTER_AUTH_SECRET (invalidates in-flight signed OAuth queries)
   5. Post-mortem, and check whether Jwks.privateKey was encrypted at rest

 Member account compromise
   1. Deactivate the user (active = false)
   2. Revoke their tokens and consents across all clients
   3. Audit which clients received which claims while compromised
```

# 15. Database design

## 15.1 Principle

**The Better Auth OAuth schema is not redesigned.** The four plugin models are the plugin's contract; changing a field name breaks the adapter mapping. VTK extends by adding tables that reference `oauthClient.clientId`, plus one index-only migration to correct omissions in the generated Prisma models.

## 15.2 Existing tables

### `oauthClient`

| Column | Type | Purpose |
|---|---|---|
| `id` | String @id | Internal id |
| `clientId` | String @unique | Public `client_id` |
| `clientSecret` | String? | **Hashed**. Null for public clients |
| `disabled` | Boolean? | Kill switch |
| `skipConsent` | Boolean? | First-party bypass |
| `enableEndSession` | Boolean? | RP-initiated logout allowed |
| `subjectType` | String? | `public` \| `pairwise` |
| `scopes` | String[] | Scopes this client may request |
| `userId` | String? → User | Owner (self-service model) |
| `referenceId` | String? | Owner by reference: **VTK uses the owning post's `Group.id`** |
| `name`, `uri`, `icon` | String? | `client_name`, `client_uri`, `logo_uri` |
| `contacts` | String[] | Contact addresses |
| `tos`, `policy` | String? | Terms and privacy URLs |
| `softwareId/Version/Statement` | String? | RFC 7591 software identity |
| `redirectUris` | String[] | **Exact-match** allow-list |
| `postLogoutRedirectUris` | String[] | Logout returns |
| `tokenEndpointAuthMethod` | String? | `client_secret_basic` \| `client_secret_post` \| `none` |
| `grantTypes` | String[] | Permitted grants |
| `responseTypes` | String[] | `["code"]` |
| `public` | Boolean? | Public client |
| `type` | String? | `web` \| `native` \| `user-agent-based` |
| `requirePKCE` | Boolean? | PKCE mandatory |
| `metadata` | Json? | **Extension point**: passed to the claim hooks |
| `createdAt`, `updatedAt` | DateTime? @db.Timestamptz(3) | |

### `oauthAccessToken`

Opaque access tokens only (JWTs are not stored). `token` unique and hashed; `clientId`, `userId?`, `sessionId?`, `refreshId?` foreign keys; `scopes[]`; `expiresAt`. Per the plugin's own comment: created at issue/refresh, deleted at revoke, read at introspection, **never updated**.

### `oauthRefreshToken`

`token` (hashed), `clientId`, `userId`, `sessionId?`, `scopes[]`, `revoked: DateTime?`, `authTime: DateTime?`, `expiresAt`. `revoked` is a timestamp rather than a boolean, which preserves forensic history.

### `oauthConsent`

`clientId`, `userId`, `scopes[]`, `referenceId?`, timestamps. One row per (client, user[, reference]).

### Not a table: authorization codes

Codes live in Better Auth's generic `verification` store as a signed, serialised `VerificationValue`. Nothing to model, nothing to clean up beyond Better Auth's own expiry.

## 15.3 Existing ER diagram

```
   ┌────────┐          ┌───────────┐
   │  User  │──1:n────►│  Session  │
   └───┬────┘          └─────┬─────┘
       │                     │
       │ 1:n                 │ 1:n (sessionId, onDelete: set null)
       v                     v
   ┌─────────────────────────────────────────────────┐
   │              oauthRefreshToken                  │
   │  token · scopes[] · revoked? · authTime? · exp  │
   └──────┬───────────────────────────────┬──────────┘
          │ 1:n (refreshId)               │ n:1 (clientId)
          v                               │
   ┌──────────────────────────┐           │
   │    oauthAccessToken      │───n:1─────┤
   │  token · scopes[] · exp  │           │
   └──────────────────────────┘           │
                                          v
   ┌──────────────┐   n:1   ┌───────────────────────────┐
   │ oauthConsent │────────►│       oauthClient         │
   │ scopes[]     │         │ clientId · secret · …     │
   └──────┬───────┘         │ metadata (Json)           │
          │ n:1             └───────────────────────────┘
          v
      ┌────────┐            ┌────────┐
      │  User  │            │  Jwks  │  publicKey · privateKey · expiresAt
      └────────┘            └────────┘
```

## 15.4 Migration A: indexes and uniqueness (corrective)

The plugin declares indexes that the Prisma models do not carry (section 0.5). Pseudo-migration:

```sql
-- oauthRefreshToken
CREATE INDEX  "oauthRefreshToken_clientId_idx"  ON "oauthRefreshToken"("clientId");
CREATE INDEX  "oauthRefreshToken_userId_idx"    ON "oauthRefreshToken"("userId");
CREATE INDEX  "oauthRefreshToken_sessionId_idx" ON "oauthRefreshToken"("sessionId");
CREATE UNIQUE INDEX "oauthRefreshToken_token_key" ON "oauthRefreshToken"("token");
CREATE INDEX  "oauthRefreshToken_expiresAt_idx" ON "oauthRefreshToken"("expiresAt");

-- oauthAccessToken
CREATE INDEX  "oauthAccessToken_clientId_idx"   ON "oauthAccessToken"("clientId");
CREATE INDEX  "oauthAccessToken_userId_idx"     ON "oauthAccessToken"("userId");
CREATE INDEX  "oauthAccessToken_sessionId_idx"  ON "oauthAccessToken"("sessionId");
CREATE INDEX  "oauthAccessToken_refreshId_idx"  ON "oauthAccessToken"("refreshId");
CREATE INDEX  "oauthAccessToken_expiresAt_idx"  ON "oauthAccessToken"("expiresAt");

-- oauthConsent
CREATE INDEX  "oauthConsent_clientId_idx"       ON "oauthConsent"("clientId");
CREATE INDEX  "oauthConsent_userId_idx"         ON "oauthConsent"("userId");
CREATE UNIQUE INDEX "oauthConsent_client_user_ref_key"
    ON "oauthConsent"("clientId","userId", COALESCE("referenceId",''));
```

The unique index on refresh tokens must be created **before** any production traffic, since a duplicate would block it. Verify with `SELECT token, count(*) … HAVING count(*) > 1` first. The consent uniqueness expression handles the nullable `referenceId`, which a plain `@@unique` treats as always-distinct in Postgres.

Prisma note from `docs/permissions.md`: a running dev server locks `query_engine-windows.dll.node`, so stop it before `npm run migrate -w @vtk/db -- --name oauth_indexes`.

## 15.5 Migration B: client profile

```prisma
enum SsoTrustTier      { INTERNAL PARTNER RESTRICTED }
enum SsoClientStatus   { DRAFT ACTIVE INACTIVE ARCHIVED }

model SsoClientProfile {
  id        String @id @default(cuid())
  clientId  String @unique            // → oauthClient.clientId (app-level FK)

  status    SsoClientStatus @default(DRAFT)
  trustTier SsoTrustTier    @default(PARTNER)
  verified  Boolean         @default(false)

  // Branding
  displayName    String
  publisher      String
  logoKey        String?               // storage key, served via publicUrl()
  descriptionNl  String?
  descriptionEn  String?
  consentIntroNl String?  @db.VarChar(200)
  consentIntroEn String?  @db.VarChar(200)
  supportEmail   String?
  privacyUrl     String?
  termsUrl       String?

  // Ownership
  ownerGroupId           String?
  ownerGroup             Group?  @relation(fields: [ownerGroupId], references: [id])
  technicalContactUserId String?
  technicalContact       User?   @relation("SsoTechContact",
                                           fields: [technicalContactUserId], references: [id])

  // Governance
  createdByUserId     String?
  secretRotatedAt     DateTime?
  secretRotationDays  Int      @default(180)
  reviewedAt          DateTime?
  reviewIntervalDays  Int      @default(365)
  notes               String?

  // Permissions & claims
  permissionNamespace String?  @unique
  emitPermissions     Boolean  @default(false)
  allowedClaims       String[] @default([])

  // Policy
  forceConsentEveryTime Boolean @default(false)
  allowPromptNone       Boolean @default(true)
  maxAuthAgeSeconds     Int?
  consentPolicyVersion  Int     @default(1)
  audience              String?
  introspectionEnabled  Boolean @default(false)
  webhookUrl            String?
  webhookSecretHash     String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  permissions SsoClientPermission[]
  auditLogs   SsoAuditLog[]

  @@index([status])
  @@index([trustTier])
  @@index([ownerGroupId])
}
```

`clientId` is an application-level reference rather than a database foreign key, because `oauthClient` is owned by the plugin's adapter and a hard FK would couple its migrations to VTK's. The tradeoff is a possible orphan profile, which a nightly consistency check (19.6) reports.

## 15.6 Migration C: client permissions

```prisma
model SsoClientPermission {
  id            String  @id @default(cuid())
  clientId      String
  profile       SsoClientProfile @relation(fields: [clientId], references: [clientId],
                                           onDelete: Cascade)
  code          String
  labelNl       String
  labelEn       String
  descriptionNl String?
  descriptionEn String?
  impliesCodes  String[] @default([])
  deprecated    Boolean  @default(false)
  replacedByCode String?
  sortOrder     Int      @default(0)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  userGrants  SsoUserClientPermission[]
  roleGrants  SsoRoleClientPermission[]
  groupGrants SsoGroupClientPermission[]

  @@unique([clientId, code])
  @@index([clientId, deprecated])
}

model SsoUserClientPermission {
  id             String   @id @default(cuid())
  permissionId   String
  permission     SsoClientPermission @relation(fields: [permissionId], references: [id],
                                               onDelete: Cascade)
  clientId       String                        // denormalised for the hot query
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  grantedByUserId String?
  grantedAt      DateTime @default(now())
  expiresAt      DateTime?                     // null = until revoked (section 9.5)
  note           String?

  @@unique([permissionId, userId])
  @@index([userId, clientId])                  // the resolver's index
  @@index([clientId])
  @@index([expiresAt])
}

model SsoRoleClientPermission {
  id           String @id @default(cuid())
  permissionId String
  permission   SsoClientPermission @relation(fields: [permissionId], references: [id],
                                             onDelete: Cascade)
  clientId     String
  roleId       String
  role         Role   @relation(fields: [roleId], references: [id], onDelete: Cascade)
  grantedByUserId String?
  grantedAt    DateTime @default(now())

  @@unique([permissionId, roleId])
  @@index([roleId, clientId])
}

model SsoGroupClientPermission {
  id           String @id @default(cuid())
  permissionId String
  permission   SsoClientPermission @relation(fields: [permissionId], references: [id],
                                             onDelete: Cascade)
  clientId     String
  groupId      String
  group        Group  @relation(fields: [groupId], references: [id], onDelete: Cascade)
  kind         RoleGrantKind @default(DEFAULT)   // reuses the existing enum
  grantedByUserId String?
  grantedAt    DateTime @default(now())

  @@unique([permissionId, groupId, kind])
  @@index([groupId, clientId])
}
```

`clientId` is denormalised onto the grant tables so the hot resolver query (`where userId = ? and clientId = ?`) is a single index lookup instead of a join through `SsoClientPermission`. `kind` reuses the existing `RoleGrantKind` enum, so post-granted client permissions behave exactly like post-granted roles.

## 15.7 Migration D: claims, scopes, audit, consent detail

```prisma
enum SsoClaimSource { USER_FIELD AUTHZ COMPUTED CONSTANT }
enum SsoClaimGate   { NONE PERMISSION TIER CLIENT_FLAG }

model SsoScope {
  code            String  @id
  labelNl         String
  labelEn         String
  consentLabelNl  String
  consentLabelEn  String
  descriptionNl   String?
  descriptionEn   String?
  sensitive       Boolean @default(false)
  advertised      Boolean @default(true)
  adminOnly       Boolean @default(false)
  standard        Boolean @default(false)   // OIDC-defined; cannot be deleted
  sortOrder       Int     @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  claims SsoClaim[]
}

model SsoClaim {
  id              String @id @default(cuid())
  name            String @unique
  aliasName       String?
  sourceKind      SsoClaimSource @default(USER_FIELD)
  sourceField     String?
  transformer     String  @default("identity")
  transformerArgs Json?
  scopeCode       String
  scope           SsoScope @relation(fields: [scopeCode], references: [code])
  gateKind        SsoClaimGate @default(NONE)
  gateValue       String?
  inIdToken       Boolean @default(false)
  inAccessToken   Boolean @default(false)
  inUserInfo      Boolean @default(true)
  sensitive       Boolean @default(false)
  enabled         Boolean @default(true)
  standard        Boolean @default(false)
  labelNl         String
  labelEn         String
  consentLabelNl  String
  consentLabelEn  String
  descriptionNl   String?
  descriptionEn   String?
  sortOrder       Int     @default(0)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([scopeCode, enabled])
}

model SsoAuditLog {
  id           String   @id @default(cuid())
  event        String                       // "oauth.client.updated"
  clientId     String?
  profile      SsoClientProfile? @relation(fields: [clientId], references: [clientId])
  actorUserId  String?
  actorName    String                       // denormalised: the user may be deleted
  actorIsSuperAdmin Boolean @default(false)
  viaSuperAdmin Boolean @default(false)
  restricted   Boolean  @default(false)
  targetUserId String?
  changes      Json?                        // redacted diff
  ipAddress    String?
  userAgent    String?
  createdAt    DateTime @default(now())

  @@index([clientId, createdAt(sort: Desc)])
  @@index([actorUserId, createdAt(sort: Desc)])
  @@index([event, createdAt(sort: Desc)])
  @@index([createdAt(sort: Desc)])
}

model SsoConsentDetail {
  id            String   @id @default(cuid())
  consentId     String   @unique
  clientId      String
  userId        String
  claims        String[] @default([])
  policyVersion Int      @default(1)
  ipAddress     String?
  userAgent     String?
  grantedAt     DateTime @default(now())

  @@index([userId, clientId])
}
```

## 15.8 Extended ER diagram

```
                    ┌──────────────────┐
                    │   oauthClient    │  (plugin-owned)
                    └────────┬─────────┘
                             │ clientId (app-level reference)
                    ┌────────▼─────────┐         ┌──────────┐
                    │ SsoClientProfile │────────►│  Group   │ ownerGroup
                    │ tier · branding  │         └──────────┘
                    │ namespace · policy│        ┌──────────┐
                    └────────┬─────────┘────────►│   User   │ techContact
                             │ 1:n               └──────────┘
                    ┌────────▼──────────────┐
                    │  SsoClientPermission  │  crm.read · crm.write
                    └───┬────────┬──────┬───┘
              1:n       │        │      │       1:n
        ┌───────────────▼─┐  ┌───▼────┐ └──────────▼──────────────┐
        │SsoUserClientPerm│  │SsoRole │            │SsoGroupClientPerm│
        │  → User         │  │ClientP.│            │  → Group · kind  │
        │  expiresAt?     │  │ → Role │            └──────────────────┘
        └─────────────────┘  └──────── ┘

    ┌──────────┐  1:n   ┌──────────┐        ┌──────────────┐
    │ SsoScope │───────►│ SsoClaim │        │ SsoAuditLog  │──► SsoClientProfile
    └──────────┘        └──────────┘        └──────────────┘

    ┌──────────────┐  1:1   ┌──────────────────┐
    │ oauthConsent │───────►│ SsoConsentDetail │
    └──────────────┘        └──────────────────┘
```

## 15.9 Index rationale

| Index | Query it serves | Frequency |
|---|---|---|
| `SsoUserClientPermission(userId, clientId)` | The token-time resolver | Every token issue and refresh |
| `SsoRoleClientPermission(roleId, clientId)` | Role-derived grants | Same |
| `SsoGroupClientPermission(groupId, clientId)` | Post-derived grants | Same |
| `SsoClaim(scopeCode, enabled)` | Claim candidate selection | Every token, cached 60 s |
| `oauthConsent(clientId, userId)` | Consent skip check | Every authorize |
| `oauthAccessToken(expiresAt)` | Expiry sweep | Nightly |
| `SsoAuditLog(clientId, createdAt desc)` | Per-client audit view | Interactive |
| `SsoClientProfile(status)` / `(trustTier)` | List filters | Interactive |

## 15.10 Data lifecycle

| Data | Retention | Mechanism |
|---|---|---|
| Expired access tokens | 7 days after `expiresAt` | Nightly job |
| Revoked/expired refresh tokens | 90 days | Nightly job |
| Consent records | Until revoked | User action |
| `SsoConsentDetail` | Follows the consent (cascade) | FK |
| Audit log | 24 months | Nightly job |
| Archived clients | 30 days, then purge | Nightly job |
| Expired direct permission grants | Deleted 30 days after `expiresAt` | Nightly job |

One nightly job (`scripts/sso-maintenance.mjs` or a cron route) doing all of it, logging counts, and reporting to the dashboard. It must be idempotent and safe to run twice.

## 15.11 Seed data

Extend `packages/db/prisma/seed.ts` with idempotent upserts: the ten `SsoScope` rows from 11.2; the ~26 `SsoClaim` rows from 11.3; the eleven `Permission` rows from 8.2; and the suggested roles from 8.3. All upserts, so the seed stays safe to re-run while the dev server is up, matching the existing convention.

---

# 16. API design

## 16.1 Conventions

Base: `https://vtk.be/api/auth/better`. Errors follow RFC 6749 §5.2 (`error`, `error_description`) at protocol endpoints, and the VTK convention (`{ error: "FORBIDDEN" }` with 401/403 via `authErrorResponse`) at VTK's own routes. Admin operations are **server actions**, not REST endpoints, per the existing architecture: a new REST admin API would be a second authorisation surface to secure for no benefit.

## 16.2 Existing protocol endpoints

### `GET /oauth2/authorize`

| Parameter | Req | Notes |
|---|---|---|
| `response_type` | ✓ | `code` only |
| `client_id` | ✓ | |
| `redirect_uri` | ✓ | Exact match against registration |
| `scope` | ✓ | Space-delimited |
| `state` | recommended | Echoed back |
| `nonce` | OIDC | Into the ID token |
| `code_challenge` / `_method` | ✓ (PKCE) | `S256` |
| `prompt` | | `none` `login` `consent` `select_account` `create` |
| `max_age`, `login_hint`, `id_token_hint`, `display` | | OIDC |
| `resource` | | RFC 8707 audience binding → JWT access token |
| `request_uri` | | PAR, if `requestUriResolver` is configured |

Success: `302` to `redirect_uri?code&state&iss`. Error: `302` with `error`/`error_description`/`state`, or an on-page error when `redirect_uri` is untrusted.

### `POST /oauth2/token`

Auth: `client_secret_basic` (preferred) or `client_secret_post`; `none` for public clients.

```http
POST /api/auth/better/oauth2/token
Authorization: Basic <base64(client_id:client_secret)>
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code&code=…&redirect_uri=…&code_verifier=…
```

```json
{ "access_token": "eyJ…", "token_type": "Bearer", "expires_in": 600,
  "refresh_token": "vtk_rt_…", "id_token": "eyJ…",
  "scope": "openid profile entitlements" }
```

Also accepts `grant_type=refresh_token` (`refresh_token`, optional narrowing `scope`) and `grant_type=client_credentials` (`scope`; no `id_token`, no `refresh_token`).

### `POST /oauth2/introspect`

Client-authenticated. `token`, optional `token_type_hint`. Returns `{"active": false}` for anything unknown, expired, or revoked; otherwise the token metadata plus VTK's custom access token claims.

### `POST /oauth2/revoke`

Client-authenticated. `token`, optional `token_type_hint`. Always `200`.

### `GET|POST /oauth2/userinfo`

`Authorization: Bearer <access_token>`. Returns `sub` plus claims permitted by the token's scopes, filtered through the claim registry and the client's allow-list.

### `GET /oauth2/end-session`

`id_token_hint`, `post_logout_redirect_uri`, `state`. Requires `enableEndSession` on the client and an exact match on the post-logout URI.

### `POST /oauth2/consent` and `/oauth2/continue`

Session-authenticated, called by VTK's own consent page. `{ accept, scope?, oauth_query }` → `{ redirect_uri }`. **`oauth_query` must be the verbatim signed query string.**

## 16.3 Endpoints to mount

**Corrected 2026-07-20.** This section previously called for two root-level route
files built on `oauthProviderOpenIdConfigMetadata` / `oauthProviderAuthServerMetadata`.
That was wrong on both counts, and the reasoning behind it was wrong too.

The plugin does *not* fail to serve discovery under `basePath`. It intercepts
these paths in a plugin-level `onRequest` hook (`dist/index.mjs`,
`handleIssuerMetadataRequest`) that runs before route matching, so the
`SERVER_ONLY` marker on the two endpoints never applies. Verified live:

| Path | Status |
|---|---|
| `/api/auth/better/.well-known/openid-configuration` | 200, served by the plugin |
| `/api/auth/better/.well-known/oauth-authorization-server` | 200, served by the plugin |
| `/.well-known/oauth-authorization-server/api/auth/better` | rewritten by the proxy |
| `/.well-known/openid-configuration` | 404, and correctly so |

The last row is the substantive correction. Our issuer is `BETTER_AUTH_URL` +
`basePath`, so it carries a path. OIDC Discovery 1.0 §4 appends the well-known
segment to the issuer, which makes
`/api/auth/better/.well-known/openid-configuration` the spec-correct location;
it already works and needs no code. Mounting a second copy at the bare host root
would publish a document whose `issuer` claim (`.../api/auth/better`) disagrees
with the location it was fetched from. Strict clients reject that, and it
contradicts 12.4's own rule that the issuer must be identical everywhere.

Only the RFC 8414 §3.1 form is genuinely missing: it inserts the well-known
segment *between host and path*, giving
`/.well-known/oauth-authorization-server/api/auth/better`. That path begins with
`/.well-known`, so it falls outside the `app/api/auth/[...all]` catch-all and
Next never routes it to the auth handler. `apps/web/proxy.ts` rewrites it to the
endpoint the plugin already serves:

```ts
// apps/web/proxy.ts
const RFC8414_METADATA_PATH = "/.well-known/oauth-authorization-server";

if (pathname === `${RFC8414_METADATA_PATH}${AUTH_BASE_PATH}`) {
  const url = request.nextUrl.clone();
  url.pathname = `${AUTH_BASE_PATH}${RFC8414_METADATA_PATH}`;
  return NextResponse.rewrite(url);
}
```

A rewrite rather than a route file, so a single handler builds the document and
the two paths cannot drift apart. Note that the existing matcher excludes every
path containing a dot, so this needs its own literal matcher entry; `AUTH_BASE_PATH`
cannot be interpolated there because Next reads the matcher at build time.

With that path served, `silenceWarnings.oauthAuthServerConfig` is set in
`auth.ts`; the plugin's warning was asking for exactly this path. The companion
`openidConfig` warning never fires, since it is conditional on
`basePath !== issuerPath` and here they are equal.

JWKS is already served by the `jwt` plugin at `/api/auth/better/jwks` and the discovery document points there, so nothing to mount; but the discovery viewer (7.12) asserts it resolves.

## 16.4 Admin server actions

All in `apps/web/app/[locale]/admin/sso/actions.ts`, all returning `SaveState`.

| Action | Permission | Returns |
|---|---|---|
| `createClientAction` | `oauth.client.create` (+ restricted for restricted fields) | `SaveState` + one-time secret |
| `updateClientAction` | `oauth.client.edit` (+ restricted per diff) | `SaveState` |
| `toggleClientAction` | `oauth.client.edit` | `SaveState` |
| `rotateSecretAction` | `oauth.client.rotate-secret` | `SaveState` + one-time secret |
| `deleteClientAction` | `oauth.client.delete` | `SaveState`, redirect to the list |
| `createClientPermissionAction` | `oauth.permission.manage` | `SaveState` |
| `updateClientPermissionAction` | `oauth.permission.manage` | `SaveState` |
| `deleteClientPermissionAction` | `oauth.permission.manage` | `SaveState` |
| `grantUserPermissionAction` | `oauth.permission.manage` | `SaveState` |
| `grantRolePermissionAction` | `oauth.permission.manage` | `SaveState` |
| `grantGroupPermissionAction` | `oauth.permission.manage` | `SaveState` |
| `revokeGrantAction` | `oauth.permission.manage` | `SaveState` |
| `saveScopeAction` / `deleteScopeAction` | `oauth.scope.manage` | `SaveState` |
| `saveClaimAction` / `deleteClaimAction` | `oauth.claim.manage` | `SaveState` |
| `previewClaimAction` | `oauth.claim.manage` | resolved value |
| `revokeTokenAction` | `oauth.token.revoke` | `SaveState` |
| `revokeClientTokensAction` | `oauth.token.revoke` | `SaveState` |
| `revokeUserConsentAction` | `oauth.token.revoke` | `SaveState` |
| `completeReviewAction` | `oauth.client.edit` | `SaveState` |

Error codes returned (mapped to NL/EN in a `messages.ts` next to the page, following `/admin/roles/messages.ts`):

```
NAME_REQUIRED · REDIRECT_INVALID · REDIRECT_INSECURE · SCOPE_UNKNOWN
SCOPE_NOT_ALLOWED · GRANT_INVALID · PUBLIC_CLIENT_NO_CC · URI_INVALID
CONTACT_REQUIRED · NAMESPACE_INVALID · NAMESPACE_TAKEN · METADATA_TOO_LARGE
RESTRICTED_FIELD_DENIED · PERMISSION_CODE_INVALID · PERMISSION_IN_USE
CLAIM_NAME_RESERVED · CLAIM_SOURCE_UNKNOWN · CLAIM_DENYLISTED
SCOPE_IN_USE · CLIENT_NOT_FOUND · SECRET_ROTATION_FAILED
```

## 16.5 Member self-service actions

`apps/web/app/[locale]/account/verbonden-apps/actions.ts`: `revokeAppAccessAction(clientId)`: requires only a session (it acts on the caller's own grants), deletes the consent, revokes the token family, audits with `targetUserId = self`.

## 16.6 Testing endpoints

`/admin/sso/discovery` (7.12) needs one internal callback route to complete a test flow:

```
apps/web/app/[locale]/admin/sso/discovery/callback/route.ts
  GET  → exchange the code using the tester's chosen client
       → render decoded id_token, access token claims, and the UserInfo response
  gate: oauth.client.view; the redirect URI must already be registered on the client
```

This route must never accept a `client_secret` from the query string and never display one.

## 16.7 Endpoints deliberately not built

A REST admin API (server actions cover it, and a second surface doubles the authorisation risk); a custom permission-lookup API (introspection and UserInfo already exist: section 10.10); a bulk-import endpoint for clients (a dozen clients do not need one, and it would bypass validation); and a public client directory (an enumerable client list is reconnaissance for consent phishing).

---

# 17. Frontend architecture

## 17.1 Routes

```
apps/web/app/[locale]/
├── admin/sso/
│   ├── page.tsx                       dashboard
│   ├── actions.ts                     all server actions
│   ├── messages.ts                    error code → NL/EN
│   ├── clients/
│   │   ├── page.tsx                   list (server-driven ?q&tier&status&sort&dir&page)
│   │   ├── ClientsTable.tsx           client component
│   │   ├── new/page.tsx               3-step wizard
│   │   └── [clientId]/
│   │       ├── layout.tsx             header + tabs
│   │       ├── page.tsx               overview + branding
│   │       ├── oauth/page.tsx         restricted OAuth settings
│   │       ├── scopes/page.tsx
│   │       ├── claims/page.tsx
│   │       ├── permissions/page.tsx
│   │       ├── tokens/page.tsx
│   │       └── audit/page.tsx
│   ├── scopes/page.tsx
│   ├── claims/page.tsx
│   ├── tokens/page.tsx
│   ├── audit/page.tsx
│   └── discovery/
│       ├── page.tsx
│       └── callback/route.ts
├── toestemming/page.tsx               consent
└── account/verbonden-apps/page.tsx    member self-service

apps/web/app/
├── toestemming/route.ts               locale shim
└── .well-known/{openid-configuration,oauth-authorization-server}/route.ts
```

## 17.2 Components

New, all in `admin/sso/components/`:

| Component | Kind | Purpose |
|---|---|---|
| `ClientsTable` | client | Sortable/filterable list, icon row actions |
| `ClientForm` | client | Shared by create wizard and edit tabs |
| `RedirectUriField` | client | Repeatable URL input, per-entry validation, paste-splitting |
| `ScopePicker` | client | Grouped checkboxes with sensitivity markers |
| `ClaimPicker` | client | Allow-list with scope-dependency hints |
| `SecretRevealModal` | client | One-time display, copy with icon state |
| `PermissionMatrix` | client | Permission × (user/role/post) grid |
| `GrantForm` | client | Typeahead + expiry choice |
| `ClaimEditor` | client | Registry row editor + preview |
| `TokenTable` | client | Tokens with revoke actions |
| `AuditTable` | client | Expandable diff rows |
| `DiscoveryViewer` | server | Fetch + assert |
| `FlowTester` | client | Build an authorize URL, run it, decode the result |
| `ConsentScreen` | server | The consent page (not admin-styled) |
| `TrustTierBadge` | server | internal / partner / restricted |

Reused unchanged: `SaveForm`, `DeleteButton`, `DeleteIconButton`, `IconButton`, `IconLink`, `icons.tsx`, `Modal`, `Panel`, `SearchBar`, `SortHeader`, `ToggleDot`, `Avatar`, `useTableControls`, `SlugField` (for the permission namespace, which behaves exactly like a slug).

## 17.3 Forms and validation

Three layers, deliberately duplicated:

1. **HTML/browser**: `required`, `type="url"`, `pattern`. Free, instant, not trusted.
2. **Client-side**: inline errors as the user types, especially for redirect URIs and permission codes where the rule is non-obvious.
3. **Server action**: authoritative. Expected failures come back as `saveError(code)` and render as a red toast that stays until dismissed; unexpected failures throw into the error boundary. This is the existing house rule and it applies verbatim.

## 17.4 Permission enforcement in the UI

```
page:      const session = await requirePermission("oauth.client.view")
capability: const canEdit       = has(session, "oauth.client.edit")
            const canRestricted = has(session, "oauth.client.manage-restricted")
render:    pass booleans down; hide actions the user cannot perform
action:    re-check server-side, always
```

Hide rather than disable for actions the user may never perform; disable with an explanation for actions that are conditionally unavailable (a restricted field the user could gain access to). The difference is whether the affordance teaches the user something.

## 17.5 Dialogs

Every destructive action uses the house pattern: a modal stating what is removed **and what remains**, with explicit confirm and cancel. Never `confirm()`.

| Action | Dialog must say |
|---|---|
| Delete client | Tokens and consents are deleted; the audit log is kept; the integration stops working immediately |
| Rotate secret | The integration fails until the partner installs the new secret; the contact will be emailed |
| Disable client | Members cannot log in; existing JWT access tokens remain valid for up to N minutes |
| Delete permission | N members and M roles lose it; grants are deleted; consider deprecating instead |
| Revoke tokens | N members are logged out of this app; their VTK session is unaffected |
| Change `subject_type` | Every existing account link in this client breaks |
| Disable PKCE | This weakens the integration's security; a reason is required and recorded |

## 17.6 Search, filtering, bulk actions

Server-driven filters on the client and audit lists (URL params, SQL `where`, `take`/`skip`), mirroring `/admin/gebruikers`. Client-side `useTableControls` for the small lists (scopes, claims, a single client's permissions). Bulk actions are limited to permission grants (select several members, grant one permission): deliberately no bulk client operations, since every client-level change deserves individual attention.

## 17.7 State management

None beyond React. Server components read, server actions write, `revalidatePath` refreshes, `useActionState` drives `SaveForm`. The only genuinely client-side state is the create wizard's step data, which lives in `useState` in a single client component and posts once at the end. No client-side data fetching library, no global store.

## 17.8 Error handling

| Error | Handling |
|---|---|
| Expected input error | `saveError(code)` → red persistent toast via `SaveForm` |
| `FORBIDDEN` in a page | Thrown → the admin error boundary |
| Plugin `APIError` | Caught in the action, mapped to a code where recognisable, otherwise rethrown |
| Claim resolution failure | Per-claim isolation (12.10); logged; never fails the token |
| Discovery/JWKS fetch failure in the viewer | Shown inline as a red assertion row, never a 500 |

## 17.9 Internationalisation

All admin labels through `packages/i18n` under `admin.sso.*`; consent copy from the database (`SsoScope`, `SsoClaim`, `SsoClientProfile`), not the dictionaries, because it is content rather than chrome. Admin surfaces may use English technical vocabulary per `CLAUDE.md` ("scope", "claim", "client secret", "token"); the consent screen may not: it is member-facing and stays plain Dutch.

## 17.10 Styling

Existing tokens only (`vtk-base.css`, `vtk-admin.css`): `--paper`, `--surface`, `--line`, `--navy`, `--yellow`, `--muted`, `--body`. Admin stays operationally dense. The consent page is member-facing and follows the public design language: `--surface` card on `--paper`, 16–22px radius, thin `--line` borders, one `--yellow` accent, no gradients or decoration. The application logo is the only image and sits under no scrim.

# 18. Implementation plan

## 18.1 Inventory: built versus missing

**Already present and reusable**

| Category | Item |
|---|---|
| Plugin | `@better-auth/oauth-provider` ^1.6.23 installed and mounted |
| Plugin | `jwt` plugin with `Jwks` persistence |
| Endpoints | All 23 protocol/CRUD endpoints (0.4) |
| Endpoints | `/admin/oauth2/create-client`, `/admin/oauth2/update-client` (SERVER_ONLY) |
| Schema | `OauthClient`, `OauthAccessToken`, `OauthRefreshToken`, `OauthConsent`, `Jwks` |
| Auth | `getSession`, `SessionPayload`, `requirePermission`, `authErrorResponse` |
| Auth | The permission registry mechanism and the `Permission` type union |
| Auth | KU Leuven federation, account linking, the `active` session gate |
| GUI | `admin-table`, `SaveForm`, `DeleteIconButton`, `IconButton`, `Modal`, nav tree |
| GUI | `/api/users/search` typeahead |
| Config | `clientPrivileges` wired (needs correction), `sso.client.edit` permission |

**Missing**

| Category | Item | Phase |
|---|---|---|
| Correctness | `/aanmelden` and `/toestemming` routes | 1 |
| Correctness | RFC 8414 issuer-path `.well-known` (proxy rewrite; **not** a root mount, see 16.3) | 1 |
| Correctness | Per-action `clientPrivileges` + session cache | 1 |
| Correctness | OAuth table indexes | 1 |
| Correctness | Token prefixes (before any production client) | 1 |
| Permissions | Eleven `oauth.*` codes, roles, seed | 2 |
| Schema | `SsoClientProfile` | 2 |
| GUI | Dashboard, client list, detail, create wizard, secret modal | 2 |
| Audit | `SsoAuditLog` + writes + viewer | 2 |
| Consent | `SsoScope`, `SsoConsentDetail`, the consent screen | 3 |
| Claims | `SsoClaim` registry, resolver, transformers, three hooks | 4 |
| Claims | Claim admin GUI with preview | 4 |
| Permissions | `SsoClientPermission` + three grant tables + resolver | 5 |
| Permissions | Permission matrix GUI | 5 |
| Ops | Token/consent screens, revocation, member self-service | 6 |
| Ops | Discovery viewer, flow tester, maintenance job | 6 |
| Optional | Introspection tier, webhooks, pairwise, `logistiek` migration | 7 |

## 18.2 Phase 1: Correct the foundation

**Goal.** Everything already configured actually works. No new features.

**Files.** `packages/auth/src/auth.ts`; `packages/auth/src/index.ts` (`AUTH_BASE_PATH`); `packages/auth/src/server/session.ts`; `packages/auth/src/server/sso.ts`; `apps/web/proxy.ts` (RFC 8414 rewrite + matcher entry); `apps/web/app/toestemming/route.ts` (new); `apps/web/app/[locale]/toestemming/page.tsx` (placeholder); `packages/db/prisma/schema.prisma` + migration.

```
1. Serve the RFC 8414 issuer-path form via a proxy rewrite; assert issuer
   consistency. (Not a host-root mount: 16.3 explains why that would be wrong.)
2. Add the locale shim + a minimal consent page that round-trips oauth_query.
   (Full consent design lands in phase 3; phase 1 needs a page that is not a 404.)
3. clientPrivileges: per-action map, session cached on the Headers object.
4. Migration: indexes + refresh token uniqueness (15.4).
5. prefix: { opaqueAccessToken: "vtk_at_", refreshToken: "vtk_rt_", clientSecret: "vtk_cs_" }
6. pairwiseSecret from env.
7. Delete the stub body of server/sso.ts or implement it against adminCreateOAuthClient.
```

**Pseudo-code: the session cache:**

```
const cache = new WeakMap<Headers, Promise<SessionPayload | null>>()
export function getSessionCached(headers):
    let p = cache.get(headers)
    if (!p) { p = getSession(headers); cache.set(headers, p) }
    return p
export async function hasPermissionCached(headers, code):
    const s = await getSessionCached(headers)
    return !!s && (s.user.isSuperAdmin || s.permissions.includes(code))
```

**Risks.** The proxy matcher excludes dotted paths, so the added `.well-known` entry must be verified to actually fire (a silent miss looks identical to a 404 from the app). The unique index fails if duplicate refresh tokens exist: query first. `WeakMap` on `Headers` assumes Next passes the same object through a request; verify with a counter log before relying on it, and fall back to no caching if not.

**Testing.** `curl` both `.well-known` documents and assert `issuer` equals `BETTER_AUTH_URL` + `basePath` (**not** bare `BETTER_AUTH_URL`: `withPath` in `better-auth/dist/utils/url.mjs` appends the base path when the URL has none); assert the RFC 8414 rewrite returns a body byte-identical to the direct endpoint, and that bare `/.well-known/openid-configuration` still 404s; `curl /api/auth/better/jwks` returns ≥1 key; a manual authorize against a hand-seeded client redirects to `/nl/toestemming` rather than 404; `prisma migrate status` clean.

**Rollback.** Every item is independently revertible; the migration is index-only and reverses with `DROP INDEX`.

**Dependencies.** None. Ship first.

## 18.3 Phase 2: Client management GUI

**Goal.** Register and manage clients entirely from `/admin/sso`, with permissions and audit.

**Files.** `packages/db/src/permissions.ts`; `packages/db/prisma/seed.ts`; schema + migration (`SsoClientProfile`, `SsoAuditLog`); `apps/web/app/[locale]/admin/layout.tsx` (nav); the whole `admin/sso/` tree; `packages/i18n` dictionaries.

```
Goals
  · eleven permissions seeded, oauth-beheerder role
  · SsoClientProfile + SsoAuditLog migrated
  · dashboard, list, detail tabs (overview/branding/oauth), create wizard
  · secret one-time modal; rotate; enable/disable; delete with confirmation
  · every mutation audited
Pseudo-code:  section 5.2 (updateClientAction), 5.5 (disableClient)
```

**Risks.** The restricted-field diff is the security-critical code path in this phase; a missed field is a privilege escalation. Mitigate by deriving `RESTRICTED_FIELDS` from a single typed constant that the form also consumes, and by a test asserting every form field is classified (19.3). Secret leakage into logs or a re-rendered RSC payload is the other risk; the secret must be returned once and never stored in component state that survives a navigation.

**Testing.** Permission tests per action per role (19.3); a create→authorize→token round-trip against a real client; audit rows written for every mutation; the restricted-field denial path.

**Rollback.** New tables and new routes only; removing the nav entry hides the feature without touching auth.

**Dependencies.** Phase 1.

## 18.4 Phase 3: Consent

**Goal.** A real consent screen, backed by a scope registry.

**Files.** schema + migration (`SsoScope`, `SsoConsentDetail`); seed; `app/[locale]/toestemming/page.tsx` and `actions.ts`; `ConsentScreen` and friends; `admin/sso/scopes/`; `auth.ts` (`scopes` from the registry).

```
Goals
  · SsoScope seeded with the ten scopes (11.2)
  · consent page: branding, grouped scopes, partial consent, remember
  · skipConsent restricted to internal tier, enforced in the form
  · SsoConsentDetail written on grant
  · error states (13.8)
Risks
  · the signed oauth_query must round-trip byte-for-byte: the single
    most likely bug in the phase; test with scopes containing spaces
    and with a state value containing reserved characters
  · scopes are read from the DB at boot → a scope added in the GUI needs
    a restart; document it in the GUI ("actief na herstart")
```

**Testing.** Consent tests (19.4): first grant, delta re-prompt, partial consent, decline, skipConsent, expired signature, disabled client, deactivated user.

**Dependencies.** Phase 2 (profiles supply the branding).

## 18.5 Phase 4: Claims

**Goal.** Data-driven claims in ID tokens, access tokens, and UserInfo.

**Files.** schema + migration (`SsoClaim`); seed; `packages/auth/src/server/claims.ts` (registry read + resolver), `transformers.ts`; `auth.ts` (three hooks); `admin/sso/claims/`; client detail Claims tab.

```
resolveClaims({ destination, user, scopes, clientId, tier }):
    registry  = await claimRegistry()                     // cached 60 s
    allowList = await clientAllowedClaims(clientId)
    out = {}
    for c in registry where c.enabled
                        and c.scopeCode in scopes
                        and c[destination]
                        and (allowList is empty or c.name in allowList):
        if not passesGate(c, user, tier): continue
        try:
            v = transform(readSource(c, user, authz), c.transformer, c.transformerArgs)
        catch e:
            log.error(…); continue
        if v != null: out[c.aliasName ?? c.name] = v
    return out
```

**Risks.** A bad registry row degrading token issuance: mitigated by per-claim isolation (12.10). Leaking a field that should never be a claim: mitigated by the denylist (14.19) at claim-creation time. Performance: one user read plus a cached registry read; measure at the token endpoint.

**Testing.** Unit tests per transformer including null inputs; resolver tests for scope filtering, gates, allow-lists, and destinations; a golden-file test asserting the exact claim set for a fixture user across three client tiers.

**Dependencies.** Phase 3 (claims hang off scopes).

## 18.6 Phase 5: Per-client permissions

**Goal.** The headline feature: GUI-managed permission namespaces exposed as claims.

**Files.** schema + migration (four tables); `packages/auth/src/server/clientPermissions.ts`; refactor `session.ts` to expose `resolveVtkAuthz`; `auth.ts` (`customAccessTokenClaims`); `admin/sso/clients/[clientId]/permissions/`.

```
Goals
  · SsoClientPermission + user/role/group grant tables
  · effectiveClientPermissions(userId, clientId)   (9.5)
  · permissions / vtk:roles / vtk:permissions claims, tier-gated (9.9)
  · scopeExpirations: { entitlements: 600 }
  · permission matrix GUI, typeahead grants, expiry choice
Risks
  · the year-scoping decision (9.5) is the one users will feel; ship the
    "vervalt" control and the "via rol X (26-27)" annotation in the same
    release as the feature, not after
  · resolver divergence: refactor getSession, never copy it
  · claim size: enforce the 64/128 caps from day one
```

**Testing.** Resolution tests across all three grant paths and the year boundary (freeze the clock at 14 and 16 July); the internal-versus-partner claim gate; the client-credentials no-permissions rule; the overflow path.

**Dependencies.** Phase 4.

## 18.7 Phase 6: Operations

**Goal.** Run the thing.

```
· /admin/sso/tokens with revoke (single, per client, per member)
· /admin/sso/audit with filters and CSV export
· /[locale]/account/verbonden-apps (member self-service)
· /admin/sso/discovery: assertions, JWKS view, flow tester
· nightly maintenance job (15.10)
· dashboard "Aandacht vereist" checks
· session-delete cascade decision (14.8), recorded in design-decisions.md
```

**Risks.** The flow tester handles real tokens; it must never display a client secret, never accept an unregistered redirect URI, and always act as the requesting user.

**Dependencies.** Phase 2 (audit), phase 5 (permissions in the token view).

## 18.8 Phase 7: Optional extensions

Introspection tier for partners who need it; signed revocation webhooks (10.9); pairwise subjects for `restricted` clients; the `logistiek` migration off cookie forwarding (4.9); a conformance run against an external OIDC test suite (19.8); device flow only if a kiosk appears.

## 18.9 Sequencing and effort

```
 Phase 1  ██                     foundation, ~2 days      no dependencies
 Phase 2  ██████████             client GUI, ~2 weeks     needs 1
 Phase 3  ██████                 consent, ~1 week         needs 2
 Phase 4  ████████               claims, ~1.5 weeks       needs 3
 Phase 5  ██████████             permissions, ~2 weeks    needs 4
 Phase 6  ██████                 operations, ~1 week      needs 2, 5
 Phase 7  ████                   extensions, as needed
```

Estimates assume one developer familiar with the codebase. Phases 1–3 make VTK a usable Authorization Server for simple identity clients; phases 4–5 deliver the differentiating requirements; phase 6 is what makes it supportable by someone other than the author.

## 18.10 Cross-cutting rules

Every phase: update `docs/permissions.md` when permissions change; add a section to `docs/design-decisions.md` for any kring-specific behaviour choice (the year-scoping rule in 9.5 and the session-cascade decision in 14.8 both qualify); regenerate the lockfile from scratch if any dependency changes (`rm -rf node_modules package-lock.json && npm install`, per `AGENTS.md`); stop the dev server before migrating on Windows; and never re-export Prisma types from `@vtk/db`.

---

# 19. Testing strategy

## 19.1 Layers

```
   conformance   ── external OIDC test suite, once per release
   security      ── PKCE, redirect, replay, scope escalation, IDOR
   interop       ── real client libraries against a real flow
   integration   ── full flows against a test database
   permission    ── every action × every role
   unit          ── transformers, validators, resolvers
```

## 19.2 Unit

- **Transformers** (12.4): every one, including `null`, empty array, wrong type. Total and null-safe by contract, so the test is mechanical and cheap.
- **Validators** (5.12): a table-driven suite of redirect URIs: `https://ok.be/cb` accept; `http://ok.be/cb` reject; `http://localhost:3000/cb` accept; `https://ok.be/*` reject; `https://ok.be/cb#f` reject; `https://ok.be/a/../..%2f` reject; `javascript:alert(1)` reject; `vtk://cb` accept only for native public clients.
- **Permission codes**: the regex, the reserved namespaces, the per-client uniqueness.
- **`effectiveClientPermissions`**: direct, role, post, LEADER-only, expired, deprecated, and the union of all of them.
- **`resolveClaims`**: scope filter, destination filter, allow-list, gate, failure isolation.

## 19.3 Permission tests

The highest-value suite, because it is a matrix and matrices are where gaps hide. Generated, not hand-written:

```
for action in ALL_SSO_ACTIONS:
  for role in [none, oauth-lezer, oauth-operator, oauth-beheerder, superadmin]:
    assert allowed(action, role) == EXPECTED[action][role]
```

Plus a test asserting that **every field on the client form is classified** as restricted or not: a new field that is neither must fail the build, which is what prevents the phase-2 escalation risk from recurring silently.

## 19.4 Consent tests

First grant records `oauthConsent` + `SsoConsentDetail`; a repeat request with the same scopes skips; a superset re-prompts with only the delta; partial consent stores only the accepted subset and the token reflects it; decline redirects with `error=access_denied` and no consent row; `skipConsent` bypasses; a tampered `oauth_query` is rejected; an expired signature is rejected; a disabled client is rejected; a deactivated user is rejected.

## 19.5 Security tests

| Test | Expected |
|---|---|
| Authorize without `code_challenge` on a PKCE client | `invalid_request` |
| `code_challenge_method=plain` | rejected |
| Token with a wrong `code_verifier` | `invalid_grant` |
| Reuse an authorization code | `invalid_grant`, issued tokens revoked |
| `redirect_uri` not exactly registered | rejected, no redirect |
| `redirect_uri` differing only by trailing slash | rejected |
| Scope not registered on the client | `invalid_scope` |
| Refresh with a broader scope | rejected |
| Refresh a revoked token | `invalid_grant` |
| Reuse a rotated refresh token (public client) | family revoked |
| Introspect a revoked token | `{"active": false}` |
| Introspect without client auth | `401` |
| Token with a disabled client | rejected |
| `client_credentials` on a public client | rejected |
| `client_credentials` token contains `permissions` | **must not** |
| Partner-tier token contains `vtk:permissions` | **must not** |
| Token without `entitlements` contains `permissions` | **must not** |
| ID token `aud` equals the requesting client | always |
| `alg: none` token accepted by the resource helper | **must not** |
| Non-admin calls an admin server action | `FORBIDDEN` |
| Restricted field changed without the permission | `RESTRICTED_FIELD_DENIED` |
| Member A revokes member B's consent | `FORBIDDEN` |

## 19.6 Integration

Full authorization code + PKCE against a test database, asserting the token contents claim by claim. Refresh recomputes permissions (grant a permission mid-session, refresh, assert it appears; revoke, refresh, assert it disappears: this is the test that proves section 10's central claim). Client credentials. Revocation cascading from refresh to access token. UserInfo matching the ID token's `sub`. End-session. A nightly consistency check that every `oauthClient` has a `SsoClientProfile` and vice versa.

## 19.7 Interoperability

Run real client libraries against a dev instance, because a spec-compliant AS that no library can talk to is not useful:

| Library | Checks |
|---|---|
| `openid-client` (Node) | Discovery, code+PKCE, refresh, UserInfo, end-session |
| Better Auth `genericOAuth` | VTK as a provider for another Better Auth app |
| `next-auth` / Auth.js | The most likely partner stack |
| `pyoidc` or `authlib` (Python) | A partner on Django/Flask |
| `oauth2-proxy` | Infrastructure-level integration |
| Postman OAuth 2.0 | What a partner's developer actually uses first |

## 19.8 Conformance

The OpenID Foundation's conformance suite (`Basic OP` profile) run against a staging instance once per release. Realistic expectation: VTK will not certify (certification requires effort disproportionate to the benefit for an internal IdP), but *running* the suite surfaces spec violations that no partner would report politely. Track failures as known deviations in `docs/` with a rationale, which is also what section 3.8's limitation table becomes over time.

## 19.9 Manual testing and partner review checklist

Before any partner client goes live:

```
□ Redirect URIs are exact, https, and owned by the partner
□ The registered host has no known open redirect
□ Scopes are the minimum the integration needs
□ Claim allow-list reviewed field by field
□ Trust tier correct; skipConsent off for anything not internal
□ PKCE on
□ Secret delivered over a channel that is not email-in-plaintext
□ Support email and privacy policy present and reachable
□ Consent screen previewed in NL and EN
□ Permission namespace agreed and documented with the partner
□ Rotation and review dates set
□ A named owner post and technical contact recorded
□ Test flow run end to end with the flow tester
```

## 19.10 Regression

Golden-file tests for the two discovery documents (a diff is either intentional or a bug, and both should be visible in review); a golden claim set per fixture user per tier; a snapshot of the permission matrix. Run in CI alongside the existing lockfile verification (`npm run verify:lockfile`).

---

# 20. Risks

## 20.1 Technical

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| Plugin breaking change on upgrade | High | Medium | Pin the minor version; read the changelog before bumping; the interop suite (19.7) is the canary |
| Plugin abandonment | High | Low | Every VTK-specific concept lives in VTK tables; the protocol layer is replaceable because nothing depends on its internals |
| `oauth_query` signature handling | Medium | **High** | Round-trip verbatim; test with reserved characters; documented in 3.5 and 13.7 |
| Claim resolution latency at the token endpoint | Medium | Low | Cached registry, one user read, measured; 30 s cache available if needed |
| Token size overflow | Medium | Low | 64/128 caps, truncation flag, monitoring |
| Prisma/plugin schema drift on upgrade | Medium | Medium | Nightly consistency check; `prisma migrate status` in CI |
| `WeakMap` session cache assumption wrong | Low | Medium | Verify with a counter; degrade to no caching |

## 20.2 Migration

| Risk | Mitigation |
|---|---|
| Unique index on refresh tokens fails on existing duplicates | Query for duplicates before the migration; the table is near-empty today |
| `sso.client.edit` removal breaks a role | It gates nothing user-facing; migrate holders to `oauth-beheerder` in the same seed |
| `logistiek` cutover breaks the submodule | Additive migration with both paths live (4.9); never a flag day |
| Windows Prisma `EPERM` during migration | Documented: stop the dev server first |
| Lockfile pruned of platform binaries | `AGENTS.md` rule: regenerate from scratch; CI runs `verify:lockfile` |

## 20.3 Security

| Risk | Impact | Mitigation |
|---|---|---|
| Over-permissive redirect URI registered | **Critical** | Exact match, no wildcards, restricted field, review checklist |
| Consent phishing via a lookalike client | High | No DCR, reserved-name validation, publisher and tier always shown, uploaded logos |
| Restricted field misclassified | High | Single typed constant + build-failing classification test (19.3) |
| Client secret leaked | High | Hashed at rest, shown once, `vtk_cs_` prefix for scanners, rotation policy |
| JWT signing key compromise | **Critical** | Rotation runbook, encrypted at rest, annual rotation |
| `vtk:permissions` leaked to a partner | Medium | Tier gate + explicit test (19.5) |
| Stale permissions in a long-lived token | Medium | `scopeExpirations: { entitlements: 600 }` |
| Admin permission lost at the July cutover | Medium | Two super admins, dashboard check (8.7) |
| Subdomain takeover inside `https://*.vtk.be` | High | DNS hygiene on the security checklist |

## 20.4 Maintenance

| Risk | Mitigation |
|---|---|
| Bus factor: one person understands the OAuth layer | This document; the flow tester; the audit log |
| Registry rot (scopes and claims nobody uses) | Usage counts in the GUI; dashboard flags unused entries |
| Permission vocabulary sprawl | 64-code cap per client; deprecation workflow; review dates |
| Documentation drifting from code | `docs/permissions.md` update is a per-phase rule (18.10) |
| Orphaned clients after a partner relationship ends | Review dates + the "review verlopen" dashboard card |

## 20.5 Performance

| Risk | Mitigation |
|---|---|
| Missing indexes on OAuth child tables | Phase 1 migration |
| Permission resolution on every token | Indexed single-lookup queries; optional 30 s cache |
| Token table growth | Nightly cleanup (15.10); opaque tokens only when there is no audience |
| Audit table growth | 24-month retention; indexed by client and date |
| Claim registry read per token | 60 s in-process cache |
| `getSession` called repeatedly by the plugin | Request-scoped memo (18.2) |

## 20.6 Compatibility

| Risk | Mitigation |
|---|---|
| A partner library requires the issuer-path `.well-known` form | Add the third route (16.3) |
| A partner library rejects `vtk:`-prefixed claims | `SsoClaim.aliasName` emits a URI form for that client |
| A partner cannot do PKCE | Restricted override with a recorded reason; push back first |
| A partner wants implicit flow | Refuse; document the migration to code+PKCE |
| Browser third-party cookie restrictions break silent renewal | Refresh tokens instead of `prompt=none` iframes; `allowPromptNone` per client |
| The issuer changes (domain move) | Treat as a breaking change: re-register every client, communicate in advance |

## 20.7 Top five, and what to do about them

1. **Redirect URI validation**: the highest-severity single input. Get 5.12 exactly right, test it exhaustively (19.2), never allow a wildcard.
2. **Restricted-field classification**: a misclassified field is a privilege escalation with no error message. The build-failing classification test is the control.
3. **The `oauth_query` signature round-trip**: the likeliest functional bug, and it fails in a way that looks like a plugin problem. Verbatim, always.
4. **The 15-July reset applied to the wrong thing**: would silently empty every partner application once a year. The explicit decision in 9.5 plus the GUI annotations are the mitigation.
5. **Plugin version drift**: pin it, read changelogs, and let the interop suite tell you before a partner does.

---

# 21. Pseudo-code appendix

Consolidated reference. None of this is executable; it exists to remove ambiguity from the phases in section 18.

## 21.1 Plugin configuration

```
oauthProvider({
  loginPage:   "/aanmelden",
  consentPage: "/toestemming",

  scopes: await loadScopeCodes(),              // SsoScope, read at boot
  scopeExpirations: { entitlements: 600 },
  accessTokenExpiresIn: 3600,
  m2mAccessTokenExpiresIn: 900,
  refreshTokenExpiresIn: 2592000,

  prefix: { opaqueAccessToken: "vtk_at_", refreshToken: "vtk_rt_", clientSecret: "vtk_cs_" },
  pairwiseSecret: env.OAUTH_PAIRWISE_SECRET,
  advertisedMetadata: { scopes_supported: await loadAdvertisedScopes() },

  clientPrivileges: async ({ headers, action }) => {
      const perm = CLIENT_ACTION_PERMISSION[action]
      if (!perm) { warn("unmapped clientPrivileges action", action); return undefined }
      return hasPermissionCached(headers, perm)
  },

  clientReference: async ({ session }) => ownerGroupIdFor(session),

  customIdTokenClaims:     (i) => resolveClaims({ destination: "id_token",  ...i }),
  customUserInfoClaims:    (i) => resolveClaims({ destination: "userinfo",  ...i }),
  customAccessTokenClaims: (i) => resolveAccessTokenClaims(i),
})
```

## 21.2 Access token claims

```
async function resolveAccessTokenClaims({ user, scopes, metadata, resource }):
    if (!user) return { "vtk:client_type": "service" }

    const clientId = metadata?.clientId
    const tier     = metadata?.trustTier ?? "partner"
    const claims   = await resolveClaims({ destination: "access_token", user, scopes,
                                           clientId, tier })

    if (scopes.includes("entitlements") && clientId) {
        const perms = await effectiveClientPermissions(user.id, clientId)
        if (perms.length > 128) {
            error("permission claim overflow", { clientId, userId: user.id })
            claims.permissions = []
            claims["vtk:permissions_truncated"] = true
        } else if (metadata?.emitPermissions) {
            claims.permissions = perms
        }
        if (tier === "internal") {
            const a = await resolveVtkAuthz(user.id)
            claims["vtk:roles"]         = a.roleCodes
            claims["vtk:permissions"]   = a.permissions
            claims["vtk:working_year"]  = currentWorkingYear()
        }
    }
    return claims
```

## 21.3 Effective client permissions

```
async function effectiveClientPermissions(userId, clientId):
    const year = currentWorkingYear()
    const authz = await resolveVtkAuthz(userId)          // roleIds, groupIds, memberships

    const [direct, viaRole, viaGroup] = await Promise.all([
      db.ssoUserClientPermission.findMany({
        where: { userId, clientId,
                 OR: [{ expiresAt: null }, { expiresAt: { gt: now() } }] },
        include: { permission: true } }),
      db.ssoRoleClientPermission.findMany({
        where: { clientId, roleId: { in: authz.roleIds } },
        include: { permission: true } }),
      db.ssoGroupClientPermission.findMany({
        where: { clientId, groupId: { in: authz.groupIds } },
        include: { permission: true } }),
    ])

    const codes = new Set()
    for (const g of direct)  if (!g.permission.deprecated || g.permission.replacedByCode)
                                 addWithReplacement(codes, g.permission)
    for (const g of viaRole) addWithReplacement(codes, g.permission)
    for (const g of viaGroup) {
        if (g.kind === "LEADER" && !authz.leadGroupIds.has(g.groupId)) continue
        addWithReplacement(codes, g.permission)
    }
    return [...codes].sort()

function addWithReplacement(set, permission):
    set.add(permission.code)
    if (permission.replacedByCode) set.add(permission.replacedByCode)   // 9.8
```

## 21.4 Claim resolution

```
async function resolveClaims({ destination, user, scopes, clientId, tier }):
    const registry  = await claimRegistry()                 // 60 s cache
    const allowed   = await clientAllowedClaims(clientId)   // [] = all
    const authz     = needsAuthz(registry) ? await resolveVtkAuthz(user.id) : null
    const out = {}

    for (const c of registry) {
        if (!c.enabled) continue
        if (!scopes.includes(c.scopeCode)) continue
        if (!c[DESTINATION_FIELD[destination]]) continue
        if (allowed.length && !allowed.includes(c.name)) continue
        if (!passesGate(c, { user, authz, tier, clientId })) continue

        let value
        try {
            const raw = readSource(c, { user, authz, clientId })
            value = TRANSFORMERS[c.transformer](raw, c.transformerArgs)
        } catch (e) { error("claim failed", { claim: c.name, e }); continue }

        if (value !== null && value !== undefined && value !== "")
            out[c.aliasName ?? c.name] = value
    }
    return out

function passesGate(c, ctx):
    switch (c.gateKind) {
      case "NONE":        return true
      case "PERMISSION":  return ctx.authz.permissions.includes(c.gateValue)
                                 || ctx.user.isSuperAdmin
      case "TIER":        return TIER_RANK[ctx.tier] >= TIER_RANK[c.gateValue]
      case "CLIENT_FLAG": return !!ctx.clientFlags?.[c.gateValue]
    }
```

## 21.5 Resource server guard

```
// packages/auth/src/server/resource.ts
async function requireOAuth(request, { scope, permission, audience }):
    const bearer = readBearer(request.headers)
    if (!bearer) throw AuthError("UNAUTHENTICATED")

    const payload = await verifyAccessToken(bearer, {
        audience: audience ?? DEFAULT_AUDIENCE,
        issuer:   ISSUER,
        algorithms: ["EdDSA"],              // never trust the header's alg
    })                                       // throws on invalid

    const granted = (payload.scope ?? "").split(" ")
    if (scope && !granted.includes(scope)) throw AuthError("FORBIDDEN")

    if (permission) {
        const perms = payload.permissions ?? []
        if (!perms.includes(permission)) throw AuthError("FORBIDDEN")
    }
    return { userId: payload.sub, clientId: payload.azp,
             scopes: granted, permissions: payload.permissions ?? [] }
```

## 21.6 Audit

```
async function audit(event, session, { clientId, targetUserId, changes, restricted }):
    await db.ssoAuditLog.create({ data: {
        event,
        clientId,
        actorUserId: session.user.id,
        actorName:   session.user.name,
        actorIsSuperAdmin: session.user.isSuperAdmin,
        viaSuperAdmin: session.user.isSuperAdmin
                       && !session.permissions.includes(requiredPermissionFor(event)),
        restricted: restricted ?? false,
        targetUserId,
        changes: redact(changes),          // strips *secret*, *token*, *password*
        ipAddress: ipFromHeaders(),
        userAgent: uaFromHeaders(),
    }})
```

## 21.7 Nightly maintenance

```
async function ssoMaintenance():
    const cutoff = daysAgo(7)
    counts.accessTokens  = await db.oauthAccessToken.deleteMany({
        where: { expiresAt: { lt: cutoff } } })
    counts.refreshTokens = await db.oauthRefreshToken.deleteMany({
        where: { OR: [{ expiresAt: { lt: daysAgo(90) } },
                      { revoked: { lt: daysAgo(90) } }] } })
    counts.grants = await db.ssoUserClientPermission.deleteMany({
        where: { expiresAt: { lt: daysAgo(30) } } })
    counts.audit  = await db.ssoAuditLog.deleteMany({
        where: { createdAt: { lt: monthsAgo(24) } } })
    counts.archived = await purgeArchivedClients(daysAgo(30))

    // consistency
    orphanProfiles = profiles without a matching oauthClient
    orphanClients  = oauthClients without a profile
    report(counts, orphanProfiles, orphanClients)
```

## 21.8 Consent decision

```
action decideConsent(rawQuery, accepted: string[], remember: boolean):
    const session = await requireSession()
    if (!rawQuery) return renderInvalid()

    const res = await auth.api.oauth2Consent({
        body: { accept: accepted.length > 0,
                scope: accepted.join(" "),
                oauth_query: rawQuery },        // verbatim, never rebuilt
        headers: await headers() })

    if (accepted.length) {
        const consent = await db.oauthConsent.findFirst({
            where: { clientId: q.client_id, userId: session.user.id } })
        await db.ssoConsentDetail.upsert({
            where:  { consentId: consent.id },
            create: { consentId: consent.id, clientId: q.client_id,
                      userId: session.user.id,
                      claims: claimsForScopes(accepted),
                      policyVersion: profile.consentPolicyVersion,
                      ipAddress, userAgent },
            update: { claims: …, policyVersion: …, grantedAt: now() } })
    }

    await audit(accepted.length ? "oauth.consent.granted" : "oauth.consent.denied",
                session, { clientId: q.client_id })
    redirect(res.redirect_uri)
```

---

# Appendix A. Glossary

| Term | Meaning |
|---|---|
| **AS** | Authorization Server: issues tokens |
| **RS** | Resource Server: validates tokens, serves APIs |
| **IdP** | Identity Provider: the AS in its authentication role |
| **RP** | Relying Party: an OIDC client |
| **Claim** | One assertion about a subject |
| **Scope** | A coarse label for a category of requested access |
| **Grant** | A procedure for obtaining a token (also: an authorisation the user gave) |
| **Bearer token** | A credential whose mere possession grants access |
| **PKCE** | Proof Key for Code Exchange (RFC 7636) |
| **JWKS** | JSON Web Key Set: the AS's public keys |
| **`sub`** | Subject: the stable, opaque user identifier |
| **`azp`** | Authorized Party: the client a token was issued to |
| **`aud`** | Audience: who a token is for |
| **`kid`** | Key ID: selects a key from the JWKS |
| **DCR** | Dynamic Client Registration (RFC 7591) |
| **PAR** | Pushed Authorization Requests (RFC 9126) |
| **RAR** | Rich Authorization Requests (RFC 9396) |
| **Werkingsjaar** | VTK working year, 15 July cutover; 2026 = "26-27" |
| **Post** | A VTK werkgroep; `Group` in code |

# Appendix B. Specifications referenced

| Spec | Title | Relevance |
|---|---|---|
| RFC 6749 | OAuth 2.0 Authorization Framework | The core |
| RFC 6750 | Bearer Token Usage | `Authorization: Bearer` |
| RFC 7009 | Token Revocation | `/oauth2/revoke` |
| RFC 7517 / 7518 / 7519 | JWK / JWA / JWT | Tokens and keys |
| RFC 7591 | Dynamic Client Registration | Disabled at VTK |
| RFC 7636 | PKCE | Mandatory at VTK |
| RFC 7662 | Token Introspection | Offered per client |
| RFC 8414 | Authorization Server Metadata | Discovery |
| RFC 8628 | Device Authorization Grant | Not implemented |
| RFC 8693 | Token Exchange | Not implemented |
| RFC 8707 | Resource Indicators | `resource` → JWT audience |
| RFC 9068 | JWT Profile for Access Tokens | `roles`, `groups`, `entitlements` |
| RFC 9126 | Pushed Authorization Requests | Hook available, not enabled |
| RFC 9207 | Issuer Identification | `iss` on the redirect |
| RFC 9396 | Rich Authorization Requests | Rejected, section 9.10 |
| RFC 9449 | DPoP | Out of scope |
| RFC 9700 | OAuth 2.0 Security BCP | The source of most section 14 rules |
| OIDC Core 1.0 | OpenID Connect Core | ID tokens, UserInfo, claims |
| OIDC Discovery 1.0 | Discovery | `/.well-known/openid-configuration` |
| OIDC RP-Initiated Logout 1.0 | Logout | `/oauth2/end-session` |
| OAuth 2.1 (draft) | Consolidated OAuth | Removes implicit and password grants |

# Appendix C. Files this design touches

| Path | Change |
|---|---|
| `packages/auth/src/auth.ts` | Plugin options, hooks, prefixes, pairwise secret |
| `packages/auth/src/server/session.ts` | Extract `resolveVtkAuthz`; add the request cache |
| `packages/auth/src/server/sso.ts` | Implement or remove the stub |
| `packages/auth/src/server/claims.ts` | **New**: registry read + resolver |
| `packages/auth/src/server/transformers.ts` | **New**: the transformer set |
| `packages/auth/src/server/clientPermissions.ts` | **New**: `effectiveClientPermissions` |
| `packages/auth/src/server/resource.ts` | **New**: Bearer guard for resource servers |
| `packages/auth/src/server/audit.ts` | **New**: audit writer |
| `packages/db/src/permissions.ts` | Eleven `oauth.*` codes; retire `sso.client.edit` |
| `packages/db/prisma/schema.prisma` | Indexes + eight new models |
| `packages/db/prisma/seed.ts` | Scopes, claims, permissions, roles |
| `packages/i18n/*` | `admin.sso.*` labels |
| `apps/web/app/[locale]/admin/layout.tsx` | Nav group |
| `apps/web/app/[locale]/admin/sso/**` | **New**: the whole admin surface |
| `apps/web/app/[locale]/toestemming/**` | **New**: consent |
| `apps/web/app/[locale]/account/verbonden-apps/**` | **New**: self-service |
| `apps/web/app/toestemming/route.ts` | **New**: locale shim |
| `apps/web/app/.well-known/**` | **New**: discovery mounts |
| `docs/permissions.md` | Document the `oauth.*` family |
| `docs/design-decisions.md` | Year-scoping of client permissions; session cascade; consent-page form deviations |

# Appendix D. Open questions

Everything below is a product decision, not an architectural one; each has a recommended default so implementation is never blocked.

| # | Question | Recommended default |
|---|---|---|
| 1 | Should logging out everywhere disconnect OAuth apps? | Yes for explicit logout-everywhere and deactivation; no for ordinary expiry (14.8) |
| 2 | Do direct client-permission grants survive 15 July? | Yes, with an optional expiry (9.5) |
| 3 | Which post owns SSO administration by default? | IT, via the seeded `admin` role |
| 4 | Do we offer introspection to all partners or on request? | On request; document the tradeoff (10.3) |
| 5 | Does `logistiek` migrate in phase 7 or later? | Phase 7, additively (4.9) |
| 6 | Is the verified badge granted to all internal clients automatically? | No: earn it through the review checklist (19.9) |
| 7 | Do we advertise `vtk:` scopes publicly in discovery? | Yes for `vtk:study` and `vtk:membership`; no for partner-specific ones (6.9) |
| 8 | Should the consent screen show the raw email value? | Yes: showing the actual value is more honest than "your email address" |
