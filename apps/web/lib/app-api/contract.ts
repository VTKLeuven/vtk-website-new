/**
 * Het contract tussen de site en de VTK-app (de repo vtk-app).
 *
 * **Dit bestand wordt letterlijk gekopieerd naar `src/api/contract.ts` in de
 * app-repo** (`npm run contract:sync` daar). Daarom staan er enkel types en
 * pure helpers in: geen prisma, geen `server-only`, geen import uit
 * `@/lib/...`, en zelfs geen zod. Dat laatste is
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
  /** Praesidiumpost, werkgroep of jaarwerking; de app toont die apart. */
  type: "PRAESIDIUM" | "WERKGROEP" | "JAARWERKING";
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
  /**
   * Welke knoppen deze gebruiker mag zien. `null` voor wie niet ingelogd is; die
   * mag sowieso niets van dit alles.
   */
  abilities: AppAbilities | null;
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
  /**
   * Na de deadline vrijgegeven en nu over te nemen, ook wat je zelf vrijgaf.
   * Enkel betekenisvol wanneer `AppTheokotSession.canTakeOver` waar is.
   */
  released?: number;
  isWeeklySpecial: boolean;
  imageUrl: string | null;
  ingredients: string | null;
};

export type AppTheokotOrderLine = {
  /** Het aanbod-item van die dag; nodig om de bestelling aan te passen of deels vrij te geven. */
  sessionItemId?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
};

export type AppTheokotOrder = {
  orderId: string;
  status: string;
  totalCents: number;
  canCancel: boolean;
  /**
   * Aanpassen kan zolang annuleren kan: binnen het bestelvenster, niet in de
   * doos van een grocomeet. Zelfde voorwaarden als `updateOrder` op de server.
   */
  canEdit?: boolean;
  /**
   * Na de deadline en voor het einde van de afhaal: wat je annuleert, wordt
   * vrijgegeven voor overname (`releaseOrder`). Blijft het liggen, dan telt het
   * als no-show.
   */
  canRelease?: boolean;
  /** Hoeveel broodjes van deze bestelling vrijgegeven zijn en nog niet overgenomen. */
  releasedCount?: number;
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
  /** Na de deadline, voor het einde van de afhaal: vrijgegeven broodjes overnemen kan. */
  canTakeOver?: boolean;
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

/** Een bestaande reservatie aanpassen (`PATCH /theokot/order`). Nul broodjes is annuleren. */
export type AppTheokotUpdateInput = {
  orderId: string;
  lines: { sessionItemId: string; quantity: number }[];
};

/**
 * Na de deadline vrijgeven (`POST /theokot/vrijgeven`). Zonder `lines` gaat
 * alles vrij; met `lines` enkel die aantallen, zodat wie één van twee broodjes
 * niet meer wil, het andere houdt.
 */
export type AppTheokotReleaseInput = {
  orderId: string;
  lines?: { sessionItemId: string; quantity: number }[];
};

/** Eén vrijgegeven broodje overnemen (`POST /theokot/overnemen`). */
export type AppTheokotTakeoverInput = { sessionItemId: string };

/**
 * De weigeringen die de app zelf een zin bij maakt. Komt uit
 * `TheokotOrderErrorCode` in `lib/theokot-orders.ts`; die lijst is het origineel.
 * Ook laat annuleren en overnemen (`TAKEOVER_CLOSED`, `RELEASE_NOT_POSSIBLE`,
 * `NOTHING_RELEASED`, `TAKEOVER_UNAVAILABLE`) lopen sinds november 2026 via de
 * app. `INVALID_ORDER` komt van de lijncontrole en draagt de details mee in
 * `fields`.
 */
export type AppTheokotErrorCode =
  | "BANNED"
  | "SESSION_NOT_FOUND"
  | "ORDER_CLOSED"
  | "ALREADY_ORDERED"
  | "ORDER_NOT_FOUND"
  | "NOT_CANCELABLE"
  | "CANCEL_DEADLINE_PASSED"
  | "TAKEOVER_CLOSED"
  | "RELEASE_NOT_POSSIBLE"
  | "NOTHING_RELEASED"
  | "TAKEOVER_UNAVAILABLE"
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
  /**
   * Wie het evenement organiseert, zoals het getoond hoort te worden: de
   * `organiserName` van het evenement wanneer die ingevuld is (een crossover of
   * een evenement van een partner), anders de naam van de beherende groep.
   */
  groupName: string;
  /** De groep die het evenement beheert. Blijft de groep, ook bij een externe organisator. */
  groupSlug: string;
  categories: AppCalendarCategory[];
  /**
   * Heb jij dit aangeduid als "ik ga waarschijnlijk". Altijd `false` voor wie
   * niet ingelogd is. Bewust geen inschrijving: er hangt geen plaats en geen
   * deelnemerslijst aan, enkel jouw eigen lijst en de herinnering van die dag.
   */
  interested: boolean;
  /**
   * Hoeveel mensen aanduidden dat ze komen, of `null` zolang het er te weinig
   * zijn. De drempel zit aan de serverkant (`INTEREST_PUBLIC_THRESHOLD`), dus een
   * laag getal komt hier niet eens aan: onder die grens leest een getal als "hier
   * komt niemand" en houdt het precies de mensen weg die het had moeten
   * overtuigen.
   *
   * Bewust `null` en niet `0` voor "te weinig": een oudere app-versie die dit
   * veld nog niet kent, valt met `null` vanzelf in de "toon niets"-tak, terwijl
   * `0` een echt nulaantal zou suggereren.
   */
  interestedCount: number | null;
  /** Er staan tickets voor te koop; de app kan dan meteen doorsturen. */
  ticketSlug: string | null;
  /**
   * De losse momenten van een evenement dat over meerdere dagen loopt (een
   * loopweek, drie filmavonden), oplopend. Leeg of afwezig: een gewoon evenement
   * van `start` tot `end`. Bij een reeks zijn `start` en `end` de envelop, van
   * het eerste tot het laatste moment; de app zet een reeks op de dag van het
   * eerstvolgende moment, zoals de kalender op de site.
   *
   * Optioneel omdat een oudere server het veld niet meestuurt.
   */
  moments?: AppEventMoment[];
};

/** Eén moment uit een reeks. Locatie leeg: die van het evenement. */
export type AppEventMoment = {
  /** ISO. */
  start: string;
  end: string;
  /** Een eigen naam voor dit ene moment ("Nachtloop"), of `null`. */
  label: string | null;
  location: string | null;
};

/**
 * Eén rij in de aanwezigheidslijst van een alumni-evenement.
 *
 * Enkel wie zelf aanvinkte zichtbaar te willen zijn. `name` is `null` wanneer
 * iemand wel zijn afstudeerjaar of VTK-verleden toont maar niet zijn naam; dat is
 * een geldige keuze en geen ontbrekend gegeven.
 */
export type AppEventAttendee = {
  key: string;
  name: string | null;
  graduationYear: number | null;
  wasInVtk: boolean;
};

export type AppCalendarEventDetail = AppCalendarEvent & {
  /** Markdown, net als op de site. */
  description: string | null;
  /** Externe link bij het evenement, indien ingevuld. */
  url: string | null;
  /**
   * De tekst op de knop naar die link, in de taal van het verzoek. Al opgelost
   * op de server (de redacteur kiest ze per evenement), dus de app toont ze
   * zoals ze binnenkomt. `null` zonder link.
   */
  urlLabel: string | null;
  /** Slug van het inschrijvingsformulier wanneer dat openstaat. */
  formSlug: string | null;
  /**
   * Draagt dit evenement de alumni-doelgroep? Alleen dan bestaat er een publieke
   * aanwezigheidslijst; elders is interesse een private markering.
   */
  isAlumniEvent: boolean;
  /**
   * De publieke aanwezigheidslijst. Leeg bij elk niet-alumni-evenement, en ook
   * bij een alumni-evenement waar niemand zichtbaar wou zijn. Het aantal
   * hieronder telt iedereen, ook wie niet in deze lijst staat.
   */
  attendees: AppEventAttendee[];
};

