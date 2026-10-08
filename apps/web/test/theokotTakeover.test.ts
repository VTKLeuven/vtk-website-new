import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Laat annuleren en overnemen bij het Theokot (`releaseOrder`,
 * `unreleaseOrder`, `takeOverSandwich` in `lib/theokot-orders.ts`).
 *
 * Wat hier vastligt: na de deadline wist annuleren niets meer maar geeft het
 * vrij; een overname schuift precies één stuk van de oudste vrijgave naar wie
 * overneemt; en de laatste overname laat de vrijgegeven bestelling verdwijnen,
 * zodat er geen no-show overblijft.
 */

const mocks = vi.hoisted(() => ({
  orderFindUnique: vi.fn(),
  orderUpdate: vi.fn(),
  orderCreate: vi.fn(),
  orderDelete: vi.fn(),
  lineUpdate: vi.fn(),
  lineUpdateMany: vi.fn(),
  lineDelete: vi.fn(),
  lineDeleteMany: vi.fn(),
  lineFindFirst: vi.fn(),
  lineFindMany: vi.fn(),
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
        update: mocks.lineUpdate,
        updateMany: mocks.lineUpdateMany,
        delete: mocks.lineDelete,
        deleteMany: mocks.lineDeleteMany,
        findFirst: mocks.lineFindFirst,
        findMany: mocks.lineFindMany,
      },
      theokotSessionItem: { findUnique: mocks.itemFindUnique },
    }),
}));

import { releaseOrder, takeOverSandwich, unreleaseOrder } from "@/lib/theokot-orders";
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
      releasedAt: null,
      voucherRedemption: null,
      session: SESSION,
      lines: [
        { id: "line-1", quantity: 2 },
        { id: "line-2", quantity: 1 },
      ],
      ...overrides,
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("geeft na de deadline elke lijn volledig vrij en wist niets", async () => {
    mocks.orderFindUnique.mockResolvedValue(reserved());

    await releaseOrder("user-a", "order-a", AFTER_DEADLINE);

    expect(mocks.orderUpdate).toHaveBeenCalledWith({ where: { id: "order-a" }, data: { releasedAt: AFTER_DEADLINE } });
    expect(mocks.lineUpdate).toHaveBeenCalledWith({ where: { id: "line-1" }, data: { releasedQuantity: 2 } });
    expect(mocks.lineUpdate).toHaveBeenCalledWith({ where: { id: "line-2" }, data: { releasedQuantity: 1 } });
    expect(mocks.orderDelete).not.toHaveBeenCalled();
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

  it("is idempotent", async () => {
    mocks.orderFindUnique.mockResolvedValue(reserved({ releasedAt: AFTER_DEADLINE }));
    await releaseOrder("user-a", "order-a", AFTER_DEADLINE);
    expect(mocks.orderUpdate).not.toHaveBeenCalled();
  });

  it("toch zelf ophalen zet alles terug op je naam", async () => {
    mocks.orderFindUnique.mockResolvedValue(reserved({ releasedAt: AFTER_DEADLINE }));

    await unreleaseOrder("user-a", "order-a", AFTER_DEADLINE);

    expect(mocks.orderUpdate).toHaveBeenCalledWith({ where: { id: "order-a" }, data: { releasedAt: null } });
    expect(mocks.lineUpdateMany).toHaveBeenCalledWith({ where: { orderId: "order-a" }, data: { releasedQuantity: 0 } });
  });

  it("toch zelf ophalen kan niet meer na de afhaal", async () => {
    mocks.orderFindUnique.mockResolvedValue(reserved({ releasedAt: AFTER_DEADLINE }));
    await expect(unreleaseOrder("user-a", "order-a", AFTER_PICKUP)).rejects.toMatchObject({
      code: "TAKEOVER_CLOSED",
    });
  });
});

