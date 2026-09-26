import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { Prisma } from "@prisma/client";

import { usageForSessionItems, usageForSessionItemsTx } from "@/lib/meetings-server";
import { activeBanFor, getTheokotConfig } from "@/lib/theokot-server";
import { withSerializableTransaction } from "@/lib/ticketing/transactions";
import {
  canCancel,
  canOrderNow,
  repriceOrder,
  validateOrderLines,
  TheokotValidationError,
  type OrderLineInput,
} from "@/lib/theokot";

/**
 * Bestellen en annuleren bij het Theokot, los van hoe het scherm eruitziet.
 *
 * Dit stond tot fase 1 van de app volledig in `app/actions/theokot.ts`. Het is
 * hierheen verhuisd omdat er nu twee bellers zijn: de website (een server-action)
 * en de VTK-app (`/api/app/v1/theokot/*`). Eén implementatie, dus de app kan per
 * definitie niet soepeler zijn dan de site; bij bans, bestelvensters en voorraad
 * is dat het hele punt.
 *
 * De actions houden wat action-eigen is: `requireSession`, de Nederlandse
 * melding en `SaveState`. Alles wat beslist wat er mag, staat hier.
 */

// -----------------------------------------------------------------------------
// Fouten
// -----------------------------------------------------------------------------

export type TheokotOrderErrorCode =
  | "BANNED"
  | "SESSION_NOT_FOUND"
  | "ORDER_CLOSED"
  | "ALREADY_ORDERED"
  | "ORDER_NOT_FOUND"
  | "NOT_CANCELABLE"
  | "CANCEL_DEADLINE_PASSED";

/**
 * Een verwachte weigering, met een code in plaats van een zin.
 *
 * Een code omdat er twee schermen op moeten reageren in twee talen; de website
 * zet ze om in de melding die er altijd al stond, de app in de hare. De
 * `bannedUntil` reist mee omdat die datum in de melding hoort.
 */
export class TheokotOrderError extends Error {
  constructor(
    readonly code: TheokotOrderErrorCode,
    readonly bannedUntil?: Date,
  ) {
    super(code);
    this.name = "TheokotOrderError";
  }
}

/**
 * De caches die op een bestelling reageren.
 *
 * Zowel de action als de app-route roept dit: bestelt iemand in de app, dan hoort
 * de website dat meteen te tonen.
 *
 * **Deze lijst is bewust identiek aan `revalidateTheokot()` in
 * `app/actions/theokot.ts`** en niet de kortere lijst die je bij een bestelling
 * zou verwachten. Grocomeet en bureau putten uit dezelfde voorraad in een andere
 * doos: een studentenbestelling verandert wat een vergadering nog kan nemen. En
 * de homepage draagt de openingsuren met de voorraadstand erin. Kort je deze
 * lijst in, dan blijven die schermen achter zonder dat iemand het merkt.
 */
