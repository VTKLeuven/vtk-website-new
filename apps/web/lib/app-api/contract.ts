/**
 * Het contract tussen de site en de VTK-app (`~/vtk-app`).
 *
 * **Dit bestand wordt letterlijk gekopieerd naar `src/api/contract.ts` in de
 * app-repo.** Daarom staan er enkel types en pure helpers in: geen prisma, geen
 * `server-only`, geen import uit `@/lib/...`, en zelfs geen zod. Dat laatste is
 * geen principe maar rekenwerk: de app heeft geen enkele reden om een
 * validatiebibliotheek mee te slepen voor een contract dat ze enkel leest. De
 * zod-schema's staan daarom in `schemas.ts` ernaast, aan de serverkant.
 *
 * Twee regels die de moeite zijn om te onthouden:
 *
 * 1. **Nooit een Prisma-vorm doorgeven.** Niet alleen omdat `@vtk/db` zijn
 *    client-types niet mag exporteren (zie AGENTS.md), maar omdat een
 *    geïnstalleerde app maanden ouder kan zijn dan de database. Een expliciete
 *    vorm is een belofte; een Prisma-rij is een momentopname van het schema.
 * 2. **De teksten zijn hier al gekozen.** De app stuurt `?locale=nl|en` mee en
 *    krijgt `title`, niet `titleNl` + `titleEn`. Anders zou de app `pick()` uit
 *    `@vtk/i18n` moeten nabouwen en zou elke nieuwe vertaalde kolom een
 *    app-release vragen.
 *
 * Breekt er iets aan een bestaande vorm, dan komt er `/api/app/v2` naast; deze
 * blijft dan staan zolang er toestellen op v1 zitten.
 */

export const APP_API_VERSION = 1;

export type AppLocale = "nl" | "en";

/** Leest `?locale=` uit een URL; alles wat geen geldige taal is wordt Nederlands. */
export function appLocaleFrom(value: string | null | undefined): AppLocale {
  return value === "en" ? "en" : "nl";
}

// -----------------------------------------------------------------------------
// Fouten
// -----------------------------------------------------------------------------

/**
 * Elke fout heeft dezelfde vorm en een stabiele `error`-code, zodat de app op de
 * code kan beslissen in plaats van op de tekst. `message` is Nederlands en mag
 * rechtstreeks getoond worden wanneer de app zelf niets beters weet.
 */
export type AppErrorBody = {
  error: string;
  message?: string;
  /** Enkel bij een validatiefout: per veld wat er scheelt. */
  fields?: Record<string, string[]>;
};

export const APP_ERROR = {
  unauthenticated: "UNAUTHENTICATED",
  forbidden: "FORBIDDEN",
  notFound: "NOT_FOUND",
  invalidRequest: "INVALID_REQUEST",
  serverError: "SERVER_ERROR",
} as const;

// -----------------------------------------------------------------------------
// Wie er kijkt
// -----------------------------------------------------------------------------

export type AppViewerGroup = {
  id: string;
  code: string;
  slug: string;
  name: string;
  /** Praesidiumpost of werkgroep; de app toont die twee apart. */
  type: "PRAESIDIUM" | "WERKGROEP";
  role: string;
};

export type AppViewer = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  locale: AppLocale;
  groups: AppViewerGroup[];
  /**
   * De twee poorten die `proxy.ts` op de website afdwingt. De proxy gaat over
   * pagina's en niet over `/api`, dus de app moet ze zelf zien en het
   * bijbehorende webscherm tonen; anders zit een nieuw lid in een app die
   * overal leeg blijft zonder te zeggen waarom.
   */
  needsOnboarding: boolean;
  needsStudyConfirmation: boolean;
};

// -----------------------------------------------------------------------------
// Navigatie
// -----------------------------------------------------------------------------

export type AppNavChild = {
  id: string;
  label: string;
  /** Intern pad zonder taalprefix (`/info/theokot`) of een volledige externe URL. */
  href: string;
  external: boolean;
};

export type AppNavTab = {
  id: string;
  slug: string;
  label: string;
  /** Absolute URL, of `null` wanneer er geen foto ingesteld is. */
  imageUrl: string | null;
  /** Gezet = deze tab is een link naar een andere site (bv. career.vtk.be). */
  externalUrl: string | null;
  children: AppNavChild[];
};

