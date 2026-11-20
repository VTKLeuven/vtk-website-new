import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roleFindMany: vi.fn(),
  verifyMcpAccessToken: vi.fn(),
}));
vi.mock("@vtk/db", () => ({ prisma: { role: { findMany: mocks.roleFindMany } } }));
vi.mock("@vtk/auth/server", () => ({
  verifyMcpAccessToken: mocks.verifyMcpAccessToken,
}));

import { GET as getProtectedResourceRoot } from "@/app/.well-known/oauth-protected-resource/route";
import { GET as getProtectedResourceMcp } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";
import {
  authenticateMcpRequest,
  boundedMcpRequest,
  enforceMcpRateLimit,
  resetMcpRateLimitsForTests,
} from "@/lib/mcp/auth";

const TOKEN = "test-token-that-is-definitely-longer-than-thirty-two-characters";

function request(options?: { token?: string; host?: string; origin?: string; body?: string }) {
  const headers = new Headers({
    host: options?.host ?? "vtk.be",
    "content-type": "application/json",
  });
  if (options?.token) headers.set("authorization", `Bearer ${options.token}`);
  if (options?.origin) headers.set("origin", options.origin);
  return new Request("https://vtk.be/api/mcp", {
    method: "POST",
    headers,
    body: options?.body ?? "{}",
  });
}

