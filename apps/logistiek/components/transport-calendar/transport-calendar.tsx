'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { DriverColorOverrides } from '@/lib/driver-colors';
import { vehiclePatternClass } from '@/lib/driver-colors';
import {
  CALENDAR_VIEWS,
  CALENDAR_VIEW_LABELS,
  type CalendarView,
} from '@/lib/calendar-range';
import { LogisticsIcon } from '@/components/logistics-icon';
import { MonthGrid } from './month-grid';
import { TimeGrid } from './time-grid';
import { vehicleIcon } from './trip-block';
import type { CalendarVehicle, TripBlock } from './types';

/**
 * De transportplanning: dag, week of maand, met de navigatie erboven.
 *
 * De weergave en de datum staan in de URL (`?weergave=week&datum=2026-09-01`) en
 * niet in de state van deze component. Drie redenen: de pagina blijft
 * server-gerenderd (de query haalt precies het venster op dat je ziet), een
 * collega kan je een link naar een bepaalde week sturen, en de terugknop van de
 * browser doet wat je verwacht.
 *
 * De klok in de kalender is Belgisch; de dagen komen binnen als UTC-middernacht
 * van een Belgische dag, zoals overal in deze module (zie `lib/week-lanes.ts`).
 */

export function TransportCalendar({
  view,
  anchor,
  days,
  vehicles,
  blocks,
  driverColors,
  selectedId,
  onSelect,
  emptyLabel,
  showDriver = true,
  toolbarExtra,
  children,
}: {
  view: CalendarView;
  /** De dag waar de weergave op staat, als ISO-string van UTC-middernacht. */
  anchor: string;
  days: string[];
  vehicles: CalendarVehicle[];
  blocks: TripBlock[];
  driverColors?: DriverColorOverrides;
  selectedId?: string | null;
  onSelect?: (blockId: string) => void;
  emptyLabel: string;
  showDriver?: boolean;
  /** Extra knoppen in de werkbalk (filters, "nieuwe rit", ...). */
  toolbarExtra?: React.ReactNode;
  /** Wat onder de kalender komt: de legende staat er al, dit komt erna. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  // De nu-lijn pas na de eerste render: de server kent het uur van de bezoeker
  // niet, en een lijn die er bij de hydratie anders uitziet, is een hydratiefout.
  const [now, setNow] = useState<Date | undefined>(undefined);
  useEffect(() => {
    setNow(new Date());
    // Elke minuut opnieuw. Een tragere klok laat de lijn achter de werkelijkheid
    // aanlopen op precies het moment dat iemand naar "is de kar al weg?" kijkt.
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  /** Dezelfde URL met een andere weergave of datum; de rest van de query blijft. */
  const hrefFor = useCallback(
    (next: { weergave?: CalendarView; datum?: string | null }) => {
      const query = new URLSearchParams(params.toString());
      if (next.weergave) query.set('weergave', next.weergave);
      if (next.datum === null) query.delete('datum');
      else if (next.datum) query.set('datum', next.datum);
      const search = query.toString();
      return search ? `${pathname}?${search}` : pathname;
    },
    [params, pathname]
  );

  const openDay = useCallback(
    (dayIso: string) => {
      router.push(hrefFor({ weergave: 'dag', datum: dayIso.slice(0, 10) }));
    },
    [hrefFor, router]
  );

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Weergavekeuze. Segmenten en geen keuzelijst: het zijn er drie, en je
            wisselt er de hele tijd tussen. */}
        <div
          className="inline-flex overflow-hidden rounded-full border border-vtk-navy/15"
          role="group"
          aria-label="Weergave"
        >
          {CALENDAR_VIEWS.map((option) => (
            <Link
              key={option}
              href={hrefFor({ weergave: option })}
              aria-current={option === view ? 'true' : undefined}
              className={`px-3.5 py-1.5 text-sm font-medium transition ${
                option === view
                  ? 'bg-vtk-navy text-white'
                  : 'text-vtk-ink hover:bg-vtk-navy/5'
              }`}
            >
              {CALENDAR_VIEW_LABELS[option]}
            </Link>
          ))}
        </div>

        {toolbarExtra}
      </div>

      {view === 'maand' ? (
        <MonthGrid
          days={days}
          anchor={anchor}
          vehicles={vehicles}
          blocks={blocks}
          onSelect={onSelect}
          onOpenDay={openDay}
          selectedId={selectedId}
          emptyLabel={emptyLabel}
          showDriver={showDriver}
          driverColors={driverColors}
          now={now}
        />
      ) : (
        <TimeGrid
          days={days}
          vehicles={vehicles}
          blocks={blocks}
          onSelect={onSelect}
          selectedId={selectedId}
          emptyLabel={emptyLabel}
          showDriver={showDriver}
          driverColors={driverColors}
          now={now}
        />
      )}

      {/* Welk icoon en welke arcering horen bij welk voertuig (K1). Allebei staan
          ze in het blok, dus zonder deze regel moet je raden wat het karretje
          voorstelt en waarom het gestreept is. */}
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-vtk-muted">
        {vehicles.map((vehicle) => (
          <li key={vehicle.id} className="flex items-center gap-1.5">
            {/* Enkel wanneer er een arcering ingesteld is: een leeg vierkantje
                naast elk voertuig leest als een uitgevinkt selectievakje. */}
            {vehiclePatternClass(vehicle.pattern) ? (
              <span
                aria-hidden
                className={`h-3.5 w-3.5 shrink-0 rounded-[3px] border border-vtk-navy/20 bg-vtk-paper ${vehiclePatternClass(
                  vehicle.pattern
                )}`}
              />
            ) : null}
            <LogisticsIcon name={vehicleIcon(vehicle.code)} className="h-3.5 w-3.5 shrink-0" />
            {vehicle.name}
          </li>
        ))}
      </ul>

      {children}
    </div>
  );
}

/**
 * De navigatie naast de titel: vorige, vandaag, volgende.
 *
 * Apart van de kalender omdat de pagina de titel eromheen zet ("Week 36" met het
 * datumbereik eronder), en die hoort bij de kop van de pagina en niet in de
 * werkbalk.
 */
export function CalendarNav({
  previousHref,
  nextHref,
  todayHref,
  isToday,
  label,
}: {
  previousHref: string;
  nextHref: string;
  todayHref: string;
  isToday: boolean;
  /** "week", "maand" of "dag": wat vorige en volgende verschuiven. */
  label: string;
}) {
  const buttonClass =
    'rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40';
  return (
    <nav className="flex flex-wrap items-center gap-2 text-sm" aria-label={`${label} kiezen`}>
      <Link href={previousHref} className={buttonClass} title={`Vorige ${label}`}>
        ← <span className="sr-only">Vorige {label}</span>
      </Link>
      <Link
        href={todayHref}
        aria-current={isToday ? 'true' : undefined}
        className={
          isToday
            ? 'rounded-full border border-vtk-navy bg-vtk-navy px-3 py-1.5 font-semibold text-white'
            : buttonClass
        }
      >
        Vandaag
      </Link>
      <Link href={nextHref} className={buttonClass} title={`Volgende ${label}`}>
        → <span className="sr-only">Volgende {label}</span>
      </Link>
    </nav>
  );
}
