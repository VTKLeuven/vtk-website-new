# SSO / OAuth2 provider: waar we staan

**Laatst bijgewerkt:** 2026-07-21 · branch `sso-provider`

Dit document is de overdracht voor wie hier verder aan werkt (mens of Claude Code
sessie). `docs/oauth2-oidc-design.md` blijft het ontwerp; **dit document zegt wat
er van dat ontwerp bewust anders is en wat er echt gebouwd is.**

> Lees eerst de sectie "Afwijkingen van het ontwerpdocument". Het ontwerp beschrijft
> een zwaardere opzet dan wat VTK wil; verschillende hoofdstukken zijn expliciet
> geschrapt of vereenvoudigd in overleg. Bouw ze niet alsnog omdat het document
> ze noemt.

---

## Status per fase

| Fase | Onderwerp | Status |
|---|---|---|
| 1 | Fundament corrigeren (discovery, login/consent-routes, prefixes, indexen) | **klaar** |
| 2 | Clientbeheer-GUI + audit | **klaar** |
| 3 | Toestemmingsscherm | **klaar** |
| 4 | Claims | **klaar** (niet klikbaar getest) |
| 5 | Per-client permissies + toegangscontrole | **klaar** (niet klikbaar getest) |
| 6 | Operations (tokens-scherm, discovery viewer, opkuisjob) | grotendeels bewust geschrapt |
| 7 | Optioneel (introspectie, webhooks, pairwise, logistiek-migratie) | niet begonnen |

---

## Afwijkingen van het ontwerpdocument

Allemaal in overleg met Witse beslist. Draai ze niet terug zonder te vragen.

| Ontwerp zegt | Wij doen | Waarom |
|---|---|---|
| Elf `oauth.*`-permissies | Eén: `oauth.client.edit` | Binnen IT heeft iedereen dezelfde rechten; fijnmaziger zou een verschil suggereren dat niet bestaat |
| `SsoScope`-tabel + `/admin/sso/scopes` | Code-registry `packages/auth/src/lib/scopes.ts` | Zelfde patroon als `packages/db/src/permissions.ts`; wijzigingen gaan door code review |
| `SsoClaim`-tabel + claims-GUI | Code-registry `packages/auth/src/lib/claims.ts` | Idem |
| `SsoClientProfile` (tier, verified badge, publisher) | Niet gebouwd | Vervangen door een afgeleid signaal: staan alle redirect-URI's op `vtk.be`? |
| Dashboard op `/admin/sso` | Clientlijst met "Aandacht vereist" bovenaan | Geen apart dashboard nodig |
| Client heeft een eigenaar (`userId`) | `clientReference` staat vast op `'vtk'` | Clients zijn van VTK, niet van wie ze aanmaakte |
| Audit met veld-diffs | Alleen wie/wat/welke client/wanneer | Klein team |
| `SsoConsentDetail` (IP, user-agent, policyVersion) | Niet gebouwd | `OauthConsent` legt al vast wie wat wanneer gaf |
| "Onthoud deze keuze" op het consent-scherm | Niet gebouwd | De plugin bewaart toestemming altijd; het vinkje zou liegen |
| Tokens-scherm `/admin/sso/tokens` | Intrekken zit op de clientdetail + zelfbediening | Zeldzame actie, geen apart scherm nodig |
| Discovery viewer | Geschrapt | `curl` volstaat |
| Gevoelige scopes niet voorgevinkt | **Wel** voorgevinkt | Op verzoek van Witse; zie waarschuwing onderaan |
| `entitlements` levert `vtk:roles` + `vtk:permissions` (internal tier) | Levert **niets** tot fase 5 | Een client beslist op permissies die hij zelf definieert, niet op VTK's rollen. Het ontwerp regelde dit met tiers (9.9); die zijn geschrapt, dus is de claim geschrapt in plaats van ongecontroleerd uit te gaan |
| `vtk:membership`-scope met `vtk:groups`, `vtk:is_praesidium` | Scope volledig verwijderd | Van welke posten iemand lid is, is interne structuur. Alles wat een client beslist, hoort permissie-afhankelijk te zijn, niet rol- of postafhankelijk |
| `email` = universitair adres, `vtk:preferred_email` apart (11.6) | Nu gevolgd | Was fout gebouwd: `email` gaf het voorkeursadres terug en verschoof dus zodra een lid zijn voorkeur omzette, waardoor een client het account niet meer matcht |
| Geen toegangscontrole per client (het ontwerp regelt dit met trust tiers) | `accessMode` OPEN/RESTRICTED op de client, met een `<ns>.access`-permissie | Nieuwe eis: sommige apps zijn er voor iedereen (cudi), andere enkel voor wie toegang kreeg (wiki). Tiers waren al geschrapt, dus dit is een eigen mechanisme |
| `permissions` in access token én UserInfo | Enkel UserInfo | De token-hooks van de plugin krijgen de client niet mee; UserInfo wel (`jwt.azp`). Bovendien live opgehaald, dus intrekken werkt meteen |
| `SsoClientPermission.impliesCodes` / `replacedByCode` (9.8) | Niet gebouwd | Versioneringsmachinerie zonder huidige gebruiker; achteraf toe te voegen zonder de rest te raken |
| Toekennen enkel voor de OAuth-beheerder | Aan een **rol** toekennen mag met `roles.manage` | Wie een post runt, moet toegang tot de tools van die post kunnen regelen. Geen verruiming: `roles.manage` kan sowieso elk VTK-recht aan een rol hangen. Het vocabulaire definiëren blijft bij `oauth.client.edit` |

