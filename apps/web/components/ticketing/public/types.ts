import type { TicketTargetAudience } from "@/lib/ticketing/audience";
import type { SeatKind } from "@/lib/ticketing/seats";

export type TicketQuestion = {
  id: string;
  code?: string;
  label: string;
  description?: string | null;
  required?: boolean;
  type?:
    | "TEXT"
    | "EMAIL"
    | "SELECT"
    | "CHECKBOX"
    | "SHORT_TEXT"
    | "LONG_TEXT"
    | "SINGLE_CHOICE"
    | "MULTIPLE_CHOICE"
    | "BOOLEAN";
  options?: Array<string | { value: string; label?: string }>;
};

export type PublicTicketType = {
  id: string;
  inventoryPoolId?: string;
  name: string;
  description?: string | null;
  priceCents: number;
  /**
   * Een tweede, lagere prijs voor leden. Enkel gevuld voor wie lid is (en in het
   * voorbeeld voor de beheerder); een niet-lid krijgt hier null.
   */
  memberPriceCents?: number | null;
  /**
   * Wat de regel aan de gewone prijs nog kan nemen: de vrije plaatsen in de pot,
   * of minder wanneer het plafond voor deze bezoeker eerder vol zit.
   */
  available: number;
  /** Idem voor de regel aan de ledenprijs; enkel samen met `memberPriceCents`. */
  memberAvailable?: number | null;
  /** De vrije plaatsen in de pot, los van wie ze neemt. Ontbreekt = `available`. */
  poolAvailable?: number;
  /**
   * Of de gewone prijs voor deze bezoeker een leden- of een niet-ledenplaats
   * neemt (zie `lib/ticketing/seats.ts`). De ledenprijs is altijd een
   * ledenplaats. Ontbreekt = niet-lid.
   */
  seat?: SeatKind;
  active: boolean;
  maxPerOrder?: number | null;
  minPerOrder?: number | null;
  salesStart?: string | Date | null;
  salesEnd?: string | Date | null;
  audience?: string;
  questions?: TicketQuestion[];
};

export type PublicTicketEvent = {
  id: string;
  slug: string;
  title: string;
  /** Het kalenderevent waar deze verkoop bij hoort, of null. */
  calendarEventId?: string | null;
  /** De tickets staan op de eventpagina; zie `TicketEvent.onEventPage`. */
  onEventPage?: boolean;
  /**
   * Een privéverkoop, enkel te openen via de privélink. Wie deze pagina ziet,
   * volgde die link al; zie `lib/ticketing/privateLink.ts`.
   */
  isPrivate?: boolean;
  /** De naam van deze verkoop op de eventpagina ("Volledige 12u"), of null. */
  label?: string | null;
  /** Deze verkoop heeft eigen uren en volgt die van het kalenderevent niet. */
  ownTimes?: boolean;
  description?: string | null;
  location?: string | null;
  locationAddress?: string | null;
  /** De foto van het gekoppelde kalender-event, met zijn uitsnede. */
  poster?: { src: string; position: string } | null;
  startsAt: string | Date;
  endsAt: string | Date;
  currentTime: string;
  salesStart?: string | Date | null;
  salesEnd?: string | Date | null;
  /**
   * Gevuld wanneer **deze** bezoeker nu in voorverkoop koopt: `salesStart` is
   * dan al verschoven, en dit draagt enkel het moment waarop de verkoop voor
   * iedereen opengaat. Voor wie niet in de voorverkoop mag, blijft dit null en
   * staat er niets over de voorverkoop op de pagina.
   */
  presale?: { publicStart: string | Date } | null;
  status: string;
  maxTicketsPerOrder: number;
  currency: string;
  ownerGroupName?: string | null;
  contactEmail?: string | null;
  termsUrl?: string | null;
  viewer?: { id: string; name: string; email: string } | null;
  requiresLogin?: boolean;
  /**
   * Ingelogd, maar de enige tickets hier zijn voor leden. Bewust naast
   * `requiresLogin` en niet in de plaats: inloggen en lid worden zijn twee
   * verschillende dingen om te vragen.
   */
  requiresMembership?: boolean;
  /**
   * Er is een ledenprijs die deze bezoeker niet ziet: "login" wanneer hij niet
   * ingelogd is (misschien is hij al lid), "join" wanneer hij het niet is.
   */
  memberPriceHint?: "login" | "join" | null;
  /**
   * Doelgroepen (eerstejaars, alumni, ...) met een ticket dat deze uitgelogde
   * bezoeker niet ziet. Leeg voor wie ingelogd is: wie er dan niet bij hoort,
   * hoort er ook na inloggen niet bij.
   */
  audienceLoginHint?: TicketTargetAudience[];
  /**
   * Enkel in het overzicht: de verkoop opent pas op dit moment (voor deze
   * bezoeker, dus na een eventuele voorverkoop).
   */
  salesOpensAt?: string | Date | null;
  ticketTypes: PublicTicketType[];
};

