'use client';
import Link from '@/components/ui/Link';
import { useState } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import { getDictionary, type Locale } from '@vtk/i18n';
import { canUnregister, type ShiftResponse } from '@/lib/shift';
import {
  fill,
  fmtTime,
  type MergedShift,
  type ShiftDict,
} from './shiftData';

/** Stand van het lopende academiejaar, serverside geteld in de shiftpagina. */
export type ShiftYearStats = {
  /** Bvb "25-26". */
  yearLabel: string;
  shiftsDone: number;
  vouchers: number;
};

/**
 * "Vandaag", "Morgen", "Over 3 dagen" of gewoon de dag zelf: dichtbij telt de
 * afstand, verderaf wil je de datum zien.
 */
function whenLabel(start: Date, now: number, locale: Locale, t: ShiftDict): string {
  const days = differenceInCalendarDays(start, now);
  if (days <= 0) return t.rel.today;
  if (days === 1) return t.rel.tomorrow;

  const intl = locale === 'nl' ? 'nl-BE' : 'en-GB';
  const rawDay = new Intl.DateTimeFormat(intl, { weekday: 'long' }).format(start);
  const weekday = rawDay.charAt(0).toUpperCase() + rawDay.slice(1);
  const dayMonth = new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short' }).format(start);
  const explicitDay = `${weekday} ${dayMonth}`;

  if (days <= 6) {
    return `${explicitDay} (${fill(t.rel.inDays, { n: days }).toLowerCase()})`;
  }
  return explicitDay;
}

/**
 * De rail in de marge: het register "Mijn shiften" met de haarlijn en een gele
 * markering op je eerstvolgende shift, en daaronder het academiejaarblok.
 *
 * Bovenaan stond ook een gele knop met je volgende shift. Die herhaalde de eerste
 * regel van het register, en zonder inschrijving stonden er twee zinnen onder
 * elkaar die hetzelfde zeiden, in een grijs vak dat las als een uitgeschakelde
 * knop. Het register alleen volstaat.
 */
export function MyShiftsRail({
  locale,
  shifts,
  stats,
  historyHref,
  onOpen,
}: {
  locale: Locale;
  shifts: ShiftResponse[];
  stats: ShiftYearStats;
  historyHref: string;
  onOpen: (entry: MergedShift) => void;
}) {
  const t = getDictionary(locale).shift;
  const [now] = useState(() => Date.now());

  const upcoming = [...shifts].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return (
    <>
      <div className="vtk-shift-rail-box" aria-labelledby="vtk-shift-mine-title">
        <h2 id="vtk-shift-mine-title">{t.registered}</h2>
        {upcoming.length === 0 ? (
          <p className="vtk-shift-rail-empty">
            {t.rail.emptyTitle}. {t.rail.emptyText}
          </p>
        ) : (
          <ul className="vtk-shift-rail-list">
            {upcoming.map((shift, i) => {
              const locked = !canUnregister(shift, now);
              return (
                <li key={shift.id}>
                  <button
                    type="button"
                    className="vtk-shift-rail-item"
                    aria-current={i === 0 ? 'true' : undefined}
                    onClick={() => onOpen({ shift, registered: true })}
                    title={t.dialog.open}
                  >
                    <span className="vtk-shift-rail-item-name">{shift.name}</span>
                    <small>
                      {whenLabel(shift.startTime, now, locale, t)}, {fmtTime(shift.startTime)} {fill(t.until, { time: fmtTime(shift.endTime) })}
                    </small>
                    {locked ? <small className="vtk-shift-rail-lock">{t.locked}</small> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="vtk-shift-rail-box" aria-labelledby="vtk-shift-year-title">
        <h2 id="vtk-shift-year-title">{fill(t.rail.year, { year: stats.yearLabel })}</h2>
        <dl className="vtk-shift-stamps">
          <div>
            <dt>{t.rail.shiftsDone}</dt>
            <dd>{stats.shiftsDone}</dd>
          </div>
          <div>
            <dt>{t.rail.vouchers}</dt>
            <dd>{stats.vouchers}</dd>
          </div>
        </dl>
        <Link href={historyHref} className="vtk-shift-btn-link">
          {t.history.link} →
        </Link>
      </div>
    </>
  );
}
