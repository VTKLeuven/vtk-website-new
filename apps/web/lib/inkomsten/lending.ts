/**
 * De dagen van een uitlening van een toestel (`IncomeChannelLending`), als pure
 * functies: wat de server nakijkt voor hij er een bewaart. Een dag loopt van
 * 9:00 tot 9:00 de ochtend erna, zoals in Na te kijken (`reviewDay`).
 */
import { parseYMD, ymdKey } from "@/lib/brussels";

/** Meer dan een jaar is wellicht een tikfout in het jaartal. */
export const MAX_LENDING_DAYS = 366;

export type LendingDays = { from: string; to: string };

export type LendingDaysCheck =
  | ({ ok: true } & LendingDays)
  | { ok: false; error: "BAD_DATE" | "LENDING_ORDER" | "LENDING_TOO_LONG" };

/** Het aantal dagen van een uitlening, beide grenzen inbegrepen. */
export function lendingDayCount(days: LendingDays): number {
  return Math.round((Date.parse(`${days.to}T00:00:00Z`) - Date.parse(`${days.from}T00:00:00Z`)) / 86_400_000) + 1;
}

/**
 * De eerste en de laatste dag uit een formulier. Zonder laatste dag is het één
 * dag: zo leende het oude formulier een toestel uit.
 */
export function checkLendingDays(fromDay: string, toDay: string): LendingDaysCheck {
  const first = parseYMD(fromDay.trim());
  const last = toDay.trim() ? parseYMD(toDay.trim()) : first;
  if (!first || !last) return { ok: false, error: "BAD_DATE" };
  const days = { from: ymdKey(first), to: ymdKey(last) };
  if (days.to < days.from) return { ok: false, error: "LENDING_ORDER" };
  if (lendingDayCount(days) > MAX_LENDING_DAYS) return { ok: false, error: "LENDING_TOO_LONG" };
  return { ok: true, ...days };
}

/**
 * Een andere uitlening van hetzelfde kanaal die een van die dagen deelt. Twee
 * uitleningen op één dag zouden elkaar tegenspreken: welke code geldt dan?
 */
export function overlappingLending<T extends LendingDays & { id: string }>(
  others: readonly T[],
  days: LendingDays,
  ownId: string | null,
): T | null {
  return others.find((other) => other.id !== ownId && other.from <= days.to && days.from <= other.to) ?? null;
}
