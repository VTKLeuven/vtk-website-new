"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label, Select, Textarea } from "@vtk/ui";
import Link from "@/components/ui/Link";
import { SaveForm } from "@/components/ui/SaveForm";
import { submitPalPlusRequestAction } from "@/app/actions/palPlus";
import { PAL_PLUS_LIMITS, PAL_PLUS_OTHER_COURSE } from "@/lib/palPlus";
import { palPlusMemberErrors } from "@/lib/palPlusMessages";
import { BackingButton, type BackingCopy } from "./BackingButton";
import { TagInput, type TagInputCopy } from "@/components/palPlus/TagInput";
import { AvailabilityGrid, type AvailabilityColumn } from "@/components/palPlus/AvailabilityGrid";

export type PalPlusFormCopy = {
  askTitle: string;
  giveTitle: string;
  respondingTo: string;
  courseLabel: string;
  coursePlaceholder: string;
  courseOtherOption: string;
  courseOtherLabel: string;
  courseOtherHelp: string;
  askDescriptionLabel: string;
  askDescriptionPlaceholder: string;
  giveDescriptionLabel: string;
  giveDescriptionPlaceholder: string;
  periodLabel: string;
  periodPlaceholder: string;
  tags: TagInputCopy;
  availabilityLabel: string;
  availabilityHelp: string;
  availabilityNoteLabel: string;
  availabilityNotePlaceholder: string;
  coTutorLabel: string;
  coTutorPlaceholder: string;
  coTutorHelp: string;
  askPrivacy: string;
  givePrivacy: string;
  duplicateTitle: string;
  duplicateBody: string;
  askSubmit: string;
  giveSubmit: string;
  submitting: string;
  askSent: string;
  giveSent: string;
  cancel: string;
  fallbackError: string;
};

export type CourseOption = { id: string; label: string };

/** Een open vraag zoals het formulier ze nodig heeft voor de dubbelwaarschuwing. */
export type OpenRequestHint = {
  id: string;
  description: string;
  askersLabel: string;
  backedByMe: boolean;
  mine: boolean;
};

/**
 * Het formulier "ik zoek hulp" of "ik wil een sessie geven".
 *
 * Bij een hulpvraag toont het, zodra je een vak kiest, de vragen die er voor
 * dat vak al openstaan, met de knop om die te steunen: één vraag met vijf
 * steunen zegt Onderwijs meer dan vijf losse vragen.
 */
