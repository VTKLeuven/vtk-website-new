/**
 * Server-only Theokot-logica die de database en mail raakt: config lezen,
 * ban-status opvragen en de no-show-verwerking. Gescheiden van `lib/theokot.ts`
 * (zuiver, client-safe) zodat prisma/mail nooit in een clientbundel belanden.
 */

import { prisma } from '@vtk/db';
import { DEFAULT_THEOKOT_CONFIG, parseTheokotConfig, type TheokotConfig } from './theokot';
import { sendNoShowWarning, sendOrderCancelled } from './mail';
import { withSerializableTransaction } from './ticketing/transactions';

/** De notitie waarmee de no-show-verwerking een ban aanmaakt; zo is hij te herkennen. */
const AUTOMATIC_BAN_NOTE = 'Automatisch aangemaakt door de no-show-verwerking.';

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
 */
async function applyNoShowConsequences(
  order: { id: string; userId: string; user: { name: string; email: string; locale: 'NL' | 'EN' } },
  sessionDate: Date,
  config: TheokotConfig,
): Promise<void> {
  await sendNoShowMail(order, sessionDate);
  await applyBanIfDue(order.userId, config);
}

/** De no-showmail van één bestelling; een mislukte verzending houdt niets tegen. */
async function sendNoShowMail(
  order: { id: string; user: { name: string; email: string; locale: 'NL' | 'EN' } },
  sessionDate: Date,
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
}

/**
 * Spreekt een ban uit wanneer iemand de drempel haalt en er nog geen loopt.
 *
 * No-shows worden geteld sinds het einde van de laatste ban die al voorbij is (of
 * alle tijd wanneer er nog nooit een ban was), zodat een gebruiker na een ban weer
 * met een schone lei begint en niet meteen opnieuw geband wordt. Een ban die nog
 * loopt of vroegtijdig opgeheven is, telt niet als ondergrens: anders zou het
 * opheffen van een ban meteen ook immuniteit geven tot de oorspronkelijke
 * einddatum.
 */
