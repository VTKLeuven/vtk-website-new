# Wat de VTK-app aan deze site toevoegt

Deze branch (`possible-app`) bevat alles wat er aan **vtk-website-new** bijgekomen
is om de VTK-app te laten werken. De app zelf staat in `mobile/`; haar plan en voortgang staan in `mobile/docs/plan.md`.

Dit document is de **inventaris**: wat er bijkwam, wat er wijzigde, en wat er nog
moet gebeuren voor dit naar productie kan. De werking van het contract zelf staat
in [`app-api.md`](./app-api.md); de kringkeuzes staan in
[`design-decisions.md`](./design-decisions.md).

In cijfers: 60 bestanden, waarvan 46 nieuw. `npm run verify` staat groen op 975
tests in `@vtk/web` (39 meer dan voor deze branch) en 155 in `@vtk/logistiek`.
Daarnaast is elk endpoint met de hand tegen een draaiende server nagekeken; zie
deel 8.

---

## 1. De vorm van de wijziging

Het uitgangspunt is dat de app **geen tweede implementatie** van iets krijgt. Waar
de site al een regel had (mag ik bestellen, is de deadline voorbij, hoeveel is er
nog), verhuist die regel naar een gewone functie in `lib/` die de server-action
van de website én de app-route allebei aanroepen.

Dat is de reden dat er in deze branch bestaande bestanden **korter** worden:

| Bestand | Wat eruit ging | Waarheen |
|---|---|---|
| `apps/web/app/actions/theokot.ts` | bestellen en annuleren, inclusief de transactie | `apps/web/lib/theokot-orders.ts` |
| `apps/web/app/actions/piano.ts` | reserveren en annuleren | `apps/web/lib/piano-reservations.ts` |
| `apps/web/app/[locale]/theokot/page.tsx` | de eigen lezing van sessies en voorraad | `loadOrderableSessions` in dezelfde lib |

Die drie zijn ook de plaatsen waar het echt zou mislopen als de app zijn eigen
versie had: bans, bestelvensters, voorraad en de weeklimiet op de piano.

**Drie schrijfwegen lopen bewust langs de bestaande routes** en kregen dus geen
app-variant:

- **afrekenen** → `POST /api/tickets/checkout`, dat ook het order-toegangscookie
  zet dat daarna nodig is om de bestelstatus te mogen lezen;
- **in- en uitschrijven op een shift** → `/api/shift/register`, dat overlappende
  shiften en de 24-uursgrens bewaakt en een cursusdienst-shift doorduwt naar cudi;
- **de shift-herinnering** → die vertrekt vanuit `processDueShiftReminders`, samen
  met de mail en binnen dezelfde markering.

Een wrapper zou daar niets doen dan doorgeven, of erger: de helft vergeten.

---

## 2. Nieuwe endpoints

Alles onder `/api/app/v1/`. Elk antwoord is een expliciete vorm uit
`lib/app-api/contract.ts`, met de teksten al vertaald (`?locale=nl|en`) en met
absolute beeld-URL's. Zie `app-api.md` voor het waarom.

### Publiek (werken zonder login)

| Endpoint | Wat |
|---|---|
| `GET /bootstrap` | Wie er ingelogd is, de headertabs, de aankondiging, `minimumAppVersion`. Eén ronde bij elke start. |
| `GET /home` | De inhoud van de homepage: openingsuren, bar-status, komende evenementen, aftermovies, career, jouw POC's, partners. |
| `GET /kalender` en `/kalender/[id]` | De agenda en één evenement. |
| `GET /categorie/[slug]` en `/paginas/[slug]` | De CMS-boom. Pagina's komen altijd als Markdown, ook de oude tiptap-documenten. |
| `GET /zoeken` | Zoeken over pagina's, evenementen, albums en (ingelogd) uitleenmateriaal. |
| `GET /media` en `/media/[slug]` | Albums uit Immich, aftermovies, magazines. |
| `GET /praesidium`, `/werkgroepen`, `/pocs` | De mensen. |
| `GET /tickets` en `/tickets/[slug]` | De ticketverkoop. |

### Achter een login

| Endpoint | Wat |
|---|---|
| `GET /theokot` | Verkoopdagen, aanbod, voorraad, jouw bestelling, en een eventuele ban. |
| `POST` / `DELETE /theokot/order` | Bestellen en annuleren. |
| `GET /shiften` | Waar je op staat en waar je nog op kan. |
| `GET /piano`, `POST` / `DELETE /piano/reservatie` | De agenda en het reserveren. |
| `GET /mijn/tickets` | Je tickets, met het `credential` waaruit de app zelf de QR tekent. |
| `GET /mijn/profiel` | Gegevens, posten, komende shiften, uitbetaling. |
| `POST /push/register` en `/push/unregister` | Een Expo-pushtoken aan- of afmelden. |

### Machine

