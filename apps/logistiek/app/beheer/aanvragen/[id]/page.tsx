import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@vtk/db';
import {
  markDepositReturnedAction,
  markPaidOfflineAction,
  markPickedUpAction,
} from '@/app/actions/beheer';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { ReservationStatusBadge } from '@/components/status-badge';
import { requireManage } from '@/lib/session';
import {
  formatDateOnly,
  formatDateTime,
  formatEuro,
  REQUESTER_TYPE_LABELS,
  toDateInputValue,
  toDatetimeLocalValue,
} from '@/lib/uitleen';
import {
  activeGroups,
  adminReservation,
  getCatalog,
  getLogistiekSettings,
  hasSucceededPayment,
  reservedQuantities,
} from '@/lib/uitleen-server';
import { AdminReservationEditor } from './admin-edit-form';
import { DecisionForms } from './decision-forms';
import { ReturnForm } from './return-form';

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

  // Flesserke-aanvragen bewerkt het team niet inline (aparte flow); de team-editor
  // toont enkel voor materiaalaanvragen.
  const isFlesserke = reservation.flesserkeLines.length > 0 && reservation.lines.length === 0;
  const editable = (reservation.status === 'REQUESTED' || reservation.status === 'APPROVED') && !isFlesserke;
  const [catalog, groups, settings] = editable
    ? await Promise.all([getCatalog(), activeGroups(), getLogistiekSettings()])
    : [[], [], { showRentPrices: false }];

  const paidOnline = hasSucceededPayment(reservation.payments);
  const paid = paidOnline || reservation.paidOfflineAt !== null;
  const owesMoney = reservation.totalPriceCents > 0;

  const requesterLabel =
    reservation.requesterType === 'INTERN'
      ? (reservation.group?.nameNl ?? REQUESTER_TYPE_LABELS.INTERN)
      : (reservation.requesterName ?? REQUESTER_TYPE_LABELS[reservation.requesterType]);

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
            <h2 className="text-xl font-semibold tracking-tight text-vtk-ink">{reservation.eventName}</h2>
            <p className="text-sm text-vtk-muted">
              {reservation.user.name} · {reservation.user.email}
            </p>
          </div>
          <ReservationStatusBadge status={reservation.status} />
        </div>

        <dl className="mt-5 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-4">
            <dt className="text-vtk-muted">Namens</dt>
            <dd className="text-right font-medium text-vtk-ink">
              {requesterLabel} ({REQUESTER_TYPE_LABELS[reservation.requesterType]})
            </dd>
          </div>
          {reservation.eventLocation ? (
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">Locatie</dt>
              <dd className="text-right font-medium text-vtk-ink">{reservation.eventLocation}</dd>
            </div>
          ) : null}
          {reservation.eventStart ? (
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">Startuur</dt>
              <dd className="text-right font-medium text-vtk-ink">{formatDateTime(reservation.eventStart)}</dd>
            </div>
          ) : null}
          {reservation.expectedAttendance != null ? (
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">Verwachte opkomst</dt>
              <dd className="text-right font-medium text-vtk-ink">{reservation.expectedAttendance}</dd>
            </div>
          ) : null}
          {reservation.contactName || reservation.contactPhone ? (
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">Contact</dt>
              <dd className="text-right font-medium text-vtk-ink">
                {[reservation.contactName, reservation.contactPhone].filter(Boolean).join(' · ')}
              </dd>
            </div>
          ) : null}
          {reservation.delivery ? (
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">Levering</dt>
              <dd className="text-right font-medium text-vtk-ink">{reservation.deliveryNote || 'Ja'}</dd>
            </div>
          ) : null}
          <div className="flex justify-between gap-4">
            <dt className="text-vtk-muted">Afhalen</dt>
            <dd className="font-medium text-vtk-ink">{formatDateOnly(reservation.pickupDate)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-vtk-muted">Terugbrengen</dt>
            <dd className="font-medium text-vtk-ink">{formatDateOnly(reservation.returnDate)}</dd>
          </div>
          {settings.showRentPrices ? (
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">Huurprijs</dt>
              <dd className="font-medium text-vtk-ink">{formatEuro(reservation.totalPriceCents)}</dd>
            </div>
          ) : null}
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

        {reservation.lines.length > 0 ? (
          <>
            <h3 className="mt-6 text-sm font-semibold text-vtk-ink">Materiaal</h3>
            <ul className="mt-2 divide-y divide-vtk-navy/10">
              {reservation.lines.map((line) => {
                const available = reserved ? line.item.quantity - (reserved.get(line.itemId) ?? 0) : null;
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
          </>
        ) : null}

        {reservation.flesserkeLines.length > 0 ? (
          <>
            <h3 className="mt-6 text-sm font-semibold text-vtk-ink">Flesserke</h3>
            <ul className="mt-2 divide-y divide-vtk-navy/10">
              {reservation.flesserkeLines.map((line) => (
                <li key={line.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="text-vtk-ink">
                    {line.quantity}× {line.itemName}
                  </span>
                  {line.returnedQuantity != null ? (
                    <span className="text-vtk-muted">
                      {line.quantity - line.returnedQuantity} verbruikt
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        ) : null}

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

        {editable ? (
          <div className="mt-5 border-t border-vtk-navy/10 pt-4">
            <AdminReservationEditor
              reservationId={reservation.id}
              catalog={catalog}
              groups={groups.map((g) => ({ id: g.id, name: g.nameNl }))}
              showRentPrices={settings.showRentPrices}
              initial={{
                event: {
                  requesterType: reservation.requesterType,
                  groupId: reservation.groupId ?? '',
                  requesterName: reservation.requesterName ?? '',
                  eventName: reservation.eventName,
                  eventLocation: reservation.eventLocation ?? '',
                  eventStart: reservation.eventStart ? toDatetimeLocalValue(reservation.eventStart) : '',
                  expectedAttendance: reservation.expectedAttendance?.toString() ?? '',
                  contactName: reservation.contactName ?? '',
                  contactPhone: reservation.contactPhone ?? '',
                  delivery: reservation.delivery,
                  deliveryNote: reservation.deliveryNote ?? '',
                },
                pickupDate: toDateInputValue(reservation.pickupDate),
                returnDate: toDateInputValue(reservation.returnDate),
                note: reservation.memberNote ?? '',
                quantities: Object.fromEntries(reservation.lines.map((l) => [l.itemId, l.quantity])),
                flesserkeQuantities: Object.fromEntries(
                  reservation.flesserkeLines.map((l) => [l.flesserkeItemId, l.quantity])
                ),
              }}
            />
          </div>
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
          <ReturnForm
            reservationId={reservation.id}
            flesserkeLines={reservation.flesserkeLines.map((l) => ({
              id: l.id,
              itemName: l.itemName,
              quantity: l.quantity,
            }))}
          />
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
