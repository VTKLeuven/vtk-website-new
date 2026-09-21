import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  theokotSessionFindUnique: vi.fn(),
  theokotSessionDelete: vi.fn(),
  theokotSessionUpdate: vi.fn(),
  theokotOrderFindUnique: vi.fn(),
  theokotOrderDelete: vi.fn(),
  theokotOrderUpdate: vi.fn(),
  theokotOrderUpdateMany: vi.fn(),
  theokotBanFindUnique: vi.fn(),
  theokotBanUpdate: vi.fn(),
  theokotBanUpdateMany: vi.fn(),
  theokotBanFindFirst: vi.fn(),
  theokotBanCreate: vi.fn(),
  userFindUnique: vi.fn(),
  sendMail: vi.fn(),
  logAudit: vi.fn(),
  requirePermission: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    theokotSession: {
      findUnique: mocks.theokotSessionFindUnique,
      delete: mocks.theokotSessionDelete,
      update: mocks.theokotSessionUpdate,
    },
    theokotOrder: {
      findUnique: mocks.theokotOrderFindUnique,
      delete: mocks.theokotOrderDelete,
      update: mocks.theokotOrderUpdate,
      updateMany: mocks.theokotOrderUpdateMany,
    },
    theokotBan: {
      findUnique: mocks.theokotBanFindUnique,
      update: mocks.theokotBanUpdate,
      updateMany: mocks.theokotBanUpdateMany,
      findFirst: mocks.theokotBanFindFirst,
      create: mocks.theokotBanCreate,
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAudit,
}));

vi.mock("@/lib/session", () => ({
  requirePermission: mocks.requirePermission,
}));

vi.mock("@/lib/email", () => ({
  sendMail: mocks.sendMail,
}));

import {
  checkSessionWindows,
  parseTheokotConfig,
  type SessionWindows,
} from "@/lib/theokot";
import {
  removeOrder,
  removeSession,
} from "@/lib/theokot-server";

describe("checkSessionWindows", () => {
  const baseDay = new Date("2026-10-01T00:00:00.000Z");

  it("keurt geldige vensters goed", () => {
    const windows: SessionWindows = {
      orderOpenAt: new Date("2026-09-29T10:00:00.000Z"),
      orderCloseAt: new Date("2026-10-01T08:30:00.000Z"),
      pickupStart: new Date("2026-10-01T10:00:00.000Z"),
      pickupEnd: new Date("2026-10-01T14:00:00.000Z"),
    };
    expect(checkSessionWindows(windows)).toBeNull();
  });

  it("weigert wanneer besteldeadline voor het openen valt", () => {
    const windows: SessionWindows = {
      orderOpenAt: new Date("2026-10-01T12:00:00.000Z"),
      orderCloseAt: new Date("2026-10-01T10:30:00.000Z"),
      pickupStart: new Date("2026-10-01T10:00:00.000Z"),
      pickupEnd: new Date("2026-10-01T14:00:00.000Z"),
    };
    expect(checkSessionWindows(windows)).toBe("ORDER_WINDOW_EMPTY");
  });

  it("weigert wanneer afhaalvenster eindigt voor het begint", () => {
    const windows: SessionWindows = {
      orderOpenAt: new Date("2026-09-29T10:00:00.000Z"),
      orderCloseAt: new Date("2026-10-01T08:30:00.000Z"),
      pickupStart: new Date("2026-10-01T14:00:00.000Z"),
      pickupEnd: new Date("2026-10-01T10:00:00.000Z"),
    };
    expect(checkSessionWindows(windows)).toBe("PICKUP_WINDOW_EMPTY");
  });
});

describe("parseTheokotConfig", () => {
  it("weert kommagetallen en ongeldige invoer af naar de defaults", () => {
    const config = parseTheokotConfig({
      maxItemsPerOrder: 2.5,
      maxWeeklySpecialPerOrder: "geen",
      orderOpenTime: "25:99",
    });
    expect(config.maxItemsPerOrder).toBe(5); // default
    expect(config.maxWeeklySpecialPerOrder).toBe(1); // default
    expect(config.orderOpenTime).toBe("12:00"); // default
  });

  it("aanvaardt geldige configuratie", () => {
    const config = parseTheokotConfig({
      maxItemsPerOrder: 4,
      maxWeeklySpecialPerOrder: 2,
      orderOpenTime: "11:00",
    });
    expect(config.maxItemsPerOrder).toBe(4);
    expect(config.maxWeeklySpecialPerOrder).toBe(2);
    expect(config.orderOpenTime).toBe("11:00");
  });
});

