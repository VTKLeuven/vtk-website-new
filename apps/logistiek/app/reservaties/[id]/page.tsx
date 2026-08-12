import { notFound } from 'next/navigation';
import Link from 'next/link';
import { cancelReservationAction } from '@/app/actions/uitleen';
import { CancelButton } from '@/components/cancel-button';
import { LoginGate } from '@/components/login-gate';
import { PageShell } from '@/components/page-shell';
import { PayButton } from '@/components/pay-button';
import { ReservationStatusBadge } from '@/components/status-badge';
import { reconcilePayments } from '@/lib/payments';
import { getLocale } from '@/lib/i18n';
import { getSession } from '@/lib/session';
import { requesterOptions } from '@/app/materiaal/event-values';
import {
  DEFAULT_LAST_MINUTE_DAYS,
  formatDateOnly,
  formatDateWithPart,
  formatDateTime,
  formatEuro,
  requesterTypeLabel,
  toDateInputValue,
  toDatetimeLocalValue,
} from '@/lib/uitleen';
import {
  getCatalog,
  getFlesserkeCatalog,
  getLogistiekSettings,
  hasSucceededPayment,
  reservationForMember,
} from '@/lib/uitleen-server';
import { ReservationEditor } from './edit-form';
import { FlesserkeEditor } from '@/app/flesserke/edit-form';

