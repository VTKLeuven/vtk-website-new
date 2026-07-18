import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cancelReservationAction } from '@/app/actions/uitleen';
import { CancelButton } from '@/components/cancel-button';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { PayButton } from '@/components/pay-button';
import { ReservationStatusBadge } from '@/components/status-badge';
import { reconcilePayments } from '@/lib/payments';
import { getSession } from '@/lib/session';
import { formatDateOnly, formatEuro } from '@/lib/uitleen';
import { hasSucceededPayment, reservationForUser } from '@/lib/uitleen-server';

export default async function ReservatieDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ betaling?: string }>;
}) {
  const session = await getSession();
  if (!session) {
    return <LoginGate message="Log in om je reservatie te bekijken." />;
  }

  const { id } = await params;
  const { betaling } = await searchParams;
  let reservation = await reservationForUser(id, session.user.id);
  if (!reservation) notFound();

  // Terug van de checkout: haal de status meteen bij de provider op, want in
  // dev bereikt de webhook localhost niet en ook live kan hij nog onderweg zijn.
  if (betaling && reservation.payments.some((payment) => payment.status === 'PENDING')) {
    if ((await reconcilePayments(reservation.payments)) > 0) {
      reservation = (await reservationForUser(id, session.user.id))!;
    }
  }

  const paid = hasSucceededPayment(reservation.payments) || reservation.paidOfflineAt !== null;
  const cancellable =
    (reservation.status === 'REQUESTED' || reservation.status === 'APPROVED') && !paid;

  return (
    <PageShell
      kicker={
        <Link href="/reservaties" className="hover:underline">
          ← Mijn reservaties
        </Link>
      }
      title="Materiaalreservatie"
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Inhoud</h2>
            <ReservationStatusBadge status={reservation.status} />
          </div>

          <ul className="mt-4 divide-y divide-vtk-navy/10">
            {reservation.lines.map((line) => (
              <li key={line.id} className="flex items-center justify-between gap-4 py-3">
                <span className="text-vtk-ink">
                  {line.quantity}× {line.itemName}
                </span>
                <span className="text-sm text-vtk-muted">
                  {line.unitPriceCents > 0 ? formatEuro(line.unitPriceCents * line.quantity) : 'Gratis'}
                  {line.unitDepositCents > 0
                    ? ` + ${formatEuro(line.unitDepositCents * line.quantity)} waarborg`
                    : ''}
                </span>
              </li>
            ))}
          </ul>

          {reservation.memberNote ? (
            <p className="mt-4 rounded-lg bg-vtk-paper px-4 py-3 text-sm text-vtk-body">
              <span className="font-medium text-vtk-ink">Jouw nota:</span> {reservation.memberNote}
            </p>
          ) : null}
          {reservation.adminNote ? (
            <p className="mt-3 rounded-lg bg-vtk-paper px-4 py-3 text-sm text-vtk-body">
              <span className="font-medium text-vtk-ink">Nota van Logistiek:</span>{' '}
              {reservation.adminNote}
            </p>
          ) : null}
        </section>

        <aside className="h-fit rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">Afhalen</dt>
              <dd className="text-right font-medium text-vtk-ink">
                {formatDateOnly(reservation.pickupDate)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">Terugbrengen</dt>
              <dd className="text-right font-medium text-vtk-ink">
                {formatDateOnly(reservation.returnDate)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">Huurprijs</dt>
              <dd className="font-medium text-vtk-ink">{formatEuro(reservation.totalPriceCents)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">Waarborg</dt>
              <dd className="font-medium text-vtk-ink">{formatEuro(reservation.totalDepositCents)}</dd>
            </div>
            {reservation.status !== 'REQUESTED' && reservation.paymentMode ? (
              <div className="flex justify-between gap-4">
                <dt className="text-vtk-muted">Betaling</dt>
                <dd className="text-right font-medium text-vtk-ink">
                  {paid
                    ? 'Betaald'
                    : reservation.paymentMode === 'ONLINE'
                      ? 'Online, nog te betalen'
                      : 'Bij afhaling'}
                </dd>
              </div>
            ) : null}
            {reservation.depositReturnedAt ? (
              <div className="flex justify-between gap-4">
                <dt className="text-vtk-muted">Waarborg terug</dt>
                <dd className="font-medium text-vtk-ink">Ja</dd>
              </div>
            ) : null}
          </dl>

          {reservation.status === 'REQUESTED' ? (
            <p className="mt-4 text-sm leading-6 text-vtk-muted">
              Logistiek moet deze aanvraag nog beoordelen.
            </p>
          ) : null}

          {betaling && paid ? (
            <p className="mt-4 rounded-lg border border-vtk-yellow-dark/40 bg-vtk-yellow/20 px-3 py-2 text-sm font-medium text-vtk-ink">
              Betaling ontvangen.
            </p>
          ) : null}

          {reservation.status === 'APPROVED' &&
          reservation.paymentMode === 'ONLINE' &&
          !paid &&
          reservation.totalPriceCents > 0 ? (
            <div className="mt-5 border-t border-vtk-navy/10 pt-4">
              <PayButton
                target="reservation"
                id={reservation.id}
                amountLabel={formatEuro(reservation.totalPriceCents)}
              />
              {reservation.totalDepositCents > 0 ? (
                <p className="mt-2 text-xs leading-5 text-vtk-muted">
                  De waarborg van {formatEuro(reservation.totalDepositCents)} betaal je cash bij
                  afhaling.
                </p>
              ) : null}
            </div>
          ) : null}

          {cancellable ? (
            <div className="mt-5 border-t border-vtk-navy/10 pt-4">
              <CancelButton
                label="Reservatie annuleren"
                dialogTitle="Reservatie annuleren?"
                dialogDescription="Na annulering kun je deze aanvraag niet herstellen. Je kunt wel een nieuwe aanvraag indienen."
                action={cancelReservationAction.bind(null, reservation.id)}
              />
            </div>
          ) : null}
        </aside>
      </div>
    </PageShell>
  );
}
