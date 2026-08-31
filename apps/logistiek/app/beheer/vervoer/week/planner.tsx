'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarNav,
  TransportCalendar,
} from '@/components/transport-calendar/transport-calendar';
import { TransportFilterBar } from '@/components/transport-calendar/filters';
import { TripInspector } from '@/components/transport-calendar/trip-inspector';
import type { CalendarVehicle, TripBlock } from '@/components/transport-calendar/types';
import type { CalendarView } from '@/lib/calendar-range';
import type { DriverColorOverrides } from '@/lib/driver-colors';
import type { TransportFilters } from '@/lib/transport-filters';
import { AuditTimeline } from '@/components/audit-timeline';
import { PhoneLink } from '@/components/phone-link';
import { VanStatusBadge } from '@/components/status-badge';
import type { UitleenAuditEntry, DriverOption } from '@/lib/uitleen-server';
import { TransportControls } from '../transport-controls';
import { TransportDecisionForms, type DecisionLeg } from '../transport-decision-forms';
import { TripEditForm, type TripEditValues } from './trip-edit-form';
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
  const [openId, setOpenId] = useState<string | null>(null);
  const trip = trips.find((entry) => entry.id === openId) ?? null;

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
        onSelect={setOpenId}
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
          </>
        }
      >
        {/* Wat er niet staat, zodat een gefilterde week niet als een lege week
            leest. Dezelfde regel als op /beheer/kalender. */}
        {hiddenNote.length > 0 ? (
          <p className="text-xs font-medium text-vtk-navy">Gefilterd: {hiddenNote.join('; ')}.</p>
        ) : null}

        <p className="text-xs text-vtk-muted">
          De vulkleur is de chauffeur, de arcering is het voertuig; een rit zonder chauffeur is geel
          met een rode streepjesrand. Kleuren stel je in bij Chauffeurs, arceringen bij
          Instellingen. Gestreept = nog te beslissen, doorzichtig = afgerond, volle rode rand = twee
          goedgekeurde ritten met hetzelfde voertuig op hetzelfde moment. Klik een rit aan om ze te
          beslissen of aan te passen.
        </p>

        {trip ? (
          <TripInspector
            title={trip.eventName?.trim() || trip.purpose}
            subtitle={
              <>
                {trip.requesterLabel} · {trip.userName}
              </>
            }
            onClose={() => setOpenId(null)}
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
                {trip.helpersNote ? (
                  <div>
                    <dt>Bijrijders</dt>
                    <dd>{trip.helpersNote}</dd>
                  </div>
                ) : null}
                {trip.helpersPhone ? (
                  <div>
                    <dt>Bijrijder bellen</dt>
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
