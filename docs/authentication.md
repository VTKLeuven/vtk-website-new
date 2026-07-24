# Authenticatie (better-auth, KU Leuven OIDC, sessies)

Referentie voor alles rond inloggen en sessies op de VTK-site: de twee
login-paden (wachtwoord en KU Leuven SSO), hoe better-auth geconfigureerd is,
hoe een sessie tot permissies leidt, en hoe de submodule-apps (logistiek)
diezelfde sessie hergebruiken.

Verwante docs, die hier niet herhaald worden:

- `docs/permissions.md`: het rollen + posten + permissies-model en hoe rechten
  per werkingsjaar resolven. Dit document stopt bij "de sessie kent zijn
  permissies"; hoe die lijst tot stand komt staat daar.
- `docs/onboarding-study-gate.md`: de onboarding- en studiebevestiging-gates in
  `apps/web/proxy.ts` (netwerkgrens), en waarom ze niet in een layout leven.
- `docs/design-decisions.md`: de product-/kringkeuzes rond ledenregistratie
  (wie mag registreren, verplichte onboarding, jaarlijkse studiebevestiging).

## Overzicht

Er zijn twee manieren om binnen te geraken, allebei via [better-auth](https://better-auth.com):

1. **Wachtwoord** (`credential`-account, argon2-hash). Enkel voor accounts die een
   admin heeft aangemaakt; self-service registratie staat uit.
2. **KU Leuven SSO** (OpenID Connect, Authorization Code Flow + PKCE). Het lid
   logt in bij KU Leuven; een onbekend KU Leuven-account mag zichzelf
   aanmaken en belandt dan in de onboarding.

Beide leiden tot dezelfde better-auth-sessie (dezelfde cookie, dezelfde
`Session`/`Account`-tabellen). Daarbovenop bouwt de app een rijkere
`SessionPayload` met de permissies van het huidige werkingsjaar.

De centrale app (`@vtk/web`, `vtk.be`) is de enige die better-auth echt draait.
De submodule-apps (`@vtk/logistiek`, `logistiek.vtk.be`) hebben geen eigen
auth: ze verifiëren de gedeelde cookie remote tegen de hoofdsite.

## Waar staat wat (`packages/auth`)

Het `@vtk/auth`-package bundelt alle auth-logica. Het heeft bewust gescheiden
entrypoints zodat client-, server- en remote-code niet door elkaar lopen:

| Import | Bestand | Voor |
| --- | --- | --- |
| `@vtk/auth` | `src/index.ts` | Types + browser-veilige helpers (`hasPermission`, `SessionPayload`, `AuthError`, ...). Mag overal. |
| `@vtk/auth/server` | `src/server.ts` | Server-only. De centrale app: `getSession`, `signInEmail`, `signOut`, `ApiHandler`, `createUser`, ... |
| `@vtk/auth/remote` | `src/remote.ts` | Server-only. Submodule-apps: `fetchSession` (valideert de cookie tegen de hoofdsite). |
| `@vtk/auth/client` | `src/client.ts` | `'use client'`. De better-auth react-client + `signInKul`. |

Interne bestanden:

- `src/auth.ts`: de `betterAuth({...})`-configuratie (het hart).
- `src/logins/kul.ts`: de KU Leuven OIDC-provider (genericOAuth-config).
- `src/logins/password.ts`: argon2 hash/verify.
- `src/server/session.ts`: `getSession` (sessie -> permissies, per werkingsjaar).
- `src/server/users.ts`: admin-gebruikersbeheer (`createUser`, ...).
- `src/apiHandlers/`: de `/api/auth/[...all]`-router (better vs remote).
- `src/permissions.ts`, `src/workingYear.ts`, `src/names.ts`: zie `permissions.md`.

`@vtk/auth` re-exporteert bewust **geen** Prisma-client-types (zie `AGENTS.md`).

## better-auth-configuratie (`src/auth.ts`)

```ts
betterAuth({
  appName: "VTK",
  baseURL: process.env.BETTER_AUTH_URL,     // bv. https://dev.vtk.be
  basePath: "/api/auth/better",             // alle better-auth-endpoints hangen hieronder
  secret: process.env.BETTER_AUTH_SECRET,   // cookie/token-signing; openssl rand -base64 32
  trustedOrigins: isProduction ? ["https://*.vtk.be"] : ["http://localhost:3000", "http://localhost:3001"],
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  plugins: [ ...(kulConfig ? [genericOAuth({ config: [kulConfig] })] : []), nextCookies() ],
  emailAndPassword: { enabled: true, disableSignUp: true, password: { hash, verify } },
  account: { accountLinking: { enabled: true, trustedProviders: ["kuleuven"] } },
  databaseHooks: { session: { create: { before: activeGate } } },
  session: { expiresIn: 30d, updateAge: 1d },
  advanced: { cookiePrefix: "vtk", useSecureCookies: isProduction, crossSubDomainCookies: {...} },
  user: { additionalFields: { rNumber, rNumberFromKul, avatarKey, locale, active, isSuperAdmin } },
})
```

Belangrijke keuzes:

- **`basePath: "/api/auth/better"`.** Alle better-auth-routes leven onder
  `/api/auth/better/*`. De callback-URL voor OIDC wordt hieruit afgeleid (zie
  KU Leuven-sectie). `nextCookies()` moet **als laatste** plugin staan.
- **`disableSignUp: true`.** Er is geen publieke wachtwoord-registratie.
  Wachtwoord-accounts maakt een admin aan (`createUser`); KU Leuven-accounts
  mogen zichzelf provisionen via SSO (zie hieronder).
- **Cross-subdomain cookies.** In productie is de cookie `vtk.*` en geldt ze
  voor `BETTER_AUTH_COOKIE_DOMAIN` (`.vtk.be`), met `useSecureCookies`. Zo kan
  `logistiek.vtk.be` diezelfde cookie meesturen en remote laten valideren.
  Lokaal staat dit uit (http, localhost).
- **Actieve-lid-gate op sessieniveau.** `databaseHooks.session.create.before`
  gooit `FORBIDDEN / INACTIVE_USER` als `user.active` false is. Zo kan een
  gedeactiveerd lid **langs geen enkel pad** (wachtwoord noch SSO) een sessie
  krijgen. De wachtwoord-`loginAction` checkt `active` ook vooraf voor een nette
  foutmelding, maar deze hook is het slot.
- **`additionalFields`.** Extra User-kolommen die better-auth in de sessie moet
  kennen of zelf mag schrijven. `rNumber` staat op `input: true` (default) zodat
  de KU Leuven-profielmapping hem bij eerste login kan wegschrijven; `active`,
  `isSuperAdmin`, `avatarKey` staan op `input: false` zodat ze niet via een
  client-request te zetten zijn. **Let op:** better-auth negeert
  `input: false`-velden bij het overnemen van een OAuth-profiel, dus een veld
  dat uit SSO gevuld moet worden mag niet `input: false` zijn.

## Wachtwoord-login (`credential`)

- Hash: argon2id via `@node-rs/argon2` (`src/logins/password.ts`), met de
  better-auth-defaults. `hashPassword`/`verifyPassword` worden aan
  `emailAndPassword.password` doorgegeven.
- Een wachtwoord-account is een `Account`-rij met `providerId: "credential"` en
  id `credential:<userId>`. `createUser`/`setUserPassword` beheren die
  (zie Gebruikersbeheer).
- **Login-flow** (`apps/web/app/actions/auth.ts`, `loginAction`):
  1. valideert e-mail/wachtwoord (zod);
  2. checkt `user.active` vooraf (nette "INVALID" i.p.v. een error boundary);
  3. `signInEmail(headers, {...})` -> better-auth zet de cookie;
  4. redirect naar `next` (enkel interne paden).
  Foute credentials en inactieve accounts geven allebei `INVALID` (geen
  user-enumeratie).

## KU Leuven SSO (OpenID Connect)

### Wat het is

KU Leuven draait een **Shibboleth OIDC OP** op `https://idp.kuleuven.be` (issuer),
discovery op `https://idp.kuleuven.be/.well-known/openid-configuration`. ICTS
onboardt ons als **confidential client** onder de **Authorization Code Flow**:
de client secret blijft server-side en mag nooit in de browser. We gebruiken
**PKCE** (S256) en `client_secret_post`. We registreren de provider als
better-auth **`genericOAuth`**-provider en laten better-auth de code-uitwisseling
en de userinfo-call afhandelen.

### Provider-config (`src/logins/kul.ts`)

De config komt volledig uit env-vars, zodat de ICTS-credentials zonder
code-wijziging ingevuld kunnen worden. `kulOAuthConfig()` geeft `null` terug als
de env-vars ontbreken; dan wordt de provider niet geregistreerd en werkt de site
met enkel wachtwoord-login (`isKulEnabled()`).

```ts
{
  providerId: "kuleuven",
  clientId: KUL_OIDC_CLIENT_ID,           // = de Entity ID die ICTS registreerde (bv. dev.vtk.be)
  clientSecret: KUL_OIDC_CLIENT_SECRET,   // backend-only, uit de aparte ICTS-mail
  issuer: "https://idp.kuleuven.be",
  authorizationUrl: "https://idp.kuleuven.be/idp/profile/oidc/authorize",
  tokenUrl: "https://idp.kuleuven.be/idp/profile/oidc/token",
  userInfoUrl: "https://idp.kuleuven.be/idp/profile/oidc/userinfo",
  scopes: ["openid", "profile", "email", "allattributes"],
  getUserInfo: getKulUserInfo,             // haalt userinfo altijd op en voegt ID-tokenclaims samen
  pkce: true,
  authentication: "post",                 // client_secret_post (matcht ICTS-registratie)
  mapProfileToUser: (profile) => ({ email, name, emailVerified: true, rNumber? }),
}
```

- **Callback-URL wordt afgeleid, niet gehardcodeerd.** better-auth bouwt de
  redirect-URI als `<baseURL><basePath>/oauth2/callback/<providerId>`, dus
  `<BETTER_AUTH_URL>/api/auth/better/oauth2/callback/kuleuven`. Die moet exact
  matchen met wat bij ICTS geregistreerd staat. `KUL_OIDC_REDIRECT_URI` overschrijft
  dit enkel indien nodig; normaal leeg laten.
- **Endpoints zijn expliciet geconfigureerd.** Ze komen overeen met KU Leuvens
  officiële discoverydocument, maar Better Auth krijgt bewust geen
  `discoveryUrl`: anders haalt de plugin dat document op vóór elke redirect en
  nogmaals vóór elke callback. Een tijdelijke timeout van de metadata-URL zou
  dan zelfs het openen van de KU Leuven-login blokkeren. De
  `KUL_OIDC_DISCOVERY_URL`-env blijft voorlopig de feature-toggle, zodat bestaande
  omgevingsconfiguratie compatibel blijft.
- **`mapProfileToUser`** vertaalt de KU Leuven-claims naar de velden waarmee
  better-auth een User zoekt/aanmaakt:
  - **`email`**: stuurt account-linking aan (zie hieronder), dus moet matchen met
    de `User.email` van een voorgeprovisioneerd lid. KU Leuven levert e-mail via
    `email`, met fallback op `preferred_username`/`upn`.
  - **`name`**: weergavenaam (`name` / `displayName`, of `given_name` +
    `family_name`).
  - **`rNumber`**: het studentennummer, om het onboarding-veld voor te vullen.
    KU Leuven's `uid`-attribuut is voor studenten `r` + 7 cijfers; we hardcoden
    de claim-naam niet maar scannen elke string-claim op die vorm (`profileRNumber`).
    Wordt **enkel bij de eerste login** (user-aanmaak) gezet; latere logins
    overschrijven bewust niets (anders zou een naamswijziging uit onboarding
    telkens teruggezet worden). Vereist het `rNumber`-`additionalField` in
    `auth.ts`.
  - **`rNumberFromKul`**: `true` wanneer het r-nummer van KU Leuven kwam. Dan
    staat het veld in het profielformulier **read-only** (net als de e-mail) en
    weigert `saveProfileAction` het te wijzigen. Wie zelf een r-nummer intypte
    (flag blijft `false`) mag het gewoon aanpassen. Ook een `additionalField`,
    om dezelfde reden als `rNumber`.

### Debuglog: welke claims geeft KU Leuven vrij?

Om te controleren welke attributen ICTS effectief vrijgeeft (bv. of
`KULeuvenEmployeeType`/de faculteit binnenkomt), is er een opt-in debuglog onder
**Admin -> IT**, sectie "KU Leuven SSO (OIDC)". Superadmin-only.

- **Toggle in de DB**, niet in de omgeving: `Setting`-sleutel `kul.debug`
  (`{ enabled: boolean }`). `mapProfileToUser` leest die live bij elke login, dus
  aan/uit werkt zonder redeploy. Zie `packages/auth/src/logins/kul-debug.ts`.
- **Wat er bewaard wordt**: staat de toggle aan, dan schrijft `recordKulProfile`
  bij elke KU Leuven-login één `KulAuthLog`-rij met de **ruwe claims** die
  better-auth aan `mapProfileToUser` doorgeeft, plus de afgeleide `email`/`rNumber`.
  Het loggen faalt dicht: een DB-fout mag een login nooit breken.
- **Privacy**: die claims bevatten persoonsgegevens (naam, e-mail, r-nummer,
  faculteit). Daarom staat het standaard uit, bewaren we enkel de laatste
  `KUL_LOG_KEEP` (50) logins, en is er een "Clear logs"-knop.
- **Userinfo wordt altijd opgehaald**: better-auth zou standaard meteen de
  **ID-token**-claims gebruiken zodra die `sub` en `email` bevatten. Daardoor
  ontbraken attributen die ICTS enkel via userinfo vrijgeeft. Onze custom
  `getKulUserInfo` (`packages/auth/src/logins/kul-userinfo.ts`) haalt daarom bij
  elke login `https://idp.kuleuven.be/idp/profile/oidc/userinfo` op en voegt die
  claims samen met het ID-token. Bij een tijdelijke userinfo-fout blijft de login
  werken met de ID-tokenclaims; een afwijkende `sub` wordt om veiligheidsredenen
  geweigerd.
- **`allattributes`-scope**: KU Leuvens eigen OIDC-testclient vraagt naast
  `openid profile email` ook deze KU Leuven-specifieke scope aan. Ze staat niet
  in `scopes_supported` van het discoverydocument, maar activeert de
  client-specifieke attributen die ICTS voor VTK vrijgeeft. Zonder die scope én
  zonder de expliciete userinfo-call zagen we alleen de 15 standaardclaims uit
  het ID-token.
- **Faculteit Ingenieurswetenschappen**: voor studenten bevat
  `eduPersonOrgUnitDN` de faculteitseenheid. De adminweergave herkent
  `KULouNumber=50000486,...` expliciet als de faculteit Ingenieurswetenschappen en
  licht daarnaast `KULemployeeType`, `KULdipl` en `KULopl` uit als die door ICTS
  worden vrijgegeven.
- **Opgeslagen FirW-status**: na elke geslaagde userinfo-call wordt
  `User.firwStudent` afgeleid uit nummer `50000486` in `eduPersonOrgUnitDN`.
  `User.firwStudentChangedAt` wordt bij de eerste geldige controle ingevuld en
  daarna alleen aangepast als de boolean effectief wijzigt. Een tijdelijke
  userinfo-fout wijzigt geen van beide velden. De update is atomair, zodat ook
  gelijktijdige logins de wijzigingsdatum niet onnodig verschuiven.

### Account-linking & self-provisioning

`account.accountLinking.trustedProviders: ["kuleuven"]`. Omdat KU Leuven een
geverifieerd e-mailadres teruggeeft, linkt better-auth een KU Leuven-login aan
het bestaande lid met datzelfde e-mailadres, in plaats van te falen op een
duplicaat.

- **Bestaand lid** (voorgeprovisioneerd met dat e-mailadres): de KU Leuven-account
  wordt eraan gelinkt.
- **Onbekend KU Leuven-account**: better-auth maakt een verse User aan
  (self-provisioning). Er is geen `user.create`-hook die dat blokkeert; omdat
  wachtwoord-signup uitstaat en admin-users buiten better-auth om worden
  aangemaakt, gebeurt dit enkel voor SSO. Het nieuwe lid komt binnen zonder
  posten/permissies en met `onboardedAt = null`, waardoor de onboarding-gate het
  eerst het profiel laat invullen.
- **Match op e-mail is exact.** Geeft KU Leuven `voornaam.naam@student.kuleuven.be`
  terug terwijl het voorgeprovisioneerde lid een ander adres heeft, dan linkt het
  niet maar ontstaat een tweede account. Zorg dat voorgeprovisioneerde accounts
  het KU Leuven-mailadres als `email` hebben.

### De login-knop

- `isKulEnabled()` bepaalt of de knop getoond wordt (`inloggen/page.tsx`); zonder
  de env-vars verschijnt ze niet.
- `KulSignInButton` roept `signInKul(next)` aan (`src/client.ts`), dat
  `authClient.signIn.oauth2({ providerId: "kuleuven", callbackURL, errorCallbackURL })`
  start. Bij een fout keert het lid terug naar `/inloggen?error=kul`.

### Registratie bij ICTS

- De **Entity ID** die je in de Shibboleth-tool invult **is** de OIDC
  `client_id`. Voor dev registreerde ICTS `dev.vtk.be`. Dit is een stabiele
  identifier; die mag niet wijzigen tussen deploys, daarom uit
  `KUL_OIDC_CLIENT_ID` en niet uit de host afgeleid.
- De **client secret** hoort bij één specifieke `client_id`. Gebruik dus de
  `client_id` waarvoor jouw secret is uitgegeven; een mismatch geeft
  `invalid_client` op het token-endpoint.
- **`/sso-metadata`** (superadmin-only, `apps/web/lib/sso.ts`) toont de exacte
  waarden om te registreren (Entity ID, Redirect URI, info-/privacy-/logo-URL),
  allemaal afgeleid uit `BETTER_AUTH_URL` zodat ze per deployment kloppen.
- **Dev en prod zijn aparte ICTS-configs**, elk met een eigen `client_id` +
  secret. Dev = `dev.vtk.be`; prod (`vtk.be`) is een aparte config die ICTS in
  een volgende stap aanmaakt.

## Sessies & permissies

### `getSession` (`src/server/session.ts`)

Dit is de brug tussen better-auth en het rechtenmodel. Het:

1. haalt de ruwe better-auth-sessie op (`auth.api.getSession`);
2. laadt de User met zijn posten (`memberships`) en direct toegewezen `roles`,
   **gefilterd op het huidige werkingsjaar** (`currentWorkingYear()`);
3. weigert (`return null`) als de User weg is of `active` false;
4. verzamelt de permissie-codes en rol-id's uit die rollen (posten geven
   `DEFAULT`-rollen aan elk lid en `LEADER`-rollen enkel aan de lead);
