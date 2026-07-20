'use client';

import { useState } from 'react';

export type SortDir = 'asc' | 'desc';

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

export function compareText(a: string, b: string, dir: SortDir): number {
  return a.localeCompare(b, 'nl', { sensitivity: 'base' }) * (dir === 'asc' ? 1 : -1);
}

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
        <span className={`text-[9px] leading-none ${active ? 'text-vtk-ink' : 'text-vtk-navy/25'}`}>
          {active ? (dir === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}
