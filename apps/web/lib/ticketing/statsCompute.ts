/**
 * De rekenkant van de ticketstatistieken (/admin/tickets/statistieken en de tab
 * per event). Puur: `stats.ts` haalt de rijen op en controleert wie wat mag
 * zien, dit bestand telt. Zo zijn de randgevallen (een terugbetaald ticket, een
 * event zonder capaciteit, een verkoop die over middernacht loopt) zonder
 * database te testen.
 *
 * Wat "verkocht" is, staat hier één keer vast: **een uitgegeven ticket dat nog
 * geldig is** (`Ticket.status = VALID`). Dat is hetzelfde getal als "geldige
 * tickets" op het eventoverzicht. Een terugbetaald ticket telt niet mee maar
 * wel apart, een ongeldig gemaakt ticket (VOID) ook. Het moment van verkoop is
 * de betaling van de bestelling, of de uitgifte bij een gratis ticket.
 *
 * Een dag, uur of weekdag is altijd Brusselse tijd: een cantusverkoop die om
 * 23u30 opent, hoort bij die avond en niet bij de volgende UTC-dag.
 */

export type StatsEventInput = {
  id: string;
  title: string;
  slug: string;
  groupId: string;
  groupName: string;
  startsAt: Date;
  /** Wanneer de verkoop opende voor de eersten (voorverkoop meegerekend), of null. */
  salesOpenAt: Date | null;
  capacity: number;
  currency: string;
  /** Mag wie kijkt de omzet van dit event zien (`VIEW_FINANCE`)? */
  finance: boolean;
};

export type StatsTicketInput = {
  eventId: string;
  typeId: string;
  typeName: string;
  status: "VALID" | "VOID" | "REFUNDED";
  soldAt: Date;
  checkedInAt: Date | null;
  totalCents: number;
  refundedCents: number;
  memberPrice: boolean;
  orderId: string;
  /** Account-id of e-mailadres: wie hetzelfde koopt voor twee events, is één koper. */
  buyerKey: string;
  /** Bestelde de koper ingelogd? */
  signedIn: boolean;
  source: string | null;
  campaign: string | null;
};

export type StatsOrderInput = {
  eventId: string;
  status: string;
  source: string | null;
  count: number;
};

export type StatsTypeInput = {
  id: string;
  eventId: string;
  name: string;
  audience: string;
  sortOrder: number;
};

export type BucketUnit = "day" | "week";

export type ChartSeriesData = { key: string; label: string; values: number[] };

const PAID_STATUSES = new Set(["PAID", "PARTIALLY_REFUNDED", "REFUNDED"]);
/** Boven zoveel dagen wordt de verkoopgrafiek per week: 365 staven van 2px zegt niets. */
export const WEEK_BUCKET_AFTER_DAYS = 120;
/** Hoeveel tickettypes een eigen kleur krijgen; de rest wordt "Andere". */
export const MAX_TYPE_SERIES = 3;

// Eén formatter voor alles: een nieuwe `Intl.DateTimeFormat` per ticket kost
// bij tienduizenden tickets seconden.
const BRUSSELS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Brussels",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export type BrusselsParts = { day: string; hour: number; minute: number; weekday: number };

/** Dag (`yyyy-mm-dd`), uur, minuut en ISO-weekdag (1 = maandag) in Brussel. */
export function brusselsParts(date: Date): BrusselsParts {
  const parts = BRUSSELS.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "0";
  const day = `${get("year")}-${get("month")}-${get("day")}`;
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return { day, hour: Number(get("hour")) % 24, minute: Number(get("minute")), weekday: dow === 0 ? 7 : dow };
}

