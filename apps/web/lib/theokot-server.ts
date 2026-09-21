/**
 * Server-only Theokot-logica die de database en mail raakt: config lezen,
 * ban-status opvragen en de no-show-verwerking. Gescheiden van `lib/theokot.ts`
 * (zuiver, client-safe) zodat prisma/mail nooit in een clientbundel belanden.
 */

import { prisma } from '@vtk/db';
import { DEFAULT_THEOKOT_CONFIG, parseTheokotConfig, type TheokotConfig } from './theokot';
import { sendNoShowWarning, sendOrderCancelled } from './mail';
import { withSerializableTransaction } from './ticketing/transactions';

/** Leest `theokot.config` uit de Setting-tabel, aangevuld met defaults. */
export async function getTheokotConfig(): Promise<TheokotConfig> {
  try {
    const row = await prisma.setting.findUnique({ where: { key: 'theokot.config' } });
    return parseTheokotConfig(row?.value);
  } catch {
    return DEFAULT_THEOKOT_CONFIG;
  }
}

/** De actieve ban van een gebruiker op `now`, of null. */
export async function activeBanFor(userId: string, now: Date = new Date()) {
  return prisma.theokotBan.findFirst({
    where: { userId, active: true, startsAt: { lte: now }, endsAt: { gt: now } },
    orderBy: { endsAt: 'desc' },
  });
}

