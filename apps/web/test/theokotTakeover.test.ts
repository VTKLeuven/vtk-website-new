import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Laat annuleren en overnemen bij het Theokot (`releaseOrder` en
 * `takeOverSandwich` in `lib/theokot-orders.ts`).
 *
 * Wat hier vastligt: na de deadline wist annuleren niets meer maar verhuizen je
 * broodjes naar de vrijgegeven voorraad; iedereen neemt er per stuk een over,
 * jijzelf ook en dan eerst het jouwe; en de laatste overname laat een lege
 * bestelling verdwijnen, zodat er geen no-show overblijft.
 */

const mocks = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderCreate: vi.fn(),
  orderDelete: vi.fn(),
  lineDeleteMany: vi.fn(),
  lineCount: vi.fn(),
  lineDelete: vi.fn(),
  lineUpdate: vi.fn(),
  lineFindMany: vi.fn(),
  releaseUpsert: vi.fn(),
  releaseFindUnique: vi.fn(),
  releaseFindFirst: vi.fn(),
  releaseUpdate: vi.fn(),
  releaseDelete: vi.fn(),
  releaseAggregate: vi.fn(),
  itemFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  activeBanFor: vi.fn(),
  getTheokotConfig: vi.fn(),
  sendOrderTakenOver: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    theokotOrder: { findUnique: vi.fn(), delete: vi.fn() },
    theokotSession: { findMany: vi.fn() },
    setting: { findUnique: vi.fn() },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/mail", () => ({ sendOrderTakenOver: mocks.sendOrderTakenOver }));
vi.mock("@/lib/theokot-server", () => ({
  activeBanFor: mocks.activeBanFor,
  getTheokotConfig: mocks.getTheokotConfig,
}));
vi.mock("@/lib/meetings-server", () => ({
  usageForSessionItems: vi.fn(),
  usageForSessionItemsTx: vi.fn(),
  grocomeetOnDay: vi.fn(),
}));
vi.mock("@/lib/livePermissions", () => ({ hasLivePermission: vi.fn() }));
vi.mock("@/lib/ticketing/transactions", () => ({
  withSerializableTransaction: (fn: (tx: unknown) => unknown) =>
    fn({
      theokotOrder: {
        findUnique: mocks.orderFindUnique,
        update: mocks.orderUpdate,
        create: mocks.orderCreate,
        delete: mocks.orderDelete,
      },
      theokotOrderLine: {
        deleteMany: mocks.lineDeleteMany,
        count: mocks.lineCount,
        delete: mocks.lineDelete,
        update: mocks.lineUpdate,
        findMany: mocks.lineFindMany,
      },
      theokotOrderRelease: {
        upsert: mocks.releaseUpsert,
        findUnique: mocks.releaseFindUnique,
        findFirst: mocks.releaseFindFirst,
        update: mocks.releaseUpdate,
        delete: mocks.releaseDelete,
        aggregate: mocks.releaseAggregate,
      },
      theokotSessionItem: { findUnique: mocks.itemFindUnique },
    }),
}));

import { releaseOrder, takeOverSandwich } from "@/lib/theokot-orders";
import { inTakeoverWindow } from "@/lib/theokot";

// Deadline 10:30, afhaal tot 14:00 (Brussel, zomeruur).
const CLOSE = new Date("2026-09-15T08:30:00.000Z");
const PICKUP_END = new Date("2026-09-15T12:00:00.000Z");
const BEFORE_DEADLINE = new Date("2026-09-15T08:00:00.000Z");
const AFTER_DEADLINE = new Date("2026-09-15T09:00:00.000Z");
const AFTER_PICKUP = new Date("2026-09-15T12:30:00.000Z");

const SESSION = { isOpen: true, orderOpenAt: new Date("2026-09-13T10:00:00.000Z"), orderCloseAt: CLOSE, pickupEnd: PICKUP_END };

const CONFIG = { maxItemsPerOrder: 3, maxWeeklySpecialPerOrder: 1 };

