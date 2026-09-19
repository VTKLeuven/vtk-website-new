'use client';

import { useState, type ReactNode } from 'react';
import { Button, Input, Label } from '@vtk/ui';
import { IconButton } from '@/components/ui/IconButton';
import { TrashIcon } from '@/components/ui/icons';
import { utcToLocalDateTime } from '@/lib/ticketing/time';

/**
 * Wanneer een evenement doorgaat: één doorlopende periode, of een reeks losse
 * momenten.
 *
 * Dat is één keuze en dus één veld. De twee vormen sluiten elkaar uit (zie
 * `CalendarEventMoment`), en ze allebei tegelijk laten invullen levert een
 * formulier op waarin de helft van wat je intikt stil genegeerd wordt.
 *
 * In de momentenmodus stuurt dit veld de rijen als JSON mee in één verborgen
 * `moments`-veld, en laat het start en einde weg: de action leidt de envelop af
 * uit de momenten. In de gewone modus staat er geen `moments`-veld in het
 * formulier, en wist de action de momenten die er eventueel stonden.
 */

export type MomentValue = { start: Date; end: Date; label: string | null };

/** Eén rij in de editor. Datum en uren staan los, want zo tik je ze ook in. */
type MomentDraft = { date: string; start: string; end: string; label: string };

function toDraft(moment: MomentValue): MomentDraft {
  const [date, start] = utcToLocalDateTime(moment.start).split('T');
  // Een moment over middernacht (een nachtloop tot 2u) draagt enkel zijn
  // starttdag; de action leest een einduur dat niet later is dan het beginuur als
  // de dag erna. Zo blijft de rij twee uurvelden breed in plaats van twee datums.
  const end = utcToLocalDateTime(moment.end).split('T')[1];
  return { date: date ?? '', start: start ?? '', end: end ?? '', label: moment.label ?? '' };
}

function emptyDraft(after?: MomentDraft): MomentDraft {
  if (!after) return { date: '', start: '', end: '', label: '' };
  return { date: nextDay(after.date), start: after.start, end: after.end, label: '' };
}

/** De dag na deze, of leeg wanneer er nog geen dag staat. */
function nextDay(date: string): string {
  if (!date) return '';
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** Elke dag van `from` tot en met `to`; leeg wanneer het bereik niet klopt. */
function dayRange(from: string, to: string, max = 60): string[] {
  if (!from || !to || to < from) return [];
  const days: string[] = [];
  for (let day = from; day <= to && days.length < max; day = nextDay(day)) days.push(day);
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
  const [rows, setRows] = useState<MomentDraft[]>(moments.map(toDraft));
  const [bulk, setBulk] = useState({ from: '', to: '', start: '', end: '' });
  const bulkDays = dayRange(bulk.from, bulk.to);

  function patch(index: number, field: keyof MomentDraft, value: string) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, [field]: value } : row))
    );
  }

  function addBulk() {
    const days = bulkDays;
    if (days.length === 0 || !bulk.start || !bulk.end) return;
    setRows((current) => {
      const taken = new Set(current.map((row) => row.date));
      const added = days
        .filter((day) => !taken.has(day))
        .map((day) => ({ date: day, start: bulk.start, end: bulk.end, label: '' }));
      return [...current, ...added].sort(
        (a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)
      );
    });
    setBulk({ from: '', to: '', start: '', end: '' });
  }

  return (
    // De keuze staat verder van de velden dan de velden onderling: ze bepaalt
    // welke velden er staan, en plakte ze er tegenaan, dan las "Start" als een
    // label van de keuzekaart erboven in plaats van van het veld eronder.
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
              ? 'Het blijft één evenement met één pagina en één affiche, maar het staat enkel op de dagen waarop er echt iets is, telkens met het juiste uur. In de agenda van de leden komt er een aparte afspraak per moment.'
              : 'It stays one event with one page and one poster, but it only shows on the days something actually happens, each with the right time. Members get a separate appointment per moment in their calendar.'}
          </p>

          {rows.length > 0 ? (
            <div className="space-y-2">
              <div className="hidden gap-2 text-xs text-vtk-blue-muted sm:grid sm:grid-cols-[minmax(0,10rem)_minmax(0,7rem)_minmax(0,7rem)_minmax(0,1fr)_2rem]">
                <span>{nl ? 'Dag' : 'Day'}</span>
                <span>{nl ? 'Van' : 'From'}</span>
                <span>{nl ? 'Tot' : 'To'}</span>
                <span>{nl ? 'Naam (optioneel)' : 'Name (optional)'}</span>
                <span className="sr-only">{nl ? 'Acties' : 'Actions'}</span>
              </div>
              {rows.map((row, index) => (
                <div
                  key={index}
                  className="grid gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,7rem)_minmax(0,7rem)_minmax(0,1fr)_2rem] sm:items-center"
                >
                  <RowField label={nl ? 'Dag' : 'Day'}>
                    <Input
                      type="date"
                      value={row.date}
                      aria-label={nl ? `Dag van moment ${index + 1}` : `Day of moment ${index + 1}`}
                      onChange={(e) => patch(index, 'date', e.target.value)}
                    />
                  </RowField>
                  <RowField label={nl ? 'Van' : 'From'}>
                    <Input
                      type="time"
                      value={row.start}
                      aria-label={nl ? `Beginuur van moment ${index + 1}` : `Start time of moment ${index + 1}`}
                      onChange={(e) => patch(index, 'start', e.target.value)}
                    />
                  </RowField>
                  <RowField label={nl ? 'Tot' : 'To'}>
                    <Input
                      type="time"
                      value={row.end}
                      aria-label={nl ? `Einduur van moment ${index + 1}` : `End time of moment ${index + 1}`}
                      onChange={(e) => patch(index, 'end', e.target.value)}
                    />
                  </RowField>
                  <RowField label={nl ? 'Naam (optioneel)' : 'Name (optional)'}>
                    <Input
                      value={row.label}
                      maxLength={80}
                      placeholder={nl ? 'bv. Nachtloop' : 'e.g. Night run'}
                      aria-label={nl ? `Naam van moment ${index + 1}` : `Name of moment ${index + 1}`}
                      onChange={(e) => patch(index, 'label', e.target.value)}
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
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                    >
                      <TrashIcon />
                    </IconButton>
                  </div>
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
            onClick={() => setRows((current) => [...current, emptyDraft(current[current.length - 1])])}
          >
            {nl ? 'Moment toevoegen' : 'Add moment'}
          </Button>

          {/* Een loopweek intikken is zeven keer hetzelfde uur. Deze rij zet de
              hele reeks in één keer klaar; daarna blijft elke dag apart aanpasbaar. */}
          <div className="rounded-xl border border-vtk-blue/15 bg-vtk-blue-soft/40 p-3">
            <p className="text-sm font-medium text-vtk-ink">
              {nl ? 'Elke dag van een periode toevoegen' : 'Add every day of a period'}
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,9rem)_minmax(0,6.5rem)_minmax(0,6.5rem)_auto] sm:items-end">
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
                    ? `${bulkDays.length} dagen toevoegen`
                    : `Add ${bulkDays.length} days`
                  : nl
                    ? 'Dagen toevoegen'
                    : 'Add days'}
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
