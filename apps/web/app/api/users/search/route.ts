import { NextResponse } from 'next/server';
import { prisma } from '@vtk/db';
import { requireSession, authErrorResponse } from '@/lib/session';

/**
 * Zoek actieve gebruikers op naam, e-mail of r-nummer (server-side, gelimiteerd).
 *
 * `GET /api/users/search?q=<term>&limit=<n>`: bedoeld voor pickers zoals de
 * deelnemer-selectie in shiftbeheer. Schaalt naar duizenden users: er wordt
 * altijd maar een klein aantal matches teruggegeven i.p.v. de hele tabel.
 *
 * Toegang: ingelogd én `users.search`, of superadmin. Dat recht zit in de
 * praesidium-rol, dus elk praesidiumlid heeft het; rollen die een user-picker
 * nodig hebben maar geen praesidium zijn, moeten het expliciet krijgen.
 */
export async function GET(request: Request) {
  let session;
  try {
    session = await requireSession();
  } catch (err) {
    return authErrorResponse(err);
  }

  const allowed = session.user.isSuperAdmin || session.permissions.includes('users.search');
  if (!allowed) {
    return NextResponse.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') ?? '').trim();
  const limitParam = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 50) : 20;

  // Vermijd zware "match alles"-queries: pas zoeken vanaf 2 tekens.
  if (q.length < 2) {
    return NextResponse.json([]);
  }

  const users = await prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { rNumber: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { name: 'asc' },
    take: limit,
    select: { id: true, name: true, email: true, rNumber: true },
  });

  return NextResponse.json(users);
}
