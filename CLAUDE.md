@AGENTS.md

# Schrijfconventies

- **Gebruik geen em-dashes (—)** in code, comments, UI-copy, commits of andere
  output. Gebruik in plaats daarvan een puntkomma, dubbele punt, komma, of een
  losse zin.
- Vertaal technische / IT-termen niet krampachtig naar het Nederlands. Interne,
  technische surfaces (bv. de admin/IT-tab) mogen gewoon Engelse vakterminologie
  gebruiken (bv. "Throw uncaught error" i.p.v. "Onafgevangen fout gooien").
- **EAS Update na elke app-wijziging.** Pas je iets aan aan de mobiele app (`mobile/`)
  en push je naar `main`, publiceer dan ook altijd direct een EAS Update zodat
  toestellen en Expo Go de wijzigingen ontvangen:
  `cd mobile && npx eas update --branch preview --message "<korte beschrijving>"`.

# UX-conventies

Deze drie regels horen bij elkaar: elke actie zegt vooraf wat ze gaat doen
(bevestiging), is compact waar ze in een lijst staat (icoon), en zegt achteraf of
het gelukt is (toast).

- **Destructieve acties krijgen altijd een bevestigingsdialoog.** Wanneer een
  actie iets verwijdert (of anderszins onomkeerbaar data weggooit), toon eerst
  een bevestigings-modal voor je doorgaat; gebruik geen kale knop die meteen
  verwijdert, en ook niet de native `confirm()`. De modal moet duidelijk maken
  wat verwijderd wordt en een expliciete bevestig- en annuleer-knop hebben.
  - Zeg in de beschrijving **wat er precies weg is en wat blijft**, niet enkel
    "weet je het zeker?". Bijvoorbeeld: hoeveel pagina's losgekoppeld worden, of
    dat de historiek van andere jaren behouden blijft.
  - `DeleteIconButton` / `DeleteButton` (`apps/web/components/ui/DeleteIconButton.tsx`)
    bundelen bevestiging, icoon en toast; gebruik die in plaats van het patroon
    opnieuw te bouwen. Ze werken ook vanuit server components: je geeft de server
    action-referentie en de `fields` mee.

- **Rij-acties in tabellen en lijsten zijn icoonknoppen, geen tekst.** Gebruik
  `IconButton` / `IconLink` uit `apps/web/components/ui/IconButton.tsx` met een
  icoon uit `apps/web/components/ui/icons.tsx`.
  - **Een icoon zonder uitleg is geen knop maar een raadsel.** `label` is
    verplicht en wordt de `title` (tooltip bij hoveren) én de `aria-label`. Geef
    `srLabel` mee met context ("Verwijderen: Career Fair"), anders hoort een
    screenreader twintig keer hetzelfde "Verwijderen" zonder te weten waarvan.
  - **Dit geldt niet voor primaire en formulierknoppen.** "Opslaan", "Nieuw
    evenement", "Toevoegen", en de knoppen in een bevestigingsdialoog blijven
    tekst. Een icoon is voor de compacte, herhaalde actie per rij; niet voor de
    ene belangrijke actie op een scherm.
  - Behoud betekenisvolle toestand in het icoon zelf (bv. een vinkje na
    kopiëren), niet enkel in de tooltip.
