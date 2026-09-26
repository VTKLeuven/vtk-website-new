"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { Prisma, type TheokotOrderStatus } from "@prisma/client";
import { requirePermission, requireSession } from "@/lib/session";
import {
  brusselsTimeOnDay,
  brusselsYMD,
  checkSessionWindows,
  coerceItemLayout,
  planDayOffering,
  SANDWICH_VOUCHER_COST,
  TheokotValidationError,
  type OrderLineInput,
} from "@/lib/theokot";
import { readImageField, resolveImageKey, type ImageFieldValue } from "@/lib/imageField";
import { getTheokotConfig, removeOrder, removeSession } from "@/lib/theokot-server";
import {
  cancelOrder,
  placeOrder,
  repriceReservedOrders,
  TheokotOrderError,
  updateOrder,
} from "@/lib/theokot-orders";
import { syncMeetingsForSession, syncMeetingsOnDay } from "@/lib/meetings-server";
import { resolveStudentCard } from "@/lib/student-card";
import {
  pickupByRNumber,
  pickupForUser,
  type PickupLookupResult,
} from "@/lib/theokot-pickup";
import { verifyPassToken } from "@/lib/app-api/tokens";
import {
  allocateUserShiftReward,
  ShiftRewardConflictError,
} from "@/lib/shift/rewards.server";
import { withSerializableTransaction } from "@/lib/ticketing/transactions";
import { saveError, saveOk, type SaveState } from "@/lib/saveState";
import { logAudit } from "@/lib/audit";
import { createShift } from "@/lib/shift/server";
import { theokotShiftsForDay, theokotShiftPost } from "@/lib/shift/templateStore";
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