describe("MCP requestbeveiliging", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMcpRateLimitsForTests();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "https://vtk.be");
    vi.stubEnv("VTK_MAIN_URL", "https://vtk.be");
    vi.stubEnv("MCP_API_TOKEN", TOKEN);
    vi.stubEnv("MCP_CLIENT_NAME", "MCP testagent");
    vi.stubEnv("MCP_PERMISSIONS", "calendar.create,pages.edit");
    vi.stubEnv("MCP_GROUP_CODES", "CULTUUR,VTK");
    vi.stubEnv("MCP_ROLE_CODES", "");
    vi.stubEnv("MCP_RATE_LIMIT_PER_MINUTE", "10");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("weigert ontbrekende en foutieve tokens met RFC 9728 resource_metadata", async () => {
    mocks.verifyMcpAccessToken.mockResolvedValue({ status: "invalid_token" });

    const missing = await authenticateMcpRequest(request());
    expect(missing).toBeInstanceOf(Response);
    expect((missing as Response).status).toBe(401);
    expect((missing as Response).headers.get("www-authenticate")).toContain(
      'resource_metadata="https://vtk.be/.well-known/oauth-protected-resource/api/mcp"',
    );

    const wrong = await authenticateMcpRequest(request({ token: `${TOKEN}-wrong` }));
    expect(wrong).toBeInstanceOf(Response);
    expect((wrong as Response).status).toBe(401);
    expect((wrong as Response).headers.get("www-authenticate")).toContain(
      'resource_metadata="https://vtk.be/.well-known/oauth-protected-resource/api/mcp"',
    );

    vi.stubEnv("MCP_API_TOKEN", "");
    const missingWithoutStatic = await authenticateMcpRequest(request());
    expect(missingWithoutStatic).toBeInstanceOf(Response);
    expect((missingWithoutStatic as Response).status).toBe(401);
    expect((missingWithoutStatic as Response).headers.get("www-authenticate")).toContain(
      'resource_metadata="https://vtk.be/.well-known/oauth-protected-resource/api/mcp"',
    );
  });

  it("valt dicht wanneer de server geen sterke token heeft", async () => {
    vi.stubEnv("MCP_API_TOKEN", "too-short");
    const result = await authenticateMcpRequest(request({ token: "too-short" }));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(503);
  });

  it("geeft de echte bearerwaarde niet door aan de protocolhandler", async () => {
    const result = await authenticateMcpRequest(request({ token: TOKEN }));
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.authInfo).toEqual({
      token: "[redacted]",
      clientId: "MCP testagent",
      scopes: ["mcp:read", "mcp:create"],
      extra: {
        authKind: "static",
        permissions: ["calendar.create", "pages.edit"],
        allPermissions: false,
        groupCodes: ["CULTUUR", "VTK"],
        allGroups: false,
        roleCodes: [],
      },
    });
    expect(result.rateLimitKey).not.toContain(TOKEN);
  });

  it("valt dicht bij ontbrekende of onbekende serviceaccountpermissies", async () => {
    vi.stubEnv("MCP_PERMISSIONS", "");
    const missing = await authenticateMcpRequest(request({ token: TOKEN }));
    expect(missing).toBeInstanceOf(Response);
    expect((missing as Response).status).toBe(503);

    vi.stubEnv("MCP_PERMISSIONS", "calendar.create,does.not.exist");
    const unknown = await authenticateMcpRequest(request({ token: TOKEN }));
    expect(unknown).toBeInstanceOf(Response);
    expect((unknown as Response).status).toBe(503);
  });

  it("leidt permissies af uit configureerbare databaserollen", async () => {
    vi.stubEnv("MCP_PERMISSIONS", "");
    vi.stubEnv("MCP_ROLE_CODES", "editor");
    mocks.roleFindMany.mockResolvedValue([{
      code: "editor",
      permissions: [{ permission: { code: "pages.edit" } }],
    }]);

    const result = await authenticateMcpRequest(request({ token: TOKEN }));
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.authInfo.extra).toMatchObject({
      permissions: ["pages.edit"],
      roleCodes: ["editor"],
    });
  });

  it("weigert onbekende hosts en browser-origins", async () => {
    const host = await authenticateMcpRequest(request({ token: TOKEN, host: "evil.example" }));
    expect(host).toBeInstanceOf(Response);
    expect((host as Response).status).toBe(403);

    const origin = await authenticateMcpRequest(
      request({ token: TOKEN, origin: "https://evil.example" }),
    );
    expect(origin).toBeInstanceOf(Response);
    expect((origin as Response).status).toBe(403);
  });

  it("laat een expliciet toegelaten extra host en origin toe", async () => {
    vi.stubEnv("MCP_ALLOWED_HOSTS", "mcp.dev.vtk.be");
    vi.stubEnv("MCP_ALLOWED_ORIGINS", "https://agent.vtk.be");
    const result = await authenticateMcpRequest(
      request({ token: TOKEN, host: "mcp.dev.vtk.be", origin: "https://agent.vtk.be" }),
    );
    expect(result).not.toBeInstanceOf(Response);
  });

  it("begrenst requests per minuut", () => {
    for (let count = 0; count < 10; count += 1) {
      expect(enforceMcpRateLimit("agent", 1_000)).toBeNull();
    }
    const limited = enforceMcpRateLimit("agent", 1_000);
    expect(limited?.status).toBe(429);
    expect(limited?.headers.get("retry-after")).toBe("60");
    expect(enforceMcpRateLimit("agent", 61_001)).toBeNull();
  });

  it("aanvaardt alleen begrensde JSON-bodies", async () => {
    const wrongType = request({ token: TOKEN });
    wrongType.headers.set("content-type", "text/plain");
    const unsupported = await boundedMcpRequest(wrongType);
    expect(unsupported).toBeInstanceOf(Response);
    expect((unsupported as Response).status).toBe(415);

    const oversized = await boundedMcpRequest(
      request({ token: TOKEN, body: "x".repeat(256 * 1024 + 1) }),
    );
    expect(oversized).toBeInstanceOf(Response);
    expect((oversized as Response).status).toBe(413);
  });

  it("valideert OAuth 2.1 access tokens met live rechten en per-user rate limit", async () => {
    vi.stubEnv("MCP_API_TOKEN", "");
    mocks.verifyMcpAccessToken.mockResolvedValue({
      status: "ok",
      data: {
        userId: "user-123",
        clientId: "claude-client",
        clientName: "Claude",
        scopes: ["mcp:read"],
        user: {
          id: "user-123",
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

    const result = await authenticateMcpRequest(request({ token: "oauth-jwt-token" }));
    expect(mocks.verifyMcpAccessToken).toHaveBeenCalledWith("oauth-jwt-token", "https://vtk.be/api/mcp");
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.rateLimitKey).toBe("user:user-123");
    expect(result.authInfo).toEqual({
      token: "[redacted]",
      clientId: "Claude",
      scopes: ["mcp:read"],
      extra: {
        authKind: "oauth",
        userId: "user-123",
        userName: "Jan Praesidium",
        permissions: ["mcp.use", "calendar.create"],
        allPermissions: false,
        groupCodes: ["CULTUUR"],
        allGroups: false,
        roleCodes: ["praesidium"],
      },
    });
  });

  it("weigert OAuth tokens met ontbrekende scope of ontbrekende mcp.use-toegang", async () => {
    vi.stubEnv("MCP_API_TOKEN", "");
    mocks.verifyMcpAccessToken.mockResolvedValueOnce({
      status: "forbidden",
      error: "insufficient_scope",
      scope: "mcp:read",
    });
    const noScope = await authenticateMcpRequest(request({ token: "oauth-no-scope" }));
    expect(noScope).toBeInstanceOf(Response);
    expect((noScope as Response).status).toBe(403);
    expect((noScope as Response).headers.get("www-authenticate")).toContain('error="insufficient_scope"');

    mocks.verifyMcpAccessToken.mockResolvedValueOnce({
      status: "forbidden",
      error: "MCP_FORBIDDEN",
    });
    const noPerm = await authenticateMcpRequest(request({ token: "oauth-no-perm" }));
    expect(noPerm).toBeInstanceOf(Response);
    expect((noPerm as Response).status).toBe(403);
  });

  it("publiceert RFC 9728 protected resource metadata op beide well-known paden", async () => {
    const req1 = new Request("https://vtk.be/.well-known/oauth-protected-resource");
    const req2 = new Request("https://vtk.be/.well-known/oauth-protected-resource/api/mcp");
    const res1 = getProtectedResourceRoot(req1);
    const res2 = getProtectedResourceMcp(req2);

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    const expected = {
      resource: "https://vtk.be/api/mcp",
      authorization_servers: ["https://vtk.be/api/auth/better"],
      scopes_supported: ["mcp:read", "mcp:create"],
      bearer_methods_supported: ["header"],
    };
    expect(await res1.json()).toEqual(expected);
    expect(await res2.json()).toEqual(expected);
  });
});
