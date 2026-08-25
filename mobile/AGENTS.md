# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

(Dit blok wordt door `expo start` herschreven en kan dan naar een andere versie
wijzen dan waar deze app op staat. Wij zitten op SDK 54; zie onderaan waarom.)

# VTK (Expo)

De app van VTK Leuven, voor iOS en Android. **Hetzelfde ontwerp als
vtk-website-new, maar niet dezelfde vorm.** De site is er om te lezen wat VTK
doet; de app is er voor de vijf dingen die je met een telefoon in je hand doet:
zien wat er open is, plannen wat je gaat doen, een ticket kopen en tonen, een
broodje bestellen en afhalen, en aan een balie een code laten scannen. De hele
inhoud van de site zit er nog steeds in, maar onder Meer en niet vooraan.

**De admin hoort hier niet in** en blijft op het web.

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
npm run routes     # schrijft app/(tabs)/** en app/(oud)/** uit src/navigation.ts
npm run routes:check # loopt dat gelijk, en bestaat elk adres waar de app naartoe duwt
```

Lokaal testen vraagt HTTPS, want de weblogin doet KU Leuven-SSO. Draai
vtk-website-new achter een cloudflared-tunnel en vul die URL in bij
**Meer -> je naam -> Server**. Zie `docs/architecture.md`.

**De camera, de agenda en de fotobibliotheek gaan niet mee met `eas update`.**
`expo-camera`, `expo-calendar` en `expo-media-library` zijn native modules. In
Expo Go zitten ze al ingebouwd, dus daar kan je de scanner, "In agenda" en het
bewaren van een foto wel gewoon testen. Op een APK moet de module in de build
zelf zitten; wie een oudere APK heeft, krijgt daar een rood scherm.

**Voeg je een native dependency toe, bouw dan voor je publiceert.**
`runtimeVersion` staat op `"exposdk:54.0.0"`, dezelfde waarde voor élke SDK
54-build, dus een update wordt ook aangeboden aan een oudere APK die de module
niet heeft; `requireNativeModule` gooit dan op het scherm waar die import hangt.
Bouw eerst, verspreid de APK, en vraag om de vorige te vervangen.

**Die policy staat er om Expo Go.** Er is geen Apple Developer-account en dus geen
iOS-build; de enige weg naar een iPhone is Expo Go dat een gepubliceerde update
opent, en Expo Go laadt enkel een `exposdk`-runtime. Zet dit niet op
`{ "policy": "fingerprint" }` zonder eerst `docs/architecture.md` te lezen: dat is
één keer gebeurd en legde de hele iOS-kant stil.

**Voeg geen module toe die niet in Expo Go zit.** Alles wat we vandaag gebruiken
zit erin (camera, agenda, fotobibliotheek, sqlite, bestanden, delen, webview,
svg). Iets anders erbij betekent dat niemand de app nog op een iPhone kan
bekijken. Push is de bestaande uitzondering: die werkt in Expo Go niet.

## Regels

1. **De server is de waarheid.** Elke regel die iets beslist (mag ik bestellen,
   is de deadline voorbij, hoeveel zijn er nog) staat in vtk-website-new en wordt
   hier niet nagebouwd. De app mag nooit soepeler zijn dan de site.
2. **Alles native, behalve identiteit en geld.** Een WebView is toegelaten voor
   inloggen, de onboarding-poorten en betalen (Mollie). Al de rest wordt een echt
   scherm. Een browser openen voor eigen inhoud is een bug, geen keuze; enkel
   adressen op een andere site (cudi, Career, Burgieclan) horen daar.
3. **Geen admin.** Ook niet voor wie er rechten voor heeft.
4. **iOS en Android doen hetzelfde.** Geen platformspecifieke schermen.
5. **Geen dependency die de Expo SDK al dekt.**
6. **Geen emoji in de UI**; iconen komen uit `lucide-react-native`.
7. **Nederlands in de interface**, Engelse vakterminologie waar dat natuurlijker
   is. **Geen em-dashes**, ook niet in code, comments of commits.
8. **Het ontwerp komt van de site.** De tokens in `src/theme/tokens.ts` zijn de
   enige plek met kleuren; verzin er geen. Witte kaarten op papier, dunne randen,
   geel enkel als accent, geen gradienten en geen kaart in een kaart. De donkere
   `PageHead` opent elk scherm, precies zoals `.vtk-page-head` dat op de site doet;
   Home tekent dezelfde kop zelf omdat ze buiten de scroll staat.
9. **Home is vandaag, Meer is waar alles staat.** Home beantwoordt twee vragen:
   wat is er open, en wat wacht er op mij. De CMS-boom, de mensen, de piano en je
   profiel staan onder Meer. Zet een snelkoppeling niet op allebei; anders komt de
   helft twee keer voor, één keer als tegel en één keer als menu-item uit het CMS.
10. **Wat je aan een balie toont, is twee tikken ver.** Je ticket, je
   broodjescode en je bonnetjes staan achter een segment in hun eigen tab en niet
   achter een menu. Aan een deur of een toog staat er een rij achter je.
11. **Toon geen knop die "geen toegang" antwoordt.** `bootstrap.abilities` zegt
   wat deze gebruiker mag; verberg de rest. Dat is netheid en geen beveiliging,
   want elke route controleert het daarna nog eens zelf.

## Structuur

- `app/` - enkel expo-router routes, en die worden **gemaakt, niet getikt**:
  `npm run routes` schrijft ze uit `TAB_ROUTES` in `src/navigation.ts`. De
  schermen zelf staan in `src/screens/`.
- **Elke tab is een eigen stack**, met het tabscherm onderaan:
  `app/(tabs)/(home)/`, `kalender/`, `studeren/`, `tickets/`, `meer/`. Dat is de
  hele reden dat teruggaan werkt zoals het hoort, en het is één keer fout gegaan
  in drie pogingen, dus: **terugvegen popt een stack, en poppen kan enkel als er
  een scherm onder ligt.** Was er één gedeelde stack voor alle doorklikschermen,
  dan lag daar het tabscherm van de tab waar je het láátst geweest was, en kwam je
  vanuit Home op Meer uit. Was er geen stack, dan was er niets om te poppen en
  deed de veeg niets. Een scherm dat vanuit twee tabs bereikbaar is, staat dus in
  twee stacks maar bestaat één keer.
  - Home is een routegroep (`(home)`), de rest niet. Zo blijft `/evenement/12`
    letterlijk `/evenement/12` en breekt geen enkel bestaand adres, terwijl
    dezelfde pagina onder Meer `/meer/evenement/12` wordt.
  - **Gebruik `useTabRouter` uit `src/navigation.ts`, nooit `useRouter`** (behalve
    voor `back()`). De adressen in een scherm blijven gewoon `/piano`; welke tab
    ervoor komt, hoort een knop niet te weten.
  - Een nieuw scherm: bestand in `src/screens/`, regel bij in `TAB_ROUTES`,
    `npm run routes`. **In élke tab van waaruit je het kan openen**, niet enkel in
    de meest voor de hand liggende: een snelkoppeling op Home naar een scherm dat
    enkel Meer draagt, opent op Meer en zet je daar af bij het teruggaan. Dat is
    precies wat er één keer misging.
  - `npm run routes:check` bewaakt drie dingen: dat de bestanden gelijklopen met
    de kaart, dat elk adres waar de app naartoe duwt ook bestaat, en dat elke tab
    in zichzelf blijft. Wat het niet ziet, is een adres dat als data binnenkomt;
    de paden bij de taken op Home staan in
    `apps/web/app/api/app/v1/vandaag/route.ts` en horen in dezelfde lijst.
  - **Elk doorklikscherm krijgt een terugknop, en die zit in `PageHead`.** De
    stacks draaien met `headerShown: false`, dus er is geen systeemkop die er een
    tekent. Zonder die knop geraakte je op iOS nergens meer weg zodra je één keer
    doorklikte (op Android redde de hardwareknop dat). `PageHead` toont hem enkel
    wanneer er iets is om naar terug te keren, dus een tabscherm zet
    `back={false}`.
- `app/(oud)/` - de adressen van vóór die opsplitsing (`/piano`, `/shiften`,
  `/media`, ...), die enkel doorverwijzen. Een geïnstalleerde app kan maanden
  achterlopen en een pushbericht van vorige week draagt nog het oude pad; dat mag
  niet op een leeg scherm eindigen. Ook deze worden gemaakt.
- `app/(tabs)/_layout.tsx` is wél met de hand geschreven: **Home, Kalender,
  Studeren, Tickets, Meer**, met hun iconen. Tickets heeft twee segmenten (Kopen/Mijne); zie
  `src/components/Segmented.tsx` voor waarom dat geen tabs zijn. Broodjes staat als
  snelkoppeling op Home.
- `app/_layout.tsx` draagt enkel nog de tabs plus drie modals (inloggen, de
  onboardingpoort, de serverinstelling). Die liggen bewust wél over de balk: een
  modal die de navigatie eronder laat staan, is geen modal.
- `src/api/` - de HTTP-laag en het contract met de site.
- `src/auth/` - wie er ingelogd is (er wordt geen token bewaard; zie
  `src/api/client.ts`) en de twee poorten uit `proxy.ts`.
- `src/state/` - `AppProvider`, de schil: viewer, tabs, aankondiging.
- `src/components/`, `src/theme/tokens.ts` - UI en tokens. `Prose` rendert alle
  Markdown (pagina's, aankondigingen, evenement- en ticketbeschrijvingen).
- `src/api/useResource.ts` - het patroon van elk scherm dat gegevens ophaalt:
  cache tonen, ophalen, en het zeggen wanneer die verversing niet lukte.
- `src/format.ts` - datums, uren en geld, altijd in `Europe/Brussels`.
- `src/monthGrid.ts` - het maandrooster van de kalender. **Geen kopie van
  `calendarGrid.ts` op de site**: die rekent met de lokale tijd van de machine,
  en op een telefoon is dat niet noodzakelijk Brussel. Hier draait alles op
  datumsleutels (`YYYY-MM-DD`) en op UTC-middag, zodat geen tijdzone en geen
  zomertijdsprong een dag kan verschuiven.
- `src/navigation.ts` - de kaart van tabs en schermen, plus `useTabRouter`. De
  enige plek waar staat welk scherm in welke tab hoort.
- `src/screens/` - de schermen zelf. Een bestand hier is een gewone component; het
  weet niet in welke tab het getekend wordt, en dat hoort ook niet.
- `src/nativeRoute.ts` - vertaalt een pad uit het CMS naar een scherm in de app.
  Het CMS kent de app niet en zet "Piano reserveren" als link naar `/piano`;
  zonder deze tabel zou dat in een browser openen terwijl er een scherm voor
  bestaat. **Komt er een native scherm bij, voeg hier dan een regel toe.**
- `src/push.ts` - pushberichten. Toestemming wordt gevraagd via de knop onder
  Meer -> Meldingen en **nooit bij de eerste start**; op iOS krijg je maar één
  kans.
- `src/scanKind.ts` - welk soort code er gescand is. De app heeft één camera en
  vier soorten QR (ticket, uitnodiging, pas, fakbar), en de prefix zegt welke.
  Bewust geen menu vooraf: aan een deur weet je zelf wel wat je voorhoudt.
- `src/deviceCalendar.ts` - een evenement in de agenda van de telefoon zetten.
  Er wordt **niets gelezen**; de module maakt één afspraak wanneer je erom
  vraagt. Dat is iets anders dan de ICS-feed op de site, die je op alles
  abonneert.
- `src/markdown.ts` - Markdown naar platte tekst, voor waar opmaak niet past (de
  notitie bij een agenda-afspraak).
- `src/savePhoto.ts` - een foto bewaren in de fotobibliotheek of delen via het
  systeemvenster. Haalt het origineel op en niet wat er op het scherm staat.
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
| de prefixen in `src/scanKind.ts` | `apps/web/lib/ticketing/crypto.ts` + `apps/web/lib/app-api/tokens.ts` |
| `src/theme/tokens.ts` | `apps/web/app/design/vtk-base.css` (`:root`) |
| `src/api/client.ts` | `vtk-scanner-app/src/api/client.ts` |

## Expo SDK 54, niet 57

Bewust gelijk aan vtk-scanner-app: een toolchain voor beide VTK-apps, en die is
daar al door de EAS-bouwproblemen heen (de `react-dom`-pin, het wegvallen van
`@react-native-cookies/cookies`, `platforms: ["ios","android"]` voor
`eas update`). Upgraden is prima, maar doe het dan voor allebei tegelijk en als
een eigen taak, niet en passant.
