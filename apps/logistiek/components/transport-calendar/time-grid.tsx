'use client';

import { useMemo, type ReactNode } from 'react';
import type { DriverColorOverrides } from '@/lib/driver-colors';
import { minutesOfDay, placeForDay, type Placed } from '@/lib/week-lanes';
import { BlockContent, blockLabel, blockLook } from './trip-block';
import { HOUR_PX_DEFAULT, type CalendarVehicle, type TripBlock } from './types';

/**
 * De dag- en weekweergave: de uren verticaal, de dagen naast elkaar, en elke rit
 * als een blok op zijn eigen moment.
 *
 * Wat het niet is: een raster per voertuig. Dat waren zeven losse rasters onder
 * elkaar, waarin "wat gebeurt er donderdag" pas te zien was na scrollen tot de
 * vierde. Het voertuig is daarom van kolom naar blok verhuisd (T7).
 *
 * Ritten die elkaar overlappen komen naast elkaar te staan, ook wanneer het om
 * verschillende voertuigen gaat: anders verbergt de auto de kar op precies het
 * moment waarop je wil zien dat er twee dingen tegelijk rijden.
 *
 * **De uurhoogte is een prop en geen constante** (P2): de zoom van de kalender
 * gaat hierdoorheen. Onder de 30 pixels per uur past er nog één regel in een blok
 * van een uur, dus dan valt alles behalve het uur en de titel weg; dat is bewust,
 * want vier afgekapte regels zijn onleesbaarder dan twee volledige.
 */

const weekdayFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
});
const dayNumberFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  day: 'numeric',
  month: 'short',
});
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Minimale breedte van een dagkolom.
 *
 * Ruim gekozen omdat een dagkolom bij overlap in twee of drie deelt: bij een
 * smallere kalender bleef van "Career Fair, Kar, Arthur" niets over dan drie
 * afgekapte letters. Past de week niet, dan schuift ze horizontaal; op een
 * telefoon is dat precies het gedrag dat je wil, want dan veeg je van dag naar
 * dag in plaats van zeven onleesbare kolommen te zien.
 */
const DAY_MIN_WIDTH = '9.5rem';

