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
  validateOrderLines,
  TheokotValidationError,
  type OrderLineInput,
} from "@/lib/theokot";
import { activeBanFor, getTheokotConfig } from "@/lib/theokot-server";
import { verifyStudentCard } from "@/lib/kul-card";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

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
  revalidatePath("/theokot");
  revalidatePath("/en/theokot");
  revalidatePath("/");
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
function validTime(value: unknown, fallback: string): string {
  return typeof value === "string" && TIME_RE.test(value) ? value : fallback;
}

type OfferingInput = {
  nameNl: string;
  nameEn: string | null;
  priceCents: number;
  quantity: number;
  isWeeklySpecial: boolean;
  order: number;
};

/** Leest de geïndexeerde aanbod-velden (`item-<i>-{nameNl,nameEn,price,quantity,weekly}`). */
function parseOfferingItems(formData: FormData): OfferingInput[] {
  const count = Number(formData.get("itemCount")) || 0;
  const items: OfferingInput[] = [];
  for (let i = 0; i < count; i += 1) {
    const nameNl = ((formData.get(`item-${i}-nameNl`) as string) || "").trim();
    if (!nameNl) continue;
    items.push({
      nameNl,
      nameEn: ((formData.get(`item-${i}-nameEn`) as string) || "").trim() || null,
      priceCents: euroToCents(formData.get(`item-${i}-price`)) ?? 0,
      quantity: Math.max(0, Number(formData.get(`item-${i}-quantity`)) || 0),
      isWeeklySpecial: formData.get(`item-${i}-weekly`) === "on",
      order: items.length,
    });
  }
  return items;
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
  let offering = parseOfferingItems(formData);
  if (offering.length === 0) {
    const products = await prisma.theokotProduct.findMany({ where: { active: true }, orderBy: { order: "asc" } });
    offering = products.map((p, i) => ({
      nameNl: p.nameNl,
      nameEn: p.nameEn,
      priceCents: p.priceCents,
      quantity: p.defaultQuantity,
      isWeeklySpecial: p.isWeeklySpecialSlot,
      order: i,
    }));
  }

  const startYmd = brusselsYMD(weekStart);
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
            order: it.order,
          })),
        },
      },
    });
  }

  revalidateTheokot();
}

// -----------------------------------------------------------------------------
// Beheer: één sessie bewerken (uren, open/dicht, broodje van de week)
// -----------------------------------------------------------------------------

export async function updateSessionAction(formData: FormData): Promise<void> {
  await requirePermission("theokot.manage");
  const id = formData.get("sessionId") as string;
  const existing = await prisma.theokotSession.findUnique({ where: { id } });
  if (!existing) throw new Error("Sessie niet gevonden");

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
  revalidateTheokot();
}

/**
 * Vervangt het aanbod van een sessie. Items worden meegestuurd als geïndexeerde
 * velden `item-<i>-{id,nameNl,nameEn,price,quantity,weekly}`. Bestaande items die
 * niet meer voorkomen worden verwijderd tenzij ze al bestellijnen hebben (dan
 * blijven ze staan om historiek niet te breken).
 */
export async function updateSessionItemsAction(formData: FormData): Promise<void> {
  await requirePermission("theokot.manage");
  const sessionId = formData.get("sessionId") as string;
  const existing = await prisma.theokotSession.findUnique({
    where: { id: sessionId },
    include: { items: { include: { _count: { select: { lines: true } } } } },
  });
  if (!existing) throw new Error("Sessie niet gevonden");

  const count = Number(formData.get("itemCount")) || 0;
  const keepIds = new Set<string>();

  for (let i = 0; i < count; i += 1) {
    const nameNl = ((formData.get(`item-${i}-nameNl`) as string) || "").trim();
    if (!nameNl) continue;
    const id = (formData.get(`item-${i}-id`) as string) || "";
    const nameEn = ((formData.get(`item-${i}-nameEn`) as string) || "").trim() || null;
    const priceCents = euroToCents(formData.get(`item-${i}-price`)) ?? 0;
    const quantity = Math.max(0, Number(formData.get(`item-${i}-quantity`)) || 0);
    const isWeeklySpecial = formData.get(`item-${i}-weekly`) === "on";

    if (id) {
      keepIds.add(id);
      await prisma.theokotSessionItem.update({
        where: { id },
        data: { nameNl, nameEn, priceCents, quantity, isWeeklySpecial, order: i },
      });
    } else {
      await prisma.theokotSessionItem.create({
        data: { sessionId, nameNl, nameEn, priceCents, quantity, isWeeklySpecial, order: i },
      });
    }
  }

  // Verwijder weggelaten items die nog geen bestellingen hebben.
  for (const item of existing.items) {
    if (!keepIds.has(item.id) && item._count.lines === 0) {
      await prisma.theokotSessionItem.delete({ where: { id: item.id } });
    }
  }

  revalidateTheokot();
}

