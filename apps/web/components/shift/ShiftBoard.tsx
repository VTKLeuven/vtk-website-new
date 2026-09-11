'use client';
import { useMemo, useState } from 'react';
import { addDays, getISOWeek, startOfWeek } from 'date-fns';
import { getDictionary, type Locale } from '@vtk/i18n';
import type { ShiftResponse } from '@/lib/shift';
import { fill, freeSpots, useShiftList, type MergedShift } from './shiftData';
import { ShiftAgenda } from './ShiftAgenda';
import { ShiftWeekView } from './WeekView';
import { ShiftDialog } from './ShiftDialog';
import { MyShiftsRail, type ShiftYearStats } from './MyShiftsRail';
import './shift-board.css';

type View = 'week' | 'list';

const ALL_POSTS = 'ALL';

/** Maandag van de week waarin `date` valt. */
function mondayOf(date: Date): Date {
  return startOfWeek(date, { weekStartsOn: 1 });
}

/**
 * De shiftpagina volgens Richting A (Kalenderblad):
 * de donkere kop draagt weeknavigatie, weergavekeuze en vandaag-knop,
 * daaronder het raster met postfilter, weekrooster/lijst en rail.
 */
export function ShiftBoard({
  locale,
  historyHref,
  stats,
}: {
  locale: Locale;
  historyHref: string;
  stats: ShiftYearStats;
}) {
  const t = getDictionary(locale).shift;

  const available = useShiftList('/api/shift');
  const registered = useShiftList('/api/shift/register');

  const [view, setView] = useState<View>('list');
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date()));
  const [postFilter, setPostFilter] = useState<string>(ALL_POSTS);
  const [opened, setOpened] = useState<MergedShift | null>(null);

  const weekEnd = addDays(weekStart, 7);

  const merged = useMemo<MergedShift[]>(
    () => [
      ...registered.map((shift) => ({ shift, registered: true })),
      ...available.map((shift) => ({ shift, registered: false })),
    ],
    [available, registered]
  );

  const weekShifts = useMemo(
    () => merged.filter((m) => m.shift.endTime > weekStart && m.shift.startTime < weekEnd),
    [merged, weekStart, weekEnd]
  );

  const postCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { shift } of weekShifts) {
      if (!shift.post) continue;
      counts.set(shift.post, (counts.get(shift.post) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [weekShifts]);

  const visible = useMemo(
    () =>
      postFilter === ALL_POSTS
        ? weekShifts
        : weekShifts.filter((m) => (m.shift.post ?? '') === postFilter),
    [weekShifts, postFilter]
  );

  const nextShift = useMemo<ShiftResponse | null>(() => {
    const later = merged
      .filter((m) => m.shift.startTime >= weekEnd)
      .filter((m) => postFilter === ALL_POSTS || (m.shift.post ?? '') === postFilter)
      .sort((a, b) => a.shift.startTime.getTime() - b.shift.startTime.getTime());
    return later[0]?.shift ?? null;
  }, [merged, weekEnd, postFilter]);

  const intl = locale === 'nl' ? 'nl-BE' : 'en-GB';
  const dayMonthFmt = new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'long' });
  const dayFmt = new Intl.DateTimeFormat(intl, { day: 'numeric' });
  const lastDay = addDays(weekStart, 6);
  const weekLabel = fill(t.week.range, {
    from:
      weekStart.getMonth() === lastDay.getMonth()
        ? dayFmt.format(weekStart)
        : dayMonthFmt.format(weekStart),
    to: dayMonthFmt.format(lastDay),
  });

  const isoWeek = getISOWeek(weekStart);
  const openCount = weekShifts.filter((m) => !m.registered && freeSpots(m.shift) > 0).length;
  const weekSub =
    weekShifts.length > 0
      ? fill(t.week.summary, {
          week: isoWeek,
          total: weekShifts.length,
          open: openCount,
        })
      : fill(t.week.summaryEmpty, { week: isoWeek });

  const jumpLabel = nextShift
    ? new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short' }).format(nextShift.startTime)
    : '';

  const emptyState = (
    <div className="vtk-shift-empty">
      <p className="vtk-shift-empty-title">{t.empty.week}</p>
      {nextShift ? (
        <>
          <p className="vtk-shift-empty-text">
            {fill(t.empty.next, { name: nextShift.name, date: jumpLabel })}
          </p>
          <button
            type="button"
            className="vtk-shift-btn"
            onClick={() => setWeekStart(mondayOf(nextShift.startTime))}
          >
            {fill(t.empty.jump, { date: jumpLabel })}
          </button>
        </>
      ) : (
        <p className="vtk-shift-empty-text">{t.empty.none}</p>
      )}
    </div>
  );

  return (
    <>
      <header className="vtk-page-head vtk-shift-page-head">
        <div className="vtk-shift-head-intro">
          <h1 className="vtk-page-title">{t.shifts}</h1>
          <p className="vtk-page-subtitle">{t.subtitle}</p>
        </div>

        <div className="vtk-shift-tools" role="region" aria-label={t.shifts}>
          <div className="vtk-shift-weeknav">
            <button
              type="button"
              className="vtk-shift-round"
              aria-label={t.week.prev}
              title={t.week.prev}
              onClick={() => setWeekStart((d) => addDays(d, -7))}
            >
              ←
            </button>
            <div className="vtk-shift-week-label">
              <span>{weekLabel}</span>
              <small>{weekSub}</small>
            </div>
            <button
              type="button"
              className="vtk-shift-round"
              aria-label={t.week.next}
              title={t.week.next}
              onClick={() => setWeekStart((d) => addDays(d, 7))}
            >
              →
            </button>
          </div>

          <div className="vtk-shift-view-switch" role="group" aria-label={t.view.label}>
            <button
              type="button"
              aria-pressed={view === 'week'}
              onClick={() => setView('week')}
            >
              {t.view.week}
            </button>
            <button
              type="button"
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              {t.view.list}
            </button>
          </div>

          <button
            type="button"
            className="vtk-shift-today-btn"
            onClick={() => setWeekStart(mondayOf(new Date()))}
          >
            {t.week.today}
          </button>
        </div>
      </header>

      <div className="vtk-page-shell">
        <div className="vtk-shift-grid">
          <div className="vtk-shift-main">
            {postCounts.length > 0 ? (
              <div className="vtk-shift-chips" role="group" aria-label={t.filter.post}>
                <button
                  type="button"
                  className="vtk-shift-chip"
                  aria-pressed={postFilter === ALL_POSTS}
                  onClick={() => setPostFilter(ALL_POSTS)}
                >
                  {t.filter.allPosts}
                  <span className="vtk-shift-chip-count">{weekShifts.length}</span>
                </button>
                {postCounts.map(([post, count]) => (
                  <button
                    key={post}
                    type="button"
                    className="vtk-shift-chip"
                    aria-pressed={postFilter === post}
                    onClick={() => setPostFilter(post)}
                  >
                    {post}
                    <span className="vtk-shift-chip-count">{count}</span>
                  </button>
                ))}
              </div>
            ) : null}

            {view === 'week' ? (
              <ShiftWeekView
                locale={locale}
                weekStart={weekStart}
                shifts={visible}
                registeredShifts={registered}
                emptyState={emptyState}
                onOpen={setOpened}
              />
            ) : (
              <ShiftAgenda
                locale={locale}
                weekStart={weekStart}
                shifts={visible}
                registeredShifts={registered}
                emptyState={emptyState}
                onOpen={setOpened}
              />
            )}
          </div>

          <aside className="vtk-shift-rail" aria-label={t.registered}>
            <MyShiftsRail
              locale={locale}
              shifts={registered}
              stats={stats}
              historyHref={historyHref}
              onOpen={setOpened}
            />
          </aside>
        </div>

        {opened ? (
          <ShiftDialog locale={locale} entry={opened} onClose={() => setOpened(null)} />
        ) : null}
      </div>
    </>
  );
}
