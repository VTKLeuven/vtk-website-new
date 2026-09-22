"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { niceTicks } from "@/lib/careerTimeline";

export type ChartSeries = {
  key: string;
  label: string;
  /** Een CSS-kleur, in de praktijk een token: `var(--chart-1)`. */
  color: string;
  values: (number | null)[];
  /** Lijnen: tot (exclusief) deze index gestippeld, want gereconstrueerd. */
  reconstructedUntil?: number;
};

export type DailyChartLabels = {
  /** "Toon als tabel" */
  table: string;
  /** Kolomkop van de dagen in de tabel. */
  day: string;
  /** "Totaal", voor gestapelde staven. */
  total: string;
  /** Legende voor het gestippelde stuk van een lijn. */
  reconstructed?: string;
};

type Props = {
  kind: "bars" | "lines";
  /** Brusselse dagen, `yyyy-mm-dd`, even lang als elke `values`. */
  days: string[];
  series: ChartSeries[];
  locale: "nl" | "en";
  /** De toegankelijke naam van de grafiek; de zichtbare titel staat erboven. */
  title: string;
  labels: DailyChartLabels;
};

const HEIGHT = 170;
const MARGIN = { top: 10, right: 44, bottom: 24, left: 40 };
const BAR_MAX = 24;
const GAP = 2;
/** Minimale afstand tussen twee datums op de as. */
const LABEL_SPACING = 64;

