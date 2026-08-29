"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect, unstable_rethrow } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { requirePermission, requireSession } from "@/lib/session";
import {
  canCreateTicketEventForGroup,
  requireTicketEventCapability,
} from "@/lib/ticketing/authorization";
import { parseEuroAmount } from "@/lib/ticketing/money";
import { requestTicketRefund } from "@/lib/ticketing/refunds";
import { slugify } from "@/lib/ticketing/slug";
import { ticketColorKey } from "@/lib/ticketing/ticketColors";
import { geocodeAddress } from "@/lib/ticketing/geocode";
import { localDateTimeToUtc } from "@/lib/ticketing/time";
import { withSerializableTransaction } from "@/lib/ticketing/transactions";
import {
  parseTicketDesignDraft,
  readTicketDesignSettings,
  ticketDesignSettingsWith,
  type TicketDesignDraft,
} from "@/lib/ticketing/design";
import { logAudit } from "@/lib/audit";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { TICKET_TERMS_SETTING_KEY } from "@/lib/ticketing/terms";

const localeSchema = z.enum(["nl", "en"]);

/**
 * Een checkbox uit een formulier. De verborgen "false" staat vóór de checkbox in
 * de markup, zodat een uitgevinkt vakje toch een waarde meestuurt; daarom kijken
 * we naar alle waarden en niet enkel naar de eerste.
 */
function checkboxValue(formData: FormData, name: string): boolean {
  return formData.getAll(name).some((entry) => entry === "on" || entry === "true");
}
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
]);

