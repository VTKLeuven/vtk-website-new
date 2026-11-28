import type { ReactNode } from 'react';
import Link from '@vtk/ui/link';
import { AuditTimeline } from '@/components/audit-timeline';
import { EventLink } from '@/components/event-link';
import { LinkedText } from '@/components/linked-text';
import { LogisticsIcon } from '@/components/logistics-icon';
import { PhoneLink } from '@/components/phone-link';
import { VanStatusBadge } from '@/components/status-badge';
import { TripHelpers } from '@/components/trip-helpers';
import { TripShift } from '@/components/trip-shift';
import type { TripShiftView } from '@/lib/uitleen-server/bijrijdshift';
import { withoutRequester, type TripPostMembers } from '@/lib/trip-post-members';
import {
  canDeleteTransport,
  chargesRequester,
  eventOptions,
  formatPriceCents,
  requesterLabel,
  toDatetimeLocalValue,
  transportDeleteDescription,
  tripTitle,
} from '@/lib/uitleen';
import {
  activeGroups,
  adminTransportDetail,
  adminVehicles,
  approvedSameDay,
  driverOptions,
  hasSucceededPayment,
  postMembersWithPhones,
  selectableEvents,
  teamEditsForTransport,
  transportAuditLogsByBooking,
  tripShifts,
} from '@/lib/uitleen-server';

const SHIFT_URL = `${process.env.VTK_MAIN_URL || 'https://vtk.be'}/shift`;
import { PanelEscape } from './panel-escape';
import { TransportControls } from './transport-controls';
import { TransportDecisionForms } from './transport-decision-forms';
import { TransportDeleteButton } from './transport-delete';
import { TransportUndoButtons } from './transport-undo';
import { dateLabel, hoursLabel } from './trip-format';

/**
 * Het paneel van één rit: de feiten, de beslissing of het beheer, de historiek
 * (P1, M1 uit de audit van november 2026).
 *
 * Er staat er hoogstens één open, gekozen met `?rit=<id>`, en enkel dat ene
 * paneel haalt de chauffeurs, voertuigen, posten en evenementen op. Voordien
 * rendeerde de lijst dit paneel voor élke rit, twee keer (kaarten en tabel),
 * met al die keuzelijsten erin: 344 kB HTML voor elf ritten.
 *
 * Op een telefoon is het een blad dat onderaan over de lijst ligt, met een waas
 * erachter die sluit bij een tik; op een breed scherm staat het onder de rij
 * waarop je klikte.
 */
