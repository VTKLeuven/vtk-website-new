# Hoe de app met de site praat

## Eén server, één contract

Alles komt uit **`/api/app/v1/*`** op vtk-website-new. Die boom is er voor deze
app en heeft de versie in het pad, omdat de beller een geïnstalleerde app is:
iemand die zijn app een half jaar niet bijwerkte, praat nog steeds met de huidige
server. Breekt er een vorm, dan komt er `v2` naast en blijft `v1` staan zolang er
toestellen op zitten.

De volledige beschrijving staat aan de andere kant, in `docs/app-api.md` van
vtk-website-new. Wat je hier moet weten:

- De app krijgt **nooit een Prisma-rij**, altijd een expliciete vorm uit
  `src/api/contract.ts`.
- De **teksten zijn al vertaald**: de app stuurt `?locale=nl|en` en krijgt
  `title`, niet `titleNl` + `titleEn`.
- **Beeld-URL's zijn absoluut.** Een `<Image source={{ uri }}>` vult geen host
  aan, dus de server doet dat.
- Fouten hebben een stabiele code (`UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`,
  `INVALID_REQUEST`, `SERVER_ERROR`). De app beslist op de code, niet op de tekst.

## Inloggen zonder token

De app bewaart **geen token**. Ze toont de gewone weblogin in een WebView
(`app/inloggen.tsx`); het better-auth sessiecookie belandt daarmee in de
cookie-opslag van het besturingssysteem, en `fetch` in React Native gebruikt
diezelfde opslag: op iOS `NSHTTPCookieStorage`, op Android de `CookieManager` die
ook onder de WebView zit.

Twee gevolgen, allebei goed:

- **KU Leuven-SSO werkt vanzelf**, want we bouwen dat loginscherm niet na.
- **"Ben ik ingelogd" is altijd een vraag aan de server**, nooit een vlag die uit
  de pas kan lopen.

`sharedCookiesEnabled` op de WebView is niet optioneel: zonder dat deelt iOS de
cookies niet en is de app na het inloggen nog steeds uitgelogd.

## De twee poorten

`proxy.ts` op de website stuurt een lid zonder afgewerkt profiel naar
`/onboarding`, en een lid dat zijn studie dit werkingsjaar nog niet bevestigde
naar `/studie-bevestigen`. **Die gate staat op pagina's en niet op `/api`.** De
app-API ziet er dus niets van, en zonder tegenmaatregel zou een nieuw lid in een
app zitten waar overal "niet toegelaten" staat zonder uitleg.

Daarom vertelt `bootstrap` het: `needsOnboarding` en `needsStudyConfirmation`.
`pendingGate()` in `src/auth/session.ts` maakt daar één antwoord van, in dezelfde
volgorde als de proxy (eerst onboarden, dan de studie), en `app/poort.tsx` toont
het bijbehorende webscherm.

## Waar een WebView wel mag

Drie plekken, en ze hebben dezelfde reden: ze horen bij de identiteit of bij het
geld, en die willen we niet nabouwen.

1. **Inloggen** (KU Leuven-SSO).
2. **De twee poorten** hierboven; die hangen aan de mailinglijsten en de
   cursusdienst, en hun regels horen op één plek te leven.
3. **Betalen**, straks: `/api/tickets/checkout` geeft een `checkoutUrl` van Mollie
   terug, de app opent die met `expo-web-browser` en polst daarna
   `/api/tickets/orders/[orderId]/status`. Geen in-app-aankopen: dit zijn fysieke
   goederen en evenementen, en die vallen buiten de Apple-commissie.

Alles wat gewone inhoud is, wordt native. De `ComingSoon`-schermen zijn
overgangsschermen per tab, geen vierde categorie.

## Wat er op het toestel staat

`src/storage.ts`, SQLite, en niet meer dan twee dingen:

- **voorkeuren**: de basis-URL, de taal;
- **een leescache**: de laatste uitkomst per scherm, zodat de app niet als een
  leeg vak opent op een trage verbinding.

Er staat **geen wachtrij** in, anders dan bij vtk-scanner-app. Die scanner staat
aan een deur in een kelder en moet offline door kunnen; deze app niet. Iets
bestellen of kopen vraagt netwerk, en dat is eerlijker dan een bestelling die
"gelukt" lijkt en pas uren later ergens aankomt.

Wat uit de cache komt, wordt ook zo getoond (`StaleNotice`). Verzwijgen dat je
oude inhoud toont is erger dan een leeg scherm: iemand plant er zijn avond mee.

## Push

De app registreert haar Expo-pushtoken op `/api/app/v1/push/register`, maar er
wordt vandaag **nog niets verstuurd**. De reden dat dit er nu al in zit: een
pushtoken vraagt native code (`expo-notifications`) en die kan niet via
`eas update` bijgezet worden. Kwam dit pas later, dan had iedereen op dat moment
een nieuwe build nodig.

## Lokaal testen

De weblogin vraagt HTTPS, dus `http://localhost:3000` werkt niet vanaf een
toestel. Draai vtk-website-new achter een cloudflared-tunnel en vul die URL in bij
**Profiel -> Server**. Dat wisselen gooit de leescache weg, want die hoort bij één
site.

De server leidt zijn absolute URL's af uit de aanvraag zelf en niet uit
`VTK_MAIN_URL`, precies zodat die tunnel vanzelf meewerkt.

## Uitrollen

EAS internal distribution plus `eas update`, drie kanalen (`development`,
`preview`, `production`), net als bij de scanner. `runtimeVersion` staat op
`exposdk:54.0.0`: JS en assets gaan over de lucht, native modules niet. Voeg je
een native dependency toe, dan is er een nieuwe build nodig en helpt een update
niet.

Let op de bekende valstrik: **een OTA-update wordt op de ene start gedownload en
op de volgende pas toegepast.** De app moet dus twee keer dicht en open voor je
oordeelt over wat je ziet.
