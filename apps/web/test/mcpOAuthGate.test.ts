import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

const mocks = vi.hoisted(() => ({
  oauthClientFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  getJwks: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    oauthClient: { findUnique: mocks.oauthClientFindUnique },
    user: { findUnique: mocks.userFindUnique },
  },
}));

vi.mock("better-auth/adapters/prisma", () => ({
  prismaAdapter: vi.fn(() => () => ({
    id: "prisma-mock",
    findOne: vi.fn().mockImplementation(async ({ model }: { model: string }) => {
      if (model === "oauthResource") {
        return {
          id: "res-1",
          identifier: "https://vtk.be/api/mcp",
          name: "VTK MCP Server",
          allowedScopes: ["mcp:read", "mcp:create", "offline_access"],
          disabled: false,
        };
      }
      return null;
    }),
    findMany: vi.fn().mockResolvedValue([]),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: "mock-id", ...data })),
    update: vi.fn(async ({ update }: { update: Record<string, unknown> }) => update),
  })),
}));

import { MCP_REGISTRATION_SCOPES, SCOPES } from "@vtk/auth";
import { checkClientAccess, verifyMcpAccessToken } from "@vtk/auth/server";
import { auth } from "../../../packages/auth/src/auth";

let privateKey: CryptoKey;
let publicJwk: Record<string, unknown>;

function userRecord(options: {
  id?: string;
  active?: boolean;
  isSuperAdmin?: boolean;
  permissions?: string[];
  groupCode?: string;
  roleCode?: string;
}) {
  const perms = (options.permissions ?? []).map((code) => ({ permission: { code } }));
  return {
    id: options.id ?? "user-1",
    name: "Jan Praesidium",
    active: options.active ?? true,
    isSuperAdmin: options.isSuperAdmin ?? false,
    roles: perms.length
      ? [{ role: { id: "role-1", code: options.roleCode ?? "praesidium", permissions: perms } }]
      : [],
    memberships: options.groupCode
      ? [
          {
            role: "MEMBER",
            group: {
              code: options.groupCode,
              roleGrants: [],
            },
          },
        ]
      : [],
  };
}