async function applyBanIfDue(userId: string, config: TheokotConfig): Promise<boolean> {
  return withSerializableTransaction(async (tx) => {
    const now = new Date();
    // De laatste ban die effectief afgelopen is. Zonder die `endsAt`-grens telde
    // een ban die vandaag opgeheven werd (`active: false`, einddatum blijft
    // staan) mee als ondergrens, en dan stond de teller tot die datum op nul:
    // wie net vergiffenis kreeg, was twee weken onaantastbaar.
    const lastBan = await tx.theokotBan.findFirst({
      where: { userId, endsAt: { lte: now } },
      orderBy: { endsAt: 'desc' },
    });
    const since = lastBan ? lastBan.endsAt : new Date(0);
    const noShowCount = await tx.theokotOrder.count({
      where: {
        userId,
        status: 'NO_SHOW',
        // Wat tijdens een pauze viel, telt ook achteraf niet mee.
        noShowWaivedAt: null,
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
    if (noShowCount < config.noShowThreshold) return false;
    const active = await tx.theokotBan.findFirst({
      where: { userId, active: true, startsAt: { lte: now }, endsAt: { gt: now } },
      select: { id: true },
    });
    if (active) return false;
    await tx.theokotBan.create({
      data: {
        userId,
        reason: `${noShowCount} niet-opgehaalde bestellingen`,
        endsAt: new Date(now.getTime() + config.banDurationDays * 86400000),
        note: AUTOMATIC_BAN_NOTE,
      },
    });
    return true;
  });
}

/**
 * Verwerkt alle vervallen verkoopsessies: markeert nog-gereserveerde bestellingen
 * als no-show, verstuurt waarschuwingsmails en past bans toe. Idempotent via
 * `session.processedAt`: een reeds verwerkte sessie wordt overgeslagen.
 *
 * Staat de verwerking gepauzeerd (`noShowPaused`), of is de dag als "er liep
 * iets mis" aangeduid (`noShowsWaivedAt`), dan wordt de dag wel afgesloten en
 * blijven de bestellingen als niet opgehaald geboekt, maar vertrekt er geen
 * mail, komt er geen ban, en krijgt de bestelling `noShowWaivedAt`, zodat ze
 * ook later niet meetelt. Bewust niet "de dag laten liggen tot de pauze
 * voorbij is": dan vertrokken bij het hervatten alle mails van de hele pauze in
 * één keer, voor dagen die iedereen al vergeten is.
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
        if (config.noShowPaused || session.noShowsWaivedAt) {
          await prisma.theokotOrder.updateMany({
            where: { id: order.id, noShowProcessedAt: null },
            data: { noShowProcessedAt: new Date(), noShowWaivedAt: new Date() },
          });
          noShows += 1;
          continue;
        }
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

/**
 * "Er liep iets mis" op een verkoopdag: de no-shows van die dag tellen niet
 * mee, en de verwerking stuurt er geen mail meer voor.
 *
 * Was de dag al verwerkt, dan zijn de mails vertrokken; die zijn niet terug te
 * halen. Wat wel kan: elke automatische ban die nog loopt bij iemand met een
 * no-show op die dag, opnieuw tellen zonder de no-shows die niet meer meetellen.
 * Komt die persoon dan onder de drempel, dan valt de ban weg, op dezelfde
 * manier als `liftBanAction` (einddatum naar nu). Een ban die de beheerder zelf
 * uitsprak, blijft staan.
 */
export async function waiveSessionNoShows(
  sessionId: string,
  now: Date = new Date(),
): Promise<{ date: Date; orders: number; liftedBans: number; alreadyMailed: boolean } | null> {
  const session = await prisma.theokotSession.findUnique({
    where: { id: sessionId },
    select: { id: true, date: true, processedAt: true, noShowsWaivedAt: true },
  });
  if (!session) return null;

  if (!session.noShowsWaivedAt) {
    await prisma.theokotSession.update({ where: { id: session.id }, data: { noShowsWaivedAt: now } });
  }
  const affected = await prisma.theokotOrder.findMany({
    where: { sessionId: session.id, status: 'NO_SHOW', noShowWaivedAt: null },
    select: { id: true, userId: true, noShowProcessedAt: true },
  });
  if (affected.length > 0) {
    await prisma.theokotOrder.updateMany({
      where: { id: { in: affected.map((order) => order.id) } },
      data: { noShowWaivedAt: now },
    });
  }

  const config = await getTheokotConfig();
  let liftedBans = 0;
  for (const userId of new Set(affected.map((order) => order.userId))) {
    const ban = await prisma.theokotBan.findFirst({
      where: { userId, active: true, endsAt: { gt: now }, note: AUTOMATIC_BAN_NOTE },
      orderBy: { endsAt: 'desc' },
    });
    if (!ban) continue;
    // Dezelfde telling als bij het uitspreken (`applyNoShowConsequences`): sinds
    // het einde van de ban daarvoor, zonder wat niet meetelt.
    const previous = await prisma.theokotBan.findFirst({
      where: { userId, id: { not: ban.id }, endsAt: { lte: ban.startsAt } },
      orderBy: { endsAt: 'desc' },
    });
    const since = previous ? previous.endsAt : new Date(0);
    const count = await prisma.theokotOrder.count({
      where: {
        userId,
        status: 'NO_SHOW',
        noShowWaivedAt: null,
        OR: [
          { noShowProcessedAt: { gt: since } },
          { noShowProcessedAt: null, updatedAt: { gt: since } },
        ],
      },
    });
    if (count >= config.noShowThreshold) continue;
    await prisma.theokotBan.update({
      where: { id: ban.id },
      data: { active: false, endsAt: now },
    });
    liftedBans += 1;
  }

  return {
    date: session.date,
    orders: affected.length,
    liftedBans,
    alreadyMailed: session.processedAt !== null || affected.some((order) => order.noShowProcessedAt !== null),
  };
}

/**
 * Draait "Er liep iets mis" terug, voor wie het per ongeluk aanduidde: de
 * no-shows van die dag tellen weer mee, alsof de dag nooit aangeduid was.
 *
 * - Een automatische ban die de aanduiding ophief (`waiveSessionNoShows` zet
 *   `endsAt` op het moment van aanduiden), gaat opnieuw in tot haar
 *   oorspronkelijke einddatum.
 * - Werd de dag verwerkt terwijl ze aangeduid stond, dan vertrok er geen
 *   no-showmail. Die vertrekt nu alsnog, en wie daardoor de drempel haalt,
 *   krijgt een ban. Staat de verwerking gepauzeerd, dan blijven die no-shows
 *   net als tijdens elke pauze buiten beschouwing.
 * - Een no-show die al vóór de aanduiding niet meetelde (een pauze), blijft zo:
 *   enkel wat deze aanduiding wegnam, komt terug.
 */
export async function unwaiveSessionNoShows(
  sessionId: string,
): Promise<{ date: Date; orders: number; mailed: number; restoredBans: number; newBans: number } | null> {
  const session = await prisma.theokotSession.findUnique({
    where: { id: sessionId },
    select: { id: true, date: true, noShowsWaivedAt: true },
  });
  if (!session) return null;
  const waivedAt = session.noShowsWaivedAt;
  if (!waivedAt) return { date: session.date, orders: 0, mailed: 0, restoredBans: 0, newBans: 0 };

  const config = await getTheokotConfig();
  const waived = await prisma.theokotOrder.findMany({
    where: { sessionId: session.id, status: 'NO_SHOW', noShowWaivedAt: { gte: waivedAt } },
    include: { user: { select: { name: true, email: true, locale: true } } },
  });
  // Verwerkt terwijl de dag aangeduid stond: die kregen geen mail.
  const unmailed = (order: (typeof waived)[number]) =>
    order.noShowProcessedAt !== null && order.noShowProcessedAt >= waivedAt;
  const restore = config.noShowPaused ? waived.filter((order) => !unmailed(order)) : waived;

  await prisma.theokotSession.update({ where: { id: session.id }, data: { noShowsWaivedAt: null } });
  if (restore.length > 0) {
    await prisma.theokotOrder.updateMany({
      where: { id: { in: restore.map((order) => order.id) } },
      data: { noShowWaivedAt: null },
    });
  }

  const users = [...new Set(restore.map((order) => order.userId))];
  // De aanduiding hief bans op met `endsAt` op exact haar eigen tijdstip.
  const lifted = await prisma.theokotBan.findMany({
    where: { userId: { in: users }, active: false, endsAt: waivedAt, note: AUTOMATIC_BAN_NOTE },
    select: { id: true, startsAt: true },
  });
  for (const ban of lifted) {
    await prisma.theokotBan.update({
      where: { id: ban.id },
      data: { active: true, endsAt: new Date(ban.startsAt.getTime() + config.banDurationDays * 86400000) },
    });
  }

  let mailed = 0;
  for (const order of restore.filter(unmailed)) {
    await sendNoShowMail(order, session.date);
    mailed += 1;
  }
  let newBans = 0;
  for (const userId of users) {
    if (await applyBanIfDue(userId, config)) newBans += 1;
  }

  return { date: session.date, orders: restore.length, mailed, restoredBans: lifted.length, newBans };
}

/**
 * Wist een voorbije verkoopdag uit de historiek en de statistieken, ook
 * wanneer er opgehaald werd: voor een testdag of een dag die niet klopt.
 *
 * Er vertrekt geen mail: de dag is voorbij, niemand staat nog voor een gesloten
 * deur. Eerst gaan de no-shows eruit zoals bij "Er liep iets mis", zodat een
 * automatische ban die op deze dag steunde en daardoor onder de drempel zakt,
 * wegvalt; daarna gaat de dag met haar aanbod, bestellingen en afgeboekte
 * bonnetjes weg. Die bonnetjes blijven uitgegeven: het saldo komt uit de
 * shiften (`rewardPaid`), niet uit deze rijen.
 *
 * Een dag die nog moet komen, verwijder je met `removeSession`: die verwittigt
 * wie besteld had.
 */
export async function purgeFinishedSession(
  sessionId: string,
  now: Date = new Date(),
): Promise<
  | { ok: true; date: Date; orders: number; pickedUp: number; liftedBans: number }
  | { ok: false; code: 'SESSION_NOT_FOUND' | 'SESSION_NOT_OVER' }
> {
  const session = await prisma.theokotSession.findUnique({
    where: { id: sessionId },
    select: { id: true, date: true, pickupEnd: true, orders: { select: { status: true } } },
  });
  if (!session) return { ok: false, code: 'SESSION_NOT_FOUND' };
  if (session.pickupEnd > now) return { ok: false, code: 'SESSION_NOT_OVER' };

  const waived = await waiveSessionNoShows(session.id, now);
  // De bestellingen, het aanbod en de bonnetjes hangen met onDelete: Cascade aan
  // de sessie; een vergaderreservatie verliest enkel haar koppeling.
  await prisma.theokotSession.delete({ where: { id: session.id } });

  return {
    ok: true,
    date: session.date,
    orders: session.orders.filter((order) => order.status !== 'CANCELLED').length,
    pickedUp: session.orders.filter((order) => order.status === 'PICKED_UP').length,
    liftedBans: waived?.liftedBans ?? 0,
  };
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
