/**
 * De kleuren en maten van de site, als waarden.
 *
 * Letterlijke port van `:root` in `apps/web/app/design/vtk-base.css` in
 * vtk-website-new. **Wijzigt daar een kleur, dan wijzigt ze hier mee**; dit
 * bestand staat daarom in de "Gekopieerd uit"-tabel in AGENTS.md.
 *
 * De site is bewust light mode ("cool paper"). De scanner-app is dark, en dat is
 * de uitzondering: die staat in het donker aan een deur. Deze app volgt de site.
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
 * Instrument Serif bestaat enkel als cursief accent in de hero, precies zoals op
 * de site. Gebruik het niet voor gewone interfacetekst.
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
  pageTitle: { fontFamily: FONTS.bold, fontSize: 28, lineHeight: 34 },
  sectionTitle: { fontFamily: FONTS.semibold, fontSize: 20, lineHeight: 26 },
  cardTitle: { fontFamily: FONTS.semibold, fontSize: 16, lineHeight: 22 },
  body: { fontFamily: FONTS.regular, fontSize: 15, lineHeight: 22 },
  small: { fontFamily: FONTS.regular, fontSize: 13, lineHeight: 18 },
  /** Bovenschriftje in kapitalen, zoals `.vtk-page-kicker`. */
  kicker: { fontFamily: FONTS.semibold, fontSize: 11, letterSpacing: 1.2 },
} as const;
