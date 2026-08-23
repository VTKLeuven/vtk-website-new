'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  TransportWeekGrid,
  type WeekBlock,
  type WeekVehicle,
} from '@/components/transport-week-grid';
import { TransportControls } from '../transport-controls';
import { TransportDecisionForms, type DecisionLeg } from '../transport-decision-forms';
import type { DriverOption } from '@/lib/uitleen-server';
import type { UitleenPricingMode, UitleenRequesterType } from '@prisma/client';

/**
 * De transportplanning waarop de verantwoordelijke werkt (T7).
 *
 * Klikken op een rit opent een venster met de feiten en de knoppen die erbij
 * horen: goedkeuren of afwijzen zolang ze te beslissen is, daarna de chauffeur,
 * het voertuig en het afronden. Zonder dat venster was elke ingreep een
 * navigatie naar de lijst, zoeken, terugkeren, en het overzicht kwijt.
 */
export type PlannerTrip = {
  id: string;
  purpose: string;
  eventName: string | null;
  requesterLabel: string;
  userName: string;
  contactPhone: string | null;
  pickupAddress: string | null;
  destination: string | null;
  startAt: string;
  endAt: string;
  status: string;
  vehicleId: string;
  driverId: string | null;
  driver: { id: string; name: string } | null;
  pricingMode: UitleenPricingMode;
  requesterType: UitleenRequesterType;
  needsDriver: boolean;
  needsVanDriver: boolean;
  paid: boolean;
  /** De ritten van dezelfde aanvraag, voor het goedkeurformulier. */
  legs: DecisionLeg[];
  sameDayBookings: string[];
};

export function TransportWeekPlanner({
  days,
  vehicles,
  blocks,
  trips,
  drivers,
  vehicleOptions,
}: {
  days: string[];
  vehicles: WeekVehicle[];
  blocks: WeekBlock[];
  trips: PlannerTrip[];
  drivers: DriverOption[];
  vehicleOptions: Array<{ id: string; name: string; needsVanDriver: boolean }>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const trip = trips.find((entry) => entry.id === openId) ?? null;

  useEffect(() => {
    if (!openId) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenId(null);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId]);

  return (
    <>
      <TransportWeekGrid
        days={days}
        vehicles={vehicles}
        blocks={blocks}
        onSelect={setOpenId}
        emptyLabel="Geen ritten deze week."
      />

      {trip ? (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-vtk-ink/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Rit: ${trip.eventName ?? trip.purpose}`}
          onClick={() => setOpenId(null)}
        >
          <div
            className="my-8 w-full max-w-xl rounded-[18px] border border-vtk-navy/15 bg-vtk-surface p-6 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
                  {trip.eventName ?? trip.purpose}
                </h2>
                <p className="text-sm text-vtk-muted">
                  {trip.requesterLabel} · {trip.userName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="rounded-full border border-vtk-navy/15 px-3 py-1 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40"
              >
                Sluiten
              </button>
            </div>

            <dl className="logistics-fact-grid mt-4">
              <div>
                <dt>Waarvoor</dt>
                <dd>{trip.purpose}</dd>
              </div>
              {trip.pickupAddress ? (
                <div>
                  <dt>Laadadres</dt>
                  <dd>{trip.pickupAddress}</dd>
                </div>
              ) : null}
              {trip.destination ? (
                <div>
                  <dt>Bestemming</dt>
                  <dd>{trip.destination}</dd>
                </div>
              ) : null}
              {trip.contactPhone ? (
                <div>
                  <dt>Aanvrager bellen</dt>
                  <dd>
                    <a href={`tel:${trip.contactPhone}`} className="underline underline-offset-2">
                      {trip.contactPhone}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-5">
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
                />
              )}
            </div>

            <p className="mt-4 text-xs text-vtk-muted">
              <Link href="/beheer/vervoer" className="underline underline-offset-2">
                Alles over deze rit in de lijst
              </Link>
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
