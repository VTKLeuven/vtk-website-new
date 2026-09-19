# Dependencies bijhouden

Renovate houdt de dependencies van deze repo bij: de npm-workspaces
(`apps/*`, `packages/*` en de wortel), de mobiele app in `mobile/`, de images in
`infra/compose.dev.yml` en `infra/docker-compose.yml`, de basisimages in
`infra/docker/*.Dockerfile` en de actions in `.github/workflows`. De configuratie
staat in `renovate.json` in de wortel; dezelfde opzet als in burgieclan, met de
pins en de valkuilen van deze repo erbij.

Naast Renovate staan er drie workflows:

| Workflow | Wanneer | Wat |
| --- | --- | --- |
| `security-audit.yml` | wekelijks, en op een PR die aan een manifest of lockfile raakt | `npm audit` voor de site en voor de app; faalt op een critical, rapporteert alles vanaf high |
| `audit-fix.yml` | wekelijks | herresolvet de lockfile bij openstaande kwetsbaarheden, en opent enkel een PR wanneer er daardoor echt minder advisories overblijven |
| `renovate-lockfile.yml` | op elke Renovate-PR | herstelt de lockfile wanneer de platform-binaries eruit gevallen zijn |

## Opzetten

1. **Installeer de Renovate-app** op `VTKLeuven/vtk-website-new`
   (https://github.com/apps/renovate). Renovate opent dan eerst een onboarding-PR
   met een voorbeeld van wat ze zal doen; daarna houdt ze een
   "Dependency Dashboard"-issue bij.
2. **Zet Dependabot alerts aan** (Settings → Code security). `vulnerabilityAlerts`
   in `renovate.json` hangt daarvan af: zonder die alerts weet Renovate niet welke
   updates een security fix zijn en vervalt de uitzondering op de wachttijd.
3. **Zet auto-merge aan** voor de repo (Settings → General → "Allow auto-merge")
   en maak de checks van `Deploy to Dev (elise)` verplicht op `main`. Automerge
   zonder verplichte checks is niet "CI is groen", maar "er is niets gevraagd".
4. **Optioneel: een secret `DEPS_BOT_TOKEN`** (een fine-grained PAT of een
   GitHub App-token met *contents: write* en *pull requests: write*). Dat is nodig
   voor twee dingen die met de standaard `GITHUB_TOKEN` niet lukken:
   - een PR die door `audit-fix.yml` wordt aangemaakt, start dan ook de CI;
     zonder het secret blijven de checks leeg en komt auto-merge nooit aan de beurt;
   - `renovate-lockfile.yml` kan dan de herstelde lockfile naar de PR-branch
     duwen én de checks daarop opnieuw laten draaien.

   Zonder het secret doen beide workflows niets stil: ze zetten een waarschuwing
   in de run met het commando dat je zelf moet uitvoeren.

## Wat automatisch samengevoegd wordt

Patch, minor, digest-pins en de wekelijkse lockfile-maintenance mergen zichzelf
zodra de CI groen staat. Majors niet: die blijven op het dashboard staan tot
iemand ze leest. Nieuwe versies wachten drie dagen (`minimumReleaseAge`), zodat
een pakket dat binnen een dag wordt teruggetrokken ons niet bereikt. Een security
fix wacht niet en telt niet mee in de limiet van vier gelijktijdige PR's.

Verder groepeert Renovate wat samen moet bewegen: `prisma` met `@prisma/*`,
`next` met React en de types, `tailwindcss` met `lightningcss`, `better-auth` met
zijn plugins, de Expo-SDK als één set, en de action-digests in één PR per week.

## Wat bewust vastgepind staat

- **Node 20.** Engines, de CI-runners en de drie Dockerfiles staan erop. Een
  major sprong raakt ook `setup-node` in de workflows en `ARG NODE_VERSION` in
  `infra/docker/*.Dockerfile`, dus dat is een eigen oefening. Renovate mag niet
  verder dan `^20`.
- **Postgres 16.** Dezelfde image staat in de CI-services, in
  `infra/compose.dev.yml` en in de deploy-stack. Een major bump laat de bestaande
  datadirectory onleesbaar achter (`pg_upgrade`), en dat merk je pas op de server.
- **Immich** (`immich-server` + `immich-machine-learning`) mergt nooit
  automatisch: een upgrade raakt het fotoarchief. Lees de release notes en
  `docs/immich-disaster-recovery.md`. De database- en cache-image van Immich
  (`ghcr.io/immich-app/postgres`, `valkey`) staan helemaal uit: die volgen de
  compose van Immich zelf, niet Renovate.
- **MinIO** heeft tags als `RELEASE.2025-09-07T16-13-09Z`. Die krijgen een eigen
  `versioning`-regex, anders ziet Renovate ze niet als versies.

## De mobiele app

`mobile/` heeft zijn eigen lockfile en staat buiten de workspaces. Renovate
behandelt hem dus als een apart project, met twee verschillen: zijn PR's krijgen
het label `mobile` en ze mergen nooit automatisch. Dat laatste is geen
voorzichtigheid maar de regel uit `AGENTS.md`: na elke wijziging aan de app hoort
er een EAS Update te vertrekken, anders zien de testtoestellen en Expo Go de
nieuwe dependencies niet.

```bash
cd mobile && npx eas update --branch preview --environment preview --message "dependency bump"
```

Expo, de `expo-*` modules, React, React Native en de presets komen in één PR
("expo sdk"): die versies horen bij elkaar en los bumpen levert een app op die
niet meer start.

## De lockfile-val

`npm` laat bij een incrementele install de native binaries van andere platforms
uit `package-lock.json` vallen (npm/cli#4828). Renovate werkt de lockfile
incrementeel bij, dus haar PR's kunnen dat ook doen. Drie dingen vangen dat op:

1. `npm run verify:lockfile` draait in de CI vóór `npm ci`, dus een gehavende
   lockfile laat de PR falen in plaats van de deploy.
2. `renovate-lockfile.yml` herresolvet de lockfile op de PR-branch zodra die
   check faalt, en pusht de fix (met `DEPS_BOT_TOKEN`).
3. `audit-fix.yml` gebruikt geen `npm audit fix`, want dat is precies zo'n
   incrementele install. Ze gooit de lockfile weg en laat npm vers resolven; een
   verse resolve kiest per dependency de nieuwste versie binnen haar range, dus
   minstens wat audit fix zou kiezen, en houdt alle platforms binnen. Ze telt de
   advisories van high en hoger voor en na, en opent enkel een PR wanneer dat
   aantal daalt: het gewone bijwerken van de lockfile doet Renovate al met
   `lockFileMaintenance`, en een wekelijkse PR met het label `security` die niets
   oplost, leert niemand nog iets.

Handmatig is het altijd hetzelfde commando:

```bash
rm -rf node_modules package-lock.json && npm install
```

Een verse resolve raakt meer dan de ene dependency die Renovate bumpte: alles
schuift op naar de nieuwste versie binnen zijn range. Dat is de prijs van de
regel; de PR bevat daarna dus meer lockfile-wijzigingen dan de titel belooft.

## Vallen waar we in gelopen zijn

- **Een PR die met `GITHUB_TOKEN` wordt aangemaakt of gepusht, start geen enkele
  workflow.** Dat is een bewuste beveiliging van GitHub tegen loops, maar het
  effect is dat de PR zonder checks blijft staan en auto-merge nooit afgaat. Enkel
  een PAT of App-token (`DEPS_BOT_TOKEN`) lost dat op.
- **`npm audit --audit-level high` is vandaag rood**, in de site en in de app. Het
  gaat om build- en CLI-tooling (`deepmerge-ts` via de Prisma-CLI, `chevrotain`
  via de better-auth-CLI, `joi` via `passkit-generator`, `@expo/config-plugins`
  in de app) waar de fix een major bump vraagt. Daarom faalt de audit pas op een
  critical; het volledige high-rapport staat in de samenvatting van de run.
- **Renovate stopt met rebasen zodra iemand anders op haar branch commit.** Duwt
  `renovate-lockfile.yml` een fix naar de PR-branch, dan zet Renovate er een
  waarschuwing bij dat eigen wijzigingen verloren kunnen gaan en laat ze de branch
  verder ongemoeid. Mergen kan gewoon; loopt de PR achter of geeft ze een
  conflict, sluit ze dan en laat Renovate een nieuwe maken.
- **`next` staat exact gepind** (`"next": "16.3.0"`, in drie apps). `npm audit fix`
  kan daar niets aan doen: de fix valt buiten de gedeclareerde range. Zulke
  advisories lost Renovate op, niet de audit-workflow.
- **De `overrides` in de wortel-`package.json`** (nu `joi` voor
  `passkit-generator`) blijven buiten het zicht van de audit-fix: een override is
  een keuze, geen resolutie. Controleer bij een advisory op een overriden pakket
  of de override nog de juiste versie noemt.