| Endpoint | Wat |
|---|---|
| `POST /push/maintenance` | Worker-trigger. Stuurt "je broodje ligt klaar" en ruimt oude toestellen op. `Authorization: Bearer $APP_PUSH_MAINTENANCE_SECRET`. |

---

## 3. Nieuwe bestanden in `lib/`

| Bestand | Wat |
|---|---|
| `lib/app-api/contract.ts` | Alle types. **Wordt letterlijk gekopieerd** naar `mobile/src/api/contract.ts`; daarom geen enkele import, ook geen zod. |
| `lib/app-api/schemas.ts` | De zod-schema's voor wat de app stuurt. Apart, zodat de app die bibliotheek niet meesleept. |
| `lib/app-api/respond.ts` | `appJson`, `appError`, `appErrorResponse`, `readAppJson`. Eén foutvorm, één plek voor CORS. |
| `lib/app-api/media.ts` | Absolute URL's, met de host **uit de aanvraag** en niet uit `VTK_MAIN_URL`. |
| `lib/app-api/version.ts` | `minimumAppVersion()` uit `APP_MINIMUM_VERSION`. |
| `lib/app-api/pageContent.ts` | Oud tiptap-JSON naar Markdown, met dezelfde terugvalregels als `PageView`. |
| `lib/app-api/push.ts` | Versturen over Expo. Gooit nooit; ruimt tokens op die Expo afkeurt. |
| `lib/app-api/notifications.ts` | De berichten die vanzelf vertrekken. |
| `lib/theokot-orders.ts` | Bestellen, annuleren en de lezing, gedeeld met de website. |
| `lib/piano-reservations.ts` | Reserveren en annuleren, gedeeld met de website. |

---

## 4. Databank

Twee migraties. Allebei additief; er wordt niets hernoemd of verwijderd.

**`20260823210000_app_push_device`** voegt `AppPushDevice` toe (userId, uniek
token, platform, appVersion, createdAt, lastSeenAt) plus het enum
`AppPushPlatform`. De sleutel is het **token** en niet de gebruiker: één lid kan
meerdere toestellen hebben, en na een herinstallatie geeft Expo een nieuw token
voor hetzelfde toestel.

**`20260824110000_theokot_pickup_push`** voegt `TheokotOrder.pickupPushedAt` toe,
de markering voor het bericht "je broodje ligt klaar". Zelfde
claim-dan-versturen-aanpak als bij de herinneringsmails.

> Deze twee zijn op de lokale ontwikkeldatabank al toegepast. Op een omgeving
> waar deze branch nog niet draaide, gebeurt dat via `prisma migrate deploy`.

---

## 5. Rechten, logboek en navigatie

- **Nieuw recht `app.push`** (`packages/db/src/permissions.ts`, categorie
  `general`): met de hand een pushbericht sturen. De seed pikt het op uit die
  lijst, dus er is geen aparte seedwijziging.
- **MCP-policy** in `lib/mcp/policy.ts`: `app.push` staat op **geblokkeerd**, met
  lege `reads` en `creates`. Een pushbericht is een operationeel neveneffect dat
  niet terug te nemen is; dat hoort een agent nooit te kunnen.
- **Nieuw logboekonderwerp `appPush`** in `lib/audit.ts`, groep `it`. Elke
  handmatige verzending wordt gelogd met de tekst erbij.
- **Adminnavigatie**: `Admin → IT → App-pushberichten` (`/admin/app-push`), plus
  de vertaalsleutel `admin.appPush` in `packages/i18n`.

---

## 6. Wat er nodig is om dit te laten draaien

### Omgevingsvariabelen

| Variabele | Nodig? | Wat |
|---|---|---|
| `APP_PUSH_MAINTENANCE_SECRET` | voor push | Zonder deze staat `/api/app/v1/push/maintenance` uit (401), zoals bij de andere onderhoudsroutes. |
| `APP_MINIMUM_VERSION` | optioneel | `major.minor.patch`. Staat een geïnstalleerde app eronder, dan toont ze een bijwerkscherm. Niet gezet betekent `1.0.0`, en dus niemand buiten. Verhoog dit enkel wanneer een oudere app écht niet meer werkt. |

Er is **geen** Apple-certificaat of Google-servicesleutel nodig: het versturen
loopt over Expo's push-dienst, en die doet dat stuk.

### Een worker

`infra/docker-compose.yml` bevat een **`app-push-worker`** naast de bestaande
`shift-worker`: dezelfde vorm (curl-image, elke vijf minuten, heartbeat-bestand
voor de healthcheck) en hetzelfde "leeg secret = uit"-patroon. Zonder
`APP_PUSH_MAINTENANCE_SECRET` blijft hij slapen en meldt hij dat in zijn logs.

Een eigen worker en niet meeliftend op `shift-worker`, om dezelfde reden als daar:
een klemgelopen Expo mag de herinneringsmails niet meesleuren.

### De app zelf

