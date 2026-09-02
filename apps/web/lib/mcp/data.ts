import "server-only";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { z } from "zod";
import { logSystemAudit } from "@/lib/audit";
import { eventSlugBase, uniqueEventSlug } from "@/lib/calendar/slug";

const MAX_LIST_RESULTS = 200;

export class McpInputError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "McpInputError";
  }
}

function actorName(): string {
  return process.env.MCP_CLIENT_NAME?.trim().slice(0, 180) || "AI-agent via MCP";
}

function nullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function mediaUrl(key: string | null): string | null {
  if (!key) return null;
  const base = (process.env.BETTER_AUTH_URL ?? process.env.VTK_MAIN_URL ?? "http://localhost:3000")
    .replace(/\/+$/, "");
  const path = key.split("/").map(encodeURIComponent).join("/");
  return `${base}/api/media/${path}`;
}

function toIso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

function revalidateCalendarContent(): void {
  revalidatePath("/");
  revalidatePath("/en");
  revalidatePath("/kalender");
  revalidatePath("/en/kalender");
  revalidatePath("/kalender/[slugOrId]", "page");
  revalidatePath("/admin/kalender");
  revalidatePath("/en/admin/kalender");
  revalidatePath("/admin/kalender/categorieen");
  revalidatePath("/en/admin/kalender/categorieen");
}

const listLimit = z.number().int().min(1).max(MAX_LIST_RESULTS).default(100);
const listOffset = z.number().int().min(0).max(100_000).default(0);
const isoMoment = z.string().datetime({ offset: true });

const listEventsInput = z.object({
  from: isoMoment.optional(),
  to: isoMoment.optional(),
  publication: z.enum(["all", "published", "draft"]).default("all"),
  groupCode: z.string().trim().min(1).max(80).optional(),
  categorySlug: z.string().trim().min(1).max(60).optional(),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: listLimit,
  offset: listOffset,
}).strict();

export type ListEventsInput = z.input<typeof listEventsInput>;

