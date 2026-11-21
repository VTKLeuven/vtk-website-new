'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@vtk/db';
import { logAudit } from '@/lib/audit';
import { parseYMD, ymdKey, type YMD } from '@/lib/brussels';
import { requirePermission } from '@/lib/session';
import { formatWorkingYear } from '@/lib/workingYear';
import { saveError, saveOk, type SaveState } from '@/lib/saveState';
import { mondayOf } from '@/lib/theokotShifts';
import {
  MAX_DUTY_CAPACITY,
  MAX_DUTY_CARRY_OVER,
  MAX_DUTY_NOTE,
  defaultDutyBlock,
  dutyDate,
  isDefaultDutyBlock,
  isDutySlot,
  proposeDuty,
  type DutySlotKey,
} from '@/lib/theokotDuty';
import { dutyMembers, dutyYearOf, isDutyMember, loadDutyWeek } from '@/lib/theokotDuty-server';

/**
 * De verantwoordelijken van Theokot: beschikbaarheid, indeling, afwijkende
 * blokken en de startstand. Alles vraagt `theokot.manage`, het recht van de
 * pagina. Zie docs/design-decisions.md, "Theokot: verantwoordelijken".
 */

function revalidateDuty() {
  revalidatePath('/[locale]/admin/theokot/shiften', 'layout');
}

const SLOT_NAMES: Record<DutySlotKey, string> = {
  ochtend: 'ochtend',
  middag: 'middag',
  namiddag: 'namiddag',
  avond: 'avond',
};

