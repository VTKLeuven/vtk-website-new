import { VanStatusBadge } from '@/components/status-badge';
import { requireManage } from '@/lib/session';
import { formatDateTime, formatPriceCents } from '@/lib/uitleen';
import {
  adminVanBookings,
  adminVehicles,
  hasSucceededPayment,
  logistiekTeamMembers,
  type AdminTransportBooking,
} from '@/lib/uitleen-server';
import { TransportControls } from './transport-controls';
import { TransportDecisionForms } from './transport-decision-forms';

export default async function BeheerVervoerPage() {
  await requireManage();

  const [bookings, drivers, vehicles] = await Promise.all([
    adminVanBookings(),
    logistiekTeamMembers(),
    adminVehicles(),
  ]);
  const activeVehicleOptions = vehicles
    .filter((v) => v.active)
    .map((v) => ({ id: v.id, name: v.nameNl }));

  const open = bookings.filter((booking) => booking.status === 'REQUESTED');
  const approved = bookings.filter((booking) => booking.status === 'APPROVED');
  const rest = bookings.filter((booking) => !['REQUESTED', 'APPROVED'].includes(booking.status));

  function BookingCard({
    booking,
    children,
  }: {
    booking: AdminTransportBooking;
    children?: React.ReactNode;
  }) {
    const paid = hasSucceededPayment(booking.payments) || booking.paidOfflineAt !== null;
    return (
      <li className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 font-medium text-vtk-ink">
              <span className="rounded-full bg-vtk-paper-2 px-2.5 py-0.5 text-xs font-semibold text-vtk-navy">
                {booking.vehicle.nameNl}
              </span>
              {booking.user.name}
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

  return (
    <div className="grid gap-8">
      <section>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Te beslissen ({open.length})</h2>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Geen open ritaanvragen.</p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {open.map((booking) => (
              <BookingCard key={booking.id} booking={booking}>
                <div className="mt-4">
                  <TransportDecisionForms
                    bookingId={booking.id}
                    drivers={drivers}
                    pricingIsPerKm={booking.pricingMode === 'PER_KM'}
                  />
                </div>
              </BookingCard>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Goedgekeurd ({approved.length})</h2>
        {approved.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Geen goedgekeurde ritten.</p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {approved.map((booking) => {
              const paid = hasSucceededPayment(booking.payments) || booking.paidOfflineAt !== null;
              return (
                <BookingCard key={booking.id} booking={booking}>
                  <TransportControls
                    bookingId={booking.id}
                    vehicleId={booking.vehicleId}
                    driverId={booking.driverId}
                    pricingMode={booking.pricingMode}
                    paid={paid}
                    drivers={drivers}
                    vehicles={activeVehicleOptions}
                  />
                </BookingCard>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Historiek</h2>
        {rest.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Nog geen afgeronde of afgewezen ritten.</p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {rest.map((booking) => (
              <BookingCard key={booking.id} booking={booking} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
