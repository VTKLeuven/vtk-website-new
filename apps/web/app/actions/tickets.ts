"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { prisma } from "@vtk/db";
import { z } from "zod";
import { requireSession } from "@/lib/session";
import {
  canCreateTicketEventForGroup,
  requireTicketEventCapability,
} from "@/lib/ticketing/authorization";
import { parseEuroAmount } from "@/lib/ticketing/money";
import { requestTicketRefund } from "@/lib/ticketing/refunds";
import { localDateTimeToUtc } from "@/lib/ticketing/time";

const localeSchema = z.enum(["nl", "en"]);
const roleSchema = z.enum(["OWNER", "MANAGER", "FINANCE", "SCANNER", "REPORTER"]);
const statusSchema = z.enum([
  "DRAFT",
  "PUBLISHED",
  "SALES_PAUSED",
  "SALES_CLOSED",
  "CANCELLED",
  "ARCHIVED",
]);

export type TicketEventFormActionState = {
  status: "idle" | "success" | "error";
  code?: string;
};

const EXPECTED_EVENT_FORM_ERRORS = new Set([
  "GROUP_REQUIRED",
  "FORBIDDEN",
  "INVALID_CALENDAR_EVENT",
  "TITLE_REQUIRED",
  "INVALID_EVENT_DATES",
  "INVALID_SALES_DATES",
  "INVALID_SLUG",
  "SLUG_ALREADY_EXISTS",
  "TICKET_TYPE_REQUIRED_TO_PUBLISH",
  "INVALID_MAXTICKETSPERORDER",
  "INVALID_CAPACITY",
  "INVALID_CONTACTEMAIL",
  "INVALID_TERMSURL",
]);

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

function optionalValue(formData: FormData, key: string): string | null {
  return value(formData, key) || null;
}

function limitedValue(formData: FormData, key: string, maxLength: number): string {
  const raw = value(formData, key);
  if (raw.length > maxLength) throw new Error(`INVALID_${key.toUpperCase()}`);
  return raw;
}

function limitedOptionalValue(formData: FormData, key: string, maxLength: number): string | null {
  return limitedValue(formData, key, maxLength) || null;
}

function emailValue(formData: FormData, key: string): string | null {
  const raw = limitedOptionalValue(formData, key, 320);
  if (!raw) return null;
  return z.string().email().parse(raw.toLowerCase());
}

function urlValue(formData: FormData, key: string): string | null {
  const raw = limitedOptionalValue(formData, key, 2_000);
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error();
    return parsed.toString();
  } catch {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }
}

function dateValue(formData: FormData, key: string, required = false): Date | null {
  const raw = value(formData, key);
  if (!raw && !required) return null;
  if (!raw) throw new Error(`INVALID_${key.toUpperCase()}`);
  try {
    return localDateTimeToUtc(raw);
  } catch {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }
}

function integerValue(formData: FormData, key: string, fallback: number): number {
  const parsed = Number.parseInt(value(formData, key), 10);
  return Number.isSafeInteger(parsed) ? parsed : fallback;
}

function boundedIntegerValue(
  formData: FormData,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const raw = value(formData, key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`INVALID_${key.toUpperCase()}`);
  }
  return parsed;
}

function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function codeFrom(input: string): string {
  return slugify(input).replace(/-/g, "_").toUpperCase().slice(0, 48) || randomBytes(4).toString("hex").toUpperCase();
}

function localePath(locale: "nl" | "en", path: string): string {
  return `${locale === "en" ? "/en" : ""}${path}`;
}

function refreshTicketEvent(locale: "nl" | "en", eventId: string) {
  revalidatePath(localePath(locale, "/admin/tickets"));
  revalidatePath(localePath(locale, `/admin/tickets/${eventId}`));
  revalidatePath(localePath(locale, "/tickets"));
}

