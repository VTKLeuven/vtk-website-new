import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
    resetMcpRateLimitsForTests();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "https://vtk.be");
    vi.stubEnv("VTK_MAIN_URL", "https://vtk.be");
    vi.stubEnv("MCP_API_TOKEN", TOKEN);
    vi.stubEnv("MCP_CLIENT_NAME", "MCP testagent");
    vi.stubEnv("MCP_RATE_LIMIT_PER_MINUTE", "10");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("weigert ontbrekende en foutieve tokens", async () => {
    const missing = authenticateMcpRequest(request());
    expect(missing).toBeInstanceOf(Response);
    expect((missing as Response).status).toBe(401);

    const wrong = authenticateMcpRequest(request({ token: `${TOKEN}-wrong` }));
    expect(wrong).toBeInstanceOf(Response);
    expect((wrong as Response).status).toBe(401);
  });

  it("valt dicht wanneer de server geen sterke token heeft", async () => {
    vi.stubEnv("MCP_API_TOKEN", "too-short");
    const result = authenticateMcpRequest(request({ token: "too-short" }));
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).status).toBe(503);
  });

  it("geeft de echte bearerwaarde niet door aan de protocolhandler", () => {
    const result = authenticateMcpRequest(request({ token: TOKEN }));
    expect(result).not.toBeInstanceOf(Response);
    if (result instanceof Response) return;
    expect(result.authInfo).toEqual({
      token: "[redacted]",
      clientId: "MCP testagent",
      scopes: ["mcp:read", "mcp:create"],
    });
    expect(result.rateLimitKey).not.toContain(TOKEN);
  });

  it("weigert onbekende hosts en browser-origins", () => {
    const host = authenticateMcpRequest(request({ token: TOKEN, host: "evil.example" }));
    expect(host).toBeInstanceOf(Response);
    expect((host as Response).status).toBe(403);

    const origin = authenticateMcpRequest(
      request({ token: TOKEN, origin: "https://evil.example" }),
    );
    expect(origin).toBeInstanceOf(Response);
    expect((origin as Response).status).toBe(403);
  });

  it("laat een expliciet toegelaten extra host en origin toe", () => {
    vi.stubEnv("MCP_ALLOWED_HOSTS", "mcp.dev.vtk.be");
    vi.stubEnv("MCP_ALLOWED_ORIGINS", "https://agent.vtk.be");
    const result = authenticateMcpRequest(
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
});
