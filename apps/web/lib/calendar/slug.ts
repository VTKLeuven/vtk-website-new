import { prisma } from "@vtk/db";

export { eventSlugBase, SLUG_PATTERN, slugify } from "@vtk/db/slug";

/**
 * Of deze slug nog vrij is voor dit evenement.
 *
 * Kijkt in **beide** tabellen. `/kalender/<iets>` is één routesegment dat eerst
 * een categorie probeert en dan pas een evenement (zie de route-opmerking in
 * `[slugOrId]/page.tsx`), dus een evenement dat "eerstejaars" heet zou nooit
 * bereikbaar zijn: de categoriepagina vangt het adres af.
 */
export async function eventSlugTaken(slug: string, exceptEventId?: string): Promise<boolean> {
  const [event, category] = await Promise.all([
    prisma.calendarEvent.findUnique({ where: { slug }, select: { id: true } }),
    prisma.calendarCategory.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  if (category) return true;
  return event != null && event.id !== exceptEventId;
}

/** Of een categorie deze slug nog mag innemen; spiegelbeeld van hierboven. */
export async function categorySlugTaken(
  slug: string,
  exceptCategoryId?: string,
): Promise<boolean> {
  const [category, event] = await Promise.all([
    prisma.calendarCategory.findUnique({ where: { slug }, select: { id: true } }),
    prisma.calendarEvent.findUnique({ where: { slug }, select: { id: true } }),
  ]);
  if (event) return true;
  return category != null && category.id !== exceptCategoryId;
}

/**
 * De eerste vrije slug vanaf `base`: `galabal-2026`, anders `galabal-2026-2`,
 * `galabal-2026-3`, ...
 *
 * De teller is er voor twee events met dezelfde titel in hetzelfde jaar, bv. een
 * activiteit die wekelijks terugkomt. Zeldzaam genoeg om er geen mooier schema
 * voor te verzinnen, maar hij moet er zijn: de kolom is uniek, en zonder deze lus
 * eindigt dat als een onafgevangen Prisma-fout in de error boundary in plaats van
 * als een opgeslagen evenement.
 */
export async function uniqueEventSlug(base: string, exceptEventId?: string): Promise<string> {
  if (!(await eventSlugTaken(base, exceptEventId))) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${n}`;
    if (!(await eventSlugTaken(candidate, exceptEventId))) return candidate;
  }
  // Honderd events met dezelfde titel in hetzelfde jaar is geen scenario maar een
  // vergissing; een cuid-staart is dan beter dan een opslaanfout.
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}
