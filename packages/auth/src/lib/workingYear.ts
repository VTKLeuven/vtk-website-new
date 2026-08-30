/**
 * De twee jaargrenzen van de site, gedeeld tussen de apps en de sessie-resolver.
 *
 * Beide tellen in startjaren van het academiejaar (2026 = "26-27"), maar ze
 * kantelen op een andere dag, en dat verschil is het punt:
 *
 * - **Werkingsjaar** ({@link currentWorkingYear}): begint op 15 juli. Dat is
 *   wanneer het nieuwe praesidium aantreedt. Roltoewijzingen en
 *   postlidmaatschappen zijn per werkingsjaar opgeslagen, dus deze cutover is
 *   meteen ook de 15-juli-reset: na de cutover tellen enkel de toewijzingen van
 *   het nieuwe jaar mee. `User.isSuperAdmin` is de enige uitzondering die niet
 *   reset (het is een boolean op de user, geen jaartoewijzing).
 * - **Studiejaar** ({@link currentStudyYear}): begint op 27 september, en enkel
 *   de jaarlijkse studiebevestiging (`User.studyConfirmedYear`) hangt eraan. Het
 *   academiejaar loopt door tot eind september, dus wie op 15 juli zijn studie
 *   "voor het nieuwe jaar" bevestigt, duidt in de praktijk nog het jaar aan dat
 *   net gedaan is. De bevestiging hoort dus pas te vervallen wanneer het
 *   academiejaar effectief gedraaid is.
 *
 * Deze logica leeft bewust in @vtk/auth zodat elke app (en de resolver) exact
 * dezelfde cutovers gebruikt. `apps/web/lib/workingYear.ts` her-exporteert dit en
 * voegt app-specifieke helpers toe (tabs, parsing, formatting).
 */

/** Eerste getrackte werkingsjaar. Er is geen historiek van vóór "26-27". */
export const FIRST_WORKING_YEAR = 2026;

/** Dag/maand waarop het nieuwe werkingsjaar begint (15 juli). */
const CUTOVER_MONTH = 7; // juli
const CUTOVER_DAY = 15;

/** Dag/maand waarop de studiebevestiging vervalt (27 september). */
const STUDY_CUTOVER_MONTH = 9; // september
const STUDY_CUTOVER_DAY = 27;

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

/** Het startjaar van het lopende jaar voor een cutover op `month`/`day`. */
function yearAtCutover(date: Date, month: number, day: number): number {
  const ymd = brusselsYmd(date);
  const afterCutover = ymd.month > month || (ymd.month === month && ymd.day >= day);
  return afterCutover ? ymd.year : ymd.year - 1;
}

/**
 * Het huidige werkingsjaar voor een datum (default nu). Geklemd op
 * {@link FIRST_WORKING_YEAR}, zodat we nooit vóór "26-27" belanden.
 */
export function currentWorkingYear(date: Date = new Date()): number {
  return Math.max(yearAtCutover(date, CUTOVER_MONTH, CUTOVER_DAY), FIRST_WORKING_YEAR);
}

/**
 * Het academiejaar waarvoor een studiebevestiging moet gelden (default nu).
 *
 * Bewust **niet** geklemd op {@link FIRST_WORKING_YEAR}: die klem bestaat omdat
 * er geen roldata is van vóór "26-27", en hier zou ze net het tegenovergestelde
 * doen van waarvoor deze cutover gemaakt is. Tussen 15 juli en 27 september 2026
 * zou ze 2026 teruggeven, en dan valt de bevestigingsgate toch in juli.
 */
export function currentStudyYear(date: Date = new Date()): number {
  return yearAtCutover(date, STUDY_CUTOVER_MONTH, STUDY_CUTOVER_DAY);
}

/**
 * Of een account nu door de jaarlijkse studiebevestiging moet.
 *
 * De expliciete studentstatus is essentieel: een oude of ontbrekende
 * `studyConfirmedYear` zegt niets over alumni, academisch personeel of andere
 * niet-studenten. Deze helper houdt de website en mobiele app bij dezelfde
 * poortregel.
 */
export function needsStudyConfirmation(
  user: { isStudent: boolean; studyConfirmedYear: number | null },
  date: Date = new Date(),
): boolean {
  return user.isStudent && user.studyConfirmedYear !== currentStudyYear(date);
}

/**
 * Startmoment van een studiejaar: 27 september van dat jaar (Brussel-tijd, hier
 * benaderd als middernacht UTC; het uur doet er niet toe voor het tonen van "de
 * eerstvolgende omslag"). De tegenhanger voor het werkingsjaar staat in
 * `apps/web/lib/workingYear.ts`.
 */
export function studyYearStart(year: number): Date {
  return new Date(Date.UTC(year, STUDY_CUTOVER_MONTH - 1, STUDY_CUTOVER_DAY));
}
