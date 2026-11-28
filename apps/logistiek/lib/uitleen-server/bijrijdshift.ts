import 'server-only';
import { prisma } from '@vtk/db';

/**
 * De bijrijdshiften van een reeks ritten: de shiften op vtk.be/shift met
 * `transportBookingId` op die rit (zie `lib/bijrijdshift.ts`).
 *
 * Wie ingeschreven is, staat er met de naam bij, zonder nummer: het blok bij de
 * rit zegt of er al iemand meerijdt, en het nummer van een bijrijder staat bij de
 * bijrijders zelf.
 */
export type TripShiftView = {
  id: string;
  name: string;
  startAt: string;
  endAt: string;
  places: number;
  reward: number;
  participants: string[];
};

export async function tripShifts(bookingIds: readonly string[]): Promise<Map<string, TripShiftView[]>> {
  const ids = [...new Set(bookingIds)];
  const byTrip = new Map<string, TripShiftView[]>();
  if (ids.length === 0) return byTrip;
  const rows = await prisma.shift.findMany({
    where: { transportBookingId: { in: ids } },
    select: {
      id: true,
      name: true,
      startTime: true,
      endTime: true,
      maxParticipants: true,
      reward: true,
      transportBookingId: true,
      participants: { select: { user: { select: { name: true } } } },
    },
    orderBy: { startTime: 'asc' },
  });
  for (const row of rows) {
    if (!row.transportBookingId) continue;
    const list = byTrip.get(row.transportBookingId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      startAt: row.startTime.toISOString(),
      endAt: row.endTime.toISOString(),
      places: row.maxParticipants,
      reward: row.reward,
      participants: row.participants.map((participant) => participant.user.name),
    });
    byTrip.set(row.transportBookingId, list);
  }
  return byTrip;
}
