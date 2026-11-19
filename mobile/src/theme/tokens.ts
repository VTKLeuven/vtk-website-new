/**
 * De kleuren en maten van de site, als waarden.
 *
 * Letterlijke port van `:root` in `apps/web/app/design/vtk-base.css` in
 * vtk-website-new. **Wijzigt daar een kleur, dan wijzigt ze hier mee**; dit
 * bestand staat daarom in de "Gekopieerd uit"-tabel in AGENTS.md.
 *
 * De site is bewust light mode ("cool paper"), en deze app volgt de site. Eén
 * scherm is de uitzondering: de scanner aan de deur (`SCANNER` onderaan), die in
 * het donker op armlengte gebruikt wordt.
 */

export const COLORS = {
  /** Tekst en donkere vlakken. */
  ink: '#0A0F1F',
  /** De donkere banden, de header en de voettekst. */
  navy: '#0E1A36',
  /** De grond van elke pagina. */
  paper: '#EFF2F8',
  /** Een tint dieper, voor banden en insets. */
  paper2: '#E6ECF5',
  /** Kaarten en panelen. */
  surface: '#FFFFFF',
  line: 'rgba(14, 26, 54, 0.10)',
  line2: 'rgba(14, 26, 54, 0.18)',
  /** Het enige accent. Spaarzaam gebruiken. */
  yellow: '#FFD23F',
  yellowDeep: '#EDBD22',
  muted: '#5C667F',
  body: '#34405E',
  /** Gedempte tekst op een donkere band. */
  onDarkMuted: '#B7C0DC',
  /** Wit op een donkere band; `paper` en niet puur wit, zoals op de site. */
  onDark: '#EFF2F8',
} as const;

/**
 * Op een donkere band zijn panelen "dark glass": een lichte vulling met een
 * lichte rand, geen tweede blok navy. Zie de Styling Guidelines in CLAUDE.md.
 */
export const DARK_GLASS = {
  background: 'rgba(255, 255, 255, 0.06)',
  border: 'rgba(255, 255, 255, 0.14)',
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

/** Kaarten en panelen zijn zacht afgerond, 16 tot 22; kleine knoppen pill. */
export const RADIUS = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

/**
 * De lettertypes zoals ze bij `useFonts` geladen worden. Inter draagt alles;
 * Instrument Serif bestaat enkel als cursief accent in de kop van het
 * beginscherm. Gebruik het niet voor gewone interfacetekst.
 */
export const FONTS = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  serifItalic: 'InstrumentSerif_400Regular_Italic',
} as const;

export const TYPE = {
  /** De titel in een donkere paginakop. */
  pageTitle: { fontFamily: FONTS.semibold, fontSize: 32, lineHeight: 34, letterSpacing: -0.9 },
  /** Een kop met de gele lijn eronder (`SectionHeading`), zoals een h2 op de site. */
  heading: { fontFamily: FONTS.semibold, fontSize: 20, lineHeight: 24, letterSpacing: -0.4 },
  sectionTitle: { fontFamily: FONTS.semibold, fontSize: 20, lineHeight: 26 },
  cardTitle: { fontFamily: FONTS.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18 },
  /** Bovenschriftje in kapitalen, zoals `.vtk-page-kicker`. */
  kicker: { fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 1.2 },
} as const;

/**
 * Het scherm aan de deur (`src/screens/scan/[eventId].tsx`) en zijn panelen.
 *
 * Het enige donkere scherm van de app, en dat is geen stijlkeuze: de scanner
 * staat aan een deur, in het donker, op armlengte, en een wit scherm verblindt
 * wie erop kijkt en wie ervoor staat. Het palet is dat van de webscanner, uit
 * `apps/web/app/design/vtk-tickets.css` (`.scanner-*`); **wijzigt daar een
 * kleur, dan wijzigt ze hier mee**. Eén accent (het VTK-geel) en vier
 * oordeelkleuren.
 */
export const SCANNER = {
  shell: '#111318',
  header: '#171a20',
  field: '#20242b',
  videoWell: '#090a0d',
  line: 'rgba(255,255,255,.10)',
  scrim: 'rgba(0,0,0,.55)',

  text: '#f7f7f4',
  textMuted: '#a7adba',
  accent: '#ffd23f',
  accentInk: '#111318',

  accepted: '#0d784c',
  duplicate: '#a66800',
  reversed: '#304c8c',
  rejected: '#ab1f39',

  onlineBg: 'rgba(39,190,125,.13)',
  onlineInk: '#6be0a7',
  offlineBg: 'rgba(239,81,100,.15)',
  offlineInk: '#ff8493',
  // Bewust niet alarmrood: offline scannen is een werkende toestand, geen fout.
  offlineBanner: '#74520d',
  conflictBanner: '#5c1524',

  countAccepted: '#63d59c',
  countDuplicate: '#ffd23f',
  countRejected: '#ff788b',
  countReversed: '#a9c4ff',
} as const;

/**
 * Het palet van `TicketType.color`, uit `apps/web/app/design/vtk-ticket-colors.css`
 * met de keys uit `apps/web/lib/ticketing/ticketColors.ts`. Bij een aanvaard ticket vult deze
 * kleur het hele camerabeeld, zodat een tapper van drie meter ziet welk ticket
 * het is.
 */
export const TICKET_COLORS = {
  navy: '#0e1a36',
  blue: '#17558f',
  amber: '#96590a',
  violet: '#5b3699',
  green: '#16663f',
  rose: '#a32259',
  slate: '#4a5468',
} as const;

/** Minimale aanraakoppervlakte aan de deur; dit wordt met handschoenen aan bediend. */
export const HIT_TARGET = 48;
