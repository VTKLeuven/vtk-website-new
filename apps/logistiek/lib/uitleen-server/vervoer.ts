import 'server-only';
import { prisma } from '@vtk/db';
import type {
  Prisma,
  UitleenTransportBookingStatus,
  UitleenTransportNoteVisibility,
} from '@prisma/client';
import { teamChangeLines } from '@/lib/uitleen';
import { NO_DRIVER, type TransportFilters } from '@/lib/transport-filters';
import { auditLogInclude, workingYearBounds, yearsBetween } from './shared';

/** Zoals `myReservations`: eigen ritten plus die van je posten. */
export async function myVanBookings(userId: string, groupIds: string[] = []) {
  return prisma.uitleenTransportBooking.findMany({
    where:
      groupIds.length > 0
        ? { OR: [{ userId }, { requesterType: 'INTERN', groupId: { in: groupIds } }] }
        : { userId },
    orderBy: { createdAt: 'desc' },
    include: {
      vehicle: { select: { nameNl: true, nameEn: true } },
      user: { select: { id: true, name: true } },
      payments: { where: { status: 'SUCCEEDED' }, select: { id: true, status: true } },
      // Voor R1: het evenement waar de rit bij hoort, zodat "Mijn aanvragen"
      // dezelfde koppeling toont als het materiaalgedeelte.
      event: { select: { id: true, name: true } },
    },
  });
}

/** Actieve voertuigen, voor de aanvraagkeuze door leden. */
export async function activeVehicles() {
  return prisma.uitleenVehicle.findMany({
    where: { active: true },
    orderBy: { sortIndex: 'asc' },
  });
}

/**
 * De voertuigen die een lid zelf mag aanvragen (F6.21): actief, en niet door het
 * team voorbehouden. Het team kiest in de planning uit `activeVehicles`.
 */
export async function requestableVehicles() {
  return prisma.uitleenVehicle.findMany({
    where: { active: true, requestableByMembers: true },
    orderBy: { sortIndex: 'asc' },
  });
}

export async function adminVehicles() {
  return prisma.uitleenVehicle.findMany({ orderBy: [{ active: 'desc' }, { sortIndex: 'asc' }] });
}

/**
 * Alle voertuigen in hun eigen volgorde, actief of niet.
 *
 * Voor een kalender, die ook een rit moet kunnen tekenen op een voertuig dat
 * intussen op non-actief staat; `vehiclesToDraw` snoeit de lijst daarna terug
 * tot de actieve plus wie in dit venster effectief gereden heeft. Niet
 * `adminVehicles`, want die zet de gedeactiveerde achteraan en de legende hoort
 * de eigen volgorde van het team te houden.
 */
export async function calendarVehicles() {
  return prisma.uitleenVehicle.findMany({ orderBy: { sortIndex: 'asc' } });
}

/**
 * Zoals `reservationForMember`: eigen rit, of een interne rit van je post.
 *
 * Plus een derde tak: een rit die Logistiek **aan** jouw post doorgaf
 * (`assignedGroupId`, F4.8a). Die post moet er zelf een chauffeur en bijrijders
 * op zetten, dus ze moet er ook aan kunnen; zonder deze tak kon dat enkel bij
 * een rit die je eigen post ook aangevraagd had, terwijl ze wel in haar lijst
 * staat. Geen voorwaarde op `requesterType`: het doorgeven is een uitdrukkelijke
 * daad van Logistiek, en die staat los van wie de rit vroeg.
 */
export async function vanBookingForMember(id: string, userId: string, groupIds: string[]) {
  return prisma.uitleenTransportBooking.findFirst({
    where: {
      id,
      OR: [
        { userId },
        ...(groupIds.length > 0
          ? [
              { requesterType: 'INTERN' as const, groupId: { in: groupIds } },
              { assignedGroupId: { in: groupIds } },
            ]
          : []),
      ],
    },
    include: {
      payments: { orderBy: { createdAt: 'desc' } },
      driver: { select: { name: true } },
      vehicle: { select: { nameNl: true, nameEn: true } },
      user: { select: { id: true, name: true } },
      assignedGroup: { select: { id: true, nameNl: true, nameEn: true } },
      helpers: { orderBy: { createdAt: 'asc' }, select: { id: true, name: true, phone: true } },
    },
  });
}

/**
 * Waar een rit in haar reeks staat (F6.22): rit x van y, en hoeveel er vanaf hier
 * nog verwijderd kunnen worden.
 *
 * Eén query voor alle reeksen op een scherm. `removable` telt wat
 * `deleteTripSeriesFromAction` effectief weghaalt: niet gereden en zonder
 * betaling, zodat de bevestiging geen getal belooft dat de actie niet haalt.
 */
