'use client';

import { useEffect, useState } from 'react';
import { vehiclePatternClass, type DriverColorOverrides } from '@/lib/driver-colors';
import { LogisticsIcon } from '@/components/logistics-icon';
import { TimeGrid } from '@/components/transport-calendar/time-grid';
import { vehicleIcon } from '@/components/transport-calendar/trip-block';
import type { CalendarVehicle, TripBlock } from '@/components/transport-calendar/types';

/**
 * Het publieke bezettingsoverzicht (T8): dezelfde weekkalender als het team
 * ziet, zonder de knoppen.
 *
 * Een client-component omdat de nu-lijn het uur van de bezoeker nodig heeft. De
 * server kent dat niet, en het uit een server-render meegeven zou een lijn
 * opleveren die stilstaat op het moment van de laatste build.
 */
export function PublicWeek({
  days,
  vehicles,
  blocks,
  emptyLabel,
  showDriver,
  driverColors,
}: {
  days: string[];
  vehicles: CalendarVehicle[];
  blocks: TripBlock[];
  emptyLabel: string;
  showDriver: boolean;
  driverColors?: DriverColorOverrides;
}) {
  const [now, setNow] = useState<Date | undefined>(undefined);
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
      />
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
