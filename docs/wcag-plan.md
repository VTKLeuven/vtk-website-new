# WCAG 2.2 Level AA Target & Subagent Analysis Plan

This document sets the accessibility conformance target for `vtk.be` and defines
the multi-subagent plan to audit the codebase and live rendered UI, prioritise
remediation without merge conflicts, and enforce ongoing regression checks.

---

## 1. Target Rank & Scope

### Target conformance level: **WCAG 2.2 Level AA**

`vtk.be` targets full **WCAG 2.2 Level AA** conformance (all Level A and Level AA
success criteria across WCAG 2.0, 2.1, and 2.2; note that `4.1.1 Parsing` is
marked obsolete and removed in WCAG 2.2).

Why **WCAG 2.2 Level AA**:

- Matches EU Directive 2016/2102, the European Accessibility Act (EN 301 549),
  and Flemish / KU Leuven digital accessibility baselines.
- Adds concrete protections for real UI regressions already relevant to this
  codebase, notably `2.5.8 Target Size (Minimum)` (already referenced in
  `apps/web/app/design/vtk-home.css`), `2.4.11 Focus Not Obscured (Minimum)`
  for sticky headers/banners, `2.5.7 Dragging Movements` for file/crop controls,
  and `3.3.8 Accessible Authentication (Minimum)` for login/onboarding.
- Level AAA remains optional where feasible, not a release blocker.

### In-scope surfaces (Phase 1)

- **Routes**: all public and member-facing routes under
  `apps/web/app/[locale]/**` across both Dutch (`/`) and English (`/en`),
  `apps/web/app/(link-page)/links/page.tsx`, plus `apps/web/app/{layout,global-error,not-found}.tsx`
  and `apps/web/app/[locale]/{layout,error,not-found}.tsx`.
- **Shared & feature components**:
  - `packages/ui/src/{Button,Card,ConfirmDialog,form,cn}.tsx`
  - `apps/web/components/{site,editorial,calendar,forms,ticketing/public,profile,shift,theokot,palPlus,meetings,urenloop,link-page,ui}/**`
    (excluding admin subtrees)
- **Stylesheets**: `apps/web/app/globals.css`,
  `apps/web/app/design/vtk-*.css` (excluding `*-admin.css`), and
  `apps/web/components/shift/*.css`.

### Out-of-scope for Phase 1

- **Backoffice / Admin UI**: `apps/web/app/[locale]/admin/**`,
  `apps/web/components/admin/**`, `apps/web/components/*/admin/**`,
  `packages/ui/src/AdminNav*`, and `apps/web/app/design/vtk-*-admin.css`.
- **Volunteer gate scanner**: `apps/web/app/(scanner)/**` and
  `apps/web/components/ticketing/scanner/**`.
- **Separate apps**: `apps/logistiek`, `apps/fakbar`, and `mobile/`. These will
  be evaluated in Phase 2 once shared design tokens and `packages/ui`
  primitives are hardened in Phase 1.

---

## 2. WCAG 2.2 Level AA Criteria Checklist Summary

Every subagent audits its owned files against all applicable Level A and Level AA
criteria, grouped by the four POUR principles:

### Perceivable

- **Text alternatives (`1.1.1` A)**: meaningful `alt` on content images and
  logos; `alt=""` or `aria-hidden="true"` on decorative SVGs/icons; text
  alternatives for non-text status graphics (opening-hours timeline, coins, QR
  codes).
- **Time-based media (`1.2.1`-`1.2.5` A/AA)**: captions and accessible controls
  for video/audio players (`InlineVideoPlayer`, `AftermovieGrid`).
- **Adaptable (`1.3.1`-`1.3.5` A/AA)**: semantic landmarks (`header`, `nav`,
  `main`, `footer`), unbroken heading hierarchy (`h1` -> `h2` -> `h3`), proper
  table headers (`<th scope>`), `<fieldset>`/`<legend>` for grouped controls,
  DOM reading order matching visual layout, `orientation` unlocked (`1.3.4`),
  and `autocomplete` tokens on personal/auth inputs (`1.3.5`).