// -----------------------------------------------------------------------------
// Beheer: configuratie, custom bericht, openingsuren
// -----------------------------------------------------------------------------

export async function saveConfigAction(formData: FormData): Promise<void> {
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
  };
  await prisma.setting.upsert({
    where: { key: "theokot.config" },
    update: { value },
    create: { key: "theokot.config", value },
  });
  revalidateTheokot();
}

/**
 * Vervangt de standaardcatalogus (`TheokotProduct`) — de default namen, prijzen en
 * aantallen die "Verkoopweek aanmaken" als startpunt gebruikt. Items komen als
 * geïndexeerde velden `product-<i>-{id,nameNl,nameEn,price,quantity,weekly}`. Actieve
 * producten die niet meer voorkomen worden verwijderd (de catalogus is losstaand:
 * sessie-items zijn kopieën, dus bestaande weken blijven ongemoeid).
 */
export async function saveProductCatalogAction(formData: FormData): Promise<void> {
  await requirePermission("theokot.manage");
  const count = Number(formData.get("productCount")) || 0;
  const keepIds = new Set<string>();

  for (let i = 0; i < count; i += 1) {
    const nameNl = ((formData.get(`product-${i}-nameNl`) as string) || "").trim();
    if (!nameNl) continue;
    const id = (formData.get(`product-${i}-id`) as string) || "";
    const nameEn = ((formData.get(`product-${i}-nameEn`) as string) || "").trim() || null;
    const priceCents = euroToCents(formData.get(`product-${i}-price`)) ?? 0;
    const defaultQuantity = Math.max(0, Number(formData.get(`product-${i}-quantity`)) || 0);
    const isWeeklySpecialSlot = formData.get(`product-${i}-weekly`) === "on";
    const data = { nameNl, nameEn, priceCents, defaultQuantity, isWeeklySpecialSlot, order: i, active: true };

    if (id) {
      keepIds.add(id);
      await prisma.theokotProduct.update({ where: { id }, data });
    } else {
      const created = await prisma.theokotProduct.create({ data });
      keepIds.add(created.id);
    }
  }

  // Verwijder actieve producten die uit de lijst gehaald zijn.
  const active = await prisma.theokotProduct.findMany({ where: { active: true }, select: { id: true } });
  for (const p of active) {
    if (!keepIds.has(p.id)) await prisma.theokotProduct.delete({ where: { id: p.id } });
  }

  revalidateTheokot();
}

export async function saveOrderMessageAction(formData: FormData): Promise<void> {
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
  revalidateTheokot();
}

/** Schrijft de frontpage-openingsuren van Theokot (gedeelde key `home.openingHours.theokot`). */
export async function saveTheokotOpeningHoursAction(formData: FormData): Promise<void> {
  await requirePermission("theokot.manage");
  const titleNl = (formData.get("titleNl") as string) || "Openingsuren Theokot";
  const titleEn = (formData.get("titleEn") as string) || "Theokot opening hours";
  const entries: Array<{ dayNl: string; dayEn: string; hours: string }> = [];
  for (let i = 0; i < 7; i += 1) {
    const dayNl = formData.get(`dayNl-${i}`) as string | null;
    const dayEn = formData.get(`dayEn-${i}`) as string | null;
    const hours = formData.get(`hours-${i}`) as string | null;
    if (!dayNl && !hours) continue;
    entries.push({ dayNl: dayNl ?? "", dayEn: dayEn ?? dayNl ?? "", hours: hours ?? "" });
  }
  const value = { titleNl, titleEn, entries };
  await prisma.setting.upsert({
    where: { key: "home.openingHours.theokot" },
    update: { value },
    create: { key: "home.openingHours.theokot", value },
  });
  revalidatePath("/");
  revalidateTheokot();
}

// -----------------------------------------------------------------------------
// Beheer: bans + no-show-correcties
// -----------------------------------------------------------------------------

export async function createBanAction(formData: FormData): Promise<void> {
  const admin = await requirePermission("theokot.manage");
  let userId = ((formData.get("userId") as string) || "").trim();
  const rNumber = ((formData.get("rNumber") as string) || "").trim().toLowerCase();
  const reason = ((formData.get("reason") as string) || "").trim() || "Manuele ban";
  const days = Math.max(1, Number(formData.get("days")) || 14);
  const note = ((formData.get("note") as string) || "").trim() || null;

  // r-nummer heeft voorrang: laat een beheerder zonder `users.view` toch bannen.
  if (!userId && rNumber) {
    const user = await prisma.user.findUnique({ where: { rNumber }, select: { id: true } });
    if (!user) throw new Error("Geen gebruiker gevonden met dit r-nummer");
    userId = user.id;
  }
  if (!userId) throw new Error("Gebruiker ontbreekt");

  await prisma.theokotBan.create({
    data: {
      userId,
      reason,
      endsAt: new Date(Date.now() + days * 86400000),
      note,
      createdById: admin.user.id,
    },
  });
  revalidateTheokot();
}