export type PublicTicket = {
  id: string;
  publicId: string;
  status: string;
  attendeeName: string;
  typeName: string;
  checkedInAt?: string | Date | null;
  credential?: string | null;
  pdfUrl?: string | null;
  walletAppleUrl?: string | null;
  walletGoogleUrl?: string | null;
};

/**
 * Eén regel van een bestelling: een tickettype aan één prijs, met het aantal
 * erbij. Ook gevuld voor een bestelling die nog niet betaald is; de tickets
 * bestaan dan nog niet.
 */
export type PublicOrderLine = {
  key: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export type PublicOrder = {
  id: string;
  orderNumber: string;
  status: string;
  buyerName: string;
  buyerEmail: string;
  totalCents: number;
  currency: string;
  event: {
    id?: string;
    slug?: string;
    title: string;
    startsAt: string | Date;
    location?: string | null;
    /** De foto van het gekoppelde kalender-event, met zijn uitsnede. */
    poster?: { src: string; position: string } | null;
    confirmationMessage?: string | null;
  };
  lines: PublicOrderLine[];
  tickets: PublicTicket[];
};

export type SerializedTicketEvent = Omit<
  PublicTicketEvent,
  "startsAt" | "endsAt" | "salesStart" | "salesEnd" | "presale"
> & {
  startsAt: string;
  endsAt: string;
  salesStart: string | null;
  salesEnd: string | null;
  presale: { publicStart: string } | null;
};

export function serializeTicketEvent(event: PublicTicketEvent): SerializedTicketEvent {
  return {
    ...event,
    startsAt: new Date(event.startsAt).toISOString(),
    endsAt: new Date(event.endsAt).toISOString(),
    salesStart: event.salesStart ? new Date(event.salesStart).toISOString() : null,
    salesEnd: event.salesEnd ? new Date(event.salesEnd).toISOString() : null,
    presale: event.presale
      ? { publicStart: new Date(event.presale.publicStart).toISOString() }
      : null,
  };
}

export function formatTicketPrice(cents: number, currency: string, locale: "nl" | "en") {
  return new Intl.NumberFormat(locale === "nl" ? "nl-BE" : "en-BE", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

export function formatTicketDate(value: string | Date, locale: "nl" | "en") {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-BE", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function brussels(
  value: string | Date,
  locale: "nl" | "en",
  options: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-BE", {
    timeZone: "Europe/Brussels",
    ...options,
  })
    .format(new Date(value))
    .replace(".", "");
}

/**
 * "di 22 sep, 20:00": kort genoeg voor één regel naast de plaats. Gedeeld door
 * de kaart op /tickets, het bestelpaneel en de lijst in je account, zodat een
 * event er overal hetzelfde bij staat.
 */
export function formatTicketMoment(value: string | Date, locale: "nl" | "en"): string {
  const day = brussels(value, locale, { weekday: "short", day: "numeric", month: "short" });
  return `${day}, ${brussels(value, locale, { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * Eén regel in de shop: een tickettype aan één prijs. Een type met een
 * ledenprijs geeft er twee, de ledenprijs eerst; elk ander type één.
 */
export type TicketLine = {
  key: string;
  type: PublicTicketType;
  memberPrice: boolean;
  priceCents: number;
};

export function ticketLineKey(ticketTypeId: string, memberPrice: boolean): string {
  return memberPrice ? `${ticketTypeId}:member` : ticketTypeId;
}

export function ticketLinesForType(type: PublicTicketType): TicketLine[] {
  const standard: TicketLine = {
    key: ticketLineKey(type.id, false),
    type,
    memberPrice: false,
    priceCents: type.priceCents,
  };
  if (type.memberPriceCents == null) return [standard];
  return [
    {
      key: ticketLineKey(type.id, true),
      type,
      memberPrice: true,
      priceCents: type.memberPriceCents,
    },
    standard,
  ];
}

/** Aantallen per regel opgeteld per tickettype, zoals de voorraad en de limieten tellen. */
export function quantitiesByTicketType(
  lines: TicketLine[],
  quantities: Record<string, number>,
): Record<string, number> {
  const byType: Record<string, number> = {};
  for (const line of lines) {
    byType[line.type.id] = (byType[line.type.id] ?? 0) + (quantities[line.key] ?? 0);
  }
  return byType;
}

function inventoryKey(type: PublicTicketType): string {
  return type.inventoryPoolId ?? `ticket-type:${type.id}`;
}

/** Wat één regel nog kan nemen, los van wat er al gekozen is: de ledenprijs heeft haar eigen plafond. */
export function ticketLineRemaining(line: TicketLine): number {
  return line.memberPrice ? (line.type.memberAvailable ?? line.type.available) : line.type.available;
}

/** Wat een type over zijn prijzen heen nog kan nemen, voor "Nog 12" en "Uitverkocht". */
export function ticketTypeRemaining(type: PublicTicketType): number {
  return Math.max(0, ...ticketLinesForType(type).map(ticketLineRemaining));
}

/** De pot en de soort plaats van een regel: regels met dezelfde sleutel delen een plafond. */
function seatKey(line: TicketLine): string {
  return `${inventoryKey(line.type)}:${line.memberPrice ? "MEMBER" : (line.type.seat ?? "NON_MEMBER")}`;
}

/**
 * Het maximum voor één regel, als het kleinste van vier grenzen, telkens min
 * wat de andere regels er al van vasthebben:
 *
 * - de plaatsen voor haar soort (lid of niet-lid) in haar pot;
 * - de vrije plaatsen in de pot zelf, die regels van elke soort delen;
 * - het maximum per bestelling van haar type, over beide prijzen samen;
 * - het maximum per bestelling van het event.
 *
 * De eerste twee samen zijn exact: zit het plafond van haar soort niet krap,
 * dan is `ticketLineRemaining` gelijk aan de pot en wint de tweede grens vanzelf.
 */
export function maximumSelectableForLine({
  line,
  lines,
  quantities,
  maxTicketsPerOrder,
}: {
  line: TicketLine;
  lines: TicketLine[];
  quantities: Record<string, number>;
  maxTicketsPerOrder: number;
}): number {
  const others = lines.filter((candidate) => candidate.key !== line.key);
  const taken = (matches: (candidate: TicketLine) => boolean) =>
    others.reduce((sum, candidate) => (matches(candidate) ? sum + (quantities[candidate.key] ?? 0) : sum), 0);
  const key = seatKey(line);
  const pool = inventoryKey(line.type);
  return Math.max(
    0,
    Math.min(
      ticketLineRemaining(line) - taken((candidate) => seatKey(candidate) === key),
      (line.type.poolAvailable ?? line.type.available) - taken((candidate) => inventoryKey(candidate.type) === pool),
      (line.type.maxPerOrder ?? maxTicketsPerOrder) - taken((candidate) => candidate.type.id === line.type.id),
      maxTicketsPerOrder - taken(() => true),
    ),
  );
}

/**
 * Hoeveel tickets er nog te koop zijn, voor de pil op /tickets. Per pot het
 * kleinste van wat de pot nog heeft en wat de regels erin samen nog kunnen
 * nemen; een pot die twee types delen, telt zo maar één keer.
 */
export function availableTicketCount(ticketTypes: PublicTicketType[]): number {
  const poolRemaining = new Map<string, number>();
  const seatRemaining = new Map<string, { pool: string; remaining: number }>();
  for (const type of ticketTypes) {
    if (!type.active) continue;
    const pool = inventoryKey(type);
    const inPool = Math.max(0, type.poolAvailable ?? type.available);
    const current = poolRemaining.get(pool);
    poolRemaining.set(pool, current === undefined ? inPool : Math.min(current, inPool));
    for (const line of ticketLinesForType(type)) {
      const key = seatKey(line);
      const remaining = Math.max(0, ticketLineRemaining(line));
      seatRemaining.set(key, { pool, remaining: Math.max(seatRemaining.get(key)?.remaining ?? 0, remaining) });
    }
  }
  let total = 0;
  for (const [pool, remaining] of poolRemaining) {
    const bySeat = [...seatRemaining.values()]
      .filter((seat) => seat.pool === pool)
      .reduce((sum, seat) => sum + seat.remaining, 0);
    total += Math.min(remaining, bySeat);
  }
  return total;
}

/**
 * Het maximum voor een type met één prijs; `quantities` per type-id. Een dunne
 * schil rond `maximumSelectableForLine` voor wie geen regels kent.
 */
export function maximumSelectableForType({
  type,
  ticketTypes,
  quantities,
  maxTicketsPerOrder,
}: {
  type: PublicTicketType;
  ticketTypes: PublicTicketType[];
  quantities: Record<string, number>;
  maxTicketsPerOrder: number;
}): number {
  const lines = ticketTypes.map((candidate) => ({
    key: candidate.id,
    type: candidate,
    memberPrice: false,
    priceCents: candidate.priceCents,
  }));
  const line = lines.find((candidate) => candidate.type.id === type.id) ?? {
    key: type.id,
    type,
    memberPrice: false,
    priceCents: type.priceCents,
  };
  return maximumSelectableForLine({ line, lines, quantities, maxTicketsPerOrder });
}

/**
 * Hoeveel tickets één bestelling hier hoogstens kan tellen: het maximum van
 * het event, of minder wanneer de types samen niet zoveel toelaten. Een event
 * met "max. 8" en twee tickets van elk hoogstens 1 laat er 2 toe; de kop van de
 * shop zei vroeger 8, en dat klopte niet.
 */
export function orderLimit(ticketTypes: PublicTicketType[], maxTicketsPerOrder: number): number {
  const perType = ticketTypes.reduce(
    (sum, type) => sum + Math.min(type.maxPerOrder ?? maxTicketsPerOrder, maxTicketsPerOrder),
    0,
  );
  return Math.max(1, Math.min(maxTicketsPerOrder, perType));
}

export function nextTicketQuantity({
  current,
  direction,
  minimum = 1,
  maximum,
}: {
  current: number;
  direction: "decrease" | "increase";
  minimum?: number;
  maximum: number;
}): number {
  if (maximum < minimum) return 0;
  if (direction === "decrease") {
    return current <= minimum ? 0 : Math.min(current - 1, maximum);
  }
  return current === 0 ? minimum : Math.min(current + 1, maximum);
}

const ORDER_STATUS_LABELS: Record<string, [string, string]> = {
  PENDING_PAYMENT: ["Wacht op betaling", "Awaiting payment"],
  PAID: ["Betaald", "Paid"],
  PAYMENT_FAILED: ["Betaling mislukt", "Payment failed"],
  EXPIRED: ["Verlopen", "Expired"],
  CANCELLED: ["Geannuleerd", "Cancelled"],
  PARTIALLY_REFUNDED: ["Deels terugbetaald", "Partially refunded"],
  REFUNDED: ["Terugbetaald", "Refunded"],
};

export function formatTicketOrderStatus(status: string, locale: "nl" | "en"): string {
  const labels = ORDER_STATUS_LABELS[status];
  return labels?.[locale === "nl" ? 0 : 1] ?? status.replaceAll("_", " ").toLowerCase();
}
