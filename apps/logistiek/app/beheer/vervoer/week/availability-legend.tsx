'use client';

import { initials } from '@/components/transport-calendar/trip-block';
import { trackDriverOrder, type AvailabilityBand } from '@/components/transport-calendar/types';
import { AVAILABILITY_KINDS } from '@/lib/availability-day';
import { AVAILABILITY_KIND_LABEL, availabilityFillClass } from '@/lib/availability-kinds';
import { driverToneVar, type DriverColorOverrides } from '@/lib/driver-colors';

/**
 * Wat de sporen in de kalender betekenen, zolang de knop Beschikbaarheid aanstaat:
 * de drie soorten, en wie welk spoor is, in de volgorde van de sporen zelf
 * (op naam, zie `trackDriverOrder`).
 *
 * Getekend met dezelfde klassen en kleuren als de sporen, zoals de legende van de
 * blokken (F4.16): een legende in woorden loopt uit de pas zodra iemand de
 * arcering aanpast.
 */
export function AvailabilityLegend({
  bands,
  driverColors,
}: {
  bands: AvailabilityBand[];
  driverColors?: DriverColorOverrides;
}) {
  const drivers = trackDriverOrder(bands);
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-vtk-muted">
      <span className="text-[10px] font-semibold uppercase tracking-[0.08em]">Beschikbaarheid</span>
      {AVAILABILITY_KINDS.map((kind) => (
        <span key={kind} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className={`tg-track-sample ${availabilityFillClass(kind)}`}
            style={{ backgroundColor: driverToneVar(null) }}
          />
          {AVAILABILITY_KIND_LABEL[kind]}
        </span>
      ))}
      {drivers.length > 0 ? (
        <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1.5">
          {drivers.map((driver) => (
            <span key={driver.id} className="inline-flex items-center gap-1.5 text-vtk-ink">
              <span
                aria-hidden
                className="trip-chip trip-chip-lg"
                style={{ backgroundColor: driverToneVar(driver.id, driverColors) }}
              >
                {initials(driver.name)}
              </span>
              {driver.name}
            </span>
          ))}
        </span>
      ) : (
        <span>Nog niemand gaf uren door voor deze periode.</span>
      )}
    </div>
  );
}
