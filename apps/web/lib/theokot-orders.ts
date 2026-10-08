import "server-only";

import { revalidatePath } from "next/cache";
import { prisma } from "@vtk/db";
import { Prisma, type TheokotOrderStatus } from "@prisma/client";

import { grocomeetOnDay, usageForSessionItems, usageForSessionItemsTx } from "@/lib/meetings-server";
import { hasLivePermission } from "@/lib/livePermissions";
import { sendOrderTakenOver } from "@/lib/mail";
import { activeBanFor, getTheokotConfig } from "@/lib/theokot-server";
import { withSerializableTransaction } from "@/lib/ticketing/transactions";
import {
  canCancel,
  canOrderNow,
  inTakeoverWindow,
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
  | "CANCEL_DEADLINE_PASSED"
  // Laat annuleren en overnemen. Enkel de website roept die wegen voorlopig
  // aan; de app kent ze nog niet (zie `AppTheokotErrorCode`).
  | "TAKEOVER_CLOSED"
  | "RELEASE_NOT_POSSIBLE"
  | "NOTHING_RELEASED"
  | "TAKEOVER_UNAVAILABLE";

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
          include: { lines: { include: { sessionItem: { select: { nameNl: true, nameEn: true, badgeImageKey: true } } } } },
        },
      },
    }),
    prisma.setting.findUnique({ where: { key: "theokot.orderMessage" } }),
  ]);

  // Reeds weg per sessie-item: bestellingen van studenten plus de broodjes die
  // voor een grocomeet of bureau opzijgezet zijn. Zelfde voorraad, aparte doos.
  const used = await usageForSessionItems(sessions.flatMap((s) => s.items.map((i) => i.id)));

  // De dagen waarop een bestelling van deze persoon in de doos van de grocomeet
  // zou gaan, zodat het scherm dat zegt vóór er besteld is. Bestellen beslist
  // het zelf opnieuw; een bestaande bestelling draagt het in `grocomeetId`.
  const grocomeetSessionIds = new Set<string>();
  if (sessions.length > 0 && (await hasLivePermission(userId, "grocomeet.reserve"))) {
    const days = await Promise.all(sessions.map((s) => grocomeetOnDay(s.date)));
    sessions.forEach((s, i) => {
      if (days[i]) grocomeetSessionIds.add(s.id);
    });
  }

  return {
    config,
    ban,
    sessions,
    used,
    released: await releasedForSessions(sessions.map((s) => s.id), userId),
    grocomeetSessionIds,
    message: messageRow?.value as { bodyNl?: string; bodyEn?: string } | undefined,
  };
}

/**
 * Wat er per sessie-item vrijgegeven is en nog overgenomen kan worden, zonder
 * wat de lezer zelf vrijgaf: je eigen broodje terugnemen is "toch zelf
 * ophalen" (`unreleaseOrder`), geen overname.
 *
 * Dezelfde voorwaarden als `takeOverSandwich` bij het kiezen van een bestelling
 * om van over te nemen, zodat het scherm niets aanbiedt wat de overname dan
 * weigert.
 */
async function releasedForSessions(sessionIds: string[], userId: string): Promise<Map<string, number>> {
  if (sessionIds.length === 0) return new Map();
  const rows = await prisma.theokotOrderLine.groupBy({
    by: ["sessionItemId"],
    where: {
      releasedQuantity: { gt: 0 },
      sessionItem: { sessionId: { in: sessionIds } },
      order: takeoverDonorWhere(userId),
    },
    _sum: { releasedQuantity: true },
  });
  return new Map(rows.map((row) => [row.sessionItemId, row._sum.releasedQuantity ?? 0]));
}