export async function submitTicketEventFormAction(
  _previousState: TicketEventFormActionState,
  formData: FormData
): Promise<TicketEventFormActionState> {
  try {
    if (value(formData, "eventId")) {
      await updateTicketEventAction(formData);
      return { status: "success" };
    }
    await createTicketEventAction(formData);
    return { status: "success" };
  } catch (error) {
    unstable_rethrow(error);
    const code = error instanceof Error ? error.message : "";
    if (EXPECTED_EVENT_FORM_ERRORS.has(code) || code.startsWith("INVALID_")) {
      return { status: "error", code };
    }
    console.error("Ticket event form action failed", error);
    throw error;
  }
}

export async function createTicketEventAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const ownerGroupId = value(formData, "ownerGroupId") || value(formData, "groupId");
  if (!ownerGroupId) throw new Error("GROUP_REQUIRED");
  if (!(await canCreateTicketEventForGroup(session.user.id, ownerGroupId, session.user.isSuperAdmin))) {
    throw new Error("FORBIDDEN");
  }

  const calendarEventId = optionalValue(formData, "calendarEventId");
  const calendarEvent = calendarEventId
    ? await prisma.calendarEvent.findUnique({ where: { id: calendarEventId } })
    : null;
  if (calendarEventId && (!calendarEvent || calendarEvent.groupId !== ownerGroupId)) {
    throw new Error("INVALID_CALENDAR_EVENT");
  }

  const titleNl = limitedValue(formData, "titleNl", 200) || calendarEvent?.titleNl || "";
  if (!titleNl) throw new Error("TITLE_REQUIRED");
  const startsAt = dateValue(formData, "startsAt") ?? calendarEvent?.start ?? null;
  const endsAt = dateValue(formData, "endsAt") ?? calendarEvent?.end ?? null;
  if (!startsAt || !endsAt || endsAt <= startsAt) throw new Error("INVALID_EVENT_DATES");
  const capacity = boundedIntegerValue(formData, "capacity", 100, 1, 1_000_000);
  const salesStartAt = dateValue(formData, "salesStartAt");
  const salesEndAt = dateValue(formData, "salesEndAt");
  if (salesStartAt && salesEndAt && salesEndAt <= salesStartAt) {
    throw new Error("INVALID_SALES_DATES");
  }
  const requestedSlug = slugify(value(formData, "slug") || titleNl) || `event-${randomBytes(4).toString("hex")}`;
  const slugExists = await prisma.ticketEvent.findUnique({ where: { slug: requestedSlug } });
  const slug = slugExists ? `${requestedSlug}-${randomBytes(3).toString("hex")}` : requestedSlug;

  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.ticketEvent.create({
      data: {
        calendarEventId,
        ownerGroupId,
        slug,
        titleNl,
        titleEn: limitedOptionalValue(formData, "titleEn", 200) ?? calendarEvent?.titleEn,
        descriptionNl: limitedOptionalValue(formData, "descriptionNl", 20_000) ?? calendarEvent?.descriptionNl,
        descriptionEn: limitedOptionalValue(formData, "descriptionEn", 20_000) ?? calendarEvent?.descriptionEn,
        location: limitedOptionalValue(formData, "location", 300) ?? calendarEvent?.location,
        startsAt,
        endsAt,
        salesStartAt,
        salesEndAt,
        maxTicketsPerOrder: boundedIntegerValue(formData, "maxTicketsPerOrder", 8, 1, 50),
        contactEmail: emailValue(formData, "contactEmail"),
        termsUrl: urlValue(formData, "termsUrl"),
        termsVersion: limitedOptionalValue(formData, "termsVersion", 80) ?? "1",
        createdById: session.user.id,
      },
    });
    await tx.ticketInventoryPool.create({
      data: {
        eventId: created.id,
        code: "GENERAL",
        nameNl: "Algemene capaciteit",
        nameEn: "General capacity",
        capacity,
      },
    });
    await tx.ticketEventUserGrant.create({
      data: {
        eventId: created.id,
        userId: session.user.id,
        role: "OWNER",
        grantedById: session.user.id,
      },
    });
    await tx.ticketEventGroupGrant.create({
      data: {
        eventId: created.id,
        groupId: ownerGroupId,
        role: "MANAGER",
        scope: "LEADS_ONLY",
        grantedById: session.user.id,
      },
    });
    await tx.ticketGate.create({
      data: { eventId: created.id, code: "MAIN", name: locale === "nl" ? "Hoofdingang" : "Main entrance" },
    });
    await tx.ticketAuditLog.create({
      data: {
        eventId: created.id,
        actorUserId: session.user.id,
        action: "EVENT_CREATED",
        entityType: "TicketEvent",
        entityId: created.id,
      },
    });
    return created;
  });

  refreshTicketEvent(locale, event.id);
  redirect(localePath(locale, `/admin/tickets/${event.id}/instellingen#tickettype-aanmaken`));
}

