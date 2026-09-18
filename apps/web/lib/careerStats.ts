import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { CAREER_CATEGORY, type CareerOptInSourceValue } from "@/lib/careerOptIn";

/**
 * De cijfers achter de Career-lijst, voor /admin/mailinglijsten.
 *
 * De vraag die dit beantwoordt: **welk scherm vult die lijst?** De vraag staat
 * op drie plaatsen (de onboarding, /account en sinds dit jaar de
 * studiebevestiging), en zonder deze telling is niet te zien welke ervan werkt.
 * Daarnaast één verhouding die het bestuur wil kennen: hoeveel van onze eigen
 * studenten Career aan hebben staan.
 *
 * "Onze studenten" is hier bewust nauwer dan "iedereen met een account": het
 * zijn de leden met een **richting van deze faculteit** aangeduid, want dat is
 * precies het publiek dat Career belooft aan bedrijven. Het scherm op de
 * studiebevestiging is nog een tikje nauwer (eerste bachelors krijgen de vraag
 * niet, zie `shouldAskCareerOptIn`); de noemer blijft hier de volledige groep,
 * want die kan het vinkje op /account wel aanzetten.
 */

/** Actieve, niet-verwijderde accounts. De ondergrens van elke telling hier. */
const LIVE: Prisma.UserWhereInput = { active: true, deletedAt: null };

/** Studenten van deze faculteit: status Student én minstens één eigen richting. */
export const OUR_STUDENTS: Prisma.UserWhereInput = {
  ...LIVE,
  isStudent: true,
  notAtFaculty: false,
  studyProgrammes: { isEmpty: false },
};

export type CareerStats = {
  /** Alle actieve accounts met de status Student. */
  studentAccounts: number;
  /** Daarvan: de leden met een richting van ons aangeduid. */
  ourStudents: number;
  /** Van die groep: hoeveel Career aan hebben staan, en welk aandeel dat is. */
  ourStudentsWithCareer: number;
  ourStudentsShare: number;
  /** Alle lopende opt-ins, ook van wie geen richting aanduidde. */
  totalOptIns: number;
  /**
   * Per scherm. `unknown` zijn de opt-ins van voor we de herkomst bijhielden;
   * die vallen niet weg maar horen ook niet bij een van de drie schermen.
   */
  bySource: Record<CareerOptInSourceValue | "unknown", number>;
};

export async function careerStats(): Promise<CareerStats> {
  const hasCareer: Prisma.UserWhereInput = { mailCategories: { has: CAREER_CATEGORY } };

  const [studentAccounts, ourStudents, ourStudentsWithCareer, totalOptIns, grouped] =
    await Promise.all([
      prisma.user.count({ where: { ...LIVE, isStudent: true } }),
      prisma.user.count({ where: OUR_STUDENTS }),
      prisma.user.count({ where: { ...OUR_STUDENTS, ...hasCareer } }),
      prisma.user.count({ where: { ...LIVE, ...hasCareer } }),
      prisma.user.groupBy({
        by: ["careerOptInSource"],
        where: { ...LIVE, ...hasCareer },
        _count: { _all: true },
      }),
    ]);

  const bySource: CareerStats["bySource"] = {
    ONBOARDING: 0,
    ACCOUNT: 0,
    STUDY_CONFIRMATION: 0,
    unknown: 0,
  };
  for (const row of grouped) {
    bySource[row.careerOptInSource ?? "unknown"] = row._count._all;
  }

  return {
    studentAccounts,
    ourStudents,
    ourStudentsWithCareer,
    // Zonder studenten geen verhouding: 0/0 is hier 0% en geen NaN op het scherm.
    ourStudentsShare: ourStudents === 0 ? 0 : ourStudentsWithCareer / ourStudents,
    totalOptIns,
    bySource,
  };
}

/** "37%" uit 0.3712. Hele procenten: het is een verhouding, geen meting. */
export function formatShare(share: number, locale: "nl" | "en"): string {
  return new Intl.NumberFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(share);
}
