import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * De pushberichten die vanzelf vertrekken.
 *
 * Wat hier vastligt is de claim-dan-versturen-volgorde. Die is er om één reden:
 * **iemand twee keer wakker maken voor hetzelfde broodje is erger dan het één
 * keer missen.** Een test die enkel bewijst dat er een bericht vertrekt, mist dat
 * punt; deze bewijzen dat er geen tweede vertrekt.
 */

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  sendPushToUsers: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    theokotOrder: { findMany: mocks.findMany, updateMany: mocks.updateMany },
  },
}));

vi.mock("@/lib/app-api/push", () => ({ sendPushToUsers: mocks.sendPushToUsers }));

import { sendTheokotPickupPush } from "@/lib/app-api/notifications";

const NOW = new Date("2026-09-15T10:30:00.000Z");

describe("je broodje ligt klaar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendPushToUsers.mockResolvedValue({ sent: 1, removed: 0, failed: 0 });
  });

  it("stuurt niets wanneer er geen bestellingen wachten", async () => {
    mocks.findMany.mockResolvedValue([]);

    expect(await sendTheokotPickupPush(NOW)).toEqual({ users: 0, devices: 0 });
    expect(mocks.sendPushToUsers).not.toHaveBeenCalled();
  });

  it("claimt eerst en verstuurt daarna", async () => {
    mocks.findMany.mockResolvedValue([{ id: "order-1", userId: "user-1" }]);
    mocks.updateMany.mockResolvedValue({ count: 1 });

    const run = await sendTheokotPickupPush(NOW);

    expect(mocks.updateMany).toHaveBeenCalledWith({
      // De voorwaarde `pickupPushedAt: null` is het slot: twee gelijktijdige runs
      // kunnen niet allebei winnen.
      where: { id: "order-1", pickupPushedAt: null },
      data: { pickupPushedAt: NOW },
    });
    expect(mocks.sendPushToUsers).toHaveBeenCalledWith(
      ["user-1"],
      expect.objectContaining({ path: "/bestellen" }),
    );
    expect(run).toEqual({ users: 1, devices: 1 });
  });

  it("verstuurt niets wanneer een andere run de claim al won", async () => {
    mocks.findMany.mockResolvedValue([{ id: "order-1", userId: "user-1" }]);
    mocks.updateMany.mockResolvedValue({ count: 0 });

    expect(await sendTheokotPickupPush(NOW)).toEqual({ users: 0, devices: 0 });
    expect(mocks.sendPushToUsers).not.toHaveBeenCalled();
  });

  /**
   * De bovengrens op `pickupStart` is er voor het geval de worker een tijd
   * stilgelegen heeft. Zonder haar zou de eerste run daarna alsnog berichten
   * sturen voor broodjes van gisteren.
   */
  it("kijkt enkel naar afhalingen die net begonnen en nog lopen", async () => {
    mocks.findMany.mockResolvedValue([]);
    await sendTheokotPickupPush(NOW);

    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("RESERVED");
    expect(where.pickupPushedAt).toBeNull();
    expect(where.session.pickupStart.lte).toEqual(NOW);
    expect(where.session.pickupStart.gte).toEqual(new Date(NOW.getTime() - 6 * 60 * 60 * 1000));
    expect(where.session.pickupEnd.gte).toEqual(NOW);
  });

  it("bundelt de gebruikers in één verzending", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "order-1", userId: "user-1" },
      { id: "order-2", userId: "user-2" },
    ]);
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.sendPushToUsers.mockResolvedValue({ sent: 3, removed: 0, failed: 0 });

    expect(await sendTheokotPickupPush(NOW)).toEqual({ users: 2, devices: 3 });
    expect(mocks.sendPushToUsers).toHaveBeenCalledTimes(1);
    expect(mocks.sendPushToUsers.mock.calls[0][0]).toEqual(["user-1", "user-2"]);
  });
});
