'use client';

import { useEffect, useState, useTransition } from 'react';
import { Button } from '@vtk/ui';
import { adminEditTransportAction } from '@/app/actions/beheer';
import { QuarterDateTime } from '@/components/quarter-datetime';
import { useToast } from '@/components/ui/toast';

/**
 * De feiten van een rit aanpassen, in de inspector naast de kalender (P4).
 *
 * Eén op één met het venster dat het team tot nu toe in zijn externe agenda-tool
 * gebruikte: start, eind, reden, lading, extra info. Bestuurder en voertuig staan
 * eronder in `TransportControls`, want die hebben hun eigen actie met hun eigen
 * regels (een chauffeur moet in de chauffeurslijst staan, een voertuigwissel
 * hersnapshot het tarief).
 *
 * Bewust geen `SaveForm`: die hoort bij een `<form action>`, en deze actie neemt
 * een object omdat het formulier gecontroleerde velden heeft (de uren zijn
 * kwartierkiezers, geen vrije invoer).
 */

const inputClass =
  'w-full rounded-lg border border-vtk-navy/15 bg-white px-3 py-2 text-sm text-vtk-ink';

export type TripEditValues = {
  startAt: string;
  endAt: string;
  purpose: string;
  cargoNote: string;
  pickupAddress: string;
  destination: string;
  adminNote: string;
};

export function TripEditForm({
  bookingId,
  initial,
  locked,
  onSaved,
}: {
  bookingId: string;
  initial: TripEditValues;
  /** Afgerond of geannuleerd: de rit is geschiedenis en staat enkel nog te lezen. */
  locked: boolean;
  onSaved?: () => void;
}) {
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  // Klik je in de kalender een andere rit aan, dan blijft dit formulier bestaan
  // en moet het de nieuwe waarden overnemen; anders bewerk je rit B met de velden
  // van rit A nog ingevuld.
  useEffect(() => {
    setValues(initial);
    setError(null);
  }, [initial]);

  function set<K extends keyof TripEditValues>(key: K, value: TripEditValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  const dirty = (Object.keys(values) as Array<keyof TripEditValues>).some(
    (key) => values[key] !== initial[key]
  );

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await adminEditTransportAction(bookingId, values);
      if (result.ok) {
        showToast({ message: result.message ?? 'Opgeslagen.', variant: 'success' });
        onSaved?.();
      } else {
        // In het paneel zelf én als toast: het paneel scrollt, en een melding die
        // boven de vouw hangt terwijl je onderaan op opslaan drukte, lees je niet.
        setError(result.error);
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  if (locked) {
    return (
      <p className="text-sm text-vtk-muted">
        Deze rit is afgerond of geannuleerd; er kan niets meer aan gewijzigd worden.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {/* Onder elkaar en niet naast elkaar: het paneel is 26rem breed, en een
          datumveld plus een uurkeuze naast elkaar knijpt de datum tot "02/09/2…". */}
      <div className="grid gap-3">
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Start
          <QuarterDateTime value={values.startAt} onChange={(value) => set('startAt', value)} />
        </label>
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Einde
          <QuarterDateTime
            value={values.endAt}
            onChange={(value) => set('endAt', value)}
            min={values.startAt}
          />
        </label>
      </div>

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Waarvoor
        <input
          type="text"
          value={values.purpose}
          onChange={(event) => set('purpose', event.target.value)}
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Lading
        <input
          type="text"
          value={values.cargoNote}
          onChange={(event) => set('cargoNote', event.target.value)}
          placeholder="bv. 20 bierbakken en 4 tafels"
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Laadadres
        <input
          type="text"
          value={values.pickupAddress}
          onChange={(event) => set('pickupAddress', event.target.value)}
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Bestemming
        <input
          type="text"
          value={values.destination}
          onChange={(event) => set('destination', event.target.value)}
          className={inputClass}
        />
      </label>

      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Extra info van Logistiek
        <textarea
          rows={3}
          value={values.adminNote}
          onChange={(event) => set('adminNote', event.target.value)}
          placeholder="Staat mee in de mail naar de aanvrager"
          className={inputClass}
        />
      </label>

      {error ? (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" onClick={save} disabled={pending || !dirty}>
          {pending ? 'Opslaan...' : 'Opslaan'}
        </Button>
        {dirty ? (
          <button
            type="button"
            onClick={() => setValues(initial)}
            disabled={pending}
            className="text-sm font-medium text-vtk-muted underline underline-offset-4"
          >
            Ongedaan maken
          </button>
        ) : null}
      </div>
    </div>
  );
}
