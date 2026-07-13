'use client';
import { useMemo, useState } from 'react';
import { addDays, format } from 'date-fns';
import { getDictionary, type Locale } from '@vtk/i18n';
import { type ShiftResponse } from '@/lib/shift';
import { useToast } from '@/components/ui/toast';
import { fmtTime, useShiftList, registerShift, unregisterShift } from './tables';
import './week-view.css';

const HOUR_PX = 44;
const MS_PER_HOUR = 3_600_000;
// Weekdag-afkortingen per locale, geïndexeerd via Date.getDay() (0 = zondag).
const DOW = {
  nl: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'],
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
} as const;

type MergedShift = { shift: ShiftResponse; registered: boolean };

type Segment = {
  key: string;
  merged: MergedShift;
  dayIndex: number;
  startFrac: number; // uren sinds middernacht van die dag
  endFrac: number;
  col: number;
  cols: number;
};

/** `yyyy-MM-dd` → lokale middernacht (niet UTC, zodat de dag niet verspringt). */
function localMidnight(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Google-Calendar-achtige weekweergave: 7 dagkolommen vanaf een gekozen
 * startdatum (dus startdag + 6 dagen), met shiften als blokken op hun uren.
 * Klikken schrijft in/uit; blijft via de event-bus in sync met de lijstweergave.
 */
export function ShiftWeekView({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).shift;
  const showToast = useToast();
  const available = useShiftList('/api/shift');
  const registered = useShiftList('/api/shift/register');

  const [startStr, setStartStr] = useState<string>(() => format(new Date(), 'yyyy-MM-dd'));
  const weekStart = useMemo(() => localMidnight(startStr), [startStr]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  // Beschikbare + ingeschreven shiften samenvoegen (ingeschreven wint bij dubbel).
  const merged = useMemo<MergedShift[]>(() => {
    const map = new Map<string, MergedShift>();
    for (const s of available) map.set(s.id, { shift: s, registered: false });
    for (const s of registered) map.set(s.id, { shift: s, registered: true });
    return [...map.values()];
  }, [available, registered]);

  // Split shiften in dag-segmenten (voor shiften over middernacht), bepaal de
  // getoonde uren-range en leg overlappende shiften naast elkaar in kolommen.
  const { segments, minHour, maxHour } = useMemo(() => {
    const raw: Omit<Segment, 'col' | 'cols'>[] = [];
    for (const m of merged) {
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
  }, [merged, weekStart]);

  const gridHeight = (maxHour - minHour) * HOUR_PX;
  const hours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i);
  const shiftWeek = (delta: number) =>
    setStartStr(format(addDays(weekStart, delta), 'yyyy-MM-dd'));

  return (
    <div className="vtk-week">
      <div className="vtk-week-toolbar">
        <button
          type="button"
          className="vtk-basic-badge"
          onClick={() => shiftWeek(-7)}
          style={{ cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {t.week.prev}
        </button>
        <button
          type="button"
          className="vtk-basic-badge"
          onClick={() => setStartStr(format(new Date(), 'yyyy-MM-dd'))}
          style={{ cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {t.week.today}
        </button>
        <button
          type="button"
          className="vtk-basic-badge"
          onClick={() => shiftWeek(7)}
          style={{ cursor: 'pointer', fontFamily: 'inherit' }}
        >
          {t.week.next}
        </button>
        <label className="vtk-basic-field">
          <span className="vtk-basic-label">{t.week.startDate}</span>
          <input
            type="date"
            className="vtk-basic-input"
            value={startStr}
            onChange={(e) => setStartStr(e.target.value)}
          />
        </label>
      </div>

      <div className="vtk-week-scroll">
        <div className="vtk-week-grid">
          <div className="vtk-week-corner" />
          {days.map((day) => (
            <div key={day.toISOString()} className="vtk-week-head">
              <span className="vtk-week-dow">{DOW[locale][day.getDay()]}</span>
              <span className="vtk-week-date">{format(day, 'dd/MM')}</span>
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
              style={{
                height: gridHeight,
                backgroundImage: `repeating-linear-gradient(var(--line) 0 1px, transparent 1px ${HOUR_PX}px)`,
              }}
            >
              {segments
                .filter((s) => s.dayIndex === d)
                .map((s) => {
                  const { shift, registered } = s.merged;
                  const spots = shift.availableSpots ?? shift.maxParticipants - (shift.takenSpots ?? 0);
                  const isFull = !registered && spots <= 0;
                  const variant = registered
                    ? 'vtk-week-block-registered'
                    : isFull
                      ? 'vtk-week-block-full'
                      : 'vtk-week-block-available';

                  return (
                    <button
                      key={s.key}
                      type="button"
                      className={`vtk-week-block ${variant}`}
                      title={`${shift.name} · ${fmtTime(shift.startTime)}–${fmtTime(shift.endTime)} · ${shift.location}`}
                      disabled={isFull}
                      onClick={() =>
                        registered
                          ? unregisterShift(shift.id, showToast, t)
                          : registerShift(shift.id, showToast, t)
                      }
                      style={{
                        top: (s.startFrac - minHour) * HOUR_PX,
                        height: Math.max(18, (s.endFrac - s.startFrac) * HOUR_PX - 2),
                        left: `calc(${(s.col / s.cols) * 100}% + 2px)`,
                        width: `calc(${(1 / s.cols) * 100}% - 4px)`,
                      }}
                    >
                      <span className="vtk-week-block-time">{fmtTime(shift.startTime)}</span>
                      <span className="vtk-week-block-name">{shift.name}</span>
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