export async function listCalendarEvents(raw: ListEventsInput) {
  const input = listEventsInput.parse(raw);
  const where: Prisma.CalendarEventWhereInput = {};

  if (input.from) where.end = { gte: new Date(input.from) };
  if (input.to) where.start = { lte: new Date(input.to) };
  if (input.publication === "published") where.publishedAt = { not: null };
  if (input.publication === "draft") where.publishedAt = null;
  if (input.groupCode) where.group = { code: input.groupCode };
  if (input.categorySlug) {
    where.categories = { some: { category: { slug: input.categorySlug } } };
  }

  const rows = await prisma.calendarEvent.findMany({
    where,
    orderBy: [{ start: input.order }, { id: input.order }],
    take: input.limit,
    skip: input.offset,
    select: {
      id: true,
      titleNl: true,
      titleEn: true,
      descriptionNl: true,
      descriptionEn: true,
      location: true,
      start: true,
      end: true,
      allDay: true,
      url: true,
      imageKey: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      group: { select: { code: true, slug: true, nameNl: true, nameEn: true } },
      categories: {
        orderBy: { category: { order: "asc" } },
        select: {
          category: {
            select: {
              slug: true,
              nameNl: true,
              nameEn: true,
              colour: true,
              audience: true,
            },
          },
        },
      },
    },
  });

  return {
    items: rows.map((row) => ({
      ...row,
      start: row.start.toISOString(),
      end: row.end.toISOString(),
      imageUrl: mediaUrl(row.imageKey),
      imageKey: undefined,
      publishedAt: toIso(row.publishedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      categories: row.categories.map(({ category }) => category),
    })),
    limit: input.limit,
    offset: input.offset,
    hasMore: rows.length === input.limit,
  };
}

const idInput = z.object({ id: z.string().trim().min(1).max(100) }).strict();

export async function getCalendarEvent(raw: { id: string }) {
  const { id } = idInput.parse(raw);
  const row = await prisma.calendarEvent.findUnique({
    where: { id },
    select: {
      id: true,
      titleNl: true,
      titleEn: true,
      descriptionNl: true,
      descriptionEn: true,
      location: true,
      start: true,
      end: true,
      allDay: true,
      url: true,
      imageKey: true,
      publishedAt: true,
      createdAt: true,
      updatedAt: true,
      group: { select: { code: true, slug: true, nameNl: true, nameEn: true } },
      categories: {
        orderBy: { category: { order: "asc" } },
        select: { category: true },
      },
    },
  });
  if (!row) throw new McpInputError("EVENT_NOT_FOUND", `Evenement ${id} bestaat niet.`);

  return {
    item: {
      ...row,
      start: row.start.toISOString(),
      end: row.end.toISOString(),
      imageUrl: mediaUrl(row.imageKey),
      imageKey: undefined,
      publishedAt: toIso(row.publishedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      categories: row.categories.map(({ category }) => category),
    },
  };
}

export async function listCalendarCategories() {
  const rows = await prisma.calendarCategory.findMany({
    orderBy: [{ order: "asc" }, { nameNl: "asc" }],
    select: {
      id: true,
      slug: true,
      nameNl: true,
      nameEn: true,
      descriptionNl: true,
      descriptionEn: true,
      colour: true,
      order: true,
      audience: true,
      showOnCalendarPage: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { events: true } },
    },
  });

  return {
    items: rows.map(({ _count, ...row }) => ({
      ...row,
      eventCount: _count.events,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

const categorySlugInput = z.object({ slug: z.string().trim().min(1).max(60) }).strict();

export async function getCalendarCategory(raw: { slug: string }) {
  const { slug } = categorySlugInput.parse(raw);
  const row = await prisma.calendarCategory.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      nameNl: true,
      nameEn: true,
      descriptionNl: true,
      descriptionEn: true,
      colour: true,
      order: true,
      audience: true,
      showOnCalendarPage: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { events: true } },
    },
  });
  if (!row) throw new McpInputError("CATEGORY_NOT_FOUND", `Categorie ${slug} bestaat niet.`);
  const { _count, ...category } = row;
  return {
    item: {
      ...category,
      eventCount: _count.events,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    },
  };
}

export async function listCalendarGroups() {
  const rows = await prisma.group.findMany({
    orderBy: [{ active: "desc" }, { nameNl: "asc" }],
    select: {
      id: true,
      code: true,
      slug: true,
      nameNl: true,
      nameEn: true,
      descriptionNl: true,
      descriptionEn: true,
      type: true,
      website: true,
      active: true,
    },
  });
  return { items: rows };
}

const pageListInput = z.object({
  publication: z.enum(["all", "published", "draft"]).default("all"),
  headerTabSlug: z.string().trim().min(1).max(80).optional(),
  limit: listLimit,
  offset: listOffset,
}).strict();

export type ListPagesInput = z.input<typeof pageListInput>;

export async function listPages(raw: ListPagesInput) {
  const input = pageListInput.parse(raw);
  const where: Prisma.PageWhereInput = {};
  if (input.publication === "published") where.publishedAt = { not: null };
  if (input.publication === "draft") where.publishedAt = null;
  if (input.headerTabSlug) where.headerTab = { slug: input.headerTabSlug };

  const rows = await prisma.page.findMany({
    where,
    orderBy: [{ headerTab: { order: "asc" } }, { order: "asc" }, { titleNl: "asc" }],
    take: input.limit,
    skip: input.offset,
    select: {
      id: true,
      slug: true,
      titleNl: true,
      titleEn: true,
      excerptNl: true,
      excerptEn: true,
      visibleInHeader: true,
      visibleOnCategoryPage: true,
      imageKey: true,
      publishedAt: true,
      contentEditedAt: true,
      updatedAt: true,
      headerTab: { select: { code: true, slug: true, labelNl: true, labelEn: true } },
    },
  });

  return {
    items: rows.map((row) => ({
      ...row,
      imageUrl: mediaUrl(row.imageKey),
      imageKey: undefined,
      publishedAt: toIso(row.publishedAt),
      contentEditedAt: toIso(row.contentEditedAt),
      updatedAt: row.updatedAt.toISOString(),
    })),
    limit: input.limit,
    offset: input.offset,
    hasMore: rows.length === input.limit,
  };
}

const pageSlugInput = z.object({ slug: z.string().trim().min(1).max(160) }).strict();

export async function getPage(raw: { slug: string }) {
  const { slug } = pageSlugInput.parse(raw);
  const row = await prisma.page.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      titleNl: true,
      titleEn: true,
      contentJsonNl: true,
      contentJsonEn: true,
      contentMdNl: true,
      contentMdEn: true,
      excerptNl: true,
      excerptEn: true,
      visibleInHeader: true,
      visibleOnCategoryPage: true,
      imageKey: true,
      ctaLabelNl: true,
      ctaLabelEn: true,
      ctaUrl: true,
      needsYearlyEdit: true,
      contentEditedAt: true,
      publishedAt: true,
      order: true,
      createdAt: true,
      updatedAt: true,
      headerTab: {
        select: { id: true, code: true, slug: true, labelNl: true, labelEn: true },
      },
      assets: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          storageKey: true,
          kind: true,
          labelNl: true,
          labelEn: true,
          sizeBytes: true,
          mimeType: true,
          order: true,
        },
      },
    },
  });
  if (!row) throw new McpInputError("PAGE_NOT_FOUND", `Pagina ${slug} bestaat niet.`);

  return {
    item: {
      ...row,
      imageUrl: mediaUrl(row.imageKey),
      imageKey: undefined,
      contentEditedAt: toIso(row.contentEditedAt),
      publishedAt: toIso(row.publishedAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      assets: row.assets.map(({ storageKey, ...asset }) => ({
        ...asset,
        url: mediaUrl(storageKey),
      })),
    },
  };
}

