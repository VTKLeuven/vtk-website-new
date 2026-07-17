// Werkingsjaar-logica voor posten (groepen).
//
// De cutover zelf (15 juli, Brussel) en `currentWorkingYear` leven in @vtk/auth,
// zodat de apps én de sessie-resolver exact dezelfde 15-juli-reset gebruiken.
// Dit bestand voegt enkel app-specifieke helpers toe (tabs, parsing, formatting).
// Omdat memberships en roltoewijzingen per jaar worden bijgehouden, begint een
// nieuw werkingsjaar automatisch met lege posten en blijft de historiek bewaard.

import { currentWorkingYear, FIRST_WORKING_YEAR } from "@vtk/auth";

export { currentWorkingYear, FIRST_WORKING_YEAR };

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

/**
 * Startmoment van een werkingsjaar: 15 juli van dat jaar (Brussel-tijd, hier
 * benaderd als middernacht UTC; het uur doet er niet toe voor "is deze pagina
 * dit werkingsjaar al bijgewerkt?"-checks).
 */
export function workingYearStart(year: number): Date {
  return new Date(Date.UTC(year, 6, 15));
}

/** Parse een `?jaar=`-querywaarde naar een geldig werkingsjaar (of het huidige). */
export function parseWorkingYear(raw: string | undefined, now: Date = new Date()): number {
  const n = Number(raw);
  if (Number.isInteger(n) && n >= FIRST_WORKING_YEAR && n <= currentWorkingYear(now) + 5) {
    return n;
  }
  return currentWorkingYear(now);
}