---

## Wat er gebouwd is

### packages/auth (alle logica hoort hier)

**Regel: de GUI bevat geen regels.** Server actions in `apps/web` pakken alleen
het formulier uit en roepen een functie in `packages/auth` aan.

| Bestand | Inhoud |
|---|---|
| `src/lib/scopes.ts` | De 11 scopes, consent-copy NL/EN, `sensitive`, `defaultSelected` |
| `src/lib/claims.ts` | Claim-registry: naam, scope, bron, transformer, bestemmingen |
| `src/lib/clientPermissionCodes.ts` | Vorm van namespaces en codes; gereserveerde prefixen |
| `src/server/clientPermissions.ts` | `effectiveClientPermissions()`: de drie toekenningspaden |
| `src/server/clientAccess.ts` | `checkClientAccess()`: de toegangspoort |
| `src/server/clientPermissionsAdmin.ts` | Beheer van vocabulaire en toekenningen + audit |
| `src/lib/transformers.ts` | Gesloten set omzettingen, allemaal null-safe en totaal |
| `src/server/claims.ts` | `resolveClaims()` + de `COMPUTED`-resolvers |
| `src/server/sso.ts` | Clientbeheer, audit, tokens intrekken, zelfbediening, flow-tester |
| `src/server/session.ts` | `getSessionCached()`, `deriveAuthz()` (gedeeld met de claim-resolver) |
| `src/auth.ts` | Plugin-config: scopes, drie claim-hooks, prefixes, `clientReference` |

### apps/web

| Route | Wat |
|---|---|
| `/admin/sso` | Clientlijst + "Aandacht vereist" |
| `/admin/sso/nieuw` | Aanmaakwizard in 3 stappen |
| `/admin/sso/[clientId]` | Detail: gegevens, scopes, beheer, geschiedenis |
| `/admin/sso/test` | Flow-tester: echte autorisatieflow, met keuze open / beperkt (met of zonder toegang voor jezelf) en `skipConsent`. Ruimt na afloop toestemming, tokens en de testpermissie op |
| `/admin/roles` | Paneel "Externe apps": app-permissies aan een rol hangen (`roles.manage`, géén `oauth.client.edit`) |
| `/inloggen` | Login; hervat een OAuth-flow wanneer er een ondertekende query staat |
| `/inloggen/consent` | Toestemmingsscherm |
| `/inloggen/geen-toegang` | Blokpagina voor een beperkte applicatie |
| `/account/verbonden-apps` | Zelfbediening voor leden |

