import "server-only";
import type { StudyProgramme, StudyYear } from "@prisma/client";
import { prisma } from "@vtk/db";
import { OUR_STUDENTS } from "@/lib/careerStats";
import { currentStudyYear } from "@/lib/workingYear";

export const STUDY_YEARS: StudyYear[] = ["BACHELOR_1", "BACHELOR_2", "BACHELOR_3", "MASTER_1", "MASTER_2"];

/**
 * Hoeveel studenten een peiling kan bereiken, in totaal en per fase. `null`: een
 * algemene peiling, voor iedereen met een richting.
 */
export async function pollPopulation(
  programmes: StudyProgramme[] | null,
  studyYears: StudyYear[],
): Promise<{ total: number; perYear: Record<string, number> }> {
  if (programmes && programmes.length === 0) return { total: 0, perYear: {} };
  const base = {
    ...OUR_STUDENTS,
    studyProgrammes: programmes ? { hasSome: programmes } : { isEmpty: false },
    studyConfirmedYear: { gte: currentStudyYear() },
  };
  const years = studyYears.length > 0 ? studyYears : STUDY_YEARS;
  const [total, counts] = await Promise.all([
    prisma.user.count({
      where: { ...base, ...(studyYears.length > 0 ? { studyYears: { hasSome: studyYears } } : {}) },
    }),
    Promise.all(years.map((year) => prisma.user.count({ where: { ...base, studyYears: { has: year } } }))),
  ]);
  return { total, perYear: Object.fromEntries(years.map((year, index) => [year, counts[index]])) };
}