describe("MCP OAuth toegangspoort en tokenvalidatie", () => {
  beforeAll(async () => {
    const pair = await generateKeyPair("RS256");
    privateKey = pair.privateKey;
    publicJwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key-1", alg: "RS256", use: "sig" };
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("BETTER_AUTH_URL", "https://vtk.be");
    vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-that-is-at-least-thirty-two-chars");
    mocks.getJwks.mockResolvedValue({ keys: [publicJwk] });
    vi.spyOn(auth.api, "getJwks").mockImplementation(mocks.getJwks);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("beperkt DCR-scopes strikt tot mcp:read, mcp:create en offline_access", () => {
    expect([...MCP_REGISTRATION_SCOPES]).toEqual(["mcp:read", "mcp:create", "offline_access"]);
    expect(MCP_REGISTRATION_SCOPES).not.toContain("vtk:student_number");
    expect(MCP_REGISTRATION_SCOPES).not.toContain("vtk:contact");
    expect(MCP_REGISTRATION_SCOPES).not.toContain("entitlements");

    const mcpRead = SCOPES.find((s) => s.code === "mcp:read");
    const mcpCreate = SCOPES.find((s) => s.code === "mcp:create");
    expect(mcpRead).toMatchObject({ sensitive: true, defaultSelected: false });
    expect(mcpCreate).toMatchObject({ sensitive: true, defaultSelected: false });
  });

  it("weigert autorisatie zonder mcp.use voor MCP-scopes, resource of MCP-client", async () => {
    mocks.oauthClientFindUnique.mockResolvedValue({
      name: "Claude",
      accessMode: "OPEN",
      permissionNamespace: null,
      scopes: ["mcp:read", "mcp:create", "offline_access"],
    });
    mocks.userFindUnique.mockResolvedValue(
      userRecord({ permissions: ["calendar.create"] }),
    );

    const denied = await checkClientAccess("user-1", "claude-dcr", {
      requestedScopes: ["mcp:read"],
      requestedResource: "https://vtk.be/api/mcp",
    });
    expect(denied).toEqual({ allowed: false, clientName: "Claude" });

    mocks.userFindUnique.mockResolvedValue(
      userRecord({ permissions: ["mcp.use", "calendar.create"] }),
    );
    const allowed = await checkClientAccess("user-1", "claude-dcr", {
      requestedScopes: ["mcp:read"],
      requestedResource: "https://vtk.be/api/mcp",
    });
    expect(allowed).toEqual({ allowed: true, clientName: "Claude" });
  });

  it("laat gewone niet-MCP OPEN clients door zonder mcp.use", async () => {
    mocks.oauthClientFindUnique.mockResolvedValue({
      name: "Cudi",
      accessMode: "OPEN",
      permissionNamespace: null,
      scopes: ["openid", "profile"],
    });

    const allowed = await checkClientAccess("user-1", "cudi", {
      requestedScopes: ["openid", "profile"],
    });
    expect(allowed).toEqual({ allowed: true, clientName: "Cudi" });
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it("valideert geldige JWT access tokens en weigert foute aud, verlopen tokens en missende scopes/rechten", async () => {
    const ctx = await auth.$context;
    const issuer = ctx.baseURL;

    const signToken = (claims: Record<string, unknown>, exp = "15m") =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "test-key-1", typ: "at+jwt" })
        .setIssuedAt()
        .setExpirationTime(exp)
        .sign(privateKey);

    mocks.oauthClientFindUnique.mockResolvedValue({ name: "Claude", disabled: false });
    mocks.userFindUnique.mockResolvedValue(
      userRecord({
        id: "user-1",
        permissions: ["mcp.use", "calendar.create"],
        groupCode: "CULTUUR",
        roleCode: "praesidium",
      }),
    );

    const validJwt = await signToken({
      sub: "user-1",
      aud: "https://vtk.be/api/mcp",
      iss: issuer,
      client_id: "claude-dcr",
      scope: "mcp:read mcp:create",
    });
    const ok = await verifyMcpAccessToken(validJwt, "https://vtk.be/api/mcp");
    expect(ok).toEqual({
      status: "ok",
      data: {
        userId: "user-1",
        clientId: "claude-dcr",
        clientName: "Claude",
        scopes: ["mcp:read", "mcp:create"],
        user: {
          id: "user-1",
          name: "Jan Praesidium",
          active: true,
          isSuperAdmin: false,
          hasMcpUse: true,
          permissions: ["mcp.use", "calendar.create"],
          groupCodes: ["CULTUUR"],
          roleCodes: ["praesidium"],
        },
      },
    });

    const wrongAudJwt = await signToken({
      sub: "user-1",
      aud: "https://vtk.be/api/other",
      iss: issuer,
      client_id: "claude-dcr",
      scope: "mcp:read",
    });
    expect(await verifyMcpAccessToken(wrongAudJwt, "https://vtk.be/api/mcp")).toEqual({
      status: "invalid_token",
    });

    const expiredJwt = await signToken(
      {
        sub: "user-1",
        aud: "https://vtk.be/api/mcp",
        iss: issuer,
        client_id: "claude-dcr",
        scope: "mcp:read",
      },
      "-5m",
    );
    expect(await verifyMcpAccessToken(expiredJwt, "https://vtk.be/api/mcp")).toEqual({
      status: "invalid_token",
    });

    const noReadScopeJwt = await signToken({
      sub: "user-1",
      aud: "https://vtk.be/api/mcp",
      iss: issuer,
      client_id: "claude-dcr",
      scope: "offline_access",
    });
    expect(await verifyMcpAccessToken(noReadScopeJwt, "https://vtk.be/api/mcp")).toEqual({
      status: "forbidden",
      error: "insufficient_scope",
      scope: "mcp:read",
    });

    mocks.userFindUnique.mockResolvedValue(userRecord({ id: "user-1", active: false, permissions: ["mcp.use"] }));
    expect(await verifyMcpAccessToken(validJwt, "https://vtk.be/api/mcp")).toEqual({
      status: "forbidden",
      error: "MCP_FORBIDDEN",
    });

    mocks.userFindUnique.mockResolvedValue(userRecord({ id: "user-1", active: true, permissions: ["calendar.create"] }));
    expect(await verifyMcpAccessToken(validJwt, "https://vtk.be/api/mcp")).toEqual({
      status: "forbidden",
      error: "MCP_FORBIDDEN",
    });

    // Verwijderde of uitgeschakelde OAuth-clients worden meteen geweigerd.
    mocks.userFindUnique.mockResolvedValue(userRecord({ id: "user-1", active: true, permissions: ["mcp.use"] }));
    mocks.oauthClientFindUnique.mockResolvedValue(null);
    expect(await verifyMcpAccessToken(validJwt, "https://vtk.be/api/mcp")).toEqual({
      status: "forbidden",
      error: "MCP_FORBIDDEN",
    });

    mocks.oauthClientFindUnique.mockResolvedValue({ name: "Claude", disabled: true });
    expect(await verifyMcpAccessToken(validJwt, "https://vtk.be/api/mcp")).toEqual({
      status: "forbidden",
      error: "MCP_FORBIDDEN",
    });

    // Foute issuer wordt geweigerd.
    mocks.oauthClientFindUnique.mockResolvedValue({ name: "Claude", disabled: false });
    const wrongIssJwt = await signToken({
      sub: "user-1",
      aud: "https://vtk.be/api/mcp",
      iss: "https://evil.example/api/auth/better",
      client_id: "claude-dcr",
      scope: "mcp:read",
    });
    expect(await verifyMcpAccessToken(wrongIssJwt, "https://vtk.be/api/mcp")).toEqual({
      status: "invalid_token",
    });
  });

  it("weigert niet-toegestane redirect hosts en niet-publieke clients op /oauth2/register via de echte Better Auth handler", async () => {
    const register = async (body: Record<string, unknown>) =>
      auth.handler(
        new Request("https://vtk.be/api/auth/better/oauth2/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );

    const evilHost = await register({
      client_name: "Evil",
      redirect_uris: ["https://evil.example/callback"],
    });
    expect(evilHost.status).toBe(400);

    const nonHttps = await register({
      client_name: "Insecure Claude",
      redirect_uris: ["http://claude.ai/api/mcp/auth_callback"],
    });
    expect(nonHttps.status).toBe(400);

    const confidential = await register({
      client_name: "Confidential",
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
      token_endpoint_auth_method: "client_secret_basic",
    });
    expect(confidential.status).toBe(400);

    const evilCursor = await register({
      client_name: "Evil Cursor",
      redirect_uris: ["cursor://evil.example/oauth/callback"],
    });
    expect(evilCursor.status).toBe(400);

    const evilCursorPath = await register({
      client_name: "Evil Cursor Path",
      redirect_uris: ["cursor://anysphere.cursor-mcp/other/callback"],
    });
    expect(evilCursorPath.status).toBe(400);

    const validCursor = await register({
      client_name: "Cursor",
      redirect_uris: ["cursor://anysphere.cursor-mcp/oauth/callback"],
    });
    expect(validCursor.status).toBeLessThan(400);
  });
});
