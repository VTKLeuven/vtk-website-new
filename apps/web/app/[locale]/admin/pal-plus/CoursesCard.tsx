"use client";

import { useMemo, useState } from "react";
import { Button, Card, Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import {
  deletePalPlusCourseAction,
  importPalPlusCoursesAction,
  savePalPlusCourseAction,
} from "@/app/actions/palPlus";
import {
  PAL_PLUS_COURSE_LIST_MAX,
  PAL_PLUS_LIMITS,
  palPlusCourseLabel,
  planPalPlusCourseList,
} from "@/lib/palPlus";
import {
  palPlusCourseErrors,
  palPlusCourseLineProblem,
  palPlusCourseListErrors,
} from "@/lib/palPlusMessages";

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
 * vak hangt. "Meerdere toevoegen" neemt een geplakte lijst, één vak per regel,
 * voor het begin van een semester of een lijst uit de studiegids.
 */
export function CoursesCard({ nl, courses }: { nl: boolean; courses: PalPlusCourseView[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState<"one" | "many" | null>(null);
  const errors = palPlusCourseErrors(nl);
  const toggleAdding = (mode: "one" | "many") => setAdding((prev) => (prev === mode ? null : mode));

  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id));

  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{nl ? "Vakken" : "Courses"}</h2>
        {courses.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => toggleAdding("many")}>
              {adding === "many" ? (nl ? "Annuleren" : "Cancel") : nl ? "Meerdere toevoegen" : "Add several"}
            </Button>
            <Button type="button" size="sm" onClick={() => toggleAdding("one")}>
              {adding === "one" ? (nl ? "Annuleren" : "Cancel") : nl ? "Vak toevoegen" : "Add course"}
            </Button>
          </div>
        )}
      </div>
      <p className="mb-4 text-sm text-vtk-muted">
        {nl
          ? "Waaruit een lid kiest wanneer het een sessie aanbiedt of hulp vraagt. Een vak waar al iets aan hangt, verwijder je niet maar zet je uit: dan verdwijnt het uit het formulier en blijft de historiek staan."
          : "What a member picks from when offering a session or asking for help. A course with requests or sessions attached is not deleted but switched off: it leaves the form and its history stays."}
      </p>

      {adding === "one" && (
        <div className="mb-4 rounded-2xl border border-vtk-blue/15 p-4">
          <CourseForm nl={nl} errors={errors} course={null} onDone={() => setAdding(null)} />
        </div>
      )}
      {adding === "many" && (
        <div className="mb-4 rounded-2xl border border-vtk-blue/15 p-4">
          <CourseListForm nl={nl} courses={courses} onDone={() => setAdding(null)} />
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
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => setAdding("one")}>
                {nl ? "Eerste vak toevoegen" : "Add the first course"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setAdding("many")}>
                {nl ? "Een lijst plakken" : "Paste a list"}
              </Button>
            </div>
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

const COURSE_LIST_EXAMPLE = [
  "H01A0B Analyse, deel 1",
  "H01A4B; Toegepaste algebra; Applied Algebra",
  "Matlab",
].join("\n");

const STATUS_LABELS = {
  new: { nl: "nieuw", en: "new" },
  exists: { nl: "staat er al", en: "already listed" },
  repeat: { nl: "dubbel geplakt", en: "pasted twice" },
} as const;

/**
 * Een geplakte lijst, één vak per regel. Wat er van de lijst wordt, staat er
 * meteen onder terwijl je plakt: welke vakken nieuw zijn, welke al bestaan en
 * welke regel niet klopt. Zo zie je voor het toevoegen of de kolommen goed
 * gelezen worden, in plaats van achteraf honderd vakken te moeten nakijken.
 */
function CourseListForm({
  nl,
  courses,
  onDone,
}: {
  nl: boolean;
  courses: PalPlusCourseView[];
  onDone: () => void;
}) {
  const [text, setText] = useState("");
  const plan = useMemo(() => planPalPlusCourseList(text, courses), [text, courses]);
  const fresh = plan.rows.filter((row) => row.status === "new").length;
  const known = plan.rows.length - fresh;
  const blocked = plan.errors.length > 0 || plan.tooMany || fresh === 0;

  return (
    <SaveForm
      action={importPalPlusCoursesAction}
      submitLabel={
        fresh > 0
          ? nl
            ? `${fresh} ${fresh === 1 ? "vak" : "vakken"} toevoegen`
            : `Add ${fresh} ${fresh === 1 ? "course" : "courses"}`
          : nl
            ? "Toevoegen"
            : "Add"
      }
      savingLabel={nl ? "Toevoegen…" : "Adding…"}
      savedMessage={nl ? "Vakken toegevoegd." : "Courses added."}
      errorMessages={palPlusCourseListErrors(nl)}
      fallbackErrorMessage={nl ? "Niets toegevoegd." : "Nothing added."}
      submitDisabled={blocked}
      onSuccess={() => {
        setText("");
        onDone();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="locale" value={nl ? "nl" : "en"} />
      <div>
        <Label htmlFor="pal-course-list">{nl ? "Vakken, één per regel" : "Courses, one per line"}</Label>
        <Textarea
          id="pal-course-list"
          name="list"
          value={text}
          onChange={(event) => setText(event.target.value)}
          rows={8}
          placeholder={COURSE_LIST_EXAMPLE}
          spellCheck={false}
          className="font-mono text-xs"
        />
        <p className="mt-1 text-xs text-vtk-muted">
          {nl
            ? "De OPO-code en daarna de naam, of enkel een naam voor iets wat geen vak is. Een Engelse naam zet je erachter met een puntkomma: code; Nederlandse naam; Engelse naam. Kolommen uit een rekenblad (gescheiden door tabs) werken ook. Wat al in de lijst staat, wordt overgeslagen en niet overschreven."
            : "The course code followed by the name, or just a name for something that is not a course. Add an English name after a semicolon: code; Dutch name; English name. Columns pasted from a spreadsheet (separated by tabs) work too. Courses already on the list are skipped, not overwritten."}
        </p>
      </div>

      <label className="flex items-center gap-2 text-sm text-vtk-ink">
        <input type="checkbox" name="active" defaultChecked />
        <span>{nl ? "Meteen kiesbaar in het aanvraagformulier" : "Selectable in the request form right away"}</span>
      </label>

      {(plan.rows.length > 0 || plan.errors.length > 0) && (
        <div className="vtk-palplus-paste" aria-live="polite">
          <p className="text-sm text-vtk-body">
            {nl
              ? `${fresh} ${fresh === 1 ? "nieuw vak" : "nieuwe vakken"}` +
                (known > 0 ? `, ${known} ${known === 1 ? "wordt" : "worden"} overgeslagen` : "") +
                (plan.errors.length > 0
                  ? `, ${plan.errors.length} ${plan.errors.length === 1 ? "regel klopt" : "regels kloppen"} niet`
                  : "") +
                "."
              : `${fresh} new ${fresh === 1 ? "course" : "courses"}` +
                (known > 0 ? `, ${known} skipped` : "") +
                (plan.errors.length > 0
                  ? `, ${plan.errors.length} ${plan.errors.length === 1 ? "line does" : "lines do"} not work`
                  : "") +
                "."}
          </p>
          {plan.tooMany && (
            // Geen <p>: de admin kleurt elke paragraaf grijs en dit moet rood zijn.
            <div className="text-sm text-vtk-danger">
              {nl
                ? `Plak hoogstens ${PAL_PLUS_COURSE_LIST_MAX} vakken in één keer.`
                : `Paste at most ${PAL_PLUS_COURSE_LIST_MAX} courses at once.`}
            </div>
          )}
          <ul className="vtk-palplus-paste-list">
            {plan.errors.map((error) => (
              <li key={`e${error.line}`} data-status="error">
                <span className="vtk-palplus-paste-code">{nl ? `regel ${error.line}` : `line ${error.line}`}</span>
                <span className="vtk-palplus-paste-name">
                  {error.text}
                  <span className="vtk-palplus-sub">{palPlusCourseLineProblem(nl, error.error)}</span>
                </span>
              </li>
            ))}
            {plan.rows.map((row) => (
              <li key={`r${row.line}`} data-status={row.status}>
                <span className="vtk-palplus-paste-code">
                  {row.course.code ?? <span className="text-vtk-muted">{nl ? "geen" : "none"}</span>}
                </span>
                <span className="vtk-palplus-paste-name">
                  {row.course.nameNl}
                  {row.course.nameEn && <span className="vtk-palplus-sub">{row.course.nameEn}</span>}
                </span>
                <span className="vtk-palplus-paste-status">{STATUS_LABELS[row.status][nl ? "nl" : "en"]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SaveForm>
  );
}
