'use client';

import { useId, useMemo, useState } from 'react';
import { formatEuro } from '@/lib/fakbar-format';

/**
 * De grafieken van het statistiekenscherm, als gewone SVG.
 *
 * Geen grafiekbibliotheek: deze vier vormen zijn een paar rechthoeken met een
 * schaal ervoor, en een bibliotheek zou een halve megabyte en een eigen
 * kleurenthema meebrengen dat naast dit palet zou staan.
 *
 * **De kleuren zijn niet met de hand gekozen.** Ze komen uit de gedocumenteerde
 * reeks en zijn tegen de donkere achtergrond van deze app (#171d26) door de
 * validator gehaald: lichtheidsband, chroma, kleurenblindheidsafstand en
 * contrast. Het merkcyaan zelf (#22cbe8) zakte op de lichtheidstest, dus de
 * grafieken gebruiken de donkere stap ervan; dat is dezelfde kleur als
 * `--yellow-dark` in het palet.
 */
const SERIES_1 = '#0ea5c4';
const SERIES_2 = '#d95926';

type WeekPoint = {
  key: string;
  label: string;
  cash: number;
  bancontact: number;
  revenue: number;
  lostRevenue: number;
  expected: number | null;
  countedEvenings: number;
  evenings: number;
};

type NamedValue = { key: string; label: string; value: number };

function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

