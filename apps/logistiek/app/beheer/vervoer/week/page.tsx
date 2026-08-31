import Link from 'next/link';
import { requireManage } from '@/lib/session';
import {
  chargesRequester,
  formatDateOnly,
  formatDateRange,
  formatPriceCents,
  isoWeekNumber,
  parseDateOnly,
  requesterLabel,
  toBrusselsDateValue,
  toBrusselsTimeValue,
  toDateInputValue,
  toDatetimeLocalValue,
  todayDateOnly,
} from '@/lib/uitleen';
import {
  calendarRange,
  isCurrentPeriod,
  parseCalendarView,
  shiftAnchor,
  type CalendarView,
} from '@/lib/calendar-range';
import {
  activeVehicles,
  driverColorOverrides,
  activeGroups,
  availabilityInRange,
  driverOptions,
  eventsInRange,
  transportAuditLogsByBooking,
  transportRange,
  type TransportBooking,
} from '@/lib/uitleen-server';
import { describeFilters, filtersToQuery, parseTransportFilters } from '@/lib/transport-filters';
import { startOfBrusselsDay } from '@/lib/week-lanes';
import { TransportPlanner, type PlannerTrip } from './planner';
import type { TripBlock } from '@/components/transport-calendar/types';

const DAY_MS = 24 * 60 * 60 * 1000;

const timeFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

const monthFormatter = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'UTC',
  month: 'long',
  year: 'numeric',
});

/**
 * Goedgekeurde ritten van hetzelfde voertuig die elkaar overlappen. Dat hoort
 * niet te kunnen (de goedkeuring checkt het), maar een voertuigwissel of een
 * handmatige ingreep kan het alsnog veroorzaken, en dan wil je het zien.
 */
function conflictingIds(bookings: TransportBooking[]): Set<string> {
  const conflicts = new Set<string>();
  const approved = bookings.filter((booking) => booking.status === 'APPROVED');
  for (let i = 0; i < approved.length; i++) {
    for (let j = i + 1; j < approved.length; j++) {
      const a = approved[i];
      const b = approved[j];
      if (a.vehicleId !== b.vehicleId) continue;
      if (a.startAt < b.endAt && b.startAt < a.endAt) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      }
    }
  }
  return conflicts;
}

/**
 * 23:59 van dezelfde Belgische dag, voor een evenement zonder eindmoment.
 *
 * Via `startOfBrusselsDay` van de vólgende dag en niet via "plus 24 uur": op de
 * dag van een uurwissel duurt een dag 23 of 25 uur, en dan zou de balk een uur
 * te vroeg of te laat eindigen.
 */
function endOfDay(moment: Date): Date {
  const parsed = parseDateOnly(toBrusselsDateValue(moment));
  // Kan niet falen (de datum komt uit een `Date`), maar een terugval is
  // goedkoper dan een pagina die omvalt op een tijdzonerand.
  if (!parsed) return moment;
  const nextDay = new Date(parsed.getTime() + DAY_MS);
  return new Date(startOfBrusselsDay(nextDay) - 60_000);
}

/** De kop boven de kalender: "Week 36", "september 2026" of de dag zelf. */
function periodTitle(view: CalendarView, anchor: Date): string {
  if (view === 'dag') return formatDateOnly(anchor);
  if (view === 'maand') return monthFormatter.format(anchor);
  return `Week ${isoWeekNumber(anchor)}`;
}