5. geeft een `SessionPayload` terug: `{ token, expiresAt, user, groups,
   permissions, roleIds }`.

Omdat de permissies per werkingsjaar bepaald worden, **resetten rechten
automatisch op 15 juli** (behalve `isSuperAdmin`, dat op de User zelf staat).
Details van dat model: zie `docs/permissions.md`.

### Permissie-checks (`@vtk/auth`, browser-veilig)

`hasPermission(session, code, { groupId? })` bevat de **superadmin-bypass**
(een superadmin passeert elke check). Daarnaast `hasAnyPermission`,
`hasAllPermissions`, `isMemberOfGroup`. Deze zijn puur en importeerbaar in
client-components.

### Web-helpers (`apps/web/lib/session.ts`)

- `getCurrentSession()`: `getSession(await headers())` in React `cache`, zodat de
  layout-gate, de header en de pagina samen één DB-round-trip delen per render.
- `requireSession(redirectTo?)`: sessie of redirect/throw.
- `requirePermission(p)` / `requireAnyPermission([...])`: sessie + rechtencheck,
  gooien `FORBIDDEN`.
- `authErrorResponse(err)`: zet die throws om in een 401/403 JSON-response (voor
  route-handlers).

## API-routes (`/api/auth/[...all]`)

Eén catch-all route (`apps/web/app/api/auth/[...all]/route.ts`) delegeert naar
`ApiHandler()` uit `@vtk/auth/server`. Die routeert op het eerste pad-segment
(`src/apiHandlers/apiHandler.ts`):

