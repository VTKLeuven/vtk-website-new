import "server-only";

import type { Permission } from "@vtk/auth";
import { prisma } from "@vtk/db";
import { z } from "zod";
import { listRecipients, MAILING_LISTS } from "@/lib/mailinglists";
import { McpInputError } from "@/lib/mcp/data";
import {
  hasAnyMcpPermission,
  hasMcpPermission,
  type McpPrincipal,
} from "@/lib/mcp/policy";

export const MCP_READ_RESOURCES = [
  "user_search",
  "users",
  "groups",
  "roles",
  "pages",
  "navigation",
  "announcements",
  "calendar",
  "tickets",
  "ticket_orders",
  "forms",
  "form_entries",
  "photos",
  "pocs",
  "partners",
  "editorial_settings",
  "dashboard",
  "shortlinks",
  "shifts",
  "shift_ranking",
  "theokot",
  "meetings",
  "meeting_schedule",
  "lesbezoeken",
  "lesbezoek_calendar",
  "piano",
  "logistiek",
  "logistiek_catalog",
  "door",
  "fakscanner",
  "module_access",
  "oauth_clients",
  "vault_metadata",
  "audit_log",
  "urenloop_app",
  "mailing_lists",
] as const;

export type McpReadResource = (typeof MCP_READ_RESOURCES)[number];

const RESOURCE_PERMISSIONS = {
  user_search: ["users.search", "users.view", "users.edit", "users.bulkImport"],
  users: ["users.view", "users.edit", "users.bulkImport"],
  groups: ["groups.manage", "werkgroepen.manage", "roles.manage", "users.view"],
  roles: ["roles.manage"],
  pages: ["pages.edit", "pages.editAll", "pages.manage", "pages.publish", "pages.delete"],
  navigation: ["header.manage", "pages.manage"],
  announcements: ["home.edit"],
  calendar: ["calendar.create", "calendar.manageAll"],
  tickets: ["tickets.create", "tickets.manageAll"],
  ticket_orders: ["tickets.manageAll"],
  forms: ["forms.create", "forms.manageAll"],
  form_entries: ["forms.manageAll"],
  photos: ["photos.upload", "photos.manageAlbums", "media.manage"],
  pocs: ["pocs.manage"],
  partners: ["partners.manage"],
  editorial_settings: ["home.edit", "openingHours.manageOwn", "media.manage"],
  dashboard: ["dashboard.manage", "dashboard.manageOwn"],
  shortlinks: ["shortlinks.manage"],
  shifts: ["shift.edit", "shift.reward"],
  shift_ranking: ["shift.ranking", "shift.edit", "shift.reward"],
  theokot: ["theokot.manage", "theokot.pickup"],
  meetings: ["grocomeet.manage", "bureau.manage"],
  meeting_schedule: ["grocomeet.reserve", "grocomeet.manage", "bureau.manage"],
  lesbezoeken: ["lesbezoeken.manage"],
  lesbezoek_calendar: ["lesbezoeken.view", "lesbezoeken.manage"],
  piano: ["piano.manage"],
  logistiek: ["logistiek.manage"],
  logistiek_catalog: ["logistiek.manage", "modules.logistiek.access"],
  door: ["door.manage"],
  fakscanner: ["fakscanner.manage"],
  module_access: ["modules.logistiek.access", "modules.cursusdienst.access"],
  oauth_clients: ["oauth.client.edit"],
  vault_metadata: ["vault.editOwn", "vault.manage"],
  audit_log: ["audit.view"],
  urenloop_app: ["urenloopApp.manage"],
  mailing_lists: ["mailinglists.export"],
} as const satisfies Record<McpReadResource, readonly Permission[]>;

const inputSchema = z.object({
  resource: z.enum(MCP_READ_RESOURCES),
  id: z.string().trim().min(1).max(160).optional(),
  search: z.string().trim().min(1).max(160).optional(),
  limit: z.number().int().min(1).max(200).default(100),
  offset: z.number().int().min(0).max(100_000).default(0),
}).strict();

export type McpAdminReadInput = z.input<typeof inputSchema>;

