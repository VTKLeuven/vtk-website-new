# Hero: de bouwtekening (handoff)

Stand van 29 oktober 2026. Het ontwerp is gekozen op een ontwerpbord; in de
code is er nog niets van gebouwd. Dit document is genoeg om in een nieuwe sessie
verder te gaan: wat gekozen is, wat afgewezen is, wat nog open staat, hoe je het
bouwt, en de exacte geometrie en animatie uit het bord.

## Waar het ontwerp staat

- **Bord:** https://claude.ai/artifact/3LqSu6jULKf1GABVmUr3uZ (versie 5). Lees het
  met de Artifact-tool (`action: "read"`), niet met WebFetch. Kies daar
  **G1 Wegwijzer** in het kiesvak.
- **Lokale kopie:** `design/hero-bouwtekening.html`. Opent in een browser zonder
  internet; de hero werkt volledig, enkel de foto's in nieuws en evenementen zijn
  leeg. Het hele bord zit erin (ronde 1, ronde 2, de knoppen), dus ook de code
  van de afgewezen varianten.
- **Branch:** `hero-weg`. Daarop is de oude hero (Frontpage, heroWeek, slogans,
  `/admin/frontpage`, de hero-foto's) uit de repo gehaald, als **niet
  gecommitte wijzigingen** in de werkboom. Bouw daarop verder; zet niets daarvan
  terug.

## Stand na de vergelijking met het kasteel (29 oktober 2026, later)

- **De animatie van het logo is nieuw:** geen PNG-masker meer. Het logo is
  overgetrokken tot één vectorpad (`design/vtk-logo.svg`, 112 punten, in
  pixels van `vtk-logo.png`). De omtrek tekent zich (`pathLength="1"`, start
  0,3 s, 1,6 s lang) en de arcering veegt erachter binnen (start 0,6 s). Zet
  een punt om met `(330 + x * 520/1152, 96 + y * 520/1152)`.
- **Gevraagd:** G1 als echte hero bouwen en naar main pushen, samen met het
  weghalen van de oude hero (nog niet gecommit; alles in de werkboom hoort
  daarbij, ook de migratie `20261029160000_remove_homepage_hero` en de
  commentaarwijzigingen in `mobile/`, dus na de push een EAS Update).
- **Keuzes voor de bouw:** bestemmingen vast in de code (open vraag 3), de
  standaardstand rechts, de evenementen direct onder het nieuws. Telefoon onder
  760 px. De labels krijgen een vaste breedte (21% van de box) en hun
  onderregel mag op twee regels breken, met lettergroottes in `cqi`: anders
  steekt "Cursussen, boeken en de printer" tussen 700 en 950 px buiten beeld.
  Zonder nieuws raakt de hero de evenementen met een strakke naad.
- Het kasteel (`design/arenberg-gevel.svg`, foto `arenberg-gevel-foto.png`)
  is voor later; de vergelijking staat op
  https://claude.ai/artifact/KUpB8KGVmM8UicW73NhsQH.

## Wat gekozen is: G1, Wegwijzer

Het logo van VTK als technische tekening op een navy band, met zes leiders naar
delen van de site.

- **De tekening** (dit vond de gebruiker het sterkst, samen met de animatie): het
  logo als doorsnede met arcering (45 graden), een witte omtrek, gestippelde
  hulplijnen, een gestippelde constructiecirkel, een grote dunne cirkel, een
  diagonaal en knooppunten op de hoeken van het logo.
- **De animatie**: hulplijnen faden in, de grote cirkel en de diagonaal tekenen
  zich, het gearceerde logo veegt van links naar rechts binnen, dan de
  knooppunten, de maatlijn, de leiders (die zich tekenen) en tot slot de labels.
  Samen ongeveer 2,5 seconden.
- **Maatlijn** boven het logo, van de linker- tot de rechterrand, met
  `VLAAMSE TECHNISCHE KRING` in mono in de opening van de lijn.
- **Zes leiders**, links drie en rechts drie. Elk label: de naam (wit, 21px,
  semibold, met een dunne lijn eronder zoals `.u-dark`, zodat het als link leest),
  daaronder één regel in `--on-dark-muted`. Bij hover wordt de lijn geel en
  verschijnt een pijltje.
  - Links: Kalender, Tickets, Broodjes.
  - Rechts: Cursusdienst, Shiften, Career. **Career hangt aan de
    rechteronderhoek van het logo, op de hoogte van Broodjes** (zo gevraagd); daar
    staat een extra knooppunt.
- **Geen** titelhoek, geen statuslabels, geen icoontjes, geen geel in de labels.
- **Zichtbare kop:** geen; de hero heeft een verborgen `h1` "Vlaamse Technische
  Kring". De naam staat zichtbaar op de maatlijn.
- **Telefoon:** de tekening bovenaan (leiders, labels en maattekst weg), daaronder
  de zes als lijst met haarlijnen en een pijltje.

**Daarbij gevraagd:** de band **Aankomende evenementen** komt direct onder
**Nieuws**, zodat ze ook bovenaan staat. Volgorde wordt: hero, Nieuws,
Aankomende evenementen, Openingsuren, POC's, Shiften, Aftermovies, Wat we doen,
VTK Career, Hoofdpartners.

## Wat afgewezen is (breng het niet terug)

- Alles van de oude hero: de Arenberg-foto, slogans, "De thuis voor ingenieurs in
  Leuven.", het regeltje "Vlaamse Technische Kring · KU Leuven" met stipje, de
  ondertitel over events, cursussen en broodjes, de knoppen "Ontdek wat we doen" en
  "Eerstejaars? Start hier", een weekagenda naast de tekst, open shiften in de
  hero, de aftelklok. Zie ook het geheugen `hero-iets-totaal-nieuws`.
- Labels met een **status** rond de tekening (openingsuren, tickets, shiften) en
  de **titelhoek** rechtsonder (G uit ronde 1). Die status staat al in de banden
  eronder.
- **Gele namen en icoontjes** bij de labels: gebouwd en meteen teruggedraaid op
  vraag van de gebruiker ("doe het geel en de icoontjes maar terug weg").
- De andere varianten van ronde 2 (G2 maatlijn als titel, G3 zoeken, G4 één
  aantekening, G5 enkel het logo) en de zeven andere richtingen van ronde 1.

## Open vragen (stel ze voor je ze zelf invult)

1. **Rechterkant.** Standaard staat Career rechtsonder en staan Cursusdienst en
   Shiften op y 108 en 220, dus hoger dan Kalender en Tickets links (140 en 249).
   Het bord heeft een knop "Gespiegeld met links" die ze op 140 en 249 zet. De
   gebruiker koos nog niet; bouw de standaard tenzij ze iets anders zeggen.
2. **Evenementen onder Nieuws: kleur.** Nieuws en Evenementen zijn allebei
   `--paper-2`. De code zet daar vandaag al een paper-gat tussen: `.events-band`
   heeft zelf `margin-top: clamp(84px, 10vw, 120px)` in `vtk-home.css`, en die
   valt enkel weg na een `.band` of `.hours-strip` (`.news-band` is geen van
   beide). In het bord is dat de stand "Lichtblauw, paper ertussen". Alternatief is de
   evenementenband op `--paper`. Niet gekozen; de standaard is wat de code al doet.
3. **De zes bestemmingen.** Vast in de code, of beheerbaar in `/admin/home`? Het
   bord noemde `/admin/home`, maar dat is niet bevestigd.

## Bouwen in de code

### De hero

- Een servercomponent, bv. `apps/web/components/editorial/BlueprintHero.tsx`,
  bovenaan in `HomeEditorial.tsx` (boven `<NewsBand>`, dat nu als eerste staat).
  **Geen client-JS nodig:** de animatie is pure CSS met keyframes. Dat houdt de
  homepage licht (zie `docs/performance.md`).
- CSS in een eigen bestand, bv. `apps/web/app/design/vtk-hero.css`, geïmporteerd
  door `HomeEditorial` (zoals `vtk-home.css`). `vtk-frontpage.css` is weg; zet het
  niet terug.
- **Band:** volle breedte navy zoals `.vtk-page-head` en `.hours-strip`: een
  `::before` met `--navy` die tot de schermrand loopt met
  `calc(50% - calc(50 * var(--vtk-vw, 1vw)))` (nooit kaal `50vw`, door de zoom
  van 0,9 op laptops), een `::after` met `technisch-pattern.svg` op
  `opacity: .16` (de helft van een paginakop, zodat het patroon niet concurreert
  met de tekening) en een eigen uitsnede, en de gele streep van 5px onderaan
  (`box-shadow: inset 0 -5px 0 var(--yellow)`).
- **Kleuren** enkel via de tokens uit `vtk-base.css`. In het bord staan er twee
  losse waarden die je vervangt: `#fff` voor de lijnen (wordt `var(--paper)` of
  `currentColor`) en `#0e1a36` voor de opening in de maatlijn (wordt
  `var(--navy)`).
- **Links** uit `@/components/ui/Link`, nooit `next/link`. Cursusdienst en Career
  zijn externe adressen (`https://cudi.vtk.be`, `https://career.vtk.be`); laat ze
  lopen via `isExternalUrl` uit `lib/href.ts`, zoals de header doet.
- **Bestemmingen:** Kalender `/kalender`, Tickets `/tickets`, Broodjes `/theokot`,
  Cursusdienst `https://cudi.vtk.be`, Shiften `/shift`, Career
  `https://career.vtk.be`. Met taalprefix `/en` in het Engels voor de interne.
- **Toegankelijkheid:** SVG `aria-hidden`, verborgen `h1`, de labels zijn echte
  links, focus zichtbaar. De telefoonlijst is dezelfde set links; laat op elke
  breedte maar één van de twee bereikbaar zijn (de andere `display: none`), anders
  hoort een screenreader alles twee keer.
- **Beweging:** alles in `@media (prefers-reduced-motion: no-preference)`, met de
  begintoestand binnen die query, zodat zonder beweging de tekening meteen
  volledig staat. Gewone keyframes, geen `animation-timeline: view()`: de hero
  staat bij het laden al in beeld (zelfde reden als de paginakop in
  `vtk-base.css`). Let op: de regel "animeer enkel `opacity` en `transform`" in
  CLAUDE.md gaat over de leesbeweging van inhoudspagina's; hier tekenen de lijnen
  met `stroke-dashoffset` en veegt het logo binnen met `clip-path`. Dat is één
  keer bij het laden, op één SVG. Vermeld het als je het in design-decisions
  vastlegt.
- **Logo:** het bord gebruikt `public/vtk-logo.png` (1152 x 650, grijs op
  transparant) twee keer: als masker voor de arcering en met een SVG-filter
  (`feMorphology` dilate min het origineel) als omtrek. Er is geen vector van het
  logo in de repo. Werkt goed tot ruim 600px breed; een SVG-pad van het logo zou
  scherper zijn, maar is niet nodig.
- **Breekpunt telefoon:** in het bord 700px op de breedte van de pagina. Kies in de
  code wat bij de site past (de paginaplaat wisselt op 760px).
- **Talen:** NL en EN, via `pick` of een tekst per locale vanuit de server. Geen
  `getDictionary` in een clientcomponent (is hier ook niet nodig).

### Evenementen onder Nieuws

- In `HomeEditorial.tsx` staat de `<section className="section band events-band">`
  nu na `<OpeningHoursBand>`. Verplaats ze naar direct na `<NewsBand>`.
- Bandenritme daarna: Nieuws (`--paper-2`), Evenementen (`--paper-2`),
  Openingsuren (navy), POC's (navy), Shiften (`--paper-2`), Aftermovies (navy).
  - Nieuws + Evenementen: zelfde kleur, maar de eigen bovenmarge van
    `.events-band` geeft al een paper-gat (open vraag 2). Kijk het na in de
    browser.
  - Openingsuren + POC's: twee keer navy. `.hours-strip + .poc-band` staat al in
    de regel in `vtk-home.css` die dan het paper-gat terugzet; ook
    `.hours-strip + .aftermovie-band` (zonder POC's en shiften).
  - Zonder nieuws (uitgezet in `/admin/nieuws`): hero (navy) + Evenementen
    (`--paper-2`). Zonder evenementen: Nieuws + Openingsuren, zoals vandaag.
- Pas de opsomming bij "Band rhythm" in `CLAUDE.md` aan (daar staat de volgorde en
  het waarom) en de sectie "Homepage-secties & bandenritme" in
  `docs/design-decisions.md`.

### Documentatie die erbij hoort

- `docs/design-decisions.md`: een sectie over de hero (waarom een tekening en geen
  foto of slogan, waarom de labels naar delen van de site wijzen en niet naar een
  status, wat afgewezen is) en de nieuwe plaats van de evenementen.
- `CLAUDE.md`, Styling Guidelines: een korte regel over de hero, in de stijl van
  de andere (wat het is, wat je niet terugzet).

### Werkwijze in deze repo

- Commits zonder `Co-Authored-By` of vermelding van Claude. Stage enkel je eigen
  wijzigingen; de werkboom bevat het weghalen van de oude hero (zie het geheugen
  `commit-beside-parallel-wip`).
- Geen em-dashes in code, comments, UI-tekst of commits.
- `npm run verify` draait voor elke push (typecheck, eslint, unit tests).
- Wil je het visueel nakijken: zie het geheugen `admin-visual-check-without-login`
  (Playwright met `channel: "chrome"`; een `clip` onder de vouw vraagt
  `fullPage: true`).

## Teksten

| Label | NL | NL regel eronder | EN | EN regel eronder |
| --- | --- | --- | --- | --- |
| Kalender | Kalender | Alles wat er gepland staat | Calendar | Everything that is planned |
| Tickets | Tickets | Lopende verkopen | Tickets | Sales that are open |
| Broodjes | Broodjes | Bestellen bij de Theokot | Sandwiches | Order at the Theokot |
| Cursusdienst | Cursusdienst | Cursussen, boeken en de printer | Course Shop | Courses, books and the printer |
| Shiften | Shiften | Help mee achter de bar | Shifts | Help out behind the bar |
| Career | Career | Bedrijven, talks en de Jobfair | Career | Companies, talks and the Job fair |

Maatlijn: `VLAAMSE TECHNISCHE KRING` in beide talen. Verborgen `h1`: "Vlaamse
Technische Kring". De Engelse teksten zijn een voorstel; laat ze nakijken.

## Geometrie (exact uit het bord)

- `viewBox="0 0 1168 520"`: de inhoudsbreedte van `--max` (1240) min 2 x 36
  padding. De box heeft `aspect-ratio: 1168 / 520`; labels staan er in procenten
  op, zodat ze met de tekening meeschalen.
- Logo: `x=330 y=96 width=520 height=293.4`, schaal `s = 520 / 1152`. Een punt in
  logopixels `(lx, ly)` ligt op `(330 + lx * s, 96 + ly * s)`.
- Knooppunten (logopixels): notch (210,178), left (0,338), lbot (0,650), ttop
  (590,40), ktop (912,2), karm (1150,175), kfoot (1152,398), bowl (660,650), en
  voor Career rbot (1152,650) = (850, 389.4).
- Labels links: rechterrand op x 262 (`right: 77.57%`). Rechts: linkerrand op x
  906 (`left: 77.57%`). `top` is `y / 520`, met `translateY(-50%)`.
- Leiders (standaardstand):

| Label | Van | Via | Naar |
| --- | --- | --- | --- |
| Kalender | notch | (380,140) | (272,140) |
| Tickets | left (330,248.6) | | (272,248.6) |
| Broodjes | lbot (330,389.4) | | (272,389.4) |
| Cursusdienst | ktop (741.7,96.9) | (790,108) | (896,108) |
| Shiften | karm (849.1,175) | (872,220) | (896,220) |
| Career | rbot (850,389.4) | | (896,389.4) |

  Gespiegeld: Cursusdienst via (790,140) naar (896,140); Shiften van kfoot
  (850,275.7) via (872,248.6) naar (896,248.6).
- Maatlijn: hulplijnen op x 330 en 850 van y 52 tot 88, de lijn op y 62 van 334
  tot 846 met pijlpunten aan beide kanten, een navy opening van 236 breed rond x
  590, tekst in mono 11px met `letter-spacing: .14em` op y 66.

## Animatie (exact uit het bord)

| Stap | Wat | Start | Duur |
| --- | --- | --- | --- |
| 1 | Hulplijnen en constructiecirkel faden in | 0,05 s | 0,7 s |
| 2 | Grote cirkel tekent zich | 0,15 s | 1,1 s |
| 3 | Diagonaal tekent zich | 0,3 s | 1,1 s |
| 4 | Gearceerd logo met omtrek veegt binnen (`clip-path`) | 0,35 s | 1,3 s |
| 5 | Knooppunten faden in | 1,0 s + 0,05 s per punt | 0,7 s |
| 6 | Maatlijn fadet in | 1,1 s | 0,7 s |
| 7 | Leiders tekenen zich | 1,2 s + 0,12 s per leider | 1,1 s |
| 8 | Labels komen omhoog | 1,5 s + 0,12 s per label | 0,52 s |

Lijnen die zich tekenen hebben `pathLength="1"`, `stroke-dasharray: 1` en
`stroke-dashoffset: 1` naar 0, en geen `vector-effect: non-scaling-stroke` (dat
breekt de dash-truc). De statische lijnen hebben dat wel, zodat ze op elke
breedte 1px blijven.

## Code uit het bord

Ter referentie; vertaal naar een servercomponent en tokens, niet letterlijk
overnemen. `IMG.logo` is `/vtk-logo.png`; `ic('arrow', 16)` is een pijl uit
`components/ui/icons.tsx` (er is daar nog geen pijl naar rechts; voeg er een toe
in dezelfde lijnstijl).

### CSS: de band

```css
.navyband { position: relative; isolation: isolate; background: var(--navy); color: var(--paper); }
.navyband::after {
  content: ""; position: absolute; inset: 0; z-index: -1; pointer-events: none;
  background-image: var(--pattern); background-size: 880px 880px; background-repeat: repeat;
  background-position: var(--crop, calc(50% + 340px) -160px); opacity: .34;
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 56px, #000 calc(100% - 40px), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 56px, #000 calc(100% - 40px), transparent 100%);
}
.navyband.rule { box-shadow: inset 0 -5px 0 var(--yellow); }
```

### CSS: de tekening en de labels

```css
/* ---------- G · Bouwtekening ---------- */
.hG { --crop: calc(50% + 900px) -900px; }
.hG .wrap { padding-top: 34px; padding-bottom: 40px; }
.hG .navyband::after, .hG::after { opacity: .16; }
.g-box { position: relative; aspect-ratio: var(--ar, 1168 / 520); }
.g-box > svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.g-ln { fill: none; stroke: #fff; stroke-width: 1; vector-effect: non-scaling-stroke; }
.g-ln.faint { stroke-opacity: .22; }
.g-ln.dash { stroke-opacity: .32; stroke-dasharray: 6 5; }
.g-ln.lead { stroke-opacity: .7; }
.g-ln.dim { stroke-opacity: .6; }
.g-node { fill: var(--navy); stroke: #fff; stroke-width: 1.2; vector-effect: non-scaling-stroke; }
.g-node.hot { fill: var(--yellow); stroke: var(--yellow); }
.g-dimtext { fill: var(--on-dark-muted); font-family: var(--mono); font-size: 11px; letter-spacing: .14em; }
.g-lab { position: absolute; transform: translateY(-50%); display: grid; gap: 2px; min-width: 0; }
.g-lab.l { text-align: right; justify-items: end; }
.g-lab i { font-style: normal; font-family: var(--mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--on-dark-muted); }
.g-lab b { display: inline-flex; align-items: center; gap: 8px; font-size: 17px; font-weight: 600; color: var(--paper); letter-spacing: -0.01em; white-space: nowrap; }
.g-lab:hover b { color: var(--yellow); }

.g-list, .g-tb.m { display: none; }
.g-draw { vector-effect: none; stroke-width: 1.2; }
@media (prefers-reduced-motion: no-preference) {
  .g-draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw-line 1100ms cubic-bezier(.35,.6,.2,1) forwards; animation-delay: var(--d, 0s); }
  .g-fade { animation: fade 700ms ease both; animation-delay: var(--d, 0s); }
  .g-wipe { animation: wipe 1300ms cubic-bezier(.5,.1,.2,1) both; animation-delay: var(--d, 0s); }
  .g-lab, .g-tb { animation: rise 520ms cubic-bezier(.2,.7,.2,1) both; animation-delay: var(--d, 0s); }
  .g-lab { animation-name: g-rise; }
}
@keyframes g-rise { from { opacity: 0; transform: translateY(calc(-50% + 8px)); } }

/* Ronde 2: varianten rond dezelfde tekening */
.g-lab.nav { gap: 3px; }
.g-lab.nav b { font-size: 21px; letter-spacing: -0.015em; }
.g-lab.nav i { font-family: var(--sans); font-size: 13.5px; letter-spacing: 0; text-transform: none; }
.g-lab.nav .g-u { border-bottom: 1px solid rgba(255,255,255,.45); padding-bottom: 2px; transition: border-color 150ms ease; }
.g-lab.nav:hover .g-u { border-color: var(--yellow); }
.g-lab.nav b svg { opacity: 0; transition: opacity 150ms ease, translate 150ms ease; }
.g-lab.nav:hover b svg { opacity: 1; translate: 3px 0; }
.g-list.nav li a { grid-template-columns: minmax(0, 1fr) 16px; }
.g-list.nav b { display: block; }
.g-list.nav i { display: block; margin-top: 2px; font-family: var(--sans); font-size: 13px; letter-spacing: 0; text-transform: none; }
.g-list.nav svg { color: var(--on-dark-muted); }
.g2-title { position: absolute; left: 28.25%; width: 44.52%; top: 12.6%; margin: 0; text-align: center; font-size: 40px; line-height: 1; font-weight: 600; letter-spacing: -0.03em; color: var(--paper); white-space: nowrap; }
.g2-link { position: absolute; right: 0; bottom: 4%; font-size: 14px; display: inline-flex; align-items: center; gap: 6px; }
.g2-m { display: none; }
.g3-search { display: grid; justify-items: center; gap: 14px; max-width: 700px; margin: 0 auto; }
.g3-field { width: 100%; display: flex; align-items: center; gap: 12px; height: 60px; padding: 0 9px 0 22px; border-radius: 999px; background: var(--surface); color: var(--ink); box-shadow: 0 18px 40px -22px rgba(0,0,0,.75); cursor: text; }
.g3-field:focus-within { box-shadow: 0 0 0 3px var(--yellow), 0 18px 40px -22px rgba(0,0,0,.75); }
.g3-field > svg { color: var(--muted); flex: none; }
.g3-field input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; font: 500 17px/1 var(--sans); color: var(--ink); }
.g3-field input::placeholder { color: var(--muted); }
.g3-field button { height: 44px; padding: 0 20px; border-radius: 999px; border: 0; background: var(--ink); color: var(--paper); font-weight: 600; cursor: pointer; }
.g3-sugg { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px; }
.g3-sugg .lbl { margin-right: 4px; font-family: var(--mono); font-size: 10.5px; letter-spacing: .14em; text-transform: uppercase; color: var(--on-dark-muted); }
.g3-sugg a { display: inline-flex; align-items: center; min-height: 34px; padding: 0 14px; border-radius: 999px; border: 1px solid rgba(255,255,255,.26); color: var(--paper); font-size: 13.5px; font-weight: 600; }
.g3-sugg a:hover { border-color: var(--paper); background: rgba(255,255,255,.06); }
.g4-note { position: absolute; left: 77.57%; top: 22.3%; width: 22.43%; display: grid; gap: 7px; }
.g4-note i { font-style: normal; font-family: var(--mono); font-size: 11px; letter-spacing: .14em; text-transform: uppercase; color: var(--on-dark-muted); }
.g4-note h2 { margin: 0; font-size: 27px; line-height: 1.1; font-weight: 600; letter-spacing: -0.02em; color: var(--paper); text-wrap: balance; }
.g4-note p { margin: 0; color: var(--on-dark-muted); font-size: 14.5px; line-height: 1.5; }
.g4-note a { margin-top: 4px; width: fit-content; display: inline-flex; align-items: center; gap: 6px; }
.g4-note.m { display: none; }
@media (prefers-reduced-motion: no-preference) {
  .g2-title, .g2-link, .g4-note, .g3-search { animation: rise 600ms cubic-bezier(.2,.7,.2,1) both; animation-delay: var(--d, 1.2s); }
}

.g-lab.nav { gap: 3px; }
.g-lab.nav b { font-size: 21px; letter-spacing: -0.015em; }
.g-lab.nav i { font-family: var(--sans); font-size: 13.5px; letter-spacing: 0; text-transform: none; }
.g-lab.nav .g-u { border-bottom: 1px solid rgba(255,255,255,.45); padding-bottom: 2px; transition: border-color 150ms ease; }
.g-lab.nav:hover .g-u { border-color: var(--yellow); }
.g-lab.nav b svg { opacity: 0; transition: opacity 150ms ease, translate 150ms ease; }
.g-lab.nav:hover b svg { opacity: 1; translate: 3px 0; }
.g-list.nav li a { grid-template-columns: minmax(0, 1fr) 16px; }
.g-list.nav b { display: block; }
.g-list.nav i { display: block; margin-top: 2px; font-family: var(--sans); font-size: 13px; letter-spacing: 0; text-transform: none; }
.g-list.nav svg { color: var(--on-dark-muted); }

@keyframes rise { from { opacity: 0; translate: 0 .6em; } }
@keyframes fade { from { opacity: 0; } }
@keyframes draw-line { to { stroke-dashoffset: 0; } }
@keyframes wipe { from { clip-path: inset(0 100% 0 0); } to { clip-path: inset(0 0 0 0); } }
@keyframes g-rise { from { opacity: 0; transform: translateY(calc(-50% + 8px)); } }
```

### CSS: telefoon (binnen `@container (max-width: 700px)` in het bord)

```css
  .hG .wrap { padding-top: 26px; padding-bottom: 30px; }
  .g-box { margin-inline: -8px; }
  .g-lab, .g-lead, .g-dimtext, .g-dimgrp { display: none; }
  .g-box .g-tb { display: none; }
  .g2-title, .g2-link, .g-box .g4-note { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .g2-m { display: block; }
  .g2-m.t { margin: 0 0 6px; font-size: 34px; line-height: 1.05; font-weight: 600; letter-spacing: -0.03em; color: var(--paper); }
  .g2-m.s { margin: 10px 0 0; font-family: var(--mono); font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--on-dark-muted); }
  .g4-note.m { display: grid; position: static; width: auto; margin-top: 14px; }
  .g3-field { height: 52px; padding-left: 16px; }
  .g3-field input { font-size: 16px; }
  .g3-field button { display: none; }
  .g3-sugg { justify-content: flex-start; }
  .g-tb.m { display: block; position: static; width: 100%; margin-top: 18px; }
  .g-list { display: block; list-style: none; margin: 14px 0 0; padding: 0; border-top: 1px solid rgba(255,255,255,.16); }
  .g-list li a { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,.16); }
  .g-list i { font-style: normal; font-family: var(--mono); font-size: 10.5px; letter-spacing: .12em; text-transform: uppercase; color: var(--on-dark-muted); }
  .g-list b { display: inline-flex; align-items: center; gap: 8px; color: var(--paper); font-weight: 600; font-size: 15px; }
```

### JS: tekening en G1

```js
const GS = 520 / 1152, GOX = 330;
function gNodes(oy) {
  const p = (x, y) => [+(GOX + x * GS).toFixed(1), +(oy + y * GS).toFixed(1)];
  return { notch: p(210, 178), left: p(0, 338), lbot: p(0, 650), ttop: p(590, 40), ktop: p(912, 2), karm: p(1150, 175), kfoot: p(1152, 398), bowl: p(660, 650) };
}
const gPoly = pts => 'M' + pts.map(q => q.join(' ')).join(' L');
function gDrawing(u, { oy = 96, H = 520, guides = true, dims = [], leads = [], extra = '' } = {}) {
  const N = gNodes(oy), lh = +(650 * GS).toFixed(1), bot = +(oy + lh).toFixed(1);
  const defs = `<defs>
    <pattern id="gh${u}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#fff" stroke-width="1.1" stroke-opacity=".42"/></pattern>
    <mask id="gm${u}" maskUnits="userSpaceOnUse" x="0" y="0" width="1168" height="${H}" style="mask-type:alpha"><image href="${IMG.logo}" x="${GOX}" y="${oy}" width="520" height="${lh}"/></mask>
    <filter id="go${u}" x="-5%" y="-5%" width="110%" height="110%">
      <feMorphology in="SourceAlpha" operator="dilate" radius="1.3" result="d"/>
      <feComposite in="d" in2="SourceAlpha" operator="out" result="e"/>
      <feFlood flood-color="#ffffff" flood-opacity=".92"/>
      <feComposite in2="e" operator="in"/>
    </filter>
    <marker id="ga${u}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path d="M1 1.5 L9 5 L1 8.5" fill="none" stroke="#fff" stroke-width="1.2"/></marker>
  </defs>`;
  const g = guides ? `<g class="g-fade" style="--d:.05s">
      <path class="g-ln dash" d="M250 ${bot} H930"/>
      <path class="g-ln dash" d="M540 ${N.ktop[1]} H930"/>
      <path class="g-ln dash" d="M380 ${N.karm[1]} H930"/>
      <path class="g-ln dash" d="M${GOX} ${oy - 26} V${bot + 60}"/>
      <path class="g-ln dash" d="M850 ${oy - 26} V${bot + 60}"/>
      <circle class="g-ln dash" cx="628" cy="${oy + 176}" r="150"/>
    </g>
    <circle class="g-ln faint g-draw" pathLength="1" style="--d:.15s" cx="590" cy="${oy + 150}" r="236"/>
    <path class="g-ln faint g-draw" pathLength="1" style="--d:.3s" d="M150 ${oy + 374} L1010 ${oy - 56}"/>` : '';
  const logo = `<g class="g-wipe" style="--d:.35s"><rect x="0" y="0" width="1168" height="${H}" fill="url(#gh${u})" mask="url(#gm${u})"/><image href="${IMG.logo}" x="${GOX}" y="${oy}" width="520" height="${lh}" filter="url(#go${u})"/></g>`;
  const dimSvg = dims.map(d => `<g class="g-dimgrp g-fade" style="--d:${d.delay || 1.1}s">
      <path class="g-ln dim" d="M${d.x1} ${d.e1[0]} V${d.e1[1]} M${d.x2} ${d.e2[0]} V${d.e2[1]}"/>
      <path class="g-ln dim" d="M${d.x1 + 4} ${d.y} H${d.x2 - 4}" marker-start="url(#ga${u})" marker-end="url(#ga${u})"/>
      ${d.gap ? `<rect x="${(d.x1 + d.x2) / 2 - d.gap / 2}" y="${d.y - 10}" width="${d.gap}" height="20" fill="#0e1a36"/>` : ''}
      ${d.text ? `<text class="g-dimtext" x="${(d.x1 + d.x2) / 2}" y="${d.ty || d.y + 4}" text-anchor="middle">${d.text}</text>` : ''}
    </g>`).join('');
  const leadSvg = leads.map((l, i) => `<path class="g-ln lead g-lead g-draw" pathLength="1" style="--d:${(1.2 + i * 0.12).toFixed(2)}s" d="${gPoly(l)}"/>`).join('');
  const nodes = guides ? Object.values(N).map((q, i) => `<circle class="g-node g-fade" style="--d:${(1.0 + i * 0.05).toFixed(2)}s" cx="${q[0]}" cy="${q[1]}" r="4.5"/>`).join('') : '';
  return `<svg viewBox="0 0 1168 ${H}" aria-hidden="true">${defs}${g}${logo}${dimSvg}${leadSvg}${nodes}${extra}</svg>`;
}
const gSide = (side, y, H) => `${side === 'l' ? 'right' : 'left'}:77.57%;top:${(y / H * 100).toFixed(2)}%`;

function heroG1() {
  const u = ++uid, N = gNodes(96);
  // Career hangt aan de rechteronderhoek van het logo, op de hoogte van Broodjes.
  const rbot = [850, N.lbot[1]];
  const mirror = STATE.k.G1.right === 'mirror';
  const labs = [
    ['l', 140, 'Kalender', 'Alles wat er gepland staat', [N.notch, [380, 140], [272, 140]], 'cal'],
    ['l', N.left[1], 'Tickets', 'Lopende verkopen', [N.left, [272, N.left[1]]], 'tix'],
    ['l', N.lbot[1], 'Broodjes', 'Bestellen bij de Theokot', [N.lbot, [272, N.lbot[1]]], 'sandwich'],
    mirror
      ? ['r', 140, 'Cursusdienst', 'Cursussen, boeken en de printer', [N.ktop, [790, 140], [896, 140]], 'book']
      : ['r', 108, 'Cursusdienst', 'Cursussen, boeken en de printer', [N.ktop, [790, 108], [896, 108]], 'book'],
    mirror
      ? ['r', N.left[1], 'Shiften', 'Help mee achter de bar', [N.kfoot, [872, N.left[1]], [896, N.left[1]]], 'beer']
      : ['r', 220, 'Shiften', 'Help mee achter de bar', [N.karm, [872, 220], [896, 220]], 'beer'],
    ['r', rbot[1], 'Career', 'Bedrijven, talks en de Jobfair', [rbot, [896, rbot[1]]], 'case'],
  ];
  const extra = `<circle class="g-node g-fade" style="--d:1.4s" cx="${rbot[0]}" cy="${rbot[1]}" r="4.5"/>`;
  const svg = gDrawing(u, { leads: labs.map(l => l[4]), extra, dims: [{ x1: GOX, x2: 850, y: 62, e1: [52, 88], e2: [52, 88], gap: 236, text: 'VLAAMSE TECHNISCHE KRING' }] });
  return `<section class="hero hG navyband rule"><div class="wrap">
    <h1 class="sr">Vlaamse Technische Kring</h1>
    <div class="g-box">${svg}
      ${labs.map(([side, y, t, sub, , icon], i) => `<a class="g-lab nav ${side}" href="#" style="${gSide(side, y, 520)};--d:${(1.5 + i * 0.12).toFixed(2)}s"><b><span class="g-u">${t}</span>${ic('arrow', 16)}</b><i>${sub}</i></a>`).join('')}
    </div>
    <ul class="g-list nav">${labs.map(([, , t, sub, , icon]) => `<li><a href="#"><span><b>${t}</b><i>${sub}</i></span>${ic('arrow', 16)}</a></li>`).join('')}</ul>
  </div></section>`;
}
```
