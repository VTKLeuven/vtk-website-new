'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@vtk/ui';
import { previewTripSeriesAction } from '@/app/actions/beheer';
import {
  MAX_SERIES_OCCURRENCES,
  repeatFromDraft,
  WEEKDAY_SHORT_NL,
  type RepeatDraft,
} from '@/lib/recurrence';

/**
 * "Herhalen" in het intekenformulier (F6.22): C&G, het containerpark, de BO-rit.
 *
 * Een herhaling is een rij gewone ritten, niet één rit met een regel. Dit blok
 * vult dus enkel in wanneer ze komen; wat er daarna staat, is elk een rit die je
 * apart kan openen, schuiven of een chauffeur geven.
 *
 * **De voorvertoning is de kern.** "Toon de ritten" zet de lijst van data
 * onder het formulier, mét welke botsen. Twaalf ritten aanmaken om er daarna twee
 * rood te zien staan, is de fout die dit voorkomt.
 */
type PreviewState =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | {
      kind: 'ready';
      items: Array<{ startAt: string; endAt: string; clash: string | null }>;
      capped: boolean;
    };

const PATTERNS: Array<{ value: RepeatDraft['pattern']; label: string }> = [
  { value: 'WEEKLY', label: 'Wekelijks' },
  { value: 'MONTHLY_DATE', label: 'Maandelijks, dezelfde datum (bv. de 15de)' },
  { value: 'MONTHLY_WEEKDAY', label: 'Maandelijks, dezelfde weekdag (bv. de eerste maandag)' },
];

