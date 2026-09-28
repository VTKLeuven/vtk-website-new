import { NextResponse } from 'next/server';
import { prisma, searchUsers } from '@vtk/db';
import { requireSession, authErrorResponse } from '@/lib/session';

/**
 * Zoek actieve gebruikers op naam, e-mail of r-nummer (server-side, gelimiteerd).
 *
 * `GET /api/users/search?q=<term>&limit=<n>`: bedoeld voor pickers zoals de
 * deelnemer-selectie in shiftbeheer en POC-vertegenwoordigers. Schaalt naar
 * duizenden users: er wordt altijd maar een klein aantal matches teruggegeven
 * i.p.v. de hele tabel, met ondersteuning voor accenten en trema's.
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

  const users = await searchUsers(q, { limit, db: prisma });

  return NextResponse.json(users);
}
