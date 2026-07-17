# Pages rework (July 2026): markdown editor, page roles, yearly review

Reference for the info-pages rework built on the `pages` branch on 2026-07-17
(original spec: `docs/pages.txt`). Implemented, tested and reviewed in the
browser by Witse. Product rationale lives in `docs/design-decisions.md`
("Infopagina's"); the permission model in `docs/permissions.md`. This file
explains what changed and how the pieces fit.

The rework happened in two rounds: first the markdown editor + page roles +
yearly review, then a second pass that moved page **creation, slug, publishing
and delete** to the editor and reduced `/admin/inhoud` to structure only. What
follows describes the end state, not the intermediate one.

## The model in one paragraph

Info pages (`Page`) are maintained by the werkgroepen themselves. A page holds
markdown content (NL + optional EN) and gets one or more **editor roles**
(`PageEditorRole`). Members holding such a role plus the `pages.edit`
permission edit that page in `/admin/paginas`; `pages.editAll` and super admins
edit everything; a page with no roles is locked to those two. Pages flagged
**"jaarlijks nakijken"** float to the top of `/admin/paginas` with a yellow cue
until their content is saved once after 15 July (the working-year cutover).

The split is **the page vs. the navigation**, not content vs. metadata. Anything
that belongs to the page itself (content, slug, editor roles, yearly flag,
create, delete) lives in the editor and is authorised with
`canEditPageContent`. `/admin/inhoud` (`pages.manage`) owns only where a page
hangs in the header navigation. **Publishing** cuts across both: it is its own
permission (`pages.publish`, implied by `pages.manage`), because writing a page
is not the same right as putting it on the site.

## Data model (Prisma)

New on `Page`:

