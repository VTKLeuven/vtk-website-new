import Link from 'next/link';
import { VanStatusBadge } from '@/components/status-badge';
import { requireManage } from '@/lib/session';
import {
  eventOptions,
  formatDateTime,
  formatPriceCents,
  requesterLabel,
  toDatetimeLocalValue,
} from '@/lib/uitleen';
import { AuditTimeline } from '@/components/audit-timeline';
import { PhoneLink } from '@/components/phone-link';
import { EventLink } from '@/components/event-link';
import {
  adminVanBookings,
  adminVehicles,
  driverOptions,
  selectableEvents,
  hasSucceededPayment,
  transportAuditLogsByBooking,
  type AdminTransportBooking,
} from '@/lib/uitleen-server';
import { BookingRow } from './booking-row';
import { TransportControls } from './transport-controls';
import { TransportDecisionForms } from './transport-decision-forms';
import { TransportUndoButtons } from './transport-undo';

const dateFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Uren van de rit; bij een rit over meerdere dagen ook de einddag. */
function hoursLabel(booking: AdminTransportBooking): string {
  const sameDay = dayKeyFormatter.format(booking.startAt) === dayKeyFormatter.format(booking.endAt);
  const hours = `${timeFormatter.format(booking.startAt)}-${timeFormatter.format(booking.endAt)}`;
  return sameDay ? hours : `${hours} (${dateFormatter.format(booking.endAt)})`;
}