- **`/api/auth/better/*`** -> de echte better-auth-handlers (`toNextJsHandler(auth)`):
  login, logout, OAuth-callback, sessie, ... Alles wat de client-SDK en de OIDC
  flow gebruiken.
- **`/api/auth/remote/session`** (enkel GET) -> geeft de `SessionPayload` als JSON
  terug voor remote apps, of `401 null`. Antwoorden zijn `Cache-Control: no-store`.
- Al de rest -> 404; verkeerde methodes -> 405.

## Remote apps (logistiek)

De submodule-apps draaien geen better-auth. Ze hergebruiken de gedeelde
`.vtk.be`-cookie:

- `apps/logistiek/lib/session.ts` roept `fetchSession(headers)` uit
  `@vtk/auth/remote` aan.
- `fetchSession` (`src/remote.ts`) stuurt de `cookie`-header door naar
  `${VTK_MAIN_URL}/api/auth/remote/session` en krijgt de `SessionPayload` terug.
  In Compose praat dat over het interne Docker-netwerk (`VTK_MAIN_URL` ->
  `http://web:3000`); daarbuiten over het internet.
- De permissie-checks (`hasPermission`) draaien lokaal op de teruggekregen
  payload. Logistiek: elk ingelogd lid mag aanvragen; beheer vraagt
  `logistiek.manage`.

