import type { MeetingFriendRole } from "@prisma/client";
import type { MeetingAdminView, MeetingReservationRow, MeetingTheokotOrderRow } from "./MeetingDetail";

export type FriendGroups = { bringers: MeetingReservationRow[]; friends: MeetingReservationRow[] };

/**
 * Vriendjesbureau: wie een vriendje meeneemt en wie er een is, alfabetisch.
 * Een ongeldig broodje telt mee: die persoon staat nog altijd ingeschreven.
 */
export function friendGroups(meeting: MeetingAdminView): FriendGroups {
  const byName = (a: MeetingReservationRow, b: MeetingReservationRow) => a.name.localeCompare(b.name, "nl");
  return {
    bringers: meeting.reservations.filter((row) => row.friendRole === "BRINGS_FRIEND").sort(byName),
    friends: meeting.reservations.filter((row) => row.friendRole === "IS_FRIEND").sort(byName),
  };
}

/**
 * Vanaf zoveel eerdere bureaus is een vriendje het nakijken waard: een vriendje
 * was nog nooit of maar één keer op bureau.
 */
export const FRIEND_EARLIER_LIMIT = 2;

/** Het woord achter een naam in "Per persoon" en op het uitdeelscherm. */
export function friendRoleTag(role: MeetingFriendRole, nl: boolean): string {
  if (role === "BRINGS_FRIEND") return nl ? "neemt een vriendje mee" : "brings a friend";
  return nl ? "vriendje" : "friend";
}

export type CountRow = { name: string; count: number; external: number };

/**
 * Wat er mee moet, per broodje en per drankje. Een ongeldige inschrijving telt
 * niet mee: die persoon moet nog opnieuw kiezen. Wat grocos zelf bij Theokot
 * bestelden, gaat mee in dezelfde doos en telt dus bij de broodjes.
 */
export function handoutCounts(meeting: MeetingAdminView): { items: CountRow[]; drinks: CountRow[] } {
  const items = new Map<string, CountRow>();
  const drinks = new Map<string, CountRow>();
  const add = (map: Map<string, CountRow>, name: string, count: number, external: boolean) => {
    const row = map.get(name) ?? { name, count: 0, external: 0 };
    row.count += count;
    if (external) row.external += count;
    map.set(name, row);
  };
  for (const row of meeting.reservations) {
    if (row.invalid) continue;
    if (row.item) add(items, row.item, 1, row.external);
    if (row.drink) add(drinks, row.drink, 1, false);
  }
  for (const order of meeting.theokotOrders) {
    for (const line of order.lines) add(items, line.name, line.quantity, false);
  }
  const sorted = (map: Map<string, CountRow>) =>
    [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "nl"));
  return { items: sorted(items), drinks: sorted(drinks) };
}

export type PersonEntry = {
  key: string;
  name: string;
  reservation: MeetingReservationRow | null;
  theokot: MeetingTheokotOrderRow[];
};

/**
 * Iedereen die iets krijgt of komt, alfabetisch. Een groco met een inschrijving
 * én een eigen Theokot-bestelling staat er één keer, met beide. De kaart "Per
 * persoon" en het uitdeelscherm lezen allebei deze lijst, zodat ze nooit iets
 * anders tonen.
 */
export function personEntries(meeting: MeetingAdminView): PersonEntry[] {
  const entries = new Map<string, PersonEntry>();
  for (const row of meeting.reservations) {
    entries.set(`r:${row.id}`, { key: `r:${row.id}`, name: row.name, reservation: row, theokot: [] });
  }
  for (const order of meeting.theokotOrders) {
    const existing = [...entries.values()].find((entry) => entry.name === order.name);
    if (existing) existing.theokot.push(order);
    else entries.set(`t:${order.id}`, { key: `t:${order.id}`, name: order.name, reservation: null, theokot: [order] });
  }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name, "nl"));
}
