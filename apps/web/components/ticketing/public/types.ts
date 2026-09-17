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
  available: number;
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
    confirmationMessage?: string | null;
  };
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

/**
 * Het maximum voor één regel. De ledenprijs en de gewone prijs van een type
 * delen voorraad en "maximum per bestelling", dus wat de andere regel van
 * hetzelfde type al vastheeft, gaat eraf.
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
  const byType = quantitiesByTicketType(lines, quantities);
  const ticketTypes = [...new Map(lines.map((candidate) => [candidate.type.id, candidate.type])).values()];
  const typeMaximum = maximumSelectableForType({
    type: line.type,
    ticketTypes,
    quantities: byType,
    maxTicketsPerOrder,
  });
  const onOtherLines = (byType[line.type.id] ?? 0) - (quantities[line.key] ?? 0);
  return Math.max(0, typeMaximum - onOtherLines);
}

function inventoryKey(type: PublicTicketType): string {
  return type.inventoryPoolId ?? `ticket-type:${type.id}`;
}

export function availableTicketCount(ticketTypes: PublicTicketType[]): number {
  const remainingByPool = new Map<string, number>();
  for (const type of ticketTypes) {
    if (!type.active) continue;
    const key = inventoryKey(type);
    const remaining = Math.max(0, type.available);
    const current = remainingByPool.get(key);
    remainingByPool.set(key, current === undefined ? remaining : Math.min(current, remaining));
  }
  return [...remainingByPool.values()].reduce((sum, remaining) => sum + remaining, 0);
}

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
  const current = quantities[type.id] ?? 0;
  const selectedCount = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const selectedFromSamePool = ticketTypes.reduce(
    (sum, candidate) =>
      inventoryKey(candidate) === inventoryKey(type)
        ? sum + (quantities[candidate.id] ?? 0)
        : sum,
    0,
  );
  const availableInPool = Math.max(0, type.available - (selectedFromSamePool - current));
  const availableInOrder = Math.max(0, maxTicketsPerOrder - (selectedCount - current));
  return Math.max(
    0,
    Math.min(availableInPool, type.maxPerOrder ?? maxTicketsPerOrder, availableInOrder),
  );
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
