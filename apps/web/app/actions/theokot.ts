"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { Prisma, type TheokotOrderStatus } from "@prisma/client";
import { requirePermission, requireSession } from "@/lib/session";
import {
  brusselsTimeOnDay,
  brusselsYMD,
  canCancel,
  canOrderNow,
  coerceItemLayout,
  validateOrderLines,
  TheokotValidationError,
  type OrderLineInput,
} from "@/lib/theokot";
import { readImageField, resolveImageKey, type ImageFieldValue } from "@/lib/imageField";
import { activeBanFor, getTheokotConfig } from "@/lib/theokot-server";
import {
  syncMeetingsForSession,
  syncMeetingsOnDay,
  usageForSessionItemsTx,
} from "@/lib/meetings-server";
import { resolveStudentCard } from "@/lib/student-card";
import {
  allocateUserShiftReward,
  ShiftRewardConflictError,
} from "@/lib/shift/rewards.server";
import { outstandingShiftReward } from "@/lib/shift/rewards";
import { withSerializableTransaction } from "@/lib/ticketing/transactions";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { logAudit } from "@/lib/audit";
import { createShift } from "@/lib/shift/server";
import { theokotShiftsForDay, theokotShiftPost } from "@/lib/shift/templates";
import { shiftYMD } from "@/lib/brussels";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

