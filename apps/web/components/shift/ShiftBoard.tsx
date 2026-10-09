'use client';
import { useMemo, useState } from 'react';
import { getDictionary, type Locale } from '@vtk/i18n';
import type { ShiftResponse } from '@/lib/shift';
import { postLabel, useShiftList, type MergedShift, type PostNames } from './shiftData';
import { groupShiftWeeks } from './shiftWeeks';
import { ShiftAgenda } from './ShiftAgenda';
import { ShiftWeekOutline } from './ShiftWeekOutline';
import { ShiftDialog } from './ShiftDialog';
import { MyShiftsRail, type ShiftYearStats } from './MyShiftsRail';
import './shift-board.css';

const ALL_POSTS = 'ALL';

/**
 * De shiftpagina: de donkere kop, daaronder de postfilter, alle shiften vanaf
 * vandaag per week onder elkaar, en de rail met de weken, je eigen shiften en de
 * stand van het academiejaar.
 *
 * Er was een weekkiezer met een weekrooster ernaast. Die is weg: wie een shift
 * zoekt, wil de komende weken overzien en niet per week klikken, en een rooster
 * van zeven dagkolommen kan niet zonder weekkiezer. Zie docs/design-decisions.md.
 *
 * `postNames` zet de groepscode van een shift om naar de naam van de post: de
 * pagina toonde `CURSUSDIENST` waar "Cursusdienst" hoort.
 */
export function ShiftBoard({
  locale,
  historyHref,
  stats,
  postNames,
  initialAvailable,
  initialRegistered,
}: {
  locale: Locale;
  historyHref: string;
  stats: ShiftYearStats;
  postNames: PostNames;
  /** Wat `/api/shift` nu zou geven, al op de server opgehaald. */
  initialAvailable?: ShiftResponse[];
  /** Wat `/api/shift/register` nu zou geven, al op de server opgehaald. */
  initialRegistered?: ShiftResponse[];
}) {
  const t = getDictionary(locale).shift;

  const available = useShiftList('/api/shift', initialAvailable);
  const registered = useShiftList('/api/shift/register', initialRegistered);

  const [now] = useState(() => new Date());
  const [postFilter, setPostFilter] = useState<string>(ALL_POSTS);
  const [opened, setOpened] = useState<MergedShift | null>(null);

  const merged = useMemo<MergedShift[]>(
    () => [
      ...registered.map((shift) => ({ shift, registered: true })),
      ...available.map((shift) => ({ shift, registered: false })),
    ],
    [available, registered]
  );

  const postCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const { shift } of merged) {
      if (!shift.post) continue;
      counts.set(shift.post, (counts.get(shift.post) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) =>
      postLabel(a[0], postNames).localeCompare(postLabel(b[0], postNames))
    );
  }, [merged, postNames]);

  const weeks = useMemo(() => {
    const visible =
      postFilter === ALL_POSTS
        ? merged
        : merged.filter((m) => (m.shift.post ?? '') === postFilter);
    return groupShiftWeeks(visible, now, { keepEmpty: postFilter === ALL_POSTS });
  }, [merged, postFilter, now]);

  const emptyState = (
    <div className="vtk-shift-empty">
      <p className="vtk-shift-empty-title">{t.empty.title}</p>
      <p className="vtk-shift-empty-text">{t.empty.none}</p>
    </div>
  );

  return (
    <>
      <header className="vtk-page-head">
        <div className="vtk-shift-head-intro">
          <h1 className="vtk-page-title">{t.shifts}</h1>
          <p className="vtk-page-subtitle">{t.subtitle}</p>
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
                  <span className="vtk-shift-chip-count">{merged.length}</span>
                </button>
                {postCounts.map(([post, count]) => (
                  <button
                    key={post}
                    type="button"
                    className="vtk-shift-chip"
                    aria-pressed={postFilter === post}
                    onClick={() => setPostFilter(post)}
                  >
                    {postLabel(post, postNames)}
                    <span className="vtk-shift-chip-count">{count}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <ShiftAgenda
              locale={locale}
              weeks={weeks}
              registeredShifts={registered}
              postNames={postNames}
              emptyState={emptyState}
              onOpen={setOpened}
            />
          </div>

          <aside className="vtk-shift-rail" aria-label={t.registered}>
            {weeks.length > 1 ? <ShiftWeekOutline locale={locale} weeks={weeks} /> : null}
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
          <ShiftDialog
            locale={locale}
            entry={opened}
            postNames={postNames}
            onClose={() => setOpened(null)}
          />
        ) : null}
      </div>
    </>
  );
}
