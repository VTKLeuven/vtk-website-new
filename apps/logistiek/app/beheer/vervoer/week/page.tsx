import Link from 'next/link';
import { requireManage } from '@/lib/session';
import {
  formatDateRange,
  isoWeekNumber,
  parseDateOnly,
  requesterLabel,
  startOfWeek,
  toDateInputValue,
} from '@/lib/uitleen';
import {
  activeVehicles,
  driverOptions,
  transportWeek,
  type TransportWeekBooking,
} from '@/lib/uitleen-server';
import { TransportWeekPlanner, type PlannerTrip } from './week-planner';
import type { WeekBlock } from '@/components/transport-week-grid';

const DAY_MS = 24 * 60 * 60 * 1000;

const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Goedgekeurde ritten van hetzelfde voertuig die elkaar overlappen. Dat hoort
 * niet te kunnen (de goedkeuring checkt het), maar een voertuigwissel of een
 * handmatige ingreep kan het alsnog veroorzaken, en dan wil je het zien.
 */
function conflictingIds(bookings: TransportWeekBooking[]): Set<string> {
  const conflicts = new Set<string>();
  const approved = bookings.filter((booking) => booking.status === 'APPROVED');
  for (let i = 0; i < approved.length; i++) {
    for (let j = i + 1; j < approved.length; j++) {
      const a = approved[i];
      const b = approved[j];
      if (a.vehicleId !== b.vehicleId) continue;
      if (a.startAt < b.endAt && b.startAt < a.endAt) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      }
    }
  }
  return conflicts;
}

export default async function VervoerWeekPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireManage();
  const { week } = await searchParams;

  const monday = startOfWeek((week && parseDateOnly(week)) || new Date());
  const nextMonday = new Date(monday.getTime() + 7 * DAY_MS);
  const days = Array.from({ length: 7 }, (_, index) =>
    new Date(monday.getTime() + index * DAY_MS).toISOString()
  );

  const [bookings, vehicles, drivers] = await Promise.all([
    transportWeek(monday, nextMonday),
    activeVehicles(),
    driverOptions(),
  ]);

  const conflicts = conflictingIds(bookings);
  const thisWeek = startOfWeek(new Date());

  const previousHref = `/beheer/vervoer/week?week=${toDateInputValue(new Date(monday.getTime() - 7 * DAY_MS))}`;
  const nextHref = `/beheer/vervoer/week?week=${toDateInputValue(nextMonday)}`;

  const blocks: WeekBlock[] = bookings.map((booking) => ({
    id: booking.id,
    vehicleId: booking.vehicleId,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    status: booking.status,
    title: booking.eventName?.trim() || booking.purpose,
    subtitle: requesterLabel(booking),
    driver:
      booking.driver && booking.driverId
        ? { id: booking.driverId, name: booking.driver.name }
        : null,
    conflict: conflicts.has(booking.id),
  }));

  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

  const trips: PlannerTrip[] = bookings.map((booking) => {
    // De andere ritten van dezelfde aanvraag: het goedkeurformulier beslist over
    // de hele groep, dus het moet ze alle tonen met hun eigen uren.
    const legs = booking.tripGroupId
      ? bookings.filter((other) => other.tripGroupId === booking.tripGroupId)
      : [booking];
    const vehicle = vehicleById.get(booking.vehicleId);
    return {
      id: booking.id,
      purpose: booking.purpose,
      eventName: booking.eventName,
      requesterLabel: requesterLabel(booking),
      userName: booking.user.name,
      contactPhone: booking.contactPhone,
      pickupAddress: booking.pickupAddress,
      destination: booking.destination,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      status: booking.status,
      vehicleId: booking.vehicleId,
      driverId: booking.driverId,
      driver:
        booking.driver && booking.driverId
          ? { id: booking.driverId, name: booking.driver.name }
          : null,
      pricingMode: booking.pricingMode,
      requesterType: booking.requesterType,
      needsDriver: vehicle?.needsDriver ?? true,
      needsVanDriver: vehicle?.needsVanDriver ?? false,
      paid: booking.paidOfflineAt !== null,
      legs: legs
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
        .map((leg) => ({
          id: leg.id,
          startAt: toDatetimeLocal(leg.startAt),
          endAt: toDatetimeLocal(leg.endAt),
          label:
            legs.length > 1
              ? [
                  leg.tripLeg === 'TERUG' ? 'Terugrit' : leg.tripLeg === 'HEEN' ? 'Heenrit' : null,
                  vehicleById.get(leg.vehicleId)?.nameNl ?? null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Rit'
              : null,
        })),
      // Wat er die dag al vaststaat met dit voertuig, om naar te schuiven.
      sameDayBookings: bookings
        .filter(
          (other) =>
            other.id !== booking.id &&
            other.vehicleId === booking.vehicleId &&
            other.status === 'APPROVED' &&
            other.startAt.toDateString() === booking.startAt.toDateString()
        )
        .map(
          (other) =>
            `${timeFormatter.format(other.startAt)}-${timeFormatter.format(other.endAt)} · ${
              other.eventName?.trim() || other.purpose
            }`
        ),
    };
  });

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
            Week {isoWeekNumber(monday)}
          </h2>
          <p className="text-sm text-vtk-muted">
            {formatDateRange(monday, new Date(nextMonday.getTime() - DAY_MS))}
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label="Week kiezen">
          <Link
            href={previousHref}
            className="rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40"
          >
            ← Vorige
          </Link>
          <Link
            href="/beheer/vervoer/week"
            aria-current={monday.getTime() === thisWeek.getTime() ? 'true' : undefined}
            className={
              monday.getTime() === thisWeek.getTime()
                ? 'rounded-full border border-vtk-navy bg-vtk-navy px-3 py-1.5 font-semibold text-white'
                : 'rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40'
            }
          >
            Deze week
          </Link>
          <Link
            href={nextHref}
            className="rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40"
          >
            Volgende →
          </Link>
          <Link
            href="/beheer/vervoer"
            className="ml-2 font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
            Lijst
          </Link>
          <Link
            href="/vervoer/bezetting"
            className="font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
            Publieke bezetting
          </Link>
        </nav>
      </div>

      {vehicles.length === 0 ? (
        <p className="text-sm text-vtk-muted">Er staan nog geen voertuigen in de instellingen.</p>
      ) : (
        <>
          <TransportWeekPlanner
            days={days}
            vehicles={vehicles.map((vehicle) => ({ id: vehicle.id, name: vehicle.nameNl }))}
            blocks={blocks}
            trips={trips}
            drivers={drivers}
            vehicleOptions={vehicles.map((vehicle) => ({
              id: vehicle.id,
              name: vehicle.nameNl,
              needsVanDriver: vehicle.needsVanDriver,
            }))}
          />

          <p className="text-xs text-vtk-muted">
            Elke chauffeur heeft zijn eigen kleur; een rit zonder chauffeur is geel. Gestreept =
            nog te beslissen, doorzichtig = afgerond, rood = twee goedgekeurde ritten met hetzelfde
            voertuig op hetzelfde moment. Klik een rit aan om ze te beslissen of aan te passen.
          </p>
        </>
      )}
    </div>
  );
}

/** "YYYY-MM-DDTHH:mm" in Belgische tijd, voor de datetime-local-velden. */
function toDatetimeLocal(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  const hour = get('hour') === '24' ? '00' : get('hour');
  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}
