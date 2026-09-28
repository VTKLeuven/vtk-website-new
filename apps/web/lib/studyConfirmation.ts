import { CAREER_CATEGORY } from "@/lib/careerOptIn";

/**
 * De registratie van de jaarlijkse studiebevestiging (`StudyConfirmation`): per
 * lid en per academiejaar één rij met het moment, het scherm en wat er met de
 * Career-vraag gebeurde. /admin/mailinglijsten telt erop.
 *
 * Bewust puur: welk opslaan als bevestiging telt en wat er in de rij komt, is de
 * helft van de feature, en dat hoort testbaar te zijn zonder database.
 */

export type StudyConfirmationViaValue = "ONBOARDING" | "CONFIRMATION" | "ACCOUNT";

/**
 * Telt een opslag van het profielformulier (onboarding of /account) als
 * bevestiging, en via welk scherm?
 *
 * Dat formulier zet `studyConfirmedYear` bij élke opslag op het lopende
 * academiejaar. Een rij per opslag zou de ronde dus vullen met iedereen die zijn
 * gsm-nummer aanpaste; enkel de opslag die een **nieuw** jaar bevestigt, telt.
 * Tussen 14 en 21 september is dat een echte weg: het academiejaar heet dan al
 * 26-27, de gate staat nog dicht, en wie zijn profiel bewaart, bevestigt.
 */
export function profileConfirmationVia(input: {
  wasOnboarded: boolean;
  isStudent: boolean;
  previousConfirmedYear: number | null;
  year: number;
}): StudyConfirmationViaValue | null {
  if (!input.isStudent) return null;
  if (!input.wasOnboarded) return "ONBOARDING";
  if ((input.previousConfirmedYear ?? -1) < input.year) return "ACCOUNT";
  return null;
}

/**
 * De Career-kolommen van een rij uit het profielformulier. Daar staat Career
 * tussen de andere categorieën, voor iedereen, dus wie het nog niet aan had,
 * kreeg de keuze.
 */
export function profileCareerOutcome(
  before: readonly string[],
  after: readonly string[],
): { careerBefore: boolean; careerAsked: boolean; careerChosen: boolean } {
  const careerBefore = before.includes(CAREER_CATEGORY);
  return {
    careerBefore,
    careerAsked: !careerBefore,
    careerChosen: !careerBefore && after.includes(CAREER_CATEGORY),
  };
}