Belangrijk: een remote app importeert **`@vtk/auth/remote`**, nooit
`@vtk/auth/server` (dat zou better-auth + Prisma mee de submodule in trekken).

### Test-login (enkel testomgeving)

Op een testomgeving (lokaal, `logistiek.dev.vtk.be`) is inloggen via de echte KU
Leuven-SSO lastig, en logistiek heeft zelf geen auth. De toggle
`LOGISTIEK_TEST_LOGIN=true` schakelt daarom een **test-login** in: via
`/test-login` kies je een vast profiel en `getSession` fabriceert een
`SessionPayload` voor die persoon (cookie `logistiek-test-user`). Zonder geldige
cookie valt hij terug op de echte `fetchSession`, dus de gewone website-login
blijft ernaast werken.

- De profielen (`apps/logistiek/lib/test-users.ts`) dekken elk toegangsniveau:
  `logistiek` (post Logistiek, `logistiek.manage` -> beheer), `it` (superadmin),
  `post` (gewoon praesidiumlid), `mechanix` (werkgrooplid), `student` (extern).
- **Nooit aanzetten in productie:** de profielen geven echte permissies (incl.
  superadmin) zonder wachtwoord. Staat de toggle uit, dan geeft `/test-login`
  404 en wordt de cookie volledig genegeerd; enkel de gewone website-login werkt.