- **Opslaan meldt altijd zijn uitkomst, overal (ook in admin).** Een opslaan-knop
  die niets zichtbaars doet, is een bug: de gebruiker weet dan niet of het gelukt
  is. Gebruik `SaveForm` (`apps/web/components/ui/SaveForm.tsx`), dat het `<form>`
  en de submitknop bezit en de uitkomst als toast toont; bouw geen kaal
  `<form action={...}>` zonder feedback.
  - De server action geeft `SaveState` terug (`apps/web/lib/saveState.ts`) via de
    helpers `saveOk()` / `saveError(code)`, in plaats van `void`.
  - **Verwachte invoerfouten geef je terug, je gooit ze niet.** Een dubbel
    r-nummer of een te groot bestand is geen serverfout en hoort een rode toast te
    geven, geen error boundary. Onverwachte fouten mogen wel gewoon gooien: die
    horen in de error boundary en in de monitoring.
  - Foutcodes uit de action map je clientside op vertaalde meldingen
    (`errorMessages`), met `common.saveError` als fallback. Zeg in de melding wat
    er misging, niet enkel dat er iets misging.
  - Succes-toasts verdwijnen vanzelf; fout-toasts blijven staan tot de gebruiker
    ze wegklikt (`duration: 0`).
  - Redirect de action na het opslaan (zoals de onboarding doet), dan is die
    navigatie zelf de bevestiging en is een toast niet nodig. Let op dat
    `redirect()` via een throw werkt: hou ze buiten elke try/catch.
  - **Een `redirect()` naar de pagina waar je al staat is geen feedback.** Dat
    patroon (`saveXAction` → `redirect("/admin/x")` terwijl het formulier op
    `/admin/x` staat) ziet eruit als feedback maar doet niets zichtbaars; gebruik
    daar `revalidatePath` plus een toast. Redirect enkel wanneer je echt naar een
    ander scherm gaat, bv. omdat het huidige na de actie niet meer bestaat.
  - `revalidatePath` moet ook de **beheerpagina** raken, niet enkel de publieke
    route: anders blijft de lijst waar je net iets wijzigde ongewijzigd staan.
  - Sluit een modal of inspector zelf via `onSuccess` wanneer de action niet meer
    redirect, en zet een net aangemaakt item niet in "nieuw"-modus terug: een
    tweede klik op opslaan maakt anders een duplicaat of botst op een unieke slug.

# Kringwerking & design decisions

`docs/design-decisions.md` legt niet-vanzelfsprekende **product-/werkingskeuzes** van
VTK vast (hoe de kring concreet werkt): dingen die je niet uit de code of git-historiek
kan afleiden. Lees dit voor context bij features met kringspecifiek gedrag (bv. Theokot).

**Wanneer je een feature bouwt waarvan de gewenste werking een kringkeuze is (niet puur
technisch, niet vanzelfsprekend), voeg een sectie toe aan `docs/design-decisions.md`.**

# Rollen, posten & rechten

`docs/permissions.md` is de referentie voor de toegangscontrole: het rollen + posten +
permissies-model, hoe rechten resolven (werkingsjaar-gescoped, 15-juli-reset), hoe je een
permissie toevoegt (registry in `packages/db/src/permissions.ts` + seed) en hoe je in code
checkt (`requirePermission` / `hasPermission`, getypeerd op de `Permission`-union). Lees dit
voor je iets aan auth, admin-schermen of permissie-checks wijzigt.

# VTK als SSO-provider

`docs/sso.md` is de referentie voor OAuth2/OIDC: welke scopes en claims we uitgeven,
hoe de toegangspoort per applicatie werkt (open vs. beperkt, `<namespace>.access`),
hoe per-client permissies toegekend worden, en wat er bewust níét gebouwd is. Lees
zeker de sectie "Vallen waar we in gelopen zijn" voor je aan `packages/auth`, het
toestemmingsscherm of de plugin-config komt; die punten hebben allemaal ooit tijd
gekost en een paar ervan falen stil.

# Wachtwoordkluis

`docs/wachtwoorden.md` is de referentie voor de gedeelde wachtwoorden per post
(Vaultwarden): het crypto-formaat dat we in `node:crypto` schrijven, hoe de sync
het lidmaatschap volgt, en hoe je de koppeling opzet. Lees zeker "Vallen waar we
in gelopen zijn" voor je aan `apps/web/lib/vault` komt; die punten falen
grotendeels stil. De kringkeuzes staan in `docs/design-decisions.md`.

# Google Workspace

`docs/google-workspace.md` is de referentie voor de groepsadressen
(`activiteiten@vtk.be`), de `@vtk.be`-accounts en de kiesploeg: hoe je de
koppeling opzet (service-account, delegatie, organisatie-eenheden, OAuth-client),
hoe de kiesploeg door het jaar loopt, en wat er handmatig in de Admin console
blijft omdat er geen API voor is. Lees dit voor je aan `apps/web/lib/google`
komt, en zeker de sectie "Vallen waar we in gelopen zijn": die punten falen
grotendeels stil. De kringkeuzes staan in `docs/design-decisions.md`.

**Dit is iets anders dan de mailinglijsten in `lib/brevo`.** Dat zijn opt-in
nieuwsbrieven naar studenten; dit zijn de ontvangende adressen van de kring
zelf, met de posten van het werkingsjaar als bron. Geen gedeelde regels, enkel
een gedeeld sync-stramien.

