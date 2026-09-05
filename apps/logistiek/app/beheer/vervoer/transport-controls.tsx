'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import type { UitleenPricingMode, UitleenRequesterType } from '@prisma/client';
import {
  assignDriverAction,
  changeVehicleAction,
  completeTransportAction,
  markTransportPaidOfflineAction,
} from '@/app/actions/beheer';
import { useToast } from '@/components/ui/toast';
import { chargesRequester } from '@/lib/uitleen';
import type { DriverOption } from '@/lib/uitleen-server';
import { DriverOptions } from './driver-select';

const selectClass = 'h-9 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

/** Beheeracties op een goedgekeurde rit: voertuig, chauffeur, afronden, betaald. */
export function TransportControls({
  bookingId,
  vehicleId,
  driverId,
  driver,
  pricingMode,
  paid,
  requesterType,
  drivers,
  vehicles,
  showComplete = true,
}: {
  bookingId: string;
  vehicleId: string;
  driverId: string | null;
  driver: { id: string; name: string } | null;
  pricingMode: UitleenPricingMode;
  paid: boolean;
  /** R4: enkel externen betalen; bepaalt of "Markeer als betaald" hier zin heeft. */
  requesterType: UitleenRequesterType;
  drivers: DriverOption[];
  vehicles: Array<{ id: string; name: string; needsVanDriver: boolean }>;
  /**
   * Staat "Rit afronden" hier? Niet in de transportplanning (P4): daar klik je de
   * hele dag ritten aan om te schuiven en chauffeurs toe te wijzen, en dan is een
   * knop die de rit definitief afsluit één misklik van je verwijderd. Afronden
   * hoort bij de lijst, waar je er bewust naartoe gaat.
   */
  showComplete?: boolean;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [kilometers, setKilometers] = useState('');

  function run(
    action: () => Promise<{ ok: boolean; message?: string; error?: string; warning?: boolean }>
  ) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        // Gelukt met een staartje ("die chauffeur gaf 'liever niet' op", "het
        // voertuig staat nu dubbel"): dan blijft de melding staan tot je ze
        // wegklikt, want ze vraagt nog iets van je.
        showToast({
          message: result.message ?? 'Opgeslagen.',
          variant: 'success',
          duration: result.warning ? 0 : undefined,
        });
        router.refresh();
      } else {
        showToast({ message: result.error ?? 'Er ging iets mis.', variant: 'error', duration: 0 });
      }
    });
  }

  return (
    <div className="mt-4 grid gap-3 border-t border-vtk-navy/10 pt-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-vtk-muted">Voertuig</span>
          <select
            value={vehicleId}
            disabled={pending}
            onChange={(e) => run(() => changeVehicleAction(bookingId, e.target.value))}
            className={selectClass}
          >
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-vtk-muted">Chauffeur</span>
          <select
            value={driverId ?? ''}
            disabled={pending}
            onChange={(e) => run(() => assignDriverAction(bookingId, e.target.value))}
            className={selectClass}
          >
            <option value="">Nog geen</option>
            <DriverOptions
              drivers={drivers}
              current={driver}
              needsVanDriver={
                vehicles.find((v) => v.id === vehicleId)?.needsVanDriver ?? false
              }
            />
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {showComplete && pricingMode === 'PER_KM' ? (
          <label className="grid gap-1 text-sm">
            <span className="text-vtk-muted">Gereden km</span>
            <input
              type="number"
              min={0}
              value={kilometers}
              onChange={(e) => setKilometers(e.target.value)}
              className={`${selectClass} w-28`}
            />
          </label>
        ) : null}
        {showComplete ? (
          <Button
            type="button"
            size="sm"
            disabled={pending || (pricingMode === 'PER_KM' && kilometers.trim() === '')}
            onClick={() => run(() => completeTransportAction(bookingId, kilometers))}
          >
            Rit afronden
          </Button>
        ) : null}
        {/* Een post of werkgroep betaalt niets (R4), dus "betaald" heeft daar
            geen betekenis; de knop zou enkel een betaling in de historiek
            zetten die nooit gebeurd is. */}
        {!paid && chargesRequester(requesterType) ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => markTransportPaidOfflineAction(bookingId))}
          >
            Markeer als betaald
          </Button>
        ) : null}
      </div>
    </div>
  );
}
