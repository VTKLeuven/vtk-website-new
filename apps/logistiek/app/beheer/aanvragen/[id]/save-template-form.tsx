'use client';

import { useState } from 'react';
import { saveTemplateFromReservationAction } from '@/app/actions/beheer';
import { SaveForm } from '@/components/ui/save-form';

/**
 * Deze aanvraag bewaren als sjabloon.
 *
 * Dit is de enige manier om er een te maken: een cantus bestaat al voor iemand er
 * een sjabloon van wil, en de lijst opnieuw intikken in een leeg scherm is precies
 * het werk dat een sjabloon moet uitsparen.
 */
const ERRORS = {
  NAME_REQUIRED: 'Geef het sjabloon een naam, bv. "Cantus".',
  NOT_FOUND: 'Aanvraag niet gevonden.',
  NO_LINES: 'Deze aanvraag heeft geen materiaal om te bewaren.',
};

export function SaveTemplateForm({ reservationId }: { reservationId: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-vtk-navy/15 px-3.5 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40 hover:bg-vtk-paper"
      >
        Bewaar als sjabloon
      </button>
    );
  }

  return (
    <SaveForm
      action={saveTemplateFromReservationAction}
      submitLabel="Sjabloon bewaren"
      savingLabel="Bewaren..."
      savedMessage="Sjabloon bewaard; het staat nu in het aanvraagformulier."
      errorMessages={ERRORS}
      onSuccess={() => setOpen(false)}
      className="grid gap-2 rounded-[14px] border border-vtk-navy/10 bg-vtk-paper p-4"
    >
      <input type="hidden" name="reservationId" value={reservationId} />
      <p className="text-sm font-semibold text-vtk-ink">Bewaren als sjabloon</p>
      <p className="text-xs text-vtk-muted">
        Neemt de materiaallijst over, niet de datums of het evenement. Leden kiezen
        het sjabloon bovenaan het aanvraagformulier.
      </p>
      <label className="grid gap-1 text-sm">
        <span className="text-vtk-muted">Naam</span>
        <input
          type="text"
          name="name"
          placeholder="Bv. Cantus"
          className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
        />
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-vtk-muted">Toelichting (optioneel)</span>
        <input
          type="text"
          name="description"
          placeholder="Bv. zonder de vaten"
          className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
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