export type AppCalendar = {
  events: AppCalendarEvent[];
  categories: AppCalendarCategory[];
  /**
   * Of de doelgroepfilter meegespeeld heeft. De app zegt het erbij, zodat
   * iemand die zijn eigen evenement mist, weet waar het aan ligt.
   */
  filteredByAudience: boolean;
  /** Slugs van de categorieën die jij volgt. Leeg voor wie niet ingelogd is. */
  followedCategories: string[];
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
   * De banner zoals op /tickets: een eigen foto, de themabanner of de affiche
   * van het gekoppelde evenement. Absolute URL, of `null` zonder banner.
   * Optioneel voor een oudere server.
   */
  imageUrl?: string | null;
  /**
   * Er staan enkel ledentickets open en je bent niet ingelogd. De app toont dan
   * een loginknop in plaats van een lege lijst.
   */
  requiresLogin: boolean;
};

export type AppTicketEventDetail = AppTicketEvent & {
  /** Markdown. */
  description: string;
  /**
   * Wat deze koper in één bestelling kan nemen. Hoogstens één in de voorverkoop,
   * voor een erelid met "één ticket per erelid" of op een event met één ticket
   * per account; nul wanneer het account dat ene ticket al heeft.
   */
  maxTicketsPerOrder: number;
  /**
   * Deze ingelogde koper zit nu in de voorverkoop: hij koopt enkel voor
   * zichzelf, op de naam en het adres van zijn account. Toon die velden dan
   * vast ingevuld; de checkout weigert een andere naam met `PRESALE_SELF_ONLY`.
   * Optioneel voor een oudere server.
   */
  presaleSelfOnly?: boolean;
  /**
   * Een erelid op een event met "één ticket per erelid": `used` zegt of het dat
   * ticket al heeft. `null` voor iedereen anders. Optioneel voor een oudere server.
   */
  honoraryOneTicket?: { used: boolean } | null;
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
    /**
     * De banner van het event, dezelfde als in de shop; `null` zonder. Optioneel
     * voor een oudere server: de app toont dan het ticket zonder banner.
     */
    imageUrl?: string | null;
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
  /**
   * Dezelfde cover in schermmaat, voor de grote tegel bovenaan een lijst. De
   * thumbnail is 250 px breed en wordt wazig over de volle breedte van een
   * telefoon. Optioneel: een server van voor november 2026 stuurt hem niet.
   */
  coverPreviewUrl?: string | null;
};

export type AppPhoto = {
  id: string;
  /** Schermklare versie; de app toont die en haalt niet het origineel op. */
  url: string;
  thumbUrl: string;
  /**
   * Het origineel, om te bewaren. Bewust een apart veld en niet hetzelfde als
   * `url`: wat je toont mag klein zijn, wat je bewaart hoort de volle resolutie
   * te zijn. Dezelfde URL die de site achter zijn downloadknop hangt.
   */
  downloadUrl: string;
  /** De bestandsnaam zoals ze bedoeld is; de app bewaart ze daaronder. */
  filename: string;
};

export type AppSubAlbum = {
  id: string;
  slug: string;
  title: string;
  photoCount: number;
  photos: AppPhoto[];
};

export type AppAlbumDetail = AppAlbum & {
  photos: AppPhoto[];
  subAlbums?: AppSubAlbum[];
};

