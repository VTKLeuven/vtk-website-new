/**
 * Werkingsjaar-cutover, gedeeld tussen de apps en de sessie-resolver.
 *
 * Een werkingsjaar is het startjaar van het academiejaar: 2026 = "26-27". Het
 * nieuwe werkingsjaar begint op 15 juli (Brussel-tijd). Roltoewijzingen en
 * postlidmaatschappen zijn per werkingsjaar opgeslagen, dus deze cutover is
 * meteen ook de 15-juli-reset: na de cutover tellen enkel de toewijzingen van
 * het nieuwe jaar mee. `User.isSuperAdmin` is de enige uitzondering die niet
 * reset (het is een boolean op de user, geen jaartoewijzing).
 *
 * Deze logica leeft bewust in @vtk/auth zodat elke app (en de resolver) exact
 * dezelfde cutover gebruikt. `apps/web/lib/workingYear.ts` her-exporteert dit en
 * voegt app-specifieke helpers toe (tabs, parsing, formatting).
 */

/** Eerste getrackte werkingsjaar. Er is geen historiek van vóór "26-27". */
export const FIRST_WORKING_YEAR = 2026;

/** Dag/maand waarop het nieuwe werkingsjaar begint (15 juli). */
const CUTOVER_MONTH = 7; // juli
const CUTOVER_DAY = 15;

/** Huidige datum uitgedrukt in Brussel-tijd (jaar/maand/dag). */
function brusselsYmd(date: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
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
