# VTK als SSO-provider (OAuth2 / OpenID Connect)

Externe applicaties laten leden aanmelden met hun VTK-account. VTK is de
autorisatieserver; de applicatie krijgt een token en leest daaruit wie het lid
is en wat het in díe applicatie mag.

Dit document beschrijft wat er staat en waarom. Voor de kringkeuzes (wie mag
waar binnen, wat reset op 15 juli) zie `docs/design-decisions.md`; voor het
rollen- en permissiemodel van VTK zelf zie `docs/permissions.md`.

Gebouwd op [`@better-auth/oauth-provider`](https://www.npmjs.com/package/@better-auth/oauth-provider).
Waar dit document "de plugin" zegt, bedoelt het die.

---

## In één oogopslag

```
  extern app  ──1── /oauth2/authorize ──2──▶ /inloggen        (geen sessie)
                                        ──▶ /inloggen/geen-toegang  (geen toegang)
                                        ──▶ /inloggen/consent (nieuwe scopes)
                    ◀──3── code ──4──▶ /oauth2/token ──▶ id_token + access_token
                                          ──5──▶ /oauth2/userinfo ──▶ claims
```

1. De applicatie stuurt het lid naar `/oauth2/authorize` (PKCE verplicht).
2. VTK beslist: aanmelden, blokkeren, toestemming vragen, of meteen doorlaten.
3. Terug naar de applicatie met een autorisatiecode.
4. De applicatie wisselt die code in voor tokens.
5. Voor alles behalve naam, e-mail en foto haalt de applicatie UserInfo op.

Alles achter `BETTER_AUTH_URL` + `/api/auth/better`. Discovery:

```bash
curl -s http://localhost:3000/api/auth/better/.well-known/openid-configuration | jq
```

---

## Waar wat staat

**Regel: de GUI bevat geen regels.** Server actions in `apps/web` pakken het
formulier uit en roepen een functie in `packages/auth` aan. Alle beslissingen,
rechten en audit zitten daar.

### packages/auth

| Bestand | Inhoud |
|---|---|
| `src/auth.ts` | Plugin-config: scopes, claim-hooks, de toegangspoort, prefixes, `scopeExpirations` |
| `src/lib/scopes.ts` | De 11 scopes met consent-copy NL/EN, `sensitive`, `defaultSelected` |
| `src/lib/claims.ts` | Claim-registry: naam, scope, bron, transformer, bestemmingen |
| `src/lib/transformers.ts` | Gesloten set omzettingen, allemaal null-safe en totaal |
| `src/lib/clientPermissionCodes.ts` | Vorm van namespaces en codes, gereserveerde prefixen |
| `src/server/claims.ts` | `resolveClaims()` plus de `COMPUTED`-resolvers |
| `src/server/clientPermissions.ts` | `effectiveClientPermissions()`: de toekenningspaden |
| `src/server/clientAccess.ts` | `checkClientAccess()`: de toegangspoort |
| `src/server/clientPermissionsAdmin.ts` | Beheer van vocabulaire en toekenningen, met audit |
| `src/server/sso.ts` | Clientbeheer, audit, tokens intrekken, zelfbediening, flow-tester |
| `src/server/oauthQuery.ts` | Handtekeningcontrole op een ondertekende autorisatie-query |
| `src/server/session.ts` | `getSessionCached()`, `deriveAuthz()`, `userGrantsInclude()` |

### apps/web

| Route | Wat |
|---|---|
| `/admin/sso` | Clientlijst met "Aandacht vereist" bovenaan |
| `/admin/sso/nieuw` | Aanmaakwizard in drie stappen |
| `/admin/sso/[clientId]` | Gegevens, toegang, rechten, beheer, geschiedenis |
| `/admin/sso/test` | Flow-tester: een echte autorisatie, met opruiming achteraf |
| `/admin/roles` | Paneel "Externe apps": app-permissies aan een rol hangen |
| `/inloggen` | Login; hervat de flow wanneer er een ondertekende query staat |
| `/inloggen/consent` | Toestemmingsscherm |
| `/inloggen/geen-toegang` | Blokpagina voor een beperkte applicatie |
| `/account/verbonden-apps` | Zelfbediening: koppelingen bekijken en verbreken |

---

## Scopes en claims

Beide zijn **code-registries**, geen tabellen. Reden: het zijn er een handvol,
ze veranderen zelden, en een wijziging bepaalt welke ledengegevens naar buiten
gaan. Dat hoort door code review, net als `packages/db/src/permissions.ts`.

De 11 scopes: `openid`, `profile`, `email`, `address`, `phone`,
`offline_access`, `entitlements`, `vtk:study_programme`, `vtk:study_year`,
`vtk:student_number`, `vtk:contact`.

Vier dingen die bewust zo zijn:

- **Studie is gesplitst in drie scopes.** Een app die enkel de richting nodig
  heeft (bijvoorbeeld om een mailinglijst te filteren) hoort daarvoor niet ook
  het studentennummer te kunnen opvragen.
- **`email` is altijd het universitaire adres.** Dat is de identiteitsclaim: laat
  je die meebewegen met de voorkeur van het lid, dan matcht een applicatie het
  account niet meer na één profielwijziging. Het voorkeursadres is een aparte
  claim, `vtk:preferred_email`.
- **Gevoelige gegevens staan enkel in UserInfo**, niet in het ID token. Een ID
  token wordt één keer uitgegeven en veroudert; UserInfo wordt live opgehaald.
- **VTK's interne structuur gaat er niet uit.** Geen `vtk:roles`,
  `vtk:permissions` of `vtk:groups`. Een applicatie beslist op een permissie die
  ze zelf definieert, niet op het feit dat iemand in het praesidium zit. Anders
  staat onze postenstructuur in hun code en breekt die zodra wij hernoemen.

Een claim toevoegen voor een bestaand `User`-veld is één regel in
`lib/claims.ts`. Heeft de claim logica nodig, dan komt er een `COMPUTED`-resolver
bij in `server/claims.ts`. Transformers zijn een gesloten set: elke transformer
is null-safe en totaal, want een transformer die gooit legt het uitgeven van
tokens plat voor élke client.

---

## Toegang: wie mag binnen

Elke client staat op `OPEN` of `RESTRICTED` (`OauthClient.accessMode`).

- **Open**: elk actief lid kan aanmelden. Permissies bepalen enkel wat iemand er
  méér mag. Dit is de cudi-tool.
- **Beperkt**: enkel wie de permissie `<namespace>.access` houdt, raakt binnen.
  Iedereen anders wordt geweigerd tijdens het aanmelden en landt op
  `/inloggen/geen-toegang`. Dit is de interne wiki.

De blokkade zit in de autorisatieflow bij VTK, niet in de applicatie. Een app die
zelf moet controleren of je binnen mag, vergeet dat ooit.

Een andere permissie van dezelfde applicatie hebben (`wiki.read`) geeft **geen**
toegang. Dat onderscheid is de reden dat `.access` apart bestaat: je kan iemand
rechten alvast klaarzetten zonder hem al binnen te laten.

### De faalwijze, en de drie vangnetten

Een client beperkt zetten en vergeten de toegangspermissie toe te kennen sluit
iedereen buiten, inclusief degene die de knop omzette. Daarom:

1. `<namespace>.access` wordt **automatisch aangemaakt** bij het beperken, met
   `system: true`, en kan niet verwijderd worden zolang de client beperkt is.
2. Het scherm waarschuwt **voor het opslaan** wanneer nog niemand ze houdt.
3. Een beperkte client waaraan geen enkele **rol** toegang geeft, komt in
   "Aandacht vereist" op `/admin/sso`.

Punt 3 kijkt bewust enkel naar rollen. Een applicatie die enkel op losse
toekenningen aan personen draait, werkt vandaag en valt stil zodra die ene
persoon vertrekt; dat is precies wat de lijst moet opmerken.

---

## Per-client permissies

Elke client definieert zijn eigen vocabulaire (`wiki.read`, `cudi.admin`) onder
een namespace. Leden krijgen die codes toegekend en de applicatie leest ze uit de
`permissions`-claim op `/oauth2/userinfo`.

### Toekennen gaat via een rol of een post

Nooit rechtstreeks aan één lid: zo'n toekenning werkt vandaag en verdwijnt
geruisloos zodra die persoon vertrekt. De tabel `SsoUserClientPermission` bestaat
nog voor bestaande rijen en voor de flow-tester, maar geen beheerpad maakt er
nieuwe aan.

### Wat op 15 juli reset

- Toekenningen **via een rol of post** volgen het werkingsjaar en resetten mee.
  Dat is het punt van via een rol toekennen: wie de post verlaat, verliest de
  toegang vanzelf.
- **Directe** toekenningen (legacy) blijven tot ze ingetrokken worden of hun
  `expiresAt` bereiken.
- `LEADER`-toekenningen gelden enkel voor de verantwoordelijke van de post,
  exact zoals `GroupRole` dat voor rollen doet.

### Intrekken logt enkel de getroffen leden uit

Bij het intrekken van een rol- of post-toekenning worden de dragers van die rol
of post opgezocht en één voor één door de resolver gehaald. Wie de code ook langs
een ander pad houdt, blijft aangemeld. Iedereen uitloggen omdat één toekenning
wegviel, is een storing veroorzaken om een storing te vermijden.

Roep `revokeTokensForUsersLosing` altijd **na** het verwijderen aan; ervoor ziet
de resolver de oude toestand en trekt hij niemand in.

### De namespace wijzigen hernoemt de codes

Toekenningen wijzen naar `permissionId`, niet naar de code, dus ze overleven een
hernoeming ongeschonden: wie `wiki.read` had, houdt `kb.read`. Wat wél breekt is
de applicatie aan de andere kant, die nog de oude codes leest. Het scherm
waarschuwt daarvoor.

---

## Wie mag wat

| Actie | Recht |
|---|---|
| Clients aanmaken, bewerken, secret roteren, verwijderen | `oauth.client.edit` |
| Toegangsmodus en namespace instellen | `oauth.client.edit` |
| Permissievocabulaire definiëren | `oauth.client.edit` |
| Een app-permissie **aan een rol** hangen | `roles.manage` |
| Eigen koppelingen bekijken en verbreken | ingelogd zijn |

Dat `roles.manage` volstaat om toegang tot een externe app te regelen, is geen
verruiming: wie rollen beheert kan sowieso élk VTK-recht aan een rol hangen,
inclusief `oauth.client.edit`. Wie een post runt moet de tools van die post
kunnen regelen zonder SSO-beheerder te worden.

Eén `oauth.*`-permissie in plaats van fijnmazigere: binnen IT heeft iedereen
dezelfde rechten, en meer permissies zouden een verschil suggereren dat er niet
is. De audit-log is daardoor de enige verantwoording die er is.

---

## Een applicatie aansluiten

1. `/admin/sso/nieuw`: naam, redirect-URI's, scopes. Het secret is **eenmalig**
   zichtbaar.
2. Staat de app niet voor iedereen open: zet hem op beperkt, kies een namespace,
   en ken `<namespace>.access` toe aan een rol via `/admin/roles`.
3. Definieer de overige codes op de clientdetailpagina en ken ze toe aan rollen.
4. De applicatie doet een gewone Authorization Code flow **met PKCE** (verplicht
   voor elke client) en leest `permissions` uit `/oauth2/userinfo`.

Test het geheel op `/admin/sso/test` voor je de partner laat aansluiten.

Aandachtspunten voor de integrator:

- Match accounts op `sub`, of anders op `email` (universitair adres). Niet op
  `vtk:preferred_email`: die verandert wanneer het lid dat wil.
- Een token met `entitlements` vervalt na **tien minuten**
  (`scopeExpirations`). Dat is het antwoord op "hoe lang blijft een ingetrokken
  permissie werken".
- `permissions` staat enkel in UserInfo, niet in het access token.

---

## Vallen waar we in gelopen zijn

Elk punt hier heeft ooit tijd gekost.

1. **`auth.api.oauth2Consent` moet een `request` meekrijgen.** Bij "toestaan"
   draait de plugin de autorisatie opnieuw, en `authorizeEndpoint` begint met
   `if (!ctx.request) throw ... "request not found"`. Roep je de API aan met enkel
   `headers` (het normale patroon vanuit een server action), dan faalt **élke**
   toestemming. Weigeren werkt wél, want dat pad keert terug vóór die heraanroep.
   Precies dat verschil hield de bug maanden verborgen: het scherm leek te werken
   tot iemand voor het eerst op "Toestaan" klikte. Zie `oauthConsent` in
   `packages/auth/src/server.ts`; hetzelfde geldt voor `oauth2Continue`.

2. **De toegangspoort hangt aan `signup.shouldRedirect`, en dat is met opzet.**
   De plugin heeft geen haak die "mag deze gebruiker bij deze client" beantwoordt.
   Nodig was een punt dat op **elke** doorgang door `authorizeEndpoint` draait; er
   is er precies één. Een check op het consent-scherm valt open voor
   `skipConsent`-clients en voor wie al eerder toestemde (de plugin komt daar dan
   nooit), en een `hooks.before` op `/oauth2/authorize` mist de consent-postback,
   want die roept authorize rechtstreeks als functie aan in plaats van via de
   router. `signup.shouldRedirect` staat ongeconditioneerd vóór allebei die
   sluiproutes (`index.mjs` regel 3911; `skipConsent` op 3939).

   Lees die volgorde opnieuw na voor je dit verplaatst of de plugin opwaardeert.
   De integratietest legt de toegangsregel vast, niet de plugin-interne volgorde.

3. **Discovery hoort niet op de host-root.** De issuer draagt een pad, dus OIDC
   Discovery staat op `<basePath>/.well-known/openid-configuration` en de plugin
   serveert dat zelf. Enkel de RFC 8414-vorm valt buiten de `/api/auth`-catch-all;
   die rewrite `apps/web/proxy.ts`.

4. **`prompt=login` moet je strippen voor je authorize hervat**, anders stuurt
   authorize meteen terug naar de loginpagina en hangt het lid in een lus. Zie
   `resumeAuthorizeUrl` in `apps/web/lib/oauthFlow.ts`.

5. **De ondertekende query hoeft niet byte-voor-byte terug, wél volledig.** De
   plugin sorteert de parameters voor ze tekent én verifieert; wat telt is dat
   exact de ondertekende sleutels meegaan (`ba_param` somt ze op).

6. **Controleer de handtekening voor je iets over de client toont.**
   `signedOAuthQuery` kijkt enkel of de ondertekende sleutels aanwezig zijn.
   Zonder `verifySignedOAuthQuery` kan elk ingelogd lid een `client_id` naar keuze
   in de URL zetten en aan de pagina aflezen of die client bestaat.

7. **De plugin vervangt de scopes op een toestemmingsrij, ze vult niet aan.**
   Stuur bij gedeeltelijke toestemming dus `openid ∪ eerder gegeven ∪ nu
   aangevinkt`, anders trek je stilzwijgend eerdere toestemming in.

8. **Een JWT access token is niet in te trekken.** "Tokens intrekken" gooit de
   refresh tokens weg zodat er niets meer vernieuwd kan worden; een al uitgedeeld
   access token blijft geldig tot het vervalt. Elke UI die dit aanbiedt zegt dat
   er expliciet bij. Verzwijg het niet.

9. **Verwijderen leunt op `onDelete: Cascade`** op `oauthConsent`,
   `oauthAccessToken`, `oauthRefreshToken` en `SsoClientPermission`. De plugin
   ruimt zelf niets op. De audit-log heeft bewust **geen** foreign key en
   overleeft de verwijdering.

10. **Knoppen die van `type="button"` naar `type="submit"` wisselen op hetzelfde
    React-element versturen het formulier bij de klik die ze omwisselt.** De
    browser bepaalt de standaardactie ná de handlers. Daarom heeft de wizard geen
    `<form>` en verstuurt hij programmatisch.

11. **Roep de action van `useActionState` nooit los aan zonder
    `startTransition`.** Twee keer misgegaan (wizard en consent-scherm). Zonder
    `<form action={...}>` doet React het niet vanzelf.

12. **`prisma generate` faalt met EPERM zolang de dev-server draait** (Windows
    houdt `query_engine-windows.dll.node` vast). Stop de dev-server eerst.

13. **Genereer migratie-SQL niet met `>` naar een bestand**: Prisma plakt er een
    "update available"-kader achter en dan faalt de migratie op een syntaxfout.
    Zet `PRISMA_HIDE_UPDATE_MESSAGE=1` of schrijf het bestand met de hand.

---

## Bewust niet gebouwd

Het oorspronkelijke ontwerp beschreef een zwaardere opzet. Deze onderdelen zijn
in overleg geschrapt; bouw ze niet alsnog zonder te vragen.

| Niet gebouwd | In plaats daarvan |
|---|---|
| Trust tiers, verified badge, publisher (`SsoClientProfile`) | Afgeleid signaal: staan alle redirect-URI's op `vtk.be`? |
| `SsoScope`- en `SsoClaim`-tabellen met GUI | Code-registries met code review |
| Elf `oauth.*`-permissies | Eén: `oauth.client.edit` |
| Client met een eigenaar (`userId`) | `clientReference` vast op `'vtk'`; clients zijn van VTK |
| Audit met veld-diffs | Wie, wat, welke client, wanneer |
| `SsoConsentDetail` (IP, user-agent, policyversie) | `OauthConsent` legt al vast wie wat wanneer gaf |
| "Onthoud deze keuze" op het consent-scherm | De plugin bewaart toestemming altijd; het vinkje zou liegen |
| Apart tokens-scherm en discovery viewer | Intrekken op de clientdetail; `curl` voor discovery |
| `impliesCodes` / `replacedByCode` op permissies | Versioneringsmachinerie zonder gebruiker |
| `permissions` in het access token | Enkel UserInfo: daar is de client bekend (`jwt.azp`) en is de lijst live |

---

## Bekende gaten

1. **Voorgevinkte gevoelige scopes.** Op verzoek staan alle optionele vinkjes op
   het consent-scherm aan, inclusief `offline_access`. GDPR overweging 32 en het
   Planet49-arrest (C-673/17) zeggen dat een voorgevinkt vakje geen geldige
   toestemming is. Terugdraaien is één regel in `ConsentScreen.tsx` (`useState`
   van `accepted`).
2. **`prompt=none` krijgt de verkeerde fout.** Wordt een lid geblokkeerd tijdens
   een stille SSO-refresh, dan stuurt de plugin `interaction_required` naar de
   client. Dat betekent "vraag de gebruiker iets en probeer opnieuw", wat hier
   onwaar is; `access_denied` zou kloppen. Geen enkele huidige integratie gebruikt
   `prompt=none`. Repareren vraagt een eigen `hooks.before` die de `redirect_uri`
   zelf hervalideert, anders bouw je een open redirector.
3. **`phone`-scope levert niets op**: er is geen telefoonveld op `User`. Ofwel het
   veld toevoegen, ofwel de scope schrappen.
4. **Onboarding midden in een OAuth-flow verliest de query**: de gate in
   `proxy.ts` stuurt naar `/onboarding` zonder hem te bewaren. Randgeval.
5. **Oude clients kunnen geschrapte scopes in hun `scopes`-kolom hebben.** Toen
   `vtk:membership` uit de registry ging, haalde geen migratie ze uit bestaande
   clients. De plugin valideert tegen `client.scopes ?? opts.scopes`, dus zo'n
   client mag ze nog aanvragen: geen claims, niet in discovery, en het
   consent-scherm toont de kale code als gevoelig. Niets breekt ervan; de opkuis
   is één update over `oauthClient.scopes`.
6. **De testclient `vtk-phase1-smoketest`** staat bewust in de dev-database
   (secret `phase1-smoketest-secret`). Niet opruimen.

---

## Tests

```bash
npm test -w @vtk/web
npx dotenv -e .env -- npm run test:integration -w @vtk/web
```

| Bestand | Dekt |
|---|---|
| `test/oauthFlow.test.ts` | Ondertekende query, prompt-stripping, resume-URL |
| `test/ssoClientPolicy.test.ts` | Redirect-URI-regels, "aandacht vereist", scope-registry |
| `test/ssoClaims.test.ts` | Transformers (null-safe), claim-registry-invarianten |
| `test/clientPermissionCodes.test.ts` | Namespaces, codevorm, gereserveerde prefixen |
| `test/integration/sso-claims.integration.ts` | `resolveClaims` tegen een echte database |
| `test/integration/sso-client-permissions.integration.ts` | De toekenningspaden, de jaargrens, de LEADER-regel, de toegangspoort |

**Wat de tests niet dekken:** React-wiring. Ze draaien in een `node`-omgeving
zonder DOM, en de twee `startTransition`-bugs vielen daar precies buiten. Klik de
flow door op `/admin/sso/test`.

De flow-tester zet de testclient vooraf op de gekozen toestand (open, beperkt met
of zonder toegang voor jezelf, met of zonder `skipConsent`) en ruimt achteraf de
toestemming, de tokens en de testpermissie weer op, zodat elke run gelijk begint.
De twee combinaties die het meest waard zijn om te draaien: **open + toestaan**
(dekt val 1) en **beperkt zonder toegang + skipConsent** (dekt val 2).

---

## Handige commando's

```bash
# migratie maken en toepassen (dev-server eerst stoppen, zie val 12)
cd packages/db
PRISMA_HIDE_UPDATE_MESSAGE=1 npx dotenv -e ../../.env -- npx prisma migrate diff \
  --from-schema-datasource ./prisma/schema.prisma \
  --to-schema-datamodel ./prisma/schema.prisma --script
PRISMA_HIDE_UPDATE_MESSAGE=1 npx dotenv -e ../../.env -- npx prisma migrate deploy

# discovery bekijken
curl -s http://localhost:3000/api/auth/better/.well-known/openid-configuration | jq
```