export function PalPlusRequestForm({
  kind,
  nl,
  base,
  copy,
  backingCopy,
  courses,
  openByCourse,
  respondsTo,
  tagPresets,
  tagSuggestionsByCourse,
  dayparts,
}: {
  kind: "GIVE" | "FOLLOW";
  nl: boolean;
  base: string;
  copy: PalPlusFormCopy;
  backingCopy: BackingCopy;
  courses: CourseOption[];
  openByCourse: Record<string, OpenRequestHint[]>;
  respondsTo: {
    id: string;
    courseId: string | null;
    courseLabel: string;
    description: string;
    tags: string[];
  } | null;
  tagPresets: string[];
  tagSuggestionsByCourse: Record<string, string[]>;
  dayparts: AvailabilityColumn[];
}) {
  const router = useRouter();
  const give = kind === "GIVE";
  // Antwoord op een vraag: hetzelfde vak al gekozen. Tikte de vrager het vak
  // zelf in, dan staat "mijn vak staat er niet tussen" klaar met die naam.
  const initialCourse = !respondsTo
    ? ""
    : respondsTo.courseId && courses.some((course) => course.id === respondsTo.courseId)
      ? respondsTo.courseId
      : respondsTo.courseId
        ? ""
        : PAL_PLUS_OTHER_COURSE;
  const [courseId, setCourseId] = useState(initialCourse);
  const duplicates = !give && courseId ? (openByCourse[courseId] ?? []) : [];

  return (
    <section className="vtk-panel pp-form-panel" id="formulier" aria-labelledby="pp-form-title">
      <h2 id="pp-form-title" className="pp-form-title">
        {give ? copy.giveTitle : copy.askTitle}
      </h2>

      {respondsTo && (
        <div className="pp-responding">
          <p className="pp-responding-label">{copy.respondingTo}</p>
          <p className="pp-responding-course">{respondsTo.courseLabel}</p>
          <p className="pp-responding-text">{respondsTo.description}</p>
        </div>
      )}

      <SaveForm
        action={submitPalPlusRequestAction}
        submitLabel={give ? copy.giveSubmit : copy.askSubmit}
        savingLabel={copy.submitting}
        savedMessage={give ? copy.giveSent : copy.askSent}
        errorMessages={palPlusMemberErrors(nl)}
        fallbackErrorMessage={copy.fallbackError}
        resetOnSuccess
        onSuccess={() => router.replace(`${base}/pal-plus#jouw-aanvragen`)}
        className="pp-form"
        footer={({ submitButton, confirmDialog }) => (
          <div className="pp-form-actions">
            {submitButton}
            <Link href={`${base}/pal-plus`} className="vtk-button vtk-button-ghost">
              {copy.cancel}
            </Link>
            {confirmDialog}
          </div>
        )}
      >
        <input type="hidden" name="kind" value={kind} />
        {respondsTo && <input type="hidden" name="respondsToId" value={respondsTo.id} />}

        <div>
          <Label htmlFor="pp-course">{copy.courseLabel}</Label>
          <Select
            id="pp-course"
            name="courseId"
            value={courseId}
            onChange={(event) => setCourseId(event.target.value)}
            required
          >
            <option value="" disabled>
              {copy.coursePlaceholder}
            </option>
            {courses.map((course) => (
              <option key={course.id} value={course.id}>
                {course.label}
              </option>
            ))}
            <option value={PAL_PLUS_OTHER_COURSE}>{copy.courseOtherOption}</option>
          </Select>
        </div>

        {courseId === PAL_PLUS_OTHER_COURSE && (
          <div>
            <Label htmlFor="pp-course-other">{copy.courseOtherLabel}</Label>
            <Input
              id="pp-course-other"
              name="courseOther"
              maxLength={PAL_PLUS_LIMITS.courseOther}
              defaultValue={respondsTo && !respondsTo.courseId ? respondsTo.courseLabel : ""}
              required
            />
            <p className="pp-help">{copy.courseOtherHelp}</p>
          </div>
        )}

        {duplicates.length > 0 && (
          <div className="pp-duplicates" role="status">
            <p className="pp-duplicates-title">{copy.duplicateTitle}</p>
            <p className="pp-help">{copy.duplicateBody}</p>
            <ul>
              {duplicates.map((request) => (
                <li key={request.id}>
                  <p className="pp-duplicates-text">{request.description}</p>
                  <div className="pp-duplicates-row">
                    <span className="pp-askers">{request.askersLabel}</span>
                    <BackingButton
                      requestId={request.id}
                      backed={request.backedByMe}
                      mine={request.mine}
                      copy={backingCopy}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <Label htmlFor="pp-description">
            {give ? copy.giveDescriptionLabel : copy.askDescriptionLabel}
          </Label>
          <Textarea
            id="pp-description"
            name="description"
            rows={4}
            maxLength={PAL_PLUS_LIMITS.description}
            placeholder={give ? copy.giveDescriptionPlaceholder : copy.askDescriptionPlaceholder}
            required
          />
        </div>

        <TagInput
          presets={tagPresets}
          suggestions={courseId ? (tagSuggestionsByCourse[courseId] ?? []) : []}
          initial={respondsTo?.tags ?? []}
          copy={copy.tags}
        />

        {give ? (
          <>
            <fieldset className="pp-moment">
              <legend className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.08em] text-vtk-muted">
                {copy.availabilityLabel}
              </legend>
              {dayparts.length > 0 && <AvailabilityGrid columns={dayparts} nl={nl} legend={copy.availabilityLabel} />}
              <p className="pp-help">{copy.availabilityHelp}</p>
              <div className="mt-3">
                <Label htmlFor="pp-availability-note">{copy.availabilityNoteLabel}</Label>
                <Textarea
                  id="pp-availability-note"
                  name="availabilityNote"
                  rows={2}
                  maxLength={PAL_PLUS_LIMITS.availabilityNote}
                  placeholder={copy.availabilityNotePlaceholder}
                />
              </div>
            </fieldset>
            <div>
              <Label htmlFor="pp-cotutor">{copy.coTutorLabel}</Label>
              <Input
                id="pp-cotutor"
                name="coTutor"
                className="sm:max-w-56"
                placeholder={copy.coTutorPlaceholder}
                autoComplete="off"
                spellCheck={false}
                maxLength={12}
              />
              <p className="pp-help">{copy.coTutorHelp}</p>
            </div>
          </>
        ) : (
          <div>
            <Label htmlFor="pp-period">{copy.periodLabel}</Label>
            <Input
              id="pp-period"
              name="preferredPeriod"
              maxLength={PAL_PLUS_LIMITS.preferredPeriod}
              placeholder={copy.periodPlaceholder}
            />
          </div>
        )}

        <p className="pp-help">{give ? copy.givePrivacy : copy.askPrivacy}</p>
      </SaveForm>
    </section>
  );
}
