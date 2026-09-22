import { parseYMD, shiftYMD, ymdKey } from "@/lib/brussels";

/**
 * De rekenkant van de grafieken op /admin/mailinglijsten: dagen op een rij
 * zetten, optellen en een gereconstrueerd verleden aan de echte telling
 * vastknopen. Bewust puur, zodat de randgevallen (een dag zonder opt-ins, een
 * telling die pas vandaag begint) testbaar zijn zonder database.
 *
 * Een dag is overal een Brusselse kalenderdag als `yyyy-mm-dd`, zoals
 * `ymdKey` die maakt.
 */

/** Elke dag van `from` tot en met `to`; leeg wanneer `to` voor `from` ligt. */
export function dayRange(from: string, to: string): string[] {
  const start = parseYMD(from);
  const end = parseYMD(to);
  if (!start || !end || to < from) return [];
  const days: string[] = [];
  for (let day = start; ymdKey(day) <= to; day = shiftYMD(day, 1)) days.push(ymdKey(day));
  return days;
}

/** `n` dagen terug vanaf een dag (of vooruit met een negatieve `n`). */
export function daysBefore(day: string, n: number): string {
  const ymd = parseYMD(day);
  return ymd ? ymdKey(shiftYMD(ymd, -n)) : day;
}

/**
 * Het lopende totaal op elke dag van `days`: `before` (alles van voor de eerste
 * dag) plus wat er tot en met die dag bijkwam.
 */
export function cumulative(days: string[], perDay: ReadonlyMap<string, number>, before = 0): number[] {
  let running = before;
  return days.map((day) => {
    running += perDay.get(day) ?? 0;
    return running;
  });
}

/**
 * Hoeveel er binnen kwam voor de eerste dag van het venster; de beginstand van
 * {@link cumulative} wanneer de grafiek niet bij de allereerste dag start.
 */
export function totalBefore(perDay: ReadonlyMap<string, number>, firstDay: string): number {
  let total = 0;
  for (const [day, count] of perDay) if (day < firstDay) total += count;
  return total;
}

export type History = {
  /** De waarde per dag, of `null` waar er niets te tonen valt. */
  values: (number | null)[];
  /**
   * Tot (exclusief) welke index de waarden gereconstrueerd zijn en niet
   * gemeten. 0 = alles gemeten.
   */
  reconstructedUntil: number;
};

/**
 * Knoopt een gereconstrueerd verleden aan een echte dagelijkse telling.
 *
 * Waar er een telling is, geldt die: ze telt ook wie intussen wegviel. Voor de
 * eerste telling vult de reconstructie aan, die enkel ziet wie er vandaag nog
 * staat. Na de eerste telling wordt er niet meer gereconstrueerd; een dag zonder
 * telling (de worker lag stil) blijft een gat in plaats van een verzonnen punt.
 */
export function joinHistory(
  days: string[],
  measured: ReadonlyMap<string, number>,
  reconstructed: readonly number[] | null,
): History {
  const first = days.findIndex((day) => measured.has(day));
  const reconstructedUntil = reconstructed ? (first === -1 ? days.length : first) : 0;
  const values = days.map((day, i) => {
    const value = measured.get(day);
    if (value !== undefined) return value;
    if (reconstructed && i < reconstructedUntil) return reconstructed[i] ?? null;
    return null;
  });
  return { values, reconstructedUntil };
}

/**
 * Ronde maatstreepjes voor een as van 0 tot minstens `max`: 1, 2 of 5 maal een
 * macht van tien (en minstens 1), en zo dat er drie tot vijf streepjes zijn.
 */
export function niceTicks(max: number, target = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  // Nooit onder 1: het zijn aantallen mensen, en "0,5 opt-ins" is geen streepje.
  const step = Math.max(
    1,
    [1, 2, 5, 10].map((f) => f * magnitude).find((s) => s >= raw) ?? magnitude * 10,
  );
  const ticks: number[] = [];
  for (let tick = 0; tick < max + step; tick += step) {
    ticks.push(tick);
    if (tick >= max) break;
  }
  return ticks;
}
