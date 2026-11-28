import { NextResponse } from 'next/server';
import { prisma } from '@vtk/db';
import { authErrorResponse, requireAnyPermission } from '@/lib/session';
import { localDateTimeToUtc } from '@/lib/ticketing/time';
import { SHIFT_TRIP_SELECT, toShiftTripOption } from '@/lib/shift/tripOptions';

/**
 * De ritten van de uitleendienst op één dag, om er in /admin/shiften een
 * bijrijdshift aan te hangen: `GET /api/shift/trips?date=2026-11-28`.
 *
 * Per dag en niet "alle komende ritten": een C&G-reeks staat elke week, en een
 * lijst van een semester ritten leest niemand. Het venster vraagt de dag van de
 * shift op en toont wat er dan rijdt.
 *
 * Goedgekeurd en aangevraagd; een afgewezen of geannuleerde rit rijdt niet. Geen
 * nummers en geen adressen: dit is een keuzelijst, en het nummer van de chauffeur
 * is voor wie op de shift staat (`lib/shift/driver.ts`).
 */
export async function GET(request: Request) {
  try {
    await requireAnyPermission(['shift.edit', 'shift.editAll']);
  } catch (err) {
    return authErrorResponse(err);
  }

  const date = new URL(request.url).searchParams.get('date') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  // Middernacht tot middernacht op de Brusselse klok, ook op de dag dat het uur
  // verspringt: de volgende dag als datum uitrekenen, niet als 24 uur.
  const [year, month, day] = date.split('-').map(Number);
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  let from: Date;
  let dayEnd: Date;
  try {
    from = localDateTimeToUtc(`${date}T00:00`);
    dayEnd = localDateTimeToUtc(`${nextDate}T00:00`);
  } catch {
    return NextResponse.json({ error: 'date must be a real date' }, { status: 400 });
  }

  const trips = await prisma.uitleenTransportBooking.findMany({
    where: {
      status: { in: ['APPROVED', 'REQUESTED'] },
      // Alles wat die Brusselse dag raakt, ook een rit die de avond ervoor begon.
      startAt: { lt: dayEnd },
      endAt: { gt: from },
    },
    orderBy: { startAt: 'asc' },
    select: SHIFT_TRIP_SELECT,
  });

  return NextResponse.json(trips.map(toShiftTripOption));
}
