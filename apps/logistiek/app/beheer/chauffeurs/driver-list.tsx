'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import {
  removeDriverAction,
  saveDriverNoteAction,
  setDriverColorAction,
  setDriverVanAction,
} from '@/app/actions/beheer';
import { DRIVER_COLOR_COUNT, driverColorIndex, driverColorVar } from '@/lib/driver-colors';
import { useToast } from '@/components/ui/toast';
import { ConfirmActionButton } from '@/components/ui/confirm-action-button';
import { LogisticsIcon } from '@/components/logistics-icon';
import { SaveForm } from '@/components/ui/save-form';
import { compareText, useSort, type SortDir } from '@/app/beheer/sortable-header';
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

/**
 * De kleur van deze chauffeur in de transportplanning (K1).
 *
 * Acht bolletjes en geen kleurkiezer: de tinten komen uit `app/globals.css` en
 * zijn gekozen om naast elkaar te onderscheiden en donkere tekst leesbaar te
 * houden. Een vrije kleurkiezer zou daar binnen een maand een donkerblauw en een
 * knalgeel tussen zetten.
 *
 * De negende knop zet hem terug op de kleur die uit zijn id volgt. Die
 * standaardkleur staat er als bolletje bij, want "standaard" is hier een kleur
 * en geen leegte.
 */
