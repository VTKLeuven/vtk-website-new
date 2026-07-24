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
        "student@kuleuven.be",
        true,
        changedAt,
        updateMany,
      ),
    ).resolves.toBe(true);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        email: "student@kuleuven.be",
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
        "student@kuleuven.be",
        false,
        new Date("2026-07-24T10:00:00.000Z"),
        updateMany,
      ),
    ).resolves.toBe(false);
  });
});