/** Brussel-datumlabel voor mails, bvb "maandag 14 juli". */
function sessionDateLabel(date: Date, locale: 'NL' | 'EN'): string {
  return new Intl.DateTimeFormat(locale === 'EN' ? 'en-GB' : 'nl-BE', {
    timeZone: 'Europe/Brussels',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(date);
}

/**
 * Past de gevolgen van één no-show toe: waarschuwingsmail versturen en, indien de
 * drempel bereikt is en er nog geen actieve ban loopt, een ban aanmaken.
 *
 * No-shows worden geteld sinds het einde van de laatste ban die al voorbij is (of
 * alle tijd wanneer er nog nooit een ban was), zodat een gebruiker na een ban weer
 * met een schone lei begint en niet meteen opnieuw geband wordt. Een ban die nog
 * loopt of vroegtijdig opgeheven is, telt niet als ondergrens: anders zou het
 * opheffen van een ban meteen ook immuniteit geven tot de oorspronkelijke
 * einddatum.
 */
async function applyNoShowConsequences(
  order: { id: string; userId: string; user: { name: string; email: string; locale: 'NL' | 'EN' } },
  sessionDate: Date,
  config: TheokotConfig,
): Promise<void> {
  // Een waarschuwing die niet vertrekt, hoort de rest niet tegen te houden. Bij
  // een adres dat het blijvend begeeft, viel de hele sessie terug en probeerde
  // de worker het elke vijf minuten opnieuw, terwijl de bestellingen al op
  // NO_SHOW stonden. De mislukte verzending staat met haar fout in `EmailLog`.
  try {
    await sendNoShowWarning(
      order.user,
      sessionDateLabel(sessionDate, order.user.locale),
      order.id,
    );
  } catch (error) {
    console.error(`[theokot] waarschuwingsmail voor bestelling ${order.id} mislukt:`, error);
  }

  await withSerializableTransaction(async (tx) => {
    const now = new Date();
    // De laatste ban die effectief afgelopen is. Zonder die `endsAt`-grens telde
    // een ban die vandaag opgeheven werd (`active: false`, einddatum blijft
    // staan) mee als ondergrens, en dan stond de teller tot die datum op nul:
    // wie net vergiffenis kreeg, was twee weken onaantastbaar.
    const lastBan = await tx.theokotBan.findFirst({
      where: { userId: order.userId, endsAt: { lte: now } },
      orderBy: { endsAt: 'desc' },
    });
    const since = lastBan ? lastBan.endsAt : new Date(0);
    const noShowCount = await tx.theokotOrder.count({
      where: {
        userId: order.userId,
        status: 'NO_SHOW',
        // `noShowProcessedAt` is wanneer de no-show verwerkt is en blijft daarna
        // staan; `updatedAt` schuift mee met elke latere wijziging, dus een oude
        // no-show die nog een notitie kreeg, telde opnieuw mee. Wie nog niet
        // verwerkt is (deze bestelling, of een handmatige correctie), valt terug
        // op `updatedAt`.
        OR: [
          { noShowProcessedAt: { gt: since } },
          { noShowProcessedAt: null, updatedAt: { gt: since } },
        ],
      },
    });
    if (noShowCount < config.noShowThreshold) return;
    const active = await tx.theokotBan.findFirst({
      where: { userId: order.userId, active: true, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true },
    });
    if (active) return;
    await tx.theokotBan.create({
      data: {
        userId: order.userId,
        reason: `${noShowCount} niet-opgehaalde bestellingen`,
        endsAt: new Date(now.getTime() + config.banDurationDays * 86400000),
        note: 'Automatisch aangemaakt door de no-show-verwerking.',
      },
    });
  });
}

/**
 * Verwerkt alle vervallen verkoopsessies: markeert nog-gereserveerde bestellingen
 * als no-show, verstuurt waarschuwingsmails en past bans toe. Idempotent via
 * `session.processedAt` — een reeds verwerkte sessie wordt overgeslagen.
 *
 * Wordt periodiek aangeroepen door de scheduler (`instrumentation.ts`) en kan ook
 * manueel getriggerd worden vanuit het admin-paneel.
 */
export async function processDueNoShows(now: Date = new Date()): Promise<{ sessions: number; noShows: number }> {
  const config = await getTheokotConfig();
  const cutoff = new Date(now.getTime() - config.noShowGraceMinutes * 60000);

  const staleClaim = new Date(now.getTime() - 15 * 60 * 1000);
  const sessions = await prisma.theokotSession.findMany({
    where: {
      processedAt: null,
      isOpen: true,
      pickupEnd: { lte: cutoff },
      OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: staleClaim } }],
    },
    select: { id: true },
  });

  let noShows = 0;
  let processedSessions = 0;

  for (const candidate of sessions) {
    const { count: claimed } = await prisma.theokotSession.updateMany({
      where: {
        id: candidate.id,
        processedAt: null,
        OR: [{ processingStartedAt: null }, { processingStartedAt: { lt: staleClaim } }],
      },
      data: { processingStartedAt: now },
    });
    if (claimed === 0) continue;

    try {
      const session = await prisma.$transaction(async (tx) => {
        await tx.theokotOrder.updateMany({
          where: { sessionId: candidate.id, status: 'RESERVED' },
          data: { status: 'NO_SHOW' },
        });
        return tx.theokotSession.findUniqueOrThrow({
          where: { id: candidate.id },
          include: {
            orders: {
              where: { status: 'NO_SHOW', noShowProcessedAt: null },
              include: { user: { select: { name: true, email: true, locale: true } } },
            },
          },
        });
      });

      for (const order of session.orders) {
        await applyNoShowConsequences(order, session.date, config);
        await prisma.theokotOrder.updateMany({
          where: { id: order.id, noShowProcessedAt: null },
          data: { noShowProcessedAt: new Date() },
        });
        noShows += 1;
      }

      const remaining = await prisma.theokotOrder.count({
        where: { sessionId: session.id, status: 'NO_SHOW', noShowProcessedAt: null },
      });
      if (remaining === 0) {
        await prisma.theokotSession.update({
          where: { id: session.id },
          data: { processedAt: new Date(), processingStartedAt: null },
        });
        processedSessions += 1;
      }
    } catch (error) {
      await prisma.theokotSession.updateMany({
        where: { id: candidate.id, processedAt: null },
        data: { processingStartedAt: null },
      });
      console.error(`[theokot] no-show sessie ${candidate.id} niet volledig verwerkt:`, error);
    }
  }

  return { sessions: processedSessions, noShows };
}

// -----------------------------------------------------------------------------
// Bestellingen schrappen: een verkoopdag die wegvalt, of te weinig broodjes
// -----------------------------------------------------------------------------

/** Publieke datumvorm voor de mails hieronder. */
function dayLabel(date: Date, locale: 'NL' | 'EN'): string {
  return sessionDateLabel(date, locale);
}

/** "2x Broodje kaas, 1x Broodje hesp" */
function itemsLabel(lines: Array<{ quantity: number; name: string }>): string {
  return lines.map((line) => `${line.quantity}x ${line.name}`).join(', ');
}

/**
 * Verwijdert een verkoopdag en verwittigt wie er een bestelling op had staan.
 *
 * Verwijderen is er voor de dag die niet doorgaat. Sluiten is iets anders: dat
 * rondt de verkoop af en laat de niet-opgehaalde broodjes gewoon als niet
 * opgehaald tellen.
 *
 * Kan enkel zolang er niets afgehaald is. Een dag met opgehaalde broodjes
 * wegnemen, wist verkoopcijfers die al gebeurd zijn; die dag hoort gesloten te
 * worden, niet gewist.
 *
 * De mails vertrekken na het wissen en houden het niet tegen: de dag is dan al
 * weg, en een adres dat het begeeft hoort de rest niet mee te sleuren.
 */