function DriverColorPicker({ entry }: { entry: DriverPoolEntry }) {
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const active = entry.colorIndex;
  const fallback = driverColorIndex(entry.id);

  function choose(colorIndex: number | null) {
    startTransition(async () => {
      const result = await setDriverColorAction(entry.id, colorIndex);
      if (result.ok) {
        showToast({ message: result.message ?? 'Opgeslagen.', variant: 'success' });
      } else {
        showToast({ message: result.error, variant: 'error', duration: 0 });
      }
    });
  }

  return (
    <div className="mt-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">
        Kleur in de planning
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {Array.from({ length: DRIVER_COLOR_COUNT }, (_, index) => index + 1).map((index) => (
          <button
            key={index}
            type="button"
            disabled={pending}
            onClick={() => choose(index)}
            aria-pressed={active === index}
            title={`Kleur ${index}`}
            className={`h-6 w-6 rounded-full border transition disabled:opacity-50 ${
              active === index
                ? 'border-vtk-navy ring-2 ring-vtk-navy/40'
                : 'border-vtk-navy/20 hover:border-vtk-navy/50'
            }`}
            style={{ backgroundColor: `var(--driver-${index})` }}
          >
            <span className="sr-only">
              Kleur {index} voor {entry.name}
            </span>
          </button>
        ))}
        <button
          type="button"
          disabled={pending || active === null}
          onClick={() => choose(null)}
          aria-pressed={active === null}
          title="Terug op de standaardkleur"
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:opacity-50 ${
            active === null
              ? 'border-vtk-navy bg-vtk-navy/5 text-vtk-ink'
              : 'border-vtk-navy/20 text-vtk-muted hover:border-vtk-navy/50'
          }`}
        >
          <span
            aria-hidden
            className="h-3 w-3 rounded-full border border-vtk-navy/20"
            style={{ backgroundColor: driverColorVar(entry.id) }}
          />
          Standaard
          <span className="sr-only">kleur voor {entry.name}</span>
        </button>
      </div>
      {active !== null && active === fallback ? (
        <p className="mt-1 text-xs text-vtk-muted">
          Dit is toevallig ook de standaardkleur van {entry.name}.
        </p>
      ) : null}
    </div>
  );
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
          <dl className="mt-2 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">E-mail</dt>
              <dd className="mt-0.5 break-all text-vtk-body">{entry.email}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">Ritten</dt>
              <dd className="mt-0.5 text-vtk-body">
                {/* Klikbaar (T9): "2 ritten gereden" riep de vraag op wélke, en
                    of niet altijd dezelfde persoon de late ritten krijgt. */}
                {entry.totalTrips > 0 || entry.upcomingTrips > 0 ? (
                  <Link
                    href={`/beheer/chauffeurs/${entry.id}`}
                    className="font-medium text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
                  >
                    {tripsLabel(entry)}
                  </Link>
                ) : (
                  tripsLabel(entry)
                )}
              </dd>
            </div>
          </dl>
          {entry.note ? <p className="mt-1 text-sm text-vtk-body">{entry.note}</p> : null}
          <DriverColorPicker entry={entry} />
        </div>

        {/* De karvlag staat naast de naam en niet in de notitie: de keuzelijst
            bij een rit met de kar splitst hierop, en vrije tekst kan dat niet.
            Bewust tekst en geen icoon, in tegenstelling tot de knoppen ernaast:
            dit is geen actie op de rij maar een instelling met twee toestanden,
            en een icoon toont de uit-stand enkel als "hetzelfde, maar vager".
            Het eerdere aanhangwagen-icoon las bovendien als een auto, terwijl
            "de kar" bij VTK de bestelwagen is. */}
        <ConfirmActionButton
          label={entry.canDriveVan ? 'Rijdt met de kar' : 'Niet met de kar'}
          srLabel={
            entry.canDriveVan
              ? `${entry.name} rijdt met de kar; klik om dat weg te halen`
              : `${entry.name} rijdt niet met de kar; klik om dat aan te zetten`
          }
          variant={entry.canDriveVan ? 'secondary' : 'ghost'}
          successMessage={entry.canDriveVan ? 'Rijdt niet met de kar.' : 'Rijdt ook met de kar.'}
          action={setDriverVanAction.bind(null, entry.id, !entry.canDriveVan)}
          confirm={false}
        />

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
type DriverSortKey = 'name' | 'trips' | 'van';

/** Sorteert binnen een groep; de groepen zelf blijven staan waar ze staan. */
function sortDrivers(
  drivers: DriverPoolEntry[],
  key: DriverSortKey,
  dir: SortDir
): DriverPoolEntry[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...drivers].sort((a, b) => {
    if (key === 'trips') {
      const diff = a.totalTrips + a.upcomingTrips - (b.totalTrips + b.upcomingTrips);
      return diff !== 0 ? diff * factor : compareText(a.name, b.name, 'asc');
    }
    if (key === 'van') {
      const diff = Number(a.canDriveVan) - Number(b.canDriveVan);
      return diff !== 0 ? diff * factor : compareText(a.name, b.name, 'asc');
    }
    return compareText(a.name, b.name, dir);
  });
}

export function DriverList({ drivers }: { drivers: DriverPoolEntry[] }) {
  // Sorteren binnen de twee groepen (T10). De groepen zelf blijven gescheiden:
  // wie via de post chauffeur is, beheer je op vtk.be en wie je zelf toevoegde
  // hier, en die twee door elkaar husselen maakt niet duidelijker wie wat is.
  const { key, dir, toggle } = useSort<DriverSortKey>('name');
  const fromPost = sortDrivers(
    drivers.filter((driver) => driver.source === 'POST'),
    key,
    dir
  );
  const extra = sortDrivers(
    drivers.filter((driver) => driver.source === 'EXTRA'),
    key,
    dir
  );

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-vtk-muted">Sorteren op</span>
        {(
          [
            ['name', 'Naam'],
            ['trips', 'Aantal ritten'],
            ['van', 'Rijdt met de kar'],
          ] as Array<[DriverSortKey, string]>
        ).map(([sortKey, label]) => (
          <button
            key={sortKey}
            type="button"
            onClick={() => toggle(sortKey)}
            aria-pressed={key === sortKey}
            className={`rounded-full border px-3 py-1 font-medium transition ${
              key === sortKey
                ? 'border-vtk-navy bg-vtk-navy text-white'
                : 'border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40'
            }`}
          >
            {label}
            {key === sortKey ? <span aria-hidden="true"> {dir === 'asc' ? '↑' : '↓'}</span> : null}
          </button>
        ))}
      </div>
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