export type SeriesPosition = { index: number; total: number; removableFromHere: number };

export async function seriesPositions(
  trips: ReadonlyArray<{ id: string; seriesId: string | null; startAt: Date }>
): Promise<Map<string, SeriesPosition>> {
  const result = new Map<string, SeriesPosition>();
  const seriesIds = [...new Set(trips.map((trip) => trip.seriesId).filter((id): id is string => Boolean(id)))];
  if (seriesIds.length === 0) return result;

  const rows = await prisma.uitleenTransportBooking.findMany({
    where: { seriesId: { in: seriesIds } },
    orderBy: { startAt: 'asc' },
    select: { id: true, seriesId: true, startAt: true, status: true, _count: { select: { payments: true } } },
  });
  const bySeries = new Map<string, typeof rows>();
  for (const row of rows) {
    if (!row.seriesId) continue;
    bySeries.set(row.seriesId, [...(bySeries.get(row.seriesId) ?? []), row]);
  }
  for (const trip of trips) {
    if (!trip.seriesId) continue;
    const members = bySeries.get(trip.seriesId) ?? [];
    result.set(trip.id, {
      index: members.findIndex((member) => member.id === trip.id) + 1,
      total: members.length,
      removableFromHere: members.filter(
        (member) =>
          member.startAt >= trip.startAt && member.status !== 'COMPLETED' && member._count.payments === 0
      ).length,
    });
  }
  return result;
}

/**
 * De "Extra info van Logistiek" van enkel deze ritten (F6.16).
 *
 * Apart van `transportWeekForPraesidium`, dat de nota's bewust niet ophaalt: wie
 * dat doet, haalt ze voor élke rit van de week op en vertrouwt erop dat het
 * scherm de verkeerde weglaat. Hier vraagt de oproeper enkel de ritten van de
 * eigen post, dus er komt nooit een nota mee van een rit die niet van hem is.
 */
export async function adminNotesForTrips(bookingIds: string[]): Promise<Map<string, string>> {
  const notes = new Map<string, string>();
  if (bookingIds.length === 0) return notes;
  const rows = await prisma.uitleenTransportBooking.findMany({
    where: { id: { in: bookingIds }, adminNote: { not: null } },
    select: { id: true, adminNote: true },
  });
  for (const row of rows) if (row.adminNote) notes.set(row.id, row.adminNote);
  return notes;
}

/**
 * Wat het team aan deze ritten veranderde (F6.11), per rit, als leesbare regels.
 *
 * Eén query voor alle ritten van een scherm. De aanvrager hoort er per rit bij
 * (`userId`): wat hij zelf wijzigde, telt niet mee. Zie `teamChangeLines`.
 */
export async function teamEditsForTransport(
  bookings: ReadonlyArray<{ id: string; userId: string }>
): Promise<Map<string, string[]>> {
  const result = new Map<string, string[]>();
  if (bookings.length === 0) return result;

  const logs = await prisma.uitleenAuditLog.findMany({
    where: { transportBookingId: { in: bookings.map((booking) => booking.id) }, kind: 'EDITED' },
    orderBy: { createdAt: 'asc' },
    select: { transportBookingId: true, kind: true, note: true, actorId: true },
  });
  const perBooking = new Map<string, typeof logs>();
  for (const log of logs) {
    if (!log.transportBookingId) continue;
    const list = perBooking.get(log.transportBookingId) ?? [];
    list.push(log);
    perBooking.set(log.transportBookingId, list);
  }
  for (const booking of bookings) {
    const lines = teamChangeLines(perBooking.get(booking.id) ?? [], booking.userId);
    if (lines.length > 0) result.set(booking.id, lines);
  }
  return result;
}

export type UitleenAuditEntry = {
  id: string;
  kind: string;
  fromStatus: string | null;
  toStatus: string | null;
  note: string | null;
  createdAt: Date;
  actor: { name: string } | null;
};

/**
 * Historiek van meerdere ritten in één query, gegroepeerd per rit. De
 * vervoerlijst rendert de details van elke rij (ingeklapt), dus een query per
 * rit zou er tweehonderd zijn.
 */
