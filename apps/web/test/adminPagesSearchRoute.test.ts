import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  requireSession: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: { page: { findMany: mocks.findMany } },
}));

vi.mock("@/lib/session", () => ({
  requireSession: mocks.requireSession,
  authErrorResponse: () => new Response(null, { status: 401 }),
}));

import { GET } from "@/app/api/admin/pages/search/route";

function request(params: Record<string, string>) {
  const url = new URL("https://vtk.be/api/admin/pages/search");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new Request(url);
}

describe("GET /api/admin/pages/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({
      user: { isSuperAdmin: false },
      permissions: ["pages.manage"],
    });
    mocks.findMany.mockResolvedValue([]);
  });

  it("zoekt pas vanaf twee tekens", async () => {
    const resp = await GET(request({ q: "a" }));
    expect(await resp.json()).toEqual([]);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  // Regressie: pagina's zonder categorie (elke verse pagina, en het gros van de
  // Litus-import) moeten in de picker verschijnen. Met `NOT: { headerTabId }`
  // vielen ze weg op de SQL-NULL-regel en kon je ze nergens aan een categorie
  // hangen.
  it("houdt pagina's zonder categorie in de resultaten", async () => {
    await GET(request({ q: "bestuur", exclude: "tab_1" }));

    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.NOT).toBeUndefined();
    expect(where.AND).toContainEqual({
      OR: [{ headerTabId: null }, { headerTabId: { not: "tab_1" } }],
    });
  });

  it("filtert niets uit zonder exclude", async () => {
    await GET(request({ q: "bestuur" }));

    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.AND).toHaveLength(1);
  });

  it("weigert wie noch pages.manage noch header.manage heeft", async () => {
    mocks.requireSession.mockResolvedValue({
      user: { isSuperAdmin: false },
      permissions: [],
    });
    const resp = await GET(request({ q: "bestuur" }));
    expect(resp.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });

  it("laat gebruikers met header.manage toe", async () => {
    mocks.requireSession.mockResolvedValue({
      user: { isSuperAdmin: false },
      permissions: ["header.manage"],
    });
    const resp = await GET(request({ q: "bestuur" }));
    expect(resp.status).toBe(200);
    expect(mocks.findMany).toHaveBeenCalled();
  });

  it("normaliseert /p/shiften en vindt de pagina op slug", async () => {
    await GET(request({ q: "/p/shiften" }));

    const where = mocks.findMany.mock.calls[0][0].where;
    const or = where.AND[0].OR;
    expect(or).toContainEqual({
      slug: { contains: "shiften", mode: "insensitive" },
    });
  });
});
