'use client';

import { useRef, useState, type ReactNode } from 'react';
import { Button, Input, Label, Select } from '@vtk/ui';
import { IconButton } from '@/components/ui/IconButton';
import { TrashIcon } from '@/components/ui/icons';
import { utcToLocalDateTime } from '@/lib/ticketing/time';
import {
  EMPTY_MOMENT_DETAILS,
  momentToDraft,
  type MomentDraft,
  type MomentValue,
} from '@/lib/calendar/momentDraft';
import { EventMomentDetails } from './EventMomentDetails';

/**
 * Wanneer een evenement doorgaat: één doorlopende periode, of een reeks losse
 * momenten.
 *
 * Dat is één keuze en dus één veld. De twee vormen sluiten elkaar uit (zie
 * `CalendarEventMoment`), en ze allebei tegelijk laten invullen levert een
 * formulier op waarin de helft van wat je intikt stil genegeerd wordt.
 *
 * In de momentenmodus stuurt dit veld de rijen als JSON mee in één verborgen
 * `moments`-veld (met per rij ook wat er eigen is aan dat moment, zie
 * `EventMomentDetails`), en laat het start en einde weg: de action leidt de
 * envelop af uit de momenten. In de gewone modus staat er geen `moments`-veld in het
 * formulier, en wist de action de momenten die er eventueel stonden.
 */

export type { MomentValue };

/**
 * Een rij met een vaste sleutel. De index is dat niet: de fotovelden houden eigen
 * toestand bij, dus na het wegdoen van een rij zou de affiche van de ene rij bij
 * de volgende blijven staan. De sleutel gaat mee in het JSON-veld; de action
 * negeert hem.
 */
type MomentRow = MomentDraft & { key: string };

/** `days` dagen na deze, of leeg wanneer er nog geen dag staat. */
function addDays(date: string, days: number): string {
  if (!date) return '';
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/** Hoeveel dagen er tussen twee dagen liggen. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

/**
 * Een nieuwe rij na de laatste, op dezelfde afstand als de twee rijen ervoor: wie
 * wekelijkse loopjes invult, krijgt zo de volgende week en niet de volgende dag.
 */
function emptyDraft(rows: readonly MomentDraft[]): MomentDraft {
  const last = rows[rows.length - 1];
  const before = rows[rows.length - 2];
  if (!last) return { date: '', start: '', end: '', ...EMPTY_MOMENT_DETAILS };
  const gap = before?.date && last.date ? daysBetween(before.date, last.date) : 1;
  return {
    ...EMPTY_MOMENT_DETAILS,
    date: addDays(last.date, gap > 0 ? gap : 1),
    start: last.start,
    end: last.end,
  };
}

/** Elke dag van `from` tot en met `to`, om de `step` dagen; leeg wanneer het bereik niet klopt. */
function dayRange(from: string, to: string, step: number, max = 60): string[] {
  if (!from || !to || to < from) return [];
  const days: string[] = [];
  for (let day = from; day <= to && days.length < max; day = addDays(day, step)) days.push(day);
  return days;
}

/**
 * Het opschrift bij een veld in een rij. Boven `sm` staat het in de kolomkop
 * erboven, en daaronder valt die kop weg: dan hoort het opschrift bij het veld
 * zelf, anders staan er vier naamloze vakjes onder elkaar. Voor een screenreader
 * draagt het veld altijd zijn eigen `aria-label`.
 */
function RowField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-xs text-vtk-blue-muted sm:hidden">{label}</span>
      {children}
    </div>
  );
}

/** De rij "een reeks toevoegen", los van de rijen zelf. */
type BulkDraft = { from: string; to: string; every: 'day' | 'week'; start: string; end: string };
const EMPTY_BULK: BulkDraft = { from: '', to: '', every: 'day', start: '', end: '' };

