'use client';

import { useMemo } from 'react';
import { placeForWeekRow } from '@/lib/month-lanes';

/**
 * De evenementen boven het tijdrooster (P5).
 *
 * Een eigen strook en geen blokken in het rooster: een evenement duurt vaak een
 * hele dag of een heel weekend, en als blok zou het de kolom vullen waarin je
 * juist de ritten wil zien. Boven de uren staat het waar het hoort, namelijk als
 * de context waarbinnen die ritten rijden.
 *
 * De plaatsing hergebruikt `placeForWeekRow` van de maandweergave: het is
 * hetzelfde probleem (balken over dagkolommen, onder elkaar bij overlap), en een
 * tweede berekening zou na de eerste wijziging uit elkaar lopen.
 */

export type CalendarEventBar = {
  id: string;
  name: string;
  location: string | null;
  /** ISO-strings; het einde is al afgerond op het einde van de startdag. */
  startAt: string;
  endAt: string;
  /** Is het uur echt gekend, of staat er enkel een dag? Zie `startTimeKnown`. */
  timeKnown: boolean;
  groupName: string | null;
  requestCount: number;
  tripCount: number;
};

/** Hoogte van één balk plus de ruimte eronder. */
const BAR_PX = 22;

export function EventBars({
  days,
  events,
  onSelect,
  selectedId,
  columns,
}: {
  /** Dezelfde dagen als het rooster eronder, als ISO-strings. */
  days: string[];
  events: CalendarEventBar[];
  onSelect?: (eventId: string) => void;
  selectedId?: string | null;
  /** Hetzelfde `grid-template-columns` als het rooster, zodat de balken uitlijnen. */
  columns: string;
}) {
  const parsedDays = useMemo(() => days.map((day) => new Date(day)), [days]);
  const bars = useMemo(() => placeForWeekRow(events, parsedDays), [events, parsedDays]);

  if (bars.length === 0) return null;

  const lanes = bars.reduce((most, bar) => Math.max(most, bar.lane + 1), 0);

  return (
    <div className="grid gap-1 pb-1" style={{ gridTemplateColumns: columns }}>
      {/* Een label in de urenkolom, zodat de strook niet als een zwevende rij
          balken leest. Meescrollend vastgezet, net als de uren eronder. */}
      <span className="sticky left-0 z-20 self-start bg-vtk-surface pt-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-vtk-muted">
        Events
      </span>
      <div
        className="relative"
        style={{ gridColumn: `2 / span ${parsedDays.length}`, height: lanes * BAR_PX }}
      >
        <div className="grid h-full gap-1" style={{ gridTemplateColumns: `repeat(${parsedDays.length}, minmax(0, 1fr))` }}>
          {bars.map((bar) => {
            const label = [
              bar.name,
              bar.groupName,
              bar.location,
              bar.timeKnown ? null : 'uur nog niet gekend',
              `${bar.requestCount} aanvragen, ${bar.tripCount} ritten`,
            ]
              .filter(Boolean)
              .join(', ');
            const content = (
              <span className="flex items-center gap-1.5 truncate">
                {bar.continuesBefore ? <span aria-hidden>←</span> : null}
                <span className="truncate font-semibold">{bar.name}</span>
                {bar.location ? (
                  <span className="truncate font-normal opacity-80">{bar.location}</span>
                ) : null}
                {bar.continuesAfter ? <span aria-hidden>→</span> : null}
              </span>
            );
            const style: React.CSSProperties = {
              gridColumn: `${bar.col + 1} / span ${bar.span}`,
              gridRow: bar.lane + 1,
              height: BAR_PX - 4,
            };
            const className = `flex items-center overflow-hidden rounded-[6px] border border-vtk-navy/20 bg-vtk-paper-2 px-2 text-[11px] leading-none text-vtk-navy ${
              selectedId === bar.id ? 'ring-2 ring-vtk-navy ring-offset-1' : ''
            }`;
            return onSelect ? (
              <button
                key={bar.id}
                data-trip={bar.id}
                type="button"
                onClick={() => onSelect(bar.id)}
                title={label}
                aria-label={label}
                style={style}
                className={`${className} transition hover:border-vtk-navy/50`}
              >
                {content}
              </button>
            ) : (
              <div key={bar.id} title={label} style={style} className={className}>
                {content}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
