import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settingFindUnique: vi.fn(),
  sessionFindUnique: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionDelete: vi.fn(),
  orderFindMany: vi.fn(),
  orderUpdateMany: vi.fn(),
  orderCount: vi.fn(),
  banFindFirst: vi.fn(),
  banFindMany: vi.fn(),
  banUpdate: vi.fn(),
  banCreate: vi.fn(),
  sendNoShowWarning: vi.fn(),
  sendOrderCancelled: vi.fn(),
}));

vi.mock("@vtk/db", () => {
  const prisma = {
    setting: { findUnique: mocks.settingFindUnique },
    theokotSession: {
      findUnique: mocks.sessionFindUnique,
      update: mocks.sessionUpdate,
      delete: mocks.sessionDelete,
    },
    theokotOrder: {
      findMany: mocks.orderFindMany,
      updateMany: mocks.orderUpdateMany,
      count: mocks.orderCount,
    },
    theokotBan: {
      findFirst: mocks.banFindFirst,
      findMany: mocks.banFindMany,
      update: mocks.banUpdate,
      create: mocks.banCreate,
    },
  };
  return { prisma };
});

vi.mock("@/lib/ticketing/transactions", async () => {
  const { prisma } = await import("@vtk/db");
  return { withSerializableTransaction: (fn: (tx: unknown) => unknown) => fn(prisma) };
});

vi.mock("@/lib/mail", () => ({
  sendNoShowWarning: mocks.sendNoShowWarning,
  sendOrderCancelled: mocks.sendOrderCancelled,
}));

import { purgeFinishedSession, unwaiveSessionNoShows } from "@/lib/theokot-server";

const NOW = new Date("2026-09-28T14:00:00.000Z");
const WAIVED_AT = new Date("2026-09-28T09:00:00.000Z");
const DAY = new Date("2026-09-24T22:00:00.000Z");
const user = { name: "Jan", email: "jan@vtk.be", locale: "NL" as const };

