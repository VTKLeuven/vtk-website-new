'use client';

import { Input, Label, Textarea } from '@vtk/ui';
import { SaveForm } from '@/components/ui/save-form';
import { saveRentalSettingsAction } from '@/app/actions/fakbar';
import { saveMessages } from '@/lib/saveMessages';
import type { RentalSettings } from '@/lib/rental-settings';

/** Zes vaste plekken voor voorwaarden; lege plekken worden niet opgeslagen. */
const SLOTS = [0, 1, 2, 3, 4, 5];

export function RentalSettingsForm({ settings }: { settings: RentalSettings }) {
  return (
    <SaveForm
      action={saveRentalSettingsAction}
      submitLabel="Voorwaarden opslaan"
      savingLabel="Opslaan…"
      savedMessage="Verhuurvoorwaarden opgeslagen."
      errorMessages={saveMessages}
      className="space-y-5"
    >
      <div className="fakbar-card grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="feeCents">Huurprijs in euro</Label>
          <Input
            id="feeCents"
            name="feeCents"
            inputMode="decimal"
            defaultValue={(settings.feeCents / 100).toFixed(2)}
            required
          />
        </div>
        <div>
          <Label htmlFor="period">Geldig voor</Label>
          <Input id="period" name="period" defaultValue={settings.period} placeholder="academiejaar 2026-2027" />
        </div>
        <div>
          <Label htmlFor="contactEmail">Aanvragen naar</Label>
          <Input id="contactEmail" name="contactEmail" type="email" defaultValue={settings.contactEmail} required />
        </div>
      </div>

      <div className="fakbar-card space-y-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--ink)]">Voorwaarden</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Elk blok wordt een rubriek op de verhuurpagina. Laat een blok leeg om het weg te laten.
          </p>
        </div>
        {SLOTS.map((slot) => {
          const condition = settings.conditions[slot];
          return (
            <div key={slot} className="grid gap-3 border-t border-[var(--line)] pt-4 sm:grid-cols-[1fr_2.4fr] sm:items-start">
              <div>
                <Label htmlFor={`condition-title-${slot}`}>Titel {slot + 1}</Label>
                <Input
                  id={`condition-title-${slot}`}
                  name={`condition:${slot}:title`}
                  defaultValue={condition?.title ?? ''}
                />
              </div>
              <div>
                <Label htmlFor={`condition-body-${slot}`}>Toelichting {slot + 1}</Label>
                <Textarea
                  id={`condition-body-${slot}`}
                  name={`condition:${slot}:body`}
                  rows={2}
                  defaultValue={condition?.body ?? ''}
                />
              </div>
            </div>
          );
        })}
      </div>
    </SaveForm>
  );
}