# MCP-server voor agents

`docs/mcp.md` is de referentie voor het MCP-endpoint op `/api/mcp`, waarmee een
coding agent de site kan lezen en nieuwe records kan aanmaken. Lees dit voor je
aan `apps/web/lib/mcp` komt. De grens is bewust hard: **enkel reads en expliciete
create-kinds**, geen update, upsert, publish, delete, generieke Prisma-toegang of
operationele neveneffecten (mail, betalingen, reservaties, deuren). Nieuwe records
worden waar het model het toelaat geforceerd draft, verborgen, inactief, gesloten
of uitgeschakeld aangemaakt.

- Elke permissie uit `packages/db/src/permissions.ts` heeft een expliciete
  policy in `lib/mcp/policy.ts`; de typecheck faalt zodra iemand een permissie
  toevoegt zonder die MCP-beslissing te maken.
- Een leesresource geeft **nooit** een geheim terug. Bouw een `Setting`-filter op
  uit de allowlist in `lib/mcp/read.ts` in plaats van een `key` uit de request
  over te nemen: die tabel bevat naast redactionele blokken ook `s3.config`,
  `vault.config`, `door.config` en `brevo.lists`.

# Styling Guidelines

Use `design/new-design.html` as the visual source of truth for VTK surfaces.
Preserve live data, routes, permissions, and existing product behavior; translate
the design language into the application instead of copying mockup content.

## Visual System

- Fonts: use Inter for UI and body text. Use Instrument Serif only as an italic
  accent in the hero headline, never for dense interface copy; homepage section
  headings are plain sans (the serif accent there was reviewed and removed), and
  the footer serif tagline accent was reviewed and removed too.
- Palette: cool paper, light mode. Every colour is a CSS custom property defined
  **once** in `apps/web/app/design/vtk-base.css`; components reference the tokens,
  never raw hexes. Retune the palette there and the whole site follows. Key
  tokens: `--paper #EFF2F8` (page ground), `--paper-2 #E6ECF5` (band/inset tint),
  `--surface #FFFFFF` (cards & panels), `--ink #0A0F1F` + `--navy #0E1A36`
  (text/ink and dark accents), `--yellow #FFD23F` (the single accent),
  `--muted #5C667F` / `--body #34405E` (text tones), `--on-dark-muted #B7C0DC`
  (muted text on a dark band). Do not reintroduce the old warm off-white
  (`#FAFAF7`/`#F2F0E9`). The Tailwind `@theme` neutrals in
  `apps/web/app/globals.css` (`--color-vtk-surface`, `--color-vtk-blue-soft`,
  `--color-vtk-blue-muted`) mirror these neutrals for `bg-vtk-*` utilities; keep
  them in sync when you retune.
- Layout: use generous max-width containers around 1240px (`--max`), the cool `--paper`
  page ground, thin navy-tinted `--line` borders, and clear horizontal rhythm.
- Shape: cards and panels should be softly rounded, usually 16-22px. Small
  controls can be pill-shaped when they are CTAs or filters.
- Tone: prefer dense editorial utility over marketing decoration. Do not add
  gradients, decorative blobs, nested cards, or oversized explanatory text.
- Hero (homepage): a full-bleed photo under a navy scrim (heaviest top-left,
  behind the headline) carries light copy, a yellow italic-serif accent, and the
  agenda beside it. That agenda is either the week overview (`.hero-week`, the
  default) or the older list of upcoming events (`.hero-cal`); an editor picks
  which in /admin/frontpage. The week overview deliberately has **no panel**: it
  reads on a wide, borderless gradient in the scrim (`.hero-week-wash`) that
  dissolves outward, because the photo is at its lightest exactly there. Do not
  put a card back around it, and see `docs/design-decisions.md` for the rules
  behind the days it shows. The dark zone (`.home-dark-zone`) stretches the photo
  through the quick-links row, which sits on it as a dark glass panel; the zone
  ends on a crisp seam: a short bottom-anchored vignette settles the photo edge
  and the openingsuren band starts right below it. Both a paper gap and a long
  dissolve into navy were reviewed and rejected there (the gap broke the dark
  flow; the dissolve read as murky, empty dark). The sticky header sits
  transparently over this hero and turns solid once scrolled past it (desktop;
  `components/site/SiteHeaderShell`).