---

## Dingen die je moet weten voor je iets aanraakt

Dit zijn allemaal zaken die tijdens het bouwen fout gingen of bijna fout gingen.

1. **Discovery hoort NIET op de host-root.** De issuer draagt een pad
   (`BETTER_AUTH_URL` + `/api/auth/better`), dus OIDC Discovery zet het document
   op `<basePath>/.well-known/openid-configuration`, en de plugin serveert dat
   al via een `onRequest`-hook. Alleen de RFC 8414-vorm valt buiten de
   `/api/auth`-catch-all; die rewrite `apps/web/proxy.ts`. Het ontwerpdocument
   zei hier eerst iets anders; sectie 16.3 is gecorrigeerd.

2. **`prompt=login` moet je strippen voor je authorize hervat**, anders stuurt
   authorize meteen terug naar de loginpagina en hangt de gebruiker in een lus.
   Zie `resumeAuthorizeUrl` in `apps/web/lib/oauthFlow.ts`.

3. **De ondertekende query hoeft niet byte-voor-byte terug**, wél volledig: de
   plugin sorteert de parameters voor ze tekent én verifieert. Wat telt is dat
   exact de ondertekende sleutels meegaan (`ba_param` somt ze op). Zie
   `signedOAuthQuery`.

4. **De plugin VERVANGT de scopes op een toestemmingsrij, ze vult niet aan.**
   Stuur bij gedeeltelijke toestemming dus `openid ∪ eerder gegeven ∪ nu
   aangevinkt`, anders trek je stilzwijgend eerdere toestemming in.

5. **Knoppen die van `type="button"` naar `type="submit"` wisselen op hetzelfde
   React-element versturen het formulier bij de klik die ze omwisselt.** De
   browser bepaalt de standaardactie ná de handlers. Daarom heeft de wizard geen
   `<form>` en verstuurt hij programmatisch.

6. **Roep de action van `useActionState` nooit los aan zonder
   `startTransition`.** Dit is twee keer misgegaan (wizard en consent-scherm).
   Zonder `<form action={...}>` doet React het niet vanzelf.

7. **`skipConsent` en verwijderen**: een client verwijderen werkt alleen dankzij
   `onDelete: Cascade` op `oauthConsent`, `oauthAccessToken` en
   `oauthRefreshToken`. De plugin ruimt zelf niets op. De audit-log heeft bewust
   **geen** foreign key en overleeft de verwijdering.

8. **Een JWT access token is niet in te trekken.** "Tokens intrekken" gooit de
   refresh tokens weg zodat er niets meer vernieuwd kan worden; een al
   uitgedeeld access token blijft geldig tot het vervalt. Elke UI die dit
   aanbiedt zegt dat er expliciet bij. Verzwijg het niet.

9. **`prisma generate` faalt met EPERM zolang de dev-server draait** (Windows
   houdt `query_engine-windows.dll.node` vast). Stop de dev-server eerst.

10. **Genereer migratie-SQL niet met `>` naar een bestand**: Prisma plakt er een
    "update available"-kader achter en dan faalt de migratie op een syntaxfout.
    Zet `PRISMA_HIDE_UPDATE_MESSAGE=1` of schrijf het bestand met de hand.

11. **`auth.api.oauth2Consent` moet een `request` meekrijgen.** Bij "toestaan"
    draait de plugin de autorisatie opnieuw, en `authorizeEndpoint` begint met
    `if (!ctx.request) throw ... "request not found"`. Roep je de API aan met
    enkel `headers` (het normale patroon vanuit een server action), dan is er
    geen Request en faalt **élke** toestemming met
    `invalid_request: request not found`.

    Weigeren werkte wél, want dat pad keert terug vóór die heraanroep. Precies
    dat verschil hield de bug verborgen: het scherm leek te werken, tot iemand
    voor het eerst op "Toestaan" klikte. Zie `oauthConsent` in
    `packages/auth/src/server.ts`. Hetzelfde geldt voor `oauth2Continue`, mocht
    die ooit gebruikt worden.

