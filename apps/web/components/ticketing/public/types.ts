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
  startsAt: string | Date;
  endsAt: string | Date;
  currentTime: string;
  salesStart?: string | Date | null;
  salesEnd?: string | Date | null;
  status: string;
  maxTicketsPerOrder: number;
  currency: string;
  ownerGroupName?: string | null;
  contactEmail?: string | null;
  termsUrl?: string | null;
  viewer?: { id: string; name: string; email: string } | null;
  requiresLogin?: boolean;
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
    title: string;
    startsAt: string | Date;
    location?: string | null;
  };
  tickets: PublicTicket[];
};

export type SerializedTicketEvent = Omit<
  PublicTicketEvent,
  "startsAt" | "endsAt" | "salesStart" | "salesEnd"
> & {
  startsAt: string;
  endsAt: string;
  salesStart: string | null;
  salesEnd: string | null;
};

export function serializeTicketEvent(event: PublicTicketEvent): SerializedTicketEvent {
  return {
    ...event,
    startsAt: new Date(event.startsAt).toISOString(),
    endsAt: new Date(event.endsAt).toISOString(),
    salesStart: event.salesStart ? new Date(event.salesStart).toISOString() : null,
    salesEnd: event.salesEnd ? new Date(event.salesEnd).toISOString() : null,
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
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
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
