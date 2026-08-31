import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAnyPermission: vi.fn(),
  pageUpdate: vi.fn(),
  pageFindFirst: vi.fn(),
  linkUpdate: vi.fn(),
  linkDelete: vi.fn(),
  linkFindUnique: vi.fn(),
  linkFindFirst: vi.fn(),
  linkCreate: vi.fn(),
  linkDeleteMany: vi.fn(),
  tabCreate: vi.fn(),
  tabUpdate: vi.fn(),
  tabFindUnique: vi.fn(),
  tabFindFirst: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
  logAudit: vi.fn(),
  deleteObject: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@vtk/db", () => ({
  HEADER_TABS: [],
  prisma: {
    page: {
      update: mocks.pageUpdate,
      findFirst: mocks.pageFindFirst,
    },
    headerTabLink: {
      update: mocks.linkUpdate,
      delete: mocks.linkDelete,
      findUnique: mocks.linkFindUnique,
      findFirst: mocks.linkFindFirst,
      create: mocks.linkCreate,
      deleteMany: mocks.linkDeleteMany,
    },
    headerTab: {
      create: mocks.tabCreate,
      update: mocks.tabUpdate,
      findUnique: mocks.tabFindUnique,
      findFirst: mocks.tabFindFirst,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit, describeChanges: () => null }));
vi.mock("@vtk/storage", () => ({ deleteObject: mocks.deleteObject }));
vi.mock("@/lib/session", () => ({
  requireAnyPermission: mocks.requireAnyPermission,
  requirePermission: vi.fn(),
  requireSession: vi.fn(),
}));
vi.mock("@/lib/pageAccess", () => ({
  canEditPageContent: vi.fn(),
  canPublishPages: vi.fn(),
}));

import {
  addHeaderTabDirectAction,
  deleteHeaderTabLinkAction,
  moveHeaderTabLinkToTabAction,
  reorderHeaderTabLinksAction,
  reorderTabItemsAction,
  saveHeaderTabAction,
  saveHeaderTabLinkAction,
} from "@/app/actions/pages";
import { SAVE_IDLE } from "@/lib/saveState";

describe("header link images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bewaart een kaartfoto voor zowel vaste routes als externe links", async () => {
    mocks.linkFindUnique.mockResolvedValue({
      id: "link_1",
      tabId: "tab_1",
      labelNl: "Piano",
      labelEn: "Piano",
      url: "/piano",
      order: 2,
      imageKey: "images/oud.jpg",
      tab: { labelNl: "Info" },
    });
    const form = new FormData();
    form.set("id", "link_1");
    form.set("labelNl", "Piano reserveren");
    form.set("labelEn", "Reserve the piano");
    form.set("url", "/piano");
    form.set("imageKey", "images/nieuw.jpg");

    const result = await saveHeaderTabLinkAction(SAVE_IDLE, form);

    expect(result.status).toBe("success");
    expect(mocks.linkUpdate).toHaveBeenCalledWith({
      where: { id: "link_1" },
      data: {
        labelNl: "Piano reserveren",
        labelEn: "Reserve the piano",
        url: "/piano",
        imageKey: "images/nieuw.jpg",
      },
    });
    expect(mocks.deleteObject).toHaveBeenCalledWith("images/oud.jpg");
  });

  it("ruimt de kaartfoto op wanneer het menu-item verwijderd wordt", async () => {
    mocks.linkFindUnique.mockResolvedValue({
      id: "link_1",
      tabId: "tab_1",
      labelNl: "Piano",
      url: "/piano",
      imageKey: "images/piano.jpg",
      tab: { labelNl: "Info" },
    });

    const result = await deleteHeaderTabLinkAction("link_1");

    expect(result.status).toBe("success");
    expect(mocks.linkDelete).toHaveBeenCalledWith({ where: { id: "link_1" } });
    expect(mocks.deleteObject).toHaveBeenCalledWith("images/piano.jpg");
  });

  it("behoudt de kaartfoto wanneer de bovenliggende categorie opgeslagen wordt", async () => {
    mocks.tabFindUnique.mockResolvedValue({
      id: "tab_1",
      code: "INFO",
      slug: "info",
      labelNl: "Info",
      labelEn: "Info",
      visible: true,
      visibleNl: true,
      visibleEn: true,
      externalUrl: null,
      introNl: null,
      introEn: null,
      ctaLabelNl: null,
      ctaLabelEn: null,
      ctaUrl: null,
      links: [
        {
          id: "link_1",
          labelNl: "Piano",
          url: "/piano",
          imageKey: "images/piano.jpg",
        },
      ],
    });
    mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );
    const form = new FormData();
    form.set("id", "tab_1");
    form.set("code", "INFO");
    form.set("slug", "info");
    form.set("labelNl", "Info");
    form.set("labelEn", "Info");
    form.set("visibleNl", "on");
    form.set("visibleEn", "on");
    form.set("linkCount", "1");
    form.set("link-0-id", "link_1");
    form.set("link-0-labelNl", "Piano");
    form.set("link-0-labelEn", "Piano");
    form.set("link-0-url", "/piano");

    const result = await saveHeaderTabAction(SAVE_IDLE, form);

    expect(result.status).toBe("success");
    expect(mocks.linkCreate).toHaveBeenCalledWith({
      data: {
        id: "link_1",
        tabId: "tab_1",
        labelNl: "Piano",
        labelEn: "Piano",
        url: "/piano",
        order: 0,
        imageKey: "images/piano.jpg",
      },
    });
    expect(mocks.deleteObject).not.toHaveBeenCalled();
  });
});

