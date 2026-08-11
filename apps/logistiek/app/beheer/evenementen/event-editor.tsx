'use client';

import { useState } from 'react';
import { deleteEventAction, saveEventAction } from '@/app/actions/beheer';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import { SaveForm } from '@/components/ui/save-form';

/**
 * Een evenement aanmaken of aanpassen. Zonder `event` is het de aanmaakknop
 * bovenaan het scherm.
 */
const ERRORS = {
  NAME_REQUIRED: 'Geef het evenement een naam.',
  START_INVALID: 'Het startmoment is ongeldig.',
};

export function EventEditor({
  event,
  attached,
}: {
  event?: { id: string; name: string; location: string; startAt: string; note: string };
  /** Hoeveel aanvragen eraan hangen; staat in de bevestiging bij verwijderen. */
  attached: number;
}) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-full border border-vtk-navy/15 px-3.5 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40 hover:bg-vtk-paper"
        >
          {event ? 'Bewerken' : 'Nieuw evenement'}
        </button>
        {event ? (
          <ConfirmActionButton
            label={`Verwijderen: ${event.name}`}
            confirmLabel="Evenement verwijderen"
            icon={<LogisticsIcon name="close" className="h-4 w-4" />}
            action={deleteEventAction.bind(null, event.id)}
            successMessage="Evenement verwijderd."
            destructive
            dialogTitle="Evenement verwijderen?"
            dialogDescription={
              attached === 0
                ? 'Er hangt niets aan dit evenement; het verdwijnt gewoon.'
                : `De ${attached} aanvragen die eronder hangen blijven bestaan, met hun eigen datums en materiaal; ze staan daarna enkel niet meer gegroepeerd.`
            }
          />
        ) : null}
      </div>
    );
  }

  return (
    <SaveForm
      action={saveEventAction}
      submitLabel={event ? 'Opslaan' : 'Evenement aanmaken'}
      savingLabel="Opslaan..."
      savedMessage={event ? 'Evenement bijgewerkt.' : 'Evenement aangemaakt.'}
      errorMessages={ERRORS}
      onSuccess={() => setOpen(false)}
      className="grid w-full gap-2 rounded-[14px] border border-vtk-navy/10 bg-vtk-paper p-4 sm:grid-cols-2"
    >
      {event ? <input type="hidden" name="eventId" value={event.id} /> : null}
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Naam
        <input
          type="text"
          name="name"
          defaultValue={event?.name ?? ''}
          placeholder="Bv. 24 urenloop"
          className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Locatie
        <input
          type="text"
          name="location"
          defaultValue={event?.location ?? ''}
          className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Startuur
        <input
          type="datetime-local"
          name="startAt"
          defaultValue={event?.startAt ?? ''}
          className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Nota van het team
        <input
          type="text"
          name="note"
          defaultValue={event?.note ?? ''}
          placeholder="Bv. materiaal blijft staan tot maandag"
          className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink"
        />
      </label>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="justify-self-start text-sm text-vtk-muted underline underline-offset-2"
      >
        Annuleren
      </button>
    </SaveForm>
  );
}
