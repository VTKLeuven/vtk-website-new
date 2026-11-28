import 'server-only';

import { driverPhones, prisma } from '@vtk/db';
import type { ShiftRide } from '@/lib/shift';

/**
 * Wie er rijdt op de rit van een bijrijdshift, met het nummer erbij.
 *
 * Een bijrijdshift (zoals C&G) hangt via `Shift.transportBookingId` aan een rit
 * van de uitleendienst. De chauffeur staat op die rit en niet op de shift: zet
 * Logistiek er iemand anders op, dan volgt dit vanzelf. Het nummer komt uit
 * `driverPhones` in `@vtk/db`, dezelfde bron als in de uitleendienst, zodat de
 * bijrijder hetzelfde nummer ziet als Logistiek.
 *
 * **Enkel voor wie op de shift staat.** De aanroepers geven dit niet mee aan
 * wie de shift nog moet opnemen: het nummer van een chauffeur is voor wie met
 * hem meerijdt (zie `registeredShifts` en de herinneringsmail).
 *
 * Per rit-id een `ShiftRide`; een rit zonder chauffeur geeft `driver: null`, dan
 * zegt het scherm "nog niet gekend" in plaats van niets.
 */
export async function shiftRides(bookingIds: Array<string | null | undefined>): Promise<Map<string, ShiftRide>> {
  const ids = [...new Set(bookingIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();

  const trips = await prisma.uitleenTransportBooking.findMany({
    where: { id: { in: ids } },
    select: { id: true, status: true, driver: { select: { id: true, name: true } } },
  });
  // Een afgewezen of geannuleerde rit rijdt niet; wie er ooit op stond, is dan
  // niet de chauffeur van deze shift.
  const driving = trips.filter((trip) => trip.status !== 'REJECTED' && trip.status !== 'CANCELLED');
  const phones = await driverPhones(driving.flatMap((trip) => (trip.driver ? [trip.driver.id] : [])));

  const rides = new Map<string, ShiftRide>();
  for (const trip of trips) {
    const driver = driving.includes(trip) ? trip.driver : null;
    rides.set(trip.id, {
      driver: driver ? { name: driver.name, phone: phones.get(driver.id)?.number ?? null } : null,
    });
  }
  return rides;
}