export async function removeSession(
  sessionId: string,
): Promise<{ ok: true; orders: number } | { ok: false; code: 'SESSION_NOT_FOUND' | 'SESSION_HAS_PICKUPS' }> {
  const session = await prisma.theokotSession.findUnique({
    where: { id: sessionId },
    include: {
      orders: {
        include: {
          user: { select: { name: true, email: true, locale: true } },
          lines: { include: { sessionItem: { select: { nameNl: true, nameEn: true } } } },
          voucherRedemption: { select: { id: true } },
        },
      },
    },
  });
  if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' };
  // Alles wat al echt gebeurd is, houdt de dag tegen: een opgehaald broodje, en
  // ook bonnetjes die al afgeboekt zijn. Die komen niet terug wanneer de
  // bestelling met de dag mee verdwijnt.
  if (
    session.orders.some(
      (order) =>
        order.status === 'PICKED_UP' ||
        order.pickedUpAt !== null ||
        order.voucherRedemption !== null,
    )
  ) {
    return { ok: false, code: 'SESSION_HAS_PICKUPS' };
  }

  const notify = session.orders
    .filter((order) => order.status === 'RESERVED')
    .map((order) => ({
      user: order.user,
      itemsLabel: itemsLabel(
        order.lines.map((line) => ({
          quantity: line.quantity,
          name: order.user.locale === 'EN' ? line.sessionItem.nameEn ?? line.sessionItem.nameNl : line.sessionItem.nameNl,
        })),
      ),
    }));

  // De bestellingen en het aanbod hangen met onDelete: Cascade aan de sessie.
  await prisma.theokotSession.delete({ where: { id: sessionId } });

  for (const row of notify) {
    await sendOrderCancelled(row.user, {
      dateLabel: dayLabel(session.date, row.user.locale),
      reason:
        row.user.locale === 'EN'
          ? 'That sale day has been removed.'
          : 'Die verkoopdag gaat niet door.',
      itemsLabel: row.itemsLabel,
    });
  }

  return { ok: true, orders: notify.length };
}

/**
 * Schrapt één bestelling in opdracht van het beheer, en verwittigt de student.
 *
 * Nodig omdat er niets automatisch geschrapt wordt wanneer het aanbod onder het
 * bestelde aantal zakt: dan kiest een mens wie eruit gaat. Hier gebeurt dat, per
 * bestelling, met dezelfde mail als bij een verkoopdag die wegvalt.
 *
 * Wissen en niet op een status zetten, net zoals wanneer de student zelf
 * annuleert: dat geeft de broodjes vrij en maakt het bestelslot van die dag weer
 * leeg, zodat er iemand anders kan reserveren.
 *
 * Kan niet meer wanneer de bestelling opgehaald is of er bonnetjes op afgeboekt
 * zijn; die zijn echt gebeurd en komen niet terug.
 */
export async function removeOrder(
  orderId: string,
): Promise<
  | { ok: true; userName: string; dateLabel: string }
  | { ok: false; code: 'ORDER_NOT_FOUND' | 'ORDER_NOT_REMOVABLE' }
> {
  const order = await prisma.theokotOrder.findUnique({
    where: { id: orderId },
    include: {
      user: { select: { name: true, email: true, locale: true } },
      session: { select: { date: true } },
      lines: { include: { sessionItem: { select: { nameNl: true, nameEn: true } } } },
      voucherRedemption: { select: { id: true } },
    },
  });
  if (!order) return { ok: false, code: 'ORDER_NOT_FOUND' };
  if (order.status === 'PICKED_UP' || order.pickedUpAt !== null || order.voucherRedemption !== null) {
    return { ok: false, code: 'ORDER_NOT_REMOVABLE' };
  }

  const label = itemsLabel(
    order.lines.map((line) => ({
      quantity: line.quantity,
      name:
        order.user.locale === 'EN'
          ? line.sessionItem.nameEn ?? line.sessionItem.nameNl
          : line.sessionItem.nameNl,
    })),
  );

  await prisma.theokotOrder.delete({ where: { id: orderId } });

  await sendOrderCancelled(order.user, {
    dateLabel: dayLabel(order.session.date, order.user.locale),
    reason:
      order.user.locale === 'EN'
        ? 'Someone from Theokot cancelled it.'
        : 'Iemand van Theokot heeft ze geannuleerd.',
    itemsLabel: label,
  });

  return {
    ok: true,
    userName: order.user.name,
    dateLabel: dayLabel(order.session.date, order.user.locale),
  };
}