- Bekabeling: `LOGISTIEK_TEST_LOGIN` in `.env` -> de logistiek-service in
  `infra/docker-compose.yml` geeft ze door aan de container.

## Gebruikersbeheer (`src/server/users.ts`)

Admin-CRUD op accounts, allemaal achter de `users.edit`-permissie
(`assertCan`). Loopt **buiten** better-auth om, rechtstreeks op Prisma:

- `createUser`: maakt een `User` + een `credential`-`Account` met argon2-hash, in
  één transactie. Zo omzeilt admin-aanmaak de `disableSignUp`-blokkade.
- `updateUser`: e-mail (genormaliseerd), naam, locale, `active`, `isSuperAdmin`, ...
- `setUserPassword`: upsert de `credential`-account met een nieuwe hash.
- `deleteUser`: verwijdert accounts + sessies + de user in één transactie.

## Onboarding & studiebevestiging

Een nieuw (SSO-)lid landt met `onboardedAt = null` en moet eerst zijn profiel
invullen; daarna moet het elk werkingsjaar zijn studie herbevestigen. Beide zijn
blokkerende gates op de **netwerkgrens** (`apps/web/proxy.ts`), niet in een
layout. Het r-nummer-veld wordt voorgevuld uit de KU Leuven-claim (zie boven).
Volledige uitleg: `docs/onboarding-study-gate.md` en de sectie
"Ledenregistratie & onboarding (KUL SSO)" in `docs/design-decisions.md`.

