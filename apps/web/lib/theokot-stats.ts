/**
 * De broodjesstatistieken van Theokot, uitgerekend uit verkoopdagen, hun aanbod
 * en de bestellingen. Puur: geen database en geen React, zodat de regels te
 * testen zijn. Het lezen staat in `theokot-stats-server.ts`, het tekenen in
 * `app/[locale]/admin/theokot/statistieken`.
 *
 * Wat telt, en waarom (zie ook docs/design-decisions.md):
 *
 * - **Verkocht is opgehaald.** Een no-show brengt niets op en heeft de bakker
 *   toch gekost; die staat apart.
 * - **Besteld is alles wat nog een bestelling is** (gereserveerd, opgehaald,
 *   niet opgehaald). Een annulatie wist de bestelling, dus die bestaat hier niet.
 * - **Het aanbod wordt ook aangesproken door vergaderingen** (grocomeet, bureau);
 *   die tellen mee voor "hoeveel bleef er liggen" en "uitverkocht", niet voor de
 *   opbrengst van de balie. Dat geldt ook voor wat een groco zelf bij Theokot
 *   bestelde voor in de doos van de grocomeet: dat is een bestelling en telt
 *   als verkocht, maar het kwam niet langs de balie en werd er niet betaald.
 * - **Uitverkocht** is het moment waarop de bestellingen van een broodje, in de
 *   volgorde waarin ze binnenkwamen, de voorraad van die dag bereiken, gerekend
 *   vanaf het openen van de bestelronde.
 */

export type StatsItem = {
  id: string;
  productId: string | null;
  nameNl: string;
  nameEn: string | null;
  priceCents: number;
  /** Voorraad van die dag. */
  quantity: number;
  isWeeklySpecial: boolean;
  /** Broodjes die een vergadering (GM, bureau) op dit item reserveerde. */
  meetingCount: number;
};

export type StatsSession = {
  id: string;
  date: Date;
  orderOpenAt: Date;
  orderCloseAt: Date;
  pickupStart: Date;
  items: StatsItem[];
};

export type StatsOrderStatus = "RESERVED" | "PICKED_UP" | "NO_SHOW" | "CANCELLED";

export type StatsOrder = {
  id: string;
  sessionId: string;
  userId: string;
  status: StatsOrderStatus;
  createdAt: Date;
  pickedUpAt: Date | null;
  totalCents: number;
  voucher: boolean;
  /** Ging mee in de doos van de grocomeet (`TheokotOrder.grocomeetId`). */
  grocomeet: boolean;
  lines: Array<{ sessionItemId: string; quantity: number; unitPriceCents: number }>;
};

export type ProductStats = {
  key: string;
  nameNl: string;
  nameEn: string | null;
  weeklySpecial: boolean;
  daysOffered: number;
  stock: number;
  ordered: number;
  meetings: number;
  pickedUp: number;
  noShow: number;
  revenueCents: number;
  /** (besteld + vergaderingen) / voorraad. */
  sellThrough: number | null;
  /** Gemiddeld aantal broodjes dat per dag bleef liggen. */
  leftoverPerDay: number | null;
  soldOutDays: number;
  /** Gemiddelde minuten van het openen tot uitverkocht, over de dagen dat het uitverkocht raakte. */
  avgSellOutMinutes: number | null;
  /** Aandeel van de bestelde broodjes van deze soort dat niet opgehaald werd. */
  noShowRate: number | null;
};

export type TheokotStats = {
  totals: {
    saleDays: number;
    orders: number;
    customers: number;
    sandwichesOrdered: number;
    sandwichesPickedUp: number;
    sandwichesNoShow: number;
    revenueCents: number;
    /** Opgehaalde bestellingen / (opgehaald + niet opgehaald). */
    pickupRate: number | null;
    avgSandwichesPerOrder: number | null;
    avgOrderValueCents: number | null;
    avgPickedUpPerDay: number | null;
    /** Bestelde broodjes (met vergaderingen) / voorraad. */
    sellThrough: number | null;
    /** Aandeel van de soort-dagen waarop het broodje uitverkocht raakte. */
    soldOutShare: number | null;
    /** Klanten met een bestelling op minstens twee verkoopdagen / alle klanten. */
    returningShare: number | null;
    /** Opgehaalde bestellingen die met bonnetjes betaald werden / opgehaalde bestellingen. */
    voucherShare: number | null;
    meetingSandwiches: number;
    /** Aandeel van de bestellingen dat in het eerste uur na het openen binnenkwam. */
    firstHourShare: number | null;
  };
  perDay: {
    keys: string[];
    pickedUp: number[];
    notPickedUp: number[];
    ordered: number[];
    stock: number[];
    revenueCents: number[];
  };
  /** Index 0 = maandag. `null` voor een weekdag zonder verkoopdag. */
  byWeekday: {
    saleDays: number[];
    avgOrdered: (number | null)[];
    noShowRate: (number | null)[];
  };
  /** Bestellingen per uur van de dag (0 tot 23), Brusselse tijd. */
  orderHour: number[];
  /** Hoeveel dagen op voorhand: dezelfde dag, de dag voordien, twee of meer dagen. */
  leadDays: { sameDay: number; dayBefore: number; earlier: number };
  /** Afhalingen per kwartier (`hh:mm`), enkel de kwartieren tussen de eerste en de laatste. */
  pickupQuarters: { keys: string[]; values: number[] };
  /** Gemiddelde minuten tussen het begin van de afhaal en het ophalen. */
  avgPickupDelayMinutes: number | null;
  /** Bestellingen per aantal broodjes (index 0 = 1 broodje; de laatste = dat of meer). */
  orderSizes: number[];
  /** Klanten per aantal verkoopdagen waarop ze bestelden: 1, 2-3, 4-9, 10+. */
  loyalty: { once: number; few: number; regular: number; loyal: number };
  products: ProductStats[];
};