export async function updateTicketEventAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId") || value(formData, "id");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const { session, event } = await requireTicketEventCapability(eventId, "MANAGE_EVENT");
  const status = statusSchema.parse(value(formData, "status") || event.status);
  if (status === "PUBLISHED") {
    const activeTypes = await prisma.ticketType.count({ where: { eventId, active: true } });
    if (activeTypes === 0) throw new Error("TICKET_TYPE_REQUIRED_TO_PUBLISH");
  }

  const startsAt = dateValue(formData, "startsAt") ?? event.startsAt;
  const endsAt = dateValue(formData, "endsAt") ?? event.endsAt;
  if (endsAt <= startsAt) throw new Error("INVALID_EVENT_DATES");
  const maxTicketsPerOrder = boundedIntegerValue(
    formData,
    "maxTicketsPerOrder",
    event.maxTicketsPerOrder,
    1,
    50
  );
  const nextSlug = slugify(value(formData, "slug") || event.slug);
  if (!nextSlug) throw new Error("INVALID_SLUG");
  const slugConflict = await prisma.ticketEvent.findFirst({
    where: { slug: nextSlug, id: { not: eventId } },
    select: { id: true },
  });
  if (slugConflict) throw new Error("SLUG_ALREADY_EXISTS");
  const salesStartAt = dateValue(formData, "salesStartAt");
  const salesEndAt = dateValue(formData, "salesEndAt");
  if (salesStartAt && salesEndAt && salesEndAt <= salesStartAt) {
    throw new Error("INVALID_SALES_DATES");
  }

  await prisma.$transaction(async (tx) => {
    await tx.ticketEvent.update({
      where: { id: eventId },
      data: {
        slug: nextSlug,
        titleNl: limitedValue(formData, "titleNl", 200) || event.titleNl,
        titleEn: limitedOptionalValue(formData, "titleEn", 200),
        descriptionNl: limitedOptionalValue(formData, "descriptionNl", 20_000),
        descriptionEn: limitedOptionalValue(formData, "descriptionEn", 20_000),
        location: limitedOptionalValue(formData, "location", 300),
        startsAt,
        endsAt,
        salesStartAt,
        salesEndAt,
        status,
        maxTicketsPerOrder,
        contactEmail: emailValue(formData, "contactEmail"),
        termsUrl: urlValue(formData, "termsUrl"),
        termsVersion: limitedOptionalValue(formData, "termsVersion", 80),
        confirmationMessageNl: limitedOptionalValue(formData, "confirmationMessageNl", 5_000),
        confirmationMessageEn: limitedOptionalValue(formData, "confirmationMessageEn", 5_000),
        publishedAt: status === "PUBLISHED" ? event.publishedAt ?? new Date() : event.publishedAt,
        archivedAt: status === "ARCHIVED" ? new Date() : null,
      },
    });
    await tx.ticketAuditLog.create({
      data: {
        eventId,
        actorUserId: session.user.id,
        action: "EVENT_UPDATED",
        entityType: "TicketEvent",
        entityId: eventId,
        metadata: { status },
      },
    });
  });
  refreshTicketEvent(locale, eventId);
}