export async function TripPanel({ id, closeHref }: { id: string; closeHref: string }) {
  const group = await adminTransportDetail(id);
  const selected = group?.find((leg) => leg.id === id);
  if (!group || !selected) {
    return (
      <PanelShell title="Rit niet gevonden" closeHref={closeHref}>
        <p className="text-sm text-vtk-muted">Deze rit bestaat niet (meer). Misschien werd ze net verwijderd.</p>
      </PanelShell>
    );
  }

  // Een heen-en-terugaanvraag wordt in één keer beslist, dus staan beide helften
  // in het paneel. Eens beslist is elke helft een eigen rit met een eigen
  // chauffeur, en dan toont het paneel enkel de gekozen helft.
  const legs = selected.status === 'REQUESTED' ? group.filter((leg) => leg.status === 'REQUESTED') : [selected];
  const [first] = legs;
  const ids = legs.map((leg) => leg.id);
  const [drivers, vehicles, groups, events, auditLogs, teamEdits, sameDay, postMembers, shifts] = await Promise.all([
    driverOptions(),
    adminVehicles(),
    activeGroups(),
    selectableEvents(),
    transportAuditLogsByBooking(ids),
    teamEditsForTransport(legs.map((leg) => ({ id: leg.id, userId: leg.userId }))),
    first.status === 'REQUESTED' ? approvedSameDay(first.vehicleId, first.startAt, ids) : Promise.resolve([]),
    // Beide helften rijden voor dezelfde post; welke helft geen bijrijder heeft,
    // beslist `TripHelpers` zelf.
    postMembersWithPhones([first.groupId]),
    tripShifts(ids),
  ]);
  const postContacts: TripPostMembers | null =
    first.groupId && first.group
      ? withoutRequester(first.group.nameNl, postMembers.get(first.groupId), first.userId)
      : null;
  const eventChoices = eventOptions(events);
  const vehicle = vehicles.find((entry) => entry.id === first.vehicleId);
  // Heen en terug gaan samen weg, dus telt de hele groep (R1).
  const deletable = group.every(canDeleteTransport);
  const changes = [...new Set(legs.flatMap((leg) => teamEdits.get(leg.id) ?? []))];

  return (
    <PanelShell
      title={tripTitle(first)}
      subtitle={`${requesterLabel(first)} · ${first.user.name}`}
      status={<VanStatusBadge status={first.status} />}
      closeHref={closeHref}
    >
      {legs.map((leg) => (
        <LegFacts
          key={leg.id}
          leg={leg}
          showLegLabel={legs.length > 1}
          driverPhone={leg.driverId ? (drivers.find((driver) => driver.id === leg.driverId)?.phone ?? null) : null}
          eventChoices={eventChoices}
          postMembers={postContacts}
          shifts={shifts.get(leg.id) ?? []}
        />
      ))}

      {changes.length > 0 ? (
        <div className="rounded-[12px] bg-vtk-yellow/15 px-3 py-2 text-sm">
          <p className="font-semibold text-vtk-ink">Logistiek paste de aanvraag aan</p>
          <ul className="mt-1 list-disc pl-5 text-vtk-body">
            {changes.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {first.status === 'REQUESTED' ? (
        <TransportDecisionForms
          bookingId={first.id}
          legs={legs.map((leg) => ({
            id: leg.id,
            startAt: toDatetimeLocalValue(leg.startAt),
            endAt: toDatetimeLocalValue(leg.endAt),
            // Waarom deze rit apart staat: heen/terug of een tweede voertuig.
            label:
              legs.length > 1
                ? [
                    leg.tripLeg === 'TERUG' ? 'Terugrit' : leg.tripLeg === 'HEEN' ? 'Heenrit' : null,
                    new Set(legs.map((other) => other.vehicleId)).size > 1 ? leg.vehicle.nameNl : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'Rit'
                : null,
          }))}
          drivers={drivers}
          pricingIsPerKm={first.pricingMode === 'PER_KM'}
          requesterType={first.requesterType}
          needsDriver={first.vehicle.needsDriver}
          needsVanDriver={vehicle?.needsVanDriver ?? false}
          sameDayBookings={sameDay.map((other) => `${hoursLabel(other)} · ${tripTitle(other)}`)}
        />
      ) : null}

      {first.status === 'APPROVED'
        ? legs.map((leg) => (
            <TransportControls
              key={leg.id}
              bookingId={leg.id}
              vehicleId={leg.vehicleId}
              driverId={leg.driverId}
              driver={leg.driver}
              pricingMode={leg.pricingMode}
              paid={hasSucceededPayment(leg.payments) || leg.paidOfflineAt !== null}
              requesterType={leg.requesterType}
              drivers={drivers}
              vehicles={vehicles
                .filter((entry) => entry.active)
                .map((entry) => ({
                  id: entry.id,
                  name: entry.nameNl,
                  needsVanDriver: entry.needsVanDriver,
                  needsDriver: entry.needsDriver,
                }))}
              groups={groups.map((group) => ({ id: group.id, name: group.nameNl }))}
              assignedGroupId={leg.assignedGroupId}
            />
          ))
        : null}

      <TransportUndoButtons
        bookingId={first.id}
        status={first.status}
        paidOffline={first.paidOfflineAt !== null}
        paidOnline={hasSucceededPayment(first.payments)}
      />

      <AuditTimeline entries={legs.flatMap((leg) => auditLogs.get(leg.id) ?? [])} />

      {/* Verwijderen helemaal onderaan en los van de beslissing (V3): afwijzen is
          routine, verwijderen de ene onomkeerbare actie. Naast elkaar riepen ze
          allebei even hard. */}
      {deletable ? (
        <TransportDeleteButton
          bookingId={first.id}
          title={tripTitle(first)}
          count={group.length}
          description={transportDeleteDescription(group)}
        />
      ) : null}
    </PanelShell>
  );
}

type DetailLeg = NonNullable<Awaited<ReturnType<typeof adminTransportDetail>>>[number];

/** De feiten van één helft: uren, voertuig, nummers, lading, nota's, evenement. */
function LegFacts({
  leg,
  showLegLabel,
  driverPhone,
  eventChoices,
  postMembers,
  shifts,
}: {
  leg: DetailLeg;
  showLegLabel: boolean;
  driverPhone: string | null;
  eventChoices: ReturnType<typeof eventOptions>;
  postMembers: TripPostMembers | null;
  shifts: TripShiftView[];
}) {
  const lines: Array<[string, ReactNode]> = [
    ['Wanneer', `${dateLabel(leg.startAt)} · ${hoursLabel(leg)}`],
    ['Voertuig', leg.vehicle.nameNl],
    [
      'Chauffeur',
      leg.driver?.name ?? (leg.vehicle.needsDriver ? <strong key="none">nog geen</strong> : 'niet nodig'),
    ],
  ];
  // R4: enkel externen betalen; prijs en betaalstatus staan nergens bij een
  // interne aanvraag.
  if (chargesRequester(leg.requesterType)) {
    lines.push(['Prijs', formatPriceCents(leg.priceCents)]);
    if (leg.paymentMode) {
      const paid = hasSucceededPayment(leg.payments) || leg.paidOfflineAt !== null;
      lines.push(['Betaald', paid ? 'ja' : 'nog niet']);
    }
  }
  if (leg.reservation) {
    lines.push([
      'Levering voor',
      <Link
        key="reservation"
        href={`/beheer/aanvragen/${leg.reservation.id}`}
        className="font-medium text-vtk-navy underline underline-offset-2"
      >
        {leg.reservation.eventName}
      </Link>,
    ]);
  }
  if (leg.cargoNote) lines.push(['Lading', <LinkedText key="cargo" text={leg.cargoNote} />]);
  if (leg.pickupAddress) lines.push(['Laadadres', leg.pickupAddress]);
  if (leg.destination) lines.push(['Bestemming', leg.destination]);
  // Bellen is bellen: de nummers staan bij elkaar, ook dat van de chauffeur.
  if (driverPhone) lines.push(['Chauffeur bellen', <PhoneLink key="driverphone" number={driverPhone} />]);
  if (leg.contactPhone) lines.push(['Aanvrager bellen', <PhoneLink key="contact" number={leg.contactPhone} />]);
  if (leg.helpersPhone) lines.push(['Bijrijder bellen', <PhoneLink key="helpersphone" number={leg.helpersPhone} />]);
  if (leg.memberNote) lines.push(['Nota van het lid', leg.memberNote]);
  if (leg.adminNote) lines.push(['Nota van Logistiek', leg.adminNote]);
  if (leg.kilometers !== null) lines.push(['Gereden', `${leg.kilometers} km`]);
  lines.push([
    'Hoort bij evenement',
    <EventLink
      key="event"
      target={{ kind: 'transport', id: leg.id }}
      events={eventChoices}
      current={leg.event}
      looseName={leg.event ? null : leg.eventName}
      showLabel={false}
    />,
  ]);

  return (
    <section className="rounded-[14px] bg-vtk-paper px-4 py-3">
      {showLegLabel ? (
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-vtk-muted">
          {leg.tripLeg === 'TERUG' ? 'Terugrit' : leg.tripLeg === 'HEEN' ? 'Heenrit' : leg.vehicle.nameNl}
        </p>
      ) : null}
      <p className="whitespace-pre-line text-sm text-vtk-ink">{leg.purpose}</p>
      <dl className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {lines.map(([term, value], index) => (
          <div key={`${term}-${index}`} className="flex gap-2">
            <dt className="shrink-0 text-vtk-muted">{term}</dt>
            <dd className="min-w-0 text-vtk-body">{value}</dd>
          </div>
        ))}
      </dl>
      {/* Als eigen blok en niet als regel in de lijst: het blok draagt zijn eigen
          kop, en als regel stond "Bijrijders" er twee keer (M1). */}
      <div className="mt-3">
        <TripHelpers
          bookingId={leg.id}
          helpers={leg.helpers}
          legacyNote={leg.helpersNote}
          canEdit={leg.status === 'REQUESTED' || leg.status === 'APPROVED'}
          postMembers={postMembers}
        />
      </div>
      {/* Het team mag op elke rit een bijrijdshift zetten. */}
      <div className="mt-3 empty:hidden">
        <TripShift
          bookingId={leg.id}
          trip={{ status: leg.status, startAt: leg.startAt.toISOString(), endAt: leg.endAt.toISOString() }}
          shifts={shifts}
          canCreate
          groupName={leg.group?.nameNl ?? null}
          shiftUrl={SHIFT_URL}
        />
      </div>
    </section>
  );
}

function PanelShell({
  title,
  subtitle,
  status,
  closeHref,
  children,
}: {
  title: string;
  subtitle?: string;
  status?: ReactNode;
  closeHref: string;
  children: ReactNode;
}) {
  return (
    <>
      {/* Op een telefoon dekt het blad de lijst half toe; een tik ernaast sluit. */}
      <Link
        href={closeHref}
        scroll={false}
        aria-hidden
        tabIndex={-1}
        className="fixed inset-0 z-40 bg-vtk-scrim/50 md:hidden"
      />
      <section
        aria-label={`Rit: ${title}`}
        className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-4 shadow-sm max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-50 max-md:max-h-[85dvh] max-md:overflow-y-auto max-md:rounded-b-none max-md:shadow-2xl md:my-3"
      >
        <PanelEscape closeHref={closeHref} />
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-vtk-ink">{title}</h3>
            {subtitle ? <p className="text-sm text-vtk-muted">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {status}
            <Link
              href={closeHref}
              scroll={false}
              title="Sluiten (Esc)"
              className="grid h-8 w-8 place-items-center rounded-full border border-vtk-navy/15 text-vtk-ink transition hover:border-vtk-navy/40"
            >
              <LogisticsIcon name="close" className="h-4 w-4" />
              <span className="sr-only">Sluiten</span>
            </Link>
          </div>
        </header>
        <div className="mt-3 grid gap-3">{children}</div>
      </section>
    </>
  );
}
