"use client";

import { useState } from "react";
import type { AcademicStaffRole, StudyProgramme, StudyYear } from "@prisma/client";
import { ACADEMIC_STAFF_ROLES } from "@/lib/profile";
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
  alumniDetailsHint: string;
  graduationYear: string;
  graduationYearHint: string;
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
  alumni: initialAlumni,
  graduationYear,
  wasInVtk,
  alumniMailOptIn,
  academicStaffRole,
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
  alumni: boolean;
  graduationYear: number | null;
  wasInVtk: boolean;
  alumniMailOptIn: boolean;
  academicStaffRole: AcademicStaffRole | null;
  studyYearOptions: readonly StudyYear[];
  programmeOptions: readonly StudyProgramme[];
  labels: Labels;
}) {
  const [isStudent, setIsStudent] = useState(initialStudent);
  const [isAlumni, setIsAlumni] = useState(initialAlumni);
  const [isAcademicStaff, setIsAcademicStaff] = useState(academicStaffRole !== null);
  const [isNotStudying, setIsNotStudying] = useState(initialNotStudying);
  const selectedYears = new Set(studyYears);
  const selectedProgrammes = new Set(studyProgrammes);
  const statusClass =
    "inline-flex items-center gap-2 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 px-3 py-2 text-sm";

  return (
    <div className="space-y-5">
      <div>
        <span className="text-sm font-medium text-vtk-ink">{labels.statusLabel}</span>
        <p className="text-xs text-[#5c667f]">{labels.statusHint}</p>
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
      </div>

      {isStudent ? (
        <div className="space-y-4 border-l-2 border-vtk-blue/15 pl-4">
          <div>
            <span className="text-sm font-medium text-vtk-ink">{labels.studyYearLabel}</span>
            <p className="text-xs text-[#5c667f]">{labels.studyYearHint}</p>
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
          </div>

          <div>
            <span className="text-sm font-medium text-vtk-ink">{labels.programmesLabel}</span>
            <p className="text-xs text-[#5c667f]">{labels.programmesHint}</p>
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
                className="sm:col-span-2"
              />
            </div>
            <p className="mt-2 text-xs text-[#5c667f]">{labels.notAtFacultyHint}</p>
          </div>

          <div>
            <CheckboxChip
              name="internationalStudent"
              value="on"
              defaultChecked={internationalStudent}
              label={labels.internationalStudent}
            />
            <p className="mt-1 text-xs text-[#5c667f]">{labels.internationalStudentHint}</p>
          </div>
        </div>
      ) : null}

      {isAlumni ? (
        <div className="space-y-3 border-l-2 border-vtk-blue/15 pl-4">
          <p className="text-xs text-[#5c667f]">{labels.alumniDetailsHint}</p>
          <div>
            <label htmlFor="graduationYear" className="block text-sm font-medium text-vtk-ink">
              {labels.graduationYear}
            </label>
            <input
              id="graduationYear"
              name="graduationYear"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              defaultValue={graduationYear ?? ""}
              placeholder="2019"
              className="mt-1 w-32 rounded-xl border border-vtk-blue/15 bg-white px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-[#5c667f]">{labels.graduationYearHint}</p>
          </div>
          <div>
            <CheckboxChip
              name="wasInVtk"
              value="on"
              defaultChecked={wasInVtk}
              label={labels.wasInVtk}
            />
            <p className="mt-1 text-xs text-[#5c667f]">{labels.wasInVtkHint}</p>
          </div>
          <div>
            <CheckboxChip
              name="alumniMailOptIn"
              value="on"
              defaultChecked={alumniMailOptIn}
              label={labels.alumniMailOptIn}
            />
            <p className="mt-1 text-xs text-[#5c667f]">{labels.alumniMailOptInHint}</p>
          </div>
        </div>
      ) : null}

      {isAcademicStaff ? (
        <fieldset className="space-y-2 border-l-2 border-vtk-blue/15 pl-4">
          <legend className="text-sm font-medium text-vtk-ink">{labels.academicStaffRoleLabel}</legend>
          <p className="text-xs text-[#5c667f]">{labels.academicStaffRoleHint}</p>
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