export type AppPublication = {
  id: string;
  title: string;
  kind: "bakske" | "ir-reeel";
  /** Bladzijde 1 als JPEG, of `null` voor een editie zonder kaft. */
  coverUrl: string | null;
  /** De PDF. Absolute URL. */
  url: string | null;
  /**
   * Enkel het nummer ("Week 6 / Semester 2"), zonder de naam van het blad, die
   * in `title` vooraan staat. Optioneel, zoals `publishedAt`: een oudere server
   * stuurt geen van beide, en dan toont de app `title`.
   */
  issue?: string | null;
  /** ISO-datum. De lijst komt al nieuwste eerst binnen. */
  publishedAt?: string | null;
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

// -----------------------------------------------------------------------------
// Shiften
// -----------------------------------------------------------------------------

export type AppShift = {
  id: string;
  name: string;
  description: string;
  /** Langere uitleg in Markdown, of `null`. */
  instructions: string | null;
  location: string;
  start: string;
  end: string;
  /** De post waarvoor de shift telt, of `null`. */
  post: string | null;
  reward: number;
  maxParticipants: number;
  takenSpots: number;
  /** Kan deze shift zonder Nederlands? Gaat over de taal, niet over wie welkom is. */
  openToInternationals: boolean;
  /** Sta jij ingeschreven? */
  registered: boolean;
  /**
   * Mag je je nu nog uitschrijven? Binnen 24 uur voor de start niet meer, tenzij
   * je net ingeschreven bent; die twee regels leven op de server en dit veld is
   * hun uitkomst, zodat de app ze niet nabouwt.
   */
  canUnregister: boolean;
  /** Vol, of al begonnen: dan kan je niet meer inschrijven. */
  canRegister: boolean;
  /**
   * Mag je bij deze shift aanduiden dat een student je plaats mag innemen? Enkel
   * voor het praesidium van het werkingsjaar van de shift, en niet op een shift
   * van de cursusdienst (`canBeReplaceable` op de server).
   */
  replaceableOption?: boolean;
  /** Je eigen keuze daarvoor, op een shift waarop je ingeschreven staat. */
  replaceable?: boolean;
  /**
   * Wie er al op staat, in de volgorde waarin ze zich inschreven: enkel de naam,
   * zoals op /shift (`lib/shift/roster.ts`). Een vervangbaar praesidiumlid wiens
   * plaats jij kan innemen, staat er niet bij, net zoals het niet meetelt in
   * `takenSpots`. Ontbreekt bij een server van voor november 2026.
   */
  roster?: AppShiftRosterEntry[];
};

export type AppShiftRosterEntry = {
  name: string;
  /** Dat ben jij. */
  isSelf: boolean;
};

export type AppShifts = {
  /** Waar je voor ingeschreven staat, eerst. */
  mine: AppShift[];
  available: AppShift[];
};

/** Een titel op de ladder van /shift/history (`lib/shift/tiers.ts`). */
export type AppShiftTier = {
  /** Vanaf zoveel shiften in een werkingsjaar. */
  min: number;
  name: string;
};

/**
 * Je werkingsjaar in shiften: hoeveel, welke titel, en wat de volgende is. Dezelfde
 * telling als /shift/history (`buildShiftHistory`): een shift telt zodra ze
 * voorbij is, afgenomen shiften gaan eraf.
 */
export type AppShiftYear = {
  /** "2026-2027". */
  label: string;
  count: number;
  /** Wat die shiften opleverden; nul in een praesidiumjaar. */
  vouchers: number;
  /** Dat werkingsjaar in een praesidiumpost: shiften tellen, maar leveren niets op. */
  praesidium: boolean;
  tier: AppShiftTier | null;
  next: AppShiftTier | null;
  /** Alle titels, van laag naar hoog. */
  tiers: AppShiftTier[];
  /** Vanaf zoveel shiften zit je in de voorverkoop (`PRESALE_SHIFT_THRESHOLD`). */
  presaleAt: number;
  /** Zit nu in een praesidiumpost, en dus al in de voorverkoop. */
  inPraesidiumNow: boolean;
};

/** Waarom een inschrijving geweigerd werd. Codes van `/api/shift/register`. */
export type AppShiftErrorCode = "FULL" | "STARTED" | "OVERLAP" | "NOT_FOUND" | "ALREADY";

// -----------------------------------------------------------------------------
// Peilingen van de RiVers
// -----------------------------------------------------------------------------

/**
 * Eén vraag uit een peiling. `low` en `high` zijn de woorden bij 1 en 5 van een
 * score, of `null`.
 */
export type AppPollQuestion = {
  id: string;
  kind: "YES_NO" | "SCORE" | "OPEN";
  text: string;
  low: string | null;
  high: string | null;
};

/**
 * Een open peiling voor de richting en fase van deze student, met wat die er
 * zelf al op antwoordde. De zinnen komen al vertaald van de server
 * (`lib/pocPolls/copy.ts`), net als op de homepage.
 *
 * **Anoniem**: de server bewaart geen gebruiker bij een antwoord, enkel een
 * sleutel per student per peiling. De app toont geen tussenstand.
 */
export type AppPoll = {
  id: string;
  title: string;
  /** De POC die het vraagt, of "VTK Onderwijs" voor een algemene peiling. */
  askedBy: string;
  openUntil: string;
  lead: string;
  thanks: string;
  anonymous: string;
  /** ISO. */
  closesAt: string;
  answered: boolean;
  questions: AppPollQuestion[];
  /** Per vraag-id het eigen antwoord: 1/0 bij ja-nee, 1-5 bij een score, tekst bij open. */
  answers: Record<string, { value: number | null; text: string | null }>;
};

export type AppPolls = {
  polls: AppPoll[];
  /**
   * Waarom er geen peiling staat voor wie er een zou verwachten: zonder richting
   * in het profiel weet de server niet welke POC jou vraagt.
   */
  missingProgramme: boolean;
};

/**
 * Antwoorden insturen. Per vraag-id een string zoals het formulier op de site
 * ze stuurt: "1"/"0" bij ja-nee, "1".."5" bij een score, de tekst bij open. Een
 * vraag die ontbreekt of leeg is, is overgeslagen. Opnieuw insturen vervangt
 * alles.
 */
export type AppPollAnswerInput = {
  pollId: string;
  answers: Record<string, string>;
};

/** Waarom een antwoord geweigerd werd. Codes van `submitPollAnswers`. */
export type AppPollErrorCode =
  | "POLL_CLOSED"
  | "POLL_NOT_YOURS"
  | "POLL_INVALID"
  | "POLL_TOO_LONG"
  | "POLL_EMPTY";

// -----------------------------------------------------------------------------
// Groepen: werkgroepen, POC's en het bureau
// -----------------------------------------------------------------------------

export type AppGroup = {
  slug: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  people: AppPerson[];
};

export type AppGroups = {
  /** Het getoonde werkingsjaar, of `null` bij een lijst zonder jaren. */
  year: number | null;
  years: number[];
  groups: AppGroup[];
};

// -----------------------------------------------------------------------------
// Piano
// -----------------------------------------------------------------------------

export type AppPianoSlot = {
  /** ISO. Meteen ook de sleutel waarmee je reserveert. */
  startsAt: string;
  endsAt: string;
  /** Vrij, van jou, of van iemand anders. */
  state: "FREE" | "MINE" | "TAKEN";
  /**
   * De naam van wie het slot heeft. Staat er ook bij een bezet slot van iemand
   * anders, net als op de site: zo zie je met wie je kan ruilen.
   */
  takenByName: string | null;
  /** Boekbaar op dit moment: vrij, en binnen het venster dat vooruit mag. */
  bookable: boolean;
  /**
   * Het id van jouw reservatie, enkel bij `state: "MINE"`. Zonder dit veld kan de
   * app een slot wel nemen maar niet meer loslaten.
   */
  reservationId: string | null;
};

export type AppPianoDay = {
  /** `yyyy-mm-dd` in de kalender van Brussel. */
  date: string;
  slots: AppPianoSlot[];
};

export type AppPiano = {
  days: AppPianoDay[];
  /** Uitleg van de beheerder, Markdown. */
  info: string;
  /** Hoeveel slots je per week mag hebben. */
  maxPerWeek: number;
  /** Hoeveel je er deze week al hebt, die nog moeten komen. */
  usedThisWeek: number;
  slotMinutes: number;
};

/** Waarom een reservatie geweigerd werd; gelijk aan `PianoErrorCode`. */
export type AppPianoErrorCode =
  | "NOT_FOUND"
  | "PAST"
  | "BEYOND_HORIZON"
  | "WEEK_LIMIT"
  | "TAKEN";

// -----------------------------------------------------------------------------
// Vandaag: het beginscherm van de app
// -----------------------------------------------------------------------------

/**
 * Eén dienst met haar toestand, al herleid tot wat er op één regel past.
 *
 * De site toont een volledig weekrooster naast elkaar; op een telefoon is de
 * vraag bijna altijd "kan ik er nu heen". Vandaar `openNow` plus één regel
 * `detail` ("tot 14:00", "morgen 12:00"), met het weekrooster erachter voor wie
 * doorklikt. Het rekenwerk gebeurt hier en niet in de app: de openingsuren staan
 * in wandkloktijd van Brussel, en een telefoon staat niet noodzakelijk op die
 * tijdzone.
 */
export type AppServiceStatus = {
  key: "theokot" | "cursusdienst" | "elixir";
  name: string;
  openNow: boolean;
  /** Eén regel: hoe lang het nog open is, of wanneer het weer opengaat. */
  detail: string;
  /**
   * De toestand is live gemeten in plaats van uit het rooster afgeleid. Enkel
   * 't ElixIr heeft dat (de geluidsmeting), en enkel wanneer de meting vers is.
   */
  live: boolean;
  /** De uren konden niet opgehaald worden (cursusdienst komt live van cudi). */
  unavailable: boolean;
  entries: AppOpeningHoursEntry[];
  note: string;
  /**
   * De vensters van vandaag in minuten sinds middernacht in Brussel, voor de
   * tijdlijn. `end` kan voorbij 1440 lopen (over middernacht); `null` is een avond
   * zonder vast sluitingsuur, zoals 't ElixIr. Optioneel voor een oudere server.
   */
  today?: AppHoursWindow[];
};

export type AppHoursWindow = { start: number; end: number | null };

/**
 * Eén ding dat op jou wacht. De app tekent ze als kaarten onder "Voor jou", op
 * volgorde zoals ze binnenkomen; de server sorteert, want die kent de
 * dringendheid.
 */
export type AppTodayTask = {
  kind:
    | "gate"
    | "theokot-pickup"
    | "theokot-order"
    | "ticket"
    | "shift"
    | "piano"
    | "poll"
    // Je staat vandaag aan de deur: een expliciete `SCANNER`-toekenning op een
    // event dat binnenkort begint of al loopt. Een oudere app kent dit niet en
    // tekent dan het standaardicoon; het pad (`/scan/<id>`) bestaat daar ook.
    | "scan";
  title: string;
  detail: string | null;
  /** Een route in de app (`/broodjes`), nooit een URL. */
  path: string;
  actionLabel: string | null;
  /** Dringend genoeg voor de gele rail op de kaart. */
  highlight: boolean;
  /** Het moment waar dit om draait, ISO. `null` wanneer er geen uur bij hoort. */
  at: string | null;
};

export type AppToday = {
  /**
   * De klok van de server. De app toont de datum hiermee en niet met die van het
   * toestel: een telefoon die op de verkeerde dag staat, zou anders beweren dat
   * het Theokot dicht is.
   */
  now: string;
  /** Voornaam, of `null` voor wie niet ingelogd is. */
  greetingName: string | null;
  services: AppServiceStatus[];
  barStatus: AppBarStatus | null;
  tasks: AppTodayTask[];
  /** Openstaande bonnetjes, of `null` voor wie niet ingelogd is. */
  vouchers: number | null;
  upcomingEvents: AppCalendarEvent[];
  announcement: AppAnnouncement | null;
  /** Er staat minstens één evenement klaar waarvoor jij tickets mag scannen. */
  canScanTickets: boolean;
  /** Je mag betalingen met bonnetjes aanvaarden (`shift.rewardRedeem`). */
  canAcceptVouchers: boolean;
};

// -----------------------------------------------------------------------------
// Meldingen
// -----------------------------------------------------------------------------

/**
 * De soorten pushbericht die een lid apart kan uitzetten.
 *
 * `defaultOn` is de stand zonder rij in de databank; enkel afwijkingen worden
 * bewaard. Zo hoeft er bij een nieuw soort bericht niets gemigreerd te worden.
 *
 * Wanneer een bericht gerechtvaardigd is, staat als kringkeuze in
 * `docs/design-decisions.md`. De korte versie: enkel wanneer je iets moet dóén.
 * `calendar.follow` is de bewuste uitzondering, want dat vraagt een lid zelf aan
 * per categorie.
 */
export const APP_NOTIFICATION_TOPICS = [
  { topic: "theokot.open", defaultOn: true },
  { topic: "theokot.pickup", defaultOn: true },
  { topic: "shift.reminder", defaultOn: true },
  { topic: "calendar.follow", defaultOn: true },
  { topic: "calendar.interest", defaultOn: true },
  { topic: "study.groupStart", defaultOn: true },
] as const;

export type AppNotificationTopic = (typeof APP_NOTIFICATION_TOPICS)[number]["topic"];

export function isAppNotificationTopic(value: string): value is AppNotificationTopic {
  return APP_NOTIFICATION_TOPICS.some((entry) => entry.topic === value);
}

/** De stand zonder opgeslagen voorkeur. */
export function defaultNotificationEnabled(topic: AppNotificationTopic): boolean {
  return APP_NOTIFICATION_TOPICS.find((entry) => entry.topic === topic)?.defaultOn ?? true;
}

export type AppNotificationSettings = {
  topics: { topic: AppNotificationTopic; enabled: boolean }[];
  /** Slugs van de kalendercategorieën die je volgt. */
  followedCategories: string[];
  /** Alle categorieën die je kan volgen, met hun naam in jouw taal. */
  categories: AppCalendarCategory[];
};

// -----------------------------------------------------------------------------
// Bonnetjes: verdiend met shiften, betaald aan een toog
// -----------------------------------------------------------------------------

/**
 * Eén regel in je bonnetjeshistoriek. `earned` komt van een shift die voorbij
 * is, `spent` van een balie die er afboekte. Het saldo is niet de som van deze
 * lijst: uitbetalingen in geld door een beheerder staan er niet in, want die
 * verhogen enkel `rewardPaid`.
 */
export type AppVoucherEntry = {
  id: string;
  kind: "earned" | "spent";
  amount: number;
  label: string;
  at: string;
};

export type AppVouchers = {
  /**
   * Wat je nu kan uitgeven: `reward` min `rewardPaid` over al je shiften. Kan op
   * een half eindigen, want een broodje aan de afhaalbalie kost per half
   * bonnetje.
   */
  balance: number;
  /** Hoeveel je er dit academiejaar bij verdiend hebt. */
  earnedThisYear: number;
  /**
   * Alles wat ooit verdiend werd, en wat daarvan al gebruikt is (opgehaald,
   * betaald of uitbetaald). `earned - used = balance`, ook voor wat `history`
   * niet kent. Ontbreekt bij een server van voor november 2026.
   */
  earned?: number;
  used?: number;
  /** Je shiften van dit werkingsjaar en je titel, zoals bovenaan /shift/history. */
  shiftYear?: AppShiftYear;
  history: AppVoucherEntry[];
  /**
   * De inhoud van de QR die je aan een balie toont. Kortlevend en ondertekend;
   * de app haalt hem opnieuw op wanneer hij verlopen is.
   */
  pass: string;
  passExpiresAt: string;
};

/**
 * Wat de balie ziet nadat ze een pas gescand heeft, vóór er iets afgeboekt is.
 * Twee stappen met opzet: wie afboekt, hoort eerst te zien van wie en hoeveel.
 */
export type AppPassHolder = {
  userId: string;
  name: string;
  rNumber: string | null;
  avatarUrl: string | null;
  /** Openstaand saldo; kan op een half eindigen. Aan de toog gaan enkel hele af. */
  vouchers: number;
  /** De broodjesbestelling van vandaag, of `null`. */
  theokotOrder: {
    orderId: string;
    status: string;
    totalCents: number;
    lines: AppTheokotOrderLine[];
    /** Nog niet opgehaald, en er zijn genoeg bonnetjes voor `voucherCost`. */
    canRedeemVouchers: boolean;
    /**
     * Hoeveel bonnetjes het duurste broodje uit de bestelling kost aan de balie:
     * een half per 60 cent (instelbaar bij Theokot), dus soms een half.
     */
    voucherCost: number;
  } | null;
};

export type AppVoucherRedeemInput = {
  pass: string;
  amount: number;
  /** Waar het gebeurde; komt in het logboek terecht. */
  place?: string;
};

export type AppVoucherRedeemResult = {
  name: string;
  amount: number;
  /** Wat de student daarna nog overhoudt. */
  remaining: number;
};

/** Waarom een afboeking geweigerd werd. */
export type AppVoucherErrorCode =
  | "PASS_INVALID"
  | "PASS_EXPIRED"
  | "NOT_ENOUGH"
  | "CONFLICT"
  | "SELF";

// -----------------------------------------------------------------------------
// Scannen: tickets, uitnodigingen en de fakbar
// -----------------------------------------------------------------------------

/** Een evenement waarvoor jij vandaag tickets mag scannen. */
export type AppScanEvent = {
  id: string;
  title: string;
  startsAt: string;
  location: string | null;
  checkedIn: number;
  total: number;
};

export type AppTicketScanResult = {
  result: "ACCEPTED" | "ALREADY_USED" | "WRONG_EVENT" | "INVALID" | "VOID" | "REFUNDED";
  ticket?: {
    publicId: string;
    attendeeName: string;
    typeName: string;
    checkedInAt: string | null;
  };
  stats: { total: number; checkedIn: number };
};

/** Wat een gescande uitnodigings-QR oplevert: scanrechten op één evenement. */
export type AppScannerInviteResult = {
  eventId: string;
  title: string;
  /** Je had die rechten al; dan is er niets bijgekomen. */
  alreadyHadAccess: boolean;
};

/**
 * Een check-in aan de bar, gescand van de QR naast de kaartlezer in plaats van
 * met een studentenkaart. Zelfde velden als wat het schermpje op de Pi krijgt.
 */
export type AppFakCheckin = {
  counted: boolean;
  name: string;
  total: number;
  points: number;
  double: boolean;
  freeBeer: boolean;
  /** Punten tot de volgende pint; 0 wanneer `freeBeers` uit staat. */
  toNextBeer: number;
  message: string | null;
  /**
   * De naam van de periode die nu loopt (een groot evenement van de fakbar, met
   * een check-in per uur), of null bij de gewone werking. Tijdens een periode is
   * `total` de stand van die periode, los van de jaarstand.
   */
  period: string | null;
  /** False wanneer de lopende periode geen gratis pinten geeft. */
  freeBeers: boolean;
};

/**
 * `BAR_CLOSED` is de belangrijkste: een opgehangen QR kan gefotografeerd worden,
 * dus een scan telt enkel wanneer 't ElixIr op dat moment ook echt open gemeten
 * wordt. Zie `docs/design-decisions.md`. `OUTSIDE_WINDOW`: er loopt een periode
 * en het is buiten haar dagelijkse venster, dus de scan telt niet.
 */
export type AppFakErrorCode = "BAR_CLOSED" | "INVALID_CODE" | "NO_RNUMBER" | "OUTSIDE_WINDOW";

// -----------------------------------------------------------------------------
// Wat de app zelf mag
// -----------------------------------------------------------------------------

/**
 * De knoppen die enkel voor sommige mensen bestaan. De app vraagt dit één keer
 * bij de start en verstopt wat er niet in staat; de server controleert het
 * daarna nog eens bij elke aanroep. Dit is dus geen beveiliging maar netheid:
 * een knop tonen die altijd "geen toegang" zegt, is een bug.
 */
export type AppAbilities = {
  scanTickets: boolean;
  acceptVouchers: boolean;
  theokotPickup: boolean;
  /**
   * Deze server is gekoppeld met Burgieclan, dus het tabblad Planning onder
   * Kalender werkt. Optioneel: een server van vóór de planning stuurt het niet,
   * en dan toont de app het tabblad niet.
   */
  planning?: boolean;
  /**
   * De admin: het dashboard en de onderdelen die deze persoon in het beheer
   * ziet. Enkel voor wie er minstens één onderdeel van mag openen; dat is
   * dezelfde regel als de zijbalk op /admin. Optioneel voor een oudere server.
   */
  admin?: boolean;
  /**
   * De transportplanning van Logistiek, met wat elke rit is. Dezelfde laag als
   * op logistiek.vtk.be/vervoer/bezetting: het praesidium, werkgroepen,
   * jaarwerkingen en het team. Een gewone student ziet ze niet.
   */
  transport?: boolean;
  /** Deze server is gekoppeld met cudi, dus de cursusdienst onder Studies werkt. */
  cudi?: boolean;
  /** Deze server is gekoppeld met Burgieclan, dus vakken en documenten onder Studies werken. */
  burgieclan?: boolean;
};

// -----------------------------------------------------------------------------
// Samen blokken: studietijd meten en naast die van je vrienden zetten
// -----------------------------------------------------------------------------

/**
 * De sessie die nu loopt.
 *
 * `seconds` is de stand op het moment van het antwoord; de app telt zelf verder
 * zolang het scherm openstaat en meldt zich elke minuut opnieuw. Dat is met opzet
 * zo verdeeld: de klok moet vloeiend lopen zonder elke seconde een aanvraag, maar
 * de waarheid komt van de server, want die telt ook wanneer de app dicht is.
 */
export type AppStudySession = {
  id: string;
  subject: string | null;
  /** Verbergt het vak voor groepsgenoten; de tijd blijft wel meetellen. */
  subjectHidden: boolean;
  startedAt: string;
  /** Netto seconden tot nu, pauzes er al af. */
  seconds: number;
  paused: boolean;
  pausedAt: string | null;
  /** Waar de server afkapt, zodat de app het kan zeggen voor het gebeurt. */
  maxSeconds: number;
};

/** Eén persoon in de zaal van een groep. */
export type AppStudyMemberState = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  /** Nu echt bezig: de app meldde zich net nog en staat niet op pauze. */
  studying: boolean;
  paused: boolean;
  /** Het vak, of `null` wanneer het niet ingevuld of verborgen is. */
  subject: string | null;
  /** Seconden van de lopende sessie; `null` wanneer er geen loopt. */
  liveSeconds: number | null;
  startedAt: string | null;
  weekSeconds: number;
  todaySeconds: number;
  isYou: boolean;
};