function shiftDay(day: string, delta: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

/** De maandag van de week van een dag. */
export function weekStart(day: string): string {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();
  return shiftDay(day, -((dow + 6) % 7));
}

/** Elke dag (of elke maandag) van `from` tot en met `to`. */
export function bucketRange(from: string, to: string, unit: BucketUnit): string[] {
  const start = unit === "week" ? weekStart(from) : from;
  const step = unit === "week" ? 7 : 1;
  const keys: string[] = [];
  for (let key = start; key <= to; key = shiftDay(key, step)) keys.push(key);
  return keys;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

const share = (part: number, whole: number) => (whole > 0 ? part / whole : null);

export type EventRow = {
  id: string;
  title: string;
  slug: string;
  groupName: string;
  startsAt: Date;
  sold: number;
  capacity: number;
  occupancy: number | null;
  checkedIn: number;
  attendance: number | null;
  refunded: number;
  netCents: number | null;
  currency: string;
  /** Deel van de verkoop in de eerste 24 uur na de opening. */
  firstDayShare: number | null;
  /** Hoelang na de opening de helft van de capaciteit weg was, in ms. */
  halfAfterMs: number | null;
  /** Hoelang na de opening het event uitverkocht was, in ms. */
  soldOutAfterMs: number | null;
};

export type TypeRow = {
  id: string;
  eventId: string;
  name: string;
  audience: string;
  sold: number;
  share: number | null;
  memberPrice: number;
  checkedIn: number;
  netCents: number | null;
};

export type GroupRow = {
  id: string;
  name: string;
  events: number;
  sold: number;
  capacity: number;
  occupancy: number | null;
  checkedIn: number;
  netCents: number | null;
};

export type SourceRow = {
  key: string | null;
  orders: number;
  tickets: number;
  share: number | null;
  /** Betaalde bestellingen gedeeld door alle gestarte, per herkomst. */
  conversion: number | null;
  campaigns: { key: string; orders: number; tickets: number }[];
};

export type TicketStats = {
  totals: {
    events: number;
    sold: number;
    refunded: number;
    voided: number;
    capacity: number;
    occupancy: number | null;
    checkedIn: number;
    attendance: number | null;
    orders: number;
    ticketsPerOrder: number | null;
    buyers: number;
    /** Kopers met tickets voor minstens twee van de gekozen events. */
    returningBuyers: number;
    signedInShare: number | null;
    memberPriceShare: number | null;
    /** Enkel over de events met `finance`; null wanneer dat er geen enkel is. */
    grossCents: number | null;
    refundedCents: number | null;
    netCents: number | null;
    averagePriceCents: number | null;
    financeEvents: number;
    currency: string;
  };
  funnel: {
    started: number;
    paid: number;
    expired: number;
    failed: number;
    cancelled: number;
    pending: number;
    conversion: number | null;
  };
  perBucket: { unit: BucketUnit; keys: string[]; series: ChartSeriesData[] };
  cumulative: { keys: string[]; sold: number[]; capacity: number } | null;
  byHour: number[];
  byWeekday: number[];
  checkIns: { keys: string[]; values: number[] } | null;
  events: EventRow[];
  types: TypeRow[];
  groups: GroupRow[];
  sources: SourceRow[];
};

/**
 * Tel alles. `now` bepaalt tot waar de verkoopgrafiek loopt: loopt er nog een
 * verkoop, dan staan de dagen zonder verkoop tot vandaag erbij, anders stopt ze
 * bij de laatste verkoop.
 */
export function computeTicketStats(
  events: StatsEventInput[],
  tickets: StatsTicketInput[],
  orders: StatsOrderInput[],
  types: StatsTypeInput[],
  options: { now?: Date; otherLabel?: string } = {},
): TicketStats {
  const now = options.now ?? new Date();
  const eventById = new Map(events.map((event) => [event.id, event]));
  const financeIds = new Set(events.filter((event) => event.finance).map((event) => event.id));
  const single = events.length === 1;

  const valid = tickets.filter((ticket) => ticket.status === "VALID");
  const withParts = tickets.map((ticket) => ({ ticket, parts: brusselsParts(ticket.soldAt) }));
  const validParts = withParts.filter(({ ticket }) => ticket.status === "VALID");

  // --- Totalen -------------------------------------------------------------
  const capacity = events.reduce((sum, event) => sum + event.capacity, 0);
  const soldWithCapacity = valid.filter((ticket) => (eventById.get(ticket.eventId)?.capacity ?? 0) > 0).length;
  const checkedIn = valid.filter((ticket) => ticket.checkedInAt).length;
  const orderIds = new Set(valid.map((ticket) => ticket.orderId));
  const signedInOrders = new Set(valid.filter((ticket) => ticket.signedIn).map((ticket) => ticket.orderId));
  const eventsPerBuyer = new Map<string, Set<string>>();
  for (const ticket of valid) {
    const set = eventsPerBuyer.get(ticket.buyerKey) ?? new Set<string>();
    set.add(ticket.eventId);
    eventsPerBuyer.set(ticket.buyerKey, set);
  }
  const financeTickets = tickets.filter((ticket) => financeIds.has(ticket.eventId));
  const grossCents = financeTickets.reduce((sum, ticket) => sum + ticket.totalCents, 0);
  const refundedCents = financeTickets.reduce((sum, ticket) => sum + ticket.refundedCents, 0);
  const financeValid = financeTickets.filter((ticket) => ticket.status === "VALID");
  const hasFinance = financeIds.size > 0;
  const currencies = new Set(events.map((event) => event.currency));

  // --- Trechter --------------------------------------------------------------
  const count = (predicate: (order: StatsOrderInput) => boolean) =>
    orders.filter(predicate).reduce((sum, order) => sum + order.count, 0);
  const started = count(() => true);
  const paid = count((order) => PAID_STATUSES.has(order.status));

  // --- Verkoop per dag of week ------------------------------------------------
  const soldDays = validParts.map(({ parts }) => parts.day).sort();
  const today = brusselsParts(now).day;
  const stillSelling = events.some((event) => event.startsAt > now);
  let perBucket: TicketStats["perBucket"] = { unit: "day", keys: [], series: [] };
  if (soldDays.length > 0) {
    const first = soldDays[0];
    const last = stillSelling && today > soldDays[soldDays.length - 1] ? today : soldDays[soldDays.length - 1];
    const unit: BucketUnit = daysBetween(first, last) > WEEK_BUCKET_AFTER_DAYS ? "week" : "day";
    const keys = bucketRange(first, last, unit);
    const index = new Map(keys.map((key, i) => [key, i]));
    const bucketOf = (day: string) => index.get(unit === "week" ? weekStart(day) : day);

    let series: ChartSeriesData[];
    if (single) {
      // Per tickettype, in de volgorde van het beheer (niet van de verkoop:
      // dan zou een type van kleur wisselen zodra een ander het inhaalt).
      const soldTypeIds = new Set(valid.map((ticket) => ticket.typeId));
      const ordered = [...types]
        .filter((type) => soldTypeIds.has(type.id))
        .sort((a, b) => a.sortOrder - b.sortOrder);
      // Een type dat niet meer bestaat maar wel verkocht is: achteraan.
      for (const ticket of valid) {
        if (!ordered.some((type) => type.id === ticket.typeId)) {
          ordered.push({ id: ticket.typeId, eventId: ticket.eventId, name: ticket.typeName, audience: "PUBLIC", sortOrder: Infinity });
        }
      }
      const own = ordered.length > MAX_TYPE_SERIES + 1 ? ordered.slice(0, MAX_TYPE_SERIES) : ordered;
      const ownIds = new Set(own.map((type) => type.id));
      series = own.map((type) => ({ key: type.id, label: type.name, values: keys.map(() => 0) }));
      const other = own.length < ordered.length
        ? { key: "other", label: options.otherLabel ?? "Andere", values: keys.map(() => 0) }
        : null;
      if (other) series.push(other);
      for (const { ticket, parts } of validParts) {
        const i = bucketOf(parts.day);
        if (i === undefined) continue;
        const target = ownIds.has(ticket.typeId) ? series.find((s) => s.key === ticket.typeId) : other;
        if (target) target.values[i] += 1;
      }
    } else {
      const values = keys.map(() => 0);
      for (const { parts } of validParts) {
        const i = bucketOf(parts.day);
        if (i !== undefined) values[i] += 1;
      }
      series = [{ key: "tickets", label: "Tickets", values }];
    }
    perBucket = { unit, keys, series };
  }

  // --- Cumulatief (enkel voor één event, en enkel per dag) ---------------------
  let cumulative: TicketStats["cumulative"] = null;
  if (single && perBucket.unit === "day" && perBucket.keys.length > 0) {
    let running = 0;
    const totals = perBucket.keys.map((_, i) => perBucket.series.reduce((sum, s) => sum + s.values[i], 0));
    cumulative = {
      keys: perBucket.keys,
      sold: totals.map((value) => (running += value)),
      capacity,
    };
  }

  // --- Uur en weekdag ---------------------------------------------------------
  const byHour = Array.from({ length: 24 }, () => 0);
  const byWeekday = Array.from({ length: 7 }, () => 0);
  for (const { parts } of validParts) {
    byHour[parts.hour] += 1;
    byWeekday[parts.weekday - 1] += 1;
  }

  // --- Binnenkomst per kwartier (één event) -----------------------------------
  let checkIns: TicketStats["checkIns"] = null;
  if (single) {
    const moments = valid
      .map((ticket) => ticket.checkedInAt)
      .filter((value): value is Date => value !== null)
      .sort((a, b) => a.getTime() - b.getTime());
    if (moments.length > 0) {
      const slot = 15 * 60_000;
      const start = Math.floor(moments[0].getTime() / slot) * slot;
      const end = Math.floor(moments[moments.length - 1].getTime() / slot) * slot;
      // Een scan van de dag erna (iemand die de volgende ochtend nog scant)
      // rekt de as niet over twintig lege uren: hoogstens twaalf uur.
      const lastSlot = Math.min(end, start + 12 * 60 * 60_000);
      const values: number[] = [];
      const keys: string[] = [];
      for (let t = start; t <= lastSlot; t += slot) {
        const parts = brusselsParts(new Date(t));
        keys.push(`${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`);
        values.push(0);
      }
      for (const moment of moments) {
        const i = Math.floor((moment.getTime() - start) / slot);
        if (i < values.length) values[i] += 1;
      }
      checkIns = { keys, values };
    }
  }

  // --- Per event ---------------------------------------------------------------
  const ticketsByEvent = new Map<string, StatsTicketInput[]>();
  for (const ticket of tickets) {
    const list = ticketsByEvent.get(ticket.eventId) ?? [];
    list.push(ticket);
    ticketsByEvent.set(ticket.eventId, list);
  }
  const eventRows: EventRow[] = events.map((event) => {
    const all = ticketsByEvent.get(event.id) ?? [];
    const eventValid = all.filter((ticket) => ticket.status === "VALID");
    const sold = eventValid.length;
    const eventCheckedIn = eventValid.filter((ticket) => ticket.checkedInAt).length;
    // De snelheid rekent met alles wat ooit verkocht is, ook wat later
    // terugbetaald werd: op dat moment was het weg.
    const moments = all.map((ticket) => ticket.soldAt.getTime()).sort((a, b) => a - b);
    const openAt = event.salesOpenAt?.getTime() ?? moments[0] ?? null;
    const reachedAfter = (target: number) =>
      openAt !== null && target > 0 && moments.length >= target
        ? Math.max(0, moments[target - 1] - openAt)
        : null;
    const firstDay =
      openAt !== null && moments.length > 0
        ? moments.filter((moment) => moment < openAt + 86_400_000).length / moments.length
        : null;
    return {
      id: event.id,
      title: event.title,
      slug: event.slug,
      groupName: event.groupName,
      startsAt: event.startsAt,
      sold,
      capacity: event.capacity,
      occupancy: event.capacity > 0 ? sold / event.capacity : null,
      checkedIn: eventCheckedIn,
      attendance: share(eventCheckedIn, sold),
      refunded: all.filter((ticket) => ticket.status === "REFUNDED").length,
      netCents: event.finance
        ? all.reduce((sum, ticket) => sum + ticket.totalCents - ticket.refundedCents, 0)
        : null,
      currency: event.currency,
      firstDayShare: firstDay,
      halfAfterMs: event.capacity > 0 ? reachedAfter(Math.ceil(event.capacity / 2)) : null,
      soldOutAfterMs: event.capacity > 0 ? reachedAfter(event.capacity) : null,
    };
  });

  // --- Per tickettype ----------------------------------------------------------
  const typeRows = new Map<string, TypeRow>();
  for (const type of types) {
    typeRows.set(type.id, {
      id: type.id,
      eventId: type.eventId,
      name: type.name,
      audience: type.audience,
      sold: 0,
      share: null,
      memberPrice: 0,
      checkedIn: 0,
      netCents: financeIds.has(type.eventId) ? 0 : null,
    });
  }
  for (const ticket of tickets) {
    let row = typeRows.get(ticket.typeId);
    if (!row) {
      row = {
        id: ticket.typeId,
        eventId: ticket.eventId,
        name: ticket.typeName,
        audience: "PUBLIC",
        sold: 0,
        share: null,
        memberPrice: 0,
        checkedIn: 0,
        netCents: financeIds.has(ticket.eventId) ? 0 : null,
      };
      typeRows.set(ticket.typeId, row);
    }
    if (row.netCents !== null) row.netCents += ticket.totalCents - ticket.refundedCents;
    if (ticket.status !== "VALID") continue;
    row.sold += 1;
    if (ticket.memberPrice) row.memberPrice += 1;
    if (ticket.checkedInAt) row.checkedIn += 1;
  }
  const typeList = [...typeRows.values()]
    .filter((row) => row.sold > 0 || (row.netCents ?? 0) !== 0)
    .map((row) => ({ ...row, share: share(row.sold, valid.length) }))
    .sort((a, b) => b.sold - a.sold);

  // --- Per post ----------------------------------------------------------------
  const groupRows = new Map<string, GroupRow>();
  for (const row of eventRows) {
    const event = eventById.get(row.id)!;
    const group = groupRows.get(event.groupId) ?? {
      id: event.groupId,
      name: event.groupName,
      events: 0,
      sold: 0,
      capacity: 0,
      occupancy: null,
      checkedIn: 0,
      netCents: null,
    };
    group.events += 1;
    group.sold += row.sold;
    group.capacity += row.capacity;
    group.checkedIn += row.checkedIn;
    if (row.netCents !== null) group.netCents = (group.netCents ?? 0) + row.netCents;
    groupRows.set(event.groupId, group);
  }
  const groupList = [...groupRows.values()]
    .map((group) => ({ ...group, occupancy: group.capacity > 0 ? group.sold / group.capacity : null }))
    .sort((a, b) => b.sold - a.sold);

  // --- Herkomst ----------------------------------------------------------------
  const sourceRows = new Map<string, SourceRow & { orderSet: Set<string>; campaignMap: Map<string, { orders: Set<string>; tickets: number }> }>();
  const sourceKey = (source: string | null) => source ?? "\u0000";
  for (const ticket of valid) {
    const key = sourceKey(ticket.source);
    const row = sourceRows.get(key) ?? {
      key: ticket.source,
      orders: 0,
      tickets: 0,
      share: null,
      conversion: null,
      campaigns: [],
      orderSet: new Set<string>(),
      campaignMap: new Map(),
    };
    row.tickets += 1;
    row.orderSet.add(ticket.orderId);
    if (ticket.campaign) {
      const campaign = row.campaignMap.get(ticket.campaign) ?? { orders: new Set<string>(), tickets: 0 };
      campaign.tickets += 1;
      campaign.orders.add(ticket.orderId);
      row.campaignMap.set(ticket.campaign, campaign);
    }
    sourceRows.set(key, row);
  }
  const startedBySource = new Map<string, number>();
  const paidBySource = new Map<string, number>();
  for (const order of orders) {
    const key = sourceKey(order.source);
    startedBySource.set(key, (startedBySource.get(key) ?? 0) + order.count);
    if (PAID_STATUSES.has(order.status)) paidBySource.set(key, (paidBySource.get(key) ?? 0) + order.count);
  }
  const sourceList: SourceRow[] = [...sourceRows.entries()]
    .map(([key, row]) => ({
      key: row.key,
      orders: row.orderSet.size,
      tickets: row.tickets,
      share: share(row.tickets, valid.length),
      conversion: share(paidBySource.get(key) ?? 0, startedBySource.get(key) ?? 0),
      campaigns: [...row.campaignMap.entries()]
        .map(([campaign, value]) => ({ key: campaign, orders: value.orders.size, tickets: value.tickets }))
        .sort((a, b) => b.tickets - a.tickets),
    }))
    // Niet gemeten altijd onderaan: het is geen kanaal maar een gat in de meting.
    .sort((a, b) => (a.key === null ? 1 : b.key === null ? -1 : b.tickets - a.tickets));

  return {
    totals: {
      events: events.length,
      sold: valid.length,
      refunded: tickets.filter((ticket) => ticket.status === "REFUNDED").length,
      voided: tickets.filter((ticket) => ticket.status === "VOID").length,
      capacity,
      occupancy: capacity > 0 ? soldWithCapacity / capacity : null,
      checkedIn,
      attendance: share(checkedIn, valid.length),
      orders: orderIds.size,
      ticketsPerOrder: share(valid.length, orderIds.size),
      buyers: eventsPerBuyer.size,
      returningBuyers: [...eventsPerBuyer.values()].filter((set) => set.size > 1).length,
      signedInShare: share(signedInOrders.size, orderIds.size),
      memberPriceShare: share(valid.filter((ticket) => ticket.memberPrice).length, valid.length),
      grossCents: hasFinance ? grossCents : null,
      refundedCents: hasFinance ? refundedCents : null,
      netCents: hasFinance ? grossCents - refundedCents : null,
      averagePriceCents:
        hasFinance && financeValid.length > 0
          ? Math.round(financeValid.reduce((sum, ticket) => sum + ticket.totalCents, 0) / financeValid.length)
          : null,
      financeEvents: financeIds.size,
      currency: currencies.size === 1 ? [...currencies][0] : "EUR",
    },
    funnel: {
      started,
      paid,
      expired: count((order) => order.status === "EXPIRED"),
      failed: count((order) => order.status === "PAYMENT_FAILED"),
      cancelled: count((order) => order.status === "CANCELLED"),
      pending: count((order) => order.status === "PENDING_PAYMENT"),
      conversion: share(paid, started),
    },
    perBucket,
    cumulative,
    byHour,
    byWeekday,
    checkIns,
    events: eventRows,
    types: typeList,
    groups: groupList,
    sources: sourceList,
  };
}
