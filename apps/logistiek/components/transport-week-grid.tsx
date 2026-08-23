'use client';

import { useMemo, type ReactNode } from 'react';
import { driverColorVar } from '@/lib/driver-colors';
import { placeForDay, type Placed } from '@/lib/week-lanes';
import { LogisticsIcon } from '@/components/logistics-icon';

/**
 * De week als één kalender (T7, T8): zeven dagen naast elkaar, de uren
 * verticaal, en elke rit als een blok op zijn eigen moment.
 *
 * Wat het niet meer is: een lijst per voertuig, en dan die lijst nog eens per
 * dag herhaald. Dat waren zeven losse rasters onder elkaar, waarin "wat gebeurt
 * er donderdag" pas te zien was na scrollen tot de vierde. Het voertuig is
 * daarom van kolom naar blok verhuisd; het staat er met zijn icoon in, samen met
 * de chauffeur die het blok zijn kleur geeft.
 *
 * Ritten die elkaar overlappen komen naast elkaar te staan, ook wanneer het om
 * verschillende voertuigen gaat. Anders zou de auto de kar verbergen op precies
 * het moment waarop je wil zien dat er twee dingen tegelijk rijden.
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

export type WeekVehicle = {
  id: string;
  name: string;
  /** `kar`, `auto`, `bakfiets`, ...: bepaalt welk icoon in het blok staat. */
  code: string;
};

/** Hoogte van één uur. Genoeg voor de vier regels van een rit van een uur. */
const HOUR_PX = 42;

const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});
const weekdayFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
});
const dayNumberFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  day: 'numeric',
  month: 'short',
});

/**
 * Het icoon bij een voertuig, op zijn code. Niet op een exacte gelijkheid, want
 * het team voert zelf voertuigen in: een tweede bestelwagen heet geen `kar`.
 */
export function vehicleIcon(code: string): 'van' | 'car' | 'cargobike' {
  const normalized = code.toLowerCase();
  if (normalized.includes('fiets')) return 'cargobike';
  if (normalized.includes('auto') || normalized.includes('wagen')) return 'car';
  return 'van';
}

export function TransportWeekGrid({
  days,
  vehicles,
  blocks,
  onSelect,
  emptyLabel,
  showDriver = true,
}: {
  /** De dagen van de week, als ISO-strings van UTC-middernacht. */
  days: string[];
  vehicles: WeekVehicle[];
  blocks: WeekBlock[];
  /** Klikbaar maken; zonder deze functie is de kalender om naar te kijken. */
  onSelect?: (blockId: string) => void;
  emptyLabel: string;
  /** Uit op het publieke overzicht zonder login: daar is er geen chauffeur om te tonen. */
  showDriver?: boolean;
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
  const height = hours.length * HOUR_PX;
  // De urenkolom plus zeven dagen. De ondergrens is ruim gekozen omdat een
  // dagkolom bij overlap in twee of drie deelt: bij een smallere kalender bleef
  // van "Career Fair, Kar, Arthur" niets over dan drie afgekapte letters. Past
  // dat niet, dan schuift de kalender horizontaal.
  const columns = `3.25rem repeat(${parsedDays.length}, minmax(0, 1fr))`;

  if (blocks.length === 0) {
    return <p className="text-sm text-vtk-muted">{emptyLabel}</p>;
  }

  return (
    <div className="grid gap-3">
      <div className="overflow-x-auto">
        <div className="min-w-[1120px] rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-2">
          {/* Kop: de dagen van de week. */}
          <div className="grid gap-1 pb-1.5" style={{ gridTemplateColumns: columns }}>
            <span />
            {parsedDays.map((day, index) => (
              <span key={days[index]} className="truncate px-1 text-xs text-vtk-muted">
                <span className="font-semibold capitalize text-vtk-ink">
                  {weekdayFormatter.format(day)}
                </span>{' '}
                {dayNumberFormatter.format(day)}
              </span>
            ))}
          </div>

          <div className="grid gap-1" style={{ gridTemplateColumns: columns }}>
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

            {parsedDays.map((day, dayIndex) => (
              <div
                key={days[dayIndex]}
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

                {placedPerDay[dayIndex].map((block) => (
                  <BlockView
                    key={`${block.id}-${days[dayIndex]}`}
                    block={block}
                    vehicle={vehicleById.get(block.vehicleId) ?? null}
                    firstHour={firstHour}
                    onSelect={onSelect}
                    showDriver={showDriver}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Welk icoon hoort bij welk voertuig. Het staat in elk blok, dus zonder
          deze regel moet je raden wat het karretje voorstelt. */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-vtk-muted">
        {vehicles.map((vehicle) => (
          <li key={vehicle.id} className="flex items-center gap-1.5">
            <LogisticsIcon name={vehicleIcon(vehicle.code)} className="h-3.5 w-3.5 shrink-0" />
            {vehicle.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function BlockView({
  block,
  vehicle,
  firstHour,
  onSelect,
  showDriver,
}: {
  block: Placed<WeekBlock>;
  vehicle: WeekVehicle | null;
  firstHour: number;
  onSelect?: (blockId: string) => void;
  showDriver: boolean;
}) {
  const top = ((block.from - firstHour * 60) / 60) * HOUR_PX;
  const rawHeight = ((block.to - block.from) / 60) * HOUR_PX;
  const laneWidth = 100 / block.lanes;

  const requested = block.status === 'REQUESTED';
  const done = block.status === 'COMPLETED';
  const style: React.CSSProperties = {
    top: Math.max(0, top),
    // Minimaal 24px: een kwartierrit moet aanklikbaar blijven.
    height: Math.max(24, rawHeight - 2),
    left: `${block.lane * laneWidth}%`,
    width: `${laneWidth}%`,
    // `backgroundColor` en niet de `background`-shorthand: die laatste wist het
    // streeppatroon van `.week-block-requested` weer uit.
    backgroundColor: block.conflict ? undefined : driverColorVar(block.driver?.id),
  };

  // Staat dit blok naast een ander, dan is er geen plaats voor een heel bereik.
  // Het einduur is dan af te lezen aan de onderrand tegen de urenlijnen, en het
  // staat voluit in de tooltip; een afgekapt "08:0…" zegt niets.
  const narrow = block.lanes > 1;

  const content: ReactNode = (
    <>
      <span className="block truncate font-semibold tabular-nums">
        {block.continuesBefore ? '↑ ' : ''}
        {timeFormatter.format(block.start)}
        {narrow ? '' : `-${timeFormatter.format(block.end)}`}
        {block.continuesAfter ? ' ↓' : ''}
      </span>
      <span className="block truncate">{block.title}</span>
      {vehicle ? (
        <span className="flex items-center gap-1">
          <LogisticsIcon name={vehicleIcon(vehicle.code)} className="h-3 w-3 shrink-0" />
          <span className="truncate">{vehicle.name}</span>
        </span>
      ) : null}
      {showDriver ? (
        block.driver ? (
          <span className="block truncate font-medium">{block.driver.name}</span>
        ) : (
          <span className="block truncate font-semibold">geen chauffeur</span>
        )
      ) : null}
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

  const label = [
    block.title,
    block.subtitle,
    vehicle?.name,
    `${timeFormatter.format(block.start)} tot ${timeFormatter.format(block.end)}`,
    showDriver ? (block.driver ? `chauffeur ${block.driver.name}` : 'nog geen chauffeur') : null,
  ]
    .filter(Boolean)
    .join(', ');

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
