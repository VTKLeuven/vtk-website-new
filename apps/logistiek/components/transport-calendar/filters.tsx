'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { driverColorVar, type DriverColorOverrides } from '@/lib/driver-colors';
import {
  NO_DRIVER,
  REQUESTER_TYPES,
  REQUESTER_TYPE_FILTER_LABELS,
  TRIP_STATUSES,
  TRIP_STATUS_LABELS,
  countActiveFilters,
  filtersToQuery,
  type TransportFilters,
} from '@/lib/transport-filters';
import { LogisticsIcon } from '@/components/logistics-icon';

/**
 * De filters van de transportplanning (P3).
 *
 * Ze staan in de URL, net als de weergave en de datum: de query haalt dan
 * precies op wat je ziet, een gefilterde week is deelbaar, en de terugknop werkt.
 * Daarnaast onthoudt de browser je laatste keuze, zoals de kalenderfilters op
 * /beheer/kalender dat al doen: wie enkel met de kar bezig is, wil dat morgen
 * niet opnieuw aanvinken.
 *
 * Eén knop met een teller, ook op een breed scherm. Vier groepen aanvinkbare
 * pillen open in de werkbalk duwen de kalender zelf onder de vouw, en dat is net
 * waar je naar kijkt; op een telefoon is er helemaal geen plaats voor. De teller
 * op de knop plus de zin onder de kalender zeggen wát er verborgen is, zodat een
 * gefilterde week niet als een lege week leest.
 */

/** Waar de laatst gekozen filters blijven staan, per browser. */
const STORAGE_KEY = 'logistiek.transportplanning.filters';

export type FilterOption = { id: string; name: string };

export function TransportFilterBar({
  filters,
  vehicles,
  drivers,
  driverColors,
}: {
  filters: TransportFilters;
  vehicles: FilterOption[];
  drivers: FilterOption[];
  driverColors?: DriverColorOverrides;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const active = countActiveFilters(filters);

  /**
   * De filters uit de vorige keer terugzetten, maar enkel wanneer je zonder één
   * parameter binnenkomt (dus via de navigatie). Hetzelfde stramien als
   * `app/beheer/kalender/kalender-filters.tsx`.
   *
   * Die voorwaarde is streng met opzet: een gedeelde link naar een bepaalde week
   * mag niet overschreven worden door wat er toevallig in deze browser stond, en
   * "alles tonen" moet blijven werken zodra je het aanklikt.
   *
   * Voertuigen en chauffeurs die niet meer bestaan vallen weg, anders filtert een
   * bewaarde keuze op een id dat nergens meer voorkomt en blijft de kalender leeg
   * zonder dat je ziet waarom.
   */
  useEffect(() => {
    if (window.location.search !== '') return;
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return; /* privévenster */
    }
    if (!saved) return;
    const stored = new URLSearchParams(saved);
    const keep = (key: string, known: readonly string[]) => {
      const values = (stored.get(key) ?? '').split(',').filter((id) => known.includes(id));
      if (values.length > 0) stored.set(key, values.join(','));
      else stored.delete(key);
    };
    keep('voertuig', vehicles.map((vehicle) => vehicle.id));
    keep('chauffeur', [NO_DRIVER, ...drivers.map((driver) => driver.id)]);
    const query = stored.toString();
    if (!query) return;
    router.replace(`${pathname}?${query}`);
    // Enkel bij het openen van de pagina; daarna stuurt de URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function apply(next: TransportFilters) {
    const query = new URLSearchParams(params.toString());
    for (const key of ['voertuig', 'chauffeur', 'status', 'aanvrager']) query.delete(key);
    const added = filtersToQuery(next);
    for (const [key, value] of Object.entries(added)) query.set(key, value);
    try {
      window.localStorage.setItem(STORAGE_KEY, new URLSearchParams(added).toString());
    } catch {
      /* niet kunnen onthouden mag het filteren niet tegenhouden */
    }
    const search = query.toString();
    router.push(search ? `${pathname}?${search}` : pathname);
  }

  function toggle<K extends keyof TransportFilters>(key: K, value: string) {
    const current = filters[key] as string[];
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)
      : [...current, value];
    apply({ ...filters, [key]: next } as TransportFilters);
  }

  // Buiten het paneel klikken sluit het, zoals bij elk uitklapmenu.
  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (panel.current && !panel.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups = (
    <>
      <FilterGroup
        label="Voertuig"
        options={vehicles}
        selected={filters.vehicleIds}
        onToggle={(id) => toggle('vehicleIds', id)}
      />
      <FilterGroup
        label="Chauffeur"
        options={[{ id: NO_DRIVER, name: 'Nog geen' }, ...drivers]}
        selected={filters.driverIds}
        onToggle={(id) => toggle('driverIds', id)}
        swatch={(id) => (id === NO_DRIVER ? 'var(--driver-none)' : driverColorVar(id, driverColors))}
      />
      <FilterGroup
        label="Status"
        options={TRIP_STATUSES.map((status) => ({ id: status, name: TRIP_STATUS_LABELS[status] }))}
        selected={filters.statuses}
        onToggle={(id) => toggle('statuses', id)}
      />
      <FilterGroup
        label="Aanvrager"
        options={REQUESTER_TYPES.map((type) => ({
          id: type,
          name: REQUESTER_TYPE_FILTER_LABELS[type],
        }))}
        selected={filters.requesterTypes}
        onToggle={(id) => toggle('requesterTypes', id)}
      />
    </>
  );

  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
          active > 0
            ? 'border-vtk-navy bg-vtk-navy text-white'
            : 'border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40'
        }`}
      >
        <LogisticsIcon name="request" className="h-4 w-4" />
        Filters
        {active > 0 ? <span className="tabular-nums">({active})</span> : null}
        <LogisticsIcon
          name="chevron"
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="absolute left-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-[16px] border border-vtk-navy/15 bg-vtk-surface p-4 shadow-lg">
          <div className="grid gap-4">{groups}</div>
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-vtk-navy/10 pt-3">
            <button
              type="button"
              onClick={() =>
                apply({ vehicleIds: [], driverIds: [], statuses: [], requesterTypes: [] })
              }
              disabled={active === 0}
              className="text-sm font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4 disabled:text-vtk-muted disabled:no-underline"
            >
              Alles tonen
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full border border-vtk-navy/15 px-3 py-1 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40"
            >
              Sluiten
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Eén groep aanvinkbare pillen. Geen keuzelijst met meervoudige selectie: die is
 * op een telefoon nauwelijks te bedienen, en je ziet er niet aan af wat er
 * aanstaat zonder ze te openen.
 */
function FilterGroup({
  label,
  options,
  selected,
  onToggle,
  swatch,
}: {
  label: string;
  options: FilterOption[];
  selected: readonly string[];
  onToggle: (id: string) => void;
  /** Kleurstip voor de chauffeurs, zodat de filter dezelfde taal spreekt als de kalender. */
  swatch?: (id: string) => string;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">
        {label}
        {selected.length === 0 ? <span className="ml-1.5 font-normal normal-case">alles</span> : null}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((option) => {
          const on = selected.includes(option.id);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => onToggle(option.id)}
              aria-pressed={on}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                on
                  ? 'border-vtk-navy bg-vtk-navy/5 text-vtk-ink'
                  : 'border-vtk-navy/15 text-vtk-muted hover:border-vtk-navy/40'
              }`}
            >
              {swatch ? (
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full border border-vtk-navy/20"
                  style={{ backgroundColor: swatch(option.id) }}
                />
              ) : null}
              {option.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