describe("het overnamevenster", () => {
  it("loopt van de deadline tot het einde van de afhaal", () => {
    expect(inTakeoverWindow(SESSION, BEFORE_DEADLINE)).toBe(false);
    expect(inTakeoverWindow(SESSION, CLOSE)).toBe(true);
    expect(inTakeoverWindow(SESSION, AFTER_DEADLINE)).toBe(true);
    expect(inTakeoverWindow(SESSION, PICKUP_END)).toBe(false);
  });

  it("is dicht op een dag die niet doorgaat", () => {
    expect(inTakeoverWindow({ ...SESSION, isOpen: false }, AFTER_DEADLINE)).toBe(false);
  });
});

describe("laat annuleren", () => {
  function reserved(overrides: Record<string, unknown> = {}) {
    return {
      id: "order-a",
      userId: "user-a",
      status: "RESERVED",
      grocomeetId: null,
      voucherRedemption: null,
      session: SESSION,
      lines: [
        { id: "line-kaas", sessionItemId: "kaas", quantity: 2, unitPriceCents: 260 },
        { id: "line-hesp", sessionItemId: "hesp", quantity: 1, unitPriceCents: 280 },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verhuist na de deadline elke lijn naar de vrijgegeven broodjes en wist de bestelling niet", async () => {
    mocks.orderFindUnique.mockResolvedValue(reserved());
    mocks.lineFindMany.mockResolvedValue([]);

    await releaseOrder("user-a", "order-a", AFTER_DEADLINE);

    expect(mocks.releaseUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId_sessionItemId: { orderId: "order-a", sessionItemId: "kaas" } },
        create: expect.objectContaining({ quantity: 2, unitPriceCents: 260, releasedAt: AFTER_DEADLINE }),
        update: { quantity: { increment: 2 } },
      }),
    );
    expect(mocks.releaseUpsert).toHaveBeenCalledTimes(2);
    expect(mocks.lineDelete).toHaveBeenCalledWith({ where: { id: "line-kaas" } });
    expect(mocks.lineDelete).toHaveBeenCalledWith({ where: { id: "line-hesp" } });
    expect(mocks.orderUpdate).toHaveBeenCalledWith({ where: { id: "order-a" }, data: { totalCents: 0 } });
    expect(mocks.orderDelete).not.toHaveBeenCalled();
  });

  it("geeft een deel vrij: de rest blijft van jou en haal je gewoon op", async () => {
    mocks.orderFindUnique.mockResolvedValue(reserved());
    mocks.lineFindMany.mockResolvedValue([
      { quantity: 1, unitPriceCents: 260 },
      { quantity: 1, unitPriceCents: 280 },
    ]);

    await releaseOrder("user-a", "order-a", AFTER_DEADLINE, [{ sessionItemId: "kaas", quantity: 1 }]);

    expect(mocks.releaseUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.releaseUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ sessionItemId: "kaas", quantity: 1 }) }),
    );
    expect(mocks.lineUpdate).toHaveBeenCalledWith({ where: { id: "line-kaas" }, data: { quantity: { decrement: 1 } } });
    expect(mocks.lineDelete).not.toHaveBeenCalled();
    expect(mocks.orderUpdate).toHaveBeenCalledWith({ where: { id: "order-a" }, data: { totalCents: 540 } });
  });

  it("weigert meer vrij te geven dan je hebt", async () => {
    mocks.orderFindUnique.mockResolvedValue(reserved());
    await expect(
      releaseOrder("user-a", "order-a", AFTER_DEADLINE, [{ sessionItemId: "hesp", quantity: 2 }]),
    ).rejects.toMatchObject({ code: "RELEASE_NOT_POSSIBLE" });
    expect(mocks.releaseUpsert).not.toHaveBeenCalled();
  });

  it("weigert voor de deadline: dan is gewoon annuleren de weg", async () => {
    mocks.orderFindUnique.mockResolvedValue(reserved());
    await expect(releaseOrder("user-a", "order-a", BEFORE_DEADLINE)).rejects.toMatchObject({
      code: "RELEASE_NOT_POSSIBLE",
    });
  });

  it("weigert na de afhaal", async () => {
    mocks.orderFindUnique.mockResolvedValue(reserved());
    await expect(releaseOrder("user-a", "order-a", AFTER_PICKUP)).rejects.toMatchObject({ code: "TAKEOVER_CLOSED" });
  });

  it("weigert een bestelling in de doos van de grocomeet", async () => {
    mocks.orderFindUnique.mockResolvedValue(reserved({ grocomeetId: "gm-1" }));
    await expect(releaseOrder("user-a", "order-a", AFTER_DEADLINE)).rejects.toMatchObject({
      code: "RELEASE_NOT_POSSIBLE",
    });
  });

  it("zegt hetzelfde voor een bestelling van iemand anders als voor een onbestaande", async () => {
    mocks.orderFindUnique.mockResolvedValue(reserved({ userId: "user-b" }));
    await expect(releaseOrder("user-a", "order-a", AFTER_DEADLINE)).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  it("is idempotent: wie alles al vrijgaf, heeft niets meer om vrij te geven", async () => {
    mocks.orderFindUnique.mockResolvedValue(reserved({ lines: [] }));
    await releaseOrder("user-a", "order-a", AFTER_DEADLINE);
    expect(mocks.releaseUpsert).not.toHaveBeenCalled();
    expect(mocks.orderUpdate).not.toHaveBeenCalled();
  });
});

