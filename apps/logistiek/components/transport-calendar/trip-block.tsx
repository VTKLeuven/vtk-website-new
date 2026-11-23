'use client';

import type { CSSProperties, ReactNode } from 'react';
import {
  driverColorVar,
  driverToneVar,
  vehiclePatternClass,
  type DriverColorOverrides,
} from '@/lib/driver-colors';
import { LogisticsIcon } from '@/components/logistics-icon';
import { vehicleIconName } from '@/lib/vehicle-icon';
import { DEFAULT_TRIP_FIELDS, type CalendarVehicle, type TripBlock, type TripFields } from './types';
import { useCalendarCopy, type CalendarCopy } from './copy';

/**
 * Het uiterlijk van één rit, gedeeld door de dag-, week- en maandweergave.
 *
 * Drie assen, elk met hun eigen taal (K1, F4.16), en dat is de hele regel:
 *
 * - **De vulkleur is de chauffeur.** Wie rijdt, lees je aan de kleur.
 * - **De arcering is het voertuig.** Waarmee, lees je aan het patroon.
 * - **De rand en de streep zijn de staat.** Nog geen chauffeur: een grijze
 *   streepjesrand. Nog te beslissen: een streep langs de bovenrand. Conflict:
 *   een volle rode rand, mét de arcering van het voertuig erin. Van je eigen
 *   post: een rail links.
 *
 * Een status mag dus **nooit** een tweede arcering zijn. Ze was dat wel ("nog te
 * beslissen" was een schuin streeppatroon), en naast een gearceerd voertuig was
 * ze daardoor niet te onderscheiden; erger nog, ze verdween er letterlijk onder,
 * want allebei zetten ze `background-image`. Zie `.trip-requested` in
 * `globals.css`.
 */

const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatTime(moment: Date): string {
  return timeFormatter.format(moment);
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
    // `trip-block`: het haakje voor "Enkel mijn post benadrukken" (F6.17).
    'trip-block overflow-hidden rounded-[8px] px-1.5 py-1 text-left text-[11px] leading-tight text-vtk-ink',
    // Rood en niet subtiel: een botsing mag bestaan (het team plant eerst in en
    // schuift daarna), maar enkel zolang ze niet te missen valt.
    block.conflict
      ? 'border-2 border-vtk-danger bg-vtk-danger-soft text-vtk-danger'
      : awaitsDriver
        ? // Een grijze streepjesrand. Streepjes en niet vol, want een volle rode
          // rand betekent al iets anders: een conflict.
          'border-2 trip-no-driver'
        : 'border border-vtk-navy/15',
    // De arcering van het voertuig (K1), ook bij een conflict (F6.1): een botsing
    // gaat over een voertuig, en de rode vulling zegt dát er iets mis is maar
    // niet welk voertuig dubbel staat. De arcering is een alfa op de vulling, dus
    // ze komt ook op de rode laag.
    vehiclePatternClass(vehicle?.pattern),
    // Nog te beslissen: een streep langs de bovenrand, zodat je ziet dat dit
    // moment nog kan vrijkomen (T8). Afgerond: lichter, want het is geschiedenis.
    requested ? 'trip-requested' : '',
    // Van je eigen post (F4.15). Ook bij een conflict: dat de rit van jou is,
    // verandert niet omdat er iets mee mis is.
    block.mine ? 'trip-mine' : '',
    done ? 'opacity-60' : '',
    selected ? 'ring-2 ring-vtk-navy ring-offset-1' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    className,
    style: {
      // `backgroundColor` en niet de `background`-shorthand: die laatste wist de
      // arcering van het voertuig weer uit.
      backgroundColor: block.conflict ? undefined : driverColorVar(block.driver?.id, driverColors),
    },
    awaitsDriver,
  };
}

/**
 * Alles wat er in een blok staat, van boven naar onder.
 *
 * Welke regels dat zijn, kiest de lezer zelf in "Weergave" (zie
 * `TRIP_BLOCK_FIELDS`); `fields` weglaten geeft de standaardweergave, wat het
 * publieke overzicht en de maandweergave gebruiken.
 *
 * De volgorde staat vast en is niet instelbaar: uur bovenaan, dan waarvoor (en
 * bij welk evenement), dan waarmee, dan wie. Een blok waarvan de regels per persoon in een andere
 * volgorde staan, moet je elke keer opnieuw lezen in plaats van herkennen.
 */