function blockLabel(day: YMD, slot: DutySlotKey): string {
  const date = new Intl.DateTimeFormat('nl-BE', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' })
    .format(dutyDate(day))
    .replace(/\./g, '');
  return `Theokot ${date}, ${SLOT_NAMES[slot]}`;
}

type BlockRef = { day: YMD; slot: DutySlotKey; date: Date };

function parseBlock(dateRaw: unknown, slotRaw: unknown): BlockRef | null {
  const day = typeof dateRaw === 'string' ? parseYMD(dateRaw) : null;
  if (!day || !isDutySlot(slotRaw)) return null;
  return { day, slot: slotRaw, date: dutyDate(day) };
}

async function blockSettings(block: BlockRef) {
  const row = await prisma.theokotDutyBlock.findUnique({
    where: { date_slot: { date: block.date, slot: block.slot } },
  });
  return row ?? defaultDutyBlock(block.day, block.slot);
}

/**
 * Een verantwoordelijke duidt aan dat die in een blok kan, of wist dat. Enkel
 * voor zichzelf, en enkel als lid van de post in dat werkingsjaar. Wie wist,
 * valt ook uit de indeling van dat blok. Geen logboekregel: het is
 * zelfbediening, zoals een eigen reservatie.
 */
export async function setDutyAvailabilityAction(input: {
  date: string;
  slot: string;
  available: boolean;
}): Promise<SaveState> {
  const session = await requirePermission('theokot.manage');
  const block = parseBlock(input.date, input.slot);
  if (!block) return saveError('INVALID_BLOCK');
  const userId = session.user.id;
  if (!(await isDutyMember(userId, dutyYearOf(mondayOf(block.day))))) return saveError('NOT_MEMBER');

  const where = { date: block.date, slot: block.slot, userId };
  if (input.available) {
    if (!(await blockSettings(block)).open) return saveError('CLOSED');
    await prisma.theokotDutyAvailability.createMany({ data: [where], skipDuplicates: true });
  } else {
    await prisma.$transaction([
      prisma.theokotDutyAssignment.deleteMany({ where }),
      prisma.theokotDutyAvailability.deleteMany({ where }),
    ]);
  }
  revalidateDuty();
  return saveOk();
}

/**
 * Iemand indelen in een blok, of niet meer. Enkel wie het blok aanduidde. Een
 * blok voor één persoon wisselt: wie er stond, maakt plaats. In een blok voor
 * meer is "vol" een fout, want wie er moet wijken is dan niet te raden.
 */
export async function setDutyAssignmentAction(input: {
  date: string;
  slot: string;
  userId: string;
  assigned: boolean;
}): Promise<SaveState> {
  await requirePermission('theokot.manage');
  const block = parseBlock(input.date, input.slot);
  if (!block || typeof input.userId !== 'string') return saveError('INVALID_BLOCK');
  const where = { date: block.date, slot: block.slot };
  const person = await prisma.user.findUnique({ where: { id: input.userId }, select: { name: true } });
  if (!person) return saveError('INVALID_BLOCK');

  if (!input.assigned) {
    await prisma.theokotDutyAssignment.deleteMany({ where: { ...where, userId: input.userId } });
    await logAudit({
      action: 'update',
      entity: 'theokotDuty',
      target: blockLabel(block.day, block.slot),
      summary: `${person.name} niet meer ingedeeld`,
    });
    revalidateDuty();
    return saveOk();
  }

  const settings = await blockSettings(block);
  if (!settings.open) return saveError('CLOSED');
  const canDo = await prisma.theokotDutyAvailability.findUnique({
    where: { date_slot_userId: { ...where, userId: input.userId } },
    select: { userId: true },
  });
  if (!canDo) return saveError('NOT_AVAILABLE');

  const outcome = await prisma.$transaction(async (tx) => {
    const current = await tx.theokotDutyAssignment.findMany({ where, select: { userId: true } });
    if (current.some((row) => row.userId === input.userId)) return 'ok' as const;
    let replaced: string[] = [];
    if (current.length >= settings.capacity) {
      if (settings.capacity > 1) return 'full' as const;
      replaced = current.map((row) => row.userId);
      await tx.theokotDutyAssignment.deleteMany({ where });
    }
    await tx.theokotDutyAssignment.create({ data: { ...where, userId: input.userId } });
    return replaced;
  });
  if (outcome === 'full') return saveError('FULL');

  let summary = `${person.name} ingedeeld`;
  if (Array.isArray(outcome) && outcome.length > 0) {
    const gone = await prisma.user.findMany({ where: { id: { in: outcome } }, select: { name: true } });
    summary += ` in plaats van ${gone.map((row) => row.name).join(', ')}`;
  }
  await logAudit({ action: 'update', entity: 'theokotDuty', target: blockLabel(block.day, block.slot), summary });
  revalidateDuty();
  return saveOk();
}

/**
 * Het eerlijke voorstel voor een week (`proposeDuty`): vult enkel open plaatsen
 * en laat staan wie al ingedeeld is.
 */
export async function proposeDutyAction(input: { week: string }): Promise<SaveState> {
  await requirePermission('theokot.manage');
  const day = typeof input.week === 'string' ? parseYMD(input.week) : null;
  if (!day) return saveError('INVALID_BLOCK');
  const monday = mondayOf(day);
  const week = await loadDutyWeek(monday);
  const counts: Record<string, number> = {};
  for (const person of week.people) {
    counts[person.id] = person.yearBase + week.cells.filter((cell) => cell.assigned.includes(person.id)).length;
  }
  const proposals = proposeDuty(week.cells, counts);
  if (proposals.length === 0) return saveError('NOTHING_TO_PROPOSE');

  const created = await prisma.theokotDutyAssignment.createMany({
    data: proposals.map((proposal) => ({
      date: dutyDate(parseYMD(proposal.date)!),
      slot: proposal.slot,
      userId: proposal.userId,
    })),
    skipDuplicates: true,
  });
  await logAudit({
    action: 'update',
    entity: 'theokotDuty',
    target: `Theokot week van ${ymdKey(monday)}`,
    summary: `Eerlijk voorstel: ${created.count} plaats(en) ingevuld`,
  });
  revalidateDuty();
  return saveOk(String(created.count));
}

/**
 * Een blok aanpassen: hoeveel verantwoordelijken, of het er die dag is, en een
 * notitie. Een blok dat weer de standaard volgt, verliest zijn rij.
 */
export async function saveDutyBlockAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission('theokot.manage');
  const block = parseBlock(formData.get('date'), formData.get('slot'));
  if (!block) return saveError('INVALID_BLOCK');
  const capacity = Number(formData.get('capacity'));
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_DUTY_CAPACITY) return saveError('INVALID_CAPACITY');
  const open = formData.get('open') === 'on';
  const note =
    String(formData.get('note') ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_DUTY_NOTE) || null;

  const where = { date: block.date, slot: block.slot };
  const assigned = await prisma.theokotDutyAssignment.count({ where });
  if (!open && assigned > 0) return saveError('CLOSE_WITH_ASSIGNED');
  if (capacity < assigned) return saveError('CAPACITY_BELOW_ASSIGNED');

  const settings = { capacity, open, note };
  if (isDefaultDutyBlock(block.day, block.slot, settings)) {
    await prisma.theokotDutyBlock.deleteMany({ where });
  } else {
    await prisma.theokotDutyBlock.upsert({
      where: { date_slot: where },
      create: { ...where, ...settings },
      update: settings,
    });
  }
  const parts = [
    `${capacity} verantwoordelijke(n)`,
    open ? 'open' : 'geen blok',
    note ? `notitie "${note}"` : 'geen notitie',
  ];
  await logAudit({
    action: 'update',
    entity: 'theokotDuty',
    target: blockLabel(block.day, block.slot),
    summary: parts.join(', '),
  });
  revalidateDuty();
  return saveOk();
}

