'use client';
import { useMemo, useState } from 'react';
import { addDays, isSameDay } from 'date-fns';
import { AlertTriangle, MapPin, Ticket } from 'lucide-react';
import { getDictionary, type Locale } from '@vtk/i18n';
import { canUnregister, type ShiftResponse } from '@/lib/shift';
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

const DOW_SHORT: Record<Locale, string[]> = {
  nl: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'],
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
};

const MONTH_SHORT: Record<Locale, string[]> = {
  nl: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

type DayData = {
  index: number;
  date: Date;
  isToday: boolean;
  items: MergedShift[];
};

/**
 * Lijstweergave volgens Richting A (Kalenderblad):
 * elke dag hangt aan de gele datumpin van de evenementenkaart, de haarlijn verbindt
 * de pins over de week, en de shiften liggen per dag gebundeld in een kaart.
 */
export function ShiftAgenda({
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
  const showToast = useToast();
  const [now] = useState(() => Date.now());

  const days: DayData[] = useMemo(() => {
    const nowDate = new Date(now);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i);
      const items = shifts
        .filter((entry) => isSameDay(entry.shift.startTime, date))
        .sort((a, b) => a.shift.startTime.getTime() - b.shift.startTime.getTime());
      return {
        index: i,
        date,
        isToday: isSameDay(date, nowDate),
        items,
      };
    });
  }, [shifts, weekStart, now]);

  const weekdayFmt = new Intl.DateTimeFormat(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    weekday: 'long',
  });

  if (shifts.length === 0) return <>{emptyState}</>;

  return (
    <ol className="vtk-shift-days">
      {days.map((day) => {
        const n = day.items.length;
        const dowStr = DOW_SHORT[locale][day.date.getDay()];
        const monthStr = MONTH_SHORT[locale][day.date.getMonth()];
        const weekdayName = weekdayFmt.format(day.date);
        const capitalizedDay = weekdayName.charAt(0).toUpperCase() + weekdayName.slice(1);

        if (n === 0) {
          return (
            <li key={day.date.toISOString()} className="vtk-shift-day" data-empty="true">
              <span className="vtk-shift-pin vtk-shift-pin-quiet" aria-hidden="true">
                <i>{dowStr}</i>
                <b>{day.date.getDate()}</b>
                <i>{monthStr}</i>
              </span>
              <div className="vtk-shift-day-body">
                <div className="vtk-shift-day-head">
                  <h3 className="vtk-shift-day-name">
                    {fill(t.day.emptyDay, { day: capitalizedDay })}
                  </h3>
                  {day.isToday ? (
                    <span className="vtk-shift-today-tag">{t.week.today}</span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        }

        const countLabel =
          n === 1 ? t.day.shiftsOne : fill(t.day.shifts, { n });

        return (
          <li key={day.date.toISOString()} className="vtk-shift-day">
            <span className="vtk-shift-pin" aria-hidden="true">
              <i>{dowStr}</i>
              <b>{day.date.getDate()}</b>
              <i>{monthStr}</i>
            </span>

            <div className="vtk-shift-day-body">
              <div className="vtk-shift-day-head">
                <h3 className="vtk-shift-day-name">{capitalizedDay}</h3>
                <span className="vtk-shift-day-count">{countLabel}</span>
                {day.isToday ? (
                  <span className="vtk-shift-today-tag">{t.week.today}</span>
                ) : null}
              </div>

              <ul className="vtk-shift-card">
                {day.items.map((entry) => {
                  const { shift, registered } = entry;
                  const isFull = !registered && freeSpots(shift) <= 0;
                  const locked = registered && !canUnregister(shift, now);

                  // Detecteer clash met eigen inschrijving
                  const conflict = !registered
                    ? registeredShifts.find(
                        (mine) =>
                          mine.id !== shift.id &&
                          mine.startTime < shift.endTime &&
                          mine.endTime > shift.startTime
                      )
                    : null;

                  return (
                    <li
                      key={shift.id}
                      className="vtk-shift-row"
                      data-state={registered ? 'mine' : isFull ? 'full' : 'open'}
                    >
                      <button
                        type="button"
                        className="vtk-shift-row-main"
                        title={t.dialog.open}
                        onClick={() => onOpen(entry)}
                      >
                        <span className="vtk-shift-time">
                          <b>{fmtTime(shift.startTime)}</b>
                          <span>{fill(t.until, { time: fmtTime(shift.endTime) })}</span>
                        </span>

                        <span className="vtk-shift-what">
                          <span className="vtk-shift-title">
                            <span className="vtk-shift-title-text">{shift.name}</span>
                            {shift.openToInternationals ? (
                              <InternationalsBadge locale={locale} compact />
                            ) : null}
                          </span>

                          <span className="vtk-shift-meta">
                            {shift.post ? (
                              <span className="vtk-shift-post">{shift.post}</span>
                            ) : null}
                            <span className="vtk-shift-meta-i">
                              <MapPin aria-hidden="true" />
                              <span>{shift.location}</span>
                            </span>
                            <span className="vtk-shift-meta-i">
                              <Ticket aria-hidden="true" />
                              <span>{rewardLabel(shift.reward, t)}</span>
                            </span>
                            {conflict ? (
                              <span
                                className="vtk-shift-clash-warning"
                                title={fill(t.clashWarning, { name: conflict.name })}
                              >
                                <AlertTriangle aria-hidden="true" />
                                <span>{t.clash}</span>
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </button>

                      <div className="vtk-shift-act">
                        {registered ? (
                          <>
                            <span className="vtk-shift-spots vtk-shift-spots-mine">
                              {t.isRegistered}
                            </span>
                            <button
                              type="button"
                              className="vtk-shift-btn vtk-shift-btn-ghost vtk-shift-btn-sm"
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
                              className={`vtk-shift-spots vtk-shift-spots-${spotsVariant(shift)}`}
                              title={fill(t.spots.taken, {
                                taken: shift.takenSpots ?? 0,
                                max: shift.maxParticipants,
                              })}
                            >
                              {spotsLabel(shift, t)}
                            </span>
                            <button
                              type="button"
                              className="vtk-shift-btn vtk-shift-btn-sm"
                              disabled={isFull}
                              onClick={() => registerShift(shift.id, showToast, t)}
                            >
                              {t.register}
                            </button>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
