'use client';
import { useMemo, useState } from 'react';
import { getDictionary, type Locale } from '@vtk/i18n';
import { canUnregister } from '@/lib/shift';
import { useToast } from '@/components/ui/toast';
import { InternationalsBadge } from './ShiftDialog';
import {
  fill,
  fmtTime,
  freeSpots,
  registerShift,
  rewardLabel,
  spotsLabel,
  spotsVariant,
  unregisterShift,
  type MergedShift,
} from './shiftData';

type DayGroup = { key: string; date: Date; items: MergedShift[] };

/** `Date` → sleutel per kalenderdag (lokale tijd). */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/**
 * Groepeert de shiften van de week per kalenderdag. Een shift die vóór de week
 * begon maar erin doorloopt (nachtshift op de grens) hangt onder de eerste dag.
 */
function groupByDay(shifts: MergedShift[], weekStart: Date): DayGroup[] {
  const groups = new Map<string, DayGroup>();

  for (const item of shifts) {
    const start = item.shift.startTime < weekStart ? weekStart : item.shift.startTime;
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const key = dayKey(date);
    const group = groups.get(key);
    if (group) group.items.push(item);
    else groups.set(key, { key, date, items: [item] });
  }

  const days = [...groups.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  for (const day of days) {
    day.items.sort((a, b) => a.shift.startTime.getTime() - b.shift.startTime.getTime());
  }
  return days;
}

/**
 * De lijstweergave: de shiften van de getoonde week onder elkaar, gegroepeerd
 * per dag met de datum als kolom links. De rij zelf opent het detailvenster; de
 * knop ernaast is de snelle weg voor wie de shift al kent.
 */
export function ShiftAgenda({
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
  const showToast = useToast();
  // Klok één keer vastleggen bij mount: tijdens de render lezen is onzuiver, en
  // een verouderde "binnen 24u"-vlag in een lang openstaande tab is onschuldig.
  const [now] = useState(() => Date.now());

  const days = useMemo(() => groupByDay(shifts, weekStart), [shifts, weekStart]);

  const weekdayFmt = new Intl.DateTimeFormat(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    weekday: 'long',
  });
  const dayFmt = new Intl.DateTimeFormat(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  });

  if (days.length === 0) return <>{emptyState}</>;

  return (
    <div className="vtk-shift-agenda">
      {days.map((day) => (
        <div key={day.key} className="vtk-shift-day">
          <div className="vtk-shift-day-label">
            <span className="vtk-shift-dow">{weekdayFmt.format(day.date)}</span>
            <span className="vtk-shift-date">{dayFmt.format(day.date)}</span>
          </div>

          <div className="vtk-shift-rows">
            {day.items.map((entry) => {
              const { shift, registered } = entry;
              const isFull = !registered && freeSpots(shift) <= 0;
              const locked = registered && !canUnregister(shift, now);

              return (
                <div
                  key={shift.id}
                  className="vtk-shift-row"
                  data-state={registered ? 'registered' : isFull ? 'full' : 'open'}
                >
                  <button
                    type="button"
                    className="vtk-shift-row-main"
                    title={t.dialog.open}
                    onClick={() => onOpen(entry)}
                  >
                    <span className="vtk-shift-row-time">
                      <span className="vtk-shift-row-start">{fmtTime(shift.startTime)}</span>
                      <span className="vtk-shift-row-end">
                        {fill(t.until, { time: fmtTime(shift.endTime) })}
                      </span>
                    </span>
                    <span className="vtk-shift-row-body">
                      <span className="vtk-shift-row-name">
                        {shift.name}
                        {shift.openToInternationals ? (
                          <InternationalsBadge locale={locale} />
                        ) : null}
                      </span>
                      <span className="vtk-shift-row-meta">
                        <span>{shift.location}</span>
                        {shift.post ? (
                          <>
                            <span className="vtk-shift-sep" aria-hidden="true" />
                            <span>{shift.post}</span>
                          </>
                        ) : null}
                        <span className="vtk-shift-sep" aria-hidden="true" />
                        <span>{rewardLabel(shift.reward, t)}</span>
                      </span>
                    </span>
                  </button>

                  <div className="vtk-shift-row-actions">
                    {registered ? (
                      <>
                        <span className="vtk-basic-badge vtk-basic-badge-accent">
                          {t.isRegistered}
                        </span>
                        <button
                          type="button"
                          className="vtk-basic-action vtk-basic-action-danger"
                          disabled={locked}
                          title={locked ? t.error.tooLateToUnregister : undefined}
                          onClick={() => unregisterShift(shift.id, showToast, t)}
                        >
                          {t.unregister}
                        </button>
                      </>
                    ) : (
                      <>
                        <span
                          className={`vtk-basic-badge vtk-basic-badge-${spotsVariant(shift)}`}
                          title={fill(t.spots.taken, {
                            taken: shift.takenSpots ?? 0,
                            max: shift.maxParticipants,
                          })}
                        >
                          {spotsLabel(shift, t)}
                        </span>
                        <button
                          type="button"
                          className="vtk-basic-action"
                          disabled={isFull}
                          onClick={() => registerShift(shift.id, showToast, t)}
                        >
                          {t.register}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
