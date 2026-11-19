import { afterEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@vtk/auth";
import {
  MCP_CREATE_TOOL_NAMES,
  MCP_READ_TOOL_NAMES,
  MCP_TOOL_NAMES,
} from "@/lib/mcp/server";
import { canCreateMcpKind, MCP_CREATE_KINDS } from "@/lib/mcp/create";
import { MCP_PERMISSION_POLICY, principalFromAuthInfo } from "@/lib/mcp/policy";
import {
  canReadMcpResource,
  MCP_OAUTH_SAFE_READ_RESOURCES,
  MCP_READ_RESOURCES,
} from "@/lib/mcp/read";

describe("MCP toolbeleid", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("registreert brede read- en create-catalogi naast de kalenderaliases", () => {
    expect(MCP_READ_TOOL_NAMES).toContain("app_read");
    expect(MCP_CREATE_TOOL_NAMES).toContain("app_create");
    expect(MCP_CREATE_KINDS.length).toBeGreaterThan(25);
    expect(MCP_READ_RESOURCES.length).toBeGreaterThan(25);
    expect(MCP_TOOL_NAMES).toEqual([...MCP_READ_TOOL_NAMES, ...MCP_CREATE_TOOL_NAMES]);
  });

  it("dwingt een expliciete MCP-policy af voor elke applicatiepermissie", () => {
    expect(Object.keys(MCP_PERMISSION_POLICY).sort()).toEqual(
      PERMISSIONS.map(({ code }) => code).sort(),
    );
    for (const policy of Object.values(MCP_PERMISSION_POLICY)) {
      expect(policy).toHaveProperty("reads");
      expect(policy).toHaveProperty("creates");
      expect(policy).toHaveProperty("blocked");
    }
  });

  it("scheidt beperkte leesrechten van gevoelige adminreads", () => {
    const principal = principalFromAuthInfo({
      token: "[redacted]",
      clientId: "limited",
      scopes: ["mcp:read", "mcp:create"],
      extra: {
        permissions: ["users.search", "door.open", "shift.ranking"],
        allPermissions: false,
        groupCodes: [],
        allGroups: false,
        roleCodes: [],
      },
    });
    expect(canReadMcpResource(principal, "user_search")).toBe(true);
    expect(canReadMcpResource(principal, "users")).toBe(false);
    expect(canReadMcpResource(principal, "door")).toBe(false);
    expect(canReadMcpResource(principal, "shift_ranking")).toBe(true);
    expect(canReadMcpResource(principal, "shifts")).toBe(false);
    expect(canCreateMcpKind(principal, "page")).toBe(false);
  });

  it("houdt elke policyverwijzing gekoppeld aan een bestaande resource of create-kind", () => {
    for (const [permission, policy] of Object.entries(MCP_PERMISSION_POLICY)) {
      const principal = principalFromAuthInfo({
        token: "[redacted]",
        clientId: permission,
        scopes: ["mcp:read", "mcp:create"],
        extra: { permissions: [permission], allPermissions: false, groupCodes: [], allGroups: false, roleCodes: [] },
      });
      for (const resource of policy.reads) {
        expect(MCP_READ_RESOURCES).toContain(resource);
        expect(canReadMcpResource(principal, resource as (typeof MCP_READ_RESOURCES)[number])).toBe(true);
      }
      for (const capability of policy.creates) {
        if (capability.startsWith("app_create:")) {
          const kind = capability.slice("app_create:".length).split("(", 1)[0];
          expect(MCP_CREATE_KINDS).toContain(kind);
          expect(canCreateMcpKind(principal, kind as (typeof MCP_CREATE_KINDS)[number])).toBe(true);
        } else {
          expect(MCP_CREATE_TOOL_NAMES).toContain(capability);
        }
      }
    }
  });

  it("heeft geen toolnaam die een destructive of overschrijvende mutatie suggereert", () => {
    for (const name of MCP_TOOL_NAMES) {
      expect(name).not.toMatch(/delete|remove|destroy|update|edit|save|upsert|publish|unpublish|refund|revoke|send|open_door/i);
    }
  });

  it("dwingt OAuth-scopes en een strikte lees-allowlist zonder persoonsgegevens af", () => {
    const readOnly = principalFromAuthInfo({
      token: "[redacted]",
      clientId: "Claude",
      scopes: ["mcp:read"],
      extra: {
        authKind: "oauth",
        userId: "u1",
        permissions: PERMISSIONS.map(({ code }) => code),
        allPermissions: false,
        groupCodes: ["CULTUUR"],
        allGroups: false,
        roleCodes: [],
      },
    });
    expect(canCreateMcpKind(readOnly, "calendar_event")).toBe(false);

    for (const resource of MCP_READ_RESOURCES) {
      expect(canReadMcpResource(readOnly, resource)).toBe(
        MCP_OAUTH_SAFE_READ_RESOURCES.has(resource),
      );
    }

    for (const blockedResource of [
      "users",
      "user_search",
      "ticket_orders",
      "form_entries",
      "door",
      "mailing_lists",
      "shifts",
      "shift_ranking",
      "theokot",
      "meetings",
      "piano",
      "logistiek",
      "pocs",
      "vault_metadata",
      "lesbezoeken",
      "urenloop_app",
      "audit_log",
      "oauth_clients",
    ] as const) {
      expect(canReadMcpResource(readOnly, blockedResource)).toBe(false);
    }

    vi.stubEnv("MCP_OAUTH_ALLOW_PII_READS", "true");
    for (const resource of MCP_READ_RESOURCES) {
      expect(canReadMcpResource(readOnly, resource)).toBe(true);
    }
  });
});
