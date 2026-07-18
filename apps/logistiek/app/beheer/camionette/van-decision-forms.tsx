'use client';

import { SaveForm } from '@/components/ui/save-form';
import { approveVanBookingAction, rejectVanBookingAction } from '@/app/actions/beheer';

const APPROVE_ERRORS = {
  MODE_REQUIRED: 'Kies hoe er betaald wordt.',
  NOT_FOUND: 'Rit niet gevonden.',
  NOT_REQUESTED: 'Deze rit is al beslist.',
  OVERLAP: 'De camionette is al geboekt op dat moment.',
};

const REJECT_ERRORS = {
  NOTE_REQUIRED: 'Geef een reden mee; het lid ziet die bij de rit.',
  NOT_FOUND: 'Rit niet gevonden.',
  NOT_REQUESTED: 'Deze rit is al beslist.',
};

export function VanDecisionForms({
  bookingId,
  drivers,
}: {
  bookingId: string;
  drivers: Array<{ id: string; name: string }>;
}) {
  return (
    <div className="grid gap-4">
      <SaveForm
        action={approveVanBookingAction}
        submitLabel="Goedkeuren"
        savingLabel="Goedkeuren..."
        savedMessage="Rit goedgekeurd."
        errorMessages={APPROVE_ERRORS}
        className="grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-paper p-4"
      >
        <input type="hidden" name="bookingId" value={bookingId} />
        <p className="text-sm font-semibold text-vtk-ink">Goedkeuren</p>
        <label className="grid gap-1 text-sm">
          <span className="text-vtk-muted">Chauffeur</span>
          <select
            name="driverId"
            className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
            defaultValue=""
          >
            <option value="">Nog geen chauffeur</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset className="grid gap-2 text-sm">
          <legend className="sr-only">Betaalwijze</legend>
          <label className="flex items-center gap-2">
            <input type="radio" name="paymentMode" value="ONLINE" defaultChecked />
            <span>Online betalen (betaallink voor het lid)</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="paymentMode" value="OFFLINE" />
            <span>Ter plaatse betalen (cash/Payconiq)</span>
          </label>
        </fieldset>
        <label className="grid gap-1 text-sm">
          <span className="text-vtk-muted">Nota voor het lid (optioneel)</span>
          <input
            type="text"
            name="adminNote"
            className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
          />
        </label>
      </SaveForm>

      <SaveForm
        action={rejectVanBookingAction}
        submitLabel="Afwijzen"
        savingLabel="Afwijzen..."
        savedMessage="Rit afgewezen."
        errorMessages={REJECT_ERRORS}
        submitVariant="danger"
        className="grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-paper p-4"
      >
        <input type="hidden" name="bookingId" value={bookingId} />
        <p className="text-sm font-semibold text-vtk-ink">Afwijzen</p>
        <label className="grid gap-1 text-sm">
          <span className="text-vtk-muted">Reden (verplicht, zichtbaar voor het lid)</span>
          <input
            type="text"
            name="adminNote"
            className="h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-vtk-ink"
          />
        </label>
      </SaveForm>
    </div>
  );
}
