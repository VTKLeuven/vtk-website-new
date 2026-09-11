'use client';
import Link from 'next/link';
import { useState } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import { Clock } from 'lucide-react';
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
  if (days <= 6) return fill(t.rel.inDays, { n: days });
  return new Intl.DateTimeFormat(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(start);
}

/**
 * De rail in de marge volgens Richting A (Kalenderblad):
 * bovenaan de gele CTA met je eerstvolgende shift (of ruststand),
 * daaronder het register "Mijn shiften" met de haarlijn en gele indicator,
 * en als afsluiter het academiejaarblok met stempelcijfers.
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
  const next = upcoming[0] ?? null;

  return (
    <>
      {next ? (
        <button
          type="button"
          className="vtk-shift-rail-cta"
          onClick={() => onOpen({ shift: next, registered: true })}
          title={t.dialog.open}
        >
          <Clock aria-hidden="true" />
          <span className="vtk-shift-rail-cta-text">
            <span className="vtk-shift-rail-cta-title">{t.rail.nextShift}</span>
            <span className="vtk-shift-rail-cta-meta">
              {next.name}, {whenLabel(next.startTime, now, locale, t).toLowerCase()} om {fmtTime(next.startTime)}
            </span>
          </span>
        </button>
      ) : (
        <div className="vtk-shift-rail-cta" data-state="closed">
          <Clock aria-hidden="true" />
          <span className="vtk-shift-rail-cta-text">
            <span className="vtk-shift-rail-cta-title">{t.rail.emptyTitle}</span>
            <span className="vtk-shift-rail-cta-meta">{t.rail.emptySub}</span>
          </span>
        </div>
      )}

      <div className="vtk-shift-rail-box" aria-labelledby="vtk-shift-mine-title">
        <h2 id="vtk-shift-mine-title">{t.registered}</h2>
        {upcoming.length === 0 ? (
          <p className="vtk-shift-rail-empty">{t.rail.emptyText}</p>
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
