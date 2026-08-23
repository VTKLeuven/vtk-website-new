import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import type { AuthInfo } from "@modelcontextprotocol/server";

const MAX_REQUEST_BYTES = 256 * 1024;
const RATE_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT = 120;

type RateWindow = { startedAt: number; count: number };
const rateWindows = new Map<string, RateWindow>();

export type McpAuthentication = {
  authInfo: AuthInfo;
  rateLimitKey: string;
};

function jsonError(status: number, error: string, headers?: HeadersInit): Response {
  return Response.json(
    { error },
    {
      status,
      headers: {
        "cache-control": "private, no-store, max-age=0",
        ...Object.fromEntries(new Headers(headers)),
      },
    },
  );
}

function parseBearer(value: string | null): string | null {
  const match = /^Bearer ([^\s]+)$/.exec(value ?? "");
  return match?.[1] ?? null;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function configuredHosts(): Set<string> {
  const hosts = new Set<string>();
  for (const candidate of [process.env.BETTER_AUTH_URL, process.env.VTK_MAIN_URL]) {
    if (!candidate) continue;
    try {
      hosts.add(new URL(candidate).hostname.toLowerCase());
    } catch {
      // Een ongeldige basis-URL verleent nooit toegang.
    }
  }
  for (const host of (process.env.MCP_ALLOWED_HOSTS ?? "").split(",")) {
    const normalized = host.trim().toLowerCase();
    if (normalized) hosts.add(normalized);
  }
  if (process.env.NODE_ENV !== "production") {
    hosts.add("localhost");
    hosts.add("127.0.0.1");
    hosts.add("[::1]");
  }
  return hosts;
}

function requestHostname(request: Request): string | null {
  const raw = request.headers.get("host");
  if (!raw) return null;
  try {
    return new URL(`http://${raw}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function configuredOrigins(): Set<string> {
  const origins = new Set<string>();
  for (const candidate of [process.env.BETTER_AUTH_URL, process.env.VTK_MAIN_URL]) {
    if (!candidate) continue;
    try {
      origins.add(new URL(candidate).origin.toLowerCase());
    } catch {
      // Een ongeldige basis-URL verleent nooit toegang.
    }
  }
  for (const candidate of (process.env.MCP_ALLOWED_ORIGINS ?? "").split(",")) {
    try {
      const normalized = candidate.trim();
      if (normalized) origins.add(new URL(normalized).origin.toLowerCase());
    } catch {
      // Ook hier: ongeldige configuratie valt dicht.
    }
  }
  return origins;
}

function validateNetworkBoundary(request: Request): Response | null {
  const hostname = requestHostname(request);
  if (!hostname || !configuredHosts().has(hostname)) {
    return jsonError(403, "MCP_HOST_NOT_ALLOWED");
  }

  // CLI- en desktopclients sturen doorgaans geen Origin. Als een browser die
  // header wel stuurt, moet hij exact op de allowlist staan; geen wildcards.
  const origin = request.headers.get("origin");
  if (origin) {
    let normalized: string;
    try {
      normalized = new URL(origin).origin.toLowerCase();
    } catch {
      return jsonError(403, "MCP_ORIGIN_NOT_ALLOWED");
    }
    if (!configuredOrigins().has(normalized)) {
      return jsonError(403, "MCP_ORIGIN_NOT_ALLOWED");
    }
  }

  return null;
}

export function authenticateMcpRequest(request: Request): McpAuthentication | Response {
  const boundaryError = validateNetworkBoundary(request);
  if (boundaryError) return boundaryError;

  const configured = process.env.MCP_API_TOKEN?.trim();
  if (!configured || configured.length < 32) {
    return jsonError(503, "MCP_NOT_CONFIGURED");
  }

  const supplied = parseBearer(request.headers.get("authorization"));
  if (!supplied || !safeEqual(configured, supplied)) {
    return jsonError(401, "MCP_UNAUTHENTICATED", {
      "www-authenticate": 'Bearer realm="VTK MCP"',
    });
  }

  const rateLimitKey = createHash("sha256").update(configured).digest("hex");
  return {
    // De protocolhandler heeft de geheime bearerwaarde niet nodig. Geef alleen
    // de gevalideerde identiteit en capabilities door, zodat het token niet per
    // ongeluk in een toolresultaat of foutlog terecht kan komen.
    authInfo: {
      token: "[redacted]",
      clientId: process.env.MCP_CLIENT_NAME?.trim() || "vtk-mcp-agent",
      scopes: ["mcp:read", "mcp:create"],
    },
    rateLimitKey,
  };
}

function rateLimit(): number {
  const parsed = Number.parseInt(process.env.MCP_RATE_LIMIT_PER_MINUTE ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 10 && parsed <= 5000 ? parsed : DEFAULT_RATE_LIMIT;
}

export function enforceMcpRateLimit(key: string, now = Date.now()): Response | null {
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= RATE_WINDOW_MS) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return null;
  }

  current.count += 1;
  if (current.count <= rateLimit()) return null;

  const retryAfter = Math.max(1, Math.ceil((RATE_WINDOW_MS - (now - current.startedAt)) / 1000));
  return jsonError(429, "MCP_RATE_LIMITED", { "retry-after": String(retryAfter) });
}

export async function boundedMcpRequest(request: Request): Promise<Request | Response> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType !== "application/json") {
    return jsonError(415, "MCP_JSON_REQUIRED");
  }

  const declaredLength = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return jsonError(413, "MCP_REQUEST_TOO_LARGE");
  }

  const body = await request.arrayBuffer();
  if (body.byteLength > MAX_REQUEST_BYTES) {
    return jsonError(413, "MCP_REQUEST_TOO_LARGE");
  }

  const headers = new Headers(request.headers);
  headers.set("content-length", String(body.byteLength));
  return new Request(request.url, {
    method: "POST",
    headers,
    body,
    signal: request.signal,
  });
}

export function withMcpResponseHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/** Alleen voor geïsoleerde unit tests. */
export function resetMcpRateLimitsForTests(): void {
  rateWindows.clear();
}
