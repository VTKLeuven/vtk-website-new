import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eventCreate: vi.fn(),
  eventFindMany: vi.fn(),
  eventFindUnique: vi.fn(),
  categoryCreate: vi.fn(),
  categoryFindMany: vi.fn(),
  categoryFindUnique: vi.fn(),
  groupFindUnique: vi.fn(),
  groupFindMany: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@vtk/db", () => ({
  prisma: {
    calendarEvent: {
      create: mocks.eventCreate,
      findMany: mocks.eventFindMany,
      findUnique: mocks.eventFindUnique,
    },
    calendarCategory: {
      create: mocks.categoryCreate,
      findMany: mocks.categoryFindMany,
      findUnique: mocks.categoryFindUnique,
    },
    group: { findUnique: mocks.groupFindUnique, findMany: mocks.groupFindMany },
    page: { findMany: vi.fn(), findUnique: vi.fn() },
    headerTab: { findMany: vi.fn() },
    partner: { findMany: vi.fn() },
    announcement: { findMany: vi.fn() },
  },
}));

vi.mock("@/lib/audit", () => ({ logSystemAudit: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import {
  createCalendarCategory,
  createCalendarEvent,
  McpInputError,
} from "@/lib/mcp/data";

describe("MCP create-only datalaag", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.groupFindUnique.mockResolvedValue({ id: "group-1", code: "CULTUUR", active: true });
    mocks.categoryFindMany.mockResolvedValue([{ id: "cat-1", slug: "cultuur" }]);
    mocks.categoryFindUnique.mockResolvedValue(null);
    mocks.eventCreate.mockResolvedValue({
      id: "event-1",
      titleNl: "Testevent",
      start: new Date("2026-09-01T18:00:00.000Z"),
      end: new Date("2026-09-01T20:00:00.000Z"),
      publishedAt: null,
      group: { code: "CULTUUR", nameNl: "Cultuur" },
      categories: [{ category: { slug: "cultuur", nameNl: "Cultuur" } }],
    });
    mocks.categoryCreate.mockResolvedValue({
      id: "cat-new",
      slug: "workshops",
      nameNl: "Workshops",
      nameEn: "Workshops",
      descriptionNl: null,
      descriptionEn: null,
      colour: "#AABBCC",
      order: 0,
      showOnCalendarPage: true,
      audience: null,
      createdAt: new Date("2026-08-23T10:00:00.000Z"),
    });
  });

  it("maakt een event standaard als concept en gebruikt alleen bestaande referenties", async () => {
    const result = await createCalendarEvent({
      titleNl: "Testevent",
      groupCode: "CULTUUR",
      start: "2026-09-01T20:00:00+02:00",
      end: "2026-09-01T22:00:00+02:00",
      categorySlugs: ["cultuur"],
    });

    expect(mocks.eventCreate).toHaveBeenCalledOnce();
    expect(mocks.eventCreate.mock.calls[0][0].data).toMatchObject({
      groupId: "group-1",
      publishedAt: null,
      createdById: null,
      categories: { create: [{ categoryId: "cat-1" }] },
    });
    expect(result.created.id).toBe("event-1");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create", entity: "calendarEvent" }),
      expect.any(String),
    );
  });

  it("publiceert alleen wanneer dat expliciet gevraagd wordt", async () => {
    mocks.eventCreate.mockImplementation(async ({ data }) => ({
      id: "event-2",
      titleNl: data.titleNl,
      start: data.start,
      end: data.end,
      publishedAt: data.publishedAt,
      group: { code: "CULTUUR", nameNl: "Cultuur" },
      categories: [],
    }));
    const result = await createCalendarEvent({
      titleNl: "Live event",
      groupCode: "CULTUUR",
      start: "2026-09-01T20:00:00+02:00",
      end: "2026-09-01T22:00:00+02:00",
      publish: true,
    });
    expect(result.created.publishedAt).not.toBeNull();
  });

  it("schrijft niets bij een onbekende categorie of inactieve groep", async () => {
    mocks.categoryFindMany.mockResolvedValue([]);
    await expect(
      createCalendarEvent({
        titleNl: "Event",
        groupCode: "CULTUUR",
        start: "2026-09-01T20:00:00+02:00",
        end: "2026-09-01T22:00:00+02:00",
        categorySlugs: ["bestaat-niet"],
      }),
    ).rejects.toMatchObject({ code: "CATEGORY_NOT_FOUND" } satisfies Partial<McpInputError>);
    expect(mocks.eventCreate).not.toHaveBeenCalled();

    mocks.groupFindUnique.mockResolvedValue({ id: "group-1", code: "OUD", active: false });
    await expect(
      createCalendarEvent({
        titleNl: "Event",
        groupCode: "OUD",
        start: "2026-09-01T20:00:00+02:00",
        end: "2026-09-01T22:00:00+02:00",
      }),
    ).rejects.toMatchObject({ code: "GROUP_INACTIVE" } satisfies Partial<McpInputError>);
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("weigert een eindmoment vóór het begin", async () => {
    await expect(
      createCalendarEvent({
        titleNl: "Tijdreiziger",
        groupCode: "CULTUUR",
        start: "2026-09-01T22:00:00+02:00",
        end: "2026-09-01T20:00:00+02:00",
      }),
    ).rejects.toMatchObject({ code: "END_BEFORE_START" } satisfies Partial<McpInputError>);
    expect(mocks.groupFindUnique).not.toHaveBeenCalled();
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("maakt alleen een gewone categorie aan en normaliseert de kleur", async () => {
    const result = await createCalendarCategory({
      slug: "workshops",
      nameNl: "Workshops",
      nameEn: "Workshops",
      colour: "#aabbcc",
    });
    expect(mocks.categoryCreate.mock.calls[0][0].data).toMatchObject({
      audience: null,
      colour: "#AABBCC",
      showOnCalendarPage: true,
    });
    expect(result.created.slug).toBe("workshops");
    expect(mocks.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "create", entity: "calendarCategory" }),
      expect.any(String),
    );
  });

  it("weigert een bestaande categorie zonder create-call", async () => {
    mocks.categoryFindUnique.mockResolvedValue({ id: "existing" });
    await expect(
      createCalendarCategory({ slug: "workshops", nameNl: "Workshops", nameEn: "Workshops" }),
    ).rejects.toMatchObject({ code: "SLUG_TAKEN" } satisfies Partial<McpInputError>);
    expect(mocks.categoryCreate).not.toHaveBeenCalled();
  });
});
