# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

(Dit blok wordt door `expo start` herschreven en kan dan naar een andere versie
wijzen dan waar deze app op staat. Wij zitten op SDK 54; zie onderaan waarom.)

# VTK (Expo)

De VTK-site als native app, voor iOS en Android. Dezelfde inhoud en hetzelfde
ontwerp als **vtk-website-new**, maar met de vorm van een app: een tabbalk
onderaan, schermen in plaats van pagina's. **De admin hoort hier niet in** en
blijft op het web.

Niet te verwarren met **vtk-scanner-app**: dat is de ticketscanner voor aan de
deur, met zijn eigen offline-werking en een donker scherm. Die blijft apart.

**Lees `docs/` voor je plant of schrijft.** `docs/plan.md` is het plan én het
logboek (welke fase waar staat), `docs/architecture.md` legt uit hoe de app met
de site praat.

## Draaien

```
npm start          # expo start (dev build, niet Expo Go: react-native-webview)
npm run type-check # tsc --noEmit, moet 0 fouten geven
npm run lint
```

Lokaal testen vraagt HTTPS, want de weblogin doet KU Leuven-SSO. Draai
vtk-website-new achter een cloudflared-tunnel en vul die URL in bij
**Profiel -> Server**. Zie `docs/architecture.md`.

## Regels

1. **De server is de waarheid.** Elke regel die iets beslist (mag ik bestellen,
   is de deadline voorbij, hoeveel zijn er nog) staat in vtk-website-new en wordt
   hier niet nagebouwd. De app mag nooit soepeler zijn dan de site.
2. **Alles native, behalve identiteit en geld.** Een WebView is toegelaten voor
   inloggen, de onboarding-poorten en betalen (Mollie). Al de rest wordt een echt
   scherm. Een browser openen voor eigen inhoud is een bug, geen keuze; enkel
   adressen op een andere site (cudi, Career, Burgieclan) horen daar.
9. **Home is wat je wil doen, Info is waar alles staat.** De snelkoppelingen
   staan op Home en niet in Info; anders komt de helft twee keer voor, één keer
   als tegel en één keer als menu-item uit het CMS.
3. **Geen admin.** Ook niet voor wie er rechten voor heeft.
4. **iOS en Android doen hetzelfde.** Geen platformspecifieke schermen.
5. **Geen dependency die de Expo SDK al dekt.**
6. **Geen emoji in de UI**; iconen komen uit `lucide-react-native`.
7. **Nederlands in de interface**, Engelse vakterminologie waar dat natuurlijker
   is. **Geen em-dashes**, ook niet in code, comments of commits.
8. **Het ontwerp komt van de site.** De tokens in `src/theme/tokens.ts` zijn de
   enige plek met kleuren; verzin er geen. Witte kaarten op papier, dunne randen,
   geel enkel als accent, geen gradienten en geen kaart in een kaart. De donkere
   `PageHead` opent elk scherm behalve Home, precies zoals `.vtk-page-head` dat op
   de site doet.

## Structuur

- `app/` - enkel expo-router routes. Elke route staat expliciet in de `<Stack>`
  in `app/_layout.tsx`; de vijf tabs in `app/(tabs)/_layout.tsx`.
- `src/api/` - de HTTP-laag en het contract met de site.
- `src/auth/` - wie er ingelogd is (er wordt geen token bewaard; zie
  `src/api/client.ts`) en de twee poorten uit `proxy.ts`.
- `src/state/` - `AppProvider`, de schil: viewer, tabs, aankondiging.
- `src/components/`, `src/theme/tokens.ts` - UI en tokens. `Prose` rendert alle
  Markdown (pagina's, aankondigingen, evenement- en ticketbeschrijvingen).
- `src/api/useResource.ts` - het patroon van elk scherm dat gegevens ophaalt:
  cache tonen, ophalen, en het zeggen wanneer die verversing niet lukte.
- `src/format.ts` - datums, uren en geld, altijd in `Europe/Brussels`.
- `src/nativeRoute.ts` - vertaalt een pad uit het CMS naar een scherm in de app.
  Het CMS kent de app niet en zet "Piano reserveren" als link naar `/piano`;
  zonder deze tabel zou dat in een browser openen terwijl er een scherm voor
  bestaat. **Komt er een native scherm bij, voeg hier dan een regel toe.**
- `src/push.ts` - pushberichten. Toestemming wordt gevraagd via de knop in
  Profiel en **nooit bij de eerste start**; op iOS krijg je maar één kans.
- `src/storage.ts` - voorkeuren en de leescache. **Geen schrijfwachtrij**: dit is
  niet de scanner, en bestellen vraagt netwerk.

## Wat bewust op de site blijft

Geen achterstand maar een beslissing: je gegevens wijzigen, verbonden apps,
privacygegevens, formulieren, lesbezoeken en het contactformulier. Dat zijn
formulieren met eigen validatie en soms juridische gevolgen, en die op twee
plaatsen hebben is twee keer kunnen mislopen.

Drie schrijfwegen lopen ook bewust langs de bestaande routes van de site in plaats
van langs `/api/app/v1`: **afrekenen** (`/api/tickets/checkout`, dat het
order-toegangscookie zet) en **in- en uitschrijven op een shift**
(`/api/shift/register`, dat overlap, de 24-uursgrens en de cudi-sync bewaakt). Een
wrapper zou daar niets doen dan doorgeven, of erger, de helft vergeten.

## Gekopieerd uit vtk-website-new

Deze bestanden zijn bewust een kopie en geen import; wijzigt het origineel, dan
wijzigt dit mee. De contracttest in `apps/web/test/appApiContract.test.ts`
vergelijkt de eerste rij byte voor byte wanneer beide repo's naast elkaar staan.

| Hier | Origineel |
|---|---|
| `src/api/contract.ts` | `apps/web/lib/app-api/contract.ts` |
| `src/theme/tokens.ts` | `apps/web/app/design/vtk-base.css` (`:root`) |
| `src/api/client.ts` | `vtk-scanner-app/src/api/client.ts` |

## Expo SDK 54, niet 57

Bewust gelijk aan vtk-scanner-app: een toolchain voor beide VTK-apps, en die is
daar al door de EAS-bouwproblemen heen (de `react-dom`-pin, het wegvallen van
`@react-native-cookies/cookies`, `platforms: ["ios","android"]` voor
`eas update`). Upgraden is prima, maar doe het dan voor allebei tegelijk en als
een eigen taak, niet en passant.
