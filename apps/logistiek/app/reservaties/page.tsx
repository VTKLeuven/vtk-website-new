import Link from 'next/link';
import type { ReactNode } from 'react';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { ReservationStatusBadge, VanStatusBadge } from '@/components/status-badge';
import { getSession } from '@/lib/session';
import {
  chargesRequester,
  formatDateOnly,
  formatDateTime,
  formatDateWithPart,
  formatEuro,
  formatPriceCents,
  todayDateOnly,
} from '@/lib/uitleen';
import { myReservations, myVanBookings } from '@/lib/uitleen-server';
import { copy, getLocale } from '@/lib/i18n';
import type { LogistiekLocale } from '@/lib/i18n-shared';

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

/**
 * "Afgelopen" voor een materiaal- of flesserke-aanvraag (R2).
 *
 * Niet de datum beslist dit maar de status, met de datum als vangnet:
 *
 * - **Afgehaald materiaal is nooit afgelopen.** Het ligt nog bij het lid en moet
 *   terug; dat de terugbrengdag intussen gepasseerd is, maakt het net
 *   dringender. Precies die aanvraag in een dichtgeklapte lade stoppen zou het
 *   enige scherm waar een lid ziet wat het nog moet terugbrengen, leegmaken.
 * - **Beslist en afgehandeld is wel afgelopen**: afgewezen, geannuleerd of
 *   teruggebracht, ook wanneer de datum nog in de toekomst ligt (wie vroeger
 *   terugbrengt, is klaar).
 * - **De datum is enkel het vangnet** voor wat nooit een eindpunt kreeg: een
 *   aanvraag die nog wacht op een beslissing of goedgekeurd werd maar nooit
 *   afgehaald, voor een activiteit die intussen voorbij is.
 */
function isPastReservation(
  reservation: { status: string; returnDate: Date },
  today: Date
): boolean {
  if (reservation.status === 'PICKED_UP') return false;
  if (
    reservation.status === 'REJECTED' ||
    reservation.status === 'CANCELLED' ||
    reservation.status === 'RETURNED'
  ) {
    return true;
  }
  return reservation.returnDate < today;
}

/**
 * Zoals `isPastReservation`, maar voor een rit: `endAt` in plaats van
 * `returnDate`. Een rit heeft geen "ligt nog bij het lid"-toestand, dus hier is
 * afgerond wel meteen afgelopen.
 */
