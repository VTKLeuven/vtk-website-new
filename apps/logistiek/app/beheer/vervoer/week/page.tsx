import Link from 'next/link';
import { requireManage } from '@/lib/session';
import {
  formatDateRange,
  isoWeekNumber,
  parseDateOnly,
  requesterLabel,
  startOfWeek,
  toDateInputValue,
  todayDateOnly,
} from '@/lib/uitleen';
import { activeVehicles, transportWeek, type TransportWeekBooking } from '@/lib/uitleen-server';

const DAY_MS = 24 * 60 * 60 * 1000;

const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

const weekdayFormatter = new Intl.DateTimeFormat('nl-BE', { timeZone: 'UTC', weekday: 'short' });
const dayNumberFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
});

/**
 * Welk stuk van de rit op deze dag valt. Een rit kan meerdere dagen duren (de
 * limiet van 12 uur is er niet meer), dus ze verschijnt op elke dag die ze
 * raakt, met een label dat zegt of ze die dag begint, eindigt of doorloopt.
 */
function dayLabel(booking: { startAt: Date; endAt: Date }, dayStart: Date, dayEnd: Date): string {
  const startsToday = booking.startAt >= dayStart;
  const endsToday = booking.endAt <= dayEnd;
  if (startsToday && endsToday) {
    return `${timeFormatter.format(booking.startAt)}-${timeFormatter.format(booking.endAt)}`;
  }
  if (startsToday) return `vanaf ${timeFormatter.format(booking.startAt)}`;
  if (endsToday) return `tot ${timeFormatter.format(booking.endAt)}`;
  return 'hele dag';
}

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
  const days = Array.from({ length: 7 }, (_, index) => new Date(monday.getTime() + index * DAY_MS));

  const [bookings, vehicles] = await Promise.all([
    transportWeek(monday, nextMonday),
    activeVehicles(),
  ]);

  const conflicts = conflictingIds(bookings);
  const today = todayDateOnly();
  const thisWeek = startOfWeek(new Date());

  const previousHref = `/beheer/vervoer/week?week=${toDateInputValue(new Date(monday.getTime() - 7 * DAY_MS))}`;
  const nextHref = `/beheer/vervoer/week?week=${toDateInputValue(nextMonday)}`;

  /** Ritten van dit voertuig die deze dag raken. */
  function bookingsFor(vehicleId: string, day: Date): TransportWeekBooking[] {
    const dayEnd = new Date(day.getTime() + DAY_MS);
    return bookings.filter(
      (booking) =>
        booking.vehicleId === vehicleId && booking.startAt < dayEnd && booking.endAt > day
    );
  }

  function blockTitle(booking: TransportWeekBooking): string {
    return [
      booking.eventName ?? booking.purpose,
      requesterLabel(booking),
      booking.user.name,
      booking.driver ? `chauffeur: ${booking.driver.name}` : 'nog geen chauffeur',
      booking.status === 'REQUESTED' ? 'nog te beslissen' : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  function Block({ booking, day }: { booking: TransportWeekBooking; day: Date }) {
    const conflict = conflicts.has(booking.id);
    const requested = booking.status === 'REQUESTED';
    return (
      <Link
        href="/beheer/vervoer"
        title={blockTitle(booking)}
        className={`block rounded-[10px] px-2 py-1.5 text-left text-[11px] leading-tight transition ${
          conflict
            ? 'border border-red-300 bg-red-50 text-red-800'
            : requested
              ? 'border border-dashed border-vtk-navy/30 bg-vtk-paper text-vtk-body'
              : 'border border-transparent bg-vtk-navy text-white'
        }`}
      >
        <span className="block font-semibold tabular-nums">
          {dayLabel(booking, day, new Date(day.getTime() + DAY_MS))}
        </span>
        <span className="block truncate">{requesterLabel(booking)}</span>
        {conflict ? <span className="block font-semibold">conflict</span> : null}
        {!booking.driver && !requested ? (
          <span className={`block ${conflict ? '' : 'text-vtk-yellow'}`}>geen chauffeur</span>
        ) : null}
      </Link>
    );
  }

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
          {/* Raster: voertuigen als rijen, de zeven dagen als kolommen. Onder lg
              wordt dit een daglijst; een horizontale scroller met zeven kolommen
              verbergt meer dan hij toont. */}
          <div className="hidden overflow-hidden rounded-[16px] border border-vtk-navy/10 bg-vtk-surface lg:block">
            <div className="grid grid-cols-[9rem_repeat(7,minmax(0,1fr))]">
              <div className="border-b border-vtk-navy/10 px-3 py-2 text-xs font-semibold text-vtk-muted">
                Voertuig
              </div>
              {days.map((day) => {
                const isToday = day.getTime() === today.getTime();
                return (
                  <div
                    key={day.toISOString()}
                    className={`border-b border-l border-vtk-navy/10 px-2 py-2 text-xs font-semibold ${
                      isToday ? 'bg-vtk-yellow/20 text-vtk-ink' : 'text-vtk-muted'
                    }`}
                  >
                    <span className="capitalize">{weekdayFormatter.format(day)}</span>{' '}
                    <span className="font-normal">{dayNumberFormatter.format(day)}</span>
                  </div>
                );
              })}

              {vehicles.map((vehicle) => (
                <div key={vehicle.id} className="contents">
                  <div className="border-b border-vtk-navy/5 px-3 py-2 text-sm font-medium text-vtk-ink">
                    {vehicle.nameNl}
                  </div>
                  {days.map((day) => {
                    const dayBookings = bookingsFor(vehicle.id, day);
                    const isToday = day.getTime() === today.getTime();
                    return (
                      <div
                        key={day.toISOString()}
                        // content-start: een rit houdt haar eigen hoogte en rekt
                        // niet uit tot de hoogte van de drukste dag van de week.
                        className={`grid content-start gap-1 border-b border-l border-vtk-navy/5 p-1.5 ${
                          isToday ? 'bg-vtk-yellow/10' : ''
                        }`}
                      >
                        {dayBookings.map((booking) => (
                          <Block key={booking.id} booking={booking} day={day} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* Smal scherm: dezelfde week als daglijst. */}
          <div className="grid gap-4 lg:hidden">
            {days.map((day) => {
              const dayBookings = vehicles.flatMap((vehicle) =>
                bookingsFor(vehicle.id, day).map((booking) => ({ booking, vehicle }))
              );
              if (dayBookings.length === 0) return null;
              return (
                <section key={day.toISOString()}>
                  <h3 className="text-sm font-semibold text-vtk-ink">
                    <span className="capitalize">{weekdayFormatter.format(day)}</span>{' '}
                    {dayNumberFormatter.format(day)}
                  </h3>
                  <ul className="mt-2 grid gap-2">
                    {dayBookings.map(({ booking, vehicle }) => (
                      <li
                        key={booking.id}
                        className="rounded-[12px] border border-vtk-navy/10 bg-vtk-surface px-3 py-2 text-sm"
                      >
                        <p className="flex flex-wrap items-center gap-2 font-medium text-vtk-ink">
                          <span className="rounded-full bg-vtk-paper-2 px-2 py-0.5 text-[11px] font-semibold text-vtk-navy">
                            {vehicle.nameNl}
                          </span>
                          {dayLabel(booking, day, new Date(day.getTime() + DAY_MS))}
                          {conflicts.has(booking.id) ? (
                            <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                              Conflict
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 truncate text-vtk-muted">{blockTitle(booking)}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            {bookings.length === 0 ? (
              <p className="text-sm text-vtk-muted">Geen ritten deze week.</p>
            ) : null}
          </div>

          <p className="text-xs text-vtk-muted">
            Vol vlak = goedgekeurd, streepjeslijn = nog te beslissen, rood = twee goedgekeurde
            ritten met hetzelfde voertuig op hetzelfde moment.
          </p>
        </>
      )}
    </div>
  );
}
