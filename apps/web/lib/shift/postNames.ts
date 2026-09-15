import { prisma } from '@vtk/db';
import { pick, type Locale } from '@vtk/i18n';

/**
 * Groepscode naar postnaam in de taal van de pagina. Een shift bewaart de code
 * (`Shift.post` is `Group.code`, bv. `CURSUSDIENST`), maar tonen doen we de naam
 * ("Cursusdienst"). Ook gedeactiveerde posten tellen mee: oude shiften hangen
 * er nog aan.
 */
export async function loadPostNames(locale: Locale): Promise<Record<string, string>> {
  const groups = await prisma.group.findMany({
    select: { code: true, nameNl: true, nameEn: true },
  });
  return Object.fromEntries(groups.map((g) => [g.code, pick(g.nameNl, g.nameEn, locale)]));
}