- **Distinguishable (`1.4.1`-`1.4.5`, `1.4.10`-`1.4.13` A/AA)**: never rely on
  colour alone (`1.4.1`); `4.5:1` contrast for normal text and `3:1` for large
  text (`1.4.3`); `200%` zoom/text resize (`1.4.4`); `320` CSS px reflow without
  two-dimensional scrolling (`1.4.10`); `3:1` non-text contrast for form
  borders, icons, badges, and focus rings (`1.4.11`); text spacing resilience
  (`1.4.12`); dismissible/hoverable/persistent tooltips and popovers (`1.4.13`).

### Operable

- **Keyboard accessible (`2.1.1`, `2.1.2`, `2.1.4` A)**: full keyboard support
  for every interactive action (no `<div onClick>` without role/keys), no
  keyboard traps, Escape closes modals/drawers/popovers and restores focus.
- **Enough time (`2.2.1`, `2.2.2` A)**: pause/stop/hide controls for
  auto-rotating carousels (`NewsCarousel`) and auto-updating UI.
- **Seizures (`2.3.1` A)**: no flashing > 3 times per second.
- **Navigable (`2.4.1`-`2.4.7`, `2.4.11` A/AA)**: skip-to-content link (`2.4.1`),
  unique descriptive `<title>` per route (`2.4.2`), logical focus order
  (`2.4.3`), clear link purpose (`2.4.4`), multiple ways to locate pages
  (`2.4.5`), descriptive headings/labels (`2.4.6`), visible `:focus-visible`
  indicator (`2.4.7`), and **focused element never completely hidden by sticky
  headers, banners, or cookie bars (`2.4.11` AA)**.
- **Input modalities (`2.5.1`-`2.5.4`, `2.5.7`, `2.5.8` A/AA)**: single-pointer
  and keyboard alternatives for **dragging movements (`2.5.7` AA)** such as
  image cropping and drag-and-drop uploads; **minimum `24x24` CSS px target size
  or equivalent spacing (`2.5.8` AA)**; accessible names matching visible labels
  (`2.5.3`).

### Understandable

- **Readable (`3.1.1`, `3.1.2` A/AA)**: `<html lang="nl-BE">` / `<html lang="en">`
  matches route locale (`3.1.1`), and **inline language switches (including
  Dutch CMS fallback text on `/en/...` routes and locale switcher labels) carry
  a `lang` attribute (`3.1.2` AA)**.
- **Predictable (`3.2.1`-`3.2.4`, `3.2.6` A/AA)**: no unexpected context changes
  on focus or input, consistent navigation and component behaviour across pages,
  and **consistent help placement across routes (`3.2.6` A)**.
- **Input assistance (`3.3.1`-`3.3.4`, `3.3.7`, `3.3.8` A/AA)**: clear error
  identification (`3.3.1`), visible labels/instructions (`3.3.2`), error
  suggestions (`3.3.3`), review/confirmation/reversal for financial and
  destructive actions (`3.3.4`), **no redundant re-entry across multi-step
  flows (`3.3.7` A)**, and **accessible authentication without cognitive puzzles
  or blocked paste/password managers (`3.3.8` AA)**.

### Robust

- **Compatible (`4.1.2`, `4.1.3` A/AA)**: accurate ARIA roles, states, and
  accessible names (`aria-expanded`, `aria-pressed`, `aria-current`,
  `aria-invalid`, `aria-describedby`), and **status messages announced via live
  regions (`role="status"` / `role="alert"` / `aria-live`) without moving focus
  (`4.1.3` AA)**.

---

## 3. VTK-Specific Codebase Watchpoints

Auditors must specifically check these known architectural patterns in `apps/web`:

1. **Laptop `:root { zoom: 0.9 }` (`apps/web/app/design/vtk-base.css`, lines 124-133)**:
   Between `1024px` and `1600px` with `(hover: hover) and (pointer: fine)`,
   `:root` applies `zoom: 0.9`. Verify how this affects rendered pointer target
   dimensions (`2.5.8`: a `24px` CSS box renders at `21.6px` visual px unless
   sized `>= 27px` or adequately spaced), `200%` text/page zoom (`1.4.4`),
   `320px` reflow (`1.4.10`), and JS bounding-box positioning (`CookieConsent`,
   popovers, `DailyChart`).