/** Dag als datum in Brussel, voor in een logregel. */
function formatDay(date: Date): string {
  return new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Eén verkoopdag, zoals ze in het adminlogboek genoemd wordt. */
function sessionLabel(date: Date): string {
  return `Verkoopdag ${formatDay(date)}`;
}

const ADMIN_PATH = "/admin/theokot";

// -----------------------------------------------------------------------------
// Hulpfuncties
// -----------------------------------------------------------------------------

/** "2,60" / "2.60" / "€2,60" → 260 eurocent. Geeft null bij ongeldige invoer. */
function euroToCents(raw: unknown): number | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.replace(/[€\s]/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** "YYYY-MM-DD" → Date op Brussel-middernacht (opgeslagen als sessie-`date`). */
function parseDayToBrusselsMidnight(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const dt = brusselsTimeOnDay(new Date(`${value}T12:00:00Z`), "00:00");
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function revalidateTheokot() {
  revalidatePath(ADMIN_PATH);
  // Een gewijzigd aanbod verandert wat een vergadering nog kan bestellen.
  revalidatePath("/grocomeet");
  revalidatePath("/en/grocomeet");
  revalidatePath("/admin/grocomeet");
  revalidatePath("/admin/bureau");
  revalidatePath("/admin/theokot/turflijst");
  revalidatePath("/admin/theokot/afhalen");
  revalidatePath("/en/admin/theokot/afhalen");
  revalidatePath("/theokot");
  revalidatePath("/en/theokot");
  revalidatePath("/theokot/balie");
  revalidatePath("/en/theokot/balie");
  revalidatePath("/");
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
function validTime(value: unknown, fallback: string): string {
  return typeof value === "string" && TIME_RE.test(value) ? value : fallback;
}

type OfferingRow = {
  /** Leeg voor een nieuwe rij. */
  id: string;
  nameNl: string;
  nameEn: string | null;
  priceCents: number;
  quantity: number;
  isWeeklySpecial: boolean;
  ingredientsNl: string | null;
  ingredientsEn: string | null;
  /** Wat het foto-veld wil: bewaren, vervangen of wissen (zie `readImageField`). */
  image: Exclude<ImageFieldValue, { kind: "invalid" }>;
  order: number;
};

/** Eén aanbod-item zoals het in een nieuwe sessie terechtkomt (foto al opgelost). */
type OfferingSnapshot = Omit<OfferingRow, "id" | "image"> & { imageKey: string | null };

/**
 * Leest de geïndexeerde aanbodvelden
 * (`<prefix>-<i>-{id,nameNl,nameEn,price,quantity,weekly,ingredientsNl,ingredientsEn,imageKey}`)
 * uit één van de twee editors: `item-` voor een sessie-aanbod, `product-` voor de
 * catalogus. Rijen zonder Nederlandse naam vallen weg; ze zijn leeg gelaten.
 *
 * Geeft `null` terug wanneer een foto-key niet uit de upload-route komt: dat is
 * geknoei met het verborgen veld en geen invoerfout die we stilzwijgend negeren.
 */
function parseOfferingRows(
  formData: FormData,
  prefix: "item" | "product",
  countField: "itemCount" | "productCount",
): OfferingRow[] | null {
  const count = Number(formData.get(countField)) || 0;
  const rows: OfferingRow[] = [];
  for (let i = 0; i < count; i += 1) {
    const nameNl = ((formData.get(`${prefix}-${i}-nameNl`) as string) || "").trim();
    if (!nameNl) continue;
    const image = readImageField(formData, `${prefix}-${i}-imageKey`);
    if (image.kind === "invalid") return null;
    rows.push({
      id: (formData.get(`${prefix}-${i}-id`) as string) || "",
      nameNl,
      nameEn: ((formData.get(`${prefix}-${i}-nameEn`) as string) || "").trim() || null,
      priceCents: euroToCents(formData.get(`${prefix}-${i}-price`)) ?? 0,
      quantity: Math.max(0, Number(formData.get(`${prefix}-${i}-quantity`)) || 0),
      isWeeklySpecial: formData.get(`${prefix}-${i}-weekly`) === "on",
      ingredientsNl: ((formData.get(`${prefix}-${i}-ingredientsNl`) as string) || "").trim() || null,
      ingredientsEn: ((formData.get(`${prefix}-${i}-ingredientsEn`) as string) || "").trim() || null,
      image,
      order: rows.length,
    });
  }
  return rows;
}

// -----------------------------------------------------------------------------
// Beheer: verkoopsessies aanmaken (volgende week)
// -----------------------------------------------------------------------------

/**
 * Maakt verkoopsessies aan voor de opgegeven dagen met hetzelfde aanbod én
 * dezelfde uren voor de hele week. `weekStart` is de maandag (YYYY-MM-DD); `days`
 * een lijst van dag-offsets (0=ma … 6=zo). De uren (`pickupStart/End`,
 * `orderCloseTime`, `orderOpenTime`) en het aanbod komen uit het formulier;
 * ontbreekt het aanbod, dan valt het terug op de actieve catalogus. Bestaande
 * dagen (zelfde datum) worden overgeslagen; nadien kan je alles per dag aanpassen.
 */
export async function createWeekSessionsAction(formData: FormData): Promise<void> {
  const session = await requirePermission("theokot.manage");
  const weekStart = parseDayToBrusselsMidnight(formData.get("weekStart") as string | null);
  if (!weekStart) throw new Error("Ongeldige weekstart");

  const dayValues = formData.getAll("days").map((d) => Number(d)).filter((n) => n >= 0 && n <= 6);
  const days = dayValues.length > 0 ? dayValues : [0, 1, 2, 3, 4];

  const config = await getTheokotConfig();
  const pickupStart = validTime(formData.get("pickupStart"), config.pickupDefaultStart);
  const pickupEnd = validTime(formData.get("pickupEnd"), config.pickupDefaultEnd);
  const orderCloseTime = validTime(formData.get("orderCloseTime"), config.cancelDeadline);
  const orderOpenTime = validTime(formData.get("orderOpenTime"), config.orderOpenTime);

  // Aanbod uit het formulier; valt terug op de actieve catalogus als er niets meekomt.
  const rows = parseOfferingRows(formData, "item", "itemCount");
  if (!rows) throw new Error("Ongeldige foto bij het aanbod");
  let offering: OfferingSnapshot[] = rows.map((row) => ({
    nameNl: row.nameNl,
    nameEn: row.nameEn,
    priceCents: row.priceCents,
    quantity: row.quantity,
    isWeeklySpecial: row.isWeeklySpecial,
    ingredientsNl: row.ingredientsNl,
    ingredientsEn: row.ingredientsEn,
    imageKey: resolveImageKey(row.image, null),
    order: row.order,
  }));
  if (offering.length === 0) {
    const products = await prisma.theokotProduct.findMany({ where: { active: true }, orderBy: { order: "asc" } });
    offering = products.map((p, i) => ({
      nameNl: p.nameNl,
      nameEn: p.nameEn,
      priceCents: p.priceCents,
      quantity: p.defaultQuantity,
      isWeeklySpecial: p.isWeeklySpecialSlot,
      ingredientsNl: p.ingredientsNl,
      ingredientsEn: p.ingredientsEn,
      imageKey: p.imageKey,
      order: i,
    }));
  }

  const startYmd = brusselsYMD(weekStart);
  let createdDays = 0;
  let createdShifts = 0;
  for (const offset of days) {
    const dayMidnight = brusselsTimeOnDay(
      new Date(Date.UTC(startYmd.year, startYmd.month - 1, startYmd.day, 12) + offset * 86400000),
      "00:00",
    );
    const existing = await prisma.theokotSession.findUnique({ where: { date: dayMidnight } });
    if (existing) continue;

    // orderOpenAt = orderOpenTime op de dag `orderLeadDays` vóór de verkoopdag.
    const dm = brusselsYMD(dayMidnight);
    const leadDay = new Date(Date.UTC(dm.year, dm.month - 1, dm.day, 12) - config.orderLeadDays * 86400000);

    await prisma.theokotSession.create({
      data: {
        date: dayMidnight,
        isOpen: true,
        pickupStart: brusselsTimeOnDay(dayMidnight, pickupStart),
        pickupEnd: brusselsTimeOnDay(dayMidnight, pickupEnd),
        orderCloseAt: brusselsTimeOnDay(dayMidnight, orderCloseTime),
        orderOpenAt: brusselsTimeOnDay(leadDay, orderOpenTime),
        createdById: session.user.id,
        items: {
          create: offering.map((it) => ({
            nameNl: it.nameNl,
            nameEn: it.nameEn,
            priceCents: it.priceCents,
            quantity: it.quantity,
            isWeeklySpecial: it.isWeeklySpecial,
            ingredientsNl: it.ingredientsNl,
            ingredientsEn: it.ingredientsEn,
            imageKey: it.imageKey,
            order: it.order,
          })),
        },
      },
    });

    // Reservaties voor een grocomeet of bureau op deze dag zijn weken geleden
    // uit de catalogus gekozen. Nu het aanbod van die dag bestaat, koppelen we
    // ze eraan; wat er niet op staat, wordt ongeldig en de persoon krijgt een mail.
    await syncMeetingsOnDay(dayMidnight);
    createdDays += 1;

    // Een verkoopdag moet ook bemand worden: smeren, middag en namiddag. Die
    // shiften apart moeten aanmaken werd stelselmatig vergeten, en een
    // verkoopdag zonder shifters is een dag waarop niemand de balie doet.
    // De uren volgen het afhaaluur van déze dag, niet het vaste uur uit het
    // sjabloon.
    //
    // Staat er al een Theokot-shift op die dag, dan blijft die met rust: iemand
    // heeft ze dan met de hand of via het sjabloonscherm gezet, en er twee
    // reeksen bovenop elkaar leggen kost inschrijvingen.
    const nextDay = shiftYMD(brusselsYMD(dayMidnight), 1);
    const alreadyStaffed = await prisma.shift.findFirst({
      where: {
        post: theokotShiftPost(),
        startTime: {
          gte: dayMidnight,
          lt: brusselsTimeOnDay(new Date(Date.UTC(nextDay.year, nextDay.month - 1, nextDay.day, 12)), "00:00"),
        },
      },
      select: { id: true },
    });

    if (!alreadyStaffed) {
      for (const shift of theokotShiftsForDay(dayMidnight, pickupStart)) {
        // Zonder eigen logregel: hieronder staat er één voor de hele week.
        await createShift(shift, { audit: false });
        createdShifts += 1;
      }
    }
  }

  await logAudit({
    action: "create",
    entity: "theokotSession",
    target: `Verkoopweek van ${formatDay(weekStart)}`,
    summary:
      `${createdDays} nieuwe verkoopdag(en) met ${offering.length} broodje(s); ` +
      `${createdShifts} shift(en) aangemaakt; bestaande dagen overgeslagen`,
  });

  revalidateTheokot();
}

// -----------------------------------------------------------------------------
// Beheer: één sessie bewerken (uren, open/dicht, broodje van de week)
// -----------------------------------------------------------------------------

export async function updateSessionAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("theokot.manage");
  const id = formData.get("sessionId") as string;
  const existing = await prisma.theokotSession.findUnique({ where: { id } });
  if (!existing) return saveError("SESSION_NOT_FOUND");

  const isOpen = formData.get("isOpen") === "on";
  const pickupStart = (formData.get("pickupStart") as string) || null;
  const pickupEnd = (formData.get("pickupEnd") as string) || null;
  const orderCloseTime = (formData.get("orderCloseTime") as string) || null;
  const orderOpenAtRaw = (formData.get("orderOpenAt") as string) || null;

  const data: Prisma.TheokotSessionUpdateInput = { isOpen };
  if (pickupStart) data.pickupStart = brusselsTimeOnDay(existing.date, pickupStart);
  if (pickupEnd) data.pickupEnd = brusselsTimeOnDay(existing.date, pickupEnd);
  if (orderCloseTime) data.orderCloseAt = brusselsTimeOnDay(existing.date, orderCloseTime);
  if (orderOpenAtRaw) {
    // datetime-local levert "YYYY-MM-DDTHH:mm" zonder tijdzone; interpreteer die
    // als Brussel-wandkloktijd (niet de server-tijdzone).
    const m = orderOpenAtRaw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (m) data.orderOpenAt = brusselsTimeOnDay(new Date(`${m[1]}T12:00:00Z`), m[2]);
  }

  await prisma.theokotSession.update({ where: { id }, data });
  await logAudit({
    action: "update",
    entity: "theokotSession",
    entityId: id,
    target: sessionLabel(existing.date),
    summary: existing.isOpen === isOpen ? "uren gewijzigd" : isOpen ? "opengezet" : "dichtgezet",
  });
  // Een dag dichtzetten of verplaatsen raakt ook de vergaderingen van die dag.
  await syncMeetingsForSession(id);
  revalidateTheokot();
  return saveOk();
}

/**
 * Vervangt het aanbod van een sessie. Items worden meegestuurd als geïndexeerde
 * velden `item-<i>-{id,nameNl,nameEn,price,quantity,weekly,ingredientsNl,ingredientsEn,imageKey}`.
 * Bestaande items die niet meer voorkomen worden verwijderd tenzij ze al
 * bestellijnen hebben (dan blijven ze staan om historiek niet te breken).
 */
export async function updateSessionItemsAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("theokot.manage");
  const sessionId = formData.get("sessionId") as string;
  const existing = await prisma.theokotSession.findUnique({
    where: { id: sessionId },
    include: { items: { include: { _count: { select: { lines: true } } } } },
  });
  if (!existing) throw new Error("Sessie niet gevonden");

  const rows = parseOfferingRows(formData, "item", "itemCount");
  if (!rows) return saveError("INVALID_IMAGE");

  const currentKeys = new Map(existing.items.map((i) => [i.id, i.imageKey]));
  const keepIds = new Set<string>();

  for (const row of rows) {
    const { id, image, order, ...fields } = row;
    if (id) {
      keepIds.add(id);
      await prisma.theokotSessionItem.update({
        where: { id },
        data: { ...fields, imageKey: resolveImageKey(image, currentKeys.get(id) ?? null), order },
      });
    } else {
      await prisma.theokotSessionItem.create({
        data: { sessionId, ...fields, imageKey: resolveImageKey(image, null), order },
      });
    }
  }

  // Verwijder weggelaten items die nog geen bestellingen hebben.
  for (const item of existing.items) {
    if (!keepIds.has(item.id) && item._count.lines === 0) {
      await prisma.theokotSessionItem.delete({ where: { id: item.id } });
    }
  }

  await logAudit({
    action: "update",
    entity: "theokotSession",
    entityId: sessionId,
    target: sessionLabel(existing.date),
    summary: `aanbod aangepast naar ${rows.length} broodje(s)`,
  });

  // Dit is precies het geval waarvoor het uitlijnen bestaat: een week met een
  // ander aanbod dan de catalogus. Wie een broodje reserveerde dat er nu niet
  // meer is, krijgt een mail en een melding om opnieuw te kiezen.
  await syncMeetingsForSession(sessionId);

  revalidateTheokot();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Beheer: configuratie, custom bericht, openingsuren
// -----------------------------------------------------------------------------

export async function saveConfigAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("theokot.manage");
  const num = (key: string, min = 0) => Math.max(min, Number(formData.get(key)) || 0);
  const time = (key: string, fallback: string) => {
    const v = (formData.get(key) as string) || "";
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(v) ? v : fallback;
  };
  const value = {
    maxItemsPerOrder: num("maxItemsPerOrder", 1),
    maxWeeklySpecialPerOrder: num("maxWeeklySpecialPerOrder", 0),
    orderLeadDays: num("orderLeadDays", 0),
    orderOpenTime: time("orderOpenTime", "12:00"),
    cancelDeadline: time("cancelDeadline", "10:30"),
    pickupDefaultStart: time("pickupDefaultStart", "12:00"),
    pickupDefaultEnd: time("pickupDefaultEnd", "16:00"),
    noShowGraceMinutes: num("noShowGraceMinutes", 0),
    noShowThreshold: num("noShowThreshold", 1),
    banDurationDays: num("banDurationDays", 1),
    itemLayout: coerceItemLayout(formData.get("itemLayout")),
  };
  await prisma.setting.upsert({
    where: { key: "theokot.config" },
    update: { value },
    create: { key: "theokot.config", value },
  });
  await logAudit({
    action: "update",
    entity: "theokotSettings",
    target: "Theokot-instellingen",
    summary: `max ${value.maxItemsPerOrder} per bestelling, bestellen opent om ${value.orderOpenTime}, annuleren tot ${value.cancelDeadline}, ban van ${value.banDurationDays} dag(en)`,
  });
  revalidatePath(`${ADMIN_PATH}/instellingen`);
  revalidateTheokot();
  return saveOk();
}

/**
 * Vervangt de standaardcatalogus (`TheokotProduct`) — de default namen, prijzen,
 * aantallen, foto's en ingrediënten die "Verkoopweek aanmaken" als startpunt
 * gebruikt. Items komen als geïndexeerde velden
 * `product-<i>-{id,nameNl,nameEn,price,quantity,weekly,ingredientsNl,ingredientsEn,imageKey}`.
 * Actieve producten die niet meer voorkomen worden verwijderd (de catalogus is
 * losstaand: sessie-items zijn kopieën, dus bestaande weken blijven ongemoeid).
 *
 * Een vervangen of gewiste foto laat het oude object bewust in storage staan: die
 * key is meegekopieerd naar de sessie-items van elke week die er al mee aangemaakt
 * is, en die weken moeten hun foto blijven tonen.
 */
export async function saveProductCatalogAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("theokot.manage");
  const rows = parseOfferingRows(formData, "product", "productCount");
  if (!rows) return saveError("INVALID_IMAGE");

  const active = await prisma.theokotProduct.findMany({
    where: { active: true },
    select: { id: true, imageKey: true },
  });
  const currentKeys = new Map(active.map((p) => [p.id, p.imageKey]));
  const keepIds = new Set<string>();

  for (const row of rows) {
    const data = {
      nameNl: row.nameNl,
      nameEn: row.nameEn,
      priceCents: row.priceCents,
      defaultQuantity: row.quantity,
      isWeeklySpecialSlot: row.isWeeklySpecial,
      ingredientsNl: row.ingredientsNl,
      ingredientsEn: row.ingredientsEn,
      order: row.order,
      active: true,
    };

    if (row.id) {
      keepIds.add(row.id);
      await prisma.theokotProduct.update({
        where: { id: row.id },
        data: { ...data, imageKey: resolveImageKey(row.image, currentKeys.get(row.id) ?? null) },
      });
    } else {
      const created = await prisma.theokotProduct.create({
        data: { ...data, imageKey: resolveImageKey(row.image, null) },
      });
      keepIds.add(created.id);
    }
  }

  // Verwijder actieve producten die uit de lijst gehaald zijn.
  let removed = 0;
  for (const p of active) {
    if (!keepIds.has(p.id)) {
      await prisma.theokotProduct.delete({ where: { id: p.id } });
      removed += 1;
    }
  }

  await logAudit({
    action: "update",
    entity: "theokotProduct",
    target: "Standaardcatalogus",
    summary: `${rows.length} product(en) in de catalogus${
      removed > 0 ? `, ${removed} verwijderd` : ""
    }`,
  });

  revalidatePath(`${ADMIN_PATH}/instellingen`);
  revalidateTheokot();
  return saveOk();
}

export async function saveOrderMessageAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("theokot.manage");
  const value = {
    bodyNl: ((formData.get("bodyNl") as string) || "").trim(),
    bodyEn: ((formData.get("bodyEn") as string) || "").trim(),
  };
  await prisma.setting.upsert({
    where: { key: "theokot.orderMessage" },
    update: { value },
    create: { key: "theokot.orderMessage", value },
  });
  await logAudit({
    action: "update",
    entity: "theokotSettings",
    target: "Bericht bij een bestelling",
    summary: value.bodyNl ? "tekst bewerkt" : "tekst leeggemaakt",
  });
  revalidatePath(`${ADMIN_PATH}/instellingen`);
  revalidateTheokot();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Beheer: bans + no-show-correcties
// -----------------------------------------------------------------------------

export async function createBanAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const admin = await requirePermission("theokot.manage");
  let userId = ((formData.get("userId") as string) || "").trim();
  const rNumber = ((formData.get("rNumber") as string) || "").trim().toLowerCase();
  const reason = ((formData.get("reason") as string) || "").trim() || "Manuele ban";
  const days = Math.max(1, Number(formData.get("days")) || 14);
  const note = ((formData.get("note") as string) || "").trim() || null;

  // r-nummer heeft voorrang: laat een beheerder zonder `users.view` toch bannen.
  // Een onbekend r-nummer is een gewone invoerfout: rode toast, geen error
  // boundary (zie CLAUDE.md > UX-conventies).
  if (!userId && rNumber) {
    const user = await prisma.user.findUnique({ where: { rNumber }, select: { id: true } });
    if (!user) return saveError("USER_NOT_FOUND");
    userId = user.id;
  }
  if (!userId) return saveError("USER_MISSING");

  const ban = await prisma.theokotBan.create({
    data: {
      userId,
      reason,
      endsAt: new Date(Date.now() + days * 86400000),
      note,
      createdById: admin.user.id,
    },
  });
  const banned = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  await logAudit({
    action: "create",
    entity: "theokotBan",
    entityId: ban.id,
    target: banned?.name ?? userId,
    summary: `${days} dag(en) geband: ${reason}`,
  });
  revalidatePath(`${ADMIN_PATH}/bans`);
  revalidateTheokot();
  return saveOk();
}

