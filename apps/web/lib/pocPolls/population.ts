import "server-only";
import type { StudyProgramme, StudyYear } from "@prisma/client";
import { prisma } from "@vtk/db";
import { OUR_STUDENTS } from "@/lib/careerStats";
import { currentStudyYear } from "@/lib/workingYear";

export const STUDY_YEARS: StudyYear[] = ["BACHELOR_1", "BACHELOR_2", "BACHELOR_3", "MASTER_1", "MASTER_2"];

/** Hoeveel studenten een peiling kan bereiken, in totaal en per fase. */
export async function pollPopulation(
  programmes: StudyProgramme[],
  studyYears: StudyYear[],
): Promise<{ total: number; perYear: Record<string, number> }> {
  if (programmes.length === 0) return { total: 0, perYear: {} };
  const base = {
    ...OUR_STUDENTS,
    studyProgrammes: { hasSome: programmes },
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