function isPastBooking(booking: { status: string; endAt: Date }, today: Date): boolean {
  return (
    booking.status === 'REJECTED' ||
    booking.status === 'CANCELLED' ||
    booking.status === 'COMPLETED' ||
    booking.endAt < today
  );
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

/**
 * R8: het lid vraagt bij materiaal enkel "levering" aan; de rit zelf maakt
 * Logistiek achteraf aan via "Rit aanmaken" (zie design-decisions.md § "Levering
 * nodig" wordt een echte rit). Zonder signaal ziet de aanvrager na het vinkje
 * niets meer tot de rit er ooit is. Dit spiegelt bewust de woordkeuze van de
 * logi-badge in beheer/aanvragen ("Levering" / "Levering gepland"), maar zonder
 * waarschuwingsicoon en zonder link naar /vervoer: het lid hoeft hier niets te
 * doen, dat is precies het punt.
 */
function DeliveryNote({
  reservation,
  en,
  locale,
}: {
  reservation: { delivery: boolean; transports: Array<{ id: string; startAt: Date }> };
  en: boolean;
  locale: LogistiekLocale;
}) {
  if (!reservation.delivery) return null;
  const trip = reservation.transports[0];
  return (
    <p className="mt-1.5 px-1 text-xs text-vtk-muted">
      {trip ? (
        <>
          {en ? 'Delivery planned: ' : 'Levering gepland: '}
          {formatDateTime(trip.startAt, locale)}
          {' · '}
          <Link
            href={`/vervoer/${trip.id}`}
            className="font-medium text-vtk-navy underline underline-offset-4"
          >
            {en ? 'View trip' : 'Bekijk de rit'}
          </Link>
        </>
      ) : en ? (
        'Delivery requested; Logistics is planning the trip.'
      ) : (
        'Levering gevraagd; Logistiek plant de rit in.'
      )}
    </p>
  );
}

/** Ingeklapte "Afgelopen"-groep met een teller in de samenvatting (R2). */
function PastGroup({ count, en, children }: { count: number; en: boolean; children: ReactNode }) {
  if (count === 0) return null;
  return (
    // Zelfde vorm als de "Afgelopen"-lade in /beheer/aanvragen: een chevron die
    // meedraait, zodat het lid en het team hetzelfde ding herkennen.
    <details className="group mt-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-vtk-muted [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="inline-block transition-transform group-open:rotate-90"
        >
          ▸
        </span>
        {en ? `Past (${count})` : `Afgelopen (${count})`}
      </summary>
      <ul className="mt-3 grid gap-3">{children}</ul>
    </details>
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

  // R2: lopend versus afgelopen, per sectie. "Vandaag" telt nog als lopend.
  // `todayDateOnly` geeft de Belgische wall-clock datum als UTC-middernacht,
  // dezelfde vorm als `pickupDate`/`returnDate` in de databank; dat maakt de
  // vergelijking onafhankelijk van de timezone van de server. Voor `endAt` (een
  // echte timestamp, geen date-only) blijft vergelijken met diezelfde middernacht
  // correct: een rit die vanochtend eindigde telt nog als lopend.
  const today = todayDateOnly();
  const materialCurrent = materialRequests.filter((r) => !isPastReservation(r, today));
  const materialPast = materialRequests.filter((r) => isPastReservation(r, today));
  const drinkCurrent = drinkRequests.filter((r) => !isPastReservation(r, today));
  const drinkPast = drinkRequests.filter((r) => isPastReservation(r, today));
  const vanCurrent = vanBookings.filter((b) => !isPastBooking(b, today));
  const vanPast = vanBookings.filter((b) => isPastBooking(b, today));

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

  const renderMaterialRow = (reservation: (typeof materialRequests)[number]) => (
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
            {chargesRequester(reservation.requesterType) && reservation.totalDepositCents > 0
              ? `, ${formatEuro(reservation.totalDepositCents)} ${en ? 'deposit' : 'waarborg'}`
              : ''}
          </>
        }
        requester={requestedBy(reservation.user)}
        status={<ReservationStatusBadge status={reservation.status} locale={locale} />}
        labels={rowLabels}
      />
      <DeliveryNote reservation={reservation} en={en} locale={locale} />
    </li>
  );

  const renderDrinkRow = (reservation: (typeof drinkRequests)[number]) => (
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
      <DeliveryNote reservation={reservation} en={en} locale={locale} />
    </li>
  );

  const renderVanRow = (booking: (typeof vanBookings)[number]) => {
    const vehicleTag = (
      <span className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-vtk-paper-2 px-2.5 py-0.5 text-xs font-semibold text-vtk-navy">
          {en ? booking.vehicle.nameEn : booking.vehicle.nameNl}
        </span>
        {booking.purpose}
      </span>
    );
    return (
      <li key={booking.id}>
        <ReservationOverviewRow
          href={`/vervoer/${booking.id}`}
          // R1: net als bij materiaal (waar de koptekst het evenement is) toont de
          // koptekst hier het gekoppelde evenement; het voertuig en het doel staan
          // eronder als tag. Een rit zonder gekoppeld evenement blijft gewoon
          // staan met enkel die tag, zoals voorheen.
          subject={
            booking.event ? (
              <span className="flex flex-col gap-1">
                <span className="block">{booking.event.name}</span>
                <span className="font-normal">{vehicleTag}</span>
              </span>
            ) : (
              vehicleTag
            )
          }
          contents={booking.destination || (en ? 'Transport request' : 'Transportaanvraag')}
          period={
            <>
              {formatDateTime(booking.startAt, locale)} {en ? 'to' : 'tot'}{' '}
              {formatDateTime(booking.endAt, locale)}
              {chargesRequester(booking.requesterType)
                ? `, ${formatPriceCents(booking.priceCents, locale)}`
                : ''}
            </>
          }
          requester={requestedBy(booking.user)}
          status={<VanStatusBadge status={booking.status} locale={locale} />}
          labels={{ ...rowLabels, contents: en ? 'Destination' : 'Bestemming' }}
        />
      </li>
    );
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
            <>
              {materialCurrent.length > 0 ? (
                <ul className="mt-4 grid gap-3">{materialCurrent.map(renderMaterialRow)}</ul>
              ) : (
                <p className="mt-3 text-sm text-vtk-muted">
                  {en ? 'No current requests.' : 'Geen lopende aanvragen.'}
                </p>
              )}
              <PastGroup count={materialPast.length} en={en}>
                {materialPast.map(renderMaterialRow)}
              </PastGroup>
            </>
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
            <>
              {drinkCurrent.length > 0 ? (
                <ul className="mt-4 grid gap-3">{drinkCurrent.map(renderDrinkRow)}</ul>
              ) : (
                <p className="mt-3 text-sm text-vtk-muted">
                  {en ? 'No current requests.' : 'Geen lopende aanvragen.'}
                </p>
              )}
              <PastGroup count={drinkPast.length} en={en}>
                {drinkPast.map(renderDrinkRow)}
              </PastGroup>
            </>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{'Transport'}</h2>
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
            <>
              {vanCurrent.length > 0 ? (
                <ul className="mt-4 grid gap-3">{vanCurrent.map(renderVanRow)}</ul>
              ) : (
                <p className="mt-3 text-sm text-vtk-muted">
                  {en ? 'No current trips.' : 'Geen lopende ritten.'}
                </p>
              )}
              <PastGroup count={vanPast.length} en={en}>
                {vanPast.map(renderVanRow)}
              </PastGroup>
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}
