'use client';

import { useCallback, useState, useTransition } from 'react';
import { Button } from '@vtk/ui';
import { addAvailabilityAction, removeAvailabilityAction } from '@/app/actions/uitleen';
import { QuarterDateTime } from '@/components/quarter-datetime';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import { useToast } from '@/components/ui/toast';
import { TimeGrid } from '@/components/transport-calendar/time-grid';
import type { AvailabilityBand } from '@/components/transport-calendar/types';
import { formatDateTime, toDatetimeLocalValue } from '@/lib/uitleen';

/**
 * Wanneer kan je rijden (V1).
 *
 * Sleep een venster in de week, of tik het in met de twee velden eronder. Beide,
 * en niet enkel het slepen: op een telefoon is verticaal vegen scrollen, en dan
 * valt er niets in te tekenen.
 *
 * De vensters staan als lichte band in het rooster (dezelfde band die het team
 * straks in de planning ziet) én als lijst eronder. Die lijst is waar je ze
 * weghaalt: een bandje van vier pixels aanklikken op een telefoon werkt niet, en
 * per ongeluk je zaterdag wissen is vervelender dan één klik extra.
 */

export type AvailabilityWindow = {
  id: string;
  startAt: string;
  endAt: string;
  note: string | null;
};

export function AvailabilityEditor({
  days,
  windows,
  driverId,
  driverName,
}: {
  /** De week, als ISO-strings van UTC-middernacht. */
  days: string[];
  windows: AvailabilityWindow[];
  driverId: string;
  driverName: string;
}) {
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({ startAt: '', endAt: '', note: '' });

  const bands: AvailabilityBand[] = windows.map((window) => ({
    id: window.id,
    driverId,
    driverName,
    startAt: window.startAt,
    endAt: window.endAt,
    note: window.note,
  }));

  function add(values: { startAt: string; endAt: string; note: string }) {
    startTransition(async () => {
      const result = await addAvailabilityAction(values);
      if (result.ok) {
        showToast({ message: result.message ?? 'Opgeslagen.', variant: 'success' });
        setDraft({ startAt: '', endAt: '', note: '' });
      } else {
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  const onCreateRange = useCallback((startAt: Date, endAt: Date) => {
    // Slepen vult de velden in plaats van meteen op te slaan: dan kan je er nog
    // een nota bij zetten, en een misgesleepte band hoef je niet weg te halen.
    setDraft((current) => ({
      ...current,
      startAt: toDatetimeLocalValue(startAt),
      endAt: toDatetimeLocalValue(endAt),
    }));
  }, []);

  return (
    <div className="grid gap-5">
      <TimeGrid
        days={days}
        vehicles={[]}
        blocks={[]}
        bands={bands}
        emptyLabel="Sleep hieronder in de week wanneer je kan rijden."
        showDriver={false}
        onCreateRange={onCreateRange}
        now={undefined}
        above={
          <p className="px-1 pb-2 text-xs text-vtk-muted">
            Sleep met de muis over een dag om een venster in te tekenen, of vul het hieronder in.
          </p>
        }
      />

      <section className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-5">
        <h2 className="text-sm font-semibold text-vtk-ink">Venster toevoegen</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Van
            <QuarterDateTime
              value={draft.startAt}
              onChange={(value) => setDraft((current) => ({ ...current, startAt: value }))}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Tot
            <QuarterDateTime
              value={draft.endAt}
              onChange={(value) => setDraft((current) => ({ ...current, endAt: value }))}
              min={draft.startAt}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-vtk-muted sm:col-span-2">
            Nota (optioneel)
            <input
              type="text"
              value={draft.note}
              onChange={(event) => setDraft((current) => ({ ...current, note: event.target.value }))}
              placeholder="bv. enkel met de auto, tot 16u zeker"
              className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
            />
          </label>
        </div>
        <Button
          type="button"
          size="sm"
          className="mt-3"
          disabled={pending || !draft.startAt || !draft.endAt}
          onClick={() => add(draft)}
        >
          {pending ? 'Opslaan...' : 'Toevoegen'}
        </Button>
      </section>

      <section>
        <h2 className="text-sm font-semibold text-vtk-ink">
          Wanneer je kan rijden ({windows.length})
        </h2>
        {windows.length === 0 ? (
          <p className="mt-2 text-sm text-vtk-muted">
            Nog niets ingegeven. Zolang je niets ingeeft, gaat Logistiek er niet van uit dat je niet
            kan; ze weten het gewoon niet, en bellen je dan.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {windows.map((window) => (
              <li
                key={window.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-vtk-surface px-4 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="font-medium text-vtk-ink">
                    {formatDateTime(new Date(window.startAt))} tot{' '}
                    {formatDateTime(new Date(window.endAt))}
                  </p>
                  {window.note ? (
                    <p className="text-xs text-vtk-muted">{window.note}</p>
                  ) : null}
                </div>
                <ConfirmActionButton
                  label={`Weghalen: ${formatDateTime(new Date(window.startAt))}`}
                  confirmLabel="Venster weghalen"
                  icon={<LogisticsIcon name="close" className="h-4 w-4" />}
                  action={removeAvailabilityAction.bind(null, window.id)}
                  successMessage="Venster weggehaald."
                  destructive
                  dialogTitle="Venster weghalen?"
                  dialogDescription="Logistiek weet dan niet meer dat je op dat moment kan rijden. Ritten die al aan jou toegewezen zijn, blijven staan."
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
