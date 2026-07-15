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

# Styling Guidelines

Use `design/new-design.html` as the visual source of truth for VTK surfaces.
Preserve live data, routes, permissions, and existing product behavior; translate
the design language into the application instead of copying mockup content.

## Visual System

- Fonts: use Inter for UI and body text. Use Instrument Serif only as an italic
  accent inside large headlines, never for dense interface copy.
- Palette: default to `--paper #FAFAF7`, `--paper-2 #F2F0E9`,
  `--ink #0A0F1F`, `--navy #0E1A36`, `--yellow #FFD23F`,
  and muted blue-gray text. Avoid old cool-gray/mono-heavy styling.
- Layout: use generous max-width containers around 1320px, off-white page
  backgrounds, thin navy-tinted borders, and clear horizontal rhythm.
- Shape: cards and panels should be softly rounded, usually 16-22px. Small
  controls can be pill-shaped when they are CTAs or filters.
- Tone: prefer dense editorial utility over marketing decoration. Do not add
  gradients, decorative blobs, nested cards, or oversized explanatory text.

## Components

- Header: sticky translucent paper background with blur, compact brand mark,
  plain nav links, subtle language/account controls, and one strong dark CTA.
- Buttons: primary is dark ink/navy with paper text; secondary/ghost is bordered
  on paper; yellow is reserved for accents and active states.
- Cards: white or paper panels with thin borders, small elevation at most, and
  restrained hover movement.
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
