@AGENTS.md

# Kringwerking & design decisions

`docs/design-decisions.md` legt niet-vanzelfsprekende **product-/werkingskeuzes** van
VTK vast (hoe de kring concreet werkt) — dingen die je niet uit de code of git-historiek
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
