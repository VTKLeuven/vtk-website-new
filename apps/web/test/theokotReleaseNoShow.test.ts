import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Vrijgegeven broodjes die bij het sluiten van de afhaal nog niemand overnam
 * (`settleLeftoverReleases` in `lib/theokot-server.ts`): die tellen als no-show
 * voor wie ze vrijgaf, ook wanneer die zijn eigen deel wel kwam ophalen.
 */

vi.mock("@vtk/db", () => ({ prisma: {} }));
vi.mock("@/lib/mail", () => ({ sendNoShowWarning: vi.fn(), sendOrderCancelled: vi.fn() }));
vi.mock("@/lib/ticketing/transactions", () => ({ withSerializableTransaction: vi.fn() }));

import { NO_SHOW_WHERE, settleLeftoverReleases } from "@/lib/theokot-server";

const NOW = new Date("2026-09-15T12:20:00.000Z");

const tx = {
  theokotOrderRelease: { findMany: vi.fn(), delete: vi.fn() },
  theokotOrderLine: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
  theokotOrder: { update: vi.fn(), updateMany: vi.fn() },
};

function release(status: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "rel-1",
    orderId: "order-a",
    sessionItemId: "kaas",
    quantity: 2,
    unitPriceCents: 260,
    order: { id: "order-a", status },
    ...overrides,
  };
}

describe("vrijgegeven broodjes bij het sluiten van de afhaal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    tx.theokotOrderLine.findFirst.mockResolvedValue(null);
    tx.theokotOrderLine.findMany.mockResolvedValue([{ quantity: 2, unitPriceCents: 260 }]);
    tx.theokotOrderLine.groupBy.mockResolvedValue([]);
  });

  it("zet ze terug op de lijnen van wie alles vrijgaf, met de markering voor de juiste mail", async () => {
    tx.theokotOrderRelease.findMany.mockResolvedValue([release("RESERVED")]);

    await settleLeftoverReleases(tx as never, "sess-1", NOW);

    expect(tx.theokotOrderLine.create).toHaveBeenCalledWith({
      data: { orderId: "order-a", sessionItemId: "kaas", quantity: 2, unitPriceCents: 260 },
    });
    expect(tx.theokotOrderRelease.delete).toHaveBeenCalledWith({ where: { id: "rel-1" } });
    expect(tx.theokotOrder.update).toHaveBeenCalledWith({
      where: { id: "order-a" },
      data: { totalCents: 520, releaseNoShowAt: NOW },
    });
    expect(tx.theokotOrder.updateMany).not.toHaveBeenCalled();
  });

  it("is een gewone no-show voor wie ook zijn eigen broodjes liet liggen", async () => {
    tx.theokotOrderRelease.findMany.mockResolvedValue([release("RESERVED")]);
    tx.theokotOrderLine.groupBy.mockResolvedValue([{ orderId: "order-a", _count: { _all: 1 } }]);

    await settleLeftoverReleases(tx as never, "sess-1", NOW);

    expect(tx.theokotOrder.update).toHaveBeenCalledWith({ where: { id: "order-a" }, data: { totalCents: 520 } });
  });

  it("telt bij wie zijn eigen deel ophaalde, met de rijen als verslag", async () => {
    tx.theokotOrderRelease.findMany.mockResolvedValue([release("PICKED_UP")]);

    await settleLeftoverReleases(tx as never, "sess-1", NOW);

    expect(tx.theokotOrder.updateMany).toHaveBeenCalledWith({
      where: { id: "order-a", releaseNoShowAt: null },
      data: { releaseNoShowAt: NOW },
    });
    // Wat hij betaalde, blijft opgehaald: niets op zijn lijnen erbij.
    expect(tx.theokotOrderLine.create).not.toHaveBeenCalled();
    expect(tx.theokotOrderLine.update).not.toHaveBeenCalled();
    expect(tx.theokotOrderRelease.delete).not.toHaveBeenCalled();
  });

  it("telt een opgehaalde bestelling met overschot mee als no-show", () => {
    expect(NO_SHOW_WHERE).toEqual({ OR: [{ status: "NO_SHOW" }, { releaseNoShowAt: { not: null } }] });
  });
});
