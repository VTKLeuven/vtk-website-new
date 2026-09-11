import { prisma } from '@vtk/db';
import { maintenanceSecret, reconcilePayments } from '@/lib/payments';
import { sendTeamDigests } from '@/lib/uitleen-mail';

export const runtime = 'nodejs';

/**
 * Vangnet naast de webhook: reconciliëert openstaande betalingen tegen de
 * provider en laat verlopen checkouts vervallen. Wordt periodiek aangeroepen
 * door de logistiek-worker (curl-loop in infra/docker-compose.yml).
 *
 * Draagt sinds R4 ook de gebundelde teammelding. Een eigen worker ernaast zou
 * netter ogen, maar deze wekker draait toch al elke minuut en `sendTeamDigests`
 * beslist zelf of het uur om is; twee wekkers voor één app is een tweede ding
 * dat stil kan uitvallen.
 */
export async function POST(request: Request): Promise<Response> {
  const secret = maintenanceSecret();
  if (!secret) return new Response('maintenance disabled', { status: 503 });
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) return new Response('forbidden', { status: 403 });

  const now = new Date();
  const open = await prisma.uitleenPayment.findMany({
    where: { status: { in: ['CREATED', 'PENDING'] } },
    orderBy: { createdAt: 'asc' },
    take: 50,
  });

  const reconciled = await reconcilePayments(open.filter((payment) => payment.providerCheckoutId !== null));

  // Checkouts zonder provider-referentie of ver over hun vervaltijd laten we vallen.
  const { count: expired } = await prisma.uitleenPayment.updateMany({
    where: {
      status: { in: ['CREATED', 'PENDING'] },
      expiresAt: { lt: new Date(now.getTime() - 60 * 60 * 1000) },
    },
    data: { status: 'EXPIRED', failedAt: now },
  });

  // Ná de betalingen en niet ervoor: die zijn het vangnet waar geld aan hangt,
  // en een mailserver die er even niet is, mag ze niet ophouden. `sendTeamDigests`
  // vangt zelf en gooit niet.
  const digests = await sendTeamDigests(now);

  return Response.json({ open: open.length, reconciled, expired, digests });
}
