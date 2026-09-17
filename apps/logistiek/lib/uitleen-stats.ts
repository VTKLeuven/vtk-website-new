import 'server-only';

import { prisma } from '@vtk/db';
import { currentWorkingYear, FIRST_WORKING_YEAR } from '@vtk/auth';
import type { Prisma } from '@prisma/client';

/**
 * De cijfers achter de transportplanning: wie reed wanneer, hoelang en voor wie.
 *
 * **Eén query en de rest in geheugen.** Alles hieronder gaat over dezelfde
 * verzameling ritten uit één venster; die twaalf keer apart uit de database
 * halen (per chauffeur, per post, per week, per uur van de dag) levert twaalf
 * queries op die elk hetzelfde lezen, en een teller die niet meer optelt zodra
 * er één een ander filter heeft. Het gaat over honderden rijen per jaar, niet
 * over miljoenen.
 *
 * **Wat "gereden" hier betekent.** Een goedgekeurde of afgeronde rit. Niet enkel
 * `COMPLETED`: afronden gebeurt in de praktijk niet bij elke rit (het is de stap
 * waarin de kilometers ingevuld worden, en dat hoeft enkel bij een tarief per
 * km), en een jaaroverzicht dat de helft van de ritten weglaat omdat niemand op
 * een knop duwde, is geen jaaroverzicht. Afgewezen en geannuleerde ritten tellen
 * apart, als eigen getal.
 *
 * **En wat "uren" betekent.** Het geboekte venster, niet de tijd achter het
 * stuur: de app weet niet wanneer de motor startte. Dat venster is wél precies
 * wat het voertuig bezet hield, en dat is de vraag die dit scherm beantwoordt.
 * Overal waar een getal uren toont, staat dat woord erbij.
 */

/** Statussen die meetellen als "deze rit is gereden". */
const DRIVEN = ['APPROVED', 'COMPLETED'] as const;

export type StatsFilters = {
  from: Date;
  /** Exclusief: een rit die precies hier begint, hoort bij de volgende periode. */
  to: Date;
  /** Leeg = alle voertuigen. */
  vehicleIds: string[];
  /** Leeg = alle posten en werkgroepen. */
  groupIds: string[];
};

/** Een post, een werkgroep, een externe of Logistiek zelf, als één noemer. */
const NO_GROUP = 'geen';

const dayKey = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Brussels',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const weekdayHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Brussels',
  weekday: 'short',
  hour: '2-digit',
  hour12: false,
});
const dayLabel = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const timeLabel = new Intl.DateTimeFormat('nl-BE', {
  timeZone: 'Europe/Brussels',
  hour: '2-digit',
  minute: '2-digit',
});

/** Maandag = 0, zondag = 6; de week zoals de kalender hem toont. */
const WEEKDAY_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

/** Het uur en de weekdag van een moment, in Belgische tijd. */
function brusselsCell(at: Date): { day: number; hour: number } {
  const parts = weekdayHour.formatToParts(at);
  const weekday = parts.find((part) => part.type === 'weekday')?.value ?? 'Mon';
  const hourRaw = parts.find((part) => part.type === 'hour')?.value ?? '00';
  // Middernacht komt er bij sommige runtimes uit als "24"; dat is het begin van
  // dezelfde dag en niet het 25e uur.
  const hour = Number(hourRaw) % 24;
  return { day: WEEKDAY_INDEX[weekday] ?? 0, hour };
}

function hoursBetween(from: Date, to: Date): number {
  return Math.max(0, (to.getTime() - from.getTime()) / 3_600_000);
}

/** De maandag van de week waarin dit moment valt, als sleutel `2026-09-14`. */
function weekKey(at: Date): string {
  const key = dayKey.format(at);
  const [year, month, day] = key.split('-').map(Number);
  const noon = new Date(Date.UTC(year, month - 1, day, 12));
  // getUTCDay: zondag = 0, dus zondag telt als de zevende dag van de vorige week.
  const shift = (noon.getUTCDay() + 6) % 7;
  const monday = new Date(noon.getTime() - shift * 86_400_000);
  return dayKey.format(monday);
}

