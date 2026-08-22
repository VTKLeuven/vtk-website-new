'use client';

import { useState, useTransition } from 'react';
import { Button } from '@vtk/ui';
import { saveLineDecisionAction } from '@/app/actions/beheer';
import { useToast } from '@/components/ui/toast';

/**
 * De materiaallijnen van een aanvraag, met per lijn een beslissing en een nota
 * van het team (M1, M3).
 *
 * Waarom per lijn en niet enkel per aanvraag: vijf items waarvan er één niet
 * vrij is, betekende voordien de hele aanvraag afwijzen of ze stilzwijgend
 * uitkleden bij het bewerken. Wie dat laatste deed, liet de aanvrager achter met
 * een lijst waarin iets ontbrak zonder dat ergens stond wat, of waarom.
 *
 * De nota van het team staat naast die van het lid en niet in de plaats ervan;
 * bij het item moet zichtbaar zijn wie wat schreef.
 */
export type DecisionLine = {
  id: string;
  itemName: string;
  quantity: number;
  /** Nota van het lid, niet bewerkbaar door het team. */
  note: string | null;
  adminNote: string | null;
  lineStatus: 'REQUESTED' | 'APPROVED' | 'REJECTED';
  inCatalogue: boolean;
  /** Vrij in deze periode, of null wanneer dat hier niet berekend wordt. */
  available: number | null;
};

export function LineDecisions({ lines }: { lines: DecisionLine[] }) {
  return (
    <ul className="mt-2 divide-y divide-vtk-navy/10">
      {lines.map((line) => (
        <LineRow key={line.id} line={line} />
      ))}
    </ul>
  );
}

function LineRow({ line }: { line: DecisionLine }) {
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState(line.adminNote ?? '');
  const rejected = line.lineStatus === 'REJECTED';
  const dirty = note.trim() !== (line.adminNote ?? '').trim();
  const short = line.available !== null && !rejected && line.quantity > line.available;

  function save(next: { lineStatus: DecisionLine['lineStatus'] }) {
    startTransition(async () => {
      const result = await saveLineDecisionAction(line.id, {
        lineStatus: next.lineStatus,
        adminNote: note,
      });
      if (!result.ok) {
        showToast({ message: result.error, variant: 'error', duration: 0 });
        return;
      }
      showToast({ message: result.message ?? 'Opgeslagen.', variant: 'success' });
    });
  }

  return (
    <li className="py-2.5 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className={rejected ? 'text-vtk-muted line-through' : 'text-vtk-ink'}>
          {line.quantity}× {line.itemName}
          {!line.inCatalogue ? (
            <span className="ml-2 text-xs text-vtk-muted no-underline">(niet meer in catalogus)</span>
          ) : null}
        </span>
        <span className="flex flex-wrap items-center gap-3">
          {rejected ? (
            <span className="rounded-full bg-vtk-paper-2 px-2 py-0.5 text-[11px] font-semibold text-vtk-navy">
              Niet toegekend
            </span>
          ) : line.available !== null ? (
            <span className={short ? 'font-semibold text-red-700' : 'text-vtk-muted'}>
              {line.available} beschikbaar in deze periode
            </span>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant={rejected ? 'secondary' : 'ghost'}
            disabled={pending}
            onClick={() => save({ lineStatus: rejected ? 'APPROVED' : 'REJECTED' })}
          >
            {rejected ? 'Toch toekennen' : 'Niet toekennen'}
          </Button>
        </span>
      </div>

      {line.note ? (
        <p className="mt-0.5 text-xs italic text-vtk-body">
          <span className="font-semibold not-italic">Lid:</span> {line.note}
        </p>
      ) : null}

      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <label className="flex min-w-0 flex-1 items-center gap-2 text-xs text-vtk-muted">
          <span className="shrink-0 font-semibold text-vtk-ink">Logi:</span>
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={
              rejected ? 'Waarom niet toegekend?' : 'Bv. staat al klaar bij het rek'
            }
            className="h-8 min-w-0 flex-1 rounded-lg border border-vtk-navy/15 bg-white px-2.5 text-xs text-vtk-ink"
          />
        </label>
        {/* De knop verschijnt pas zodra er iets veranderd is: een knop die altijd
            staat te wachten, laat je twijfelen of je nog moet opslaan. */}
        {dirty ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => save({ lineStatus: line.lineStatus })}
          >
            Nota bewaren
          </Button>
        ) : null}
      </div>
    </li>
  );
}
