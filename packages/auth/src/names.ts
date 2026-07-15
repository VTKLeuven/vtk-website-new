/**
 * Voor- en achternaam van een lid.
 *
 * `User.name` is de weergavenaam en blijft leidend voor alles wat een naam
 * *toont*; `firstName`/`lastName` zijn de gestructureerde variant die o.a. de
 * mailinglijst-exports nodig hebben. Deze helpers houden beide consistent.
 *
 * Safe to use in browser and server components.
 */

export type NameParts = { firstName: string; lastName: string };

/**
 * Splitst een volledige naam op de eerste spatie: het eerste woord is de
 * voornaam, al de rest de achternaam ("Jan Van Den Broeck" -> "Jan" +
 * "Van Den Broeck"). Dat is een gok, geen waarheid: enkel bedoeld om een
 * bestaande `name` voor te stellen als startwaarde in een formulier, zodat het
 * lid ze kan corrigeren. Zonder spatie blijft de achternaam leeg.
 */
export function splitFullName(name: string): NameParts {
  const cleaned = name.trim().replace(/\s+/g, ' ');
  const space = cleaned.indexOf(' ');
  if (space === -1) return { firstName: cleaned, lastName: '' };
  return {
    firstName: cleaned.slice(0, space),
    lastName: cleaned.slice(space + 1),
  };
}

/** Stelt de weergavenaam samen uit voor- en achternaam. */
export function fullName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
}

/**
 * Voor- en achternaam van een lid, met terugval op een split van de
 * weergavenaam zolang de gestructureerde velden nog niet ingevuld zijn (leden
 * die de onboarding nog niet doorliepen).
 */
export function nameParts(user: {
  name: string;
  firstName: string | null;
  lastName: string | null;
}): NameParts {
  if (user.firstName || user.lastName) {
    return { firstName: user.firstName ?? '', lastName: user.lastName ?? '' };
  }
  return splitFullName(user.name);
}
