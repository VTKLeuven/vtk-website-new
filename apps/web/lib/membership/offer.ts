import { getDictionary, type Locale } from "@vtk/i18n";
import { formatWorkingYear } from "@/lib/workingYear";
import { formatEuro, type MembershipConfig } from "./config";
import type { MembershipChoiceLabels } from "@/components/profile/MembershipChoice";

/**
 * Welke keuze een lid op de bevestigingspagina te zien krijgt, en met welke
 * woorden. Bewust zonder prisma: dit wordt ook door het clientformulier van de
 * onboarding gelezen (enkel het type), en het is zo zonder database te testen.
 */
export type MembershipOffer =
  | { kind: "none"; reason: "already" | "closed" }
  | { kind: "faculty"; priceCents: 0 }
  | { kind: "external"; priceCents: number };

/**
 * Gratis voor een student van de faculteit Ingenieurswetenschappen, betalend
 * voor de rest, en niets voor wie dit academiejaar al een lidmaatschap heeft.
 * Een erelid is al lid (zie `userIsMember`) en krijgt dus ook niets: anders
 * vraagt het scherm hem te betalen voor wat hij al heeft.
 */
export function membershipOffer(
  user: { firwStudent: boolean; honoraryMember: boolean },
  membership: { id: string } | null,
  config: MembershipConfig,
): MembershipOffer {
  if (membership || user.honoraryMember) return { kind: "none", reason: "already" };
  if (user.firwStudent) {
    return config.facultyOpen
      ? { kind: "faculty", priceCents: 0 }
      : { kind: "none", reason: "closed" };
  }
  return config.externalOpen
    ? { kind: "external", priceCents: config.externalPriceCents }
    : { kind: "none", reason: "closed" };
}

/**
 * Het aanbod om betalend erelid te worden, voor één academiejaar.
 *
 * Enkel voor wie geen student is (`User.isStudent`): alumni, personeel en
 * externen. Een student wordt lid, geen erelid; zo besliste de kring het. Een
 * blijvend erelid (de vlag) heeft het al, en wie dit jaar al een geldig
 * lidmaatschap heeft, ook een betaald, krijgt niets: er is één rij per lid per
 * jaar, en een tweede betaling bovenop de eerste is geen aanbod maar een
 * terugbetaling die op ons wacht.
 *
 * Een openstaand lidmaatschap van een andere soort mag wel omgezet worden: wie
 * eerst "lid voor 25 euro" aanklikte en niet betaalde, kan alsnog erelid
 * worden. Een openstaande erelidrij krijgt geen nieuw aanbod; daar staat de
 * betaalknop al.
 */
export function honoraryOffer(
  user: { isStudent: boolean; honoraryMember: boolean },
  membership: { kind: string; activatedAt: Date | null } | null,
  config: MembershipConfig,
): { kind: "honorary"; priceCents: number } | null {
  if (!config.honoraryOpen || user.isStudent || user.honoraryMember) return null;
  if (membership && (membership.activatedAt || membership.kind === "HONORARY")) return null;
  return { kind: "honorary", priceCents: config.honoraryPriceCents };
}

/** De drie teksten van het vinkje, klaar om als prop mee te geven. */
export function membershipChoiceLabels(
  locale: Locale,
  offer: MembershipOffer,
  year: number,
): MembershipChoiceLabels | null {
  if (offer.kind === "none") return null;
  const t = getDictionary(locale).membership;
  if (offer.kind === "faculty") {
    return {
      heading: t.headingFaculty,
      option: t.faculty.replace("{year}", formatWorkingYear(year)),
      hint: t.facultyHint,
    };
  }
  return {
    heading: t.headingExternal,
    option: t.external.replace("{price}", formatEuro(offer.priceCents, locale === "en" ? "en" : "nl")),
    hint: t.externalHint,
  };
}