describe("removeSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("weigert het verwijderen van een sessie met opgehaalde bestellingen", async () => {
    mocks.theokotSessionFindUnique.mockResolvedValue({
      id: "sess-1",
      date: new Date("2026-09-21T00:00:00.000Z"),
      orders: [
        {
          id: "ord-1",
          status: "PICKED_UP",
          pickedUpAt: new Date(),
          voucherRedemption: null,
          user: { name: "Jan", email: "jan@vtk.be", locale: "NL" },
          lines: [],
        },
      ],
    });

    const res = await removeSession("sess-1");
    expect(res).toEqual({ ok: false, code: "SESSION_HAS_PICKUPS" });
    expect(mocks.theokotSessionDelete).not.toHaveBeenCalled();
  });

  it("weigert het verwijderen van een sessie met afgeboekte bonnetjes", async () => {
    mocks.theokotSessionFindUnique.mockResolvedValue({
      id: "sess-1",
      date: new Date("2026-09-21T00:00:00.000Z"),
      orders: [
        {
          id: "ord-1",
          status: "RESERVED",
          pickedUpAt: null,
          voucherRedemption: { id: "v-1" },
          user: { name: "Jan", email: "jan@vtk.be", locale: "NL" },
          lines: [],
        },
      ],
    });

    const res = await removeSession("sess-1");
    expect(res).toEqual({ ok: false, code: "SESSION_HAS_PICKUPS" });
    expect(mocks.theokotSessionDelete).not.toHaveBeenCalled();
  });

  it("verwijdert een sessie zonder afhalingen en verwittigt studenten", async () => {
    mocks.theokotSessionFindUnique.mockResolvedValue({
      id: "sess-2",
      date: new Date("2026-09-22T00:00:00.000Z"),
      orders: [
        {
          id: "ord-2",
          status: "RESERVED",
          pickedUpAt: null,
          voucherRedemption: null,
          user: { name: "Piet", email: "piet@vtk.be", locale: "NL" },
          lines: [
            { quantity: 2, sessionItem: { nameNl: "Broodje kaas", nameEn: "Cheese sandwich" } },
          ],
        },
      ],
    });
    mocks.theokotSessionDelete.mockResolvedValue({});
    mocks.sendMail.mockResolvedValue({ ok: true });

    const res = await removeSession("sess-2");
    expect(res).toEqual({ ok: true, orders: 1 });
    expect(mocks.theokotSessionDelete).toHaveBeenCalledWith({ where: { id: "sess-2" } });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "piet@vtk.be",
        subject: expect.stringContaining("geannuleerd"),
      }),
      expect.any(Object),
    );
  });
});

describe("removeOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("weigert het schrappen van een reeds opgehaalde bestelling", async () => {
    mocks.theokotOrderFindUnique.mockResolvedValue({
      id: "ord-1",
      status: "PICKED_UP",
      pickedUpAt: new Date(),
      voucherRedemption: null,
    });

    const res = await removeOrder("ord-1");
    expect(res).toEqual({ ok: false, code: "ORDER_NOT_REMOVABLE" });
    expect(mocks.theokotOrderDelete).not.toHaveBeenCalled();
  });

  it("schrapt een openstaande bestelling en verwittigt de student", async () => {
    mocks.theokotOrderFindUnique.mockResolvedValue({
      id: "ord-2",
      status: "RESERVED",
      pickedUpAt: null,
      voucherRedemption: null,
      user: { name: "Klaas", email: "klaas@vtk.be", locale: "NL" },
      session: { date: new Date("2026-09-23T00:00:00.000Z") },
      lines: [
        { quantity: 1, sessionItem: { nameNl: "Broodje smos", nameEn: "Club sandwich" } },
      ],
    });
    mocks.theokotOrderDelete.mockResolvedValue({});
    mocks.sendMail.mockResolvedValue({ ok: true });

    const res = await removeOrder("ord-2");
    expect(res).toEqual(
      expect.objectContaining({
        ok: true,
        userName: "Klaas",
      }),
    );
    expect(mocks.theokotOrderDelete).toHaveBeenCalledWith({ where: { id: "ord-2" } });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
  });
});

import { correctOrderStatusAction, liftBanAction } from "@/app/actions/theokot";

describe("liftBanAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ user: { id: "admin-1", name: "Admin" } });
  });

  it("kort endsAt in tot nu bij een lopende ban", async () => {
    const futureEndsAt = new Date(Date.now() + 10 * 86400000);
    mocks.theokotBanFindUnique.mockResolvedValue({
      id: "ban-1",
      endsAt: futureEndsAt,
    });
    mocks.theokotBanUpdate.mockResolvedValue({
      id: "ban-1",
      active: false,
      user: { name: "Lies" },
    });

    const formData = new FormData();
    formData.append("banId", "ban-1");

    const result = await liftBanAction({ status: "idle" }, formData);
    expect(result.status).toBe("success");
    expect(mocks.theokotBanUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ban-1" },
        data: expect.objectContaining({
          active: false,
          endsAt: expect.any(Date),
        }),
      }),
    );

    const callArg = mocks.theokotBanUpdate.mock.calls[0][0];
    expect(callArg.data.endsAt.getTime()).toBeLessThan(futureEndsAt.getTime());
  });
});

describe("correctOrderStatusAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requirePermission.mockResolvedValue({ user: { id: "admin-1", name: "Admin" } });
  });

  it("weigert de status CANCELLED", async () => {
    const formData = new FormData();
    formData.append("orderId", "ord-1");
    formData.append("status", "CANCELLED");

    const result = await correctOrderStatusAction({ status: "idle" }, formData);
    expect(result.status).toBe("error");
    if (result.status === "error") {
      expect(result.code).toBe("INVALID_STATUS");
    }
  });

  it("aanvaardt geldige correctiestatussen en heft ban op indien aangevinkt", async () => {
    mocks.theokotOrderUpdate.mockResolvedValue({
      id: "ord-1",
      userId: "user-1",
      user: { name: "Joris" },
      session: { date: new Date("2026-09-21T00:00:00.000Z") },
    });
    mocks.userFindUnique.mockResolvedValue({ name: "Joris" });
    mocks.theokotBanUpdateMany.mockResolvedValue({ count: 1 });

    const formData = new FormData();
    formData.append("orderId", "ord-1");
    formData.append("status", "PICKED_UP");
    formData.append("liftBan", "on");

    const result = await correctOrderStatusAction({ status: "idle" }, formData);
    expect(result.status).toBe("success");
    expect(mocks.theokotOrderUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ord-1" },
        data: expect.objectContaining({ status: "PICKED_UP" }),
      }),
    );
    expect(mocks.theokotBanUpdateMany).toHaveBeenCalled();
  });
});

