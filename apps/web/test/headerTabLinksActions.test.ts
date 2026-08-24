import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAnyPermission: vi.fn(),
  pageUpdate: vi.fn(),
  pageFindFirst: vi.fn(),
  linkUpdate: vi.fn(),
  linkFindUnique: vi.fn(),
  linkFindFirst: vi.fn(),
  tabCreate: vi.fn(),
  tabFindUnique: vi.fn(),
  tabFindFirst: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
  logAudit: vi.fn(),
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
      findUnique: mocks.linkFindUnique,
      findFirst: mocks.linkFindFirst,
    },
    headerTab: {
      create: mocks.tabCreate,
      findUnique: mocks.tabFindUnique,
      findFirst: mocks.tabFindFirst,
    },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/audit", () => ({ logAudit: mocks.logAudit, describeChanges: () => null }));
vi.mock("@vtk/storage", () => ({ deleteObject: vi.fn() }));
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
  moveHeaderTabLinkToTabAction,
  reorderHeaderTabLinksAction,
  reorderTabItemsAction,
} from "@/app/actions/pages";

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
    mocks.transaction.mockImplementation(async (promises: Promise<unknown>[]) => Promise.all(promises));
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
    mocks.transaction.mockImplementation(async (promises: Promise<unknown>[]) => Promise.all(promises));
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
      .mockResolvedValueOnce({ id: "link_1", tabId: "tab_old", url: "/praesidium", labelNl: "Praesidium" })
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
    mocks.linkFindUnique.mockResolvedValueOnce({ id: "link_1", tabId: "tab_same", url: "/praesidium", labelNl: "Praesidium" });

    await moveHeaderTabLinkToTabAction("link_1", "tab_same");

    expect(mocks.linkUpdate).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
