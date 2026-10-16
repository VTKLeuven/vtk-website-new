import { isoWeekday, isoWeekKey, parseYMD, shiftYMD, ymdKey, type YMD } from "@/lib/brussels";

/**
 * De aanvragen per week, zoals commu ze inplant: het weekoverzicht en het
 * Bakske gaan per week de deur uit. Dezelfde koppen als op /shift ("Deze
 * week", "Volgende week", "Week 43"), zodat een week op de hele site hetzelfde
 * heet.
 *
 * Puur: de dag van vandaag komt binnen als `yyyy-mm-dd` in Brusselse tijd.
 */

export type WeekGroup<T> = {
  /** "2026-W43" */
  key: string;
  /** 0 = deze week, 1 = volgende, -1 = vorige. */
  offset: number;
  week: number;
  /** Maandag en zondag als `yyyy-mm-dd`. */
  monday: string;
  sunday: string;
  items: T[];
};

function mondayOf(ymd: YMD): YMD {
  return shiftYMD(ymd, 1 - isoWeekday(ymd));
}

function daysBetween(a: YMD, b: YMD): number {
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000
  );
}

/**
 * Groepeert per ISO-week in de volgorde waarin de items binnenkomen (sorteer
 * dus vooraf). Items zonder geldige datum komen in `undated`.
 */
export function groupByWeek<T>(
  items: readonly T[],
  dateOf: (item: T) => string | null,
  today: string
): { weeks: WeekGroup<T>[]; undated: T[] } {
  const todayYmd = parseYMD(today);
  if (!todayYmd) throw new Error("INVALID_TODAY");
  const thisMonday = mondayOf(todayYmd);

  const weeks: WeekGroup<T>[] = [];
  const byKey = new Map<string, WeekGroup<T>>();
  const undated: T[] = [];

  for (const item of items) {
    const raw = dateOf(item);
    const ymd = raw ? parseYMD(raw) : null;
    if (!ymd) {
      undated.push(item);
      continue;
    }
    const key = isoWeekKey(ymd);
    let group = byKey.get(key);
    if (!group) {
      const monday = mondayOf(ymd);
      group = {
        key,
        offset: Math.round(daysBetween(thisMonday, monday) / 7),
        week: Number(key.split("-W")[1]),
        monday: ymdKey(monday),
        sunday: ymdKey(shiftYMD(monday, 6)),
        items: [],
      };
      byKey.set(key, group);
      weeks.push(group);
    }
    group.items.push(item);
  }

  return { weeks, undated };
}

export function weekTitle(group: Pick<WeekGroup<unknown>, "offset" | "week">, nl: boolean): string {
  if (group.offset === 0) return nl ? "Deze week" : "This week";
  if (group.offset === 1) return nl ? "Volgende week" : "Next week";
  if (group.offset === -1) return nl ? "Vorige week" : "Last week";
  return nl ? `Week ${group.week}` : `Week ${group.week}`;
}
