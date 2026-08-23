'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { driverColorVar } from '@/lib/driver-colors';

/**
 * Het transportraster in Litus-stijl (T7, T8): per dag staan de uren onder
 * elkaar en de voertuigen naast elkaar.
 *
 * Waarom niet omgekeerd (voertuig per rij, dag per kolom, zoals voordien): de
 * transportverantwoordelijke plant per moment. "Wie rijdt er zaterdagavond en
 * met wat" is één blik op een kolom uren; in het oude raster stond dat verspreid
 * over zeven cellen van drie rijen.
 *
 * Overlappende ritten op hetzelfde voertuig staan naast elkaar in banen. Ze
 * horen niet te kunnen (de goedkeuring blokkeert ze), maar een voertuigwissel
 * kan het alsnog veroorzaken, en dan moet je ze allebei zien in plaats van één
 * die de andere verbergt.
 */
export type WeekBlock = {
  id: string;
  vehicleId: string;
  /** ISO-strings: dit is een client-component, Date-objecten reizen niet mee. */
  startAt: string;
  endAt: string;
  status: string;
  /** Bovenste regel in het blok: het evenement of het doel van de rit. */
  title: string;
  /** Tweede regel: de aanvrager, of niets op het publieke overzicht. */
  subtitle: string | null;
  driver: { id: string; name: string } | null;
  /** Rood: twee goedgekeurde ritten met hetzelfde voertuig op hetzelfde moment. */
  conflict: boolean;
};

export type WeekVehicle = { id: string; name: string };

const DAY_MS = 24 * 60 * 60 * 1000;
/** Hoogte van één uur. Een halfuurrit blijft zo net leesbaar. */
const HOUR_PX = 34;

const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});
const weekdayFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'long',
});
const dayNumberFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  day: 'numeric',
  month: 'short',
});

/** Minuten sinds middernacht (Belgische tijd) van dit moment. */
function minutesOfDay(moment: Date): number {
  const [hours, minutes] = timeFormatter.format(moment).split(':').map(Number);
  return hours * 60 + minutes;
}

type Placed = WeekBlock & {
  start: Date;
  end: Date;
  /** Minuten sinds middernacht, geknipt op deze dag. */
  from: number;
  to: number;
  lane: number;
  lanes: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/**
 * Ritten die deze dag raken, per voertuig, met hun baan bij overlap.
 * Geknipt op de dag: een rit van zaterdag 22:00 tot zondag 02:00 verschijnt op
 * beide dagen, elke keer met het stuk dat op die dag valt.
 */
function placeForDay(blocks: WeekBlock[], day: Date): Placed[] {
  const dayStart = day.getTime();
  const dayEnd = dayStart + DAY_MS;

  const touching = blocks
    .map((block) => ({ ...block, start: new Date(block.startAt), end: new Date(block.endAt) }))
    .filter((block) => block.start.getTime() < dayEnd && block.end.getTime() > dayStart)
    .map((block) => {
      const continuesBefore = block.start.getTime() < dayStart;
      const continuesAfter = block.end.getTime() > dayEnd;
      return {
        ...block,
        continuesBefore,
        continuesAfter,
        from: continuesBefore ? 0 : minutesOfDay(block.start),
        to: continuesAfter ? 24 * 60 : minutesOfDay(block.end) || 24 * 60,
      };
    })
    .sort((a, b) => a.from - b.from || a.to - b.to);

  // Banen toewijzen per voertuig: wie overlapt, schuift een baan op.
  const placed: Placed[] = [];
  for (const vehicleId of new Set(touching.map((block) => block.vehicleId))) {
    const forVehicle = touching.filter((block) => block.vehicleId === vehicleId);
    const laneEnds: number[] = [];
    const withLane = forVehicle.map((block) => {
      let lane = laneEnds.findIndex((end) => end <= block.from);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(block.to);
      } else {
        laneEnds[lane] = block.to;
      }
      return { ...block, lane };
    });
    const lanes = Math.max(1, laneEnds.length);
    placed.push(...withLane.map((block) => ({ ...block, lanes })));
  }
  return placed;
}

