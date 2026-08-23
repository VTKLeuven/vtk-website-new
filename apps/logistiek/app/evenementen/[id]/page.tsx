import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { ReservationStatusBadge, VanStatusBadge } from '@/components/status-badge';
import { getSession } from '@/lib/session';
import {
  formatDateWithPart,
  formatEventMoment,
  toBrusselsDateValue,
  toBrusselsTimeValue,
  tripHoursLabel,
} from '@/lib/uitleen';
import { memberEvent } from '@/lib/uitleen-server';
import { getLocale } from '@/lib/i18n';
import { EventExtraItems } from './extra-items';
import { MemberEventForm } from './event-form';

/**
 * Eén evenement, voor de aanvrager (E1).
 *
 * Alles wat eronder hangt op één scherm, plus de gegevens die de aanvrager zelf
 * het best weet. Wat er per aanvraag gebeurt (goedkeuren, afhalen, betalen)
 * blijft op de detailpagina van die aanvraag; dit scherm is de koepel, geen
 * tweede beheerscherm.
 */
export default async function EvenementDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) return <LoginGate variant="reservations" />;
  const en = locale === 'en';

  const { id } = await params;
  const event = await memberEvent(
    id,
    session.user.id,
    session.groups.map((group) => group.id)
  );
  if (!event) notFound();

  const material = event.reservations.filter((r) => r.lines.length > 0);
  const drinks = event.reservations.filter((r) => r.flesserkeLines.length > 0);
  const moment = formatEventMoment(event, locale);

  return (
    <PageShell
      kicker={
        <Link href="/evenementen" className="hover:underline">
          ← {en ? 'My events' : 'Mijn evenementen'}
        </Link>
      }
      title={event.name}
      intro={
        [moment, event.location].filter(Boolean).join(' · ') ||
        (en ? 'Fill in when and where below.' : 'Vul hieronder in wanneer en waar.')
      }
    >
      <div className="grid gap-6">
        <MemberEventForm
          en={en}
          event={{
            id: event.id,
            location: event.location ?? '',
            startDate: event.startAt ? toBrusselsDateValue(event.startAt) : '',
            startTime: event.startAt && event.startTimeKnown ? toBrusselsTimeValue(event.startAt) : '',
            endDate: event.endAt ? toBrusselsDateValue(event.endAt) : '',
            endTime: event.endAt ? toBrusselsTimeValue(event.endAt) : '',
            expectedAttendance:
              event.expectedAttendance === null ? '' : String(event.expectedAttendance),
          }}
        />

        <EventExtraItems
          eventId={event.id}
          en={en}
          items={event.extraItems.map((item) => ({
            id: item.id,
            source: item.source,
            itemName: item.itemName,
            quantity: item.quantity,
            note: item.note,
          }))}
        />

        {/* De nota van het team hoort hier thuis en niet in het formulier: ze
            komt van Logistiek en de aanvrager kan ze niet wijzigen. */}
        {event.note ? (
          <p className="rounded-[14px] border border-vtk-navy/10 bg-vtk-paper px-4 py-3 text-sm text-vtk-body">
            <span className="font-semibold text-vtk-ink">Logistiek:</span> {event.note}
          </p>
        ) : null}

        <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
            {en ? 'What is requested' : 'Wat er aangevraagd is'}
          </h2>

          <h3 className="mt-4 text-sm font-semibold text-vtk-ink">
            {en ? 'Equipment' : 'Materiaal'}
          </h3>
          {material.length === 0 ? (
            <p className="mt-1 text-sm text-vtk-muted">
              {en ? 'Nothing requested. ' : 'Niets aangevraagd. '}
              <Link href="/materiaal" className="font-medium underline underline-offset-4">
                {en ? 'Request equipment' : 'Materiaal aanvragen'}
              </Link>
            </p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {material.map((reservation) => (
                <li key={reservation.id}>
                  <Link
                    href={`/reservaties/${reservation.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-vtk-navy/10 px-3 py-2 text-sm transition hover:border-vtk-navy/30"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-vtk-ink">{reservation.user.name}</span>
                      <span className="block text-vtk-muted">
                        {formatDateWithPart(reservation.pickupDate, reservation.pickupPart, locale)}{' '}
                        {en ? 'to' : 'tot'}{' '}
                        {formatDateWithPart(reservation.returnDate, reservation.returnPart, locale)}
                      </span>
                    </span>
                    <ReservationStatusBadge status={reservation.status} locale={locale} />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-5 text-sm font-semibold text-vtk-ink">Flesserke</h3>
          {drinks.length === 0 ? (
            <p className="mt-1 text-sm text-vtk-muted">
              {en ? 'Nothing requested. ' : 'Niets aangevraagd. '}
              <Link href="/flesserke" className="font-medium underline underline-offset-4">
                {en ? 'Request drinks' : 'Flesserke aanvragen'}
              </Link>
            </p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {drinks.map((reservation) => (
                <li key={reservation.id}>
                  <Link
                    href={`/reservaties/${reservation.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-vtk-navy/10 px-3 py-2 text-sm transition hover:border-vtk-navy/30"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-vtk-ink">{reservation.user.name}</span>
                      <span className="block text-vtk-muted">
                        {formatDateWithPart(reservation.pickupDate, reservation.pickupPart, locale)}
                      </span>
                    </span>
                    <ReservationStatusBadge status={reservation.status} locale={locale} />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <h3 className="mt-5 text-sm font-semibold text-vtk-ink">Transport</h3>
          {event.transport.length === 0 ? (
            <p className="mt-1 text-sm text-vtk-muted">
              {en ? 'Nothing requested. ' : 'Niets aangevraagd. '}
              <Link href="/vervoer" className="font-medium underline underline-offset-4">
                {en ? 'Request a trip' : 'Een rit aanvragen'}
              </Link>
            </p>
          ) : (
            <ul className="mt-2 grid gap-2">
              {event.transport.map((booking) => (
                <li key={booking.id}>
                  <Link
                    href={`/vervoer/${booking.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-vtk-navy/10 px-3 py-2 text-sm transition hover:border-vtk-navy/30"
                  >
                    <span className="min-w-0">
                      <span className="font-medium text-vtk-ink">{booking.vehicle.nameNl}</span>
                      <span className="block text-vtk-muted">
                        {tripHoursLabel(booking.startAt, booking.endAt, locale)} ·{' '}
                        {booking.driver?.name ?? (en ? 'no driver yet' : 'nog geen chauffeur')}
                      </span>
                    </span>
                    <VanStatusBadge status={booking.status} locale={locale} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
