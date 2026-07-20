import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cancelVanBookingAction } from '@/app/actions/uitleen';
import { CancelButton } from '@/components/cancel-button';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { PayButton } from '@/components/pay-button';
import { VanStatusBadge } from '@/components/status-badge';
import { reconcilePayments } from '@/lib/payments';
import { getLocale } from '@/lib/i18n';
import { getSession } from '@/lib/session';
import { formatDateTime, formatPriceCents } from '@/lib/uitleen';
import { hasSucceededPayment, vanBookingForUser } from '@/lib/uitleen-server';

export default async function VanBookingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ betaling?: string }>;
}) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) {
    return <LoginGate variant="trip" />;
  }
  const en = locale === 'en';

  const { id } = await params;
  const { betaling } = await searchParams;
  let booking = await vanBookingForUser(id, session.user.id);
  if (!booking) notFound();

  // Terug van de checkout: status meteen bij de provider ophalen (zie
  // reservaties/[id] voor de rationale).
  if (betaling && booking.payments.some((payment) => payment.status === 'PENDING')) {
    if ((await reconcilePayments(booking.payments)) > 0) {
      booking = (await vanBookingForUser(id, session.user.id))!;
    }
  }

  const paid = hasSucceededPayment(booking.payments) || booking.paidOfflineAt !== null;
  const cancellable = (booking.status === 'REQUESTED' || booking.status === 'APPROVED') && !paid;

  return (
    <PageShell
      kicker={
        <Link href="/reservaties" className="hover:underline">
          ← {en ? 'My reservations' : 'Mijn reservaties'}
        </Link>
      }
      title={en ? 'Transport' : 'Vervoer'}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{booking.purpose}</h2>
            <VanStatusBadge status={booking.status} locale={locale} />
          </div>

          <dl className="mt-4 space-y-2 text-sm">
            {booking.pickupAddress ? (
              <div className="flex justify-between gap-4">
                <dt className="text-vtk-muted">{en ? 'Loading address' : 'Laadadres'}</dt>
                <dd className="text-right font-medium text-vtk-ink">{booking.pickupAddress}</dd>
              </div>
            ) : null}
            {booking.destination ? (
              <div className="flex justify-between gap-4">
                <dt className="text-vtk-muted">{en ? 'Destination' : 'Bestemming'}</dt>
                <dd className="text-right font-medium text-vtk-ink">{booking.destination}</dd>
              </div>
            ) : null}
            {booking.driver ? (
              <div className="flex justify-between gap-4">
                <dt className="text-vtk-muted">{en ? 'Driver' : 'Chauffeur'}</dt>
                <dd className="text-right font-medium text-vtk-ink">{booking.driver.name}</dd>
              </div>
            ) : null}
          </dl>

          {booking.memberNote ? (
            <p className="mt-4 rounded-lg bg-vtk-paper px-4 py-3 text-sm text-vtk-body">
              <span className="font-medium text-vtk-ink">{en ? 'Your note:' : 'Jouw nota:'}</span> {booking.memberNote}
            </p>
          ) : null}
          {booking.adminNote ? (
            <p className="mt-3 rounded-lg bg-vtk-paper px-4 py-3 text-sm text-vtk-body">
              <span className="font-medium text-vtk-ink">{en ? 'Note from Logistics:' : 'Nota van Logistiek:'}</span>{' '}
              {booking.adminNote}
            </p>
          ) : null}
        </section>

        <aside className="h-fit rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">{en ? 'From' : 'Van'}</dt>
              <dd className="text-right font-medium text-vtk-ink">{formatDateTime(booking.startAt, locale)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">{en ? 'To' : 'Tot'}</dt>
              <dd className="text-right font-medium text-vtk-ink">{formatDateTime(booking.endAt, locale)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">{en ? 'Price' : 'Prijs'}</dt>
              <dd className="font-medium text-vtk-ink">{formatPriceCents(booking.priceCents, locale)}</dd>
            </div>
            {booking.status !== 'REQUESTED' && booking.paymentMode ? (
              <div className="flex justify-between gap-4">
                <dt className="text-vtk-muted">{en ? 'Payment' : 'Betaling'}</dt>
                <dd className="text-right font-medium text-vtk-ink">
                  {paid
                    ? en ? 'Paid' : 'Betaald'
                    : booking.paymentMode === 'ONLINE'
                      ? en ? 'Online, still to pay' : 'Online, nog te betalen'
                      : en ? 'On site' : 'Ter plaatse'}
                </dd>
              </div>
            ) : null}
          </dl>

          {booking.status === 'REQUESTED' ? (
            <p className="mt-4 text-sm leading-6 text-vtk-muted">
              {en
                ? 'The Logistics team reviews your request and assigns a driver on approval.'
                : 'Het team van Logistiek bekijkt je aanvraag en wijst bij goedkeuring een chauffeur toe.'}
            </p>
          ) : null}

          {betaling && paid ? (
            <p className="mt-4 rounded-lg border border-vtk-yellow-dark/40 bg-vtk-yellow/20 px-3 py-2 text-sm font-medium text-vtk-ink">
              {en ? 'Your payment succeeded. Have a good trip!' : 'Je betaling is gelukt. Goede rit!'}
            </p>
          ) : null}

          {booking.status === 'APPROVED' && booking.paymentMode === 'ONLINE' && !paid ? (
            <div className="mt-5 border-t border-vtk-navy/10 pt-4">
              <PayButton target="van" id={booking.id} amountLabel={formatPriceCents(booking.priceCents, locale)} locale={locale} />
            </div>
          ) : null}

          {cancellable ? (
            <div className="mt-5 border-t border-vtk-navy/10 pt-4">
              <CancelButton
                label={en ? 'Cancel trip' : 'Rit annuleren'}
                dialogTitle={en ? 'Cancel trip?' : 'Rit annuleren?'}
                dialogDescription={
                  en
                    ? 'Your request lapses and the time slot becomes free again. This cannot be undone; you can always request a new trip.'
                    : 'Je aanvraag vervalt en het tijdslot komt weer vrij. Dit kan je niet ongedaan maken; een nieuwe rit aanvragen kan altijd.'
                }
                action={cancelVanBookingAction.bind(null, booking.id)}
                locale={locale}
              />
            </div>
          ) : null}
        </aside>
      </div>
    </PageShell>
  );
}
