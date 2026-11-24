/**
 * Het rekenwerk van de appstatistieken dat geen database nodig heeft: een reeks
 * dagen of weken opvullen, en de cohorten in een tabel gieten. Puur, zodat het
 * zonder Postgres te testen is (`test/appUsageSeries.test.ts`).
 */

/** "yyyy-mm-dd" plus `n` dagen, in UTC gerekend: dan bestaat er geen zomeruur. */
export function addDays(day: string, n: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** De maandag van een dag. */
export function mondayOf(day: string): string {
  const date = new Date(`${day}T12:00:00Z`);
  return addDays(day, -((date.getUTCDay() + 6) % 7));
}

/** Een tijdstip als dag in Brussel. */
export function brusselsDay(at: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/**
 * Alle sleutels van `from` tot en met `to`: elke dag, of elke maandag wanneer
 * `unit` een week is. `from` en `to` zijn dagen; bij weken telt de week waarin
 * ze vallen.
 */
export function seriesKeys(from: string, to: string, unit: "day" | "week"): string[] {
  const keys: string[] = [];
  const step = unit === "week" ? 7 : 1;
  const start = unit === "week" ? mondayOf(from) : from;
  const end = unit === "week" ? mondayOf(to) : to;
  for (let key = start; key <= end; key = addDays(key, step)) keys.push(key);
  return keys;
}

/** Waarden per sleutel (uit een GROUP BY) op de volledige as, met 0 waar er niets was. */
export function fill(keys: string[], rows: { key: string; value: number }[]): number[] {
  const map = new Map(rows.map((row) => [row.key, row.value]));
  return keys.map((key) => map.get(key) ?? 0);
}

export type CohortRow = {
  /** De maandag van de week waarin de installaties begonnen. */
  week: string;
  size: number;
  /** Per week na de start (0 = de week zelf) het aandeel dat de app opende; null voor een week die nog moet komen. */
  shares: (number | null)[];
};

/**
 * De cohorttabel: per installatieweek hoeveel van die installaties in week
 * 0, 1, 2, ... nog een sessie hadden. Een week die nog niet voorbij is (of nog
 * moet komen) is `null` en niet 0: anders lijkt de jongste cohort het slechtst.
 */
export function cohortTable(
  sizes: { week: string; size: number }[],
  active: { week: string; offset: number; installs: number }[],
  weeks: number,
  currentMonday: string,
): CohortRow[] {
  return sizes.map(({ week, size }) => {
    const shares = Array.from({ length: weeks }, (_, offset): number | null => {
      if (addDays(week, offset * 7) > currentMonday) return null;
      const hit = active.find((row) => row.week === week && row.offset === offset);
      return size > 0 ? (hit?.installs ?? 0) / size : null;
    });
    return { week, size, shares };
  });
}

/** Een deel van een geheel, of null wanneer er geen geheel is. */
export function share(part: number, total: number): number | null {
  return total > 0 ? part / total : null;
}
