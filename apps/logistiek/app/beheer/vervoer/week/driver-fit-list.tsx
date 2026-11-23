'use client';

import { useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@vtk/ui/toast';
import { UNSENT, unsentGuard } from '@vtk/ui/unsent-guard';
import { assignDriverAction } from '@/app/actions/beheer';
import { initials } from '@/components/transport-calendar/trip-block';
import type { AvailabilityBand } from '@/components/transport-calendar/types';
import { availabilityFillClass, AVAILABILITY_KIND_SHORT } from '@/lib/availability-kinds';
import { driverToneVar, type DriverColorOverrides } from '@/lib/driver-colors';
import { FIT_SHORT, rankDriversForTrip, type DriverFit, type FitWindow } from '@/lib/driver-fit';
import type { DriverOption } from '@/lib/uitleen-server';

/**
 * "Wie kan er rijden?" in het paneel van een rit: de chauffeurs op volgorde van
 * hoe goed hun opgegeven beschikbaarheid bij deze rit past, elk met een
 * tijdlijntje van een paar uur rond de rit.
 *
 * Dit is waarvoor je de beschikbaarheid nodig hebt: niet om ze te bekijken,
 * maar om iemand op een rit te zetten. In de week zie je de sporen; hier zie je
 * ze voor deze ene rit, en kies je met één klik.
 *
 * - **Kiezen enkel bij een goedgekeurde rit.** Bij een aanvraag kies je de
 *   chauffeur bij het goedkeuren (het formulier eronder). Een knop hier zou een
 *   chauffeur toewijzen die het goedkeuren met een lege keuzelijst meteen weer
 *   wist. De volgorde staat er wel, en de keuzelijst krijgt dezelfde woorden.
 * - **Van wie geen uren gekend zijn, krijgt geen rij** maar staat in één zin
 *   eronder: dat je het niet weet, is iets anders dan dat hij niet kan, maar het
 *   is ook geen reden om de lijst ermee te vullen. "Geen uren gekend" en niet
 *   "gaf niets door": enkel karchauffeurs kunnen hun uren invullen, en de planning
 *   haalt ook enkel die op (`availabilityInRange`). De keuzelijst eronder blijft
 *   iedereen aanbieden.
 * - **Voor de kar enkel wie met de kar mag rijden**, zoals de keuzelijst ze ook
 *   bovenaan zet.
 */

const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

/** Hoeveel uur voor en na de rit het tijdlijntje toont. */
const CONTEXT_MS = 3 * 60 * 60 * 1000;

const LEVEL_CLASS: Record<DriverFit['level'], string> = {
  kan: 'text-vtk-success',
  'liever-niet': 'text-vtk-warn',
  nood: 'text-vtk-warn',
  deels: 'text-vtk-body',
  onbekend: 'text-vtk-muted',
  niet: 'text-vtk-muted',
  bezet: 'text-vtk-danger',
};

export type FitTripInput = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  driverId: string | null;
};

/** De vensters en ritten één keer omgezet naar milliseconden. */
export function toFitInput(windows: readonly AvailabilityBand[], trips: readonly FitTripInput[]) {
  const fitWindows: FitWindow[] = windows.map((window) => ({
    driverId: window.driverId,
    start: new Date(window.startAt).getTime(),
    end: new Date(window.endAt).getTime(),
    kind: window.kind,
  }));
  const fitTrips = trips.map((trip) => ({
    id: trip.id,
    title: trip.title,
    driverId: trip.driverId,
    start: new Date(trip.startAt).getTime(),
    end: new Date(trip.endAt).getTime(),
  }));
  return { fitWindows, fitTrips };
}

/** De chauffeurs die voor deze rit in aanmerking komen, in de volgorde van de keuzelijst. */
export function candidateDrivers(drivers: readonly DriverOption[], needsVanDriver: boolean): DriverOption[] {
  return needsVanDriver ? drivers.filter((driver) => driver.canDriveVan) : [...drivers];
}

/**
 * Het woord achter elke naam in de keuzelijst van deze rit ("kan", "liever
 * niet"). Leeg voor wie niets doorgaf: dat achter de helft van de namen zetten,
 * maakt de lijst enkel langer.
 */