export default async function BeheerVervoerPage() {
  await requireManage();

  const [bookings, drivers, vehicles, events] = await Promise.all([
    adminVanBookings(),
    driverOptions(),
    adminVehicles(),
    selectableEvents(),
  ]);
  const eventChoices = eventOptions(events);
  const activeVehicleOptions = vehicles
    .filter((v) => v.active)
    .map((v) => ({ id: v.id, name: v.nameNl, needsVanDriver: v.needsVanDriver }));

  const open = bookings.filter((booking) => booking.status === 'REQUESTED');
  // Heen en terug zijn twee boekingen maar één aanvraag: het team beslist er in
  // één keer over, dus staan ze onder één kaart met één beslisformulier.
  const openGroups: AdminTransportBooking[][] = [];
  const seenGroups = new Set<string>();
  for (const booking of open) {
    if (!booking.tripGroupId) {
      openGroups.push([booking]);
      continue;
    }
    if (seenGroups.has(booking.tripGroupId)) continue;
    seenGroups.add(booking.tripGroupId);
    openGroups.push(
      open
        .filter((other) => other.tripGroupId === booking.tripGroupId)
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
    );
  }

  /**
   * Wat er die dag al vaststaat met datzelfde voertuig, zodat je bij het
   * verschuiven meteen ziet waar plaats is. Enkel goedgekeurde ritten: een
   * andere aanvraag is nog geen bezetting.
   */
  function sameDayLines(booking: AdminTransportBooking): string[] {
    const day = dayKeyFormatter.format(booking.startAt);
    return bookings
      .filter(
        (other) =>
          other.status === 'APPROVED' &&
          other.vehicleId === booking.vehicleId &&
          dayKeyFormatter.format(other.startAt) === day
      )
      .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
      .map((other) => `${hoursLabel(other)} · ${other.eventName?.trim() || other.purpose}`);
  }
  const approved = bookings
    .filter((booking) => booking.status === 'APPROVED')
    .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  const rest = bookings.filter((booking) => !['REQUESTED', 'APPROVED'].includes(booking.status));

  // Historiek van alle getoonde ritten in één query; de details staan wel
  // ingeklapt, maar worden hier server-side gerenderd.
  const auditLogs = await transportAuditLogsByBooking(bookings.map((booking) => booking.id));

  function paidOf(booking: AdminTransportBooking): boolean {
    return hasSucceededPayment(booking.payments) || booking.paidOfflineAt !== null;
  }

  /** Kaart met alles erop; enkel voor wat nog beslist moet worden. */
  function BookingCard({
    booking,
    children,
  }: {
    booking: AdminTransportBooking;
    children?: React.ReactNode;
  }) {
    const paid = paidOf(booking);
    return (
      <li className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium text-vtk-ink">
              <span className="rounded-full bg-vtk-paper-2 px-2.5 py-0.5 text-xs font-semibold text-vtk-navy">
                {booking.vehicle.nameNl}
              </span>
              <span className="rounded-full bg-vtk-paper-2 px-2.5 py-0.5 text-xs font-semibold text-vtk-navy">
                {requesterLabel(booking)}
              </span>
              {booking.user.name}
              {booking.tripLeg ? (
                <span className="rounded-full bg-vtk-yellow/25 px-2 py-0.5 text-[11px] font-semibold text-vtk-ink">
                  {booking.tripLeg === 'HEEN' ? 'Heenrit' : 'Terugrit'}
                </span>
              ) : null}
              {booking.reservation ? (
                <span className="rounded-full bg-vtk-paper-2 px-2 py-0.5 text-[11px] font-semibold text-vtk-navy">
                  Levering
                </span>
              ) : null}
              <span className="text-sm font-normal text-vtk-muted">{booking.purpose}</span>
            </p>
            <p className="mt-0.5 text-sm text-vtk-muted">
              {formatDateTime(booking.startAt)} tot {formatDateTime(booking.endAt)} ·{' '}
              {formatPriceCents(booking.priceCents)}
              {booking.driver ? ` · chauffeur: ${booking.driver.name}` : ' · nog geen chauffeur'}
              {booking.paymentMode ? (paid ? ' · betaald' : ' · nog niet betaald') : ''}
            </p>
            {booking.pickupAddress || booking.destination ? (
              <p className="mt-0.5 text-sm text-vtk-muted">
                {[booking.pickupAddress, booking.destination].filter(Boolean).join(' → ')}
              </p>
            ) : null}
            {booking.helpersNote ? (
              <p className="mt-0.5 text-sm text-vtk-muted">Bijrijders: {booking.helpersNote}</p>
            ) : null}
            {booking.memberNote ? <p className="mt-1 text-sm text-vtk-body">{booking.memberNote}</p> : null}
          </div>
          <VanStatusBadge status={booking.status} />
        </div>
        {children}
      </li>
    );
  }

  /** Wat niet in de samenvattingsrij past, plus de beheeracties. */
  function BookingDetails({
    booking,
    children,
  }: {
    booking: AdminTransportBooking;
    children?: React.ReactNode;
  }) {
    const lines: Array<[string, React.ReactNode]> = [];
    if (booking.reservation) {
      lines.push([
        'Levering voor',
        <Link
          key="reservation"
          href={`/beheer/aanvragen/${booking.reservation.id}`}
          className="font-medium text-vtk-navy underline underline-offset-2"
        >
          {booking.reservation.eventName}
        </Link>,
      ]);
    }
    if (booking.eventName) lines.push(['Evenement', booking.eventName]);
    if (booking.pickupAddress) lines.push(['Laadadres', booking.pickupAddress]);
    if (booking.destination) lines.push(['Bestemming', booking.destination]);
    if (booking.contactPhone) {
      lines.push(['Aanvrager bellen', <PhoneLink key="contact" number={booking.contactPhone} />]);
    }
    if (booking.helpersNote) lines.push(['Bijrijders', booking.helpersNote]);
    if (booking.helpersPhone) {
      lines.push(['Bijrijder bellen', <PhoneLink key="helpers" number={booking.helpersPhone} />]);
    }
    if (booking.memberNote) lines.push(['Nota van het lid', booking.memberNote]);
    if (booking.adminNote) lines.push(['Nota van Logistiek', booking.adminNote]);
    if (booking.kilometers !== null) lines.push(['Gereden', `${booking.kilometers} km`]);
    lines.push([
      'Evenement',
      <EventLink
        key="event"
        target={{ kind: 'transport', id: booking.id }}
        events={eventChoices}
        current={booking.event}
      />,
    ]);

    return (
      <div className="rounded-[14px] bg-vtk-paper px-4 py-3">
        <p className="text-sm text-vtk-ink">{booking.purpose}</p>
        {lines.length > 0 ? (
          <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
            {lines.map(([term, value]) => (
              <div key={term} className="flex gap-2">
                <dt className="shrink-0 text-vtk-muted">{term}</dt>
                <dd className="min-w-0 text-vtk-body">{value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        {children}
        <TransportUndoButtons
          bookingId={booking.id}
          status={booking.status}
          paidOffline={booking.paidOfflineAt !== null}
          paidOnline={hasSucceededPayment(booking.payments)}
        />
        <div className="mt-3">
          <AuditTimeline entries={auditLogs.get(booking.id) ?? []} />
        </div>
      </div>
    );
  }

  const headerClass = 'py-2 pr-3 font-medium';

  return (
    <div className="grid gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-vtk-muted">
          {drivers.length === 0
            ? 'Er staat nog niemand in de chauffeurslijst, dus je kan nog geen chauffeur toewijzen. '
            : `${drivers.length} chauffeur${drivers.length === 1 ? '' : 's'} beschikbaar. `}
          <Link
            href="/beheer/chauffeurs"
            className="font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
            Chauffeurs beheren
          </Link>
        </p>
        <Link
          href="/beheer/vervoer/week"
          className="rounded-full border border-vtk-navy/15 px-3.5 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40"
        >
          Weekoverzicht
        </Link>
      </div>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
          Te beslissen ({openGroups.length})
        </h2>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Geen open ritaanvragen.</p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {openGroups.map((group) => {
              const [first] = group;
              return (
                <BookingCard key={first.id} booking={first}>
                  {/* De rest van de aanvraag: de terugrit, een tweede voertuig,
                      of allebei. De kaart toont enkel de eerste rit. */}
                  {group.length > 1 ? (
                    <ul className="mt-2 grid gap-0.5 text-sm text-vtk-muted">
                      {group.slice(1).map((leg) => (
                        <li key={leg.id}>
                          {leg.tripLeg === 'TERUG' ? 'Terugrit' : leg.vehicle.nameNl}:{' '}
                          {dateFormatter.format(leg.startAt)} · {hoursLabel(leg)}
                          {leg.tripLeg === 'TERUG' && leg.vehicleId !== first.vehicleId
                            ? ` (${leg.vehicle.nameNl})`
                            : ''}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="mt-4">
                    <TransportDecisionForms
                      bookingId={first.id}
                      legs={group.map((leg) => ({
                        id: leg.id,
                        startAt: toDatetimeLocalValue(leg.startAt),
                        endAt: toDatetimeLocalValue(leg.endAt),
                        // Waarom deze rit apart staat: heen/terug (V12), een
                        // tweede voertuig (V1), of allebei. Zonder dat opschrift
                        // staan er twee identieke urenblokken onder elkaar.
                        label:
                          group.length > 1
                            ? [
                                leg.tripLeg === 'TERUG'
                                  ? 'Terugrit'
                                  : leg.tripLeg === 'HEEN'
                                    ? 'Heenrit'
                                    : null,
                                new Set(group.map((other) => other.vehicleId)).size > 1
                                  ? leg.vehicle.nameNl
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(' · ') || 'Rit'
                            : null,
                      }))}
                      drivers={drivers}
                      pricingIsPerKm={first.pricingMode === 'PER_KM'}
                      needsVanDriver={
                        vehicles.find((v) => v.id === first.vehicleId)?.needsVanDriver ?? false
                      }
                      sameDayBookings={sameDayLines(first)}
                    />
                  </div>
                </BookingCard>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
          Goedgekeurd ({approved.length})
        </h2>
        {approved.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Geen goedgekeurde ritten.</p>
        ) : (
          <>
            {/* Kaartjesweergave: zichtbaar op mobile, verborgen op md+ */}
            <ul className="mt-4 grid gap-3 md:hidden">
              {approved.map((booking) => {
                const paid = paidOf(booking);
                return (
                  <li
                    key={booking.id}
                    className={`rounded-[16px] border bg-vtk-surface p-4 ${
                      !booking.driver ? 'border-amber-300 bg-amber-50/30' : 'border-vtk-navy/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-vtk-ink">
                          {booking.vehicle.nameNl}
                          <span className="ml-2 text-sm font-normal text-vtk-muted">{requesterLabel(booking)}</span>
                        </p>
                        <p className="mt-0.5 text-sm text-vtk-muted">{booking.user.name}</p>
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div><dt className="text-vtk-muted">Wanneer</dt><dd className="text-vtk-body">{dateFormatter.format(booking.startAt)}</dd></div>
                          <div><dt className="text-vtk-muted">Uren</dt><dd className="tabular-nums text-vtk-body">{hoursLabel(booking)}</dd></div>
                          <div><dt className="text-vtk-muted">Chauffeur</dt><dd className={booking.driver ? 'text-vtk-body' : 'font-semibold text-vtk-ink'}>{booking.driver?.name ?? 'nog geen'}</dd></div>
                          <div><dt className="text-vtk-muted">Prijs</dt><dd className="tabular-nums text-vtk-body">{formatPriceCents(booking.priceCents)}</dd></div>
                          {booking.paymentMode ? (
                            <div><dt className="text-vtk-muted">Betaald</dt><dd className="text-vtk-body">{paid ? 'ja' : 'nog niet'}</dd></div>
                          ) : null}
                        </dl>
                      </div>
                      <VanStatusBadge status={booking.status} />
                    </div>
                    <BookingDetails booking={booking}>
                      <TransportControls
                        bookingId={booking.id}
                        vehicleId={booking.vehicleId}
                        driverId={booking.driverId}
                        driver={booking.driver}
                        pricingMode={booking.pricingMode}
                        paid={paid}
                        drivers={drivers}
                        vehicles={activeVehicleOptions}
                      />
                    </BookingDetails>
                  </li>
                );
              })}
            </ul>

            {/* Tabelweergave: verborgen op mobile, zichtbaar op md+ */}
            <div className="relative mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-vtk-navy/10 text-left text-xs text-vtk-muted">
                    <th className={headerClass}>Wanneer</th>
                    <th className={headerClass}>Uren</th>
                    <th className={headerClass}>Voertuig</th>
                    <th className={headerClass}>Aanvrager</th>
                    <th className={headerClass}>Chauffeur</th>
                    <th className={headerClass}>Prijs</th>
                    <th className={headerClass}>Betaald</th>
                    <th className="py-2 pl-2"></th>
                  </tr>
                </thead>
                {approved.map((booking) => {
                  const paid = paidOf(booking);
                  return (
                    <BookingRow
                      key={booking.id}
                      columns={7}
                      label={`${booking.vehicle.nameNl}, ${requesterLabel(booking)}, ${dateFormatter.format(booking.startAt)}`}
                      highlight={!booking.driver}
                      summary={
                        <>
                          <td className="py-2 pr-3 text-vtk-ink">{dateFormatter.format(booking.startAt)}</td>
                          <td className="py-2 pr-3 tabular-nums text-vtk-body">{hoursLabel(booking)}</td>
                          <td className="py-2 pr-3 text-vtk-body">{booking.vehicle.nameNl}</td>
                          <td className="py-2 pr-3 text-vtk-body">
                            {requesterLabel(booking)}
                            <span className="block text-xs text-vtk-muted">{booking.user.name}</span>
                          </td>
                          <td className="py-2 pr-3">
                            {booking.driver ? (
                              <span className="text-vtk-body">{booking.driver.name}</span>
                            ) : (
                              <span className="font-semibold text-vtk-ink">nog geen</span>
                            )}
                          </td>
                          <td className="py-2 pr-3 tabular-nums text-vtk-body">
                            {formatPriceCents(booking.priceCents)}
                          </td>
                          <td className="py-2 pr-3 text-vtk-body">
                            {!booking.paymentMode ? '' : paid ? 'ja' : 'nog niet'}
                          </td>
                        </>
                      }
                      details={
                        <BookingDetails booking={booking}>
                          <TransportControls
                            bookingId={booking.id}
                            vehicleId={booking.vehicleId}
                            driverId={booking.driverId}
                            driver={booking.driver}
                            pricingMode={booking.pricingMode}
                            paid={paid}
                            drivers={drivers}
                            vehicles={activeVehicleOptions}
                          />
                        </BookingDetails>
                      }
                    />
                  );
                })}
              </table>
            </div>
            {approved.some((booking) => !booking.driver) ? (
              <p className="mt-2 text-xs text-vtk-muted">
                Geel gemarkeerd: er is nog geen chauffeur toegewezen.
              </p>
            ) : null}
          </>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Historiek ({rest.length})</h2>
        {rest.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Nog geen afgeronde of afgewezen ritten.</p>
        ) : (
          <>
            {/* Kaartjesweergave: zichtbaar op mobile, verborgen op md+ */}
            <ul className="mt-4 grid gap-3 md:hidden">
              {rest.map((booking) => (
                <li
                  key={booking.id}
                  className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-vtk-ink">
                        {booking.vehicle.nameNl}
                        <span className="ml-2 text-sm font-normal text-vtk-muted">{requesterLabel(booking)}</span>
                      </p>
                      <p className="mt-0.5 text-sm text-vtk-muted">{booking.user.name}</p>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <div><dt className="text-vtk-muted">Wanneer</dt><dd className="text-vtk-body">{dateFormatter.format(booking.startAt)}</dd></div>
                        <div><dt className="text-vtk-muted">Uren</dt><dd className="tabular-nums text-vtk-body">{hoursLabel(booking)}</dd></div>
                        {booking.driver ? <div><dt className="text-vtk-muted">Chauffeur</dt><dd className="text-vtk-body">{booking.driver.name}</dd></div> : null}
                        <div><dt className="text-vtk-muted">Prijs</dt><dd className="tabular-nums text-vtk-body">{formatPriceCents(booking.priceCents)}</dd></div>
                      </dl>
                    </div>
                    <VanStatusBadge status={booking.status} />
                  </div>
                  <BookingDetails booking={booking} />
                </li>
              ))}
            </ul>

            {/* Tabelweergave: verborgen op mobile, zichtbaar op md+ */}
            <div className="relative mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-vtk-navy/10 text-left text-xs text-vtk-muted">
                    <th className={headerClass}>Wanneer</th>
                    <th className={headerClass}>Uren</th>
                    <th className={headerClass}>Voertuig</th>
                    <th className={headerClass}>Aanvrager</th>
                    <th className={headerClass}>Chauffeur</th>
                    <th className={headerClass}>Prijs</th>
                    <th className={headerClass}>Status</th>
                    <th className="py-2 pl-2"></th>
                  </tr>
                </thead>
                {rest.map((booking) => (
                  <BookingRow
                    key={booking.id}
                    columns={7}
                    label={`${booking.vehicle.nameNl}, ${requesterLabel(booking)}, ${dateFormatter.format(booking.startAt)}`}
                    summary={
                      <>
                        <td className="py-2 pr-3 text-vtk-ink">{dateFormatter.format(booking.startAt)}</td>
                        <td className="py-2 pr-3 tabular-nums text-vtk-body">{hoursLabel(booking)}</td>
                        <td className="py-2 pr-3 text-vtk-body">{booking.vehicle.nameNl}</td>
                        <td className="py-2 pr-3 text-vtk-body">
                          {requesterLabel(booking)}
                          <span className="block text-xs text-vtk-muted">{booking.user.name}</span>
                        </td>
                        <td className="py-2 pr-3 text-vtk-body">{booking.driver?.name ?? ''}</td>
                        <td className="py-2 pr-3 tabular-nums text-vtk-body">
                          {formatPriceCents(booking.priceCents)}
                        </td>
                        <td className="py-2 pr-3">
                          <VanStatusBadge status={booking.status} />
                        </td>
                      </>
                    }
                    details={<BookingDetails booking={booking} />}
                  />
                ))}
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
