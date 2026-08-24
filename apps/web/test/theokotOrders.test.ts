import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * De schrijfkant van het Theokot, sinds fase 1 van de VTK-app gedeeld door de
 * website en de app (`lib/theokot-orders.ts`).
 *
 * Deze tests staan er precies omdát er nu twee bellers zijn. Wat hier vastligt
 * zijn de weigeringen: geschorst, venster dicht, al besteld, deadline voorbij.
 * Loopt een van die twee wegen daarin uit de pas, dan is de app soepeler dan de
 * site, en dat is het enige wat deze splitsing echt kan breken.
 */

const mocks = vi.hoisted(() => ({
  findUniqueSession: vi.fn(),
  findUniqueOrder: vi.fn(),
  findUniqueOrderTx: vi.fn(),
  createOrder: vi.fn(),
  deleteOrder: vi.fn(),
  activeBanFor: vi.fn(),
  getTheokotConfig: vi.fn(),
  usageForSessionItemsTx: vi.fn(),
  usageForSessionItems: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    theokotOrder: { findUnique: mocks.findUniqueOrder, delete: mocks.deleteOrder },
    theokotSession: { findMany: vi.fn() },
    setting: { findUnique: vi.fn() },
  },
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

vi.mock("@/lib/theokot-server", () => ({
  activeBanFor: mocks.activeBanFor,
  getTheokotConfig: mocks.getTheokotConfig,
}));

vi.mock("@/lib/meetings-server", () => ({
  usageForSessionItems: mocks.usageForSessionItems,
  usageForSessionItemsTx: mocks.usageForSessionItemsTx,
}));

// De transactie voert haar callback gewoon uit; wat we hier testen zijn de
// beslissingen erbinnen, niet het isolatieniveau van Postgres.
vi.mock("@/lib/ticketing/transactions", () => ({
  withSerializableTransaction: (fn: (tx: unknown) => unknown) =>
    fn({
      theokotSession: { findUnique: mocks.findUniqueSession },
      theokotOrder: { findUnique: mocks.findUniqueOrderTx, create: mocks.createOrder },
    }),
}));

import { cancelOrder, placeOrder, TheokotOrderError } from "@/lib/theokot-orders";
import { TheokotValidationError } from "@/lib/theokot";

const NOW = new Date("2026-09-15T09:00:00.000Z");

const CONFIG = {
  maxItemsPerOrder: 5,
  maxWeeklySpecialPerOrder: 1,
  orderLeadDays: 2,
  orderOpenTime: "12:00",
  cancelDeadline: "10:30",
  pickupDefaultStart: "12:00",
  pickupDefaultEnd: "16:00",
  noShowGraceMinutes: 15,
  noShowThreshold: 3,
  banDurationDays: 14,
  itemLayout: "list" as const,
};

function openSession() {
  return {
    id: "sess-1",
    isOpen: true,
    orderOpenAt: new Date("2026-09-13T10:00:00.000Z"),
    orderCloseAt: new Date("2026-09-15T08:30:00.000Z"),
    items: [
      { id: "item-1", priceCents: 260, quantity: 10, isWeeklySpecial: false },
      { id: "item-2", priceCents: 300, quantity: 4, isWeeklySpecial: true },
    ],
  };
}

describe("bestellen bij het Theokot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTheokotConfig.mockResolvedValue(CONFIG);
    mocks.activeBanFor.mockResolvedValue(null);
    mocks.usageForSessionItemsTx.mockResolvedValue(new Map());
    mocks.findUniqueOrderTx.mockResolvedValue(null);
    mocks.createOrder.mockResolvedValue({ id: "order-1", totalCents: 260 });
    // Het venster staat open: nu ligt tussen open en sluit.
    mocks.findUniqueSession.mockResolvedValue({
      ...openSession(),
      orderCloseAt: new Date("2026-09-15T10:00:00.000Z"),
    });
  });

  it("plaatst een bestelling binnen het venster", async () => {
    const result = await placeOrder("user-1", "sess-1", [{ sessionItemId: "item-1", quantity: 1 }], NOW);

    expect(result).toEqual({ orderId: "order-1", totalCents: 260 });
    expect(mocks.createOrder).toHaveBeenCalledTimes(1);
  });

  it("weigert wie geschorst is, en zegt tot wanneer", async () => {
    const endsAt = new Date("2026-09-30T00:00:00.000Z");
    mocks.activeBanFor.mockResolvedValue({ endsAt });

    const error = await placeOrder("user-1", "sess-1", [{ sessionItemId: "item-1", quantity: 1 }], NOW)
      .then(() => null)
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(TheokotOrderError);
    expect(error.code).toBe("BANNED");
    expect(error.bannedUntil).toBe(endsAt);
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it("weigert wanneer de deadline voorbij is", async () => {
    mocks.findUniqueSession.mockResolvedValue(openSession());

    await expect(
      placeOrder("user-1", "sess-1", [{ sessionItemId: "item-1", quantity: 1 }], NOW),
    ).rejects.toMatchObject({ code: "ORDER_CLOSED" });
  });

  it("laat geen tweede bestelling voor dezelfde dag toe", async () => {
    mocks.findUniqueOrderTx.mockResolvedValue({ id: "order-0" });

    await expect(
      placeOrder("user-1", "sess-1", [{ sessionItemId: "item-1", quantity: 1 }], NOW),
    ).rejects.toMatchObject({ code: "ALREADY_ORDERED" });
  });

  /**
   * De reden dat de voorraadcheck binnen de transactie zit: wat er nog is, is
   * de sessievoorraad min wat er al weg is, inclusief de broodjes die voor een
   * grocomeet opzijgezet zijn.
   */
  it("rekent de reeds gereserveerde stukken van de voorraad af", async () => {
    mocks.usageForSessionItemsTx.mockResolvedValue(new Map([["item-1", 10]]));

    const error = await placeOrder("user-1", "sess-1", [{ sessionItemId: "item-1", quantity: 1 }], NOW)
      .then(() => null)
      .catch((caught) => caught);

    expect(error).toBeInstanceOf(TheokotValidationError);
    expect(mocks.createOrder).not.toHaveBeenCalled();
  });

  it("houdt zich aan de limiet op broodjes van de week", async () => {
    await expect(
      placeOrder("user-1", "sess-1", [{ sessionItemId: "item-2", quantity: 2 }], NOW),
    ).rejects.toBeInstanceOf(TheokotValidationError);
  });
});

describe("annuleren bij het Theokot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.deleteOrder.mockResolvedValue({});
  });

  it("annuleert een eigen reservatie voor de deadline", async () => {
    mocks.findUniqueOrder.mockResolvedValue({
      id: "order-1",
      userId: "user-1",
      status: "RESERVED",
      session: { orderCloseAt: new Date("2026-09-15T10:00:00.000Z") },
    });

    await cancelOrder("user-1", "order-1", NOW);
    expect(mocks.deleteOrder).toHaveBeenCalledWith({ where: { id: "order-1" } });
  });

  /**
   * Andermans bestelling geeft dezelfde fout als een onbestaande. Zonder dat is
   * deze route een manier om te achterhalen welke order-id's bestaan.
   */
  it("behandelt andermans bestelling als onbestaand", async () => {
    mocks.findUniqueOrder.mockResolvedValue({
      id: "order-1",
      userId: "iemand-anders",
      status: "RESERVED",
      session: { orderCloseAt: new Date("2026-09-15T10:00:00.000Z") },
    });

    await expect(cancelOrder("user-1", "order-1", NOW)).rejects.toMatchObject({
      code: "ORDER_NOT_FOUND",
    });

    mocks.findUniqueOrder.mockResolvedValue(null);
    await expect(cancelOrder("user-1", "order-1", NOW)).rejects.toMatchObject({
      code: "ORDER_NOT_FOUND",
    });

    expect(mocks.deleteOrder).not.toHaveBeenCalled();
  });

  it("weigert na de deadline", async () => {
    mocks.findUniqueOrder.mockResolvedValue({
      id: "order-1",
      userId: "user-1",
      status: "RESERVED",
      session: { orderCloseAt: new Date("2026-09-15T08:30:00.000Z") },
    });

    await expect(cancelOrder("user-1", "order-1", NOW)).rejects.toMatchObject({
      code: "CANCEL_DEADLINE_PASSED",
    });
  });

  it("weigert een bestelling die al opgehaald is", async () => {
    mocks.findUniqueOrder.mockResolvedValue({
      id: "order-1",
      userId: "user-1",
      status: "PICKED_UP",
      session: { orderCloseAt: new Date("2026-09-15T10:00:00.000Z") },
    });

    await expect(cancelOrder("user-1", "order-1", NOW)).rejects.toMatchObject({
      code: "NOT_CANCELABLE",
    });
  });
});