// -----------------------------------------------------------------------------
// Aankondiging
// -----------------------------------------------------------------------------

export type AppAnnouncement = {
  id: string;
  title: string;
  /** Markdown, net als op de site. Rauwe HTML staat uit. */
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

// -----------------------------------------------------------------------------
// Bootstrap
// -----------------------------------------------------------------------------

/**
 * Wat de app bij elke start ophaalt. Bewust één aanvraag: op een trage
 * mobiele verbinding is de eerste ronde het enige wat je voelt.
 */
export type AppBootstrap = {
  apiVersion: number;
  locale: AppLocale;
  /** `null` = niet ingelogd. De app werkt dan gewoon, met minder schermen. */
  viewer: AppViewer | null;
  tabs: AppNavTab[];
  announcement: AppAnnouncement | null;
  /**
   * De laagste appversie die deze server nog bedient. Staat de app eronder, dan
   * toont ze een bijwerkscherm in plaats van schermen die stuk kunnen zijn.
   * Semver, vergeleken op major.minor.patch.
   */
  minimumAppVersion: string;
  /**
   * De basis waar de app haar WebView-schermen op opent (login, onboarding,
   * betalen). Dat is dezelfde host als deze aanvraag, dus een cloudflared-tunnel
   * tijdens het testen werkt vanzelf mee.
   */
  webBaseUrl: string;
};

// -----------------------------------------------------------------------------
// Push
// -----------------------------------------------------------------------------

export type AppPushPlatform = "ios" | "android";

export type AppPushRegisterInput = {
  token: string;
  platform: AppPushPlatform;
  /** De versie van de app, puur om later te kunnen zien wie waarop zit. */
  appVersion?: string;
};

/**
 * Een Expo-pushtoken heeft de vorm `ExponentPushToken[...]` of `ExpoPushToken[...]`.
 * De app controleert dit voor ze iets stuurt, de server nog eens voor ze iets
 * bewaart; een token dat er niet zo uitziet gaat sowieso nergens heen.
 */
export const APP_PUSH_TOKEN_PATTERN = /^Expo(nent)?PushToken\[[^\]]+\]$/;

export function isAppPushToken(value: string): boolean {
  return APP_PUSH_TOKEN_PATTERN.test(value.trim());
}

// -----------------------------------------------------------------------------
// Theokot: broodjes bestellen
// -----------------------------------------------------------------------------

/**
 * Waar het bestelvenster van een verkoopdag staat. `UPCOMING` is "opent nog",
 * `CLOSED` is "deadline voorbij"; die twee zien er in de app anders uit, want
 * bij het eerste kan je terugkomen en bij het tweede niet.
 */
export type AppTheokotWindow = "UPCOMING" | "OPEN" | "CLOSED";

export type AppTheokotItem = {
  id: string;
  name: string;
  priceCents: number;
  /** Wat er nu nog van is, met de gereserveerde stukken er al af. */
  remaining: number;
  isWeeklySpecial: boolean;
  imageUrl: string | null;
  ingredients: string | null;
};

export type AppTheokotOrderLine = {
  name: string;
  quantity: number;
  unitPriceCents: number;
};

export type AppTheokotOrder = {
  orderId: string;
  status: string;
  totalCents: number;
  canCancel: boolean;
  lines: AppTheokotOrderLine[];
};

export type AppTheokotSession = {
  id: string;
  /** ISO-tijdstippen; de app maakt er zelf leesbare tijden van. */
  date: string;
  pickupStart: string;
  pickupEnd: string;
  orderOpenAt: string;
  orderCloseAt: string;
  window: AppTheokotWindow;
  canOrder: boolean;
  weeklySpecialName: string | null;
  items: AppTheokotItem[];
  /** Jouw bestelling voor deze dag, of `null`. Eén per dag. */
  order: AppTheokotOrder | null;
};

export type AppTheokotBan = {
  /** ISO. Tot dan kan je niet bestellen. */
  until: string;
};

