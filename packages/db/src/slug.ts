/**
 * URL-namen. Bewust in `@vtk/db` en niet in `apps/web`, omdat de seed
 * (`prisma/seed.ts`) dezelfde slug moet kunnen maken als de admin; anders drijft
 * de ene weg van de andere en krijgt een geseed evenement een andere URL dan een
 * evenement dat iemand aanmaakt.
 *
 * Dit bestand importeert met opzet **niets**, en hangt als `@vtk/db/slug` naast
 * de index in de exports-map. Wie hem uit `@vtk/db` zelf zou halen, trekt de
 * PrismaClient mee tot in een clientbundle.
 */

/** Maakt van vrije tekst een URL-naam: kleine letters, cijfers en koppeltekens. */
export function slugify(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Waar een slug aan moet voldoen voor hij in een URL of een feed mag. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Het jaartal van een evenement, in Brusselse tijd. Een cantus die om 00:30
 * begint hoort bij het jaar dat de bezoeker op zijn uitnodiging las, niet bij het
 * jaar waarin UTC toevallig staat.
 */
export function eventSlugYear(start: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    year: "numeric",
  }).format(start);
}

/**
 * De URL-naam van een kalenderevenement: titel plus jaartal, `galabal-2026`.
 *
 * Het jaartal staat er **altijd** achter, ook bij een eenmalig evenement. Galabal,
 * Beiaardcantus en Kick-off komen elk jaar terug, en zonder jaartal zou de eerste
 * editie de mooie naam voorgoed bezetten terwijl net de volgende editie is
 * waarnaar iemand zoekt. Het scheelt tegelijk een botsing met een categorieslug,
 * die nooit op een jaartal eindigt.
 *
 * Blijft er van de titel niets over (enkel emoji of een niet-latijns schrift),
 * dan valt hij terug op "evenement", en maakt de uniciteitscontrole er
 * `evenement-2026-2` van.
 */
export function eventSlugBase(title: string, start: Date): string {
  // Afkappen en dan pas trimmen: een titel van tachtig tekens eindigt anders op
  // een koppelteken en levert `...--2026` op, wat niet meer aan SLUG_PATTERN
  // voldoet.
  const name = slugify(title).slice(0, 60).replace(/-+$/, "") || "evenement";
  return `${name}-${eventSlugYear(start)}`;
}