export async function transportAuditLogsByBooking(
  bookingIds: string[]
): Promise<Map<string, UitleenAuditEntry[]>> {
  const byBooking = new Map<string, UitleenAuditEntry[]>();
  if (bookingIds.length === 0) return byBooking;

  const logs = await prisma.uitleenAuditLog.findMany({
    where: { transportBookingId: { in: bookingIds } },
    ...auditLogInclude,
  });
  for (const log of logs) {
    if (!log.transportBookingId) continue;
    const list = byBooking.get(log.transportBookingId) ?? [];
    list.push(log);
    byBooking.set(log.transportBookingId, list);
  }
  return byBooking;
}

const ADMIN_TRANSPORT_INCLUDE = {
      user: { select: { id: true, name: true, email: true } },
      driver: { select: { id: true, name: true } },
      // `needsDriver`: bij de bakfiets hoort geen chauffeur, dus die rit mag ook
      // niet als onafgewerkt aangeduid staan (T13).
      vehicle: { select: { nameNl: true, nameEn: true, needsDriver: true } },
      group: { select: { nameNl: true, nameEn: true } },
      event: { select: { id: true, name: true } },
      payments: { orderBy: { createdAt: 'desc' } },
      // De materiaalaanvraag waarvan dit de levering is, zodat de chauffeur ziet
      // wat er mee moet en het team van hieruit naar die aanvraag kan.
      reservation: { select: { id: true, eventName: true } },
      helpers: { orderBy: { createdAt: 'asc' as const }, select: { id: true, name: true, phone: true } },
} satisfies Prisma.UitleenTransportBookingInclude;

/** Een rit met alles wat het paneel in het beheer toont (`adminTransportDetail`). */
export type AdminTransportBooking = Prisma.UitleenTransportBookingGetPayload<{
  include: typeof ADMIN_TRANSPORT_INCLUDE;
}>;

// ---------------------------------------------------------------------------
// De ritlijst in het beheer (P1, L2 uit de audit van november 2026)
// ---------------------------------------------------------------------------

/**
 * Wat er van een rit in de lijst staat, en niets meer.
 *
 * De lijst laadde vroeger elke rit met alle relaties én renderde per rit het
 * volledige beslis- en beheerpaneel, met de keuzelijsten van chauffeurs, posten
 * en evenementen erin: zo'n 31 kB per rit. Het paneel staat nu enkel voor de
 * gekozen rit open (`adminTransportDetail`); de lijst heeft genoeg aan dit.
 */
const ADMIN_TRIP_ROW_SELECT = {
  id: true,
  userId: true,
  startAt: true,
  endAt: true,
  status: true,
  tripLeg: true,
  tripGroupId: true,
  vehicleId: true,
  driverId: true,
  decidedAt: true,
  purpose: true,
  eventName: true,
  requesterType: true,
  requesterName: true,
  priceCents: true,
  paidOfflineAt: true,
  user: { select: { name: true } },
  driver: { select: { name: true } },
  vehicle: { select: { nameNl: true, needsDriver: true } },
  group: { select: { nameNl: true } },
  reservation: { select: { id: true } },
  payments: { select: { status: true } },
} satisfies Prisma.UitleenTransportBookingSelect;

export type AdminTripRow = Prisma.UitleenTransportBookingGetPayload<{ select: typeof ADMIN_TRIP_ROW_SELECT }>;

/**
 * Open werk: wat nog beslist, gereden of betaald moet worden.
 *
 * Zonder bovengrens. De lijst haalde de laatste 200 ritten op, aflopend op
 * startdatum, en zodra er meer waren vielen precies de oudste weg: ook een rit
 * die nog afgerond of betaald moest worden. Open werk is per definitie klein
 * genoeg om altijd helemaal te tonen; de rest staat in het archief.
 */
export const OPEN_TRANSPORT_WHERE: Prisma.UitleenTransportBookingWhereInput = {
  OR: [
    { status: { in: ['REQUESTED', 'APPROVED'] } },
    // Gereden maar nog niet betaald: enkel externen betalen (`chargesRequester`).
    {
      status: 'COMPLETED',
      requesterType: 'EXTERN',
      priceCents: { gt: 0 },
      paidOfflineAt: null,
      payments: { none: { status: 'SUCCEEDED' } },
    },
  ],
};

export async function adminTransportOpen(): Promise<AdminTripRow[]> {
  return prisma.uitleenTransportBooking.findMany({
    where: OPEN_TRANSPORT_WHERE,
    orderBy: [{ startAt: 'asc' }],
    select: ADMIN_TRIP_ROW_SELECT,
  });
}

export const TRIP_ARCHIVE_PAGE_SIZE = 50;

