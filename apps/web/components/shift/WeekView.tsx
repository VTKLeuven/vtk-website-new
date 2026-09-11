'use client';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { addDays } from 'date-fns';
import { AlertTriangle, ChevronDown, ChevronUp, Globe, MapPin } from 'lucide-react';
import { getDictionary, type Locale } from '@vtk/i18n';
import { canUnregister, type ShiftResponse } from '@/lib/shift';
import { fill, fmtTime, freeSpots, spotsLabel, type MergedShift } from './shiftData';

const HOUR_PX = 48;
const TOTAL_HOURS = 24;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;
const MS_PER_HOUR = 3_600_000;
const HEADER_HEIGHT = 44;

const subscribeToClient = () => () => undefined;

const DOW_SHORT: Record<Locale, string[]> = {
  nl: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'],
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
};

const MONTH_SHORT: Record<Locale, string[]> = {
  nl: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

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
 * Weekweergave volgens Richting A (Kalenderblad):
 * 7 dagkolommen vanaf `weekStart` op een 24u-tijdsas, waarbij overlappende shiften
 * expliciet naast elkaar in parallelle kolommen worden geplaatst en duidelijke
 * overlap- en clash-indicatoren dragen.
 */
export function ShiftWeekView({
  locale,
  weekStart,
  shifts,
  registeredShifts = [],
  emptyState,
  onOpen,
}: {
  locale: Locale;
  weekStart: Date;
  shifts: MergedShift[];
  registeredShifts?: ShiftResponse[];
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

  // Split shiften in dag-segmenten en groepeer overlappende shiften
  // in parallelle kolommen naast elkaar.
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

  // Positie van de "nu"-lijn
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
          {days.map((day, d) => {
            const isToday = nowLine?.index === d;
            return (
              <div
                key={day.toISOString()}
                className="vtk-week-head"
                data-today={isToday ? 'true' : undefined}
              >
                <span className="vtk-week-dow">{DOW_SHORT[locale][day.getDay()]}</span>
                <b className="vtk-week-date-num">{day.getDate()}</b>
                <small className="vtk-week-month">{MONTH_SHORT[locale][day.getMonth()]}</small>
              </div>
            );
          })}

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
                    style={{ top: scrollTop + 6 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollToHour(earliestAbove.startFrac, false);
                    }}
                    title={`${t.earlierShifts ?? 'Vroegere shiften'}: ${earliestAbove.merged.shift.name} (${fmtTime(earliestAbove.merged.shift.startTime)})`}
                    aria-label={`${t.earlierShifts ?? 'Vroegere shiften'}: ${earliestAbove.merged.shift.name}`}
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
                  const height = Math.max(26, (s.endFrac - s.startFrac) * HOUR_PX - 3);
                  const isOverlap = s.cols > 1;

                  // Conflict met een shift waarvoor de user al is ingeschreven
                  const conflict = !registered
                    ? registeredShifts.find(
                        (mine) =>
                          mine.id !== shift.id &&
                          mine.startTime < shift.endTime &&
                          mine.endTime > shift.startTime
                      )
                    : null;

                  const statusText = registered
                    ? t.isRegistered
                    : isFull
                      ? t.spots.full
                      : fill(t.spots.few, { n: freeSpots(shift) });

                  const clashTooltip = conflict
                    ? ` · ${fill(t.clashWarning, { name: conflict.name })}`
                    : isOverlap
                      ? ' · Overlapt in tijd met andere shiften'
                      : '';

                  return (
                    <button
                      key={s.key}
                      type="button"
                      className="vtk-week-block"
                      data-state={registered ? 'mine' : isFull ? 'full' : 'open'}
                      data-overlap={isOverlap ? 'true' : undefined}
                      data-clash={conflict ? 'true' : undefined}
                      data-compact={height < 60 ? 'true' : undefined}
                      title={`${shift.name} (${fmtTime(shift.startTime)} - ${fmtTime(shift.endTime)}) · ${shift.location} · ${statusText}${clashTooltip}`}
                      aria-label={`${t.dialog.open}: ${shift.name}, ${fmtTime(shift.startTime)} - ${fmtTime(shift.endTime)}, ${shift.location}`}
                      onClick={() => onOpen(s.merged)}
                      style={{
                        top: s.startFrac * HOUR_PX,
                        height,
                        left: `calc(${(s.col / s.cols) * 100}% + 2px)`,
                        width: `calc(${(1 / s.cols) * 100}% - 4px)`,
                      }}
                    >
                      <span className="vtk-week-block-time">
                        <b>{fmtTime(shift.startTime)}</b> - {fmtTime(shift.endTime)}
                        {shift.openToInternationals ? (
                          <Globe className="vtk-week-block-globe" aria-hidden="true" />
                        ) : null}
                      </span>

                      <span className="vtk-week-block-name">{shift.name}</span>

                      {conflict ? (
                        <span className="vtk-week-clash-badge" title={fill(t.clashWarning, { name: conflict.name })}>
                          <AlertTriangle aria-hidden="true" />
                          <span>{t.clash}</span>
                        </span>
                      ) : (
                        <span className="vtk-week-block-status">
                          {registered ? (
                            <span className="vtk-week-pill-mine">{t.isRegistered}</span>
                          ) : isFull ? (
                            <span className="vtk-week-pill-full">{t.spots.full}</span>
                          ) : (
                            <span className="vtk-week-pill-open">
                              {fill(t.spots.few, { n: freeSpots(shift) })}
                            </span>
                          )}
                        </span>
                      )}

                      {height >= 80 && shift.location ? (
                        <span className="vtk-week-block-loc">
                          <MapPin aria-hidden="true" />
                          <span>{shift.location}</span>
                        </span>
                      ) : null}
                    </button>
                  );
                })}

                {shiftsBelow.length > 0 && latestBelow ? (
                  <button
                    type="button"
                    className="vtk-week-indicator vtk-week-indicator-bottom"
                    style={{ top: scrollTop + effectiveVisibleHeight - 30 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      scrollToHour(latestBelow.endFrac, true);
                    }}
                    title={`${t.laterShifts ?? 'Latere shiften'}: ${latestBelow.merged.shift.name} (${fmtTime(latestBelow.merged.shift.startTime)})`}
                    aria-label={`${t.laterShifts ?? 'Latere shiften'}: ${latestBelow.merged.shift.name}`}
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

        {segments.length === 0 ? (
          <div
            className="vtk-week-empty"
            style={{ top: scrollTop + HEADER_HEIGHT, height: effectiveVisibleHeight }}
          >
            {emptyState}
          </div>
        ) : null}
      </div>
    </div>
  );
}
