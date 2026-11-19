import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Een nieuw wachtwoord zet wie er al binnen zat buiten.
 *
 * Vroeger bleef elke sessie gewoon geldig (30 dagen): wie zijn wachtwoord
 * herstelde omdat iemand anders het kende, liet die ander binnen.
 */

const { tx, findToken, deleteSessions, deleteAccess, deleteRefresh } = vi.hoisted(() => ({
  tx: vi.fn(async (queries: unknown[]) => queries),
  findToken: vi.fn(),
  deleteSessions: vi.fn((args: unknown) => ({ op: "session.deleteMany", args })),
  deleteAccess: vi.fn((args: unknown) => ({ op: "oauthAccessToken.deleteMany", args })),
  deleteRefresh: vi.fn((args: unknown) => ({ op: "oauthRefreshToken.deleteMany", args })),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    $transaction: tx,
    accountEmailToken: { findUnique: findToken, update: vi.fn(() => ({ op: "token.update" })) },
    account: { upsert: vi.fn(() => ({ op: "account.upsert" })) },
    user: { update: vi.fn(() => ({ op: "user.update" })) },
    session: { deleteMany: deleteSessions },
    oauthAccessToken: { deleteMany: deleteAccess },
    oauthRefreshToken: { deleteMany: deleteRefresh },
  },
}));
vi.mock("../../../packages/auth/src/logins/password", () => ({
  hashPassword: vi.fn(async () => "hash"),
  verifyPassword: vi.fn(async () => true),
}));

const { resetPasswordWithToken, setOwnPassword } = await import(
  "../../../packages/auth/src/server/selfSignup"
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resetPasswordWithToken", () => {
  it("ends every session and every SSO token of the member", async () => {
    findToken.mockResolvedValue({
      id: "tok",
      userId: "u1",
      kind: "PASSWORD_RESET",
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      user: { email: "lid@example.com", name: "Lid", locale: "NL" },
    });

    await expect(resetPasswordWithToken("token", "een-lang-wachtwoord")).resolves.toBe(true);

    expect(deleteSessions).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(deleteAccess).toHaveBeenCalledWith({ where: { userId: "u1" } });
    expect(deleteRefresh).toHaveBeenCalledWith({ where: { userId: "u1" } });
    // In dezelfde transactie als het nieuwe wachtwoord.
    const ops = (tx.mock.calls[0][0] as { op: string }[]).map((query) => query.op);
    expect(ops).toEqual(
      expect.arrayContaining(["account.upsert", "session.deleteMany", "oauthRefreshToken.deleteMany"]),
    );
  });

  it("ends nothing when the link is no good", async () => {
    findToken.mockResolvedValue(null);
    await expect(resetPasswordWithToken("token", "een-lang-wachtwoord")).resolves.toBe(false);
    expect(deleteSessions).not.toHaveBeenCalled();
  });
});

describe("setOwnPassword", () => {
  it("keeps the session that changes the password and ends the others", async () => {
    await setOwnPassword("u1", "een-lang-wachtwoord", "huidige-sessie");
    expect(deleteSessions).toHaveBeenCalledWith({
      where: { userId: "u1", token: { not: "huidige-sessie" } },
    });
    expect(deleteRefresh).not.toHaveBeenCalled();
  });
});
