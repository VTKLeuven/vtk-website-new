import type { Locale } from "@vtk/i18n";

/**
 * Rollen staan overal alfabetisch, op de naam in de taal van het scherm.
 * Hoofdletters tellen niet mee ("existenz" hoort tussen Cultuur en Fakbar) en
 * een getal sorteert als getal ("Blok 6" voor "Blok 10").
 *
 * Er was een handmatige volgorde (`Role.order`, slepen in /admin/roles), maar
 * een rol die later bijkwam, belandde onderaan, zodat geen enkele lijst nog
 * alfabetisch stond en je een rol moest zoeken tussen de vinkjes.
 */
export function sortRolesByName<T extends { nameNl: string; nameEn: string }>(
  roles: readonly T[],
  locale: Locale,
): T[] {
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const nameOf = (role: T) => (locale === "nl" ? role.nameNl : role.nameEn).trim();
  return [...roles].sort((a, b) => collator.compare(nameOf(a), nameOf(b)));
}