export async function updateBanAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("theokot.manage");
  const id = formData.get("banId") as string;
  const endsAtRaw = (formData.get("endsAt") as string) || "";
  const active = formData.get("active") === "on";
  const note = ((formData.get("note") as string) || "").trim() || null;
  const data: Prisma.TheokotBanUpdateInput = { active, note };
  const endsAt = new Date(endsAtRaw);
  if (!Number.isNaN(endsAt.getTime())) data.endsAt = endsAt;
  const ban = await prisma.theokotBan.update({
    where: { id },
    data,
    include: { user: { select: { name: true } } },
  });
  await logAudit({
    action: "update",
    entity: "theokotBan",
    entityId: id,
    target: ban.user.name,
    summary: active ? "ban blijft actief; einddatum of notitie gewijzigd" : "ban uitgezet",
  });
  revalidatePath(`${ADMIN_PATH}/bans`);
  revalidateTheokot();
  return saveOk();
}

export async function liftBanAction(formData: FormData): Promise<void> {
  await requirePermission("theokot.manage");
  const id = formData.get("banId") as string;
  const ban = await prisma.theokotBan.update({
    where: { id },
    data: { active: false },
    include: { user: { select: { name: true } } },
  });
  await logAudit({
    action: "update",
    entity: "theokotBan",
    entityId: id,
    target: ban.user.name,
    summary: "ban opgeheven",
  });
  revalidatePath(`${ADMIN_PATH}/bans`);
  revalidateTheokot();
}