const SAFE_SETTING_KEYS = [
  "home.career",
  "home.aftermovies",
  "home.openingHours.theokot",
  "home.openingHours.cursusdienst",
  "home.openingHours.elixir",
  "media.aftermovies",
  "media.magazines",
  "site.linkPage",
] as const;

/** Resources die meerdere collecties samen teruggeven; `id` en `search` slaan er nergens op. */
const UNFILTERABLE_RESOURCES: ReadonlySet<McpReadResource> = new Set([
  "theokot",
  "piano",
  "logistiek",
  "door",
  "fakscanner",
  "module_access",
  "vault_metadata",
  "urenloop_app",
  "mailing_lists",
]);

function groupWhere(principal: McpPrincipal) {
  if (principal.allGroups) return undefined;
  return { code: { in: [...principal.groupCodes] } };
}

function idWhere(id: string | undefined) {
  return id ? { id } : {};
}

function page<T>(items: T[], input: z.output<typeof inputSchema>) {
  return {
    resource: input.resource,
    items,
    limit: input.limit,
    offset: input.offset,
    hasMore: items.length === input.limit,
  };
}

export function canReadMcpResource(principal: McpPrincipal, resource: McpReadResource): boolean {
  return hasAnyMcpPermission(principal, RESOURCE_PERMISSIONS[resource]);
}