/** "HH:mm" in Brussel-tijd. */
function brusselsHhmm(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
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
export async function createWeekSessionsAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  const session = await requirePermission("theokot.manage");
  const weekStart = parseDayToBrusselsMidnight(formData.get("weekStart") as string | null);
  if (!weekStart) return saveError("INVALID_WEEKSTART");

  const dayValues = formData.getAll("days").map((d) => Number(d)).filter((n) => n >= 0 && n <= 6);
  const days = dayValues.length > 0 ? dayValues : [0, 1, 2, 3, 4];

  const config = await getTheokotConfig();
  const pickupStart = validTime(formData.get("pickupStart"), config.pickupDefaultStart);
  const pickupEnd = validTime(formData.get("pickupEnd"), config.pickupDefaultEnd);
  const orderCloseTime = validTime(formData.get("orderCloseTime"), config.cancelDeadline);
  const orderOpenTime = validTime(formData.get("orderOpenTime"), config.orderOpenTime);

  // Aanbod uit het formulier; valt terug op de actieve catalogus als er niets meekomt.
  const rows = parseOfferingRows(formData, "item", "itemCount");
  if (!rows) return saveError("INVALID_IMAGE");
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
  const dayMidnightFor = (offset: number) =>
    brusselsTimeOnDay(
      new Date(Date.UTC(startYmd.year, startYmd.month - 1, startYmd.day, 12) + offset * 86400000),
      "00:00",
    );
  // orderOpenAt = orderOpenTime op de dag `orderLeadDays` vóór de verkoopdag.
  const windowsFor = (dayMidnight: Date) => {
    const dm = brusselsYMD(dayMidnight);
    const leadDay = new Date(
      Date.UTC(dm.year, dm.month - 1, dm.day, 12) - config.orderLeadDays * 86400000,
    );
    return {
      orderOpenAt: brusselsTimeOnDay(leadDay, orderOpenTime),
      orderCloseAt: brusselsTimeOnDay(dayMidnight, orderCloseTime),
      pickupStart: brusselsTimeOnDay(dayMidnight, pickupStart),
      pickupEnd: brusselsTimeOnDay(dayMidnight, pickupEnd),
    };
  };

  // De uren gelden voor de hele week, dus één dag nakijken volstaat, en dat
  // gebeurt vóór de eerste dag aangemaakt is: een halve week met een venster
  // dat nooit opengaat, is erger dan geen week.
  const problem = checkSessionWindows(windowsFor(dayMidnightFor(days[0] ?? 0)));
  if (problem) return saveError(problem);

  // Eén keer opgezocht i.p.v. per dag: het sjabloon verandert niet halverwege
  // een week, en dit staat in de lus die de hele week aanmaakt.
  const shiftPost = await theokotShiftPost();
  let createdDays = 0;
  let createdShifts = 0;
  let skippedDays = 0;
  for (const offset of days) {
    const dayMidnight = dayMidnightFor(offset);
    const existing = await prisma.theokotSession.findUnique({ where: { date: dayMidnight } });
    if (existing) {
      skippedDays += 1;
      continue;
    }

    await prisma.theokotSession.create({
      data: {
        date: dayMidnight,
        isOpen: true,
        ...windowsFor(dayMidnight),
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
        post: shiftPost,
        startTime: {
          gte: dayMidnight,
          lt: brusselsTimeOnDay(new Date(Date.UTC(nextDay.year, nextDay.month - 1, nextDay.day, 12)), "00:00"),
        },
      },
      select: { id: true },
    });

    if (!alreadyStaffed) {
      for (const shift of await theokotShiftsForDay(dayMidnight, pickupStart)) {
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
      `${createdShifts} shift(en) aangemaakt; ${skippedDays} bestaande dag(en) overgeslagen`,
  });

  revalidateTheokot();

  // Zeg wat er gebeurd is: opnieuw op "Week aanmaken" duwen met een ander aanbod
  // slaat elke bestaande dag over, en zonder deze zin ziet dat eruit als een
  // geslaagde wijziging.
  return saveOk(
    [
      `${createdDays} verkoopdag(en) aangemaakt`,
      createdShifts > 0 ? `${createdShifts} shift(en) erbij` : null,
      skippedDays > 0 ? `${skippedDays} dag(en) bestonden al en bleven ongewijzigd` : null,
    ]
      .filter(Boolean)
      .join(", ") + ".",
  );
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
  // Leeg betekent "niet meegestuurd, laat staan"; iets dat geen "HH:mm" is, is
  // geknoei met het veld en belandde vroeger als Invalid Date in de database.
  const timeField = (key: string): string | null | false => {
    const raw = ((formData.get(key) as string) || "").trim();
    if (!raw) return null;
    return TIME_RE.test(raw) ? raw : false;
  };
  const pickupStart = timeField("pickupStart");
  const pickupEnd = timeField("pickupEnd");
  const orderCloseTime = timeField("orderCloseTime");
  const orderOpenAtRaw = (formData.get("orderOpenAt") as string) || null;
  if (pickupStart === false || pickupEnd === false || orderCloseTime === false) {
    return saveError("INVALID_TIME");
  }

  const windows = {
    orderOpenAt: existing.orderOpenAt,
    orderCloseAt: existing.orderCloseAt,
    pickupStart: existing.pickupStart,
    pickupEnd: existing.pickupEnd,
  };
  if (pickupStart) windows.pickupStart = brusselsTimeOnDay(existing.date, pickupStart);
  if (pickupEnd) windows.pickupEnd = brusselsTimeOnDay(existing.date, pickupEnd);
  if (orderCloseTime) windows.orderCloseAt = brusselsTimeOnDay(existing.date, orderCloseTime);
  if (orderOpenAtRaw) {
    // datetime-local levert "YYYY-MM-DDTHH:mm" zonder tijdzone; interpreteer die
    // als Brussel-wandkloktijd (niet de server-tijdzone).
    const m = orderOpenAtRaw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
    if (!m) return saveError("INVALID_TIME");
    windows.orderOpenAt = brusselsTimeOnDay(new Date(`${m[1]}T12:00:00Z`), m[2]);
  }

  const problem = checkSessionWindows(windows);
  if (problem) return saveError(problem);

  const data: Prisma.TheokotSessionUpdateInput = { isOpen, ...windows };
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
      // Enkel items van déze verkoopdag. Zonder deze regel is het verborgen
      // id-veld een manier om het aanbod van een andere dag te herschrijven.
      if (!currentKeys.has(id)) return saveError("ITEM_NOT_IN_SESSION");
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

  // Een nieuwe prijs geldt ook voor wie al gereserveerd had: aan de balie
  // betaal je wat er vandaag op het bord staat. Zie `repriceReservedOrders`.
  const repriced = await repriceReservedOrders(sessionId);

  await logAudit({
    action: "update",
    entity: "theokotSession",
    entityId: sessionId,
    target: sessionLabel(existing.date),
    summary:
      `aanbod aangepast naar ${rows.length} broodje(s)` +
      (repriced > 0 ? `, ${repriced} reservatie(s) aan de nieuwe prijs gezet` : ""),
  });

  // Dit is precies het geval waarvoor het uitlijnen bestaat: een week met een
  // ander aanbod dan de catalogus. Wie een broodje reserveerde dat er nu niet
  // meer is, krijgt een mail en een melding om opnieuw te kiezen.
  await syncMeetingsForSession(sessionId);

  revalidateTheokot();
  return saveOk();
}

/**
 * Zet hetzelfde aanbod op meerdere verkoopdagen tegelijk: "Aanbod van de week".
 *
 * Een prijs of een broodje voor de hele week aanpassen betekende vijf keer
 * "Aanbod bewerken" openen en vijf keer hetzelfde intikken. De editor toont nu
 * het aanbod van één dag van die week als voorbeeld (`templateSessionId`); bij
 * opslaan krijgt elke aangevinkte dag (`applyTo`) dat aanbod. Welk broodje op
 * een andere dag bij welke rij hoort, beslist `planDayOffering`.
 *
 * Per dag gebeurt precies wat "Aanbod bewerken" voor één dag doet: een broodje
 * met bestellingen blijft staan, openstaande reservaties krijgen de nieuwe
 * prijs, en een vergadering die een verdwenen broodje had, wordt verwittigd.
 * Een dag waarvan de afhaal al voorbij is, wordt overgeslagen.
 */
export async function updateWeekItemsAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("theokot.manage");
  const templateId = formData.get("templateSessionId") as string;
  const applyTo = [...new Set(formData.getAll("applyTo").map(String).filter(Boolean))];
  if (applyTo.length === 0) return saveError("NO_DAYS_SELECTED");

  const template = await prisma.theokotSession.findUnique({
    where: { id: templateId },
    select: { id: true, items: { select: { id: true, productId: true, nameNl: true, imageKey: true } } },
  });
  if (!template) return saveError("SESSION_NOT_FOUND");

  const rows = parseOfferingRows(formData, "item", "itemCount");
  if (!rows) return saveError("INVALID_IMAGE");
  const templateIds = new Set(template.items.map((item) => item.id));
  const templateImages = new Map(template.items.map((item) => [item.id, item.imageKey]));
  if (rows.some((row) => row.id && !templateIds.has(row.id))) return saveError("ITEM_NOT_IN_SESSION");

  const now = new Date();
  const days = await prisma.theokotSession.findMany({
    where: { id: { in: applyTo }, pickupEnd: { gt: now } },
    orderBy: { date: "asc" },
    include: { items: { include: { _count: { select: { lines: true } } } } },
  });
  if (days.length === 0) return saveError("NO_DAYS_SELECTED");

  let repricedTotal = 0;
  for (const day of days) {
    const plan = planDayOffering(
      template.items,
      day.items.map((item) => ({ ...item, hasLines: item._count.lines > 0 })),
      rows.map((row) => ({ sourceId: row.id || null })),
    );
    const currentKeys = new Map(day.items.map((item) => [item.id, item.imageKey]));
    // `id` hoort bij de voorbeelddag en gaat dus niet mee naar de andere dagen.
    const fieldsOf = (index: number) => {
      const { image, order, nameNl, nameEn, priceCents, quantity, isWeeklySpecial, ingredientsNl, ingredientsEn } =
        rows[index]!;
      return {
        image,
        order,
        fields: { nameNl, nameEn, priceCents, quantity, isWeeklySpecial, ingredientsNl, ingredientsEn },
      };
    };
    for (const { row: index, targetId } of plan.update) {
      const { image, order, fields } = fieldsOf(index);
      await prisma.theokotSessionItem.update({
        where: { id: targetId },
        data: { ...fields, imageKey: resolveImageKey(image, currentKeys.get(targetId) ?? null), order },
      });
    }
    for (const index of plan.create) {
      const { image, order, fields } = fieldsOf(index);
      // Een nieuwe rij zonder eigen upload neemt de foto van het broodje op de
      // voorbeelddag over, als dat er een had.
      const sourceId = rows[index]!.id;
      const sourceKey = sourceId ? (templateImages.get(sourceId) ?? null) : null;
      await prisma.theokotSessionItem.create({
        data: { sessionId: day.id, ...fields, imageKey: resolveImageKey(image, sourceKey), order },
      });
    }
    for (const id of plan.remove) {
      await prisma.theokotSessionItem.delete({ where: { id } });
    }

    const repriced = await repriceReservedOrders(day.id);
    repricedTotal += repriced;
    await logAudit({
      action: "update",
      entity: "theokotSession",
      entityId: day.id,
      target: sessionLabel(day.date),
      summary:
        `aanbod van de week toegepast: ${rows.length} broodje(s)` +
        (repriced > 0 ? `, ${repriced} reservatie(s) aan de nieuwe prijs gezet` : ""),
    });
    await syncMeetingsForSession(day.id);
  }

  revalidateTheokot();
  return saveOk(
    `Aanbod toegepast op ${days.length} dag(en)` +
      (repricedTotal > 0 ? `, ${repricedTotal} reservatie(s) aan de nieuwe prijs gezet` : "") +
      ".",
  );
}