/** Een bestelling waarvan `userId` een broodje mag overnemen. */
function takeoverDonorWhere(userId: string): Prisma.TheokotOrderWhereInput {
  return {
    status: "RESERVED",
    releasedAt: { not: null },
    userId: { not: userId },
    grocomeetId: null,
    voucherRedemption: { is: null },
  };
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
 *
 * Bestelt een groco op een dag met een grocomeet, dan gaat de bestelling mee in
 * de doos van de GM (`grocomeetId`). Dezelfde voorraad en dezelfde limieten als
 * voor elke student: enkel waar het broodje belandt, verschilt.
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
  const groco = await hasLivePermission(userId, "grocomeet.reserve");

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
        grocomeetId: groco ? await grocomeetOnDay(sess.date, tx) : null,
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
  const groco = await hasLivePermission(userId, "grocomeet.reserve");

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
        grocomeetId: groco ? await grocomeetOnDay(order.session.date, tx) : null,
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
 * De bestellingen die nog niet betaald zijn en dus de prijs van nu volgen. Ook
 * `NO_SHOW`: die mag aan de balie nog uitgedeeld worden, en wordt dan betaald
 * aan wat er dan op het bord staat.
 */
const UNPAID_STATUSES: TheokotOrderStatus[] = ["RESERVED", "NO_SHOW"];

/**
 * Zet de openstaande reservaties van een verkoopdag op de prijzen van nu.
 *
 * Aangeroepen na "Aanbod bewerken": een prijswijziging geldt ook voor wie al
 * gereserveerd had, anders staat er aan de balie een ander bedrag dan op het
 * bord. Enkel wat nog niet betaald is (`RESERVED`, `NO_SHOW`); een opgehaalde
 * bestelling is betaald. De regel zelf staat in `repriceOrder`. Geeft terug
 * hoeveel reservaties er veranderden.
 */
export async function repriceReservedOrders(sessionId: string): Promise<number> {
  const orders = await prisma.theokotOrder.findMany({
    where: { sessionId, status: { in: UNPAID_STATUSES } },
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
          where: { id: line.id, order: { status: { in: UNPAID_STATUSES } } },
          data: { unitPriceCents: line.unitPriceCents },
        }),
      ),
      prisma.theokotOrder.updateMany({
        where: { id: order.id, status: { in: UNPAID_STATUSES } },
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

// -----------------------------------------------------------------------------
// Laat annuleren en overnemen
// -----------------------------------------------------------------------------
//
// Na de deadline (`orderCloseAt`) worden de broodjes al gemaakt. Annuleren wist
// dan niets meer, want de turflijst is de lijst van wat er gesmeerd wordt: wie
// dan annuleert, geeft zijn broodjes vrij. Tot het einde van de afhaal kan een
// ander ze per stuk overnemen; wat dan nog vrij staat, wordt bij het sluiten een
// gewone no-show (`processSession` zet alles wat nog RESERVED is op NO_SHOW).
//
// De voorraad verandert daarbij nooit: een overname schuift één stuk van de ene
// bestelling naar de andere, dus `usageForSessionItems` en de turflijst blijven
// hetzelfde getal tonen.

/**
 * Geeft de eigen bestelling na de deadline vrij voor overname.
 *
 * Niet voor een bestelling in de doos van de grocomeet (die ligt niet aan de
 * balie en wordt daar ook niet afgerekend) en niet wanneer er al bonnetjes op
 * afgeboekt zijn. Voor de deadline is gewoon annuleren (`cancelOrder`) de weg.
 */
export async function releaseOrder(userId: string, orderId: string, now: Date = new Date()): Promise<void> {
  await withSerializableTransaction(async (tx) => {
    const order = await tx.theokotOrder.findUnique({
      where: { id: orderId },
      include: {
        lines: { select: { id: true, quantity: true } },
        session: { select: { isOpen: true, orderCloseAt: true, pickupEnd: true } },
        voucherRedemption: { select: { id: true } },
      },
    });
    if (!order || order.userId !== userId) throw new TheokotOrderError("ORDER_NOT_FOUND");
    if (order.status !== "RESERVED") throw new TheokotOrderError("NOT_CANCELABLE");
    if (canCancel(order.session, now)) throw new TheokotOrderError("RELEASE_NOT_POSSIBLE");
    if (!inTakeoverWindow(order.session, now)) throw new TheokotOrderError("TAKEOVER_CLOSED");
    if (order.grocomeetId || order.voucherRedemption) throw new TheokotOrderError("RELEASE_NOT_POSSIBLE");
    // Twee keer op de knop is één vrijgave.
    if (order.releasedAt) return;

    await tx.theokotOrder.update({ where: { id: orderId }, data: { releasedAt: now } });
    // Per lijn, want een kolom op de waarde van een andere kolom zetten kan
    // `updateMany` niet. Het zijn er hooguit `maxItemsPerOrder`.
    for (const line of order.lines) {
      await tx.theokotOrderLine.update({ where: { id: line.id }, data: { releasedQuantity: line.quantity } });
    }
  });

  revalidateTheokotOrders();
}

/**
 * Draait een vrijgave terug: je haalt wat er nog van je over is toch zelf op.
 *
 * Wat intussen overgenomen is, is weg en komt niet terug; enkel de rest staat
 * weer gewoon op je naam. Kan tot het einde van de afhaal.
 */
export async function unreleaseOrder(userId: string, orderId: string, now: Date = new Date()): Promise<void> {
  await withSerializableTransaction(async (tx) => {
    const order = await tx.theokotOrder.findUnique({
      where: { id: orderId },
      include: { session: { select: { pickupEnd: true } } },
    });
    // Alles overgenomen betekent dat de bestelling weg is: dan is er ook niets
    // meer om terug te nemen, en zegt dezelfde code dat.
    if (!order || order.userId !== userId) throw new TheokotOrderError("ORDER_NOT_FOUND");
    if (order.status !== "RESERVED") throw new TheokotOrderError("NOT_CANCELABLE");
    if (now >= order.session.pickupEnd) throw new TheokotOrderError("TAKEOVER_CLOSED");
    if (!order.releasedAt) return;

    await tx.theokotOrder.update({ where: { id: orderId }, data: { releasedAt: null } });
    await tx.theokotOrderLine.updateMany({ where: { orderId }, data: { releasedQuantity: 0 } });
  });

  revalidateTheokotOrders();
}

/**
 * Neemt één vrijgegeven broodje over.
 *
 * Het stuk komt van de bestelling die het langst vrijgegeven staat: wie het
 * eerst annuleerde, is het eerst verlost. Het gaat bij je eigen bestelling van
 * die dag, of wordt er een als je er nog geen had; dezelfde limieten als bij
 * bestellen, aan de prijs van nu. Een ban houdt overnemen ook tegen.
 *
 * Valt de laatste lijn van de andere bestelling weg, dan verdwijnt die
 * bestelling: er is niets meer om niet op te halen, dus ook geen no-show.
 */
export async function takeOverSandwich(
  userId: string,
  sessionItemId: string,
  now: Date = new Date(),
): Promise<{ orderId: string; totalCents: number }> {
  const config = await getTheokotConfig();

  const ban = await activeBanFor(userId, now);
  if (ban) throw new TheokotOrderError("BANNED", ban.endsAt);

  const result = await withSerializableTransaction(async (tx) => {
    const item = await tx.theokotSessionItem.findUnique({
      where: { id: sessionItemId },
      include: { session: { include: { items: true } } },
    });
    if (!item) throw new TheokotOrderError("SESSION_NOT_FOUND");
    const sess = item.session;
    if (!inTakeoverWindow(sess, now)) throw new TheokotOrderError("TAKEOVER_CLOSED");

    const mine = await tx.theokotOrder.findUnique({
      where: { sessionId_userId: { sessionId: sess.id, userId } },
      include: { lines: true, voucherRedemption: { select: { id: true } } },
    });
    // Je eigen bestelling moet het broodje kunnen dragen: niet al opgehaald,
    // niet in de doos van de grocomeet (die is al ingepakt), niet zelf
    // vrijgegeven (dan neem je je eigen broodjes eerst terug).
    if (mine && (mine.status !== "RESERVED" || mine.grocomeetId || mine.releasedAt || mine.voucherRedemption)) {
      throw new TheokotOrderError("TAKEOVER_UNAVAILABLE");
    }

    const donorLine = await tx.theokotOrderLine.findFirst({
      where: { sessionItemId, releasedQuantity: { gt: 0 }, order: takeoverDonorWhere(userId) },
      orderBy: [{ order: { releasedAt: "asc" } }, { id: "asc" }],
      include: { order: { select: { id: true, userId: true } } },
    });
    if (!donorLine) throw new TheokotOrderError("NOTHING_RELEASED");

    // Je nieuwe bestelling: wat je had, plus dit ene broodje. De "voorraad" per
    // broodje is hier precies dat aantal, zodat `validateOrderLines` enkel de
    // limieten toetst; dat het stuk bestaat, zegt `donorLine`.
    const wanted = new Map<string, number>();
    for (const line of mine?.lines ?? []) {
      wanted.set(line.sessionItemId, (wanted.get(line.sessionItemId) ?? 0) + line.quantity);
    }
    wanted.set(sessionItemId, (wanted.get(sessionItemId) ?? 0) + 1);
    const normalized = validateOrderLines(
      [...wanted].map(([id, quantity]) => ({ sessionItemId: id, quantity })),
      sess.items.map((i) => ({
        id: i.id,
        priceCents: i.priceCents,
        quantity: wanted.get(i.id) ?? 0,
        isWeeklySpecial: i.isWeeklySpecial,
      })),
      config,
    );

    // Het stuk gaat van de andere bestelling af.
    if (donorLine.quantity <= 1) {
      await tx.theokotOrderLine.delete({ where: { id: donorLine.id } });
    } else {
      await tx.theokotOrderLine.update({
        where: { id: donorLine.id },
        data: { quantity: { decrement: 1 }, releasedQuantity: { decrement: 1 } },
      });
    }
    const rest = await tx.theokotOrderLine.findMany({
      where: { orderId: donorLine.order.id },
      select: { quantity: true, unitPriceCents: true, releasedQuantity: true },
    });
    if (rest.length === 0) {
      await tx.theokotOrder.delete({ where: { id: donorLine.order.id } });
    } else {
      await tx.theokotOrder.update({
        where: { id: donorLine.order.id },
        data: { totalCents: rest.reduce((sum, line) => sum + line.quantity * line.unitPriceCents, 0) },
      });
    }

    const lines = {
      create: normalized.lines.map((line) => ({
        sessionItemId: line.sessionItemId,
        quantity: line.quantity,
        unitPriceCents: line.unitPriceCents,
      })),
    };
    let saved: { id: string; totalCents: number };
    if (mine) {
      await tx.theokotOrderLine.deleteMany({ where: { orderId: mine.id } });
      saved = await tx.theokotOrder.update({
        where: { id: mine.id },
        data: { totalCents: normalized.totalCents, lines },
        select: { id: true, totalCents: true },
      });
    } else {
      saved = await tx.theokotOrder.create({
        data: { sessionId: sess.id, userId, totalCents: normalized.totalCents, lines },
        select: { id: true, totalCents: true },
      });
    }

    return {
      saved,
      donor: {
        userId: donorLine.order.userId,
        remaining: rest.reduce((sum, line) => sum + line.releasedQuantity, 0),
      },
      item: { nameNl: item.nameNl, nameEn: item.nameEn },
      sessionDate: sess.date,
    };
  });

  revalidateTheokotOrders();
  await notifyTakenOver(result.donor, result.item, result.sessionDate);
  return { orderId: result.saved.id, totalCents: result.saved.totalCents };
}

/** De mail aan wie het broodje vrijgaf; een mislukte mail draait niets terug. */
async function notifyTakenOver(
  donor: { userId: string; remaining: number },
  item: { nameNl: string; nameEn: string | null },
  sessionDate: Date,
): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: donor.userId },
      select: { name: true, email: true, locale: true },
    });
    if (!user) return;
    const en = user.locale === "EN";
    await sendOrderTakenOver(user, {
      dateLabel: new Intl.DateTimeFormat(en ? "en-GB" : "nl-BE", {
        timeZone: "Europe/Brussels",
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(sessionDate),
      itemLabel: en ? (item.nameEn ?? item.nameNl) : item.nameNl,
      remaining: donor.remaining,
    });
  } catch (error) {
    console.error("[theokot] overname-mail mislukt:", error);
  }
}

export { TheokotValidationError };
