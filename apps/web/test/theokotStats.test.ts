import { describe, expect, it } from "vitest";
import { computeTheokotStats, type StatsOrder, type StatsSession } from "@/lib/theokot-stats";

/**
 * De rekenregels van de broodjesstatistieken. Twee verkoopdagen: maandag 21
 * en dinsdag 22 september 2026, bestellen opent telkens de dag voordien om 12u
 * (Brusselse tijd), afhalen vanaf 12u.
 */
const at = (iso: string) => new Date(iso);

function session(id: string, day: string, kaas: number, hesp: number, meetings = 0): StatsSession {
  const previous = new Date(`${day}T12:00:00+02:00`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return {
    id,
    date: at(`${day}T00:00:00+02:00`),
    orderOpenAt: previous,
    orderCloseAt: at(`${day}T10:30:00+02:00`),
    pickupStart: at(`${day}T12:00:00+02:00`),
    items: [
      { id: `${id}-kaas`, productId: "kaas", nameNl: "Kaas", nameEn: null, priceCents: 260, quantity: kaas, isWeeklySpecial: false, meetingCount: meetings },
      { id: `${id}-hesp`, productId: "hesp", nameNl: "Hesp", nameEn: null, priceCents: 300, quantity: hesp, isWeeklySpecial: false, meetingCount: 0 },
    ],
  };
}

function order(
  id: string,
  sessionId: string,
  userId: string,
  status: StatsOrder["status"],
  createdAt: string,
  lines: Array<[item: string, quantity: number, price: number]>,
  extra: Partial<StatsOrder> = {},
): StatsOrder {
  return {
    id,
    sessionId,
    userId,
    status,
    createdAt: at(createdAt),
    pickedUpAt: null,
    totalCents: lines.reduce((sum, [, quantity, price]) => sum + quantity * price, 0),
    voucher: false,
    grocomeet: false,
    lines: lines.map(([sessionItemId, quantity, unitPriceCents]) => ({ sessionItemId, quantity, unitPriceCents })),
    ...extra,
  };
}

const sessions = [session("ma", "2026-09-21", 2, 5, 1), session("di", "2026-09-22", 3, 5)];
const orders: StatsOrder[] = [
  // Maandag: kaas is uitverkocht een halfuur na het openen (1 vergadering + 1).
  order("o1", "ma", "anna", "PICKED_UP", "2026-09-20T12:30:00+02:00", [["ma-kaas", 1, 260]], {
    pickedUpAt: at("2026-09-21T12:20:00+02:00"),
  }),
  order("o2", "ma", "bert", "NO_SHOW", "2026-09-21T09:00:00+02:00", [["ma-hesp", 2, 300]]),
  // Dinsdag: niets uitverkocht.
  order("o3", "di", "anna", "PICKED_UP", "2026-09-22T08:00:00+02:00", [["di-kaas", 1, 260], ["di-hesp", 1, 300]], {
    pickedUpAt: at("2026-09-22T12:40:00+02:00"),
    voucher: true,
  }),
  order("o4", "di", "cis", "CANCELLED", "2026-09-21T13:00:00+02:00", [["di-kaas", 2, 260]]),
];

describe("broodjesstatistieken", () => {
  const stats = computeTheokotStats(sessions, orders);

  it("telt verkocht als opgehaald, en een annulatie niet", () => {
    expect(stats.totals.orders).toBe(3);
    expect(stats.totals.sandwichesOrdered).toBe(5);
    expect(stats.totals.sandwichesPickedUp).toBe(3);
    expect(stats.totals.sandwichesNoShow).toBe(2);
    expect(stats.totals.revenueCents).toBe(260 + 560);
    expect(stats.totals.pickupRate).toBeCloseTo(2 / 3);
    expect(stats.totals.voucherShare).toBeCloseTo(1 / 2);
  });

  it("rekent een vergadering mee voor de voorraad, niet voor de opbrengst", () => {
    const kaas = stats.products.find((product) => product.key === "kaas")!;
    expect(kaas.meetings).toBe(1);
    expect(kaas.ordered).toBe(2);
    expect(kaas.sellThrough).toBeCloseTo(3 / 5);
    expect(kaas.revenueCents).toBe(520);
  });

  it("meet hoe snel een soort uitverkocht raakt, vanaf het openen", () => {
    const kaas = stats.products.find((product) => product.key === "kaas")!;
    expect(kaas.soldOutDays).toBe(1);
    expect(kaas.avgSellOutMinutes).toBe(30);
    const hesp = stats.products.find((product) => product.key === "hesp")!;
    expect(hesp.soldOutDays).toBe(0);
    expect(hesp.avgSellOutMinutes).toBeNull();
    expect(stats.totals.soldOutShare).toBeCloseTo(1 / 4);
  });

  it("deelt in per weekdag, per uur en naar hoeveel dagen op voorhand", () => {
    expect(stats.byWeekday.saleDays.slice(0, 2)).toEqual([1, 1]);
    expect(stats.byWeekday.avgOrdered[0]).toBe(3);
    expect(stats.byWeekday.noShowRate[0]).toBe(1 / 2);
    expect(stats.orderHour[12]).toBe(1);
    expect(stats.orderHour[9]).toBe(1);
    expect(stats.orderHour[8]).toBe(1);
    expect(stats.leadDays).toEqual({ sameDay: 2, dayBefore: 1, earlier: 0 });
  });

  it("telt terugkerende klanten en de afhaalmomenten per kwartier", () => {
    expect(stats.totals.customers).toBe(2);
    expect(stats.totals.returningShare).toBe(1 / 2);
    expect(stats.pickupQuarters.keys).toEqual(["12:15", "12:30"]);
    expect(stats.pickupQuarters.values).toEqual([1, 1]);
    expect(stats.avgPickupDelayMinutes).toBe(30);
  });
});

/**
 * Wat een groco zelf bij Theokot bestelde voor in de doos van de grocomeet, is
 * verkocht, maar het kwam niet langs de balie en werd er niet betaald. De
 * verwerking zet het op opgehaald met haar eigen tijdstip, en dat mag geen
 * afhaalmoment worden.
 */
describe("een bestelling in de doos van de grocomeet", () => {
  const withBox = computeTheokotStats(sessions, [
    ...orders,
    order("o5", "di", "dirk", "PICKED_UP", "2026-09-21T12:10:00+02:00", [["di-hesp", 2, 300]], {
      pickedUpAt: at("2026-09-22T16:20:00+02:00"),
      grocomeet: true,
    }),
  ]);

  it("telt als verkocht, niet als opbrengst van de balie", () => {
    expect(withBox.totals.sandwichesPickedUp).toBe(5);
    expect(withBox.totals.revenueCents).toBe(260 + 560);
    const hesp = withBox.products.find((product) => product.key === "hesp")!;
    expect(hesp.pickedUp).toBe(3);
    expect(hesp.revenueCents).toBe(300);
  });

  it("laat de afhaalmomenten aan de balie ongemoeid", () => {
    expect(withBox.pickupQuarters.keys).toEqual(["12:15", "12:30"]);
    expect(withBox.avgPickupDelayMinutes).toBe(30);
  });
});