describe("een broodje overnemen", () => {
  const items = [
    { id: "kaas", priceCents: 260, quantity: 10, isWeeklySpecial: false },
    { id: "special", priceCents: 300, quantity: 4, isWeeklySpecial: true },
  ];

  function release(overrides: Record<string, unknown> = {}) {
    return {
      id: "rel-a",
      orderId: "order-a",
      sessionItemId: "kaas",
      quantity: 2,
      unitPriceCents: 260,
      releasedAt: AFTER_DEADLINE,
      order: { id: "order-a", userId: "user-a", status: "RESERVED" },
      ...overrides,
    };
  }

  function myOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: "order-b",
      userId: "user-b",
      status: "RESERVED",
      grocomeetId: null,
      voucherRedemption: null,
      lines: [],
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTheokotConfig.mockResolvedValue(CONFIG);
    mocks.activeBanFor.mockResolvedValue(null);
    mocks.itemFindUnique.mockResolvedValue({
      id: "kaas",
      nameNl: "Smos kaas",
      nameEn: "Cheese club",
      session: { id: "sess-1", date: new Date("2026-09-14T22:00:00.000Z"), ...SESSION, items },
    });
    mocks.orderFindUnique.mockResolvedValue(null);
    mocks.releaseFindUnique.mockResolvedValue(null);
    mocks.releaseFindFirst.mockResolvedValue(release());
    mocks.releaseAggregate.mockResolvedValue({ _sum: { quantity: 1 } });
    mocks.lineCount.mockResolvedValue(0);
    mocks.orderCreate.mockResolvedValue({ id: "order-b", totalCents: 260 });
    mocks.orderUpdate.mockResolvedValue({ id: "order-b", totalCents: 260 });
    mocks.userFindUnique.mockResolvedValue({ name: "Anna", email: "anna@example.test", locale: "NL" });
  });

  it("schuift één stuk van de vrijgave naar een nieuwe bestelling", async () => {
    const result = await takeOverSandwich("user-b", "kaas", AFTER_DEADLINE);

    expect(result).toEqual({ orderId: "order-b", totalCents: 260 });
    expect(mocks.releaseUpdate).toHaveBeenCalledWith({ where: { id: "rel-a" }, data: { quantity: { decrement: 1 } } });
    expect(mocks.orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-b",
          totalCents: 260,
          lines: { create: [{ sessionItemId: "kaas", quantity: 1, unitPriceCents: 260 }] },
        }),
      }),
    );
    // Wie vrijgaf, houdt nog een broodje vrij staan: zijn bestelling blijft.
    expect(mocks.orderDelete).not.toHaveBeenCalled();
    expect(mocks.sendOrderTakenOver).toHaveBeenCalledWith(
      expect.objectContaining({ email: "anna@example.test" }),
      expect.objectContaining({ itemLabel: "Smos kaas", remaining: 1, canTakeBack: true }),
    );
    // Een overgenomen broodje blijft aan de balie, nooit in de doos van de GM.
    expect(mocks.orderCreate.mock.calls[0][0].data.takenOverAt).toEqual(AFTER_DEADLINE);
  });

  it("neemt van de oudste vrijgave, ook van wie zijn eigen deel al ophaalde", async () => {
    await takeOverSandwich("user-b", "kaas", AFTER_DEADLINE);

    const query = mocks.releaseFindFirst.mock.calls[0][0];
    expect(query.orderBy[0]).toEqual({ releasedAt: "asc" });
    expect(query.where.order).toEqual({ status: { in: ["RESERVED", "PICKED_UP"] } });
  });

  it("laat een lege bestelling verdwijnen bij het laatste stuk: geen no-show", async () => {
    mocks.releaseFindFirst.mockResolvedValue(release({ quantity: 1 }));
    mocks.releaseAggregate.mockResolvedValue({ _sum: { quantity: null } });

    await takeOverSandwich("user-b", "kaas", AFTER_DEADLINE);

    expect(mocks.releaseDelete).toHaveBeenCalledWith({ where: { id: "rel-a" } });
    expect(mocks.orderDelete).toHaveBeenCalledWith({ where: { id: "order-a" } });
    expect(mocks.sendOrderTakenOver).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ remaining: 0 }),
    );
  });

  it("laat de bestelling staan wanneer er nog iets van hem op staat", async () => {
    mocks.releaseFindFirst.mockResolvedValue(release({ quantity: 1 }));
    mocks.releaseAggregate.mockResolvedValue({ _sum: { quantity: null } });
    mocks.lineCount.mockResolvedValue(1);

    await takeOverSandwich("user-b", "kaas", AFTER_DEADLINE);

    expect(mocks.orderDelete).not.toHaveBeenCalled();
  });

  it("laat een opgehaalde bestelling staan: die is betaald", async () => {
    mocks.releaseFindFirst.mockResolvedValue(
      release({ quantity: 1, order: { id: "order-a", userId: "user-a", status: "PICKED_UP" } }),
    );
    mocks.releaseAggregate.mockResolvedValue({ _sum: { quantity: null } });

    await takeOverSandwich("user-b", "kaas", AFTER_DEADLINE);

    expect(mocks.lineCount).not.toHaveBeenCalled();
    expect(mocks.orderDelete).not.toHaveBeenCalled();
    // Na het ophalen kan wie vrijgaf niets meer terugnemen: de mail zegt dat niet.
    expect(mocks.sendOrderTakenOver).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ canTakeBack: false }),
    );
  });

  it("neemt eerst je eigen vrijgegeven broodje terug, zonder mail", async () => {
    mocks.orderFindUnique.mockResolvedValue(myOrder());
    mocks.releaseFindUnique.mockResolvedValue(
      release({ id: "rel-b", orderId: "order-b", quantity: 1, order: { id: "order-b", userId: "user-b", status: "RESERVED" } }),
    );

    await takeOverSandwich("user-b", "kaas", AFTER_DEADLINE);

    expect(mocks.releaseFindFirst).not.toHaveBeenCalled();
    expect(mocks.releaseDelete).toHaveBeenCalledWith({ where: { id: "rel-b" } });
    expect(mocks.orderDelete).not.toHaveBeenCalled();
    expect(mocks.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-b" },
        data: expect.objectContaining({
          totalCents: 260,
          lines: { create: [{ sessionItemId: "kaas", quantity: 1, unitPriceCents: 260 }] },
        }),
      }),
    );
    expect(mocks.sendOrderTakenOver).not.toHaveBeenCalled();
    // Je eigen broodje terug is geen overname: geen markering.
    expect(mocks.orderUpdate.mock.calls[0][0].data.takenOverAt).toBeUndefined();
  });

  it("neemt van een ander wanneer je zelf iets anders vrijgaf", async () => {
    mocks.orderFindUnique.mockResolvedValue(myOrder());

    await takeOverSandwich("user-b", "kaas", AFTER_DEADLINE);

    expect(mocks.releaseFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orderId_sessionItemId: { orderId: "order-b", sessionItemId: "kaas" } } }),
    );
    expect(mocks.releaseUpdate).toHaveBeenCalledWith({ where: { id: "rel-a" }, data: { quantity: { decrement: 1 } } });
    expect(mocks.sendOrderTakenOver).toHaveBeenCalled();
  });

  it("voegt het stuk toe aan je bestaande reservatie", async () => {
    mocks.orderFindUnique.mockResolvedValue(myOrder({ lines: [{ sessionItemId: "special", quantity: 1 }] }));
    mocks.orderUpdate.mockResolvedValue({ id: "order-b", totalCents: 560 });

    await takeOverSandwich("user-b", "kaas", AFTER_DEADLINE);

    expect(mocks.lineDeleteMany).toHaveBeenCalledWith({ where: { orderId: "order-b" } });
    expect(mocks.orderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "order-b" },
        data: expect.objectContaining({ totalCents: 560 }),
      }),
    );
  });

  it("houdt zich aan het maximum per dag", async () => {
    mocks.orderFindUnique.mockResolvedValue(myOrder({ lines: [{ sessionItemId: "kaas", quantity: 3 }] }));

    await expect(takeOverSandwich("user-b", "kaas", AFTER_DEADLINE)).rejects.toMatchObject({
      name: "TheokotValidationError",
    });
    expect(mocks.releaseUpdate).not.toHaveBeenCalled();
    expect(mocks.releaseDelete).not.toHaveBeenCalled();
  });

  it("weigert wie zijn bestelling van die dag al ophaalde", async () => {
    mocks.orderFindUnique.mockResolvedValue(myOrder({ status: "PICKED_UP" }));
    await expect(takeOverSandwich("user-b", "kaas", AFTER_DEADLINE)).rejects.toMatchObject({
      code: "TAKEOVER_UNAVAILABLE",
    });
  });

  it("weigert wanneer iemand anders het net nam", async () => {
    mocks.releaseFindFirst.mockResolvedValue(null);
    await expect(takeOverSandwich("user-b", "kaas", AFTER_DEADLINE)).rejects.toMatchObject({
      code: "NOTHING_RELEASED",
    });
  });

  it("weigert buiten het venster", async () => {
    await expect(takeOverSandwich("user-b", "kaas", BEFORE_DEADLINE)).rejects.toMatchObject({
      code: "TAKEOVER_CLOSED",
    });
    await expect(takeOverSandwich("user-b", "kaas", AFTER_PICKUP)).rejects.toMatchObject({
      code: "TAKEOVER_CLOSED",
    });
  });

  it("weigert wie geschorst is", async () => {
    mocks.activeBanFor.mockResolvedValue({ endsAt: new Date("2026-09-30T00:00:00.000Z") });
    await expect(takeOverSandwich("user-b", "kaas", AFTER_DEADLINE)).rejects.toMatchObject({ code: "BANNED" });
  });

  it("een mail die niet vertrekt, draait de overname niet terug", async () => {
    mocks.sendOrderTakenOver.mockRejectedValue(new Error("smtp weg"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(takeOverSandwich("user-b", "kaas", AFTER_DEADLINE)).resolves.toEqual({
      orderId: "order-b",
      totalCents: 260,
    });
    spy.mockRestore();
  });
});
