import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { getLocale } from '@/lib/i18n';
import {
  formatDateRange,
  isoWeekNumber,
  parseDateOnly,
  startOfWeek,
  toDateInputValue,
  todayDateOnly,
} from '@/lib/uitleen';
import { activeVehicles, transportWeekPublic } from '@/lib/uitleen-server';

/**
 * Publieke bezetting van de voertuigen, zonder login.
 *
 * Enkel voertuig, dag en tijdvenster: geen namen, geen doel, geen adressen, geen
 * chauffeurs. De query (`transportWeekPublic`) haalt die velden niet eens op, en
 * de pagina staat op noindex; ze is bedoeld om door te sturen ("kan ik zaterdag
 * de kar hebben?"), niet om gevonden te worden.
 */
export const metadata: Metadata = {
  title: 'Wanneer is de kar vrij?',
  robots: { index: false, follow: false },
};

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

/** Welk stuk van de rit op deze dag valt; een rit kan meerdere dagen duren. */
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

export default async function VervoerBezettingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const [{ week }, locale] = await Promise.all([searchParams, getLocale()]);
  const en = locale === 'en';

  const monday = startOfWeek((week && parseDateOnly(week)) || new Date());
  const nextMonday = new Date(monday.getTime() + 7 * DAY_MS);
  const days = Array.from({ length: 7 }, (_, index) => new Date(monday.getTime() + index * DAY_MS));

  const [bookings, vehicles] = await Promise.all([
    transportWeekPublic(monday, nextMonday),
    activeVehicles(),
  ]);

  const today = todayDateOnly();
  const thisWeek = startOfWeek(new Date());
  const previousHref = `/vervoer/bezetting?week=${toDateInputValue(new Date(monday.getTime() - 7 * DAY_MS))}`;
  const nextHref = `/vervoer/bezetting?week=${toDateInputValue(nextMonday)}`;

  function bookingsFor(vehicleId: string, day: Date) {
    const dayEnd = new Date(day.getTime() + DAY_MS);
    return bookings.filter(
      (booking) => booking.vehicleId === vehicleId && booking.startAt < dayEnd && booking.endAt > day
    );
  }

  function Block({
    booking,
    day,
  }: {
    booking: (typeof bookings)[number];
    day: Date;
  }) {
    const requested = booking.status === 'REQUESTED';
    return (
      <span
        className={`block rounded-[10px] px-2 py-1.5 text-[11px] font-semibold leading-tight tabular-nums ${
          requested
            ? 'border border-dashed border-vtk-navy/30 bg-vtk-paper text-vtk-body'
            : 'bg-vtk-navy text-white'
        }`}
      >
        {dayLabel(booking, day, new Date(day.getTime() + DAY_MS))}
        <span className="block font-normal">
          {requested ? (en ? 'requested' : 'aangevraagd') : en ? 'booked' : 'bezet'}
        </span>
      </span>
    );
  }

  return (
    <PageShell
      title={en ? 'When is a vehicle free?' : 'Wanneer is een voertuig vrij?'}
      intro={
        en
          ? 'Vehicle, day and time only. Log in to request a trip; who is driving and what for is not shown here.'
          : 'Enkel voertuig, dag en uur. Log in om een rit aan te vragen; wie rijdt en waarvoor staat hier niet bij.'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
            {en ? 'Week' : 'Week'} {isoWeekNumber(monday)}
          </h2>
          <p className="text-sm text-vtk-muted">
            {formatDateRange(monday, new Date(nextMonday.getTime() - DAY_MS), locale)}
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label={en ? 'Pick a week' : 'Week kiezen'}>
          <Link
            href={previousHref}
            className="rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40"
          >
            ← {en ? 'Previous' : 'Vorige'}
          </Link>
          <Link
            href="/vervoer/bezetting"
            aria-current={monday.getTime() === thisWeek.getTime() ? 'true' : undefined}
            className={
              monday.getTime() === thisWeek.getTime()
                ? 'rounded-full border border-vtk-navy bg-vtk-navy px-3 py-1.5 font-semibold text-white'
                : 'rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40'
            }
          >
            {en ? 'This week' : 'Deze week'}
          </Link>
          <Link
            href={nextHref}
            className="rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40"
          >
            {en ? 'Next' : 'Volgende'} →
          </Link>
          <Link
            href="/vervoer"
            className="ml-2 font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
            {en ? 'Request a trip' : 'Rit aanvragen'}
          </Link>
        </nav>
      </div>

      {vehicles.length === 0 ? (
        <p className="mt-5 text-sm text-vtk-muted">
          {en ? 'No vehicles yet.' : 'Er staan nog geen voertuigen klaar.'}
        </p>
      ) : (
        <>
          {/* Raster op breed scherm, daglijst eronder: zeven kolommen in een
              horizontale scroller verbergen meer dan ze tonen. */}
          <div className="mt-5 hidden overflow-hidden rounded-[16px] border border-vtk-navy/10 bg-vtk-surface lg:block">
            <div className="grid grid-cols-[9rem_repeat(7,minmax(0,1fr))]">
              <div className="border-b border-vtk-navy/10 px-3 py-2 text-xs font-semibold text-vtk-muted">
                {en ? 'Vehicle' : 'Voertuig'}
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
                    {en ? vehicle.nameEn : vehicle.nameNl}
                  </div>
                  {days.map((day) => {
                    const isToday = day.getTime() === today.getTime();
                    return (
                      <div
                        key={day.toISOString()}
                        className={`grid content-start gap-1 border-b border-l border-vtk-navy/5 p-1.5 ${
                          isToday ? 'bg-vtk-yellow/10' : ''
                        }`}
                      >
                        {bookingsFor(vehicle.id, day).map((booking) => (
                          <Block key={booking.id} booking={booking} day={day} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 grid gap-4 lg:hidden">
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
                        className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-vtk-navy/10 bg-vtk-surface px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-vtk-ink">
                          {en ? vehicle.nameEn : vehicle.nameNl}
                        </span>
                        <span className="tabular-nums text-vtk-muted">
                          {dayLabel(booking, day, new Date(day.getTime() + DAY_MS))}
                          {booking.status === 'REQUESTED'
                            ? en
                              ? ' · requested'
                              : ' · aangevraagd'
                            : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>

          <p className="mt-5 text-xs text-vtk-muted">
            {en
              ? 'Dashed means requested but not yet decided; the vehicle may still become free.'
              : 'Gestreept is aangevraagd maar nog niet beslist; dat moment kan dus nog vrijkomen.'}
          </p>
        </>
      )}
    </PageShell>
  );
}
