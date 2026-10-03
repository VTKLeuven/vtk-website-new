import { describe, expect, it } from "vitest";
import {
  brusselsParts,
  bucketRange,
  computeTicketStats,
  type StatsEventInput,
  type StatsTicketInput,
} from "@/lib/ticketing/statsCompute";

function event(overrides: Partial<StatsEventInput> = {}): StatsEventInput {
  return {
    id: "e1",
    title: "Cantus",
    slug: "cantus",
    groupId: "g1",
    groupName: "Activiteiten",
    startsAt: new Date("2026-10-01T18:00:00Z"),
    salesOpenAt: new Date("2026-09-20T18:00:00Z"),
    capacity: 4,
    currency: "EUR",
    finance: true,
    ...overrides,
  };
}

let seq = 0;
function ticket(overrides: Partial<StatsTicketInput> = {}): StatsTicketInput {
  seq += 1;
  return {
    eventId: "e1",
    typeId: "t1",
    typeName: "Bier",
    status: "VALID",
    soldAt: new Date("2026-09-20T18:05:00Z"),
    checkedInAt: null,
    totalCents: 1000,
    refundedCents: 0,
    memberPrice: false,
    orderId: `o${seq}`,
    buyerKey: `b${seq}`,
    signedIn: true,
    source: "kalender",
    campaign: null,
    accountingCode: "700100 10001",
    accountingCodeName: "Cantussen",
    provider: "bancontact",
    ...overrides,
  };
}

const NOW = new Date("2026-10-05T10:00:00Z");

describe("ticket stats", () => {
  it("counts only valid tickets as sold, and refunds apart", () => {
    const stats = computeTicketStats(
      [event()],
      [ticket(), ticket(), ticket({ status: "REFUNDED", refundedCents: 1000 }), ticket({ status: "VOID" })],
      [],
      [],
      { now: NOW },
    );
    expect(stats.totals.sold).toBe(2);
    expect(stats.totals.refunded).toBe(1);
    expect(stats.totals.voided).toBe(1);
    expect(stats.totals.occupancy).toBe(0.5);
    // Het ongeldige ticket werd niet terugbetaald: dat geld is er nog.
    expect(stats.totals.netCents).toBe(3000);
  });

  it("hides revenue for events without finance access", () => {
    const stats = computeTicketStats(
      [event(), event({ id: "e2", finance: false })],
      [ticket(), ticket({ eventId: "e2" })],
      [],
      [],
      { now: NOW },
    );
    expect(stats.totals.netCents).toBe(1000);
    expect(stats.totals.financeEvents).toBe(1);
    expect(stats.events.find((row) => row.id === "e2")?.netCents).toBeNull();
  });

  it("puts a sale after midnight in Brussels on the next day", () => {
    // 22:30 UTC is 00:30 in Brussel (zomeruur).
    expect(brusselsParts(new Date("2026-09-20T22:30:00Z"))).toMatchObject({ day: "2026-09-21", hour: 0 });
    const stats = computeTicketStats(
      [event()],
      [ticket({ soldAt: new Date("2026-09-20T22:30:00Z") })],
      [],
      [],
      { now: new Date("2026-09-21T10:00:00Z") },
    );
    expect(stats.perBucket.keys[0]).toBe("2026-09-21");
    expect(stats.byHour[0]).toBe(1);
  });

  it("measures how fast an event sold out from the opening", () => {
    const open = new Date("2026-09-20T18:00:00Z").getTime();
    const stats = computeTicketStats(
      [event()],
      [0, 1, 3, 12].map((minutes) => ticket({ soldAt: new Date(open + minutes * 60_000) })),
      [],
      [],
      { now: NOW },
    );
    expect(stats.events[0].halfAfterMs).toBe(60_000);
    expect(stats.events[0].soldOutAfterMs).toBe(12 * 60_000);
    expect(stats.events[0].firstDayShare).toBe(1);
  });

  it("counts a buyer for two events as returning", () => {
    const stats = computeTicketStats(
      [event(), event({ id: "e2" })],
      [ticket({ buyerKey: "a" }), ticket({ eventId: "e2", buyerKey: "a" }), ticket({ buyerKey: "b" })],
      [],
      [],
      { now: NOW },
    );
    expect(stats.totals.buyers).toBe(2);
    expect(stats.totals.returningBuyers).toBe(1);
  });

  it("switches to weeks for a long range", () => {
    const stats = computeTicketStats(
      [event(), event({ id: "e2" })],
      [ticket({ soldAt: new Date("2026-01-05T12:00:00Z") }), ticket({ soldAt: new Date("2026-09-20T12:00:00Z") })],
      [],
      [],
      { now: NOW },
    );
    expect(stats.perBucket.unit).toBe("week");
    expect(stats.perBucket.keys[0]).toBe("2026-01-05");
    expect(bucketRange("2026-09-23", "2026-10-05", "week")).toEqual(["2026-09-21", "2026-09-28", "2026-10-05"]);
  });

  it("keeps not-measured orders last and computes completion per source", () => {
    const stats = computeTicketStats(
      [event()],
      [ticket({ source: null }), ticket({ source: "facebook", campaign: "story" }), ticket({ source: "facebook" })],
      [
        { eventId: "e1", status: "PAID", source: "facebook", count: 2 },
        { eventId: "e1", status: "EXPIRED", source: "facebook", count: 2 },
        { eventId: "e1", status: "PAID", source: null, count: 1 },
      ],
      [],
      { now: NOW },
    );
    expect(stats.sources.map((row) => row.key)).toEqual(["facebook", null]);
    expect(stats.sources[0].conversion).toBe(0.5);
    expect(stats.sources[0].campaigns).toEqual([{ key: "story", orders: 1, tickets: 1 }]);
    expect(stats.funnel).toMatchObject({ started: 5, paid: 3, expired: 2 });
  });

  it("gives at most four ticket types their own series on one event", () => {
    const types = ["a", "b", "c", "d", "e"].map((id, index) => ({
      id,
      eventId: "e1",
      name: id.toUpperCase(),
      audience: "PUBLIC",
      sortOrder: index,
    }));
    const stats = computeTicketStats(
      [event({ capacity: 0 })],
      types.map((type) => ticket({ typeId: type.id, typeName: type.name })),
      [],
      types,
      { now: NOW },
    );
    expect(stats.perBucket.series.map((series) => series.key)).toEqual(["a", "b", "c", "other"]);
    expect(stats.perBucket.series[3].values[0]).toBe(2);
    expect(stats.totals.occupancy).toBeNull();
  });
});