function formatDay(day: string, locale: "nl" | "en", withYear = false): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(locale === "nl" ? "nl-BE" : "en-GB", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/** Staaf met een afgeronde bovenkant en een vlakke voet. */
function barPath(x: number, top: number, bottom: number, width: number, rounded: boolean): string {
  const h = bottom - top;
  const r = rounded ? Math.min(4, width / 2, h) : 0;
  return [
    `M${x},${bottom}`,
    `V${top + r}`,
    r ? `Q${x},${top} ${x + r},${top}` : "",
    `H${x + width - r}`,
    r ? `Q${x + width},${top} ${x + width},${top + r}` : "",
    `V${bottom}`,
    "Z",
  ].join("");
}

/**
 * Een kleine dagelijkse grafiek voor de admin: gestapelde staven of lijnen.
 *
 * Geen library: dit zijn drie grafieken op één beheerpagina, en een SVG met een
 * paar rechthoeken is kleiner dan wat een grafiekbibliotheek alleen al aan
 * stijl meebrengt. De vormregels (dunne staven met een afgeronde kop, een
 * spleet van 2px tussen gestapelde delen, haarlijnen als raster, een legende
 * vanaf twee reeksen, de waarde aan het eind van een lijn) volgen de
 * dataviz-richtlijnen.
 *
 * De hover toont per dag elke reeks; met het toetsenbord loop je met de pijlen
 * door de dagen. Wat de hover toont, staat ook in de tabel eronder: een waarde
 * mag nooit enkel achter een muisbeweging zitten, en het amber van het palet
 * haalt geen 3:1 op wit.
 */
export function DailyChart({ kind, days, series, locale, title, labels }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(720);
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.round(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const n = days.length;
  const plotW = Math.max(1, width - MARGIN.left - MARGIN.right);
  const plotH = HEIGHT - MARGIN.top - MARGIN.bottom;

  const totals = days.map((_, i) => series.reduce((sum, s) => sum + (s.values[i] ?? 0), 0));
  const max =
    kind === "bars"
      ? Math.max(0, ...totals)
      : Math.max(0, ...series.flatMap((s) => s.values.filter((v): v is number => v !== null)));
  const ticks = niceTicks(max);
  const yMax = ticks[ticks.length - 1] || 1;
  const y = (value: number) => MARGIN.top + plotH - (value / yMax) * plotH;

  const slot = plotW / Math.max(1, n);
  const barW = Math.max(2, Math.min(BAR_MAX, slot * 0.7));
  const xCenter = (i: number) =>
    kind === "bars"
      ? MARGIN.left + slot * i + slot / 2
      : MARGIN.left + (n <= 1 ? plotW / 2 : (plotW * i) / (n - 1));

  // Hoogstens zes datums op de as, en nooit dichter dan één per 64px: een
  // datum is zo'n 40px breed, en op een telefoon schoven ze anders over elkaar.
  // De laatste staat er altijd; een datum die er te dicht bij zou staan, valt weg.
  const labelCount = Math.max(2, Math.min(6, Math.floor(plotW / LABEL_SPACING)));
  const labelEvery = Math.max(1, Math.ceil(n / labelCount));
  const xLabels = days
    .map((day, i) => ({ day, i }))
    .filter(
      ({ i }) =>
        i === n - 1 ||
        (i % labelEvery === 0 && xCenter(n - 1) - xCenter(i) >= LABEL_SPACING * 0.8),
    );

  const indexAt = (clientX: number, rect: DOMRect) => {
    const x = clientX - rect.left - MARGIN.left;
    const i = kind === "bars" ? Math.floor(x / slot) : Math.round((x / plotW) * (n - 1));
    return Math.min(n - 1, Math.max(0, i));
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (n === 0) return;
    setActive(indexAt(event.clientX, event.currentTarget.getBoundingClientRect()));
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (n === 0) return;
    const current = active ?? n - 1;
    if (event.key === "ArrowLeft") setActive(Math.max(0, current - 1));
    else if (event.key === "ArrowRight") setActive(Math.min(n - 1, current + 1));
    else if (event.key === "Home") setActive(0);
    else if (event.key === "End") setActive(n - 1);
    else return;
    event.preventDefault();
  };

  const linePath = (values: (number | null)[], from: number, to: number) => {
    let d = "";
    let pen = false;
    for (let i = from; i <= to && i < values.length; i++) {
      const v = values[i];
      if (v === null) {
        pen = false;
        continue;
      }
      d += `${pen ? "L" : "M"}${xCenter(i).toFixed(1)},${y(v).toFixed(1)}`;
      pen = true;
    }
    return d;
  };

  const hasReconstruction = series.some((s) => (s.reconstructedUntil ?? 0) > 0);
  const fmt = new Intl.NumberFormat(locale === "nl" ? "nl-BE" : "en-GB");

  // De waarde aan het eind van elke lijn, tenzij twee eindpunten te dicht bij
  // elkaar liggen: dan dragen de legende en de hover het (zie de richtlijnen).
  const ends =
    kind === "lines"
      ? series.map((s) => {
          const last = s.values.length - 1 - [...s.values].reverse().findIndex((v) => v !== null);
          const value = last < s.values.length ? s.values[last] : null;
          return value === null || last >= s.values.length ? null : { i: last, value };
        })
      : [];
  const endYs = ends.map((end) => (end ? y(end.value) : null));
  const endsCollide = endYs.some(
    (a, i) => a !== null && endYs.some((b, j) => j > i && b !== null && Math.abs(a - b) < 14),
  );

  const tooltipLeft = active === null ? 0 : xCenter(active);
  const tooltipOnLeft = tooltipLeft > width * 0.6;

  return (
    <div className="vtk-chart">
      {series.length > 1 || hasReconstruction ? (
        <ul className="vtk-chart-legend">
          {series.map((s) => (
            <li key={s.key}>
              <span
                className={kind === "bars" ? "vtk-chart-swatch" : "vtk-chart-linekey"}
                style={{ background: s.color }}
                aria-hidden
              />
              {s.label}
            </li>
          ))}
          {hasReconstruction && labels.reconstructed ? (
            <li>
              <span className="vtk-chart-linekey vtk-chart-linekey-dashed" aria-hidden />
              {labels.reconstructed}
            </li>
          ) : null}
        </ul>
      ) : null}

      <div ref={wrapRef} className="vtk-chart-plot">
        <svg
          width={width}
          height={HEIGHT}
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-labelledby={titleId}
          tabIndex={0}
          onPointerMove={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((current) => current ?? (n > 0 ? n - 1 : null))}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          <title id={titleId}>{title}</title>

          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={width - MARGIN.right}
                y1={y(tick)}
                y2={y(tick)}
                className="vtk-chart-grid"
              />
              <text x={MARGIN.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="vtk-chart-tick">
                {fmt.format(tick)}
              </text>
            </g>
          ))}

          {xLabels.map(({ day, i }) => (
            <text
              key={day}
              x={xCenter(i)}
              y={HEIGHT - 6}
              textAnchor={kind === "lines" && i === 0 ? "start" : kind === "lines" && i === n - 1 ? "end" : "middle"}
              className="vtk-chart-tick"
            >
              {formatDay(day, locale)}
            </text>
          ))}

          {kind === "bars" && active !== null ? (
            <rect
              x={MARGIN.left + slot * active}
              y={MARGIN.top}
              width={slot}
              height={plotH}
              className="vtk-chart-hover"
            />
          ) : null}

          {kind === "bars"
            ? days.map((day, i) => {
                const x = xCenter(i) - barW / 2;
                let base = 0;
                const visible = series.filter((s) => (s.values[i] ?? 0) > 0);
                return (
                  <g key={day}>
                    {visible.map((s, k) => {
                      const value = s.values[i] ?? 0;
                      const bottom = y(base) - (k > 0 ? GAP : 0);
                      base += value;
                      const top = Math.min(y(base), bottom - 1);
                      return (
                        <path
                          key={s.key}
                          d={barPath(x, top, bottom, barW, k === visible.length - 1)}
                          fill={s.color}
                        />
                      );
                    })}
                  </g>
                );
              })
            : null}

          {kind === "lines"
            ? series.map((s) => {
                const until = s.reconstructedUntil ?? 0;
                return (
                  <g key={s.key}>
                    {until > 0 ? (
                      <path
                        d={linePath(s.values, 0, Math.min(until, s.values.length - 1))}
                        stroke={s.color}
                        className="vtk-chart-line vtk-chart-line-dashed"
                      />
                    ) : null}
                    <path d={linePath(s.values, until, s.values.length - 1)} stroke={s.color} className="vtk-chart-line" />
                  </g>
                );
              })
            : null}

          {kind === "lines" && active !== null ? (
            <g>
              <line
                x1={xCenter(active)}
                x2={xCenter(active)}
                y1={MARGIN.top}
                y2={MARGIN.top + plotH}
                className="vtk-chart-crosshair"
              />
              {series.map((s) => {
                const value = s.values[active];
                return value === null ? null : (
                  <circle
                    key={s.key}
                    cx={xCenter(active)}
                    cy={y(value)}
                    r={4}
                    fill={s.color}
                    className="vtk-chart-dot"
                  />
                );
              })}
            </g>
          ) : null}

          {kind === "lines" && !endsCollide
            ? ends.map((end, k) =>
                end ? (
                  <g key={series[k].key}>
                    <circle cx={xCenter(end.i)} cy={y(end.value)} r={4} fill={series[k].color} className="vtk-chart-dot" />
                    <text x={xCenter(end.i) + 8} y={y(end.value)} dy="0.32em" className="vtk-chart-end">
                      {fmt.format(end.value)}
                    </text>
                  </g>
                ) : null,
              )
            : null}
        </svg>

        {active !== null ? (
          <div
            className="vtk-chart-tooltip"
            style={
              tooltipOnLeft
                ? { right: width - tooltipLeft + 12 }
                : { left: tooltipLeft + 12 }
            }
            aria-hidden
          >
            <p className="vtk-chart-tooltip-day">{formatDay(days[active], locale, true)}</p>
            {series.map((s) => (
              <p key={s.key} className="vtk-chart-tooltip-row">
                <span className="vtk-chart-linekey" style={{ background: s.color }} />
                <strong>{s.values[active] === null ? "–" : fmt.format(s.values[active] ?? 0)}</strong>
                <span>{s.label}</span>
              </p>
            ))}
            {kind === "bars" && series.length > 1 ? (
              <p className="vtk-chart-tooltip-row vtk-chart-tooltip-total">
                <span className="vtk-chart-linekey" style={{ background: "transparent" }} />
                <strong>{fmt.format(totals[active])}</strong>
                <span>{labels.total}</span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <details className="vtk-chart-table">
        <summary>{labels.table}</summary>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th scope="col">{labels.day}</th>
                {series.map((s) => (
                  <th key={s.key} scope="col">
                    {s.label}
                  </th>
                ))}
                {kind === "bars" && series.length > 1 ? <th scope="col">{labels.total}</th> : null}
              </tr>
            </thead>
            <tbody>
              {/* Nieuwste dag bovenaan: daar kijkt wie deze tabel opent. */}
              {days
                .map((day, i) => ({ day, i }))
                .reverse()
                .map(({ day, i }) => (
                  <tr key={day}>
                    <th scope="row">{formatDay(day, locale, true)}</th>
                    {series.map((s) => (
                      <td key={s.key}>
                        {s.values[i] === null ? "–" : fmt.format(s.values[i] ?? 0)}
                        {(s.reconstructedUntil ?? 0) > i ? "*" : ""}
                      </td>
                    ))}
                    {kind === "bars" && series.length > 1 ? <td>{fmt.format(totals[i])}</td> : null}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {hasReconstruction && labels.reconstructed ? (
          <p className="vtk-chart-footnote">* {labels.reconstructed}</p>
        ) : null}
      </details>
    </div>
  );
}
