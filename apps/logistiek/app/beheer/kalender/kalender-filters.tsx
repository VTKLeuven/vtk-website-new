'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { CALENDAR_KINDS, KIND_LABELS, type CalendarKind } from './kalender-kinds';

/** Onthoudt welke soorten en voertuigen je laatst aanvinkte. */
const STORAGE_KEY = 'logistiek.kalender.filters';

type Stored = { kinds: CalendarKind[]; vehicleIds: string[] };

function isStored(value: unknown): value is Stored {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<Stored>;
  return Array.isArray(candidate.kinds) && Array.isArray(candidate.vehicleIds);
}

export function KalenderFilters({
  vehicles,
  kinds,
  vehicleIds,
  from,
  to,
  presetDays,
}: {
  vehicles: Array<{ id: string; name: string }>;
  kinds: CalendarKind[];
  /** Leeg = alle voertuigen. */
  vehicleIds: string[];
  /** "YYYY-MM-DD". */
  from: string;
  to: string;
  /** Aantal dagen als het bereik exact een snelkeuze is, anders null. */
  presetDays: number | null;
}) {
  const router = useRouter();

  const allKinds = kinds.length === CALENDAR_KINDS.length;
  const filtersActive = !allKinds || vehicleIds.length > 0;

  function apply(next: {
    kinds?: CalendarKind[];
    vehicleIds?: string[];
    from?: string;
    to?: string;
  }) {
    const nextKinds = next.kinds ?? kinds;
    const nextVehicles = next.vehicleIds ?? vehicleIds;
    const params = new URLSearchParams();
    // Alles aangevinkt is de standaard en hoeft niet in de URL te staan.
    if (nextKinds.length !== CALENDAR_KINDS.length) params.set('soort', nextKinds.join(','));
    if (nextVehicles.length > 0) params.set('voertuig', nextVehicles.join(','));
    params.set('van', next.from ?? from);
    params.set('tot', next.to ?? to);
    router.push(`/beheer/kalender?${params.toString()}`);
  }

  function toggleKind(kind: CalendarKind) {
    const next = kinds.includes(kind) ? kinds.filter((k) => k !== kind) : [...kinds, kind];
    apply({ kinds: next });
  }

  // Geen selectie betekent "alle voertuigen"; de vinkjes staan dan allemaal aan.
  const shownVehicleIds = vehicleIds.length === 0 ? vehicles.map((v) => v.id) : vehicleIds;

  function toggleVehicle(id: string) {
    const next = shownVehicleIds.includes(id)
      ? shownVehicleIds.filter((v) => v !== id)
      : [...shownVehicleIds, id];
    if (next.length === 0) {
      // Het laatste voertuig uitvinken betekent: helemaal geen ritten tonen.
      apply({ kinds: kinds.filter((k) => k !== 'vervoer'), vehicleIds: [] });
      return;
    }
    apply({ vehicleIds: next.length === vehicles.length ? [] : next });
  }

  function shiftDays(days: number) {
    const start = new Date(`${from}T00:00:00.000Z`);
    const end = new Date(start.getTime() + days * 24 * 60 * 60 * 1000);
    apply({ to: end.toISOString().slice(0, 10) });
  }

  // Bewaren wat je aanvinkte. Bewust niet de datums: een bereik dat je drie
  // weken geleden koos, is bij je volgende bezoek geen zinvolle standaard meer.
  useEffect(() => {
    const value: Stored = { kinds, vehicleIds };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  }, [kinds, vehicleIds]);

  // Herstellen zodra je zonder parameters binnenkomt (via de navigatie).
  useEffect(() => {
    if (window.location.search !== '') return;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isStored(parsed)) return;
    const storedKinds = parsed.kinds.filter((k): k is CalendarKind =>
      (CALENDAR_KINDS as readonly string[]).includes(k)
    );
    const storedVehicles = parsed.vehicleIds.filter((id) => vehicles.some((v) => v.id === id));
    if (storedKinds.length === CALENDAR_KINDS.length && storedVehicles.length === 0) return;
    const params = new URLSearchParams();
    if (storedKinds.length !== CALENDAR_KINDS.length) params.set('soort', storedKinds.join(','));
    if (storedVehicles.length > 0) params.set('voertuig', storedVehicles.join(','));
    router.replace(`/beheer/kalender?${params.toString()}`);
    // Enkel bij het openen van de pagina; daarna stuurt de URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkboxClass = 'h-4 w-4 accent-vtk-navy';
  const chipClass =
    'inline-flex cursor-pointer items-center gap-2 rounded-full border border-vtk-navy/15 px-3 py-1.5 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40';
  const activeChipClass =
    'inline-flex cursor-pointer items-center gap-2 rounded-full border border-vtk-navy bg-vtk-navy px-3 py-1.5 text-sm font-semibold text-white';
  const inputClass = 'h-9 rounded-lg border border-vtk-navy/15 bg-white px-2.5 text-sm text-vtk-ink';

  return (
    <div className="grid gap-3 rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-4">
      <fieldset className="flex flex-wrap items-center gap-2">
        <legend className="sr-only">Soort</legend>
        <span className="text-sm text-vtk-muted">Tonen</span>
        {CALENDAR_KINDS.map((kind) => {
          const checked = kinds.includes(kind);
          return (
            <label key={kind} className={checked ? activeChipClass : chipClass}>
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleKind(kind)}
                className={checkboxClass}
              />
              {KIND_LABELS[kind]}
            </label>
          );
        })}

        {vehicles.length > 0 ? (
          <>
            <span className="ml-2 text-sm text-vtk-muted">Voertuig</span>
            {vehicles.map((vehicle) => {
              const checked = shownVehicleIds.includes(vehicle.id);
              return (
                <label key={vehicle.id} className={checked ? activeChipClass : chipClass}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleVehicle(vehicle.id)}
                    className={checkboxClass}
                    disabled={!kinds.includes('vervoer')}
                  />
                  {vehicle.name}
                </label>
              );
            })}
          </>
        ) : null}
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 border-t border-vtk-navy/10 pt-3">
        <span className="text-sm text-vtk-muted">Periode</span>
        {[7, 30, 90].map((days) => (
          <button
            key={days}
            type="button"
            onClick={() => shiftDays(days)}
            aria-current={presetDays === days ? 'true' : undefined}
            className={presetDays === days ? activeChipClass : chipClass}
          >
            {days} dagen
          </button>
        ))}
        <label className="ml-2 flex items-center gap-2 text-sm text-vtk-muted">
          van
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => e.target.value && apply({ from: e.target.value })}
            className={inputClass}
          />
        </label>
        <label className="flex items-center gap-2 text-sm text-vtk-muted">
          tot
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => e.target.value && apply({ to: e.target.value })}
            className={inputClass}
          />
        </label>
        {filtersActive ? (
          <button
            type="button"
            onClick={() => router.push('/beheer/kalender')}
            className="ml-auto h-9 rounded-lg border border-vtk-navy/15 px-3 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40"
          >
            Filters wissen
          </button>
        ) : null}
      </div>
    </div>
  );
}