/** Een tabelweergave onder elke grafiek: kleur alleen is nooit de enige uitleg. */
function TableView({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <details className="fakbar-chart-table">
      <summary>Toon als tabel</summary>
      <div className="fakbar-table-wrap mt-3">
        <table className="fakbar-table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={column} className={index === 0 ? undefined : 'num'}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  <td key={index} className={index === 0 ? undefined : 'num tabular-nums'}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function Legend({ entries }: { entries: { color: string; label: string }[] }) {
  return (
    <ul className="fakbar-chart-legend">
      {entries.map((entry) => (
        <li key={entry.label}>
          <span aria-hidden style={{ background: entry.color }} />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * Ontvangsten per week, cash en Bancontact op elkaar.
 *
 * Gestapeld en niet twee assen: dat zijn twee delen van hetzelfde geheel, en
 * een tweede y-as naast een eerste is de klassiekste manier om een grafiek te
 * laten liegen.
 */
export function WeeklyRevenueChart({ weeks }: { weeks: WeekPoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  const max = useMemo(() => niceCeiling(Math.max(1, ...weeks.map((week) => week.revenue))), [weeks]);
  if (weeks.length === 0) return <p className="fakbar-chart-empty">Nog geen weken in deze periode.</p>;

  const height = 240;
  const barSlot = 100 / weeks.length;
  const barWidth = Math.min(46, barSlot * 0.62);
  const active = hover === null ? null : weeks[hover];

  return (
    <div className="fakbar-chart">
      <Legend
        entries={[
          { color: SERIES_1, label: 'Cash naar de kluis' },
          { color: SERIES_2, label: 'Bancontact' },
        ]}
      />

      <div className="fakbar-chart-plot" onMouseLeave={() => setHover(null)}>
        {/* Rasterlijnen en asbedragen; bewust ingetogen zodat de staven het beeld dragen. */}
        <div className="fakbar-chart-grid" aria-hidden>
          {[1, 0.75, 0.5, 0.25, 0].map((fraction) => (
            <div key={fraction}>
              <span>{formatEuro(max * fraction)}</span>
            </div>
          ))}
        </div>

        <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label="Ontvangsten per week">
          <defs>
            <clipPath id={clipId}>
              <rect x="0" y="0" width="100" height={height} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {weeks.map((week, index) => {
              const x = index * barSlot + (barSlot - barWidth) / 2;
              const cashHeight = (week.cash / max) * height;
              const bcHeight = (week.bancontact / max) * height;
              // 2px tussenruimte tussen de twee segmenten, zodat de grens niet
              // van de kleur alleen moet komen.
              const gap = bcHeight > 0 && cashHeight > 0 ? 2 : 0;
              const dimmed = hover !== null && hover !== index;

              return (
                <g key={week.key} opacity={dimmed ? 0.45 : 1}>
                  <rect
                    x={x}
                    y={height - cashHeight}
                    width={barWidth}
                    height={Math.max(0, cashHeight - gap)}
                    fill={SERIES_1}
                    rx="1.5"
                  />
                  <rect
                    x={x}
                    y={height - cashHeight - bcHeight}
                    width={barWidth}
                    height={Math.max(0, bcHeight)}
                    fill={SERIES_2}
                    rx="1.5"
                  />
                  {/* Een ruim trefvlak over de hele kolom: mikken op een staaf
                      van vier pixels breed is geen interactie. */}
                  <rect
                    x={index * barSlot}
                    y="0"
                    width={barSlot}
                    height={height}
                    fill="transparent"
                    onMouseEnter={() => setHover(index)}
                    onFocus={() => setHover(index)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${week.label}: ${formatEuro(week.revenue)}`}
                  />
                </g>
              );
            })}
          </g>
        </svg>

        {active ? (
          <div
            className="fakbar-chart-tooltip"
            style={{ left: `${(hover! + 0.5) * barSlot}%` }}
            role="status"
          >
            <p className="head">Week {active.label.replace('W', '')}</p>
            <p>
              <span aria-hidden style={{ background: SERIES_1 }} /> Cash{' '}
              <strong>{formatEuro(active.cash)}</strong>
            </p>
            <p>
              <span aria-hidden style={{ background: SERIES_2 }} /> Bancontact{' '}
              <strong>{formatEuro(active.bancontact)}</strong>
            </p>
            <p className="total">
              Totaal <strong>{formatEuro(active.revenue)}</strong>
            </p>
            <p className="sub">
              {active.countedEvenings} van {active.evenings} avonden geteld
            </p>
          </div>
        ) : null}
      </div>

      <ul className="fakbar-chart-axis">
        {weeks.map((week) => (
          <li key={week.key}>{week.label}</li>
        ))}
      </ul>

      <TableView
        columns={['Week', 'Cash', 'Bancontact', 'Totaal', 'Gemist']}
        rows={weeks.map((week) => [
          week.label,
          formatEuro(week.cash),
          formatEuro(week.bancontact),
          formatEuro(week.revenue),
          formatEuro(week.lostRevenue),
        ])}
      />
    </div>
  );
}

/**
 * Eén reeks, één kleur, van veel naar weinig. Bewust geen kleur per rij: de
 * lengte van de balk zegt de grootte al, en er dan ook nog kleur op zetten
 * verspilt het kanaal waarmee je juist iets anders zou kunnen tonen.
 */
export function RankedBars({
  data,
  caption,
  unitLabel = 'Bedrag',
}: {
  data: NamedValue[];
  caption: string;
  unitLabel?: string;
}) {
  const [hover, setHover] = useState<string | null>(null);
  const max = Math.max(1, ...data.map((entry) => entry.value));

  if (data.length === 0) return <p className="fakbar-chart-empty">Nog geen gegevens in deze periode.</p>;

  return (
    <div className="fakbar-chart">
      <ul className="fakbar-bars" onMouseLeave={() => setHover(null)}>
        {data.map((entry) => {
          const share = (entry.value / max) * 100;
          const dimmed = hover !== null && hover !== entry.key;
          return (
            <li
              key={entry.key}
              onMouseEnter={() => setHover(entry.key)}
              onFocus={() => setHover(entry.key)}
              tabIndex={0}
              aria-label={`${entry.label}: ${formatEuro(entry.value)}`}
            >
              <span className="label">{entry.label}</span>
              <span className="track">
                <span className="fill" style={{ width: `${share}%`, background: SERIES_1, opacity: dimmed ? 0.5 : 1 }} />
              </span>
              {/* Direct gelabeld: de waarde staat er altijd bij, dus de grafiek
                  werkt ook zonder kleur en zonder muis. */}
              <span className="value">{formatEuro(entry.value)}</span>
            </li>
          );
        })}
      </ul>

      <TableView columns={[caption, unitLabel]} rows={data.map((entry) => [entry.label, formatEuro(entry.value)])} />
    </div>
  );
}
