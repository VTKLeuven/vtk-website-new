/**
 * De jaargrenzen van de site, gedeeld tussen de apps en de sessie-resolver.
 *
 * Alle drie tellen in startjaren van het academiejaar (2026 = "26-27"), maar ze
 * kantelen op een andere dag, en juist die verschillen zijn het punt:
 *
 * - **Werkingsjaar** ({@link currentWorkingYear}): begint op **15 juli**. Dat is
 *   wanneer het nieuwe praesidium aantreedt. Roltoewijzingen en
 *   postlidmaatschappen zijn per werkingsjaar opgeslagen, dus deze cutover is
 *   meteen ook de 15-juli-reset: na de cutover tellen enkel de toewijzingen van
 *   het nieuwe jaar mee. `User.isSuperAdmin` is de enige uitzondering die niet
 *   reset (het is een boolean op de user, geen jaartoewijzing).
 * - **Academiejaar** ({@link currentStudyYear}): begint op **14 september**. Dan
 *   zijn de herexamens gedaan en ligt vast wie wat gaat studeren, dus vanaf dan
 *   noemen we het nieuwe academiejaar bij naam. Dit is het jaar dat op het
 *   scherm staat ("lid voor 26-27"), het jaar waaronder een lidmaatschap
 *   bewaard wordt, en het jaar dat een bevestiging stempelt. In juli is dat nog
 *   niet te zeggen: wie dan gevraagd wordt "wat studeer je?" antwoordt met het
 *   jaar dat net gedaan is.
 * - **Bevestigingsronde** ({@link studyConfirmationYear}): begint op
 *   **21 september**, een week na het academiejaar. Dat is de dag waarop
 *   iedereen tegelijk de bevestigingsgate voor zijn neus krijgt. Die week
 *   ertussen is bewust: het nieuwe jaar heet al 26-27, maar niemand wordt
 *   geblokkeerd terwijl de eerste lesweek nog moet beginnen, en de bevestiging
 *   van vorig jaar blijft zolang geldig (ook voor de mailinglijsten). Wie in
 *   die week uit zichzelf langskomt, bevestigt gewoon al voor 26-27.
 *
 * Deze logica leeft bewust in @vtk/auth zodat elke app (en de resolver) exact
 * dezelfde grenzen gebruikt. `apps/web/lib/workingYear.ts` her-exporteert dit en
 * voegt app-specifieke helpers toe (tabs, parsing, formatting).
 */

/** Eerste getrackte werkingsjaar. Er is geen historiek van vóór "26-27". */
export const FIRST_WORKING_YEAR = 2026;

/** Dag/maand waarop het nieuwe werkingsjaar begint (15 juli). */
const CUTOVER_MONTH = 7; // juli
const CUTOVER_DAY = 15;

/** Dag/maand waarop het nieuwe academiejaar begint (14 september). */
const STUDY_CUTOVER_MONTH = 9; // september
const STUDY_CUTOVER_DAY = 14;

/** Dag/maand waarop de bevestigingsronde opengaat (21 september). */
const CONFIRM_CUTOVER_MONTH = 9; // september
const CONFIRM_CUTOVER_DAY = 21;

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
 * Het lopende academiejaar (default nu): wat er op het scherm staat, waaronder
 * een lidmaatschap bewaard wordt en wat een bevestiging stempelt.
 *
 * Bewust **niet** geklemd op {@link FIRST_WORKING_YEAR}: die klem bestaat omdat
 * er geen roldata is van vóór "26-27". Een lidmaatschap of een bevestiging van
 * een ouder academiejaar bestaat wel degelijk, en die op 2026 klemmen zou ze op
 * het verkeerde jaar zetten.
 */
export function currentStudyYear(date: Date = new Date()): number {
  return yearAtCutover(date, STUDY_CUTOVER_MONTH, STUDY_CUTOVER_DAY);
}

/**
 * Het academiejaar waarvoor er een bevestiging moet zijn (default nu).
 *
 * Loopt een week achter op {@link currentStudyYear}: tussen 14 en 21 september
 * heet het nieuwe jaar al 26-27, maar telt de bevestiging van vorig jaar nog
 * mee. Zowel de gate ({@link needsStudyConfirmation}) als de geschiktheid voor
 * de mailinglijsten hangt hieraan; liepen die twee uiteen, dan viel iedereen
 * die week uit elke lijst zonder dat er iets gebeurd was.
 */
export function studyConfirmationYear(date: Date = new Date()): number {
  return yearAtCutover(date, CONFIRM_CUTOVER_MONTH, CONFIRM_CUTOVER_DAY);
}

/**
 * Of een account nu door de jaarlijkse studiebevestiging moet.
 *
 * Vergelijkt met de **bevestigingsronde** en niet met het academiejaar: anders
 * stond iedereen op 14 september voor de gate terwijl de eerste lesweek nog
 * moet beginnen. Een bevestiging die al voor het nieuwe jaar geldt (iemand die
 * in die week uit zichzelf langskwam) telt daarbij ook, vandaar `<`.
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
  if (!user.isStudent) return false;
  return (user.studyConfirmedYear ?? -1) < studyConfirmationYear(date);
}

/**
 * Startmoment van een bevestigingsronde: 21 september van dat jaar
 * (Brussel-tijd, hier benaderd als middernacht UTC; het uur doet er niet toe
 * voor het tonen van "de eerstvolgende omslag"). De tegenhanger voor het
 * werkingsjaar staat in `apps/web/lib/workingYear.ts`.
 */
export function studyConfirmationStart(year: number): Date {
  return new Date(Date.UTC(year, CONFIRM_CUTOVER_MONTH - 1, CONFIRM_CUTOVER_DAY));
}
