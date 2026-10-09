'use client';
import { Fragment, useState } from 'react';
import { getISOWeek } from 'date-fns';
import { AlertTriangle, MapPin } from 'lucide-react';
import { getDictionary, type Locale } from '@vtk/i18n';
import { canUnregister, type ShiftResponse } from '@/lib/shift';
import { useToast } from '@/components/ui/toast';
import { InternationalsBadge } from './ShiftDialog';
import { RewardCoins } from './RewardCoins';
import {
  fill,
  fmtTime,
  freeSpots,
  postLabel,
  registerShift,
  rewardLabel,
  spotsLabel,
  spotsSpoken,
  spotsVariant,
  takenSpots,
  unregisterShift,
  viewerRewardLabel,
  type MergedShift,
  type PostNames,
  type ShiftDict,
} from './shiftData';
import { weekAnchor, type ShiftDay, type ShiftWeek } from './shiftWeeks';

const DOW_SHORT: Record<Locale, string[]> = {
  nl: ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za'],
  en: ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'],
};

const MONTH_SHORT: Record<Locale, string[]> = {
  nl: ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
};

/** Een dag met shiften, of een reeks opeenvolgende dagen zonder. */
type Segment = { kind: 'day'; day: ShiftDay } | { kind: 'quiet'; days: ShiftDay[] };

/** "Deze week", "Volgende week", daarna het weeknummer. */
export function weekName(week: ShiftWeek, t: ShiftDict): string {
  if (week.offset === 0) return t.week.this;
  if (week.offset === 1) return t.week.next;
  return fill(t.week.number, { week: getISOWeek(week.monday) });
}

/** "12 tot 18 oktober", of "26 oktober tot 1 november" over een maandgrens. */
export function weekRange(week: ShiftWeek, locale: Locale, t: ShiftDict): string {
  const intl = locale === 'nl' ? 'nl-BE' : 'en-GB';
  const dayMonthFmt = new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'long' });
  const dayFmt = new Intl.DateTimeFormat(intl, { day: 'numeric' });
  const sunday = new Date(week.monday);
  sunday.setDate(sunday.getDate() + 6);
  return fill(t.week.range, {
    from:
      week.monday.getMonth() === sunday.getMonth()
        ? dayFmt.format(week.monday)
        : dayMonthFmt.format(week.monday),
    to: dayMonthFmt.format(sunday),
  });
}

/**
 * Lege dagen die op elkaar volgen, worden samen één regel. Elk een eigen rij met
 * datumpin kostte in een gewone week twee schermhoogtes aan "geen shiften"
 * voor de eerste shift in beeld kwam.
 */
function segmentsOf(days: ShiftDay[]): Segment[] {
  const segments: Segment[] = [];
  let quiet: ShiftDay[] = [];
  for (const day of days) {
    if (day.items.length === 0) {
      quiet.push(day);
      continue;
    }
    if (quiet.length > 0) {
      segments.push({ kind: 'quiet', days: quiet });
      quiet = [];
    }
    segments.push({ kind: 'day', day });
  }
  if (quiet.length > 0) segments.push({ kind: 'quiet', days: quiet });
  return segments;
}

/** "Maandag 14 en dinsdag 15: geen shiften", met het vandaag-label bij de juiste dag. */
function QuietDays({ days, locale, t }: { days: ShiftDay[]; locale: Locale; t: ShiftDict }) {
  const intl = locale === 'nl' ? 'nl-BE' : 'en-GB';
  const dayFmt = new Intl.DateTimeFormat(intl, { weekday: 'long', day: 'numeric' });
  const parts = new Intl.ListFormat(intl, { type: 'conjunction' }).formatToParts(
    days.map((_, index) => String(index))
  );
  const [before, after] = t.day.emptyDay.split('{day}');

  return (
    <p className="vtk-shift-quiet">
      {before}
      {parts.map((part, i) => {
        if (part.type === 'literal') return <Fragment key={i}>{part.value}</Fragment>;
        const day = days[Number(part.value)];
        const label = dayFmt.format(day.date);
        return (
          <Fragment key={i}>
            {i === 0 && !before ? label.charAt(0).toUpperCase() + label.slice(1) : label}
            {day.isToday ? (
              <>
                {' '}
                <span className="vtk-shift-today-tag">{t.week.today}</span>
              </>
            ) : null}
          </Fragment>
        );
      })}
      {after}
    </p>
  );
}

