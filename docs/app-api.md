# De app-API (`/api/app/v1`)

De JSON-API waar de **VTK-app** (Expo, iOS + Android, repo `~/vtk-app`) op draait.
Dit document beschrijft het contract en de regels errond. Het plan van de app zelf
staat in `~/vtk-app/docs/plan.md`.

Niet te verwarren met de scanner: `vtk-scanner-app` praat met `/api/tickets/...`
en staat hier los van.

## Waarom een eigen boom

De bestaande API-routes zijn per stuk gegroeid voor één beller: `/api/shift` voor
de urenloop-app, `/api/tickets/events/[eventId]/scan/*` voor de scanner,
`/api/calendar/*` voor de agenda-feeds. Die mogen blijven zoals ze zijn.

`/api/app/v1` is iets anders: **een contract met een versie in het pad**, omdat de
beller een geïnstalleerde app is. Een gebruiker die zijn app een half jaar niet
bijwerkte, praat nog steeds met deze server. Breekt er iets aan een bestaande
vorm, dan komt er `/api/app/v2` naast en blijft v1 staan zolang er toestellen op
zitten.

## De vier regels

1. **Nooit een Prisma-vorm doorgeven.** Elke route bouwt een expliciete vorm uit
   `lib/app-api/contract.ts`. Dat is niet alleen de regel uit `AGENTS.md` dat
   `@vtk/db` zijn client-types niet exporteert; het is vooral dat een
   geïnstalleerde app maanden ouder kan zijn dan het schema.
2. **De teksten zijn al gekozen.** De app stuurt `?locale=nl|en` en krijgt
   `title`, niet `titleNl` + `titleEn`. Zonder die regel zou de app `pick()` uit
   `@vtk/i18n` moeten nabouwen en zou elke nieuwe vertaalde kolom een app-release
   vragen.
3. **Beeld-URL's zijn absoluut.** `publicUrl()` geeft een pad; een
   `<Image source={{ uri }}>` in React Native vult daar geen host bij aan.
   `absoluteMediaUrl()` in `lib/app-api/media.ts` doet dat, met de host **uit de
   aanvraag** en niet uit `VTK_MAIN_URL`: lokaal testen gaat via een
   cloudflared-tunnel en dan wijst die variabele naar een localhost waar de
   telefoon niet bij kan.
4. **Logica komt uit `lib/`, niet uit de route.** Waar de site een server-action
   heeft die hetzelfde doet, verhuist de kern naar een gewone functie in `lib/`
   die allebei roepen. De app mag nooit soepeler zijn dan de website; bij Theokot
   (bans, bestelvensters, voorraad) is dat het hele punt.

## Bestanden

| Bestand | Wat |
|---|---|
| `apps/web/lib/app-api/contract.ts` | Types en zod-schema's. **Geen server-imports**, want dit bestand wordt gekopieerd naar `~/vtk-app/src/api/contract.ts`. |
| `apps/web/lib/app-api/respond.ts` | `appJson`, `appError`, `appErrorResponse`, `readAppJson`. Eén plek voor de foutvorm en de CORS-headers. |
| `apps/web/lib/app-api/media.ts` | `requestOrigin`, `absoluteMediaUrl`, `absoluteUrl`. |
| `apps/web/lib/app-api/version.ts` | `minimumAppVersion()` en `compareVersions()`. |
| `apps/web/test/appApiContract.test.ts` | Bewaakt de vorm, en vergelijkt het contract met de kopie in de app-repo wanneer die naast deze staat. |

## Sessie en toegang

Dezelfde weg als de scanner: **het gedeelde better-auth sessiecookie**. De app
logt in met de gewone weblogin in een WebView; het cookie belandt in de
cookie-opslag van het besturingssysteem en `fetch` in React Native gebruikt
diezelfde opslag. Er wordt geen token bewaard, en KU Leuven-SSO werkt daardoor
vanzelf.

Routes gebruiken `requireSession()` of `getCurrentSession()` uit `lib/session.ts`
en laten fouten door `appErrorResponse` afhandelen. Foutcodes die de app kent:
`UNAUTHENTICATED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404),
`INVALID_REQUEST` (400 of 413) en `SERVER_ERROR` (500). De app beslist op de
code, niet op de tekst.

**De onboarding-gate is de app zijn eigen werk.** `proxy.ts` stuurt een lid zonder
afgewerkt profiel naar `/onboarding` en een lid dat zijn studie nog niet bevestigde
naar `/studie-bevestigen`, maar die gate staat op pagina's en niet op `/api`. De
app-API vertelt daarom in `bootstrap` of dat speelt (`needsOnboarding`,
`needsStudyConfirmation`), en de app toont dan het bijbehorende webscherm. Zonder
dat zit een nieuw lid in een app die overal leeg blijft zonder te zeggen waarom.

## Endpoints

### `GET /api/app/v1/bootstrap`

Wat de app bij elke start ophaalt, in één ronde: `viewer` (of `null`), de
headertabs uit het CMS, de aankondiging van dit moment, `minimumAppVersion` en
`webBaseUrl`. Werkt zonder sessie; de app is publiek bruikbaar.

### `POST /api/app/v1/push/register` en `/push/unregister`

Melden een Expo-pushtoken aan of af op de ingelogde gebruiker. De sleutel is het
**token** en niet de gebruiker: één lid heeft soms twee toestellen, en na een
herinstallatie geeft Expo een nieuw token voor hetzelfde toestel.

Er wordt vandaag **nog niets verstuurd.** De tabel `AppPushDevice` en deze twee
routes bestaan nu al omdat een pushtoken native code vraagt (`expo-notifications`)
en die niet via een OTA-update bijgezet kan worden. Kwam dit pas later, dan had
iedereen op dat moment een nieuwe build nodig. Opruimen gebeurt straks bij het
verzenden, wanneer Expo een token als `DeviceNotRegistered` afkeurt.

## `APP_MINIMUM_VERSION`

Optionele omgevingsvariabele, `major.minor.patch`. Staat een geïnstalleerde app
eronder, dan toont ze een bijwerkscherm in plaats van schermen die stuk kunnen
zijn. Bewust geen `Setting` met een beheerscherm: dit hoort bij een release van de
server, en een verkeerd getikte waarde in een adminveld zet iedereen buiten.
Verhoog het enkel wanneer een oudere app echt niet meer werkt, niet bij elke
release. Niet gezet of onzinnig ingevuld betekent `1.0.0`, en dus niemand buiten.