export async function adminRead(principal: McpPrincipal, raw: McpAdminReadInput) {
  const input = inputSchema.parse(raw);
  if (!canReadMcpResource(principal, input.resource)) {
    throw new McpInputError("FORBIDDEN", `De MCP-serviceaccount mag ${input.resource} niet lezen.`);
  }
  if (UNFILTERABLE_RESOURCES.has(input.resource) && (input.id || input.search)) {
    // Deze resources bundelen meerdere collecties in één antwoord. Een filter
    // stilzwijgend negeren geeft een agent een volledige lijst terug die er
    // uitziet als een gefilterd resultaat; zeg dus dat het filter niet bestaat.
    throw new McpInputError(
      "FILTER_NOT_SUPPORTED",
      `${input.resource} bundelt meerdere collecties en ondersteunt geen id- of search-filter; blader met limit en offset.`,
    );
  }
  const take = input.limit;
  const skip = input.offset;
  const contains = input.search ? { contains: input.search, mode: "insensitive" as const } : undefined;

  switch (input.resource) {
    case "user_search": {
      const items = await prisma.user.findMany({
        where: {
          ...idWhere(input.id),
          active: true,
          deletedAt: null,
          ...(contains ? { OR: [{ name: contains }, { email: contains }, { rNumber: contains }] } : {}),
        },
        take,
        skip,
        orderBy: { name: "asc" },
        select: { id: true, name: true, email: true, rNumber: true, locale: true },
      });
      return page(items, input);
    }
    case "users": {
      const items = await prisma.user.findMany({
        where: {
          ...idWhere(input.id),
          deletedAt: null,
          ...(contains ? { OR: [{ name: contains }, { email: contains }, { rNumber: contains }] } : {}),
        },
        take,
        skip,
        orderBy: [{ active: "desc" }, { name: "asc" }],
        select: {
          id: true, name: true, firstName: true, lastName: true, email: true,
          rNumber: true, locale: true, active: true, isSuperAdmin: true,
          firwStudent: true, personalEmail: true, emailPreference: true,
          studyYears: true, studyProgrammes: true, notAtFaculty: true,
          notStudying: true, internationalStudent: true, alumni: true, studyConfirmedYear: true,
          createdAt: true, updatedAt: true,
          memberships: {
            orderBy: { year: "desc" },
            select: { year: true, role: true, titleNl: true, titleEn: true, group: { select: { code: true, nameNl: true } } },
          },
          roles: { select: { year: true, role: { select: { code: true, nameNl: true } } } },
        },
      });
      return page(items, input);
    }
    case "groups": {
      const items = await prisma.group.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ code: contains }, { nameNl: contains }, { nameEn: contains }] } : {}) },
        take, skip, orderBy: [{ active: "desc" }, { orderInPraesidium: "asc" }],
        select: {
          id: true, code: true, slug: true, nameNl: true, nameEn: true,
          descriptionNl: true, descriptionEn: true, type: true, website: true,
          active: true, orderInPraesidium: true,
          roleGrants: { select: { kind: true, role: { select: { code: true, nameNl: true } } } },
          _count: { select: { memberships: true, events: true, ownedForms: true, ownedTicketEvents: true } },
        },
      });
      return page(items, input);
    }
    case "roles": {
      const items = await prisma.role.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ code: contains }, { nameNl: contains }, { nameEn: contains }] } : {}) },
        take, skip, orderBy: [{ order: "asc" }, { nameNl: "asc" }],
        select: {
          id: true, code: true, nameNl: true, nameEn: true, descriptionNl: true,
          descriptionEn: true, color: true, order: true, system: true,
          permissions: { select: { permission: { select: { code: true, labelNl: true } } } },
          _count: { select: { users: true, groupGrants: true, pageGrants: true } },
        },
      });
      return page(items, input);
    }
    case "pages": {
      const items = await prisma.page.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ slug: contains }, { titleNl: contains }, { titleEn: contains }] } : {}) },
        take, skip, orderBy: [{ order: "asc" }, { titleNl: "asc" }],
        select: {
          id: true, slug: true, titleNl: true, titleEn: true, contentMdNl: true,
          contentMdEn: true, excerptNl: true, excerptEn: true, visibleInHeader: true,
          ctaLabelNl: true, ctaLabelEn: true, ctaUrl: true, needsYearlyEdit: true,
          contentEditedAt: true, publishedAt: true, order: true, createdAt: true, updatedAt: true,
          headerTab: { select: { code: true, slug: true, labelNl: true, labelEn: true } },
          assets: { orderBy: { order: "asc" }, select: { id: true, kind: true, labelNl: true, labelEn: true, sizeBytes: true, mimeType: true, order: true } },
          editorRoles: { select: { role: { select: { code: true, nameNl: true } } } },
        },
      });
      return page(items, input);
    }
    case "navigation": {
      const items = await prisma.headerTab.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ code: contains }, { slug: contains }, { labelNl: contains }, { labelEn: contains }] } : {}) },
        take, skip, orderBy: { order: "asc" },
        include: { links: { orderBy: { order: "asc" } }, pages: { orderBy: { order: "asc" }, select: { id: true, slug: true, titleNl: true, titleEn: true, publishedAt: true } } },
      });
      return page(items.map(({ imageKey, ...item }) => ({ ...item, hasImage: Boolean(imageKey) })), input);
    }
    case "announcements": {
      const items = await prisma.announcement.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ titleNl: contains }, { titleEn: contains }, { bodyNl: contains }, { bodyEn: contains }] } : {}) },
        take, skip, orderBy: { createdAt: "desc" },
      });
      return page(items, input);
    }
    case "calendar": {
      const scopedGroup = hasMcpPermission(principal, "calendar.manageAll") ? undefined : groupWhere(principal);
      const items = await prisma.calendarEvent.findMany({
        where: { ...idWhere(input.id), ...(scopedGroup ? { group: scopedGroup } : {}), ...(contains ? { OR: [{ titleNl: contains }, { titleEn: contains }, { location: contains }] } : {}) },
        take, skip, orderBy: { start: "desc" },
        select: {
          id: true, titleNl: true, titleEn: true, descriptionNl: true, descriptionEn: true,
          location: true, start: true, end: true, allDay: true, visibility: true, url: true,
          publishedAt: true, createdAt: true, updatedAt: true,
          group: { select: { code: true, nameNl: true } },
          categories: { select: { category: { select: { slug: true, nameNl: true, colour: true } } } },
        },
      });
      const categories = await prisma.calendarCategory.findMany({ orderBy: [{ order: "asc" }, { nameNl: "asc" }] });
      return { ...page(items, input), categories };
    }
    case "tickets": {
      const scopedGroup = hasMcpPermission(principal, "tickets.manageAll") ? undefined : groupWhere(principal);
      const items = await prisma.ticketEvent.findMany({
        where: { ...idWhere(input.id), ...(scopedGroup ? { ownerGroup: scopedGroup } : {}), ...(contains ? { OR: [{ slug: contains }, { titleNl: contains }, { titleEn: contains }] } : {}) },
        take, skip, orderBy: { startsAt: "desc" },
        select: {
          id: true, slug: true, titleNl: true, titleEn: true, descriptionNl: true,
          descriptionEn: true, location: true, startsAt: true, endsAt: true,
          salesStartAt: true, salesEndAt: true, status: true, currency: true,
          maxTicketsPerOrder: true, contactEmail: true, publishedAt: true,
          ownerGroup: { select: { code: true, nameNl: true } },
          inventoryPools: true, ticketTypes: true, questions: true, gates: true,
          _count: { select: { orders: true, tickets: true, scanLogs: true } },
        },
      });
      return page(items, input);
    }
    case "ticket_orders": {
      const items = await prisma.ticketOrder.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ reference: contains }, { buyerName: contains }, { buyerEmail: contains }] } : {}) },
        take, skip, orderBy: { createdAt: "desc" },
        select: {
          id: true, eventId: true, reference: true, buyerUserId: true, buyerName: true,
          buyerEmail: true, locale: true, status: true, currency: true, subtotalCents: true,
          discountCents: true, totalCents: true, refundedCents: true, paidAt: true,
          failedAt: true, expiredAt: true, cancelledAt: true, createdAt: true, updatedAt: true,
          event: { select: { slug: true, titleNl: true } },
          items: { select: { id: true, unitPriceCents: true, discountCents: true, totalCents: true, attendeeName: true, attendeeEmail: true, ticketType: { select: { code: true, nameNl: true } } } },
          payments: { select: { id: true, status: true, amountCents: true, provider: true, createdAt: true } },
          refunds: { select: { id: true, status: true, amountCents: true, reason: true, createdAt: true } },
        },
      });
      return page(items, input);
    }
    case "forms": {
      const scopedGroup = hasMcpPermission(principal, "forms.manageAll") ? undefined : groupWhere(principal);
      const items = await prisma.form.findMany({
        where: { ...idWhere(input.id), ...(scopedGroup ? { ownerGroup: scopedGroup } : {}), ...(contains ? { OR: [{ slug: contains }, { titleNl: contains }, { titleEn: contains }] } : {}) },
        take, skip, orderBy: { createdAt: "desc" },
        select: {
          id: true, slug: true, titleNl: true, titleEn: true, introNl: true, introEn: true,
          status: true, audience: true, listed: true, localeMode: true, opensAt: true,
          closesAt: true, maxEntries: true, allowWaitlist: true, stepBySections: true,
          publishedAt: true, createdAt: true, updatedAt: true,
          ownerGroup: { select: { code: true, nameNl: true } },
          sections: { orderBy: { sortOrder: "asc" } },
          fields: { orderBy: { sortOrder: "asc" }, include: { options: { orderBy: { sortOrder: "asc" } } } },
          _count: { select: { entries: true } },
        },
      });
      return page(items, input);
    }
    case "form_entries": {
      const items = await prisma.formEntry.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ submitterName: contains }, { submitterEmail: contains }] } : {}) },
        take, skip, orderBy: { createdAt: "desc" },
        select: {
          id: true, formId: true, status: true, reviewStatus: true, internalNote: true,
          submittedById: true, submitterName: true, submitterEmail: true, locale: true,
          isTest: true, waitlisted: true, submittedAt: true, createdAt: true, updatedAt: true,
          form: { select: { slug: true, titleNl: true } },
          answers: { select: { fieldCode: true, valueText: true, valueNumber: true, valueDate: true, valueBool: true, valueOptions: true, otherText: true } },
          uploads: { select: { id: true, originalName: true, contentType: true, sizeBytes: true, createdAt: true } },
        },
      });
      return page(items, input);
    }
    case "photos": {
      const items = await prisma.photoAlbum.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ slug: contains }, { titleNl: contains }, { titleEn: contains }] } : {}) },
        take, skip, orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true, slug: true, titleNl: true, titleEn: true, descriptionNl: true,
          descriptionEn: true, coverPhotoId: true, eventDate: true, publishedAt: true,
          createdAt: true, updatedAt: true,
          photos: { orderBy: { order: "asc" }, select: { id: true, width: true, height: true, sizeBytes: true, originalName: true, takenAt: true, order: true, createdAt: true } },
        },
      });
      return page(items, input);
    }
    case "pocs": {
      const items = await prisma.poc.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ slug: contains }, { nameNl: contains }, { nameEn: contains }, { email: contains }] } : {}) },
        take, skip, orderBy: [{ order: "asc" }, { nameNl: "asc" }],
        include: { representatives: { orderBy: { order: "asc" }, select: { id: true, roleNl: true, roleEn: true, order: true, user: { select: { id: true, name: true, email: true } } } } },
      });
      return page(items, input);
    }
    case "partners": {
      const items = await prisma.partner.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ name: contains }, { url: contains }] } : {}) },
        take, skip, orderBy: [{ order: "asc" }, { name: "asc" }],
        select: { id: true, name: true, url: true, order: true, active: true, createdAt: true },
      });
      return page(items, input);
    }
    case "editorial_settings": {
      // De sleutellijst wordt hier opgebouwd, nooit uit de request overgenomen:
      // `Setting` bevat naast redactionele blokken ook `s3.config`,
      // `vault.config`, `door.config` en `brevo.lists`. Een `key`-filter uit de
      // input zou de allowlist overschrijven in plaats van ze te verfijnen.
      const requested = input.id ? [input.id] : [...SAFE_SETTING_KEYS];
      const needle = input.search?.toLowerCase();
      const keys = requested.filter((key): key is (typeof SAFE_SETTING_KEYS)[number] =>
        (SAFE_SETTING_KEYS as readonly string[]).includes(key) && (!needle || key.toLowerCase().includes(needle)),
      );
      const items = keys.length
        ? await prisma.setting.findMany({ where: { key: { in: keys } }, take, skip, orderBy: { key: "asc" } })
        : [];
      return { ...page(items, input), allowedKeys: [...SAFE_SETTING_KEYS] };
    }
    case "dashboard": {
      const items = await prisma.dashboardTile.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ label: contains }, { url: contains }] } : {}) },
        take, skip, orderBy: [{ scope: "asc" }, { order: "asc" }],
        select: { id: true, label: true, url: true, icon: true, color: true, scope: true, order: true, createdAt: true, updatedAt: true, group: { select: { code: true, nameNl: true } } },
      });
      return page(items, input);
    }
    case "shortlinks": {
      const items = await prisma.shortLink.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ slug: contains }, { url: contains }, { note: contains }] } : {}) },
        take, skip, orderBy: { createdAt: "desc" },
        select: { id: true, slug: true, url: true, enabled: true, clicks: true, note: true, expiresAt: true, createdAt: true, updatedAt: true },
      });
      return page(items, input);
    }
    case "shifts": {
      const items = await prisma.shift.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ name: contains }, { location: contains }, { description: contains }, { post: contains }] } : {}) },
        take, skip, orderBy: { startTime: "desc" },
        include: { participants: { select: { userId: true, payedOut: true, rewardPaid: true, registeredAt: true, user: { select: { name: true, email: true } } } } },
      });
      return page(items, input);
    }
    case "shift_ranking": {
      const rows = await prisma.shiftParticipant.findMany({
        take,
        skip,
        orderBy: { registeredAt: "desc" },
        select: {
          rewardPaid: true,
          payedOut: true,
          user: { select: { id: true, name: true } },
          shift: { select: { reward: true, startTime: true } },
        },
      });
      const totals = new Map<string, { userId: string; name: string; earned: number; paid: number; shifts: number }>();
      for (const row of rows) {
        const current = totals.get(row.user.id) ?? { userId: row.user.id, name: row.user.name, earned: 0, paid: 0, shifts: 0 };
        current.earned += row.shift.reward;
        current.paid += row.rewardPaid;
        current.shifts += 1;
        totals.set(row.user.id, current);
      }
      return { ...page([...totals.values()].sort((a, b) => b.earned - a.earned), input), partialAggregation: true };
    }
    case "theokot": {
      const products = await prisma.theokotProduct.findMany({ take, skip, orderBy: { order: "asc" } });
      const sessions = await prisma.theokotSession.findMany({ take, skip, orderBy: { date: "desc" }, include: { items: { orderBy: { order: "asc" } }, _count: { select: { orders: true } } } });
      const orders = await prisma.theokotOrder.findMany({ take, skip, orderBy: { createdAt: "desc" }, select: { id: true, sessionId: true, userId: true, status: true, totalCents: true, pickedUpAt: true, createdAt: true, updatedAt: true, user: { select: { name: true, email: true } }, lines: true } });
      const bans = await prisma.theokotBan.findMany({ take, skip, orderBy: { createdAt: "desc" }, include: { user: { select: { name: true, email: true } } } });
      return { resource: input.resource, products, sessions, orders, bans, limit: take, offset: skip };
    }
    case "meetings": {
      const items = await prisma.meeting.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ slug: contains }, { location: contains }, { noteNl: contains }, { noteEn: contains }] } : {}) },
        take, skip, orderBy: { startsAt: "desc" },
        include: { options: { orderBy: { order: "asc" } }, reservations: { include: { user: { select: { name: true, email: true } } } } },
      });
      return page(items, input);
    }
    case "meeting_schedule": {
      const items = await prisma.meeting.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ slug: contains }, { location: contains }] } : {}) },
        take,
        skip,
        orderBy: { startsAt: "desc" },
        select: { id: true, kind: true, year: true, semester: true, slug: true, startsAt: true, location: true, opensAt: true, useTheokot: true },
      });
      return page(items, input);
    }
    case "lesbezoeken": {
      const items = await prisma.lesbezoek.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ course: contains }, { subject: contains }, { teacherEmail: contains }, { requesterEmail: contains }] } : {}) },
        take, skip, orderBy: { startsAt: "desc" }, include: { organisation: true },
      });
      const organisations = await prisma.lesbezoekOrganisation.findMany({ orderBy: { name: "asc" } });
      const peculiarities = await prisma.lesbezoekPeculiarity.findMany({ orderBy: { subject: "asc" } });
      return { ...page(items, input), organisations, peculiarities };
    }
    case "lesbezoek_calendar": {
      const items = await prisma.lesbezoek.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ course: contains }, { subject: contains }, { audience: contains }] } : {}) },
        take,
        skip,
        orderBy: { startsAt: "desc" },
        select: {
          id: true, startsAt: true, endsAt: true, longVisit: true, audience: true,
          course: true, subject: true, teacherName: true, status: true,
          organisation: { select: { id: true, name: true, colour: true } },
        },
      });
      return page(items, input);
    }
    case "piano": {
      const windows = await prisma.pianoWindow.findMany({ take, skip, orderBy: { order: "asc" } });
      const closures = await prisma.pianoClosure.findMany({ take, skip, orderBy: { startDate: "desc" } });
      const reservations = await prisma.pianoReservation.findMany({ take, skip, orderBy: { startsAt: "desc" }, include: { user: { select: { name: true, email: true } } } });
      return { resource: input.resource, windows, closures, reservations, limit: take, offset: skip };
    }
    case "logistiek": {
      const categories = await prisma.uitleenCategory.findMany({ take, skip, orderBy: { sortIndex: "asc" }, include: { items: { orderBy: { name: "asc" }, select: { id: true, name: true, description: true, quantity: true, depositCents: true, priceCents: true, active: true, locationShelf: true, locationRack: true, condition: true } } } });
      const events = await prisma.uitleenEvent.findMany({ take, skip, orderBy: { startAt: "desc" }, include: { group: { select: { code: true, nameNl: true } }, _count: { select: { reservations: true, transport: true, extraItems: true } } } });
      const reservations = await prisma.uitleenReservation.findMany({ take, skip, orderBy: { createdAt: "desc" }, select: { id: true, userId: true, status: true, requesterType: true, requesterName: true, eventName: true, eventLocation: true, eventStart: true, pickupDate: true, returnDate: true, totalPriceCents: true, totalDepositCents: true, createdAt: true, user: { select: { name: true, email: true } }, group: { select: { code: true, nameNl: true } }, lines: true } });
      return { resource: input.resource, categories, events, reservations, limit: take, offset: skip };
    }
    case "logistiek_catalog": {
      const items = await prisma.uitleenCategory.findMany({
        where: { active: true },
        take,
        skip,
        orderBy: { sortIndex: "asc" },
        select: {
          id: true,
          name: true,
          sortIndex: true,
          items: {
            where: { active: true },
            orderBy: { name: "asc" },
            select: { id: true, name: true, description: true, quantity: true, depositCents: true, priceCents: true, isSet: true, volumeLiters: true },
          },
        },
      });
      return page(items, input);
    }
    case "door": {
      const grants = await prisma.doorAccessGrant.findMany({ take, skip, orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, name: true, email: true, rNumber: true } } } });
      const logs = await prisma.doorAccessLog.findMany({ take, skip, orderBy: { at: "desc" }, select: { id: true, at: true, userId: true, rNumber: true, cardName: true, method: true, result: true, reason: true, offline: true, user: { select: { name: true, email: true } } } });
      return { resource: input.resource, grants, logs, limit: take, offset: skip };
    }
    case "fakscanner": {
      const tallies = await prisma.fakTally.findMany({ take, skip, orderBy: [{ year: "desc" }, { points: "desc" }] });
      const failures = await prisma.fakScanLog.findMany({ take, skip, orderBy: { at: "desc" } });
      return { resource: input.resource, tallies, failures, limit: take, offset: skip };
    }
    case "module_access":
      return { resource: input.resource, permissions: RESOURCE_PERMISSIONS.module_access.map((code) => ({ code, granted: hasMcpPermission(principal, code) })) };
    case "oauth_clients": {
      const items = await prisma.oauthClient.findMany({
        where: { ...(input.id ? { clientId: input.id } : {}), ...(contains ? { OR: [{ clientId: contains }, { name: contains }, { uri: contains }] } : {}) },
        take, skip, orderBy: { clientId: "asc" },
        select: { id: true, clientId: true, disabled: true, skipConsent: true, enableEndSession: true, subjectType: true, scopes: true, referenceId: true, createdAt: true, updatedAt: true, name: true, uri: true, icon: true, contacts: true, tos: true, policy: true, redirectUris: true, postLogoutRedirectUris: true, tokenEndpointAuthMethod: true, grantTypes: true, responseTypes: true, public: true, type: true, requirePKCE: true, accessMode: true, permissionNamespace: true },
      });
      return page(items, input);
    }
    case "vault_metadata": {
      const managedAll = hasMcpPermission(principal, "vault.manage");
      const postWhere = managedAll || principal.allGroups ? undefined : { group: { code: { in: [...principal.groupCodes] } } };
      const posts = await prisma.vaultPost.findMany({ where: postWhere, take, skip, include: { group: { select: { code: true, nameNl: true } } } });
      const members = await prisma.vaultMember.findMany({
        where: managedAll || principal.allGroups ? undefined : { user: { memberships: { some: { group: { code: { in: [...principal.groupCodes] } } } } } },
        take, skip, include: { user: { select: { id: true, name: true, email: true } } },
      });
      return { resource: input.resource, posts, members, secretValuesReturned: false, limit: take, offset: skip };
    }
    case "audit_log": {
      const items = await prisma.adminAuditLog.findMany({
        where: { ...idWhere(input.id), ...(contains ? { OR: [{ actorName: contains }, { action: contains }, { entity: contains }, { target: contains }, { summary: contains }] } : {}) },
        take, skip, orderBy: { createdAt: "desc" },
      });
      return page(items, input);
    }
    case "urenloop_app": {
      const emails = await prisma.urenloopDownloadEmail.findMany({ take, skip, orderBy: { createdAt: "desc" }, select: { id: true, email: true, note: true, addedById: true, createdAt: true } });
      const devices = await prisma.urenloopDeviceToken.findMany({ take, skip, orderBy: { createdAt: "desc" }, select: { id: true, email: true, label: true, appVersion: true, lastUsedAt: true, revokedAt: true, createdAt: true } });
      return { resource: input.resource, emails, devices, tokenHashesReturned: false, limit: take, offset: skip };
    }
    case "mailing_lists": {
      const lists = await Promise.all(MAILING_LISTS.map(async (id) => {
        const recipients = await listRecipients(id);
        return {
          id,
          total: recipients.length,
          recipients: recipients.slice(skip, skip + take),
          hasMore: recipients.length > skip + take,
        };
      }));
      return { resource: input.resource, lists, limit: take, offset: skip };
    }
  }
}