export default async function VervoerWeekPage({
  searchParams,
}: {
  searchParams: Promise<{
    weergave?: string;
    datum?: string;
    week?: string;
    voertuig?: string;
    chauffeur?: string;
    status?: string;
    aanvrager?: string;
  }>;
}) {
  await requireManage();
  const query = await searchParams;
  const { weergave, datum, week } = query;

  const view = parseCalendarView(weergave);
  const filters = parseTransportFilters(query);
  // `?week=` is de oude parameter van het weekoverzicht; links en bladwijzers uit
  // die tijd blijven werken in plaats van op deze week uit te komen.
  const anchor = (datum && parseDateOnly(datum)) || (week && parseDateOnly(week)) || todayDateOnly();
  const { days, from, to } = calendarRange(view, anchor);

  const [bookings, vehicles, drivers, driverColors, groups, events, availability] =
    await Promise.all([
    transportRange(from, to, filters),
    activeVehicles(),
    driverOptions(),
    driverColorOverrides(),
    // Voor wie het team zelf een rit inplant. Alle posten en werkgroepen, niet
    // enkel die van het teamlid: Logistiek rijdt voor de hele kring.
    activeGroups(),
    // De evenementen die dit venster raken, voor de strook erboven (P5).
    filters.showEvents ? eventsInRange(from, to) : Promise.resolve([]),
    // Enkel ophalen wanneer de band ook getoond wordt (V1).
    filters.showAvailability ? availabilityInRange(from, to) : Promise.resolve([]),
  ]);

  const conflicts = conflictingIds(bookings);
  // De historiek van de getoonde ritten in één query; ze staat ingeklapt in het
  // paneel, maar wordt hier server-side gerenderd, zoals op /beheer/vervoer.
  const history = await transportAuditLogsByBooking(bookings.map((booking) => booking.id));

  // De filters blijven staan wanneer je van week naar week bladert: ze horen bij
  // waar je naar kijkt, niet bij wanneer.
  const filterQuery = new URLSearchParams(filtersToQuery(filters)).toString();
  const hrefFor = (target: Date) =>
    `/beheer/vervoer/week?weergave=${view}&datum=${toDateInputValue(target)}${
      filterQuery ? `&${filterQuery}` : ''
    }`;

  const blocks: TripBlock[] = bookings.map((booking) => ({
    id: booking.id,
    vehicleId: booking.vehicleId,
    startAt: booking.startAt.toISOString(),
    endAt: booking.endAt.toISOString(),
    status: booking.status,
    title: booking.eventName?.trim() || booking.purpose,
    subtitle: requesterLabel(booking),
    driver:
      booking.driver && booking.driverId
        ? { id: booking.driverId, name: booking.driver.name }
        : null,
    conflict: conflicts.has(booking.id),
  }));

  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

  const trips: PlannerTrip[] = bookings.map((booking) => {
    // De andere ritten van dezelfde aanvraag: het goedkeurformulier beslist over
    // de hele groep, dus het moet ze alle tonen met hun eigen uren.
    const legs = booking.tripGroupId
      ? bookings.filter((other) => other.tripGroupId === booking.tripGroupId)
      : [booking];
    const vehicle = vehicleById.get(booking.vehicleId);
    return {
      id: booking.id,
      purpose: booking.purpose,
      cargoNote: booking.cargoNote,
      eventName: booking.eventName,
      eventId: booking.eventId,
      reservationId: booking.reservationId,
      requesterLabel: requesterLabel(booking),
      userName: booking.user.name,
      contactPhone: booking.contactPhone,
      pickupAddress: booking.pickupAddress,
      destination: booking.destination,
      helpersNote: booking.helpersNote,
      helpersPhone: booking.helpersPhone,
      memberNote: booking.memberNote,
      adminNote: booking.adminNote,
      notifyEmail: booking.notifyEmail,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      edit: {
        startAt: toDatetimeLocalValue(booking.startAt),
        endAt: toDatetimeLocalValue(booking.endAt),
        purpose: booking.purpose,
        cargoNote: booking.cargoNote ?? '',
        pickupAddress: booking.pickupAddress ?? '',
        destination: booking.destination ?? '',
        adminNote: booking.adminNote ?? '',
      },
      status: booking.status,
      vehicleId: booking.vehicleId,
      vehicleName: booking.vehicle.nameNl,
      driverId: booking.driverId,
      driver:
        booking.driver && booking.driverId
          ? { id: booking.driverId, name: booking.driver.name }
          : null,
      pricingMode: booking.pricingMode,
      requesterType: booking.requesterType,
      // R4: enkel een externe betaalt, dus enkel daar zegt een bedrag iets.
      priceLabel: chargesRequester(booking.requesterType)
        ? formatPriceCents(booking.priceCents)
        : null,
      needsDriver: vehicle?.needsDriver ?? true,
      needsVanDriver: vehicle?.needsVanDriver ?? false,
      paid: booking.paidOfflineAt !== null,
      history: history.get(booking.id) ?? [],
      legs: legs
        .sort((a, b) => a.startAt.getTime() - b.startAt.getTime())
        .map((leg) => ({
          id: leg.id,
          startAt: toDatetimeLocalValue(leg.startAt),
          endAt: toDatetimeLocalValue(leg.endAt),
          label:
            legs.length > 1
              ? [
                  leg.tripLeg === 'TERUG' ? 'Terugrit' : leg.tripLeg === 'HEEN' ? 'Heenrit' : null,
                  vehicleById.get(leg.vehicleId)?.nameNl ?? null,
                ]
                  .filter(Boolean)
                  .join(' · ') || 'Rit'
              : null,
        })),
      // Wat er die dag al vaststaat met dit voertuig, om naar te schuiven.
      sameDayBookings: bookings
        .filter(
          (other) =>
            other.id !== booking.id &&
            other.vehicleId === booking.vehicleId &&
            other.status === 'APPROVED' &&
            other.startAt.toDateString() === booking.startAt.toDateString()
        )
        .map(
          (other) =>
            `${timeFormatter.format(other.startAt)}-${timeFormatter.format(other.endAt)} · ${
              other.eventName?.trim() || other.purpose
            }`
        ),
    };
  });

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
            {periodTitle(view, anchor)}
          </h2>
          <p className="text-sm text-vtk-muted">
            {view === 'dag'
              ? `${bookings.length} ${bookings.length === 1 ? 'rit' : 'ritten'}`
              : formatDateRange(days[0], new Date(to.getTime() - DAY_MS))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/beheer/vervoer"
            className="font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
            Lijst
          </Link>
          <Link
            href="/vervoer/bezetting"
            className="font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
            Publieke bezetting
          </Link>
        </div>
      </div>

      {vehicles.length === 0 ? (
        <p className="text-sm text-vtk-muted">Er staan nog geen voertuigen in de instellingen.</p>
      ) : (
        <TransportPlanner
          view={view}
          anchor={anchor.toISOString()}
          days={days.map((day) => day.toISOString())}
          vehicles={vehicles.map((vehicle) => ({
            id: vehicle.id,
            name: vehicle.nameNl,
            code: vehicle.code,
            pattern: vehicle.pattern,
            needsDriver: vehicle.needsDriver,
          }))}
          blocks={blocks}
          trips={trips}
          drivers={drivers}
          driverColors={driverColors}
          filters={filters}
          hiddenNote={describeFilters(filters, {
            vehicles: new Map(vehicles.map((vehicle) => [vehicle.id, vehicle.nameNl])),
            drivers: new Map(drivers.map((driver) => [driver.id, driver.name])),
          })}
          vehicleOptions={vehicles
            .filter((vehicle) => vehicle.active)
            .map((vehicle) => ({
              id: vehicle.id,
              name: vehicle.nameNl,
              needsVanDriver: vehicle.needsVanDriver,
            }))}
          groups={groups.map((group) => ({ id: group.id, name: group.nameNl }))}
          availability={availability.map((window) => ({
            id: window.id,
            driverId: window.userId,
            driverName: window.user.name,
            startAt: window.startAt.toISOString(),
            endAt: window.endAt.toISOString(),
            note: window.note,
          }))}
          events={events.map((event) => {
            const startAt = event.startAt as Date;
            // Een evenement zonder einde duurt tot het einde van zijn startdag;
            // een balk van nul breed zou onzichtbaar zijn, en dat is net het
            // evenement waarvan het uur nog niet ingevuld is.
            const endAt = event.endAt ?? endOfDay(startAt);
            return {
              id: event.id,
              name: event.name,
              location: event.location,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
              timeKnown: event.startTimeKnown,
              groupName: event.group?.nameNl ?? null,
              requestCount: event._count.reservations,
              tripCount: event._count.transport,
              form: {
                startDate: toBrusselsDateValue(startAt),
                startTime: event.startTimeKnown ? toBrusselsTimeValue(startAt) : '',
                endDate: event.endAt ? toBrusselsDateValue(event.endAt) : '',
                endTime: event.endAt ? toBrusselsTimeValue(event.endAt) : '',
                note: event.note ?? '',
              },
            };
          })}
          nav={{
            previousHref: hrefFor(shiftAnchor(view, anchor, -1)),
            nextHref: hrefFor(shiftAnchor(view, anchor, 1)),
            todayHref: hrefFor(todayDateOnly()),
            isToday: isCurrentPeriod(view, anchor),
            label: view,
          }}
        />
      )}
    </div>
  );
}