/**
 * Schrapt één bestelling vanuit het beheer.
 *
 * Er wordt bewust niets automatisch geschrapt wanneer het aanbod onder het
 * bestelde aantal zakt: wie zijn broodje verliest, is een keuze van een mens en
 * niet van een sorteerregel. Dit is de knop waarmee die keuze uitgevoerd wordt.
 */
export async function removeOrderAction(formData: FormData): Promise<void> {
  await requirePermission("theokot.manage");
  const orderId = formData.get("orderId") as string;
  if (!orderId) return;

  const result = await removeOrder(orderId);
  if (!result.ok) {
    if (result.code === "ORDER_NOT_FOUND") return;
    // De knop staat er niet bij een opgehaalde bestelling; komt dit toch voor,
    // dan loopt het scherm achter op de werkelijkheid.
    throw new Error(
      "Deze bestelling is al opgehaald of met bonnetjes betaald en kan niet meer geschrapt worden.",
    );
  }

  await logAudit({
    action: "delete",
    entity: "theokotOrder",
    entityId: orderId,
    target: result.userName,
    summary: `bestelling geschrapt door het beheer (${result.dateLabel}); student verwittigd`,
  });

  revalidateTheokot();
}

/**
 * Sluit een verkoopdag nu meteen af.
 *
 * Voor de verkoper die vroeger klaar is: de afhaal stopt op dit moment, er kan
 * niets meer bijbesteld of geannuleerd worden, en de no-show-klok loopt vanaf
 * hier. Een kwartier later (`noShowGraceMinutes`) telt wat er niet opgehaald is
 * als niet opgehaald, net zoals bij een dag die gewoon uitloopt.
 *
 * **Dit raakt `isOpen` bewust niet.** Dat vinkje betekent elders "die dag gaat
 * door": `syncMeetingReservations` maakt elke grocomeet- en bureaureservatie van
 * een dag die niet open staat ongeldig, mét mail. Zou vroeger sluiten dat vinkje
 * omzetten, dan zou de vergadering van die middag geannuleerd worden op het
 * moment dat de balie afrondt. Een dag die niet doorgaat, verwijder je.
 */