export type AppStudyGroup = {
  id: string;
  name: string;
  /** De code om te delen. Iedereen in de groep mag ze zien en doorgeven. */
  code: string;
  memberCount: number;
  liveCount: number;
  isOwner: boolean;
  /** Samen zoveel minuten per week halen. `null` betekent: niets afgesproken. */
  weeklyGoalMinutes: number | null;
  /** De som van de hele groep deze week, in seconden. */
  weekSeconds: number;
  /** Bezig eerst, daarna op tijd deze week. */
  members: AppStudyMemberState[];
};

/** Eén dag in het weekstrookje. `date` is `yyyy-mm-dd` in Brusselse tijd. */
export type AppStudyDay = {
  date: string;
  seconds: number;
  goalMet: boolean;
};

export type AppStudyOverview = {
  now: string;
  session: AppStudySession | null;
  todaySeconds: number;
  weekSeconds: number;
  /** Dagen op rij waarop je je dagdoel haalde. */
  streak: number;
  dailyGoalMinutes: number;
  /** De laatste zeven dagen, oudste eerst. */
  week: AppStudyDay[];
  /** Wat je eerder als vak intikte, meest recent eerst. */
  subjects: string[];
  groups: AppStudyGroup[];
};

/** Wat het stoppen van een sessie oplevert: de uitkomst plus het verse overzicht. */
export type AppStudyStopResult = {
  finishedSeconds: number;
  subject: string | null;
  overview: AppStudyOverview;
};

