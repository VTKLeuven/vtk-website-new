'use client';

import { Input, Label } from '@vtk/ui';
import { SaveForm } from '@/components/ui/save-form';
import { saveFakscannerConfigAction } from '@/app/actions/fakscanner';
import type { FakscannerConfig } from '@vtk/db/fakscanner';

/** Foutcodes uit de actie -> melding (zie saveFakscannerConfigAction). */
const errorMessages: Record<string, string> = {
  bad_time: 'Een uur moet als uu:mm ingevuld zijn.',
  empty_window: 'Begin en einde van het dubbeltelvenster mogen niet gelijk zijn.',
  bad_reward: 'Check-ins per pint moet een geheel getal van minstens 1 zijn.',
  bad_rollover: 'Het startuur van de bardag moet als uu:mm ingevuld zijn.',
};

/**
 * De instellingen van de fakscanner: het dubbeltelvenster, het aantal check-ins
 * per gratis pint en het uur waarop een nieuwe bardag begint. De kaartlezer op
 * vtk.be leest dezelfde rij bij elke scan.
 */
export function FakscannerSettingsForm({ config }: { config: FakscannerConfig }) {
  return (
    <SaveForm
      action={saveFakscannerConfigAction}
      className="fakbar-card space-y-4"
      submitLabel="Instellingen opslaan"
      savingLabel="Bezig met opslaan…"
      savedMessage="Instellingen opgeslagen."
      errorMessages={errorMessages}
      fallbackErrorMessage="Opslaan van de instellingen is mislukt."
    >
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium text-[var(--ink)]">
          <input
            type="checkbox"
            name="doubleEnabled"
            defaultChecked={config.doubleEnabled}
            className="size-4 rounded border-zinc-400"
          />
          Dubbeltelvenster aan
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="doubleStart">Dubbel vanaf</Label>
            <Input id="doubleStart" name="doubleStart" type="time" defaultValue={config.doubleStart} />
          </div>
          <div>
            <Label htmlFor="doubleEnd">Dubbel tot</Label>
            <Input id="doubleEnd" name="doubleEnd" type="time" defaultValue={config.doubleEnd} />
          </div>
          <div>
            <Label htmlFor="rewardEvery">Check-ins per gratis pint</Label>
            <Input
              id="rewardEvery"
              name="rewardEvery"
              type="number"
              min={1}
              max={1000}
              defaultValue={config.rewardEvery}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="dayRolloverTime">Nieuwe bardag begint om</Label>
            <Input
              id="dayRolloverTime"
              name="dayRolloverTime"
              type="time"
              defaultValue={config.dayRolloverTime}
            />
          </div>
        </div>

        <p className="max-w-[70ch] text-sm leading-relaxed text-[var(--muted)]">
          Het tijdstip waarop een nieuwe dag begint voor de teller. Staat dit op 06:00, dan hoort een
          scan om 01:00 nog bij de avond ervoor en levert een tweede scan die nacht dus niets op. Kies
          niets tussen 02:00 en 03:00: dat uur bestaat niet bij de overgang naar zomertijd.
        </p>
      </div>
    </SaveForm>
  );
}
