import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  logSystemAudit: vi.fn(),
  verifyMcpAccessToken: vi.fn(),
  groupFindUnique: vi.fn(),
  calendarCategoryFindMany: vi.fn(),
  calendarCategoryFindUnique: vi.fn(),
  calendarEventFindUnique: vi.fn(),
  calendarEventCreate: vi.fn(),
}));
vi.mock("@vtk/db", () => ({
  prisma: {
    group: { findUnique: mocks.groupFindUnique },
    calendarCategory: {
      findMany: mocks.calendarCategoryFindMany,
      findUnique: mocks.calendarCategoryFindUnique,
    },
    calendarEvent: {
      findUnique: mocks.calendarEventFindUnique,
      create: mocks.calendarEventCreate,
    },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logSystemAudit: mocks.logSystemAudit }));
vi.mock("@vtk/auth/server", () => ({
  verifyMcpAccessToken: mocks.verifyMcpAccessToken,
}));

import { POST } from "@/app/api/mcp/route";
import { MCP_TOOL_NAMES } from "@/lib/mcp/server";
import { resetMcpRateLimitsForTests } from "@/lib/mcp/auth";

const TOKEN = "route-test-token-that-is-longer-than-thirty-two-characters";

function mcpRequest(body: object, token = TOKEN) {
  return new Request("https://vtk.be/api/mcp", {
    method: "POST",
    headers: {
      host: "vtk.be",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-11-25",
    },
    body: JSON.stringify(body),
  });
}

async function rpcPayload(response: Response) {
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text
      .split("\n")
      .find((line) => line.startsWith("data:"))
      ?.slice(5)
      .trim();
    if (!data) throw new Error(`Geen SSE data in response: ${text}`);
    return JSON.parse(data);
  }
  return JSON.parse(text);
}

describe("POST /api/mcp", () => {
  beforeEach(() => {
    resetMcpRateLimitsForTests();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BETTER_AUTH_URL", "https://vtk.be");
    vi.stubEnv("VTK_MAIN_URL", "https://vtk.be");
    vi.stubEnv("MCP_API_TOKEN", TOKEN);
    vi.stubEnv("MCP_PERMISSIONS", "*");
    vi.stubEnv("MCP_GROUP_CODES", "*");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("spreekt Streamable HTTP MCP en adverteert alleen de allowlisted tools", async () => {
    const initialized = await POST(
      mcpRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "vtk-test", version: "1.0.0" },
        },
      }),
    );
    expect(initialized.status).toBe(200);
    expect(await rpcPayload(initialized)).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "vtk-website", version: "1.0.0" } },
    });

    const listed = await POST(
      mcpRequest({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
    );
    expect(listed.status).toBe(200);
    const payload = await rpcPayload(listed);
    expect(payload.result.tools.map((tool: { name: string }) => tool.name)).toEqual(MCP_TOOL_NAMES);
    for (const tool of payload.result.tools) {
      expect(tool.annotations.destructiveHint).toBe(false);
    }
  });

  it("verbergt create-tools en domeinaliases die de serviceaccount niet mag gebruiken", async () => {
    vi.stubEnv("MCP_PERMISSIONS", "shift.ranking");
    vi.stubEnv("MCP_GROUP_CODES", "");

    const listed = await POST(
      mcpRequest({ jsonrpc: "2.0", id: 3, method: "tools/list", params: {} }),
    );
    const payload = await rpcPayload(listed);
    expect(payload.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      "system_list_capabilities",
      "app_read",
    ]);

    const forbidden = await POST(
      mcpRequest({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "app_read", arguments: { resource: "door" } },
      }),
    );
    expect(await rpcPayload(forbidden)).toMatchObject({
      result: { isError: true, content: [{ text: expect.stringContaining("FORBIDDEN") }] },
    });
  });

  it("blokkeert create-tools bij mcp:read-only OAuth-tokens en blokkeert PII-reads standaard", async () => {
    vi.stubEnv("MCP_API_TOKEN", "");
    mocks.verifyMcpAccessToken.mockResolvedValue({
      status: "ok",
      data: {
        userId: "user-1",
        clientId: "claude",
        clientName: "Claude",
        scopes: ["mcp:read"],
        user: {
          id: "user-1",
          name: "Jan Praesidium",
          active: true,
          isSuperAdmin: false,
          hasMcpUse: true,
          permissions: ["mcp.use", "calendar.create", "users.view", "tickets.manageAll", "forms.manageAll", "door.manage", "mailinglists.export"],
          groupCodes: ["CULTUUR"],
          roleCodes: ["praesidium"],
        },
      },
    });

    const listed = await POST(
      mcpRequest({ jsonrpc: "2.0", id: 5, method: "tools/list", params: {} }, "oauth-read-only"),
    );
    const listedPayload = await rpcPayload(listed);
    const toolNames = listedPayload.result.tools.map((tool: { name: string }) => tool.name);
    expect(toolNames).toContain("app_read");
    expect(toolNames).toContain("calendar_list_events");
    expect(toolNames).not.toContain("app_create");
    expect(toolNames).not.toContain("calendar_create_event");

    const piiBlocked = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 6,
          method: "tools/call",
          params: { name: "app_read", arguments: { resource: "users" } },
        },
        "oauth-read-only",
      ),
    );
    expect(await rpcPayload(piiBlocked)).toMatchObject({
      result: { isError: true, content: [{ text: expect.stringContaining("FORBIDDEN") }] },
    });
  });

  it("schrijft auditlogregels op naam van de echte gebruiker bij OAuth create-calls", async () => {
    vi.stubEnv("MCP_API_TOKEN", "");
    mocks.verifyMcpAccessToken.mockResolvedValue({
      status: "ok",
      data: {
        userId: "user-42",
        clientId: "claude",
        clientName: "Claude",
        scopes: ["mcp:read", "mcp:create"],
        user: {
          id: "user-42",
          name: "An Praesidium",
          active: true,
          isSuperAdmin: false,
          hasMcpUse: true,
          permissions: ["mcp.use", "calendar.create"],
          groupCodes: ["CULTUUR"],
          roleCodes: ["praesidium"],
        },
      },
    });
    mocks.groupFindUnique.mockResolvedValue({ id: "grp-1", code: "CULTUUR", active: true });
    mocks.calendarCategoryFindMany.mockResolvedValue([]);
    mocks.calendarCategoryFindUnique.mockResolvedValue(null);
    mocks.calendarEventFindUnique.mockResolvedValue(null);
    mocks.calendarEventCreate.mockResolvedValue({
      id: "evt-1",
      slug: "test-event",
      titleNl: "Test Event",
      start: new Date("2026-12-01T19:00:00Z"),
      end: new Date("2026-12-01T21:00:00Z"),
      publishedAt: null,
      group: { code: "CULTUUR", nameNl: "Cultuur" },
      categories: [],
    });

    const res = await POST(
      mcpRequest(
        {
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: {
            name: "calendar_create_event",
            arguments: {
              titleNl: "Test Event",
              groupCode: "CULTUUR",
              start: "2026-12-01T19:00:00Z",
              end: "2026-12-01T21:00:00Z",
            },
          },
        },
        "oauth-create",
      ),
    );
    expect(res.status).toBe(200);
    expect(await rpcPayload(res)).toMatchObject({
      result: { structuredContent: { kind: "calendar_event" } },
    });
    expect(mocks.logSystemAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create", entity: "calendarEvent", entityId: "evt-1" }),
      "An Praesidium (Claude)",
      "user-42",
    );
  });
});