export default async function ReservatieDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ betaling?: string }>;
}) {
  const [session, locale] = await Promise.all([getSession(), getLocale()]);
  if (!session) {
    return <LoginGate variant="reservation" />;
  }
  const en = locale === 'en';

  const { id } = await params;
  const { betaling } = await searchParams;
  // Ook de aanvragen van je eigen post, zodat je ziet wat er al geregeld is.
  // Alleen lezen: aanpassen en annuleren blijft aan de aanvrager zelf.
  const postIds = session.groups.filter((group) => group.type === 'PRAESIDIUM').map((g) => g.id);
  let reservation = await reservationForMember(id, session.user.id, postIds);
  if (!reservation) notFound();
  const isOwner = reservation.user.id === session.user.id;

  // Terug van de checkout: haal de status meteen bij de provider op, want in
  // dev bereikt de webhook localhost niet en ook live kan hij nog onderweg zijn.
  if (betaling && reservation.payments.some((payment) => payment.status === 'PENDING')) {
    if ((await reconcilePayments(reservation.payments)) > 0) {
      reservation = (await reservationForMember(id, session.user.id, postIds))!;
    }
  }

  const paid = hasSucceededPayment(reservation.payments) || reservation.paidOfflineAt !== null;
  const cancellable =
    isOwner && (reservation.status === 'REQUESTED' || reservation.status === 'APPROVED') && !paid;
  const editable = isOwner && reservation.status === 'REQUESTED';
  // Een aanvraag is materiaal- of flesserke-type; de juiste editor volgt daaruit.
  const isFlesserke = reservation.flesserkeLines.length > 0 && reservation.lines.length === 0;

  const requesterLabel =
    reservation.requesterType === 'INTERN'
      ? reservation.group
        ? locale === 'en'
          ? reservation.group.nameEn
          : reservation.group.nameNl
        : requesterTypeLabel('INTERN', locale)
      : (reservation.requesterName ?? requesterTypeLabel(reservation.requesterType, locale));

  const [catalog, flesserkeCatalog, settings] = editable
    ? await Promise.all([
        isFlesserke ? Promise.resolve([]) : getCatalog(),
        isFlesserke ? getFlesserkeCatalog() : Promise.resolve([]),
        getLogistiekSettings(),
      ])
    : [[], [], { showRentPrices: false, lastMinuteDays: DEFAULT_LAST_MINUTE_DAYS }];

  return (
    <PageShell
      kicker={
        <Link href="/reservaties" className="hover:underline">
          ← {en ? 'My reservations' : 'Mijn reservaties'}
        </Link>
      }
      title={reservation.eventName}
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">{en ? 'Request' : 'Aanvraag'}</h2>
            <ReservationStatusBadge status={reservation.status} locale={locale} />
          </div>

          <dl className="mt-4 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">{en ? 'On behalf of' : 'Namens'}</dt>
              <dd className="text-right font-medium text-vtk-ink">{requesterLabel}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">{en ? 'Type' : 'Type'}</dt>
              <dd className="text-right font-medium text-vtk-ink">
                {requesterTypeLabel(reservation.requesterType, locale)}
              </dd>
            </div>
            {reservation.eventLocation ? (
              <div className="flex justify-between gap-4">
                <dt className="text-vtk-muted">{en ? 'Location' : 'Locatie'}</dt>
                <dd className="text-right font-medium text-vtk-ink">{reservation.eventLocation}</dd>
              </div>
            ) : null}
            {reservation.eventStart ? (
              <div className="flex justify-between gap-4">
                <dt className="text-vtk-muted">{en ? 'Event start' : 'Startuur'}</dt>
                <dd className="text-right font-medium text-vtk-ink">
                  {formatDateTime(reservation.eventStart, locale)}
                </dd>
              </div>
            ) : null}
            {reservation.expectedAttendance != null ? (
              <div className="flex justify-between gap-4">
                <dt className="text-vtk-muted">{en ? 'Expected attendance' : 'Verwachte opkomst'}</dt>
                <dd className="text-right font-medium text-vtk-ink">{reservation.expectedAttendance}</dd>
              </div>
            ) : null}
            {reservation.contactName || reservation.contactPhone ? (
              <div className="flex justify-between gap-4">
                <dt className="text-vtk-muted">{en ? 'Contact' : 'Contact'}</dt>
                <dd className="text-right font-medium text-vtk-ink">
                  {[reservation.contactName, reservation.contactPhone].filter(Boolean).join(' · ')}
                </dd>
              </div>
            ) : null}
            {reservation.delivery ? (
              <div className="flex justify-between gap-4">
                <dt className="text-vtk-muted">{en ? 'Delivery' : 'Levering'}</dt>
                <dd className="text-right font-medium text-vtk-ink">
                  {reservation.deliveryNote || (en ? 'Yes' : 'Ja')}
                </dd>
              </div>
            ) : null}
          </dl>

          {reservation.lines.length > 0 ? (
            <>
              <h3 className="mt-6 text-sm font-semibold text-vtk-ink">{en ? 'Equipment' : 'Materiaal'}</h3>
              <ul className="mt-2 divide-y divide-vtk-navy/10">
                {reservation.lines.map((line) => (
                  <li key={line.id} className="py-2.5">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-vtk-ink">
                        {line.quantity}× {line.itemName}
                      </span>
                      <span className="text-sm text-vtk-muted">
                        {line.unitDepositCents > 0
                          ? `${formatEuro(line.unitDepositCents * line.quantity)} ${en ? 'deposit' : 'waarborg'}`
                          : en ? 'No deposit' : 'Geen waarborg'}
                      </span>
                    </div>
                    {line.note ? (
                      <p className="mt-0.5 text-xs italic text-vtk-body">{line.note}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {reservation.flesserkeLines.length > 0 ? (
            <>
              <h3 className="mt-6 text-sm font-semibold text-vtk-ink">Flesserke</h3>
              <ul className="mt-2 divide-y divide-vtk-navy/10">
                {reservation.flesserkeLines.map((line) => (
                  <li key={line.id} className="py-2.5 text-vtk-ink">
                    {line.quantity}× {line.itemName}
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {reservation.memberNote ? (
            <p className="mt-4 rounded-lg bg-vtk-paper px-4 py-3 text-sm text-vtk-body">
              <span className="font-medium text-vtk-ink">{en ? 'Your note:' : 'Jouw nota:'}</span> {reservation.memberNote}
            </p>
          ) : null}
          {reservation.adminNote ? (
            <p className="mt-3 rounded-lg bg-vtk-paper px-4 py-3 text-sm text-vtk-body">
              <span className="font-medium text-vtk-ink">{en ? 'Note from Logistics:' : 'Nota van Logistiek:'}</span>{' '}
              {reservation.adminNote}
            </p>
          ) : null}

          {editable ? (
            <div className="mt-5 border-t border-vtk-navy/10 pt-4">
              {isFlesserke ? (
                <FlesserkeEditor
                  reservationId={reservation.id}
                  catalog={flesserkeCatalog}
                  groups={requesterOptions(session.groups, locale)}
                  lastMinuteDays={settings.lastMinuteDays}
                  locale={locale}
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
                      notifyEmail: reservation.notifyEmail ?? '',
                      delivery: reservation.delivery,
                      deliveryNote: reservation.deliveryNote ?? '',
                    },
                    pickupDate: toDateInputValue(reservation.pickupDate),
                    returnDate: toDateInputValue(reservation.returnDate),
                    pickupPart: reservation.pickupPart ?? '',
                    note: reservation.memberNote ?? '',
                    quantities: Object.fromEntries(
                      reservation.flesserkeLines.map((l) => [l.flesserkeItemId, l.quantity])
                    ),
                  }}
                />
              ) : (
                <ReservationEditor
                  reservationId={reservation.id}
                  catalog={catalog}
                  groups={requesterOptions(session.groups, locale)}
                  lastMinuteDays={settings.lastMinuteDays}
                  locale={locale}
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
                      notifyEmail: reservation.notifyEmail ?? '',
                      delivery: reservation.delivery,
                      deliveryNote: reservation.deliveryNote ?? '',
                    },
                    pickupDate: toDateInputValue(reservation.pickupDate),
                    returnDate: toDateInputValue(reservation.returnDate),
                    pickupPart: reservation.pickupPart ?? '',
                    note: reservation.memberNote ?? '',
                    quantities: Object.fromEntries(reservation.lines.map((l) => [l.itemId, l.quantity])),
                    lineNotes: Object.fromEntries(
                      reservation.lines.flatMap((l) => (l.note ? [[l.itemId, l.note] as const] : []))
                    ),
                  }}
                />
              )}
            </div>
          ) : null}
        </section>

        <aside className="h-fit rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">{en ? 'Collect' : 'Afhalen'}</dt>
              <dd className="text-right font-medium text-vtk-ink">
                {formatDateWithPart(reservation.pickupDate, reservation.pickupPart, locale)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">{en ? 'Return' : 'Terugbrengen'}</dt>
              <dd className="text-right font-medium text-vtk-ink">
                {formatDateWithPart(reservation.returnDate, reservation.returnPart, locale)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">{en ? 'Deposit' : 'Waarborg'}</dt>
              <dd className="font-medium text-vtk-ink">{formatEuro(reservation.totalDepositCents)}</dd>
            </div>
            {reservation.status !== 'REQUESTED' && reservation.paymentMode ? (
              <div className="flex justify-between gap-4">
                <dt className="text-vtk-muted">{en ? 'Payment' : 'Betaling'}</dt>
                <dd className="text-right font-medium text-vtk-ink">
                  {paid
                    ? en ? 'Paid' : 'Betaald'
                    : reservation.paymentMode === 'ONLINE'
                      ? en ? 'Online, still to pay' : 'Online, nog te betalen'
                      : en ? 'On collection' : 'Bij afhaling'}
                </dd>
              </div>
            ) : null}
            {reservation.depositReturnedAt ? (
              <div className="flex justify-between gap-4">
                <dt className="text-vtk-muted">{en ? 'Deposit returned' : 'Waarborg terug'}</dt>
                <dd className="font-medium text-vtk-ink">{en ? 'Yes' : 'Ja'}</dd>
              </div>
            ) : null}
          </dl>

          {reservation.status === 'REQUESTED' && isOwner ? (
            <p className="mt-4 text-sm leading-6 text-vtk-muted">
              {en
                ? 'The Logistics team is reviewing your request. You will see here as soon as it is decided.'
                : 'Het team van Logistiek bekijkt je aanvraag. Je ziet hier meteen wanneer ze beslist is.'}
            </p>
          ) : null}

          {/* Een aanvraag van een collega uit je post: zichtbaar zodat je weet
              wat er al geregeld is, maar niet van jou om aan te passen. */}
          {!isOwner ? (
            <p className="mt-4 rounded-lg border border-vtk-navy/10 bg-vtk-paper px-3 py-2 text-sm leading-6 text-vtk-body">
              {en
                ? `Requested by ${reservation.user.name} for your post. You can see it; changing or cancelling stays with the requester.`
                : `Aangevraagd door ${reservation.user.name} voor jouw post. Je kan ze bekijken; aanpassen of annuleren blijft bij de aanvrager.`}
            </p>
          ) : null}

          {betaling && paid ? (
            <p className="mt-4 rounded-lg border border-vtk-yellow-dark/40 bg-vtk-yellow/20 px-3 py-2 text-sm font-medium text-vtk-ink">
              {en ? 'Your payment succeeded. See you at collection!' : 'Je betaling is gelukt. Tot bij de afhaling!'}
            </p>
          ) : null}

          {isOwner &&
          reservation.status === 'APPROVED' &&
          reservation.paymentMode === 'ONLINE' &&
          !paid &&
          reservation.totalPriceCents > 0 ? (
            <div className="mt-5 border-t border-vtk-navy/10 pt-4">
              <PayButton
                target="reservation"
                id={reservation.id}
                amountLabel={formatEuro(reservation.totalPriceCents)}
                locale={locale}
              />
            </div>
          ) : null}

          {cancellable ? (
            <div className="mt-5 border-t border-vtk-navy/10 pt-4">
              <CancelButton
                label={en ? 'Cancel reservation' : 'Reservatie annuleren'}
                dialogTitle={en ? 'Cancel reservation?' : 'Reservatie annuleren?'}
                dialogDescription={
                  en
                    ? 'Your request lapses and the equipment becomes available to others again. This cannot be undone; you can always submit a new request.'
                    : 'Je aanvraag vervalt en het materiaal komt weer vrij voor anderen. Dit kan je niet ongedaan maken; een nieuwe aanvraag indienen kan altijd.'
                }
                action={cancelReservationAction.bind(null, reservation.id)}
                locale={locale}
              />
            </div>
          ) : null}
        </aside>
      </div>
    </PageShell>
  );
}
