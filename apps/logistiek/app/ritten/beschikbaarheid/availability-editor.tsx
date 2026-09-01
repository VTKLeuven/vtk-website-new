'use client';

import { useCallback, useEffect, useOptimistic, useState, useTransition } from 'react';
import { Button } from '@vtk/ui';
import { addAvailabilityAction, removeAvailabilityAction } from '@/app/actions/uitleen';
import { QuarterDateTime } from '@/components/quarter-datetime';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import { useToast } from '@/components/ui/toast';
import { TimeGrid } from '@/components/transport-calendar/time-grid';
import type { AvailabilityBand } from '@/components/transport-calendar/types';
import { formatDateTime, toDatetimeLocalValue } from '@/lib/uitleen';
import { AvailabilityPaint } from './availability-paint';

/**
 * Wanneer kan je rijden (V1).
 *
 * Sleep een venster in de week en het staat er meteen; sleep er nog eens over en
 * het gaat weer weg. Dat is het gebaar van een Let's Meet, en het is wat mensen
 * hier verwachten.
 *
 * Het was eerst slepen om twee velden in te vullen en dan op "Toevoegen"
 * klikken. Dat leek zorgvuldig (je kon er nog een nota bij zetten) maar het
 * betekende drie handelingen voor één venster, en de nota bleek in de praktijk
 * bijna nooit ingevuld. Slepen slaat nu direct op.
 *
 * De velden eronder blijven staan, want op een telefoon is verticaal vegen
 * scrollen en dan valt er niets in te tekenen. De lijst eronder blijft ook: daar
 * zie je de vensters van de hele week op een rij, en daar zit de weghaalknop met
 * bevestiging voor wie liever niet met een gebaar wist.
 */

export type AvailabilityWindow = {
  id: string;
  startAt: string;
  endAt: string;
  note: string | null;
};

/** Een venster dat nog niet van de server terugkwam; het id is tijdelijk. */
const OPTIMISTIC_ID = 'optimistisch';