export type StatsRow = {
  id: string;
  /** ISO-datum in Belgische tijd, om op te sorteren. */
  dayKey: string;
  dateLabel: string;
  timeLabel: string;
  hours: number;
  vehicleId: string;
  vehicleName: string;
  driverId: string | null;
  driverName: string;
  groupKey: string;
  groupName: string;
  purpose: string;
  status: string;
};

export type DriverStat = {
  id: string;
  name: string;
  trips: number;
  hours: number;
  /** Uren per voertuig, op voertuig-id; samen exact `hours`. */
  perVehicle: Record<string, number>;
};

export type GroupStat = {
  key: string;
  name: string;
  trips: number;
  hours: number;
  /** Wie er voor deze post reed; de drilldown onder de balk. */
  drivers: Array<{ id: string; name: string; trips: number; hours: number }>;
};

export type TransportStats = {
  vehicles: Array<{ id: string; name: string }>;
  totals: {
    trips: number;
    hours: number;
    drivers: number;
    averageHours: number;
    /** Zonder chauffeur, van de ritten die er een nodig hadden. */
    withoutDriver: number;
    cancelled: number;
    rejected: number;
  };
  /** Dezelfde getallen over de even lange periode ervoor, voor de trendpijl. */
  previous: { trips: number; hours: number; drivers: number; averageHours: number };
  perDriver: DriverStat[];
  perGroup: GroupStat[];
  /** Uren bezetting per weekdag (0 = maandag) en uur van de dag. */
  heatmap: number[][];
  weeks: Array<{ key: string; label: string; trips: number; hours: number }>;
  rows: StatsRow[];
};

function where(filters: StatsFilters): Prisma.UitleenTransportBookingWhereInput {
  return {
    startAt: { gte: filters.from, lt: filters.to },
    ...(filters.vehicleIds.length > 0 ? { vehicleId: { in: filters.vehicleIds } } : {}),
    ...(filters.groupIds.length > 0 ? { groupId: { in: filters.groupIds } } : {}),
  };
}

const statsSelect = {
  id: true,
  startAt: true,
  endAt: true,
  status: true,
  purpose: true,
  eventName: true,
  requesterType: true,
  requesterName: true,
  vehicleId: true,
  driverId: true,
  groupId: true,
  vehicle: { select: { nameNl: true, needsDriver: true } },
  driver: { select: { name: true } },
  group: { select: { nameNl: true } },
} satisfies Prisma.UitleenTransportBookingSelect;

type StatsBooking = Prisma.UitleenTransportBookingGetPayload<{ select: typeof statsSelect }>;

/** Voor wie deze rit reed, als sleutel en als naam. */
function requesterOf(booking: StatsBooking): { key: string; name: string } {
  if (booking.groupId && booking.group) return { key: booking.groupId, name: booking.group.nameNl };
  if (booking.requesterName?.trim()) {
    // Geen id om op te groeperen: een vrije naam is zijn eigen sleutel. Twee
    // keer "Alumni" met een andere spelling worden dan twee rijen, en dat is
    // eerlijker dan ze samenvoegen op iets wat niet dezelfde is.
    return { key: `naam:${booking.requesterName.trim()}`, name: booking.requesterName.trim() };
  }
  return { key: NO_GROUP, name: 'Logistiek zelf' };
}

/**
 * De bezetting van een rit uitsmeren over de uren van de week.
 *
 * Per kwartier en niet per uur: een rit van 14:15 tot 15:45 hoort voor een half
 * uur bij 14u en voor drie kwartier bij 15u, en "de rit valt in het uur waarin
 * hij begint" maakt van de piek een streep op precies de uren waarop iedereen
 * vertrekt. Werken met echte momenten en niet met uurgetallen houdt het bovendien
 * correct op de nacht van een uurwissel.
 */
const SAMPLE_MS = 15 * 60 * 1000;
const SAMPLE_HOURS = SAMPLE_MS / 3_600_000;

function addToHeatmap(heatmap: number[][], startAt: Date, endAt: Date) {
  const end = endAt.getTime();
  // Een rit kan volgens het model tot dertig dagen duren; dan is dit 2880
  // stappen, en dat is nog altijd goedkoper dan een tweede query.
  for (let at = startAt.getTime(); at < end; at += SAMPLE_MS) {
    const cell = brusselsCell(new Date(at));
    heatmap[cell.day][cell.hour] += Math.min(SAMPLE_HOURS, (end - at) / 3_600_000);
  }
}

