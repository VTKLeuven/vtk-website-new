import { pick, type Locale } from "@vtk/i18n";

/**
 * Organisatoren die de kring zelf vaak nodig heeft, als snelkeuze naast het vrije
 * veld in het evenementformulier.
 *
 * "VTK Alumni" is geen eigen groep: Groep 5 beheert de alumni-activiteiten, maar
 * "Groep 5" als organisator van een alumni-avond leest voor een alumnus als een
 * interne code. Groep 5 blijft gewoon de organisator van al de rest; dit is een
 * keuze per evenement, geen automatisme.
 */
export const ORGANISER_PRESETS = ["VTK Alumni"] as const;

/**
 * Van wie een evenement is, zoals een bezoeker het te zien krijgt.
 *
 * De groep achter een evenement (`CalendarEvent.groupId`) is wie het mag
 * bewerken, niet noodzakelijk wie het organiseert: een TD samen met een andere
 * kring, of een activiteit die een partner in onze kalender koopt, staat bij ons
 * in beheer zonder dat de beherende groep de organisator is. Staat
 * `organiserName` ingevuld, dan is dat de naam die overal getoond wordt.
 *
 * Bewust één taalloze naam: een organisator is een eigennaam en die vertaalt
 * niet, dus de taalkeuze geldt enkel voor de terugval op de groepsnaam.
 */
export function organiserName(
  organiser: string | null | undefined,
  group: { nameNl: string; nameEn: string },
  locale: Locale,
): string {
  const own = organiser?.trim();
  if (own) return own;
  return pick(group.nameNl, group.nameEn, locale);
}