2. **Token Palette & Non-Text Contrast (`vtk-base.css`, `globals.css`)**:
   - Measure exact relative-luminance ratios for `--muted (#5C667F)` and
     `--body (#34405E)` on `--paper (#EFF2F8)`, `--paper-2 (#E6ECF5)`, and
     `--surface (#FFFFFF)`.
   - Measure `--on-dark-muted (#B7C0DC)`, `--status-open-on-dark (#52D98B)`,
     and `--status-closed-on-dark (#E58A70)` on `--navy (#0E1A36)` and dark
     glass cards (`rgba(255,255,255,0.06)`).
   - Check status chips (`--ok-*`, `--low-*`, `--full-*`, `--danger-*`),
     `--yellow (#FFD23F)` / `--accent-2 (#EDBD22)` accents, form input borders
     (`--line` at `0.10` alpha and `--line-2` at `0.18` alpha against `1.4.11`
     `3:1` control boundary contrast), and text placed over photo scrims.
3. **Landmarks, Sticky Header & Overlays (`[locale]/layout.tsx`, `Header.tsx`, `Footer.tsx`)**:
   - Presence and focus visibility of a skip-to-content link targeting
     `<main id="main">`.
   - `scroll-padding-top` and sticky chrome overlap so Tab navigation never
     leaves the focused element tucked behind the header, announcement bar, or
     cookie bar (`2.4.11`).
   - Keyboard, `Escape`, and `aria-expanded` / `aria-controls` behaviour on
     desktop header menus and mobile navigation drawer.
   - `ToastProvider` (`components/ui/toast.tsx`) ARIA live-region announcements
     for `SaveForm` outcomes (`4.1.3`).
4. **Bilingual Content & Markdown (`Markdown.tsx`, `PageView.tsx`, `LegalArticle.tsx`)**:
   - Prevent duplicate `<h1>` when CMS Markdown starts with `# ...`.
   - Ensure GFM `.vtk-table` scroll wrappers are keyboard-scrollable
     (`tabindex="0"`, accessible name) and use proper `<th scope>`.
   - Detect Dutch fallback content (`contentMdEn === null`) rendered inside an
     `<html lang="en">` page without a `lang="nl-BE"` wrapper (`3.1.2`).
5. **Custom Interactive Widgets**:
   - `BlueprintHero`: SVG `aria-hidden` vs interactive leader-line links and
     `prefers-reduced-motion` support.
   - `NewsBand` / `NewsCarousel`: pause button reachability, slide announcement,
     and disabled autoplay under `prefers-reduced-motion` (`2.2.2`).
   - `OpeningHoursBand`: accessible text equivalent for the timeline bar and
     now-line (`1.1.1`, `1.3.1`).
   - `AvatarCropField` & `FileDrop`: single-pointer / keyboard alternatives for
     drag-to-crop and drag-and-drop (`2.5.7`).
   - `ThemedSelect` & `ExclusiveChoiceGroup`: native vs custom ARIA roles and
     keyboard navigation.
   - `TicketShop` & `BancontactPayment`: stepper target sizes (`2.5.8`), live
     price/status updates (`4.1.3`), review/confirmation (`3.3.4`).
   - `ShiftBoard`, `RentalMonthGrid`, `MomentGrid`, `MeetingPlanner`: grid/table
     semantics, keyboard focus movement, and non-colour status indicators.

---

## 4. Multi-Subagent Analysis Plan (3 Waves)

The audit runs in three sequential waves so static code inspection, live DOM
testing, and remediation planning stay isolated, parallelised, and conflict-free.

### Wave 1: Parallel Static Code, CSS & Token Audit (7 Read-Only Shards)

Orchestrated via `run_workflow` using `parallel()` across 7 read-only subagents
(`workspace="inherit"`). Each shard owns a disjoint set of routes, components,
and stylesheets so there is zero duplicated effort and every file in scope is
covered once.

