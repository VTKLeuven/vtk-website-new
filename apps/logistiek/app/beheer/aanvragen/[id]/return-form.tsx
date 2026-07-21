'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import { markReturnedAction } from '@/app/actions/beheer';
import { useToast } from '@/components/ui/toast';

type FlesserkeLine = { id: string; itemName: string; quantity: number };

/**
 * Terugbrengen. Bij flesserke-lijnen vul je per lijn in hoeveel er (gesloten)
 * terugkomt; het verschil is verbruik en wordt van de voorraad afgeboekt.
 */
export function ReturnForm({ reservationId, flesserkeLines }: { reservationId: string; flesserkeLines: FlesserkeLine[] }) {
  const router = useRouter();
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  // Standaard: alles verbruikt (0 terug), zoals de flesserke-regel.
  const [returned, setReturned] = useState<Record<string, string>>(
    Object.fromEntries(flesserkeLines.map((l) => [l.id, '0']))
  );

  function submit() {
    startTransition(async () => {
      const map: Record<string, number> = {};
      for (const line of flesserkeLines) {
        const v = Number.parseInt(returned[line.id] ?? '0', 10);
        map[line.id] = Number.isInteger(v) ? v : 0;
      }
      const result = await markReturnedAction(reservationId, map);
      if (result.ok) {
        showToast({ message: result.message ?? 'Teruggebracht.', variant: 'success' });
        router.refresh();
      } else {
        showToast({ message: result.error ?? 'Er ging iets mis.', variant: 'error', duration: 0 });
      }
    });
  }

  return (
    <div className="grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-surface p-4">
      <p className="text-sm font-semibold text-vtk-ink">Terugbrengen</p>
      {flesserkeLines.length > 0 ? (
        <div className="grid gap-2">
          <p className="text-xs text-vtk-muted">Hoeveel komt er (gesloten) terug per flesserke-item?</p>
          {flesserkeLines.map((line) => (
            <label key={line.id} className="flex items-center justify-between gap-3 text-sm">
              <span className="text-vtk-ink">
                {line.itemName} <span className="text-vtk-muted">(uit: {line.quantity})</span>
              </span>
              <input
                type="number"
                min={0}
                max={line.quantity}
                value={returned[line.id] ?? '0'}
                onChange={(e) => setReturned((prev) => ({ ...prev, [line.id]: e.target.value }))}
                className="h-9 w-20 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
              />
            </label>
          ))}
        </div>
      ) : null}
      <Button type="button" size="sm" onClick={submit} disabled={pending}>
        Markeer als teruggebracht
      </Button>
    </div>
  );
}
