'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import type { UitleenPricingMode } from '@prisma/client';
import {
  assignDriverAction,
  changeVehicleAction,
  completeTransportAction,
  markTransportPaidOfflineAction,
} from '@/app/actions/beheer';
import { useToast } from '@/components/ui/toast';

const selectClass = 'h-9 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

/** Beheeracties op een goedgekeurde rit: voertuig, chauffeur, afronden, betaald. */
export function TransportControls({
  bookingId,
  vehicleId,
  driverId,
  pricingMode,
  paid,
  drivers,
  vehicles,
}: {
  bookingId: string;
  vehicleId: string;
  driverId: string | null;
  pricingMode: UitleenPricingMode;
  paid: boolean;
  drivers: Array<{ id: string; name: string }>;
  vehicles: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [kilometers, setKilometers] = useState('');

  function run(action: () => Promise<{ ok: boolean; message?: string; error?: string }>) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        showToast({ message: result.message ?? 'Opgeslagen.', variant: 'success' });
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
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {pricingMode === 'PER_KM' ? (
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
        <Button
          type="button"
          size="sm"
          disabled={pending || (pricingMode === 'PER_KM' && kilometers.trim() === '')}
          onClick={() => run(() => completeTransportAction(bookingId, kilometers))}
        >
          Rit afronden
        </Button>
        {!paid ? (
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
