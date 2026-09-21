'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { DriverStat, GroupStat, StatsRow, TransportStats } from '@/lib/uitleen-stats';
import { driverHourChart, HOUR_BUCKETS, HOUR_BUCKET_LABELS, REST_KEY, type HourBucket } from '@/lib/driver-hours';

/**
 * De grafieken van het statistiekenscherm, als gewone SVG en HTML.
 *
 * Geen grafiekbibliotheek: deze vormen zijn rechthoeken met een schaal ervoor,
 * en een bibliotheek brengt een halve megabyte en een eigen kleurenthema mee dat
 * naast dit palet zou staan. Hetzelfde stramien als het statistiekenscherm van
 * de fakbar.
 *
 * **De reekskleuren zijn niet met de hand gekozen.** Ze komen uit de
 * gedocumenteerde reeks en zijn tegen het witte kaartvlak van deze app door de
 * validator gehaald: lichtheidsband, chroma, kleurenblindheidsafstand en
 * contrast. Drie ervan halen de 3:1 tegen wit niet, en daarom draagt élke
 * grafiek hier een tabelweergave: kleur is nooit de enige uitleg.
 *
 * **Het geel van de huisstijl zit er niet in.** Het is het accent van de site
 * (een actieve knop, een lijn onder een titel) en op een wit vlak nauwelijks te
 * lezen als vulling; het zou bovendien "dit is de belangrijkste reeks" zeggen
 * over een voertuig dat toevallig derde in de lijst staat.
 */
const SERIES = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)'] as const;
const SERIES_REST = 'var(--chart-rest)';

/** Eén tint, licht naar donker: de schaal van de drukteweergave. */
const RAMP = [
  'var(--chart-ramp-1)',
  'var(--chart-ramp-2)',
  'var(--chart-ramp-3)',
  'var(--chart-ramp-4)',
  'var(--chart-ramp-5)',
  'var(--chart-ramp-6)',
] as const;

const MUTED = 'var(--muted)';
const GRID = 'var(--chart-grid)';

const WEEKDAYS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

function hours(value: number): string {
  return `${value.toLocaleString('nl-BE', { maximumFractionDigits: 1 })} u`;
}

function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10]) {
    if (value <= step * magnitude) return step * magnitude;
  }
  return 10 * magnitude;
}

/**
 * Een tabel onder elke grafiek; kleur alleen is nooit de enige uitleg.
 *
 * Getallen staan rechts, de eerste kolom links. `align` is er voor een kolom die
 * tekst draagt in plaats van een getal (wie er reed, in de uren van de dag):
 * rechts uitgelijnd wordt een opsomming van namen een rafelrand.
 */
