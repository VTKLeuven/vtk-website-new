import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roleFindMany: vi.fn(),
  pageCreate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    role: { findMany: mocks.roleFindMany },
    page: { create: mocks.pageCreate },
  },
}));
vi.mock("@/lib/audit", () => ({ logSystemAudit: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createMcpRecord } from "@/lib/mcp/create";
import { principalFromAuthInfo } from "@/lib/mcp/policy";

function principal(permissions: string[]) {
  return principalFromAuthInfo({
    token: "[redacted]",
    clientId: "test-agent",
    scopes: ["mcp:read", "mcp:create"],
    extra: {
      permissions,
      allPermissions: false,
      groupCodes: [],
      allGroups: false,
      roleCodes: ["editor"],
    },
  });
}

describe("MCP brede create-catalogus", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.roleFindMany.mockResolvedValue([{ id: "role-1" }]);
    mocks.pageCreate.mockResolvedValue({ id: "page-1", slug: "nieuwe-pagina", titleNl: "Nieuwe pagina", publishedAt: null });
  });

  it("maakt een pagina geforceerd als ongepubliceerd concept", async () => {
    const result = await createMcpRecord(principal(["pages.edit"]), {
      kind: "page",
      data: { slug: "nieuwe-pagina", titleNl: "Nieuwe pagina" },
    });

    expect(mocks.pageCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        publishedAt: null,
        contentMdNl: "",
        editorRoles: { create: [{ roleId: "role-1" }] },
      }),
    }));
    expect(result).toMatchObject({ kind: "page", created: { id: "page-1" } });
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create", entity: "page" }),
      "test-agent",
    );
  });

  it("weigert een create-kind zonder de vereiste applicatiepermissie", async () => {
    await expect(createMcpRecord(principal(["calendar.create"]), {
      kind: "page",
      data: { slug: "verboden", titleNl: "Verboden" },
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.pageCreate).not.toHaveBeenCalled();
  });

  it("weigert onbekende velden in een kind-specifiek schema", async () => {
    await expect(createMcpRecord(principal(["pages.edit"]), {
      kind: "page",
      data: { slug: "pagina", titleNl: "Pagina", publishedAt: new Date().toISOString() },
    })).rejects.toBeInstanceOf(Error);
    expect(mocks.pageCreate).not.toHaveBeenCalled();
  });
});