const dayFormatter = new Intl.DateTimeFormat('nl-BE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

function formatLocalDate(local: string): string {
  const [date] = local.split('T');
  return dayFormatter.format(new Date(`${date}T00:00:00Z`));
}

export function RepeatFields({
  draft,
  onChange,
  startAt,
  endAt,
  vehicleId,
  inputClass,
}: {
  draft: RepeatDraft;
  onChange: (next: RepeatDraft) => void;
  startAt: string;
  endAt: string;
  vehicleId: string;
  inputClass: string;
}) {
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<PreviewState>({ kind: 'idle' });

  // Een ander moment of voertuig maakt de lijst ook ongeldig: de botsingen horen bij
  // een voertuig en de data bij het begin.
  useEffect(() => {
    setPreview({ kind: 'idle' });
  }, [startAt, endAt, vehicleId]);

  // Elke wijziging maakt een eerdere voorvertoning ongeldig: ze zou iets tonen
  // wat niet meer is wat er straks aangemaakt wordt.
  function change(next: Partial<RepeatDraft>) {
    setPreview({ kind: 'idle' });
    onChange({ ...draft, ...next });
  }

  function toggleWeekday(day: number) {
    const has = draft.weekdays.includes(day);
    change({ weekdays: has ? draft.weekdays.filter((entry) => entry !== day) : [...draft.weekdays, day] });
  }

  function showTrips() {
    const repeat = repeatFromDraft(draft);
    if (!repeat) return;
    startTransition(async () => {
      const result = await previewTripSeriesAction({ startAt, endAt, vehicleId, repeat });
      setPreview(
        result.ok
          ? { kind: 'ready', items: result.items, capped: result.capped }
          : { kind: 'error', message: result.error }
      );
    });
  }

  const clashes = preview.kind === 'ready' ? preview.items.filter((item) => item.clash).length : 0;

  return (
    <fieldset className="grid gap-3 rounded-[12px] border border-vtk-navy/10 p-3">
      <legend className="px-1 text-xs font-medium text-vtk-muted">Herhalen</legend>

      <label className="flex items-center gap-2 text-sm text-vtk-ink">
        <input
          type="checkbox"
          checked={draft.on}
          onChange={(event) => change({ on: event.target.checked })}
          className="h-4 w-4"
        />
        Herhaal deze rit
      </label>

      {draft.on ? (
        <div className="grid gap-3">
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Patroon
            <select
              value={draft.pattern}
              onChange={(event) => change({ pattern: event.target.value as RepeatDraft['pattern'] })}
              className={inputClass}
            >
              {PATTERNS.map((pattern) => (
                <option key={pattern.value} value={pattern.value}>
                  {pattern.label}
                </option>
              ))}
            </select>
          </label>

          {draft.pattern === 'WEEKLY' ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Op welke dagen">
                {WEEKDAY_SHORT_NL.map((label, day) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => toggleWeekday(day)}
                    aria-pressed={draft.weekdays.includes(day)}
                    className={`h-8 min-w-9 rounded-full border px-2 text-xs font-medium transition ${
                      draft.weekdays.includes(day)
                        ? 'border-vtk-navy bg-vtk-navy text-vtk-on-emphasis'
                        : 'border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-vtk-muted">
                Elke
                <select
                  value={draft.everyWeeks}
                  onChange={(event) => change({ everyWeeks: Number(event.target.value) })}
                  className={`${inputClass} w-auto`}
                  aria-label="Om de hoeveel weken"
                >
                  {[1, 2, 3, 4].map((weeks) => (
                    <option key={weeks} value={weeks}>
                      {weeks === 1 ? 'week' : `${weeks} weken`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          <fieldset className="grid gap-1.5">
            <legend className="mb-1 text-xs font-medium text-vtk-muted">Tot wanneer</legend>
            <label className="flex flex-wrap items-center gap-2 text-sm text-vtk-ink">
              <input
                type="radio"
                name="repeat-end"
                checked={draft.endKind === 'COUNT'}
                onChange={() => change({ endKind: 'COUNT' })}
              />
              In totaal
              <input
                type="number"
                min={2}
                max={MAX_SERIES_OCCURRENCES}
                value={draft.count}
                onChange={(event) => change({ endKind: 'COUNT', count: Number(event.target.value) || 2 })}
                className={`${inputClass} w-20`}
                aria-label="Aantal ritten"
              />
              ritten
            </label>
            <label className="flex flex-wrap items-center gap-2 text-sm text-vtk-ink">
              <input
                type="radio"
                name="repeat-end"
                checked={draft.endKind === 'UNTIL'}
                onChange={() => change({ endKind: 'UNTIL' })}
              />
              Tot en met
              <input
                type="date"
                value={draft.until}
                onChange={(event) => change({ endKind: 'UNTIL', until: event.target.value })}
                className={`${inputClass} w-auto`}
                aria-label="Laatste datum"
              />
            </label>
            <span className="text-xs text-vtk-muted">Hoogstens {MAX_SERIES_OCCURRENCES} ritten per reeks.</span>
          </fieldset>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={showTrips} disabled={pending || !startAt || !endAt}>
              {pending ? 'Ophalen...' : 'Toon de ritten'}
            </Button>
          </div>

          {preview.kind === 'error' ? (
            <p role="alert" className="rounded-lg border border-vtk-danger-line bg-vtk-danger-soft px-3 py-2 text-sm text-vtk-danger">
              {preview.message}
            </p>
          ) : null}

          {preview.kind === 'ready' ? (
            <div className="grid gap-1.5" aria-live="polite">
              <p className="text-sm font-medium text-vtk-ink">
                {preview.items.length} {preview.items.length === 1 ? 'rit' : 'ritten'}
                {clashes > 0 ? (
                  <span className="text-vtk-danger">, waarvan {clashes} botsen met een andere rit</span>
                ) : null}
                {preview.capped ? <span className="text-vtk-muted"> (het maximum)</span> : null}
              </p>
              <ul className="grid max-h-48 gap-0.5 overflow-y-auto text-sm">
                {preview.items.map((item) => (
                  <li
                    key={item.startAt}
                    className={`flex flex-wrap gap-x-2 tabular-nums ${item.clash ? 'text-vtk-danger' : 'text-vtk-body'}`}
                    title={item.clash ?? undefined}
                  >
                    <span>{formatLocalDate(item.startAt)}</span>
                    <span className="text-vtk-muted">
                      {item.startAt.split('T')[1]} tot {item.endAt.split('T')[1]}
                    </span>
                    {item.clash ? <span className="font-medium">botst</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </fieldset>
  );
}
