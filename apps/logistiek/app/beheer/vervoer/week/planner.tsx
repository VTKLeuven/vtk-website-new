'use client';

import { useCallback, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarNav,
  TransportCalendar,
} from '@/components/transport-calendar/transport-calendar';
import { TransportFilterBar } from '@/components/transport-calendar/filters';
import { TripInspector } from '@/components/transport-calendar/trip-inspector';
import type {
  AvailabilityBand,
  CalendarVehicle,
  TripBlock,
} from '@/components/transport-calendar/types';
import type { CalendarView } from '@/lib/calendar-range';
import type { DriverColorOverrides } from '@/lib/driver-colors';
import type { TransportFilters } from '@/lib/transport-filters';
import { AuditTimeline } from '@/components/audit-timeline';
import { PhoneLink } from '@/components/phone-link';
import { TripHelpers } from '@/components/trip-helpers';
import { VanStatusBadge } from '@/components/status-badge';
import type { UitleenAuditEntry, DriverOption } from '@/lib/uitleen-server';
import { TransportControls } from '../transport-controls';
import { TransportDecisionForms, type DecisionLeg } from '../transport-decision-forms';
import { TripEditForm, type TripEditValues } from './trip-edit-form';
import { NewTripForm, type NewTripValues } from './new-trip-form';
import { EventEditForm, type PlannerEvent } from './event-edit-form';
import type { CalendarEventBar } from '@/components/transport-calendar/event-bars';
import { adminEditTransportAction } from '@/app/actions/beheer';
import { useToast } from '@/components/ui/toast';
import { toDatetimeLocalValue } from '@/lib/uitleen';
import type {
  UitleenPricingMode,
  UitleenRequesterType,
  UitleenTransportBookingStatus,
} from '@prisma/client';

/**
 * De transportplanning waarop de verantwoordelijke werkt (T7, P1, P4).
 *
 * Een rit aanklikken opent een paneel naast de kalender met **alles** over die
 * rit, en met de knoppen die erbij horen: beslissen zolang ze te beslissen is,
 * daarna de uren, de lading en de nota's aanpassen, en de chauffeur en het
 * voertuig kiezen.
 *
 * Twee dingen die daar bewust níét staan:
 *
 * - **"Rit afronden".** Je klikt hier de hele dag ritten aan om te schuiven; een
 *   knop die de rit definitief afsluit, is dan één misklik van je verwijderd.
 *   Afronden hoort bij `/beheer/vervoer`, waar je er bewust naartoe gaat.
 * - **Verwijderen.** Een rit gaat niet weg, ze wordt afgewezen of geannuleerd,
 *   en dat blijft in de historiek staan.
 */
export type PlannerTrip = {
  id: string;
  purpose: string;
  cargoNote: string | null;
  eventName: string | null;
  eventId: string | null;
  reservationId: string | null;
  requesterLabel: string;
  userName: string;
  contactPhone: string | null;
  pickupAddress: string | null;
  destination: string | null;
  helpers: Array<{ id: string; name: string; phone: string | null }>;
  helpersNote: string | null;
  helpersPhone: string | null;
  memberNote: string | null;
  adminNote: string | null;
  notifyEmail: string | null;
  startAt: string;
  endAt: string;
  /** Begin en einde als datetime-local-waarden, voor het bewerkformulier. */
  edit: TripEditValues;
  status: UitleenTransportBookingStatus;
  vehicleId: string;
  vehicleName: string;
  driverId: string | null;
  driver: { id: string; name: string } | null;
  pricingMode: UitleenPricingMode;
  requesterType: UitleenRequesterType;
  priceLabel: string | null;
  needsDriver: boolean;
  needsVanDriver: boolean;
  paid: boolean;
  /** De ritten van dezelfde aanvraag, voor het goedkeurformulier. */
  legs: DecisionLeg[];
  sameDayBookings: string[];
  history: UitleenAuditEntry[];
};

