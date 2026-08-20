import Link from 'next/link';
import type { ReactNode } from 'react';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { ReservationStatusBadge, VanStatusBadge } from '@/components/status-badge';
import { getSession } from '@/lib/session';
import {
  formatDateOnly,
  formatDateTime,
  formatDateWithPart,
  formatEuro,
  formatPriceCents,
} from '@/lib/uitleen';
import { myReservations, myVanBookings } from '@/lib/uitleen-server';
import { copy, getLocale } from '@/lib/i18n';

/**
 * Drie items en de rest geteld. Een volledige opsomming van een grote aanvraag
 * duwde de rij uit haar vorm; de detailpagina toont wel alles.
 */
function itemSummary(lines: Array<{ quantity: number; itemName: string }>, en: boolean): string {
  const shown = lines.slice(0, 3).map((line) => `${line.quantity}× ${line.itemName}`);
  const rest = lines.length - shown.length;
  if (rest === 0) return shown.join(', ');
  return `${shown.join(', ')} ${en ? `and ${rest} more` : `en ${rest} andere`}`;
}

function ReservationOverviewRow({
  href,
  subject,
  contents,
  period,
  requester,
  status,
  labels,
}: {
  href: string;
  subject: ReactNode;
  contents: ReactNode;
  period: ReactNode;
  requester: ReactNode;
  status: ReactNode;
  labels: { subject: string; contents: string; period: string; requester: string; status: string };
}) {
  return (
    <Link href={href} className="logistics-reservation-row">
      <div className="logistics-reservation-cell logistics-reservation-subject">
        <span>{labels.subject}</span>
        <strong>{subject}</strong>
      </div>
      <div className="logistics-reservation-cell">
        <span>{labels.contents}</span>
        <p>{contents}</p>
      </div>
      <div className="logistics-reservation-cell">
        <span>{labels.period}</span>
        <p>{period}</p>
      </div>
      <div className="logistics-reservation-cell">
        <span>{labels.requester}</span>
        <p>{requester}</p>
      </div>
      <div className="logistics-reservation-status">
        <span>{labels.status}</span>
        {status}
      </div>
    </Link>
  );
}

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
  // Enkel echte posten delen: een werkgroepaanvraag bewaart geen groupId en
  // blijft dus persoonlijk (zie deriveMemberRequester).
  const postIds = session.groups.filter((group) => group.type === 'PRAESIDIUM').map((g) => g.id);
  const [reservations, vanBookings] = await Promise.all([
    myReservations(session.user.id, postIds),
    myVanBookings(session.user.id, postIds),
  ]);

  // Materiaal en flesserke stonden onder één kopje "Materiaal", terwijl een
  // flesserke-aanvraag geen enkel materiaalitem bevat. Een aanvraag met allebei
  // hoort bij materiaal (daar staat het zwaarste werk) en zegt in haar
  // samenvatting dat er ook drank bij zit.
  const materialRequests = reservations.filter((reservation) => reservation.lines.length > 0);
  const drinkRequests = reservations.filter(
    (reservation) => reservation.lines.length === 0 && reservation.flesserkeLines.length > 0
  );

  /** "Door jou aangevraagd" of de naam van de collega, klein onder de rij. */
  const requestedBy = (user: { id: string; name: string }) =>
    user.id === session.user.id
      ? en
        ? 'Requested by you'
        : 'Door jou aangevraagd'
      : `${en ? 'Requested by' : 'Aangevraagd door'} ${user.name}`;

  const postNote = en
    ? 'Also shows what the rest of your post requested, so the same thing is not booked twice.'
    : 'Toont ook wat de rest van je post aanvroeg, zodat hetzelfde niet twee keer geboekt wordt.';

  const rowLabels = {
    subject: en ? 'Event' : 'Evenement',
    contents: en ? 'Contents' : 'Inhoud',
    period: en ? 'Period' : 'Periode',
    requester: en ? 'Requested by' : 'Aangevraagd door',
    status: 'Status',
  };

  return (
    <PageShell
      title={
        <>
          {t.pageReservationsTitle} {t.pageReservationsAccent}
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
          {postIds.length > 0 ? <p className="mt-1 text-sm text-vtk-muted">{postNote}</p> : null}
          {materialRequests.length === 0 ? (
            <p className="mt-3 text-sm text-vtk-muted">
              {en ? 'No requests yet. ' : 'Nog geen aanvragen. '}
              <Link href="/materiaal" className="font-medium text-vtk-navy underline underline-offset-4">
                {en ? 'Browse the catalogue' : 'Bekijk de catalogus'}
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {materialRequests.map((reservation) => (
                <li key={reservation.id}>
                  <ReservationOverviewRow
                    href={`/reservaties/${reservation.id}`}
                    subject={reservation.eventName}
                    contents={
                      <>
                        {itemSummary(reservation.lines, en)}
                        {reservation.flesserkeLines.length > 0
                          ? `, ${en ? 'including drinks' : 'inclusief flesserke'}`
                          : ''}
                      </>
                    }
                    period={
                      <>
                        {formatDateWithPart(reservation.pickupDate, reservation.pickupPart, locale)}{' '}
                        {en ? 'to' : 'tot'}{' '}
                        {formatDateWithPart(reservation.returnDate, reservation.returnPart, locale)}
                        {reservation.totalDepositCents > 0
                          ? `, ${formatEuro(reservation.totalDepositCents)} ${en ? 'deposit' : 'waarborg'}`
                          : ''}
                      </>
                    }
                    requester={requestedBy(reservation.user)}
                    status={<ReservationStatusBadge status={reservation.status} locale={locale} />}
                    labels={rowLabels}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
            {en ? 'Drinks' : 'Flesserke'}
          </h2>
          {postIds.length > 0 ? <p className="mt-1 text-sm text-vtk-muted">{postNote}</p> : null}
          {drinkRequests.length === 0 ? (
            <p className="mt-3 text-sm text-vtk-muted">
              {en ? 'No requests yet. ' : 'Nog geen aanvragen. '}
              <Link href="/flesserke" className="font-medium text-vtk-navy underline underline-offset-4">
                {en ? 'Browse the drinks' : 'Bekijk het aanbod'}
              </Link>
              .
            </p>
          ) : (
            <ul className="mt-4 grid gap-3">
              {drinkRequests.map((reservation) => (
                <li key={reservation.id}>
                  <ReservationOverviewRow
                    href={`/reservaties/${reservation.id}`}
                    subject={reservation.eventName}
                    contents={itemSummary(reservation.flesserkeLines, en)}
                    period={formatDateWithPart(reservation.pickupDate, reservation.pickupPart, locale)}
                    requester={requestedBy(reservation.user)}
                    status={<ReservationStatusBadge status={reservation.status} locale={locale} />}
                    labels={rowLabels}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{en ? 'Transport' : 'Vervoer'}</h2>
          {postIds.length > 0 ? <p className="mt-1 text-sm text-vtk-muted">{postNote}</p> : null}
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
                  <ReservationOverviewRow
                    href={`/vervoer/${booking.id}`}
                    subject={
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-vtk-paper-2 px-2.5 py-0.5 text-xs font-semibold text-vtk-navy">
                          {en ? booking.vehicle.nameEn : booking.vehicle.nameNl}
                        </span>
                        {booking.purpose}
                      </span>
                    }
                    contents={booking.destination || (en ? 'Transport request' : 'Vervoersaanvraag')}
                    period={
                      <>
                        {formatDateTime(booking.startAt, locale)} {en ? 'to' : 'tot'}{' '}
                        {formatDateTime(booking.endAt, locale)}, {' '}
                        {formatPriceCents(booking.priceCents, locale)}
                      </>
                    }
                    requester={requestedBy(booking.user)}
                    status={<VanStatusBadge status={booking.status} locale={locale} />}
                    labels={{ ...rowLabels, contents: en ? 'Destination' : 'Bestemming' }}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </PageShell>
  );
}
