import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from '@/components/ui/Link';
import { IconLink } from '@/components/ui/IconButton';
import { isoWeekKey, shiftYMD, ymdKey, type YMD } from '@/lib/brussels';

/** Een kalenderdag als Date op de middag in UTC, om met `timeZone: "UTC"` te formatteren. */
const noonUtc = (ymd: YMD) => new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12));

type WeekProps = {
  monday: YMD;
  defaultMonday: YMD;
  /** Het pad van het tabblad, met taalprefix. */
  path: string;
  nl: boolean;
};

/**
 * De weekkiezer van beide tabbladen (Shifters en Verantwoordelijken): vorige en
 * volgende week, het weeknummer met de dagen, en rechts wat het tabblad over
 * die week te zeggen heeft.
 */
export function WeekNav({ children, ...props }: WeekProps & { children?: ReactNode }) {
  return (
    <div className="tk-sh-toolbar">
      <WeekPicker {...props} />
      {children}
    </div>
  );
}

/** Enkel de kiezer, voor een tabblad dat de rij zelf opbouwt (zoals Verantwoordelijken). */
export function WeekPicker({ monday, defaultMonday, path, nl }: WeekProps) {
  const friday = shiftYMD(monday, 4);
  const tag = nl ? 'nl-BE' : 'en-GB';
  const month = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', month: 'long' });
  const range =
    monday.month === friday.month
      ? `${monday.day}–${friday.day} ${month.format(noonUtc(friday))} ${friday.year}`
      : `${monday.day} ${month.format(noonUtc(monday))} – ${friday.day} ${month.format(noonUtc(friday))} ${friday.year}`;
  const weekNumber = Number(isoWeekKey(monday).split('-W')[1]);
  const weekHref = (ymd: YMD) => `${path}?week=${ymdKey(ymd)}`;

  return (
    <div className="tk-sh-week">
      <IconLink href={weekHref(shiftYMD(monday, -7))} label={nl ? 'Vorige week' : 'Previous week'}>
        <ChevronLeft aria-hidden="true" size={16} />
      </IconLink>
      <span className="tk-sh-week-label">
        {nl ? 'Week' : 'Week'} {weekNumber} · {range}
      </span>
      <IconLink href={weekHref(shiftYMD(monday, 7))} label={nl ? 'Volgende week' : 'Next week'}>
        <ChevronRight aria-hidden="true" size={16} />
      </IconLink>
      {ymdKey(monday) === ymdKey(defaultMonday) ? null : (
        <Link href={path} className="tk-sh-today">
          {nl ? 'Naar deze week' : 'To this week'}
        </Link>
      )}
    </div>
  );
}

/** Een dag als "ma 23 nov" en "maandag 23 november". */
export function dayLabels(day: YMD, nl: boolean): { short: string; long: string } {
  const tag = nl ? 'nl-BE' : 'en-GB';
  const short = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
  const long = new Intl.DateTimeFormat(tag, { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
  return { short: short.format(noonUtc(day)).replace(/\./g, ''), long: long.format(noonUtc(day)) };
}
