@AGENTS.md

# Schrijfconventies

- **Gebruik geen em-dashes (—)** in code, comments, UI-copy, commits of andere
  output. Gebruik in plaats daarvan een puntkomma, dubbele punt, komma, of een
  losse zin.
- Vertaal technische / IT-termen niet krampachtig naar het Nederlands. Interne,
  technische surfaces (bv. de admin/IT-tab) mogen gewoon Engelse vakterminologie
  gebruiken (bv. "Throw uncaught error" i.p.v. "Onafgevangen fout gooien").

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
- Layout: use generous max-width containers around 1320px, the cool `--paper`
  page ground, thin navy-tinted `--line` borders, and clear horizontal rhythm.
- Shape: cards and panels should be softly rounded, usually 16-22px. Small
  controls can be pill-shaped when they are CTAs or filters.
- Tone: prefer dense editorial utility over marketing decoration. Do not add
  gradients, decorative blobs, nested cards, or oversized explanatory text.
- Hero (homepage): a full-bleed photo under a navy scrim (heaviest top-left,
  behind the headline) carries light copy, a yellow italic-serif accent, and the
  dark-glass events card. The dark zone (`.home-dark-zone`) stretches the photo
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
  with study programmes) and therefore sits *after* Career, never between two
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
- Buttons: primary is dark ink/navy with paper text; secondary/ghost is bordered
  on paper; yellow is reserved for accents and active states. Over the dark hero,
  the primary button inverts to a `--surface` fill with ink text.
- Cards: `--surface` (white) panels with thin `--line` borders on the cool
  `--paper` ground, small elevation at most, and restrained hover movement. No
  flat navy/dark card fills; a featured card is marked with a yellow accent rail.
- Footer: a dark `--navy` band on every page (light text, the same `vtk-logo.png`
  brand mark as the header rather than a separate yellow badge), the same navy as
  the header; it bookends the dark hero, so do not lighten it per page.
- Lists and calendars: favor agenda/list layouts, tabular times, compact day
  labels, and small yellow status pins.
- Admin: keep pages operationally dense. Forms, tables, and upload/editor
  surfaces should use the same palette and rounded panels without becoming
  decorative.

## Implementation Constraints

- Keep Tailwind v4 source scanning explicit and do not switch to auto-detection.
- Keep `next dev --webpack` for both apps; do not re-enable Turbopack in dev.
- Keep `turbopack.root` and `outputFileTracingRoot` pinned in both Next configs.
- Do not re-export Prisma client types from `@vtk/db`.
- Read relevant local Next.js 16 docs under `node_modules/next/dist/docs/`
  before changing app layout, fonts, CSS, or routing conventions.