describe("een broodje overnemen", () => {
  const items = [
    { id: "kaas", priceCents: 260, quantity: 10, isWeeklySpecial: false },
    { id: "special", priceCents: 300, quantity: 4, isWeeklySpecial: true },
  ];

  function donorLine(overrides: Record<string, unknown> = {}) {
    return {
      id: "line-a",
      sessionItemId: "kaas",
      quantity: 2,
      releasedQuantity: 2,
      unitPriceCents: 260,
      order: { id: "order-a", userId: "user-a" },
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
    mocks.lineFindFirst.mockResolvedValue(donorLine());
    mocks.lineFindMany.mockResolvedValue([{ quantity: 1, unitPriceCents: 260, releasedQuantity: 1 }]);
    mocks.orderCreate.mockResolvedValue({ id: "order-b", totalCents: 260 });
    mocks.userFindUnique.mockResolvedValue({ name: "Anna", email: "anna@example.test", locale: "NL" });
  });

  it("schuift één stuk van de vrijgave naar een nieuwe bestelling", async () => {
    const result = await takeOverSandwich("user-b", "kaas", AFTER_DEADLINE);

    expect(result).toEqual({ orderId: "order-b", totalCents: 260 });
    expect(mocks.lineUpdate).toHaveBeenCalledWith({
      where: { id: "line-a" },
      data: { quantity: { decrement: 1 }, releasedQuantity: { decrement: 1 } },
    });
    expect(mocks.orderUpdate).toHaveBeenCalledWith({ where: { id: "order-a" }, data: { totalCents: 260 } });
    expect(mocks.orderCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-b",
          totalCents: 260,
          lines: { create: [{ sessionItemId: "kaas", quantity: 1, unitPriceCents: 260 }] },
        }),
      }),
    );
    expect(mocks.sendOrderTakenOver).toHaveBeenCalledWith(
      expect.objectContaining({ email: "anna@example.test" }),
      expect.objectContaining({ itemLabel: "Smos kaas", remaining: 1 }),
    );
  });

  it("neemt van de oudste vrijgave en nooit van jezelf", async () => {
    await takeOverSandwich("user-b", "kaas", AFTER_DEADLINE);

    const query = mocks.lineFindFirst.mock.calls[0][0];
    expect(query.orderBy[0]).toEqual({ order: { releasedAt: "asc" } });
    expect(query.where.order).toMatchObject({
      status: "RESERVED",
      releasedAt: { not: null },
      userId: { not: "user-b" },
      grocomeetId: null,
    });
  });

  it("laat de vrijgegeven bestelling verdwijnen bij het laatste stuk: geen no-show", async () => {
    mocks.lineFindFirst.mockResolvedValue(donorLine({ quantity: 1, releasedQuantity: 1 }));
    mocks.lineFindMany.mockResolvedValue([]);

    await takeOverSandwich("user-b", "kaas", AFTER_DEADLINE);

    expect(mocks.lineDelete).toHaveBeenCalledWith({ where: { id: "line-a" } });
    expect(mocks.orderDelete).toHaveBeenCalledWith({ where: { id: "order-a" } });
    expect(mocks.sendOrderTakenOver).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ remaining: 0 }),
    );
  });

  it("voegt het stuk toe aan je bestaande reservatie", async () => {
    mocks.orderFindUnique.mockResolvedValue({
      id: "order-b",
      userId: "user-b",
      status: "RESERVED",
      grocomeetId: null,
      releasedAt: null,
      voucherRedemption: null,
      lines: [{ sessionItemId: "special", quantity: 1 }],
    });
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
    mocks.orderFindUnique.mockResolvedValue({
      id: "order-b",
      userId: "user-b",
      status: "RESERVED",
      grocomeetId: null,
      releasedAt: null,
      voucherRedemption: null,
      lines: [{ sessionItemId: "kaas", quantity: 3 }],
    });

    await expect(takeOverSandwich("user-b", "kaas", AFTER_DEADLINE)).rejects.toMatchObject({
      name: "TheokotValidationError",
    });
    expect(mocks.lineUpdate).not.toHaveBeenCalled();
    expect(mocks.lineDelete).not.toHaveBeenCalled();
  });

  it("weigert wie zelf zijn bestelling vrijgaf", async () => {
    mocks.orderFindUnique.mockResolvedValue({
      id: "order-b",
      userId: "user-b",
      status: "RESERVED",
      grocomeetId: null,
      releasedAt: AFTER_DEADLINE,
      voucherRedemption: null,
      lines: [{ sessionItemId: "kaas", quantity: 1 }],
    });
    await expect(takeOverSandwich("user-b", "kaas", AFTER_DEADLINE)).rejects.toMatchObject({
      code: "TAKEOVER_UNAVAILABLE",
    });
  });

  it("weigert wanneer iemand anders het net nam", async () => {
    mocks.lineFindFirst.mockResolvedValue(null);
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
