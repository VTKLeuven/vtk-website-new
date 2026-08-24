import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAnyPermission: vi.fn(),
  linkUpdate: vi.fn(),
  linkFindUnique: vi.fn(),
  linkFindFirst: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@vtk/db", () => ({
  HEADER_TABS: [],
  prisma: {
    headerTabLink: {
      update: mocks.linkUpdate,
      findUnique: mocks.linkFindUnique,
      findFirst: mocks.linkFindFirst,
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
  moveHeaderTabLinkToTabAction,
  reorderHeaderTabLinksAction,
} from "@/app/actions/pages";

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