/**
 * Corrigeert de status van een bestelling (bvb no-show → opgehaald). Optioneel
 * wordt de actieve ban van de gebruiker opgeheven (`liftBan=on`).
 */
export async function correctOrderStatusAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("theokot.manage");
  const orderId = formData.get("orderId") as string;
  const status = formData.get("status") as TheokotOrderStatus;
  const note = ((formData.get("note") as string) || "").trim() || null;
  const liftBan = formData.get("liftBan") === "on";

  const validStatuses: TheokotOrderStatus[] = ["RESERVED", "PICKED_UP", "NO_SHOW", "CANCELLED"];
  if (!validStatuses.includes(status)) return saveError("INVALID_STATUS");

  const order = await prisma.theokotOrder.update({
    where: { id: orderId },
    data: {
      status,
      statusNote: note,
      pickedUpAt: status === "PICKED_UP" ? new Date() : null,
    },
  });

  if (liftBan) {
    await prisma.theokotBan.updateMany({
      where: { userId: order.userId, active: true },
      data: { active: false },
    });
  }

  const buyer = await prisma.user.findUnique({
    where: { id: order.userId },
    select: { name: true },
  });
  await logAudit({
    action: "update",
    entity: "theokotOrder",
    entityId: orderId,
    target: buyer?.name ?? order.userId,
    summary: `status gezet op ${status}${note ? ` (${note})` : ""}${
      liftBan ? "; lopende ban opgeheven" : ""
    }`,
  });

  revalidatePath(`${ADMIN_PATH}/bans`);
  revalidateTheokot();
  return saveOk();
}

