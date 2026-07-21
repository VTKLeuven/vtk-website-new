'use client';

import type { UitleenVehicle } from '@prisma/client';
import { saveLogistiekSettingsAction, saveVehicleAction, setVehicleActiveAction } from '@/app/actions/beheer';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { SaveForm } from '@/components/ui/save-form';

const VEHICLE_ERRORS = {
  NAME_REQUIRED: 'Geef het voertuig een naam.',
  AMOUNT_INVALID: 'Het tarief moet een bedrag zijn, bv. 0,35.',
};

const PRICING_MODES: Array<{ value: string; label: string }> = [
  { value: 'FREE', label: 'Gratis' },
  { value: 'PER_HOUR', label: 'Per uur' },
  { value: 'PER_KM', label: 'Per kilometer' },
  { value: 'FLAT', label: 'Vast bedrag' },
];

const inputClass = 'h-10 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

function euroInput(cents: number): string {
  return cents === 0 ? '' : (cents / 100).toFixed(2).replace('.', ',');
}

function VehicleFields({ vehicle }: { vehicle?: UitleenVehicle }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {vehicle ? <input type="hidden" name="id" value={vehicle.id} /> : null}
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Naam (NL)
        <input type="text" name="nameNl" defaultValue={vehicle?.nameNl ?? ''} className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Naam (EN)
        <input type="text" name="nameEn" defaultValue={vehicle?.nameEn ?? ''} className={inputClass} />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Tariefmodus
        <select name="pricingMode" defaultValue={vehicle?.pricingMode ?? 'FREE'} className={inputClass}>
          {PRICING_MODES.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted">
        Tarief (€)
        <input
          type="text"
          name="rate"
          inputMode="decimal"
          placeholder="0,00"
          defaultValue={vehicle ? euroInput(vehicle.rateCents) : ''}
          className={inputClass}
        />
      </label>
      <label className="grid gap-1 text-xs font-medium text-vtk-muted sm:col-span-2">
        Omschrijving (optioneel)
        <input type="text" name="description" defaultValue={vehicle?.description ?? ''} className={inputClass} />
      </label>
    </div>
  );
}

export function VehicleSettings({ vehicles }: { vehicles: UitleenVehicle[] }) {
  const active = vehicles.filter((v) => v.active);
  const inactive = vehicles.filter((v) => !v.active);

  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Voertuigen & tarieven</h2>
      <p className="mt-1 text-sm text-vtk-muted">
        Stel per voertuig de tariefmodus in. Bij per-kilometer voert het team de kilometers in bij het
        afronden van de rit.
      </p>

      <ul className="mt-4 grid gap-3">
        {active.map((vehicle) => (
          <li key={vehicle.id} className="rounded-[14px] border border-vtk-navy/10 bg-vtk-paper/50 p-4">
            <SaveForm
              action={saveVehicleAction}
              submitLabel="Opslaan"
              savingLabel="Opslaan..."
              savedMessage="Voertuig opgeslagen."
              errorMessages={VEHICLE_ERRORS}
              className="grid gap-3"
            >
              <VehicleFields vehicle={vehicle} />
            </SaveForm>
            <div className="mt-2">
              <ConfirmActionButton
                label="Deactiveren"
                successMessage="Voertuig gedeactiveerd."
                action={setVehicleActiveAction.bind(null, vehicle.id, false)}
                destructive
                dialogTitle="Voertuig deactiveren?"
                dialogDescription="Leden kunnen dit voertuig niet meer kiezen. Bestaande ritten blijven bewaard."
              />
            </div>
          </li>
        ))}
      </ul>

      <details className="mt-4 rounded-[14px] border border-dashed border-vtk-navy/25 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-vtk-ink">+ Voertuig toevoegen</summary>
        <div className="mt-3">
          <SaveForm
            action={saveVehicleAction}
            submitLabel="Voertuig toevoegen"
            savingLabel="Toevoegen..."
            savedMessage="Voertuig toegevoegd."
            errorMessages={VEHICLE_ERRORS}
            className="grid gap-3"
          >
            <VehicleFields />
          </SaveForm>
        </div>
      </details>

      {inactive.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-vtk-ink">Gedeactiveerd</h3>
          <ul className="mt-2 grid gap-2">
            {inactive.map((vehicle) => (
              <li
                key={vehicle.id}
                className="flex items-center justify-between gap-3 rounded-[12px] bg-vtk-paper/60 px-3 py-2.5 text-sm"
              >
                <span className="text-vtk-muted">{vehicle.nameNl}</span>
                <ConfirmActionButton
                  label="Heractiveren"
                  successMessage="Voertuig terug beschikbaar."
                  action={setVehicleActiveAction.bind(null, vehicle.id, true)}
                  confirm={false}
                />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

export function GeneralSettings({ showRentPrices }: { showRentPrices: boolean }) {
  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-6">
      <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">Algemeen</h2>
      <SaveForm
        action={saveLogistiekSettingsAction}
        submitLabel="Opslaan"
        savingLabel="Opslaan..."
        savedMessage="Instellingen opgeslagen."
        className="mt-4 grid gap-3"
      >
        <label className="flex items-center gap-2 text-sm text-vtk-ink">
          <input type="checkbox" name="showRentPrices" defaultChecked={showRentPrices} className="h-4 w-4" />
          Huurprijzen tonen aan leden (naast de waarborg)
        </label>
        <p className="text-xs text-vtk-muted">
          Standaard uit: de uitleendienst rekent doorgaans enkel waarborg aan. Zet dit aan als je materiaal
          met een huurprijs aanbiedt.
        </p>
      </SaveForm>
    </section>
  );
}