/**
 * Wat de app met een lopende sessie kan doen.
 *
 * `pause` en `resume` stuurt de app zelf wanneer ze naar de achtergrond gaat en
 * weer terugkomt; `heartbeat` is het levensteken dat zegt dat het scherm nog
 * openstaat. Blijft dat weg, dan telt de sessie tot het laatste teken van leven.
 */
export type AppStudyAction = "pause" | "resume" | "heartbeat";

export const STUDY_GROUP_ERRORS = [
  "NOT_FOUND",
  "GROUP_FULL",
  "TOO_MANY_GROUPS",
  "INVALID_NAME",
  "NOT_OWNER",
  "NOT_A_MEMBER",
] as const;

export type AppStudyGroupErrorCode = (typeof STUDY_GROUP_ERRORS)[number];

/**
 * Een lokaal in de lokalenzoeker.
 *
 * `label` is wat de app groot toont en waar mensen op zoeken: de korte code van
 * het gebouw plus het lokaalnummer, zoals het in een uurrooster staat
 * ("200K 00.06"). De app bouwt die string niet zelf op; de server is ook hier
 * de waarheid.
 */
export type AppRoom = {
  id: string;
  label: string;
  code: string | null;
  name: string;
  category: string;
  /** 0 is de gelijkvloers. Null wanneer het lokaalnummer geen verdieping noemt. */
  floor: number | null;
  buildingId: string;
  buildingName: string;
  buildingShortCode: string | null;
  kulagUrl: string;
};

export type AppBuilding = {
  id: string;
  /** Het gebouwnummer van de KU Leuven, bv. "490-13". */
  kulagId: string;
  shortCode: string | null;
  name: string;
  address: string;
  city: string;
  lat: number | null;
  lng: number | null;
  /** De contour als [[lat, lng], ...]; leeg voor een terrein zonder voetafdruk. */
  outline: [number, number][];
  photoUrl: string | null;
  kulagUrl: string;
  plans: { title: string; url: string }[];
  rooms: AppRoom[];
};


/**
 * De ondergrond van de campuskaart, uit OpenStreetMap.
 *
 * KU Leuven publiceert de gebouwen maar niet de paden ertussen; dat netwerk komt
 * hier vandaan en is wat "breng me erheen" een echte route maakt. De app rekent
 * de route zelf uit over deze graaf, dus dit gaat één keer mee en werkt daarna
 * zonder netwerk.
 *
 * **ODbL: "© OpenStreetMap contributors" hoort zichtbaar bij elke kaart die
 * hiermee getekend wordt.** Dat is de licentie, niet een nette gewoonte.
 */
export type AppCampusMap = {
  attribution: string;
  /**
   * Het wandelnetwerk. `nodes` zijn [lat, lng]-paren, `edges` verwijst met
   * indexen in `nodes`. Enkel de grootste samenhangende component: een los
   * stukje pad is geen route maar wel een val, want het dichtstbijzijnde
   * knooppunt bij een gebouw kan erin liggen.
   */
  walk: { nodes: [number, number][]; edges: [number, number][] };
  /**
   * Hier eindigt een route, niet in het zwaartepunt van het gebouw. `buildingId`
   * is exclusief: staan twee gebouwen tegen elkaar, dan hoort een deur bij het
   * gebouw waar ze het dichtst tegenaan ligt en niet bij allebei.
   */
  entrances: { lat: number; lng: number; main: boolean; buildingId: string | null }[];
  /** Bruikbaar vertrekpunt zolang de app de eigen positie niet kent. */
  busStops: { lat: number; lng: number; name: string | null }[];
  /** Gebouwen die KULag niet kent (Alma, IMEC), als context op de kaart. */
  context: [number, number][][];
};

export type AppRooms = {
  buildings: AppBuilding[];
  /** Enkel gevuld bij een zoekopdracht; anders leeg. */
  results: AppRoom[];
  /**
   * KULag screent enkel op toegankelijkheid, dus niet elk lokaal staat erin. De
   * app zegt dat en verwijst door in plaats van te doen alsof het niet bestaat.
   */
  sourceUrl: string;
  /** De ondergrond van de kaart. */
  campus: AppCampusMap;
};

// -----------------------------------------------------------------------------
// Planning: het lessenrooster en de deadlines van Burgieclan, met VTK erbij
// -----------------------------------------------------------------------------

/**
 * De planning van Burgieclan, zoals de app ze toont. **Dezelfde gegevens als op
 * burgieclan.be**: de site bewaart hier niets, ze vraagt het bij elke aanvraag
 * aan de backend van Burgieclan, namens het ingelogde lid (zie
 * `docs/burgieclan-planning.md`). Wat je in de app afvinkt, staat dus meteen ook
 * op Burgieclan afgevinkt, en omgekeerd.
 *
 * Alle data en uren zijn wandkloktijd in Leuven: `date` "YYYY-MM-DD", `start`
 * "HH:MM", `startMin`/`endMin` minuten sinds middernacht op `date`.
 */
export type AppPlanningMark = "event" | "rule" | null;

/** Een les uit het lessenrooster van KU Leuven. */
export type AppPlanningSession = {
  uid: string;
  date: string;
  start: string;
  end: string | null;
  startMin: number;
  endMin: number;
  /** "Power System Calculations: Lecture", zonder de code. */
  course: string;
  code: string | null;
  /** De sleutel van het vak in `subjects`. */
  subject: string;
  /** college | practicum | oefenzitting | excursie | opdracht | other */
  type: string;
  location: string | null;
  people: string | null;
  /** Afgevinkt: gevolgd of ingehaald. */
  done: boolean;
  /** Verborgen, enkel deze les (`event`) of elke week op dit uur (`rule`). */
  hidden: AppPlanningMark;
  hiddenRule: string | null;
  mandatory: AppPlanningMark;
  mandatoryRule: string | null;
  /** Het vak op Burgieclan, wanneer het daar gekend is. */
  courseUrl: string | null;
};

