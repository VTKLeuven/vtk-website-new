import { formatDuration, formatLapTime, raceHour, type RunnerYearStats } from '@/lib/urenloop/laps';

/**
 * De 24 urenloop van één loper: de kerncijfers, een grafiek van de rondetijden
 * over de 24 uur en de lijst van elke ronde. Rendert op de server; enkel de
 * kaart op /account (`RunnerStatsFacts`) en de volle pagina
 * (/account/24urenloop) gebruiken het, en /admin/it/flows toont het als
 * voorvertoning.
 */

type Locale = 'nl' | 'en';

function numberFmt(nl: boolean, digits = 0) {
  return new Intl.NumberFormat(nl ? 'nl-BE' : 'en-GB', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function clockFmt(nl: boolean) {
  return new Intl.DateTimeFormat(nl ? 'nl-BE' : 'en-GB', {
    timeZone: 'Europe/Brussels',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** De kerncijfers als een `dl`; `compact` is de kaart op /account. */
export function RunnerStatsFacts({
  stats,
  locale,
  compact = false,
}: {
  stats: RunnerYearStats;
  locale: Locale;
  compact?: boolean;
}) {
  const nl = locale === 'nl';
  const km = numberFmt(nl, 2);
  const pct = numberFmt(nl, 1);
  const share = stats.teamLaps > 0 ? (stats.lapCount / stats.teamLaps) * 100 : 0;
  const of = nl ? 'van' : 'of';

  const facts: Array<{ label: string; value: string; note?: string }> = [
    {
      label: nl ? 'Rondes' : 'Laps',
      value: String(stats.lapCount),
      note: `${nl ? 'plaats' : 'rank'} ${stats.lapsRank} ${of} ${stats.runners}`,
    },
    {
      label: nl ? 'Snelste ronde' : 'Fastest lap',
      value: formatLapTime(stats.bestMs),
      note: `${nl ? 'plaats' : 'rank'} ${stats.bestRank} ${of} ${stats.runners}`,
    },
    { label: nl ? 'Gemiddelde' : 'Average', value: formatLapTime(stats.averageMs) },
  ];
  if (!compact) {
    facts.push(
      { label: nl ? 'Traagste ronde' : 'Slowest lap', value: formatLapTime(stats.slowestMs) },
      { label: nl ? 'Afstand' : 'Distance', value: `${km.format(stats.distanceKm)} km` },
      { label: nl ? 'Totale looptijd' : 'Time running', value: formatDuration(stats.totalMs, nl) },
      {
        label: nl ? 'Aandeel' : 'Share',
        value: `${pct.format(share)}%`,
        note: `${stats.lapCount} ${of} ${stats.teamLaps} ${nl ? 'rondes' : 'laps'}`,
      }
    );
  }

  return (
    <dl className={`grid gap-x-6 gap-y-4 ${compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'}`}>
      {facts.map((fact) => (
        <div key={fact.label} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-vtk-muted">{fact.label}</dt>
          <dd className="mt-1 whitespace-nowrap text-xl font-semibold tabular-nums text-vtk-ink sm:text-2xl">
            {fact.value}
          </dd>
          {fact.note ? <dd className="text-xs text-vtk-muted">{fact.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

const RACE_MS = 24 * 3_600_000;

/**
 * Een SVG schaalt zijn tekst mee met zijn breedte, dus een grafiek van 640
 * breed op een telefoon van 340 heeft labels van zes pixels. Daarom twee maten,
 * elk met zijn eigen aantal uren op de as; CSS kiest.
 */
const CHART_SIZES = {
  wide: { width: 640, height: 230, left: 48, right: 16, top: 26, bottom: 30, hours: [0, 4, 8, 12, 16, 20, 24] },
  narrow: { width: 340, height: 220, left: 42, right: 12, top: 26, bottom: 30, hours: [0, 6, 12, 18, 24] },
};

/**
 * Elke ronde als een punt: wanneer in de 24 uur (x) en hoe snel (y, sneller is
 * hoger). Eén reeks, dus geen legende; de snelste staat in geel met zijn tijd
 * erbij. De tabel eronder is de tekstversie van dezelfde punten.
 */
export function RunnerLapChart({ stats, locale }: { stats: RunnerYearStats; locale: Locale }) {
  const nl = locale === 'nl';
  return (
    <figure className="space-y-2">
      <LapPlot stats={stats} nl={nl} size="wide" className="hidden sm:block" />
      <LapPlot stats={stats} nl={nl} size="narrow" className="sm:hidden" />
      <figcaption className="text-xs text-vtk-muted">
        {nl
          ? 'Elke ronde op het uur dat je vertrok; hoe hoger, hoe sneller. In geel je snelste.'
          : 'Every lap at the time you set off; the higher, the faster. Your fastest in yellow.'}
      </figcaption>
    </figure>
  );
}

function LapPlot({
  stats,
  nl,
  size,
  className,
}: {
  stats: RunnerYearStats;
  nl: boolean;
  size: keyof typeof CHART_SIZES;
  className: string;
}) {
  const CHART = CHART_SIZES[size];
  const clock = clockFmt(nl);
  const plotW = CHART.width - CHART.left - CHART.right;
  const plotH = CHART.height - CHART.top - CHART.bottom;
  const start = stats.eventStart.getTime();

  const times = stats.laps.map((lap) => lap.timeMs);
  const pad = Math.max(2_000, (Math.max(...times) - Math.min(...times)) * 0.15);
  const yMin = Math.min(...times) - pad;
  const yMax = Math.max(...times) + pad;
  const x = (date: Date) => CHART.left + (Math.min(Math.max(date.getTime() - start, 0), RACE_MS) / RACE_MS) * plotW;
  // Sneller is beter en staat dus bovenaan.
  const y = (ms: number) => CHART.top + ((ms - yMin) / (yMax - yMin)) * plotH;

  // Rasterlijnen op ronde seconden, zo'n drie à vier binnen het bereik.
  const step = [1, 2, 5, 10, 15, 30, 60].find((s) => (yMax - yMin) / (s * 1000) <= 4) ?? 120;
  const yTicks: number[] = [];
  for (let ms = Math.ceil(yMin / (step * 1000)) * step * 1000; ms <= yMax; ms += step * 1000) {
    yTicks.push(ms);
  }
  const xTicks = CHART.hours;

  return (
    <svg
      viewBox={`0 0 ${CHART.width} ${CHART.height}`}
      className={`h-auto w-full ${className}`}
      role="img"
      aria-label={
        nl
          ? `Rondetijden over de 24 uur: ${stats.lapCount} rondes, snelste ${formatLapTime(stats.bestMs)}.`
          : `Lap times over the 24 hours: ${stats.lapCount} laps, fastest ${formatLapTime(stats.bestMs)}.`
      }
    >
      {yTicks.map((ms) => (
        <g key={ms}>
          <line
            x1={CHART.left}
            x2={CHART.width - CHART.right}
            y1={y(ms)}
            y2={y(ms)}
            stroke="var(--line)"
            strokeWidth={1}
          />
          <text
            x={CHART.left - 8}
            y={y(ms)}
            dy="0.32em"
            textAnchor="end"
            fontSize={11}
            fill="var(--muted)"
            className="tabular-nums"
          >
            {formatLapTime(ms).replace(/\.00$/, '')}
          </text>
        </g>
      ))}
      {xTicks.map((hour) => {
        const at = CHART.left + (hour / 24) * plotW;
        return (
          <text
            key={hour}
            x={at}
            y={CHART.height - 8}
            textAnchor={hour === 0 ? 'start' : hour === 24 ? 'end' : 'middle'}
            fontSize={11}
            fill="var(--muted)"
            className="tabular-nums"
          >
            {clock.format(new Date(start + hour * 3_600_000))}
          </text>
        );
      })}
      {stats.laps.map((lap) => {
        const best = lap.sequence === stats.bestSequence;
        return (
          <g key={lap.sequence}>
            {/* Ruimer doelwit dan het punt zelf, voor de tooltip. */}
            <circle cx={x(lap.startedAt)} cy={y(lap.timeMs)} r={10} fill="transparent">
              <title>
                {`${clock.format(lap.startedAt)} · ${formatLapTime(lap.timeMs)}${best ? (nl ? ' · snelste' : ' · fastest') : ''}`}
              </title>
            </circle>
            <circle
              cx={x(lap.startedAt)}
              cy={y(lap.timeMs)}
              r={best ? 6 : 4.5}
              fill={best ? 'var(--yellow)' : 'var(--navy)'}
              stroke="var(--surface)"
              strokeWidth={2}
              pointerEvents="none"
            />
          </g>
        );
      })}
      {(() => {
        const bestLap = stats.laps.find((lap) => lap.sequence === stats.bestSequence);
        if (!bestLap) return null;
        // Boven het punt: de snelste staat altijd bovenaan, dus daar ligt
        // geen ander punt. Aan de randen schuift het label naar binnen.
        const bx = x(bestLap.startedAt);
        const anchor = bx < CHART.left + 40 ? 'start' : bx > CHART.width - CHART.right - 40 ? 'end' : 'middle';
        return (
          <text
            x={anchor === 'start' ? bx - 6 : anchor === 'end' ? bx + 6 : bx}
            y={y(bestLap.timeMs) - 12}
            textAnchor={anchor}
            fontSize={12}
            fontWeight={600}
            fill="var(--ink)"
            className="tabular-nums"
          >
            {formatLapTime(bestLap.timeMs)}
          </text>
        );
      })()}
    </svg>
  );
}

/** Elke ronde op een rij, met het verschil tegenover je snelste. */
export function RunnerLapTable({ stats, locale }: { stats: RunnerYearStats; locale: Locale }) {
  const nl = locale === 'nl';
  const clock = clockFmt(nl);
  const delta = numberFmt(nl, 2);

  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-vtk-muted">
            <th className="py-2 pr-3 font-semibold">#</th>
            <th className="py-2 pr-3 font-semibold">{nl ? 'Vertrek' : 'Start'}</th>
            <th className="py-2 pr-3 font-semibold">{nl ? 'Uur van de race' : 'Race hour'}</th>
            <th className="py-2 pr-3 text-right font-semibold">{nl ? 'Rondetijd' : 'Lap time'}</th>
            <th className="py-2 text-right font-semibold">{nl ? 'Op je snelste' : 'Off your best'}</th>
          </tr>
        </thead>
        <tbody>
          {stats.laps.map((lap, index) => {
            const best = lap.sequence === stats.bestSequence;
            return (
              <tr
                key={lap.sequence}
                className={`border-b border-vtk-blue/5 ${best ? 'shadow-[inset_3px_0_0_var(--yellow)]' : ''}`}
              >
                <td className="py-2 pl-2 pr-3 tabular-nums text-vtk-muted">{index + 1}</td>
                <td className="py-2 pr-3 tabular-nums">
                  {clock.format(lap.startedAt)}
                  {lap.raining ? <span className="ml-2 text-xs text-vtk-muted">{nl ? 'regen' : 'rain'}</span> : null}
                </td>
                <td className="py-2 pr-3 tabular-nums text-vtk-muted">{raceHour(lap.startedAt, stats.eventStart)}</td>
                <td className="py-2 pr-3 text-right font-medium tabular-nums text-vtk-ink">
                  {formatLapTime(lap.timeMs)}
                </td>
                <td className="py-2 text-right tabular-nums text-vtk-muted">
                  {best ? (
                    <span className="font-semibold text-vtk-ink">{nl ? 'snelste' : 'fastest'}</span>
                  ) : (
                    `+${delta.format((lap.timeMs - stats.bestMs) / 1000)} s`
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Eén jaar op /account/24urenloop: de cijfers, de grafiek en elke ronde. */
export function RunnerYearPanel({ stats, locale }: { stats: RunnerYearStats; locale: Locale }) {
  const nl = locale === 'nl';
  const dayFmt = new Intl.DateTimeFormat(nl ? 'nl-BE' : 'en-GB', {
    timeZone: 'Europe/Brussels',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return (
    <section
      id={`urenloop-${stats.year}`}
      aria-labelledby={`urenloop-${stats.year}-title`}
      className="scroll-mt-28 space-y-6 rounded-[18px] border border-vtk-blue/10 bg-white p-6"
    >
      <div>
        <h2 id={`urenloop-${stats.year}-title`} className="text-2xl font-semibold text-vtk-ink">
          {nl ? `24 urenloop ${stats.year}` : `24-hour run ${stats.year}`}
        </h2>
        <p className="mt-1 text-sm text-vtk-muted">
          {nl ? 'Vanaf ' : 'From '}
          {dayFmt.format(stats.eventStart)}
          {nl
            ? `, ${clockFmt(nl).format(stats.eventStart)}. De plaatsen tellen ${stats.runners} lopers van VTK.`
            : `, ${clockFmt(nl).format(stats.eventStart)}. Ranks are out of ${stats.runners} VTK runners.`}
        </p>
      </div>
      <RunnerStatsFacts stats={stats} locale={locale} />
      <RunnerLapChart stats={stats} locale={locale} />
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-vtk-muted">
          {nl ? 'Elke ronde' : 'Every lap'}
        </h3>
        <RunnerLapTable stats={stats} locale={locale} />
      </div>
    </section>
  );
}