export function TimeGrid({
  days,
  vehicles,
  blocks,
  onSelect,
  selectedId,
  emptyLabel,
  showDriver = true,
  driverColors,
  hourPx = HOUR_PX_DEFAULT,
  now,
}: {
  /** De dagen, als ISO-strings van UTC-middernacht (date-only). */
  days: string[];
  vehicles: CalendarVehicle[];
  blocks: TripBlock[];
  /** Klikbaar maken; zonder deze functie is de kalender om naar te kijken. */
  onSelect?: (blockId: string) => void;
  selectedId?: string | null;
  emptyLabel: string;
  /** Uit op het publieke overzicht zonder login: daar is er geen chauffeur om te tonen. */
  showDriver?: boolean;
  /** Kleuren die het team zelf zette (K1); de rest volgt uit de id. */
  driverColors?: DriverColorOverrides;
  hourPx?: number;
  /** Nu-lijn; weglaten laat ze weg (bv. in een test of een afdruk). */
  now?: Date;
}) {
  const parsedDays = useMemo(() => days.map((day) => new Date(day)), [days]);
  const vehicleById = useMemo(
    () => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])),
    [vehicles]
  );

  const placedPerDay = useMemo(
    () => parsedDays.map((day) => placeForDay(blocks, day)),
    [blocks, parsedDays]
  );

  // Enkel de uren tonen waarin er iets gebeurt, met 07:00-23:00 als bodem: een
  // kalender die altijd om middernacht begint, is voor de helft leeg.
  const { firstHour, lastHour } = useMemo(() => {
    let earliest = 7;
    let latest = 23;
    for (const day of placedPerDay) {
      for (const block of day) {
        earliest = Math.min(earliest, Math.floor(block.from / 60));
        latest = Math.max(latest, Math.ceil(block.to / 60));
      }
    }
    return {
      firstHour: Math.max(0, earliest),
      lastHour: Math.min(24, Math.max(latest, earliest + 1)),
    };
  }, [placedPerDay]);

  const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index);
  const height = hours.length * hourPx;
  const columns = `3.25rem repeat(${parsedDays.length}, minmax(${DAY_MIN_WIDTH}, 1fr))`;

  const todayKey = now ? dayKeyFormatter.format(now) : null;
  const nowMinutes = now ? minutesOfDay(now) : 0;

  if (blocks.length === 0) {
    return <p className="text-sm text-vtk-muted">{emptyLabel}</p>;
  }

  return (
    // `relative` op de scroller: een `sr-only` binnenin is absoluut gepositioneerd
    // en ankert zonder dit op de pagina in plaats van op het raster, waardoor een
    // telefoon het hele scherm uitzoomt om dat ene onzichtbare pixel te tonen.
    <div className="relative overflow-x-auto">
      <div className="rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-2">
        {/* Kop: de dagen. Meescrollend met de kolommen eronder, want ze staan in
            dezelfde scroller. */}
        <div className="grid gap-1 pb-1.5" style={{ gridTemplateColumns: columns }}>
          <span className="sticky left-0 z-20 bg-vtk-surface" />
          {parsedDays.map((day, index) => {
            const isToday = todayKey !== null && dayKeyFormatter.format(day) === todayKey;
            return (
              <span
                key={days[index]}
                className={`truncate px-1 text-xs ${isToday ? 'text-vtk-navy' : 'text-vtk-muted'}`}
              >
                <span
                  className={`font-semibold capitalize ${isToday ? 'text-vtk-navy' : 'text-vtk-ink'}`}
                >
                  {weekdayFormatter.format(day)}
                </span>{' '}
                {dayNumberFormatter.format(day)}
              </span>
            );
          })}
        </div>

        <div className="grid gap-1" style={{ gridTemplateColumns: columns }}>
          {/* De urenkolom, vastgeplakt links: scrol je horizontaal door de week,
              dan blijft de klok staan waar ze hoort. */}
          <div className="sticky left-0 z-20 bg-vtk-surface" style={{ height }}>
            <div className="relative h-full">
              {hours.map((hour, index) => (
                <span
                  key={hour}
                  className="absolute right-1 -translate-y-1/2 text-[11px] tabular-nums text-vtk-muted"
                  style={{ top: index * hourPx }}
                >
                  {String(hour).padStart(2, '0')}:00
                </span>
              ))}
            </div>
          </div>

          {parsedDays.map((day, dayIndex) => {
            const isToday = todayKey !== null && dayKeyFormatter.format(day) === todayKey;
            return (
              <div
                key={days[dayIndex]}
                className={`relative rounded-[10px] ${isToday ? 'bg-vtk-yellow/10' : 'bg-vtk-paper/70'}`}
                style={{ height }}
              >
                {/* Uurlijnen, zodat je een blok op de klok kan leggen. */}
                {hours.map((hour, index) => (
                  <span
                    key={hour}
                    className="absolute inset-x-0 border-t border-vtk-navy/10"
                    style={{ top: index * hourPx }}
                    aria-hidden
                  />
                ))}

                {/* Waar we nu staan. Enkel op vandaag, en enkel wanneer dat uur
                    ook getekend wordt: buiten het venster zou de lijn tegen de
                    boven- of onderrand plakken en een uur beweren dat er niet is. */}
                {isToday && nowMinutes >= firstHour * 60 && nowMinutes <= lastHour * 60 ? (
                  <span
                    aria-hidden
                    className="absolute inset-x-0 z-10 border-t-2 border-red-500"
                    style={{ top: ((nowMinutes - firstHour * 60) / 60) * hourPx }}
                  />
                ) : null}

                {placedPerDay[dayIndex].map((block) => (
                  <TimeBlock
                    key={`${block.id}-${days[dayIndex]}`}
                    block={block}
                    vehicle={vehicleById.get(block.vehicleId) ?? null}
                    firstHour={firstHour}
                    hourPx={hourPx}
                    onSelect={onSelect}
                    selected={selectedId === block.id}
                    showDriver={showDriver}
                    driverColors={driverColors}
                  />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function TimeBlock({
  block,
  vehicle,
  firstHour,
  hourPx,
  onSelect,
  selected,
  showDriver,
  driverColors,
}: {
  block: Placed<TripBlock>;
  vehicle: CalendarVehicle | null;
  firstHour: number;
  hourPx: number;
  onSelect?: (blockId: string) => void;
  selected: boolean;
  showDriver: boolean;
  driverColors?: DriverColorOverrides;
}) {
  const top = ((block.from - firstHour * 60) / 60) * hourPx;
  const rawHeight = ((block.to - block.from) / 60) * hourPx;
  const laneWidth = 100 / block.lanes;
  const look = blockLook({ block, vehicle, showDriver, driverColors, selected });

  const style: React.CSSProperties = {
    ...look.style,
    top: Math.max(0, top),
    // Minimaal 24px: een kwartierrit moet aanklikbaar blijven, ook uitgezoomd.
    height: Math.max(24, rawHeight - 2),
    left: `${block.lane * laneWidth}%`,
    width: `${laneWidth}%`,
  };

  // Staat dit blok naast een ander, dan is er geen plaats voor een heel bereik.
  // Het einduur is dan af te lezen aan de onderrand tegen de urenlijnen, en het
  // staat voluit in de tooltip; een afgekapt "08:0…" zegt niets.
  const label = blockLabel({
    block,
    vehicle,
    showDriver,
    awaitsDriver: look.awaitsDriver,
    start: block.start,
    end: block.end,
  });
  const content: ReactNode = (
    <BlockContent
      block={block}
      vehicle={vehicle}
      showDriver={showDriver}
      awaitsDriver={look.awaitsDriver}
      start={block.start}
      end={block.end}
      continuesBefore={block.continuesBefore}
      continuesAfter={block.continuesAfter}
      compact={block.lanes > 1}
    />
  );

  if (!onSelect) {
    return (
      <div className={`absolute ${look.className}`} style={style} title={label}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(block.id)}
      className={`absolute transition hover:brightness-95 ${look.className}`}
      style={style}
      title={label}
      aria-label={label}
    >
      {content}
    </button>
  );
}
