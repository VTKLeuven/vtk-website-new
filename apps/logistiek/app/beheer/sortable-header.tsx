'use client';

import { useState } from 'react';
import { SortIndicator, sortChipClass, type SortDir } from './sort';

/**
 * Sorteren in een beheertabel die de client al volledig in handen heeft
 * (inventaris, flesserke, chauffeurs).
 *
 * De client-only helft van het sorteerpatroon; de pil, de pijl en `compareText`
 * staan in `sort.tsx`, dat ook de server-gerenderde lijsten gebruiken. Zie de
 * uitleg daar voor waarom dat gesplitst is.
 *
 * **Een tweede klik op dezelfde kolom draait de richting om.** Een andere kolom
 * begint bij oplopend: springen naar de laatste rij van een lijst waarop je nog
 * niet sorteerde, is nooit wat je bedoelde.
 */

export type { SortDir };

export function useSort<K extends string>(initialKey: K) {
  const [key, setKey] = useState<K>(initialKey);
  const [dir, setDir] = useState<SortDir>('asc');
  function toggle(next: K) {
    if (next === key) {
      setDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setKey(next);
      setDir('asc');
    }
  }
  return { key, dir, toggle };
}

/** Eén sorteerbare kolomkop in een tabel. */
export function SortHeader<K extends string>({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
  className,
}: {
  label: string;
  sortKey: K;
  activeKey: K;
  dir: SortDir;
  onSort: (key: K) => void;
  className?: string;
}) {
  const active = activeKey === sortKey;
  return (
    <th
      className={`py-2 pr-3 font-medium ${className ?? ''}`}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="inline-flex items-center gap-1 text-xs font-medium text-vtk-muted transition hover:text-vtk-ink"
      >
        {label}
        {/* Een kolomkop is smal, dus hier een klein driehoekje in plaats van de
            pijl uit `SortIndicator`: de inactieve kolommen dragen een dof
            dubbelpijltje zodat je ziet dát er te sorteren valt. */}
        <span className={`text-[9px] leading-none ${active ? 'text-vtk-ink' : 'text-vtk-navy/25'}`}>
          {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
        {active ? (
          <span className="sr-only">{dir === 'asc' ? '(oplopend)' : '(aflopend)'}</span>
        ) : null}
      </button>
    </th>
  );
}

/**
 * Een rij sorteerknoppen voor een lijst zonder tabelkop (de chauffeurslijst).
 *
 * Dezelfde vorm als `SortChipLinks` in `sort.tsx`, maar met een callback in
 * plaats van een href: deze lijst sorteert in de browser en zet niets in de URL.
 */
export function SortChips<K extends string>({
  options,
  activeKey,
  dir,
  onSort,
  label = 'Sorteren op',
}: {
  options: ReadonlyArray<{ key: K; label: string }>;
  activeKey: K;
  dir: SortDir;
  onSort: (key: K) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="Sorteren">
      <span className="text-vtk-muted">{label}</span>
      {options.map((option) => {
        const active = activeKey === option.key;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onSort(option.key)}
            aria-pressed={active}
            className={sortChipClass(active)}
          >
            {option.label}
            <SortIndicator active={active} dir={dir} />
          </button>
        );
      })}
    </div>
  );
}
