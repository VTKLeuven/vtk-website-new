# Uitvoeringsplan: van prototype naar vervanger van vtk.be

> **Tijdelijk document.** Dit is een uitvoeringsplan, geen naslagwerk. Verwijder
> het wanneer alle werkstromen gemerged zijn; wat blijvend is, verhuist naar
> `docs/design-decisions.md` of `CLAUDE.md`.

Basis: de audit van 2026-08-08 tegen de live site. Punt 1 (migratie van de 59 NL
en 60 EN infopagina's) en punt 14 (bekende SSO-bugs) zitten **niet** in dit plan;
die zijn apart ingepland.

## Vastgelegde keuzes

Beslist door Maxime op 2026-08-08, voor de uitvoering begon:

- **Alles op één branch**: `site-modernisering`. Niet op `main` committen en niet
  pushen; de acht werkstromen worden in één keer nagekeken en gemerged.
- **Statistieken**: Plausible, **self-hosted**, mee in `infra/docker-compose.yml`
  naast Immich. Geen data bij derden, dus geen extra verwerker in het register.
- **Contactformulier**: alles naar `info@vtk.be`, één bestemming. Geen routering
  per onderwerp en geen adressentabel.

## Werkstromen

| ID | Onderwerp | Auditpunt |
|---|---|---|
| WS-0 | Fundament: taal per locale, SEO-helper, sitemap, robots | 4, 3a |
| WS-1 | Redirects van de oude vtk.be-URL's | 2 |
| WS-2 | `generateMetadata` op elke publieke route | 3b |
| WS-3 | Chrome: uitleendienst in de navigatie, footer, 404-pagina | 6, 8, 9 |
| WS-4 | `next/image` overal, plus een lintregel die het bewaakt | 11 |
| WS-5 | Zoeken over infopagina's en evenementen | 7 |
| WS-6 | Contactformulier | 10 |
| WS-7 | Bezoekersstatistieken | 12 |

## Volgorde en waarom

WS-0 levert `apps/web/lib/seo.ts`; WS-2 gebruikt dat op 40+ bestanden. WS-0 moet
dus eerst af zijn. De rest is opgedeeld op **bestandseigendom**, niet op thema:
twee agents die tegelijk `next.config.ts` of `Footer.tsx` aanraken, leveren een
merge-conflict op dat duurder is dan het parallellisme oplevert.

```
Golf 1:  WS-0                          (alleen, blokkeert WS-2)
Golf 2:  WS-1 | WS-2 | WS-3            (parallel, eigen worktree)
Golf 3:  WS-4 | WS-5 | WS-6 | WS-7     (parallel, eigen worktree)
Golf 4:  integratie, verify, browsercheck, docs
```

WS-4 zit in golf 3 en niet in golf 2 omdat het `next.config.ts` deelt met WS-1.

### Bestandseigendom

Eén werkstroom per bestand. Raakt je opdracht een bestand dat hier aan iemand
anders toegewezen is, wijzig het niet maar meld het.

| Bestand | Eigenaar |
|---|---|
| `apps/web/app/layout.tsx` | WS-0 (WS-7 voegt later één script toe) |
| `apps/web/lib/seo.ts`, `app/sitemap.ts`, `app/robots.ts` | WS-0 |
| `apps/web/next.config.ts` → `redirects()` | WS-1 |
| `apps/web/next.config.ts` → `images` | WS-4 |
| `apps/web/app/[locale]/**/page.tsx` (publiek) | WS-2 |
| `apps/web/components/site/Footer.tsx` | WS-3 |
| `packages/db/src/groups.ts` + migratie | WS-3 |
| `apps/web/components/site/Header.tsx` | WS-5 |
| `packages/i18n/src/messages/*.json` | iedereen, **alleen toevoegen** |

De i18n-bestanden zijn de enige gedeelde: voeg sleutels toe onder een eigen
namespace (`search.*`, `contact.*`, `notFound.*`), hernoem of herschik niets.

---

## WS-0 Fundament

**Taal per locale.** `apps/web/app/layout.tsx:49` zet `lang="nl"` hardcoded, ook
op `/en`. De root layout staat boven `[locale]` en kent de params niet, maar
`proxy.ts:176` zet al een `x-pathname`-header met het locale-voorvoegsel erin.
Lees die met `headers()` en leid de taal eruit af. Geen wijziging aan `proxy.ts`
nodig. Gebruik `nl-BE` en `en`, niet kaal `nl`.

**SEO-helper** `apps/web/lib/seo.ts`, met een `buildMetadata()` die per pagina
titel, beschrijving, canonical, hreflang-alternates (nl + en + x-default) en
OG/Twitter-velden zet. Zet `metadataBase` op de publieke URL uit de omgeving.

Let op een bestaand probleem dat hier opgelost hoort te worden: NL leeft op de
root (`/kalender`) maar `/nl/kalender` rendert **dezelfde pagina**, want
`proxy.ts` doet daar een `next()` en geen redirect. Zonder canonical is dat
duplicate content over de hele site. De canonical wijst altijd naar de
**voorvoegselloze** NL-URL en naar `/en/...` voor Engels.

**`app/robots.ts`**: `/admin`, `/scan`, `/api`, `/onboarding`, `/inloggen`,
`/account` en `/tickets/bestelling` op disallow; verwijs naar de sitemap.

**`app/sitemap.ts`**: gepubliceerde `Page`-rijen (beide URL-vormen bestaan, neem
de canonieke), de headercategorieën, publieke kalenderevenementen, en de vaste
routes. `lastModified` uit `contentEditedAt`, met `updatedAt` als terugval. Zet
de query-logica in een pure `buildSitemapEntries()` zodat ze testbaar is zonder
database.

**Standaard OG-afbeelding**: één `opengraph-image` op app-niveau volstaat als
basis; per-pagina beelden komen in WS-2 waar er een echte foto is.

**Tests** `test/seo.test.ts` en `test/sitemap.test.ts`: canonical zonder
`/nl`-voorvoegsel, hreflang-paar compleet, titelsjabloon, beschrijving afgekapt
op een redelijke lengte, en `buildSitemapEntries` die concepten weglaat.

**Commits**: "SEO: taal per locale op het html-element", "SEO: canonicals,
sitemap en robots".

---

## WS-1 Redirects van de oude vtk.be-URL's

De oude site gebruikt `/nl/page/<slug>/`, `/nl/category/<Categorie>/`,
`/nl/calendar/`, `/nl/contact/`, `/nl/privacy/`, `/nl/shift/`,
`/nl/registration-shift/`, `/nl/corporate/` en `/nl/cudi/...`, telkens met
afsluitende slash en met een `/en/`-tegenhanger.

Zet de map in een pure `apps/web/lib/legacyRedirects.ts` en laat `redirects()`
in `next.config.ts` die enkel uitrollen. Zo is ze testbaar; een map in de config
is dat niet.

- `/{nl,en}/page/:slug` → `/p/:slug` respectievelijk `/en/p/:slug`. De slugs
  blijven gelijk, dus dit is één patroon en geen tabel van 59 regels.
- `/{nl,en}/category/:cat` → de headertab: Aanbod→`/info`, Career→`/career`,
  Cursusdienst→`/cursusdienst`, Eerstejaars→`/eerstejaars`,
  Internationaal→`/internationaal`, Media→`/media`, Over-VTK→`/over-vtk`,
  Studies→`/studies`. Hoofdlettergevoelig in de bron, dus vang beide vormen.
- `/{nl,en}/calendar` en `/calendar/view/:rest` → `/kalender`.
- `/{nl,en}/registration-shift` → `/shift`; `/corporate` → `career.vtk.be`;
  `/cudi/...` → de overeenkomstige `cudi.vtk.be`-pagina.
- Alles permanent (308), behalve waar je twijfelt over de bestemming: liever
  tijdelijk dan een 308 die je een jaar lang niet meer terugdraait.

Let op dat `/nl/privacy/` en `/nl/shift/` naar `/privacy` en `/shift` moeten,
niet naar zichzelf: het `/nl`-voorvoegsel moet eraf, anders houd je de duplicate
content uit WS-0 in stand.

**Tests** `test/legacyRedirects.test.ts`: geen dubbele bronpatronen, elke bron
begint met `/nl` of `/en`, elke bestemming is voorvoegselloos-NL of `/en/...` of
een externe URL, en de acht categorieën uit de echte navigatie hebben alle acht
een regel.

**Commit**: "SEO: oude vtk.be-adressen doorverwijzen naar de nieuwe site".

---

## WS-2 Metadata per pagina

Geen enkele van de 81 `page.tsx`-bestanden heeft nu metadata. Doe de **publieke**
routes; `/admin` en `/scan` krijgen `robots: { index: false }` via hun layout en
verder niets.

Prioriteit, want dit is waar gedeelde links terechtkomen: `/` (home),
`/p/[slug]` en `/[headerSlug]/[pageSlug]` (uit de pagina zelf: titel, excerpt,
en de eerste afbeelding als OG), `/kalender/[slugOrId]` (evenement met datum en
foto), `/tickets/[slug]`, `/media` en `/media/[albumSlug]`, `/praesidium`,
`/werkgroepen`, `/pocs`, `/theokot`, `/shift`, `/piano`, `/info` en de andere
categoriepagina's.

Alles loopt via `buildMetadata()` uit WS-0. Schrijf geen losse `export const
metadata` met een handgeschreven titel; dan lopen canonical en hreflang alsnog
uiteen.

Voor dynamische routes: haal de metadata uit dezelfde query als de pagina zelf.
Next dedupliceert die binnen één render, dus dat kost geen tweede databasecall.

**Tests**: één `test/pageMetadata.test.ts` op de pure afleidingen (excerpt naar
beschrijving, terugval op de NL-titel wanneer EN ontbreekt, OG-afbeelding
terugvallen op de standaard). De wiring per route controleer je in de browser,
niet met een unittest per bestand.

**Commits**: opsplitsen per groep routes, bijvoorbeeld "SEO: metadata op de
inhouds- en categoriepagina's" en "SEO: metadata op kalender, tickets en media".

---

## WS-3 Navigatie, footer en 404

**Uitleendienst.** `apps/logistiek` is een volledige app maar nergens gelinkt
vanaf de hoofdsite. Voeg ze toe aan de Info-tab in `HEADER_TABS`
(`packages/db/src/groups.ts`), naast Kalender en Piano, plus een footerlink.
Omdat headertabs uit de database komen, hoort daar een migratie of een
seed-upsert bij; een wijziging in `groups.ts` alleen raakt een bestaande
installatie niet.

**404.** Er is geen enkele `not-found.tsx`. Maak er een op `app/[locale]` in
VTK-stijl: de donkere `.vtk-page-head`-band, een korte uitleg en wegen terug
(home, Info, kalender, zoeken). Zeker de moeite nu WS-1 veel oud verkeer
binnenhaalt waarvan een deel op een nog niet gemigreerde pagina landt. Voeg ook
een `app/not-found.tsx` toe voor het geval buiten `[locale]`.

**Footer.** YouTube en TikTok ontbreken naast de bestaande Instagram, Facebook
en LinkedIn. Voeg ook de bevriende kringen toe die op de oude homepage staan
(BEST, Biomedix, Chemix, Existenz, Mechanix, Revue, Statix); die staan al als
werkgroep in `WERKGROEP_SEEDS`, dus link naar `/werkgroepen` en niet naar een
tweede handgeschreven lijst.

**Tests**: een test dat `HEADER_TABS` de uitleendienstlink bevat en dat geen
enkele tab-link naar een leeg pad wijst. De 404 en de footer controleer je
visueel.

**Commits**: "Navigatie: uitleendienst in het menu en de footer", "Een
404-pagina in de huisstijl", "Footer: YouTube, TikTok en de bevriende kringen".

---

## WS-4 next/image

Vijftien bestanden gebruiken een kale `<img>`, vier gebruiken `next/image`. Zet
ze om waar het kan en zet dan de lintregel aan die het bewaakt, anders staat de
volgende `<img>` er binnen de maand weer.

Niet alles kan om, en dat is geen falen:

- `AvatarCropField.tsx` en `TicketDesignManager.tsx` werken met blob- en
  data-URL's uit een lopende bewerking; die horen `<img>` te blijven.
- `AlbumViewer.tsx`, `FaceSearchPanel.tsx` en `AlbumGrid.tsx` halen beelden via
  de Immich-proxy. Die kunnen wel om, maar hebben `images.remotePatterns` nodig
  in `next.config.ts` (dit is de enige werkstroom die dat bestand aanraakt) en
  `sizes` die klopt, anders laadt de galerij zwaarder dan nu.
- Zet `priority` op de hero en op niets anders.

Zet `@next/next/no-img-element` aan in `eslint.config.mjs` met een gerichte
uitzondering voor de bestanden hierboven, en zet er een korte comment bij waarom.

**Test**: de lintregel *is* de test. `npm run lint` moet groen zijn, met de
uitzonderingen expliciet.

**Commit**: "Afbeeldingen via next/image, met een lintregel die het bewaakt".

---

## WS-5 Zoeken

De grootste van de acht. Met straks zestig infopagina's onder elf tabs is dit
het verschil tussen vindbaar en begraven.

Zoek over `Page` (titel, excerpt, markdown-inhoud, NL en EN) en `CalendarEvent`
(titel, beschrijving). Gebruik Postgres full-text: een `tsvector`-kolom met een
GIN-index, bijgewerkt via een trigger of een generated column, in een echte
migratie. Geen `LIKE '%...%'` over de hele tabel.

- Respecteer publicatiestatus en, voor evenementen, de zichtbaarheid: een
  concept of een intern evenement mag nooit in de resultaten opduiken, ook niet
  als fragment.
- Gebruik `websearch_to_tsquery` en geef de ruwe invoer nooit rechtstreeks aan
  `to_tsquery` door.
- Zoeken in het Nederlands en het Engels; kies de configuratie op basis van de
  actieve locale.
- Een `/zoeken`-route met de resultaten, plus een zoekveld in de header. Denk aan
  het smalle scherm: onder 1181px is de header al een menuknop, dus het zoekveld
  hoort daar in het paneel en niet naast de knop.
- Toon een fragment met de gevonden term gemarkeerd (`ts_headline`), en zeg bij
  nul resultaten wat de gebruiker nog kan proberen.

**Tests** `test/search.test.ts` op het pure deel: invoer opschonen, lege en
absurd lange query's, fragmentopbouw, volgorde bij gelijke rang. Plus
`test/integration/search.integration.ts` tegen een echte database, die vooral
bewijst dat een concept en een intern evenement **niet** terugkomen. Dat laatste
is de test die ertoe doet.

**Commit**: "Zoeken over infopagina's en evenementen".

---

## WS-6 Contactformulier

Nu staat er enkel `mailto:info@vtk.be`. Bouw een formulier op de contactpagina:
naam, e-mail, onderwerp, bericht. Alles gaat naar **`info@vtk.be`**; geen
routering per onderwerp, geen adressentabel.

- Volg de conventies uit `CLAUDE.md`: `SaveForm`, een server action die
  `SaveState` teruggeeft via `saveOk()`/`saveError(code)`, verwachte
  invoerfouten teruggeven en niet gooien, en een toast met een melding die zegt
  wát er misging.
- Verstuur met `sendMail` uit `apps/web/lib/mail.ts`. Zet `replyTo` op het adres
  van de afzender, anders kan niemand antwoorden. Let op: `MAIL_FROM` staat nu
  standaard op `Theokot VTK <theokot@vtk.be>`; voor contactmail hoort daar een
  eigen afzender.
- Spam: een honeypot-veld dat bij invulling stil succes teruggeeft, plus een
  eenvoudige limiet per IP. Geen captcha.
- Bevestig aan de verzender op het scherm; stuur geen automatische
  bevestigingsmail (dat maakt van het formulier een spamversterker).
- Log de inhoud niet in Sentry.

**Tests** `test/contactForm.test.ts`: validatie, de honeypot die stil slaagt, de
maximale berichtlengte, en het venster van de snelheidslimiet.

**Commit**: "Contactformulier op de contactpagina".

---

## WS-7 Bezoekersstatistieken

Er is nu enkel Sentry voor fouten. Het wordt **Plausible, self-hosted**: cookieloos,
en omdat het op onze eigen infrastructuur draait komt er geen verwerker bij.

- Voeg de Plausible-container toe aan `infra/docker-compose.yml`, in dezelfde
  stijl als de bestaande diensten daar (eigen volume, healthcheck, en netjes
  uitgeschakeld wanneer de omgevingsvariabelen leeg zijn, zoals de workers dat
  doen).
- Laad het script pas volgens de bestaande keuze in `lib/cookie-consent.ts`.
  Zelfs bij een cookieloze aanbieder is dat de veiligste vorm, en het scherm
  bestaat al.
- Geen persoonsgegevens in de events; meet paginaweergaves, niet gebruikers.
- Sluit `/admin`, `/scan` en de ticketbestelpagina's uit.
- Noteer de aanbieder in `docs/privacy-processors.md`, anders klopt het
  verwerkingsregister uit de audit niet meer.

**Test** `test/analytics.test.ts`: geen script zonder toestemming, wel met.

**Commit**: "Bezoekersstatistieken, enkel na toestemming".

---

## Werkafspraken voor elke werkstroom

1. **Lees eerst `AGENTS.md` en `CLAUDE.md`.** De schrijf- en UX-conventies zijn
   bindend: geen em-dashes, destructieve acties met een bevestigingsdialoog,
   opslaan meldt altijd zijn uitkomst, rij-acties zijn icoonknoppen.
2. **Next.js 16 wijkt af van wat je kent.** Lees de betrokken gids onder
   `node_modules/next/dist/docs/` voor je aan metadata, routing, layouts of
   afbeeldingen raakt. `middleware.ts` heet hier `proxy.ts`.
3. **`npm run verify` moet groen zijn voor je commit.** Dat is lockfile-check,
   typegen plus `tsc --noEmit`, eslint en de unittests van `@vtk/web`.
4. **Commit op `site-modernisering`, nooit op `main`, en push niet.** Controleer
   met `git branch --show-current` voor je commit. `git push` gebeurt alleen op
   expliciete vraag van Maxime.
5. **Geen nieuwe dependencies** tenzij het echt niet anders kan. Moet het toch,
   commit dan geen incrementeel bijgewerkte lockfile: regenereer met
   `rm -rf node_modules package-lock.json && npm install` (zie `AGENTS.md`).
6. **Commitboodschappen in het Nederlands**, in de stijl van de historiek:
   "Onderwerp: wat er verandert". Kleine, afgebakende commits.
7. **Kringkeuzes horen in `docs/design-decisions.md`.** Kies je iets dat niet
   puur technisch is (welke socials, hoe contactmail gerouteerd wordt, wat er in
   de zoekresultaten mag), schrijf het daar op.
8. **Raak geen bestand aan dat aan een andere werkstroom toegewezen is.** Meld
   het in plaats daarvan.
