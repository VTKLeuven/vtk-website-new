'use client';
import { useMemo, useState, useSyncExternalStore } from 'react';
import { addDays, format } from 'date-fns';
import { Globe } from 'lucide-react';
import { getDictionary, type Locale } from '@vtk/i18n';
import { fmtTime, freeSpots, spotsLabel, type MergedShift } from './shiftData';

const HOUR_PX = 44;
const MS_PER_HOUR = 3_600_000;
const subscribeToClient = () => () => undefined;
// Weekdag-afkortingen per locale, geïndexeerd via Date.getDay() (0 = zondag).
const DOW = {
  nl: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'],
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
} as const;

type Segment = {
  key: string;
  merged: MergedShift;
  dayIndex: number;
  startFrac: number; // uren sinds middernacht van die dag
  endFrac: number;
  col: number;
  cols: number;
};

/**
 * Google-Calendar-achtige weekweergave: 7 dagkolommen vanaf `weekStart`, met de
 * shiften als blokken op hun uren. Een klik opent het detailvenster; van daaruit
 * schrijf je in of uit.
 */
export function ShiftWeekView({
  locale,
  weekStart,
  shifts,
  emptyState,
  onOpen,
}: {
  locale: Locale;
  weekStart: Date;
  shifts: MergedShift[];
  emptyState: React.ReactNode;
  onOpen: (entry: MergedShift) => void;
}) {
  const t = getDictionary(locale).shift;

  // De "nu"-lijn en de markering van vandaag horen bij de klok van de browser.
  // Serverside blijven ze weg: een tijdstip dat bij hydratatie een paar pixels
  // verschilt, geeft anders een mismatch.
  const isClient = useSyncExternalStore(
    subscribeToClient,
    () => true,
    () => false
  );
  const [mountedAt] = useState(() => Date.now());
  const now = isClient ? mountedAt : null;

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Split shiften in dag-segmenten (voor shiften over middernacht), bepaal de
  // getoonde uren-range en leg overlappende shiften naast elkaar in kolommen.
  const { segments, minHour, maxHour } = useMemo(() => {
    const raw: Omit<Segment, 'col' | 'cols'>[] = [];
    for (const m of shifts) {
      for (let d = 0; d < 7; d++) {
        const dayStart = addDays(weekStart, d);
        const dayEnd = addDays(dayStart, 1);
        const segStart = Math.max(m.shift.startTime.getTime(), dayStart.getTime());
        const segEnd = Math.min(m.shift.endTime.getTime(), dayEnd.getTime());
        if (segStart < segEnd) {
          raw.push({
            key: `${m.shift.id}-${d}`,
            merged: m,
            dayIndex: d,
            startFrac: (segStart - dayStart.getTime()) / MS_PER_HOUR,
            endFrac: (segEnd - dayStart.getTime()) / MS_PER_HOUR,
          });
        }
      }
    }

    let min = 24;
    let max = 0;
    for (const s of raw) {
      min = Math.min(min, s.startFrac);
      max = Math.max(max, s.endFrac);
    }
    if (raw.length === 0) {
      min = 8;
      max = 20;
    } else {
      min = Math.floor(min);
      max = Math.ceil(max);
    }

    const withCols: Segment[] = [];
    for (let d = 0; d < 7; d++) {
      const daySegs = raw
        .filter((s) => s.dayIndex === d)
        .sort((a, b) => a.startFrac - b.startFrac || a.endFrac - b.endFrac);

      let cluster: Segment[] = [];
      let clusterEnd = -Infinity;
      let colEnds: number[] = [];

      const flush = () => {
        const cols = cluster.reduce((n, s) => Math.max(n, s.col + 1), 1);
        for (const s of cluster) s.cols = cols;
        withCols.push(...cluster);
        cluster = [];
        colEnds = [];
        clusterEnd = -Infinity;
      };

      for (const seg of daySegs) {
        if (cluster.length && seg.startFrac >= clusterEnd) flush();
        let col = colEnds.findIndex((end) => end <= seg.startFrac);
        if (col === -1) {
          col = colEnds.length;
          colEnds.push(seg.endFrac);
        } else {
          colEnds[col] = seg.endFrac;
        }
        cluster.push({ ...seg, col, cols: 1 });
        clusterEnd = Math.max(clusterEnd, seg.endFrac);
      }
      flush();
    }

    return { segments: withCols, minHour: min, maxHour: max };
  }, [shifts, weekStart]);

  const gridHeight = (maxHour - minHour) * HOUR_PX;
  const hours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i);

  // Positie van de "nu"-lijn: enkel wanneer vandaag in de getoonde week valt en
  // het huidige uur binnen het getoonde bereik ligt.
  const nowLine = useMemo(() => {
    if (now === null) return null;
    const today = new Date(now);
    const index = days.findIndex(
      (d) =>
        d.getFullYear() === today.getFullYear() &&
        d.getMonth() === today.getMonth() &&
        d.getDate() === today.getDate()
    );
    if (index === -1) return null;
    const frac = today.getHours() + today.getMinutes() / 60;
    if (frac < minHour || frac > maxHour) return { index, top: null };
    return { index, top: (frac - minHour) * HOUR_PX };
  }, [now, days, minHour, maxHour]);

  return (
    <div className="vtk-week">
      <div className="vtk-week-scroll">
        <div className="vtk-week-grid">
          <div className="vtk-week-corner" />
          {days.map((day, d) => (
            <div
              key={day.toISOString()}
              className="vtk-week-head"
              data-today={nowLine?.index === d ? 'true' : undefined}
            >
              <span className="vtk-week-dow">{DOW[locale][day.getDay()]}</span>
              <span className="vtk-week-date">{format(day, 'd/MM')}</span>
            </div>
          ))}

          <div className="vtk-week-gutter" style={{ height: gridHeight }}>
            {hours.map((h) => (
              <div key={h} className="vtk-week-hour" style={{ top: (h - minHour) * HOUR_PX }}>
                {String(h % 24).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {days.map((day, d) => (
            <div
              key={day.toISOString()}
              className="vtk-week-daycol"
              data-today={nowLine?.index === d ? 'true' : undefined}
              style={{
                height: gridHeight,
                backgroundImage: `repeating-linear-gradient(var(--line) 0 1px, transparent 1px ${HOUR_PX}px)`,
              }}
            >
              {nowLine && nowLine.index === d && nowLine.top !== null ? (
                <span className="vtk-week-now" style={{ top: nowLine.top }} aria-hidden="true" />
              ) : null}

              {segments
                .filter((s) => s.dayIndex === d)
                .map((s) => {
                  const { shift, registered } = s.merged;
                  const isFull = !registered && freeSpots(shift) <= 0;
                  const variant = registered
                    ? 'vtk-week-block-registered'
                    : isFull
                      ? 'vtk-week-block-full'
                      : 'vtk-week-block-available';
                  const height = Math.max(18, (s.endFrac - s.startFrac) * HOUR_PX - 2);
                  const status = registered ? t.isRegistered : spotsLabel(shift, t);
                  const intl = shift.openToInternationals ? ` · ${t.intl.badge}` : '';

                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`vtk-week-block ${variant}`}
                      data-compact={height < 58 ? 'true' : undefined}
                      title={`${shift.name} · ${fmtTime(shift.startTime)}-${fmtTime(shift.endTime)} · ${shift.location} · ${status}${intl}`}
                      aria-label={`${t.dialog.open}: ${shift.name}, ${fmtTime(shift.startTime)}-${fmtTime(shift.endTime)}, ${shift.location}, ${status}${intl}`}
                      onClick={() => onOpen(s.merged)}
                      style={{
                        top: (s.startFrac - minHour) * HOUR_PX,
                        height,
                        left: `calc(${(s.col / s.cols) * 100}% + 2px)`,
                        width: `calc(${(1 / s.cols) * 100}% - 4px)`,
                      }}
                    >
                      <span className="vtk-week-block-time">
                        {fmtTime(shift.startTime)}
                        {shift.openToInternationals ? (
                          <Globe className="vtk-week-block-globe" aria-hidden="true" />
                        ) : null}
                      </span>
                      <span className="vtk-week-block-name">{shift.name}</span>
                      <span className="vtk-week-block-status">{status}</span>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>

        {segments.length === 0 ? <div className="vtk-week-empty">{emptyState}</div> : null}
      </div>
    </div>
  );
}