export async function closeSessionNowAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("theokot.manage");
  const id = formData.get("sessionId") as string;
  const existing = await prisma.theokotSession.findUnique({ where: { id } });
  if (!existing) return saveError("SESSION_NOT_FOUND");

  const now = new Date();
  if (existing.pickupEnd <= now) return saveError("SESSION_ALREADY_CLOSED");

  await prisma.theokotSession.update({
    where: { id },
    data: {
      pickupEnd: now,
      // Ook het bestelvenster dicht: nog een broodje reserveren voor een balie
      // die net afgesloten heeft, heeft geen zin.
      orderCloseAt: existing.orderCloseAt > now ? now : existing.orderCloseAt,
      // De afhaal kan niet eindigen voor ze begint.
      pickupStart: existing.pickupStart > now ? now : existing.pickupStart,
    },
  });

  await logAudit({
    action: "update",
    entity: "theokotSession",
    entityId: id,
    target: sessionLabel(existing.date),
    summary: "vroegtijdig gesloten",
  });

  revalidateTheokot();
  return saveOk(
    "Verkoopdag gesloten. Wat niet opgehaald is, telt vanaf nu als niet opgehaald.",
  );
}

/**
 * Verwijdert een verkoopdag die niet doorgaat.
 *
 * Wie er een bestelling op had staan, krijgt een mail; stil laten verdwijnen zet
 * mensen voor een gesloten deur. Kan enkel zolang er niets afgehaald is, anders
 * verdwijnt een verkoop die echt gebeurd is uit de historiek: zo'n dag sluit je.
 */