// -----------------------------------------------------------------------------
// Afhaalbalie (theokot.pickup)
// -----------------------------------------------------------------------------

export type PickupLine = { nameNl: string; nameEn: string | null; quantity: number; unitPriceCents: number };
export type PickupOrder = {
  orderId: string;
  status: TheokotOrderStatus;
  totalCents: number;
  lines: PickupLine[];
  pickupStart: string;
  pickupEnd: string;
  voucherRedemption: { amount: number } | null;
};
export type PickupLookupResult =
  | {
      ok: true;
      userName: string;
      rNumber: string;
      outstandingBonnetjes: number;
      orders: PickupOrder[];
    }
  | { ok: false; error: string };
export type VoucherRedemptionResult =
  | { ok: true; amount: number; remainingBonnetjes: number }
  | { ok: false; error: string };

const SANDWICH_VOUCHER_COST = 2;

/** Kernlogica: bestelling(en) van vandaag voor een r-nummer opzoeken. */
async function pickupByRNumber(rNumberRaw: string): Promise<PickupLookupResult> {
  const rNumber = rNumberRaw.trim().toLowerCase();
  if (!rNumber) return { ok: false, error: "Geef een r-nummer in." };

  const user = await prisma.user.findUnique({ where: { rNumber } });
  if (!user) return { ok: false, error: `Geen gebruiker gevonden met r-nummer ${rNumber}.` };

  const now = new Date();
  const today = brusselsTimeOnDay(now, "00:00");
  const tomorrow = new Date(today.getTime() + 86400000);

  const [orders, shiftBalances] = await Promise.all([
    prisma.theokotOrder.findMany({
      where: {
        userId: user.id,
        status: { in: ["RESERVED", "PICKED_UP"] },
        session: { date: { gte: today, lt: tomorrow } },
      },
      include: {
        session: { select: { pickupStart: true, pickupEnd: true } },
        voucherRedemption: { select: { amount: true } },
        lines: {
          include: { sessionItem: { select: { nameNl: true, nameEn: true } } },
          orderBy: { sessionItem: { order: "asc" } },
        },
      },
    }),
    prisma.shiftParticipant.findMany({
      where: { userId: user.id, shift: { endTime: { lt: now } } },
      select: {
        shiftId: true,
        rewardPaid: true,
        shift: { select: { reward: true } },
      },
    }),
  ]);

  if (orders.length === 0) {
    return { ok: false, error: `${user.name} heeft geen bestelling voor vandaag.` };
  }

  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).format(d);

  return {
    ok: true,
    userName: user.name,
    rNumber,
    outstandingBonnetjes: shiftBalances.reduce(
      (total, balance) =>
        total +
        outstandingShiftReward({
          reward: balance.shift.reward,
          rewardPaid: balance.rewardPaid,
        }),
      0,
    ),
    orders: orders.map((o) => ({
      orderId: o.id,
      status: o.status,
      totalCents: o.totalCents,
      pickupStart: fmt(o.session.pickupStart),
      pickupEnd: fmt(o.session.pickupEnd),
      voucherRedemption: o.voucherRedemption,
      lines: o.lines.map((l) => ({
        nameNl: l.sessionItem.nameNl,
        nameEn: l.sessionItem.nameEn,
        quantity: l.quantity,
        unitPriceCents: l.unitPriceCents,
      })),
    })),
  };
}

