import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  requireSession: vi.fn(),
  canEditPageContent: vi.fn(),
  pageFindUnique: vi.fn(),
  pageUpdate: vi.fn(),
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
    page: { findUnique: mocks.pageFindUnique, update: mocks.pageUpdate, delete: mocks.pageDelete },
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

import {
  deletePageAction,
  deletePageAssetAction,
  savePageAction,
  savePageImageAction,
} from "@/app/actions/pages";
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

describe("kaartfoto beheren vanuit Header", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pageFindUnique.mockResolvedValue({
      publishedAt: new Date("2026-01-01T00:00:00Z"),
      slug: "sportdag",
      headerTabId: "tab_1",
      visibleInHeader: true,
      visibleOnCategoryPage: true,
      titleNl: "Sportdag",
      titleEn: "Sports day",
      excerptNl: null,
      excerptEn: null,
      imageKey: "images/oud.jpg",
      ctaLabelNl: null,
      ctaLabelEn: null,
      ctaUrl: null,
      needsYearlyEdit: false,
      order: 0,
    });
  });

  it("vervangt via de structuuractie de bestaande foto en ruimt de oude op", async () => {
    const form = new FormData();
    form.set("id", "page_1");
    form.set("slug", "sportdag");
    form.set("headerTabId", "tab_1");
    form.set("visibleInHeader", "on");
    form.set("visibleOnCategoryPage", "on");
    form.set("titleNl", "Sportdag");
    form.set("titleEn", "Sports day");
    form.set("published", "on");
    form.set("order", "0");
    form.set("imageKey", "images/nieuw.jpg");

    const result = await savePageAction(SAVE_IDLE, form);

    expect(result.status).toBe("success");
    expect(mocks.requirePermission).toHaveBeenCalledWith("pages.manage");
    expect(mocks.pageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "page_1" },
        data: expect.objectContaining({
          imageKey: "images/nieuw.jpg",
          visibleInHeader: true,
          visibleOnCategoryPage: true,
        }),
      }),
    );
    expect(mocks.deleteObject).toHaveBeenCalledWith("images/oud.jpg");
  });

  it("kan de kaart tonen terwijl de pagina uit de hover-dropdown blijft", async () => {
    const form = new FormData();
    form.set("id", "page_1");
    form.set("slug", "sportdag");
    form.set("headerTabId", "tab_1");
    form.set("visibleOnCategoryPage", "on");
    form.set("titleNl", "Sportdag");
    form.set("titleEn", "Sports day");
    form.set("published", "on");
    form.set("order", "0");

    const result = await savePageAction(SAVE_IDLE, form);

    expect(result.status).toBe("success");
    expect(mocks.pageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          visibleInHeader: false,
          visibleOnCategoryPage: true,
        }),
      }),
    );
  });
});

describe("de foto van een pagina beheren vanuit Pagina's", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSession.mockResolvedValue({
      user: { isSuperAdmin: true },
      permissions: [],
      roleIds: [],
    });
    mocks.canEditPageContent.mockReturnValue(true);
    mocks.pageFindUnique.mockResolvedValue({
      titleNl: "Sportdag",
      imageKey: "images/oud.jpg",
      imageCaptionNl: "De vorige foto",
      imageCaptionEn: null,
      imageFocusX: 0.5,
      imageFocusY: 0.5,
      editorRoles: [],
    });
  });

  it("bewaart de foto van de pagina en ruimt de vorige upload op", async () => {
    const form = new FormData();
    form.set("id", "page_1");
    form.set("imageKey", "images/nieuw.jpg");
    form.set("captionNl", "Sportdag 2026");
    form.set("imageFocusX", "0.2");
    form.set("imageFocusY", "0.8");

    const result = await savePageImageAction(SAVE_IDLE, form);

    expect(result.status).toBe("success");
    expect(mocks.pageUpdate).toHaveBeenCalledWith({
      where: { id: "page_1" },
      data: {
        imageKey: "images/nieuw.jpg",
        imageCaptionNl: "Sportdag 2026",
        imageCaptionEn: null,
        imageFocusX: 0.2,
        imageFocusY: 0.8,
      },
    });
    expect(mocks.deleteObject).toHaveBeenCalledWith("images/oud.jpg");
  });

  it("bewaart een nieuw bijschrift zonder de foto opnieuw te uploaden", async () => {
    // De actie sloeg vroeger niets op zodra de key gelijk bleef. Met een
    // bijschrift en een uitsnede ernaast zou een verlegd punt dan stil verloren
    // gaan, en de foto mag daarbij zeker niet uit de opslag verdwijnen.
    const form = new FormData();
    form.set("id", "page_1");
    form.set("imageKey", "images/oud.jpg");
    form.set("captionNl", "Sportdag 2026");

    const result = await savePageImageAction(SAVE_IDLE, form);

    expect(result.status).toBe("success");
    expect(mocks.pageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          imageKey: "images/oud.jpg",
          imageCaptionNl: "Sportdag 2026",
        }),
      }),
    );
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });

  it("wist het bijschrift en de uitsnede wanneer de foto weggaat", async () => {
    // Anders bleef het bijschrift van de verwijderde foto staan en kwam het
    // terug zodra iemand een nieuwe uploadde.
    const form = new FormData();
    form.set("id", "page_1");
    form.set("imageKey", "");
    form.set("imageKey__cleared", "1");
    form.set("captionNl", "Sportdag 2026");
    form.set("imageFocusX", "0.2");
    form.set("imageFocusY", "0.8");

    const result = await savePageImageAction(SAVE_IDLE, form);

    expect(result.status).toBe("success");
    expect(mocks.pageUpdate).toHaveBeenCalledWith({
      where: { id: "page_1" },
      data: {
        imageKey: null,
        imageCaptionNl: null,
        imageCaptionEn: null,
        imageFocusX: 0.5,
        imageFocusY: 0.5,
      },
    });
    expect(mocks.deleteObject).toHaveBeenCalledWith("images/oud.jpg");
  });

  it("weigert de foto te wijzigen zonder toegang tot deze pagina", async () => {
    mocks.canEditPageContent.mockReturnValue(false);
    const form = new FormData();
    form.set("id", "page_1");
    form.set("imageKey", "images/nieuw.jpg");

    await expect(savePageImageAction(SAVE_IDLE, form)).rejects.toThrow("FORBIDDEN");
    expect(mocks.pageUpdate).not.toHaveBeenCalled();
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});