export function TransportPlanner({
  view,
  anchor,
  days,
  vehicles,
  blocks,
  trips,
  drivers,
  vehicleOptions,
  groups,
  events,
  availability,
  driverColors,
  filters,
  hiddenNote,
  nav,
}: {
  view: CalendarView;
  anchor: string;
  days: string[];
  vehicles: CalendarVehicle[];
  blocks: TripBlock[];
  trips: PlannerTrip[];
  drivers: DriverOption[];
  vehicleOptions: Array<{ id: string; name: string; needsVanDriver: boolean }>;
  /** Posten en werkgroepen waarvoor het team zelf een rit kan inplannen. */
  groups: Array<{ id: string; name: string }>;
  /** De evenementen boven het rooster, met wat het paneel nodig heeft (P5). */
  events: PlannerEvent[];
  /** Wanneer de chauffeurs kunnen rijden (V1); leeg wanneer de filter uitstaat. */
  availability: AvailabilityBand[];
  driverColors?: DriverColorOverrides;
  filters: TransportFilters;
  /** Wat er door de filters niet getoond wordt, in woorden. */
  hiddenNote: string[];
  nav: {
    previousHref: string;
    nextHref: string;
    todayHref: string;
    isToday: boolean;
    label: string;
  };
}) {
  const router = useRouter();
  const showToast = useToast();
  const [, startTransition] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  /** De rit die je aan het intekenen bent, met de uren die je sleepte. */
  const [draft, setDraft] = useState<NewTripValues | null>(null);
  const [openEventId, setOpenEventId] = useState<string | null>(null);
  const trip = trips.find((entry) => entry.id === openId) ?? null;
  const openEvent = events.find((entry) => entry.id === openEventId) ?? null;

  const eventBars: CalendarEventBar[] | undefined = filters.showEvents
    ? events.map((event) => ({
        id: event.id,
        name: event.name,
        location: event.location,
        startAt: event.startAt,
        endAt: event.endAt,
        timeKnown: event.timeKnown,
        groupName: event.groupName,
        requestCount: event.requestCount,
        tripCount: event.tripCount,
      }))
    : undefined;

  /**
   * Een rit verslepen of rekken in de kalender.
   *
   * Dezelfde actie als het formulier in het paneel, met dezelfde
   * overlapcontrole: slepen is een snellere manier om uren te wijzigen, geen
   * tweede manier met andere regels. Botst het, dan zegt de melding waarmee, en
   * zet het herladen de rit terug waar ze stond.
   */
  const moveBlock = useCallback(
    (blockId: string, startAt: Date, endAt: Date) => {
      const target = trips.find((entry) => entry.id === blockId);
      if (!target) return;
      startTransition(async () => {
        const result = await adminEditTransportAction(blockId, {
          ...target.edit,
          startAt: toDatetimeLocalValue(startAt),
          endAt: toDatetimeLocalValue(endAt),
        });
        if (result.ok) {
          showToast({ message: result.message ?? 'Rit verplaatst.', variant: 'success' });
        } else {
          showToast({ message: result.error, variant: 'error', duration: 0 });
        }
        router.refresh();
      });
    },
    [router, showToast, trips]
  );

  const createRange = useCallback(
    (startAt: Date, endAt: Date) => {
      setOpenId(null);
      setDraft({
        startAt: toDatetimeLocalValue(startAt),
        endAt: toDatetimeLocalValue(endAt),
        vehicleId: vehicleOptions[0]?.id ?? '',
        groupId: '',
        driverId: '',
        purpose: '',
        cargoNote: '',
        pickupAddress: '',
        destination: '',
      });
    },
    [vehicleOptions]
  );

  return (
    <>
      <TransportCalendar
        view={view}
        anchor={anchor}
        days={days}
        vehicles={vehicles}
        blocks={blocks}
        driverColors={driverColors}
        selectedId={openId}
        onSelect={(id) => {
          setDraft(null);
          setOpenEventId(null);
          setOpenId(id);
        }}
        events={eventBars}
        bands={filters.showAvailability ? availability : undefined}
        selectedEventId={openEventId}
        onSelectEvent={(id) => {
          setDraft(null);
          setOpenId(null);
          setOpenEventId(id);
        }}
        onMoveBlock={moveBlock}
        onCreateRange={createRange}
        emptyLabel={
          (view === 'dag'
            ? 'Geen ritten op deze dag'
            : view === 'maand'
              ? 'Geen ritten deze maand'
              : 'Geen ritten deze week') +
          (hiddenNote.length > 0 ? ` met deze filters (${hiddenNote.join('; ')}).` : '.')
        }
        toolbarExtra={
          <>
            <CalendarNav {...nav} />
            <TransportFilterBar
              filters={filters}
              vehicles={vehicles.map((vehicle) => ({ id: vehicle.id, name: vehicle.name }))}
              drivers={drivers.map((driver) => ({ id: driver.id, name: driver.name }))}
              driverColors={driverColors}
            />
            {/* Ook als knop en niet enkel als sleep: op een touchscreen is
                verticaal vegen scrollen, dus daar valt er niets in te tekenen. */}
            <button
              type="button"
              onClick={() => {
                const start = new Date();
                start.setMinutes(0, 0, 0);
                start.setHours(start.getHours() + 1);
                createRange(start, new Date(start.getTime() + 60 * 60 * 1000));
              }}
              className="rounded-full border border-vtk-navy bg-vtk-navy px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-vtk-ink"
            >
              Nieuwe rit
            </button>
          </>
        }
      >
        {/* Wat er niet staat, zodat een gefilterde week niet als een lege week
            leest. Dezelfde regel als op /beheer/kalender. */}
        {hiddenNote.length > 0 ? (
          <p className="text-xs font-medium text-vtk-navy">Gefilterd: {hiddenNote.join('; ')}.</p>
        ) : null}

        {/* `tg-hint`: in volledig scherm valt deze uitleg weg. Daar wil je zoveel
            mogelijk kalender, en wie fullscreen aanzet, heeft de legende al
            gelezen. */}
        <p className="tg-hint text-xs text-vtk-muted">
          De vulkleur is de chauffeur, de arcering is het voertuig; een rit zonder chauffeur is geel
          met een rode streepjesrand. Kleuren stel je in bij Chauffeurs, arceringen bij
          Instellingen. Gestreept = nog te beslissen, doorzichtig = afgerond, volle rode rand = twee
          goedgekeurde ritten met hetzelfde voertuig op hetzelfde moment. Klik een rit aan om ze te
          beslissen of aan te passen.
        </p>

        {openEvent ? (
          <TripInspector
            title={openEvent.name}
            subtitle={
              openEvent.groupName ? `Evenement · ${openEvent.groupName}` : 'Evenement'
            }
            onClose={() => setOpenEventId(null)}
            anchorId={openEvent.id}
            footer={
              <>
                <Link
                  href={`/beheer/evenementen#${openEvent.id}`}
                  className="font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
                >
                  Alles van dit evenement
                </Link>
                : materiaal, flesserke, transport en de boodschappen naast elkaar.
              </>
            }
          >
            <EventEditForm event={openEvent} onSaved={() => setOpenEventId(null)} />
          </TripInspector>
        ) : null}

        {draft ? (
          <TripInspector
            title="Nieuwe rit"
            subtitle="Wordt meteen ingepland; Logistiek vraagt niets aan zichzelf."
            onClose={() => setDraft(null)}
          >
            <NewTripForm
              initial={draft}
              vehicles={vehicleOptions}
              groups={groups}
              drivers={drivers}
              onDone={() => {
                setDraft(null);
                router.refresh();
              }}
              onCancel={() => setDraft(null)}
            />
          </TripInspector>
        ) : null}

        {trip ? (
          <TripInspector
            title={trip.eventName?.trim() || trip.purpose}
            subtitle={
              <>
                {trip.requesterLabel} · {trip.userName}
              </>
            }
            onClose={() => setOpenId(null)}
            anchorId={trip.id}
            footer={
              <>
                <Link
                  href={`/beheer/vervoer?rit=${trip.id}`}
                  className="font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
                >
                  Deze rit in de lijst
                </Link>
                : daar rond je ze af, draai je een beslissing terug en markeer je een betaling.
              </>
            }
          >
            <div className="grid gap-5">
              <div className="flex flex-wrap items-center gap-2">
                <VanStatusBadge status={trip.status} />
                <span className="rounded-full bg-vtk-paper-2 px-2.5 py-0.5 text-xs font-semibold text-vtk-navy">
                  {trip.vehicleName}
                </span>
                {trip.priceLabel ? (
                  <span className="text-xs text-vtk-muted">
                    {trip.priceLabel} · {trip.paid ? 'betaald' : 'nog niet betaald'}
                  </span>
                ) : null}
              </div>

              {/* De feiten die niet in het formulier staan omdat het lid ze
                  invulde en het team ze niet hoort te overschrijven. */}
              <dl className="logistics-fact-grid">
                {trip.contactPhone ? (
                  <div>
                    <dt>Aanvrager bellen</dt>
                    <dd>
                      <PhoneLink number={trip.contactPhone} />
                    </dd>
                  </div>
                ) : null}
                {trip.helpersPhone ? (
                  <div>
                    <dt>Bijrijder bellen (oud veld)</dt>
                    <dd>
                      <PhoneLink number={trip.helpersPhone} />
                    </dd>
                  </div>
                ) : null}
                {trip.memberNote ? (
                  <div>
                    <dt>Nota van het lid</dt>
                    <dd>{trip.memberNote}</dd>
                  </div>
                ) : null}
                {trip.notifyEmail ? (
                  <div>
                    <dt>Mail ook naar</dt>
                    <dd className="break-all">{trip.notifyEmail}</dd>
                  </div>
                ) : null}
                {trip.reservationId ? (
                  <div>
                    <dt>Levering voor</dt>
                    <dd>
                      <Link
                        href={`/beheer/aanvragen/${trip.reservationId}`}
                        className="underline underline-offset-2"
                      >
                        de materiaalaanvraag
                      </Link>
                    </dd>
                  </div>
                ) : null}
                {trip.eventId ? (
                  <div>
                    <dt>Evenement</dt>
                    <dd>
                      <Link
                        href={`/beheer/evenementen#${trip.eventId}`}
                        className="underline underline-offset-2"
                      >
                        {trip.eventName?.trim() || 'evenement'}
                      </Link>
                    </dd>
                  </div>
                ) : null}
              </dl>

              {/* V2: wie er meerijdt, met een nummer per persoon. Ook hier te
                  wijzigen: de chauffeur belt het team wanneer er onderweg iets
                  verandert. */}
              <TripHelpers
                bookingId={trip.id}
                helpers={trip.helpers}
                legacyNote={trip.helpersNote}
                canEdit={trip.status === 'REQUESTED' || trip.status === 'APPROVED'}
              />

              <section>
                <h3 className="text-sm font-semibold text-vtk-ink">Rit aanpassen</h3>
                <div className="mt-2">
                  <TripEditForm
                    bookingId={trip.id}
                    initial={trip.edit}
                    locked={trip.status !== 'REQUESTED' && trip.status !== 'APPROVED'}
                    onSaved={() => router.refresh()}
                  />
                </div>
              </section>

              <section>
                {trip.status === 'REQUESTED' ? (
                  <TransportDecisionForms
                    bookingId={trip.id}
                    legs={trip.legs}
                    drivers={drivers}
                    pricingIsPerKm={trip.pricingMode === 'PER_KM'}
                    requesterType={trip.requesterType}
                    needsDriver={trip.needsDriver}
                    needsVanDriver={trip.needsVanDriver}
                    sameDayBookings={trip.sameDayBookings}
                  />
                ) : (
                  <TransportControls
                    bookingId={trip.id}
                    vehicleId={trip.vehicleId}
                    driverId={trip.driverId}
                    driver={trip.driver}
                    pricingMode={trip.pricingMode}
                    paid={trip.paid}
                    requesterType={trip.requesterType}
                    drivers={drivers}
                    vehicles={vehicleOptions}
                    showComplete={false}
                  />
                )}
              </section>

              {trip.history.length > 0 ? <AuditTimeline entries={trip.history} /> : null}
            </div>
          </TripInspector>
        ) : null}
      </TransportCalendar>
    </>
  );
}