function config(overrides: Record<string, unknown> = {}) {
  mocks.settingFindUnique.mockResolvedValue({
    value: { noShowThreshold: 3, banDurationDays: 14, noShowPaused: false, ...overrides },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  config();
  mocks.banFindMany.mockResolvedValue([]);
  mocks.banFindFirst.mockResolvedValue(null);
  mocks.orderCount.mockResolvedValue(0);
});

describe("unwaiveSessionNoShows", () => {
  it("laat de no-shows weer meetellen, mailt wie geen mail kreeg en herstelt een opgeheven ban", async () => {
    mocks.sessionFindUnique.mockResolvedValue({ id: "s1", date: DAY, noShowsWaivedAt: WAIVED_AT });
    mocks.orderFindMany.mockResolvedValue([
      // Verwerkt terwijl de dag aangeduid stond: kreeg geen mail.
      { id: "o1", userId: "u1", user, noShowProcessedAt: new Date("2026-09-28T10:00:00.000Z") },
      // Al gemaild voor de aanduiding.
      { id: "o2", userId: "u2", user, noShowProcessedAt: new Date("2026-09-25T12:00:00.000Z") },
    ]);
    const startsAt = new Date("2026-09-25T12:00:00.000Z");
    mocks.banFindMany.mockResolvedValue([{ id: "b1", startsAt }]);

    const res = await unwaiveSessionNoShows("s1");

    expect(mocks.sessionUpdate).toHaveBeenCalledWith({ where: { id: "s1" }, data: { noShowsWaivedAt: null } });
    expect(mocks.orderUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["o1", "o2"] } },
      data: { noShowWaivedAt: null },
    });
    // Enkel de bans die deze aanduiding ophief: `endsAt` op haar tijdstip.
    expect(mocks.banFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ active: false, endsAt: WAIVED_AT }) }),
    );
    expect(mocks.banUpdate).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { active: true, endsAt: new Date(startsAt.getTime() + 14 * 86400000) },
    });
    expect(mocks.sendNoShowWarning).toHaveBeenCalledTimes(1);
    expect(mocks.sendNoShowWarning).toHaveBeenCalledWith(user, expect.any(String), "o1", "order");
    expect(res).toEqual({ date: DAY, orders: 2, mailed: 1, restoredBans: 1, newBans: 0 });
  });

  it("laat tijdens een pauze de no-shows zonder mail buiten beschouwing", async () => {
    config({ noShowPaused: true });
    mocks.sessionFindUnique.mockResolvedValue({ id: "s1", date: DAY, noShowsWaivedAt: WAIVED_AT });
    mocks.orderFindMany.mockResolvedValue([
      { id: "o1", userId: "u1", user, noShowProcessedAt: new Date("2026-09-28T10:00:00.000Z") },
      { id: "o2", userId: "u2", user, noShowProcessedAt: new Date("2026-09-25T12:00:00.000Z") },
    ]);

    const res = await unwaiveSessionNoShows("s1");

    expect(mocks.orderUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["o2"] } },
      data: { noShowWaivedAt: null },
    });
    expect(mocks.sendNoShowWarning).not.toHaveBeenCalled();
    expect(res?.orders).toBe(1);
  });

  it("spreekt een ban uit wie door het terugdraaien de drempel haalt", async () => {
    mocks.sessionFindUnique.mockResolvedValue({ id: "s1", date: DAY, noShowsWaivedAt: WAIVED_AT });
    mocks.orderFindMany.mockResolvedValue([
      { id: "o1", userId: "u1", user, noShowProcessedAt: new Date("2026-09-28T10:00:00.000Z") },
    ]);
    mocks.orderCount.mockResolvedValue(3);

    const res = await unwaiveSessionNoShows("s1");

    expect(mocks.banCreate).toHaveBeenCalledTimes(1);
    expect(res?.newBans).toBe(1);
  });

  it("doet niets bij een dag die niet aangeduid is", async () => {
    mocks.sessionFindUnique.mockResolvedValue({ id: "s1", date: DAY, noShowsWaivedAt: null });

    const res = await unwaiveSessionNoShows("s1");

    expect(res).toEqual({ date: DAY, orders: 0, mailed: 0, restoredBans: 0, newBans: 0 });
    expect(mocks.sessionUpdate).not.toHaveBeenCalled();
  });
});

describe("purgeFinishedSession", () => {
  it("weigert een dag waarvan de afhaal nog niet voorbij is", async () => {
    mocks.sessionFindUnique.mockResolvedValue({
      id: "s1",
      date: DAY,
      pickupEnd: new Date(NOW.getTime() + 3600000),
      orders: [],
    });

    const res = await purgeFinishedSession("s1", NOW);

    expect(res).toEqual({ ok: false, code: "SESSION_NOT_OVER" });
    expect(mocks.sessionDelete).not.toHaveBeenCalled();
  });

  it("wist een voorbije dag met opgehaalde broodjes, zonder mail", async () => {
    mocks.sessionFindUnique
      // purgeFinishedSession
      .mockResolvedValueOnce({
        id: "s1",
        date: DAY,
        pickupEnd: new Date("2026-09-25T12:00:00.000Z"),
        orders: [{ status: "PICKED_UP" }, { status: "PICKED_UP" }, { status: "NO_SHOW" }],
      })
      // waiveSessionNoShows
      .mockResolvedValueOnce({ id: "s1", date: DAY, processedAt: new Date(), noShowsWaivedAt: null });
    mocks.orderFindMany.mockResolvedValue([{ id: "o3", userId: "u1", noShowProcessedAt: new Date() }]);

    const res = await purgeFinishedSession("s1", NOW);

    expect(mocks.orderUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["o3"] } },
      data: { noShowWaivedAt: NOW },
    });
    expect(mocks.sessionDelete).toHaveBeenCalledWith({ where: { id: "s1" } });
    expect(mocks.sendNoShowWarning).not.toHaveBeenCalled();
    expect(mocks.sendOrderCancelled).not.toHaveBeenCalled();
    expect(res).toEqual({ ok: true, date: DAY, orders: 3, pickedUp: 2, liftedBans: 0 });
  });
});