/**
 * Alle shiften vanaf vandaag, per week onder elkaar. Elke week opent met een kop
 * ("Deze week", "Volgende week", "Week 43") en een haarlijn erboven; er is geen
 * weekkiezer meer, want wie een shift zoekt, wil de komende weken naast elkaar
 * zien en niet per week klikken. De rail draagt dezelfde weken als register
 * (`ShiftWeekOutline`).
 */
export function ShiftAgenda({
  locale,
  weeks,
  registeredShifts = [],
  postNames,
  emptyState,
  onOpen,
}: {
  locale: Locale;
  weeks: ShiftWeek[];
  registeredShifts?: ShiftResponse[];
  postNames: PostNames;
  emptyState: React.ReactNode;
  onOpen: (entry: MergedShift) => void;
}) {
  const t = getDictionary(locale).shift;
  const [now] = useState(() => Date.now());

  if (weeks.length === 0) return <>{emptyState}</>;

  return (
    <div className="vtk-shift-weeks">
      {weeks.map((week) => {
        const id = weekAnchor(week);
        const n = week.shifts.length;
        return (
          <section key={id} id={id} className="vtk-shift-week" aria-labelledby={`${id}-title`}>
            <header className="vtk-shift-week-head">
              <div>
                <h2 className="vtk-shift-week-name" id={`${id}-title`}>
                  {weekName(week, t)}
                </h2>
                <p className="vtk-shift-week-range">{weekRange(week, locale, t)}</p>
              </div>
              {n > 0 ? (
                <p className="vtk-shift-week-count">
                  {fill(n === 1 ? t.week.summaryOne : t.week.summary, {
                    total: n,
                    open: week.open,
                  })}
                </p>
              ) : null}
            </header>

            {n > 0 ? (
              <WeekDays
                locale={locale}
                days={week.days}
                registeredShifts={registeredShifts}
                postNames={postNames}
                now={now}
                onOpen={onOpen}
              />
            ) : (
              <p className="vtk-shift-week-empty">
                <span className="vtk-shift-ring" aria-hidden="true" />
                <span className="vtk-shift-quiet">{t.week.none}</span>
              </p>
            )}
          </section>
        );
      })}

      <p className="vtk-shift-weeks-end">{t.week.end}</p>
    </div>
  );
}

/**
 * De dagen van één week: elke dag hangt aan de gele datumpin van de
 * evenementenkaart, de haarlijn verbindt de pins binnen de week, en de shiften
 * liggen per dag gebundeld in een kaart. Op een telefoon vallen de haarlijn en
 * de pinkolom weg en schuift de pin naast de dagnaam, zodat de kaart de volle
 * breedte krijgt.
 */