/**
 * Het archief: al de rest, per werkingsjaar, met pagina's.
 *
 * Per werkingsjaar omdat het team zo terugzoekt ("die rit van vorig jaar
 * voor de revue"), en omdat een jaar met pagina's begrensd is waar "de
 * laatste 200" dat niet was. Nieuwste eerst.
 */
export async function adminTransportArchive(
  year: number,
  page: number
): Promise<{ rows: AdminTripRow[]; total: number; page: number; pageCount: number }> {
  const { from, to } = workingYearBounds(year);
  const where: Prisma.UitleenTransportBookingWhereInput = {
    startAt: { gte: from, lt: to },
    NOT: OPEN_TRANSPORT_WHERE,
  };
  const total = await prisma.uitleenTransportBooking.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / TRIP_ARCHIVE_PAGE_SIZE));
  const current = Math.min(Math.max(1, page), pageCount);
  const rows = await prisma.uitleenTransportBooking.findMany({
    where,
    orderBy: [{ startAt: 'desc' }],
    select: ADMIN_TRIP_ROW_SELECT,
    skip: (current - 1) * TRIP_ARCHIVE_PAGE_SIZE,
    take: TRIP_ARCHIVE_PAGE_SIZE,
  });
  return { rows, total, page: current, pageCount };
}

/** De werkingsjaren met ritten, nieuwste eerst, voor de keuze van het archief. */
export async function adminTransportYears(): Promise<number[]> {
  const [first, last] = await Promise.all([
    prisma.uitleenTransportBooking.findFirst({ orderBy: { startAt: 'asc' }, select: { startAt: true } }),
    prisma.uitleenTransportBooking.findFirst({ orderBy: { startAt: 'desc' }, select: { startAt: true } }),
  ]);
  return yearsBetween(first?.startAt, last?.startAt);
}

/**
 * Eén rit met alles wat het paneel nodig heeft, plus de andere helft van een
 * heen-en-terugaanvraag. `null` wanneer de rit niet bestaat.
 */
export async function adminTransportDetail(id: string) {
  const booking = await prisma.uitleenTransportBooking.findUnique({
    where: { id },
    select: { tripGroupId: true },
  });
  if (!booking) return null;
  const legs = await prisma.uitleenTransportBooking.findMany({
    where: booking.tripGroupId ? { tripGroupId: booking.tripGroupId } : { id },
    orderBy: [{ startAt: 'asc' }],
    include: ADMIN_TRANSPORT_INCLUDE,
  });
  return legs.length > 0 ? legs : null;
}

/**
 * Wat er die dag al vaststaat met datzelfde voertuig, zodat je bij het
 * beslissen meteen ziet waar plaats is. Enkel goedgekeurde ritten: een andere
 * aanvraag is nog geen bezetting.
 */
export async function approvedSameDay(vehicleId: string, day: Date, exceptIds: string[]) {
  const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' }).format(day);
  // Ruim genoeg om elke rit van die Brusselse dag te vangen; daarna precies filteren.
  const from = new Date(day.getTime() - 36 * 60 * 60 * 1000);
  const to = new Date(day.getTime() + 36 * 60 * 60 * 1000);
  const rows = await prisma.uitleenTransportBooking.findMany({
    where: { vehicleId, status: 'APPROVED', startAt: { gte: from, lt: to }, id: { notIn: exceptIds } },
    orderBy: [{ startAt: 'asc' }],
    select: { id: true, startAt: true, endAt: true, purpose: true },
  });
  const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels' });
  return rows.filter((row) => key.format(row.startAt) === dayKey);
}

/**
 * Statussen die op een bezettingsoverzicht horen: wat het voertuig bezet houdt.
 * Afgewezen en geannuleerd vallen weg, want die ritten gaan niet door.
 */
const OCCUPYING_STATUSES: UitleenTransportBookingStatus[] = ['REQUESTED', 'APPROVED'];

/**
 * Wat de transportplanning toont: hetzelfde, plus de afgeronde ritten.
 *
 * Die laatste horen erbij omdat de planning ook naar gisteren kijkt ("wie heeft
 * die rit gedaan?"), en omdat de kalender ze al lichter tekende terwijl de query
 * ze nooit meebracht: de legende beloofde "doorzichtig = afgerond" en er stond
 * nooit iets doorzichtigs. Op het publieke overzicht blijven ze weg: daar is de
 * vraag "wanneer is de kar vrij", en een gereden rit maakt niets bezet.
 */
const PLANNING_STATUSES: UitleenTransportBookingStatus[] = [...OCCUPYING_STATUSES, 'COMPLETED'];