- Band rhythm: the hero's dark deliberately returns down the page as full-width
  navy bands and the site-wide dark footer closes the bookend. Header, bands and
  footer share the same `--navy` so the dark chrome reads as one system. The
  lower half of the page alternates navy and light-blue (`--paper-2`) bands:
  **Wat we doen** (paper) → **Aftermovies** (navy) → **Opkomende evenementen**
  (`--paper-2`) → **VTK Career** (navy) → **Jouw POC's** (`--paper-2`) →
  **Hoofdpartners** (paper). The navy bands (openingsuren, aftermovies, career)
  carry the full-bleed `::before` navy fill plus the shared `::after` technical
  pattern, each with its own crop of `technisch-pattern.svg` so no two bands show
  the same wallpaper. The openingsuren band butts directly against the dark
  zone's crisp seam with a compact heading. The full-bleed bands
  (aftermovies, evenementen, career, POC's) share a `band` class: each carries a
  top margin to separate from the paper section above it, but two consecutive
  bands butt directly against each other with a crisp navy/light-blue seam
  (`.band + .band { margin-top: 0 }`) rather than a paper gap; the light-blue
  bands also keep tighter internal padding than the navy ones. On a navy band,
  panels are dark glass
  (`rgba(255,255,255,.06)` fill, `.14` white border), headings go `--paper`,
  muted text uses `--on-dark-muted`, and the primary button inverts like on the
  hero. The **Jouw POC's** band is personal (only rendered for a logged-in member
  with study programmes) and therefore sits _after_ Career, never between two
  navy bands: were it between them, the two navy bands would collide the moment it
  disappears. See `docs/design-decisions.md` for the section ordering rationale.
- Photography: content cards open with a real photo under a navy scrim, never a
  decorative illustration. Aanbod cards carry a photo header (light 115deg
  scrim) and are uniform: every card in the grid gets the same photo-header +
  white-body treatment, no card is singled out as a featured/mini-hero (that was
  reviewed and removed). Werkingen without a photo fall back
  to the striped placeholder pattern (`repeating-linear-gradient` of
  `--paper-2`/`--paper`) so missing images stay visible. Admins upload the photo
  per werking via /admin/home (`HeaderTab.imageKey`); the `AANBOD_PHOTOS` map
  in HomeEditorial is only the static fallback for tabs without an upload.
- Dark surfaces: `--navy`/`--ink` are for text, buttons, small accents, and
  intentional full-width bands only, never as a flat card fill in a light grid.
  In a light grid, mark a featured card with a yellow accent rail
  (`box-shadow: inset 3px 0 0 var(--yellow)`) on a `--surface` card, not a navy
  block; a photo under a scrim is the only dark card fill that is allowed.

## Components

- Adresvelden in de admin: een veld waar een redacteur een bestemming intikt,
  valideer je met `isEditableDestination` uit `apps/web/lib/href.ts`, niet met
  `z.string().url()` of een eigen regex. Die helper aanvaardt een pad op deze
  site (`/praesidium`) naast een volledig http(s)-adres, en dat is precies wat de
  renderkant al verwacht: `isExternalUrl` bepaalt of er een taalprefix voor moet
  en of de link in een nieuw tabblad opent. Gebruik `type="url"` daar dus ook
  niet op de input; de browser weigert een pad voor je server het ziet.
  - Foutcode is `INVALID_URL`, met de melding in `lib/saveMessages.ts`.
  - Enkel een veld dat per definitie naar een andere site wijst
    (`HeaderTab.externalUrl`) blijft `.url()`. Machine-endpoints (SSO, deur,
    monitoring) staan hier los van.
  - Dit liep ooit uiteen: de menu-items en de aankondigingsknop eisten
    `https://` terwijl hun eigen renderer een intern pad al correct afhandelde,
    dus een werkende bestemming was niet op te slaan.

