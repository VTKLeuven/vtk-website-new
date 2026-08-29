'use client';

import { useState } from 'react';
import { Input } from '@vtk/ui';
import { SaveForm } from '@/components/ui/save-form';
import { saveStockAction } from '@/app/actions/fakbar';
import { saveMessages } from '@/lib/saveMessages';
import { formatEuro } from '@/lib/fakbar-format';
import { stockRowTotals } from '@/lib/fakbar-totals';

type Count = {
  id: string;
  beginOpslag: number;
  levering: number;
  naarPost: number;
  naarFrigo: number;
  eindOpslag: number;
  beginTelling: number;
  eindTelling: number;
  item: { name: string; salesPrice: number };
};

type Group = { key: string; label: string; counts: Count[] };

/** De kolommen in dezelfde volgorde als op het papieren telblad. */
const COLUMNS = [
  { field: 'beginOpslag', label: 'Begin opslag', help: 'Wat er maandag in het magazijn stond.' },
  { field: 'levering', label: 'Levering', help: 'Bijgeleverd deze week.' },
  { field: 'naarFrigo', label: 'Naar frigo', help: 'Van het magazijn naar de toog.' },
  { field: 'naarPost', label: 'Naar post', help: 'Naar een andere post van VTK.' },
  { field: 'eindOpslag', label: 'Eind opslag', help: 'Wat er nu nog in het magazijn staat.' },
  { field: 'beginTelling', label: 'Begin toog', help: 'Wat er maandag aan de toog stond.' },
  { field: 'eindTelling', label: 'Eind toog', help: 'Wat er nu nog aan de toog staat.' },
] as const;

type Field = (typeof COLUMNS)[number]['field'];

/**
 * De stocktelling was een leestabel: zeven kolommen die je nergens kon invullen
 * en die dus altijd op nul stonden. Dit is hetzelfde blad, maar dan met velden,
 * en met de twee getallen die er eigenlijk toe doen live ernaast: hoeveel er
 * verkocht is, en of de opslag klopt.
 */
export function StockForm({ weekId, readOnly, groups }: { weekId: string; readOnly: boolean; groups: Group[] }) {
  const [values, setValues] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const group of groups) {
      for (const count of group.counts) {
        for (const column of COLUMNS) initial[`${count.id}:${column.field}`] = count[column.field];
      }
    }
    return initial;
  });

  function rowOf(count: Count) {
    const read = (field: Field) => values[`${count.id}:${field}`] ?? 0;
    return stockRowTotals({
      beginOpslag: read('beginOpslag'),
      levering: read('levering'),
      naarPost: read('naarPost'),
      naarFrigo: read('naarFrigo'),
      eindOpslag: read('eindOpslag'),
      beginTelling: read('beginTelling'),
      eindTelling: read('eindTelling'),
    });
  }

  const total = groups
    .flatMap((group) => group.counts)
    .reduce((sum, count) => sum + rowOf(count).sold * count.item.salesPrice, 0);

  return (
    <SaveForm
      action={saveStockAction}
      submitLabel="Stocktelling opslaan"
      savingLabel="Opslaan…"
      savedMessage="Stocktelling opgeslagen."
      errorMessages={saveMessages}
      submitDisabled={readOnly}
      className="space-y-6"
    >
      <input type="hidden" name="weekId" value={weekId} />

      <dl className="fakbar-stat-grid">
        <div className="fakbar-stat-card">
          <dt className="fakbar-stat-label">Theoretische omzet</dt>
          <dd className="fakbar-stat-value">{formatEuro(total)}</dd>
          <dd className="fakbar-stat-sub">verkochte stuks aan verkoopprijs</dd>
        </div>
      </dl>

      <fieldset disabled={readOnly} className="space-y-8 disabled:opacity-60">
        {groups.map((group) => (
          <section key={group.key}>
            <h3 className="mb-3 text-sm font-bold uppercase tracking-[0.07em] text-[var(--muted)]">{group.label}</h3>
            <div className="fakbar-table-wrap">
              <table className="fakbar-table fakbar-table-stack">
                <thead>
                  <tr>
                    <th>Artikel</th>
                    {COLUMNS.map((column) => (
                      <th key={column.field} className="num" title={column.help}>
                        {column.label}
                      </th>
                    ))}
                    <th className="num" title="Begin toog plus naar frigo, min eind toog.">
                      Verkocht
                    </th>
                    <th className="num" title="Wat de opslag zegt dat er zou moeten staan, min wat er geteld is. Nul is goed.">
                      Verschil opslag
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {group.counts.map((count) => {
                    const row = rowOf(count);
                    return (
                      <tr key={count.id}>
                        <td data-label="Artikel">{count.item.name}</td>
                        {COLUMNS.map((column) => (
                          <td key={column.field} className="num" data-label={column.label}>
                            <Input
                              name={`stock:${count.id}:${column.field}`}
                              type="number"
                              min={0}
                              step={1}
                              inputMode="numeric"
                              aria-label={`${column.label}: ${count.item.name}`}
                              value={String(values[`${count.id}:${column.field}`] ?? 0)}
                              onChange={(event) =>
                                setValues((current) => ({
                                  ...current,
                                  [`${count.id}:${column.field}`]: Math.max(0, Number(event.target.value) || 0),
                                }))
                              }
                            />
                          </td>
                        ))}
                        <td className="num font-semibold tabular-nums text-[var(--ink)]" data-label="Verkocht">
                          {row.sold}
                        </td>
                        <td
                          className="num font-semibold tabular-nums"
                          data-label="Verschil opslag"
                          style={{ color: row.storageDelta === 0 ? 'var(--muted)' : 'var(--danger)' }}
                        >
                          {row.storageDelta === 0 ? '0' : row.storageDelta > 0 ? `+${row.storageDelta}` : row.storageDelta}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </fieldset>
    </SaveForm>
  );
}