export function driverNotesFor(
  trip: FitTripInput,
  drivers: readonly DriverOption[],
  windows: readonly AvailabilityBand[],
  trips: readonly FitTripInput[]
): Record<string, string> {
  const { fitWindows, fitTrips } = toFitInput(windows, trips);
  const ranked = rankDriversForTrip(
    { id: trip.id, start: new Date(trip.startAt).getTime(), end: new Date(trip.endAt).getTime() },
    drivers.map((driver) => driver.id),
    fitWindows,
    fitTrips
  );
  return Object.fromEntries(
    ranked.filter((fit) => FIT_SHORT[fit.level] !== '').map((fit) => [fit.driverId, FIT_SHORT[fit.level]])
  );
}

export function DriverFitList({
  trip,
  needsVanDriver,
  canAssign,
  drivers,
  windows,
  trips,
  driverColors,
}: {
  trip: FitTripInput;
  needsVanDriver: boolean;
  /** Een goedgekeurde rit: dan staat er per chauffeur een knop "Kies". */
  canAssign: boolean;
  drivers: DriverOption[];
  windows: AvailabilityBand[];
  /** Alle ritten in beeld, om te zien wie op dat moment al rijdt. */
  trips: FitTripInput[];
  driverColors?: DriverColorOverrides;
}) {
  const router = useRouter();
  const showToast = useToast();
  const [pending, startTransition] = useTransition();

  const start = new Date(trip.startAt).getTime();
  const end = new Date(trip.endAt).getTime();

  const { ranked, fitWindows } = useMemo(() => {
    const input = toFitInput(windows, trips);
    const candidates = candidateDrivers(drivers, needsVanDriver);
    return {
      fitWindows: input.fitWindows,
      ranked: rankDriversForTrip(
        { id: trip.id, start, end },
        candidates.map((driver) => driver.id),
        input.fitWindows,
        input.fitTrips
      ),
    };
  }, [drivers, end, needsVanDriver, start, trip.id, trips, windows]);

  const nameOf = (driverId: string) => drivers.find((driver) => driver.id === driverId)?.name ?? '';
  // Wie nu rijdt bovenaan, ook als hij niet (meer) in de kandidaten staat.
  const current = trip.driverId;
  const rows = ranked.filter(
    (fit) =>
      fit.driverId !== current &&
      (fit.level === 'kan' ||
        fit.level === 'liever-niet' ||
        fit.level === 'nood' ||
        fit.level === 'deels' ||
        (fit.level === 'bezet' && fit.window !== null))
  );
  const unknown = ranked.filter((fit) => fit.driverId !== current && fit.level === 'onbekend');
  const notNow = ranked.filter(
    (fit) => fit.driverId !== current && (fit.level === 'niet' || (fit.level === 'bezet' && fit.window === null))
  );
  const currentFit = current ? ranked.find((fit) => fit.driverId === current) : undefined;

  const range = { from: start - CONTEXT_MS, to: end + CONTEXT_MS };
  const pct = (at: number) => ((Math.min(Math.max(at, range.from), range.to) - range.from) / (range.to - range.from)) * 100;

  function choose(driverId: string) {
    startTransition(async () => {
      const result = await unsentGuard.run(() => assignDriverAction(trip.id, driverId));
      if (result === UNSENT) return;
      if (result.ok) {
        // Gelukt met een staartje ("die chauffeur gaf 'liever niet' op"): dan
        // blijft de melding staan tot je ze wegklikt, zoals in het paneel.
        showToast({
          message: result.message ?? 'Chauffeur toegewezen.',
          variant: 'success',
          duration: result.warning ? 0 : undefined,
        });
        router.refresh();
      } else {
        showToast({ message: result.error ?? 'Er ging iets mis.', variant: 'error', duration: 0 });
      }
    });
  }

  function describe(fit: DriverFit): string {
    const window = fit.window;
    const hours = window ? `${timeFormatter.format(window.start)} tot ${timeFormatter.format(window.end)}` : '';
    switch (fit.level) {
      case 'kan':
        return `Kan, ${hours}`;
      case 'liever-niet':
        return `Liever niet, ${hours}`;
      case 'nood':
        return `Enkel in nood, ${hours}`;
      case 'deels':
        return `Deels: ${hours}${window && window.kind !== 'JA' ? `, ${AVAILABILITY_KIND_SHORT[window.kind].toLowerCase()}` : ''}`;
      case 'bezet':
        return `Rijdt dan al: ${fit.busyWith?.title ?? 'een andere rit'}`;
      case 'onbekend':
        return 'Geen uren gekend';
      default:
        return 'Niet op dit uur';
    }
  }

  // Een functie en geen component: een component die in de render gedefinieerd
  // wordt, is bij elke render een nieuw type, en dan bouwt React elke rij opnieuw
  // op (en verliest de knop waar je net op stond de focus).
  function renderRow(fit: DriverFit, isCurrent: boolean) {
    const name = nameOf(fit.driverId) || 'Onbekende chauffeur';
    const segments = fitWindows.filter(
      (window) => window.driverId === fit.driverId && window.end > range.from && window.start < range.to
    );
    return (
      <li
        key={fit.driverId}
        className={`grid grid-cols-[1.375rem_minmax(0,1fr)_4.75rem_3.25rem] items-center gap-2 rounded-[10px] px-1.5 py-1.5 ${
          isCurrent ? 'bg-vtk-paper-2' : fit.level === 'kan' ? 'bg-vtk-success-soft' : ''
        }`}
      >
        <span
          aria-hidden
          className="trip-chip trip-chip-lg"
          style={{ backgroundColor: driverToneVar(fit.driverId, driverColors) }}
        >
          {initials(name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-vtk-ink">{name}</span>
          <span className={`block truncate text-xs ${isCurrent ? 'text-vtk-success' : LEVEL_CLASS[fit.level]}`}>
            {isCurrent && fit.level === 'onbekend' ? 'Rijdt deze rit' : describe(fit)}
          </span>
        </span>
        {/* Een paar uur rond de rit: het kader is de rit, de kleur is wanneer hij
            kan. Of het venster de hele rit dekt, zie je in één oogopslag; de
            tekst links zegt hetzelfde voor wie het tijdlijntje niet ziet. */}
        <span aria-hidden className="relative h-2.5 rounded-full bg-vtk-paper-2">
          {segments.map((window, index) => (
            <span
              key={index}
              className={`absolute inset-y-0 rounded-full ${availabilityFillClass(window.kind)}`}
              style={{
                left: `${pct(window.start)}%`,
                width: `${Math.max(1, pct(window.end) - pct(window.start))}%`,
                backgroundColor: driverToneVar(fit.driverId, driverColors),
              }}
            />
          ))}
          <span
            className="absolute -inset-y-[3px] rounded-[5px] border-[1.5px] border-vtk-navy"
            style={{ left: `${pct(start)}%`, width: `${pct(end) - pct(start)}%` }}
          />
        </span>
        {isCurrent ? (
          <span className="text-center text-xs font-semibold text-vtk-success">Rijdt</span>
        ) : canAssign && fit.level !== 'bezet' ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => choose(fit.driverId)}
            aria-label={`${name} laten rijden: ${trip.title}`}
            className="h-8 rounded-full border border-vtk-navy/20 bg-vtk-surface text-xs font-semibold text-vtk-ink transition-colors hover:border-vtk-navy hover:bg-vtk-navy hover:text-vtk-on-emphasis disabled:opacity-50"
          >
            Kies
          </button>
        ) : (
          <span />
        )}
      </li>
    );
  }

  return (
    <section aria-labelledby={`wie-kan-${trip.id}`} className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id={`wie-kan-${trip.id}`} className="text-sm font-semibold text-vtk-ink">
          Wie kan er rijden?
        </h3>
        <span className="text-xs tabular-nums text-vtk-muted">
          {timeFormatter.format(start)} tot {timeFormatter.format(end)}
        </span>
      </div>

      {currentFit || rows.length > 0 ? (
        <ul className="grid gap-0.5">
          {currentFit ? renderRow(currentFit, true) : null}
          {rows.map((fit) => renderRow(fit, false))}
        </ul>
      ) : (
        <p className="text-sm text-vtk-body">
          Niemand gaf dit moment door als beschikbaar. Je kan iedereen nog altijd vragen; de
          keuzelijst hieronder heeft de hele lijst.
        </p>
      )}

      {unknown.length > 0 || notNow.length > 0 ? (
        <p className="text-xs leading-5 text-vtk-muted">
          {unknown.length > 0 ? (
            <>
              <span className="font-medium text-vtk-body">Geen uren gekend:</span>{' '}
              {unknown.map((fit) => nameOf(fit.driverId)).join(', ')}.{' '}
            </>
          ) : null}
          {notNow.length > 0 ? (
            <>
              <span className="font-medium text-vtk-body">Niet op dit uur:</span>{' '}
              {notNow.map((fit) => nameOf(fit.driverId)).join(', ')}.
            </>
          ) : null}
        </p>
      ) : null}

      {!canAssign ? (
        <p className="text-xs text-vtk-muted">
          Kies de chauffeur bij het goedkeuren hieronder; de keuzelijst zet dezelfde woorden achter
          elke naam.
        </p>
      ) : null}
    </section>
  );
}