- Markdown editing: gebruik
  `apps/web/components/editor/MarkdownEditor.tsx` voor alle langere,
  opgemaakte tekst die als Markdown wordt opgeslagen. Gebruik
  `MarkdownEditorField` in een gewoon formulier; die beheert de waarde en voegt
  zelf de hidden input met `name` toe. Gebruik de controlled `MarkdownEditor`
  wanneer de parent de waarde nodig heeft, bijvoorbeeld bij taaltabs. Bouw voor
  nieuwe velden geen losse textarea met een eigen Markdown-werkbalk.
  - De standaardwerkbalk bevat H1, H2, H3, links, image-upload, bold, italics,
    inline of fenced code, unordered en ordered lists, blockquotes en een
    horizontal rule. Zet `allowImages={false}` wanneer uploads niet bij het
    inhoudstype passen.
  - Render opgeslagen inhoud met
    `apps/web/components/ui/Markdown.tsx` in een `prose-vtk` container. Gebruik
    `markdownToPlainText` uit `apps/web/lib/markdown.ts` voor compacte previews
    waarin rijke HTML niet past.
  - Ruwe HTML blijft uitgeschakeld. Voeg geen `rehype-raw` toe, want deze inhoud
    wordt door leden beheerd.
- Header: sticky, solid `--navy` bar with light nav links, compact brand mark,
  and subtle language/account controls; it pairs with the dark footer as the top
  bookend (the old translucent paper bar was reviewed and replaced). The text is
  light in every state; on the homepage only the background goes transparent
  over the dark hero and fades back to solid navy on scroll.
  - A tab with pages under it (or extra `HeaderTabLink` items) shows a chevron
    and drops a white panel on hover and `:focus-within`; that is CSS only, so
    keep `.nav-links` free of `overflow` or the panel gets clipped.
  - Below 850px the tabs are replaced by one menu button that opens a navy
    panel under the header, with the pages per category behind a chevron. Do not
    reintroduce the horizontal scroller: eleven tabs in a scroll strip read as a
    mistake and hide most of the navigation.
- Buttons: primary is dark ink/navy with paper text; secondary/ghost is bordered
  on paper; yellow is reserved for accents and active states. Over the dark hero,
  the primary button inverts to a `--surface` fill with ink text.
- Cards: `--surface` (white) panels with thin `--line` borders on the cool
  `--paper` ground, small elevation at most, and restrained hover movement. No
  flat navy/dark card fills; a featured card is marked with a yellow accent rail.
- Footer: a dark `--navy` band on every page (light text, the same `vtk-logo.png`
  brand mark as the header rather than a separate yellow badge), the same navy as
  the header; it bookends the dark hero, so do not lighten it per page.
- Page head: every non-home page opens with the same dark band
  (`.vtk-page-head` in `apps/web/app/design/vtk-base.css`): full-bleed `--navy`,
  its own crop of the technical pattern, a yellow bottom rule, light title and
  `--on-dark-muted` subtitle. `/tickets`, the category pages and the content
  pages all use it, so do not build a second kind of page opener. The classes
  `.vtk-page-title`/`.vtk-page-subtitle`/`.vtk-page-kicker` keep dark text
  outside that band (they are also used on light backgrounds); only inside
  `.vtk-page-head` do they invert.
- Motion: content pages animate on scroll, in pure CSS (`animation-timeline`,
  `apps/web/app/design/vtk-motion.css`), never with a scroll listener. Headings
  arrive word by word, figures fly in from off screen on alternating sides, and
  the yellow rules under a section heading and under bold text draw themselves.
  A reading-progress bar was tried and removed. Four rules hold: any hiding
  start state lives **inside** the
  `@supports (animation-timeline: view())` guard (otherwise a browser without
  support shows a blank page), animate only `opacity` and `transform`, use
  `overflow-x: clip` and never `hidden` around sideways motion (`hidden` makes a
  scroll container and breaks the sticky rail), and nest everything in
  `@media (prefers-reduced-motion: no-preference)`. End every `animation-range`
  inside `entry`, never inside `cover`: a page that cannot scroll further leaves
  anything ranged past full visibility half-faded forever. The one documented
  exception to transform-only is the underline under bold text, which grows with
  `background-size` because a transform cannot follow a line break. Motion belongs to reading a
  text: not on buttons, tables, the rail, or anywhere in admin. See
  `docs/design-decisions.md` for what was rejected.
