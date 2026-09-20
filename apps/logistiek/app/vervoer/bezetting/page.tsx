import Link from 'next/link';
import type { Metadata } from 'next';
import type { UitleenRequesterType } from '@prisma/client';
import { PageShell } from '@/components/page-shell';
import { PublicWeek } from './public-week';
import type { TripBlock } from '@/components/transport-calendar/types';
import { getLocale } from '@/lib/i18n';
import { canEditAllHelpers, canManage, canSeeTripDetails, getSession } from '@/lib/session';
import {
  formatBrusselsDay,
  formatDateRange,
  isoWeekNumber,
  ownsTransportBooking,
  parseDateOnly,
  requesterLabel,
  startOfWeek,
  toDateInputValue,
  tripHoursLabel,
} from '@/lib/uitleen';
import {
  activeVehicles,
  driverColorOverrides,
  driverOptions,
  transportRange,
  transportWeekForMembers,
  transportWeekForPraesidium,
  transportWeekPublic,
} from '@/lib/uitleen-server';
import { filtersToQuery, parseTransportFilters } from '@/lib/transport-filters';
import type { BezettingTrip } from './trip-card';

/**
 * Wanneer is een voertuig vrij? (T8)
 *
 * Twee gezichten, met dezelfde lay-out als de transportplanning van het team:
 *
 * - **Zonder login** enkel voertuig, dag en tijdvenster. Geen namen, geen doel,
 *   geen adressen, geen chauffeurs; de query haalt die velden niet eens op en de
 *   pagina staat op noindex. Zo kan iemand zien of de kar vrij is zonder dat de
 *   werking van de kring op straat ligt.
 * - **Ingelogd** ook het evenement en de chauffeur, want dat is precies wat de
 *   feedback vroeg ("zodat je ziet wie welk ritje doet"). Wel zonder adressen,
 *   telefoonnummers en beslisknoppen: dat blijft van het team.
 * - **Logistiek en IT** (`logistiek.manage`, superadmins inbegrepen) kunnen een
 *   rit aanklikken en krijgen er een leeskaart bij: welke post ze aanvroeg, wie
 *   ze indiende, waarvoor ze dient, wat er mee moet, waar ze langs en naartoe
 *   gaat, wie rijdt en meerijdt, en de nota's. Dat is dezelfde projectie als de
 *   teamplanning (`transportRange`) achter dezelfde permissie, dus er komt niets
 *   te voorschijn wat die persoon op /beheer/vervoer niet al zag; het scheelt hem
 *   enkel de omweg langs dat scherm. Knoppen staan er niet: dit blijft een
 *   overzicht om naar te kijken, en beslissen gebeurt op één plek.
 * - **Wie de bijrijders regelt** (`logistiek.helpers`) krijgt de leeskaart van
 *   een post en mag bij elke rit de bijrijders aanpassen, met hun nummer erbij.
 *   Niet de laag van het team: dat recht gaat over wie er meerijdt, niet over
 *   adressen of nota's.
 *
 * Drie gezichten dus, maar nog altijd niet één query met een vlag: elke laag
 * haalt zijn eigen velden op, zodat een vergeten `if` geen namen aan de
 * straatkant kan zetten.
 */
export const metadata: Metadata = {
  title: 'Wanneer is de kar vrij?',
  robots: { index: false, follow: false },
};

const DAY_MS = 24 * 60 * 60 * 1000;