/**
 * De startstand van een werkingsjaar per verantwoordelijke: wat die al
 * openhield voor het rooster op de site stond. Een leeg veld of 0 wist de rij.
 * Velden heten `count:<userId>`; enkel leden van dat jaar en wie al een
 * startstand had, worden aangenomen.
 */
export async function saveDutyCarryOverAction(_prev: SaveState, formData: FormData): Promise<SaveState> {
  await requirePermission('theokot.manage');
  const year = Number(formData.get('year'));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return saveError('INVALID_BLOCK');

  const allowed = new Set((await dutyMembers(year)).map((member) => member.id));
  const existing = await prisma.theokotDutyCarryOver.findMany({
    where: { year },
    select: { userId: true, count: true },
  });
  for (const row of existing) allowed.add(row.userId);
  const before = new Map(existing.map((row) => [row.userId, row.count]));

  const values = new Map<string, number>();
  for (const [name, raw] of formData.entries()) {
    if (!name.startsWith('count:')) continue;
    const userId = name.slice('count:'.length);
    if (!allowed.has(userId)) continue;
    const text = String(raw).trim();
    const count = text === '' ? 0 : Number(text);
    if (!Number.isInteger(count) || count < 0 || count > MAX_DUTY_CARRY_OVER) return saveError('INVALID_COUNT');
    values.set(userId, count);
  }

  const changed = [...values].filter(([userId, count]) => (before.get(userId) ?? 0) !== count);
  if (changed.length === 0) return saveOk();
  await prisma.$transaction(
    changed.map(([userId, count]) =>
      count === 0
        ? prisma.theokotDutyCarryOver.deleteMany({ where: { year, userId } })
        : prisma.theokotDutyCarryOver.upsert({
            where: { year_userId: { year, userId } },
            create: { year, userId, count },
            update: { count },
          })
    )
  );
  const names = new Map(
    (
      await prisma.user.findMany({ where: { id: { in: changed.map(([id]) => id) } }, select: { id: true, name: true } })
    ).map((u) => [u.id, u.name])
  );
  await logAudit({
    action: 'update',
    entity: 'theokotDuty',
    target: `Startstand verantwoordelijken ${formatWorkingYear(year)}`,
    summary: changed.map(([id, count]) => `${names.get(id) ?? id}: ${count}`).join(', '),
  });
  revalidateDuty();
  return saveOk();
}
