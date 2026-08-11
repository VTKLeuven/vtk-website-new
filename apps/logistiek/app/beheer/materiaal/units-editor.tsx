'use client';

import { useState } from 'react';
import { ITEM_CONDITION_LABELS } from '@/lib/uitleen';
import type { AdminInventoryItem } from '@/lib/uitleen-server';

/**
 * De exemplaren van één item.
 *
 * Van vier frigo's kon er geen enkele als kapot gemarkeerd worden zonder ze alle
 * vier te markeren: `UitleenItem.condition` geldt voor de hele rij. Wie dat
 * onderscheid nodig heeft, splitst het item hier in exemplaren; wie het niet
 * nodig heeft, laat het staan en er verandert niets.
 *
 * Dit is een veld van het itemformulier, geen eigen formulier. Elk exemplaar had
 * hier een eigen "Bewaren" en dat gaf twee problemen: je moest per rij apart
 * opslaan (en wie dat vergat, verloor zijn wijziging), en React 19 reset na een
 * form action elk uncontrolled veld van dat formulier. De rijen die je nog niet
 * bewaard had, sprongen dus terug naar de waarde waarmee de pagina geladen was.
 * Nu staat alles in state, gaat het als JSON mee met het item, en is er één
 * opslaan-knop onderaan.
 */
const CONDITIONS = Object.entries(ITEM_CONDITION_LABELS).map(([value, label]) => ({ value, label }));

const inputClass =
  'h-9 min-w-0 rounded-lg border border-vtk-navy/15 bg-white px-3 text-sm text-vtk-ink';

type Row = {
  /** Sleutel voor React; blijft gelijk terwijl je typt, ook zonder id. */
  key: string;
  /** Leeg zolang het exemplaar nog niet in de database staat. */
  id: string;
  label: string;
  condition: string;
  conditionNote: string;
  active: boolean;
};

function toRow(unit: AdminInventoryItem['units'][number]): Row {
  return {
    key: unit.id,
    id: unit.id,
    label: unit.label,
    condition: unit.condition,
    conditionNote: unit.conditionNote ?? '',
    active: unit.active,
  };
}

/**
 * Staan ze allemaal weer op dezelfde staat, dan is de opsplitsing haar reden
 * kwijt en voegt het opslaan ze terug samen tot één rij.
 *
 * Kapot valt hier bewust buiten. Bij een item met exemplaren telt KAPOT niet mee
 * voor de voorraad, bij een item zonder exemplaren wel; vier kapotte frigo's
 * samenvoegen zou de voorraad dus van 0 naar 4 tillen.
 */
function isUniform(rows: Row[]): boolean {
  const first = rows[0];
  if (!first || first.condition === 'KAPOT') return false;
  return rows.every(
    (row) =>
      row.active &&
      row.condition === first.condition &&
      row.conditionNote.trim() === first.conditionNote.trim()
  );
}

