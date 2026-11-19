"use client";

import { useId, useState } from "react";
import type { AcademicStaffRole, StudyProgramme, StudyYear } from "@prisma/client";
import { Input } from "@vtk/ui";
import { ACADEMIC_STAFF_ROLES, isValidGraduationYear } from "@/lib/profile";
import { CheckboxChip } from "./CheckboxChip";

type Labels = {
  statusLabel: string;
  statusHint: string;
  statusStudent: string;
  statusAlumnus: string;
  statusAcademicStaff: string;
  statusNotStudying: string;
  studyYearLabel: string;
  studyYearHint: string;
  programmesLabel: string;
  programmesHint: string;
  notAtFaculty: string;
  notAtFacultyHint: string;
  internationalStudent: string;
  internationalStudentHint: string;
  sideEntrant: string;
  sideEntrantHint: string;
  alumniDetailsHint: string;
  graduationYear: string;
  graduationYearHint: string;
  graduationYearInvalid: string;
  wasInVtk: string;
  wasInVtkHint: string;
  alumniMailOptIn: string;
  alumniMailOptInHint: string;
  academicStaffRoleLabel: string;
  academicStaffRoleHint: string;
  years: Record<StudyYear, string>;
  programmes: Record<StudyProgramme, string>;
  academicStaffRoles: Record<AcademicStaffRole, string>;
};

/**
 * De interactieve helft van het studieprofiel.
 *
 * De vier statussen zijn checkboxes omdat combinaties zinvol zijn (bv. alumnus
 * én academisch personeel). Alleen Student en "ik studeer niet" spreken elkaar
 * rechtstreeks tegen; de client zet daarom het ene uit wanneer het andere aan
 * gaat. De server valideert dezelfde regel opnieuw.
 */
