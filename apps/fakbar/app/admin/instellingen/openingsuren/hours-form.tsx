'use client';

import { Input, Label, Textarea } from '@vtk/ui';
import { SaveForm } from '@/components/ui/save-form';
import { saveOpeningHoursAction } from '@/app/actions/fakbar';
import { saveMessages } from '@/lib/saveMessages';
import type { ElixirHours } from '@/lib/opening-hours';

export function HoursForm({ hours }: { hours: ElixirHours }) {
  return (
    <SaveForm
      action={saveOpeningHoursAction}
      submitLabel="Openingsuren opslaan"
      savingLabel="Opslaan…"
      savedMessage="Openingsuren opgeslagen."
      errorMessages={saveMessages}
      className="fakbar-card space-y-5"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hours.rows.map((row, index) => (
          <div key={row.dayNl}>
            <Label htmlFor={`hours-${index}`}>{row.dayNl}</Label>
            <Input
              id={`hours-${index}`}
              name={`hours:${index}`}
              defaultValue={row.hours ?? ''}
              placeholder="Gesloten"
              autoComplete="off"
            />
          </div>
        ))}
      </div>

      <div>
        <Label htmlFor="note">Notitie onder de uren</Label>
        <Textarea
          id="note"
          name="note"
          defaultValue={hours.note}
          rows={2}
          placeholder="Bijvoorbeeld: tijdens de blok zijn we enkel op donderdag open."
        />
        <p className="mt-1.5 text-xs text-[var(--muted)]">
          Deze notitie staat ook op vtk.be onder de openingsurenkaart. Laat leeg om ze te verbergen.
        </p>
      </div>
    </SaveForm>
  );
}