export async function updateInventoryPoolAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId");
  const poolId = value(formData, "poolId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_INVENTORY");
  const pool = await prisma.ticketInventoryPool.findFirst({ where: { id: poolId, eventId } });
  if (!pool) throw new Error("POOL_NOT_FOUND");
  const capacity = boundedIntegerValue(formData, "capacity", pool.capacity, 0, 1_000_000);
  if (capacity < pool.soldCount + pool.reservedCount) throw new Error("CAPACITY_BELOW_ALLOCATED");
  await prisma.$transaction([
    prisma.ticketInventoryPool.update({
      where: { id: pool.id },
      data: {
        nameNl: limitedValue(formData, "nameNl", 160) || pool.nameNl,
        nameEn: limitedOptionalValue(formData, "nameEn", 160),
        capacity,
        active: formData.getAll("active").some((entry) => entry === "on" || entry === "true"),
      },
    }),
    prisma.ticketAuditLog.create({
      data: {
        eventId,
        actorUserId: session.user.id,
        action: "INVENTORY_UPDATED",
        entityType: "TicketInventoryPool",
        entityId: pool.id,
        metadata: { capacity },
      },
    }),
  ]);
  refreshTicketEvent(locale, eventId);
}

export async function createTicketTypeAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const { session, event } = await requireTicketEventCapability(eventId, "MANAGE_INVENTORY");
  const nameNl = limitedValue(formData, "nameNl", 160) || limitedValue(formData, "name", 160);
  if (!nameNl) throw new Error("NAME_REQUIRED");
  const unitPriceCents = parseEuroAmount(formData.get("unitPrice") ?? formData.get("price"));
  if (unitPriceCents > 99_999_999) throw new Error("INVALID_AMOUNT");
  const minPerOrder = boundedIntegerValue(formData, "minPerOrder", 1, 1, 50);
  const maxPerOrder = boundedIntegerValue(
    formData,
    "maxPerOrder",
    event.maxTicketsPerOrder,
    1,
    50
  );
  if (maxPerOrder < minPerOrder) throw new Error("INVALID_ORDER_LIMITS");
  const salesStartAt = dateValue(formData, "salesStartAt");
  const salesEndAt = dateValue(formData, "salesEndAt");
  if (salesStartAt && salesEndAt && salesEndAt <= salesStartAt) {
    throw new Error("INVALID_SALES_DATES");
  }
  let inventoryPoolId = value(formData, "inventoryPoolId") || value(formData, "poolId");

  await prisma.$transaction(async (tx) => {
    if (!inventoryPoolId) {
      const pool = await tx.ticketInventoryPool.create({
        data: {
          eventId,
          code: `${codeFrom(nameNl)}_${randomBytes(2).toString("hex").toUpperCase()}`,
          nameNl,
          nameEn: limitedOptionalValue(formData, "nameEn", 160),
          capacity: boundedIntegerValue(formData, "capacity", 100, 1, 1_000_000),
        },
      });
      inventoryPoolId = pool.id;
    } else {
      const pool = await tx.ticketInventoryPool.findFirst({ where: { id: inventoryPoolId, eventId } });
      if (!pool) throw new Error("POOL_NOT_FOUND");
    }
    const created = await tx.ticketType.create({
      data: {
        eventId,
        inventoryPoolId,
        code: `${codeFrom(value(formData, "code") || nameNl)}_${randomBytes(2).toString("hex").toUpperCase()}`,
        nameNl,
        nameEn: limitedOptionalValue(formData, "nameEn", 160),
        descriptionNl: limitedOptionalValue(formData, "descriptionNl", 5_000),
        descriptionEn: limitedOptionalValue(formData, "descriptionEn", 5_000),
        unitPriceCents,
        currency: event.currency,
        audience: value(formData, "audience") === "MEMBERS" ? "MEMBERS" : "PUBLIC",
        salesStartAt,
        salesEndAt,
        minPerOrder,
        maxPerOrder,
        sortOrder: integerValue(formData, "sortOrder", 0),
      },
    });
    await tx.ticketAuditLog.create({
      data: {
        eventId,
        actorUserId: session.user.id,
        action: "TICKET_TYPE_CREATED",
        entityType: "TicketType",
        entityId: created.id,
      },
    });
  });
  refreshTicketEvent(locale, eventId);
}