| Shard | Role | Owned Files | Primary WCAG Focus |
|---|---|---|---|
| **S1** | Token, Contrast, Zoom & Motion Auditor | `apps/web/app/globals.css`, `apps/web/app/design/{vtk-base,vtk-basic,vtk-motion}.css`, `packages/ui/src/{Button,Card,ConfirmDialog,form,cn}.tsx` | Programmatic contrast checks (`1.4.3`, `1.4.11`), `:focus-visible` rings (`2.4.7`), `:root { zoom: 0.9 }` math (`2.5.8`, `1.4.4`), `prefers-reduced-motion` (`2.2.2`), link underlines (`1.4.1`). |
| **S2** | Global Shell, Navigation, Overlays & UI Primitives Auditor | `apps/web/app/{layout,global-error,not-found}.tsx`, `apps/web/app/[locale]/{layout,error,not-found}.tsx`, `apps/web/app/[locale]/zoeken/page.tsx`, `apps/web/app/(link-page)/links/page.tsx`, `apps/web/components/site/{Header,Footer,LocaleSwitcher,ProfileMenu,SiteSearchForm,CookieConsent,FeedbackDialog,SiteAnnouncement,AnnouncementCard,AuthorizationPreviewBanner,NotFoundView,EditorialNavLinks}.tsx`, `apps/web/components/link-page/SocialIcon.tsx`, `apps/web/components/ui/{Link,IconButton,DeleteIconButton,InfoTip,ThemedSelect,ExclusiveChoiceGroup,SaveForm,AutoSaveForm,SlugField,formBusy,icons,toast}.tsx`, `apps/web/app/design/{vtk-site-header,vtk-site-chrome,vtk-feedback,vtk-search,vtk-link-page}.css`, `apps/web/components/ui/toast.css` | Skip link (`2.4.1`), `<html lang>` & `LocaleSwitcher` `lang` (`3.1.1`, `3.1.2`), landmarks, sticky header obscuration (`2.4.11`), consistent help (`3.2.6`), dropdown/drawer/dialog keyboard & focus traps (`2.1.1`, `2.1.2`, `2.4.3`), `IconButton` target size & `srLabel` (`2.5.8`, `4.1.2`), `ToastProvider` live announcements (`4.1.3`). |
| **S3** | Homepage, Editorial Bands, News & CMS Pages Auditor | `apps/web/app/[locale]/page.tsx`, `apps/web/app/[locale]/{nieuws,[headerSlug],p,praesidium,werkgroepen,pocs,contact,privacy,cookies,fakbar-huren,lesbezoeken,piano,grocomeet,24uur-app,sample}/**`, `apps/web/components/editorial/{HomeEditorial,BlueprintHero,NewsBand,NewsCarousel,NewsLetter,OpeningHoursBand,PocBand,AanbodEditorial,AftermovieGrid}.tsx`, `apps/web/components/editorial/hoursUtils.ts`, `apps/web/components/site/{PageView,PageOutline,LegalArticle,PartnerLogo,UrenloopPageBlock,Countdown}.tsx`, `apps/web/components/ui/{Markdown,InlineVideoPlayer,LinkedRow}.tsx`, `apps/web/app/design/{vtk-home,vtk-hero,vtk-news,vtk-aanbod,vtk-page,vtk-werkgroepen,vtk-contact,vtk-lesbezoeken,vtk-piano}.css` | `BlueprintHero` SVG semantics & reduced motion, `NewsCarousel` pause/keyboard/ARIA (`2.2.2`), `OpeningHoursBand` screen-reader structure (`1.1.1`, `1.3.1`), `AftermovieGrid` & `InlineVideoPlayer` captions/controls (`1.2.x`), `Markdown.tsx` headings & `.vtk-table` keyboard scroll, `PageView` NL fallback `lang="nl-BE"` (`3.1.2`), `PartnerLogo` alt text (`1.1.1`), contact form validation (`3.3.x`). |
| **S4** | Calendar, Events, Gallery & Public Forms Auditor | `apps/web/app/[locale]/{kalender,fotos,media,formulieren}/**`, `apps/web/components/calendar/**`, `apps/web/components/editorial/KalenderEditorialView.tsx`, `apps/web/components/editorial/calendarGrid.ts`, `apps/web/components/site/{CalendarSubscribe,PageGallery}.tsx`, `apps/web/components/forms/{FormFieldBlock,FormFieldInput,public/**}`, `apps/web/components/ui/{FileDrop,FileField}.tsx`, `apps/web/app/design/{vtk-kalender,vtk-event,vtk-eventcard,vtk-gallery,vtk-immich-gallery,vtk-media,vtk-forms}.css` | Month grid vs agenda keyboard & screen-reader navigation (`1.3.1`, `2.1.1`), `EventStar` / `EventInterest` toggle `aria-pressed` (`4.1.2`), photo gallery lightbox focus trap & keyboard arrows, `FaceSearchPanel` controls, `FileDrop` single-pointer/keyboard fallback (`2.5.7`), dynamic `PublicForm` labels, required state, and error descriptions (`3.3.1`-`3.3.4`). |
| **S5** | Ticketing, Shop & Checkout Auditor | `apps/web/app/[locale]/{tickets,shop}/**`, `apps/web/components/ticketing/public/**`, `apps/web/app/design/{vtk-tickets,vtk-ticket-catalog,vtk-ticket-shop,vtk-ticket-colors}.css` | Quantity steppers (`2.5.8` target size, accessible labels, live totals `4.1.3`), `PaymentMethodChooser` radio group semantics, checkout `autocomplete` (`1.3.5`), financial review/confirmation (`3.3.4`), redundant entry (`3.3.7`), `BancontactPayment` QR alt + live status polling (`4.1.3`), `TicketPass` & `TicketQrModal` dialog accessibility, ticket palette contrast (`1.4.3`, `1.4.11`). |
| **S6** | Authentication, Onboarding, Account & Profile Auditor | `apps/web/app/[locale]/{inloggen,registreren,wachtwoord-vergeten,koppel-vtk-account,onboarding,studie-bevestigen,lidmaatschap,account,ledenportaal,uitschrijven,sso-metadata}/**`, `apps/web/components/profile/**`, `apps/web/components/site/pleaseLogin.tsx`, `apps/web/app/design/vtk-career-optin.css` | `3.3.8` Accessible Authentication (paste permitted, password manager `autocomplete`, accessible show/hide toggle), `1.3.5` input purpose tokens on profile/address/study forms, `AvatarCropField` drag alternative (`2.5.7`), `CheckboxChip` / `MembershipChoice` / `StudyFieldset` `<fieldset>` + `<legend>` (`1.3.1`), multi-step `onboarding` & `ConfirmStudySteps` (`3.3.7`), OAuth consent clarity, self-service erasure confirmation (`3.3.4`). |
| **S7** | Member Interactive Tools Auditor (Shifts, Bureau, Theokot, PAL+, Urenloop, Meetings) | `apps/web/app/[locale]/{shift,bureau,bureau-inschrijving,theokot,info/theokot,pal-plus}/**`, `apps/web/components/{shift,theokot,palPlus,meetings,urenloop}/**`, `apps/web/components/editorial/{HomeShiftBand,ShiftRosterPopover}.tsx`, `apps/web/components/shift/{shift-board,shift-history}.css`, `apps/web/app/design/{vtk-theokot,vtk-theokot-verhuur,vtk-palplus,vtk-palplus-page,vtk-palplus-attendance,vtk-palplus-tags,vtk-urenloop-app}.css` | Interactive schedules and grids (`ShiftBoard`, `RentalMonthGrid`, `MomentGrid`, `MeetingPlanner`) keyboard reachability and table/grid roles, `ShiftDialog` & `ShiftRosterPopover` focus management, availability badges not relying on colour alone (`1.4.1`), `RewardCoins` text equivalents (`1.1.1`), `TagInput` keyboard chip removal, `PickupCounter` live region (`4.1.3`). |

