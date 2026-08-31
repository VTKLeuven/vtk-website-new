import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  headerFindMany: vi.fn(),
  headerFindUnique: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  HEADER_TABS: [],
  prisma: {
    headerTab: {
      findMany: mocks.headerFindMany,
      findUnique: mocks.headerFindUnique,
    },
  },
}));

import { getVisibleHeaderTabsForNav } from "@/lib/headerTabs";
import { loadHeaderTabWithPages } from "@/lib/pageQueries";

describe("onafhankelijke paginazichtbaarheid", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headerFindMany.mockResolvedValue([]);
    mocks.headerFindUnique.mockResolvedValue(null);
  });

  it("filtert de hover-dropdown op visibleInHeader", async () => {
    await getVisibleHeaderTabsForNav("nl");

    expect(mocks.headerFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          pages: expect.objectContaining({
            where: { visibleInHeader: true, publishedAt: { not: null } },
          }),
        }),
      }),
    );
  });

  it("filtert de categoriepagina op visibleOnCategoryPage", async () => {
    await loadHeaderTabWithPages("info");

    expect(mocks.headerFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        include: expect.objectContaining({
          pages: expect.objectContaining({
            where: { visibleOnCategoryPage: true, publishedAt: { not: null } },
          }),
        }),
      }),
    );
  });
});
