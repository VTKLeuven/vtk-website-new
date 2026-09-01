'use client';

import Link from 'next/link';
import { saveEventAction } from '@/app/actions/beheer';
import { SaveForm } from '@/components/ui/save-form';

/**
 * Een evenement aanpassen vanuit de transportplanning (P5).
 *
 * Dezelfde velden en dezelfde actie als de editor op `/beheer/evenementen`: één
 * formulier met twee plekken zou na de eerste wijziging uit elkaar lopen, en de
 * regels (dag en uur apart, het uur mag leeg blijven) zijn hier niet anders.
 *
 * Wat er hier níét bij hoort: het evenement verwijderen. Dat is destructief en
 * hangt aanvragen los; dat doe je op het scherm waar je ziet wat eraan hangt.
 */

const ERRORS = {
  NAME_REQUIRED: 'Geef het evenement een naam.',
  START_INVALID: 'Het startmoment is ongeldig.',
  END_INVALID: 'Het einde is ongeldig.',
  END_BEFORE_START: 'Het einde ligt voor het begin.',
};

const inputClass =
  'w-full rounded-lg border border-vtk-navy/15 bg-white px-3 py-2 text-sm text-vtk-ink';

export type PlannerEvent = {
  id: string;
  name: string;
  location: string | null;
  /** ISO-strings voor de balk in de kalender. */
  startAt: string;
  endAt: string;
  timeKnown: boolean;
  groupName: string | null;
  requestCount: number;
  tripCount: number;
  /** De velden van het formulier, al gesplitst in dag en uur. */
  form: {
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    note: string;
  };
};

export function EventEditForm({
  event,
  onSaved,
}: {
  event: PlannerEvent;
  onSaved?: () => void;
}) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-vtk-body">
        {event.requestCount} {event.requestCount === 1 ? 'aanvraag' : 'aanvragen'} en{' '}
        {event.tripCount} {event.tripCount === 1 ? 'rit' : 'ritten'} hangen hieronder.
        {event.tripCount === 0 ? (
          <>
            {' '}
            <span className="font-semibold text-vtk-navy">Nog geen transport aangevraagd.</span>
          </>
        ) : null}
      </p>

      <SaveForm
        action={saveEventAction}
        submitLabel="Opslaan"
        savingLabel="Opslaan..."
        savedMessage="Evenement bijgewerkt."
        errorMessages={ERRORS}
        onSuccess={onSaved}
        className="grid gap-3"
      >
        <input type="hidden" name="eventId" value={event.id} />

        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Naam
          <input type="text" name="name" defaultValue={event.name} className={inputClass} />
        </label>

        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Locatie
          <input
            type="text"
            name="location"
            defaultValue={event.location ?? ''}
            className={inputClass}
          />
        </label>

        {/* Dag en uur apart, en het uur mag leeg blijven (E2): bij het aanmaken
            weet je vaak enkel "die zaterdag", en een verplicht uur levert een
            verzonnen uur op dat later niemand meer durft te wijzigen. */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Startdag
            <input
              type="date"
              name="startDate"
              defaultValue={event.form.startDate}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Startuur (optioneel)
            <input
              type="time"
              name="startTime"
              defaultValue={event.form.startTime}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Einddag (optioneel)
            <input
              type="date"
              name="endDate"
              defaultValue={event.form.endDate}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-xs font-medium text-vtk-muted">
            Einduur (optioneel)
            <input
              type="time"
              name="endTime"
              defaultValue={event.form.endTime}
              className={inputClass}
            />
          </label>
        </div>

        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Nota van het team
          <input
            type="text"
            name="note"
            defaultValue={event.form.note}
            placeholder="Bv. materiaal blijft staan tot maandag"
            className={inputClass}
          />
        </label>
      </SaveForm>

      <p className="text-xs text-vtk-muted">
        Een rit onder dit evenement hangen doe je bij{' '}
        <Link href="/beheer/vervoer" className="underline underline-offset-2">
          Ritten
        </Link>
        .
      </p>
    </div>
  );
}
