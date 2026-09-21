import { shiftYMD, ymdKey } from "@/lib/brussels";

/**
 * De rekenkunde achter de verhuurkalenders, zonder React.
 *
 * Twee kalenders tekenen dezelfde verhuren: die van het beheer
 * (`/admin/theokot/verhuur`, maand, week en dag) en de publieke
 * beschikbaarheidskalender op `/theokot/verhuur` (maand). Alles wat ze delen
 * staat hier, want een tweede kopie van "een einduur voor het startuur is de
 * volgende ochtend" loopt uiteen en dan staat dezelfde avond publiek op een
 * andere dag dan in het beheer.
 *
 * Er wordt bewust op jaar/maand/dag gerekend en niet op instants: de verhuren
 * komen als `day` plus minuten sinds middernacht binnen, al omgezet naar
 * Brussel-wandklok op de server (zie `rentalGridSlot` in `lib/theokotVerhuur.ts`),
 * zodat een laptop die per ongeluk op UTC staat niets anders toont dan de rest.
 */

/** Het minimum dat een blokje nodig heeft om in een raster te belanden. */
export type GridItem = {
  id: string;
  /** "YYYY-MM-DD" in Brussel, de dag waarop de verhuur begint. */
  day: string;
  minutes: number;
  /** Boven de 1440 wanneer de verhuur na middernacht doorloopt. */
  endMinutes: number;
};

/** "YYYY-MM-DD" van een lokale `Date`, de sleutel waarop de rasters groeperen. */
export function dayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** De maandag van de week waar `date` in valt. */
export function mondayOf(date: Date): Date {
  const shift = (date.getDay() + 6) % 7;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - shift);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Zes rijen van zeven dagen, maandag eerst; hetzelfde raster als /kalender. */
export function monthCells(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = mondayOf(first);
  return Array.from(
    { length: 42 },
    (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i),
  );
}

export function weekdayLabels(nl: boolean): string[] {
  return nl
    ? ["ma", "di", "wo", "do", "vr", "za", "zo"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
}

/** De verhuren per dag, elke dag op beginuur gesorteerd. */
export function groupByDay<T extends GridItem>(items: readonly T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const bucket = map.get(item.day);
    if (bucket) bucket.push(item);
    else map.set(item.day, [item]);
  }
  for (const bucket of map.values()) bucket.sort((a, b) => a.minutes - b.minutes);
  return map;
}

export type TimeGridSegment<T extends GridItem> = {
  key: string;
  day: string;
  minutes: number;
  endMinutes: number;
  isContinuation: boolean;
  item: T;
};

/**
 * Splitst verhuren die na middernacht doorlopen op in twee blokken voor het
 * tijdrooster: avonddeel (start tot 24:00) en ochtenddeel (00:00 tot einde).
 */
export function buildRentalTimeSegments<T extends GridItem>(
  items: readonly T[],
): Map<string, TimeGridSegment<T>[]> {
  const map = new Map<string, TimeGridSegment<T>[]>();
  for (const item of items) {
    const day1End = Math.min(item.endMinutes, 24 * 60);
    const seg1: TimeGridSegment<T> = {
      key: `${item.id}-start`,
      day: item.day,
      minutes: item.minutes,
      endMinutes: day1End,
      isContinuation: false,
      item,
    };
    const b1 = map.get(item.day);
    if (b1) b1.push(seg1);
    else map.set(item.day, [seg1]);

    if (item.endMinutes > 24 * 60) {
      const [y, m, d] = item.day.split("-").map(Number);
      const nextDay = ymdKey(shiftYMD({ year: y!, month: m!, day: d! }, 1));
      const seg2: TimeGridSegment<T> = {
        key: `${item.id}-cont`,
        day: nextDay,
        minutes: 0,
        endMinutes: Math.min(item.endMinutes - 24 * 60, 24 * 60),
        isContinuation: true,
        item,
      };
      const b2 = map.get(nextDay);
      if (b2) b2.push(seg2);
      else map.set(nextDay, [seg2]);
    }
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.minutes - b.minutes || a.endMinutes - b.endMinutes);
  }
  return map;
}
