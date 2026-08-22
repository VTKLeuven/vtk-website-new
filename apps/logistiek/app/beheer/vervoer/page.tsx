import Link from 'next/link';
import { VanStatusBadge } from '@/components/status-badge';
import { requireManage } from '@/lib/session';
import {
  chargesRequester,
  eventOptions,
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
  // R2: ritten waarvan de rit al voorbij is, staan standaard ingeklapt achter
  // een teller. Nog niet voorbije historiek (bv. een geannuleerde rit die nog
  // moest plaatsvinden) blijft gewoon zichtbaar.
  const now = new Date();
  const restUpcoming = rest.filter((booking) => booking.endAt >= now);
  const restPast = rest.filter((booking) => booking.endAt < now);

  // Historiek van alle getoonde ritten in één query; de details staan wel
  // ingeklapt, maar worden hier server-side gerenderd.
  const auditLogs = await transportAuditLogsByBooking(bookings.map((booking) => booking.id));

  function paidOf(booking: AdminTransportBooking): boolean {
    return hasSucceededPayment(booking.payments) || booking.paidOfflineAt !== null;
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
    // R4: enkel externen betalen; prijs en betaalstatus verschijnen daarom
    // nergens voor een interne aanvraag (post, werkgroep), ook niet hier in de
    // uitgeklapte weergave. Zie chargesRequester() in lib/uitleen.ts.
    if (chargesRequester(booking.requesterType)) {
      lines.push(['Prijs', formatPriceCents(booking.priceCents)]);
      if (booking.paymentMode) {
        lines.push(['Betaald', paidOf(booking) ? 'ja' : 'nog niet']);
      }
    }
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

  /**
   * Details van een nog te beslissen aanvraag: de feitenlijst van de eerste
   * rit (`BookingDetails`, inclusief prijs/betaald als die relevant zijn,
   * R4), de eventuele tweede rit van de groep (heen/terug of een tweede
   * voertuig), en het beslisformulier eronder.
   */
  function OpenGroupDetails({ group }: { group: AdminTransportBooking[] }) {
    const [first] = group;
    return (
      <BookingDetails booking={first}>
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
            requesterType={first.requesterType}
            needsVanDriver={
              vehicles.find((v) => v.id === first.vehicleId)?.needsVanDriver ?? false
            }
            sameDayBookings={sameDayLines(first)}
          />
        </div>
      </BookingDetails>
    );
  }

  const headerClass = 'py-2 pr-3 font-medium';

  /** Kaartjes- en tabelweergave van een lijst afgesloten ritten (Historiek). */
  function HistoryList({ bookings: list }: { bookings: AdminTransportBooking[] }) {
    return (
      <>
        {/* Kaartjesweergave: zichtbaar op mobile, verborgen op md+ */}
        <ul className="mt-4 grid gap-3 md:hidden">
          {list.map((booking) => (
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
                  {booking.eventName ? (
                    <p className="mt-0.5 text-xs font-medium text-vtk-navy">{booking.eventName}</p>
                  ) : null}
                  <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <div><dt className="text-vtk-muted">Wanneer</dt><dd className="text-vtk-body">{dateFormatter.format(booking.startAt)}</dd></div>
                    <div><dt className="text-vtk-muted">Uren</dt><dd className="tabular-nums text-vtk-body">{hoursLabel(booking)}</dd></div>
                    {booking.driver ? <div><dt className="text-vtk-muted">Chauffeur</dt><dd className="text-vtk-body">{booking.driver.name}</dd></div> : null}
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
                <th className={headerClass}>Evenement</th>
                <th className={headerClass}>Status</th>
                <th className="py-2 pl-2"></th>
              </tr>
            </thead>
            {list.map((booking) => (
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
                    <td className="py-2 pr-3 text-vtk-body">{booking.eventName ?? ''}</td>
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
    );
  }

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
        <div className="flex flex-wrap items-center gap-2">
          {/* T6: twee losse links, elk met een eigen bestemming en een titel
              die zegt waar ze heen gaan, zodat ze niet door elkaar lopen met
              de "Transportplanning"-tab in de navigatie (N1, zelfde bestemming
              als hieronder). */}
          <Link
            href="/beheer/vervoer/week"
            title="Weekraster per voertuig, met beheeracties (zelfde als Transportplanning in de navigatie)"
            className="rounded-full border border-vtk-navy/15 px-3.5 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40"
          >
            Transportplanning
          </Link>
          <Link
            href="/vervoer/bezetting"
            title="Publiek bezettingsoverzicht met enkel de goedgekeurde ritten"
            className="rounded-full border border-vtk-navy/15 px-3.5 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40"
          >
            Bezettingsoverzicht
          </Link>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
          Te beslissen ({openGroups.length})
        </h2>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Geen open ritaanvragen.</p>
        ) : (
          <>
            {/* Kaartjesweergave: zichtbaar op mobile, verborgen op md+. Zelfde
                opbouw als "Goedgekeurd": compacte samenvatting, details en
                beslisformulier direct eronder (niet toegeklapt op mobile). */}
            <ul className="mt-4 grid gap-3 md:hidden">
              {openGroups.map((group) => {
                const [first] = group;
                return (
                  <li key={first.id} className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-vtk-ink">{first.vehicle.nameNl}</span>
                          {first.tripLeg ? (
                            <span className="rounded-full bg-vtk-yellow/25 px-2 py-0.5 text-[11px] font-semibold text-vtk-ink">
                              {first.tripLeg === 'HEEN' ? 'Heenrit' : 'Terugrit'}
                            </span>
                          ) : null}
                          {first.reservation ? (
                            <span className="rounded-full bg-vtk-paper-2 px-2 py-0.5 text-[11px] font-semibold text-vtk-navy">
                              Levering
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-sm text-vtk-muted">
                          {requesterLabel(first)}
                          <span className="ml-1">{first.user.name}</span>
                        </p>
                        {first.eventName ? (
                          <p className="mt-0.5 text-xs font-medium text-vtk-navy">{first.eventName}</p>
                        ) : null}
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div><dt className="text-vtk-muted">Wanneer</dt><dd className="text-vtk-body">{dateFormatter.format(first.startAt)}</dd></div>
                          <div><dt className="text-vtk-muted">Uren</dt><dd className="tabular-nums text-vtk-body">{hoursLabel(first)}</dd></div>
                        </dl>
                        {group.length > 1 ? (
                          <p className="mt-1 text-xs text-vtk-muted">
                            + {group.length - 1} extra rit{group.length - 1 > 1 ? 'ten' : ''} in deze aanvraag
                          </p>
                        ) : null}
                      </div>
                      <VanStatusBadge status={first.status} />
                    </div>
                    <div className="mt-3">
                      <OpenGroupDetails group={group} />
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Tabelweergave: verborgen op mobile, zichtbaar op md+. Compact per
                rij, details en beslisformulier pas bij uitklappen (T3), zelfde
                BookingRow-mechanisme als "Goedgekeurd". */}
            <div className="relative mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-vtk-navy/10 text-left text-xs text-vtk-muted">
                    <th className={headerClass}>Wanneer</th>
                    <th className={headerClass}>Uren</th>
                    <th className={headerClass}>Voertuig</th>
                    <th className={headerClass}>Aanvrager</th>
                    <th className={headerClass}>Evenement</th>
                    <th className="py-2 pl-2"></th>
                  </tr>
                </thead>
                {openGroups.map((group) => {
                  const [first] = group;
                  return (
                    <BookingRow
                      key={first.id}
                      columns={5}
                      label={`${first.vehicle.nameNl}, ${requesterLabel(first)}, ${dateFormatter.format(first.startAt)}`}
                      summary={
                        <>
                          <td className="py-2 pr-3 text-vtk-ink">{dateFormatter.format(first.startAt)}</td>
                          <td className="py-2 pr-3 tabular-nums text-vtk-body">{hoursLabel(first)}</td>
                          <td className="py-2 pr-3 text-vtk-body">
                            {first.vehicle.nameNl}
                            {first.tripLeg ? (
                              <span className="ml-1 text-xs text-vtk-muted">
                                ({first.tripLeg === 'HEEN' ? 'heen' : 'terug'})
                              </span>
                            ) : group.length > 1 ? (
                              <span className="ml-1 text-xs text-vtk-muted">+{group.length - 1}</span>
                            ) : null}
                          </td>
                          <td className="py-2 pr-3 text-vtk-body">
                            {requesterLabel(first)}
                            <span className="block text-xs text-vtk-muted">{first.user.name}</span>
                          </td>
                          <td className="py-2 pr-3 text-vtk-body">{first.eventName ?? ''}</td>
                        </>
                      }
                      details={<OpenGroupDetails group={group} />}
                    />
                  );
                })}
              </table>
            </div>
          </>
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
                        {booking.eventName ? (
                          <p className="mt-0.5 text-xs font-medium text-vtk-navy">{booking.eventName}</p>
                        ) : null}
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                          <div><dt className="text-vtk-muted">Wanneer</dt><dd className="text-vtk-body">{dateFormatter.format(booking.startAt)}</dd></div>
                          <div><dt className="text-vtk-muted">Uren</dt><dd className="tabular-nums text-vtk-body">{hoursLabel(booking)}</dd></div>
                          <div><dt className="text-vtk-muted">Chauffeur</dt><dd className={booking.driver ? 'text-vtk-body' : 'font-semibold text-vtk-ink'}>{booking.driver?.name ?? 'nog geen'}</dd></div>
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
                        requesterType={booking.requesterType}
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
                    <th className={headerClass}>Evenement</th>
                    <th className="py-2 pl-2"></th>
                  </tr>
                </thead>
                {approved.map((booking) => {
                  const paid = paidOf(booking);
                  return (
                    <BookingRow
                      key={booking.id}
                      columns={6}
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
                          <td className="py-2 pr-3 text-vtk-body">{booking.eventName ?? ''}</td>
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
                            requesterType={booking.requesterType}
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
            {restUpcoming.length > 0 ? <HistoryList bookings={restUpcoming} /> : null}
            {restPast.length > 0 ? (
              // R2: ritten waarvan de rit al voorbij is (endAt < vandaag), standaard
              // ingeklapt achter een teller. Zelfde patroon als PastGroup in
              // app/reservaties/page.tsx.
              <details className="group mt-4">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-vtk-muted [&::-webkit-details-marker]:hidden">
                  <span
                    aria-hidden="true"
                    className="inline-block transition-transform group-open:rotate-90"
                  >
                    ▸
                  </span>
                  Afgelopen ({restPast.length})
                </summary>
                <div className="mt-4">
                  <HistoryList bookings={restPast} />
                </div>
              </details>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
