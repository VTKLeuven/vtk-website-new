'use client';

import { useOptimistic, useTransition } from 'react';
import { setLinePreparedAction } from '@/app/actions/beheer';
import { useToast } from '@/components/ui/toast';

/**
 * De klaarzetlijst: per lijn een vinkje, met de plaats in de loods ernaast.
 *
 * Waarom optimistisch en niet gewoon een formulier: dit wordt aan een rek
 * gebruikt, twaalf keer na elkaar. Een vinkje dat een halve seconde wacht op de
 * server voelt aan als een vinkje dat niet werkte, en dan klikt iemand opnieuw.
 * Faalt de call alsnog, dan springt het vinkje terug en zegt een toast waarom.
 */
export type PrepareLine = {
  id: string;
  itemName: string;
  quantity: number;
  note: string | null;
  /** Waar het ligt. Enkel zichtbaar voor het team (zie M6). */
  location: string | null;
  preparedLabel: string | null;
};

export function PrepareList({ lines }: { lines: PrepareLine[] }) {
  const showToast = useToast();
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(
    lines,
    (current: PrepareLine[], change: { id: string; prepared: boolean }) =>
      current.map((line) =>
        line.id === change.id
          ? { ...line, preparedLabel: change.prepared ? 'Net klaargezet' : null }
          : line
      )
  );

  const done = optimistic.filter((line) => line.preparedLabel !== null).length;
  const total = optimistic.length;

  function toggle(line: PrepareLine, prepared: boolean) {
    startTransition(async () => {
      setOptimistic({ id: line.id, prepared });
      const result = await setLinePreparedAction(line.id, prepared);
      if (!result.ok) showToast({ message: result.error, variant: 'error', duration: 0 });
    });
  }

  return (
    <section className="mt-5 rounded-[16px] border border-vtk-navy/10 bg-vtk-paper p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-vtk-ink">Materiaal klaarzetten</h3>
        <p
          className={`text-sm tabular-nums ${
            done === total ? 'font-semibold text-vtk-ink' : 'text-vtk-muted'
          }`}
          aria-live="polite"
        >
          {done} van {total} klaargezet
        </p>
      </div>

      <ul className="mt-3 divide-y divide-vtk-navy/10">
        {optimistic.map((line) => {
          const prepared = line.preparedLabel !== null;
          return (
            <li key={line.id} className="py-2.5">
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={prepared}
                  onChange={(event) => toggle(line, event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                    {/* Enkel de naam doorstrepen: text-decoration erft door naar
                        de plaatscode, en een doorstreepte "0L · E2" leest als een
                        plaats die niet meer klopt. */}
                    <span
                      className={`font-medium ${
                        prepared ? 'text-vtk-muted line-through' : 'text-vtk-ink'
                      }`}
                    >
                      {line.quantity}× {line.itemName}
                    </span>
                    {line.location ? (
                      <span className="text-xs font-semibold uppercase tracking-wide text-vtk-muted">
                        {line.location}
                      </span>
                    ) : null}
                  </span>
                  {line.note ? (
                    <span className="mt-0.5 block text-xs italic text-vtk-body">{line.note}</span>
                  ) : null}
                  {prepared ? (
                    <span className="mt-0.5 block text-xs text-vtk-muted">{line.preparedLabel}</span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
