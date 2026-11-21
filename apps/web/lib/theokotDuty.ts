/**
 * De verantwoordelijken van Theokot (/admin/theokot/shiften/verantwoordelijken):
 * wie van de post de zaak openhoudt. Elke verantwoordelijke duidt zelf aan in
 * welke blokken die kan, iemand van Theokot deelt in, en een telling per
 * werkingsjaar houdt het eerlijk. Dat verving een rekenblad.
 *
 * Puur en zonder server-imports: de pagina, de acties en de tests rekenen
 * hiermee. Zie docs/design-decisions.md, "Theokot: verantwoordelijken".
 */

import { isoWeekday, type YMD } from '@/lib/brussels';

/**
 * De vaste blokken van een dag. De ochtend begint om 10:00, een halfuur voor
 * de gewone shifters, en het avondblok bestaat enkel van maandag tot donderdag.
 * Een afwijking op één dag (een tweede persoon, een avond op vrijdag, een dag
 * dicht) is een `TheokotDutyBlock`, geen wijziging hier.
 */
export const DUTY_SLOTS = [
  { key: 'ochtend', start: '10:00', end: '12:30', weekdays: [1, 2, 3, 4, 5] },
  { key: 'middag', start: '12:30', end: '14:00', weekdays: [1, 2, 3, 4, 5] },
  { key: 'namiddag', start: '14:00', end: '16:00', weekdays: [1, 2, 3, 4, 5] },
  { key: 'avond', start: '16:00', end: '18:00', weekdays: [1, 2, 3, 4] },
] as const;

export type DutySlotKey = (typeof DUTY_SLOTS)[number]['key'];

/** Meer verantwoordelijken dan dit in één blok is een tikfout. */
export const MAX_DUTY_CAPACITY = 4;
/** Een notitie is een woord of twee ("Bureau"), geen verslag. */
export const MAX_DUTY_NOTE = 80;
/** De startstand van een werkingsjaar; meer is een tikfout. */
export const MAX_DUTY_CARRY_OVER = 999;

export function isDutySlot(value: unknown): value is DutySlotKey {
  return DUTY_SLOTS.some((slot) => slot.key === value);
}

export function dutySlot(key: DutySlotKey) {
  return DUTY_SLOTS.find((slot) => slot.key === key)!;
}

export type DutyBlockSettings = { capacity: number; open: boolean; note: string | null };

/** Wat een blok is zonder eigen rij: één verantwoordelijke, open op zijn dagen. */
export function defaultDutyBlock(day: YMD, slot: DutySlotKey): DutyBlockSettings {
  const weekdays: readonly number[] = dutySlot(slot).weekdays;
  return { capacity: 1, open: weekdays.includes(isoWeekday(day)), note: null };
}

/** Volgt een blok de standaard? Dan is er geen rij voor nodig. */
export function isDefaultDutyBlock(day: YMD, slot: DutySlotKey, settings: DutyBlockSettings): boolean {
  const base = defaultDutyBlock(day, slot);
  return settings.capacity === base.capacity && settings.open === base.open && !settings.note;
}

/** Een kalenderdag als `Date` voor een `@db.Date`-kolom. */
export function dutyDate(day: YMD): Date {
  return new Date(Date.UTC(day.year, day.month - 1, day.day));
}

/** `yyyy-mm-dd` van een `@db.Date`-waarde uit de database. */
export function dutyDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const dutyCellKey = (date: string, slot: DutySlotKey) => `${date}|${slot}`;

export type DutyCell = {
  key: string;
  /** `yyyy-mm-dd`. */
  date: string;
  slot: DutySlotKey;
  capacity: number;
  open: boolean;
  note: string | null;
  /** Wie kan, in de volgorde van de personenlijst. */
  available: string[];
  /** Wie ingedeeld is, in volgorde van indelen. */
  assigned: string[];
};

/**
 * - `closed`: geen blok die dag.
 * - `done`: genoeg verantwoordelijken.
 * - `open`: nog iemand te kiezen, en er kan nog iemand.
 * - `none`: nog iemand nodig, maar niemand anders duidde het blok aan.
 */
export type DutyStatus = 'closed' | 'done' | 'open' | 'none';

export function dutyStatus(cell: Pick<DutyCell, 'open' | 'capacity' | 'available' | 'assigned'>): DutyStatus {
  if (!cell.open) return 'closed';
  if (cell.assigned.length >= cell.capacity) return 'done';
  return cell.available.some((id) => !cell.assigned.includes(id)) ? 'open' : 'none';
}

export type DutyTotals = { places: number; filled: number; toPick: number; nobody: number };

export function dutyTotals(cells: DutyCell[]): DutyTotals {
  const open = cells.filter((cell) => cell.open);
  return {
    places: open.reduce((sum, cell) => sum + cell.capacity, 0),
    filled: open.reduce((sum, cell) => sum + Math.min(cell.capacity, cell.assigned.length), 0),
    toPick: open.filter((cell) => dutyStatus(cell) === 'open').length,
    nobody: open.filter((cell) => dutyStatus(cell) === 'none').length,
  };
}

export type DutyProposal = { date: string; slot: DutySlotKey; userId: string };

/**
 * Het eerlijke voorstel: vult de open plaatsen van een week, en laat staan wie
 * al ingedeeld is. Eerst de blokken met de minste kandidaten (wie daar als enige
 * kan, moet er hoe dan ook in), daarna in volgorde van de week. Per plaats wint
 * wie het minst openhield dit werkingsjaar (`counts`, inclusief de startstand en
 * wat er deze week al staat), met een kleine straf voor een tweede blok op
 * dezelfde dag. Bij gelijke stand beslist de volgorde van `counts`, zodat het
 * voorstel bij dezelfde invoer altijd hetzelfde is.
 */
export function proposeDuty(cells: DutyCell[], counts: Record<string, number>): DutyProposal[] {
  const tally = { ...counts };
  const order = Object.keys(counts);
  const assigned = new Map(cells.map((cell) => [cell.key, [...cell.assigned]]));
  const free = (cell: DutyCell) => cell.available.filter((id) => !assigned.get(cell.key)!.includes(id));
  const sameDay = (cell: DutyCell, userId: string) =>
    cells.some((other) => other.date === cell.date && assigned.get(other.key)!.includes(userId));

  const todo = cells
    .map((cell, index) => ({ cell, index }))
    .filter(({ cell }) => cell.open && cell.assigned.length < cell.capacity)
    .sort((a, b) => free(a.cell).length - free(b.cell).length || a.index - b.index);

  const proposals: DutyProposal[] = [];
  for (const { cell } of todo) {
    while (assigned.get(cell.key)!.length < cell.capacity) {
      const options = free(cell);
      if (options.length === 0) break;
      const score = (id: string) => (tally[id] ?? 0) + (sameDay(cell, id) ? 1.5 : 0);
      options.sort((a, b) => score(a) - score(b) || order.indexOf(a) - order.indexOf(b));
      const pick = options[0];
      assigned.get(cell.key)!.push(pick);
      tally[pick] = (tally[pick] ?? 0) + 1;
      proposals.push({ date: cell.date, slot: cell.slot, userId: pick });
    }
  }
  return proposals;
}
