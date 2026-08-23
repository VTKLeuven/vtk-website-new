import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  userFindMany: vi.fn(),
  doorFindMany: vi.fn(),
  settingFindMany: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    user: { findMany: mocks.userFindMany },
    doorAccessGrant: { findMany: mocks.doorFindMany },
    doorAccessLog: { findMany: mocks.doorFindMany },
    setting: { findMany: mocks.settingFindMany },
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

  it("laat geen operationele Setting-key door de redactionele allowlist", async () => {
    mocks.settingFindMany.mockResolvedValue([]);
    const reader = principal(["openingHours.manageOwn"]);

    const leaked = await adminRead(reader, { resource: "editorial_settings", id: "s3.config" });
    expect(mocks.settingFindMany).not.toHaveBeenCalled();
    expect(leaked).toMatchObject({ items: [] });

    await adminRead(reader, { resource: "editorial_settings", search: "vault.config" });
    expect(mocks.settingFindMany).not.toHaveBeenCalled();

    await adminRead(reader, { resource: "editorial_settings" });
    expect(mocks.settingFindMany.mock.calls[0][0].where.key.in).not.toContain("s3.config");
    expect(mocks.settingFindMany.mock.calls[0][0].where.key.in).toContain("home.openingHours.theokot");
  });

  it("negeert een filter niet stil op resources die meerdere collecties bundelen", async () => {
    await expect(adminRead(principal(["door.manage"]), { resource: "door", search: "jan" }))
      .rejects.toMatchObject({ code: "FILTER_NOT_SUPPORTED" });
    expect(mocks.doorFindMany).not.toHaveBeenCalled();
  });
});
