'use client';

import { Input, Label } from '@vtk/ui';
import { SaveForm } from '@/components/ui/save-form';
import { createWeekAction } from '@/app/actions/fakbar';
import { saveMessages } from '@/lib/saveMessages';

/**
 * Een week aanmaken. Jaar en weeknummer staan voorgevuld op de lopende
 * fakbarweek, zodat de gewone handeling één klik is en het invulveld enkel
 * dient om een week in te halen of vooruit te werken.
 */
export function CreateWeekForm({ defaultYear, defaultWeek }: { defaultYear: number; defaultWeek: number }) {
  return (
    <SaveForm
      action={createWeekAction}
      submitLabel="Week aanmaken"
      savingLabel="Bezig…"
      savedMessage="De week staat klaar."
      errorMessages={saveMessages}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="w-24 text-left">
        <Label htmlFor="week-year">Jaar</Label>
        <Input id="week-year" name="year" type="number" min={2000} max={2100} defaultValue={defaultYear} required />
      </div>
      <div className="w-24 text-left">
        <Label htmlFor="week-number">Week</Label>
        <Input id="week-number" name="weekNumber" type="number" min={1} max={53} defaultValue={defaultWeek} required />
      </div>
    </SaveForm>
  );
}
