import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KUL_OIDC_AUTHORIZATION_URL,
  KUL_OIDC_ISSUER,
  KUL_OIDC_TOKEN_URL,
  kulOAuthConfig,
} from "../../../packages/auth/src/logins/kul";
import {
  getKulUserInfo,
  KUL_USERINFO_URL,
  wasKulUserInfoFetched,
} from "../../../packages/auth/src/logins/kul-userinfo";
import {
  FIRW_ORG_UNIT_NUMBER,
  firwStudentFromProfile,
  syncFirwStudent,
} from "../../../packages/auth/src/logins/kul-firw";
import {
  resolveKulLink,
  type KulLinkLookups,
} from "../../../packages/auth/src/logins/kul-link";

function idToken(claims: Record<string, unknown>): string {
  const encode = (value: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none" })}.${encode(claims)}.signature`;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getKulUserInfo", () => {
  it("always fetches userinfo and merges its KU Leuven attributes", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          sub: "r0939342@kuleuven.be",
          email: "witse.panneels@student.kuleuven.be",
          eduPersonOrgUnitDN: [
            "KULouNumber=50000486,ou=unit,dc=kuleuven,dc=be",
          ],
          KULdipl: ["50310705"],
          KULopl: ["2026 50074273"],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const profile = await getKulUserInfo(
      {
        accessToken: "access-token",
        idToken: idToken({
          sub: "r0939342@kuleuven.be",
          email: "witse.panneels@student.kuleuven.be",
          email_verified: true,
          name: "Witse Panneels",
          acr: "https://refeds.org/profile/mfa",
        }),
      },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledWith(
      KUL_USERINFO_URL,
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        redirect: "error",
        headers: expect.objectContaining({
          Accept: "application/json",
          Authorization: "Bearer access-token",
        }),
      }),
    );
    expect(profile).toMatchObject({
      id: "r0939342@kuleuven.be",
      sub: "r0939342@kuleuven.be",
      name: "Witse Panneels",
      email: "witse.panneels@student.kuleuven.be",
      emailVerified: true,
      acr: "https://refeds.org/profile/mfa",
      eduPersonOrgUnitDN: [
        "KULouNumber=50000486,ou=unit,dc=kuleuven,dc=be",
      ],
      KULdipl: ["50310705"],
      KULopl: ["2026 50074273"],
    });
    expect(wasKulUserInfoFetched(profile!)).toBe(true);
  });

  it("keeps login working from the ID token when userinfo is temporarily unavailable", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("network unavailable"));

    const profile = await getKulUserInfo(
      {
        accessToken: "access-token",
        idToken: idToken({
          sub: "r0939342@kuleuven.be",
          email: "witse.panneels@student.kuleuven.be",
          name: "Witse Panneels",
        }),
      },
      fetchImpl,
    );

    expect(profile).toMatchObject({
      id: "r0939342@kuleuven.be",
      email: "witse.panneels@student.kuleuven.be",
      name: "Witse Panneels",
    });
    expect(wasKulUserInfoFetched(profile!)).toBe(false);
  });

  it("rejects a userinfo response for a different subject", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          sub: "someone-else@kuleuven.be",
          email: "someone-else@kuleuven.be",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    await expect(
      getKulUserInfo(
        {
          accessToken: "access-token",
          idToken: idToken({
            sub: "r0939342@kuleuven.be",
            email: "witse.panneels@student.kuleuven.be",
          }),
        },
        fetchImpl,
      ),
    ).resolves.toBeNull();
  });
});

describe("kulOAuthConfig", () => {
  it("uses explicit endpoints and does not fetch discovery during login", () => {
    vi.stubEnv("KUL_OIDC_DISCOVERY_URL", `${KUL_OIDC_ISSUER}/.well-known/openid-configuration`);
    vi.stubEnv("KUL_OIDC_CLIENT_ID", "dev.vtk.be");
    vi.stubEnv("KUL_OIDC_CLIENT_SECRET", "test-secret");

    const config = kulOAuthConfig();

    expect(config).toMatchObject({
      issuer: KUL_OIDC_ISSUER,
      authorizationUrl: KUL_OIDC_AUTHORIZATION_URL,
      tokenUrl: KUL_OIDC_TOKEN_URL,
      userInfoUrl: KUL_USERINFO_URL,
    });
    expect(config).not.toHaveProperty("discoveryUrl");
  });
});