describe("addHeaderTabDirectAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maakt een top-level header tab aan met directe link naar /p/shiften", async () => {
    mocks.tabFindUnique.mockResolvedValue(null);
    mocks.tabFindFirst.mockResolvedValue({ order: 3 });
    mocks.tabCreate.mockResolvedValue({ id: "tab_new" });

    const res = await addHeaderTabDirectAction({
      labelNl: "Shiften",
      labelEn: "Shifts",
      url: "/p/shiften",
    });

    expect(res.status).toBe("success");
    expect(mocks.requireAnyPermission).toHaveBeenCalledWith(["pages.manage", "header.manage"]);
    expect(mocks.tabCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        labelNl: "Shiften",
        labelEn: "Shifts",
        externalUrl: "/p/shiften",
        slug: "shiften",
        order: 4,
      }),
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("reorderTabItemsAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (promises: Promise<unknown>[]) =>
      Promise.all(promises),
    );
  });

  it("werkt de volgorde van gemengde pagina's en vaste links bij", async () => {
    await reorderTabItemsAction("tab_1", [
      { id: "link_1", kind: "link" },
      { id: "page_1", kind: "page" },
      { id: "link_2", kind: "link" },
    ]);

    expect(mocks.requireAnyPermission).toHaveBeenCalledWith(["pages.manage", "header.manage"]);
    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.linkUpdate).toHaveBeenCalledWith({
      where: { id: "link_1" },
      data: { order: 0 },
    });
    expect(mocks.pageUpdate).toHaveBeenCalledWith({
      where: { id: "page_1" },
      data: { order: 1 },
    });
    expect(mocks.linkUpdate).toHaveBeenCalledWith({
      where: { id: "link_2" },
      data: { order: 2 },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("reorderHeaderTabLinksAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (promises: Promise<unknown>[]) =>
      Promise.all(promises),
    );
  });

  it("werkt de volgorde van links in een transactie bij", async () => {
    await reorderHeaderTabLinksAction(["link_1", "link_2", "link_3"]);

    expect(mocks.requireAnyPermission).toHaveBeenCalledWith(["pages.manage", "header.manage"]);
    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.linkUpdate).toHaveBeenCalledWith({
      where: { id: "link_1" },
      data: { order: 0 },
    });
    expect(mocks.linkUpdate).toHaveBeenCalledWith({
      where: { id: "link_2" },
      data: { order: 1 },
    });
    expect(mocks.linkUpdate).toHaveBeenCalledWith({
      where: { id: "link_3" },
      data: { order: 2 },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });
});

describe("moveHeaderTabLinkToTabAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("verplaatst een link naar een andere categorie met een nieuw volgnummer", async () => {
    mocks.linkFindUnique
      .mockResolvedValueOnce({
        id: "link_1",
        tabId: "tab_old",
        url: "/praesidium",
        labelNl: "Praesidium",
      })
      .mockResolvedValueOnce(null); // Geen conflict in tab_new
    mocks.linkFindFirst.mockResolvedValueOnce({ order: 4 });

    await moveHeaderTabLinkToTabAction("link_1", "tab_new");

    expect(mocks.requireAnyPermission).toHaveBeenCalledWith(["pages.manage", "header.manage"]);
    expect(mocks.linkUpdate).toHaveBeenCalledWith({
      where: { id: "link_1" },
      data: { tabId: "tab_new", order: 5 },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("doet niets als de link al in die categorie zit", async () => {
    mocks.linkFindUnique.mockResolvedValueOnce({
      id: "link_1",
      tabId: "tab_same",
      url: "/praesidium",
      labelNl: "Praesidium",
    });

    await moveHeaderTabLinkToTabAction("link_1", "tab_same");

    expect(mocks.linkUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
