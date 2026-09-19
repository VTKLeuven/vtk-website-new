import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@vtk/auth";
import { PERMISSIONS } from "@vtk/db/permissions";

const mocks = vi.hoisted(() => ({
  session: null as SessionPayload | null,
  logAudit: vi.fn(),
  userFindUnique: vi.fn(),
  manualShiftGrantCreate: vi.fn(),
  manualShiftGrantFindUnique: vi.fn(),
  manualShiftGrantDelete: vi.fn(),
  manualShiftGrantFindMany: vi.fn(),
  shiftCreate: vi.fn(),
  shiftDelete: vi.fn(),
  transaction: vi.fn(async <T>(cb: (tx: typeof mocks.tx) => Promise<T>) => cb(mocks.tx)),
  tx: {
    manualShiftGrant: {
      create: vi.fn(),
    },
    shift: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/session", () => ({
  requireSession: vi.fn(async () => {
    if (!mocks.session) throw new Error("UNAUTHENTICATED");
    return mocks.session;
  }),
  requirePermission: vi.fn(async (perm: string) => {
    if (!mocks.session) throw new Error("UNAUTHENTICATED");
    if (!mocks.session.user.isSuperAdmin && !mocks.session.permissions.includes(perm)) {
      throw new Error("FORBIDDEN");
    }
    return mocks.session;
  }),
  authErrorResponse: vi.fn((err: unknown) => {
    const message = err instanceof Error ? err.message : "UNAUTHENTICATED";
    const status = message === "FORBIDDEN" ? 403 : 401;
    return new Response(JSON.stringify({ error: message }), { status });
  }),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    manualShiftGrant: {
      create: mocks.manualShiftGrantCreate,
      findUnique: mocks.manualShiftGrantFindUnique,
      delete: mocks.manualShiftGrantDelete,
      findMany: mocks.manualShiftGrantFindMany,
    },
    shift: {
      create: mocks.shiftCreate,
      delete: mocks.shiftDelete,
    },
    $transaction: <T>(cb: (tx: typeof mocks.tx) => Promise<T>) => mocks.transaction(cb),
  },
}));

vi.mock("@/lib/audit", () => ({
  logAudit: mocks.logAudit,
}));

import {
  computeManualShiftDates,
  grantManualShifts,
  deleteManualShiftGrant,
  ManualShiftValidationError,
} from "@/lib/shift/manual";
import { GET, POST, DELETE } from "@/app/api/shift/manual/route";

function makeSession(overrides: Partial<SessionPayload> = {}): SessionPayload {
  return {
    token: "tok",
    expiresAt: new Date(0).toISOString(),
    user: {
      id: "admin_1",
      email: "admin@example.test",
      name: "Admin User",
      avatarKey: null,
      locale: "NL",
      isSuperAdmin: false,
      onboarded: true,
      studyConfirmedYear: null,
      isStudent: true,
      googleLinked: true,
      googleLinkDeferredAt: null,
    },
    roleIds: [],
    groups: [],
    permissions: ["shift.manual"],
    ...overrides,
  };
}

describe("shift.manual permissie", () => {
  it("is opgenomen in de canonieke permissielijst onder categorie 'shift'", () => {
    const perm = PERMISSIONS.find((p) => p.code === "shift.manual");
    expect(perm).toBeDefined();
    expect(perm?.category).toBe("shift");
    expect(perm?.labelNl).toContain("Manueel extra shiften");
  });
});

describe("computeManualShiftDates", () => {
  it("geeft start en eindtijd in het verleden terug voor een vorig academiejaar", () => {
    const now = new Date();
    const { startTime, endTime } = computeManualShiftDates(2023);
    expect(endTime.getTime()).toBeLessThan(now.getTime());
    expect(startTime.getTime()).toBeLessThan(endTime.getTime());
  });

  it("geeft start en eindtijd in het verleden terug voor het huidige academiejaar", () => {
    const now = new Date();
    const { startTime, endTime } = computeManualShiftDates(2026);
    expect(endTime.getTime()).toBeLessThan(now.getTime());
    expect(startTime.getTime()).toBeLessThan(endTime.getTime());
  });
});