export async function removeSessionAction(formData: FormData): Promise<void> {
  await requirePermission("theokot.manage");
  const id = formData.get("sessionId") as string;
  const existing = await prisma.theokotSession.findUnique({ where: { id } });
  if (!existing) return;

  const result = await removeSession(id);
  if (!result.ok) {
    // De knop staat er niet wanneer er al opgehaald is; komt dit toch voor, dan
    // is het geen invoerfout maar een scherm dat achterloopt.
    throw new Error(
      result.code === "SESSION_HAS_PICKUPS"
        ? "Deze verkoopdag heeft al opgehaalde bestellingen of gebruikte bonnetjes en kan niet meer verwijderd worden."
        : "Verkoopdag niet gevonden.",
    );
  }

  await logAudit({
    action: "delete",
    entity: "theokotSession",
    entityId: id,
    target: sessionLabel(existing.date),
    summary: `verkoopdag verwijderd; ${result.orders} bestelling(en) geannuleerd en verwittigd`,
  });

  // De vergaderingen van die dag vallen terug op de catalogus nu het aanbod van
  // die dag niet meer bestaat.
  await syncMeetingsOnDay(existing.date);
  revalidateTheokot();
}

// -----------------------------------------------------------------------------
// Beheer: configuratie, custom bericht, openingsuren
// -----------------------------------------------------------------------------

export async function saveConfigAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("theokot.manage");
  // Afronden en niet enkel klemmen: `parseTheokotConfig` eist een geheel getal
  // bij het lezen, dus een 2,5 die hier bewaard werd, viel daar stil terug op de
  // standaardwaarde onder een groene toast.
  const num = (key: string, min = 0) => Math.max(min, Math.round(Number(formData.get(key)) || 0));
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
  // X > Y, zoals docs/design-decisions.md het stelt: een limiet op broodjes van
  // de week die even hoog ligt als de limiet op de hele bestelling, is geen
  // limiet.
  if (value.maxWeeklySpecialPerOrder >= value.maxItemsPerOrder) {
    return saveError("WEEKLY_SPECIAL_TOO_HIGH");
  }

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

  const existing = await prisma.theokotBan.findUnique({ where: { id }, select: { endsAt: true } });
  if (!existing) return saveError("BAN_NOT_FOUND");

  const data: Prisma.TheokotBanUpdateInput = { active, note };
  if (/^\d{4}-\d{2}-\d{2}$/.test(endsAtRaw)) {
    // Het veld toont enkel een dag. Behoud het uur dat de ban al had en verzet
    // enkel de kalenderdag, in Brussel-tijd: anders verschoof het einde van de
    // ban naar middernacht UTC zodra iemand de notitie bijwerkte.
    const endsAt = brusselsTimeOnDay(
      new Date(`${endsAtRaw}T12:00:00Z`),
      brusselsHhmm(existing.endsAt),
    );
    if (!Number.isNaN(endsAt.getTime())) data.endsAt = endsAt;
  }

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

/**
 * Heft een lopende ban op.
 *
 * Zet naast `active` ook `endsAt` op nu. De no-show-telling vertrekt van het
 * einde van de laatste ban die voorbij is; bleef `endsAt` in de toekomst staan,
 * dan stond die teller tot dan op nul en kon er geen nieuwe ban meer volgen.
 * Meteen is de historiek ook eerlijk: de ban heeft geduurd wat hij geduurd heeft.
 */