export async function updateBanAction(formData: FormData): Promise<void> {
  await requirePermission("theokot.manage");
  const id = formData.get("banId") as string;
  const endsAtRaw = (formData.get("endsAt") as string) || "";
  const active = formData.get("active") === "on";
  const note = ((formData.get("note") as string) || "").trim() || null;
  const data: Prisma.TheokotBanUpdateInput = { active, note };
  const endsAt = new Date(endsAtRaw);
  if (!Number.isNaN(endsAt.getTime())) data.endsAt = endsAt;
  await prisma.theokotBan.update({ where: { id }, data });
  revalidateTheokot();
}

export async function liftBanAction(formData: FormData): Promise<void> {
  await requirePermission("theokot.manage");
  const id = formData.get("banId") as string;
  await prisma.theokotBan.update({ where: { id }, data: { active: false } });
  revalidateTheokot();
}

/**
 * Corrigeert de status van een bestelling (bvb no-show → opgehaald). Optioneel
 * wordt de actieve ban van de gebruiker opgeheven (`liftBan=on`).
 */
export async function correctOrderStatusAction(formData: FormData): Promise<void> {
  await requirePermission("theokot.manage");
  const orderId = formData.get("orderId") as string;
  const status = formData.get("status") as TheokotOrderStatus;
  const note = ((formData.get("note") as string) || "").trim() || null;
  const liftBan = formData.get("liftBan") === "on";

  const validStatuses: TheokotOrderStatus[] = ["RESERVED", "PICKED_UP", "NO_SHOW", "CANCELLED"];
  if (!validStatuses.includes(status)) throw new Error("Ongeldige status");

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

  revalidateTheokot();
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
};
export type PickupLookupResult =
  | { ok: true; userName: string; rNumber: string; orders: PickupOrder[] }
  | { ok: false; error: string };

/** Kernlogica: bestelling(en) van vandaag voor een r-nummer opzoeken. */
async function pickupByRNumber(rNumberRaw: string): Promise<PickupLookupResult> {
  const rNumber = rNumberRaw.trim().toLowerCase();
  if (!rNumber) return { ok: false, error: "Geef een r-nummer in." };

  const user = await prisma.user.findUnique({ where: { rNumber } });
  if (!user) return { ok: false, error: `Geen gebruiker gevonden met r-nummer ${rNumber}.` };

  const now = new Date();
  const today = brusselsTimeOnDay(now, "00:00");
  const tomorrow = new Date(today.getTime() + 86400000);

  const orders = await prisma.theokotOrder.findMany({
    where: {
      userId: user.id,
      status: { in: ["RESERVED", "PICKED_UP"] },
      session: { date: { gte: today, lt: tomorrow } },
    },
    include: {
      session: { select: { pickupStart: true, pickupEnd: true } },
      lines: {
        include: { sessionItem: { select: { nameNl: true, nameEn: true } } },
        orderBy: { sessionItem: { order: "asc" } },
      },
    },
  });

  if (orders.length === 0) {
    return { ok: false, error: `${user.name} heeft geen bestelling voor vandaag.` };
  }

  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit" }).format(d);

  return {
    ok: true,
    userName: user.name,
    rNumber,
    orders: orders.map((o) => ({
      orderId: o.id,
      status: o.status,
      totalCents: o.totalCents,
      pickupStart: fmt(o.session.pickupStart),
      pickupEnd: fmt(o.session.pickupEnd),
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
 * `serial;cardAppId`; die string wordt bij KU Leuven geverifieerd tot een r-nummer
 * (zie {@link verifyStudentCard}) waarna de gewone afhaal-lookup volgt.
 */
export async function lookupPickupByCardAction(scanned: string): Promise<PickupLookupResult> {
  await requirePermission("theokot.pickup");
  const verified = await verifyStudentCard(scanned);
  if (!verified.ok) return { ok: false, error: verified.error };
  return pickupByRNumber(verified.rNumber);
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
    await prisma.$transaction(async (tx) => {
      const sess = await tx.theokotSession.findUnique({ where: { id: sessionId }, include: { items: true } });
      if (!sess) throw new TheokotValidationError(["Verkoopsessie niet gevonden."]);
      if (!canOrderNow(sess, new Date())) {
        throw new TheokotValidationError(["Bestellen is niet mogelijk voor deze dag."]);
      }

      const existing = await tx.theokotOrder.findUnique({
        where: { sessionId_userId: { sessionId, userId } },
      });
      if (existing) throw new TheokotValidationError(["Je hebt al een bestelling voor deze dag."]);

      // Resterende voorraad = sessievoorraad − reeds bestelde aantallen.
      const used = await tx.theokotOrderLine.groupBy({
        by: ["sessionItemId"],
        where: { sessionItem: { sessionId } },
        _sum: { quantity: true },
      });
      const usedMap = new Map(used.map((u) => [u.sessionItemId, u._sum.quantity ?? 0]));
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