/**
 * De filters van de planning als `where` (P3).
 *
 * De chauffeursfilter kan "nog geen chauffeur" bevatten; die en de gekozen
 * personen samen zijn een OF en geen EN, want "de ritten van Arthur plus wat nog
 * niemand heeft" is precies de vraag waarmee je een weekend indeelt.
 */
function transportFilterWhere(
  filters: TransportFilters | undefined
): Prisma.UitleenTransportBookingWhereInput {
  if (!filters) return {};
  const named = filters.driverIds.filter((id) => id !== NO_DRIVER);
  const wantsNone = filters.driverIds.includes(NO_DRIVER);
  // Twee filters die elk een OF zijn, en die moeten als EN naast elkaar staan:
  // "van Acti én zonder chauffeur". Ze allebei als `OR` in hetzelfde object
  // zetten kan niet (één sleutel per object), en dan wint stil de laatste.
  const anyOf: Prisma.UitleenTransportBookingWhereInput[] = [];
  if (filters.driverIds.length > 0) {
    anyOf.push({
      OR: [
        ...(named.length > 0 ? [{ driverId: { in: named } }] : []),
        ...(wantsNone ? [{ driverId: null }] : []),
      ],
    });
  }
  // De post die de rit vroeg én de post die hem rijdt (F4.1). Zie `groupIds` in
  // lib/transport-filters.ts voor waarom het allebei is.
  if (filters.groupIds.length > 0) {
    anyOf.push({
      OR: [
        { groupId: { in: filters.groupIds } },
        { assignedGroupId: { in: filters.groupIds } },
      ],
    });
  }
  return {
    ...(filters.vehicleIds.length > 0 ? { vehicleId: { in: filters.vehicleIds } } : {}),
    ...(filters.requesterTypes.length > 0 ? { requesterType: { in: filters.requesterTypes } } : {}),
    ...(anyOf.length > 0 ? { AND: anyOf } : {}),
  };
}

/**
 * Welke statussen deze laag mag tonen, met de statusfilter erop toegepast.
 *
 * De doorsnede en niet de filter zelf: een filter mag beperken wat je ziet,
 * nooit uitbreiden. Het publieke overzicht toont enkel wat een voertuig bezet
 * houdt, en `?status=COMPLETED` in de adresbalk hoort daar geen afgeronde ritten
 * te laten verschijnen die er zonder die parameter niet staan.
 */
function allowedStatuses(
  allowed: UitleenTransportBookingStatus[],
  filters: TransportFilters | undefined
): UitleenTransportBookingStatus[] {
  if (!filters || filters.statuses.length === 0) return allowed;
  const wanted = allowed.filter((status) => (filters.statuses as string[]).includes(status));
  // Filtert iemand alles weg, dan toont de kalender niets; terugvallen op
  // "alles" zou de filter stil negeren.
  return wanted;
}

/**
 * Ritten die een venster raken, voor het weekoverzicht. Een rit telt mee zodra
 * ze het venster overlapt en niet enkel wanneer ze erin start: een rit van
 * vrijdag tot maandag hoort in beide weken te staan.
 *
 * `REQUESTED` komt mee, want het weekraster dient net om te zien waar een
 * nieuwe aanvraag nog past; het beheer toont ze in een lichtere stijl.
 */
const transportWindowWhere = (
  from: Date,
  to: Date,
  statuses: UitleenTransportBookingStatus[] = OCCUPYING_STATUSES
): Prisma.UitleenTransportBookingWhereInput => ({
  status: { in: statuses },
  startAt: { lt: to },
  endAt: { gt: from },
});

/**
 * De ritten van één week voor de transportplanning (T7).
 *
 * Meer velden dan het oude raster nodig had: sinds er vanuit dit scherm beslist
 * en aangepast wordt, moet het venster dezelfde gegevens hebben als de lijst.
 */