export function UnitsEditor({ item }: { item: AdminInventoryItem }) {
  const [rows, setRows] = useState<Row[]>(() => item.units.map(toRow));
  const usable = rows.filter((row) => row.active && row.condition !== 'KAPOT').length;
  const uniform = isUniform(rows);

  const update = (key: string, patch: Partial<Row>) =>
    setRows((all) => all.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const split = () =>
    setRows(
      Array.from({ length: Math.max(item.quantity, 1) }, (_, index) => ({
        key: crypto.randomUUID(),
        id: '',
        label: String(index + 1),
        // De staat van de rij wordt de startstaat van elk exemplaar: dat is wat
        // het team tot nu toe bedoelde toen het de rij op TESTEN zette.
        condition: item.condition,
        conditionNote: item.conditionNote ?? '',
        active: true,
      }))
    );

  return (
    <div className="grid gap-3 rounded-[14px] border border-vtk-navy/10 bg-vtk-paper/50 p-4">
      <input
        type="hidden"
        name="units"
        value={JSON.stringify(
          rows.map((row) => ({
            id: row.id,
            label: row.label,
            condition: row.condition,
            conditionNote: row.conditionNote,
            active: row.active,
          }))
        )}
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-vtk-ink">Exemplaren</p>
          <p className="mt-1 text-xs text-vtk-muted">
            {rows.length === 0
              ? 'De staat geldt nu voor alle stuks samen. Splits het item op wanneer één stuk kapot kan zijn terwijl de rest werkt.'
              : 'De voorraad volgt hieruit: alles wat meetelt en niet kapot is. Reserveren gebeurt op het item, niet op een exemplaar.'}
          </p>
        </div>
        {rows.length > 0 ? (
          <p className="text-sm tabular-nums text-vtk-ink">
            <span className="font-semibold">{usable}</span> bruikbaar van {rows.length}
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <div>
          <button
            type="button"
            onClick={split}
            className="rounded-full bg-vtk-yellow px-3.5 py-1.5 text-sm font-semibold text-vtk-ink transition hover:brightness-95"
          >
            Opsplitsen in {Math.max(item.quantity, 1)} exemplaren
          </button>
          <p className="mt-2 text-xs text-vtk-muted">
            Zet {Math.max(item.quantity, 1)} exemplaren klaar met de huidige staat, genummerd 1 tot{' '}
            {Math.max(item.quantity, 1)}. Hernoem ze naar wat er op de kast staat en sla daarna op.
          </p>
        </div>
      ) : (
        <>
          <div className="grid gap-1">
            {rows.map((row, index) => (
              <div
                key={row.key}
                className={`grid items-end gap-2 rounded-[12px] border-b border-vtk-navy/5 px-2 py-2 last:border-0 sm:grid-cols-[7rem_9rem_minmax(0,1fr)_auto_auto] ${
                  row.condition === 'KAPOT' ? 'bg-red-50' : ''
                }`}
              >
                <label className="grid gap-1 text-[11px] font-medium text-vtk-muted">
                  Exemplaar
                  <input
                    type="text"
                    value={row.label}
                    onChange={(event) => update(row.key, { label: event.target.value })}
                    placeholder="Bv. Box 3"
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1 text-[11px] font-medium text-vtk-muted">
                  Staat
                  <select
                    value={row.condition}
                    onChange={(event) => update(row.key, { condition: event.target.value })}
                    className={inputClass}
                  >
                    {CONDITIONS.map((condition) => (
                      <option key={condition.value} value={condition.value}>
                        {condition.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-[11px] font-medium text-vtk-muted">
                  Notitie <span className="font-normal">(optioneel)</span>
                  <input
                    type="text"
                    value={row.conditionNote}
                    onChange={(event) => update(row.key, { conditionNote: event.target.value })}
                    placeholder="Bv. deur sluit niet"
                    className={inputClass}
                  />
                </label>
                <label className="flex h-9 items-center gap-2 text-xs font-medium text-vtk-ink">
                  <input
                    type="checkbox"
                    checked={row.active}
                    onChange={(event) => update(row.key, { active: event.target.checked })}
                    className="h-4 w-4"
                  />
                  Telt mee
                </label>
                <button
                  type="button"
                  onClick={() => setRows((all) => all.filter((entry) => entry.key !== row.key))}
                  className="grid h-9 w-9 place-items-center rounded-full border border-vtk-navy/15 text-vtk-muted transition hover:border-vtk-navy/40"
                  aria-label={`Exemplaar ${row.label || index + 1} verwijderen`}
                  title="Exemplaar verwijderen"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div>
            <button
              type="button"
              onClick={() =>
                setRows((all) => [
                  ...all,
                  {
                    key: crypto.randomUUID(),
                    id: '',
                    label: String(all.length + 1),
                    condition: 'WERKT',
                    conditionNote: '',
                    active: true,
                  },
                ])
              }
              className="rounded-full border border-vtk-navy/15 px-3.5 py-1.5 text-sm font-semibold text-vtk-ink transition hover:border-vtk-navy/40 hover:bg-vtk-paper"
            >
              Exemplaar toevoegen
            </button>
          </div>

          <p className="text-xs text-vtk-muted">
            Zet een exemplaar dat er even niet is (uitgeleend voor lang, kwijt, in herstelling) op
            niet meetellen: het blijft in de lijst staan maar telt niet in de voorraad. Verwijderen
            doe je enkel voor een tikfout.
          </p>

          {uniform ? (
            <p className="rounded-[12px] bg-vtk-yellow/25 px-3 py-2 text-xs text-vtk-ink">
              Alle exemplaren staan weer op “{ITEM_CONDITION_LABELS[rows[0].condition] ?? rows[0].condition}”.
              Bij het opslaan worden ze weer één rij van {rows.length} stuks; hun namen verdwijnen dan.
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
