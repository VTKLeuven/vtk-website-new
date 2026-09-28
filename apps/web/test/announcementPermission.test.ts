import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@vtk/auth";
import { getAdminNav, type NavLeaf } from "@/lib/admin-nav";
import { MCP_PERMISSION_POLICY, principalFromAuthInfo } from "@/lib/mcp/policy";
import { canReadMcpResource } from "@/lib/mcp/read";
import { canCreateMcpKind } from "@/lib/mcp/create";

describe("announcements permission", () => {
  it("defines announcements.manage in the permission registry", () => {
    const perm = PERMISSIONS.find((p) => p.code === "announcements.manage");
    expect(perm).toBeDefined();
    expect(perm?.labelNl).toBe("Aankondigingen beheren");
    expect(perm?.labelEn).toBe("Manage announcements");
    expect(perm?.category).toBe("general");
  });

  it("gates the admin navigation announcements tab on announcements.manage", () => {
    const nav = getAdminNav();
    const websiteGroup = nav.find(
      (entry): entry is Extract<typeof entry, { group: string; items: NavLeaf[] }> =>
        "group" in entry && entry.group === "website",
    );
    expect(websiteGroup).toBeDefined();
    const tab = websiteGroup?.items.find((item) => item.key === "announcements");
    expect(tab).toBeDefined();
    expect(tab?.perm).toBe("announcements.manage");
  });

  it("wires announcements.manage into MCP policies and capabilities", () => {
    expect(MCP_PERMISSION_POLICY["announcements.manage"]).toEqual({
      reads: ["announcements"],
      creates: ["app_create:announcement"],
      blocked: ["activate announcements"],
    });

    const principal = principalFromAuthInfo({
      token: "[redacted]",
      clientId: "announcements-tester",
      scopes: ["mcp:read", "mcp:create"],
      extra: {
        permissions: ["announcements.manage"],
        allPermissions: false,
        groupCodes: [],
        allGroups: false,
        roleCodes: [],
      },
    });
    expect(canReadMcpResource(principal, "announcements")).toBe(true);
    expect(canCreateMcpKind(principal, "announcement")).toBe(true);
  });
});