export type AppTheokot = {
  sessions: AppTheokotSession[];
  /** Bericht van de Theokot-ploeg, Markdown. Leeg wanneer er niets staat. */
  message: string;
  maxItemsPerOrder: number;
  maxWeeklySpecialPerOrder: number;
  ban: AppTheokotBan | null;
};

export type AppTheokotOrderInput = {
  sessionId: string;
  lines: { sessionItemId: string; quantity: number }[];
};

/**
 * De weigeringen die de app zelf een zin bij maakt. Gelijk aan
 * `TheokotOrderErrorCode` in `lib/theokot-orders.ts`; die lijst is het origineel.
 * `INVALID_ORDER` komt van de lijncontrole en draagt de details mee in `fields`.
 */
export type AppTheokotErrorCode =
  | "BANNED"
  | "SESSION_NOT_FOUND"
  | "ORDER_CLOSED"
  | "ALREADY_ORDERED"
  | "ORDER_NOT_FOUND"
  | "NOT_CANCELABLE"
  | "CANCEL_DEADLINE_PASSED"
  | "INVALID_ORDER";

// -----------------------------------------------------------------------------
// Kalender
// -----------------------------------------------------------------------------

export type AppCalendarCategory = {
  slug: string;
  name: string;
  colour: string | null;
  /** Gezet = deze categorie hoort bij een doelgroep (eerstejaars, internationals). */
  audience: string | null;
};

export type AppCalendarEvent = {
  id: string;
  title: string;
  /** ISO. `allDay` bepaalt of de app een uur toont of enkel de dag. */
  start: string;
  end: string;
  allDay: boolean;
  location: string | null;
  imageUrl: string | null;
  groupName: string;
  groupSlug: string;
  categories: AppCalendarCategory[];
};

export type AppCalendarEventDetail = AppCalendarEvent & {
  /** Markdown, net als op de site. */
  description: string | null;
  /** Externe link bij het evenement, indien ingevuld. */
  url: string | null;
  /** Slug van het ticketevent wanneer er tickets voor te koop staan. */
  ticketSlug: string | null;
  /** Slug van het inschrijvingsformulier wanneer dat openstaat. */
  formSlug: string | null;
};

export type AppCalendar = {
  events: AppCalendarEvent[];
  categories: AppCalendarCategory[];
  /**
   * Of de doelgroepfilter meegespeeld heeft. De app zegt het erbij, zodat
   * iemand die zijn eigen evenement mist, weet waar het aan ligt.
   */
  filteredByAudience: boolean;
};

// -----------------------------------------------------------------------------
// Home
// -----------------------------------------------------------------------------

export type AppOpeningHoursEntry = {
  day: string;
  /** De uren zoals de beheerder ze intikte, of "Gesloten"/"Closed". */
  hours: string;
};

export type AppOpeningHours = {
  /** De naam van de dienst zelf ("Theokot"), zonder "Openingsuren" ervoor. */
  name: string;
  entries: AppOpeningHoursEntry[];
  /** De regel van vandaag, of `null` op een dag die niet in het rooster staat. */
  today: AppOpeningHoursEntry | null;
  /** Of het op dit moment open is volgens het rooster. */
  openNow: boolean;
  note: string;
  /**
   * De cursusdienst-uren komen live van cudi.vtk.be. Lukt dat niet, dan staat dit
   * op `true` en toont de app "niet beschikbaar" in plaats van een leeg rooster.
   */
  unavailable: boolean;
};

/**
 * De live geluidsstatus van 't ElixIr. `null` wanneer er nooit gemeten is; dan
 * geldt enkel het uurrooster. `stale` betekent dat de meting te oud is: dan
 * zeggen we niet dat de bar open is, want een verouderde "open" is erger dan
 * geen antwoord.
 */
export type AppBarStatus = {
  isOpen: boolean;
  decibels: number | null;
  lastUpdated: string;
  stale: boolean;
};

export type AppAftermovie = {
  id: string;
  title: string;
  /** Waar de video staat (YouTube, Vimeo). De app opent die in de browser. */
  externalUrl: string;
  posterUrl: string | null;
};