function TableView({
  columns,
  rows,
  align,
}: {
  columns: string[];
  rows: Array<Array<string | number>>;
  align?: Array<'left' | 'right'>;
}) {
  const alignOf = (index: number) => align?.[index] ?? (index === 0 ? 'left' : 'right');
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs font-semibold text-vtk-navy">Toon als tabel</summary>
      <div className="relative mt-2 overflow-x-auto">
        <table className="w-full min-w-[20rem] text-left text-xs">
          <thead>
            <tr className="border-b border-vtk-navy/10 text-vtk-muted">
              {columns.map((column, index) => (
                <th key={column} className={`py-1 pr-3 font-medium ${alignOf(index) === 'right' ? 'text-right' : ''}`}>
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-b border-vtk-navy/5">
                {row.map((cell, index) => (
                  <td
                    key={index}
                    className={`py-1 pr-3 ${
                      index === 0 ? 'text-vtk-ink' : 'tabular-nums text-vtk-body'
                    } ${alignOf(index) === 'right' ? 'text-right' : ''}`}
                  >
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

function Legend({ entries }: { entries: Array<{ color: string; label: string }> }) {
  return (
    <ul className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-vtk-muted">
      {entries.map((entry) => (
        <li key={entry.label} className="flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ backgroundColor: entry.color }} />
          {entry.label}
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[18px] border border-vtk-navy/10 bg-vtk-surface p-5">
      <h3 className="text-base font-semibold tracking-tight text-vtk-ink">{title}</h3>
      {hint ? <p className="mt-1 text-sm text-vtk-muted">{hint}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/**
 * Een kerncijfer met de vorige periode ernaast.
 *
 * De pijl staat er enkel wanneer er een vorige periode is om mee te vergelijken;
 * "+100%" tegenover een periode zonder ritten zegt niets, en een pijl die altijd
 * omhoog wijst omdat het vorige jaar leeg was, is misleidend.
 */
function StatTile({
  label,
  value,
  sub,
  previous,
}: {
  label: string;
  value: string;
  sub?: string;
  previous?: { value: number; now: number };
}) {
  const trend =
    previous && previous.value > 0 ? Math.round(((previous.now - previous.value) / previous.value) * 100) : null;
  return (
    <div className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight text-vtk-ink">{value}</p>
      <p className="mt-0.5 text-xs text-vtk-muted">
        {sub}
        {trend !== null ? (
          <span>
            {sub ? ' · ' : ''}
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% tegenover de vorige periode
          </span>
        ) : null}
      </p>
    </div>
  );
}

const PODIUM = ['🥇', '🥈', '🥉'];

/**
 * Wie er het meest reed, met per chauffeur de verdeling over de voertuigen.
 *
 * Gestapelde balken en geen taart: de vraag is "wie reed het meest" (een
 * rangorde), en daarbovenop "waarmee". Een taart beantwoordt geen van beide.
 * De namen staan links van de balk en de uren rechts ervan, dus de rangorde is
 * te lezen zonder de kleuren te kennen.
 */
function DriverLeaderboard({
  drivers,
  vehicles,
  onPickDriver,
}: {
  drivers: DriverStat[];
  vehicles: Array<{ id: string; name: string }>;
  onPickDriver: (driverId: string | null) => void;
}) {
  const [shown, setShown] = useState(10);
  const top = drivers.slice(0, shown);
  const max = niceCeiling(drivers[0]?.hours ?? 1);
  const colorOf = (vehicleId: string) => {
    const index = vehicles.findIndex((vehicle) => vehicle.id === vehicleId);
    return index >= 0 && index < SERIES.length ? SERIES[index] : SERIES_REST;
  };

  if (drivers.length === 0) {
    return <p className="text-sm text-vtk-muted">Niemand reed in deze periode.</p>;
  }

  return (
    <div>
      <Legend
        entries={[
          ...vehicles.slice(0, SERIES.length).map((vehicle, index) => ({ color: SERIES[index], label: vehicle.name })),
          ...(vehicles.length > SERIES.length ? [{ color: SERIES_REST, label: 'Overige voertuigen' }] : []),
        ]}
      />
      <ul className="mt-3 grid gap-2">
        {top.map((driver, index) => (
          <li key={driver.id}>
            <button
              type="button"
              onClick={() => onPickDriver(driver.id)}
              title={`Enkel de uren en de ritten van ${driver.name}`}
              className="grid w-full grid-cols-[1.25rem_minmax(6rem,9rem)_1fr_4.5rem] items-center gap-2 rounded-lg px-1 py-0.5 text-left transition hover:bg-vtk-paper"
            >
              <span aria-hidden className="text-sm tabular-nums text-vtk-muted">
                {PODIUM[index] ?? index + 1}
              </span>
              <span className="truncate text-sm font-medium text-vtk-ink">{driver.name}</span>
              {/* De staaf. Een witte streep van 2px tussen de segmenten, zodat
                  twee voertuigen naast elkaar niet in elkaar overlopen. */}
              <span className="flex h-4 items-stretch overflow-hidden rounded-[4px] bg-vtk-paper">
                <span className="flex h-full" style={{ width: `${(driver.hours / max) * 100}%` }}>
                  {vehicles.map((vehicle) => {
                    const value = driver.perVehicle[vehicle.id] ?? 0;
                    if (value <= 0) return null;
                    return (
                      <span
                        key={vehicle.id}
                        title={`${driver.name} · ${vehicle.name}: ${hours(value)}`}
                        className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
                        style={{
                          width: `${(value / driver.hours) * 100}%`,
                          backgroundColor: colorOf(vehicle.id),
                          boxShadow: 'inset -2px 0 0 var(--chart-seam)',
                        }}
                      />
                    );
                  })}
                </span>
              </span>
              <span className="text-right text-sm tabular-nums text-vtk-body">{hours(driver.hours)}</span>
            </button>
          </li>
        ))}
      </ul>
      {drivers.length > shown ? (
        <button
          type="button"
          onClick={() => setShown(drivers.length)}
          className="mt-3 text-xs font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
        >
          Alle {drivers.length} chauffeurs tonen
        </button>
      ) : null}
      <TableView
        columns={['Chauffeur', 'Ritten', 'Uren']}
        rows={drivers.map((driver) => [driver.name, driver.trips, driver.hours])}
      />
    </div>
  );
}

/**
 * Voor welke post er gereden werd, en wie er dan reed.
 *
 * De drilldown zit in de rij zelf: een post aanklikken klapt de chauffeurs
 * eronder open. Dat is de vraag die meteen na "Onthaal vroeg het meest vervoer"
 * komt, en ze beantwoorden op een ander scherm zou betekenen dat niemand ze
 * stelt.
 */
function GroupBars({ groups, onPickGroup }: { groups: GroupStat[]; onPickGroup: (groupKey: string | null) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const max = niceCeiling(groups[0]?.hours ?? 1);

  if (groups.length === 0) {
    return <p className="text-sm text-vtk-muted">Geen ritten in deze periode.</p>;
  }

  return (
    <div>
      <ul className="grid gap-1.5">
        {groups.map((group) => (
          <li key={group.key}>
            <button
              type="button"
              onClick={() => setOpen((current) => (current === group.key ? null : group.key))}
              aria-expanded={open === group.key}
              className="grid w-full grid-cols-[minmax(6rem,10rem)_1fr_6rem] items-center gap-2 rounded-lg px-1 py-0.5 text-left transition hover:bg-vtk-paper"
            >
              <span className="truncate text-sm font-medium text-vtk-ink">{group.name}</span>
              <span className="h-4 rounded-[4px] bg-vtk-paper">
                <span
                  className="block h-full rounded-[4px]"
                  style={{ width: `${(group.hours / max) * 100}%`, backgroundColor: SERIES[0] }}
                />
              </span>
              <span className="text-right text-sm tabular-nums text-vtk-body">
                {group.trips}× · {hours(group.hours)}
              </span>
            </button>
            {open === group.key ? (
              <div className="mb-2 ml-2 mt-1 border-l-2 border-vtk-yellow pl-3">
                {group.drivers.length === 0 ? (
                  <p className="text-xs text-vtk-muted">Er stond nog geen chauffeur op deze ritten.</p>
                ) : (
                  <ul className="grid gap-0.5 text-xs text-vtk-body">
                    {group.drivers.map((driver) => (
                      <li key={driver.id} className="flex items-center justify-between gap-3">
                        <span className="truncate">{driver.name}</span>
                        <span className="shrink-0 tabular-nums">
                          {driver.trips}× · {hours(driver.hours)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <button
                  type="button"
                  onClick={() => onPickGroup(group.key)}
                  className="mt-2 text-xs font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
                >
                  Deze ritten in de tabel onderaan
                </button>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <TableView
        columns={['Post of werkgroep', 'Ritten', 'Uren']}
        rows={groups.map((group) => [group.name, group.trips, group.hours])}
      />
    </div>
  );
}

/**
 * Wanneer de voertuigen op weg zijn: de week als raster van dag maal uur.
 *
 * Eén tint van licht naar donker en geen regenboog: dit is één grootheid
 * (bezette uren), en een verloop over meerdere tinten laat "veel" en "weinig"
 * van plaats wisselen naargelang je scherm.
 */
function Heatmap({ heatmap }: { heatmap: number[][] }) {
  const max = Math.max(1, ...heatmap.flat());
  const step = (value: number) => {
    if (value <= 0) return RAMP[0];
    const index = Math.min(RAMP.length - 1, 1 + Math.floor((value / max) * (RAMP.length - 2)));
    return RAMP[index];
  };

  return (
    <div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[34rem] border-separate border-spacing-[2px] text-[10px]">
          <caption className="sr-only">Bezette uren per weekdag en uur van de dag</caption>
          <thead>
            <tr>
              <th className="w-6" />
              {Array.from({ length: 24 }, (_, hour) => (
                <th key={hour} className="font-normal tabular-nums text-vtk-muted">
                  {/* Elk derde uur benoemd: vierentwintig getallen naast elkaar
                      worden een grijze streep. */}
                  {hour % 3 === 0 ? String(hour).padStart(2, '0') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heatmap.map((row, day) => (
              <tr key={day}>
                <th scope="row" className="pr-1 text-right font-medium text-vtk-muted">
                  {WEEKDAYS[day]}
                </th>
                {row.map((value, hour) => (
                  <td
                    key={hour}
                    title={`${WEEKDAYS[day]} ${String(hour).padStart(2, '0')}:00 · ${hours(value)}`}
                    className="h-5 rounded-[3px]"
                    style={{ backgroundColor: step(value) }}
                  >
                    <span className="sr-only">
                      {WEEKDAYS[day]} {hour}u: {hours(value)}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-vtk-muted">
        <span>minder</span>
        {RAMP.map((color) => (
          <span
            key={color}
            aria-hidden
            className="h-3 w-5 rounded-[3px] border border-vtk-navy/10"
            style={{ backgroundColor: color }}
          />
        ))}
        <span>meer ({hours(max)} op het drukste uur)</span>
      </div>
    </div>
  );
}

/**
 * Op welk uur er gereden wordt, en door wie (F4.23).
 *
 * De drukteweergave hierboven zegt wanneer de voertuigen weg zijn; deze balken
 * zeggen wie er dan reed. Dat is de vraag die erna komt zodra er een rit om zes
 * uur 's ochtends gepland moet worden.
 *
 * **Per 1, 2 of 4 uur.** Vierentwintig balken vragen breedte die een telefoon
 * niet heeft, en over een werkingsjaar is het verschil tussen 14u en 15u vaak
 * ruis. Per 4 uur past het scherm zonder te schuiven.
 *
 * **De kleuren zijn die van de kalender**, en de rest van het waarom staat in
 * `lib/driver-hours.ts`. Alleen de acht met de meeste uren krijgen hun eigen
 * kleur; daarboven wordt een gestapelde balk een streepjescode.
 */
const TOP_DRIVERS = 8;

function HourOfDay({
  drivers,
  focus,
  hoursWithoutDriver,
  onClearFocus,
}: {
  drivers: DriverStat[];
  focus: DriverStat | null;
  hoursWithoutDriver: number;
  onClearFocus: () => void;
}) {
  const [bucket, setBucket] = useState<HourBucket>(1);
  const chart = useMemo(
    () => driverHourChart(focus ? [focus] : drivers, { bucket, top: TOP_DRIVERS }),
    [drivers, focus, bucket]
  );

  /**
   * Chauffeurs die in deze grafiek dezelfde kleur dragen.
   *
   * De kalender leidt een kleur af uit een hash over vierentwintig kleuren, dus
   * twee chauffeurs kunnen erop uitkomen. In de kalender vallen ze uit elkaar
   * (ze staan zelden in hetzelfde blok), in een gestapelde balk niet. Zeggen dat
   * het zo is, is hier het eerlijkste: het recht kunnen zetten bestaat al.
   */
  const clashing = useMemo(() => {
    const byColor = new Map<string, string[]>();
    for (const entry of chart.legend) {
      if (entry.key === REST_KEY) continue;
      byColor.set(entry.color, [...(byColor.get(entry.color) ?? []), entry.name]);
    }
    return [...byColor.values()].filter((names) => names.length > 1);
  }, [chart.legend]);

  if (drivers.length === 0) {
    return <p className="text-sm text-vtk-muted">Niemand reed in deze periode.</p>;
  }

  const max = niceCeiling(Math.max(...chart.columns.map((column) => column.hours)));

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {HOUR_BUCKETS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setBucket(option)}
            aria-pressed={bucket === option}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              bucket === option
                ? 'border-vtk-navy bg-vtk-navy text-vtk-on-emphasis'
                : 'border-vtk-navy/15 text-vtk-ink hover:border-vtk-navy/40'
            }`}
          >
            {HOUR_BUCKET_LABELS[option]}
          </button>
        ))}
      </div>

      <Legend entries={chart.legend.map((entry) => ({ color: entry.color, label: entry.name }))} />

      {/* `position: relative` op de scroller, zoals bij elke tabel hier: de
          sr-only tekst per balk is absoluut gepositioneerd en ankert anders op
          de pagina in plaats van op de grafiek. */}
      <div className="relative mt-3 overflow-x-auto">
        <div className="grid grid-cols-[2.25rem_1fr] gap-x-1" style={{ minWidth: bucket === 1 ? '22rem' : undefined }}>
          <div className="relative h-40">
            {[0, 0.5, 1].map((fraction) => (
              <span
                key={fraction}
                className="absolute right-0 translate-y-1/2 text-[10px] tabular-nums text-vtk-muted"
                style={{ bottom: `${fraction * 100}%` }}
              >
                {Math.round(max * fraction)}
              </span>
            ))}
          </div>
          <div className="relative h-40">
            {[0, 0.5, 1].map((fraction) => (
              <span
                key={fraction}
                aria-hidden
                className="absolute inset-x-0 border-t border-vtk-navy/10"
                style={{ bottom: `${fraction * 100}%` }}
              />
            ))}
            <div className="absolute inset-0 flex items-end gap-[2px]">
              {chart.columns.map((column) => (
                <div
                  key={column.key}
                  title={`${column.rangeLabel}: ${hours(column.hours)}`}
                  className="flex h-full flex-1 flex-col justify-end"
                >
                  <span className="sr-only">
                    {column.rangeLabel}: {hours(column.hours)}
                  </span>
                  {/* Van boven naar onder tekenen: het eerste segment uit de
                      data hoort onderaan te staan, en een kolom vult van boven
                      af. De naad van 1px houdt twee chauffeurs uit elkaar. */}
                  {[...column.segments].reverse().map((segment) => (
                    <span
                      key={segment.key}
                      title={`${segment.name} · ${column.rangeLabel}: ${hours(segment.hours)}`}
                      className="block w-full shrink-0 first:rounded-t-[3px]"
                      style={{
                        height: `${(segment.hours / max) * 100}%`,
                        backgroundColor: segment.color,
                        boxShadow: 'inset 0 -1px 0 var(--chart-seam)',
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <span aria-hidden />
          <div className="mt-1 flex gap-[2px]">
            {chart.columns.map((column, index) => (
              <span key={column.key} className="flex-1 text-center text-[10px] tabular-nums text-vtk-muted">
                {/* Bij balken van een uur elk derde getal: vierentwintig
                    getallen naast elkaar worden een grijze streep, net als in de
                    drukteweergave. */}
                {bucket > 1 || index % 3 === 0 ? column.label : ''}
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-2 text-xs text-vtk-muted">
        Het beginuur staat onder de balk; uren in Belgische tijd.
        {hoursWithoutDriver > 0 ? (
          <span>
            {' '}
            {hours(hoursWithoutDriver)} staat hier niet bij: ritten waar geen chauffeur op staat, bijvoorbeeld op een
            voertuig dat er geen nodig heeft.
          </span>
        ) : null}
      </p>

      {clashing.length > 0 ? (
        <p className="mt-1 text-xs text-vtk-muted">
          {clashing.map((names) => names.join(' en ')).join('; ')} hebben dezelfde kleur in de planning.{' '}
          <Link
            href="/beheer/chauffeurs"
            className="font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
            Geef er een andere bij Chauffeurs
          </Link>
          .
        </p>
      ) : null}

      {focus ? (
        <p className="mt-1 text-xs text-vtk-muted">
          Enkel de uren van {focus.name}.{' '}
          <button
            type="button"
            onClick={onClearFocus}
            className="font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
            Alle chauffeurs tonen
          </button>
        </p>
      ) : null}

      <TableView
        columns={['Uur', 'Uren', 'Wie']}
        align={['left', 'right', 'left']}
        rows={chart.columns
          .filter((column) => column.hours > 0)
          .map((column) => [
            column.rangeLabel,
            hours(column.hours),
            column.segments.map((segment) => `${segment.name} ${hours(segment.hours)}`).join(', '),
          ])}
      />
    </div>
  );
}

/**
 * De week-tot-week-curve van de periode.
 *
 * Twee grafieken naast elkaar en geen twee assen in één: ritten en uren hebben
 * een andere schaal, en twee y-assen in één beeld laten de lezer een verband
 * zien dat er niet hoeft te zijn.
 */
function WeekChart({
  weeks,
  field,
  color,
  label,
  format,
}: {
  weeks: TransportStats['weeks'];
  field: 'trips' | 'hours';
  color: string;
  label: string;
  format: (value: number) => string;
}) {
  if (weeks.length === 0) {
    return <p className="text-sm text-vtk-muted">Geen ritten in deze periode.</p>;
  }
  const max = niceCeiling(Math.max(...weeks.map((week) => week[field])));
  const width = Math.max(weeks.length * 18, 240);
  const height = 120;

  return (
    <div>
      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height + 18}`}
          className="h-[9rem] w-full min-w-[20rem]"
          role="img"
          aria-label={`${label} per week`}
        >
          {[0, 0.5, 1].map((fraction) => (
            <g key={fraction}>
              <line
                x1={0}
                x2={width}
                y1={height - fraction * height}
                y2={height - fraction * height}
                style={{ stroke: GRID }}
                strokeWidth={1}
              />
              <text x={2} y={height - fraction * height - 3} style={{ fill: MUTED }} fontSize={9}>
                {format(max * fraction)}
              </text>
            </g>
          ))}
          {weeks.map((week, index) => {
            const value = week[field];
            const barHeight = (value / max) * height;
            return (
              <rect
                key={week.key}
                x={index * 18 + 3}
                y={height - barHeight}
                width={12}
                height={Math.max(barHeight, value > 0 ? 2 : 0)}
                rx={4}
                style={{ fill: color }}
              >
                {/* Eén expressie en niet drie stukken tekst naast elkaar: in een
                    SVG-<title> maakte dat drie tekstknopen, en daarop faalde de
                    hydratie van deze pagina. React tekende de boom dan opnieuw en
                    wiste onderweg `data-theme` van <html>, dus het scherm sprong
                    terug naar licht. */}
                <title>{`Week van ${week.label}: ${format(value)}`}</title>
              </rect>
            );
          })}
          {weeks.map((week, index) =>
            index % 4 === 0 ? (
              <text
                key={week.key}
                x={index * 18 + 9}
                y={height + 12}
                style={{ fill: MUTED }}
                fontSize={9}
                textAnchor="middle"
              >
                {week.label}
              </text>
            ) : null
          )}
        </svg>
      </div>
      <TableView columns={['Week van', label]} rows={weeks.map((week) => [week.label, week[field]])} />
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Te beslissen',
  APPROVED: 'Goedgekeurd',
  COMPLETED: 'Afgerond',
  REJECTED: 'Afgewezen',
  CANCELLED: 'Geannuleerd',
};

type SortKey = 'date' | 'hours' | 'driver' | 'group';

/**
 * Alle ritten van de periode, doorzoekbaar en te sorteren, met een export.
 *
 * De grafieken erboven beantwoorden de vragen die je vooraf kan bedenken; deze
 * tabel is voor de vraag erna ("welke ritten waren dat dan?"). De export is een
 * CSV met puntkomma's: dat is wat Excel op een Belgische taalinstelling zonder
 * importdialoog openslaat.
 */
function TripTable({
  rows,
  driverFilter,
  groupFilter,
  onClearFilters,
  periodLabel,
}: {
  rows: StatsRow[];
  driverFilter: string | null;
  groupFilter: string | null;
  onClearFilters: () => void;
  periodLabel: string;
}) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('date');
  const [descending, setDescending] = useState(true);

  const shown = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (driverFilter && row.driverId !== driverFilter) return false;
      if (groupFilter && row.groupKey !== groupFilter) return false;
      if (!needle) return true;
      return [row.purpose, row.driverName, row.groupName, row.vehicleName, row.dateLabel]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
    const factor = descending ? -1 : 1;
    return [...filtered].sort((a, b) => {
      if (sort === 'hours') return (a.hours - b.hours) * factor;
      if (sort === 'driver') return a.driverName.localeCompare(b.driverName, 'nl') * factor;
      if (sort === 'group') return a.groupName.localeCompare(b.groupName, 'nl') * factor;
      return a.dayKey.localeCompare(b.dayKey) * factor;
    });
  }, [rows, search, sort, descending, driverFilter, groupFilter]);

  function toggle(key: SortKey) {
    if (key === sort) setDescending((value) => !value);
    else {
      setSort(key);
      setDescending(key === 'date' || key === 'hours');
    }
  }

  function exportCsv() {
    const header = ['Datum', 'Uren van-tot', 'Duur (u)', 'Voertuig', 'Chauffeur', 'Voor', 'Waarvoor', 'Status'];
    const escape = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
    const lines = [
      header.map(escape).join(';'),
      ...shown.map((row) =>
        [
          row.dateLabel,
          row.timeLabel,
          // Komma als decimaalteken: op een Belgische taalinstelling leest Excel
          // "1.5" als tekst en "1,5" als een getal.
          String(row.hours).replace('.', ','),
          row.vehicleName,
          row.driverName,
          row.groupName,
          row.purpose,
          STATUS_LABELS[row.status] ?? row.status,
        ]
          .map(escape)
          .join(';')
      ),
    ];
    // Met BOM, anders maakt Excel van "Wéér een cantus" iets onleesbaars.
    const blob = new Blob(['﻿', lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vtk-ritten-${periodLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const header = (key: SortKey, label: string) => (
    <th scope="col" className="py-2 pr-3 font-medium">
      <button
        type="button"
        onClick={() => toggle(key)}
        className="inline-flex items-center gap-1 text-vtk-muted transition hover:text-vtk-ink"
      >
        {label}
        {sort === key ? <span aria-hidden>{descending ? '▾' : '▴'}</span> : null}
      </button>
    </th>
  );

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium text-vtk-muted">
          Zoeken
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="naam, post, evenement"
            className="h-9 w-56 rounded-lg border border-vtk-navy/15 bg-vtk-field px-3 text-sm text-vtk-ink"
          />
        </label>
        {driverFilter || groupFilter ? (
          <button
            type="button"
            onClick={onClearFilters}
            className="h-9 rounded-full border border-vtk-navy/15 px-3 text-sm font-medium text-vtk-ink transition hover:border-vtk-navy/40"
          >
            Selectie uit de grafiek loslaten
          </button>
        ) : null}
        <button
          type="button"
          onClick={exportCsv}
          className="ml-auto h-9 rounded-full border border-vtk-navy bg-vtk-navy px-3.5 text-sm font-semibold text-vtk-on-emphasis transition hover:bg-vtk-ink"
        >
          Exporteer naar CSV
        </button>
      </div>

      <p className="mt-2 text-xs text-vtk-muted">
        {shown.length} van {rows.length} ritten
      </p>

      {/* `position: relative` op de scroller: `sr-only` is absoluut
          gepositioneerd, en zonder gepositioneerde ouder ankert ze op de pagina
          in plaats van op de tabel. Zie de admin-conventies. */}
      <div className="relative mt-2 overflow-x-auto">
        <table className="w-full min-w-[46rem] text-left text-sm">
          <thead className="border-b border-vtk-navy/10 text-xs">
            <tr>
              {header('date', 'Datum')}
              <th scope="col" className="py-2 pr-3 font-medium text-vtk-muted">
                Uren
              </th>
              {header('hours', 'Duur')}
              <th scope="col" className="py-2 pr-3 font-medium text-vtk-muted">
                Voertuig
              </th>
              {header('driver', 'Chauffeur')}
              {header('group', 'Voor')}
              <th scope="col" className="py-2 pr-3 font-medium text-vtk-muted">
                Waarvoor
              </th>
              <th scope="col" className="py-2 font-medium text-vtk-muted">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.id} className="border-b border-vtk-navy/5">
                <td className="py-1.5 pr-3 tabular-nums text-vtk-body">{row.dateLabel}</td>
                <td className="py-1.5 pr-3 tabular-nums text-vtk-body">{row.timeLabel}</td>
                <td className="py-1.5 pr-3 tabular-nums text-vtk-body">{hours(row.hours)}</td>
                <td className="py-1.5 pr-3 text-vtk-body">{row.vehicleName}</td>
                <td className="py-1.5 pr-3 text-vtk-ink">{row.driverName || '—'}</td>
                <td className="py-1.5 pr-3 text-vtk-body">{row.groupName}</td>
                <td className="py-1.5 pr-3 text-vtk-body">{row.purpose}</td>
                <td className="py-1.5 text-vtk-muted">{STATUS_LABELS[row.status] ?? row.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 ? <p className="py-4 text-sm text-vtk-muted">Geen ritten die hierop passen.</p> : null}
      </div>
    </div>
  );
}

export function TransportCharts({ stats, periodLabel }: { stats: TransportStats; periodLabel: string }) {
  const [driverFilter, setDriverFilter] = useState<string | null>(null);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);

  const busiest = stats.perGroup[0] ?? null;
  const focusedDriver = stats.perDriver.find((driver) => driver.id === driverFilter) ?? null;

  return (
    <div className="grid gap-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label="Ritten"
          value={String(stats.totals.trips)}
          sub={`${stats.totals.cancelled + stats.totals.rejected} geannuleerd of afgewezen`}
          previous={{ value: stats.previous.trips, now: stats.totals.trips }}
        />
        <StatTile
          label="Uren onderweg"
          value={hours(stats.totals.hours)}
          sub="het geboekte venster"
          previous={{ value: stats.previous.hours, now: stats.totals.hours }}
        />
        <StatTile
          label="Chauffeurs"
          value={String(stats.totals.drivers)}
          sub={`${stats.totals.withoutDriver} ritten zonder chauffeur`}
          previous={{ value: stats.previous.drivers, now: stats.totals.drivers }}
        />
        <StatTile
          label="Gemiddelde rit"
          value={hours(stats.totals.averageHours)}
          previous={{ value: stats.previous.averageHours, now: stats.totals.averageHours }}
        />
        <StatTile
          label="Vroeg het meest vervoer"
          value={busiest?.name ?? '—'}
          sub={busiest ? `${busiest.trips} ritten · ${hours(busiest.hours)}` : undefined}
        />
        <StatTile
          label="Ritten per week"
          value={
            stats.weeks.length > 0
              ? (stats.totals.trips / stats.weeks.length).toLocaleString('nl-BE', {
                  maximumFractionDigits: 1,
                })
              : '0'
          }
          sub={`over ${stats.weeks.length} ${stats.weeks.length === 1 ? 'week' : 'weken'} met ritten`}
        />
      </div>

      <Panel
        title="Wie reed het meest"
        hint="Uren per chauffeur, opgesplitst per voertuig. Klik iemand aan om enkel zijn uren en zijn ritten te zien, hieronder en in de tabel onderaan."
      >
        <DriverLeaderboard
          drivers={stats.perDriver}
          vehicles={stats.vehicles}
          onPickDriver={(id) => {
            setDriverFilter(id);
            setGroupFilter(null);
          }}
        />
      </Panel>

      <Panel title="Voor wie er gereden werd" hint="Klik een post open om te zien wie er voor hen reed.">
        <GroupBars
          groups={stats.perGroup}
          onPickGroup={(key) => {
            setGroupFilter(key);
            setDriverFilter(null);
          }}
        />
      </Panel>

      <Panel
        title="Wanneer de voertuigen weg zijn"
        hint="Bezette uren per weekdag en uur van de dag, over de hele periode opgeteld."
      >
        <Heatmap heatmap={stats.heatmap} />
      </Panel>

      <Panel
        title="Op welk uur er gereden wordt"
        hint="Uren per uur van de dag, met een segment per chauffeur. Op een smal scherm zet je de balken per 2 of 4 uur samen."
      >
        <HourOfDay
          drivers={stats.perDriver}
          focus={focusedDriver}
          hoursWithoutDriver={stats.totals.hoursWithoutDriver}
          onClearFocus={() => setDriverFilter(null)}
        />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Ritten per week">
          <WeekChart
            weeks={stats.weeks}
            field="trips"
            color={SERIES[0]}
            label="Ritten"
            format={(value) => String(Math.round(value))}
          />
        </Panel>
        <Panel title="Uren per week">
          <WeekChart
            weeks={stats.weeks}
            field="hours"
            color={SERIES[1]}
            label="Uren"
            format={(value) => String(Math.round(value))}
          />
        </Panel>
      </div>

      <Panel title="Alle ritten">
        <TripTable
          rows={stats.rows}
          driverFilter={driverFilter}
          groupFilter={groupFilter}
          onClearFilters={() => {
            setDriverFilter(null);
            setGroupFilter(null);
          }}
          periodLabel={periodLabel}
        />
      </Panel>
    </div>
  );
}
