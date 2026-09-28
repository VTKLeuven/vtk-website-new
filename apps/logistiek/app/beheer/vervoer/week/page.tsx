import Link from 'next/link';
import { requireManage } from '@/lib/session';
import {
  canDeleteTransport,
  chargesRequester,
  formatDateOnly,
  formatDateRange,
  formatPriceCents,
  isoWeekNumber,
  parseDateOnly,
  onTripForNotes,
  requesterChoiceOf,
  requesterLabel,
  toBrusselsDateValue,
  toBrusselsTimeValue,
  toDateInputValue,
  toDatetimeLocalValue,
  todayDateOnly,
  transportDeleteDescription,
  vehiclesToDraw,
} from '@/lib/uitleen';
import {
  calendarRange,
  isCurrentPeriod,
  parseCalendarView,
  shiftAnchor,
  type CalendarView,
} from '@/lib/calendar-range';
import {
  calendarVehicles,
  driverColorOverrides,
  activeGroups,
  availabilityInRange,
  availabilityNotesInRange,
  driverOptions,
  eventsInRange,
  getLogistiekSettings,
  transportAuditLogsByBooking,
  tripNotesFor,
  transportRange,
  type TransportBooking,
} from '@/lib/uitleen-server';
import { describeFilters, filtersToQuery, parseTransportFilters } from '@/lib/transport-filters';
import { conflictPartners } from '@/lib/transport-conflicts';
import { startOfBrusselsDay } from '@/lib/week-lanes';
import { TransportPlanner, type PlannerTrip } from './planner';
import type { TripBlock } from '@/components/transport-calendar/types';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Hoe ver voorbij het venster de keuzelijst met evenementen kijkt.
 *
 * Twee weken aan elke kant: een rit hoort bij een evenement dat er nog aan komt
 * of net geweest is, en die twee weken dekken het voorbereiden en het opruimen.
 */
