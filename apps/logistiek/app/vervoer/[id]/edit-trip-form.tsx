'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@vtk/ui';
import { editVanBookingAction } from '@/app/actions/uitleen';
import { QuarterDateTime } from '@/components/quarter-datetime';
import type { LogistiekLocale } from '@/lib/i18n-shared';

/**
 * Je eigen rit aanpassen (T5, T13).
 *
 * Enkel de uren en waar de rit heen gaat: het voertuig en de chauffeur hangen
 * aan de planning van de hele week en blijven van het team. Was de rit al
 * goedgekeurd, dan zegt de waarschuwing vooraf dat die goedkeuring wegvalt;
 * achteraf ontdekken dat je aanvraag terug in de wachtrij staat, is erger dan
 * ze niet te kunnen aanpassen.
 */
export function EditTripForm({
  bookingId,
  initial,
  approved,
  locale,
}: {
  bookingId: string;
  initial: {
    startAt: string;
    endAt: string;
    purpose: string;
    destination: string;
    pickupAddress: string;
  };
  approved: boolean;
  locale: LogistiekLocale;
}) {
  const en = locale === 'en';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const inputClass =
    'h-10 w-full rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

  if (!open) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
        {en ? 'Edit trip' : 'Rit aanpassen'}
      </Button>
    );
  }

  function save() {
    setError(null);
    startTransition(async () => {
      const result = await editVanBookingAction(bookingId, values);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div className="mt-2 grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-paper p-4">
      {approved ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {en
            ? 'This trip is already approved. If you change it, Logistics has to approve it again and the driver may change.'
            : 'Deze rit is al goedgekeurd. Pas je ze aan, dan moet Logistiek ze opnieuw goedkeuren en kan de chauffeur veranderen.'}
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'From' : 'Van'}</span>
          <QuarterDateTime
            value={values.startAt}
            onChange={(next) => setValues({ ...values, startAt: next })}
            timeLabel={en ? 'Start time' : 'Startuur'}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'To' : 'Tot'}</span>
          <QuarterDateTime
            value={values.endAt}
            min={values.startAt || undefined}
            onChange={(next) => setValues({ ...values, endAt: next })}
            timeLabel={en ? 'End time' : 'Einduur'}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm sm:col-span-2">
          <span className="font-medium text-vtk-ink">
            {en ? 'What is the trip for?' : 'Waarvoor dient de rit?'}
          </span>
          <input
            type="text"
            value={values.purpose}
            onChange={(field) => setValues({ ...values, purpose: field.target.value })}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'Loading address' : 'Laadadres'}</span>
          <input
            type="text"
            value={values.pickupAddress}
            onChange={(field) => setValues({ ...values, pickupAddress: field.target.value })}
            className={inputClass}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="font-medium text-vtk-ink">{en ? 'Destination' : 'Bestemming'}</span>
          <input
            type="text"
            value={values.destination}
            onChange={(field) => setValues({ ...values, destination: field.target.value })}
            className={inputClass}
          />
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          {pending ? (en ? 'Saving...' : 'Opslaan...') : en ? 'Save changes' : 'Wijzigingen opslaan'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          {en ? 'Cancel' : 'Annuleren'}
        </Button>
      </div>
    </div>
  );
}
