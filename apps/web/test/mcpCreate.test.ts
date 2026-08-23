import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  roleFindMany: vi.fn(),
  pageCreate: vi.fn(),
  tabFindUnique: vi.fn(),
  linkCreate: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    role: { findMany: mocks.roleFindMany },
    page: { create: mocks.pageCreate },
    headerTab: { findUnique: mocks.tabFindUnique },
    headerTabLink: { create: mocks.linkCreate },
  },
}));
vi.mock("@/lib/audit", () => ({ logSystemAudit: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createMcpRecord, listMcpCreateSchemas } from "@/lib/mcp/create";
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

  it("aanvaardt een pad op deze site als bestemming voor een menu-item", async () => {
    mocks.tabFindUnique.mockResolvedValue({ id: "tab-1", visible: false });
    mocks.linkCreate.mockResolvedValue({ id: "link-1", url: "/praesidium" });

    await createMcpRecord(principal(["header.manage"]), {
      kind: "header_link",
      data: { tabCode: "OVER", labelNl: "Praesidium", labelEn: "Board", url: "/praesidium" },
    });
    expect(mocks.linkCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ url: "/praesidium" }),
    }));

    await expect(createMcpRecord(principal(["header.manage"]), {
      kind: "header_link",
      data: { tabCode: "OVER", labelNl: "Kwaad", labelEn: "Evil", url: "//evil.example" },
    })).rejects.toBeInstanceOf(Error);
  });

  it("adverteert enumwaarden en grenzen zodat een agent niet moet gokken", () => {
    const kinds = listMcpCreateSchemas(principal(["forms.create"]));
    const field = kinds.find((kind) => kind.kind === "form_field")
      ?.inputFields.find((entry) => entry.name === "type");
    expect(field).toMatchObject({ type: "string", required: true });
    expect(field?.enum).toContain("SHORT_TEXT");

    const start = kinds.find((kind) => kind.kind === "calendar_event")
      ?.inputFields.find((entry) => entry.name === "start");
    expect(start).toMatchObject({ type: "string", format: "date-time" });
  });
});
