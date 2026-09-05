'use client';

import { useMemo, useState } from 'react';
import { AVAILABILITY_KINDS, type AvailabilityKind } from '@/lib/availability-day';
import {
  AVAILABILITY_KIND_HINT,
  AVAILABILITY_KIND_LABEL,
  availabilityFillClass,
} from '@/lib/availability-kinds';
import type { DriverColorOverrides } from '@/lib/driver-colors';
import { driverColorVar } from '@/lib/driver-colors';
import { startOfBrusselsDay } from '@/lib/week-lanes';
import type { AvailabilityBand } from './types';

/**
 * Wie kan er wanneer rijden, deze week (V1).
 *
 * Een eigen strook onder de planning, met **één rij per chauffeur**. In de
 * planning zelf liggen dezelfde vensters als lichte band achter de ritten, en
 * dat blijft zo: daar is beschikbaarheid de achtergrond waarbinnen je plant. Maar
 * als achtergrond beantwoordt ze de vraag "wie kan er donderdagavond?" niet: alle
 * banden liggen dan door elkaar in dezelfde kolom, en van vier mensen die kunnen
 * zie je één gearceerd blok.
 *
 * Hier staat elke chauffeur op zijn eigen lijn, in zijn eigen kleur uit de
 * planning, zodat "wie kan er wanneer" één blik is in plaats van een puzzel.
 *
 * Wat daarbij vastligt:
 *
 * - **Iedereen uit de chauffeurslijst krijgt een rij**, ook wie niets doorgaf.
 *   Een lege rij is informatie: die persoon weet je niet, en dat is iets anders
 *   dan dat hij niet kan. Wie niets doorgaf staat onderaan, met een grijze zin
 *   in plaats van een lege lijn.
 * - **De kleur is dezelfde als in de planning.** Zie je hier dat de blauwe kan,
 *   dan herken je hem boven meteen terug.
 * - **Het patroon zegt hoe graag.** Vol is "beschikbaar", schuine strepen zijn
 *   "liever niet", stippen zijn "enkel in noodgeval". De kleur is hier al bezet
 *   om te zeggen wie het is, dus kan ze het verschil tussen de drie niet
 *   dragen; zie lib/availability-kinds.ts.
 * - **Wie het meest kan, staat boven.** De vraag hier is "wie vraag ik?", en dan
 *   hoort het antwoord niet alfabetisch onderaan te staan. Gesorteerd op de uren
 *   die iemand in dit venster als "beschikbaar" opgaf, en pas daarna op de rest;
 *   wie enkel "in noodgeval" aankruiste, komt dus niet boven iemand die gewoon
 *   kan.
 * - **De tijd is een positie, geen tekst.** De hele strook is het venster van de
 *   weergave; een blok van vier uur is een blokje van vier uur breed. Het uur
 *   staat erin zodra het past en anders in de tooltip: op een week is een
 *   werkdag een balkje van vijfendertig pixels, en "09:0…" erin is minder
 *   leesbaar dan niets. Op een dagweergave past het wel, en dan staat het er.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

const weekdayFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
});
const dayNumberFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  day: 'numeric',
});
const momentFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});
const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

export type BoardDriver = { id: string; name: string };

/** Eén venster als balkje op de strook. */
type Bar = {
  id: string;
  kind: AvailabilityKind;
  /** Hoelang dit venster binnen de weergave duurt, voor de volgorde en de telling. */
  minutes: number;
  left: number;
  width: number;
  label: string;
  title: string;
};

/** "8u" of "1u30", kort genoeg voor naast een naam van dertig tekens. */
function hoursLabel(hours: number): string {
  const whole = Math.floor(hours);
  const minutes = Math.round((hours - whole) * 60);
  return minutes === 0 ? `${whole}u` : `${whole}u${String(minutes).padStart(2, '0')}`;
}

