import { getDictionary, type Locale } from "@vtk/i18n";
import type { CareerOptInCopy } from "@/lib/careerOptIn";

/**
 * De vertaalde teksten van de Career-vraag, voor `CareerOptIn`.
 *
 * Staat los van `lib/careerOptIn.ts` omdat dat bestand ook in de browser draait
 * en de dictionary daar niet thuishoort. Enkel de studiejaren en richtingen gaan
 * mee: meer heeft de titel niet nodig om mee te bewegen met stap 1.
 */
export function careerOptInCopy(locale: Locale): CareerOptInCopy {
  const dict = getDictionary(locale);
  const t = dict.confirmStudy;
  return {
    nl: locale === "nl",
    kicker: t.careerKicker,
    lead: t.careerLead,
    option: t.careerOption,
    hint: t.careerHint,
    headingTemplate: t.careerHeading,
    years: dict.onboarding.years,
    programmes: dict.onboarding.programmes,
  };
}
