import 'server-only';

import { prisma } from '@vtk/db';
import { workingYearOf } from '@vtk/auth';
import { shiftYMD, ymdKey, type YMD } from '@/lib/brussels';
import { weekdaysOf } from '@/lib/theokotShifts';
import { workingYearStart } from '@/lib/workingYear';
import {
  DUTY_SLOTS,
  defaultDutyBlock,
  dutyCellKey,
  dutyDate,
  dutyDateKey,
  type DutyCell,
  type DutySlotKey,
} from '@/lib/theokotDuty';

/** De post waarvan de leden verantwoordelijke zijn. */
const THEOKOT_POST = 'THEOKOT';

export type DutyPerson = {
  id: string;
  name: string;
  /** Lid van de post in het werkingsjaar van deze week. Wie dat niet (meer) is maar wel iets heeft staan, blijft zichtbaar. */
  member: boolean;
  /** De startstand van het werkingsjaar (uit het rekenblad). */
  carryOver: number;
  /** Startstand plus de blokken van dit werkingsjaar buiten deze week. */
  yearBase: number;
};

export type DutyWeek = {
  /** Werkingsjaar (startjaar) van de week. */
  year: number;
  days: YMD[];
  cells: DutyCell[];
  people: DutyPerson[];
};

/** Het werkingsjaar waarin een week valt: dat van haar maandag. */
export function dutyYearOf(monday: YMD): number {
  return workingYearOf(dutyDate(monday));
}

/** Is deze gebruiker lid van de post Theokot in dat werkingsjaar? */
export async function isDutyMember(userId: string, year: number): Promise<boolean> {
  const row = await prisma.groupMembership.findFirst({
    where: { userId, year, group: { code: { equals: THEOKOT_POST, mode: 'insensitive' } } },
    select: { id: true },
  });
  return Boolean(row);
}

/** De leden van de post in een werkingsjaar, op naam. */
export async function dutyMembers(year: number): Promise<{ id: string; name: string }[]> {
  const rows = await prisma.groupMembership.findMany({
    where: { year, group: { code: { equals: THEOKOT_POST, mode: 'insensitive' } } },
    select: { user: { select: { id: true, name: true } } },
  });
  return rows.map((row) => row.user).sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

/**
 * Alles wat het rooster van één week nodig heeft: de blokken met wie kan en wie
 * ingedeeld is, en de verantwoordelijken met hun telling.
 */
export async function loadDutyWeek(monday: YMD): Promise<DutyWeek> {
  const days = weekdaysOf(monday);
  const year = dutyYearOf(monday);
  const weekRange = { gte: dutyDate(monday), lt: dutyDate(shiftYMD(monday, 7)) };
  const yearRange = { gte: workingYearStart(year), lt: workingYearStart(year + 1) };
  const user = { select: { id: true, name: true } } as const;

  const [members, availability, assignments, blocks, yearCounts, weekInYear, carryOvers] = await Promise.all([
    dutyMembers(year),
    prisma.theokotDutyAvailability.findMany({
      where: { date: weekRange },
      orderBy: { createdAt: 'asc' },
      select: { date: true, slot: true, user },
    }),
    prisma.theokotDutyAssignment.findMany({
      where: { date: weekRange },
      orderBy: { createdAt: 'asc' },
      select: { date: true, slot: true, user },
    }),
    prisma.theokotDutyBlock.findMany({ where: { date: weekRange } }),
    prisma.theokotDutyAssignment.groupBy({ by: ['userId'], where: { date: yearRange }, _count: { _all: true } }),
    prisma.theokotDutyAssignment.groupBy({
      by: ['userId'],
      where: { AND: [{ date: yearRange }, { date: weekRange }] },
      _count: { _all: true },
    }),
    prisma.theokotDutyCarryOver.findMany({ where: { year }, select: { count: true, user } }),
  ]);

  // De leden, en wie er deze week of in de startstand iets heeft staan zonder
  // (nog) lid te zijn: wat er al stond, verdwijnt niet uit beeld.
  const byId = new Map<string, { id: string; name: string; member: boolean }>();
  for (const member of members) byId.set(member.id, { ...member, member: true });
  for (const row of [...availability, ...assignments, ...carryOvers]) {
    if (!byId.has(row.user.id)) byId.set(row.user.id, { ...row.user, member: false });
  }
  const order = [...byId.values()].sort(
    (a, b) => Number(b.member) - Number(a.member) || a.name.localeCompare(b.name, 'nl')
  );
  const rank = new Map(order.map((person, index) => [person.id, index]));

  const yearCount = new Map(yearCounts.map((row) => [row.userId, row._count._all]));
  const weekCount = new Map(weekInYear.map((row) => [row.userId, row._count._all]));
  const carry = new Map(carryOvers.map((row) => [row.user.id, row.count]));
  const people: DutyPerson[] = order.map((person) => ({
    ...person,
    carryOver: carry.get(person.id) ?? 0,
    yearBase: (carry.get(person.id) ?? 0) + (yearCount.get(person.id) ?? 0) - (weekCount.get(person.id) ?? 0),
  }));

  const group = (rows: { date: Date; slot: string; user: { id: string } }[]) => {
    const map = new Map<string, string[]>();
    for (const row of rows) {
      const key = dutyCellKey(dutyDateKey(row.date), row.slot as DutySlotKey);
      map.set(key, [...(map.get(key) ?? []), row.user.id]);
    }
    return map;
  };
  const available = group(availability);
  const assigned = group(assignments);
  const overrides = new Map(
    blocks.map((block) => [dutyCellKey(dutyDateKey(block.date), block.slot as DutySlotKey), block])
  );

  const cells: DutyCell[] = days.flatMap((day) =>
    DUTY_SLOTS.map((slot) => {
      const date = ymdKey(day);
      const key = dutyCellKey(date, slot.key);
      const settings = overrides.get(key) ?? defaultDutyBlock(day, slot.key);
      return {
        key,
        date,
        slot: slot.key,
        capacity: settings.capacity,
        open: settings.open,
        note: settings.note ?? null,
        available: (available.get(key) ?? []).sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0)),
        assigned: assigned.get(key) ?? [],
      };
    })
  );

  return { year, days, cells, people };
}
