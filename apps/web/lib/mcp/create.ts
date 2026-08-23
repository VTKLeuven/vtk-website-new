import "server-only";

import { randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { Permission } from "@vtk/auth";
import { prisma } from "@vtk/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logSystemAudit, type AuditEntity } from "@/lib/audit";
import { parseShift } from "@/lib/shift";
import {
  createCalendarCategory,
  createCalendarEvent,
  McpInputError,
} from "@/lib/mcp/data";
import {
  canUseMcpGroup,
  hasAnyMcpPermission,
  hasMcpPermission,
  type McpPrincipal,
} from "@/lib/mcp/policy";

export const MCP_CREATE_KINDS = [
  "page",
  "header_tab",
  "header_link",
  "announcement",
  "poc",
  "partner",
  "calendar_event",
  "calendar_category",
  "ticket_event",
  "ticket_type",
  "ticket_question",
  "ticket_gate",
  "form",
  "form_section",
  "form_field",
  "photo_album",
  "group",
  "role",
  "dashboard_tile",
  "short_link",
  "shift",
  "theokot_product",
  "theokot_session",
  "meeting",
  "lesbezoek_organisation",
  "lesbezoek",
  "lesbezoek_peculiarity",
  "piano_window",
  "uitleen_category",
  "uitleen_item",
  "uitleen_event",
  "oauth_client",
] as const;

export type McpCreateKind = (typeof MCP_CREATE_KINDS)[number];

const CREATE_PERMISSIONS = {
  page: ["pages.edit", "pages.editAll", "pages.manage"],
  header_tab: ["header.manage"],
  header_link: ["header.manage"],
  announcement: ["home.edit"],
  poc: ["pocs.manage"],
  partner: ["partners.manage"],
  calendar_event: ["calendar.create", "calendar.manageAll"],
  calendar_category: ["calendar.manageAll"],
  ticket_event: ["tickets.create", "tickets.manageAll"],
  ticket_type: ["tickets.create", "tickets.manageAll"],
  ticket_question: ["tickets.create", "tickets.manageAll"],
  ticket_gate: ["tickets.create", "tickets.manageAll"],
  form: ["forms.create", "forms.manageAll"],
  form_section: ["forms.create", "forms.manageAll"],
  form_field: ["forms.create", "forms.manageAll"],
  photo_album: ["photos.upload", "photos.manageAlbums", "media.manage"],
  group: ["groups.manage", "werkgroepen.manage"],
  role: ["roles.manage"],
  dashboard_tile: ["dashboard.manage", "dashboard.manageOwn"],
  short_link: ["shortlinks.manage"],
  shift: ["shift.edit"],
  theokot_product: ["theokot.manage"],
  theokot_session: ["theokot.manage"],
  meeting: ["grocomeet.manage", "bureau.manage"],
  lesbezoek_organisation: ["lesbezoeken.manage"],
  lesbezoek: ["lesbezoeken.manage"],
  lesbezoek_peculiarity: ["lesbezoeken.manage"],
  piano_window: ["piano.manage"],
  uitleen_category: ["logistiek.manage"],
  uitleen_item: ["logistiek.manage"],
  uitleen_event: ["logistiek.manage"],
  oauth_client: ["oauth.client.edit"],
} as const satisfies Record<McpCreateKind, readonly Permission[]>;

const inputSchema = z.object({
  kind: z.enum(MCP_CREATE_KINDS),
  data: z.record(z.string(), z.unknown()),
}).strict();

export type McpCreateInput = z.input<typeof inputSchema>;

const slug = z.string().trim().min(1).max(128).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/);
const code = z.string().trim().min(1).max(80).regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/);
const isoMoment = z.string().datetime({ offset: true });
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const url = z.string().trim().url().max(2048);

