import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const settingFindUnique = vi.fn();
const kulAuthLogCreate = vi.fn();
const kulAuthLogDeleteMany = vi.fn();
const kulAuthLogFindMany = vi.fn();

vi.mock("@vtk/db", () => ({
  prisma: {
    setting: {
      findUnique: settingFindUnique,
    },
    kulAuthLog: {
      create: kulAuthLogCreate,
      deleteMany: kulAuthLogDeleteMany,
      findMany: kulAuthLogFindMany,
    },
  },
}));

const {
  KUL_DEBUG_SETTING_KEY,
  KUL_LOG_RETENTION_DAYS,
  KUL_LOG_KEEP,
  isKulDebugEnabled,
  recordKulProfile,
  getKulAuthLogs,
  pruneKulAuthLogs,
  clearKulAuthLogs,
} = await import("../../../packages/auth/src/logins/kul-debug");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-26T12:00:00.000Z"));
  settingFindUnique.mockReset();
  kulAuthLogCreate.mockReset();
  kulAuthLogDeleteMany.mockReset();
  kulAuthLogFindMany.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("KU Leuven debug log configuration", () => {
  it("defines 7-day retention period", () => {
    expect(KUL_LOG_RETENTION_DAYS).toBe(7);
    expect(KUL_LOG_KEEP).toBe(7);
    expect(KUL_DEBUG_SETTING_KEY).toBe("kul.debug");
  });

  it("checks whether debug logging is enabled via setting", async () => {
    settingFindUnique.mockResolvedValueOnce({ key: "kul.debug", value: { enabled: true } });
    await expect(isKulDebugEnabled()).resolves.toBe(true);

    settingFindUnique.mockResolvedValueOnce({ key: "kul.debug", value: { enabled: false } });
    await expect(isKulDebugEnabled()).resolves.toBe(false);

    settingFindUnique.mockResolvedValueOnce(null);
    await expect(isKulDebugEnabled()).resolves.toBe(false);

    settingFindUnique.mockRejectedValueOnce(new Error("DB offline"));
    await expect(isKulDebugEnabled()).resolves.toBe(false);
  });
});

describe("recordKulProfile", () => {
  it("does not create a log when debug logging is disabled", async () => {
    settingFindUnique.mockResolvedValueOnce({ key: "kul.debug", value: { enabled: false } });

    await recordKulProfile(
      { sub: "r1234567@kuleuven.be" },
      { email: "user@example.com", rNumber: "r1234567" },
    );

    expect(kulAuthLogCreate).not.toHaveBeenCalled();
    expect(kulAuthLogDeleteMany).not.toHaveBeenCalled();
  });

  it("creates a log and prunes entries older than 7 days when enabled", async () => {
    settingFindUnique.mockResolvedValueOnce({ key: "kul.debug", value: { enabled: true } });
    kulAuthLogCreate.mockResolvedValueOnce({ id: "log-1" });
    kulAuthLogDeleteMany.mockResolvedValueOnce({ count: 2 });

    const claims = {
      sub: "r1234567@kuleuven.be",
      eduPersonOrgUnitDN: ["KULouNumber=50000486,ou=unit,dc=kuleuven,dc=be"],
    };

    await recordKulProfile(claims, { email: "user@example.com", rNumber: "r1234567" });

    expect(kulAuthLogCreate).toHaveBeenCalledWith({
      data: {
        email: "user@example.com",
        rNumber: "r1234567",
        claims,
      },
    });

    const expectedCutoff = new Date(Date.now() - 7 * 86_400_000);
    expect(kulAuthLogDeleteMany).toHaveBeenCalledWith({
      where: {
        at: {
          lt: expectedCutoff,
        },
      },
    });
  });

  it("swallows errors without throwing to never break authentication", async () => {
    settingFindUnique.mockResolvedValueOnce({ key: "kul.debug", value: { enabled: true } });
    kulAuthLogCreate.mockRejectedValueOnce(new Error("Database error"));

    await expect(
      recordKulProfile({ sub: "test" }, { email: "test@example.com" }),
    ).resolves.toBeUndefined();
  });
});

describe("getKulAuthLogs", () => {
  it("retrieves logs from the last 7 days ordered newest first", async () => {
    const at = new Date("2026-08-25T10:00:00.000Z");
    kulAuthLogFindMany.mockResolvedValueOnce([
      {
        id: "log-1",
        at,
        email: "user@example.com",
        rNumber: "r1234567",
        claims: { sub: "r1234567@kuleuven.be" },
      },
    ]);

    const logs = await getKulAuthLogs();

    const expectedCutoff = new Date(Date.now() - 7 * 86_400_000);
    expect(kulAuthLogFindMany).toHaveBeenCalledWith({
      where: {
        at: {
          gte: expectedCutoff,
        },
      },
      orderBy: {
        at: "desc",
      },
    });

    expect(logs).toEqual([
      {
        id: "log-1",
        at,
        email: "user@example.com",
        rNumber: "r1234567",
        claims: { sub: "r1234567@kuleuven.be" },
      },
    ]);
  });
});

describe("pruneKulAuthLogs", () => {
  it("deletes entries older than the retention cutoff", async () => {
    kulAuthLogDeleteMany.mockResolvedValueOnce({ count: 5 });

    const deleted = await pruneKulAuthLogs(7);

    const expectedCutoff = new Date(Date.now() - 7 * 86_400_000);
    expect(kulAuthLogDeleteMany).toHaveBeenCalledWith({
      where: {
        at: {
          lt: expectedCutoff,
        },
      },
    });
    expect(deleted).toBe(5);
  });
});

describe("clearKulAuthLogs", () => {
  it("deletes all entries in the log table", async () => {
    kulAuthLogDeleteMany.mockResolvedValueOnce({ count: 10 });

    await clearKulAuthLogs();

    expect(kulAuthLogDeleteMany).toHaveBeenCalledWith({});
  });
});