describe("ticket stats per accounting code", () => {
  it("counts a ticket under the code of its order, so a switched event shows both codes", () => {
    const stats = computeTicketStats(
      [event()],
      [
        ticket({ accountingCode: "700100", accountingCodeName: "Activiteiten opbrengsten" }),
        ticket(),
        ticket({ provider: "mollie" }),
        ticket({ accountingCode: null, accountingCodeName: null }),
      ],
      [],
      [],
      { now: NOW },
    );
    expect(stats.accountingCodes.map((row) => [row.code, row.sold, row.netCents])).toEqual([
      ["700100", 1, 1000],
      ["700100 10001", 2, 2000],
      // Zonder code onderaan: dat is geen code maar een gat.
      [null, 1, 1000],
    ]);
    const cantussen = stats.accountingCodes.find((row) => row.code === "700100 10001")!;
    expect(cantussen.providers.map((row) => [row.provider, row.sold, row.netCents])).toEqual([
      ["bancontact", 1, 1000],
      ["mollie", 1, 1000],
    ]);
  });

  it("takes the newest name when a code was renamed between two orders", () => {
    const stats = computeTicketStats(
      [event()],
      [
        ticket({ accountingCodeName: "Cantus", soldAt: new Date("2026-09-20T18:00:00Z") }),
        ticket({ accountingCodeName: "Cantussen", soldAt: new Date("2026-09-21T18:00:00Z") }),
      ],
      [],
      [],
      { now: NOW },
    );
    expect(stats.accountingCodes).toHaveLength(1);
    expect(stats.accountingCodes[0].name).toBe("Cantussen");
  });

  it("keeps the money of a refunded ticket out and of events without finance hidden", () => {
    const stats = computeTicketStats(
      [event(), event({ id: "e2", finance: false })],
      [
        ticket(),
        ticket({ status: "REFUNDED", refundedCents: 1000 }),
        ticket({ eventId: "e2" }),
      ],
      [],
      [],
      { now: NOW },
    );
    const row = stats.accountingCodes[0];
    expect(row.sold).toBe(2);
    expect(row.refunded).toBe(1);
    expect(row.netCents).toBe(1000);
    expect(row.hiddenFinance).toBe(1);
  });
});