export async function liftBanAction(
  _prev: SaveState,
  formData: FormData,
): Promise<SaveState> {
  await requirePermission("theokot.manage");
  const id = formData.get("banId") as string;
  if (!id) return saveError("BAN_NOT_FOUND");

  const now = new Date();
  const existing = await prisma.theokotBan.findUnique({ where: { id }, select: { endsAt: true } });
  if (!existing) return saveError("BAN_NOT_FOUND");

  const ban = await prisma.theokotBan.update({
    where: { id },
    // Enkel inkorten, nooit verlengen: een ban die al voorbij was maar nog op
    // `active` stond, hoort door het opheffen niet tot vandaag te duren.
    data: { active: false, endsAt: existing.endsAt > now ? now : existing.endsAt },
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
  return saveOk();
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

  // "Geannuleerd" staat er bewust niet meer bij: die status zette enkel het woord
  // om terwijl de broodjes van de voorraad af bleven en het bestelslot bezet
  // bleef. Annuleren is wissen, en dat doet `removeOrderAction`.
  const validStatuses: TheokotOrderStatus[] = ["RESERVED", "PICKED_UP", "NO_SHOW"];
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
    const now = new Date();
    // Enkel de ban die nu loopt: `endsAt` mee naar nu, zodat de no-show-telling
    // weer vertrekt (zie `liftBanAction`). Een ban die al voorbij was, blijft
    // staan zoals hij stond.
    await prisma.theokotBan.updateMany({
      where: { userId: order.userId, active: true, endsAt: { gt: now } },
      data: { active: false, endsAt: now },
    });
    await prisma.theokotBan.updateMany({
      where: { userId: order.userId, active: true, endsAt: { lte: now } },
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

// De opzoeking zelf staat in `lib/theokot-pickup.ts`: er zijn drie wegen naar
// dezelfde vraag (r-nummer, studentenkaart, pas uit de app) en die hoort maar
// één keer beantwoord te worden. Deze types worden doorgegeven zodat
// `PickupCounter` ze uit dezelfde plek kan importeren als vroeger.
export type {
  PickupLine,
  PickupOrder,
  PickupLookupResult,
} from "@/lib/theokot-pickup";

export type VoucherRedemptionResult =
  | { ok: true; amount: number; remainingBonnetjes: number }
  | { ok: false; error: string };

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

/**
 * Zoekt de bestelling(en) op via de pas uit de VTK-app.
 *
 * De student toont één code voor alles wat hij aan een balie moet tonen; die
 * code is kortlevend en ondertekend (zie `lib/app-api/tokens.ts`). Een verlopen
 * pas krijgt bewust een andere zin dan een vervalste: aan de balie is dat het
 * verschil tussen "laat nog eens zien" en "dit klopt niet".
 */
export async function lookupPickupByPassAction(pass: string): Promise<PickupLookupResult> {
  await requirePermission("theokot.pickup");
  const verified = verifyPassToken(pass);
  if (!verified.ok) {
    return {
      ok: false,
      error:
        verified.reason === "PASS_EXPIRED"
          ? "Deze code is verlopen. Laat de student ze opnieuw tonen."
          : "Deze code hoort niet bij VTK.",
    };
  }
  return pickupForUser(verified.userId);
}

/**
 * Markeert een bestelling als opgehaald. Faalt als ze al opgehaald/geannuleerd is.
 *
 * Een bestelling die als niet-opgehaald geboekt staat, mag hier ook nog door: de
 * verkoop is dan gedaan, maar het broodje bestaat nog en de student staat voor
 * je. Ze krijgt wel een notitie, zodat later te zien blijft dat het laattijdig
 * ging. Vanaf dan telt ze niet meer mee als no-show; een ban die al uitgesproken
 * was, blijft staan en hef je op bij Bans & no-shows.
 */
export async function markPickedUpAction(orderId: string): Promise<ActionResult> {
  const admin = await requirePermission("theokot.pickup");
  const order = await prisma.theokotOrder.findUnique({
    where: { id: orderId },
    include: { session: { select: { date: true } }, user: { select: { name: true } } },
  });
  if (!order) return { ok: false, error: "Bestelling niet gevonden." };
  if (order.status === "PICKED_UP") return { ok: false, error: "Deze bestelling is al opgehaald." };
  if (order.status === "CANCELLED") return { ok: false, error: "Deze bestelling is geannuleerd." };

  const late = order.status === "NO_SHOW";

  // Voorwaardelijk, zodat twee shifters die tegelijk op de knop duwen niet
  // allebei denken dat zij het geregistreerd hebben.
  const { count } = await prisma.theokotOrder.updateMany({
    where: { id: orderId, status: order.status },
    data: {
      status: "PICKED_UP",
      pickedUpAt: new Date(),
      pickedUpById: admin.user.id,
      ...(late ? { statusNote: "Laattijdig afgehaald aan de balie." } : {}),
    },
  });
  if (count === 0) return { ok: false, error: "Deze bestelling is intussen al afgehandeld." };

  if (late) {
    await logAudit({
      action: "update",
      entity: "theokotOrder",
      entityId: orderId,
      target: order.user.name,
      summary: `laattijdig afgehaald (${sessionLabel(order.session.date)})`,
    });
  }

  revalidateTheokot();
  return {
    ok: true,
    message: late ? "Laattijdig afgehaald geregistreerd." : "Opgehaald geregistreerd.",
  };
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
      // Ook een bestelling die als niet-opgehaald geboekt staat: die mag aan de
      // balie nog uitgedeeld worden, en dan hoort ze ook nog met bonnetjes
      // betaald te kunnen worden. Opgehaald en geannuleerd niet meer.
      if (order.status !== "RESERVED" && order.status !== "NO_SHOW") {
        throw new Error("ORDER_NOT_OPEN");
      }
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

/** De Nederlandse melding bij een weigering. De app maakt zijn eigen zinnen. */
function orderErrorMessage(error: TheokotOrderError): string {
  switch (error.code) {
    case "BANNED": {
      const until = error.bannedUntil
        ? new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", dateStyle: "long" }).format(
            error.bannedUntil,
          )
        : "";
      return `Je bent tijdelijk geschorst tot ${until} wegens niet-opgehaalde bestellingen.`;
    }
    case "SESSION_NOT_FOUND":
      return "Verkoopsessie niet gevonden.";
    case "ORDER_CLOSED":
      return "Bestellen is niet mogelijk voor deze dag.";
    case "ALREADY_ORDERED":
      return "Je hebt al een bestelling voor deze dag.";
    case "ORDER_NOT_FOUND":
      return "Bestelling niet gevonden.";
    case "NOT_CANCELABLE":
      return "Deze bestelling kan niet meer geannuleerd worden.";
    case "CANCEL_DEADLINE_PASSED":
      return "De annulatiedeadline is verstreken.";
  }
}

/**
 * Plaatst een bestelling voor de ingelogde student.
 *
 * De werking zelf staat in `lib/theokot-orders.ts`, want de VTK-app roept
 * dezelfde functie aan. Wat hier overblijft is wat bij een action hoort: de
 * sessie en de melding in het Nederlands.
 */
export async function placeOrderAction(sessionId: string, lines: OrderLineInput[]): Promise<ActionResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: "Je moet ingelogd zijn om te bestellen." };
  }

  try {
    await placeOrder(session.user.id, sessionId, lines);
  } catch (err) {
    if (err instanceof TheokotOrderError) return { ok: false, error: orderErrorMessage(err) };
    if (err instanceof TheokotValidationError) return { ok: false, error: err.details.join(" ") };
    console.error("[theokot] placeOrder mislukt:", err);
    return { ok: false, error: "Er ging iets mis bij het plaatsen van je bestelling." };
  }

  return { ok: true, message: "Je bestelling is geplaatst." };
}

/** Past de reservatie van de student aan zolang het bestelvenster open is. */
export async function updateOrderAction(orderId: string, lines: OrderLineInput[]): Promise<ActionResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: "Je moet ingelogd zijn." };
  }

  try {
    await updateOrder(session.user.id, orderId, lines);
  } catch (err) {
    if (err instanceof TheokotOrderError) {
      // De code is gedeeld met annuleren; de zin hoort bij wat je probeerde.
      if (err.code === "NOT_CANCELABLE") return { ok: false, error: "Deze bestelling kan niet meer aangepast worden." };
      if (err.code === "ORDER_CLOSED") return { ok: false, error: "Aanpassen kan niet meer: het bestelvenster voor deze dag is dicht." };
      return { ok: false, error: orderErrorMessage(err) };
    }
    if (err instanceof TheokotValidationError) return { ok: false, error: err.details.join(" ") };
    console.error("[theokot] updateOrder mislukt:", err);
    return { ok: false, error: "Er ging iets mis bij het aanpassen van je bestelling." };
  }

  return { ok: true, message: "Je bestelling is aangepast." };
}

/** Annuleert (verwijdert) de bestelling van de student vóór de deadline. */
export async function cancelOrderAction(orderId: string): Promise<ActionResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: "Je moet ingelogd zijn." };
  }

  try {
    await cancelOrder(session.user.id, orderId);
  } catch (err) {
    if (err instanceof TheokotOrderError) return { ok: false, error: orderErrorMessage(err) };
    console.error("[theokot] cancelOrder mislukt:", err);
    return { ok: false, error: "Er ging iets mis bij het annuleren van je bestelling." };
  }

  return { ok: true, message: "Je bestelling is geannuleerd." };
}
