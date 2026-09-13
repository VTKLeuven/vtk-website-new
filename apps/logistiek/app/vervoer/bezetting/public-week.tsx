'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { vehiclePatternClass, type DriverColorOverrides } from '@/lib/driver-colors';
import { LogisticsIcon } from '@/components/logistics-icon';
import { TimeGrid } from '@/components/transport-calendar/time-grid';
import { vehicleIcon } from '@/components/transport-calendar/trip-block';
import { TripInspector } from '@/components/transport-calendar/trip-inspector';
import type { CalendarVehicle, TripBlock } from '@/components/transport-calendar/types';
import type { LogistiekLocale } from '@/lib/i18n-shared';
import { TripCard, type BezettingTrip } from './trip-card';

/**
 * Het publieke bezettingsoverzicht (T8): dezelfde weekkalender als het team
 * ziet, zonder de knoppen.
 *
 * Een client-component omdat de nu-lijn het uur van de bezoeker nodig heeft. De
 * server kent dat niet, en het uit een server-render meegeven zou een lijn
 * opleveren die stilstaat op het moment van de laatste build.
 *
 * Met `trips` erbij (enkel voor Logistiek en IT, zie de pagina) worden de
 * blokken aanklikbaar en opent een rit een leeskaart naast zijn blok: post,
 * chauffeur, waarvoor de rit dient, wat er mee moet. Zonder die lijst is de
 * kalender wat ze was, om naar te kijken: `TimeGrid` maakt een blok pas een knop
 * wanneer er een `onSelect` is.
 */
export function PublicWeek({
  days,
  vehicles,
  blocks,
  emptyLabel,
  showDriver,
  driverColors,
  trips,
  locale,
  manage,
}: {
  days: string[];
  vehicles: CalendarVehicle[];
  blocks: TripBlock[];
  emptyLabel: string;
  showDriver: boolean;
  driverColors?: DriverColorOverrides;
  /** De ritdetails; weglaten laat de blokken onklikbaar, zoals zonder login. */
  trips?: BezettingTrip[];
  locale: LogistiekLocale;
  /** Logistiek en IT: zij krijgen de link naar het beheer onder het kaartje. */
  manage: boolean;
}) {
  const [now, setNow] = useState<Date | undefined>(undefined);
  const [openId, setOpenId] = useState<string | null>(null);
  const openTrip = trips?.find((trip) => trip.id === openId) ?? null;
  useEffect(() => {
    setNow(new Date());
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="grid gap-3">
      <TimeGrid
        days={days}
        vehicles={vehicles}
        blocks={blocks}
        emptyLabel={emptyLabel}
        showDriver={showDriver}
        driverColors={driverColors}
        now={now}
        onSelect={trips ? setOpenId : undefined}
        selectedId={openId}
      />
      {openTrip ? (
        <TripInspector
          title={openTrip.title}
          subtitle={openTrip.requester}
          onClose={() => setOpenId(null)}
          anchorId={openTrip.id}
          footer={
            // Enkel voor wie erheen mag: een link die op een 403 uitkomt, is
            // erger dan geen link.
            manage ? (
              <>
                <Link
                  href={`/beheer/vervoer?rit=${openTrip.id}`}
                  className="font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
                >
                  {locale === 'en' ? 'This trip in the admin' : 'Deze rit in het beheer'}
                </Link>
                {locale === 'en'
                  ? ': that is where you decide, assign a driver and complete it.'
                  : ': daar beslis je, wijs je een chauffeur toe en rond je ze af.'}
              </>
            ) : undefined
          }
        >
          <TripCard trip={openTrip} locale={locale} manage={manage} />
        </TripInspector>
      ) : null}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-vtk-muted">
        {vehicles.map((vehicle) => (
          <li key={vehicle.id} className="flex items-center gap-1.5">
            {/* Enkel wanneer er een arcering ingesteld is: een leeg vierkantje
                naast elk voertuig leest als een uitgevinkt selectievakje. */}
            {vehiclePatternClass(vehicle.pattern) ? (
              <span
                aria-hidden
                className={`h-3.5 w-3.5 shrink-0 rounded-[3px] border border-vtk-navy/20 bg-vtk-paper ${vehiclePatternClass(
                  vehicle.pattern
                )}`}
              />
            ) : null}
            <LogisticsIcon name={vehicleIcon(vehicle.code)} className="h-3.5 w-3.5 shrink-0" />
            {vehicle.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