- Content pages (`PageView`): dark head with a breadcrumb to the category, then
  the text column with an optional rail beside it holding the page outline (H2
  and H3, anchors from `lib/pageOutline.ts`) and the downloads. The rail only
  appears when there are at least two headings, a download, or a linked form; it
  sticks on desktop and moves above the text on narrow screens.
  - A page can carry one form (`Form.pageId`), rendered as a `.vtk-page-form`
    panel in the text column: a `--surface` card with the yellow accent rail,
    the same treatment as any featured card. It sits where the editor put the
    `[[formulier]]` marker in the markdown, and at the bottom otherwise. Do not
    give it a navy band or a photo header; the panel belongs to the text, not
    beside it. See `docs/design-decisions.md` for the three directions that were
    reviewed and rejected.
  - In that rail the form is **not** another muted outline row but a yellow
    button (`.vtk-rail-form`) carrying the title and the deadline, breaking the
    hairline at the position the panel has in the text. It goes grey
    (`data-state="closed"`) once the form is closed, full or already submitted.
    Someone who opened the page to sign up should not have to hunt for it.
  - The rail is a register in the margin, not a card: a hairline guide down the
    left, muted links with air between them, an uppercase ink label leading the
    list, and a 2px yellow marker on the heading you are reading. `PageOutline`
    sets `aria-current` from a scroll-spy: a reading line just under the sticky
    header, measured in a rAF-throttled scroll listener. The white
    `--surface` card that was there was reviewed and removed: it weighed more
    than the handful of short lines inside it and left an empty white block
    beside the text. Downloads keep that treatment and are separated by a rule
    instead of by a second card.
- Category pages (`/[headerSlug]`): the pages under a header tab are a list of
  wide cards, two per row (`.vtk-tile-grid`), each opening with its own photo as
  a square on the left and the title, excerpt and "Lees meer" on the right. The
  photo is uploaded per page in the page editor (`Page.imageKey`); a page without
  one keeps the striped placeholder pattern, and the menu items on that page
  (`HeaderTabLink`) never have a photo. Do not turn these back into the plain
  `.vtk-card` grid: most pages have no excerpt, so a title-only card grid says
  almost nothing. See `docs/design-decisions.md` for why the list won over a
  photo header and a full photo card.
- Praesidium (`/praesidium`): a wall of faces, not a contact sheet. One
  full-bleed `--paper-2` band (`.vtk-wall`) carries every post below one another;
  per post the name sits in the left margin and sticks there while you scroll
  its members (`.vtk-wall-label-inner`), and the portraits carry themselves on
  the band with a soft shadow instead of a hairline card. Above the band the
  posts are jump chips (`.vtk-wall-jump`) with the "Posten" label on its own line
  above them, which is what buys the fourteen chips a single row on a laptop; the
  margin is thin, so a year with more or longer post names wraps, and it wraps
  greedily on purpose. Do not put `text-wrap: balance` on that row: two half-full
  lines were reviewed and read as messier than one full line with a remainder.
  The sticky rail beside the roster that was there was reviewed and removed. Do
  not reintroduce a card or border around a portrait: only the tile without a
  photo gets an outline, or the initial floats loose on the band.
- Lists and calendars: favor agenda/list layouts, tabular times, compact day
  labels, and small yellow status pins.
- Functional pages and modules, including Media and Logistiek, use the same
  visual system as the main website. A separate subdomain or operational flow
  is not a reason to invent another hero, type treatment, palette, container
  width, or card language.
  - Only the homepage may use a full-bleed photo hero and italic serif headline
    accent. Every other public or functional landing page starts with the
    canonical dark page head. Do not add a unique photo hero to Media,
    Logistiek, Tickets, or a similar module.
  - Do not use decorative step numbers, album counts, oversized statistics, or
    shortcut navigation as section ornaments. Show a count only where it helps
    someone make a decision, and keep it next to the control or result it
    describes.
  - Put the available tasks and primary choices above the fold. In a module
    landing page, state what someone can do before explaining the process. In
    an admin module, keep all capabilities visible in clearly named groups so a
    user does not need to discover them by opening unrelated tabs.
  - Related facts need labelled columns or a semantic `table`/`dl`. Never pack
    fields such as item, brand, volume and stock, or event, contents, period and
    status into one line separated by middots. On mobile, turn those column
    headings into labels per value instead of removing the distinction.
  - A control that changes a draft indirectly must provide immediate, local
    feedback. Applying a template must say what was added and update the visible
    request summary at once. Do not make the user navigate to another panel to
    discover whether an action had an effect.
  - Essential information may wrap but must not disappear behind truncation.
    Check dense overview rows at desktop and mobile widths before considering a
    redesign complete.