function WeekDays({
  locale,
  days,
  registeredShifts,
  postNames,
  now,
  onOpen,
}: {
  locale: Locale;
  days: ShiftDay[];
  registeredShifts: ShiftResponse[];
  postNames: PostNames;
  now: number;
  onOpen: (entry: MergedShift) => void;
}) {
  const t = getDictionary(locale).shift;
  const showToast = useToast();

  const weekdayFmt = new Intl.DateTimeFormat(locale === 'nl' ? 'nl-BE' : 'en-GB', {
    weekday: 'long',
  });

  return (
    <ol className="vtk-shift-days">
      {segmentsOf(days).map((segment) => {
        if (segment.kind === 'quiet') {
          return (
            <li
              key={segment.days[0].date.toISOString()}
              className="vtk-shift-day"
              data-empty="true"
            >
              <span className="vtk-shift-ring" aria-hidden="true" />
              <QuietDays days={segment.days} locale={locale} t={t} />
            </li>
          );
        }

        const { day } = segment;
        const n = day.items.length;
        const weekdayName = weekdayFmt.format(day.date);
        const capitalizedDay = weekdayName.charAt(0).toUpperCase() + weekdayName.slice(1);
        const countLabel = n === 1 ? t.day.shiftsOne : fill(t.day.shifts, { n });

        return (
          <li key={day.date.toISOString()} className="vtk-shift-day">
            <span className="vtk-shift-pin" aria-hidden="true">
              <i>{DOW_SHORT[locale][day.date.getDay()]}</i>
              <b>{day.date.getDate()}</b>
              <i>{MONTH_SHORT[locale][day.date.getMonth()]}</i>
            </span>

            <div className="vtk-shift-day-body">
              <div className="vtk-shift-day-head">
                <h3 className="vtk-shift-day-name">{capitalizedDay}</h3>
                <span className="vtk-shift-day-count">{countLabel}</span>
                {day.isToday ? <span className="vtk-shift-today-tag">{t.week.today}</span> : null}
              </div>

              <ul className="vtk-shift-card">
                {day.items.map((entry) => {
                  const { shift, registered } = entry;
                  const isFull = !registered && freeSpots(shift) <= 0;
                  const locked = registered && !canUnregister(shift, now);
                  const withheldReward = shift.withheldReward ?? 0;

                  // Detecteer clash met eigen inschrijving
                  const conflict = !registered
                    ? registeredShifts.find(
                        (mine) =>
                          mine.id !== shift.id &&
                          mine.startTime < shift.endTime &&
                          mine.endTime > shift.startTime
                      )
                    : null;

                  const roster = shift.roster ?? [];
                  const nl = locale === 'nl';
                  const rosterNames = roster.map((p) =>
                    p.isSelf ? `${p.name} (${nl ? 'jij' : 'you'})` : p.name
                  );
                  const spotsTitle =
                    rosterNames.length > 0
                      ? `${nl ? 'Ingeschreven' : 'Registered'}: ${rosterNames.join(', ')}`
                      : nl
                        ? 'Nog geen inschrijvingen'
                        : 'No sign-ups yet';
                  const taken = takenSpots(shift);
                  const spotsBadgeLabel = registered ? t.isRegistered : spotsLabel(shift);
                  const spotsBadgeClass = registered
                    ? 'vtk-shift-spots-mine'
                    : `vtk-shift-spots-${spotsVariant(shift)}`;

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
                              <InternationalsBadge locale={locale} />
                            ) : null}
                          </span>

                          <span className="vtk-shift-meta">
                            {shift.post ? (
                              <span className="vtk-shift-post">
                                {postLabel(shift.post, postNames)}
                              </span>
                            ) : null}
                            <span className="vtk-shift-meta-i">
                              <MapPin aria-hidden="true" />
                              <span>{shift.location}</span>
                            </span>
                            {shift.reward > 0 ? (
                              <RewardCoins
                                amount={shift.reward}
                                label={rewardLabel(shift.reward, t)}
                                size="sm"
                              />
                            ) : withheldReward > 0 ? (
                              <RewardCoins
                                amount={withheldReward}
                                label={viewerRewardLabel(shift, t)}
                                size="sm"
                                withheld
                              />
                            ) : null}
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
                        <div className="vtk-shift-spots-wrap">
                          <span
                            className={`vtk-shift-spots ${spotsBadgeClass}`}
                            tabIndex={0}
                            role="button"
                            onClick={() => onOpen(entry)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onOpen(entry);
                              }
                            }}
                            aria-label={`${registered ? t.isRegistered : spotsSpoken(shift, t)}. ${spotsTitle}`}
                          >
                            {spotsBadgeLabel}
                          </span>
                          <div className="vtk-shift-spots-popover" role="tooltip" aria-hidden="true">
                            <div className="vtk-shift-spots-popover-head">
                              <span className="vtk-shift-spots-popover-title">
                                {nl ? 'Ingeschreven' : 'Registered'}
                              </span>
                              <span className="vtk-shift-spots-popover-count">
                                {taken}/{shift.maxParticipants}
                              </span>
                            </div>
                            {roster.length === 0 ? (
                              <p className="vtk-shift-spots-popover-empty">
                                {nl ? 'Nog geen inschrijvingen' : 'No sign-ups yet'}
                              </p>
                            ) : (
                              <ul className="vtk-shift-spots-popover-list">
                                {roster.map((person, idx) => (
                                  <li
                                    key={idx}
                                    className="vtk-shift-spots-popover-person"
                                    data-self={person.isSelf ? 'true' : undefined}
                                  >
                                    <span className="vtk-shift-spots-popover-initial">
                                      {person.name.trim().slice(0, 1).toUpperCase() || '?'}
                                    </span>
                                    <span className="vtk-shift-spots-popover-name">
                                      {person.name}
                                      {person.isSelf ? (
                                        <span className="vtk-shift-spots-popover-you">
                                          {' '}
                                          ({nl ? 'jij' : 'you'})
                                        </span>
                                      ) : null}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>

                        {registered ? (
                          <button
                            type="button"
                            className="vtk-shift-btn vtk-shift-btn-ghost vtk-shift-btn-sm"
                            disabled={locked}
                            title={locked ? t.error.tooLateToUnregister : undefined}
                            onClick={() => unregisterShift(shift.id, showToast, t)}
                          >
                            {t.unregister}
                          </button>
                        ) : isFull ? null : (
                          <button
                            type="button"
                            className="vtk-shift-btn vtk-shift-btn-sm"
                            onClick={() => registerShift(shift.id, showToast, t)}
                          >
                            {t.register}
                          </button>
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
