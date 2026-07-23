import Link from 'next/link';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { ReservationStatusBadge, VanStatusBadge } from '@/components/status-badge';
import { getSession } from '@/lib/session';
import { formatDateOnly, formatDateTime, formatEuro, formatPriceCents } from '@/lib/uitleen';
import { myReservations, myVanBookings } from '@/lib/uitleen-server';
import { copy, getLocale } from '@/lib/i18n';

export default async function ReservatiesPage({
  searchParams,
}: {
  searchParams: Promise<{ aangevraagd?: string }>;
}) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  const t = copy[locale];
  if (!session) {
    return <LoginGate variant="reservations" />;
  }

  const en = locale === 'en';
  const { aangevraagd } = await searchParams;
  const [reservations, vanBookings] = await Promise.all([
    myReservations(session.user.id),
    myVanBookings(session.user.id),
  ]);

  return (
    <PageShell
      title={
        <>
          {t.pageReservationsTitle} <em className="font-serif font-normal italic text-vtk-navy">{t.pageReservationsAccent}</em>
        </>
      }
    >
      {aangevraagd ? (
        <p className="mb-6 rounded-[14px] border border-vtk-yellow-dark/40 bg-vtk-yellow/20 px-4 py-3 text-sm font-medium text-vtk-ink">
          {en
            ? 'Your request has been submitted. The Logistics team reviews it; you can follow the status below.'
            : 'Je aanvraag is ingediend. Het team van Logistiek bekijkt ze; je vindt de status hieronder.'}
        </p>
      ) : null}

      <div className="grid gap-8">
        <section>
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{en ? 'Equipment' : 'Materiaal'}</h2>
          {reservations.length === 0 ? (
            <p className="mt-3 text-sm text-vtk-muted">
              {en ? 'No requests yet. ' : 'Nog geen aanvragen. '}
              <Link href="/materiaal" className="font-medium text-vtk-navy underline underline-offset-4">
                {en ? 'Browse the catalogue' : 'Bekijk de catalogus'}
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {reservations.map((reservation) => (
                <li key={reservation.id}>
                  <Link
                    href={`/reservaties/${reservation.id}`}
                    className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[16px] border border-vtk-navy/10 bg-vtk-surface px-5 py-4 transition hover:border-vtk-navy/25"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-vtk-ink">{reservation.eventName}</p>
                      <p className="mt-0.5 truncate text-sm text-vtk-muted">
                        {reservation.lines.map((line) => `${line.quantity}× ${line.itemName}`).join(', ')}
                      </p>
                      <p className="mt-0.5 text-sm text-vtk-muted">
                        {formatDateOnly(reservation.pickupDate, locale)} {en ? 'to' : 'tot'}{' '}
                        {formatDateOnly(reservation.returnDate, locale)}
                        {reservation.totalDepositCents > 0
                          ? ` · ${formatEuro(reservation.totalDepositCents)} ${en ? 'deposit' : 'waarborg'}`
                          : ''}
                      </p>
                    </div>
                    <ReservationStatusBadge status={reservation.status} locale={locale} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{en ? 'Transport' : 'Vervoer'}</h2>
          {vanBookings.length === 0 ? (
            <p className="mt-3 text-sm text-vtk-muted">
              {en ? 'No trips yet. ' : 'Nog geen ritten. '}
              <Link href="/vervoer" className="font-medium text-vtk-navy underline underline-offset-4">
                {en ? 'Request a trip' : 'Vraag een rit aan'}
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {vanBookings.map((booking) => (
                <li key={booking.id}>
                  <Link
                    href={`/vervoer/${booking.id}`}
                    className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[16px] border border-vtk-navy/10 bg-vtk-surface px-5 py-4 transition hover:border-vtk-navy/25"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-vtk-ink">{booking.purpose}</p>
                      <p className="mt-0.5 text-sm text-vtk-muted">
                        {formatDateTime(booking.startAt, locale)} {en ? 'to' : 'tot'} {formatDateTime(booking.endAt, locale)} ·{' '}
                        {formatPriceCents(booking.priceCents, locale)}
                      </p>
                    </div>
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
