'use client';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { addDays, format } from 'date-fns';
import { ChevronDown, ChevronUp, Globe } from 'lucide-react';
import { getDictionary, type Locale } from '@vtk/i18n';
import { fmtTime, freeSpots, spotsLabel, type MergedShift } from './shiftData';

const HOUR_PX = 44;
const TOTAL_HOURS = 24;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;
const MS_PER_HOUR = 3_600_000;
const HEADER_HEIGHT = 38;

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
 * shiften als blokken op hun uren over het volledige 24u-bereik. Standaard
 * gescrold naar 8h-20h, met scrollbare overige uren (0h-8h en 20h-24h) en
 * indicatorknoppen voor shiften buiten het zichtbare deel.
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(DEFAULT_START_HOUR * HOUR_PX);
  const [viewportHeight, setViewportHeight] = useState(
    (DEFAULT_END_HOUR - DEFAULT_START_HOUR) * HOUR_PX + HEADER_HEIGHT
  );
  const hasScrolledInitially = useRef(false);

  // De "nu"-lijn en de markering van vandaag horen bij de klok van de browser.
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

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (!hasScrolledInitially.current) {
      el.scrollTop = DEFAULT_START_HOUR * HOUR_PX;
      setScrollTop(DEFAULT_START_HOUR * HOUR_PX);
      hasScrolledInitially.current = true;
    }

    const updateMetrics = () => {
      setScrollTop(el.scrollTop);
      setViewportHeight(el.clientHeight);
    };

    updateMetrics();
    const observer = new ResizeObserver(updateMetrics);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Split shiften in dag-segmenten (voor shiften over middernacht) en leg
  // overlappende shiften naast elkaar in kolommen.
  const segments = useMemo(() => {
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

    return withCols;
  }, [shifts, weekStart]);

  const gridHeight = TOTAL_HOURS * HOUR_PX;
  const hours = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => i);

  // Positie van de "nu"-lijn: enkel wanneer vandaag in de getoonde week valt.
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
    return { index, top: frac * HOUR_PX };
  }, [now, days]);

  const effectiveVisibleHeight = Math.max(100, viewportHeight - HEADER_HEIGHT);
  const visibleTopFrac = scrollTop / HOUR_PX;
  const visibleBottomFrac = (scrollTop + effectiveVisibleHeight) / HOUR_PX;

  const scrollToHour = (hourFrac: number, isBottom = false) => {
    const el = scrollRef.current;
    if (!el) return;
    const targetScroll = isBottom
      ? Math.max(0, hourFrac * HOUR_PX - effectiveVisibleHeight + 12)
      : Math.max(0, hourFrac * HOUR_PX - 12);
    el.scrollTo({ top: targetScroll, behavior: 'smooth' });
  };

  return (
    <div className="vtk-week">
      <div
        className="vtk-week-scroll"
        ref={scrollRef}
        onScroll={(e) => {
          setScrollTop(e.currentTarget.scrollTop);
          setViewportHeight(e.currentTarget.clientHeight);
        }}
      >
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
              <div key={h} className="vtk-week-hour" style={{ top: h * HOUR_PX }}>
                {String(h % 24).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {days.map((day, d) => {
            const daySegs = segments.filter((s) => s.dayIndex === d);
            const shiftsAbove = daySegs.filter((s) => s.startFrac < visibleTopFrac);
            const shiftsBelow = daySegs.filter((s) => s.endFrac > visibleBottomFrac);
            const earliestAbove = shiftsAbove.sort((a, b) => a.startFrac - b.startFrac)[0];
            const latestBelow = shiftsBelow.sort((a, b) => b.endFrac - a.endFrac)[0];

            return (
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

                {shiftsAbove.length > 0 && earliestAbove ? (
                  <button
                    type="button"
                    className="vtk-week-indicator vtk-week-indicator-top"
                    style={{ top: scrollTop + 4 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollToHour(earliestAbove.startFrac, false);
                    }}
                    title={`${t.earlierShifts ?? 'Vroegere shiften'}: ${earliestAbove.merged.shift.name} (${fmtTime(earliestAbove.merged.shift.startTime)})`}
                    aria-label={`${t.earlierShifts ?? 'Vroegere shiften op'} ${format(day, 'd/MM')}: ${earliestAbove.merged.shift.name}`}
                  >
                    <ChevronUp className="vtk-week-indicator-chevron" aria-hidden="true" />
                    <span className="vtk-week-indicator-label">
                      {fmtTime(earliestAbove.merged.shift.startTime)}
                    </span>
                  </button>
                ) : null}

                {daySegs.map((s) => {
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
                        top: s.startFrac * HOUR_PX,
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

                {shiftsBelow.length > 0 && latestBelow ? (
                  <button
                    type="button"
                    className="vtk-week-indicator vtk-week-indicator-bottom"
                    style={{ top: scrollTop + effectiveVisibleHeight - 28 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollToHour(latestBelow.endFrac, true);
                    }}
                    title={`${t.laterShifts ?? 'Latere shiften'}: ${latestBelow.merged.shift.name} (${fmtTime(latestBelow.merged.shift.startTime)})`}
                    aria-label={`${t.laterShifts ?? 'Latere shiften op'} ${format(day, 'd/MM')}: ${latestBelow.merged.shift.name}`}
                  >
                    <ChevronDown className="vtk-week-indicator-chevron" aria-hidden="true" />
                    <span className="vtk-week-indicator-label">
                      {fmtTime(latestBelow.merged.shift.startTime)}
                    </span>
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>

        {segments.length === 0 ? <div className="vtk-week-empty">{emptyState}</div> : null}
      </div>
    </div>
  );
}
