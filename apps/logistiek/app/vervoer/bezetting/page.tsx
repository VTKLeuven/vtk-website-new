import Link from 'next/link';
import type { Metadata } from 'next';
import { PageShell } from '@/components/page-shell';
import { TransportWeekGrid, type WeekBlock } from '@/components/transport-week-grid';
import { getLocale } from '@/lib/i18n';
import { getSession } from '@/lib/session';
import {
  formatDateRange,
  isoWeekNumber,
  parseDateOnly,
  startOfWeek,
  toDateInputValue,
} from '@/lib/uitleen';
import {
  activeVehicles,
  transportWeekForMembers,
  transportWeekPublic,
} from '@/lib/uitleen-server';

/**
 * Wanneer is een voertuig vrij? (T8)
 *
 * Twee gezichten, met dezelfde lay-out als de transportplanning van het team:
 *
 * - **Zonder login** enkel voertuig, dag en tijdvenster. Geen namen, geen doel,
 *   geen adressen, geen chauffeurs; de query haalt die velden niet eens op en de
 *   pagina staat op noindex. Zo kan iemand zien of de kar vrij is zonder dat de
 *   werking van de kring op straat ligt.
 * - **Ingelogd** ook het evenement en de chauffeur, want dat is precies wat de
 *   feedback vroeg ("zodat je ziet wie welk ritje doet"). Wel zonder adressen,
 *   telefoonnummers en beslisknoppen: dat blijft van het team.
 */
export const metadata: Metadata = {
  title: 'Wanneer is de kar vrij?',
  robots: { index: false, follow: false },
};

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function VervoerBezettingPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const [{ week }, locale, session] = await Promise.all([searchParams, getLocale(), getSession()]);
  const en = locale === 'en';

  const monday = startOfWeek((week && parseDateOnly(week)) || new Date());
  const nextMonday = new Date(monday.getTime() + 7 * DAY_MS);
  const days = Array.from({ length: 7 }, (_, index) =>
    new Date(monday.getTime() + index * DAY_MS).toISOString()
  );

  // Twee aparte projecties in plaats van één met een vlag: zo kan er geen veld
  // uit de ledenversie in de publieke versie belanden.
  const [memberBookings, publicBookings, vehicles] = await Promise.all([
    session ? transportWeekForMembers(monday, nextMonday) : Promise.resolve(null),
    session ? Promise.resolve(null) : transportWeekPublic(monday, nextMonday),
    activeVehicles(),
  ]);

  const thisWeek = startOfWeek(new Date());
  const previousHref = `/vervoer/bezetting?week=${toDateInputValue(new Date(monday.getTime() - 7 * DAY_MS))}`;
  const nextHref = `/vervoer/bezetting?week=${toDateInputValue(nextMonday)}`;

  const blocks: WeekBlock[] =
    memberBookings?.map((booking) => ({
      id: booking.id,
      vehicleId: booking.vehicleId,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      status: booking.status,
      title: booking.eventName?.trim() || booking.purpose,
      subtitle: null,
      driver:
        booking.driver && booking.driverId
          ? { id: booking.driverId, name: booking.driver.name }
          : null,
      conflict: false,
    })) ??
    (publicBookings ?? []).map((booking) => ({
      id: booking.id,
      vehicleId: booking.vehicleId,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      status: booking.status,
      title:
        booking.status === 'REQUESTED' ? (en ? 'requested' : 'aangevraagd') : en ? 'booked' : 'bezet',
      subtitle: null,
      driver: null,
      conflict: false,
    }));

  return (
    <PageShell
      title={en ? 'When is a vehicle free?' : 'Wanneer is een voertuig vrij?'}
      intro={
        session
          ? en
            ? 'The same planning Logistics works from, without the decision buttons.'
            : 'Dezelfde planning als waar Logistiek mee werkt, zonder de beslisknoppen.'
          : en
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
        <nav
          className="flex flex-wrap items-center gap-2 text-sm"
          aria-label={en ? 'Pick a week' : 'Week kiezen'}
        >
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
        <div className="mt-5 grid gap-5">
          <TransportWeekGrid
            days={days}
            vehicles={vehicles.map((vehicle) => ({
              id: vehicle.id,
              name: en ? vehicle.nameEn : vehicle.nameNl,
              code: vehicle.code,
            }))}
            blocks={blocks}
            emptyLabel={en ? 'Nothing booked this week.' : 'Niets geboekt deze week.'}
            showDriver={Boolean(session)}
          />

          <p className="text-xs text-vtk-muted">
            {session
              ? en
                ? 'Every driver has their own colour; a trip without a driver is yellow, and the vehicle is in the block with its icon. Striped means requested but not decided yet, so that slot may still become free.'
                : 'Elke chauffeur heeft zijn eigen kleur; een rit zonder chauffeur is geel, en het voertuig staat met zijn icoon in het blok. Gestreept is aangevraagd maar nog niet beslist, dus dat moment kan nog vrijkomen.'
              : en
                ? 'Striped means requested but not yet decided; the vehicle may still become free.'
                : 'Gestreept is aangevraagd maar nog niet beslist; dat moment kan dus nog vrijkomen.'}
          </p>
        </div>
      )}
    </PageShell>
  );
}
