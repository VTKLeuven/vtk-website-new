import 'server-only';
import { prisma, searchUsers } from '@vtk/db';
import type { GroupType, UitleenAvailabilityKind } from '@prisma/client';
import { currentWorkingYear } from '@vtk/auth';
import {
  parseCustomColor,
  type CustomDriverColor,
  type DriverColorChoice,
} from '@/lib/driver-colors';
import { resolveDriverPhones, type DriverPhone, type DriverPhoneSource } from '@/lib/driver-phones';
import { isFeedTokenExpired } from '@/lib/calendar/feed-token';
import { logistiekTeamMembers } from './shared';

// ---------------------------------------------------------------------------
// Chauffeurs
// ---------------------------------------------------------------------------

/**
 * Waar een chauffeur vandaan komt: uit de post Logistiek (automatisch, per
 * werkingsjaar) of met de hand toegevoegd in /beheer/chauffeurs.
 */
export type DriverSource = 'POST' | 'EXTRA';

export type DriverOption = {
  id: string;
  name: string;
  source: DriverSource;
  /** Mag met de kar rijden, de bestelwagen; zie `UitleenDriver.canDriveVan`. */
  canDriveVan: boolean;
  /**
   * Kleur die het team zelf koos, of `null` voor de kleur uit zijn id
   * (`driverColorIndex` in lib/driver-colors.ts).
   */
  colorIndex: number | null;
  /**
   * Een eigen kleur uit de schuiven, of `null`. Wint van `colorIndex`; de actie
   * zet er altijd één van de twee op `null`.
   */
  customColor: CustomDriverColor | null;
  /**
   * Het nummer waarop deze chauffeur bereikbaar is, of `null`. Zie
   * {@link driverPhones}: vastgelegd door het team, anders het gsm-nummer van
   * zijn profiel, anders het laatste nummer dat hij zelf bij een aanvraag opgaf.
   */
  phone: string | null;
};

/**
 * De beschikbaarheidsvensters die dit tijdvenster raken (V1), met de naam van de
 * chauffeur erbij voor de band in de planning. Enkel karchauffeurs (canDriveVan).
 */
export async function availabilityInRange(from: Date, to: Date) {
  return prisma.uitleenDriverAvailability.findMany({
    where: {
      startAt: { lt: to },
      endAt: { gt: from },
      user: {
        uitleenDriver: { canDriveVan: true },
        active: true,
        deletedAt: null,
      },
    },
    select: {
      id: true,
      userId: true,
      startAt: true,
      endAt: true,
      kind: true,
      note: true,
      user: { select: { name: true } },
    },
    orderBy: { startAt: 'asc' },
  });
}

/**
 * De algemene nota van één chauffeur voor één week (F4.5).
 *
 * `null` wanneer hij er geen schreef; een lege nota bestaat niet (zie
 * `setAvailabilityNoteAction`).
 */
export async function availabilityNoteForWeek(userId: string, weekStart: Date) {
  const row = await prisma.uitleenDriverAvailabilityNote.findUnique({
    where: { userId_weekStart: { userId, weekStart } },
    select: { text: true },
  });
  return row?.text ?? null;
}

/**
 * De algemene nota's van alle karchauffeurs voor de weken die dit venster raken
 * (F4.5), voor de strook onder de planning.
 *
 * `from` en `to` zijn de randen van de weergave; de nota hangt aan een maandag,
 * dus een venster dat halverwege een week begint, moet ook de maandag ervóór
 * meenemen. Vandaar de zes dagen speling aan de voorkant.
 */
export async function availabilityNotesInRange(from: Date, to: Date) {
  return prisma.uitleenDriverAvailabilityNote.findMany({
    where: {
      weekStart: { gte: new Date(from.getTime() - 6 * 24 * 60 * 60 * 1000), lt: to },
      user: {
        uitleenDriver: { canDriveVan: true },
        active: true,
        deletedAt: null,
      },
    },
    select: { userId: true, weekStart: true, text: true },
    orderBy: { weekStart: 'asc' },
  });
}