export async function archiveTicketTypeAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId");
  const ticketTypeId = value(formData, "ticketTypeId") || value(formData, "id");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_INVENTORY");
  const type = await prisma.ticketType.findFirst({ where: { id: ticketTypeId, eventId } });
  if (!type) throw new Error("TICKET_TYPE_NOT_FOUND");
  await prisma.$transaction([
    prisma.ticketType.update({ where: { id: type.id }, data: { active: false } }),
    prisma.ticketAuditLog.create({
      data: {
        eventId,
        actorUserId: session.user.id,
        action: "TICKET_TYPE_ARCHIVED",
        entityType: "TicketType",
        entityId: type.id,
      },
    }),
  ]);
  refreshTicketEvent(locale, eventId);
}

export async function createTicketQuestionAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_EVENT");
  const labelNl = limitedValue(formData, "labelNl", 300) || limitedValue(formData, "label", 300);
  if (!labelNl) throw new Error("LABEL_REQUIRED");
  const type = z
    .enum(["SHORT_TEXT", "LONG_TEXT", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "BOOLEAN"])
    .parse(value(formData, "type") || "SHORT_TEXT");
  const options = value(formData, "options")
    .split(/[\n,]/)
    .map((option) => option.trim())
    .filter(Boolean);
  if (options.length > 50 || options.some((option) => option.length > 300)) {
    throw new Error("INVALID_QUESTION_OPTIONS");
  }
  if (["SINGLE_CHOICE", "MULTIPLE_CHOICE"].includes(type) && options.length < 2) {
    throw new Error("QUESTION_OPTIONS_REQUIRED");
  }
  const ticketTypeId = optionalValue(formData, "ticketTypeId");
  if (ticketTypeId) {
    const ticketType = await prisma.ticketType.findFirst({ where: { id: ticketTypeId, eventId } });
    if (!ticketType) throw new Error("TICKET_TYPE_NOT_FOUND");
  }
  const question = await prisma.ticketQuestion.create({
    data: {
      eventId,
      ticketTypeId,
      code: `${codeFrom(value(formData, "code") || labelNl)}_${randomBytes(2).toString("hex").toUpperCase()}`,
      labelNl,
      labelEn: limitedOptionalValue(formData, "labelEn", 300),
      descriptionNl: limitedOptionalValue(formData, "descriptionNl", 2_000),
      descriptionEn: limitedOptionalValue(formData, "descriptionEn", 2_000),
      type,
      required: formData.get("required") === "on" || formData.get("required") === "true",
      options: options.length ? options : undefined,
      sortOrder: integerValue(formData, "sortOrder", 0),
    },
  });
  await prisma.ticketAuditLog.create({
    data: {
      eventId,
      actorUserId: session.user.id,
      action: "QUESTION_CREATED",
      entityType: "TicketQuestion",
      entityId: question.id,
    },
  });
  refreshTicketEvent(locale, eventId);
}

export async function archiveTicketQuestionAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId");
  const questionId = value(formData, "questionId") || value(formData, "id");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  await requireTicketEventCapability(eventId, "MANAGE_EVENT");
  const question = await prisma.ticketQuestion.findFirst({ where: { id: questionId, eventId } });
  if (!question) throw new Error("QUESTION_NOT_FOUND");
  await prisma.ticketQuestion.update({ where: { id: question.id }, data: { active: false } });
  refreshTicketEvent(locale, eventId);
}