/** Een deadline of een verplichte sessie die iemand zelf invulde. */
export type AppPlanningItem = {
  id: string;
  subject: string;
  subjectLabel: string;
  kind: "deadline" | "mandatory";
  title: string;
  date: string;
  /** Leeg bij een deadline op het einde van de dag. */
  time: string | null;
  end: string | null;
  note: string;
  done: boolean;
};

/** Eén keer dat een VTK-evenement plaatsvindt: het evenement zelf, of één moment van een reeks. */
export type AppPlanningOccurrence = {
  key: string;
  date: string;
  /** Na middernacht of over meerdere dagen: de laatste dag. */
  endDate: string;
  start: string | null;
  end: string | null;
  startMin: number;
  /** Loopt het na middernacht door, dan 1440 op `date`. */
  endMin: number;
  allDay: boolean;
  label: string | null;
  location: string | null;
};

/** Een VTK-evenement dat iemand in zijn planning zette. */
export type AppPlanningVtkEvent = {
  /** De id van het evenement, zoals `/kalender/<id>` in de app. */
  id: string;
  title: string;
  location: string | null;
  url: string;
  occurrences: AppPlanningOccurrence[];
};

/**
 * Een examen in de blokkalender van Burgieclan. `subject` is "course:<id>" voor
 * een vak uit de catalogus van Burgieclan, of "name:<naam>" voor een vak dat
 * iemand zelf intypte; dezelfde sleutels als `subjects` in de planning.
 */
export type AppPlanningExam = {
  id: string;
  subject: string;
  subjectLabel: string;
  date: string;
  /** "HH:MM", of null wanneer er geen uur ingevuld is. */
  time: string | null;
};

/** Wat iemand op een dag van de blok wil doen; voorbij en niet afgevinkt = in te halen. */
export type AppPlanningTask = {
  id: string;
  date: string;
  /** null voor een taak die bij geen vak in het bijzonder hoort. */
  subject: string | null;
  subjectLabel: string | null;
  title: string;
  done: boolean;
};

/**
 * De blokkalender van Burgieclan (het tabblad Blok in de planner): examens,
 * per dag wat je wil doen, en vrije dagen. Die vult iemand zelf in; er wordt
 * niets voor hem gepland, en ze werkt ook zonder lessenrooster. De studietimer
 * van Burgieclan staat er niet bij: in de app is dat Samen blokken.
 */
export type AppPlanningBlock = {
  exams: AppPlanningExam[];
  tasks: AppPlanningTask[];
  freeDays: string[];
};

export type AppPlanning = {
  /**
   * `false` wanneer deze site niet met Burgieclan gekoppeld is (geen
   * `BURGIECLAN_API_URL` of geheim). De app toont de planning dan niet.
   */
  available: boolean;
  /** Een lessenrooster gekoppeld. Zonder is de rest leeg en toont de app de stap om te koppelen. */
  subscribed: boolean;
  /** Vandaag in Leuven, "YYYY-MM-DD", en het aantal minuten sinds middernacht. */
  today: string;
  now: number;
  /** ISO, of null voor de eerste geslaagde synchronisatie. */
  lastSync: string | null;
  /** Waarom de laatste synchronisatie met KU Leuven mislukte (in het Engels, van Burgieclan). */
  syncError: string | null;
  /** De abonnementslink van het lessenrooster, zoals ze bewaard is. */
  icsUrl: string | null;
  /** De geëxporteerde agenda: lessen zonder de verborgen, deadlines en VTK-evenementen. */
  feedUrl: string | null;
  /** Dezelfde link als `webcal://`, voor "Abonneren" in een agenda-app. */
  webcalUrl: string | null;
  /** De planning op Burgieclan zelf. */
  burgieclanUrl: string;
  subjects: { key: string; label: string }[];
  sessions: AppPlanningSession[];
  items: AppPlanningItem[];
  vtkEvents: AppPlanningVtkEvent[];
  /**
   * De blokkalender. Optioneel: een server van voor november 2026 stuurt ze
   * niet mee, en de app toont het tabblad Blok dan leeg.
   */
  block?: AppPlanningBlock;
};

/** Een vak bij een examen of een taak: "course:<id>" of "name:<naam>". */
export type AppPlanningExamInput = { subject: string; date: string; time: string | null };
/** `subject` null en een lege titel mag niet; een vak zonder titel wordt de naam van het vak. */
export type AppPlanningTaskInput = { date: string; subject: string | null; title: string };

/**
 * Eén wijziging aan de planning (`POST /planning/operations`). Dezelfde
 * operaties als op Burgieclan; elke operatie antwoordt met de hele `AppPlanning`.
 */
export type AppPlanningOperation =
  | { op: "done" | "hide" | "mandatory"; uid: string; value: boolean }
  | { op: "keepOnly"; uid: string }
  | { op: "addRule"; uid: string; action: "hide" | "mandatory" }
  | { op: "removeRule"; id: string }
  | { op: "itemDone"; id: string; value: boolean }
  | { op: "deleteItem"; id: string }
  | {
      op: "addItem";
      item: {
        subject: string;
        kind: "deadline" | "mandatory";
        title: string;
        date: string;
        time: string | null;
        end: string | null;
        note: string;
      };
    }
  | { op: "addVtkEvent" | "removeVtkEvent"; vtkEventId: string }
  // De blokkalender (sinds november 2026).
  | { op: "addExam"; exam: AppPlanningExamInput }
  | { op: "updateExam"; id: string; exam: AppPlanningExamInput }
  | { op: "deleteExam"; id: string }
  | { op: "addTask"; task: AppPlanningTaskInput }
  | { op: "updateTask"; id: string; task: AppPlanningTaskInput }
  | { op: "deleteTask"; id: string }
  | { op: "taskDone"; id: string; value: boolean }
  /** Zet elke taak die voorbij is en niet afgevinkt, op `date`. */
  | { op: "catchUp"; date: string }
  | { op: "freeDay"; date: string; value: boolean };

// -----------------------------------------------------------------------------
// Beheer: de admin in de app, voor wie er toegang toe heeft
// -----------------------------------------------------------------------------

/**
 * Een onderdeel van de admin. `url` is absoluut: de app opent het in een
 * WebView zonder de kop en de voet van de site (`html[data-vtk-app]`), met de
 * sessie die ze al heeft. Een extern adres (`external`) opent in de browser.
 */
export type AppAdminLink = {
  key: string;
  label: string;
  url: string;
  external: boolean;
};

/** Dezelfde groepen en volgorde als de zijbalk op /admin, gefilterd op jouw rechten. */
export type AppAdminSection = {
  key: string;
  /** `null` voor een los item zonder groep. */
  label: string | null;
  links: AppAdminLink[];
};

/** Een tegel van het dashboard: gedeeld, van je post, of je eigen. */
export type AppAdminTile = {
  id: string;
  label: string;
  url: string;
  external: boolean;
  /**
   * Het pictogram als SVG-pad (24x24, lijn van 1.6), zoals het dashboard het
   * tekent; de set is eigen aan de site en zit niet in lucide.
   */
  iconPath: string;
  /** De chip van de tegel, in de kleur die de maker koos uit het palet van de site. */
  chip: { background: string; foreground: string };
  /** Een geüpload logo in plaats van het pictogram, of null. */
  imageUrl: string | null;
  /** "Voor iedereen", de naam van je post, of "Van jou". */
  section: string;
  /** Waar de sectie vandaan komt: het bolletje voor de kop is navy, geel of grijs. */
  sectionKind?: "global" | "group" | "own";
  /** "door beheerders ingesteld", "jouw post", "alleen jij ziet deze". */
  sectionHint?: string;
  /** De host van de link, gedempt onder de naam, zoals op het dashboard. */
  host?: string;
};

/** Een resultaat dat je post nog naar het bestuursorgaan moet brengen. */
export type AppAdminBoDue = {
  post: string;
  activity: string;
  /** "budget op BO 3 · 12 dagen open", zoals op het dashboard. */
  detail: string;
  /** Het rekenblad in Drive, of Mijn budgetten. */
  url: string;
};

export type AppAdminDashboard = {
  /** De admin zelf, voor "Openen op de site". */
  adminUrl: string;
  /** Snelkoppelingen aanpassen (/admin/dashboard-tiles). */
  tilesUrl?: string;
  /** Deze persoon mag de voordeur op afstand openen (`door.remoteOpen`). */
  canOpenDoor: boolean;
  tiles: AppAdminTile[];
  boDue: AppAdminBoDue[];
  sections: AppAdminSection[];
};