export function revalidateTheokotOrders(): void {
  revalidatePath("/admin/theokot");
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

// -----------------------------------------------------------------------------
// Lezen
// -----------------------------------------------------------------------------

export type TheokotOrderView = Awaited<ReturnType<typeof loadOrderableSessions>>;

/**
 * Alles wat een besteller moet zien: de open verkoopdagen met hun aanbod, wat er
 * nog van is, en zijn eigen bestelling per dag.
 *
 * Geeft **data** terug en geen labels: de website maakt er zijn eigen
 * `Intl`-strings van en de app de hare. Wat wél al gekozen is, zijn de vertaalde
 * kolommen, want die keuze hoort niet twee keer geschreven te worden.
 */
export async function loadOrderableSessions(userId: string, now: Date = new Date()) {
  const config = await getTheokotConfig();

  const [ban, sessions, messageRow] = await Promise.all([
    activeBanFor(userId, now),
    prisma.theokotSession.findMany({
      where: { isOpen: true, pickupEnd: { gte: now } },
      orderBy: { date: "asc" },
      include: {
        items: { orderBy: { order: "asc" } },
        orders: {
          where: { userId },
          include: { lines: { include: { sessionItem: { select: { nameNl: true, nameEn: true } } } } },
        },
      },
    }),
    prisma.setting.findUnique({ where: { key: "theokot.orderMessage" } }),
  ]);

  // Reeds weg per sessie-item: bestellingen van studenten plus de broodjes die
  // voor een grocomeet of bureau opzijgezet zijn. Zelfde voorraad, aparte doos.
  const used = await usageForSessionItems(sessions.flatMap((s) => s.items.map((i) => i.id)));

  return { config, ban, sessions, used, message: messageRow?.value as { bodyNl?: string; bodyEn?: string } | undefined };
}

/** Hoeveel er van een sessie-item nog vrij is, met de gereserveerde stukken eraf. */
export function remainingFor(
  item: { id: string; quantity: number },
  used: Map<string, number>,
): number {
  return Math.max(0, item.quantity - (used.get(item.id) ?? 0));
}

// -----------------------------------------------------------------------------
// Schrijven
// -----------------------------------------------------------------------------

/**
 * Plaatst een bestelling.
 *
 * De voorraadcheck zit binnen een serialiseerbare transactie en niet ervoor: twee
 * mensen die op hetzelfde moment het laatste broodje nemen, is precies het geval
 * waarvoor dit systeem bestaat. `validateOrderLines` kijkt naar de bovengrens per
 * item, de transactie naar wat er op dit moment echt nog is.
 *
 * Gooit `TheokotOrderError` voor een weigering die de gebruiker aangaat, en
 * `TheokotValidationError` wanneer de lijnen zelf niet kloppen.
 */
export async function placeOrder(
  userId: string,
  sessionId: string,
  lines: OrderLineInput[],
  now: Date = new Date(),
): Promise<{ orderId: string; totalCents: number }> {
  const config = await getTheokotConfig();

  const ban = await activeBanFor(userId, now);
  if (ban) throw new TheokotOrderError("BANNED", ban.endsAt);

  const created = await withSerializableTransaction(async (tx) => {
    const sess = await tx.theokotSession.findUnique({
      where: { id: sessionId },
      include: { items: true },
    });
    if (!sess) throw new TheokotOrderError("SESSION_NOT_FOUND");
    if (!canOrderNow(sess, now)) throw new TheokotOrderError("ORDER_CLOSED");

    const existing = await tx.theokotOrder.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });
    if (existing) throw new TheokotOrderError("ALREADY_ORDERED");

    const usedMap = await usageForSessionItemsTx(tx, sessionId);
    const items = sess.items.map((item) => ({
      id: item.id,
      priceCents: item.priceCents,
      quantity: remainingFor(item, usedMap),
      isWeeklySpecial: item.isWeeklySpecial,
    }));

    const normalized = validateOrderLines(lines, items, config);

    return tx.theokotOrder.create({
      data: {
        sessionId,
        userId,
        totalCents: normalized.totalCents,
        lines: {
          create: normalized.lines.map((line) => ({
            sessionItemId: line.sessionItemId,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
          })),
        },
      },
      select: { id: true, totalCents: true },
    });
  });

  revalidateTheokotOrders();
  return { orderId: created.id, totalCents: created.totalCents };
}

/**
 * Past de eigen reservatie aan: broodjes erbij, eraf of andere.
 *
 * Hetzelfde venster als bestellen (`canOrderNow`): wat je op dat moment mag
 * bestellen, mag je ook aan je reservatie veranderen. Dezelfde limieten ook,
 * want `validateOrderLines` kijkt naar de hele nieuwe bestelling en niet naar
 * het verschil.
 *
 * De voorraad telt je eigen reservatie mee als vrij: wie de laatste twee
 * broodjes kip had, moet die kunnen houden terwijl hij er een smos bij neemt.
 * Alle lijnen krijgen de prijs van nu, net als bij een nieuwe bestelling.
 *
 * Nul broodjes is geen wijziging maar een annulatie; daarvoor bestaat
 * `cancelOrder`, en `validateOrderLines` weigert een lege bestelling.
 */
