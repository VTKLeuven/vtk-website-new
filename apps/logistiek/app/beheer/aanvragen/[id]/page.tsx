import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@vtk/db';
import {
  markDepositReturnedAction,
  markPaidOfflineAction,
  markPickedUpAction,
  reopenReservationAction,
  undoDepositReturnedAction,
  undoPaidOfflineAction,
  undoPickedUpAction,
  undoReturnedAction,
} from '@/app/actions/beheer';
import type { ActionResult } from '@/app/actions/uitleen';
import { requesterOptions } from '@/app/materiaal/event-values';
import { AuditTimeline } from '@/components/audit-timeline';
import { EventLink } from '@/components/event-link';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { ReservationStatusBadge } from '@/components/status-badge';
import { requireManage } from '@/lib/session';
import {
  chargesRequester,
  DEFAULT_LAST_MINUTE_DAYS,
  formatDateOnly,
  formatDateTime,
  formatDateWithPart,
  formatEuro,
  eventOptions,
  itemLocation,
  REQUESTER_TYPE_LABELS,
  toDateInputValue,
  toDatetimeLocalValue,
  tripWindowFor,
} from '@/lib/uitleen';
import {
  activeGroups,
  adminReservation,
  adminVehicles,
  reservationConflicts,
  selectableEvents,
  getCatalog,
  getFlesserkeCatalog,
  getLogistiekSettings,
  hasSucceededPayment,
  reservedQuantities,
} from '@/lib/uitleen-server';
import { AdminFlesserkeEditor } from './admin-flesserke-form';
import { AdminReservationEditor } from './admin-edit-form';
import { DecisionForms } from './decision-forms';
import { ConflictPanel, type ConflictParty } from './conflict-panel';
import { LineDecisions } from './line-decisions';
import { PrepareList } from './prepare-list';
import { DeliveryPanel } from './delivery-panel';
import { SaveTemplateForm } from './save-template-form';
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

  // Een conflict is enkel nieuws zolang de aanvraag nog beslist moet worden: bij
  // een goedgekeurde aanvraag is de voorraad al voor haar gereserveerd.
  const conflicts =
    reservation.status === 'REQUESTED' ? await reservationConflicts(reservation.id) : [];

  const events = await selectableEvents();

  // Enkel bij een gevraagde levering: de voertuigen zijn er alleen om het
  // ritformulier te vullen, en die query is voor elke andere aanvraag verspild.
  const vehicles = reservation.delivery
    ? (await adminVehicles())
        .filter((vehicle) => vehicle.active)
        .map((vehicle) => ({ id: vehicle.id, name: vehicle.nameNl }))
    : [];

  // De rit voorgevuld met wat de aanvraag al weet: heen op de afhaaldag, terug
  // op de terugbrengdag, in het dagdeel dat het lid koos.
  const outbound = tripWindowFor(reservation.pickupDate, reservation.pickupPart);
  const inbound = tripWindowFor(reservation.returnDate, reservation.returnPart);
  const deliveryInitial = {
    startAt: outbound.startAt,
    endAt: outbound.endAt,
    returnStartAt: inbound.startAt,
    returnEndAt: inbound.endAt,
    purpose: `Levering voor ${reservation.eventName}`,
    eventName: reservation.eventName,
    destination: reservation.eventLocation ?? '',
    contactPhone: reservation.contactPhone ?? '',
    notifyEmail: reservation.notifyEmail ?? '',
    note: reservation.deliveryNote ?? '',
  };

  // Een aanvraag is materiaal- of flesserke-type; elk heeft zijn eigen editor,
  // want de lijnen en de voorraadcheck verschillen.
  const isFlesserke = reservation.flesserkeLines.length > 0 && reservation.lines.length === 0;
  const editable = reservation.status === 'REQUESTED' || reservation.status === 'APPROVED';
  const [catalog, flesserkeCatalog, groups, settings] = editable
    ? await Promise.all([
        isFlesserke ? Promise.resolve([]) : getCatalog(),
        isFlesserke ? getFlesserkeCatalog() : Promise.resolve([]),
        activeGroups(),
        getLogistiekSettings(),
      ])
    : [[], [], [], { showRentPrices: false, lastMinuteDays: DEFAULT_LAST_MINUTE_DAYS }];

  // Klaarzetten gebeurt tussen goedkeuring en afhaling. Bij een aanvraag die nog
  // beslist moet worden is er niets om klaar te zetten, en na het terugbrengen is
  // het vinkje geschiedenis.
  const preparable =
    reservation.lines.length > 0 &&
    (reservation.status === 'APPROVED' || reservation.status === 'PICKED_UP');

  // Wat wel en niet toegekend is (M3). Een niet toegekende lijn hoort niet in de
  // klaarzetlijst thuis: ze gaat niet mee.
  const grantedLines = reservation.lines.filter((line) => line.lineStatus !== 'REJECTED');
  const rejectedLines = reservation.lines.filter((line) => line.lineStatus === 'REJECTED');

  const paidOnline = hasSucceededPayment(reservation.payments);
  const paid = paidOnline || reservation.paidOfflineAt !== null;
  const charged = chargesRequester(reservation.requesterType);
  const owesMoney = charged && reservation.totalPriceCents > 0;

  const requesterLabel =
    reservation.requesterType === 'INTERN'
      ? (reservation.group?.nameNl ?? REQUESTER_TYPE_LABELS.INTERN)
      : (reservation.requesterName ?? REQUESTER_TYPE_LABELS[reservation.requesterType]);

  /**
   * Wat er op dit moment terug kan. Eén stap per keer, in de volgorde van de
   * flow. Een geslaagde online betaling staat er niet bij: die draai je terug
   * bij de betaalprovider, niet hier (zie de acties zelf).
   */
  const undoable: Array<{
    label: string;
    success: string;
    description: string;
    action: () => Promise<ActionResult>;
  }> = [];

  if (reservation.status === 'APPROVED' || reservation.status === 'REJECTED') {
    undoable.push({
      label: reservation.status === 'APPROVED' ? 'Goedkeuring terugdraaien' : 'Afwijzing terugdraaien',
      success: 'De aanvraag staat terug op "aangevraagd".',
      description:
        reservation.status === 'APPROVED'
          ? 'De aanvraag gaat terug naar "aangevraagd". Het materiaal komt weer vrij voor anderen in die periode, en de gekozen betaalwijze vervalt. De aanvraag zelf en haar historiek blijven bestaan.'
          : 'De aanvraag gaat terug naar "aangevraagd" en komt weer in de wachtrij te staan. De reden die je meegaf, blijft als nota bewaard.',
      action: reopenReservationAction.bind(null, reservation.id),
    });
  }
  if (reservation.status === 'PICKED_UP') {
    undoable.push({
      label: 'Afhaling terugdraaien',
      success: 'De afhaling is teruggedraaid.',
      description:
        'De aanvraag gaat terug naar "goedgekeurd", alsof het materiaal nog niet opgehaald is. De voorraad verandert niet: goedgekeurd materiaal staat sowieso apart.',
      action: undoPickedUpAction.bind(null, reservation.id),
    });
  }
  if (reservation.status === 'RETURNED') {
    undoable.push({
      label: 'Terugbrengen terugdraaien',
      success: 'Het terugbrengen is teruggedraaid.',
      description:
        'De aanvraag gaat terug naar "afgehaald": het materiaal staat dan weer als uitgeleend. Let op de flesserke: de flessen en blikken die je bij het terugbrengen als verbruikt noteerde, worden weer bij de voorraad opgeteld. Tel dus na of de voorraad nog klopt. Is de periode intussen aan iemand anders toegewezen, dan gaat dit niet door.',
      action: undoReturnedAction.bind(null, reservation.id),
    });
  }
  if (reservation.paidOfflineAt && !paidOnline) {
    undoable.push({
      label: 'Betaling terugdraaien',
      success: 'De aanvraag staat weer als niet betaald.',
      description:
        'De aanvraag staat weer als niet betaald. Dit wist enkel de markering aan de balie; er wordt niets terugbetaald.',
      action: undoPaidOfflineAction.bind(null, reservation.id),
    });
  }
  if (reservation.depositReturnedAt) {
    undoable.push({
      label: 'Waarborg teruggeven terugdraaien',
      success: 'De waarborg staat weer open.',
      description:
        'De waarborg staat weer als niet teruggegeven. Dit wist enkel de markering; er verandert niets aan het geld zelf.',
      action: undoDepositReturnedAction.bind(null, reservation.id),
    });
  }

  /**
   * De partijen in het conflict: deze aanvraag plus elke goedgekeurde aanvraag
   * die hetzelfde item in dezelfde periode vasthoudt. Eén rij per aanvraag, ook
   * wanneer ze op twee items botst; twee keer dezelfde aanvraag met twee
   * schuifformulieren zou twee verschillende antwoorden suggereren.
   */
  const conflictParties: ConflictParty[] = [
    {
      id: reservation.id,
      label: reservation.eventName,
      requester: requesterLabel,
      pickupDate: toDateInputValue(reservation.pickupDate),
      returnDate: toDateInputValue(reservation.returnDate),
      requestedAtLabel: formatDateOnly(reservation.createdAt),
      self: true,
    },
  ];
  for (const conflict of conflicts) {
    for (const clash of conflict.clashes) {
      if (conflictParties.some((party) => party.id === clash.id)) continue;
      conflictParties.push({
        id: clash.id,
        label: clash.eventName,
        requester: clash.requester,
        pickupDate: toDateInputValue(clash.pickupDate),
        returnDate: toDateInputValue(clash.returnDate),
        requestedAtLabel: formatDateOnly(clash.createdAt),
        holding: `houdt ${clash.quantity}× ${conflict.itemName}`,
      });
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
        {/* N2: wie hier via een evenement belandde, wil terug naar dat
            evenement en niet naar de volledige aanvragenlijst. Beide staan er,
            zodat geen van de twee wegen doodloopt. */}
        <p className="flex flex-wrap items-center gap-2 text-sm text-vtk-muted">
          <Link href="/beheer/aanvragen" className="hover:underline">
            ← Aanvragen
          </Link>
          {reservation.event ? (
            <>
              <span aria-hidden="true">·</span>
              <Link
                href={`/beheer/evenementen#${reservation.event.id}`}
                className="hover:underline"
              >
                ← {reservation.event.name}
              </Link>
            </>
          ) : null}
        </p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-vtk-ink">{reservation.eventName}</h2>
            <p className="text-sm text-vtk-muted">
              {reservation.user.name} · {reservation.user.email}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {reservation.lines.length > 0 || reservation.flesserkeLines.length > 0 ? (
              <Link
                href={`/beheer/aanvragen/${reservation.id}/print`}
                className="rounded-full border border-vtk-navy/15 px-3.5 py-1.5 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40"
              >
                Printblad
              </Link>
            ) : null}
            <ReservationStatusBadge status={reservation.status} />
          </div>
        </div>

        <div className="mt-4">
          <EventLink
            target={{ kind: 'reservation', id: reservation.id }}
            events={eventOptions(events)}
            current={reservation.event}
          />
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
            <dd className="font-medium text-vtk-ink">
              {formatDateWithPart(reservation.pickupDate, reservation.pickupPart)}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-vtk-muted">Terugbrengen</dt>
            <dd className="font-medium text-vtk-ink">
              {formatDateWithPart(reservation.returnDate, reservation.returnPart)}
            </dd>
          </div>
          {/* Een post of werkgroep betaalt niet (R4): geen bedragen en geen
              betaalstatus, ook niet in het beheer. Anders staat hier een
              openstaand bedrag dat niemand ooit gaat innen. */}
          {charged && settings.showRentPrices ? (
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">Huurprijs</dt>
              <dd className="font-medium text-vtk-ink">{formatEuro(reservation.totalPriceCents)}</dd>
            </div>
          ) : null}
          {charged ? (
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">Waarborg</dt>
              <dd className="font-medium text-vtk-ink">{formatEuro(reservation.totalDepositCents)}</dd>
            </div>
          ) : null}
          {charged && reservation.paymentMode ? (
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
          {charged && reservation.depositReturnedAt ? (
            <div className="flex justify-between gap-4">
              <dt className="text-vtk-muted">Waarborg terug</dt>
              <dd className="font-medium text-vtk-ink">Ja</dd>
            </div>
          ) : null}
        </dl>

        {/* Zodra er klaargezet kan worden, is de klaarzetlijst hieronder dezelfde
            lijst met vinkjes erbij; ze twee keer tonen leest als twee lijsten. */}
        {reservation.lines.length > 0 && !preparable ? (
          <>
            <h3 className="mt-6 text-sm font-semibold text-vtk-ink">Materiaal</h3>
            {/* Per lijn beslissen en een nota van het team achterlaten (M1, M3).
                Enkel zolang de aanvraag nog loopt: na het terugbrengen is de
                lijst geschiedenis. */}
            <LineDecisions
              lines={reservation.lines.map((line) => ({
                id: line.id,
                itemName: line.itemName,
                quantity: line.quantity,
                note: line.note,
                adminNote: line.adminNote,
                lineStatus: line.lineStatus,
                inCatalogue: line.item.active,
                available: reserved ? line.item.quantity - (reserved.get(line.itemId) ?? 0) : null,
              }))}
            />
          </>
        ) : null}

        {conflicts.length > 0 ? (
          <ConflictPanel
            lines={conflicts.map((conflict) => ({
              itemName: conflict.itemName,
              requested: conflict.requested,
              available: conflict.available,
            }))}
            parties={conflictParties}
          />
        ) : null}

        {/* Klaarzetten hoort bij een aanvraag die goedgekeurd is en nog moet
            vertrekken; daarna is de lijst geschiedenis en staat ze hierboven. */}
        {preparable ? (
          <PrepareList
            lines={grantedLines.map((line) => ({
              id: line.id,
              itemName: line.itemName,
              quantity: line.quantity,
              note: line.note,
              location: itemLocation(line.item),
              preparedLabel: line.preparedAt
                ? `Klaargezet op ${formatDateTime(line.preparedAt)}${
                    line.preparedBy ? ` door ${line.preparedBy.name}` : ''
                  }`
                : null,
            }))}
          />
        ) : null}

        {/* Niet toegekend materiaal blijft staan (E7): apart van wat wél
            meegaat, doorstreept, met de reden erbij en een weg terug. Het uit de
            lijst laten verdwijnen liet de aanvrager achter met een aanvraag
            waarin iets ontbrak zonder dat ergens stond wat, of waarom. */}
        {preparable && rejectedLines.length > 0 ? (
          <>
            <h3 className="mt-6 text-sm font-semibold text-vtk-ink">Niet toegekend</h3>
            <LineDecisions
              lines={rejectedLines.map((line) => ({
                id: line.id,
                itemName: line.itemName,
                quantity: line.quantity,
                note: line.note,
                adminNote: line.adminNote,
                lineStatus: line.lineStatus,
                inCatalogue: line.item.active,
                available: null,
              }))}
            />
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

        {editable && isFlesserke ? (
          <div className="mt-5 border-t border-vtk-navy/10 pt-4">
            <AdminFlesserkeEditor
              reservationId={reservation.id}
              catalog={flesserkeCatalog}
              groups={requesterOptions(groups, 'nl')}
              lastMinuteDays={settings.lastMinuteDays}
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
          </div>
        ) : null}

        {editable && !isFlesserke ? (
          <div className="mt-5 border-t border-vtk-navy/10 pt-4">
            <AdminReservationEditor
              reservationId={reservation.id}
              catalog={catalog}
              groups={requesterOptions(groups, 'nl')}
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
                  notifyEmail: reservation.notifyEmail ?? '',
                  delivery: reservation.delivery,
                  deliveryNote: reservation.deliveryNote ?? '',
                },
                pickupDate: toDateInputValue(reservation.pickupDate),
                returnDate: toDateInputValue(reservation.returnDate),
                pickupPart: reservation.pickupPart ?? '',
                returnPart: reservation.returnPart ?? '',
                note: reservation.memberNote ?? '',
                quantities: Object.fromEntries(reservation.lines.map((l) => [l.itemId, l.quantity])),
                lineNotes: Object.fromEntries(
                  reservation.lines.flatMap((l) => (l.note ? [[l.itemId, l.note] as const] : []))
                ),
                flesserkeQuantities: Object.fromEntries(
                  reservation.flesserkeLines.map((l) => [l.flesserkeItemId, l.quantity])
                ),
              }}
            />
          </div>
        ) : null}

        {/* Deze lijst vaker nodig? Dan is ze een sjabloon. Enkel bij materiaal:
            flesserke is verbruik en verandert per keer. */}
        {reservation.lines.length > 0 ? (
          <div className="mt-5 border-t border-vtk-navy/10 pt-4">
            <SaveTemplateForm reservationId={reservation.id} />
          </div>
        ) : null}
      </section>

      <aside className="grid h-fit gap-4">
        {reservation.status === 'REQUESTED' ? (
          <DecisionForms
            reservationId={reservation.id}
            totalCents={reservation.totalPriceCents}
            charged={charged}
          />
        ) : null}

        {/* Een gevraagde levering stond enkel als regel tussen de gegevens en
            werd nooit een rit; hier schuif je ze door naar vervoer. */}
        {reservation.delivery ? (
          <DeliveryPanel
            reservationId={reservation.id}
            deliveryNote={reservation.deliveryNote}
            trips={reservation.transports}
            vehicles={vehicles}
            initial={deliveryInitial}
          />
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

        {charged &&
        reservation.status === 'RETURNED' &&
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

        {/* Eén stap terug. Staat apart en onderaan: het is de uitzondering, niet
            de gewone weg door de flow. */}
        {undoable.length > 0 ? (
          <div className="grid gap-3 rounded-[14px] border border-dashed border-vtk-navy/25 bg-vtk-paper/60 p-4">
            <p className="text-sm font-semibold text-vtk-ink">Rechtzetten</p>
            {undoable.map((undo) => (
              <ConfirmActionButton
                key={undo.label}
                label={undo.label}
                successMessage={undo.success}
                action={undo.action}
                dialogTitle={undo.label + '?'}
                dialogDescription={undo.description}
              />
            ))}
          </div>
        ) : null}

        <AuditTimeline entries={reservation.auditLogs} />
      </aside>
    </div>
  );
}