/** Waarom de deur niet openging; dezelfde codes als `openDoorRemoteAction`. */
export type AppDoorErrorCode = "not_configured" | "unreachable" | "pi_error";

// -----------------------------------------------------------------------------
// Transportplanning van Logistiek
// -----------------------------------------------------------------------------

export type AppTransportVehicle = {
  id: string;
  name: string;
  /** De bestelwagen vraagt een chauffeur met dat rijbewijs; de bakfiets geen chauffeur. */
  needsDriver: boolean;
  /**
   * De arcering van dit voertuig in de planning (`diagonal`, `vertical`, `dots`,
   * `grid`), of null. De vulkleur is de chauffeur, het patroon het voertuig.
   */
  pattern?: "diagonal" | "vertical" | "dots" | "grid" | null;
};

export type AppTransportStatus = "REQUESTED" | "APPROVED" | "COMPLETED";

/**
 * Eén rit, met wat een post erover hoort te weten. **Geen** telefoonnummers,
 * ophaaladres of nota's: die zijn van een persoon of het werkblad van Logistiek
 * (zie `transportWeekForPraesidium` in apps/logistiek).
 */
export type AppTransportTrip = {
  id: string;
  vehicleId: string;
  start: string;
  end: string;
  status: AppTransportStatus;
  /** "HEEN" of "TERUG" bij een rit in twee delen, anders null. */
  leg: "HEEN" | "TERUG" | null;
  /** De naam van het evenement, of het doel als er geen evenement is. */
  title: string;
  purpose: string | null;
  cargo: string | null;
  destination: string | null;
  /** De post die de rit aanvroeg, of de naam van een externe aanvrager. */
  requester: string | null;
  /** Wie de aanvraag indiende. */
  submittedBy: string | null;
  driver: string | null;
  /** "AH": het bolletje in het blok. */
  driverInitials?: string | null;
  /**
   * De kleuren van de chauffeur zoals logistiek.vtk.be ze tekent: de vulling van
   * het blok en de donkerdere toon van het bolletje. Zonder chauffeur het
   * neutrale grijs en null.
   */
  fill?: string;
  tone?: string | null;
  helpers: string[];
  /** Deze rit is van jou of van je post. */
  mine: boolean;
};

export type AppTransportWeek = {
  /** Maandag van de week, "YYYY-MM-DD" in Brussel. */
  weekStart: string;
  /** Het ISO-weeknummer, voor "Week 48". */
  weekNumber?: number;
  vehicles: AppTransportVehicle[];
  trips: AppTransportTrip[];
  /** logistiek.vtk.be/vervoer, om een rit aan te vragen of te wijzigen. */
  logistiekUrl: string;
};

// -----------------------------------------------------------------------------
// Burgieclan: je vakken en hun documenten
// -----------------------------------------------------------------------------

export type AppBurgieclanCourse = {
  id: number;
  code: string;
  name: string;
  credits: number | null;
  /** Zoals Burgieclan ze kent, bv. ["Semester 1"]. */
  semesters: string[];
  professors: string[];
  documentCount: number;
  favorite: boolean;
  /** De vakpagina op Burgieclan, om iets op te laden of te bespreken. */
  url: string;
};

export type AppBurgieclanDocument = {
  id: number;
  name: string;
  category: string;
  /** Academiejaar, bv. "2024 - 2025". */
  year: string | null;
  author: string | null;
  fileSize: number | null;
  hasFile: boolean;
  /** Nog niet goedgekeurd; enkel zichtbaar omdat het van jou is. */
  underReview: boolean;
  createdAt: string;
};

export type AppBurgieclanCourses = {
  /** `false` wanneer deze site niet met Burgieclan gekoppeld is. */
  available: boolean;
  courses: AppBurgieclanCourse[];
  /** Burgieclan zelf. */
  burgieclanUrl: string;
};

export type AppBurgieclanComment = {
  id: number;
  content: string;
  /** Academiejaar waarover het gaat, bv. "2024 - 2025". */
  year: string | null;
  /** Null wanneer de schrijver anoniem bleef. */
  author: string | null;
  createdAt: string;
  /** Stemmen voor min stemmen tegen. */
  score: number;
};

/** Eén rubriek van de vakevaluatie, zoals op de vakpagina van Burgieclan. */
export type AppBurgieclanEvaluationSection = {
  id: number;
  name: string;
  description: string | null;
  /** Met sterren (1 tot 5); anders enkel opmerkingen. */
  rated: boolean;
  lowLabel: string | null;
  highLabel: string | null;
  /** `average` is null onder het minimum aantal scores, zoals op Burgieclan. */
  recent: { average: number | null; count: number };
  allTime: { average: number | null; count: number };
  comments: AppBurgieclanComment[];
};

export type AppBurgieclanEvaluations = {
  /** De academiejaren die als "recent" tellen. */
  recentYears: string[];
  sections: AppBurgieclanEvaluationSection[];
};

export type AppBurgieclanCourseDetail = {
  course: AppBurgieclanCourse;
  documents: AppBurgieclanDocument[];
  /** Optioneel: een oudere server stuurt geen evaluaties. */
  evaluations?: AppBurgieclanEvaluations;
};

/** Een link naar het bestand, tien minuten geldig. */
export type AppBurgieclanFile = { url: string; expiresInMinutes: number };

// -----------------------------------------------------------------------------
// Cursusdienst (cudi.vtk.be): reserveren en je bestellingen
// -----------------------------------------------------------------------------

/**
 * Iets wat eerst op cudi zelf moet gebeuren: de voorwaarden aanvaarden (een
 * juridische stap, dus in een WebView op cudi), of de kring heeft de shop
 * dichtgezet.
 */
export type AppCudiGate = { kind: "TERMS" | "SHOP_HIDDEN"; url: string };

export type AppCudiOrdering = {
  open: boolean;
  /** Waarom er nu niet besteld kan worden, of null. */
  message: string | null;
  /** ONSITE_ONLY: betalen bij het afhalen. ONLINE_ONLY: meteen online. BOTH: de student kiest. */
  paymentMode: "ONSITE_ONLY" | "ONLINE_ONLY" | "BOTH";
  onlineCheckout: boolean;
};

export type AppCudiArticleMine = {
  kind: "ASSIGNED" | "BOOKED" | "SOLD";
  quantity: number;
  pickupDeadline: string | null;
};

export type AppCudiArticle = {
  id: string;
  title: string;
  author: string | null;
  publisher: string | null;
  type: string;
  /** Wat jij betaalt, met ledenkorting als je lid bent. */
  price: number;
  listPrice: number;
  memberPrice: boolean;
  mandatory: boolean;
  /** Null wanneer de kring de voorraad niet toont. */
  stock: { label: string; tone: "green" | "amber" | "red" } | null;
  /** Er ligt nu een exemplaar klaar; anders kom je op de wachtlijst. */
  availableNow: boolean;
  orderable: boolean;
  note: string | null;
  coverUrl: string | null;
  /**
   * Hoeveel je er nog kan reserveren: het maximum van cudi per student per
   * academiejaar, min wat je al had. Optioneel voor een oudere cudi.
   */
  maxQuantity?: number;
  /** Wat je dit academiejaar al met dit artikel deed. */
  mine: AppCudiArticleMine[];
};

export type AppCudiCatalog = {
  available: boolean;
  gate: AppCudiGate | null;
  ordering: AppCudiOrdering;
  /** De zoekterm waarop gefilterd is (`?q=`), of null. */
  query?: string | null;
  /** Gezocht in het hele aanbod; anders enkel in de vakken van je profiel. */
  searchedAll?: boolean;
  /** Je vakken op cudi; zonder vakken is er enkel algemeen materiaal. */
  hasProfileSubjects: boolean;
  /** De pagina op cudi om je vakken aan te duiden. */
  subjectsUrl: string;
  subjects: { id: string; code: string | null; name: string; articles: AppCudiArticle[] }[];
  general: { type: string; articles: AppCudiArticle[] }[];
};

export type AppCudiOrderStatus = "POS_COMPLETED" | "ONLINE_PAID" | "READY" | "PENDING" | "EXPIRED" | "CANCELLED";

export type AppCudiOrderLine = {
  id: string;
  title: string;
  quantity: number;
  price: number;
  /** BOOKED (wachtlijst), ASSIGNED (ligt klaar), SOLD, CANCELLED, EXPIRED, ... */
  status: string;
  pickupDeadline: string | null;
  cancelable: boolean;
};

