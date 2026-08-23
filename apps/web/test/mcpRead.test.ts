import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ userFindMany: vi.fn(), doorFindMany: vi.fn() }));

vi.mock("@vtk/db", () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    doorAccessGrant: { findMany: mocks.doorFindMany },
    doorAccessLog: { findMany: mocks.doorFindMany },
  },
}));

import { adminRead } from "@/lib/mcp/read";
import { principalFromAuthInfo } from "@/lib/mcp/policy";

function principal(permissions: string[]) {
  return principalFromAuthInfo({
    token: "[redacted]",
    clientId: "reader",
    scopes: ["mcp:read"],
    extra: { permissions, allPermissions: false, groupCodes: [], allGroups: false, roleCodes: [] },
  });
}

describe("MCP brede read-catalogus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.userFindMany.mockResolvedValue([{ id: "u1", name: "Test", email: "test@vtk.be", rNumber: "r0123456", locale: "NL" }]);
  });

  it("beperkt users.search tot minimale user-pickerdata", async () => {
    const result = await adminRead(principal(["users.search"]), { resource: "user_search" });
    expect(result).toMatchObject({ resource: "user_search", items: [{ id: "u1" }] });
    expect(mocks.userFindMany.mock.calls[0][0].select).toEqual({
      id: true, name: true, email: true, rNumber: true, locale: true,
    });

    await expect(adminRead(principal(["users.search"]), { resource: "users" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("geeft door.open geen toegang tot deurregistraties", async () => {
    await expect(adminRead(principal(["door.open"]), { resource: "door" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.doorFindMany).not.toHaveBeenCalled();
  });
});