type Optimistic =
  | { kind: 'add'; startAt: string; endAt: string }
  | { kind: 'remove'; id: string };

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

  /**
   * Smal scherm? Dan het intekenraster van uurvakjes in plaats van het
   * tijdrooster. Via `matchMedia` en niet via CSS: het gaat niet om hoe iets
   * eruitziet maar om welke component er rendert, en om welk gebaar erbij hoort.
   * In een effect, want op de server bestaat `window` niet.
   */
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 700px)');
    const apply = () => setNarrow(query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  /**
   * De vensters zoals ze er nú uitzien, inclusief wat nog aan het opslaan is.
   *
   * `useOptimistic` en geen eigen state: de acties doen `revalidatePath`, dus de
   * echte lijst komt vanzelf terug en React draait de optimistische versie
   * precies dan terug. Met eigen state moet je die twee zelf uit elkaar houden,
   * en dan blijft er bij een fout een venster staan dat niet bestaat.
   */
  const [shown, applyOptimistic] = useOptimistic(windows, (state, action: Optimistic) =>
    action.kind === 'remove'
      ? state.filter((window) => window.id !== action.id)
      : [...state, { id: OPTIMISTIC_ID, startAt: action.startAt, endAt: action.endAt, note: null }]
  );

  const bands: AvailabilityBand[] = shown.map((window) => ({
    id: window.id,
    driverId,
    driverName,
    startAt: window.startAt,
    endAt: window.endAt,
    note: window.note,
  }));

  const add = useCallback(
    (values: { startAt: string; endAt: string; note?: string }) => {
      startTransition(async () => {
        applyOptimistic({ kind: 'add', startAt: values.startAt, endAt: values.endAt });
        const result = await addAvailabilityAction(values);
        if (result.ok) {
          setDraft({ startAt: '', endAt: '', note: '' });
        } else {
          showToast({ message: result.error, variant: 'error', duration: 0 });
        }
      });
    },
    [applyOptimistic, showToast]
  );

  const remove = useCallback(
    (id: string) => {
      startTransition(async () => {
        applyOptimistic({ kind: 'remove', id });
        const result = await removeAvailabilityAction(id);
        if (!result.ok) {
          showToast({ message: result.error, variant: 'error', duration: 0 });
        }
      });
    },
    [applyOptimistic, showToast]
  );

  /**
   * Slepen in de week: er staat al iets op dat moment, dan haalt dit het weg;
   * anders komt het erbij.
   *
   * De toets is het **beginpunt** van de sleep en niet de hele overlap: sleep je
   * van halverwege je zaterdagvenster naar de avond, dan is dat "dit stuk mag
   * weg" en niet "voeg er nog een uur aan toe". Het beginpunt is waar je de knop
   * indrukte, en dat is de plek waarvan je zelf zei dat je ze bedoelde.
   */
  const onCreateRange = useCallback(
    (startAt: Date, endAt: Date) => {
      const at = startAt.getTime();
      const existing = shown.find(
        (window) => new Date(window.startAt).getTime() <= at && new Date(window.endAt).getTime() > at
      );
      if (existing) {
        // Een venster dat nog aan het opslaan is, heeft nog geen echt id; dat kan
        // je niet weghalen. Even wachten is dan het juiste antwoord.
        if (existing.id !== OPTIMISTIC_ID) remove(existing.id);
        return;
      }
      add({ startAt: toDatetimeLocalValue(startAt), endAt: toDatetimeLocalValue(endAt) });
    },
    [add, remove, shown]
  );

  const fields = (
    <section className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-5">
      <h2 className="text-sm font-semibold text-vtk-ink">Venster intikken</h2>
      <p className="mt-1 text-xs text-vtk-muted">
        Voor wie een uur precies wil zetten; het raster hierboven gaat per uur.
      </p>
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
      </div>
      <Button
        type="button"
        size="sm"
        className="mt-3"
        disabled={pending || !draft.startAt || !draft.endAt}
        onClick={() => add({ startAt: draft.startAt, endAt: draft.endAt })}
      >
        {pending ? 'Opslaan...' : 'Toevoegen'}
      </Button>
    </section>
  );

  const list = (
    <section>
      <h2 className="text-sm font-semibold text-vtk-ink">Wanneer je kan rijden ({shown.length})</h2>
      {shown.length === 0 ? (
        <p className="mt-2 text-sm text-vtk-muted">
          Nog niets ingegeven. Zolang je niets ingeeft, gaat Logistiek er niet van uit dat je niet
          kan; ze weten het gewoon niet, en bellen je dan.
        </p>
      ) : (
        <ul className="mt-3 grid gap-2">
          {shown.map((window) => (
            <li
              key={window.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-[12px] bg-vtk-surface px-4 py-2.5 text-sm ${
                window.id === OPTIMISTIC_ID ? 'opacity-60' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="font-medium text-vtk-ink">
                  {formatDateTime(new Date(window.startAt))} tot{' '}
                  {formatDateTime(new Date(window.endAt))}
                </p>
                {window.note ? <p className="text-xs text-vtk-muted">{window.note}</p> : null}
              </div>
              {window.id === OPTIMISTIC_ID ? (
                <span className="text-xs text-vtk-muted">Opslaan...</span>
              ) : (
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
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  if (narrow) {
    // Op een telefoon enkel het intekenraster, op één scherm dat niet scrolt.
    // De velden om een uur in te tikken en de lijst om een venster weg te halen
    // stonden er eerst onder, maar allebei doen ze wat het raster al doet, en
    // samen duwden ze het raster van het scherm. Slepen in het tijdrooster van
    // het brede scherm is muis-only en kan daar ook niet anders: verticaal vegen
    // is scrollen. Zie `availability-paint.tsx`.
    return <AvailabilityPaint days={days} windows={shown} />;
  }

  return (
    <div className="grid gap-5">
      <TimeGrid
        days={days}
        vehicles={[]}
        blocks={[]}
        bands={bands}
        bandsProminent
        emptyLabel="Sleep hieronder in de week wanneer je kan rijden."
        showDriver={false}
        onCreateRange={onCreateRange}
        now={undefined}
        above={
          <p className="px-1 pb-2 text-xs text-vtk-muted">
            Sleep met de muis over een dag: het venster staat er meteen. Sleep er nog eens over om
            het weg te halen.
          </p>
        }
      />

      {fields}

      {list}
    </div>
  );
}