/** De vensters van één chauffeur, vanaf `since`: wat hij zelf beheert. */
export async function availabilityForDriver(userId: string, since = new Date()) {
  // Vensters die al voorbij zijn, blijven in de databank staan (ze zeggen
  // achteraf wie er die dag kon), maar horen niet in de lijst waar je dingen
  // weghaalt: die gaat over wat je nog belooft. Het scherm geeft hier het begin
  // van de getoonde week mee wanneer dat vroeger ligt dan nu: anders verdween
  // een venster van maandagochtend maandagmiddag uit de week waarin het stond.
  return prisma.uitleenDriverAvailability.findMany({
    where: { userId, endAt: { gte: since } },
    select: { id: true, startAt: true, endAt: true, kind: true, note: true },
    orderBy: { startAt: 'asc' },
  });
}

/**
 * Hoeveel vensters er tussen twee momenten liggen; voor de knop "Neem vorige
 * week over", die enkel verschijnt wanneer er iets over te nemen valt.
 */
export async function availabilityCountInRange(userId: string, from: Date, to: Date) {
  return prisma.uitleenDriverAvailability.count({
    where: { userId, startAt: { lt: to }, endAt: { gt: from } },
  });
}

/**
 * Wat deze chauffeur zelf zei over dit moment.
 *
 * - `null`: hij gaf nog nooit iets door. Dan weet de app het niet, en "kan niet"
 *   beweren zou een waarschuwing geven bij elke chauffeur die dit scherm nog
 *   nooit opende.
 * - `'NIETS'`: hij vult dit wel in, maar duidde dit moment niet aan. Dat is een
 *   stille "waarschijnlijk niet", en iets anders dan het vorige geval.
 * - `'JA'` / `'LIEVER_NIET'` / `'NOOD'`: wat hij aanduidde. Het venster moet het
 *   hele ritmoment dekken; half beschikbaar is niet beschikbaar.
 *
 * Blijft een hulpmiddel en geen slot: iemand toewijzen buiten zijn venster geeft
 * een waarschuwing, geen blokkade.
 */
export async function driverAvailability(
  userId: string,
  startAt: Date,
  endAt: Date
): Promise<UitleenAvailabilityKind | 'NIETS' | null> {
  const any = await prisma.uitleenDriverAvailability.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (!any) return null;
  const covering = await prisma.uitleenDriverAvailability.findMany({
    where: { userId, startAt: { lte: startAt }, endAt: { gte: endAt } },
    select: { kind: true },
  });
  if (covering.length === 0) return 'NIETS';
  // Dekt meer dan één venster het moment (kan bij oude rijen van voor de
  // soorten bestonden), dan wint het gulste antwoord.
  const order: UitleenAvailabilityKind[] = ['JA', 'LIEVER_NIET', 'NOOD'];
  return order.find((kind) => covering.some((row) => row.kind === kind)) ?? 'NIETS';
}

/**
 * De agenda-abonnementen van deze persoon (A1). Ingetrokken abonnementen vallen
 * weg: die staan er enkel nog om te beletten dat een token hergebruikt wordt.
 * Een vervallen abonnement (90 dagen niet opgehaald) blijft staan met
 * `expired`, zodat wie zich afvraagt waarom zijn agenda leeg blijft, het ziet.
 */