export function AvailabilityBoard({
  days,
  windows,
  drivers,
  driverColors,
}: {
  /** De dagen van de weergave, als ISO-strings van UTC-middernacht. */
  days: string[];
  windows: AvailabilityBand[];
  /** Iedereen die kan rijden, ook wie niets doorgaf. */
  drivers: BoardDriver[];
  driverColors?: DriverColorOverrides;
}) {
  const [only, setOnly] = useState<string[]>([]);
  /** Welke soorten getoond worden; leeg betekent alle drie. */
  const [kinds, setKinds] = useState<AvailabilityKind[]>([]);

  const parsedDays = useMemo(() => days.map((day) => new Date(day)), [days]);

  const range = useMemo(() => {
    if (parsedDays.length === 0) return null;
    const from = startOfBrusselsDay(parsedDays[0]);
    const to = startOfBrusselsDay(
      new Date(parsedDays[parsedDays.length - 1].getTime() + DAY_MS)
    );
    return { from, to, span: to - from };
  }, [parsedDays]);

  /**
   * De vensters per chauffeur, geknipt op het venster van de weergave.
   *
   * Knippen en niet weglaten: een venster van vrijdagavond tot zondagochtend
   * hoort ook op een week te staan die op zaterdag eindigt, en dan als balk tot
   * de rand.
   */
  const perDriver = useMemo(() => {
    const map = new Map<string, Bar[]>();
    if (!range) return map;
    for (const window of windows) {
      if (kinds.length > 0 && !kinds.includes(window.kind)) continue;
      const start = new Date(window.startAt).getTime();
      const end = new Date(window.endAt).getTime();
      if (end <= range.from || start >= range.to) continue;
      const from = Math.max(start, range.from);
      const to = Math.min(end, range.to);
      const bars = map.get(window.driverId) ?? [];
      bars.push({
        id: window.id,
        kind: window.kind,
        minutes: (to - from) / 60000,
        left: ((from - range.from) / range.span) * 100,
        width: Math.max(0.4, ((to - from) / range.span) * 100),
        label: `${timeFormatter.format(new Date(from))}-${timeFormatter.format(new Date(to))}`,
        title: `${window.driverName}, ${AVAILABILITY_KIND_LABEL[window.kind].toLowerCase()}: ${momentFormatter.format(new Date(start))} tot ${momentFormatter.format(new Date(end))}${window.note ? ` (${window.note})` : ''}`,
      });
      map.set(window.driverId, bars);
    }
    return map;
  }, [kinds, range, windows]);

  /**
   * Hoeveel uur iemand van elke soort opgaf binnen dit venster.
   *
   * Waarvoor: de volgorde van de rijen, en de regel naast de naam. Een balk
   * aflezen zegt wanneer, niet hoeveel, en "wie kan er het meest deze week" is
   * precies de vraag waarmee je aan een kalender begint.
   */
  const hoursPerDriver = useMemo(() => {
    const map = new Map<string, Record<AvailabilityKind, number>>();
    for (const [driverId, bars] of perDriver) {
      const totals: Record<AvailabilityKind, number> = { JA: 0, LIEVER_NIET: 0, NOOD: 0 };
      for (const bar of bars) totals[bar.kind] += bar.minutes / 60;
      map.set(driverId, totals);
    }
    return map;
  }, [perDriver]);

  /**
 * Vanaf welk aandeel van de strook er tekst in een balk past.
 *
 * Twaalf procent is op een week ongeveer twintig uur (dus nooit) en op één dag
 * bijna drie uur (dus meestal wel), en dat is precies de bedoeling: hoe verder
 * je uitzoomt, hoe meer de kleur het werk doet.
 */
const LABEL_MIN_SHARE = 12;

/**
 * Om de hoeveel uur er een streepje in de strook komt, per lengte van het
 * venster.
 *
 * Zonder streepjes is een balk enkel een kleur op een lijn: je ziet dát iemand
 * kan, niet wanneer. En het uur in de balk zelf helpt daar niet, want dat past
 * precies niet bij de korte vensters waar je het nodig hebt.
 *
 * Op één dag om de drie uur, tot een week om de zes. Op een week is een dag
 * ongeveer honderd pixels breed, dus vier streepjes per dag staan zo'n
 * vijfentwintig pixels uit elkaar en de cijfers 00, 06, 12 en 18 passen er nog
 * naast elkaar. Op een maand blijven enkel de dagranden over; daar zou elk
 * streepje smaller zijn dan het cijfer erboven.
 */
function tickHours(dayCount: number): number {
  if (dayCount <= 1) return 3;
  if (dayCount <= HOUR_LABEL_MAX_DAYS) return 6;
  return 24;
}

/** Tot hoeveel dagen de streepjes een uur dragen in plaats van enkel een lijn. */
const HOUR_LABEL_MAX_DAYS = 7;

/**
 * Wie iets doorgaf eerst en op volgorde van bruikbaarheid; wie niets doorgaf
 * onderaan, in de eigen volgorde.
 */
  const rows = useMemo(() => {
    const chosen = only.length === 0 ? drivers : drivers.filter((driver) => only.includes(driver.id));
    const withWindows = chosen
      .filter((driver) => (perDriver.get(driver.id)?.length ?? 0) > 0)
      .sort((a, b) => {
        const left = hoursPerDriver.get(a.id) ?? { JA: 0, LIEVER_NIET: 0, NOOD: 0 };
        const right = hoursPerDriver.get(b.id) ?? { JA: 0, LIEVER_NIET: 0, NOOD: 0 };
        // Eerst wie het meest gewoon kan, dan wie het meest "liever niet" zei, en
        // pas als laatste "in noodgeval": anders zou iemand die de hele week op
        // noodgeval zette, boven iemand staan die zaterdag gewoon kan.
        return (
          right.JA - left.JA ||
          right.LIEVER_NIET - left.LIEVER_NIET ||
          right.NOOD - left.NOOD ||
          a.name.localeCompare(b.name)
        );
      });
    const without = chosen.filter((driver) => (perDriver.get(driver.id)?.length ?? 0) === 0);
    return { withWindows, without };
  }, [drivers, hoursPerDriver, only, perDriver]);

  /**
   * De streepjes: één per `tickHours` uur, met de dagranden apart (die zijn
   * sterker en dragen de dagnaam).
   */
  const ticks = useMemo(() => {
    const step = tickHours(parsedDays.length);
    const perDay = 24 / step;
    const out: Array<{ left: number; hour: number; isDay: boolean }> = [];
    for (let day = 0; day < parsedDays.length; day += 1) {
      for (let slot = 0; slot < perDay; slot += 1) {
        const hour = slot * step;
        out.push({
          left: ((day + hour / 24) / parsedDays.length) * 100,
          hour,
          isDay: hour === 0,
        });
      }
    }
    return out;
  }, [parsedDays.length]);

  const showHourLabels = parsedDays.length <= HOUR_LABEL_MAX_DAYS;

  if (!range || drivers.length === 0) return null;

  return (
    // `min-w-0`: deze strook staat in een raster, en een rasteritem heeft
    // `min-width: auto`, oftewel "krimp niet onder je inhoud". De `min-w-[30rem]`
    // hieronder duwde daardoor de hele pagina open in plaats van in zijn eigen
    // doos te scrollen, en dan schuift een telefoon de planning ernaast mee.
    <section className="min-w-0 rounded-[16px] border border-vtk-navy/10 bg-vtk-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-vtk-ink">Wie kan er rijden</h2>
        <p className="text-xs text-vtk-muted">
          Wat de chauffeurs zelf doorgaven. Het is een hint, geen belofte: je mag ze ook daarbuiten
          vragen.
        </p>
      </div>

      {/* De legende meteen onder de titel: zonder haar is "liever niet" een
          patroon dat je moet raden, en dan lezen alle balken als "kan". */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {AVAILABILITY_KINDS.map((kind) => (
          <span key={kind} className="inline-flex items-center gap-1.5 text-[11px] text-vtk-muted">
            <span
              aria-hidden
              className={`h-3 w-4 rounded-[3px] border border-vtk-navy/25 ${availabilityFillClass(kind)}`}
              style={{ backgroundColor: 'var(--driver-1)' }}
            />
            <span className="font-medium text-vtk-ink">{AVAILABILITY_KIND_LABEL[kind]}</span>
            {AVAILABILITY_KIND_HINT[kind]}
          </span>
        ))}
      </div>

      {/* Filteren op soort. Waarvoor: "wie kan er donderdagavond echt" is een
          andere vraag dan "wie kan er desnoods", en met alle drie door elkaar
          lijkt een week voller dan ze is. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-vtk-muted">
          Toon
        </span>
        <button
          type="button"
          onClick={() => setKinds([])}
          aria-pressed={kinds.length === 0}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
            kinds.length === 0
              ? 'border-vtk-navy bg-vtk-navy text-white'
              : 'border-vtk-navy/20 text-vtk-muted hover:border-vtk-navy/50'
          }`}
        >
          Alles
        </button>
        {AVAILABILITY_KINDS.map((kind) => {
          const active = kinds.includes(kind);
          return (
            <button
              key={kind}
              type="button"
              aria-pressed={active}
              onClick={() =>
                setKinds((current) =>
                  current.includes(kind)
                    ? current.filter((value) => value !== kind)
                    : [...current, kind]
                )
              }
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? 'border-vtk-navy bg-vtk-navy/5 text-vtk-ink'
                  : 'border-vtk-navy/20 text-vtk-muted hover:border-vtk-navy/50'
              }`}
            >
              {AVAILABILITY_KIND_LABEL[kind]}
            </button>
          );
        })}
      </div>

      {/* De filter. Niets aangevinkt betekent iedereen, en dat staat er ook:
          een lege filter die alles verbergt is de klassieke manier om een scherm
          leeg te laten lijken. */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOnly([])}
          aria-pressed={only.length === 0}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
            only.length === 0
              ? 'border-vtk-navy bg-vtk-navy text-white'
              : 'border-vtk-navy/20 text-vtk-muted hover:border-vtk-navy/50'
          }`}
        >
          Iedereen
        </button>
        {drivers.map((driver) => {
          const active = only.includes(driver.id);
          return (
            <button
              key={driver.id}
              type="button"
              aria-pressed={active}
              onClick={() =>
                setOnly((current) =>
                  current.includes(driver.id)
                    ? current.filter((id) => id !== driver.id)
                    : [...current, driver.id]
                )
              }
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                active
                  ? 'border-vtk-navy bg-vtk-navy/5 text-vtk-ink'
                  : 'border-vtk-navy/20 text-vtk-muted hover:border-vtk-navy/50'
              }`}
            >
              <span
                aria-hidden
                className="h-2.5 w-2.5 rounded-full border border-vtk-navy/20"
                style={{ backgroundColor: driverColorVar(driver.id, driverColors) }}
              />
              {driver.name}
            </button>
          );
        })}
      </div>

      <div className="mt-3 min-w-0 overflow-x-auto">
        <div className="min-w-[30rem]">
          {/* De dagkop, uitgelijnd op de stroken eronder. */}
          <div className="flex items-end gap-2 pb-1">
            <span className="w-32 shrink-0" />
            <div className="relative flex-1">
              <div
                className="grid gap-px"
                style={{ gridTemplateColumns: `repeat(${parsedDays.length}, minmax(0, 1fr))` }}
              >
                {parsedDays.map((day) => (
                  <span
                    key={day.toISOString()}
                    className="truncate px-1 text-[11px] font-semibold capitalize text-vtk-muted"
                  >
                    {weekdayFormatter.format(day)} {dayNumberFormatter.format(day)}
                  </span>
                ))}
              </div>
              {/* De uren onder de dagnamen, op dezelfde plek als hun streepje.
                  Enkel wanneer er dagen genoeg breed zijn; op een week zouden
                  het veertien cijfers over elkaar worden. */}
              {showHourLabels ? (
                <div className="relative mt-0.5 h-3">
                  {ticks.map((tick) => (
                    <span
                      key={`${tick.left}`}
                      className="absolute top-0 -translate-x-1/2 text-[9px] tabular-nums text-vtk-muted"
                      style={{ left: `${tick.left}%` }}
                    >
                      {String(tick.hour).padStart(2, '0')}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <ul className="grid gap-1">
            {rows.withWindows.map((driver) => {
              const totals = hoursPerDriver.get(driver.id);
              // De uren naast de naam: de balken zeggen wanneer, dit zegt
              // hoeveel, en dat is wat de volgorde van de rijen verklaart.
              const summary = totals
                ? AVAILABILITY_KINDS.filter((kind) => totals[kind] >= 0.25)
                    .map((kind) =>
                      kind === 'JA'
                        ? hoursLabel(totals[kind])
                        : `${hoursLabel(totals[kind])} ${kind === 'NOOD' ? 'nood' : 'liever niet'}`
                    )
                    .join(' · ')
                : '';
              return (
              <li key={driver.id} className="flex items-center gap-2">
                <span className="w-32 shrink-0">
                  <span className="block truncate text-xs font-medium text-vtk-ink">
                    {driver.name}
                  </span>
                  {summary ? (
                    <span className="block truncate text-[10px] tabular-nums text-vtk-muted">
                      {summary}
                    </span>
                  ) : null}
                </span>
                <div className="relative h-8 flex-1 overflow-hidden rounded-[8px] bg-vtk-paper/70">
                  {/* De uurstreepjes, zodat een balk af te lezen valt tegen een
                      tijdstip in plaats van tegen een hele dag. De dagranden zijn
                      donkerder: dat is de grens die je het eerst zoekt. */}
                  {ticks.map((tick) =>
                    tick.left === 0 ? null : (
                      <span
                        key={`${tick.left}`}
                        aria-hidden
                        className={`absolute inset-y-0 w-px ${
                          tick.isDay ? 'bg-vtk-navy/15' : 'bg-vtk-navy/[0.06]'
                        }`}
                        style={{ left: `${tick.left}%` }}
                      />
                    )
                  )}
                  {(perDriver.get(driver.id) ?? []).map((bar) => (
                    <span
                      key={bar.id}
                      title={bar.title}
                      className={`absolute inset-y-1 flex items-center overflow-hidden rounded-[6px] border border-vtk-navy/20 px-1.5 text-[10px] font-semibold tabular-nums text-vtk-ink ${availabilityFillClass(bar.kind)}`}
                      style={{
                        left: `${bar.left}%`,
                        width: `${bar.width}%`,
                        // `backgroundColor` en niet de shorthand: die zou het
                        // patroon van de soort weer wegvegen.
                        backgroundColor: driverColorVar(driver.id, driverColors),
                      }}
                    >
                      {bar.width >= LABEL_MIN_SHARE ? (
                        <span className="truncate">{bar.label}</span>
                      ) : null}
                    </span>
                  ))}
                </div>
              </li>
              );
            })}
          </ul>

          {rows.withWindows.length === 0 ? (
            <p className="py-3 text-xs text-vtk-muted">
              {kinds.length > 0
                ? `Niemand gaf voor deze periode "${kinds.map((kind) => AVAILABILITY_KIND_LABEL[kind].toLowerCase()).join('" of "')}" door.`
                : 'Niemand gaf voor deze periode iets door.'}
            </p>
          ) : null}

          {!showHourLabels && rows.withWindows.length > 0 ? (
            <p className="mt-1 text-[11px] text-vtk-muted">
              Elk fijn streepje is {tickHours(parsedDays.length)} uur, de donkere lijnen zijn de
              dagranden. Wijs een balk aan voor het precieze uur, of ga naar de dagweergave.
            </p>
          ) : null}

          {rows.without.length > 0 ? (
            <p className="mt-2 border-t border-vtk-navy/10 pt-2 text-xs text-vtk-muted">
              <span className="font-medium text-vtk-ink">Niets doorgegeven:</span>{' '}
              {rows.without.map((driver) => driver.name).join(', ')}. Dat betekent niet dat ze niet
              kunnen; je weet het gewoon niet.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