export async function transportRange(from: Date, to: Date, filters?: TransportFilters) {
  return prisma.uitleenTransportBooking.findMany({
    where: {
      ...transportWindowWhere(
        from,
        to,
        // Een statusfilter vervangt de standaardlijst, maar mag er niets aan
        // toevoegen: afgewezen en geannuleerde ritten horen niet op een planning,
        // en die uitzondering hoort niet via de URL te openen.
        filters && filters.statuses.length > 0 ? filters.statuses : PLANNING_STATUSES
      ),
      ...transportFilterWhere(filters),
    },
    select: {
      id: true,
      // De aanvrager, als id naast `user.name`: de nota's van een rit hangen af
      // van wie er bij die rit hoort (`onTripForNotes`), en een naam is daar
      // geen sleutel voor.
      userId: true,
      vehicleId: true,
      tripGroupId: true,
      tripLeg: true,
      startAt: true,
      endAt: true,
      status: true,
      purpose: true,
      cargoNote: true,
      eventId: true,
      eventName: true,
      // De naam zoals ze nu is, voor de rij "Evenement" in het paneel; `eventName`
      // is de momentopname die blijft staan als het evenement verdwijnt.
      event: { select: { id: true, name: true } },
      reservationId: true,
      requesterType: true,
      requesterName: true,
      contactPhone: true,
      pickupAddress: true,
      destination: true,
      helpersNote: true,
      helpersPhone: true,
      helpers: { orderBy: { createdAt: 'asc' as const }, select: { id: true, name: true, phone: true } },
      memberNote: true,
      adminNote: true,
      notifyEmail: true,
      pricingMode: true,
      priceCents: true,
      paidOfflineAt: true,
      driverId: true,
      // De reeks waartoe de rit hoort (F6.22); `null` voor een losse rit.
      seriesId: true,
      // Twee velden voor de verwijderknop (R1): of er al geld aan hangt (dan
      // mag de rit niet weg), en of het team ze zelf tekende (dan hoeft de
      // bevestiging niet te waarschuwen voor een aanvrager zonder bericht). De
      // betalingen als (lege) lijst en niet als teller, zodat
      // `canDeleteTransport` dezelfde vorm krijgt als op /beheer/vervoer, waar
      // de rijen ze toch al dragen.
      plannedByTeam: true,
      payments: { select: { id: true } },
      // De post die de rit aanvroeg, en de post die ze zelf mag invullen (zie
      // `assignTripGroupAction`). Allebei, want allebei maken ze een rit "van
      // jouw post" (F4.1, F4.15).
      groupId: true,
      assignedGroupId: true,
      assignedGroup: { select: { nameNl: true } },
      vehicle: { select: { nameNl: true } },
      user: { select: { name: true } },
      driver: { select: { name: true } },
      group: { select: { nameNl: true } },
    },
    orderBy: { startAt: 'asc' },
  });
}

export type TransportBooking = Awaited<ReturnType<typeof transportRange>>[number];

/**
 * Zelfde venster, maar enkel wanneer welk voertuig bezet is: geen namen, doelen,
 * adressen of chauffeurs. Bewust een eigen `select` en geen filter over
 * `transportRange`: een projectie achteraf laat vroeg of laat een veld door
 * wanneer iemand hierboven een relatie toevoegt. Voor het publieke overzicht
 * (zie docs/logistiek-feedback-plan.md, V13).
 */
export async function transportWeekPublic(from: Date, to: Date, filters?: TransportFilters) {
  return prisma.uitleenTransportBooking.findMany({
    where: {
      ...transportWindowWhere(from, to, allowedStatuses(OCCUPYING_STATUSES, filters)),
      ...transportFilterWhere(filters),
    },
    select: {
      id: true,
      vehicleId: true,
      startAt: true,
      endAt: true,
      status: true,
    },
    orderBy: { startAt: 'asc' },
  });
}

/**
 * Het weekvenster voor een praesidiumlid: wat een post over een rit hoort te
 * kunnen zien zonder bij Logistiek te moeten gaan vragen.
 *
 * Bovenop de ledenversie hieronder: welke post de rit aanvroeg en wie ze
 * indiende, waarvoor ze dient, wat er mee moet en waar ze naartoe gaat. Dat is
 * werking van de kring, en een post die zijn eigen weekend plant, heeft er meer
 * aan dan aan een blok met enkel een uur.
 *
 * Wat hier bewust **niet** in zit, en wel in `transportRange` (het team):
 * telefoonnummers, het ophaaladres, de nota van het lid en de nota van het
 * team. Een nummer en een kotadres zijn van een persoon en niet van de kring,
 * en de nota's zijn het werkblad van Logistiek. Opnieuw een eigen `select` en
 * geen filter over de beheerquery: een projectie achteraf laat vroeg of laat
 * een veld door wanneer iemand daar een relatie toevoegt.
 *
 * De statussen zijn die van de planning (`PLANNING_STATUSES`) en niet "alles
 * behalve geannuleerd": een afgewezen rit gaat niet door en hoort dus niet als
 * bezetting op deze kalender.
 */
