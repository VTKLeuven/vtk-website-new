'use client';

import { useMemo } from 'react';
import type { DriverColorOverrides } from '@/lib/driver-colors';
import { isInMonth } from '@/lib/calendar-range';
import { placeForWeekRow, weekRows } from '@/lib/month-lanes';
import { LogisticsIcon } from '@/components/logistics-icon';
import { blockLabel, blockLook, formatTime, vehicleIcon } from './trip-block';
import type { CalendarVehicle, TripBlock } from './types';

/**
 * De maandweergave: hele weken onder elkaar, en elke rit een balk over de dagen
 * die ze beslaat.
 *
 * Hier is de as horizontaal in plaats van verticaal: een verhuis van vrijdag tot
 * zondag is één balk van drie kolommen, niet drie losse blokjes waarvan je niet
 * ziet dat ze bij elkaar horen. Het uur staat in de balk, maar de hoogte zegt er
 * niets over; wie het uur precies wil zien, gaat naar week of dag.
 *
 * Het raster loopt over hele weken (zie `calendarRange`), dus de eerste en de
 * laatste rij dragen dagen van de buurmaand. Die staan vervaagd: ze horen bij de
 * planning, maar niet bij de maand waar je naar kijkt.
 */

const weekdayFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
});
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Hoogte van één balk plus de ruimte eronder. */
const BAR_PX = 20;
/** Hoeveel balken er in een dagcel passen voor er "+n meer" verschijnt. */
const MAX_LANES = 4;