/** Zoekt de bestelling(en) van vandaag voor een handmatig ingegeven r-nummer. */
export async function lookupPickupByRNumberAction(rNumber: string): Promise<PickupLookupResult> {
  await requirePermission("theokot.pickup");
  return pickupByRNumber(rNumber);
}

/**
 * Zoekt de bestelling(en) op via een gescande studentenkaart. De scanner tikt
 * `serial;cardAppId`; die string wordt tot een r-nummer herleid (zie
 * {@link resolveStudentCard}: eerst onze eigen kaarttabel, anders KU Leuven)
 * waarna de gewone afhaal-lookup volgt.
 */
export async function lookupPickupByCardAction(scanned: string): Promise<PickupLookupResult> {
  await requirePermission("theokot.pickup");
  const resolved = await resolveStudentCard(scanned);
  if (!resolved.ok) return { ok: false, error: resolved.error };
  return pickupByRNumber(resolved.rNumber);
}

/** Markeert een bestelling als opgehaald. Faalt als ze al opgehaald/geannuleerd is. */
export async function markPickedUpAction(orderId: string): Promise<ActionResult> {
  const admin = await requirePermission("theokot.pickup");
  const order = await prisma.theokotOrder.findUnique({ where: { id: orderId } });
  if (!order) return { ok: false, error: "Bestelling niet gevonden." };
  if (order.status === "PICKED_UP") return { ok: false, error: "Deze bestelling is al opgehaald." };
  if (order.status === "CANCELLED") return { ok: false, error: "Deze bestelling is geannuleerd." };

  await prisma.theokotOrder.update({
    where: { id: orderId },
    data: { status: "PICKED_UP", pickedUpAt: new Date(), pickedUpById: admin.user.id },
  });
  revalidateTheokot();
  return { ok: true, message: "Opgehaald geregistreerd." };
}

