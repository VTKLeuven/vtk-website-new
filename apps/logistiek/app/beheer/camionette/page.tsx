import { completeVanBookingAction, markVanPaidOfflineAction } from '@/app/actions/beheer';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { VanStatusBadge } from '@/components/status-badge';
import { requireManage } from '@/lib/session';
import { formatDateTime, formatEuro } from '@/lib/uitleen';
import { adminVanBookings, hasSucceededPayment, logistiekTeamMembers } from '@/lib/uitleen-server';
import { VanDecisionForms } from './van-decision-forms';

export default async function BeheerCamionettePage() {
  await requireManage();

  const [bookings, drivers] = await Promise.all([adminVanBookings(), logistiekTeamMembers()]);
  const open = bookings.filter((booking) => booking.status === 'REQUESTED');
  const approved = bookings.filter((booking) => booking.status === 'APPROVED');
  const rest = bookings.filter((booking) => !['REQUESTED', 'APPROVED'].includes(booking.status));

  function BookingCard({
    booking,
    children,
  }: {
    booking: (typeof bookings)[number];
    children?: React.ReactNode;
  }) {
    const paid = hasSucceededPayment(booking.payments) || booking.paidOfflineAt !== null;
    return (
      <li className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-vtk-ink">
              {booking.user.name}
              <span className="ml-2 text-sm font-normal text-vtk-muted">{booking.purpose}</span>
            </p>
            <p className="mt-0.5 text-sm text-vtk-muted">
              {formatDateTime(booking.startAt)} tot {formatDateTime(booking.endAt)} ·{' '}
              {formatEuro(booking.priceCents)}
              {booking.driver ? ` · chauffeur: ${booking.driver.name}` : ' · nog geen chauffeur'}
              {booking.paymentMode ? (paid ? ' · betaald' : ' · nog niet betaald') : ''}
            </p>
            {booking.pickupAddress || booking.destination ? (
              <p className="mt-0.5 text-sm text-vtk-muted">
                {[booking.pickupAddress, booking.destination].filter(Boolean).join(' → ')}
              </p>
            ) : null}
            {booking.memberNote ? (
              <p className="mt-1 text-sm text-vtk-body">{booking.memberNote}</p>
            ) : null}
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
        <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
          Te beslissen ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="mt-3 text-sm text-vtk-muted">Geen open ritaanvragen.</p>
        ) : (
          <ul className="mt-4 grid gap-4">
            {open.map((booking) => (
              <BookingCard key={booking.id} booking={booking}>
                <div className="mt-4">
                  <VanDecisionForms bookingId={booking.id} drivers={drivers} />
                </div>
              </BookingCard>
            ))}
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
          <ul className="mt-4 grid gap-4">
            {approved.map((booking) => {
              const paid = hasSucceededPayment(booking.payments) || booking.paidOfflineAt !== null;
              return (
                <BookingCard key={booking.id} booking={booking}>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {!paid ? (
                      <ConfirmActionButton
                        label="Markeer als betaald"
                        successMessage="Gemarkeerd als betaald."
                        action={markVanPaidOfflineAction.bind(null, booking.id)}
                        dialogTitle="Betaling registreren?"
                        dialogDescription={`Je bevestigt dat ${formatEuro(booking.priceCents)} betaald is (cash of Payconiq).`}
                      />
                    ) : null}
                    <ConfirmActionButton
                      label="Rit afgerond"
                      successMessage="Rit afgerond."
                      action={completeVanBookingAction.bind(null, booking.id)}
                      confirm={false}
                      variant="primary"
                    />
                  </div>
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
