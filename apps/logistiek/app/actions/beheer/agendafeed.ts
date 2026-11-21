'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import type { UitleenFeedScope } from '@prisma/client';
import { canManage, requireSession } from '@/lib/session';
import {
  createFeedToken,
  hashFeedToken,
  liveFeedTokenWhere,
  MAX_ACTIVE_FEED_TOKENS,
} from '@/lib/calendar/feed-token';
import { logistiekBaseUrl } from '@/lib/payments';
import { isDriver } from '@/lib/uitleen-server';
import type { ActionResult } from '@/app/actions/uitleen';

// ---------------------------------------------------------------------------
// Agendafeed (A1)
// ---------------------------------------------------------------------------

/**
 * Een abonneerbare agendafeed aanmaken.
 *
 * Het token komt **één keer** terug en wordt daarna nergens meer bewaard: enkel
 * de sha256 staat in de databank. Dat is de prijs van een geheim in een URL, en
 * het is de reden dat het scherm zegt dat je hem nu moet kopiëren.
 *
 * `TEAM` (de hele planning) vraagt `logistiek.manage`; `DRIVER` (enkel je eigen
 * ritten) vraagt dat je in de chauffeurslijst staat. Die check gebeurt bij het
 * aanmaken én bij elke poll (`feedOwnerMayRead` in de route): wie na 15 juli
 * zijn rechten kwijt is of uit de chauffeurslijst valt, krijgt niets meer.
 */
export async function createFeedTokenAction(input: {
  label: string;
  scope: 'TEAM' | 'DRIVER';
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const session = await requireSession();

  const label = input.label.trim();
  if (!label) return { ok: false, error: 'Geef het abonnement een naam, bv. "mijn gsm".' };

  const scope: UitleenFeedScope = input.scope === 'TEAM' ? 'TEAM' : 'DRIVER';
  if (scope === 'TEAM' && !canManage(session)) {
    return { ok: false, error: 'De volledige planning is voorbehouden voor het team.' };
  }
  if (scope === 'DRIVER' && !(await isDriver(session.user.id))) {
    return { ok: false, error: 'Je staat niet in de chauffeurslijst.' };
  }

  // Een vervallen abonnement neemt geen plaats meer in (`liveFeedTokenWhere`).
  const active = await prisma.uitleenFeedToken.count({
    where: { userId: session.user.id, ...liveFeedTokenWhere() },
  });
  if (active >= MAX_ACTIVE_FEED_TOKENS) {
    return {
      ok: false,
      error: `Je hebt al ${MAX_ACTIVE_FEED_TOKENS} abonnementen. Trek er eerst een in.`,
    };
  }

  const token = createFeedToken();
  await prisma.uitleenFeedToken.create({
    data: {
      userId: session.user.id,
      label: label.slice(0, 100),
      scope,
      tokenHash: hashFeedToken(token),
    },
  });

  revalidatePath('/beheer/instellingen');
  revalidatePath('/ritten');
  // De URL komt hier één keer terug en wordt daarna nergens meer bewaard; enkel
  // de sha256 staat in de databank.
  return { ok: true, url: `${logistiekBaseUrl()}/api/kalender/${token}` };
}

/**
 * Een abonnement intrekken. Intrekken en niet verwijderen: zo blijft in de lijst
 * staan dat er ooit een was, en wordt het token nooit hergebruikt.
 */
export async function revokeFeedTokenAction(tokenId: string): Promise<ActionResult> {
  const session = await requireSession();

  const updated = await prisma.uitleenFeedToken.updateMany({
    // Op `userId` mee: je trekt je eigen abonnementen in, niet die van een
    // collega. Ook een teamlid niet; die weet niet welk toestel eraan hangt.
    where: { id: tokenId, userId: session.user.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (updated.count === 0) return { ok: false, error: 'Dit abonnement bestaat niet (meer).' };

  revalidatePath('/beheer/instellingen');
  revalidatePath('/ritten');
  return { ok: true, message: 'Abonnement ingetrokken.' };
}