export async function transportStats(filters: StatsFilters): Promise<TransportStats> {
  const span = filters.to.getTime() - filters.from.getTime();
  const [bookings, previousBookings, vehicles] = await Promise.all([
    prisma.uitleenTransportBooking.findMany({
      where: where(filters),
      select: statsSelect,
      orderBy: { startAt: 'asc' },
    }),
    prisma.uitleenTransportBooking.findMany({
      where: {
        ...where({ ...filters, from: new Date(filters.from.getTime() - span), to: filters.from }),
        status: { in: [...DRIVEN] },
      },
      select: { startAt: true, endAt: true, driverId: true },
    }),
    prisma.uitleenVehicle.findMany({
      orderBy: { sortIndex: 'asc' },
      select: { id: true, nameNl: true },
    }),
  ]);

  const driven = bookings.filter((booking) => (DRIVEN as readonly string[]).includes(booking.status));

  const perDriver = new Map<string, DriverStat>();
  const perGroup = new Map<string, GroupStat>();
  const perWeek = new Map<string, { trips: number; hours: number }>();
  const heatmap = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));

  let hours = 0;
  let withoutDriver = 0;

  for (const booking of driven) {
    const duration = hoursBetween(booking.startAt, booking.endAt);
    hours += duration;
    if (!booking.driverId && booking.vehicle.needsDriver) withoutDriver += 1;

    if (booking.driverId) {
      const name = booking.driver?.name ?? 'Onbekend';
      const entry = perDriver.get(booking.driverId) ?? {
        id: booking.driverId,
        name,
        trips: 0,
        hours: 0,
        perVehicle: {},
      };
      entry.trips += 1;
      entry.hours += duration;
      entry.perVehicle[booking.vehicleId] = (entry.perVehicle[booking.vehicleId] ?? 0) + duration;
      perDriver.set(booking.driverId, entry);
    }

    const requester = requesterOf(booking);
    const group = perGroup.get(requester.key) ?? {
      key: requester.key,
      name: requester.name,
      trips: 0,
      hours: 0,
      drivers: [],
    };
    group.trips += 1;
    group.hours += duration;
    if (booking.driverId) {
      const inner = group.drivers.find((entry) => entry.id === booking.driverId);
      if (inner) {
        inner.trips += 1;
        inner.hours += duration;
      } else {
        group.drivers.push({
          id: booking.driverId,
          name: booking.driver?.name ?? 'Onbekend',
          trips: 1,
          hours: duration,
        });
      }
    }
    perGroup.set(requester.key, group);

    const week = weekKey(booking.startAt);
    const weekEntry = perWeek.get(week) ?? { trips: 0, hours: 0 };
    weekEntry.trips += 1;
    weekEntry.hours += duration;
    perWeek.set(week, weekEntry);

    addToHeatmap(heatmap, booking.startAt, booking.endAt);
  }

  const previousHours = previousBookings.reduce(
    (total, booking) => total + hoursBetween(booking.startAt, booking.endAt),
    0
  );
  const previousDrivers = new Set(
    previousBookings.map((booking) => booking.driverId).filter(Boolean)
  ).size;

  const rows: StatsRow[] = bookings.map((booking) => {
    const requester = requesterOf(booking);
    return {
      id: booking.id,
      dayKey: dayKey.format(booking.startAt),
      dateLabel: dayLabel.format(booking.startAt),
      timeLabel: `${timeLabel.format(booking.startAt)}-${timeLabel.format(booking.endAt)}`,
      hours: Math.round(hoursBetween(booking.startAt, booking.endAt) * 100) / 100,
      vehicleId: booking.vehicleId,
      vehicleName: booking.vehicle.nameNl,
      driverId: booking.driverId,
      driverName: booking.driver?.name ?? '',
      groupKey: requester.key,
      groupName: requester.name,
      purpose: booking.eventName?.trim() || booking.purpose,
      status: booking.status,
    };
  });

  const round = (value: number) => Math.round(value * 10) / 10;

  return {
    vehicles: vehicles.map((vehicle) => ({ id: vehicle.id, name: vehicle.nameNl })),
    totals: {
      trips: driven.length,
      hours: round(hours),
      drivers: perDriver.size,
      averageHours: driven.length > 0 ? round(hours / driven.length) : 0,
      withoutDriver,
      cancelled: bookings.filter((booking) => booking.status === 'CANCELLED').length,
      rejected: bookings.filter((booking) => booking.status === 'REJECTED').length,
    },
    previous: {
      trips: previousBookings.length,
      hours: round(previousHours),
      drivers: previousDrivers,
      averageHours: previousBookings.length > 0 ? round(previousHours / previousBookings.length) : 0,
    },
    perDriver: [...perDriver.values()]
      .map((entry) => ({
        ...entry,
        hours: round(entry.hours),
        perVehicle: Object.fromEntries(
          Object.entries(entry.perVehicle).map(([key, value]) => [key, round(value)])
        ),
      }))
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'nl')),
    perGroup: [...perGroup.values()]
      .map((entry) => ({
        ...entry,
        hours: round(entry.hours),
        drivers: entry.drivers
          .map((driver) => ({ ...driver, hours: round(driver.hours) }))
          .sort((a, b) => b.hours - a.hours),
      }))
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name, 'nl')),
    heatmap: heatmap.map((row) => row.map(round)),
    weeks: [...perWeek.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => ({
        key,
        label: dayLabel.format(new Date(`${key}T12:00:00Z`)).slice(0, 5),
        trips: value.trips,
        hours: round(value.hours),
      })),
    rows,
  };
}

