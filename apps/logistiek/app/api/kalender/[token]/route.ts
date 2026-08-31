import { prisma } from '@vtk/db';
import { hashFeedToken, isFeedToken, shouldTouchLastUsed } from '@/lib/calendar/feed-token';
import { buildTransportFeed } from '@/lib/calendar/transport-feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * De agendafeed van de transportplanning (A1).
 *
 * Het geheim zit in de URL, want een agenda-client stuurt geen cookies mee. Dat
 * bepaalt de rest van deze route:
 *
 * - **Nergens bewaren.** `private, no-store` en `noindex`; een tussenliggende
 *   proxy of een zoekmachine mag hier niets van vasthouden.
 * - **Formaat eerst, databank daarna.** Zonder die check kost elk willekeurig
 *   pad onder deze route een query.
 * - **404 en geen 403** bij een ingetrokken of onbekend token: wie een token
 *   probeert, hoort niet te leren dat het ooit bestaan heeft.
 *
 * De `.ics`-suffix mag: sommige agenda-apps hangen die aan de URL en tonen de
 * feed anders niet.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token: raw } = await ctx.params;
  const token = raw.replace(/\.ics$/i, '');
  if (!isFeedToken(token)) return notFound();

  const row = await prisma.uitleenFeedToken.findUnique({
    where: { tokenHash: hashFeedToken(token) },
    select: {
      id: true,
      userId: true,
      scope: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { active: true, deletedAt: true } },
    },
  });
  // Een ingetrokken token, of iemand die niet meer op vtk.be staat: dan stopt de
  // feed, want de rechten waarmee ze ooit gemaakt is, gelden niet meer.
  if (!row || row.revokedAt || !row.user.active || row.user.deletedAt) return notFound();

  const body = await buildTransportFeed(row.scope, row.userId);

  if (shouldTouchLastUsed(row.lastUsedAt)) {
    // Los van het antwoord: mislukt deze schrijfactie, dan is de feed nog altijd
    // geldig en hoort de client hem gewoon te krijgen.
    prisma.uitleenFeedToken
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch((error) => console.error('[feed] lastUsedAt bijwerken mislukt:', error));
  }

  return new Response(body, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="vtk-logistiek.ics"',
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}

function notFound(): Response {
  return new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' },
  });
}