export function TransportWeekGrid({
  days,
  vehicles,
  blocks,
  onSelect,
  emptyLabel,
}: {
  /** De dagen van de week, als ISO-strings van UTC-middernacht. */
  days: string[];
  vehicles: WeekVehicle[];
  blocks: WeekBlock[];
  /** Klikbaar maken; zonder deze functie is het raster om naar te kijken. */
  onSelect?: (blockId: string) => void;
  emptyLabel: string;
}) {
  const parsedDays = useMemo(() => days.map((day) => new Date(day)), [days]);

  // Enkel de uren tonen waarin er iets gebeurt, met 07:00-23:00 als bodem: een
  // raster dat altijd om middernacht begint, is voor de helft leeg.
  const { firstHour, lastHour } = useMemo(() => {
    let earliest = 7;
    let latest = 23;
    for (const day of parsedDays) {
      for (const block of placeForDay(blocks, day)) {
        earliest = Math.min(earliest, Math.floor(block.from / 60));
        latest = Math.max(latest, Math.ceil(block.to / 60));
      }
    }
    return { firstHour: Math.max(0, earliest), lastHour: Math.min(24, Math.max(latest, earliest + 1)) };
  }, [blocks, parsedDays]);

  const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index);
  const height = hours.length * HOUR_PX;

  if (blocks.length === 0) {
    return <p className="text-sm text-vtk-muted">{emptyLabel}</p>;
  }

  return (
    <div className="grid gap-5">
      {parsedDays.map((day, dayIndex) => {
        const placed = placeForDay(blocks, day);
        if (placed.length === 0) return null;
        return (
          <section key={days[dayIndex]}>
            <h3 className="text-sm font-semibold text-vtk-ink">
              <span className="capitalize">{weekdayFormatter.format(day)}</span>{' '}
              <span className="font-normal text-vtk-muted">{dayNumberFormatter.format(day)}</span>
            </h3>

            <div className="mt-2 overflow-x-auto">
              <div className="min-w-[520px] rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-2">
                {/* Kop: de voertuigen naast elkaar. */}
                <div
                  className="grid gap-1 pb-1"
                  style={{ gridTemplateColumns: `3.25rem repeat(${vehicles.length}, minmax(0, 1fr))` }}
                >
                  <span />
                  {vehicles.map((vehicle) => (
                    <span
                      key={vehicle.id}
                      className="truncate px-1 text-xs font-semibold text-vtk-ink"
                    >
                      {vehicle.name}
                    </span>
                  ))}
                </div>

                <div
                  className="grid gap-1"
                  style={{ gridTemplateColumns: `3.25rem repeat(${vehicles.length}, minmax(0, 1fr))` }}
                >
                  {/* De urenkolom. */}
                  <div className="relative" style={{ height }}>
                    {hours.map((hour, index) => (
                      <span
                        key={hour}
                        className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-vtk-muted"
                        style={{ top: index * HOUR_PX }}
                      >
                        {String(hour).padStart(2, '0')}:00
                      </span>
                    ))}
                  </div>

                  {vehicles.map((vehicle) => (
                    <div
                      key={vehicle.id}
                      className="relative rounded-[10px] bg-vtk-paper/70"
                      style={{ height }}
                    >
                      {/* Uurlijnen, zodat je een blok op de klok kan leggen. */}
                      {hours.map((hour, index) => (
                        <span
                          key={hour}
                          className="absolute inset-x-0 border-t border-vtk-navy/10"
                          style={{ top: index * HOUR_PX }}
                          aria-hidden
                        />
                      ))}

                      {placed
                        .filter((block) => block.vehicleId === vehicle.id)
                        .map((block) => (
                          <BlockView
                            key={`${block.id}-${days[dayIndex]}`}
                            block={block}
                            firstHour={firstHour}
                            onSelect={onSelect}
                          />
                        ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BlockView({
  block,
  firstHour,
  onSelect,
}: {
  block: Placed;
  firstHour: number;
  onSelect?: (blockId: string) => void;
}) {
  const top = ((block.from - firstHour * 60) / 60) * HOUR_PX;
  const rawHeight = ((block.to - block.from) / 60) * HOUR_PX;
  const laneWidth = 100 / block.lanes;

  const requested = block.status === 'REQUESTED';
  const done = block.status === 'COMPLETED';
  const style: React.CSSProperties = {
    top: Math.max(0, top),
    // Minimaal 22px: een kwartierrit moet aanklikbaar blijven.
    height: Math.max(22, rawHeight - 2),
    left: `${block.lane * laneWidth}%`,
    width: `${laneWidth}%`,
    // `backgroundColor` en niet de `background`-shorthand: die laatste wist het
    // streeppatroon van `.week-block-requested` weer uit.
    backgroundColor: block.conflict ? undefined : driverColorVar(block.driver?.id),
  };

  const content: ReactNode = (
    <>
      <span className="block truncate font-semibold tabular-nums">
        {block.continuesBefore ? '↑ ' : ''}
        {timeFormatter.format(block.start)}-{timeFormatter.format(block.end)}
        {block.continuesAfter ? ' ↓' : ''}
      </span>
      <span className="block truncate">{block.title}</span>
      {block.driver ? (
        <span className="block truncate font-medium">{block.driver.name}</span>
      ) : (
        <span className="block truncate font-semibold">geen chauffeur</span>
      )}
    </>
  );

  const className = [
    'absolute overflow-hidden rounded-[8px] px-1.5 py-1 text-left text-[11px] leading-tight text-vtk-ink',
    block.conflict ? 'border-2 border-red-500 bg-red-50 text-red-900' : 'border border-vtk-navy/15',
    // Nog te beslissen: gestreept, zodat je ziet dat dit moment nog kan
    // vrijkomen (T8). Afgerond: lichter, want het is geschiedenis.
    requested ? 'week-block-requested' : '',
    done ? 'opacity-60' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const label = `${block.title}${block.subtitle ? `, ${block.subtitle}` : ''}, ${timeFormatter.format(
    block.start
  )} tot ${timeFormatter.format(block.end)}${
    block.driver ? `, chauffeur ${block.driver.name}` : ', nog geen chauffeur'
  }`;

  if (!onSelect) {
    return (
      <div className={className} style={style} title={label}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(block.id)}
      className={`${className} transition hover:brightness-95`}
      style={style}
      title={label}
      aria-label={label}
    >
      {content}
    </button>
  );
}