export async function transportWeekForPraesidium(
  from: Date,
  to: Date,
  filters?: TransportFilters
) {
  return prisma.uitleenTransportBooking.findMany({
    where: {
      ...transportWindowWhere(from, to, allowedStatuses(PLANNING_STATUSES, filters)),
      ...transportFilterWhere(filters),
    },
    select: {
      id: true,
      vehicleId: true,
      tripLeg: true,
      startAt: true,
      endAt: true,
      status: true,
      purpose: true,
      cargoNote: true,
      eventName: true,
      destination: true,
      requesterType: true,
      requesterName: true,
      // Wie de rit aanvroeg en namens welke post: daarmee weet de pagina of dit
      // een rit van de kijker zelf is, en dus of hij de bijrijders mag bijwerken
      // (`ownsTransportBooking`). Het nummer van een bijrijder reist enkel mee
      // bij zo'n eigen rit; zie de pagina.
      userId: true,
      groupId: true,
      // Ook de post waaraan de rit doorgegeven is: die mag de bijrijders
      // bijwerken zonder de rit zelf aangevraagd te hebben (F4.8a).
      assignedGroupId: true,
      helpersNote: true,
      driverId: true,
      driver: { select: { name: true } },
      user: { select: { name: true } },
      group: { select: { nameNl: true } },
      helpers: {
        orderBy: { createdAt: 'asc' as const },
        select: { id: true, name: true, phone: true, addedById: true },
      },
    },
    orderBy: { startAt: 'asc' },
  });
}

/**
 * Het weekvenster voor een ingelogd lid (T8): dezelfde planning als het team
 * ziet, met het evenement en de chauffeur erbij, maar zonder adressen,
 * telefoonnummers en bedragen.
 *
 * Waarom een aparte projectie naast de publieke en de beheerversie: wie zonder
 * login kijkt, hoort de werking van de kring niet te zien (zie
 * `transportWeekPublic`), terwijl een lid net wél moet kunnen zien wie welk
 * ritje doet. Die twee in één query met een vlag zou betekenen dat één vergeten
 * `if` de namen aan de straatkant zet.
 *
 * Dit is de laag voor een lid **zonder** groep: gewone studenten. Het
 * praesidium, werkgroepen en jaarwerkingen krijgen `transportWeekForPraesidium`,
 * met dezelfde statussen en meer velden.
 *
 * De statussen komen van `transportWindowWhere` en worden hier niet meer
 * overschreven. Er stond `status: { not: 'CANCELLED' }` achter de spread, en dat
 * is één object: die sleutel won van de `status: { in: [...] }` ernaast, dus een
 * **afgewezen** rit werd als blok getekend. De pagina zei dan "bezet" terwijl de
 * kar vrij was, precies het omgekeerde van waarvoor ze bestaat.
 */
export async function transportWeekForMembers(
  from: Date,
  to: Date,
  filters?: TransportFilters
) {
  return prisma.uitleenTransportBooking.findMany({
    where: {
      ...transportWindowWhere(from, to, allowedStatuses(PLANNING_STATUSES, filters)),
      ...transportFilterWhere(filters),
    },
    select: {
      id: true,
      vehicleId: true,
      startAt: true,
      endAt: true,
      status: true,
      purpose: true,
      eventName: true,
      driverId: true,
      driver: { select: { name: true } },
    },
    orderBy: { startAt: 'asc' },
  });
}

const driverTripInclude = {
  user: { select: { name: true, email: true } },
  vehicle: { select: { code: true, icon: true, nameNl: true, nameEn: true, needsVanDriver: true, needsDriver: true } },
  group: { select: { nameNl: true, nameEn: true } },
  assignedGroup: { select: { id: true, nameNl: true, nameEn: true } },
  driver: { select: { id: true, name: true } },
  // V2: wie er meerijdt en op welk nummer. Dat is precies wat een chauffeur
  // onderweg nodig heeft.
  helpers: { orderBy: { createdAt: 'asc' as const }, select: { id: true, name: true, phone: true } },
};

/** Eén eigen nota bij een rit, klaar om te tekenen (F4.20). */
export type TripNote = {
  id: string;
  bookingId: string;
  text: string;
  visibility: UitleenTransportNoteVisibility;
  authorId: string;
  authorName: string;
  createdAt: Date;
  /** Van jou, dus te wijzigen en te wissen. */
  mine: boolean;
};

