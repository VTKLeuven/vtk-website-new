"use client";

import { useState } from "react";
import { Button, Card, Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { deletePalPlusCourseAction, savePalPlusCourseAction } from "@/app/actions/palPlus";
import { PAL_PLUS_LIMITS, palPlusCourseLabel } from "@/lib/palPlus";
import { palPlusCourseErrors } from "@/lib/palPlusMessages";

export type PalPlusCourseView = {
  id: string;
  code: string | null;
  nameNl: string;
  nameEn: string | null;
  active: boolean;
  requestCount: number;
  sessionCount: number;
};

/**
 * De vakkenlijst van PAL+: waaruit een lid kiest wanneer het een sessie
 * aanbiedt of hulp vraagt, en waar elke sessie aan hangt.
 *
 * Een klik op de rij opent het vak om te bewerken, en verwijderen staat daarin:
 * het is de enige onomkeerbare actie, en enkel mogelijk zolang er niets aan het
 * vak hangt.
 */
export function CoursesCard({ nl, courses }: { nl: boolean; courses: PalPlusCourseView[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const errors = palPlusCourseErrors(nl);

  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id));

  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{nl ? "Vakken" : "Courses"}</h2>
        {courses.length > 0 && (
          <Button type="button" size="sm" onClick={() => setAdding((prev) => !prev)}>
            {adding ? (nl ? "Annuleren" : "Cancel") : nl ? "Vak toevoegen" : "Add course"}
          </Button>
        )}
      </div>
      <p className="mb-4 text-sm text-vtk-muted">
        {nl
          ? "Waaruit een lid kiest wanneer het een sessie aanbiedt of hulp vraagt. Een vak waar al iets aan hangt, verwijder je niet maar zet je uit: dan verdwijnt het uit het formulier en blijft de historiek staan."
          : "What a member picks from when offering a session or asking for help. A course with requests or sessions attached is not deleted but switched off: it leaves the form and its history stays."}
      </p>

      {adding && (
        <div className="mb-4 rounded-2xl border border-vtk-blue/15 p-4">
          <CourseForm nl={nl} errors={errors} course={null} onDone={() => setAdding(false)} />
        </div>
      )}

      {courses.length === 0 ? (
        !adding && (
          <div className="rounded-2xl border border-dashed border-vtk-blue/20 p-5">
            <p className="mb-3 text-sm text-vtk-body">
              {nl
                ? "Nog geen vakken. Zolang de lijst leeg is, kan niemand een vak kiezen in een aanvraag."
                : "No courses yet. While the list is empty, nobody can pick a course in a request."}
            </p>
            <Button type="button" size="sm" onClick={() => setAdding(true)}>
              {nl ? "Eerste vak toevoegen" : "Add the first course"}
            </Button>
          </div>
        )
      ) : (
        <div className="relative overflow-x-auto">
          <table className="vtk-palplus-table">
            <thead>
              <tr>
                <th scope="col">{nl ? "Vak" : "Course"}</th>
                <th scope="col">{nl ? "OPO-code" : "Course code"}</th>
                <th scope="col" className="is-num">
                  {nl ? "Aanvragen" : "Requests"}
                </th>
                <th scope="col" className="is-num">
                  {nl ? "Sessies" : "Sessions"}
                </th>
              </tr>
            </thead>
            <tbody>
              {courses.map((course) => {
                const open = expanded === course.id;
                return (
                  <CourseRows
                    key={course.id}
                    nl={nl}
                    course={course}
                    open={open}
                    onToggle={() => toggle(course.id)}
                    errors={errors}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function CourseRows({
  nl,
  course,
  open,
  onToggle,
  errors,
}: {
  nl: boolean;
  course: PalPlusCourseView;
  open: boolean;
  onToggle: () => void;
  errors: Record<string, string>;
}) {
  const label = palPlusCourseLabel(course, nl ? "nl" : "en");
  const inUse = course.requestCount > 0 || course.sessionCount > 0;

  return (
    <>
      <tr
        className="vtk-palplus-row"
        data-open={open ? "true" : undefined}
        data-inactive={course.active ? undefined : "true"}
        onClick={onToggle}
      >
        <th scope="row">
          <button
            type="button"
            className="vtk-palplus-rowtitle"
            aria-expanded={open}
            onClick={(event) => {
              // De rij zelf opent ook; zonder dit klapt een klik op de naam
              // open en meteen weer dicht.
              event.stopPropagation();
              onToggle();
            }}
          >
            {nl || !course.nameEn ? course.nameNl : course.nameEn}
          </button>
          {nl && course.nameEn && <span className="vtk-palplus-sub">{course.nameEn}</span>}
          {!course.active && (
            <span className="vtk-palplus-off">{nl ? "Uit" : "Off"}</span>
          )}
        </th>
        <td data-label={nl ? "OPO-code" : "Course code"}>
          {course.code ?? <span className="text-vtk-muted">{nl ? "geen" : "none"}</span>}
        </td>
        <td data-label={nl ? "Aanvragen" : "Requests"} className="is-num">
          {course.requestCount}
        </td>
        <td data-label={nl ? "Sessies" : "Sessions"} className="is-num">
          {course.sessionCount}
        </td>
      </tr>
      {open && (
        <tr className="vtk-palplus-editor">
          <td colSpan={4}>
            <CourseForm nl={nl} errors={errors} course={course} onDone={onToggle} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-vtk-blue/10 pt-3">
              <p className="text-xs text-vtk-muted">
                {inUse
                  ? nl
                    ? "Er hangen aanvragen of sessies aan dit vak, dus het blijft bestaan. Zet het uit om het uit het formulier te halen."
                    : "Requests or sessions are attached to this course, so it stays. Switch it off to take it out of the form."
                  : nl
                    ? "Er hangt nog niets aan dit vak."
                    : "Nothing is attached to this course yet."}
              </p>
              {!inUse && (
                <DeleteButton
                  action={deletePalPlusCourseAction}
                  fields={{ id: course.id }}
                  title={nl ? "Vak verwijderen?" : "Delete course?"}
                  description={
                    nl
                      ? `"${label}" verdwijnt uit de vakkenlijst en uit het aanvraagformulier. Er hangen geen aanvragen of sessies aan, dus er gaat geen historiek verloren.`
                      : `"${label}" leaves the course list and the request form. No requests or sessions are attached, so no history is lost.`
                  }
                  confirmLabel={nl ? "Verwijderen" : "Delete"}
                  cancelLabel={nl ? "Annuleren" : "Cancel"}
                  successMessage={nl ? "Vak verwijderd." : "Course deleted."}
                  errorMessages={errors}
                  errorFallback={nl ? "Niet verwijderd." : "Not deleted."}
                >
                  {nl ? "Vak verwijderen" : "Delete course"}
                </DeleteButton>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function CourseForm({
  nl,
  errors,
  course,
  onDone,
}: {
  nl: boolean;
  errors: Record<string, string>;
  course: PalPlusCourseView | null;
  onDone: () => void;
}) {
  const prefix = course?.id ?? "new";

  return (
    <SaveForm
      action={savePalPlusCourseAction}
      submitLabel={course ? (nl ? "Opslaan" : "Save") : nl ? "Toevoegen" : "Add"}
      savingLabel={nl ? "Opslaan…" : "Saving…"}
      savedMessage={
        course ? (nl ? "Vak opgeslagen." : "Course saved.") : nl ? "Vak toegevoegd." : "Course added."
      }
      errorMessages={errors}
      fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
      resetOnSuccess={course === null}
      onSuccess={onDone}
      className="space-y-3"
    >
      {course && <input type="hidden" name="id" value={course.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`pal-course-nl-${prefix}`}>{nl ? "Naam (Nederlands)" : "Name (Dutch)"}</Label>
          <Input
            id={`pal-course-nl-${prefix}`}
            name="nameNl"
            defaultValue={course?.nameNl ?? ""}
            maxLength={PAL_PLUS_LIMITS.courseName}
            placeholder="Analyse I"
            required
          />
        </div>
        <div>
          <Label htmlFor={`pal-course-en-${prefix}`}>{nl ? "Naam (Engels)" : "Name (English)"}</Label>
          <Input
            id={`pal-course-en-${prefix}`}
            name="nameEn"
            defaultValue={course?.nameEn ?? ""}
            maxLength={PAL_PLUS_LIMITS.courseName}
            placeholder="Analysis I"
          />
          <p className="mt-1 text-xs text-vtk-muted">
            {nl ? "Leeg = de Engelse site toont de Nederlandse naam." : "Empty = the English site shows the Dutch name."}
          </p>
        </div>
      </div>

      <div className="sm:max-w-56">
        <Label htmlFor={`pal-course-code-${prefix}`}>{nl ? "OPO-code" : "Course code"}</Label>
        <Input
          id={`pal-course-code-${prefix}`}
          name="code"
          defaultValue={course?.code ?? ""}
          maxLength={PAL_PLUS_LIMITS.courseCode + 6}
          placeholder="H01A0B"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <p className="mt-1 text-xs text-vtk-muted">
          {nl
            ? "Uit de studiegids. Leeg voor iets wat geen vak is (Matlab, LaTeX)."
            : "From the course catalogue. Empty for something that is not a course (Matlab, LaTeX)."}
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-vtk-ink">
        <input type="checkbox" name="active" defaultChecked={course?.active ?? true} />
        <span>{nl ? "Kiesbaar in het aanvraagformulier" : "Selectable in the request form"}</span>
      </label>
    </SaveForm>
  );
}