describe("grantManualShifts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindUnique.mockResolvedValue({ id: "user_123", name: "Jef Vermassen" });
    mocks.tx.manualShiftGrant.create.mockResolvedValue({
      id: "grant_1",
      userId: "user_123",
      count: 3,
      post: "BAR",
      reason: "Overdracht vorige website",
      academicYear: 2025,
      reward: 0,
      payedOut: true,
    });
    mocks.tx.shift.create.mockResolvedValue({ id: "shift_x" });
  });

  it("valideert invoer: gooit fout bij ongeldig aantal", async () => {
    await expect(
      grantManualShifts({ userId: "user_123", count: 0 }),
    ).rejects.toThrow(ManualShiftValidationError);

    await expect(
      grantManualShifts({ userId: "user_123", count: 101 }),
    ).rejects.toThrow(ManualShiftValidationError);
  });

  it("valideert invoer: gooit fout als gebruiker niet bestaat", async () => {
    mocks.userFindUnique.mockResolvedValue(null);
    await expect(
      grantManualShifts({ userId: "onbekend", count: 1 }),
    ).rejects.toThrow(ManualShiftValidationError);
  });

  it("maakt ManualShiftGrant aan en genereert per shift een Shift met ShiftParticipant", async () => {
    const grant = await grantManualShifts({
      userId: "user_123",
      count: 3,
      post: "BAR",
      academicYear: 2025,
      reason: "Overdracht vorige website",
      reward: 1,
      payedOut: true,
      actorId: "admin_1",
    });

    expect(grant.id).toBe("grant_1");
    expect(mocks.tx.manualShiftGrant.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_123",
        count: 3,
        post: "BAR",
        reason: "Overdracht vorige website",
        academicYear: 2025,
        reward: 1,
        payedOut: true,
        createdById: "admin_1",
      }),
    });

    // 3 shiften aangemaakt
    expect(mocks.tx.shift.create).toHaveBeenCalledTimes(3);
    expect(mocks.tx.shift.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: "Overdracht vorige website",
        location: "Vorige website",
        sourceSystem: "manual",
        sourceId: "grant_1-1",
        manualGrantId: "grant_1",
        reward: 1,
        post: "BAR",
        participants: {
          create: expect.objectContaining({
            userId: "user_123",
            payedOut: true,
            rewardPaid: 1,
          }),
        },
      }),
    });

    // Audit log gecheckt
    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: "create",
      entity: "shiftManual",
      entityId: "grant_1",
      target: "Jef Vermassen",
      summary: expect.stringContaining("3 extra shift(en) toegekend"),
    });
  });
});

describe("deleteManualShiftGrant", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verwijdert ManualShiftGrant en logt in de auditlog", async () => {
    mocks.manualShiftGrantFindUnique.mockResolvedValue({
      id: "grant_1",
      count: 5,
      post: "THEOKOT",
      reason: "Migratie",
      academicYear: 2024,
      user: { id: "user_123", name: "Jef Vermassen" },
    });

    const res = await deleteManualShiftGrant("grant_1");
    expect(res).toBeDefined();
    expect(mocks.manualShiftGrantDelete).toHaveBeenCalledWith({ where: { id: "grant_1" } });

    expect(mocks.logAudit).toHaveBeenCalledWith({
      action: "delete",
      entity: "shiftManual",
      entityId: "grant_1",
      target: "Jef Vermassen",
      summary: expect.stringContaining("5 extra shift(en) ingetrokken"),
    });
  });

  it("geeft null terug als toekenning niet bestaat", async () => {
    mocks.manualShiftGrantFindUnique.mockResolvedValue(null);
    const res = await deleteManualShiftGrant("onbestaand");
    expect(res).toBeNull();
    expect(mocks.manualShiftGrantDelete).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

describe("API /api/shift/manual autorisatie", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("weigert niet-ingelogde gebruikers (401)", async () => {
    mocks.session = null;
    const resp = await GET(new Request("http://localhost/api/shift/manual"));
    expect(resp.status).toBe(401);
  });

  it("weigert gebruikers zonder shift.manual recht (403)", async () => {
    mocks.session = makeSession({ permissions: ["shift.edit", "shift.ranking"] }); // geen shift.manual
    const resp = await GET(new Request("http://localhost/api/shift/manual"));
    expect(resp.status).toBe(403);
  });

  it("laat gebruikers met shift.manual recht toe (200)", async () => {
    mocks.session = makeSession({ permissions: ["shift.manual"] });
    mocks.manualShiftGrantFindMany.mockResolvedValue([]);
    const resp = await GET(new Request("http://localhost/api/shift/manual"));
    expect(resp.status).toBe(200);
  });

  it("POST weigert gebruikers zonder shift.manual (403)", async () => {
    mocks.session = makeSession({ permissions: ["shift.edit"] });
    const resp = await POST(
      new Request("http://localhost/api/shift/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "u1", count: 2 }),
      }),
    );
    expect(resp.status).toBe(403);
  });

  it("DELETE weigert gebruikers zonder shift.manual (403)", async () => {
    mocks.session = makeSession({ permissions: ["shift.edit"] });
    const resp = await DELETE(new Request("http://localhost/api/shift/manual?id=g1"));
    expect(resp.status).toBe(403);
  });
});