function value(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

/**
 * De doelgroep van een ticketsoort. Alles wat we niet herkennen wordt `PUBLIC`:
 * een onbekende waarde mag nooit per ongeluk een strengere of net ruimere groep
 * opleveren dan wat de beheerder koos.
 */
function ticketAudienceFrom(raw: string): "PUBLIC" | "MEMBERS" | "HONORARY" {
  if (raw === "MEMBERS") return "MEMBERS";
  if (raw === "HONORARY") return "HONORARY";
  return "PUBLIC";
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

function codeFrom(input: string): string {
  return slugify(input).replace(/-/g, "_").toUpperCase().slice(0, 48) || randomBytes(4).toString("hex").toUpperCase();
}

function localePath(locale: "nl" | "en", path: string): string {
  return `${locale === "en" ? "/en" : ""}${path}`;
}

function coordinateValue(formData: FormData, field: string, bound: number): number | null {
  const parsed = Number.parseFloat(String(formData.get(field) ?? ""));
  return Number.isFinite(parsed) && Math.abs(parsed) <= bound ? parsed : null;
}

/** Het adresveld is optioneel en dient enkel om coördinaten te krijgen voor de
 * geofence op een walletticket; de zichtbare locatienaam blijft vrije tekst
 * ("Theokot"). Mislukt het opzoeken, dan bewaren we het adres zonder
 * coördinaten (geen geofence) in plaats van de opslag te laten falen. */
async function resolveLocationGeo(
  formData: FormData,
  event: { locationAddress: string | null; locationLatitude: number | null; locationLongitude: number | null }
): Promise<{ locationAddress: string | null; locationLatitude: number | null; locationLongitude: number | null }> {
  const next = limitedOptionalValue(formData, "locationAddress", 300)?.trim() || null;
  if (!next) return { locationAddress: null, locationLatitude: null, locationLongitude: null };

  // De adreskiezer stuurt de coördinaten van het aangeklikte adres mee; die
  // komen van dezelfde geocoder en zijn al door de beheerder bevestigd, dus we
  // zoeken niet nog eens op.
  const latitude = coordinateValue(formData, "locationLatitude", 90);
  const longitude = coordinateValue(formData, "locationLongitude", 180);
  if (latitude !== null && longitude !== null) {
    return { locationAddress: next, locationLatitude: latitude, locationLongitude: longitude };
  }

  if (next === event.locationAddress && event.locationLatitude !== null && event.locationLongitude !== null) {
    return {
      locationAddress: next,
      locationLatitude: event.locationLatitude,
      locationLongitude: event.locationLongitude,
    };
  }
  // Vrij ingetypt adres zonder keuze uit de lijst: alsnog proberen op te zoeken.
  const found = await geocodeAddress(next);
  return {
    locationAddress: next,
    locationLatitude: found?.latitude ?? null,
    locationLongitude: found?.longitude ?? null,
  };
}

function refreshTicketEvent(locale: "nl" | "en", eventId: string) {
  revalidatePath(localePath(locale, "/admin/tickets"));
  revalidatePath(localePath(locale, `/admin/tickets/${eventId}`));
  revalidatePath(localePath(locale, "/tickets"));
}

export async function saveTicketTermsAction(
  _previousState: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("tickets.manageAll");

  const version = value(formData, "version");
  const bodyNl = String(formData.get("bodyNl") ?? "").trim();
  const bodyEn = String(formData.get("bodyEn") ?? "").trim();
  if (!version || version.length > 80) return saveError("INVALID_VERSION");
  if (!bodyNl || !bodyEn || bodyNl.length > 100_000 || bodyEn.length > 100_000) {
    return saveError("INVALID_CONTENT");
  }

  const terms = { version, bodyNl, bodyEn } satisfies Prisma.InputJsonObject;
  await prisma.setting.upsert({
    where: { key: TICKET_TERMS_SETTING_KEY },
    update: { value: terms },
    create: { key: TICKET_TERMS_SETTING_KEY, value: terms },
  });
  await logAudit({
    action: "update",
    entity: "ticketTerms",
    target: "Algemene ticketvoorwaarden",
    summary: `versie ${version}`,
  });

  revalidatePath("/tickets/voorwaarden");
  revalidatePath("/en/tickets/voorwaarden");
  revalidatePath("/admin/tickets/voorwaarden");
  revalidatePath("/en/admin/tickets/voorwaarden");
  return saveOk();
}

/**
 * Titel van het ticketevent, voor een leesbare regel in het adminlogboek. De
 * ticketmodule heeft haar eigen auditlog per event (TicketAuditLog); dit is de
 * korte samenvatting die in het overzicht van álle admin-acties terechtkomt.
 */
async function ticketEventTitle(eventId: string): Promise<string> {
  const event = await prisma.ticketEvent.findUnique({
    where: { id: eventId },
    select: { titleNl: true },
  });
  return event?.titleNl ?? eventId;
}

/** Save a non-live ticket layout. The current published layout remains the one
 * copied into newly issued tickets until this draft is explicitly published. */
export async function saveTicketDesignDraftAction(
  eventId: string,
  locale: "nl" | "en",
  rawDesign: unknown
): Promise<{ revision: number | null }> {
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_EVENT");
  const draft = parseTicketDesignDraft(rawDesign, eventId);
  const revision = await withSerializableTransaction(async (tx) => {
    const current = await tx.ticketEvent.findUniqueOrThrow({
      where: { id: eventId },
      select: { settings: true },
    });
    const existing = readTicketDesignSettings(current.settings, eventId);
    await tx.ticketEvent.update({
      where: { id: eventId },
      data: { settings: ticketDesignSettingsWith(current.settings, { ...existing, draft }) as Prisma.InputJsonValue },
    });
    await tx.ticketAuditLog.create({
      data: {
        eventId,
        actorUserId: session.user.id,
        action: "TICKET_DESIGN_DRAFT_SAVED",
        entityType: "TicketEvent",
        entityId: eventId,
      },
    });
    return existing.published?.revision ?? null;
  });
  refreshTicketEvent(locale, eventId);
  return { revision };
}

/** Publishing is atomic with saving the draft, and advances the immutable
 * revision that is copied onto tickets at payment fulfilment. */
export async function publishTicketDesignAction(
  eventId: string,
  locale: "nl" | "en",
  rawDesign: unknown
): Promise<{ revision: number }> {
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_EVENT");
  const draft: TicketDesignDraft = parseTicketDesignDraft(rawDesign, eventId);
  const revision = await withSerializableTransaction(async (tx) => {
    const current = await tx.ticketEvent.findUniqueOrThrow({
      where: { id: eventId },
      select: { settings: true },
    });
    const existing = readTicketDesignSettings(current.settings, eventId);
    const published = {
      ...draft,
      revision: (existing.published?.revision ?? 0) + 1,
      publishedAt: new Date().toISOString(),
    };
    await tx.ticketEvent.update({
      where: { id: eventId },
      data: { settings: ticketDesignSettingsWith(current.settings, { draft, published }) as Prisma.InputJsonValue },
    });
    await tx.ticketAuditLog.create({
      data: {
        eventId,
        actorUserId: session.user.id,
        action: "TICKET_DESIGN_PUBLISHED",
        entityType: "TicketEvent",
        entityId: eventId,
        metadata: { revision: published.revision },
      },
    });
    return published.revision;
  });
  await logAudit({
    action: "publish",
    entity: "ticketDesign",
    entityId: eventId,
    target: await ticketEventTitle(eventId),
    summary: `ticketontwerp gepubliceerd (revisie ${revision})`,
  });
  refreshTicketEvent(locale, eventId);
  return { revision };
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
  // Naam en prijs van het eerste tickettype. Een prijs van 0 is geldig: gratis
  // tickets bestaan (inschrijvingen, ledenactiviteiten).
  const firstTicketName =
    limitedValue(formData, "firstTicketName", 160) || (locale === "nl" ? "Standaardticket" : "Standard ticket");
  const firstTicketPriceCents = parseEuroAmount(formData.get("firstTicketPrice") ?? "0");
  if (firstTicketPriceCents > 99_999_999) throw new Error("INVALID_AMOUNT");
  const salesStartAt = dateValue(formData, "salesStartAt");
  const salesEndAt = dateValue(formData, "salesEndAt");
  if (salesStartAt && salesEndAt && salesEndAt <= salesStartAt) {
    throw new Error("INVALID_SALES_DATES");
  }
  const requestedSlug = slugify(value(formData, "slug") || titleNl) || `event-${randomBytes(4).toString("hex")}`;
  const slugExists = await prisma.ticketEvent.findUnique({ where: { slug: requestedSlug } });
  const slug = slugExists ? `${requestedSlug}-${randomBytes(3).toString("hex")}` : requestedSlug;
  const createdLocationGeo = await resolveLocationGeo(formData, { locationAddress: null, locationLatitude: null, locationLongitude: null });

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
        ...createdLocationGeo,
        startsAt,
        endsAt,
        salesStartAt,
        salesEndAt,
        maxTicketsPerOrder: boundedIntegerValue(formData, "maxTicketsPerOrder", 8, 1, 50),
        cardCheckIn: checkboxValue(formData, "cardCheckIn"),
        contactEmail: emailValue(formData, "contactEmail"),
        createdById: session.user.id,
      },
    });
    const pool = await tx.ticketInventoryPool.create({
      data: {
        eventId: created.id,
        code: "GENERAL",
        nameNl: "Algemene capaciteit",
        nameEn: "General capacity",
        capacity,
      },
    });
    // Het eerste tickettype hoort bij het aanmaken, niet bij een tweede ronde in
    // de instellingen: een event met een voorraadpot maar zonder tickettype is
    // niet publiceerbaar en verkoopt niets, dus dat is geen zinvolle tussenstand.
    await tx.ticketType.create({
      data: {
        eventId: created.id,
        inventoryPoolId: pool.id,
        code: "STANDARD",
        nameNl: firstTicketName,
        unitPriceCents: firstTicketPriceCents,
        maxPerOrder: boundedIntegerValue(formData, "maxTicketsPerOrder", 8, 1, 50),
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

  await logAudit({
    action: "create",
    entity: "ticketEvent",
    entityId: event.id,
    target: titleNl,
    summary: `capaciteit ${capacity}, eerste tickettype "${firstTicketName}"`,
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

  // Hangt er een kalenderevent aan, dan zijn titel, beschrijving, locatie en
  // datums daarvan; het formulier toont ze dan als overgenomen en stuurt ze niet
  // mee. Zonder deze uitzondering zou opslaan ze op null zetten.
  const linked = event.calendarEventId
    ? await prisma.calendarEvent.findUnique({ where: { id: event.calendarEventId } })
    : null;

  const startsAt = linked?.start ?? dateValue(formData, "startsAt") ?? event.startsAt;
  const endsAt = linked?.end ?? dateValue(formData, "endsAt") ?? event.endsAt;
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
  const locationGeo = await resolveLocationGeo(formData, event);

  await prisma.$transaction(async (tx) => {
    await tx.ticketEvent.update({
      where: { id: eventId },
      data: {
        slug: nextSlug,
        titleNl: linked?.titleNl ?? (limitedValue(formData, "titleNl", 200) || event.titleNl),
        titleEn: linked ? linked.titleEn : limitedOptionalValue(formData, "titleEn", 200),
        descriptionNl: linked
          ? linked.descriptionNl
          : limitedOptionalValue(formData, "descriptionNl", 20_000),
        descriptionEn: linked
          ? linked.descriptionEn
          : limitedOptionalValue(formData, "descriptionEn", 20_000),
        location: linked ? linked.location : limitedOptionalValue(formData, "location", 300),
        ...locationGeo,
        startsAt,
        endsAt,
        salesStartAt,
        salesEndAt,
        status,
        maxTicketsPerOrder,
        cardCheckIn: checkboxValue(formData, "cardCheckIn"),
        contactEmail: emailValue(formData, "contactEmail"),
        confirmationMessageNl: limitedOptionalValue(formData, "confirmationMessageNl", 5_000),
        confirmationMessageEn: limitedOptionalValue(formData, "confirmationMessageEn", 5_000),
        publishedAt: status === "PUBLISHED" ? event.publishedAt ?? new Date() : event.publishedAt,
        archivedAt: status === "ARCHIVED" ? new Date() : null,
      },
    });
    // Een gearchiveerd event heeft de r-nummers niet meer nodig: ze dienden enkel
    // om een gescande studentenkaart aan de deur tot een ticket te herleiden.
    // Zonder deze opkuis blijft de deelnemerslijst van elke cantus onbeperkt een
    // lijst KU Leuven-nummers. Zie docs/privacy-processors.md.
    if (status === "ARCHIVED" && event.status !== "ARCHIVED") {
      await tx.ticketOrderItem.updateMany({
        where: { eventId, rNumber: { not: null } },
        data: { rNumber: null },
      });
    }
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
  await logAudit({
    action: "update",
    entity: "ticketEvent",
    entityId: eventId,
    target: await ticketEventTitle(eventId),
    summary: status === event.status ? "instellingen bewerkt" : `status gezet op ${status}`,
  });
  refreshTicketEvent(locale, eventId);
}

export type PublishTicketEventResult = { ok: true } | { ok: false; error: string };

/**
 * Zet een ticketevent live.
 *
 * Bestond eerst niet: publiceren betekende de status in een keuzelijst ergens
 * halverwege een lang formulier omzetten en dan onderaan opslaan, waarbij je de
 * blokkade ("er is nog geen actief tickettype") pas ná het opslaan te zien kreeg.
 * Als eigen actie kan de knop vooraf zeggen waarom ze niet kan.
 */
export async function publishTicketEventAction(
  formData: FormData,
): Promise<PublishTicketEventResult> {
  const eventId = value(formData, "eventId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  try {
    const { session, event } = await requireTicketEventCapability(eventId, "MANAGE_EVENT");
    const activeTypes = await prisma.ticketType.count({ where: { eventId, active: true } });
    if (activeTypes === 0) return { ok: false, error: "TICKET_TYPE_REQUIRED_TO_PUBLISH" };

    await prisma.$transaction(async (tx) => {
      await tx.ticketEvent.update({
        where: { id: eventId },
        data: { status: "PUBLISHED", publishedAt: event.publishedAt ?? new Date() },
      });
      await tx.ticketAuditLog.create({
        data: {
          eventId,
          actorUserId: session.user.id,
          action: "EVENT_UPDATED",
          entityType: "TicketEvent",
          entityId: eventId,
          metadata: { status: "PUBLISHED" },
        },
      });
    });
    await logAudit({
      action: "publish",
      entity: "ticketEvent",
      entityId: eventId,
      target: event.titleNl,
      summary: "ticketverkoop live gezet",
    });
    refreshTicketEvent(locale, eventId);
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    const code = error instanceof Error ? error.message : "";
    if (code === "FORBIDDEN") return { ok: false, error: code };
    console.error("Publishing ticket event failed", error);
    throw error;
  }
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
  await logAudit({
    action: "update",
    entity: "ticketEvent",
    entityId: eventId,
    target: await ticketEventTitle(eventId),
    summary: `voorraadpot "${pool.nameNl}" op capaciteit ${capacity}`,
  });
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
        audience: ticketAudienceFrom(value(formData, "audience")),
        color: ticketColorKey(formData.get("color")),
        salesStartAt,
        salesEndAt,
        minPerOrder,
        maxPerOrder,
        sortOrder:
          integerValue(formData, "sortOrder", -1) >= 0
            ? integerValue(formData, "sortOrder", 0)
            : ((await tx.ticketType.findFirst({
                where: { eventId },
                orderBy: { sortOrder: "desc" },
                select: { sortOrder: true },
              }))?.sortOrder ?? -1) + 1,
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
  await logAudit({
    action: "create",
    entity: "ticketType",
    entityId: eventId,
    target: `${event.titleNl}: ${nameNl}`,
    summary: `${(unitPriceCents / 100).toFixed(2)} euro per ticket`,
  });
  refreshTicketEvent(locale, eventId);
}

export async function reorderTicketTypesAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  await requireTicketEventCapability(eventId, "MANAGE_INVENTORY");
  const ids = formData.getAll("ids").map(String);
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.ticketType.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );
  await logAudit({
    action: "reorder",
    entity: "ticketType",
    entityId: eventId,
    target: `${await ticketEventTitle(eventId)}`,
    summary: "volgorde van tickettypes gewijzigd",
  });
  refreshTicketEvent(locale, eventId);
}

/**
 * De kleur van een bestaand tickettype. Apart van het aanmaken, want een
 * tickettype is verder niet bewerkbaar en de kleur is precies het veld dat je
 * pas wil kiezen wanneer de drie types naast elkaar staan (water, bier, eigen
 * drank aan een cantus).
 */
export async function saveTicketTypeColorAction(
  _previousState: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const eventId = value(formData, "eventId");
  const ticketTypeId = value(formData, "ticketTypeId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_INVENTORY");
  const type = await prisma.ticketType.findFirst({ where: { id: ticketTypeId, eventId } });
  if (!type) return saveError("TICKET_TYPE_NOT_FOUND");

  const color = ticketColorKey(formData.get("color"));
  if (color === type.color) return saveOk();

  await prisma.$transaction([
    prisma.ticketType.update({ where: { id: type.id }, data: { color } }),
    prisma.ticketAuditLog.create({
      data: {
        eventId,
        actorUserId: session.user.id,
        action: "TICKET_TYPE_UPDATED",
        entityType: "TicketType",
        entityId: type.id,
        metadata: { color },
      },
    }),
  ]);
  await logAudit({
    action: "update",
    entity: "ticketType",
    entityId: eventId,
    target: `${await ticketEventTitle(eventId)}: ${type.nameNl}`,
    summary: `kleur op ${color}`,
  });
  refreshTicketEvent(locale, eventId);
  return saveOk();
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
  await logAudit({
    action: "delete",
    entity: "ticketType",
    entityId: eventId,
    target: `${await ticketEventTitle(eventId)}: ${type.nameNl}`,
    summary: "tickettype gearchiveerd; verkochte tickets blijven geldig",
  });
  refreshTicketEvent(locale, eventId);
}

/**
 * Het r-nummer van één deelnemer, vanuit de deelnemerspagina.
 *
 * De kassa vult enkel het nummer van de **ingelogde koper** in; wie voor vier man
 * bestelt, laat er drie leeg. Dit is de plek waar die aangevuld worden, en waar
 * een tikfout rechtgezet wordt. Leeg opslaan wist het nummer weer.
 *
 * Een dubbel r-nummer is een verwachte invoerfout en komt als foutcode terug, niet
 * als een gegooide serverfout: twee tickets met hetzelfde nummer zouden een
 * gescande kaart dubbelzinnig maken, maar dat is iets om te tonen en niet om de
 * pagina op te laten crashen.
 */
export async function saveAttendeeRNumberAction(
  _previousState: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const eventId = value(formData, "eventId");
  const orderItemId = value(formData, "orderItemId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_EVENT");
  const item = await prisma.ticketOrderItem.findFirst({ where: { id: orderItemId, eventId } });
  if (!item) return saveError("ATTENDEE_NOT_FOUND");

  const raw = value(formData, "rNumber").trim().toLowerCase();
  if (raw && !/^[ru]\d{7}$/.test(raw)) return saveError("INVALID_R_NUMBER");
  const rNumber = raw || null;
  if (rNumber === item.rNumber) return saveOk();

  if (rNumber) {
    const taken = await prisma.ticketOrderItem.findFirst({
      where: { eventId, rNumber, id: { not: orderItemId } },
      select: { attendeeName: true },
    });
    if (taken) {
      return saveError(
        "R_NUMBER_TAKEN",
        locale === "nl"
          ? `Niet opgeslagen: ${rNumber} hangt al aan het ticket van ${taken.attendeeName}.`
          : `Not saved: ${rNumber} is already on the ticket of ${taken.attendeeName}.`,
      );
    }
  }

  await prisma.$transaction([
    prisma.ticketOrderItem.update({ where: { id: item.id }, data: { rNumber } }),
    prisma.ticketAuditLog.create({
      data: {
        eventId,
        actorUserId: session.user.id,
        action: "ATTENDEE_UPDATED",
        entityType: "TicketOrderItem",
        entityId: item.id,
        // Bewust niet het nummer zelf: het auditlogboek overleeft het archiveren
        // van het event, en dan is de opkuis van de r-nummers zinloos.
        metadata: { rNumber: rNumber ? "set" : "cleared" },
      },
    }),
  ]);
  revalidatePath(localePath(locale, `/admin/tickets/${eventId}/deelnemers`));
  return saveOk();
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
      sortOrder:
        integerValue(formData, "sortOrder", -1) >= 0
          ? integerValue(formData, "sortOrder", 0)
          : ((await prisma.ticketQuestion.findFirst({
              where: { eventId },
              orderBy: { sortOrder: "desc" },
              select: { sortOrder: true },
            }))?.sortOrder ?? -1) + 1,
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
  await logAudit({
    action: "create",
    entity: "ticketQuestion",
    entityId: eventId,
    target: `${await ticketEventTitle(eventId)}: ${labelNl}`,
  });
  refreshTicketEvent(locale, eventId);
}

export async function reorderTicketQuestionsAction(formData: FormData): Promise<void> {
  const eventId = value(formData, "eventId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  await requireTicketEventCapability(eventId, "MANAGE_EVENT");
  const ids = formData.getAll("ids").map(String);
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.ticketQuestion.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );
  await logAudit({
    action: "reorder",
    entity: "ticketQuestion",
    entityId: eventId,
    target: `${await ticketEventTitle(eventId)}`,
    summary: "volgorde van deelnemersvragen gewijzigd",
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
  await logAudit({
    action: "delete",
    entity: "ticketQuestion",
    entityId: eventId,
    target: `${await ticketEventTitle(eventId)}: ${question.labelNl}`,
    summary: "vraag gearchiveerd; gegeven antwoorden blijven bewaard",
  });
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
    const group = await prisma.group.findUnique({
      where: { id: groupId },
      select: { nameNl: true },
    });
    await logAudit({
      action: "grant",
      entity: "ticketAccess",
      entityId: eventId,
      target: await ticketEventTitle(eventId),
      summary: `post ${group?.nameNl ?? groupId} kreeg de rol ${role} (${
        scope === "LEADS_ONLY" ? "enkel de verantwoordelijke" : "elk lid"
      })`,
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
    await logAudit({
      action: "grant",
      entity: "ticketAccess",
      entityId: eventId,
      target: await ticketEventTitle(eventId),
      summary: `${user.name} kreeg de rol ${role}`,
    });
  }
  refreshTicketEvent(locale, eventId);
}

/**
 * De standaardregel per event aan- of uitzetten.
 *
 * Staat ze aan, dan kan elke praesidiumpost dit event scannen (en bij een event
 * van een werkgroep ook die werkgroep zelf), zonder dat er een grant voor hen
 * staat. Uit zetten doe je voor een gastenlijst die niet bij iedereen hoort te
 * liggen: wie kan scannen, krijgt met het offline-manifest de namen van alle
 * deelnemers op zijn toestel.
 */
export async function setTicketOpenScanningAction(
  _previousState: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const eventId = value(formData, "eventId");
  const locale = localeSchema.parse(value(formData, "locale") || "nl");
  const open = value(formData, "openScanning") === "1";
  const { session } = await requireTicketEventCapability(eventId, "MANAGE_ACCESS");

  await prisma.ticketEvent.update({ where: { id: eventId }, data: { openScanning: open } });
  await prisma.ticketAuditLog.create({
    data: {
      eventId,
      actorUserId: session.user.id,
      action: open ? "ACCESS_GRANTED" : "ACCESS_REVOKED",
      entityType: "TicketEvent",
      entityId: eventId,
      metadata: { openScanning: open },
    },
  });
  await logAudit({
    action: "update",
    entity: "ticketAccess",
    entityId: eventId,
    target: await ticketEventTitle(eventId),
    summary: open
      ? "elke post mag dit event scannen"
      : "enkel wie een toekenning heeft, mag dit event scannen",
  });

  refreshTicketEvent(locale, eventId);
  return saveOk();
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
  await logAudit({
    action: "revoke",
    entity: "ticketAccess",
    entityId: eventId,
    target: await ticketEventTitle(eventId),
    summary: isGroup ? "toegang van een post ingetrokken" : "toegang van een persoon ingetrokken",
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
  await logAudit({
    action: "create",
    entity: "ticketGate",
    entityId: eventId,
    target: `${await ticketEventTitle(eventId)}: ${name}`,
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
  await logAudit({
    action: "update",
    entity: "ticketGate",
    entityId: eventId,
    target: await ticketEventTitle(eventId),
    summary: active ? "scanpoort aangezet" : "scanpoort uitgezet",
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
    await logAudit({
      action: "revoke",
      entity: "ticketScanDevice",
      entityId: eventId,
      target: `${await ticketEventTitle(eventId)}: ${device.label}`,
      summary: "scantoestel ingetrokken",
    });
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
  await logAudit({
    action: "send",
    entity: "ticketOrder",
    entityId: orderId,
    target: order.buyerEmail,
    summary: `bevestigingsmail opnieuw verstuurd voor ${await ticketEventTitle(eventId)}`,
  });
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
  await logAudit({
    action: "refund",
    entity: "ticketOrder",
    entityId: orderId,
    target: await ticketEventTitle(eventId),
    summary: `${orderItemIds.length} ticket(s) terugbetaald`,
  });
  refreshTicketEvent(locale, eventId);
  revalidatePath(localePath(locale, `/admin/tickets/${eventId}/bestellingen`));
}
