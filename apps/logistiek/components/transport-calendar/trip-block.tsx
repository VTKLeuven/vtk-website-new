'use client';

import type { CSSProperties, ReactNode } from 'react';
import { driverColorVar, vehiclePatternClass, type DriverColorOverrides } from '@/lib/driver-colors';
import { LogisticsIcon } from '@/components/logistics-icon';
import type { CalendarVehicle, TripBlock } from './types';

/**
 * Het uiterlijk van één rit, gedeeld door de dag-, week- en maandweergave.
 *
 * Twee assen tegelijk (K1): de **vulkleur** is de chauffeur, de **arcering** is
 * het voertuig. Een rit zonder chauffeur is het enige wat op deze kalender nog
 * werk is, dus die krijgt de gele vulling plus een rode streepjesrand.
 */

const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatTime(moment: Date): string {
  return timeFormatter.format(moment);
}

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

export type BlockLook = {
  className: string;
  style: CSSProperties;
  /** Wacht deze rit nog op een chauffeur? De tekst in het blok volgt hieruit. */
  awaitsDriver: boolean;
};

/**
 * De klassen en de vulkleur van een rit. Apart van de weergave zelf, omdat het
 * blok in de weekweergave absoluut gepositioneerd staat en in de maandweergave
 * in een rasterrij: dezelfde look, een andere doos.
 */
export function blockLook({
  block,
  vehicle,
  showDriver,
  driverColors,
  selected,
}: {
  block: TripBlock;
  vehicle: CalendarVehicle | null;
  showDriver: boolean;
  driverColors?: DriverColorOverrides;
  selected?: boolean;
}): BlockLook {
  const requested = block.status === 'REQUESTED';
  const done = block.status === 'COMPLETED';
  // Enkel waar Logistiek zelf rijdt is "geen chauffeur" nog werk; het publieke
  // overzicht toont geen chauffeurs, dus daar valt er niets te markeren.
  const awaitsDriver = showDriver && !block.driver && (vehicle?.needsDriver ?? true);

  const className = [
    'overflow-hidden rounded-[8px] px-1.5 py-1 text-left text-[11px] leading-tight text-vtk-ink',
    block.conflict
      ? 'border-2 border-red-500 bg-red-50 text-red-900'
      : awaitsDriver
        ? // Gele vulling plus een rode streepjesrand. Streepjes en niet vol, want
          // een volle rode rand betekent al iets anders: een conflict.
          'border-2 trip-no-driver'
        : 'border border-vtk-navy/15',
    // De arcering van het voertuig (K1); bij een conflict niet, want dan is de
    // rode vulling het enige wat je moet zien.
    block.conflict ? '' : vehiclePatternClass(vehicle?.pattern),
    // Nog te beslissen: gestreept, zodat je ziet dat dit moment nog kan
    // vrijkomen (T8). Afgerond: lichter, want het is geschiedenis.
    requested ? 'week-block-requested' : '',
    done ? 'opacity-60' : '',
    selected ? 'ring-2 ring-vtk-navy ring-offset-1' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    className,
    style: {
      // `backgroundColor` en niet de `background`-shorthand: die laatste wist het
      // streeppatroon van `.week-block-requested` en de arcering van het voertuig
      // weer uit.
      backgroundColor: block.conflict ? undefined : driverColorVar(block.driver?.id, driverColors),
    },
    awaitsDriver,
  };
}

/** Alles wat er in een blok staat, van boven naar onder. */
export function BlockContent({
  block,
  vehicle,
  showDriver,
  awaitsDriver,
  start,
  end,
  continuesBefore,
  continuesAfter,
  /** Bij overlap is er geen plaats voor een heel bereik; dan enkel het beginuur. */
  compact = false,
}: {
  block: TripBlock;
  vehicle: CalendarVehicle | null;
  showDriver: boolean;
  awaitsDriver: boolean;
  start: Date;
  end: Date;
  continuesBefore: boolean;
  continuesAfter: boolean;
  compact?: boolean;
}): ReactNode {
  return (
    <>
      <span className="block truncate font-semibold tabular-nums">
        {continuesBefore ? '↑ ' : ''}
        {formatTime(start)}
        {compact ? '' : `-${formatTime(end)}`}
        {continuesAfter ? ' ↓' : ''}
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
        ) : awaitsDriver ? (
          <span className="block truncate font-semibold text-red-700">geen chauffeur</span>
        ) : (
          // De aanvrager rijdt zelf (bakfiets): dat is geen ontbrekende
          // chauffeur, dus het staat er gewoon en niet in het rood.
          <span className="block truncate text-vtk-muted">rijdt zelf</span>
        )
      ) : null}
    </>
  );
}

/** De tekst voor tooltip en screenreader; hetzelfde als in het blok, maar voluit. */
export function blockLabel({
  block,
  vehicle,
  showDriver,
  awaitsDriver,
  start,
  end,
}: {
  block: TripBlock;
  vehicle: CalendarVehicle | null;
  showDriver: boolean;
  awaitsDriver: boolean;
  start: Date;
  end: Date;
}): string {
  return [
    block.title,
    block.subtitle,
    vehicle?.name,
    `${formatTime(start)} tot ${formatTime(end)}`,
    showDriver
      ? block.driver
        ? `chauffeur ${block.driver.name}`
        : awaitsDriver
          ? 'nog geen chauffeur'
          : 'de aanvrager rijdt zelf'
      : null,
  ]
    .filter(Boolean)
    .join(', ');
}
