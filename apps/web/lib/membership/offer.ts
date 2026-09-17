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
 */
export function membershipOffer(
  user: { firwStudent: boolean },
  membership: { id: string } | null,
  config: MembershipConfig,
): MembershipOffer {
  if (membership) return { kind: "none", reason: "already" };
  if (user.firwStudent) {
    return config.facultyOpen
      ? { kind: "faculty", priceCents: 0 }
      : { kind: "none", reason: "closed" };
  }
  return config.externalOpen
    ? { kind: "external", priceCents: config.externalPriceCents }
    : { kind: "none", reason: "closed" };
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