| Field                         | Meaning                                                                                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contentMdNl` / `contentMdEn` | Markdown, the source of truth. `null` = page never saved in the new editor (legacy). Empty string = deliberately empty. `contentMdEn = null` = no English version, public falls back to NL. |
| `needsYearlyEdit`             | "Jaarlijks nakijken": page holds info that changes every working year (names, phone numbers, ...).                                                                                          |
| `contentEditedAt`             | Last time the CONTENT was saved via the editor. `updatedAt` is useless for this: it also moves on drag-reorder and metadata saves.                                                          |
| `editorRoles`                 | Relation to `PageEditorRole` (`@@id([pageId, roleId])`, multiple roles per page).                                                                                                           |

`contentJsonNl/En` (legacy tiptap JSON) still exist. Render precedence per
language: markdown wins as soon as it is non-null; JSON only renders for pages
never saved in the new editor. On every editor save `contentJsonEn` is cleared
(markdown becomes the whole truth for EN); `contentJsonNl` is a required column
and stays as a dead backup.

Migration: `20260716223642_pages_markdown_editor_roles` (applied; seed ran).

## Permissions

Registry (`packages/db/src/permissions.ts`):

- `pages.edit`: edit **assigned** pages (role match required).
- `pages.editAll`: edit all pages (new).
- `pages.manage`: the navigation-structure screen `/admin/inhoud` (new). Implies
  `pages.publish`.
- `pages.publish`: put a page on the site (new). `pages.manage` implies it; plain
  `pages.edit`/`pages.editAll` does NOT. See `canPublishPages`.
- `pages.delete`: now also requires access to that page, not just the permission.
- `header.manage`: still accepted by the header-tab **actions** (alongside
  `pages.manage`), but `/admin/inhoud` itself is gated on `pages.manage` only.

The check is `canEditPageContent(session, page)` in `apps/web/lib/pageAccess.ts`.
It needs the user's roles, so `SessionPayload` now carries `roleIds: string[]`
(resolved per working year, direct + post-granted, same as permissions; see
`packages/auth/src/server/session.ts`). `needsYearlyReview(page)` in the same
file implements the "not edited since 15 July" cue via
`workingYearStart()` (`apps/web/lib/workingYear.ts`).

The seed now UPDATES permission labels on reseed (registry is the source of
truth; permissions are not GUI-editable), instead of create-only.

## Screens

**`/admin/paginas`** (new; nav item "Pagina's", gate `pages.edit` or
`pages.editAll`): server-rendered table in the Ledenbeheer pattern. Lists only
pages the user may edit (editAll and super admins see all). Search, sort and
pagination all run in the DB (25/page, `?q`/`?sort`/`?dir`/`?page`); search
spans **every** page the user may edit, not just the loaded 25. The `select`
deliberately skips `contentMdNl`. Yearly-review pages sort to the top with a
yellow dot plus a count banner that counts across all pages.

Because "needs review" is computed (yearly flag + not saved since the 15 July
cutover) Prisma cannot `ORDER BY` it, so the review block and the rest are
queried separately and stitched; `lib/reviewFirstPaging.ts` holds that window
math and is tested against the old fetch-all-and-slice behaviour.

**`/admin/paginas/[id]`** (new): full-page content editor
(`PageContentEditor.tsx`). NL/EN tabs (both stay mounted, hidden via CSS so
nothing is lost when switching), title per language, `MarkdownEditor` per
language, and the bijlagen section (AssetList + FileUploader, imported from
`../inhoud/`). Saving goes through `savePageContentAction` which re-checks
access server-side and stamps `contentEditedAt`. Legacy pages get a notice that
the content was auto-converted and should be reviewed before saving.

At the bottom sits `PageSettingsCard.tsx`: the page's **slug**, **publish state**
(only with `pages.publish`/`pages.manage`), **editor roles** and **yearly flag**,
editable by whoever may edit the content (`savePageSettingsAction`, same
`canEditPageContent` check; NOT `pages.manage`). The slug field is the shared
`components/ui/SlugField.tsx`, so the editor and the inspector cannot drift apart
on the "renaming breaks existing links" warning again. They commit with their own
"Wijzigen" button, separate from saving the content. A `ConfirmDialog` fires only
when the change would remove the user's own access (after which they are sent back
to the overview, since staying would only 403). The action leaves `contentEditedAt`
alone, so ticking the yearly flag never counts as reviewing the page. A taken slug
returns `SLUG_TAKEN` (red toast), not a 500.

**Creating pages** is `pages.edit`/`pages.editAll` too: "Nieuwe pagina" on the list
opens a modal (title + slug) and `createPageAction` makes an unpublished, uncategorised
draft stamped with the creator's own roles (else it would be locked on birth), then
redirects to its editor. Publishing and category remain `pages.manage`.

**`/admin/inhoud`** (reworked): gate is `requirePermission("pages.manage")`,
so the old `canEditPages`/`canManageHeader` prop plumbing is gone. This screen is
now **structure only**. The `PageInspector` manages titles, slug, category,
publish, "tonen in overzicht", excerpts, and a compact **Rechten** block (yearly
flag + the roles that may edit, with an "Bewerken" toggle that expands the full
role list). Content editing, bijlagen and delete are gone from here; a prominent
"Inhoud bewerken" button goes to `/admin/paginas/[id]`.

- The role checkboxes stay **mounted but CSS-hidden** when the Rechten block is
  collapsed. If they left the DOM the form would submit no `editorRoleIds` and
  saving would silently wipe every editor role.
- The **unlinked section is gone**: it was an unbounded list that said nothing
  about structure. Unlink via the category select ("niet gekoppeld"); the page
  survives at `/p/<slug>` and is findable via the picker or `/admin/paginas`.
- **"Pagina toevoegen" links an existing page** (`AddPagePicker` +
  `/api/admin/pages/search`, debounced, min 2 chars, `exclude=<tabId>`), it does
  not create one.
- The query no longer loads markdown, legacy JSON, assets, or unlinked pages;
  measured ~72% smaller payload on the dev DB, and it no longer grows with pages
  that hang nowhere.

## Markdown pipeline

- **Renderer**: `apps/web/components/ui/Markdown.tsx` (react-markdown +
  remark-gfm). Used by BOTH the public `PageView` and the editor preview, so
  they always match. Raw HTML is intentionally NOT rendered (member-edited
  content must stay safe). Styling comes from the surrounding `prose-vtk`.
- **Editor**: `apps/web/components/editor/MarkdownEditor.tsx`, REUSABLE for
  other surfaces (props: `value`, `onChange`, `locale`, `rows`, `allowImages`).
  Edit/Preview tabs; toolbar covers only the basics: H1-H3, bold, italic, link,
  image upload (POST `/api/admin/upload`, kind=image, inserts the markdown
  syntax), bullet and numbered lists. Advanced markdown (tables, quotes, code
  blocks) works when typed but deliberately has no button.
- **Legacy conversion**: `apps/web/lib/tiptap-to-markdown.ts` converts the old
  tiptap JSON when the editor opens a page with `contentMdNl === null`. The
  person saving reviews the result, which makes the conversion final. Underline
  has no markdown equivalent and becomes plain text; `pdfEmbed` becomes a plain
  link (PDFs belong in the bijlagen, per Witse).
- The old WYSIWYG (`WysiwygEditor.tsx`, `PdfEmbed.ts`) and all `@tiptap/*`
  dependencies are REMOVED. Only the render-side fallback
  (`lib/tiptap-render.tsx`, dependency-free) remains for legacy JSON.

## Public routes (unchanged, both valid)

- `/[locale]/p/[slug]` for every published page.
- `/[locale]/[headerSlug]/[pageSlug]` additionally when the page hangs under a
  header category.

## Tests

Pure functions, because the risky logic here is decision logic, not glue:

- `test/reviewFirstPaging.test.ts` — the two-block paging window, checked
  against a reference implementation of the old "fetch all and slice" ordering
  over every combination of review/rest counts and page boundaries.
- `test/pageAccess.test.ts` — `canEditPageContent`, plus `losesOwnPageAccess`
  proven to fire **exactly** when the server would refuse. If those two ever
  disagree, a member gets an error page instead of the warning dialog.
- `test/pagePublish.test.ts` — `canPublishPages`, and the tri-state
  `published` rule (on / off / absent = don't touch).

## Gotchas worth keeping in mind

- **`contentEditedAt` only moves on a content save.** `savePageSettingsAction`
  and `savePageAction` must leave it alone, otherwise flipping a checkbox ticks
  off the yearly review without anyone reading the page.
- **An absent checkbox is not `false`.** See the publish tri-state above; the
  same trap applies to the inspector's role checkboxes, which stay mounted and
  CSS-hidden when collapsed.
- **A page with no editor roles is locked** to `pages.editAll`/superadmin. Any
  new code path that creates a page must give it roles, or the page is unusable
  the moment it exists. `createPageAction` is the only create path, on purpose.
- **The dev DB is not a scale test.** `/admin/paginas` pages at 25 and searches
  in Postgres; `/admin/inhoud` loads no markdown, no legacy JSON, no assets and
  no unlinked pages. Do not reintroduce a bare `include` on `page.findMany`.
- Operational gotcha hit during this build: the dep changes in this branch
  (removing `@tiptap/*`) made npm prune every platform's `lightningcss-*` and
  `@rolldown/binding-*` entries from `package-lock.json` (npm/cli#4828). On
  Windows that shows up as every page 500-ing in dev, but the committed
  lockfile was broken for Linux (server + CI) and macOS too. Fixed by
  regenerating the lockfile; `npm run verify:lockfile` now guards it in CI.
  See AGENTS.md ("Never hand-edit deps; regenerate the lockfile").

## Known limitations

- **Renaming a slug breaks existing links**; there is no redirect from the old
  address (it 404s). If pages start circulating externally, storing past slugs
  and redirecting is the fix.
- **Sorting `/admin/paginas` is on `titleNl` even in EN**: Postgres cannot order
  on `COALESCE(titleEn, titleNl)` through Prisma. Harmless while few pages have
  a separate EN title.
- **`pages.publish` is granted to no role yet.** Until it is assigned, only
  `pages.manage` holders and superadmins can publish.

## Infopagina's — wie schrijft wat, en het jaarlijkse nakijken

Infopagina's (`Page`) worden door de werkgroepen/posten zelf onderhouden, niet door
één centrale beheerder. De keuzes:

- **Bewerken is per rol.** Een pagina krijgt één of meer **bewerkrollen**
  (`PageEditorRole`, meerdere rollen per pagina kan). Wie het recht `pages.edit`
  heeft én zo'n rol draagt (dit werkingsjaar), mag de **inhoud** van die pagina
  bewerken in `/admin/paginas`. `pages.editAll` en superadmins mogen alles.
  - **Een pagina zonder bewerkrollen is vergrendeld**: enkel `pages.editAll` of een
    superadmin kan erbij. Een rol toekennen is dus de bewuste handeling die een
    pagina openzet, geen beperking achteraf.
- **De werkgroep beheert zelf wie mag meewerken.** Wie de inhoud van een pagina mag
  bewerken, mag daar ook de **bewerkrollen** en het **jaarlijks-nakijken-vinkje** van
  zetten, in een kaart onderaan de editor. Dit is bewust ruimer dan `pages.manage`:
  een werkgroep moet een collega kunnen toevoegen zonder daarvoor bij IT aan te
  kloppen. Je kan enkel de rollen wijzigen van een pagina waar je zelf al aan mag,
  dus dit geeft niemand toegang die hij nog niet had.
  - De instellingen committen met een eigen knop ("Wijzigen"), los van het opslaan
    van de inhoud: het zijn twee verschillende handelingen op één scherm.
  - **Jezelf buitensluiten mag, maar niet per ongeluk.** Vink je alle rollen weg die
    je zelf draagt, dan waarschuwt een extra dialoog dat je de pagina daarna niet
    meer kan bewerken en enkel `pages.editAll` of een superadmin het kan terugdraaien.
    Na het opslaan ga je terug naar het overzicht: op een pagina blijven staan die je
    niet meer mag bewerken, levert enkel een foutmelding op. Enkel dit geval krijgt
    een bevestiging; een gewone rolwijziging is niet destructief en gaat meteen door.
- **Een werkgroep maakt zelf pagina's aan.** Wie `pages.edit` of `pages.editAll`
  heeft, kan in `/admin/paginas` een nieuwe pagina maken en zelf de **slug** kiezen,
  en kan de slug van elke pagina waar hij aan mag later nog wijzigen (zolang ze vrij
  is; slugs zijn globaal uniek). Een pagina hoeft dus niet eerst door iemand met
  `pages.manage` aangemaakt te worden.
  - **Aanmaken is bewust minimaal**: titel en slug. De nieuwe pagina start als
    **concept zonder categorie**; onder een header-categorie hangen blijft
    `pages.manage`. Zo kan een werkgroep wel schrijven, maar niet ongemerkt iets
    in de navigatie zetten.
  - De pagina krijgt automatisch **de rollen van de maker** als bewerkrollen. Anders
    zou ze vergrendeld zijn op het moment dat ze bestaat en kon de maker zijn eigen
    pagina niet openen.
  - Een slug wijzigen **breekt bestaande links** naar het oude adres; de editor zegt
    dat erbij zodra je het veld aanpast.
- **Structuur is een aparte bevoegdheid** (`pages.manage`, het scherm
  `/admin/inhoud`): welke categorieën in de header staan, welke pagina daaronder
  hangt, publicatie en de excerpts. Slug, bewerkrollen en het jaarlijks-vinkje staan
  daar óók (handig bij het cureren van veel pagina's tegelijk); de editor is de
  tweede plek, voor de werkgroep zelf.
  - **`/admin/inhoud` gaat enkel over structuur.** De inhoud, de bijlagen en het
    verwijderen van een pagina zitten in de editor; ze staan hier bewust niet meer
    dubbel. "Pagina toevoegen" maakt dus géén nieuwe pagina maar zoekt een
    bestaande om onder de categorie te hangen; aanmaken hoort bij `/admin/paginas`,
    waar je meteen de inhoud kan schrijven.
  - **De boom toont enkel wat in de navigatie hangt.** Losse pagina's staan er niet
    meer in: dat is een lijst die eindeloos kan groeien en die niets zegt over de
    structuur. Een pagina uit de navigatie halen doe je met de categorie op "niet
    gekoppeld" te zetten; ze blijft bestaan en bereikbaar op `/p/<slug>`, en je
    vindt ze terug via de picker of via `/admin/paginas`.
- **Publiceren is een apart recht** (`pages.publish`, of `pages.manage`). Aan een
  pagina schrijven is niet hetzelfde als ze op de site zetten: een werkgroep kan een
  pagina voorbereiden, maar iemand met het publicatierecht zet ze live. De knop staat
  in de instellingen-kaart van de editor en verschijnt enkel voor wie het mag.
  - Wie niet mag publiceren, **verandert de status ook niet per ongeluk**: een save
    van zo iemand laat de publicatiestatus staan zoals ze is.
- **Verwijderen vergt `pages.delete` én toegang tot die pagina.** De knop staat
  onderaan de editor. Enkel het recht volstaat niet: anders kon iemand met
  `pages.delete` elke pagina van elke werkgroep wissen.
- **Jaarlijks nakijken** (`needsYearlyEdit`): sommige pagina's bevatten info die elk
  werkingsjaar verandert (namen, telefoonnummers, verantwoordelijken). Die pagina's
  staan bovenaan `/admin/paginas` met een gele markering zolang hun inhoud sinds de
  start van het werkingsjaar (15 juli, dezelfde cutover als de rollen) niet meer is
  opgeslagen (`contentEditedAt`). Opslaan in de editor is meteen het afvinken; er is
  bewust geen aparte "gezien"-knop.
- **Inhoud is markdown.** De editor is platte tekst (markdown) met een
  voorbeeld-tab en een werkbalk voor de basis (koppen, vet, links, afbeeldingen,
  lijsten); geavanceerdere markdown werkt maar krijgt geen knop. De oude
  WYSIWYG-inhoud (tiptap-JSON) blijft renderen tot een pagina één keer in de nieuwe
  editor is opgeslagen: de editor toont dan een automatische omzetting die de
  bewerker zelf nakijkt vóór het opslaan.
- **Geen PDF's in de inhoud.** PDF's en andere bestanden horen bij de **bijlagen**
  van de pagina (sectie onder de editor); downloads verschijnen onderaan de
  publieke pagina.
- **Twee geldige URL's.** Elke gepubliceerde pagina is bereikbaar op
  `/p/<slug>`; hangt ze onder een headercategorie, dan ook op
  `/<categorie-slug>/<slug>`. Beide blijven werken.

---
