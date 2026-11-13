'use client';

import { FileField } from '@/components/ui/FileField';
import { SaveForm } from '@/components/ui/SaveForm';
import { uploadBegrotingAction } from '@/app/actions/boBudgets';

/*
 * De begroting van het werkingsjaar opladen: het rekenblad van Beheer, met per
 * post een tabblad. De site bewaart enkel de lijnen (naam en totaal), zodat een
 * post bij haar budget de lijn kiest in plaats van het bedrag over te typen.
 * Opnieuw opladen vervangt de vorige versie; budgetten houden het bedrag dat ze
 * toen overnamen, en melden het wanneer hun lijn niet meer bestaat.
 */

export function BegrotingUpload({
  current,
  locale,
}: {
  current: { fileName: string; uploadedAt: string; sheets: { name: string; lines: number }[] } | null;
  locale: 'nl' | 'en';
}) {
  const nl = locale === 'nl';
  return (
    <section className="vtk-bud-card" aria-labelledby="bud-begr-h">
      <h2 id="bud-begr-h" className="vtk-bud-h2">
        {nl ? 'Begroting van het werkingsjaar' : 'Yearly budget'}
      </h2>
      <p className="vtk-bud-fine">
        {nl
          ? 'Laad het rekenblad van de begroting op (.xlsx, met per post een tabblad en de kolommen Beschrijving, Aantal, Eenheidsbedrag en Totaal). Een post kiest daarna bij haar budget de lijn uit de begroting, en de site telt budgetten op dezelfde lijn samen als één potje.'
          : 'Upload the yearly budget workbook (.xlsx, one sheet per post with the columns Beschrijving, Aantal, Eenheidsbedrag and Totaal).'}
      </p>
      {current ? (
        <p className="vtk-bud-fine">
          <b>{current.fileName}</b>, {nl ? 'opgeladen op' : 'uploaded on'}{' '}
          {new Date(current.uploadedAt).toLocaleString(nl ? 'nl-BE' : 'en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Brussels',
          })}
          : {current.sheets.map((s) => `${s.name} (${s.lines})`).join(', ')}.
        </p>
      ) : (
        <p className="vtk-bud-fine">{nl ? 'Er is nog geen begroting opgeladen.' : 'No yearly budget uploaded yet.'}</p>
      )}
      <SaveForm
        action={uploadBegrotingAction}
        submitLabel={
          current
            ? nl
              ? 'Begroting vervangen'
              : 'Replace yearly budget'
            : nl
              ? 'Begroting opladen'
              : 'Upload yearly budget'
        }
        savingLabel={nl ? 'Inlezen…' : 'Reading…'}
        savedMessage={nl ? 'Begroting ingelezen' : 'Yearly budget read'}
        fallbackErrorMessage={nl ? 'Opladen lukte niet. Probeer het opnieuw.' : 'Upload failed. Try again.'}
        errorMessages={{
          NO_FILE: nl ? 'Kies eerst het rekenblad van de begroting.' : 'Choose the workbook first.',
          FILE_TOO_LARGE: nl ? 'Dat bestand is groter dan 15 MB.' : 'That file is larger than 15 MB.',
          UNREADABLE: nl
            ? 'Dat bestand kan de site niet lezen. Download de begroting uit Sheets als .xlsx.'
            : 'The site cannot read that file. Download it from Sheets as .xlsx.',
          NO_LINES: nl
            ? 'In dat bestand staat geen tabblad met de kolommen Beschrijving en Totaal.'
            : 'That file has no sheet with the columns Beschrijving and Totaal.',
        }}
        className="space-y-3"
      >
        <FileField
          name="file"
          accept=".xlsx"
          required
          locale={locale}
          hint={nl ? 'Enkel .xlsx, hoogstens 15 MB.' : 'Only .xlsx, at most 15 MB.'}
        />
      </SaveForm>
    </section>
  );
}
