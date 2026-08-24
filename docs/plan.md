# De VTK-app: de site als native app voor iOS en Android

## Context

Er moet een tweede Expo-app komen naast `vtk-scanner-app`, maar dan de grote:
**de volledige site als app**, met dezelfde inhoud en hetzelfde ontwerp, alleen
met de vorm van een app (tabbalk onderaan, schermen in plaats van pagina's).
De admin blijft op het web.

Dat is een ander soort werk dan de scanner. De scanner had één taak en praatte met
vijf endpoints die al bestonden. Hier zit vrijwel alle inhoud van de site vast in
server-components en server-actions: `HomeEditorial` doet negen queries in één
React-component, `placeOrderAction` heeft de hele besteltransactie in de action
zelf staan. Een native app kan daar niets mee. **Het echte werk van dit plan zit
dus niet in de app maar in de site: de inhoud en de logica losmaken van de
HTML-rendering, in een JSON-API die de app én de bestaande pagina's bedienen.**

Dat is meteen de reden om het te doen: elke keer dat een stuk logica uit een
action naar `lib/` verhuist, wordt het testbaar en herbruikbaar. De app is de
aanleiding, niet de enige begunstigde.

Keuzes die vastliggen na overleg: **gefaseerd, maar alles uiteindelijk native**
(geen WebView-schermen als eindtoestand); **de scanner-app blijft apart**;
**push wordt nu voorbereid en later verstuurd**; en de app is **publiek bruikbaar
zonder inloggen**, met een login op het moment dat een scherm er een nodig heeft.

---

## Deel A. De architectuur

### A1. Eén versie-API: `/api/app/v1/*`

Alles wat de app nodig heeft, komt uit één nieuwe boom in `apps/web/app/api/app/v1/`.
Bewust apart van de bestaande routes:

- De bestaande routes zijn per stuk gegroeid voor één beller (`/api/shift` voor
  de urenloop-app, `/api/tickets/...` voor de scanner). Ze mogen blijven zoals ze
  zijn; de app-API is een eigen contract met een eigen versie in het pad, zodat
  een oudere geïnstalleerde app niet breekt wanneer we iets hernoemen.
- **De app krijgt nooit een rauwe Prisma-rij.** Elke route geeft een expliciete
  vorm terug, met de teksten al gekozen (`?locale=nl|en`, via `pick()` uit
  `@vtk/i18n`) en met **absolute** media-URL's (`publicUrl()` uit `lib/storage.ts`
  geeft een pad; de app kan daar niets mee, dus de API zet er de basis-URL voor).
