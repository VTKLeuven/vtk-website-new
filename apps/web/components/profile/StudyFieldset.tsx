import type { StudyProgramme, StudyYear } from "@prisma/client";
import { cn } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { STUDY_YEARS, STUDY_PROGRAMMES } from "@/lib/profile";
import { AlumniFieldset } from "./AlumniFieldset";

/** Eén aanvinkbare optie in een multi-select groep (mailinglijsten, studie, ...). */
export function CheckboxChip({
  name,
  value,
  defaultChecked,
  label,
  className,
}: {
  name: string;
  value: string;
  defaultChecked: boolean;
  label: string;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 px-3 py-2 text-sm",
        className
      )}
    >
      <input type="checkbox" name={name} value={value} defaultChecked={defaultChecked} className="shrink-0" />
      <span className="min-w-0 break-words">{label}</span>
    </label>
  );
}

/**
 * Studiejaren + richtingen + "ik studeer niet aan de faculteit".
 *
 * Gedeeld door het volledige profielformulier ({@link ProfileForm}) en de
 * jaarlijkse bevestigingspagina, zodat beide dezelfde velden en dezelfde
 * `name`-attributen gebruiken en niet uit elkaar kunnen groeien.
 */
export function StudyFieldset({
  locale,
  studyYears,
  studyProgrammes,
  notAtFaculty,
  notStudying,
  internationalStudent,
  alumni,
  graduationYear,
  wasInVtk,
  alumniMailOptIn,
}: {
  locale: Locale;
  studyYears: StudyYear[];
  studyProgrammes: StudyProgramme[];
  notAtFaculty: boolean;
  notStudying: boolean;
  internationalStudent: boolean;
  alumni: boolean;
  graduationYear: number | null;
  wasInVtk: boolean;
  alumniMailOptIn: boolean;
}) {
  const t = getDictionary(locale).onboarding;
  const selectedYears = new Set(studyYears);
  const selectedProgrammes = new Set(studyProgrammes);

  return (
    <div className="space-y-4">
      <div>
        <span className="text-sm font-medium text-vtk-ink">{t.studyYearLabel}</span>
        <p className="text-xs text-[#5c667f]">{t.studyYearHint}</p>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {STUDY_YEARS.map((year) => (
            <CheckboxChip
              key={year}
              name="studyYears"
              value={year}
              defaultChecked={selectedYears.has(year)}
              label={t.years[year]}
            />
          ))}
        </div>
        {/* Wie niet (meer) studeert heeft geen studiejaar; aparte optie onder de
            jaren, want ze valt uit élke studiegerichte mailinglijst. */}
        <CheckboxChip
          name="notStudying"
          value="on"
          defaultChecked={notStudying}
          label={t.notStudying}
          className="mt-2"
        />
        <p className="mt-1 text-xs text-[#5c667f]">{t.notStudyingHint}</p>
      </div>
      <div>
        <span className="text-sm font-medium text-vtk-ink">{t.programmesLabel}</span>
        <p className="text-xs text-[#5c667f]">{t.programmesHint}</p>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STUDY_PROGRAMMES.map((programme) => (
            <CheckboxChip
              key={programme}
              name="studyProgrammes"
              value={programme}
              defaultChecked={selectedProgrammes.has(programme)}
              label={t.programmes[programme]}
            />
          ))}
          {/* Geen richting maar een uitzondering, dus over de volle breedte
              onderaan; wie dit aanduidt valt uit de career-lijsten. */}
          <CheckboxChip
            name="notAtFaculty"
            value="on"
            defaultChecked={notAtFaculty}
            label={t.notAtFaculty}
            className="sm:col-span-2"
          />
        </div>
        <p className="mt-2 text-xs text-[#5c667f]">{t.notAtFacultyHint}</p>
      </div>
      {/* Geen richting en geen studiejaar, maar wel studie-context: het bepaalt
          welke evenementen vanzelf in je kalender opduiken. Bewust een eigen veld
          en geen afleiding uit de sitetaal. */}
      <div>
        <CheckboxChip
          name="internationalStudent"
          value="on"
          defaultChecked={internationalStudent}
          label={t.internationalStudent}
        />
        <p className="mt-1 text-xs text-[#5c667f]">{t.internationalStudentHint}</p>
      </div>
      {/* Alumni krijgen drie vervolgvragen zodra ze zichzelf zo aanduiden:
          welk jaar, of ze ooit in VTK zaten, en of ze mails willen. Die drie
          sturen de alumni-mailinglijst en de aanwezigheidslijst bij een
          alumni-evenement. */}
      <AlumniFieldset
        alumni={alumni}
        graduationYear={graduationYear}
        wasInVtk={wasInVtk}
        alumniMailOptIn={alumniMailOptIn}
        labels={{
          alumni: t.alumni,
          alumniHint: t.alumniHint,
          graduationYear: t.graduationYear,
          graduationYearHint: t.graduationYearHint,
          wasInVtk: t.wasInVtk,
          wasInVtkHint: t.wasInVtkHint,
          mailOptIn: t.alumniMailOptIn,
          mailOptInHint: t.alumniMailOptInHint,
        }}
      />
    </div>
  );
}
