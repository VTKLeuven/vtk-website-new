import Link from '@vtk/ui/link';
import { VanStatusBadge } from '@/components/status-badge';
import { requesterLabel, tripEventName, tripTitle } from '@/lib/uitleen';
import type { AdminTripRow } from '@/lib/uitleen-server';
import { dateLabel, hoursLabel } from './trip-format';

export type TripBadge = { label: string; tone: 'warn' | 'yellow' | 'quiet' };

const BADGE_TONE: Record<TripBadge['tone'], string> = {
  warn: 'bg-vtk-warn-fill text-vtk-warn',
  yellow: 'bg-vtk-yellow text-vtk-on-yellow',
  quiet: 'bg-vtk-paper-2 text-vtk-navy',
};

/**
 * Eén rit in de lijst: wie, wanneer, welk voertuig, de status, en verder niets
 * (P1, M1 uit de audit van november 2026).
 *
 * De hele rij is een link naar `?rit=<id>`: daar opent het paneel met de
 * beslissing of het beheer van die ene rit. Eén opbouw voor elk scherm, en niet
 * meer een kaart voor de telefoon plús een tabelrij met allebei het volledige
 * paneel erin: op een telefoon was één rit zo duizend pixels hoog.
 *
 * Op een telefoon twee regels (wanneer en voertuig met de status; wie en
 * waarvoor), met de labels op een eigen regel: in de kop van de oude kaart
 * deelden ze een rij met de voertuignaam en werd "Gewijzigd t.o.v. aanvraag" een
 * blok van drie regels.
 */
export function TripRow({
  trip,
  href,
  selected,
  extraLegs = 0,
  showDriver = true,
  showStatus = true,
  badges = [],
}: {
  trip: AdminTripRow;
  href: string;
  selected: boolean;
  /** Andere helften van dezelfde aanvraag (heen en terug, of een tweede voertuig). */
  extraLegs?: number;
  showDriver?: boolean;
  showStatus?: boolean;
  badges?: TripBadge[];
}) {
  const event = tripEventName(trip);
  const vehicle = `${trip.vehicle.nameNl}${
    trip.tripLeg ? ` (${trip.tripLeg === 'HEEN' ? 'heen' : 'terug'})` : extraLegs > 0 ? ` +${extraLegs}` : ''
  }`;
  const driver = trip.driver?.name ?? (trip.vehicle.needsDriver ? 'nog geen' : 'niet nodig');

  return (
    <li
      data-rit={trip.id}
      className={`border-b border-vtk-navy/10 ${selected ? 'bg-vtk-yellow/15' : ''}`}
    >
      <Link
        href={href}
        scroll={false}
        aria-current={selected ? 'true' : undefined}
        aria-label={`${tripTitle(trip)}, ${dateLabel(trip.startAt)} ${hoursLabel(trip)}, ${vehicle}, ${requesterLabel(trip)}`}
        className="block px-3 py-2.5 transition hover:bg-vtk-navy/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-vtk-yellow"
      >
        {/* Breed scherm: de kolommen van de kop erboven. */}
        <span className="hidden text-sm md:grid md:items-baseline md:gap-x-3 md:grid-cols-[6.5rem_8rem_8.5rem_minmax(0,1.2fr)_7.5rem_minmax(0,1.8fr)_7.5rem]">
          <span className="font-medium text-vtk-ink">{dateLabel(trip.startAt)}</span>
          <span className="tabular-nums text-vtk-body">{hoursLabel(trip)}</span>
          <span className="text-vtk-body">{vehicle}</span>
          <span className="min-w-0 text-vtk-body">
            {requesterLabel(trip)}
            <span className="block truncate text-xs text-vtk-muted">{trip.user.name}</span>
          </span>
          <span className={trip.driver || !trip.vehicle.needsDriver ? 'text-vtk-body' : 'font-semibold text-vtk-ink'}>
            {showDriver ? driver : null}
          </span>
          <span className="min-w-0 text-vtk-body">
            <span className="line-clamp-2">{tripTitle(trip)}</span>
            {event ? <span className="block truncate text-xs text-vtk-muted">{event}</span> : null}
          </span>
          <span>{showStatus ? <VanStatusBadge status={trip.status} /> : null}</span>
        </span>

        {/* Telefoon: twee regels. */}
        <span className="grid gap-0.5 md:hidden">
          <span className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm font-medium text-vtk-ink">
              {dateLabel(trip.startAt)} · <span className="tabular-nums">{hoursLabel(trip)}</span> · {vehicle}
            </span>
            {showStatus ? <VanStatusBadge status={trip.status} /> : null}
          </span>
          <span className="block truncate text-sm text-vtk-body">
            {requesterLabel(trip)} · {tripTitle(trip)}
          </span>
        </span>

        {badges.length > 0 ? (
          <span className="mt-1.5 flex flex-wrap gap-1.5">
            {badges.map((badge) => (
              <span key={badge.label} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE_TONE[badge.tone]}`}>
                {badge.label}
              </span>
            ))}
          </span>
        ) : null}
      </Link>
    </li>
  );
}

/** De koppen boven de kolommen; enkel op een breed scherm. */
export function TripRowHeader({ showDriver = true, showStatus = true }: { showDriver?: boolean; showStatus?: boolean }) {
  return (
    <div className="hidden border-b border-vtk-navy/10 px-3 pb-2 text-xs font-medium text-vtk-muted md:grid md:gap-x-3 md:grid-cols-[6.5rem_8rem_8.5rem_minmax(0,1.2fr)_7.5rem_minmax(0,1.8fr)_7.5rem]" aria-hidden>
      <span>Wanneer</span>
      <span>Uren</span>
      <span>Voertuig</span>
      <span>Aanvrager</span>
      <span>{showDriver ? 'Chauffeur' : null}</span>
      <span>Waarvoor</span>
      <span>{showStatus ? 'Status' : null}</span>
    </div>
  );
}