export function MonthGrid({
  days,
  anchor,
  vehicles,
  blocks,
  onSelect,
  onOpenDay,
  selectedId,
  emptyLabel,
  showDriver = true,
  driverColors,
  now,
}: {
  /** De dagen van het raster, als ISO-strings van UTC-middernacht. */
  days: string[];
  /** De maand waar je naar kijkt, als ISO-string; bepaalt welke dagen vervagen. */
  anchor: string;
  vehicles: CalendarVehicle[];
  blocks: TripBlock[];
  onSelect?: (blockId: string) => void;
  /** Klik op een dagnummer: naar de dagweergave van die dag. */
  onOpenDay?: (dayIso: string) => void;
  selectedId?: string | null;
  emptyLabel: string;
  showDriver?: boolean;
  driverColors?: DriverColorOverrides;
  now?: Date;
}) {
  const parsedDays = useMemo(() => days.map((day) => new Date(day)), [days]);
  const parsedAnchor = useMemo(() => new Date(anchor), [anchor]);
  const rows = useMemo(() => weekRows(parsedDays), [parsedDays]);
  const placedPerRow = useMemo(
    () => rows.map((row) => placeForWeekRow(blocks, row)),
    [blocks, rows]
  );
  const vehicleById = useMemo(
    () => new Map(vehicles.map((vehicle) => [vehicle.id, vehicle])),
    [vehicles]
  );

  /**
   * Alle rijen even hoog, op de drukste rij van deze maand.
   *
   * Per rij tellen zou een maand geven waarin de ene week twee keer zo hoog is
   * als de andere; dan lijkt een rustige week een fout in het raster in plaats
   * van een rustige week. Minstens twee banen, zodat een lege maand geen strook
   * dagnummers wordt.
   */
  const lanes = useMemo(() => {
    const most = placedPerRow.reduce(
      (highest, bars) => bars.reduce((row, bar) => Math.max(row, bar.lane + 1), highest),
      0
    );
    return Math.max(2, Math.min(MAX_LANES, most));
  }, [placedPerRow]);

  const todayKey = now ? dayKeyFormatter.format(now) : null;

  if (blocks.length === 0) {
    return <p className="text-sm text-vtk-muted">{emptyLabel}</p>;
  }

  return (
    <div className="relative overflow-x-auto">
      <div className="min-w-[42rem] rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-2">
        <div className="grid grid-cols-7 gap-1 pb-1.5">
          {rows[0]?.map((day) => (
            <span
              key={day.toISOString()}
              className="truncate px-1 text-xs font-semibold capitalize text-vtk-ink"
            >
              {weekdayFormatter.format(day)}
            </span>
          ))}
        </div>

        <div className="grid gap-1">
          {rows.map((row, rowIndex) => {
            const bars = placedPerRow[rowIndex];
            /** Wat er per dag niet meer paste, om als "+n meer" te tonen. */
            const hiddenPerDay = row.map(
              (_, col) =>
                bars.filter(
                  (bar) => bar.lane >= MAX_LANES && bar.col <= col && bar.col + bar.span > col
                ).length
            );

            return (
              <div key={row[0].toISOString()} className="relative">
                {/* De dagcellen: het raster waar de balken overheen liggen. */}
                <div className="grid grid-cols-7 gap-1">
                  {row.map((day) => {
                    const iso = day.toISOString();
                    const inMonth = isInMonth(day, parsedAnchor);
                    const isToday = todayKey !== null && dayKeyFormatter.format(day) === todayKey;
                    return (
                      <div
                        key={iso}
                        className={`rounded-[10px] px-1 pt-1 ${
                          isToday
                            ? 'bg-vtk-yellow/15'
                            : inMonth
                              ? 'bg-vtk-paper/70'
                              : 'bg-vtk-paper/30'
                        }`}
                        style={{ minHeight: 28 + lanes * BAR_PX }}
                      >
                        {onOpenDay ? (
                          <button
                            type="button"
                            onClick={() => onOpenDay(iso)}
                            className={`rounded px-1 text-xs font-semibold tabular-nums transition hover:bg-vtk-navy/10 ${
                              isToday
                                ? 'text-vtk-navy'
                                : inMonth
                                  ? 'text-vtk-ink'
                                  : 'text-vtk-muted'
                            }`}
                          >
                            {day.getUTCDate()}
                            <span className="sr-only">: open deze dag in de dagweergave</span>
                          </button>
                        ) : (
                          <span
                            className={`px-1 text-xs font-semibold tabular-nums ${
                              inMonth ? 'text-vtk-ink' : 'text-vtk-muted'
                            }`}
                          >
                            {day.getUTCDate()}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* De balken, absoluut over de cellen heen: alleen zo kan één
                    balk over meerdere dagen lopen. `pointer-events-none` op de
                    laag zelf, zodat de dagnummers eronder aanklikbaar blijven. */}
                <div className="pointer-events-none absolute inset-x-0 top-[26px] grid grid-cols-7 gap-1">
                  {bars
                    .filter((bar) => bar.lane < MAX_LANES)
                    .map((bar) => {
                      const vehicle = vehicleById.get(bar.vehicleId) ?? null;
                      const look = blockLook({
                        block: bar,
                        vehicle,
                        showDriver,
                        driverColors,
                        selected: selectedId === bar.id,
                      });
                      const label = blockLabel({
                        block: bar,
                        vehicle,
                        showDriver,
                        awaitsDriver: look.awaitsDriver,
                        start: bar.start,
                        end: bar.end,
                      });
                      const content = (
                        <span className="flex items-center gap-1 truncate">
                          {bar.continuesBefore ? <span aria-hidden>←</span> : null}
                          <span className="shrink-0 font-semibold tabular-nums">
                            {formatTime(bar.start)}
                          </span>
                          {vehicle ? (
                            <LogisticsIcon
                              name={vehicleIcon(vehicle.code)}
                              className="h-3 w-3 shrink-0"
                            />
                          ) : null}
                          <span className="truncate">{bar.title}</span>
                          {bar.continuesAfter ? <span aria-hidden>→</span> : null}
                        </span>
                      );
                      const style: React.CSSProperties = {
                        ...look.style,
                        gridColumn: `${bar.col + 1} / span ${bar.span}`,
                        gridRow: bar.lane + 1,
                        height: BAR_PX - 3,
                      };
                      return onSelect ? (
                        <button
                          key={bar.id}
                          type="button"
                          onClick={() => onSelect(bar.id)}
                          title={label}
                          aria-label={label}
                          style={style}
                          className={`pointer-events-auto mx-0.5 flex items-center transition hover:brightness-95 ${look.className}`}
                        >
                          {content}
                        </button>
                      ) : (
                        <div
                          key={bar.id}
                          title={label}
                          style={style}
                          className={`mx-0.5 flex items-center ${look.className}`}
                        >
                          {content}
                        </div>
                      );
                    })}
                </div>

                {/* "+2 meer" onder de cel waar er iets wegvalt. Zonder deze regel
                    leest een volle dag als een rustige dag, en dat is precies de
                    dag waarop je niet verrast wil worden. */}
                <div className="pointer-events-none absolute inset-x-0 bottom-0 grid grid-cols-7 gap-1">
                  {hiddenPerDay.map((count, col) =>
                    count > 0 ? (
                      <span
                        key={col}
                        style={{ gridColumn: col + 1 }}
                        className="pointer-events-auto px-1.5 text-[10px] font-semibold text-vtk-navy"
                      >
                        +{count} meer
                      </span>
                    ) : (
                      <span key={col} style={{ gridColumn: col + 1 }} />
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
