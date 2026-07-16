# Onboarding- en studiebevestiging-gate

Deze notitie legt uit waar de gate zit die een ingelogd lid dwingt om (1) zijn
profiel af te werken (onboarding) en (2) per werkingsjaar zijn studie te
bevestigen, waarom die in `proxy.ts` leeft en niet in een layout, en wat de
kost/nadelen van de huidige aanpak zijn. Ze is bewust eerlijk over de zwakke
plekken: de huidige oplossing werkt, maar is niet de eindvorm.

## Wat de gate doet

Een ingelogd lid wordt omgeleid zolang een van deze twee gaten open staat:

1. **Onboarding:** `onboardedAt` is `null` -> omleiden naar `/onboarding`.
2. **Studiebevestiging:** `studyConfirmedYear !== currentWorkingYear()` -> omleiden
   naar `/studie-bevestigen`.

Op de doelpagina zelf grijpt de gate niet in (anders krijg je een lus). Anonieme
bezoekers raken de gate nooit: geen sessie, geen redirect.

De implementatie staat in `gateRedirect()` in `apps/web/proxy.ts`.

## Waarom in de proxy en niet in de layout

De gate stond eerst in `apps/web/app/[locale]/layout.tsx` als een `redirect()`.
Dat gaf een **oneindige render-/refetch-lus** zodra de gate effectief omleidde
(dus enkel voor niet-bevestigde/niet-onboardede leden; een bevestigd account
werkte gewoon).

### Het loop-mechanisme

1. Na login redirect de server-action (`loginAction`) naar `/`.
2. Een server-action-redirect wordt door de client als een **client-side (RSC)
   navigatie** gevolgd, en triggert bovendien een router-refresh.
3. De layout van `/` draait, ziet dat het lid nog niet bevestigd is en doet
   `redirect('/studie-bevestigen')`.
4. De App Router blijft daarna het **page-segment** van `/studie-bevestigen`
   herophalen (ongeveer 1 request/seconde), zonder ooit te settelen.

Kenmerkend in de logs: een stroom `GET /nl/studie-bevestigen 200` met
`Content-Type: text/x-component`, telkens een nieuwe `?_rsc=`-sleutel, geen
`Set-Cookie` en geen `Location`-header (een RSC-`redirect()` zit in de
flight-body, niet in een header). De `[locale]`-layout draaide daarbij maar
één keer: door **partial rendering** her-rendert een gedeelde layout niet op
navigatie, dus de gate-check draaide niet eens meer op de refetches.

Kortom: een `redirect()` vanuit een **gedeelde layout** tijdens een RSC-navigatie
is een gekende App Router-valkuil. De Next-docs waarschuwen hier expliciet voor:
doe geen auth-/gate-checks in layouts, want die her-renderen niet op elke
navigatie.

### Waarom de proxy dit oplost

Een redirect op de **netwerkgrens** (proxy) is een gewone HTTP 307 die de router
netjes als een normale navigatie volgt; geen mid-RSC-redirect vanuit een gedeeld
segment, dus geen lus. De proxy draait in Next 16 standaard op de **Node.js
runtime**, dus `getSession` (Prisma) werkt daar.

Bijkomend voordeel: de proxy dekt **alle** instappaden uniform (e-mail-login,
KU Leuven-OIDC, directe URL, refresh, klik op een link), niet enkel de
post-login-flow.

## De kost/nadelen van `getSession` in de proxy

Dit is de zwakke plek van de huidige oplossing.

### `getSession` is de zwaarste sessie-read die we hebben

Per call (`packages/auth/src/server/session.ts`):

1. **better-auth `auth.api.getSession`** valideert de sessie-token tegen de DB
   (er is geen cookie-cache geconfigureerd, dus dit raakt de DB elke keer):
   ~1-2 queries.
2. **`prisma.user.findUnique` met de grote `include`-boom**
   (`memberships -> group -> {permissions, roleGrants -> role -> permissions}`
   en `roles -> role -> permissions`). Prisma doet standaard een query per
   relatieniveau, dus ~6-8 SQL-round-trips, plus het samenstellen van de
   permissie-set in JS.

Dat is ruwweg **8-10 SQL-statements** per call.

### Het draait twee keer per navigatie

De proxy en de RSC-render delen **geen** React request-cache. De proxy roept
`getSession` aan voor de gate, en daarna roepen de pagina en/of de `Header`
`getSession` (via `requireSession`) nog eens aan tijdens de render. Resultaat:
**~16-20 SQL-statements per geauthenticeerde navigatie**, terwijl de gate maar
**twee velden** nodig heeft (`onboardedAt`, `studyConfirmedYear`). De volledige
rol-/permissie-machinerie is pure verspilling voor een gate-check.

Voor het verkeersvolume van deze site valt dit niet om, maar het is
verspillend en het schaalt slecht.

### Bijkomende nadelen van "checken op elke request"

- **Elke request** (elke RSC-navigatie die door de proxy passeert) betaalt de
  gate-kost, ook al verandert de onboarding-/studiestatus bijna nooit.
- De proxy laadt nu de volledige better-auth- + Prisma-module in zijn graaf.
  Dat werkt op de Node.js-runtime, maar maakt de proxy zwaarder en gevoeliger
  (zie de Prisma-bundling-waarschuwingen in `AGENTS.md`).
- **Soft-navigaties tussen al geladen pagina's worden niet opnieuw gegate**
  (de proxy draait wel per request, maar dit blijft inherent aan gaten die niet
  in elke pagina zitten). De echte instappaden (login, hard load, refresh)
  zijn wel gedekt.

## Voor later: een betere aanpak

De status per request opvragen is conceptueel verkeerd; onboarding- en
studiestatus veranderen zelden, dus ze horen niet bij elke navigatie opnieuw
tegen de DB gecheckt te worden. Denkrichtingen voor een herwerking:

- **Lichte gate-query:** een `getGateStatus()` die enkel de sessie valideert en
  `onboardedAt` + `studyConfirmedYear` selecteert (~2-3 lichte queries, geen
  joins). Snelste verbetering met de kleinste impact.
- **Status in de sessie/cookie:** `onboarded` en `studyConfirmedYear` als velden
  op de better-auth-sessie zetten, zodat de proxy ze uit de cookie leest zonder
  DB-hit. Vergt invalidatie wanneer het lid onboardt/bevestigt.
- **Event-driven i.p.v. per-request:** enkel (her)evalueren op de momenten die
  ertoe doen (login, jaarwissel op 15 juli, na het invullen van het formulier),
  en de rest van de tijd niets doen.

Tot dan: de huidige proxy-gate werkt en is correct; dit is bewust "goed genoeg
voor nu", niet de eindvorm.

Als ooit dit probleem wordt opgelost dan mag deze file worden verwijderd. Informatie die wel nog bewaart moet worden mag verplaatst worden naar andere relevante files in /docs/

## Betrokken bestanden

- `apps/web/proxy.ts` (`gateRedirect`): de gate zelf.
- `apps/web/app/[locale]/layout.tsx`: de oude gate is hier weg; de layout is nu
  puur chrome.
- `packages/auth/src/server/session.ts` (`getSession`): de zware sessie-read die
  de proxy (voorlopig) hergebruikt.
- `docs/design-decisions.md`: korte product-context bij de verplichte onboarding.
