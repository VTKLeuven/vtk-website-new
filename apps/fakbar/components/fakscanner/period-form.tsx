'use client';

import { Input, Label } from '@vtk/ui';
import { FAK_PERIOD_INTERVAL_MAX, FAK_PERIOD_INTERVAL_MIN } from '@vtk/db/fakscanner';
import { SaveForm } from '@/components/ui/save-form';
import { saveFakPeriodAction } from '@/app/actions/fakscanner';

/** Foutcodes uit de actie -> melding (zie saveFakPeriodAction). `overlap` brengt zijn eigen zin mee. */
const errorMessages: Record<string, string> = {
  missing_name: 'Geef de periode een naam, bv. de naam van het evenement.',
  bad_range: 'Vul een begin en een einde in; het einde moet na het begin liggen.',
  bad_time: 'De uren van het venster moeten als uu:mm ingevuld zijn.',
  empty_window:
    'Begin en einde van het venster mogen niet gelijk zijn. Moet er de klok rond geteld worden, zet het venster dan uit.',
  bad_interval: `Een tijdvak duurt minstens ${FAK_PERIOD_INTERVAL_MIN} en hoogstens ${FAK_PERIOD_INTERVAL_MAX} minuten.`,
  bad_reward: 'Check-ins per pint moet een geheel getal van minstens 1 zijn.',
  not_found: 'Deze periode bestaat niet meer. Ververs de pagina.',
};

/** De waarden waarmee het formulier opent, al als tekst voor de inputs. */
export type FakPeriodFormValues = {
  id?: string;
  name: string;
  /** "YYYY-MM-DDTHH:mm", Brusselse klok. */
  startsAt: string;
  endsAt: string;
  windowEnabled: boolean;
  windowStart: string;
  windowEnd: string;
  intervalMinutes: number;
  rewardEnabled: boolean;
  rewardEvery: number;
};

/**
 * Een periode aanmaken of bewerken. Zonder `id` maakt de actie een nieuwe aan en
 * gaat ze naar haar pagina; met `id` blijft het formulier staan en meldt een
 * toast de uitkomst.
 */
export function FakPeriodForm({ values }: { values: FakPeriodFormValues }) {
  const isNew = !values.id;

  return (
    <SaveForm
      action={saveFakPeriodAction}
      className="fakbar-card space-y-5"
      submitLabel={isNew ? 'Periode aanmaken' : 'Periode opslaan'}
      savingLabel="Bezig met opslaan…"
      savedMessage="Periode opgeslagen."
      errorMessages={errorMessages}
      fallbackErrorMessage="Opslaan van de periode is mislukt."
    >
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}

      <div className="space-y-4">
        <div>
          <Label htmlFor="period-name">Naam</Label>
          <Input id="period-name" name="name" required maxLength={120} defaultValue={values.name} />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="period-start">Begint op</Label>
            <Input id="period-start" name="startsAt" type="datetime-local" required defaultValue={values.startsAt} />
          </div>
          <div>
            <Label htmlFor="period-end">Eindigt op</Label>
            <Input id="period-end" name="endsAt" type="datetime-local" required defaultValue={values.endsAt} />
          </div>
        </div>
        <p className="max-w-[70ch] text-sm leading-relaxed text-[var(--muted)]">
          Tussen begin en einde telt een scan enkel voor deze periode, met de regels hieronder. De gewone jaarstand
          en het dubbeltelvenster staan dan stil; vanaf het einde telt alles weer zoals altijd.
        </p>
      </div>

      <fieldset className="space-y-4 border-t border-[var(--line)] pt-5">
        <legend className="sr-only">Wanneer een scan telt</legend>
        <div className="max-w-[16rem]">
          <Label htmlFor="period-interval">Eén check-in per (minuten)</Label>
          <Input
            id="period-interval"
            name="intervalMinutes"
            type="number"
            min={FAK_PERIOD_INTERVAL_MIN}
            max={FAK_PERIOD_INTERVAL_MAX}
            required
            defaultValue={values.intervalMinutes}
          />
        </div>

        <label className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
          <input
            type="checkbox"
            name="windowEnabled"
            defaultChecked={values.windowEnabled}
            className="size-4 rounded border-zinc-400"
          />
          Enkel binnen een dagelijks venster
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="period-window-start">Elke dag vanaf</Label>
            <Input id="period-window-start" name="windowStart" type="time" defaultValue={values.windowStart} />
          </div>
          <div>
            <Label htmlFor="period-window-end">Tot</Label>
            <Input id="period-window-end" name="windowEnd" type="time" defaultValue={values.windowEnd} />
          </div>
        </div>
        <p className="max-w-[70ch] text-sm leading-relaxed text-[var(--muted)]">
          Buiten het venster telt een scan niet; de lezer zegt dan vanaf wanneer het weer kan. Zo spaart wie overdag
          in de bar werkt geen check-ins bij. Het venster mag over middernacht lopen (22:00 tot 10:00). De
          tijdvakken beginnen op het begin van het venster: met een uur per tijdvak is dat 22:00, 23:00, 00:00 en
          zo verder, en wie om 22:50 scant, mag om 23:00 opnieuw.
        </p>
      </fieldset>

      <fieldset className="space-y-4 border-t border-[var(--line)] pt-5">
        <legend className="sr-only">Gratis pinten</legend>
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
          <input
            type="checkbox"
            name="rewardEnabled"
            defaultChecked={values.rewardEnabled}
            className="size-4 rounded border-zinc-400"
          />
          Gratis pinten tijdens deze periode
        </label>
        <div className="max-w-[16rem]">
          <Label htmlFor="period-reward">Check-ins per gratis pint</Label>
          <Input
            id="period-reward"
            name="rewardEvery"
            type="number"
            min={1}
            max={1000}
            required
            defaultValue={values.rewardEvery}
          />
        </div>
        <p className="max-w-[70ch] text-sm leading-relaxed text-[var(--muted)]">
          Telt op de check-ins van deze periode, niet op de jaarstand. Staat het uit, dan geeft de lezer tijdens de
          periode geen gratis pint.
        </p>
      </fieldset>
    </SaveForm>
  );
}
