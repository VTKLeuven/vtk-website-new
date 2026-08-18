import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireSession: vi.fn(),
  canEditPageContent: vi.fn(),
  pageFindUnique: vi.fn(),
  pageDelete: vi.fn(),
  assetFindUnique: vi.fn(),
  assetDelete: vi.fn(),
  deleteObject: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@vtk/db", () => ({
  HEADER_TABS: [],
  prisma: {
    page: { findUnique: mocks.pageFindUnique, delete: mocks.pageDelete },
    pageAsset: { findUnique: mocks.assetFindUnique, delete: mocks.assetDelete },
  },
}));
vi.mock("@vtk/storage", () => ({ deleteObject: mocks.deleteObject }));
// Zie pageCategoryActions.test.ts: het logboek hoort niet bij wat hier getest wordt.
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit, describeChanges: () => null }));
vi.mock("@/lib/session", () => ({
  requireAnyPermission: vi.fn(),
  requirePermission: mocks.requirePermission,
  requireSession: mocks.requireSession,
}));
vi.mock("@/lib/pageAccess", () => ({
  canEditPageContent: mocks.canEditPageContent,
  canPublishPages: vi.fn(),
}));

import { deletePageAction, deletePageAssetAction } from "@/app/actions/pages";
import { SAVE_IDLE } from "@/lib/saveState";

/**
 * De bucket mag geen archief worden: wat een pagina bezit (haar kaartfoto en
 * haar bijlagen) hoort mee te verdwijnen wanneer die rij verdwijnt. De database
 * cascadeert `PageAsset`, maar de bestanden zelf niet, dus zonder deze
 * opruiming blijft elke PDF van een verwijderde pagina voorgoed staan.
 */
describe("opruimen van storage bij verwijderen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canEditPageContent.mockReturnValue(true);
    mocks.requireSession.mockResolvedValue({
      user: { isSuperAdmin: true },
      permissions: [],
    });
  });

  it("verwijdert de kaartfoto en alle bijlagen van een verwijderde pagina", async () => {
    mocks.pageFindUnique.mockResolvedValue({
      titleNl: "Sportdag",
      slug: "sportdag",
      imageKey: "images/sport.jpg",
      assets: [{ storageKey: "docs/reglement.pdf" }, { storageKey: "docs/kalender.pdf" }],
      editorRoles: [],
    });
    const form = new FormData();
    form.set("id", "page_1");

    const result = await deletePageAction(SAVE_IDLE, form);

    expect(result.status).toBe("success");
    expect(mocks.pageDelete).toHaveBeenCalledWith({ where: { id: "page_1" } });
    expect(mocks.deleteObject.mock.calls.map(([k]) => k).sort()).toEqual([
      "docs/kalender.pdf",
      "docs/reglement.pdf",
      "images/sport.jpg",
    ]);
  });

  it("raakt storage niet aan wanneer de pagina geen foto en geen bijlagen heeft", async () => {
    mocks.pageFindUnique.mockResolvedValue({
      titleNl: "Sportdag",
      slug: "sportdag",
      imageKey: null,
      assets: [],
      editorRoles: [],
    });
    const form = new FormData();
    form.set("id", "page_1");

    await deletePageAction(SAVE_IDLE, form);

    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("laat de pagina staan wanneer de gebruiker ze niet mag bewerken", async () => {
    // En raakt dus ook niets in de bucket aan: een geweigerde verwijdering mag
    // geen bestanden meenemen.
    mocks.canEditPageContent.mockReturnValue(false);
    mocks.pageFindUnique.mockResolvedValue({
      titleNl: "Sportdag",
      slug: "sportdag",
      imageKey: "images/sport.jpg",
      assets: [],
      editorRoles: [],
    });
    const form = new FormData();
    form.set("id", "page_1");

    await expect(deletePageAction(SAVE_IDLE, form)).rejects.toThrow("FORBIDDEN");
    expect(mocks.pageDelete).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("verwijdert het bestand van een verwijderde bijlage", async () => {
    mocks.assetFindUnique.mockResolvedValue({
      pageId: "page_1",
      storageKey: "docs/reglement.pdf",
      labelNl: "Reglement",
      page: { titleNl: "Sportdag" },
    });
    const form = new FormData();
    form.set("id", "asset_1");

    await deletePageAssetAction(form);

    expect(mocks.assetDelete).toHaveBeenCalledWith({ where: { id: "asset_1" } });
    expect(mocks.deleteObject).toHaveBeenCalledWith("docs/reglement.pdf");
  });

  it("blijft slagen wanneer storage de verwijdering weigert", async () => {
    // De rij is al weg; een bucket die even niet meewerkt mag daar geen
    // serverfout van maken, hoogstens een wees achterlaten.
    mocks.pageFindUnique.mockResolvedValue({
      titleNl: "Sportdag",
      slug: "sportdag",
      imageKey: "images/sport.jpg",
      assets: [],
      editorRoles: [],
    });
    mocks.deleteObject.mockRejectedValue(new Error("S3 down"));
    const form = new FormData();
    form.set("id", "page_1");

    await expect(deletePageAction(SAVE_IDLE, form)).resolves.toMatchObject({
      status: "success",
    });
  });
});
