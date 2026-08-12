'use client';
import Link from 'next/link';
import { useState } from 'react';
import { differenceInCalendarDays } from 'date-fns';
import { getDictionary, type Locale } from '@vtk/i18n';
import { canUnregister, type ShiftResponse } from '@/lib/shift';
import { useToast } from '@/components/ui/toast';
import { InternationalsBadge } from './ShiftDialog';
import {
  fill,
  fmtTime,
  rewardLabel,
  unregisterShift,
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
 * De rail naast het overzicht: je eigen komende shiften en je stand van dit
 * academiejaar. Blijft in beeld terwijl je door de week scrolt.
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
  const showToast = useToast();
  // Klok vastleggen bij mount, zoals in de lijst: zie ShiftAgenda.
  const [now] = useState(() => Date.now());

  const upcoming = [...shifts].sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  return (
    <>
      <section className="vtk-shift-card" aria-labelledby="vtk-shift-mine-title">
        <h2 className="vtk-shift-card-title" id="vtk-shift-mine-title">
          {t.registered}
        </h2>

        {upcoming.length === 0 ? (
          <div className="vtk-shift-mine-empty">
            <p className="vtk-shift-mine-empty-title">{t.rail.emptyTitle}</p>
            <p className="vtk-shift-mine-empty-text">{t.rail.emptyText}</p>
          </div>
        ) : (
          <ul className="vtk-shift-mine-list">
            {upcoming.map((shift) => {
              const locked = !canUnregister(shift, now);
              return (
                <li key={shift.id} className="vtk-shift-mine">
                  <button
                    type="button"
                    className="vtk-shift-mine-main"
                    title={t.dialog.open}
                    onClick={() => onOpen({ shift, registered: true })}
                  >
                    <span className="vtk-shift-mine-when">
                      {whenLabel(shift.startTime, now, locale, t)} {fmtTime(shift.startTime)}
                    </span>
                    <span className="vtk-shift-mine-name">
                      {shift.name}
                      {shift.openToInternationals ? <InternationalsBadge locale={locale} compact /> : null}
                    </span>
                    <span className="vtk-shift-mine-meta">
                      {shift.location}
                      <span className="vtk-shift-sep" aria-hidden="true" />
                      {fill(t.until, { time: fmtTime(shift.endTime) })}
                    </span>
                  </button>
                  <div className="vtk-shift-mine-foot">
                    <span className="vtk-shift-note">
                      {locked ? t.locked : rewardLabel(shift.reward, t)}
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
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="vtk-shift-year" aria-labelledby="vtk-shift-year-title">
        <h2 className="vtk-shift-card-title" id="vtk-shift-year-title">
          {fill(t.rail.year, { year: stats.yearLabel })}
        </h2>
        <div className="vtk-shift-year-stats">
          <div>
            <span className="vtk-shift-stat-n">{stats.shiftsDone}</span>
            <span className="vtk-shift-stat-l">{t.rail.shiftsDone}</span>
          </div>
          <div>
            <span className="vtk-shift-stat-n">{stats.vouchers}</span>
            <span className="vtk-shift-stat-l">{t.rail.vouchers}</span>
          </div>
        </div>
        <Link href={historyHref} className="vtk-shift-year-link">
          {t.history.link} →
        </Link>
      </section>
    </>
  );
}
