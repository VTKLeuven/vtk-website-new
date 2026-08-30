import type { AcademicStaffRole, StudyProgramme, StudyYear } from "@prisma/client";
import { getDictionary, type Locale } from "@vtk/i18n";
import { STUDY_YEARS, STUDY_PROGRAMMES } from "@/lib/profile";
import { StudyStatusFields } from "./StudyStatusFields";

/**
 * Expliciete profielstatussen met hun conditionele vervolgvragen.
 *
 * De labels worden server-side opgezocht en als kleine prop doorgegeven, zodat
 * de volledige i18n-dictionary niet in de clientbundel terechtkomt.
 */
export function StudyFieldset({
  locale,
  studyYears,
  studyProgrammes,
  isStudent,
  notAtFaculty,
  notStudying,
  academicStaffRole,
  internationalStudent,
  alumni,
  graduationYear,
  wasInVtk,
  alumniMailOptIn,
}: {
  locale: Locale;
  studyYears: StudyYear[];
  studyProgrammes: StudyProgramme[];
  isStudent: boolean;
  notAtFaculty: boolean;
  notStudying: boolean;
  academicStaffRole: AcademicStaffRole | null;
  internationalStudent: boolean;
  alumni: boolean;
  graduationYear: number | null;
  wasInVtk: boolean;
  alumniMailOptIn: boolean;
}) {
  const t = getDictionary(locale).onboarding;

  return (
    <StudyStatusFields
      studyYears={studyYears}
      studyProgrammes={studyProgrammes}
      isStudent={isStudent}
      notAtFaculty={notAtFaculty}
      notStudying={notStudying}
      internationalStudent={internationalStudent}
      alumni={alumni}
      graduationYear={graduationYear}
      wasInVtk={wasInVtk}
      alumniMailOptIn={alumniMailOptIn}
      academicStaffRole={academicStaffRole}
      studyYearOptions={STUDY_YEARS}
      programmeOptions={STUDY_PROGRAMMES}
      labels={{
        statusLabel: t.statusLabel,
        statusHint: t.statusHint,
        statusStudent: t.statusStudent,
        statusAlumnus: t.statusAlumnus,
        statusAcademicStaff: t.statusAcademicStaff,
        statusNotStudying: t.statusNotStudying,
        studyYearLabel: t.studyYearLabel,
        studyYearHint: t.studyYearHint,
        programmesLabel: t.programmesLabel,
        programmesHint: t.programmesHint,
        notAtFaculty: t.notAtFaculty,
        notAtFacultyHint: t.notAtFacultyHint,
        internationalStudent: t.internationalStudent,
        internationalStudentHint: t.internationalStudentHint,
        alumniDetailsHint: t.alumniHint,
        graduationYear: t.graduationYear,
        graduationYearHint: t.graduationYearHint,
        wasInVtk: t.wasInVtk,
        wasInVtkHint: t.wasInVtkHint,
        alumniMailOptIn: t.alumniMailOptIn,
        alumniMailOptInHint: t.alumniMailOptInHint,
        academicStaffRoleLabel: t.academicStaffRoleLabel,
        academicStaffRoleHint: t.academicStaffRoleHint,
        years: t.years,
        programmes: t.programmes,
        academicStaffRoles: t.academicStaffRoles,
      }}
    />
  );
}

export { CheckboxChip } from "./CheckboxChip";