export async function updateOrder(
  userId: string,
  orderId: string,
  lines: OrderLineInput[],
  now: Date = new Date(),
): Promise<{ orderId: string; totalCents: number }> {
  const config = await getTheokotConfig();

  const ban = await activeBanFor(userId, now);
  if (ban) throw new TheokotOrderError("BANNED", ban.endsAt);

  const updated = await withSerializableTransaction(async (tx) => {
    const order = await tx.theokotOrder.findUnique({
      where: { id: orderId },
      include: { lines: true, session: { include: { items: true } } },
    });
    // Zelfde antwoord voor niet van jou en niet bestaand, zoals bij annuleren.
    if (!order || order.userId !== userId) throw new TheokotOrderError("ORDER_NOT_FOUND");
    if (order.status !== "RESERVED") throw new TheokotOrderError("NOT_CANCELABLE");
    if (!canOrderNow(order.session, now)) throw new TheokotOrderError("ORDER_CLOSED");

    const own = new Map<string, number>();
    for (const line of order.lines) {
      own.set(line.sessionItemId, (own.get(line.sessionItemId) ?? 0) + line.quantity);
    }
    const usedMap = await usageForSessionItemsTx(tx, order.sessionId);
    const items = order.session.items.map((item) => ({
      id: item.id,
      priceCents: item.priceCents,
      quantity: remainingFor(item, usedMap) + (own.get(item.id) ?? 0),
      isWeeklySpecial: item.isWeeklySpecial,
    }));

    const normalized = validateOrderLines(lines, items, config);

    await tx.theokotOrderLine.deleteMany({ where: { orderId } });
    return tx.theokotOrder.update({
      where: { id: orderId },
      data: {
        totalCents: normalized.totalCents,
        lines: {
          create: normalized.lines.map((line) => ({
            sessionItemId: line.sessionItemId,
            quantity: line.quantity,
            unitPriceCents: line.unitPriceCents,
          })),
        },
      },
      select: { id: true, totalCents: true },
    });
  });

  revalidateTheokotOrders();
  return { orderId: updated.id, totalCents: updated.totalCents };
}

/**
 * Zet de openstaande reservaties van een verkoopdag op de prijzen van nu.
 *
 * Aangeroepen na "Aanbod bewerken": een prijswijziging geldt ook voor wie al
 * gereserveerd had, anders staat er aan de balie een ander bedrag dan op het
 * bord. Enkel `RESERVED`; een opgehaalde bestelling is betaald. De regel zelf
 * staat in `repriceOrder`. Geeft terug hoeveel reservaties er veranderden.
 */
export async function repriceReservedOrders(sessionId: string): Promise<number> {
  const orders = await prisma.theokotOrder.findMany({
    where: { sessionId, status: "RESERVED" },
    select: {
      id: true,
      totalCents: true,
      lines: {
        select: {
          id: true,
          quantity: true,
          unitPriceCents: true,
          sessionItem: { select: { priceCents: true } },
        },
      },
    },
  });

  let changed = 0;
  for (const order of orders) {
    const next = repriceOrder({
      totalCents: order.totalCents,
      lines: order.lines.map((line) => ({ ...line, currentPriceCents: line.sessionItem.priceCents })),
    });
    if (!next) continue;
    await prisma.$transaction([
      // Voorwaardelijk: wie tussen het lezen en nu aan de balie opgehaald werd,
      // heeft betaald wat er toen stond, en die bestelling blijft dus staan.
      ...next.lines.map((line) =>
        prisma.theokotOrderLine.updateMany({
          where: { id: line.id, order: { status: "RESERVED" } },
          data: { unitPriceCents: line.unitPriceCents },
        }),
      ),
      prisma.theokotOrder.updateMany({
        where: { id: order.id, status: "RESERVED" },
        data: { totalCents: next.totalCents },
      }),
    ]);
    changed += 1;
  }
  if (changed > 0) revalidateTheokotOrders();
  return changed;
}

/** Annuleert de eigen bestelling, zolang de deadline niet voorbij is. */
export async function cancelOrder(
  userId: string,
  orderId: string,
  now: Date = new Date(),
): Promise<void> {
  const order = await prisma.theokotOrder.findUnique({
    where: { id: orderId },
    include: { session: { select: { orderCloseAt: true } } },
  });

  // Niet van jou en niet bestaand geven hetzelfde antwoord: anders is deze route
  // een manier om te weten te komen of een order-id bestaat.
  if (!order || order.userId !== userId) throw new TheokotOrderError("ORDER_NOT_FOUND");
  if (order.status !== "RESERVED") throw new TheokotOrderError("NOT_CANCELABLE");
  if (!canCancel(order.session, now)) throw new TheokotOrderError("CANCEL_DEADLINE_PASSED");

  try {
    await prisma.theokotOrder.delete({ where: { id: orderId } });
  } catch (error) {
    // Al weg tussen het lezen en het wissen: dan is het resultaat wat de
    // gebruiker wou, en is dit geen fout om over te melden.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return;
    throw error;
  }

  revalidateTheokotOrders();
}

export { TheokotValidationError };