## Environment-variabelen

Alle waarden staan in `.env.example`. De auth-relevante:

| Variabele | Betekenis |
| --- | --- |
| `BETTER_AUTH_URL` | Basis-URL van de app (bv. `https://dev.vtk.be`). Bepaalt de OIDC-callback en de `/sso-metadata`-waarden; moet exact matchen met de ICTS-registratie. |
| `BETTER_AUTH_SECRET` | Signing-secret voor cookies/tokens. `openssl rand -base64 32`. |
| `BETTER_AUTH_TRUSTED_ORIGINS` | Toegelaten origins (in prod `https://*.vtk.be`). |
| `BETTER_AUTH_COOKIE_DOMAIN` | Cookie-domein voor cross-subdomain (`.vtk.be`). |
| `VTK_MAIN_URL` | Waar remote apps de sessie valideren (hoofdsite). |
| `KUL_OIDC_DISCOVERY_URL` | `https://idp.kuleuven.be/.well-known/openid-configuration`. Leeg = SSO uit. |
| `KUL_OIDC_CLIENT_ID` | De Entity ID / `client_id` die ICTS registreerde (bv. `dev.vtk.be`). |
| `KUL_OIDC_CLIENT_SECRET` | Client secret uit de aparte ICTS-mail. **Backend-only.** |
| `KUL_OIDC_REDIRECT_URI` | Optioneel; overschrijft de afgeleide callback. Normaal leeg. |

Zijn de drie `KUL_OIDC_*` leeg, dan is de KU Leuven-knop verborgen en draait de
site met enkel wachtwoord-login.

### Server-setup

De web-container leest de root-`.env` (`env_file: ../.env` in
`infra/docker-compose.yml`). Die `.env` is gitignored en blijft staan over
deploys heen, dus de secrets horen daar en komen nooit in de repo. Na een
wijziging: `docker compose -f infra/docker-compose.yml up -d --force-recreate web`
(een kale `restart` herleest env-file-wijzigingen niet). Controleer met
`docker compose ... exec web env | grep KUL`.

## Niet-verwarren: KU Leuven-kaartverificatie

Er is een **tweede, losstaande** KU Leuven-integratie die niets met inloggen te
maken heeft: `apps/web/lib/kul-card.ts` verifieert een gescande studentenkaart
(Theokot-afhaalbalie, deurscanner) via de KU Leuven idverification-API
(`account.kuleuven.be`). Die gebruikt **aparte client-credentials**
(`KUL_CARD_CLIENT_ID`/`KUL_CARD_CLIENT_SECRET`), niet de OIDC-login-credentials
hierboven. Verwar de twee env-blokken niet.