export type AppCudiOrder = {
  id: string;
  number: number;
  createdAt: string;
  status: AppCudiOrderStatus;
  /** Vraagt nog iets van je: afhalen, afrekenen of wachten op levering. */
  open: boolean;
  total: number;
  paidOnline: boolean;
  membershipFee: number | null;
  lines: AppCudiOrderLine[];
};

export type AppCudiOverview = {
  /** `false` wanneer deze site niet met cudi gekoppeld is. */
  available: boolean;
  gate: AppCudiGate | null;
  ordering: AppCudiOrdering;
  orders: AppCudiOrder[];
  /** De openingsuren van deze week, zoals op Home. */
  hours: AppServiceStatus | null;
  shopUrl: string;
};

export type AppCudiOrderInput = {
  items: { articleId: string; quantity: number }[];
  paymentChoice?: "ONSITE" | "ONLINE";
};

export type AppCudiOrderResult =
  | {
      ok: true;
      orderId: string;
      nextStep: "DONE" | "CHECKOUT_ONLINE";
      /** Bij `CHECKOUT_ONLINE`: de betaalpagina, te openen in de browser. */
      checkoutUrl: string | null;
      items: { articleId: string; title: string; quantity: number; price: number; status: "ASSIGNED" | "BOOKED" }[];
    }
  | {
      ok: false;
      code: "ARTICLES_UNAVAILABLE" | "NOT_IN_PROFILE_SUBJECTS" | "OUT_OF_STOCK" | "PAYMENT_CHOICE_REQUIRED" | "REJECTED";
      message: string;
      articleIds: string[];
    };

export type AppCudiCancelResult = { ok: true } | { ok: false; code: string; message: string };

/** Een tijdslot om af te halen, zoals op *Tijdslot reserveren* bij cudi. */
export type AppCudiTimeslot = {
  id: string;
  start: string;
  end: string;
  taken: number;
  capacity: number;
  full: boolean;
  mine: boolean;
  /** Je hebt al een ander slot die dag, en de cursusdienst laat er maar één toe. */
  blockedByOtherSlot: boolean;
};

export type AppCudiTimeslots = {
  available: boolean;
  gate: AppCudiGate | null;
  /** De cursusdienst werkt met tijdsloten. Anders kom je gewoon binnen tijdens de uren. */
  enabled: boolean;
  oneTimeslotPerDay: boolean;
  /** Vanaf zoveel uur voor de start staat een reservatie vast; 0 is altijd vrij te geven. */
  cutoffHours: number;
  mine: { registrationId: string; timeslotId: string; start: string; end: string; cancelable: boolean }[];
  /** Per dag ("YYYY-MM-DD"), in volgorde. */
  days: { date: string; slots: AppCudiTimeslot[] }[];
};

export type AppCudiTimeslotResult =
  | ({ ok: true } & AppCudiTimeslots)
  | { ok: false; code: "NOT_FOUND" | "PASSED" | "FULL" | "SAME_DAY" | "ALREADY" | "CUTOFF"; message: string };


// -----------------------------------------------------------------------------
// Alma
// -----------------------------------------------------------------------------

/**
 * De vier Alma's op campus Arenberg, zoals alma.be ze toont: het menu van een dag
 * en de uren van de komende week. Alma heeft geen API; de site leest hun pagina's
 * (`lib/alma/`) en bewaart ze een half uur. Iedereen mag dit zien, ook zonder
 * account.
 */
export type AppAlmaDish = {
  id: string;
  name: string;
  /**
   * In eurocent: studenten en personeel van KU Leuven, andere studenten, andere
   * klanten. `null` waar Alma die prijs niet vermeldt; gratis is 0.
   */
  prices: { kuleuven: number | null; student: number | null; other: number | null };
  diet: "vegan" | "vegetarian" | "meat" | null;
  /** "Gevogelte", "Rund", "Vis", ... zoals Alma het schrijft, of `null`. */
  protein: string | null;
  /** De klimaatimpact die Alma bij een gerecht zet. */
  climate: "very-low" | "low" | "medium" | "high" | null;
  imageUrl: string | null;
};

export type AppAlmaMenuSection = {
  /** "Warm buffet", "Soep", "Broodjes", ... */
  title: string;
  /** "Maaltijd I", "Optioneel", ...; `null` voor een sectie zonder groepen. */
  groups: { title: string | null; dishes: AppAlmaDish[] }[];
};

export type AppAlmaRestaurant = {
  slug: "alma-3" | "alma-quadrivium" | "de-moete" | "esat2";
  name: string;
  /** Korter, voor een pil of een smalle regel: "Quadrivium". */
  shortName: string;
  address: string | null;
  location: { lat: number; lng: number } | null;
  /** De pagina op alma.be. */
  url: string;
  openNow: boolean;
  /** Eén regel: "tot 14:00", "opent 17:30", "morgen 10:00", "gesloten". */
  detail: string;
  /** De vensters van vandaag, alle soorten samen, in minuten sinds middernacht. */
  today: AppHoursWindow[];
  /** Per soort aanbod ("Warme maaltijden", ...) de komende zeven dagen. */
  hours: { kind: string; days: { date: string; windows: AppHoursWindow[] }[] }[];
  /** De dag waarvan `menu` het menu is, of `null` wanneer er geen is. */
  menuDate: string | null;
  menu: AppAlmaMenuSection[];
  /** De pagina kon niet opgehaald of gelezen worden; toon dan geen "gesloten". */
  unavailable: boolean;
};

export type AppAlma = {
  /** De gevraagde dag, of vandaag in Brussel. */
  date: string;
  /** De dagen waarvoor minstens één Alma een menu heeft, oplopend. */
  dates: string[];
  restaurants: AppAlmaRestaurant[];
};

// -----------------------------------------------------------------------------
// Gebruik: hoe de app gebruikt wordt, voor Admin › Website › App
// -----------------------------------------------------------------------------

/**
 * Welk toestel en welke versie dit is. De app stuurt het mee met elk rapport;
 * de site bewaart enkel de laatste stand per installatie.
 *
 * `installId` is een willekeurige id die de app bij de eerste start maakt en
 * bewaart. Geen toestel-id van Apple of Google: een herinstallatie is dus een
 * nieuwe installatie, en de id zegt buiten deze site niets.
 */
export type AppUsageDevice = {
  installId: string;
  platform: "ios" | "android";
  /** "18.1", "15". */
  osVersion: string | null;
  /** Enkel op Android bekend ("Pixel 8"); iOS geeft het model niet zonder extra module. */
  deviceModel: string | null;
  /** De versie uit app.config.ts ("1.2.0"). */
  appVersion: string | null;
  runtimeVersion: string | null;
  /** De EAS Update die nu draait; null voor wat in de build zelf zat. */
  updateId: string | null;
  /** Het kanaal van EAS Update ("preview", "production"). */
  channel: string | null;
  /** Draait in Expo Go in plaats van in een eigen build. */
  expoGo: boolean;
  locale: AppLocale;
  /** Heeft de gebruiker meldingen toegestaan? null wanneer dat niet gevraagd is. */
  pushEnabled: boolean | null;
};

/**
 * Wat de app sinds het vorige rapport deed (`POST /api/app/v1/gebruik`). De app
 * stuurt er een bij de start, wanneer ze naar de achtergrond gaat en om de
 * minuut zolang er iets te melden is. Lukt het niet, dan probeert ze het met het
 * volgende rapport opnieuw; er gaat niets naar schijf.
 *
 * Een sessie is een stuk gebruik zonder pauze van een halfuur of langer. Ze
 * begint bij een koude start of wanneer de app na zo'n pauze terug op de
 * voorgrond komt.
 */
export type AppUsageReport = AppUsageDevice & {
  /** Willekeurig, gemaakt door de app aan het begin van de sessie. */
  sessionId: string;
  /** Wanneer de sessie begon (ISO). */
  sessionStartedAt: string;
  /** Seconden op de voorgrond sinds het vorige rapport. */
  activeSeconds: number;
  /**
   * Schermen die geopend werden, per routepatroon ("evenement/[id]",
   * "kalender:planning"), met hoe vaak. `tab` is de tab waarin het scherm stond.
   */
  screens: { screen: string; tab: string | null; views: number }[];
  /** Losse gebeurtenissen in de app zelf, zoals "push_open". */
  events: { kind: string; at: string }[];
};

export type AppUsageResult = { ok: true };