const schemas = {
  page: z.object({ slug, titleNl: z.string().trim().min(1).max(200), titleEn: optionalText(200) }).strict(),
  header_tab: z.object({ code, slug, labelNl: z.string().trim().min(1).max(100), labelEn: z.string().trim().min(1).max(100), externalUrl: url.optional().nullable() }).strict(),
  header_link: z.object({ tabCode: code, labelNl: z.string().trim().min(1).max(160), labelEn: z.string().trim().min(1).max(160), url, order: z.number().int().min(0).max(999).default(0) }).strict(),
  announcement: z.object({ titleNl: z.string().trim().min(1).max(200), titleEn: z.string().trim().min(1).max(200), bodyNl: z.string().trim().min(1).max(20_000), bodyEn: z.string().trim().min(1).max(20_000), scope: z.enum(["HOME", "SITE"]).default("HOME") }).strict(),
  poc: z.object({ slug, nameNl: z.string().trim().min(1).max(160), nameEn: optionalText(160), email: z.string().email().optional().nullable(), descriptionNl: optionalText(10_000), descriptionEn: optionalText(10_000), studyProgrammes: z.array(z.enum(["ARCHITECTURE", "BIOMEDICAL", "COMMON_BACHELOR", "CIVIL", "CHEMICAL", "COMPUTER_SCIENCE", "CYBERSECURITY", "DIGITAL_HUMANITIES", "ELECTRICAL", "ENERGY", "ARTIFICIAL_INTELLIGENCE", "MATERIALS", "NANO", "URBANISM", "MATHEMATICAL", "MECHANICAL"])).default([]) }).strict(),
  partner: z.object({ name: z.string().trim().min(1).max(200), logoKey: z.string().trim().min(1).max(500), url: url.optional().nullable() }).strict(),
  calendar_event: z.object({ titleNl: z.string(), titleEn: z.string().optional().nullable(), descriptionNl: z.string().optional().nullable(), descriptionEn: z.string().optional().nullable(), location: z.string().optional().nullable(), groupCode: code, start: isoMoment, end: isoMoment, allDay: z.boolean().default(false), visibility: z.enum(["PUBLIC", "MEMBERS"]).default("PUBLIC"), url: z.string().optional().nullable(), categorySlugs: z.array(z.string()).default([]), publish: z.literal(false).default(false) }).strict(),
  calendar_category: z.object({ slug, nameNl: z.string().trim().min(1).max(60), nameEn: z.string().trim().min(1).max(60), descriptionNl: optionalText(10_000), descriptionEn: optionalText(10_000), colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#5C667F"), order: z.number().int().min(0).max(999).default(0), showOnCalendarPage: z.boolean().default(true) }).strict(),
  ticket_event: z.object({ ownerGroupCode: code, slug, titleNl: z.string().trim().min(1).max(200), titleEn: optionalText(200), startsAt: isoMoment, endsAt: isoMoment, location: optionalText(300), capacity: z.number().int().min(1).max(1_000_000).default(100), firstTicketNameNl: z.string().trim().min(1).max(160).default("Standaardticket"), firstTicketPriceCents: z.number().int().min(0).max(99_999_999).default(0), maxTicketsPerOrder: z.number().int().min(1).max(50).default(8) }).strict(),
  ticket_type: z.object({ eventId: z.string().min(1), inventoryPoolId: z.string().optional(), code, nameNl: z.string().trim().min(1).max(160), nameEn: optionalText(160), unitPriceCents: z.number().int().min(0).max(99_999_999), maxPerOrder: z.number().int().min(1).max(50).default(8) }).strict(),
  ticket_question: z.object({ eventId: z.string().min(1), ticketTypeId: z.string().optional().nullable(), code, labelNl: z.string().trim().min(1).max(200), labelEn: optionalText(200), type: z.enum(["SHORT_TEXT", "LONG_TEXT", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "BOOLEAN"]), required: z.boolean().default(false), options: z.array(z.string().trim().min(1).max(200)).max(100).optional() }).strict(),
  ticket_gate: z.object({ eventId: z.string().min(1), code, name: z.string().trim().min(1).max(160) }).strict(),
  form: z.object({ ownerGroupCode: code, slug, titleNl: z.string().trim().min(1).max(200), titleEn: optionalText(200), audience: z.enum(["PUBLIC", "MEMBERS"]).default("PUBLIC") }).strict(),
  form_section: z.object({ formId: z.string().min(1), titleNl: z.string().trim().min(1).max(200), titleEn: optionalText(200), descriptionNl: optionalText(10_000), descriptionEn: optionalText(10_000), sortOrder: z.number().int().min(0).max(999).default(0) }).strict(),
  form_field: z.object({ formId: z.string().min(1), sectionId: z.string().optional().nullable(), code, type: z.enum(["SHORT_TEXT", "LONG_TEXT", "SINGLE_CHOICE", "MULTIPLE_CHOICE", "DROPDOWN", "BOOLEAN", "EMAIL", "NUMBER", "DATE", "TIME", "PHONE", "URL", "SCALE", "FILE", "CONSENT", "PROFILE"]), labelNl: z.string().trim().min(1).max(200), labelEn: optionalText(200), helpNl: optionalText(2_000), helpEn: optionalText(2_000), required: z.boolean().default(false), config: z.record(z.string(), z.unknown()).default({}), sortOrder: z.number().int().min(0).max(999).default(0), options: z.array(z.object({ code, labelNl: z.string().trim().min(1).max(200), labelEn: optionalText(200) }).strict()).max(100).default([]) }).strict(),
  photo_album: z.object({ slug, titleNl: z.string().trim().min(1).max(200), titleEn: optionalText(200), descriptionNl: optionalText(10_000), descriptionEn: optionalText(10_000), eventDate: isoMoment.optional().nullable() }).strict(),
  group: z.object({ type: z.enum(["PRAESIDIUM", "WERKGROEP"]), code, slug, nameNl: z.string().trim().min(1).max(160), nameEn: z.string().trim().min(1).max(160), descriptionNl: optionalText(10_000), descriptionEn: optionalText(10_000), website: url.optional().nullable() }).strict(),
  role: z.object({ code: slug, nameNl: z.string().trim().min(1).max(160), nameEn: z.string().trim().min(1).max(160), descriptionNl: optionalText(2_000), descriptionEn: optionalText(2_000), color: optionalText(40), order: z.number().int().min(0).max(999).default(0) }).strict(),
  dashboard_tile: z.object({ label: z.string().trim().min(1).max(160), url, icon: z.string().trim().min(1).max(80).default("link"), color: z.string().trim().min(1).max(80).default("navy"), scope: z.enum(["GLOBAL", "GROUP"]), groupCode: code.optional(), order: z.number().int().min(0).max(999).default(0) }).strict(),
  short_link: z.object({ slug: z.string().trim().min(1).max(128).regex(/^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/), url, note: optionalText(2_000), expiresAt: isoMoment.optional().nullable() }).strict(),
  shift: z.object({ name: z.string(), startTime: isoMoment, endTime: isoMoment, location: z.string(), description: z.string(), maxParticipants: z.number().int(), reward: z.number().int(), post: z.string().optional().nullable(), openToInternationals: z.boolean().default(false), instructions: z.string().optional().nullable() }).strict(),
  theokot_product: z.object({ nameNl: z.string().trim().min(1).max(160), nameEn: optionalText(160), priceCents: z.number().int().min(0).max(1_000_000), defaultQuantity: z.number().int().min(0).max(100_000).default(0), ingredientsNl: optionalText(2_000), ingredientsEn: optionalText(2_000), order: z.number().int().min(0).max(999).default(0) }).strict(),
  theokot_session: z.object({ date: isoMoment, orderOpenAt: isoMoment, orderCloseAt: isoMoment, pickupStart: isoMoment, pickupEnd: isoMoment, weeklySpecialLabelNl: optionalText(160), weeklySpecialLabelEn: optionalText(160) }).strict(),
  meeting: z.object({ kind: z.enum(["GROCOMEET", "BUREAU"]), year: z.number().int().min(2020).max(2200), semester: z.number().int().min(1).max(2), slug, startsAt: isoMoment, location: optionalText(300), opensAt: isoMoment.optional().nullable(), useTheokot: z.boolean().default(true), noteNl: optionalText(10_000), noteEn: optionalText(10_000) }).strict(),
  lesbezoek_organisation: z.object({ name: z.string().trim().min(1).max(200), colour: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#3B82F6"), contactEmail: z.string().email().optional().nullable(), note: optionalText(10_000) }).strict(),
  lesbezoek: z.object({ organisationId: z.string().min(1), startsAt: isoMoment, endsAt: isoMoment, longVisit: z.boolean().default(false), audience: z.string().trim().min(1).max(300), course: z.string().trim().min(1).max(300), subject: z.string().trim().min(1).max(500), teacherNote: z.string().trim().min(1).max(20_000), teacherEmail: z.string().email(), teacherName: optionalText(200), requesterName: optionalText(200), requesterEmail: z.string().email().optional().nullable(), requesterPhone: optionalText(80) }).strict(),
  lesbezoek_peculiarity: z.object({ subject: z.string().trim().min(1).max(300), note: z.string().trim().min(1).max(20_000) }).strict(),
  piano_window: z.object({ labelNl: z.string().trim().min(1).max(200), labelEn: optionalText(200), weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7), startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440), startDate: isoMoment.optional().nullable(), endDate: isoMoment.optional().nullable(), order: z.number().int().min(0).max(999).default(0) }).strict(),
  uitleen_category: z.object({ name: z.string().trim().min(1).max(200), sortIndex: z.number().int().min(0).max(999).default(0) }).strict(),
  uitleen_item: z.object({ categoryId: z.string().optional().nullable(), name: z.string().trim().min(1).max(200), description: optionalText(10_000), quantity: z.number().int().min(0).max(100_000).default(0), depositCents: z.number().int().min(0).max(100_000_000).default(0), priceCents: z.number().int().min(0).max(100_000_000).default(0), isSet: z.boolean().default(false), volumeLiters: z.number().int().min(0).max(1_000_000).optional().nullable(), locationShelf: optionalText(100), locationRack: optionalText(100), condition: z.enum(["WERKT", "KAPOT", "TESTEN", "ONVOLLEDIG"]).default("WERKT") }).strict(),
  uitleen_event: z.object({ name: z.string().trim().min(1).max(200), location: optionalText(300), startAt: isoMoment.optional().nullable(), endAt: isoMoment.optional().nullable(), startTimeKnown: z.boolean().default(true), groupCode: code.optional().nullable(), expectedAttendance: z.number().int().min(0).max(1_000_000).optional().nullable(), note: optionalText(10_000) }).strict(),
  oauth_client: z.object({ clientId: z.string().trim().min(3).max(100).regex(/^[a-zA-Z0-9._-]+$/), name: z.string().trim().min(1).max(200), redirectUris: z.array(url).min(1).max(20), contacts: z.array(z.string().email()).max(20).default([]), scopes: z.array(z.string().trim().min(1).max(100)).min(1).max(50).default(["openid"]), uri: url.optional().nullable() }).strict(),
} satisfies Record<McpCreateKind, z.ZodType<Record<string, unknown>>>;

function nullIfEmpty(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function uniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function audit(principal: McpPrincipal, entity: AuditEntity, id: string, target: string, summary: string) {
  await logSystemAudit({ action: "create", entity, entityId: id, target, summary }, principal.clientName);
}

function refresh() {
  revalidatePath("/", "layout");
  revalidatePath("/admin", "layout");
}

async function groupForCreate(principal: McpPrincipal, groupCode: string, manageAll: Permission) {
  const group = await prisma.group.findUnique({ where: { code: groupCode }, select: { id: true, code: true, active: true } });
  if (!group) throw new McpInputError("GROUP_NOT_FOUND", `Groep ${groupCode} bestaat niet.`);
  if (!hasMcpPermission(principal, manageAll) && !canUseMcpGroup(principal, group.code)) {
    throw new McpInputError("FORBIDDEN", `De MCP-serviceaccount beheert groep ${groupCode} niet.`);
  }
  return group;
}

async function ticketEventForCreate(principal: McpPrincipal, eventId: string) {
  const event = await prisma.ticketEvent.findUnique({ where: { id: eventId }, select: { id: true, titleNl: true, ownerGroup: { select: { code: true } } } });
  if (!event) throw new McpInputError("EVENT_NOT_FOUND", `Ticketevent ${eventId} bestaat niet.`);
  if (!hasMcpPermission(principal, "tickets.manageAll") && !canUseMcpGroup(principal, event.ownerGroup.code)) throw new McpInputError("FORBIDDEN", "Geen toegang tot dit ticketevent.");
  return event;
}

async function formForCreate(principal: McpPrincipal, formId: string) {
  const form = await prisma.form.findUnique({ where: { id: formId }, select: { id: true, titleNl: true, ownerGroup: { select: { code: true } } } });
  if (!form) throw new McpInputError("FORM_NOT_FOUND", `Formulier ${formId} bestaat niet.`);
  if (!hasMcpPermission(principal, "forms.manageAll") && !canUseMcpGroup(principal, form.ownerGroup.code)) throw new McpInputError("FORBIDDEN", "Geen toegang tot dit formulier.");
  return form;
}

export function canCreateMcpKind(principal: McpPrincipal, kind: McpCreateKind): boolean {
  return hasAnyMcpPermission(principal, CREATE_PERMISSIONS[kind]);
}

export function listMcpCreateSchemas(principal: McpPrincipal) {
  return MCP_CREATE_KINDS.map((kind) => {
    const shape = (schemas[kind] as z.AnyZodObject).shape;
    return {
      kind,
      granted: canCreateMcpKind(principal, kind),
      requiredAnyPermission: CREATE_PERMISSIONS[kind],
      safety: kind === "calendar_event" ? "always draft through app_create" : "create-only; forced inactive, disabled, closed, unpublished or draft where the model supports it",
      inputFields: Object.entries(shape).map(([name, field]) => ({
        name,
        required: !(field as z.ZodTypeAny).isOptional(),
        nullable: (field as z.ZodTypeAny).isNullable(),
        zodType: (field as z.ZodTypeAny)._def.typeName,
        description: (field as z.ZodTypeAny).description ?? null,
      })),
    };
  });
}

export async function createMcpRecord(principal: McpPrincipal, raw: McpCreateInput) {
  const request = inputSchema.parse(raw);
  if (!canCreateMcpKind(principal, request.kind)) {
    throw new McpInputError("FORBIDDEN", `De MCP-serviceaccount mag geen ${request.kind} aanmaken.`);
  }
  const data = schemas[request.kind].parse(request.data);

  try {
    let result: Record<string, unknown>;
    switch (request.kind) {
      case "page": {
        const input = schemas.page.parse(data);
        const roles = principal.roleCodes.size
          ? await prisma.role.findMany({ where: { code: { in: [...principal.roleCodes] } }, select: { id: true } })
          : [];
        const row = await prisma.page.create({ data: { slug: input.slug, titleNl: input.titleNl, titleEn: nullIfEmpty(input.titleEn), contentMdNl: "", contentJsonNl: { type: "doc", content: [{ type: "paragraph" }] }, publishedAt: null, editorRoles: { create: roles.map(({ id }) => ({ roleId: id })) } }, select: { id: true, slug: true, titleNl: true, publishedAt: true } });
        await audit(principal, "page", row.id, row.titleNl, "ongepubliceerd concept aangemaakt via MCP");
        result = row; break;
      }
      case "header_tab": {
        const input = schemas.header_tab.parse(data);
        const last = await prisma.headerTab.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
        const row = await prisma.headerTab.create({ data: { ...input, externalUrl: nullIfEmpty(input.externalUrl), visible: false, visibleNl: false, visibleEn: false, order: (last?.order ?? -1) + 1 } });
        await audit(principal, "headerTab", row.id, row.labelNl, "verborgen headertab aangemaakt via MCP");
        result = row; break;
      }
      case "header_link": {
        const input = schemas.header_link.parse(data);
        const tab = await prisma.headerTab.findUnique({ where: { code: input.tabCode }, select: { id: true, visible: true } });
        if (!tab) throw new McpInputError("TAB_NOT_FOUND", `Headertab ${input.tabCode} bestaat niet.`);
        if (tab.visible) throw new McpInputError("TAB_MUST_BE_HIDDEN", "MCP kan alleen links aan een verborgen tab toevoegen.");
        const row = await prisma.headerTabLink.create({ data: { tabId: tab.id, labelNl: input.labelNl, labelEn: input.labelEn, url: input.url, order: input.order } });
        await audit(principal, "headerTab", tab.id, input.tabCode, "link aan verborgen tab aangemaakt via MCP");
        result = row; break;
      }
      case "announcement": {
        const input = schemas.announcement.parse(data);
        const row = await prisma.announcement.create({ data: { ...input, active: false } });
        await audit(principal, "announcement", row.id, row.titleNl, "inactieve aankondiging aangemaakt via MCP");
        result = row; break;
      }
      case "poc": {
        const input = schemas.poc.parse(data);
        const row = await prisma.poc.create({ data: { ...input, nameEn: nullIfEmpty(input.nameEn), email: nullIfEmpty(input.email), descriptionNl: nullIfEmpty(input.descriptionNl), descriptionEn: nullIfEmpty(input.descriptionEn) } });
        await audit(principal, "poc", row.id, row.nameNl, "POC zonder vertegenwoordigers aangemaakt via MCP");
        result = row; break;
      }
      case "partner": {
        const input = schemas.partner.parse(data);
        const last = await prisma.partner.findFirst({ orderBy: { order: "desc" }, select: { order: true } });
        const row = await prisma.partner.create({ data: { ...input, url: nullIfEmpty(input.url), active: false, order: (last?.order ?? -1) + 1 } });
        await audit(principal, "partner", row.id, row.name, "inactieve partner aangemaakt via MCP");
        result = row; break;
      }
      case "calendar_event": {
        const input = schemas.calendar_event.parse(data);
        await groupForCreate(principal, input.groupCode, "calendar.manageAll");
        result = await createCalendarEvent(input); break;
      }
      case "calendar_category": {
        result = await createCalendarCategory(schemas.calendar_category.parse(data)); break;
      }
      case "ticket_event": {
        const input = schemas.ticket_event.parse(data);
        const group = await groupForCreate(principal, input.ownerGroupCode, "tickets.manageAll");
        const startsAt = new Date(input.startsAt); const endsAt = new Date(input.endsAt);
        if (endsAt <= startsAt) throw new McpInputError("INVALID_EVENT_DATES", "Einde moet na begin vallen.");
        const row = await prisma.$transaction(async (tx) => {
          const event = await tx.ticketEvent.create({ data: { ownerGroupId: group.id, slug: input.slug, titleNl: input.titleNl, titleEn: nullIfEmpty(input.titleEn), startsAt, endsAt, location: nullIfEmpty(input.location), status: "DRAFT", maxTicketsPerOrder: input.maxTicketsPerOrder } });
          const pool = await tx.ticketInventoryPool.create({ data: { eventId: event.id, code: "GENERAL", nameNl: "Algemene capaciteit", nameEn: "General capacity", capacity: input.capacity } });
          await tx.ticketType.create({ data: { eventId: event.id, inventoryPoolId: pool.id, code: "STANDARD", nameNl: input.firstTicketNameNl, unitPriceCents: input.firstTicketPriceCents, maxPerOrder: input.maxTicketsPerOrder } });
          await tx.ticketEventGroupGrant.create({ data: { eventId: event.id, groupId: group.id, role: "MANAGER", scope: "LEADS_ONLY" } });
          await tx.ticketGate.create({ data: { eventId: event.id, code: "MAIN", name: "Hoofdingang" } });
          await tx.ticketAuditLog.create({ data: { eventId: event.id, action: "EVENT_CREATED", entityType: "TicketEvent", entityId: event.id, metadata: { source: "mcp" } } });
          return event;
        });
        await audit(principal, "ticketEvent", row.id, row.titleNl, "draft ticketevent aangemaakt via MCP");
        result = row; break;
      }
      case "ticket_type": {
        const input = schemas.ticket_type.parse(data); const event = await ticketEventForCreate(principal, input.eventId);
        const pool = input.inventoryPoolId
          ? await prisma.ticketInventoryPool.findFirst({ where: { id: input.inventoryPoolId, eventId: event.id } })
          : await prisma.ticketInventoryPool.findFirst({ where: { eventId: event.id, active: true }, orderBy: { createdAt: "asc" } });
        if (!pool) throw new McpInputError("POOL_NOT_FOUND", "Geen voorraadpot gevonden.");
        const row = await prisma.ticketType.create({ data: { eventId: event.id, inventoryPoolId: pool.id, code: input.code, nameNl: input.nameNl, nameEn: nullIfEmpty(input.nameEn), unitPriceCents: input.unitPriceCents, maxPerOrder: input.maxPerOrder, active: false } });
        await audit(principal, "ticketType", row.id, row.nameNl, `voor ${event.titleNl}, inactief aangemaakt via MCP`);
        result = row; break;
      }
      case "ticket_question": {
        const input = schemas.ticket_question.parse(data); const event = await ticketEventForCreate(principal, input.eventId);
        const row = await prisma.ticketQuestion.create({ data: { eventId: event.id, ticketTypeId: input.ticketTypeId || null, code: input.code, labelNl: input.labelNl, labelEn: nullIfEmpty(input.labelEn), type: input.type, required: input.required, options: input.options ?? undefined, active: false } });
        await audit(principal, "ticketQuestion", row.id, row.labelNl, `voor ${event.titleNl}, inactief aangemaakt via MCP`);
        result = row; break;
      }
      case "ticket_gate": {
        const input = schemas.ticket_gate.parse(data); const event = await ticketEventForCreate(principal, input.eventId);
        const row = await prisma.ticketGate.create({ data: { eventId: event.id, code: input.code, name: input.name, active: false } });
        await audit(principal, "ticketGate", row.id, row.name, `voor ${event.titleNl}, inactief aangemaakt via MCP`);
        result = row; break;
      }
      case "form": {
        const input = schemas.form.parse(data); const group = await groupForCreate(principal, input.ownerGroupCode, "forms.manageAll");
        const row = await prisma.$transaction(async (tx) => {
          const form = await tx.form.create({ data: { ownerGroupId: group.id, slug: input.slug, titleNl: input.titleNl, titleEn: nullIfEmpty(input.titleEn), audience: input.audience, status: "DRAFT", listed: false } });
          await tx.formGroupGrant.create({ data: { formId: form.id, groupId: group.id, role: "MANAGER", scope: "LEADS_ONLY" } });
          await tx.formAuditLog.create({ data: { formId: form.id, action: "FORM_CREATED", entityType: "Form", entityId: form.id, metadata: { source: "mcp" } } });
          return form;
        });
        await audit(principal, "form", row.id, row.titleNl, "niet-opgelijst draftformulier aangemaakt via MCP");
        result = row; break;
      }
      case "form_section": {
        const input = schemas.form_section.parse(data); const form = await formForCreate(principal, input.formId);
        const row = await prisma.formSection.create({ data: { ...input, titleEn: nullIfEmpty(input.titleEn), descriptionNl: nullIfEmpty(input.descriptionNl), descriptionEn: nullIfEmpty(input.descriptionEn) } });
        await audit(principal, "form", form.id, form.titleNl, `sectie ${row.titleNl} aangemaakt via MCP`);
        result = row; break;
      }
      case "form_field": {
        const input = schemas.form_field.parse(data); const form = await formForCreate(principal, input.formId);
        if (input.sectionId) {
          const section = await prisma.formSection.findFirst({ where: { id: input.sectionId, formId: form.id }, select: { id: true } });
          if (!section) throw new McpInputError("SECTION_NOT_FOUND", "Sectie hoort niet bij dit formulier.");
        }
        const row = await prisma.formField.create({ data: { formId: form.id, sectionId: input.sectionId || null, code: input.code, type: input.type, labelNl: input.labelNl, labelEn: nullIfEmpty(input.labelEn), helpNl: nullIfEmpty(input.helpNl), helpEn: nullIfEmpty(input.helpEn), required: input.required, config: input.config as Prisma.InputJsonValue, sortOrder: input.sortOrder, options: { create: input.options.map((option, index) => ({ code: option.code, labelNl: option.labelNl, labelEn: nullIfEmpty(option.labelEn), sortOrder: index })) } } });
        await audit(principal, "form", form.id, form.titleNl, `veld ${row.labelNl} aangemaakt via MCP`);
        result = row; break;
      }
      case "photo_album": {
        const input = schemas.photo_album.parse(data);
        const row = await prisma.photoAlbum.create({ data: { ...input, titleEn: nullIfEmpty(input.titleEn), descriptionNl: nullIfEmpty(input.descriptionNl), descriptionEn: nullIfEmpty(input.descriptionEn), eventDate: input.eventDate ? new Date(input.eventDate) : null, publishedAt: null } });
        await audit(principal, "photoAlbum", row.id, row.titleNl, "ongepubliceerd fotoalbum aangemaakt via MCP");
        result = row; break;
      }
      case "group": {
        const input = schemas.group.parse(data);
        const permission = input.type === "WERKGROEP" ? "werkgroepen.manage" : "groups.manage";
        if (!hasMcpPermission(principal, permission)) throw new McpInputError("FORBIDDEN", `Permissie ${permission} ontbreekt.`);
        const row = await prisma.group.create({ data: { ...input, descriptionNl: nullIfEmpty(input.descriptionNl), descriptionEn: nullIfEmpty(input.descriptionEn), website: nullIfEmpty(input.website), active: false } });
        await audit(principal, input.type === "WERKGROEP" ? "werkgroep" : "post", row.id, row.nameNl, "inactieve groep zonder leden of rollen aangemaakt via MCP");
        result = row; break;
      }
      case "role": {
        const input = schemas.role.parse(data);
        const row = await prisma.role.create({ data: { ...input, descriptionNl: nullIfEmpty(input.descriptionNl), descriptionEn: nullIfEmpty(input.descriptionEn), color: nullIfEmpty(input.color), system: false } });
        await audit(principal, "role", row.id, row.nameNl, "rol zonder permissies of toewijzingen aangemaakt via MCP");
        result = row; break;
      }
      case "dashboard_tile": {
        const input = schemas.dashboard_tile.parse(data);
        let groupId: string | null = null;
        if (input.scope === "GROUP") {
          if (!input.groupCode) throw new McpInputError("GROUP_REQUIRED", "groupCode is verplicht voor een groepstegel.");
          const group = await groupForCreate(principal, input.groupCode, "dashboard.manage"); groupId = group.id;
        } else if (!hasMcpPermission(principal, "dashboard.manage")) throw new McpInputError("FORBIDDEN", "Alleen dashboard.manage kan globale tegels aanmaken.");
        const row = await prisma.dashboardTile.create({ data: { label: input.label, url: input.url, icon: input.icon, color: input.color, scope: input.scope, groupId, order: input.order } });
        await audit(principal, "dashboardTile", row.id, row.label, `${row.scope.toLowerCase()} tegel aangemaakt via MCP`);
        result = row; break;
      }
      case "short_link": {
        const input = schemas.short_link.parse(data);
        const row = await prisma.shortLink.create({ data: { slug: input.slug, url: input.url, note: nullIfEmpty(input.note), expiresAt: input.expiresAt ? new Date(input.expiresAt) : null, enabled: false } });
        await audit(principal, "shortLink", row.id, row.slug, "uitgeschakelde shortlink aangemaakt via MCP");
        result = row; break;
      }
      case "shift": {
        const input = schemas.shift.parse(data);
        if (input.post && !principal.allGroups && !canUseMcpGroup(principal, input.post)) throw new McpInputError("FORBIDDEN", `Geen toegang tot groep ${input.post}.`);
        const parsed = parseShift(input); const row = await prisma.shift.create({ data: parsed });
        await audit(principal, "shift", row.id, row.name, "shift aangemaakt via MCP");
        result = row; break;
      }
      case "theokot_product": {
        const input = schemas.theokot_product.parse(data);
        const row = await prisma.theokotProduct.create({ data: { ...input, nameEn: nullIfEmpty(input.nameEn), ingredientsNl: nullIfEmpty(input.ingredientsNl), ingredientsEn: nullIfEmpty(input.ingredientsEn), active: false } });
        await audit(principal, "theokotProduct", row.id, row.nameNl, "inactief product aangemaakt via MCP");
        result = row; break;
      }
      case "theokot_session": {
        const input = schemas.theokot_session.parse(data); const orderOpenAt = new Date(input.orderOpenAt); const orderCloseAt = new Date(input.orderCloseAt); const pickupStart = new Date(input.pickupStart); const pickupEnd = new Date(input.pickupEnd);
        if (!(orderOpenAt < orderCloseAt && orderCloseAt <= pickupStart && pickupStart < pickupEnd)) throw new McpInputError("INVALID_WINDOW", "Ongeldige volgorde van bestel- en afhaalmomenten.");
        const row = await prisma.theokotSession.create({ data: { date: new Date(input.date), orderOpenAt, orderCloseAt, pickupStart, pickupEnd, weeklySpecialLabelNl: nullIfEmpty(input.weeklySpecialLabelNl), weeklySpecialLabelEn: nullIfEmpty(input.weeklySpecialLabelEn), isOpen: false } });
        await audit(principal, "theokotSession", row.id, row.date.toISOString(), "gesloten sessie aangemaakt via MCP");
        result = row; break;
      }
      case "meeting": {
        const input = schemas.meeting.parse(data); const needed = input.kind === "GROCOMEET" ? "grocomeet.manage" : "bureau.manage";
        if (!hasMcpPermission(principal, needed)) throw new McpInputError("FORBIDDEN", `Permissie ${needed} ontbreekt.`);
        const row = await prisma.meeting.create({ data: { ...input, startsAt: new Date(input.startsAt), opensAt: input.opensAt ? new Date(input.opensAt) : null, location: nullIfEmpty(input.location), noteNl: nullIfEmpty(input.noteNl), noteEn: nullIfEmpty(input.noteEn) } });
        await audit(principal, "meeting", row.id, row.slug, `${row.kind.toLowerCase()} aangemaakt via MCP`);
        result = row; break;
      }
      case "lesbezoek_organisation": {
        const input = schemas.lesbezoek_organisation.parse(data);
        const row = await prisma.lesbezoekOrganisation.create({ data: { ...input, contactEmail: nullIfEmpty(input.contactEmail), note: nullIfEmpty(input.note), active: false } });
        await audit(principal, "lesbezoekOrganisation", row.id, row.name, "inactieve organisatie aangemaakt via MCP");
        result = row; break;
      }
      case "lesbezoek": {
        const input = schemas.lesbezoek.parse(data); const startsAt = new Date(input.startsAt); const endsAt = new Date(input.endsAt);
        if (endsAt <= startsAt) throw new McpInputError("INVALID_VISIT_DATES", "Einde moet na begin vallen.");
        const organisation = await prisma.lesbezoekOrganisation.findUnique({ where: { id: input.organisationId }, select: { id: true } });
        if (!organisation) throw new McpInputError("ORGANISATION_NOT_FOUND", "Organisatie bestaat niet.");
        const row = await prisma.lesbezoek.create({ data: { ...input, startsAt, endsAt, teacherName: nullIfEmpty(input.teacherName), requesterName: nullIfEmpty(input.requesterName), requesterEmail: nullIfEmpty(input.requesterEmail), requesterPhone: nullIfEmpty(input.requesterPhone), status: "PENDING" } });
        await audit(principal, "lesbezoek", row.id, row.subject, "pending lesbezoek zonder e-mail aangemaakt via MCP");
        result = row; break;
      }
      case "lesbezoek_peculiarity": {
        const input = schemas.lesbezoek_peculiarity.parse(data); const row = await prisma.lesbezoekPeculiarity.create({ data: input });
        await audit(principal, "lesbezoekPeculiarity", row.id, row.subject, "aandachtspunt aangemaakt via MCP");
        result = row; break;
      }
      case "piano_window": {
        const input = schemas.piano_window.parse(data);
        if (input.endMinute <= input.startMinute) throw new McpInputError("INVALID_WINDOW", "Eindminuut moet na startminuut vallen.");
        const row = await prisma.pianoWindow.create({ data: { ...input, labelEn: nullIfEmpty(input.labelEn), startDate: input.startDate ? new Date(input.startDate) : null, endDate: input.endDate ? new Date(input.endDate) : null, active: false, weekdays: [...new Set(input.weekdays)] } });
        await audit(principal, "piano", row.id, row.labelNl, "inactief beschikbaarheidsvenster aangemaakt via MCP");
        result = row; break;
      }
      case "uitleen_category": {
        const input = schemas.uitleen_category.parse(data); const row = await prisma.uitleenCategory.create({ data: { ...input, active: false } });
        await audit(principal, "logistiek", row.id, row.name, "inactieve uitleencategorie aangemaakt via MCP");
        result = row; break;
      }
      case "uitleen_item": {
        const input = schemas.uitleen_item.parse(data);
        if (input.categoryId) { const category = await prisma.uitleenCategory.findUnique({ where: { id: input.categoryId }, select: { id: true } }); if (!category) throw new McpInputError("CATEGORY_NOT_FOUND", "Uitleencategorie bestaat niet."); }
        const row = await prisma.uitleenItem.create({ data: { ...input, description: nullIfEmpty(input.description), locationShelf: nullIfEmpty(input.locationShelf), locationRack: nullIfEmpty(input.locationRack), active: false } });
        await audit(principal, "logistiek", row.id, row.name, "inactief uitleenitem aangemaakt via MCP");
        result = row; break;
      }
      case "uitleen_event": {
        const input = schemas.uitleen_event.parse(data); let groupId: string | null = null;
        if (input.groupCode) { const group = await groupForCreate(principal, input.groupCode, "logistiek.manage"); groupId = group.id; }
        const startAt = input.startAt ? new Date(input.startAt) : null; const endAt = input.endAt ? new Date(input.endAt) : null;
        if (startAt && endAt && endAt < startAt) throw new McpInputError("INVALID_EVENT_DATES", "Einde mag niet voor begin vallen.");
        const row = await prisma.uitleenEvent.create({ data: { name: input.name, location: nullIfEmpty(input.location), startAt, endAt, startTimeKnown: input.startTimeKnown, groupId, expectedAttendance: input.expectedAttendance, note: nullIfEmpty(input.note) } });
        await audit(principal, "logistiek", row.id, row.name, "uitleenevenement zonder aanvragen aangemaakt via MCP");
        result = row; break;
      }
      case "oauth_client": {
        const input = schemas.oauth_client.parse(data);
        const row = await prisma.oauthClient.create({ data: { id: randomUUID(), clientId: input.clientId, name: input.name, redirectUris: input.redirectUris, contacts: input.contacts, scopes: input.scopes, uri: nullIfEmpty(input.uri), disabled: true, public: true, type: "native", requirePKCE: true, skipConsent: false, grantTypes: ["authorization_code"], responseTypes: ["code"], tokenEndpointAuthMethod: "none", clientSecret: null, referenceId: `mcp-${randomBytes(8).toString("hex")}` } });
        await audit(principal, "ssoClient", row.clientId, row.name ?? row.clientId, "uitgeschakelde publieke PKCE-client zonder secret aangemaakt via MCP");
        result = { ...row, clientSecret: undefined }; break;
      }
    }
    refresh();
    return { kind: request.kind, created: result };
  } catch (error) {
    if (uniqueError(error)) throw new McpInputError("ALREADY_EXISTS", `Een unieke waarde voor ${request.kind} is al in gebruik.`);
    throw error;
  }
}