12. **De toegangspoort hangt aan `signup.shouldRedirect`, en dat is met opzet.**
    De plugin heeft geen haak die "mag deze gebruiker bij deze client"
    beantwoordt. Wat nodig was, is een punt dat op **elke** doorgang door
    `authorizeEndpoint` draait; er is er precies één. Een check op het
    consent-scherm valt open voor `skipConsent`-clients en voor wie al eerder
    toestemde (de plugin komt daar dan nooit), en een `hooks.before` op
    `/oauth2/authorize` mist de consent-postback, want die roept authorize
    rechtstreeks als functie aan in plaats van via de router.
    `signup.shouldRedirect` staat ongeconditioneerd vóór allebei die
    sluiproutes (index.mjs regel 3911; `skipConsent` op 3939).

    Lees die volgorde opnieuw na voor je dit verplaatst of voor je de plugin
    opwaardeert. `apps/web/test/integration/sso-client-permissions.integration.ts`
    legt de toegangsregel vast, maar niet de plugin-interne volgorde: die moet je
    zelf controleren.

---

## Tests

```bash
npm test -w @vtk/web                     # 120 tests, waarvan 56 SSO
npx dotenv -e .env -- npm run test:integration -w @vtk/web
```

| Bestand | Dekt |
|---|---|
| `test/oauthFlow.test.ts` | Ondertekende query, prompt-stripping, resume-URL |
| `test/ssoClientPolicy.test.ts` | Redirect-URI-regels, "aandacht vereist", scope-registry |
| `test/ssoClaims.test.ts` | Transformers (null-safe), claim-registry-invarianten |
| `test/integration/sso-claims.integration.ts` | `resolveClaims` tegen een echte database |
| `test/clientPermissionCodes.test.ts` | Namespaces, codevorm, gereserveerde prefixen |
| `test/integration/sso-client-permissions.integration.ts` | De drie toekenningspaden, de jaargrens, de LEADER-regel, en de toegangspoort |

**Bekend probleem, niet van ons:** `test/integration/ticketing-db.integration.ts`
faalt op `Unique constraint failed on the fields: (code)`. Er staat een restant
in de dev-database van een eerder afgebroken run (`Group` met `code: "ALGEMEEN"`,
`nameNl: "Integratie"`). De test maakt telkens een nieuw id maar een **vaste**
code, dus botst hij met zijn eigen restant. Oplossing: die rij verwijderen, en de
test een unieke code laten genereren.

---

## Wat er NIET getest is

Belangrijk om te weten voor je iets als "af" beschouwt.

- **Alles achter de login is nooit aangeklikt door de assistent.** Elke
  admin-route en het consent-scherm zijn geverifieerd tot aan de auth-gate
  (compileert, 307 naar login) en met unit/integratietests op de logica. De
  echte doorklik is niet gebeurd.
- **De volledige flow client → consent → token → UserInfo** is niet end-to-end
  gedraaid. `/admin/sso/test` bestaat precies daarvoor: kies scopes, zet
  `prompt=consent`, en kijk wat er terugkomt.
- **Component-gedrag** (React-wiring) valt buiten de tests: die draaien in een
  `node`-omgeving zonder DOM. De twee `startTransition`-bugs waren hierdoor niet
  gedekt.

**Eerste actie voor morgen:** log in als beheerder, ga naar `/admin/sso/test`,
vink `vtk:student_number` aan, zet `prompt=consent`, en controleer of het
toestemmingsscherm klopt en of het nummer in UserInfo verschijnt. Vink hem
daarna op het consent-scherm af en controleer dat hij verdwijnt.

---

## Openstaande punten

1. **Voorgevinkte gevoelige scopes.** Op verzoek staan alle optionele vinkjes op
   het consent-scherm aan, inclusief `offline_access`. Let op: GDPR overweging
   32 en het Planet49-arrest (C-673/17) zeggen dat een voorgevinkt vakje geen
   geldige toestemming is. Witse is hiervan op de hoogte; het is één regel in
   `ConsentScreen.tsx` (`useState` van `accepted`) om terug te draaien of om
   alleen `offline_access` uit te zetten.
