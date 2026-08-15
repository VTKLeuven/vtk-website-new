import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePermission: vi.fn(),
  updateMany: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@vtk/db", () => ({
  HEADER_TABS: [],
  prisma: { page: { updateMany: mocks.updateMany } },
}));
vi.mock("@vtk/storage", () => ({ deleteObject: vi.fn() }));
vi.mock("@/lib/session", () => ({
  requireAnyPermission: vi.fn(),
  requirePermission: mocks.requirePermission,
  requireSession: vi.fn(),
}));
vi.mock("@/lib/pageAccess", () => ({
  canEditPageContent: vi.fn(),
  canPublishPages: vi.fn(),
}));

import { unlinkPageFromTabAction } from "@/app/actions/pages";
import { SAVE_IDLE } from "@/lib/saveState";

describe("unlinkPageFromTabAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("maakt alleen de categorie-koppeling los en verwijdert de pagina niet", async () => {
    const form = new FormData();
    form.set("id", "page_1");

    const result = await unlinkPageFromTabAction(SAVE_IDLE, form);

    expect(mocks.requirePermission).toHaveBeenCalledWith("pages.manage");
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "page_1", headerTabId: { not: null } },
      data: { headerTabId: null, order: 0 },
    });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/", "layout");
    expect(result.status).toBe("success");
  });

  it("wijzigt niets voor een ontbrekende pagina of koppeling", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const form = new FormData();
    form.set("id", "page_1");

    const result = await unlinkPageFromTabAction(SAVE_IDLE, form);

    expect(result).toMatchObject({ status: "error", code: "INVALID_INPUT" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