export type AppCareer = {
  title: string;
  body: string;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

export type AppPocPerson = {
  name: string;
  role: string | null;
  avatarUrl: string | null;
};

export type AppPoc = {
  id: string;
  name: string;
  email: string | null;
  people: AppPocPerson[];
};

export type AppPartner = {
  id: string;
  name: string;
  logoUrl: string | null;
  url: string | null;
};

export type AppHome = {
  /** De foto van de hero, beheerd via de voorpagina-instellingen. */
  heroPhotoUrl: string | null;
  openingHours: {
    theokot: AppOpeningHours;
    cursusdienst: AppOpeningHours;
    elixir: AppOpeningHours;
  };
  barStatus: AppBarStatus | null;
  upcomingEvents: AppCalendarEvent[];
  aftermovies: AppAftermovie[];
  career: AppCareer | null;
  /**
   * De POC's van jouw studierichtingen. Leeg voor wie niet ingelogd is of geen
   * richting heeft: een lijst van alle POC's is hier niet wat gevraagd wordt.
   */
  pocs: AppPoc[];
  partners: AppPartner[];
};

// -----------------------------------------------------------------------------
// Tickets
// -----------------------------------------------------------------------------

export type AppTicketQuestionType =
  | "SHORT_TEXT"
  | "LONG_TEXT"
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "BOOLEAN";

export type AppTicketQuestion = {
  id: string;
  code: string;
  label: string;
  description: string;
  type: AppTicketQuestionType;
  required: boolean;
  /** Enkel bij SINGLE_CHOICE en MULTIPLE_CHOICE. */
  options: string[];
};

export type AppTicketType = {
  id: string;
  name: string;
  description: string;
  priceCents: number;
  /** Wat er nu nog vrij is in de voorraadpot van dit type. */
  available: number;
  minPerOrder: number | null;
  maxPerOrder: number | null;
  /** Vragen die bij dit type horen, plus de vragen voor het hele event. */
  questions: AppTicketQuestion[];
};

export type AppTicketEvent = {
  id: string;
  slug: string;
  title: string;
  location: string | null;
  startsAt: string;
  endsAt: string;
  ownerGroupName: string;
  /** Hoeveel types er te koop staan; genoeg voor de lijst. */
  ticketTypeCount: number;
  /** De laagste prijs die nu te koop staat, in cent. `null` bij geen enkel type. */
  fromPriceCents: number | null;
  /**
   * Er staan enkel ledentickets open en je bent niet ingelogd. De app toont dan
   * een loginknop in plaats van een lege lijst.
   */
  requiresLogin: boolean;
};

export type AppTicketEventDetail = AppTicketEvent & {
  /** Markdown. */
  description: string;
  maxTicketsPerOrder: number;
  currency: string;
  contactEmail: string | null;
  /** Pad naar de verkoopvoorwaarden op de site. */
  termsUrl: string;
  ticketTypes: AppTicketType[];
};

/** Eén ticket in "mijn tickets". */
export type AppMyTicket = {
  id: string;
  publicId: string;
  status: string;
  attendeeName: string | null;
  typeName: string;
  /**
   * De inhoud van de QR-code. De app tekent die zelf; er komt geen afbeelding
   * over de lijn, want dat is een rondje meer voor iets dat het toestel in een
   * oogwenk zelf tekent.
   */
  credential: string;
  checkedInAt: string | null;
  /** Absolute URL's; `null` wanneer die wallet niet ingesteld is op de server. */
  pdfUrl: string;
  walletAppleUrl: string | null;
  walletGoogleUrl: string | null;
};

export type AppMyOrder = {
  id: string;
  orderNumber: string;
  status: string;
  totalCents: number;
  event: {
    slug: string;
    title: string;
    startsAt: string;
    location: string | null;
  };
  tickets: AppMyTicket[];
};

// -----------------------------------------------------------------------------
// Profiel
// -----------------------------------------------------------------------------

export type AppMyShift = {
  id: string;
  name: string;
  location: string;
  start: string;
  end: string;
  /** De post waarvoor de shift telt, of `null`. */
  post: string | null;
  reward: number;
};

export type AppProfile = {
  name: string;
  email: string;
  rNumber: string | null;
  avatarUrl: string | null;
  /** De studierichtingen zoals ze bij de studiebevestiging opgegeven zijn. */
  studyProgrammes: string[];
  groups: AppViewerGroup[];
  /** Shiften waarvoor je ingeschreven staat en die nog moeten komen. */
  upcomingShifts: AppMyShift[];
  /** Shiften die je dit academiejaar gedaan hebt en die nog niet uitbetaald zijn. */
  unpaidShiftsThisYear: number;
  totalShifts: number;
};

// -----------------------------------------------------------------------------
// Inhoud: categorieën en pagina's
// -----------------------------------------------------------------------------

export type AppDownload = {
  id: string;
  label: string;
  url: string;
  sizeBytes: number | null;
  mimeType: string | null;
};

export type AppOutlineItem = {
  /** Anker, gelijk aan wat `headingId()` op de site berekent. */
  id: string;
  text: string;
  level: 2 | 3;
};

export type AppPage = {
  slug: string;
  title: string;
  excerpt: string | null;
  imageUrl: string | null;
  /**
   * De inhoud als Markdown. Oudere pagina's staan als tiptap-JSON in de
   * database; die worden serverside omgezet, zodat de app maar één formaat hoeft
   * te kennen. Rauwe HTML staat uit, net als op de site.
   */
  content: string;
  outline: AppOutlineItem[];
  downloads: AppDownload[];
  /** De categorie waar deze pagina onder hangt, of `null`. */
  category: { slug: string; label: string } | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
};

export type AppCategoryPage = {
  slug: string;
  title: string;
  excerpt: string | null;
  imageUrl: string | null;
};

export type AppCategory = {
  slug: string;
  label: string;
  intro: string | null;
  pages: AppCategoryPage[];
  /** Menu-items die naar een andere site of app wijzen. */
  links: AppNavChild[];
};

// -----------------------------------------------------------------------------
// Zoeken
// -----------------------------------------------------------------------------

export type AppSearchResult = {
  kind: "page" | "event" | "link" | "material" | "album";
  id: string;
  title: string;
  /** Eén regel context: de categorie van een pagina, de datum van een evenement. */
  meta: string | null;
  /** Korte tekst rond de treffer, zonder opmaakmarkeringen. */
  snippet: string;
  /**
   * Waar dit resultaat heen gaat. Een pad op de site, of een volledige URL bij
   * een extern resultaat; `external` zegt welke van de twee.
   */
  href: string;
  external: boolean;
};

export type AppSearch = {
  query: string;
  /** `false` wanneer er te weinig getypt is om mee te zoeken. */
  searched: boolean;
  results: AppSearchResult[];
};

// -----------------------------------------------------------------------------
// Media
// -----------------------------------------------------------------------------

export type AppAlbum = {
  slug: string;
  title: string;
  description: string | null;
  /** ISO, of `null` wanneer het album geen datum draagt. */
  date: string | null;
  photoCount: number;
  coverUrl: string | null;
};

export type AppPhoto = {
  id: string;
  /** Schermklare versie; de app toont die en haalt niet het origineel op. */
  url: string;
  thumbUrl: string;
};

export type AppAlbumDetail = AppAlbum & {
  photos: AppPhoto[];
};

export type AppPublication = {
  id: string;
  title: string;
  kind: "bakske" | "ir-reeel";
  coverUrl: string | null;
  /** De PDF. Absolute URL. */
  url: string | null;
};

export type AppMedia = {
  albums: AppAlbum[];
  aftermovies: AppAftermovie[];
  publications: AppPublication[];
};

// -----------------------------------------------------------------------------
// Mensen
// -----------------------------------------------------------------------------

export type AppPerson = {
  name: string;
  role: string | null;
  avatarUrl: string | null;
};

export type AppPraesidiumGroup = {
  slug: string;
  name: string;
  description: string | null;
  people: AppPerson[];
};

export type AppPraesidium = {
  /** Het getoonde werkingsjaar; `2026` betekent 2026-2027. */
  year: number;
  /** Alle jaren waarvoor er gegevens zijn, nieuwste eerst. */
  years: number[];
  groups: AppPraesidiumGroup[];
};