- Sessie werkt zoals bij de scanner: het gedeelde better-auth cookie. `requireSession`
  / `getCurrentSession` uit `lib/session.ts`, fouten via `authErrorResponse`.
  Publieke routes gebruiken `getCurrentSession()` en passen hun antwoord aan
  (doelgroepfilter, POC's, "jouw bestelling").
- `withCors` / `corsPreflight` uit `lib/cors.ts` erop, zodat een toekomstige
  webversie van hetzelfde scherm ook werkt.
- `export const runtime = "nodejs"` overal, zoals de rest.

### A2. Het contract staat in één bestand, en dat bestand wordt gekopieerd

`apps/web/lib/app-api/contract.ts` — **pure types en zod-schema's, nul
server-imports**, in de lijn van `lib/theokot.ts` en `lib/shift.ts`. Elke route
importeert zijn responsetype daaruit; de app kopieert dit ene bestand naar
`src/api/contract.ts` en zet het in de "Gekopieerd uit"-tabel van zijn `AGENTS.md`,
precies zoals `src/scanner/types.ts` dat vandaag doet.

Eén bestand, één kopie. Geen gedeeld npm-pakket: de app is een eigen repo en een
workspace-afhankelijkheid over twee repo's heen is een bouwprobleem dat we hier
niet nodig hebben. **Geen Prisma-types in dit bestand** (regel uit AGENTS.md).

### A3. Logica uit de actions, naar `lib/`

Het terugkerende patroon van het hele plan, met Theokot als het scherpste geval:

```
vandaag:  placeOrderAction (app/actions/theokot.ts, 60 regels transactie inline)
straks:   lib/theokot/orders.ts  ->  placeOrder(userId, sessionId, lines)
          app/actions/theokot.ts  ->  dunne action die placeOrder roept
          app/api/app/v1/theokot/order/route.ts  ->  dunne route die placeOrder roept
```

De regel: **de action behoudt wat action-eigen is** (`requireSession`,
`revalidatePath`, `SaveState`), de rest verhuist. Zo blijft de site precies doen
wat ze deed, wordt de logica testbaar zonder Next, en is de app per definitie niet
soepeler dan de website. Dat laatste is belangrijk bij Theokot: bans, vensters en
voorraad mogen niet twee implementaties krijgen.

### A4. De app: `~/vtk-app`, een nieuwe repo

Zelfde opzet als `vtk-scanner-app` (dat is de huisstijl voor Expo hier):

| | |
|---|---|
| naam / slug | `VTK` / `vtk-app`, owner `vtk-it` |
| scheme | `vtk` |
| bundle / package | `be.vtk.app` |
| SDK | Expo 54, React Native 0.81.5, expo-router 6, TypeScript strict |
| `userInterfaceStyle` | `light` (de site is bewust light-mode; de scanner is de uitzondering) |
| `runtimeVersion` | `exposdk:54.0.0` |
| distributie | EAS internal distribution + `eas update`, drie kanalen zoals de scanner |
| taal | Nederlands in de UI, Engelse vakterminologie waar dat natuurlijker is, geen em-dashes, geen emoji, iconen uit `lucide-react-native` |

Afhankelijkheden bovenop de scanner-set: `expo-web-browser` (Mollie-checkout en
externe links), `expo-notifications` (fase 0 registreert enkel), `expo-image`
(lijsten met veel foto's), `react-native-markdown-display` (CMS-pagina's),
`@expo-google-fonts/instrument-serif` naast de Inter die er al is. Verder geldt
de scannerregel: **geen dependency die de SDK al dekt.**

### A5. Inloggen, onboarding en betalen

- **Inloggen** is de weblogin in een WebView, exact het patroon van
  `src/auth/session.ts` in de scanner: er wordt geen token bewaard, `fetch` deelt
  de cookie-opslag met de WebView, en KU Leuven-SSO werkt daardoor vanzelf.
- **De onboarding-gate is nieuw werk.** `proxy.ts` stuurt een niet-afgewerkt
  profiel naar `/onboarding` en een lid dat zijn studie nog niet bevestigde naar
  `/studie-bevestigen`, maar die gate staat op pagina's en niet op `/api`. De app
  moet dus zelf kijken naar `session.user.onboarded` en `studyConfirmedYear` en
  die twee schermen in de WebView tonen; anders zit een nieuw lid in een app die
  overal "niet toegelaten" zegt zonder te vertellen waarom.
- **Betalen** blijft Mollie en blijft de browser. `/api/tickets/checkout` geeft nu
  al een `checkoutUrl` terug: de app opent die met `expo-web-browser` en polst
  daarna `/api/tickets/orders/[orderId]/status`. Geen in-app-aankopen, want dit
  zijn fysieke goederen en evenementen; dat valt buiten de Apple-commissie.

### A6. Push voorbereiden

In fase 0, zodat er later geen nieuwe build voor iedereen nodig is:

- Nieuw model `AppPushDevice` (userId, expoPushToken uniek, platform, appVersion,
  lastSeenAt) plus migratie.
- `POST /api/app/v1/push/register` en `/push/unregister`.
- De app vraagt toestemming pas op het moment dat het ergens over gaat (na de
  eerste bestelling of het eerste ticket), niet bij de eerste start.
- Versturen komt in fase 4.

### A7. Wat de app níét doet

Expliciet, zodat het niet later alsnog binnensluipt:

- **geen admin** (dat was de opdracht), en dus ook geen `/admin`-achtige schermen
  voor wie toevallig rechten heeft;
- **geen scanner** (die app blijft apart; hoogstens een knop die `vtk-scanner://`
  opent voor wie mag scannen);
- **geen offline-wachtrij.** De scanner heeft SQLite en een flush-lus omdat een
  deur in een kelder staat. Hier volstaat een leescache op schijf: laatst
  opgehaalde inhoud tonen met een "niet vernieuwd"-melding. Iets bestellen of
  kopen vraagt netwerk.

---

## Deel B. Het ontwerp

De opdracht is "hetzelfde ontwerp als de site, maar het moet aanvoelen als een
app". Concreet:

**Wat één op één overkomt.** `src/theme/tokens.ts` is een letterlijke port van de
`:root`-tokens in `apps/web/app/design/vtk-base.css` (`--paper #EFF2F8`,
`--paper-2 #E6ECF5`, `--surface #FFFFFF`, `--ink #0A0F1F`, `--navy #0E1A36`,
`--yellow #FFD23F`, `--muted #5C667F`, `--body #34405E`, `--on-dark-muted #B7C0DC`,
`--line`). Dat bestand komt in de "Gekopieerd uit"-tabel. Verder: Inter voor alles,
Instrument Serif enkel als cursief accent in de hero, kaarten wit met een dunne
navy-getinte rand en 16-22px hoeken, geel enkel als accent, geen gradiënten en
geen decoratie.

**Wat een app-vorm krijgt.**

- **Tabbalk onderaan**, vijf tabs: **Home**, **Kalender**, **Bestellen**,
  **Info**, **Profiel**. Papieren grond, dunne `--line` bovenrand, actief item in
  navy met het gele accent. Vijf en niet vier: Theokot verdient een eigen tab
  (het is de reden dat de meeste studenten de app openen), en zonder een eigen
  Info-tab moet de hele CMS-boom ergens anders in geduwd worden.
- **De donkere paginakop wordt de schermkop.** `.vtk-page-head` uit `vtk-base.css`
  (full-bleed navy, eigen uitsnede van `technisch-pattern.svg`, gele onderlijn,
  lichte titel, `--on-dark-muted` ondertitel) wordt `<PageHead>` in de app en
  opent elk scherm buiten Home. Dat is precies de bestaande regel "er is één
  soort pagina-opener".
- **De homepage houdt haar hero**: foto onder een navy scrim, zwaarst
  linksboven, licht opschrift met het gele cursieve serif-accent. Op de site is
  de homepage de enige met een fotohero; in de app blijft dat zo.
- **De bandenritmiek wordt een verticale stapel.** De afwisseling navy /
  lichtblauw / papier van de homepage blijft, want ze is de reden dat de pagina
  ritme heeft; op een telefoonbreedte is elke band gewoon een sectie op volle
  breedte.
- **Lijsten worden lijsten, geen kaartroosters.** De categoriepagina's zijn op de
  site al brede rijen met een vierkante foto links; dat vertaalt rechtstreeks
  naar een `FlatList`.

Elk scherm wordt op smalle en op tablethoogte nagekeken, en essentiële
informatie mag wrappen maar niet achter truncatie verdwijnen (bestaande regel uit
CLAUDE.md, en de plek waar Logistiek eerder de mist inging).

---

## Deel C. De fases

Elke fase eindigt op iets dat het bestuur kan installeren en gebruiken:
`npm run verify` groen in de website-repo, `type-check` + `lint` groen in de
app-repo, en een `eas update --branch preview`.

### Fase 0 — Fundering (site + app, nog geen inhoud)

Site:
- `lib/app-api/contract.ts`, `lib/app-api/respond.ts` (json-helpers, foutcodes,
  locale- en paginatie-parsing), `lib/app-api/media.ts` (absolute media-URL).
- `GET /api/app/v1/bootstrap` — de enige route die de app bij elke start doet:
  wie ben ik (inclusief `onboarded` en `studyConfirmedYear`), de headertabs uit
  `getVisibleHeaderTabsForNav()`, de actieve aankondiging, en een
  `minimumAppVersion` zodat een te oude app zichzelf kan laten bijwerken.
- `AppPushDevice` + migratie + de twee registratieroutes.
- `docs/app-api.md`: het contract, de versieregel, en waarom de app geen
  Prisma-vormen ziet.

App:
- Nieuwe repo, `AGENTS.md` + `README.md` + `docs/architecture.md` in de stijl van
  de scanner, EAS-project onder `vtk-it`, drie kanalen.
- `src/api/client.ts` (port van de scanner, inclusief `ApiError` / `NetworkError`
  en de instelbare basis-URL voor het testen tegen een cloudflared-tunnel),
  `src/api/contract.ts` (kopie), `src/auth/session.ts` (WebView-login +
  onboarding-gate).
- `app/(tabs)/_layout.tsx` met de vijf tabs, `PageHead`, `Card`, `Button`,
  `Empty`, `ErrorState`, `Skeleton`, de leescache en `src/theme/tokens.ts`.

### Fase 1 — Home, Kalender, Bestellen

De eerste echt bruikbare release.

- `GET /api/app/v1/home` — de payload van `HomeEditorial`, opgebouwd uit de
  helpers die er al zijn: `readOpeningHoursSetting` / `entriesForService` /
  `openingHoursNote`, `getCursusdienstHours`, `readBarStatus` +
  `openingWindowPhase`, `getMediaContent` (aftermovies), `resolveFrontpage` +
  `frontpagePhoto`, de partners, en de komende events met dezelfde
  doelgroepfilter (`viewerAudiences` + `audienceFilter`) zodat de app geen
  eerstejaarsevent toont aan wie het op de site niet ziet. Jouw POC's enkel voor
  een ingelogd lid met studierichtingen.
- `GET /api/app/v1/kalender` (filters op categorie, doelgroep en periode) en
  `/kalender/[id]`, bovenop `loadCalendarCategory` / `loadCalendarEvent` uit
  `lib/pageQueries.ts`. Plus de abonneerlink uit `lib/calendar/feedToken.ts`.
- **Theokot**, het zwaarste stuk van de fase omdat hier de refactor van A3 gebeurt:
  `lib/theokot/orders.ts` met `listOrderableSessions`, `placeOrder`, `cancelOrder`
  en `myOrders`, hergebruikt door `placeOrderAction` / `cancelOrderAction` en door
  `GET/POST/DELETE /api/app/v1/theokot/...`. De regels blijven waar ze staan
  (`canOrderNow`, `canCancel`, `validateOrderLines`, `getTheokotConfig`,
  `activeBanFor`); enkel de transactie verhuist. Unit tests op de nieuwe
  `lib/theokot/orders.ts` horen bij deze fase, want dit is de eerste plek waar de
  site en de app dezelfde schrijfweg delen.

### Fase 2 — Tickets en Profiel

- `GET /api/app/v1/tickets/events`, `/tickets/events/[slug]`,
  `POST /api/app/v1/tickets/checkout` (dunne laag over `createTicketCheckout`),
  `GET /api/app/v1/tickets/mine`.
- Het ticket zelf: de QR native tonen met `react-native-qrcode-svg` (zit al in de
  scanner-set), plus de bestaande PDF- en wallet-routes achter een knop.
- Profieltab: gegevens, studie, mijn bestellingen, mijn tickets, mijn shiften,
  verbonden apps, taal wisselen, uitloggen. Wat een formulier met validatie is
  (profiel bewerken, privacy-export) mag hier naar de WebView totdat fase 4 het
  native maakt; dat wordt expliciet zo genoteerd en niet stilzwijgend gelaten.

### Fase 3 — Info: de inhoud van de site

- `GET /api/app/v1/tabs/[slug]` (categoriepagina) en `/pages/[slug]`, bovenop
  `loadHeaderTabWithPages` en `loadPageBySlug`. De pagina komt als **Markdown**
  binnen, met de kop-index uit `lib/pageOutline.ts` en de downloads erbij; de app
  rendert dat met `react-native-markdown-display` en een stylesheet die
  `prose-vtk` nadoet. Rauwe HTML blijft uit, net als op de site.
- Zoeken (`lib/search-server.ts`), praesidium, werkgroepen, POC's, bureau.
- Media: albums en foto's uit `lib/immich-gallery.ts`, de aftermovies en de
  magazines. Hier is `expo-image` met een lage-resolutie placeholder het verschil
  tussen een galerij en een wachtscherm.

### Fase 4 — De rest, en push

Shiften (`lib/shift/*`, de endpoints bestaan al grotendeels), piano
(`lib/piano-server.ts`), formulieren met uploads (`lib/forms/*`), lesbezoeken,
grocomeet, contact, de juridische pagina's. Daarna de resterende WebView-schermen
uit fase 2 native maken, en de verzendkant van push: een beheerscherm en de
automatische berichten (broodje ligt klaar, shift begint, tickets openen).

---

## Deel D. Bestanden

**Nieuw in `vtk-website-new`**

```
apps/web/lib/app-api/{contract.ts,respond.ts,media.ts}
apps/web/app/api/app/v1/**            (per fase)
apps/web/lib/theokot/orders.ts        (fase 1, uit app/actions/theokot.ts)
packages/db/prisma/schema.prisma      + model AppPushDevice
packages/db/prisma/migrations/<datum>_app_push_device/migration.sql
apps/web/test/appApi/*.test.ts        (contract + theokot/orders)
docs/app-api.md
```

**Gewijzigd**: `app/actions/theokot.ts` en later `tickets.ts` / de shift-actions
worden dunner; verder niets aan de bestaande pagina's, want die blijven dezelfde
`lib/`-functies gebruiken.

**Nieuwe repo `~/vtk-app`** met de structuur uit A4/A5, `app/(tabs)/` per tab en
`src/{api,auth,theme,components,features}/`.

---

## Deel E. Verificatie

Per fase, niet één keer op het einde:

1. `npm run verify` in `vtk-website-new` (lockfile, typegen + tsc, eslint, de
   vitest-suites van `@vtk/web` en `@vtk/logistiek`). Verandert er een
   dependency, dan de lockfile **regenereren**, niet incrementeel bijwerken.
2. `npm run type-check` en `npm run lint` in `~/vtk-app`.
3. **Een contracttest**: een vitest die `apps/web/lib/app-api/contract.ts` en de
   kopie in de app-repo byte-voor-byte vergelijkt wanneer die repo naast deze
   staat, en anders overslaat. Dat is de enige goedkope bescherming tegen de
   drift die een gekopieerd bestand nu eenmaal heeft.
4. **Met de hand op een toestel**, tegen een cloudflared-tunnel naar de lokale
   site (HTTPS is nodig voor de weblogin), met drie accounts: uitgelogd, een lid
   dat nog moet onboarden, en een gewoon lid. Per fase het bijhorende scherm:
   fase 1 een broodje bestellen en weer annuleren en controleren dat de website
   dezelfde bestelling toont; fase 2 een ticket kopen tot in Mollie's testmodus
   en het daarna in de app zien; fase 3 een CMS-pagina met koppen, een download
   en een foto.
5. `eas update --branch preview` als afsluiting van elke fase. Let op de bekende
   valstrik: een OTA-update wordt op de ene start gedownload en op de volgende
   pas toegepast, dus de app moet twee keer dicht en open voor je oordeelt.

---

## Wat ik hierbij wil zeggen

Dit is groot. Ter grootte-orde: fase 0 en 1 samen zijn ongeveer het werk dat de
volledige scanner-app gekost heeft, en fase 3 is er in aantal schermen nog eens
zoveel. Het is goed te doen, maar niet in één zitting, en de fasering hierboven
is er niet om het plan netjes te laten ogen: ze bestaat zodat er na fase 1 iets
in handen ligt dat mensen echt gebruiken, en zodat wat daarna komt gestuurd wordt
door wat zij zeggen.

Twee dingen die vooraf beslist moeten worden en die geld of een account vragen:
een **Apple Developer-account** voor de iOS-builds (de scanner heeft er vandaag
nog geen), en de keuze of deze app ooit **in de stores** komt of via interne
distributie blijft gaan. Dat tweede verandert niets aan de code, maar wel aan de
doorlooptijd: storebeoordeling, privacylabels en een privacyverklaring die naar
de app verwijst.

---

## Voortgang

Een regel per commit: wat er af is, en waar het staat. Commits die enkel
vtk-website-new raken, dragen de prefix `web:`. Dit is bewust een logboek in het
plan zelf en niet in de git-historiek: zo zie je aan één bestand hoever het staat.

### Fase 0 - Fundering

Site:

- [x] `lib/app-api/contract.ts`, `respond.ts`, `media.ts`, `version.ts`
- [x] `GET /api/app/v1/bootstrap`
- [x] `AppPushDevice` + migratie + `/push/register` en `/push/unregister`
- [x] `docs/app-api.md`
- [x] contract- en versietests (`apps/web/test/appApiContract.test.ts`)

App:

- [x] repo, `AGENTS.md`, `README.md`, `docs/architecture.md`, `docs/plan.md`
- [x] `src/api/client.ts`, `src/api/contract.ts` (kopie), `src/api/bootstrap.ts`
- [x] `src/auth/session.ts` met de twee poorten uit `proxy.ts`
- [x] `src/theme/tokens.ts`, `PageHead`, `Card`, `Button`, `Empty`, `ErrorState`,
      `Loading`, `StaleNotice`, `WebFlow`, `ComingSoon`
- [x] `src/storage.ts` (voorkeuren + leescache), `src/state/app.tsx`
- [x] de vijf tabs, `app/inloggen.tsx`, `app/poort.tsx`, `app/instellingen.tsx`
- [x] EAS-project onder `vtk-it` (`2858ac35-...`), kanaal `preview` aangemaakt
- [x] eerste Android-build (APK) klaar
- [x] eerste `eas update` op kanaal `preview`
- [ ] met de hand getest op een toestel tegen een cloudflared-tunnel
- [ ] pushroutes end-to-end nagekeken (zie noot hieronder)

| Datum | Commit | Wat |
|---|---|---|
| 2026-08-23 | `web: App-API v1: contract, bootstrap en pushregistratie` | De serverkant van fase 0: het contract, de bootstrap-route, `AppPushDevice` met migratie, de twee pushroutes en `docs/app-api.md`. `npm run verify` groen (936 tests). |
| 2026-08-23 | `De schil: tabs, contract, weblogin en de twee poorten` | De app-repo staat er: Expo SDK 54, vijf tabs, de tokens van de site, de HTTP-laag met de gedeelde cookie, de weblogin en de onboarding-poorten, en de leescache. Info en Profiel tonen echte gegevens uit `bootstrap`; Kalender en Bestellen zijn nog `ComingSoon`. |
| 2026-08-24 | `web: Zod uit het gekopieerde contract, naar schemas.ts ernaast` | Het contract dat naar deze repo gekopieerd wordt, heeft geen dependencies meer. |
| 2026-08-24 | `EAS-project en de eerste Android-build` | Project `@vtk-it/vtk-app` aangemaakt, kanaal `preview`, keystore door Expo beheerd, eerste preview-build gestart. |
| 2026-08-24 | (geen commit) | Build klaar als APK, en `eas update --branch preview` gepubliceerd. Fase 0 staat op een toestel te wachten. |

**Nog open uit fase 0.** De twee pushroutes zijn niet end-to-end nagekeken tegen
een draaiende server: de dev-server die hier stond, was gestart voordat de
Prisma-client met `AppPushDevice` erin gegenereerd was, en gaf daarom 500. Het
model, de migratie en dezelfde upsert zijn wel rechtstreeks tegen de database
uitgevoerd en werkten. Na een herstart van de dev-server hoort dit gewoon te
lukken; kijk het na voor je erop bouwt.

### Fase 1 - Home, Kalender, Bestellen

- [x] `GET /api/app/v1/home`
- [x] `GET /api/app/v1/kalender` en `/kalender/[id]`
- [x] `lib/theokot-orders.ts` uit `app/actions/theokot.ts`, met unit tests
- [x] `POST/DELETE /api/app/v1/theokot/order` en `GET /api/app/v1/theokot`
- [x] de drie schermen native, `ComingSoon` verwijderd
- [ ] met de hand getest op een toestel

| Datum | Commit | Wat |
|---|---|---|
| 2026-08-24 | `web: App-API: home, kalender en Theokot` | Bestellen en annuleren verhuisd naar `lib/theokot-orders.ts`; de Theokot-pagina op de site leest via dezelfde functie. Drie endpoints erbij, 20 nieuwe tests (956 in totaal). |
| 2026-08-24 | `Home, Kalender en Bestellen` | De drie schermen native, met `useResource` (cache + "niet vernieuwd"), `EventRow`, `Stepper` en de datum- en geldformattering in `Europe/Brussels`. |

### Fase 2 - Tickets en Profiel

- [ ] tickets: lijst, detail, checkout via Mollie, mijn tickets met QR
- [ ] profiel: gegevens, bestellingen, tickets, shiften

### Fase 3 - Info: de inhoud van de site

- [ ] `GET /api/app/v1/tabs/[slug]` en `/pages/[slug]` met Markdown en de kop-index
- [ ] zoeken, praesidium, werkgroepen, POC's, bureau
- [ ] media: albums, foto's, aftermovies, magazines

### Fase 4 - De rest, en push

- [ ] shiften, piano, formulieren, lesbezoeken, grocomeet, contact, juridisch
- [ ] de resterende WebView-schermen native maken
- [ ] pushberichten versturen: beheerscherm en de automatische berichten
