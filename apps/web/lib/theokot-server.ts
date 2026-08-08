/**
 * Server-only Theokot-logica die de database en mail raakt: config lezen,
 * ban-status opvragen en de no-show-verwerking. Gescheiden van `lib/theokot.ts`
 * (zuiver, client-safe) zodat prisma/mail nooit in een clientbundel belanden.
 */

import { prisma } from '@vtk/db';
import { DEFAULT_THEOKOT_CONFIG, parseTheokotConfig, type TheokotConfig } from './theokot';
import { sendNoShowWarning } from './mail';
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
 * No-shows worden geteld sinds het einde van de laatste ban (of alle tijd wanneer
 * er nog nooit een ban was), zodat een gebruiker na een ban weer met een schone lei
 * begint en niet meteen opnieuw geband wordt.
 */
async function applyNoShowConsequences(
  order: { id: string; userId: string; user: { name: string; email: string; locale: 'NL' | 'EN' } },
  sessionDate: Date,
  config: TheokotConfig,
): Promise<void> {
  await sendNoShowWarning(
    order.user,
    sessionDateLabel(sessionDate, order.user.locale),
    order.id,
  );

  await withSerializableTransaction(async (tx) => {
    const lastBan = await tx.theokotBan.findFirst({
      where: { userId: order.userId },
      orderBy: { endsAt: 'desc' },
    });
    const since = lastBan ? lastBan.endsAt : new Date(0);
    const noShowCount = await tx.theokotOrder.count({
      where: { userId: order.userId, status: 'NO_SHOW', updatedAt: { gt: since } },
    });
    if (noShowCount < config.noShowThreshold) return;
    const active = await tx.theokotBan.findFirst({
      where: { userId: order.userId, active: true, startsAt: { lte: new Date() }, endsAt: { gt: new Date() } },
      select: { id: true },
    });
    if (active) return;
    await tx.theokotBan.create({
      data: {
        userId: order.userId,
        reason: `${noShowCount} niet-opgehaalde bestellingen`,
        endsAt: new Date(Date.now() + config.banDurationDays * 86400000),
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