export async function listNavigation() {
  const rows = await prisma.headerTab.findMany({
    orderBy: { order: "asc" },
    select: {
      id: true,
      code: true,
      slug: true,
      labelNl: true,
      labelEn: true,
      order: true,
      visible: true,
      visibleNl: true,
      visibleEn: true,
      imageKey: true,
      externalUrl: true,
      introNl: true,
      introEn: true,
      ctaLabelNl: true,
      ctaLabelEn: true,
      ctaUrl: true,
      pages: {
        orderBy: [{ order: "asc" }, { titleNl: "asc" }],
        select: {
          id: true,
          slug: true,
          titleNl: true,
          titleEn: true,
          visibleInHeader: true,
          visibleOnCategoryPage: true,
          publishedAt: true,
          order: true,
        },
      },
      links: { orderBy: { order: "asc" } },
    },
  });

  return {
    items: rows.map((row) => ({
      ...row,
      imageUrl: mediaUrl(row.imageKey),
      imageKey: undefined,
      pages: row.pages.map((page) => ({ ...page, publishedAt: toIso(page.publishedAt) })),
    })),
  };
}

export async function listPartners() {
  const rows = await prisma.partner.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      logoKey: true,
      url: true,
      order: true,
      active: true,
      createdAt: true,
    },
  });
  return {
    items: rows.map(({ logoKey, ...row }) => ({
      ...row,
      logoUrl: mediaUrl(logoKey),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export async function listAnnouncements() {
  const rows = await prisma.announcement.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      titleNl: true,
      titleEn: true,
      bodyNl: true,
      bodyEn: true,
      ctaLabelNl: true,
      ctaLabelEn: true,
      ctaUrl: true,
      startsAt: true,
      endsAt: true,
      active: true,
      scope: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  return {
    items: rows.map((row) => ({
      ...row,
      startsAt: toIso(row.startsAt),
      endsAt: toIso(row.endsAt),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    })),
  };
}

function isSafeEventUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const createEventInput = z.object({
  titleNl: z.string().trim().min(1).max(200),
  titleEn: z.string().trim().max(200).optional().nullable(),
  descriptionNl: z.string().trim().max(20_000).optional().nullable(),
  descriptionEn: z.string().trim().max(20_000).optional().nullable(),
  location: z.string().trim().max(300).optional().nullable(),
  groupCode: z.string().trim().min(1).max(80),
  start: isoMoment,
  end: isoMoment,
  allDay: z.boolean().default(false),
  url: z.string().trim().max(2048).refine(isSafeEventUrl, "Ongeldige event-URL").optional().nullable(),
  categorySlugs: z.array(z.string().trim().min(1).max(60)).max(20).default([]),
  publish: z.boolean().default(false),
}).strict();

export type CreateCalendarEventInput = z.input<typeof createEventInput>;

export async function createCalendarEvent(raw: CreateCalendarEventInput) {
  const input = createEventInput.parse(raw);
  const start = new Date(input.start);
  const end = new Date(input.end);
  if (end < start) {
    throw new McpInputError("END_BEFORE_START", "Het einde mag niet vóór het begin liggen.");
  }

  const group = await prisma.group.findUnique({
    where: { code: input.groupCode },
    select: { id: true, code: true, active: true },
  });
  if (!group) {
    throw new McpInputError("GROUP_NOT_FOUND", `Groep ${input.groupCode} bestaat niet.`);
  }
  if (!group.active) {
    throw new McpInputError("GROUP_INACTIVE", `Groep ${input.groupCode} is niet actief.`);
  }

  const categorySlugs = [...new Set(input.categorySlugs)];
  const categories = categorySlugs.length
    ? await prisma.calendarCategory.findMany({
        where: { slug: { in: categorySlugs } },
        select: { id: true, slug: true },
      })
    : [];
  if (categories.length !== categorySlugs.length) {
    const found = new Set(categories.map((category) => category.slug));
    const missing = categorySlugs.filter((slug) => !found.has(slug));
    throw new McpInputError(
      "CATEGORY_NOT_FOUND",
      `Onbekende categorie${missing.length === 1 ? "" : "ën"}: ${missing.join(", ")}.`,
    );
  }

  // De URL-naam wordt hier afgeleid en is niet op te geven: een agent hoort geen
  // publieke adressen te kiezen, en de teller vangt een tweede editie in hetzelfde
  // jaar op zonder dat de create op een unieke sleutel botst.
  const slug = await uniqueEventSlug(eventSlugBase(input.titleNl, start));

  const row = await prisma.calendarEvent.create({
    data: {
      slug,
      titleNl: input.titleNl,
      titleEn: nullIfEmpty(input.titleEn),
      descriptionNl: nullIfEmpty(input.descriptionNl),
      descriptionEn: nullIfEmpty(input.descriptionEn),
      location: nullIfEmpty(input.location),
      groupId: group.id,
      start,
      end,
      allDay: input.allDay,
      url: nullIfEmpty(input.url),
      publishedAt: input.publish ? new Date() : null,
      createdById: null,
      categories: {
        create: categories.map((category) => ({ categoryId: category.id })),
      },
    },
    select: {
      id: true,
      slug: true,
      titleNl: true,
      start: true,
      end: true,
      publishedAt: true,
      group: { select: { code: true, nameNl: true } },
      categories: { select: { category: { select: { slug: true, nameNl: true } } } },
    },
  });

  await logSystemAudit(
    {
      action: "create",
      entity: "calendarEvent",
      entityId: row.id,
      target: row.titleNl,
      summary: input.publish ? "aangemaakt en gepubliceerd via MCP" : "aangemaakt als concept via MCP",
    },
    actorName(),
  );
  revalidateCalendarContent();

  return {
    created: {
      ...row,
      start: row.start.toISOString(),
      end: row.end.toISOString(),
      publishedAt: toIso(row.publishedAt),
      categories: row.categories.map(({ category }) => category),
    },
  };
}

const createCategoryInput = z.object({
  slug: z.string().trim().min(1).max(60).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  nameNl: z.string().trim().min(1).max(60),
  nameEn: z.string().trim().min(1).max(60),
  descriptionNl: z.string().trim().max(10_000).optional().nullable(),
  descriptionEn: z.string().trim().max(10_000).optional().nullable(),
  colour: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/).default("#5C667F"),
  order: z.number().int().min(0).max(999).default(0),
  showOnCalendarPage: z.boolean().default(true),
}).strict();

export type CreateCalendarCategoryInput = z.input<typeof createCategoryInput>;

export async function createCalendarCategory(raw: CreateCalendarCategoryInput) {
  const input = createCategoryInput.parse(raw);
  const existing = await prisma.calendarCategory.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (existing) {
    throw new McpInputError("SLUG_TAKEN", `Categorie ${input.slug} bestaat al.`);
  }

  let row;
  try {
    row = await prisma.calendarCategory.create({
      data: {
        slug: input.slug,
        nameNl: input.nameNl,
        nameEn: input.nameEn,
        descriptionNl: nullIfEmpty(input.descriptionNl),
        descriptionEn: nullIfEmpty(input.descriptionEn),
        colour: input.colour.toUpperCase(),
        order: input.order,
        showOnCalendarPage: input.showOnCalendarPage,
        audience: null,
      },
      select: {
        id: true,
        slug: true,
        nameNl: true,
        nameEn: true,
        descriptionNl: true,
        descriptionEn: true,
        colour: true,
        order: true,
        showOnCalendarPage: true,
        audience: true,
        createdAt: true,
      },
    });
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      throw new McpInputError("SLUG_TAKEN", `Categorie ${input.slug} bestaat al.`);
    }
    throw error;
  }

  await logSystemAudit(
    {
      action: "create",
      entity: "calendarCategory",
      entityId: row.id,
      target: row.nameNl,
      summary: "gewone kalendercategorie aangemaakt via MCP",
    },
    actorName(),
  );
  revalidateCalendarContent();

  return { created: { ...row, createdAt: row.createdAt.toISOString() } };
}