export function BlockContent({
  block,
  vehicle,
  showDriver,
  awaitsDriver,
  start,
  end,
  continuesBefore,
  continuesAfter,
  fields = DEFAULT_TRIP_FIELDS,
  /** Bij overlap is er geen plaats voor een heel bereik; dan enkel het beginuur. */
  compact = false,
  driverColors,
  maxLines,
}: {
  block: TripBlock;
  vehicle: CalendarVehicle | null;
  showDriver: boolean;
  awaitsDriver: boolean;
  start: Date;
  end: Date;
  continuesBefore: boolean;
  continuesAfter: boolean;
  fields?: TripFields;
  compact?: boolean;
  /** Voor de kleur van het bolletje met de initialen; zie {@link DriverChip}. */
  driverColors?: DriverColorOverrides;
  /**
   * Hoeveel regels er volledig in het blok passen. Weglaten toont alles, zoals
   * op een telefoon en in een test. Met een getal valt de rest weg in plaats van
   * half afgesneden te worden: een regel waarvan je de onderste helft mist,
   * leest als een fout. Past er maar één regel, dan komt de titel achter het uur.
   */
  maxLines?: number;
}): ReactNode {
  const t = useCalendarCopy();
  const oneLine = maxLines === 1;
  // Het bolletje volgt het vinkje Chauffeur in "Weergave", en `showDriver` (op
  // het publieke overzicht staan geen namen, dus ook geen initialen).
  const chip =
    showDriver && fields.driver ? (
      <DriverChip driver={block.driver} awaitsDriver={awaitsDriver} driverColors={driverColors} />
    ) : null;
  const lines: ReactNode[] = [];

  // Het uur blijft de regel die zegt dát dit blok ergens over gaat: staat het
  // uit én is er verder niets aangevinkt, dan is een blok een lege rechthoek. De
  // pijlen voor een rit over middernacht horen bij het uur en verdwijnen dus
  // mee; de hoogte van het blok zegt de rest.
  if (fields.time) {
    lines.push(
      <span key="time" className="flex min-w-0 items-center gap-1 font-semibold tabular-nums">
        <span className="shrink-0">
          {continuesBefore ? '↑ ' : ''}
          {formatTime(start)}
          {compact ? '' : `-${formatTime(end)}`}
          {continuesAfter ? ' ↓' : ''}
        </span>
        {oneLine && fields.title ? (
          <span className="min-w-0 truncate font-medium">{block.title}</span>
        ) : null}
        {chip ? <span className="ml-auto flex shrink-0">{chip}</span> : null}
      </span>
    );
  }
  if (fields.title && !(oneLine && fields.time)) {
    lines.push(
      <span key="title" className="block truncate">
        {block.title}
      </span>
    );
  }
  if (fields.event && block.eventName) {
    lines.push(
      <span key="event" className="block truncate font-medium text-vtk-navy">
        {block.eventName}
      </span>
    );
  }
  // De post of werkgroep. Standaard uit, en enkel wanneer ze er is: op het
  // publieke overzicht staat er geen aanvrager in het blok.
  if (fields.requester && block.subtitle) {
    lines.push(
      <span key="requester" className="block truncate text-vtk-muted">
        {block.subtitle}
      </span>
    );
  }
  // Bij een conflict altijd, ook als "Weergave" het voertuig uit heeft staan
  // (F6.1): het voertuig is de reden van de botsing.
  if ((fields.vehicle || block.conflict) && vehicle) {
    lines.push(
      <span key="vehicle" className="flex items-center gap-1">
        <LogisticsIcon name={vehicleIconName(vehicle)} className="h-3 w-3 shrink-0" />
        <span className="truncate">{vehicle.name}</span>
      </span>
    );
  }
  // `showDriver` én het vinkje: het eerste is een serverbeslissing (op het
  // publieke overzicht staan geen namen), het tweede een voorkeur.
  if (showDriver && fields.driver) {
    lines.push(
      block.driver ? (
        <span key="driver" className="block truncate font-medium">
          {block.driver.name}
        </span>
      ) : awaitsDriver ? (
        <span key="driver" className="block truncate font-semibold text-vtk-danger">
          {t.noDriver}
        </span>
      ) : (
        // De aanvrager rijdt zelf (bakfiets): dat is geen ontbrekende
        // chauffeur, dus het staat er gewoon en niet in het rood.
        <span key="driver" className="block truncate text-vtk-muted">
          {t.drivesThemselves}
        </span>
      )
    );
  }
  // Een pijl ervoor, want "Zaal Alma 3" op een eigen regel is niet van
  // "Doopcantus" te onderscheiden zodra de titel erboven wegvalt.
  if (fields.destination && block.destination) {
    lines.push(
      <span key="destination" className="block truncate text-vtk-muted">
        <span aria-hidden>→ </span>
        {block.destination}
      </span>
    );
  }
  if (fields.cargo && block.cargoNote) {
    lines.push(
      <span key="cargo" className="block truncate text-vtk-muted">
        {block.cargoNote}
      </span>
    );
  }

  return <>{maxLines ? lines.slice(0, Math.max(1, maxLines)) : lines}</>;
}

