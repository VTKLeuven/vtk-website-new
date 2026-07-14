// Werkingsjaar-logica voor posten (groepen).
//
// Een werkingsjaar is het startjaar van het academiejaar: 2026 = "26-27". Het
// nieuwe werkingsjaar begint op 15 juli (Brussel-tijd). Omdat memberships per
// jaar worden bijgehouden, begint een nieuw werkingsjaar automatisch met lege
// posten en blijft de historiek van vorige jaren bewaard.

/** Eerste getrackte werkingsjaar. Er is geen historiek van vóór "26-27". */
export const FIRST_WORKING_YEAR = 2026;

/** Dag/maand waarop het nieuwe werkingsjaar begint (15 juli). */
const CUTOVER_MONTH = 7; // juli
const CUTOVER_DAY = 15;

/** Huidige datum uitgedrukt in Brussel-tijd (jaar/maand/dag). */
function brusselsYmd(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * Het huidige werkingsjaar voor een datum (default nu). Geklemd op
 * {@link FIRST_WORKING_YEAR}, zodat we nooit vóór "26-27" belanden.
 */
export function currentWorkingYear(date: Date = new Date()): number {
  const { year, month, day } = brusselsYmd(date);
  const afterCutover = month > CUTOVER_MONTH || (month === CUTOVER_MONTH && day >= CUTOVER_DAY);
  const wy = afterCutover ? year : year - 1;
  return Math.max(wy, FIRST_WORKING_YEAR);
}

/** Formatteer een werkingsjaar als "26-27". */
export function formatWorkingYear(year: number): string {
  const a = String(year % 100).padStart(2, "0");
  const b = String((year + 1) % 100).padStart(2, "0");
  return `${a}-${b}`;
}

/**
 * De lijst werkingsjaren om als tabjes te tonen: van het huidige werkingsjaar
 * terug tot {@link FIRST_WORKING_YEAR}, samen met eventuele jaren waarvoor al
 * data bestaat (bv. een vooruit aangemaakt jaar). Aflopend gesorteerd (nieuwste
 * eerst).
 */
export function workingYearTabs(yearsWithData: number[] = [], now: Date = new Date()): number[] {
  const current = currentWorkingYear(now);
  const set = new Set<number>();
  for (let y = FIRST_WORKING_YEAR; y <= current; y += 1) set.add(y);
  for (const y of yearsWithData) if (y >= FIRST_WORKING_YEAR) set.add(y);
  return [...set].sort((a, b) => b - a);
}

/** Parse een `?jaar=`-querywaarde naar een geldig werkingsjaar (of het huidige). */
export function parseWorkingYear(raw: string | undefined, now: Date = new Date()): number {
  const n = Number(raw);
  if (Number.isInteger(n) && n >= FIRST_WORKING_YEAR && n <= currentWorkingYear(now) + 5) {
    return n;
  }
  return currentWorkingYear(now);
}
