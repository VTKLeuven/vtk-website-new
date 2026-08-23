import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@vtk/db", () => ({ prisma: {} }));
vi.mock("@/lib/audit", () => ({ logSystemAudit: vi.fn() }));

import { POST } from "@/app/api/mcp/route";
import { MCP_TOOL_NAMES } from "@/lib/mcp/server";
import { resetMcpRateLimitsForTests } from "@/lib/mcp/auth";

const TOKEN = "route-test-token-that-is-longer-than-thirty-two-characters";

function mcpRequest(body: object) {
  return new Request("https://vtk.be/api/mcp", {
    method: "POST",
    headers: {
      host: "vtk.be",
      authorization: `Bearer ${TOKEN}`,
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
});