export function EventWhenField({
  start,
  end,
  allDay,
  moments,
  locale,
}: {
  start?: Date | null;
  end?: Date | null;
  allDay?: boolean;
  moments: MomentValue[];
  locale: 'nl' | 'en';
}) {
  const nl = locale === 'nl';
  const [mode, setMode] = useState<'single' | 'moments'>(
    moments.length > 0 ? 'moments' : 'single'
  );
  // Op de index voor wat de server al rendert, zodat de sleutels en de namen van
  // de verborgen velden bij de hydratie gelijk zijn; daarna telt dit verder.
  const [rows, setRows] = useState<MomentRow[]>(
    moments.map((moment, index) => ({ ...momentToDraft(moment), key: `m${index}` }))
  );
  const nextKey = useRef(moments.length);
  const [bulk, setBulk] = useState<BulkDraft>(EMPTY_BULK);
  const bulkDays = dayRange(bulk.from, bulk.to, bulk.every === 'week' ? 7 : 1);

  function newKey() {
    return `m${nextKey.current++}`;
  }

  function patch(key: string, changes: Partial<MomentDraft>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...changes } : row)));
  }

  function addOne() {
    setRows([...rows, { ...emptyDraft(rows), key: newKey() }]);
  }

  function addBulk() {
    if (bulkDays.length === 0 || !bulk.start || !bulk.end) return;
    const taken = new Set(rows.map((row) => row.date));
    const added = bulkDays
      .filter((day) => !taken.has(day))
      .map((day) => ({
        ...EMPTY_MOMENT_DETAILS,
        date: day,
        start: bulk.start,
        end: bulk.end,
        key: newKey(),
      }));
    setRows(
      [...rows, ...added].sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start))
    );
    setBulk(EMPTY_BULK);
  }

  return (
    // De keuze staat verder van de velden dan de velden onderling: ze bepaalt
    // welke velden er staan, en plakte ze er tegenaan, dan las "Start" als een
    // label van de keuzekaart erboven in plaats van van het veld eronder. Die
    // extra ruimte staat op `.vtk-ef-modes` zelf: `space-y-*` hangt in Tailwind
    // v4 in een `:where()` en verliest van de margin-reset op de fieldset.
    <div className="space-y-6">
      {/* De twee vormen als keuzekaarten: de keuze bepaalt welke velden er
          verderop staan, en dat is meer dan een vinkje in een rij verdient. */}
      <fieldset className="vtk-ef-modes">
        <legend className="sr-only">{nl ? 'Vorm van het evenement' : 'Shape of the event'}</legend>
        <label className="vtk-ef-mode" data-active={mode === 'single'}>
          <input
            type="radio"
            name="whenMode"
            value="single"
            checked={mode === 'single'}
            onChange={() => setMode('single')}
          />
          <span>
            <b>{nl ? 'Eén doorlopende periode' : 'One continuous period'}</b>
            <small>{nl ? 'Een fuif, een cantus, een weekend.' : 'A party, a cantus, a weekend.'}</small>
          </span>
        </label>
        <label className="vtk-ef-mode" data-active={mode === 'moments'}>
          <input
            type="radio"
            name="whenMode"
            value="moments"
            checked={mode === 'moments'}
            onChange={() => setMode('moments')}
          />
          <span>
            <b>{nl ? 'Meerdere momenten' : 'Several moments'}</b>
            <small>
              {nl
                ? 'Een loopweek, een reeks workshops: elke dag een eigen uur.'
                : 'A running week, a series of workshops: a time of its own per day.'}
            </small>
          </span>
        </label>
      </fieldset>

      {mode === 'single' ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label>Start</Label>
            <Input
              name="start"
              type="datetime-local"
              defaultValue={start ? utcToLocalDateTime(start) : ''}
              required
            />
          </div>
          <div>
            <Label>{nl ? 'Einde' : 'End'}</Label>
            <Input
              name="end"
              type="datetime-local"
              defaultValue={end ? utcToLocalDateTime(end) : ''}
              required
            />
          </div>
          <div className="flex items-end gap-3">
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name="allDay" defaultChecked={allDay ?? false} />
              {nl ? 'Hele dag' : 'All day'}
            </label>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Eén verborgen veld met alle rijen: de action leest ze in één keer
              en leidt er start en einde van het evenement uit af. */}
          <input type="hidden" name="moments" value={JSON.stringify(rows)} />

          <p className="text-xs text-vtk-muted">
            {nl
              ? 'Het blijft één evenement met één pagina, maar het staat enkel op de dagen waarop er echt iets is, telkens met het juiste uur. In de agenda van de leden komt er een aparte afspraak per moment. Per moment kan je een eigen locatie, tekst en affiche zetten; de site toont telkens die van het eerstvolgende moment.'
              : 'It stays one event with one page, but it only shows on the days something actually happens, each with the right time. Members get a separate appointment per moment in their calendar. Each moment can have its own location, text and poster; the site always shows those of the next moment.'}
          </p>

          {rows.length > 0 ? (
            <div className="space-y-3">
              <div className="hidden gap-2 text-xs text-vtk-blue-muted sm:grid sm:grid-cols-[minmax(0,10rem)_minmax(0,7rem)_minmax(0,7rem)_minmax(0,1fr)_2rem]">
                <span>{nl ? 'Dag' : 'Day'}</span>
                <span>{nl ? 'Van' : 'From'}</span>
                <span>{nl ? 'Tot' : 'To'}</span>
                <span>{nl ? 'Naam (optioneel)' : 'Name (optional)'}</span>
                <span className="sr-only">{nl ? 'Acties' : 'Actions'}</span>
              </div>
              {rows.map((row, index) => (
                <div key={row.key} className="space-y-1.5">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,7rem)_minmax(0,7rem)_minmax(0,1fr)_2rem] sm:items-center">
                    <RowField label={nl ? 'Dag' : 'Day'}>
                      <Input
                        type="date"
                        value={row.date}
                        aria-label={nl ? `Dag van moment ${index + 1}` : `Day of moment ${index + 1}`}
                        onChange={(e) => patch(row.key, { date: e.target.value })}
                      />
                    </RowField>
                    <RowField label={nl ? 'Van' : 'From'}>
                      <Input
                        type="time"
                        value={row.start}
                        aria-label={nl ? `Beginuur van moment ${index + 1}` : `Start time of moment ${index + 1}`}
                        onChange={(e) => patch(row.key, { start: e.target.value })}
                      />
                    </RowField>
                    <RowField label={nl ? 'Tot' : 'To'}>
                      <Input
                        type="time"
                        value={row.end}
                        aria-label={nl ? `Einduur van moment ${index + 1}` : `End time of moment ${index + 1}`}
                        onChange={(e) => patch(row.key, { end: e.target.value })}
                      />
                    </RowField>
                    <RowField label={nl ? 'Naam (optioneel)' : 'Name (optional)'}>
                      <Input
                        value={row.label}
                        maxLength={80}
                        placeholder={nl ? 'bv. Nachtloop' : 'e.g. Night run'}
                        aria-label={nl ? `Naam van moment ${index + 1}` : `Name of moment ${index + 1}`}
                        onChange={(e) => patch(row.key, { label: e.target.value })}
                      />
                    </RowField>
                    <div className="flex justify-end sm:justify-center">
                      <IconButton
                        label={nl ? 'Moment verwijderen' : 'Remove moment'}
                        srLabel={
                          nl
                            ? `Moment verwijderen: ${row.date || `moment ${index + 1}`}`
                            : `Remove moment: ${row.date || `moment ${index + 1}`}`
                        }
                        tone="danger"
                        onClick={() => setRows((current) => current.filter((other) => other.key !== row.key))}
                      >
                        <TrashIcon />
                      </IconButton>
                    </div>
                  </div>
                  <EventMomentDetails
                    rowKey={row.key}
                    draft={row}
                    locale={locale}
                    onChange={(changes) => patch(row.key, changes)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p className="rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/50 px-3 py-2 text-sm text-vtk-blue-muted">
              {nl
                ? 'Nog geen momenten. Voeg er één toe, of zet hieronder in één keer een reeks dagen klaar.'
                : 'No moments yet. Add one, or set up a run of days at once below.'}
            </p>
          )}

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={addOne}
          >
            {nl ? 'Moment toevoegen' : 'Add moment'}
          </Button>

          {/* Een loopweek of wekelijkse loopjes intikken is telkens hetzelfde uur.
              Deze rij zet de hele reeks in één keer klaar; daarna blijft elke dag
              apart aanpasbaar. */}
          <div className="rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/40 p-3">
            <p className="text-sm font-medium text-vtk-ink">
              {nl ? 'Een reeks toevoegen' : 'Add a series'}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,9rem)_minmax(0,7.5rem)_minmax(0,6.5rem)_minmax(0,6.5rem)_auto] sm:items-end">
              <RowField label={nl ? 'Van dag' : 'From day'}>
                <Input
                  type="date"
                  value={bulk.from}
                  aria-label={nl ? 'Reeks: eerste dag' : 'Run: first day'}
                  onChange={(e) => setBulk({ ...bulk, from: e.target.value })}
                />
              </RowField>
              <RowField label={nl ? 'T.e.m. dag' : 'Up to and including'}>
                <Input
                  type="date"
                  value={bulk.to}
                  aria-label={nl ? 'Reeks: laatste dag' : 'Run: last day'}
                  onChange={(e) => setBulk({ ...bulk, to: e.target.value })}
                />
              </RowField>
              <RowField label={nl ? 'Herhaling' : 'Repeat'}>
                <Select
                  value={bulk.every}
                  aria-label={nl ? 'Reeks: herhaling' : 'Series: repeat'}
                  onChange={(e) => setBulk({ ...bulk, every: e.target.value === 'week' ? 'week' : 'day' })}
                >
                  <option value="day">{nl ? 'Elke dag' : 'Every day'}</option>
                  <option value="week">{nl ? 'Elke week' : 'Every week'}</option>
                </Select>
              </RowField>
              <RowField label={nl ? 'Van' : 'From'}>
                <Input
                  type="time"
                  value={bulk.start}
                  aria-label={nl ? 'Reeks: beginuur' : 'Run: start time'}
                  onChange={(e) => setBulk({ ...bulk, start: e.target.value })}
                />
              </RowField>
              <RowField label={nl ? 'Tot' : 'To'}>
                <Input
                  type="time"
                  value={bulk.end}
                  aria-label={nl ? 'Reeks: einduur' : 'Run: end time'}
                  onChange={(e) => setBulk({ ...bulk, end: e.target.value })}
                />
              </RowField>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={bulkDays.length === 0 || !bulk.start || !bulk.end}
                onClick={addBulk}
              >
                {bulkDays.length > 0
                  ? nl
                    ? `${bulkDays.length} toevoegen`
                    : `Add ${bulkDays.length}`
                  : nl
                    ? 'Toevoegen'
                    : 'Add'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-vtk-muted">
              {nl
                ? 'Dagen die er al staan, worden overgeslagen. Loopt een moment over middernacht, zet dan een einduur dat vroeger is dan het beginuur; dat wordt de nacht erna.'
                : 'Days that are already listed are skipped. For a moment running past midnight, set an end time earlier than the start time; that becomes the following night.'}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