/**
 * Gebruikt twee nog openstaande medewerkersbonnetjes voor één broodje en
 * schrijft tegelijk een auditrij. De saldo-afboeking en auditregistratie zijn
 * één serialiseerbare transactie.
 */
export async function redeemEmployeeVouchersAction(
  orderId: string,
): Promise<VoucherRedemptionResult> {
  const admin = await requirePermission("theokot.pickup");

  try {
    const result = await withSerializableTransaction(async (tx) => {
      const order = await tx.theokotOrder.findUnique({
        where: { id: orderId },
        select: {
          id: true,
          userId: true,
          status: true,
          voucherRedemption: { select: { id: true } },
        },
      });
      if (!order) throw new Error("ORDER_NOT_FOUND");
      if (order.status !== "RESERVED") throw new Error("ORDER_NOT_OPEN");
      if (order.voucherRedemption) throw new Error("ALREADY_REDEEMED");

      const allocation = await allocateUserShiftReward(tx, {
        userId: order.userId,
        amount: SANDWICH_VOUCHER_COST,
      });

      await tx.theokotVoucherRedemption.create({
        data: {
          orderId: order.id,
          userId: order.userId,
          processedById: admin.user.id,
          amount: SANDWICH_VOUCHER_COST,
        },
      });

      return allocation;
    });

    revalidateTheokot();
    return {
      ok: true,
      amount: SANDWICH_VOUCHER_COST,
      remainingBonnetjes: result.remaining,
    };
  } catch (error) {
    if (error instanceof RangeError) {
      return { ok: false, error: "De student heeft niet genoeg openstaande bonnetjes." };
    }
    if (error instanceof ShiftRewardConflictError) {
      return { ok: false, error: "Het bonnetjessaldo is gewijzigd. Scan de kaart opnieuw." };
    }
    if (error instanceof Error) {
      if (error.message === "ORDER_NOT_FOUND") {
        return { ok: false, error: "Bestelling niet gevonden." };
      }
      if (error.message === "ORDER_NOT_OPEN") {
        return { ok: false, error: "Deze bestelling kan niet meer met bonnetjes betaald worden." };
      }
      if (error.message === "ALREADY_REDEEMED") {
        return { ok: false, error: "Voor deze bestelling zijn al medewerkersbonnetjes gebruikt." };
      }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "Voor deze bestelling zijn al medewerkersbonnetjes gebruikt." };
    }
    throw error;
  }
}