export default async function VervoerBezettingPage({
  searchParams,
}: {
  searchParams: Promise<{
    week?: string;
    voertuig?: string;
    chauffeur?: string;
    status?: string;
    aanvrager?: string;
  }>;
}) {
  const [query, locale, session] = await Promise.all([searchParams, getLocale(), getSession()]);
  const { week } = query;
  // Dezelfde filters als de planning van het team, uit dezelfde queryparameters:
  // een gefilterde week blijft zo een deelbare link, en de terugknop werkt.
  const parsed = parseTransportFilters(query);
  const en = locale === 'en';
  const team = session ? canManage(session) : false;
  // Het praesidium, werkgroepen en jaarwerkingen krijgen de details ook, maar niet dezelfde: zie de projecties.
  const praesidium = session ? !team && canSeeTripDetails(session) : false;

  // **Een filter mag niet meer prijsgeven dan het rooster zelf.** De filterbalk
  // toont deze twee groepen enkel aan wie de namen en de aanvrager toch al
  // ziet, maar een keuzelijst is geen poort: `?chauffeur=<id>` in de adresbalk
  // zou anders een bezoeker zonder login laten uitvissen welke ritten één
  // bepaalde persoon rijdt, op een pagina die bewust geen namen toont.
  const filters = {
    ...parsed,
    driverIds: session ? parsed.driverIds : [],
    requesterTypes: team || praesidium ? parsed.requesterTypes : [],
  };

  const monday = startOfWeek((week && parseDateOnly(week)) || new Date());
  const nextMonday = new Date(monday.getTime() + 7 * DAY_MS);
  const days = Array.from({ length: 7 }, (_, index) =>
    new Date(monday.getTime() + index * DAY_MS).toISOString()
  );

  // Aparte projecties in plaats van één met een vlag: zo kan er geen veld uit
  // een hogere laag in een lagere belanden.
  const [
    teamBookings,
    postBookings,
    memberBookings,
    publicBookings,
    vehicles,
    driverColors,
    drivers,
  ] = await Promise.all([
    team ? transportRange(monday, nextMonday, filters) : Promise.resolve(null),
    praesidium
      ? transportWeekForPraesidium(monday, nextMonday, filters)
      : Promise.resolve(null),
    session && !team && !praesidium
      ? transportWeekForMembers(monday, nextMonday, filters)
      : Promise.resolve(null),
    session ? Promise.resolve(null) : transportWeekPublic(monday, nextMonday, filters),
    activeVehicles(),
    // Enkel zinvol voor wie de chauffeurs ook te zien krijgt; zonder login staat
    // er geen naam en dus ook geen kleur per persoon.
    session ? driverColorOverrides() : Promise.resolve({}),
    // De namen om op te filteren, om diezelfde reden enkel met login: zonder
    // login staat er geen chauffeur op het rooster, en dan hoort er ook geen
    // lijst met namen in een filterpaneel te staan.
    session ? driverOptions() : Promise.resolve([]),
  ]);

  const thisWeek = startOfWeek(new Date());
  // De filters blijven staan wanneer je van week naar week bladert: ze horen bij
  // waar je naar kijkt, niet bij wanneer. Zelfde regel als op /beheer/vervoer/week.
  const filterQuery = new URLSearchParams(filtersToQuery(filters)).toString();
  const weekHref = (monday: Date) =>
    `/vervoer/bezetting?week=${toDateInputValue(monday)}${filterQuery ? `&${filterQuery}` : ''}`;
  const previousHref = weekHref(new Date(monday.getTime() - 7 * DAY_MS));
  const nextHref = weekHref(nextMonday);
  const thisWeekHref = filterQuery ? `/vervoer/bezetting?${filterQuery}` : '/vervoer/bezetting';

  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));

  /**
   * Mogen de bijrijders van deze rit nog bijgewerkt worden, en door deze
   * persoon? (V2)
   *
   * Het team en wie `logistiek.helpers` heeft altijd (`canEditAllHelpers`); een
   * lid enkel bij een eigen rit of een rit van de eigen post of werkgroep. Dat
   * is precies de reden dat dit bestaat: wie meerijdt is vaak pas de dag
   * voordien bekend, en dan staat de aanvrager niet naast je. Na het rijden of
   * het afwijzen niet meer: dan is het geschiedenis, en de server weigert het
   * ook (`addTripHelperAction`).
   */
  const allHelpers = session ? canEditAllHelpers(session) : false;
  const viewer = session
    ? { userId: session.user.id, groupIds: session.groups.map((group) => group.id) }
    : null;
  const helpersEditable = (booking: {
    status: string;
    userId: string;
    requesterType: UitleenRequesterType;
    groupId: string | null;
    assignedGroupId: string | null;
  }) =>
    (booking.status === 'REQUESTED' || booking.status === 'APPROVED') &&
    (allHelpers || (viewer !== null && ownsTransportBooking(booking, viewer)));

  /** Dag plus tijdvenster, hier al tekst: dat formatteren hoort in Belgische tijd. */
  const whenLabel = (startAt: Date, endAt: Date) =>
    `${formatBrusselsDay(startAt)} · ${tripHoursLabel(startAt, endAt)}`;
  const legLabel = (leg: 'HEEN' | 'TERUG' | null) =>
    leg === 'HEEN' ? 'Heenrit' : leg === 'TERUG' ? 'Terugrit' : null;

  /**
   * Wat er in het kaartje staat wanneer iemand een rit aanklikt.
   *
   * Twee niveaus, elk uit zijn eigen query: het team ziet ook de nummers, het
   * ophaaladres en de nota's, een post ziet de rit zelf. De velden die een post
   * niet hoort te zien, staan hier hard op `null` en worden niet eens opgehaald,
   * zodat er niets meereist naar de browser wat het scherm toch niet toont.
   */
  const trips: BezettingTrip[] | undefined = teamBookings?.map((booking) => ({
    id: booking.id,
    title: booking.eventName?.trim() || booking.purpose,
    requester: requesterLabel(booking),
    userName: booking.user.name,
    status: booking.status,
    vehicleName: booking.vehicle.nameNl,
    whenLabel: whenLabel(booking.startAt, booking.endAt),
    legLabel: legLabel(booking.tripLeg),
    purpose: booking.purpose,
    driverName: booking.driver?.name ?? null,
    needsDriver: vehicleById.get(booking.vehicleId)?.needsDriver ?? true,
    cargoNote: booking.cargoNote,
    pickupAddress: booking.pickupAddress,
    destination: booking.destination,
    helpers: booking.helpers,
    helpersNote: booking.helpersNote,
    helpersPhone: booking.helpersPhone,
    canEditHelpers: booking.status === 'REQUESTED' || booking.status === 'APPROVED',
    contactPhone: booking.contactPhone,
    memberNote: booking.memberNote,
    adminNote: booking.adminNote,
    reservationId: booking.reservationId,
  })) ??
  postBookings?.map((booking) => {
    // `postBookings` bestaat enkel met een sessie, dus `viewer` staat er.
    const own = viewer !== null && ownsTransportBooking(booking, viewer);
    return {
      id: booking.id,
      title: booking.eventName?.trim() || booking.purpose,
      requester: requesterLabel(booking),
      userName: booking.user.name,
      status: booking.status,
      vehicleName: vehicleById.get(booking.vehicleId)?.nameNl ?? '',
      whenLabel: whenLabel(booking.startAt, booking.endAt),
      legLabel: legLabel(booking.tripLeg),
      purpose: booking.purpose,
      driverName: booking.driver?.name ?? null,
      needsDriver: vehicleById.get(booking.vehicleId)?.needsDriver ?? true,
      cargoNote: booking.cargoNote,
      destination: booking.destination,
      // Het nummer van een bijrijder hoort bij de post die de rit aanvroeg en
      // niet bij de hele kring: bij de rit van iemand anders blijft de naam
      // staan en valt het nummer weg. Wie de bijrijders van elke rit regelt
      // (`logistiek.helpers`), houdt het nummer: die belt ze.
      helpers:
        own || allHelpers
          ? booking.helpers
          : booking.helpers.map((helper) => ({ ...helper, phone: null })),
      helpersNote: booking.helpersNote,
      canEditHelpers: helpersEditable(booking),
      // Van het team: een nummer en een kotadres zijn van een persoon, de nota's
      // zijn het werkblad van Logistiek.
      pickupAddress: null,
      helpersPhone: null,
      contactPhone: null,
      memberNote: null,
      adminNote: null,
      reservationId: null,
    };
  });

  const blocks: TripBlock[] =
    teamBookings?.map((booking) => ({
      id: booking.id,
      vehicleId: booking.vehicleId,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      status: booking.status,
      title: booking.eventName?.trim() || booking.purpose,
      // De post staat niet standaard in het blok (een kwartierrit is 24 pixels
      // hoog), maar wel in de tooltip en in het voorleesbare label; het kaartje
      // zegt de rest.
      subtitle: requesterLabel(booking),
      driver:
        booking.driver && booking.driverId
          ? { id: booking.driverId, name: booking.driver.name }
          : null,
      // Reizen mee zodat "Weergave" ze in het blok kan zetten. Enkel in de twee
      // lagen die ze toch al mogen zien (het team en een post); een lid zonder
      // groep en een bezoeker zonder login krijgen ze niet, en daar staan die
      // twee vinkjes dan ook niet.
      destination: booking.destination,
      cargoNote: booking.cargoNote,
      conflict: false,
    })) ??
    postBookings?.map((booking) => ({
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
      destination: booking.destination,
      cargoNote: booking.cargoNote,
      conflict: false,
    })) ??
    memberBookings?.map((booking) => ({
      id: booking.id,
      vehicleId: booking.vehicleId,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      status: booking.status,
      title: booking.eventName?.trim() || booking.purpose,
      subtitle: null,
      driver:
        booking.driver && booking.driverId
          ? { id: booking.driverId, name: booking.driver.name }
          : null,
      conflict: false,
    })) ??
    (publicBookings ?? []).map((booking) => ({
      id: booking.id,
      vehicleId: booking.vehicleId,
      startAt: booking.startAt.toISOString(),
      endAt: booking.endAt.toISOString(),
      status: booking.status,
      title:
        booking.status === 'REQUESTED' ? (en ? 'requested' : 'aangevraagd') : en ? 'booked' : 'bezet',
      subtitle: null,
      driver: null,
      conflict: false,
    }));

  return (
    <PageShell
      title={en ? 'When is a vehicle free?' : 'Wanneer is een voertuig vrij?'}
      intro={
        team || praesidium
          ? en
            ? 'The same planning Logistics works from, without the decision buttons. Click a trip to see the post, the reason, the driver and the rest.'
            : 'Dezelfde planning als waar Logistiek mee werkt, zonder de beslisknoppen. Klik een rit aan voor de post, de reden, de chauffeur en de rest.'
          : session
            ? en
              ? 'The same planning Logistics works from, without the decision buttons.'
              : 'Dezelfde planning als waar Logistiek mee werkt, zonder de beslisknoppen.'
            : en
              ? 'Vehicle, day and time only. Log in to request a trip; who is driving and what for is not shown here.'
              : 'Enkel voertuig, dag en uur. Log in om een rit aan te vragen; wie rijdt en waarvoor staat hier niet bij.'
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-vtk-ink">
            {en ? 'Week' : 'Week'} {isoWeekNumber(monday)}
          </h2>
          <p className="text-sm text-vtk-muted">
            {formatDateRange(monday, new Date(nextMonday.getTime() - DAY_MS), locale)}
          </p>
        </div>
        <nav
          className="flex flex-wrap items-center gap-2 text-sm"
          aria-label={en ? 'Pick a week' : 'Week kiezen'}
        >
          <Link
            href={previousHref}
            className="rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40"
          >
            ← {en ? 'Previous' : 'Vorige'}
          </Link>
          <Link
            href={thisWeekHref}
            aria-current={monday.getTime() === thisWeek.getTime() ? 'true' : undefined}
            className={
              monday.getTime() === thisWeek.getTime()
                ? 'rounded-full border border-vtk-navy bg-vtk-navy px-3 py-1.5 font-semibold text-vtk-on-emphasis'
                : 'rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40'
            }
          >
            {en ? 'This week' : 'Deze week'}
          </Link>
          <Link
            href={nextHref}
            className="rounded-full border border-vtk-navy/15 px-3 py-1.5 font-medium text-vtk-ink transition hover:border-vtk-navy/40"
          >
            {en ? 'Next' : 'Volgende'} →
          </Link>
          <Link
            href="/vervoer"
            className="ml-2 font-semibold text-vtk-navy underline decoration-vtk-yellow underline-offset-4"
          >
            {en ? 'Request a trip' : 'Rit aanvragen'}
          </Link>
        </nav>
      </div>

      {vehicles.length === 0 ? (
        <p className="mt-5 text-sm text-vtk-muted">
          {en ? 'No vehicles yet.' : 'Er staan nog geen voertuigen klaar.'}
        </p>
      ) : (
        <div className="mt-5 grid gap-5">
          <PublicWeek
            days={days}
            vehicles={vehicles.map((vehicle) => ({
              id: vehicle.id,
              name: en ? vehicle.nameEn : vehicle.nameNl,
              code: vehicle.code,
              pattern: vehicle.pattern,
              needsDriver: vehicle.needsDriver,
            }))}
            blocks={blocks}
            emptyLabel={en ? 'Nothing booked this week.' : 'Niets geboekt deze week.'}
            showDriver={Boolean(session)}
            driverColors={driverColors}
            trips={trips}
            locale={locale}
            manage={team}
            anchor={monday.toISOString()}
            filters={filters}
            filterVehicles={vehicles.map((vehicle) => ({
              id: vehicle.id,
              name: en ? vehicle.nameEn : vehicle.nameNl,
            }))}
            filterDrivers={drivers.map((driver) => ({ id: driver.id, name: driver.name }))}
            canFilterRequester={team || praesidium}
            nav={{ previousHref, nextHref, todayHref: thisWeekHref }}
          />

          <p className="text-xs text-vtk-muted">
            {session
              ? en
                ? 'The fill colour is the driver, the hatching is the vehicle; a trip without a driver is yellow with a red dashed border. Diagonal stripes mean requested but not decided yet, so that slot may still become free.'
                : 'De vulkleur is de chauffeur, de arcering is het voertuig; een rit zonder chauffeur is geel met een rode streepjesrand. Schuine strepen betekenen aangevraagd maar nog niet beslist, dus dat moment kan nog vrijkomen.'
              : en
                ? 'The hatching tells the vehicles apart. Striped means requested but not yet decided; the vehicle may still become free.'
                : 'De arcering onderscheidt de voertuigen. Gestreept is aangevraagd maar nog niet beslist; dat moment kan dus nog vrijkomen.'}
          </p>
        </div>
      )}
    </PageShell>
  );
}