/**
 * De initialen van wie rijdt, in een bolletje rechts op de regel met het uur.
 *
 * De vulkleur van een blok zegt al wie rijdt, maar het palet telt veertig
 * pastels en twee daarvan houd je op een drukke week niet uit elkaar. De
 * initialen zeggen het ook in een blok van een kwartier, waar de regel met de
 * naam niet meer past. Zonder chauffeur een leeg bolletje met een plus: daar
 * moet nog iemand op. `aria-hidden`, want de tooltip en het label noemen de naam
 * al voluit.
 */
function DriverChip({
  driver,
  awaitsDriver,
  driverColors,
}: {
  driver: TripBlock['driver'];
  awaitsDriver: boolean;
  driverColors?: DriverColorOverrides;
}) {
  if (driver) {
    return (
      <span
        aria-hidden
        className="trip-chip"
        style={{ backgroundColor: driverToneVar(driver.id, driverColors) }}
      >
        {initials(driver.name)}
      </span>
    );
  }
  if (awaitsDriver) {
    return (
      <span aria-hidden className="trip-chip trip-chip-open">
        +
      </span>
    );
  }
  return null;
}

/**
 * "Arne Janssens" wordt AJ, "Lotte" wordt LO. Wat tussen haakjes staat telt niet
 * mee: de testprofielen heten "Alice (test logistiek)".
 */
export function initials(name: string): string {
  const words = name
    .replace(/\([^)]*\)/g, ' ')
    .split(/\s+/)
    .filter((word) => /\p{L}/u.test(word));
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/**
 * De tekst voor tooltip en screenreader.
 *
 * **Altijd alles**, ook wat er in het blok uitgevinkt staat. "Weergave" is een
 * antwoord op "dit blok is 24 pixels hoog"; een tooltip heeft dat probleem niet
 * en een screenreader al helemaal niet.
 */
export function blockLabel({
  block,
  vehicle,
  showDriver,
  awaitsDriver,
  start,
  end,
  t,
}: {
  block: TripBlock;
  vehicle: CalendarVehicle | null;
  showDriver: boolean;
  awaitsDriver: boolean;
  start: Date;
  end: Date;
  /** De woorden, uit `useCalendarCopy()` van wie het label maakt. */
  t: Pick<
    CalendarCopy,
    'eventPrefix' | 'to' | 'driverPrefix' | 'noDriverYet' | 'requesterDrives' | 'toward' | 'cargo'
  >;
}): string {
  return [
    block.title,
    block.eventName ? `${t.eventPrefix} ${block.eventName}` : null,
    block.subtitle,
    vehicle?.name,
    `${formatTime(start)} ${t.to} ${formatTime(end)}`,
    showDriver
      ? block.driver
        ? `${t.driverPrefix} ${block.driver.name}`
        : awaitsDriver
          ? t.noDriverYet
          : t.requesterDrives
      : null,
    block.destination ? `${t.toward} ${block.destination}` : null,
    block.cargoNote ? `${t.cargo}: ${block.cargoNote}` : null,
  ]
    .filter(Boolean)
    .join(', ');
}