#### Wave 1 Output Contract (JSON Finding Schema)

Each Wave 1 subagent returns an array of findings conforming to this schema so
the coordinator can validate, sort, and deduplicate programmatically:

```json
{
  "type": "array",
  "items": {
    "type": "object",
    "required": [
      "id",
      "shard",
      "wcagCriterion",
      "wcagTitle",
      "level",
      "severity",
      "file",
      "lineRange",
      "routesAffected",
      "summary",
      "evidence",
      "remediation",
      "effort"
    ],
    "properties": {
      "id": { "type": "string", "pattern": "^S[1-7]-[0-9]{3}$" },
      "shard": { "type": "string", "enum": ["S1", "S2", "S3", "S4", "S5", "S6", "S7"] },
      "wcagCriterion": { "type": "string", "pattern": "^[1-4]\\.[0-9]+\\.[0-9]+$" },
      "wcagTitle": { "type": "string" },
      "level": { "type": "string", "enum": ["A", "AA"] },
      "severity": { "type": "string", "enum": ["critical", "serious", "moderate", "minor"] },
      "file": { "type": "string" },
      "lineRange": { "type": "string" },
      "routesAffected": { "type": "array", "items": { "type": "string" } },
      "summary": { "type": "string" },
      "evidence": { "type": "string" },
      "remediation": { "type": "string" },
      "effort": { "type": "string", "enum": ["S", "M", "L"] }
    },
    "additionalProperties": false
  }
}
```