export async function feedTokensForUser(userId: string) {
  const rows = await prisma.uitleenFeedToken.findMany({
    where: { userId, revokedAt: null },
    select: { id: true, label: true, scope: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const now = new Date();
  return rows.map((row) => ({ ...row, expired: isFeedTokenExpired(row, now) }));
}

/**
 * De kleuren die het team zelf zette, op gebruikers-id (K1).
 *
 * Apart van {@link driverOptions}, want het publieke bezettingsoverzicht toont
 * wel de kleuren maar mag de chauffeurslijst zelf niet ophalen: dat zou namen
 * meebrengen die daar niet horen.
 */
export async function driverColorOverrides(): Promise<Record<string, DriverColorChoice>> {
  const rows = await prisma.uitleenDriver.findMany({
    where: { OR: [{ colorIndex: { not: null } }, { customColor: { not: null } }] },
    select: { userId: true, colorIndex: true, customColor: true },
  });
  const overrides: Record<string, DriverColorChoice> = {};
  for (const row of rows) {
    // Een eigen kleur wint. Is de tekst geen kleur (een handmatige update), dan
    // geldt het palet, en zonder palet de hash.
    const custom = parseCustomColor(row.customColor);
    if (custom) overrides[row.userId] = custom;
    else if (row.colorIndex !== null) overrides[row.userId] = row.colorIndex;
  }
  return overrides;
}

/**
 * Iedereen die als chauffeur gekozen kan worden: de post Logistiek van dit
 * werkingsjaar plus de handmatig toegevoegde chauffeurs. Zit iemand in allebei,
 * dan telt de post (die kost geen beheerwerk en verdwijnt vanzelf op 15 juli).
 */
export async function driverOptions(): Promise<DriverOption[]> {
  const [team, extra] = await Promise.all([
    logistiekTeamMembers(),
    prisma.uitleenDriver.findMany({
      where: { user: { active: true, deletedAt: null } },
      select: {
        canDriveVan: true,
        colorIndex: true,
        customColor: true,
        phone: true,
        user: { select: { id: true, name: true } },
      },
    }),
  ]);

  // Het nummer erbij, zodat "bel de chauffeur" overal waar deze lijst gebruikt
  // wordt één tik is in plaats van een zoektocht.
  const phones = await driverPhones([
    ...team.map((member) => member.id),
    ...extra.map((row) => row.user.id),
  ]);

  // Een postlid kan óók een rij hier hebben: die wordt aangemaakt zodra iemand de
  // karvlag of de kleur zet. De bron blijft dan POST (die verdwijnt vanzelf op
  // 15 juli), maar de vlag en de kleur komen uit de rij.
  const rowByUser = new Map(extra.map((row) => [row.user.id, row]));

  const byId = new Map<string, DriverOption>();
  for (const member of team) {
    const row = rowByUser.get(member.id);
    byId.set(member.id, {
      id: member.id,
      name: member.name,
      source: 'POST',
      canDriveVan: row?.canDriveVan ?? false,
      colorIndex: row?.colorIndex ?? null,
      customColor: parseCustomColor(row?.customColor),
      // `row.phone` niet meer apart: dat is de bron TEAM en die wint al binnen
      // `driverPhones` zelf.
      phone: phones.get(member.id)?.number ?? null,
    });
  }
  for (const row of extra) {
    if (byId.has(row.user.id)) continue;
    byId.set(row.user.id, {
      id: row.user.id,
      name: row.user.name,
      source: 'EXTRA',
      canDriveVan: row.canDriveVan,
      colorIndex: row.colorIndex,
      customColor: parseCustomColor(row.customColor),
      phone: phones.get(row.user.id)?.number ?? null,
    });
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

/**
 * Het nummer waarop je een chauffeur bereikt, per gebruikers-id.
 *
 * Haalt de drie bronnen op; welke er wint staat in `resolveDriverPhones`
 * (lib/driver-phones.ts), samen met het waarom.
 *
 * Wat hier bewust **niet** in zit: het nummer van een bijrijder
 * (`UitleenTransportHelper.phone`). Dat is het nummer van de bijrijder zelf en
 * niet van wie die rij aanmaakte; `addedById` erop loslaten zou de helft van de
 * chauffeurs het nummer van iemand anders geven, en een verkeerd nummer is
 * erger dan geen nummer.
 *
 * Het gevondene wordt niet weggeschreven: dit draait op een leespad, en een
 * pagina die stil rijen bijwerkt terwijl je ze bekijkt, is een pagina waarvan
 * je de gegevens niet meer kan verklaren.
 */
export async function driverPhones(userIds: string[]): Promise<Map<string, DriverPhone>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();

  const [team, profile, bookings, reservations] = await Promise.all([
    prisma.uitleenDriver.findMany({
      where: { userId: { in: ids }, phone: { not: null } },
      select: { userId: true, phone: true },
    }),
    prisma.user.findMany({
      where: { id: { in: ids }, phone: { not: null } },
      select: { id: true, phone: true },
    }),
    prisma.uitleenTransportBooking.findMany({
      where: { userId: { in: ids }, contactPhone: { not: null } },
      select: { userId: true, contactPhone: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.uitleenReservation.findMany({
      where: { userId: { in: ids }, contactPhone: { not: null } },
      select: { userId: true, contactPhone: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return resolveDriverPhones({
    team,
    profile: profile.map((row) => ({ userId: row.id, phone: row.phone })),
    history: [...bookings, ...reservations].map((row) => ({
      userId: row.userId,
      phone: row.contactPhone,
      createdAt: row.createdAt,
    })),
  });
}

export type DriverPoolEntry = DriverOption & {
  email: string;
  /** Id van de rij in `UitleenDriver`; null voor iemand die via de post chauffeur is. */
  driverRowId: string | null;
  note: string | null;
  /** Gedeactiveerd op vtk.be: staat nog in de lijst, maar valt uit de keuze weg. */
  inactive: boolean;
  /** Het nummer waarop deze chauffeur bereikbaar is; zie {@link driverPhones}. */
  phone: string | null;
  /**
   * Waar dat nummer vandaan komt, of `null` wanneer er geen is. Het scherm zegt
   * het erbij: een nummer uit een oude aanvraag is iets anders dan een nummer
   * dat het team bevestigde.
   */
  phoneSource: DriverPhoneSource | null;
  upcomingTrips: number;
  totalTrips: number;
};

/**
 * De chauffeurslijst voor het beheerscherm: dezelfde unie als
 * {@link driverOptions}, met contactgegevens, herkomst en hoeveel ritten er aan
 * elke chauffeur hangen (zodat je ziet wie je niet zomaar weghaalt).
 */
export async function driverPool(): Promise<DriverPoolEntry[]> {
  const now = new Date();
  const [team, extra, tripCounts, upcomingCounts] = await Promise.all([
    logistiekTeamMembers(),
    prisma.uitleenDriver.findMany({
      where: { user: { deletedAt: null } },
      select: {
        id: true,
        note: true,
        canDriveVan: true,
        colorIndex: true,
        customColor: true,
        phone: true,
        user: { select: { id: true, name: true, email: true, active: true } },
      },
    }),
    prisma.uitleenTransportBooking.groupBy({
      by: ['driverId'],
      where: { driverId: { not: null }, status: { in: ['APPROVED', 'COMPLETED'] } },
      _count: { _all: true },
    }),
    prisma.uitleenTransportBooking.groupBy({
      by: ['driverId'],
      where: { driverId: { not: null }, status: 'APPROVED', endAt: { gte: now } },
      _count: { _all: true },
    }),
  ]);

  const total = new Map(tripCounts.map((row) => [row.driverId, row._count._all]));
  const upcoming = new Map(upcomingCounts.map((row) => [row.driverId, row._count._all]));

  // Het nummer uit de historiek voor iedereen die er nog geen vast heeft staan.
  const phones = await driverPhones([
    ...team.map((member) => member.id),
    ...extra.map((row) => row.user.id),
  ]);

  const byId = new Map<string, DriverPoolEntry>();
  const put = (entry: Omit<DriverPoolEntry, 'upcomingTrips' | 'totalTrips'>) => {
    if (byId.has(entry.id)) return;
    byId.set(entry.id, {
      ...entry,
      upcomingTrips: upcoming.get(entry.id) ?? 0,
      totalTrips: total.get(entry.id) ?? 0,
    });
  };

  const rowByUser = new Map(extra.map((row) => [row.user.id, row]));

  for (const member of team) {
    // `driverRowId` blijft null: een postlid haal je niet uit de lijst met de
    // knop hier, ook niet wanneer het een rij heeft voor de karvlag. Die rij
    // levert enkel de notitie en de vlag.
    const row = rowByUser.get(member.id);
    put({
      id: member.id,
      name: member.name,
      email: member.email,
      source: 'POST',
      driverRowId: null,
      note: row?.note ?? null,
      canDriveVan: row?.canDriveVan ?? false,
      colorIndex: row?.colorIndex ?? null,
      customColor: parseCustomColor(row?.customColor),
      inactive: false,
      phone: phones.get(member.id)?.number ?? null,
      phoneSource: phones.get(member.id)?.source ?? null,
    });
  }
  for (const row of extra) {
    put({
      id: row.user.id,
      name: row.user.name,
      email: row.user.email,
      source: 'EXTRA',
      driverRowId: row.id,
      note: row.note,
      canDriveVan: row.canDriveVan,
      colorIndex: row.colorIndex,
      customColor: parseCustomColor(row.customColor),
      inactive: !row.user.active,
      phone: phones.get(row.user.id)?.number ?? null,
      phoneSource: phones.get(row.user.id)?.source ?? null,
    });
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

/** Eén post of werkgroep met haar leden, gesplitst op wie chauffeur is (F4.10). */
export type GroupDrivers = {
  id: string;
  /** De Nederlandse naam: dit is beheer, en dat staat altijd in het Nederlands. */
  name: string;
  type: GroupType;
  /** Leden van dit werkingsjaar die in de chauffeurspool zitten. */
  drivers: Array<{ id: string; name: string }>;
  /** De andere leden: wie je met één klik chauffeur kan maken. */
  others: Array<{ id: string; name: string }>;
};

/**
 * Wie er per post en werkgroep chauffeur is (F4.10).
 *
 * Dit is het andere eind van F4.9. Daar werd de keuzelijst bij een doorgegeven
 * rit de doorsnede van de post en de chauffeurspool, en een post waarvan niemand
 * in die pool zit, houdt dus geen keuzelijst over. Wie dat leest terwijl de rit
 * er al ligt, weet nog altijd niet wie hij dan wél moet toevoegen. Hier staat
 * diezelfde doorsnede voor elke post op het scherm, vóór er een rit aan hangt.
 *
 * **De pool is van de kring en niet van de post.** Iemand hier toevoegen maakt
 * hem overal chauffeur, precies zoals de picker bovenaan; een chauffeur "van
 * Sport alleen" bestaat niet. Het scherm zegt dat er met zoveel woorden bij,
 * want een knop onder een postnaam belooft anders iets kleiners dan ze doet.
 *
 * Enkel actieve groepen met leden dit werkingsjaar: een post zonder leden is een
 * rij die niets zegt, en het zijn er vijfentwintig.
 */
export async function driversPerGroup(): Promise<GroupDrivers[]> {
  const [memberships, team, extra] = await Promise.all([
    prisma.groupMembership.findMany({
      where: {
        year: currentWorkingYear(),
        user: { active: true, deletedAt: null },
        group: { active: true },
      },
      select: {
        user: { select: { id: true, name: true } },
        group: { select: { id: true, nameNl: true, type: true, orderInPraesidium: true } },
      },
    }),
    logistiekTeamMembers(),
    prisma.uitleenDriver.findMany({
      where: { user: { active: true, deletedAt: null } },
      select: { userId: true },
    }),
  ]);

  // Dezelfde unie als `driverOptions` en `groupMemberOptions`: de post Logistiek
  // van dit werkingsjaar plus de rijen in `UitleenDriver`.
  const pool = new Set([...team.map((member) => member.id), ...extra.map((row) => row.userId)]);

  const byGroup = new Map<string, GroupDrivers & { order: number }>();
  for (const membership of memberships) {
    const group = membership.group;
    let entry = byGroup.get(group.id);
    if (!entry) {
      entry = {
        id: group.id,
        name: group.nameNl,
        type: group.type,
        order: group.orderInPraesidium,
        drivers: [],
        others: [],
      };
      byGroup.set(group.id, entry);
    }
    (pool.has(membership.user.id) ? entry.drivers : entry.others).push(membership.user);
  }

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'nl');
  return [...byGroup.values()]
    .sort((a, b) => a.order - b.order || byName(a, b))
    .map(({ order: _order, ...group }) => ({
      ...group,
      drivers: [...group.drivers].sort(byName),
      others: [...group.others].sort(byName),
    }));
}

/**
 * Actieve leden zoeken voor de chauffeurspicker, op naam, e-mail of r-nummer.
 * Spiegelt /api/users/search op de hoofdsite: server-side en gelimiteerd, zodat
 * de picker ook met duizenden leden werkt.
 */
export async function searchDriverCandidates(query: string, limit = 10) {
  const users = await searchUsers(query, { limit: Math.min(limit, 25), db: prisma });
  return users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    rNumber: u.rNumber,
  }));
}

export type DriverCandidate = Awaited<ReturnType<typeof searchDriverCandidates>>[number];

/**
 * Staat dit lid in de chauffeurspool? Via de post of handmatig toegevoegd.
 * Bepaalt of "Mijn ritten" in de navigatie verschijnt.
 */
export async function isDriver(userId: string): Promise<boolean> {
  const [extra, membership] = await Promise.all([
    prisma.uitleenDriver.count({ where: { userId } }),
    prisma.groupMembership.count({
      where: { userId, year: currentWorkingYear(), group: { code: 'LOGISTIEK' } },
    }),
  ]);
  return extra > 0 || membership > 0;
}

/**
 * Mag dit lid met de kar rijden (karchauffeur)?
 *
 * Enkel karchauffeurs geven hun beschikbaarheid door en verschijnen op het
 * beschikbaarheidsbord onder de transportplanning.
 */
export async function isVanDriver(userId: string): Promise<boolean> {
  const driver = await prisma.uitleenDriver.findFirst({
    where: {
      userId,
      canDriveVan: true,
      user: { active: true, deletedAt: null },
    },
    select: { id: true },
  });
  return driver !== null;
}

/**
 * Wat de navigatie en de homepage over "Mijn ritten" moeten weten: staat dit lid
 * in de chauffeurspool, en hoeveel ritten komen er nog aan. Wie uit de pool
 * gehaald is maar nog een geplande rit heeft, houdt de link: anders verdwijnt
 * zijn planning terwijl hij nog moet rijden.
 */
export async function driverStatus(
  userId: string,
  /**
   * De posten van dit lid. Zonder dit zou wie geen chauffeur is maar wél een
   * rit op zijn post heeft staan, de link niet zien en enkel via de mail op dat
   * scherm raken; en dan mist hij ook de tweede rit, waar geen mail meer voor
   * vertrekt.
   */
  groupIds: string[] = []
): Promise<{ isDriver: boolean; upcomingTrips: number }> {
  const now = new Date();
  // Eén telling en geen twee die je optelt: sinds F4.19 staat een rit die je
  // zelf rijdt voor je eigen post in allebei de lijsten, en opgeteld stond er
  // dan "2 komende ritten" voor één rit. De takken zijn dezelfde als die van
  // `tripsForGroups`, anders belooft de navigatie iets anders dan het scherm.
  const [driver, upcomingTrips] = await Promise.all([
    isDriver(userId),
    prisma.uitleenTransportBooking.count({
      where: {
        status: 'APPROVED',
        endAt: { gte: now },
        OR: [
          { driverId: userId },
          ...(groupIds.length > 0
            ? [{ assignedGroupId: { in: groupIds } }, { groupId: { in: groupIds } }]
            : []),
        ],
      },
    }),
  ]);
  return { isDriver: driver, upcomingTrips };
}

export function showsMyTrips(status: { isDriver: boolean; upcomingTrips: number }): boolean {
  return status.isDriver || status.upcomingTrips > 0;
}