export function StudyStatusFields({
  studyYears,
  studyProgrammes,
  isStudent: initialStudent,
  notAtFaculty,
  notStudying: initialNotStudying,
  internationalStudent,
  sideEntrant,
  alumni: initialAlumni,
  graduationYear,
  wasInVtk,
  alumniMailOptIn,
  academicStaffRole,
  latestGraduationYear,
  studyYearOptions,
  programmeOptions,
  labels,
}: {
  studyYears: StudyYear[];
  studyProgrammes: StudyProgramme[];
  isStudent: boolean;
  notAtFaculty: boolean;
  notStudying: boolean;
  internationalStudent: boolean;
  sideEntrant: boolean;
  alumni: boolean;
  graduationYear: number | null;
  wasInVtk: boolean;
  alumniMailOptIn: boolean;
  academicStaffRole: AcademicStaffRole | null;
  /** Het laatste afstudeerjaar dat de server aanvaardt; zie `isValidGraduationYear`. */
  latestGraduationYear: number;
  studyYearOptions: readonly StudyYear[];
  programmeOptions: readonly StudyProgramme[];
  labels: Labels;
}) {
  const idPrefix = useId();
  const [isStudent, setIsStudent] = useState(initialStudent);
  const [isAlumni, setIsAlumni] = useState(initialAlumni);
  const [isAcademicStaff, setIsAcademicStaff] = useState(academicStaffRole !== null);
  const [isNotStudying, setIsNotStudying] = useState(initialNotStudying);
  const selectedYears = new Set(studyYears);
  const selectedProgrammes = new Set(studyProgrammes);
  const statusClass =
    "inline-flex cursor-pointer items-center gap-2 rounded-xl border border-vtk-muted/80 bg-vtk-blue-soft/30 px-3 py-2 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-vtk-ink";
  const statusHintId = `${idPrefix}-status-hint`;
  const studyYearHintId = `${idPrefix}-study-year-hint`;
  const programmesHintId = `${idPrefix}-programmes-hint`;
  const notAtFacultyHintId = `${idPrefix}-not-at-faculty-hint`;
  const intlHintId = `${idPrefix}-intl-hint`;
  const sideEntrantHintId = `${idPrefix}-side-entrant-hint`;
  const graduationYearId = `${idPrefix}-graduationYear`;
  const graduationYearHintId = `${idPrefix}-graduationYearHint`;
  const wasInVtkHintId = `${idPrefix}-was-in-vtk-hint`;
  const alumniMailHintId = `${idPrefix}-alumni-mail-hint`;
  const academicStaffHintId = `${idPrefix}-academic-staff-hint`;

  // Dezelfde grens als de server, maar dan vóór het versturen: een student die
  // het verwachte afstudeerjaar invult, krijgt de uitleg bij het veld zelf en
  // komt op de bevestiging niet voorbij "Ga verder" met een waarde die de server
  // toch weigert. `pattern` alleen zegt enkel dat het vier cijfers moeten zijn.
  const checkGraduationYear = (input: HTMLInputElement | null) => {
    input?.setCustomValidity(
      isValidGraduationYear(input.value, latestGraduationYear) ? "" : labels.graduationYearInvalid,
    );
  };

  return (
    <div className="space-y-5">
      <fieldset aria-describedby={statusHintId}>
        <legend className="text-sm font-medium text-vtk-ink">{labels.statusLabel}</legend>
        <p id={statusHintId} className="text-xs text-[#5c667f]">{labels.statusHint}</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <label className={statusClass}>
            <input
              type="checkbox"
              name="isStudent"
              value="on"
              checked={isStudent}
              onChange={(event) => {
                const checked = event.target.checked;
                setIsStudent(checked);
                if (checked) setIsNotStudying(false);
              }}
              className="shrink-0"
            />
            {labels.statusStudent}
          </label>
          <label className={statusClass}>
            <input
              type="checkbox"
              name="alumni"
              value="on"
              checked={isAlumni}
              onChange={(event) => setIsAlumni(event.target.checked)}
              className="shrink-0"
            />
            {labels.statusAlumnus}
          </label>
          <label className={statusClass}>
            <input
              type="checkbox"
              name="academicStaff"
              value="on"
              checked={isAcademicStaff}
              onChange={(event) => setIsAcademicStaff(event.target.checked)}
              className="shrink-0"
            />
            {labels.statusAcademicStaff}
          </label>
          <label className={statusClass}>
            <input
              type="checkbox"
              name="notStudying"
              value="on"
              checked={isNotStudying}
              onChange={(event) => {
                const checked = event.target.checked;
                setIsNotStudying(checked);
                if (checked) setIsStudent(false);
              }}
              className="shrink-0"
            />
            {labels.statusNotStudying}
          </label>
        </div>
      </fieldset>

      {isStudent ? (
        <div className="space-y-4 border-l-2 border-vtk-blue/15 pl-4">
          <fieldset aria-describedby={studyYearHintId}>
            <legend className="text-sm font-medium text-vtk-ink">{labels.studyYearLabel}</legend>
            <p id={studyYearHintId} className="text-xs text-[#5c667f]">{labels.studyYearHint}</p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {studyYearOptions.map((year) => (
                <CheckboxChip
                  key={year}
                  name="studyYears"
                  value={year}
                  defaultChecked={selectedYears.has(year)}
                  label={labels.years[year]}
                />
              ))}
            </div>
          </fieldset>

          <fieldset aria-describedby={programmesHintId}>
            <legend className="text-sm font-medium text-vtk-ink">{labels.programmesLabel}</legend>
            <p id={programmesHintId} className="text-xs text-[#5c667f]">{labels.programmesHint}</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {programmeOptions.map((programme) => (
                <CheckboxChip
                  key={programme}
                  name="studyProgrammes"
                  value={programme}
                  defaultChecked={selectedProgrammes.has(programme)}
                  label={labels.programmes[programme]}
                />
              ))}
              <CheckboxChip
                name="notAtFaculty"
                value="on"
                defaultChecked={notAtFaculty}
                label={labels.notAtFaculty}
                ariaDescribedBy={notAtFacultyHintId}
                className="sm:col-span-2"
              />
            </div>
            <p id={notAtFacultyHintId} className="mt-2 text-xs text-[#5c667f]">{labels.notAtFacultyHint}</p>
          </fieldset>

          <div>
            <CheckboxChip
              name="internationalStudent"
              value="on"
              defaultChecked={internationalStudent}
              label={labels.internationalStudent}
              ariaDescribedBy={intlHintId}
            />
            <p id={intlHintId} className="mt-1 text-xs text-[#5c667f]">{labels.internationalStudentHint}</p>
          </div>

          <div>
            <CheckboxChip
              name="sideEntrant"
              value="on"
              defaultChecked={sideEntrant}
              label={labels.sideEntrant}
              ariaDescribedBy={sideEntrantHintId}
            />
            <p id={sideEntrantHintId} className="mt-1 text-xs text-[#5c667f]">{labels.sideEntrantHint}</p>
          </div>
        </div>
      ) : null}

      {isAlumni ? (
        <div className="space-y-3 border-l-2 border-vtk-blue/15 pl-4">
          <p className="text-xs text-[#5c667f]">{labels.alumniDetailsHint}</p>
          <div>
            <label htmlFor={graduationYearId} className="block text-sm font-medium text-vtk-ink">
              {labels.graduationYear}
            </label>
            <div className="mt-1 w-32">
              <Input
                id={graduationYearId}
                name="graduationYear"
                inputMode="numeric"
                pattern="[0-9]{4}"
                maxLength={4}
                ref={checkGraduationYear}
                onChange={(event) => checkGraduationYear(event.currentTarget)}
                defaultValue={graduationYear ?? ""}
                placeholder="2019"
                aria-describedby={graduationYearHintId}
              />
            </div>
            <p id={graduationYearHintId} className="mt-1 text-xs text-[#5c667f]">{labels.graduationYearHint}</p>
          </div>
          <div>
            <CheckboxChip
              name="wasInVtk"
              value="on"
              defaultChecked={wasInVtk}
              label={labels.wasInVtk}
              ariaDescribedBy={wasInVtkHintId}
            />
            <p id={wasInVtkHintId} className="mt-1 text-xs text-[#5c667f]">{labels.wasInVtkHint}</p>
          </div>
          <div>
            <CheckboxChip
              name="alumniMailOptIn"
              value="on"
              defaultChecked={alumniMailOptIn}
              label={labels.alumniMailOptIn}
              ariaDescribedBy={alumniMailHintId}
            />
            <p id={alumniMailHintId} className="mt-1 text-xs text-[#5c667f]">{labels.alumniMailOptInHint}</p>
          </div>
        </div>
      ) : null}

      {isAcademicStaff ? (
        <fieldset
          aria-describedby={academicStaffHintId}
          className="space-y-2 border-l-2 border-vtk-blue/15 pl-4"
        >
          <legend className="text-sm font-medium text-vtk-ink">{labels.academicStaffRoleLabel}</legend>
          <p id={academicStaffHintId} className="text-xs text-[#5c667f]">{labels.academicStaffRoleHint}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {ACADEMIC_STAFF_ROLES.map((role) => (
              <label key={role} className={statusClass}>
                <input
                  type="radio"
                  name="academicStaffRole"
                  value={role}
                  defaultChecked={academicStaffRole === role}
                  required
                  className="shrink-0"
                />
                {labels.academicStaffRoles[role]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
    </div>
  );
}