---

### Wave 2: Live Rendered & Interactive Browser Verification (3 Agents)

Executed against the local development server (`make up && make db && make dev`
listening on `http://localhost:3000`, using seeded test accounts) to catch
computed styles, layout overflow, focus obscuration, and dynamic state bugs that
static JSX analysis cannot observe.

| Agent | Role | Execution Tooling & Coverage |
|---|---|---|
| **B1** | Automated Axe & Lighthouse Runner | Runs Lighthouse accessibility audits and `@axe-core/playwright` (tags `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`) across representative anonymous and authenticated routes in both NL (`/`) and EN (`/en`) at 4 viewports: `320x640` (reflow), `375x812` (mobile), `1440x900` (laptop `zoom: 0.9`), and `1920x1080` (desktop). |
| **B2** | Keyboard, Focus Ring & Sticky-Header Obscuration Tester | Uses the `a11y-debugging` skill (Chrome DevTools MCP) / `browser` subagent to Tab and Shift+Tab through key end-to-end journeys (Header + Search, Homepage bands, Calendar -> Event -> Ticket checkout, Login -> Account, Shift signup, CookieConsent & FeedbackDialog). Verifies `2.1.2` (no focus traps), `2.4.3` (logical order), `2.4.7` (visible ring on light and `--navy`), and `2.4.11` (focused target never concealed by sticky chrome). |
| **B3** | Rendered Target Size, Reflow, Zoom & Reduced-Motion Inspector | Runs DOM evaluation scripts (`a11y-debugging` tap-target size, orphaned-input, contrast, and global page checks) at `1440x900` (`zoom: 0.9`) and `320x640`, plus `200%` text/page scaling and `prefers-reduced-motion: reduce`. Captures visual `2.5.8` (`< 24x24` px) violations, `1.4.10` horizontal scroll overflow, and unpaused animations. |

---

### Wave 3: Synthesis, Prioritized Remediation Waves & CI Regression Guards

1. **Deduplicate & synthesize into `docs/wcag-audit-report.md`**:
   Merge all Wave 1 and Wave 2 outputs, collapsing repeated symptoms across
   pages into single root-cause items (shared CSS tokens, layout chrome, or
   `components/ui` primitives).
2. **Execute fixes in conflict-free file-ownership waves**:
   When implementing fixes, consult the `modern-web-guidance` skill before
   editing HTML/CSS/client JS, and assign one owner per file (following the
   pattern in `docs/plan-site-modernisering.md`):
   - **P0 (System Foundations)**: `vtk-base.css` / `globals.css` token contrast
     and `:focus-visible` outlines, `[locale]/layout.tsx` skip link +
     `<main id="main">` + `scroll-padding-top`, `packages/ui` & `components/ui`
     primitives (`ToastProvider`, `IconButton`, `ThemedSelect`,
     `ConfirmDialog`), keyboard traps.
   - **P1 (Core Public & Transactional Journeys)**: `Header` / `Footer` /
     `CookieConsent` / `FeedbackDialog`, Homepage editorial bands, Calendar &
     Event detail, Ticketing checkout & `BancontactPayment`, Auth & Onboarding
     (`3.3.8`, `1.3.5`).
   - **P2 (Content Edge Cases & Member Tools)**: CMS `Markdown` (heading guard,
     `.vtk-table`, `lang="nl-BE"` fallback), Photo gallery &
     `FileDrop`/`AvatarCropField` (`2.5.7`), Shifts, Theokot, PAL+, Bureau,
     Meetings.
3. **Lock in WCAG 2.2 AA compliance with automated guards**:
   - Promote key `jsx-a11y` rules in `apps/web/eslint.config.mjs` to `"error"`
     so violations fail `npm run lint` and the `.githooks/pre-push` `npm run verify`
     gate automatically.
   - Add an accessibility Playwright smoke spec (`apps/web/e2e/a11y.smoke.spec.ts`)
     running `@axe-core/playwright` on core NL/EN public and member routes.
   - Re-run Wave 2 verification (B1-B3) on modified routes and update
     `docs/wcag-audit-report.md` with post-fix pass status before closing.
