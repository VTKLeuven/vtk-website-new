import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@vtk/db';
import {
  markDepositReturnedAction,
  markPaidOfflineAction,
  markPickedUpAction,
  markReturnedAction,
} from '@/app/actions/beheer';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { ReservationStatusBadge } from '@/components/status-badge';
import { requireManage } from '@/lib/session';
import { formatDateOnly, formatEuro } from '@/lib/uitleen';
import { adminReservation, hasSucceededPayment, reservedQuantities } from '@/lib/uitleen-server';
import { DecisionForms } from './decision-forms';

export default async function BeheerAanvraagDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireManage();

  const { id } = await params;
  const reservation = await adminReservation(id);
  if (!reservation) notFound();

  const reserved =
    reservation.status === 'REQUESTED'
      ? await reservedQuantities(prisma, reservation.pickupDate, reservation.returnDate, {
          excludeReservationId: reservation.id,
        })
      : null;

  const paidOnline = hasSucceededPayment(reservation.payments);
  const paid = paidOnline || reservation.paidOfflineAt !== null;
  const owesMoney = reservation.totalPriceCents > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
        <p className="text-sm text-vtk-muted">
          <Link href="/beheer/aanvragen" className="hover:underline">
            ← Aanvragen
          </Link>
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-vtk-ink">
              {reservation.user.name}
            </h2>
            <p className="text-sm text-vtk-muted">{reservation.user.email}</p>
          </div>
          <ReservationStatusBadge status={reservation.status} />
        </div>

        <dl className="mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-vtk-muted">Afhalen</dt>
            <dd className="font-medium text-vtk-ink">{formatDateOnly(reservation.pickupDate)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-vtk-muted">Terugbrengen</dt>
            <dd className="font-medium text-vtk-ink">{formatDateOnly(reservation.returnDate)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-vtk-muted">Huurprijs</dt>
            <dd className="font-medium text-vtk-ink">{formatEuro(reservation.totalPriceCents)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-vtk-muted">Waarborg</dt>
            <dd className="font-medium text-vtk-ink">{formatEuro(reservation.totalDepositCents)}</dd>
          </div>
          {reservation.paymentMode ? (
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">Betaling</dt>
              <dd className="font-medium text-vtk-ink">
                {paid
                  ? paidOnline
                    ? 'Online betaald'
                    : 'Betaald bij afhaling'
                  : reservation.paymentMode === 'ONLINE'
                    ? 'Online, nog niet betaald'
                    : 'Bij afhaling, nog niet betaald'}
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

        <h3 className="mt-6 text-sm font-semibold text-vtk-ink">Materiaal</h3>
        <ul className="mt-2 divide-y divide-vtk-navy/10">
          {reservation.lines.map((line) => {
            const available = reserved
              ? line.item.quantity - (reserved.get(line.itemId) ?? 0)
              : null;
            const short = available !== null && line.quantity > available;
            return (
              <li key={line.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                <span className="text-vtk-ink">
                  {line.quantity}× {line.itemName}
                  {!line.item.active ? (
                    <span className="ml-2 text-xs text-vtk-muted">(niet meer in catalogus)</span>
                  ) : null}
                </span>
                {available !== null ? (
                  <span className={short ? 'font-semibold text-red-700' : 'text-vtk-muted'}>
                    {available} beschikbaar in deze periode
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>

        {reservation.memberNote ? (
          <p className="mt-4 rounded-lg bg-vtk-paper px-4 py-3 text-sm text-vtk-body">
            <span className="font-medium text-vtk-ink">Nota van het lid:</span>{' '}
            {reservation.memberNote}
          </p>
        ) : null}
        {reservation.adminNote ? (
          <p className="mt-3 rounded-lg bg-vtk-paper px-4 py-3 text-sm text-vtk-body">
            <span className="font-medium text-vtk-ink">Nota van het team:</span>{' '}
            {reservation.adminNote}
          </p>
        ) : null}
      </section>

      <aside className="grid h-fit gap-4">
        {reservation.status === 'REQUESTED' ? (
          <DecisionForms reservationId={reservation.id} totalCents={reservation.totalPriceCents} />
        ) : null}

        {reservation.status === 'APPROVED' ? (
          <div className="grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface p-4">
            <p className="text-sm font-semibold text-vtk-ink">Afhaling</p>
            {owesMoney && !paid ? (
              <p className="text-sm text-vtk-muted">
                Nog niet betaald
                {reservation.paymentMode === 'OFFLINE' ? '; reken af bij afhaling.' : ' (online).'}
              </p>
            ) : null}
            {owesMoney && !paid ? (
              <ConfirmActionButton
                label="Markeer als betaald"
                successMessage="Gemarkeerd als betaald."
                action={markPaidOfflineAction.bind(null, reservation.id)}
                dialogTitle="Betaling registreren?"
                dialogDescription={`Je bevestigt dat ${formatEuro(reservation.totalPriceCents)} betaald is (cash of Payconiq). Dit is niet omkeerbaar in dit scherm.`}
              />
            ) : null}
            <ConfirmActionButton
              label="Markeer als afgehaald"
              successMessage="Gemarkeerd als afgehaald."
              action={markPickedUpAction.bind(null, reservation.id)}
              confirm={false}
              variant="primary"
            />
          </div>
        ) : null}

        {reservation.status === 'PICKED_UP' ? (
          <div className="grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface p-4">
            <p className="text-sm font-semibold text-vtk-ink">Terugbrengen</p>
            <ConfirmActionButton
              label="Markeer als teruggebracht"
              successMessage="Gemarkeerd als teruggebracht."
              action={markReturnedAction.bind(null, reservation.id)}
              confirm={false}
              variant="primary"
            />
          </div>
        ) : null}

        {reservation.status === 'RETURNED' &&
        reservation.totalDepositCents > 0 &&
        !reservation.depositReturnedAt ? (
          <div className="grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface p-4">
            <p className="text-sm font-semibold text-vtk-ink">Waarborg</p>
            <ConfirmActionButton
              label="Waarborg teruggegeven"
              successMessage="Waarborg gemarkeerd als teruggegeven."
              action={markDepositReturnedAction.bind(null, reservation.id)}
              dialogTitle="Waarborg teruggeven?"
              dialogDescription={`Je bevestigt dat de waarborg van ${formatEuro(reservation.totalDepositCents)} terug bij het lid is.`}
            />
          </div>
        ) : null}
      </aside>
    </div>
  );
}