export async function addTicketUserGrantAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_ACCESS");
  const role = roleSchema.parse(value(formData, "role"));
  const groupId = optionalValue(formData, "groupId");
  if (groupId) {
    const scope = value(formData, "scope") === "LEADS_ONLY" ? "LEADS_ONLY" : "ALL_MEMBERS";
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "TicketEvent" WHERE "id" = ${eventId} FOR UPDATE`;
      await tx.ticketEventGroupGrant.upsert({
        where: { eventId_groupId: { eventId, groupId } },
        update: { role, scope, grantedById: session.user.id },
        create: { eventId, groupId, role, scope, grantedById: session.user.id },
      });
      await tx.ticketAuditLog.create({
        data: {
          eventId,
          actorUserId: session.user.id,
          action: "ACCESS_GRANTED",
          entityType: "TicketEventGroupGrant",
          metadata: { role, groupId, scope },
        },
      });
    });
  } else {
    const userId = optionalValue(formData, "userId");
    const email = optionalValue(formData, "email")?.toLowerCase();
    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : email
        ? await prisma.user.findUnique({ where: { email } })
        : null;
    if (!user || !user.active) throw new Error("USER_NOT_FOUND");
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "TicketEvent" WHERE "id" = ${eventId} FOR UPDATE`;
      const existingGrant = await tx.ticketEventUserGrant.findUnique({
        where: { eventId_userId: { eventId, userId: user.id } },
        select: { role: true },
      });
      if (existingGrant?.role === "OWNER" && role !== "OWNER") {
        const ownerCount = await tx.ticketEventUserGrant.count({ where: { eventId, role: "OWNER" } });
        if (ownerCount <= 1) throw new Error("LAST_OWNER_CANNOT_BE_DEMOTED");
      }
      await tx.ticketEventUserGrant.upsert({
        where: { eventId_userId: { eventId, userId: user.id } },
        update: { role, grantedById: session.user.id },
        create: { eventId, userId: user.id, role, grantedById: session.user.id },
      });
      await tx.ticketAuditLog.create({
        data: {
          eventId,
          actorUserId: session.user.id,
          action: "ACCESS_GRANTED",
          entityType: "TicketEventUserGrant",
          metadata: { role, userId: user.id },
        },
      });
    });
  }
  refreshTicketEvent(locale, eventId);
}

export async function removeTicketUserGrantAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId");
  const grantId = value(formData, "grantId") || value(formData, "id");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_ACCESS");
  const isGroup = value(formData, "kind") === "group";
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "TicketEvent" WHERE "id" = ${eventId} FOR UPDATE`;
    if (isGroup) {
      const grant = await tx.ticketEventGroupGrant.findFirst({ where: { id: grantId, eventId } });
      if (!grant) throw new Error("GRANT_NOT_FOUND");
      await tx.ticketEventGroupGrant.delete({ where: { id: grant.id } });
    } else {
      const grant = await tx.ticketEventUserGrant.findFirst({ where: { id: grantId, eventId } });
      if (!grant) throw new Error("GRANT_NOT_FOUND");
      if (grant.role === "OWNER") {
        const owners = await tx.ticketEventUserGrant.count({ where: { eventId, role: "OWNER" } });
        if (owners <= 1) throw new Error("LAST_OWNER_CANNOT_BE_REMOVED");
      }
      await tx.ticketEventUserGrant.delete({ where: { id: grant.id } });
    }
    await tx.ticketAuditLog.create({
      data: {
        eventId,
        actorUserId: session.user.id,
        action: "ACCESS_REVOKED",
        entityType: isGroup ? "TicketEventGroupGrant" : "TicketEventUserGrant",
        entityId: grantId,
      },
    });
  });
  refreshTicketEvent(locale, eventId);
}

export async function createTicketGateAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_ACCESS");
  const name = limitedValue(formData, "name", 160);
  if (!name) throw new Error("NAME_REQUIRED");
  const gate = await prisma.ticketGate.create({
    data: {
      eventId,
      code: `${codeFrom(value(formData, "code") || name)}_${randomBytes(2).toString("hex").toUpperCase()}`,
      name,
    },
  });
  await prisma.ticketAuditLog.create({
    data: {
      eventId,
      actorUserId: session.user.id,
      action: "GATE_CREATED",
      entityType: "TicketGate",
      entityId: gate.id,
    },
  });
  refreshTicketEvent(locale, eventId);
}

export async function setTicketGateActiveAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId");
  const gateId = value(formData, "gateId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_ACCESS");
  const active = value(formData, "active") === "true";
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "TicketEvent" WHERE "id" = ${eventId} FOR UPDATE`;
    const gate = await tx.ticketGate.findFirst({ where: { id: gateId, eventId } });
    if (!gate) throw new Error("GATE_NOT_FOUND");
    if (!active && gate.active) {
      const activeGates = await tx.ticketGate.count({ where: { eventId, active: true } });
      if (activeGates <= 1) throw new Error("LAST_GATE_CANNOT_BE_DISABLED");
    }
    await tx.ticketGate.update({ where: { id: gate.id }, data: { active } });
    await tx.ticketAuditLog.create({
      data: {
        eventId,
        actorUserId: session.user.id,
        action: active ? "GATE_ENABLED" : "GATE_DISABLED",
        entityType: "TicketGate",
        entityId: gate.id,
      },
    });
  });
  refreshTicketEvent(locale, eventId);
  revalidatePath(localePath(locale, `/admin/tickets/${eventId}/toegang`));
}

export async function revokeTicketScanDeviceAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId");
  const deviceId = value(formData, "deviceId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_ACCESS");
  const device = await prisma.ticketScanDevice.findFirst({ where: { id: deviceId, eventId } });
  if (!device) throw new Error("DEVICE_NOT_FOUND");
  if (!device.revokedAt) {
    await prisma.$transaction([
      prisma.ticketScanDevice.update({ where: { id: device.id }, data: { revokedAt: new Date() } }),
      prisma.ticketAuditLog.create({
        data: {
          eventId,
          actorUserId: session.user.id,
          action: "SCAN_DEVICE_REVOKED",
          entityType: "TicketScanDevice",
          entityId: device.id,
        },
      }),
    ]);
  }
  revalidatePath(localePath(locale, `/admin/tickets/${eventId}/toegang`));
}

export async function resendTicketOrderConfirmationAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId");
  const orderId = value(formData, "orderId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_ORDERS");
  const order = await prisma.ticketOrder.findFirst({ where: { id: orderId, eventId } });
  if (!order || !["PAID", "PARTIALLY_REFUNDED", "REFUNDED"].includes(order.status)) {
    throw new Error("ORDER_NOT_DELIVERABLE");
  }
  await prisma.$transaction([
    prisma.ticketOutboxMessage.create({
      data: {
        eventId,
        orderId,
        type: "ORDER_CONFIRMATION",
        dedupeKey: `order-confirmation:${orderId}:manual:${randomBytes(10).toString("hex")}`,
        recipient: order.buyerEmail,
        payload: { orderId, requestedById: session.user.id },
      },
    }),
    prisma.ticketAuditLog.create({
      data: {
        eventId,
        actorUserId: session.user.id,
        action: "ORDER_CONFIRMATION_QUEUED",
        entityType: "TicketOrder",
        entityId: orderId,
      },
    }),
  ]);
  revalidatePath(localePath(locale, `/admin/tickets/${eventId}/bestellingen`));
}

export async function refundTicketsAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId");
  const orderId = value(formData, "orderId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const { session } = await requireTicketEventCapability(eventId, "REFUND");
  const orderItemIds = formData.getAll("orderItemId").map(String).filter(Boolean);
  await requestTicketRefund({
    eventId,
    orderId,
    orderItemIds,
    requestedById: session.user.id,
    reason: limitedOptionalValue(formData, "reason", 1_000),
  });
  refreshTicketEvent(locale, eventId);
  revalidatePath(localePath(locale, `/admin/tickets/${eventId}/bestellingen`));
}
