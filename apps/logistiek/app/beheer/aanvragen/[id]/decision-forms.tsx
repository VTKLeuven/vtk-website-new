'use client';

import { SaveForm } from '@/components/ui/save-form';
import { approveReservationAction, rejectReservationAction } from '@/app/actions/beheer';

const APPROVE_ERRORS = {
  MODE_REQUIRED: 'Kies hoe er betaald wordt.',
  NOT_FOUND: 'Aanvraag niet gevonden.',
  NOT_REQUESTED: 'Deze aanvraag is al beslist.',
  NO_STOCK: 'Onvoldoende voorraad in deze periode; er is intussen iets anders goedgekeurd.',
};

const REJECT_ERRORS = {
  NOTE_REQUIRED: 'Geef een reden mee; het lid ziet die bij de aanvraag.',
  NOT_FOUND: 'Aanvraag niet gevonden.',
  NOT_REQUESTED: 'Deze aanvraag is al beslist.',
};

export function DecisionForms({ reservationId, totalCents }: { reservationId: string; totalCents: number }) {
  return (
    <div className="grid gap-6">
      <SaveForm
        action={approveReservationAction}
        submitLabel="Goedkeuren"
        savingLabel="Goedkeuren..."
        savedMessage="Aanvraag goedgekeurd."
        errorMessages={APPROVE_ERRORS}
        className="grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-paper p-4"
      >
        <input type="hidden" name="reservationId" value={reservationId} />
        <p className="text-sm font-semibold text-vtk-ink">Goedkeuren</p>
        <fieldset className="grid gap-2 text-sm">
          <legend className="sr-only">Betaalwijze</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="paymentMode" value="ONLINE" defaultChecked={totalCents > 0} />
            <span>Online betalen (betaallink voor het lid)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="paymentMode" value="OFFLINE" defaultChecked={totalCents === 0} />
            <span>Betalen bij afhaling (cash/Payconiq)</span>
          </label>
        </fieldset>
        <label className="grid gap-1 text-sm">
          <span className="text-vtk-muted">Nota voor het lid (optioneel)</span>
          <input
            type="text"
            name="adminNote"
            placeholder="Bv. afhalen kan tussen 18u en 19u"
            className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
          />
        </label>
      </SaveForm>

      <SaveForm
        action={rejectReservationAction}
        submitLabel="Afwijzen"
        savingLabel="Afwijzen..."
        savedMessage="Aanvraag afgewezen."
        errorMessages={REJECT_ERRORS}
        submitVariant="danger"
        className="grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-paper p-4"
      >
        <input type="hidden" name="reservationId" value={reservationId} />
        <p className="text-sm font-semibold text-vtk-ink">Afwijzen</p>
        <label className="grid gap-1 text-sm">
          <span className="text-vtk-muted">Reden (verplicht, zichtbaar voor het lid)</span>
          <input
            type="text"
            name="adminNote"
            placeholder="Bv. materiaal nodig voor de 24 urenloop"
            className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
          />
        </label>
      </SaveForm>
    </div>
  );
}
