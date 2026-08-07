'use client';

import { removeDriverAction, saveDriverNoteAction } from '@/app/actions/beheer';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import { SaveForm } from '@/components/ui/save-form';
import type { DriverPoolEntry } from '@/lib/uitleen-server';

const inputClass = 'h-9 w-full rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

function tripsLabel(entry: DriverPoolEntry): string {
  if (entry.upcomingTrips > 0) {
    return `${entry.upcomingTrips} komende rit${entry.upcomingTrips === 1 ? '' : 'ten'}`;
  }
  if (entry.totalTrips > 0) {
    return `${entry.totalTrips} rit${entry.totalTrips === 1 ? '' : 'ten'} gereden`;
  }
  return 'nog geen ritten';
}

function removeDescription(entry: DriverPoolEntry): string {
  const base = `${entry.name} verdwijnt uit de chauffeurskeuze bij een rit.`;
  if (entry.upcomingTrips === 1) {
    return `${base} De rit die al toegewezen is, blijft staan; ${entry.name} blijft die ook zien. Wil je die rit aan iemand anders geven, wijs er dan eerst een andere chauffeur aan toe.`;
  }
  if (entry.upcomingTrips > 1) {
    return `${base} De ${entry.upcomingTrips} ritten die al toegewezen zijn, blijven staan; ${entry.name} blijft ze ook zien. Wil je die ritten aan iemand anders geven, wijs ze dan eerst een andere chauffeur toe.`;
  }
  return `${base} De historiek van gereden ritten blijft bewaard.`;
}

function DriverRow({ entry }: { entry: DriverPoolEntry }) {
  return (
    <li className="rounded-[14px] border border-vtk-navy/10 bg-vtk-paper/40 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-vtk-ink">{entry.name}</span>
            {entry.inactive ? (
              <span className="rounded-full bg-vtk-navy/8 px-2.5 py-0.5 text-xs font-semibold text-vtk-muted">
                Gedeactiveerd
              </span>
            ) : null}
          </p>
          <p className="mt-0.5 truncate text-sm text-vtk-muted">
            {entry.email} · {tripsLabel(entry)}
          </p>
          {entry.note ? <p className="mt-1 text-sm text-vtk-body">{entry.note}</p> : null}
        </div>

        {entry.driverRowId ? (
          <ConfirmActionButton
            label={`Uit chauffeurslijst halen: ${entry.name}`}
            confirmLabel="Uit chauffeurslijst halen"
            icon={<LogisticsIcon name="close" className="h-4 w-4" />}
            successMessage="Chauffeur uit de lijst gehaald."
            action={removeDriverAction.bind(null, entry.driverRowId)}
            destructive
            dialogTitle="Uit de chauffeurslijst halen?"
            dialogDescription={removeDescription(entry)}
          />
        ) : null}
      </div>

      {entry.driverRowId ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-semibold text-vtk-navy">
            {entry.note ? 'Notitie bewerken' : 'Notitie toevoegen'}
          </summary>
          <SaveForm
            action={saveDriverNoteAction}
            submitLabel="Opslaan"
            savingLabel="Opslaan..."
            savedMessage="Notitie opgeslagen."
            errorMessages={{ NOT_FOUND: 'Deze chauffeur staat niet meer in de lijst.' }}
            className="mt-2 grid gap-2 sm:max-w-md"
          >
            <input type="hidden" name="driverRowId" value={entry.driverRowId} />
            <input
              type="text"
              name="note"
              defaultValue={entry.note ?? ''}
              placeholder="bv. rijbewijs B, rijdt niet met de kar"
              className={inputClass}
            />
          </SaveForm>
        </details>
      ) : null}
    </li>
  );
}

/**
 * De volledige chauffeurslijst: eerst wie via de post Logistiek chauffeur is,
 * daarna wie het team zelf toevoegde. Beide groepen staan in dezelfde lijst,
 * want dit is precies de keuzelijst die je bij een rit te zien krijgt.
 */
export function DriverList({ drivers }: { drivers: DriverPoolEntry[] }) {
  const fromPost = drivers.filter((driver) => driver.source === 'POST');
  const extra = drivers.filter((driver) => driver.source === 'EXTRA');

  return (
    <div className="grid gap-5">
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-vtk-ink">Post Logistiek ({fromPost.length})</h3>
          <p className="text-xs text-vtk-muted">Beheer je op vtk.be</p>
        </div>
        {fromPost.length === 0 ? (
          <p className="mt-2 text-sm text-vtk-muted">De post heeft dit werkingsjaar nog geen leden.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {fromPost.map((entry) => (
              <DriverRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-vtk-ink">Zelf toegevoegd ({extra.length})</h3>
        {extra.length === 0 ? (
          <p className="mt-2 text-sm text-vtk-muted">Nog niemand toegevoegd.</p>
        ) : (
          <ul className="mt-3 grid gap-2">
            {extra.map((entry) => (
              <DriverRow key={entry.id} entry={entry} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
