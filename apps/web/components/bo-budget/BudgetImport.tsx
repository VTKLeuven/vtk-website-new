'use client';

import { useState } from 'react';
import { Button, ConfirmDialog } from '@vtk/ui';
import { FileField } from '@/components/ui/FileField';
import { SaveForm } from '@/components/ui/SaveForm';
import { useToast } from '@/components/ui/toast';
import { UNSENT, unsentGuard } from '@/components/ui/unsentGuard';
import { importBudgetFilesAction, importMeetingFromDriveAction } from '@/app/actions/boBudgets';

/*
 * Rekenbladen die al langs het BO passeerden, als budgetten op de site zetten:
 * door ze op te laden, of rechtstreeks uit de map van een BO in Drive. Zo kan
 * de kring de site met echte cijfers beoordelen. Enkel Groep 5 ziet dit.
 *
 * In Drive verandert er niets, en wat iemand op de site zelf opstelde, blijft
 * staan: een import vervangt enkel wat zelf uit een rekenblad kwam.
 */

export function BudgetUpload({ locale, defaultDate }: { locale: 'nl' | 'en'; defaultDate?: string | null }) {
  const nl = locale === 'nl';
  return (
    <section className="vtk-bud-card vtk-fold-import" aria-labelledby="bud-import-h">
      <h2 id="bud-import-h" className="vtk-bud-h2">
        {nl ? 'Rekenbladen opladen' : 'Upload spreadsheets'}
      </h2>
      <p className="vtk-bud-fine">
        {nl
          ? 'Kies de bladen uit de map Budgetten of Resultaten van een BO (.xlsx; uit Sheets: Bestand > Downloaden). De post en de activiteit leest de site uit de bestandsnaam (26-27_Budget_<post>_<activiteit>). Elk blad wordt een budget op de site met dezelfde regels en hetzelfde totaal; een resultaatblad vult het resultaat van hetzelfde budget in.'
          : 'Choose the sheets from a meeting’s Budgetten or Resultaten folder (.xlsx). The post and the activity are read from the file name.'}
      </p>
      <SaveForm
        action={importBudgetFilesAction}
        submitLabel={nl ? 'Op de site zetten' : 'Put on the site'}
        savingLabel={nl ? 'Bladen lezen…' : 'Reading sheets…'}
        savedMessage={nl ? 'Rekenbladen overgenomen' : 'Spreadsheets imported'}
        fallbackErrorMessage={nl ? 'Overnemen lukte niet. Probeer het opnieuw.' : 'Import failed. Try again.'}
        errorMessages={{
          NO_FILE: nl ? 'Kies eerst een of meer rekenbladen.' : 'Choose one or more spreadsheets first.',
          TOO_MANY_FILES: nl ? 'Hoogstens 80 bestanden per keer.' : 'At most 80 files at a time.',
          INVALID_DATE: nl ? 'Die datum klopt niet.' : 'That date is not valid.',
        }}
        className="space-y-3"
      >
        <FileField
          name="files"
          accept=".xlsx"
          multiple
          required
          locale={locale}
          hint={nl ? 'Meer bestanden tegelijk kan: sleep de hele map erin.' : 'Several files at once is fine.'}
        />
        <label className="vtk-bud-field">
          <span className="vtk-bud-label">{nl ? 'Het BO waarop ze passeerden' : 'The meeting they passed'}</span>
          <input
            type="date"
            name="targetDate"
            className="vtk-bud-input vtk-bud-date"
            defaultValue={defaultDate ?? ''}
          />
        </label>
      </SaveForm>
    </section>
  );
}

export function DriveImportButton({
  meetingId,
  label,
  files,
  locale,
}: {
  meetingId: string;
  label: string;
  files: number;
  locale: 'nl' | 'en';
}) {
  const nl = locale === 'nl';
  const showToast = useToast();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    const result = await unsentGuard.run(() => importMeetingFromDriveAction({ meetingId }));
    setBusy(false);
    if (result === UNSENT) return;
    if (result.status === 'success')
      showToast({ message: `${label}: ${result.detail ?? ''}`, variant: 'success', duration: 12000 });
    else if (result.status === 'error')
      showToast({
        message:
          result.code === 'NO_DRIVE'
            ? nl
              ? 'De koppeling met Drive staat niet aan op deze server. Laad de bladen op in plaats daarvan.'
              : 'The Drive connection is not set up on this server. Upload the sheets instead.'
            : (result.detail ?? (nl ? 'Overnemen lukte niet. Probeer het opnieuw.' : 'Import failed. Try again.')),
        variant: 'error',
        duration: 0,
      });
  }

  return (
    <>
      <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAsking(true)}>
        {busy
          ? nl
            ? 'Bladen uit Drive lezen…'
            : 'Reading from Drive…'
          : nl
            ? 'Bladen van deze BO op de site zetten'
            : 'Put this meeting’s sheets on the site'}
      </Button>
      <ConfirmDialog
        open={asking}
        title={nl ? `De bladen van ${label} op de site zetten?` : `Put the sheets of ${label} on the site?`}
        description={
          nl
            ? `De site leest de ${files} rekenbladen van deze BO uit Drive en maakt er budgetten van, met dezelfde regels en hetzelfde totaal. In Drive verandert niets. Budgetten die iemand op de site zelf opstelde, blijven zoals ze zijn; wat eerder uit een rekenblad kwam, wordt vervangen door de versie van nu.`
            : `The site reads the ${files} spreadsheets of this meeting from Drive and turns them into budgets. Nothing changes in Drive. Budgets drawn up on the site stay as they are.`
        }
        confirmLabel={nl ? 'Op de site zetten' : 'Put on the site'}
        cancelLabel={nl ? 'Annuleren' : 'Cancel'}
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          void run();
        }}
      />
    </>
  );
}