De app draait op EAS onder `vtk-it`, project `vtk-app`, kanaal `preview`. Er is
een Android-APK; **voor iOS is er nog een Apple Developer-account nodig.**

---

## 7. Wat bewust niet gebouwd is

Geen achterstand maar beslissingen, hier samengebracht zodat ze bij een review op
tafel liggen:

- **Formulieren, lesbezoeken, grocomeet, het contactformulier en de
  accountformulieren** blijven op de site. Dat zijn formulieren met eigen
  validatie en soms juridische gevolgen; ze nabouwen zet dezelfde regels op twee
  plaatsen. De app linkt ernaar.
- **De admin komt niet in de app**, ook niet voor wie er rechten voor heeft.
- **De bureau- en grocomeetformulieren** blijven op de site. Dat zijn geen
  publieke pagina's maar bestelformulieren die je enkel via een gedeelde link
  bereikt, bewust niet in de navigatie en niet geïndexeerd. Ze in de app zetten
  zou van een besloten link een menu-item maken.
- **Tickets die in verkoop gaan, sturen geen automatische push.** Dat is het
  duidelijkste geval van een bericht dat commercieel aanvoelt in plaats van
  behulpzaam. Met de hand kan het wel.
- **Geen offline-wachtrij.** De scanner-app heeft er een omdat ze aan een deur in
  een kelder staat; deze app niet. Bestellen en kopen vragen netwerk, en dat is
  eerlijker dan een bestelling die "gelukt" lijkt en pas uren later aankomt.

---

## 8. De staat van het testen

`npm run verify` is groen, met 39 nieuwe tests in zes bestanden:

| Bestand | Wat het vastlegt |
|---|---|
| `test/appApiContract.test.ts` | De vorm van het contract, en of de kopie in de app-repo er nog gelijk aan is (slaat zichzelf over wanneer die repo er niet staat). |
| `test/theokotOrders.test.ts` | De weigeringen bij bestellen: geschorst, venster dicht, al besteld, deadline voorbij, andermans bestelling. |
| `test/appApiRoutes.test.ts` | De vorm van de antwoorden: absolute beeld-URL's, de vertaalde titel, de doelgroepfilter. |
| `test/appApiPageContent.test.ts` | De terugvalregels bij pagina-inhoud, inclusief de lege-Markdown-regel. |
| `test/appApiPush.test.ts` | Het opruimen van dode tokens, en dat een storing bij Expo niet doorgegooid wordt. |
| `test/appApiNotifications.test.ts` | De claim-dan-versturen-volgorde. |

### Wat er tegen een draaiende server nagekeken is

Elk endpoint is met `curl` bevraagd tegen een verse ontwikkelserver, uitgelogd én
ingelogd. Alle veertien geven wat ze horen te geven; de vijf die een login vragen
(`/theokot`, `/shiften`, `/piano`, `/mijn/tickets`, `/mijn/profiel`) geven
uitgelogd een nette 401 en ingelogd hun inhoud.

De schrijfwegen zijn met echte gegevens doorlopen, met een tijdelijke verkoopdag
en pianoreservaties die daarna weer opgeruimd zijn:

| Wat | Uitkomst |
|---|---|
| Pushtoken aanmelden, afmelden, en een ongeldig token | 200 / 200 / 400, en de rij verschijnt en verdwijnt in `AppPushDevice` |
| Bestellen met twee broodjes van de week (limiet is één) | 422 `INVALID_ORDER`, met de reden erbij |
| Een geldige bestelling | 201, en de juiste twee lijnen en het juiste totaal in de databank |
| Nog eens bestellen voor dezelfde dag | 409 `ALREADY_ORDERED` |
| De voorraad na de bestelling | 5 → 3 en 3 → 2, en na het annuleren weer 5 en 3 |
| Andermans bestelling annuleren | 409 `ORDER_NOT_FOUND`, hetzelfde antwoord als voor een onbestaande |
| Een pianoslot nemen, en nog eens | 201 en dan 409 `TAKEN` |
| Een verzonnen uur boeken dat geen echt slot is | 404 `NOT_FOUND` |
| Een derde slot in dezelfde week (limiet is twee) | 409 `WEEK_LIMIT` |
| De onderhoudsroute zonder secret | 401 |

**Wat nog altijd niet nagekeken is:** de app zelf op een toestel. De API's
kloppen, maar of de schermen die ze tekenen ook goed lezen op een telefoon, of de
weblogin het sessiecookie doorgeeft op iOS, en of een Mollie-testbetaling van
begin tot eind doorloopt, is niet gezien. Dat blijft de eerste avond werk:

1. inloggen, en met een nieuw lid ook de onboardingpoort;
2. een broodje bestellen in de app en het op `/admin/theokot/turflijst` zien staan;
3. een ticket kopen tot in Mollie's testmodus, en de QR laten scannen door de
   scanner-app;
4. een contentpagina met koppen, een lijst, een link en een download;
5. push aanzetten, en met de hand een bericht sturen vanuit het beheerscherm.