- Admin: keep pages operationally dense. Forms, tables, and upload/editor
  surfaces should use the same palette and rounded panels without becoming
  decorative.
  - Alle beheeromgevingen gebruiken `AdminNav` uit `@vtk/ui`: op desktop een
    compacte, gegroepeerde zijbalk en op smalle schermen één uitklapknop die het
    huidige onderdeel benoemt. Bouw voor Logistiek of een volgende module geen
    bijna-kopie en zet de beheermogelijkheden niet in losse kaarten of in één
    paginabrede linkstrip; beide varianten laten de navigatie meer aandacht
    opeisen dan het werk zelf.
  - Een operationeel dashboard groepeert statussen per workflow in compacte,
    gelabelde rijen. Gebruik geen extra summary hero en herhaal niet onder elk
    getal een zin wanneer de statusnaam de betekenis al duidelijk maakt.
  - Lange beheerformulieren krijgen de volledige inhoudsbreedte en er staat
    hoogstens één primaire bewerktaak tegelijk open. Open bij een lege dataset
    niet automatisch een lang formulier naast een leeg tweede paneel; toon een
    gerichte empty state met een duidelijke startactie.
  - Below 860px the left column collapses into one button naming the tab you are
    on, which opens the full grouped list as a panel underneath
    (`AdminNav` + `vtk-admin.css`). Do not reintroduce the horizontal scroller
    that was there: fifteen tabs in a scroll strip hide most of the navigation.
  - **A wide table inside a horizontal scroller must have a positioned wrapper.**
    `sr-only` is `position: absolute`; without a positioned ancestor it anchors
    on the page instead of on the table, lands at the x of its column, and a
    phone zooms the whole page out to show that one invisible pixel. This is why
    `.vtk-admin-main .overflow-x-auto` and `.ticket-admin-table-wrap` carry
    `position: relative`. It cost an afternoon on /admin/tickets and the
    bonnetjes tab.
  - **De inhoudskolom van de admin is 900 px en wordt nooit breder** (`--max`
    1240, min 2x36 padding, min 220 zijbalk, min 48 gap). Een beheertabel die
    daar niet in past, verstopt haar rij-acties achter een scrollbalk. Op
    /admin/rekeningen stonden terugbetaald, doorgestuurd en ingeboekt elk in een
    eigen kolom met een pil erin, samen 460 px, terwijl de statuskolom ernaast
    uit precies die drie datums wordt afgeleid (`expenseStatus()`): vier
    kolommen voor drie bits. Ze zijn nu één `.vtk-expense-track` van drie
    segmenten met het statuswoord erachter. Zoek bij een te brede tabel dus
    eerst naar kolommen die hetzelfde zeggen, voor je kolommen versmalt.
  - **Een rij in een beheertabel opent zijn detail met een klik op de rij zelf**,
    niet enkel via een `i`-knop ernaast. De cel met de rij-acties stopt de
    propagatie, en de titelknop in de rij blijft bestaan omdat een toetsenbord
    en een screenreader een echt focusbaar element nodig hebben. Verwijderen
    hoort dan in de detailmodal en niet meer in de rij: het is de enige
    onomkeerbare actie en het scheelt een icoon per rij.
  - Below `sm` the admin CSS puts every field of a `flex flex-wrap items-end`
    filter row on its own full-width line: the fixed widths (`w-44`, `w-56`) and
    the `ml-auto` button are meant for a wide column. Rows of unlabelled inputs
    (the Theokot offering editor) need a per-field label on narrow screens; the
    column headings above the table are hidden there.

## Implementation Constraints

- Keep Tailwind v4 source scanning explicit and do not switch to auto-detection.
- Keep `next dev --webpack` for both apps; do not re-enable Turbopack in dev.
- Keep `turbopack.root` and `outputFileTracingRoot` pinned in both Next configs.
- Do not re-export Prisma client types from `@vtk/db`.
- Read relevant local Next.js 16 docs under `node_modules/next/dist/docs/`
  before changing app layout, fonts, CSS, or routing conventions.