// -----------------------------------------------------------------------------
// Student: bestellen + annuleren
// -----------------------------------------------------------------------------

/** Plaatst een bestelling voor de ingelogde student. */
export async function placeOrderAction(sessionId: string, lines: OrderLineInput[]): Promise<ActionResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: "Je moet ingelogd zijn om te bestellen." };
  }
  const userId = session.user.id;
  const config = await getTheokotConfig();

  const ban = await activeBanFor(userId);
  if (ban) {
    const until = new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", dateStyle: "long" }).format(ban.endsAt);
    return { ok: false, error: `Je bent tijdelijk geschorst tot ${until} wegens niet-opgehaalde bestellingen.` };
  }

  try {
    await withSerializableTransaction(async (tx) => {
      const sess = await tx.theokotSession.findUnique({ where: { id: sessionId }, include: { items: true } });
      if (!sess) throw new TheokotValidationError(["Verkoopsessie niet gevonden."]);
      if (!canOrderNow(sess, new Date())) {
        throw new TheokotValidationError(["Bestellen is niet mogelijk voor deze dag."]);
      }

      const existing = await tx.theokotOrder.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
      });
      if (existing) throw new TheokotValidationError(["Je hebt al een bestelling voor deze dag."]);

      // Resterende voorraad = sessievoorraad − reeds bestelde aantallen − wat er
      // voor een grocomeet of bureau opzijgezet is (zelfde voorraad, aparte doos).
      const usedMap = await usageForSessionItemsTx(tx, sessionId);
      const items = sess.items.map((i) => ({
        id: i.id,
        priceCents: i.priceCents,
        quantity: Math.max(0, i.quantity - (usedMap.get(i.id) ?? 0)),
        isWeeklySpecial: i.isWeeklySpecial,
      }));

      const normalized = validateOrderLines(lines, items, config);

      await tx.theokotOrder.create({
        data: {
          sessionId,
          userId,
          totalCents: normalized.totalCents,
          lines: {
            create: normalized.lines.map((l) => ({
              sessionItemId: l.sessionItemId,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
            })),
          },
        },
      });
    });
  } catch (err) {
    if (err instanceof TheokotValidationError) return { ok: false, error: err.details.join(" ") };
    console.error("[theokot] placeOrder mislukt:", err);
    return { ok: false, error: "Er ging iets mis bij het plaatsen van je bestelling." };
  }

  revalidateTheokot();
  return { ok: true, message: "Je bestelling is geplaatst." };
}

/** Annuleert (verwijdert) de bestelling van de student vóór de deadline. */
export async function cancelOrderAction(orderId: string): Promise<ActionResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: "Je moet ingelogd zijn." };
  }

  const order = await prisma.theokotOrder.findUnique({
    where: { id: orderId },
    include: { session: { select: { orderCloseAt: true } } },
  });
  if (!order || order.userId !== session.user.id) {
    return { ok: false, error: "Bestelling niet gevonden." };
  }
  if (order.status !== "RESERVED") {
    return { ok: false, error: "Deze bestelling kan niet meer geannuleerd worden." };
  }
  if (!canCancel(order.session, new Date())) {
    return { ok: false, error: "De annulatiedeadline is verstreken." };
  }

  await prisma.theokotOrder.delete({ where: { id: orderId } });
  revalidateTheokot();
  return { ok: true, message: "Je bestelling is geannuleerd." };
}