2. **`phone`-scope levert niets op**: er is geen telefoonveld op `User`. De scope
   bestaat, claims niet. Ofwel het veld toevoegen, ofwel de scope schrappen.
3. **De testclient `vtk-phase1-smoketest`** staat bewust in de dev-database
   (secret `phase1-smoketest-secret`). Niet opruimen.
4. **`docs/oauth2-oidc-design.html`** loopt achter op de `.md`: er zijn correcties
   in de `.md` aangebracht (o.a. 16.3) die niet in de HTML staan.
5. **Onboarding midden in een OAuth-flow** verliest de query: de gate in
   `proxy.ts` stuurt naar `/onboarding` zonder hem te bewaren. Randgeval, niet
   opgelost.
6. **De toegangsflow is nog niet doorgeklikt.** De regel zelf ligt vast in
   integratietests, maar dat een geweigerd lid ook effectief op
   `/inloggen/geen-toegang` landt, is enkel beredeneerd uit de plugin-broncode.
   `/admin/sso/test` heeft daar nu keuzes voor (open / beperkt met of zonder
   toegang, plus `skipConsent`); doorloop ze alle drie.

   Dat dit lang bleef liggen, kostte al één bug: toestemming geven werkte nooit
   (punt 11 hierboven), en dat viel niet op omdat weigeren wél werkt.
7. **"Aandacht vereist" kijkt enkel naar rollen.** Een beperkte client zonder
   enkele rol-toekenning komt in de lijst, ook wanneer er losse toekenningen aan
   personen bestaan. Dat is bewust: die app werkt vandaag maar valt stil zodra
   die persoon vertrekt. De waarschuwing op het clientscherm zelf telt wél elk
   pad, want die beantwoordt de andere vraag ("raakt er überhaupt iemand
   binnen").
8. **Oude clients kunnen nog geschrapte scopes in hun `scopes`-kolom hebben.**
   Fase 4 haalde `vtk:membership` uit de registry, maar geen migratie haalde ze
   uit de `scopes`-array van bestaande clients. De plugin valideert een
   aangevraagde scope tegen `client.scopes ?? opts.scopes`, dus zo'n client mag
   ze nog aanvragen: ze levert dan geen claims op, staat niet meer in discovery,
   en het toestemmingsscherm toont de kale code als een gevoelige scope
   (`describeScope` valt terug op de code zelf).

   Geen probleem vandaag; niets breekt ervan. Maar als iemand zich ooit afvraagt
   waarom een client een scope aanvraagt die nergens meer bestaat, dan komt het
   hiervandaan. De opkuis is één update over `oauthClient.scopes`.

9. **Rol- of postgrant intrekken trekt enkel de tokens in van wie het recht
   effectief kwijtraakt.** De betrokken leden worden opgezocht (dragers van die
   rol of post in dit werkingsjaar) en daarna één voor één door de resolver
   gehaald: wie de code ook langs een ander pad houdt, blijft aangemeld. Die lus
   is bewust serieel, want dit is een beheeractie op een handvol leden en geen
   heet pad. Roep `revokeTokensForUsersLosing` altijd **na** het verwijderen aan;
   ervoor ziet de resolver de oude toestand en trekt hij niemand in.

---

## Handige commando's

```bash
# migratie maken en toepassen (dev-server eerst stoppen)
cd packages/db
PRISMA_HIDE_UPDATE_MESSAGE=1 npx dotenv -e ../../.env -- npx prisma migrate diff \
  --from-schema-datasource ./prisma/schema.prisma \
  --to-schema-datamodel ./prisma/schema.prisma --script
PRISMA_HIDE_UPDATE_MESSAGE=1 npx dotenv -e ../../.env -- npx prisma migrate deploy

# discovery bekijken
curl -s http://localhost:3000/api/auth/better/.well-known/openid-configuration | jq

# een autorisatie starten (PKCE is verplicht voor elke client)
# zie /admin/sso/test voor de makkelijke weg
```