const EVENT_MARGIN_MS = 14 * DAY_MS;

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
  const session = await requireManage();
  const query = await searchParams;
  const { weergave, datum, week } = query;

  const view = parseCalendarView(weergave);
  const filters = parseTransportFilters(query);
  // `?week=` is de oude parameter van het weekoverzicht; links en bladwijzers uit
  // die tijd blijven werken in plaats van op deze week uit te komen.
  const anchor = (datum && parseDateOnly(datum)) || (week && parseDateOnly(week)) || todayDateOnly();
  const { days, from, to } = calendarRange(view, anchor);

  const [
    bookings,
    allVehicles,
    drivers,
    driverColors,
    groups,
    events,
    availability,
    availabilityNotes,
    settings,
  ] = await Promise.all([
    transportRange(from, to, filters),
    calendarVehicles(),
    driverOptions(),
    driverColorOverrides(),
    // Voor wie het team zelf een rit inplant. Alle posten en werkgroepen, niet
    // enkel die van het teamlid: Logistiek rijdt voor de hele kring.
    activeGroups(),
    // De evenementen rond dit venster. Ruimer dan het venster zelf, want ze
    // dienen twee dingen: de strook boven het rooster (P5, enkel wat dit venster
    // raakt) en de keuzelijst "hoort bij" in het ritformulier. Een rit op
    // vrijdag hoort vaak bij een evenement dat maandag daarna begint, en dat
    // moet je kunnen kiezen zonder eerst een week verder te bladeren.
    eventsInRange(new Date(from.getTime() - EVENT_MARGIN_MS), new Date(to.getTime() + EVENT_MARGIN_MS)),
    // Altijd ophalen, ook wanneer de band in het rooster uitstaat: de strook
    // "Wie kan er rijden" onder de planning toont dezelfde gegevens en heeft ze
    // dus altijd nodig. De filter bepaalt enkel of ze óók achter de ritten
    // liggen.
    availabilityInRange(from, to),
    // De algemene nota's bij die weken (F4.5). Om dezelfde reden altijd: ze
    // staan in de strook eronder, niet in het rooster.
    availabilityNotesInRange(from, to),
    // Enkel voor de zin onder "Post kiest zelf de chauffeur": die moet zeggen
    // wie er dan een mail krijgt, en dat is een instelling (F4.8b).
    getLogistiekSettings(),
  ]);

  // De strook boven het rooster toont enkel wat dit venster raakt, en enkel
  // wanneer de filter aanstaat; de keuzelijst in het formulier gebruikt de
  // ruimere lijst.
  const eventBarSource = filters.showEvents
    ? events.filter((event) => {
        const startAt = event.startAt as Date;
        return startAt < to && (event.endAt ?? endOfDay(startAt)) > from;
      })
    : [];

  const conflicts = conflictPartners(bookings);
  // De historiek van de getoonde ritten in één query; ze staat ingeklapt in het
  // paneel, maar wordt hier server-side gerenderd, zoals op /beheer/vervoer.
  const history = await transportAuditLogsByBooking(bookings.map((booking) => booking.id));
  // De eigen nota's van de getoonde ritten (F4.20): wat er met Logistiek gedeeld
  // is, plus wat dit teamlid zelf schreef. Andermans privénota's komen niet uit
  // de databank, ook niet met `logistiek.manage`. `onTripIds` zijn de ritten
  // waar dit teamlid zelf bij hoort, want daar leest hij ook de nota's die enkel
  // voor de post bedoeld zijn: dan ís het zijn post.
  const viewer = { userId: session.user.id, groupIds: session.groups.map((group) => group.id) };
  const notesPerTrip = await tripNotesFor(
    bookings.map((booking) => booking.id),
    {
      userId: session.user.id,
      onTripIds: bookings.filter((booking) => onTripForNotes(booking, viewer)).map((b) => b.id),
      logistiek: true,
    }
  );

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
    // Staan standaard niet in het blok; ze verschijnen pas wanneer iemand ze in
    // "Weergave" aanvinkt (R7). Ze reizen wel altijd mee: het zijn twee korte
    // strings per rit, en een tweede query per vinkje is dat niet waard.
    destination: booking.destination,
    cargoNote: booking.cargoNote,
    conflict: conflicts.has(booking.id),
  }));

  /** "de rit van Feest (14:00-18:00)", om de botsende rit mee te benoemen. */
  const tripLabel = (booking: TransportBooking) =>
    `${booking.eventName?.trim() || booking.purpose} (${timeFormatter.format(booking.startAt)}-${timeFormatter.format(booking.endAt)})`;
  const bookingById = new Map(bookings.map((booking) => [booking.id, booking]));

  // De actieve voertuigen, plus wie in dit venster gereden heeft: een gehuurd
  // busje dat na het gala op non-actief gaat, houdt zo zijn naam, zijn icoon en
  // zijn arcering in de week waarin het reed (F4.22). Kiezen doe je verderop nog
  // altijd uit de actieve.
  const vehicles = vehiclesToDraw(allVehicles, bookings);
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
      helpers: booking.helpers,
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
        eventId: booking.eventId ?? '',
        requesterChoice: requesterChoiceOf(booking),
        requesterOther: booking.requesterType === 'INTERN' ? '' : (booking.requesterName ?? ''),
      },
      requesterGroup:
        booking.groupId && booking.group
          ? { id: booking.groupId, name: booking.group.nameNl }
          : null,
      status: booking.status,
      vehicleId: booking.vehicleId,
      vehicleName: booking.vehicle.nameNl,
      driverId: booking.driverId,
      assignedGroupId: booking.assignedGroupId,
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
      // Elke rit zolang er geen geld aan hangt (R1). Bij een heen-en-terugrit
      // telt de hele groep: die gaat samen weg, dus als één helft niet mag, mag
      // geen enkele. De bevestiging zegt wie het merkt, zoals een aanvrager.
      canDelete: legs.every(canDeleteTransport),
      deleteCount: legs.length,
      deleteDescription: transportDeleteDescription(legs),
      history: history.get(booking.id) ?? [],
      notes: notesPerTrip.get(booking.id) ?? [],
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
      // Met welke ritten deze botst: het paneel zet ze één klik weg, zodat
      // schuiven het antwoord blijft op een botsing die je bewust maakte.
      conflictsWith: (conflicts.get(booking.id) ?? []).flatMap((id) => {
        const other = bookingById.get(id);
        return other ? [{ id, label: tripLabel(other) }] : [];
      }),
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

      <TransportPlanner
        view={view}
        anchor={anchor.toISOString()}
        days={days.map((day) => day.toISOString())}
        vehicles={vehicles.map((vehicle) => ({
          id: vehicle.id,
          name: vehicle.nameNl,
          code: vehicle.code,
          icon: vehicle.icon,
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
          groups: new Map(groups.map((group) => [group.id, group.nameNl])),
        })}
        vehicleOptions={vehicles
          .filter((vehicle) => vehicle.active)
          .map((vehicle) => ({
            id: vehicle.id,
            name: vehicle.nameNl,
            needsVanDriver: vehicle.needsVanDriver,
          }))}
        groups={groups.map((group) => ({ id: group.id, name: group.nameNl }))}
        handoverNotify={settings.tripHandover.mode}
        availability={availability.map((window) => ({
          id: window.id,
          driverId: window.userId,
          driverName: window.user.name,
          startAt: window.startAt.toISOString(),
          endAt: window.endAt.toISOString(),
          kind: window.kind,
          note: window.note,
        }))}
        availabilityNotes={availabilityNotes.map((note) => ({
          driverId: note.userId,
          weekStart: note.weekStart.toISOString(),
          text: note.text,
        }))}
        eventOptions={events.map((event) => ({
          id: event.id,
          name: event.name,
          startAt: (event.startAt as Date).toISOString(),
          groupName: event.group?.nameNl ?? null,
        }))}
        events={eventBarSource.map((event) => {
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
    </div>
  );
}