const BRUSSELS = "Europe/Brussels";

function brusselsParts(date: Date): { ymd: string; hour: number; minute: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: BRUSSELS,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: weekdays.indexOf(get("weekday")),
  };
}

function daysBetween(fromYmd: string, toYmd: string): number {
  return Math.round(
    (new Date(`${toYmd}T12:00:00Z`).getTime() - new Date(`${fromYmd}T12:00:00Z`).getTime()) / 86_400_000,
  );
}

const ratio = (part: number, whole: number) => (whole > 0 ? part / whole : null);

/** De soort van een aanbod-item over de dagen heen: het catalogusitem, anders de naam. */
function productKey(item: StatsItem): string {
  return item.productId ?? `naam:${item.nameNl.trim().toLowerCase()}`;
}

/** Hoeveel broodjes de voorraad niet haalde; enkel wat nog een bestelling is. */
const COUNTS: StatsOrderStatus[] = ["RESERVED", "PICKED_UP", "NO_SHOW"];

/** Tot hoeveel broodjes de bestelgrootte apart telt; daarboven samen. */
const MAX_ORDER_SIZE = 5;

export function computeTheokotStats(sessions: StatsSession[], orders: StatsOrder[]): TheokotStats {
  const sorted = [...sessions].sort((a, b) => a.date.getTime() - b.date.getTime());
  const sessionById = new Map(sorted.map((session) => [session.id, session]));
  const itemById = new Map<string, { item: StatsItem; session: StatsSession }>();
  for (const session of sorted) for (const item of session.items) itemById.set(item.id, { item, session });

  const live = orders.filter((order) => COUNTS.includes(order.status) && sessionById.has(order.sessionId));
  const sandwiches = (order: StatsOrder) => order.lines.reduce((sum, line) => sum + line.quantity, 0);

  // ---- per dag ----
  const dayIndex = new Map<string, number>();
  const keys: string[] = [];
  for (const session of sorted) {
    const key = brusselsParts(session.date).ymd;
    if (!dayIndex.has(key)) {
      dayIndex.set(key, keys.length);
      keys.push(key);
    }
  }
  const zeros = () => keys.map(() => 0);
  const perDay = {
    keys,
    pickedUp: zeros(),
    notPickedUp: zeros(),
    ordered: zeros(),
    stock: zeros(),
    revenueCents: zeros(),
  };
  const sessionDay = (session: StatsSession) => dayIndex.get(brusselsParts(session.date).ymd)!;
  for (const session of sorted) {
    const index = sessionDay(session);
    for (const item of session.items) {
      perDay.stock[index] += item.quantity;
      perDay.ordered[index] += item.meetingCount;
    }
  }

  // ---- per weekdag ----
  const weekdayDays = [0, 0, 0, 0, 0, 0, 0];
  const weekdayOrdered = [0, 0, 0, 0, 0, 0, 0];
  const weekdayPicked = [0, 0, 0, 0, 0, 0, 0];
  const weekdayNoShow = [0, 0, 0, 0, 0, 0, 0];
  for (const session of sorted) weekdayDays[brusselsParts(session.date).weekday] += 1;

  const orderHour = new Array<number>(24).fill(0);
  const leadDays = { sameDay: 0, dayBefore: 0, earlier: 0 };
  const orderSizes = new Array<number>(MAX_ORDER_SIZE).fill(0);
  const quarterCounts = new Map<number, number>();
  let pickupDelayTotal = 0;
  let pickupDelayCount = 0;
  let firstHour = 0;
  let pickedUpOrders = 0;
  let noShowOrders = 0;
  let voucherOrders = 0;
  let sandwichesOrdered = 0;
  let sandwichesPickedUp = 0;
  let sandwichesNoShow = 0;
  let revenueCents = 0;
  const daysPerCustomer = new Map<string, Set<string>>();

  for (const order of live) {
    const session = sessionById.get(order.sessionId)!;
    const count = sandwiches(order);
    const index = sessionDay(session);
    const weekday = brusselsParts(session.date).weekday;
    sandwichesOrdered += count;
    perDay.ordered[index] += count;
    weekdayOrdered[weekday] += count;
    orderSizes[Math.min(Math.max(count, 1), MAX_ORDER_SIZE) - 1] += 1;

    const placed = brusselsParts(order.createdAt);
    orderHour[placed.hour] += 1;
    const lead = daysBetween(placed.ymd, brusselsParts(session.date).ymd);
    if (lead <= 0) leadDays.sameDay += 1;
    else if (lead === 1) leadDays.dayBefore += 1;
    else leadDays.earlier += 1;
    if (order.createdAt.getTime() - session.orderOpenAt.getTime() <= 3_600_000) firstHour += 1;

    let days = daysPerCustomer.get(order.userId);
    if (!days) daysPerCustomer.set(order.userId, (days = new Set()));
    days.add(session.id);

    if (order.status === "PICKED_UP") {
      pickedUpOrders += 1;
      if (order.voucher) voucherOrders += 1;
      sandwichesPickedUp += count;
      perDay.pickedUp[index] += count;
      weekdayPicked[weekday] += 1;
      if (!order.grocomeet) {
        revenueCents += order.totalCents;
        perDay.revenueCents[index] += order.totalCents;
      }
      // Het tijdstip van de GM-doos is dat van de verwerking, niet van een balie.
      if (order.pickedUpAt && !order.grocomeet) {
        const at = brusselsParts(order.pickedUpAt);
        const quarter = at.hour * 4 + Math.floor(at.minute / 15);
        quarterCounts.set(quarter, (quarterCounts.get(quarter) ?? 0) + 1);
        const delay = (order.pickedUpAt.getTime() - session.pickupStart.getTime()) / 60_000;
        // Een laattijdige afhaling van dagen later zou het gemiddelde vertekenen.
        if (delay >= 0 && delay < 12 * 60) {
          pickupDelayTotal += delay;
          pickupDelayCount += 1;
        }
      }
    } else {
      perDay.notPickedUp[index] += count;
      if (order.status === "NO_SHOW") {
        noShowOrders += 1;
        sandwichesNoShow += count;
        weekdayNoShow[weekday] += 1;
      }
    }
  }

  // ---- per soort ----
  type Acc = ProductStats & { sellOutTotal: number };
  const products = new Map<string, Acc>();
  const linesByItem = new Map<string, Array<{ at: number; quantity: number }>>();
  const pickedByItem = new Map<string, number>();
  const noShowByItem = new Map<string, number>();
  const revenueByItem = new Map<string, number>();
  for (const order of live) {
    for (const line of order.lines) {
      const list = linesByItem.get(line.sessionItemId) ?? [];
      list.push({ at: order.createdAt.getTime(), quantity: line.quantity });
      linesByItem.set(line.sessionItemId, list);
      if (order.status === "PICKED_UP") {
        pickedByItem.set(line.sessionItemId, (pickedByItem.get(line.sessionItemId) ?? 0) + line.quantity);
        if (!order.grocomeet) {
          revenueByItem.set(
            line.sessionItemId,
            (revenueByItem.get(line.sessionItemId) ?? 0) + line.quantity * line.unitPriceCents,
          );
        }
      } else if (order.status === "NO_SHOW") {
        noShowByItem.set(line.sessionItemId, (noShowByItem.get(line.sessionItemId) ?? 0) + line.quantity);
      }
    }
  }

  let itemDays = 0;
  let soldOutItemDays = 0;
  let totalStock = 0;
  let meetingSandwiches = 0;
  for (const { item, session } of itemById.values()) {
    const key = productKey(item);
    let acc = products.get(key);
    if (!acc) {
      acc = {
        key,
        nameNl: item.nameNl,
        nameEn: item.nameEn,
        weeklySpecial: false,
        daysOffered: 0,
        stock: 0,
        ordered: 0,
        meetings: 0,
        pickedUp: 0,
        noShow: 0,
        revenueCents: 0,
        sellThrough: null,
        leftoverPerDay: null,
        soldOutDays: 0,
        avgSellOutMinutes: null,
        noShowRate: null,
        sellOutTotal: 0,
      };
      products.set(key, acc);
    }
    // De naam van de meest recente dag: een soort die hernoemd werd, heet zoals nu.
    acc.nameNl = item.nameNl;
    acc.nameEn = item.nameEn;
    acc.weeklySpecial ||= item.isWeeklySpecial;
    acc.daysOffered += 1;
    acc.stock += item.quantity;
    acc.meetings += item.meetingCount;
    meetingSandwiches += item.meetingCount;
    totalStock += item.quantity;
    itemDays += 1;

    const lines = (linesByItem.get(item.id) ?? []).sort((a, b) => a.at - b.at);
    const ordered = lines.reduce((sum, line) => sum + line.quantity, 0);
    acc.ordered += ordered;
    acc.pickedUp += pickedByItem.get(item.id) ?? 0;
    acc.noShow += noShowByItem.get(item.id) ?? 0;
    acc.revenueCents += revenueByItem.get(item.id) ?? 0;

    if (item.quantity > 0) {
      let running = item.meetingCount;
      let soldOutAt: number | null = running >= item.quantity ? session.orderOpenAt.getTime() : null;
      for (const line of lines) {
        if (soldOutAt !== null) break;
        running += line.quantity;
        if (running >= item.quantity) soldOutAt = line.at;
      }
      if (soldOutAt !== null) {
        acc.soldOutDays += 1;
        soldOutItemDays += 1;
        acc.sellOutTotal += Math.max(0, (soldOutAt - session.orderOpenAt.getTime()) / 60_000);
      }
    }
  }

  const productList: ProductStats[] = [...products.values()]
    .map(({ sellOutTotal, ...acc }) => ({
      ...acc,
      sellThrough: ratio(acc.ordered + acc.meetings, acc.stock),
      leftoverPerDay:
        acc.daysOffered > 0 ? Math.max(0, acc.stock - acc.ordered - acc.meetings) / acc.daysOffered : null,
      avgSellOutMinutes: acc.soldOutDays > 0 ? sellOutTotal / acc.soldOutDays : null,
      noShowRate: ratio(acc.noShow, acc.ordered),
    }))
    .sort((a, b) => b.ordered - a.ordered || a.nameNl.localeCompare(b.nameNl));

  // ---- afhaalmomenten ----
  const quarters = [...quarterCounts.keys()].sort((a, b) => a - b);
  const pickupQuarters = { keys: [] as string[], values: [] as number[] };
  if (quarters.length > 0) {
    for (let quarter = quarters[0]!; quarter <= quarters.at(-1)!; quarter += 1) {
      const hour = String(Math.floor(quarter / 4)).padStart(2, "0");
      const minute = String((quarter % 4) * 15).padStart(2, "0");
      pickupQuarters.keys.push(`${hour}:${minute}`);
      pickupQuarters.values.push(quarterCounts.get(quarter) ?? 0);
    }
  }

  const loyalty = { once: 0, few: 0, regular: 0, loyal: 0 };
  for (const days of daysPerCustomer.values()) {
    if (days.size === 1) loyalty.once += 1;
    else if (days.size <= 3) loyalty.few += 1;
    else if (days.size <= 9) loyalty.regular += 1;
    else loyalty.loyal += 1;
  }
  const customers = daysPerCustomer.size;

  return {
    totals: {
      saleDays: sorted.length,
      orders: live.length,
      customers,
      sandwichesOrdered,
      sandwichesPickedUp,
      sandwichesNoShow,
      revenueCents,
      pickupRate: ratio(pickedUpOrders, pickedUpOrders + noShowOrders),
      avgSandwichesPerOrder: ratio(sandwichesOrdered, live.length),
      avgOrderValueCents: pickedUpOrders > 0 ? revenueCents / pickedUpOrders : null,
      avgPickedUpPerDay: ratio(sandwichesPickedUp, sorted.length),
      sellThrough: ratio(sandwichesOrdered + meetingSandwiches, totalStock),
      soldOutShare: ratio(soldOutItemDays, itemDays),
      returningShare: ratio(customers - loyalty.once, customers),
      voucherShare: ratio(voucherOrders, pickedUpOrders),
      meetingSandwiches,
      firstHourShare: ratio(firstHour, live.length),
    },
    perDay,
    byWeekday: {
      saleDays: weekdayDays,
      avgOrdered: weekdayOrdered.map((count, index) => ratio(count, weekdayDays[index]!)),
      noShowRate: weekdayNoShow.map((count, index) => ratio(count, count + weekdayPicked[index]!)),
    },
    orderHour,
    leadDays,
    pickupQuarters,
    avgPickupDelayMinutes: pickupDelayCount > 0 ? pickupDelayTotal / pickupDelayCount : null,
    orderSizes,
    loyalty,
    products: productList,
  };
}