/**
 * De eigen nota's bij een reeks ritten, zoals déze kijker ze mag zien (F4.20).
 *
 * **Een aparte query en geen `include` op de rittenquery.** Die twee queries
 * worden ook gebruikt om een rit van iemand anders te tonen (de chauffeurspagina
 * in het beheer toont de ritten van één chauffeur), en dan zou de kijker een
 * ander zijn dan de chauffeur. Eén gedeelde include zou daar stilzwijgend
 * andermans privénota's meeleveren, en dat is precies de fout die dit veld niet
 * mag maken.
 *
 * De zichtbaarheid zit dan ook in de `where` en niet in het scherm: andermans
 * privénota's komen niet uit de databank. Zie `canReadTripNote` voor dezelfde
 * regel als pure functie; die tekent de knoppen, deze haalt de rijen.
 *
 * `onTripIds` zijn de ritten waar de kijker zelf bij hoort (aanvrager,
 * chauffeur, of lid van de post erachter). De oproeper rekent dat uit met
 * `onTripForNotes`, want die kent de ritten al die op het scherm komen.
 */
export async function tripNotesFor(
  bookingIds: string[],
  viewer: { userId: string; onTripIds: string[]; logistiek: boolean }
): Promise<Map<string, TripNote[]>> {
  const byBooking = new Map<string, TripNote[]>();
  if (bookingIds.length === 0) return byBooking;

  const rows = await prisma.uitleenTransportNote.findMany({
    where: {
      bookingId: { in: bookingIds },
      OR: [
        { authorId: viewer.userId },
        ...(viewer.onTripIds.length > 0
          ? [{ bookingId: { in: viewer.onTripIds }, visibility: { not: 'PRIVE' as const } }]
          : []),
        ...(viewer.logistiek ? [{ visibility: 'POST_EN_LOGISTIEK' as const }] : []),
      ],
    },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      bookingId: true,
      text: true,
      visibility: true,
      authorId: true,
      createdAt: true,
      author: { select: { name: true } },
    },
  });

  for (const row of rows) {
    const list = byBooking.get(row.bookingId) ?? [];
    list.push({
      id: row.id,
      bookingId: row.bookingId,
      text: row.text,
      visibility: row.visibility,
      authorId: row.authorId,
      authorName: row.author.name,
      createdAt: row.createdAt,
      mine: row.authorId === viewer.userId,
    });
    byBooking.set(row.bookingId, list);
  }
  return byBooking;
}

/**
 * De ritten die aan dit lid toegewezen zijn. Enkel goedgekeurde en afgeronde
 * ritten: een afgewezen of geannuleerde rit rijdt niemand, en een aanvraag die
 * nog niet beslist is heeft nog geen chauffeur.
 */
export async function tripsForDriver(driverId: string) {
  return prisma.uitleenTransportBooking.findMany({
    where: { driverId, status: { in: ['APPROVED', 'COMPLETED'] } },
    orderBy: { startAt: 'asc' },
    include: driverTripInclude,
  });
}

/**
 * De ritten van je post: wat je medeleden rijden, wat er nog een chauffeur mist,
 * en wat jij er zelf van rijdt.
 *
 * Twee bronnen, allebei "ritten van mijn post" maar om een andere reden:
 *
 * 1. **Doorgegeven aan je post** (`assignedGroupId`). Die staan hier omdat je er
 *    zelf iemand op moet zetten; zonder dit scherm is die mail naar de
 *    verantwoordelijke het enige spoor.
 * 2. **Aangevraagd door je post** (`groupId`), met of zonder chauffeur. Weet je
 *    wie er rijdt, dan hoef je het niet na te vragen; is er nog niemand, dan is
 *    dat precies de rit waar je iets mee moet.
 *
 * Die tweede tak eiste ooit `driverId: { not: null }` (F4.18). Gevolg: een
 * goedgekeurde rit van je eigen post verscheen pas in deze lijst zodra Logistiek
 * er iemand op zette of hem uitdrukkelijk doorgaf, en dat is net de rit waarvoor
 * een post hier komt kijken.
 *
 * **Je eigen ritten zitten er ook in** (F4.19). Die staan dan twee keer op
 * /ritten, en dat is de bedoeling: de twee lijsten beantwoorden twee vragen
 * ("wat moet ik doen" en "wat staat er bij ons open"). De kaart in de postlijst
 * zegt dat jij het bent, anders leest het als een dubbel. Zie
 * `docs/design-decisions.md`.
 */
export async function tripsForGroups(groupIds: string[]) {
  if (groupIds.length === 0) return [];
  return prisma.uitleenTransportBooking.findMany({
    where: {
      status: { in: ['APPROVED', 'COMPLETED'] },
      OR: [{ assignedGroupId: { in: groupIds } }, { groupId: { in: groupIds } }],
    },
    orderBy: { startAt: 'asc' },
    include: driverTripInclude,
  });
}

export type DriverTrip = Awaited<ReturnType<typeof tripsForDriver>>[number];
