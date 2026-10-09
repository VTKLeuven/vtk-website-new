'use client';
import { useEffect, useMemo, useState } from 'react';
import { getDictionary, type Locale } from '@vtk/i18n';
import { activeAnchor } from '@/lib/pageOutline';
import { fill } from './shiftData';
import { weekName } from './ShiftAgenda';
import { weekAnchor, type ShiftWeek } from './shiftWeeks';

/**
 * Hoogte waarop een week als "gelezen" telt: net onder de sticky sitekop en de
 * `scroll-margin-top` van de weekkop, zoals in `PageOutline`.
 */
const READING_LINE = 120;

/**
 * De weken in de rail, als register met een gele markering op de week die je
 * leest. Het vervangt de weekkiezer: in een lijst van negen weken wil je weten
 * waar je zit en in één klik bij een latere week geraken.
 *
 * Eén regel per week, met het aantal shiften waar nog plaats is rechts: de rail
 * plakt, en met twee regels per week duwde een druk semester "Mijn shiften"
 * onder de rand van het scherm.
 */
export function ShiftWeekOutline({ locale, weeks }: { locale: Locale; weeks: ShiftWeek[] }) {
  const t = getDictionary(locale).shift;
  const [active, setActive] = useState<string | null>(null);
  const ids = useMemo(() => weeks.map(weekAnchor), [weeks]);

  useEffect(() => {
    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);
    if (sections.length === 0) return;

    let frame = 0;
    const measure = () => {
      frame = 0;
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      setActive(
        activeAnchor(
          sections.map((el) => ({
            id: el.id,
            top: el.getBoundingClientRect().top + window.scrollY,
          })),
          { scrolled: Math.min(window.scrollY, maxScroll), maxScroll, readingLine: READING_LINE }
        )
      );
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [ids]);

  return (
    <nav className="vtk-shift-rail-box vtk-shift-rail-weeks" aria-labelledby="vtk-shift-weeks-title">
      <h2 id="vtk-shift-weeks-title">{t.week.outline}</h2>
      <ul className="vtk-shift-rail-list">
        {weeks.map((week) => {
          const id = weekAnchor(week);
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                className="vtk-shift-rail-item vtk-shift-rail-week"
                aria-current={active === id ? 'true' : undefined}
              >
                <span>{weekName(week, t)}</span>
                <small>
                  {week.shifts.length > 0 ? fill(t.week.open, { n: week.open }) : t.day.noShifts}
                </small>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