describe("FirW status", () => {
  it("recognises the engineering faculty unit in a multivalue claim", () => {
    expect(
      firwStudentFromProfile({
        eduPersonOrgUnitDN: [
          "KULouNumber=50000050,ou=unit,dc=kuleuven,dc=be",
          `KULouNumber=${FIRW_ORG_UNIT_NUMBER},ou=unit,dc=kuleuven,dc=be`,
        ],
      }),
    ).toBe(true);
  });

  it("returns false for another faculty and ignores the number in unrelated claims", () => {
    expect(
      firwStudentFromProfile({
        eduPersonOrgUnitDN: [
          "KULouNumber=50000487,ou=unit,dc=kuleuven,dc=be",
        ],
        note: FIRW_ORG_UNIT_NUMBER,
      }),
    ).toBe(false);
  });

  it("updates only an opposite or not-yet-initialised stored value", async () => {
    const changedAt = new Date("2026-07-24T10:00:00.000Z");
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    await expect(
      syncFirwStudent(
        "user-1",
        true,
        changedAt,
        updateMany,
      ),
    ).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: "user-1",
        OR: [
          { firwStudent: false },
          { firwStudentChangedAt: null },
        ],
      },
      data: {
        firwStudent: true,
        firwStudentChangedAt: changedAt,
      },
    });
  });

  it("reports no change when the conditional update matches no account", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    await expect(
      syncFirwStudent(
        "user-1",
        false,
        new Date("2026-07-24T10:00:00.000Z"),
        updateMany,
      ),
    ).resolves.toBe(false);
  });
});

type FakeUser = { id: string; email: string; rNumber?: string; emailVerified: boolean };

/** Een databank van enkele accounts plus de KU Leuven-logins die eraan hangen. */
function fakeLookups(users: FakeUser[], kulAccounts: Record<string, string> = {}) {
  const lookups: KulLinkLookups = {
    userIdForKulAccount: vi.fn(async (accountId: string) => kulAccounts[accountId] ?? null),
    userByRNumber: vi.fn(
      async (rNumber: string) =>
        users.find((user) => user.rNumber?.toLowerCase() === rNumber.toLowerCase()) ?? null,
    ),
    userByEmail: vi.fn(async (email: string) => users.find((user) => user.email === email) ?? null),
  };
  return lookups;
}

describe("resolveKulLink", () => {
  const kul = { accountId: "kul-sub-1", email: "voornaam.naam@student.kuleuven.be", rNumber: "r0123456" };

  it("lands on the account that carries the r-number under a private address", async () => {
    const lookups = fakeLookups([
      { id: "private", email: "voornaam@gmail.com", rNumber: "r0123456", emailVerified: true },
    ]);

    await expect(resolveKulLink(kul, lookups)).resolves.toEqual({
      email: "voornaam@gmail.com",
      userId: "private",
    });
  });

  it("keeps landing there once the KU Leuven login is linked, whatever the addresses say", async () => {
    const lookups = fakeLookups(
      [{ id: "private", email: "voornaam@gmail.com", rNumber: "r0123456", emailVerified: true }],
      { "kul-sub-1": "private" },
    );

    await expect(resolveKulLink(kul, lookups)).resolves.toMatchObject({ userId: "private" });
    expect(lookups.userByRNumber).not.toHaveBeenCalled();
  });

  it("matches an r-number an admin typed in capitals", async () => {
    const lookups = fakeLookups([
      { id: "admin-made", email: "voornaam@vtk.be", rNumber: "R0123456", emailVerified: true },
    ]);

    await expect(resolveKulLink(kul, lookups)).resolves.toEqual({
      email: "voornaam@vtk.be",
      userId: "admin-made",
    });
  });

  it("prefers an exact match on the KU Leuven address over the r-number", async () => {
    const lookups = fakeLookups([
      { id: "private", email: "voornaam@gmail.com", rNumber: "r0123456", emailVerified: true },
      { id: "kul", email: "voornaam.naam@student.kuleuven.be", emailVerified: true },
    ]);

    await expect(resolveKulLink(kul, lookups)).resolves.toEqual({
      email: "voornaam.naam@student.kuleuven.be",
      userId: "kul",
    });
  });

  it("does not claim an unverified account, which better-auth refuses to link", async () => {
    const lookups = fakeLookups([
      { id: "squatter", email: "voornaam.naam@student.kuleuven.be", emailVerified: false },
    ]);

    await expect(resolveKulLink(kul, lookups)).resolves.toEqual({
      email: "voornaam.naam@student.kuleuven.be",
      userId: null,
    });
  });

  it("reports no account when better-auth will create one", async () => {
    await expect(resolveKulLink(kul, fakeLookups([]))).resolves.toEqual({
      email: "voornaam.naam@student.kuleuven.be",
      userId: null,
    });
  });
});