// ---------------------------------------------------------------------------
// De periode waarover het gaat
// ---------------------------------------------------------------------------

/**
 * De keuzes bovenaan het scherm.
 *
 * Het werkingsjaar is de standaard en niet "de laatste 30 dagen": een post die
 * wil weten of ze veel vervoer vroeg, en een transportverantwoordelijke die
 * chauffeurs zoekt, denken allebei in werkingsjaren. Dertig dagen staat erbij
 * voor de vraag "hoe druk was het de voorbije maand".
 */
export type StatsPeriodKey = 'jaar' | 'vorigjaar' | 'maand' | 'aangepast';

/** Het werkingsjaar loopt van 15 juli tot 15 juli; zie `currentWorkingYear`. */
export function workingYearRange(year: number): { from: Date; to: Date } {
  return {
    from: new Date(Date.UTC(year, 6, 15)),
    to: new Date(Date.UTC(year + 1, 6, 15)),
  };
}

export function workingYearLabel(year: number): string {
  return `${String(year).slice(2)}-${String(year + 1).slice(2)}`;
}

export function resolvePeriod(
  key: StatsPeriodKey,
  custom: { from: Date | null; to: Date | null },
  now: Date = new Date()
): { from: Date; to: Date; label: string; key: StatsPeriodKey } {
  const year = currentWorkingYear(now);
  if (key === 'maand') {
    const to = new Date(now.getTime() + 86_400_000);
    return { from: new Date(to.getTime() - 30 * 86_400_000), to, label: 'Laatste 30 dagen', key };
  }
  if (key === 'vorigjaar') {
    // Er is geen historiek van voor het eerste werkingsjaar; dan blijft het bij
    // dat jaar in plaats van een leeg scherm met een jaartal dat niet bestaat.
    const previous = Math.max(year - 1, FIRST_WORKING_YEAR);
    return { ...workingYearRange(previous), label: `Werkingsjaar ${workingYearLabel(previous)}`, key };
  }
  if (key === 'aangepast' && custom.from && custom.to) {
    return {
      from: custom.from,
      // Inclusief de gekozen einddag: wie "tot 30 september" kiest, bedoelt die
      // dag erbij.
      to: new Date(custom.to.getTime() + 86_400_000),
      label: `${dayLabel.format(custom.from)} tot ${dayLabel.format(custom.to)}`,
      key,
    };
  }
  return { ...workingYearRange(year), label: `Werkingsjaar ${workingYearLabel(year)}`, key: 'jaar' };
}
