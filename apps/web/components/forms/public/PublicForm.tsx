"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@vtk/ui";
import { useToast } from "@/components/ui/toast";
import { FormFieldBlock } from "@/components/forms/FormFieldBlock";
import type { PublicFormField } from "@/components/forms/FormFieldInput";
import { FormFileField, type UploadedFile } from "./FormFileField";
import { submitFormAction } from "@/app/actions/formSubmission";
import { trackFormSubmitted } from "@/lib/analytics-client";
import { visibleFieldIds, type AnswerValue, type VisibilityCondition } from "@/lib/forms/visibility";
import { steps as branchSteps, type BranchOption, type BranchSection } from "@/lib/forms/branching";
import { DEFAULT_FILE_MAX_FILES } from "@/lib/forms/schema";

export type PublicSection = {
  id: string;
  sortOrder: number;
  titleNl: string;
  titleEn: string | null;
  descriptionNl: string | null;
  descriptionEn: string | null;
  nextSectionId: string | null;
  endsForm: boolean;
};

type FieldWithSection = PublicFormField & { sectionId: string | null };

const ERROR_MESSAGES: Record<string, [string, string]> = {
  REQUIRED: ["Dit veld is verplicht.", "This field is required."],
  CONSENT_REQUIRED: ["Je moet dit aanvinken om verder te kunnen.", "You have to tick this to continue."],
  EMAIL: ["Dit is geen geldig e-mailadres.", "This is not a valid e-mail address."],
  URL: ["Dit is geen geldige link.", "This is not a valid link."],
  TIME: ["Gebruik een tijdstip als 19:30.", "Use a time like 19:30."],
  DATE: ["Dit is geen geldige datum.", "This is not a valid date."],
  DATE_TOO_EARLY: ["Deze datum ligt te vroeg.", "This date is too early."],
  DATE_TOO_LATE: ["Deze datum ligt te laat.", "This date is too late."],
  NUMBER: ["Dit is geen geldig getal.", "This is not a valid number."],
  NUMBER_INTEGER: ["Gebruik een heel getal.", "Use a whole number."],
  NUMBER_TOO_SMALL: ["Dit getal is te klein.", "This number is too small."],
  NUMBER_TOO_LARGE: ["Dit getal is te groot.", "This number is too large."],
  SCALE: ["Kies een waarde op de schaal.", "Pick a value on the scale."],
  TOO_LONG: ["Dit antwoord is te lang.", "This answer is too long."],
  TOO_MANY_LINES: ["Dit antwoord heeft te veel regels.", "This answer has too many lines."],
  PATTERN: ["Dit antwoord heeft niet de juiste vorm.", "This answer does not have the right shape."],
  RNUMBER: ["Een r-nummer ziet eruit als r0123456.", "An r-number looks like r0123456."],
  UNKNOWN_OPTION: ["Deze keuze bestaat niet meer.", "This choice no longer exists."],
  TOO_MANY_CHOICES: ["Je duidde te veel opties aan.", "You picked too many options."],
  TOO_FEW_CHOICES: ["Je duidde te weinig opties aan.", "You picked too few options."],
  OTHER_NOT_ALLOWED: ["Vrije tekst kan hier niet.", "Free text is not allowed here."],
  TOO_MANY_FILES: ["Je koos te veel bestanden.", "You chose too many files."],
  FILE_TYPE: ["Dit bestandstype is niet toegelaten.", "This file type is not allowed."],
};

function errorText(code: string, nl: boolean): string {
  const message = ERROR_MESSAGES[code];
  if (!message) return nl ? "Dit antwoord kan niet." : "This answer is not valid.";
  return message[nl ? 0 : 1];
}

export function PublicForm({
  formId,
  slug,
  locale,
  fields,
  sections,
  conditions,
  initialAnswers,
  initialFiles,
  entryId,
  allowDrafts,
  successHref,
  consent,
  privacyUrl,
  canTest,
  stepBySections,
  branchOptions,
  onWaitlist,
}: {
  formId: string;
  slug: string;
  locale: "nl" | "en";
  fields: FieldWithSection[];
  sections: PublicSection[];
  conditions: VisibilityCondition[];
  initialAnswers: Record<string, AnswerValue>;
  initialFiles: Record<string, UploadedFile[]>;
  entryId: string | null;
  allowDrafts: boolean;
  /**
   * Waar de bezoeker na het versturen terechtkomt. Op zijn eigen pagina is dat
   * de bedanktroute; staat het formulier in een contentpagina, dan blijft hij op
   * die pagina staan, want daar was hij naartoe gekomen.
   */
  successHref: string;
  consent: { required: boolean; text: string } | null;
  privacyUrl: string;
  canTest: boolean;
  /** Secties één voor één tonen, met sprongen op basis van de antwoorden. */
  stepBySections: boolean;
  branchOptions: BranchOption[];
  /** Het formulier zit vol maar aanvaardt nog wachtlijstinzendingen. */
  onWaitlist: boolean;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>(initialAnswers);
  const [files, setFiles] = useState<Record<string, UploadedFile[]>>(initialFiles);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [consentGiven, setConsentGiven] = useState(false);
  const [isTest, setIsTest] = useState(false);
  // Wanneer het formulier op het scherm kwam, om te snel invullen te herkennen.
  // Pas in een effect gezet: tijdens het renderen mag dit niet, en de waarde
  // hoort ook bij de browser en niet bij de server-render.
  const startedAt = useRef<number | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);

  useEffect(() => {
    startedAt.current = Date.now();
  }, []);

  const visible = useMemo(
    () =>
      visibleFieldIds(
        fields.map((field) => ({ id: field.id, type: field.type })),
        conditions,
        answers
      ),
    [fields, conditions, answers]
  );

  const branchSections: BranchSection[] = useMemo(
    () =>
      sections.map((section) => ({
        id: section.id,
        sortOrder: section.sortOrder,
        nextSectionId: section.nextSectionId,
        endsForm: section.endsForm,
      })),
    [sections]
  );

  const branchFields = useMemo(
    () =>
      fields.map((field) => ({
        id: field.id,
        type: field.type,
        sectionId: field.sectionId,
        sortOrder: 0,
      })),
    [fields]
  );

  // De stappen volgen de antwoorden: een sprong die een sectie overslaat, haalt
  // ze meteen uit deze lijst, dus ook uit de voortgangsbalk.
  const formSteps = useMemo(
    () =>
      stepBySections
        ? branchSteps(branchSections, branchFields, branchOptions, answers, visible)
        : [],
    [stepBySections, branchSections, branchFields, branchOptions, answers, visible]
  );

  const [stepIndex, setStepIndex] = useState(0);
  // Springt de bezoeker terug en kiest hij iets anders, dan kan het pad korter
  // worden dan waar hij stond.
  const currentStep = Math.min(stepIndex, Math.max(0, formSteps.length - 1));
  const isLastStep = !stepBySections || currentStep >= formSteps.length - 1;

  const visibleFields = fields.filter((field) => visible.has(field.id));
  // De voortgang telt de verplichte velden die zichtbaar én ingevuld zijn; dat
  // is wat een bezoeker wil weten, niet hoeveel velden er in totaal bestaan.
  const stepFields = stepBySections
    ? visibleFields.filter(
        (field) => (field.sectionId ?? null) === (formSteps[currentStep]?.sectionId ?? null)
      )
    : visibleFields;

  const requiredFields = (stepBySections ? stepFields : visibleFields).filter(
    (field) => field.required
  );
  const doneCount = requiredFields.filter((field) =>
    field.type === "FILE"
      ? (files[field.id]?.length ?? 0) > 0
      : hasValue(answers[field.id], field.type)
  ).length;

  function send(asDraft: boolean) {
    setErrors({});
    startTransition(async () => {
      const result = await submitFormAction({
        formId,
        entryId,
        locale,
        answers: Object.fromEntries(
          Object.entries(answers).filter(([fieldId]) => visible.has(fieldId))
        ),
        uploads: Object.fromEntries(
          Object.entries(files)
            .filter(([fieldId]) => visible.has(fieldId))
            .map(([fieldId, list]) => [fieldId, list.map((file) => file.token)])
        ),
        honeypot: honeypot.current?.value ?? "",
        startedAt: startedAt.current,
        asDraft,
        isTest,
        consent: consentGiven,
      });

      if (result.status === "invalid") {
        setErrors(result.errors);
        if (result.formError === "CONSENT_REQUIRED") {
          showToast({
            message: nl
              ? "Vink de toestemming aan om verder te kunnen."
              : "Tick the consent box to continue.",
            variant: "error",
            duration: 0,
          });
        }
        // Naar de eerste fout springen; een foutmelding onderaan een lang
        // formulier mis je gemakkelijk.
        errorSummary.current?.focus();
        return;
      }

      if (result.status === "rejected") {
        showToast({
          message: rejectionText(result.reason, nl),
          variant: "error",
          duration: 0,
        });
        return;
      }

      if (result.status === "draft") {
        showToast({
          message: nl
            ? "Concept bewaard. Je kan later verdergaan."
            : "Draft saved. You can continue later.",
          variant: "success",
        });
        return;
      }

      const flags = new URLSearchParams();
      if (result.duplicate) flags.set("dubbel", "1");
      if (result.waitlisted) flags.set("wachtlijst", "1");
      const query = flags.toString();
      trackFormSubmitted({ slug });
      // De bestemming kan zelf al een query of een anker dragen (het paneel in
      // een contentpagina wijst naar `...?formulier=verstuurd#formulier`).
      const [path, anchor] = successHref.split("#");
      const target = `${path}${query ? `${path.includes("?") ? "&" : "?"}${query}` : ""}${
        anchor ? `#${anchor}` : ""
      }`;
      router.push(target);
    });
  }

  const errorCount = Object.keys(errors).length;

  return (
    <form
      className="vtk-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        // Enter in een tekstveld verstuurt een formulier. Halverwege een reeks
        // stappen is dat nooit de bedoeling, dus dan gaan we gewoon verder.
        if (stepBySections && !isLastStep) {
          setStepIndex(currentStep + 1);
          return;
        }
        send(false);
      }}
    >
      {/* Het verborgen veld. `aria-hidden` plus tabIndex houdt het weg bij wie
          met een screenreader of toetsenbord werkt; een bot vult het wel in. */}
      <input
        ref={honeypot}
        type="text"
        name="bericht_extra"
        className="sr-only"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
      />

      {errorCount > 0 ? (
        <div
          className="vtk-form-summary"
          role="alert"
          tabIndex={-1}
          ref={errorSummary}
        >
          {nl
            ? `Er ${errorCount === 1 ? "is 1 vraag" : `zijn ${errorCount} vragen`} die nog niet klopt.`
            : `There ${errorCount === 1 ? "is 1 question" : `are ${errorCount} questions`} that need attention.`}
        </div>
      ) : null}

      {onWaitlist ? (
        <div className="vtk-form-notice" data-tone="warning">
          <p>
            {nl
              ? "Dit formulier zit vol. Je kan nog invullen, maar je komt op de wachtlijst; we laten weten of er een plaats vrijkomt."
              : "This form is full. You can still fill it in, but you will be on the waiting list; we will let you know if a spot frees up."}
          </p>
        </div>
      ) : null}

      {stepBySections && formSteps.length > 1 ? (
        <div className="vtk-form-progress-summary">
          <div className="vtk-form-progress-bar">
            <span style={{ width: `${Math.round(((currentStep + 1) / formSteps.length) * 100)}%` }} />
          </div>
          <p>
            {nl
              ? `Stap ${currentStep + 1} van ${formSteps.length}`
              : `Step ${currentStep + 1} of ${formSteps.length}`}
          </p>
        </div>
      ) : requiredFields.length > 0 && sections.length > 0 ? (
        <div className="vtk-form-progress-summary">
          <div className="vtk-form-progress-bar">
            <span
              style={{ width: `${Math.round((doneCount / requiredFields.length) * 100)}%` }}
            />
          </div>
          <p>
            {nl
              ? `${doneCount} van ${requiredFields.length} verplichte vragen ingevuld`
              : `${doneCount} of ${requiredFields.length} required questions answered`}
          </p>
        </div>
      ) : null}

      {stepBySections ? (
        <StepView
          section={sections.find((entry) => entry.id === formSteps[currentStep]?.sectionId) ?? null}
          fields={stepFields}
          locale={locale}
          {...{ formId, answers, setAnswers, files, setFiles, errors, nl }}
        />
      ) : null}

      {stepBySections ? null : (
        <FieldGroup
          fields={visibleFields.filter((field) => !field.sectionId)}
          {...{ formId, locale, answers, setAnswers, files, setFiles, errors, nl }}
        />
      )}

      {(stepBySections ? [] : sections).map((section) => {
        const inSection = visibleFields.filter((field) => field.sectionId === section.id);
        if (inSection.length === 0) return null;
        const title = locale === "en" && section.titleEn ? section.titleEn : section.titleNl;
        const description =
          locale === "en" && section.descriptionEn
            ? section.descriptionEn
            : section.descriptionNl;
        return (
          <section key={section.id} className="vtk-form-section" aria-labelledby={`s-${section.id}`}>
            <h2 id={`s-${section.id}`}>{title}</h2>
            {description ? <p className="vtk-form-section-intro">{description}</p> : null}
            <FieldGroup
              fields={inSection}
              {...{ formId, locale, answers, setAnswers, files, setFiles, errors, nl }}
            />
          </section>
        );
      })}

      {consent && isLastStep ? (
        <label className="vtk-form-check">
          <input
            type="checkbox"
            checked={consentGiven}
            onChange={(event) => setConsentGiven(event.target.checked)}
            required={consent.required}
          />
          <span>
            {consent.text}{" "}
            <a href={privacyUrl} target="_blank" rel="noreferrer">
              {nl ? "Privacybeleid" : "Privacy policy"}
            </a>
          </span>
        </label>
      ) : null}

      {canTest && isLastStep ? (
        <label className="vtk-form-check">
          <input
            type="checkbox"
            checked={isTest}
            onChange={(event) => setIsTest(event.target.checked)}
          />
          <span>
            {nl
              ? "Dit is een testinzending (telt niet mee in de resultaten)"
              : "This is a test entry (does not count in the results)"}
          </span>
        </label>
      ) : null}

      <div className="vtk-form-actions">
        {stepBySections && currentStep > 0 ? (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => setStepIndex(currentStep - 1)}
          >
            {nl ? "Vorige" : "Back"}
          </Button>
        ) : null}

        {stepBySections && !isLastStep ? (
          <Button type="submit">{nl ? "Volgende" : "Next"}</Button>
        ) : (
          <Button type="submit" disabled={pending}>
          {pending
            ? nl
              ? "Bezig met versturen..."
              : "Sending..."
            : entryId
              ? nl
                ? "Wijzigingen opslaan"
                : "Save changes"
              : onWaitlist
              ? nl
                ? "Op de wachtlijst zetten"
                : "Join the waiting list"
              : nl
                ? "Versturen"
                : "Submit"}
          </Button>
        )}
        {allowDrafts ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={() => send(true)}>
            {nl ? "Bewaren en later verdergaan" : "Save and continue later"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function FieldGroup({
  fields,
  formId,
  locale,
  answers,
  setAnswers,
  files,
  setFiles,
  errors,
  nl,
}: {
  fields: FieldWithSection[];
  formId: string;
  locale: "nl" | "en";
  answers: Record<string, AnswerValue>;
  setAnswers: (next: (current: Record<string, AnswerValue>) => Record<string, AnswerValue>) => void;
  files: Record<string, UploadedFile[]>;
  setFiles: (next: (current: Record<string, UploadedFile[]>) => Record<string, UploadedFile[]>) => void;
  errors: Record<string, string>;
  nl: boolean;
}) {
  return (
    <>
      {fields.map((field) => {
        const error = errors[field.id] ? errorText(errors[field.id], nl) : null;

        if (field.type === "FILE") {
          return (
            <div className="vtk-form-field" key={field.id} data-invalid={error ? "true" : undefined}>
              <span className="vtk-form-label">
                {locale === "en" && field.labelEn ? field.labelEn : field.labelNl}
                {field.required ? <span className="vtk-form-required" aria-hidden="true">*</span> : null}
              </span>
              {field.helpNl || field.helpEn ? (
                <p className="vtk-form-help">
                  {locale === "en" && field.helpEn ? field.helpEn : field.helpNl}
                </p>
              ) : null}
              <FormFileField
                formId={formId}
                fieldId={field.id}
                locale={locale}
                maxFiles={field.config.maxFiles ?? DEFAULT_FILE_MAX_FILES}
                accept={field.config.allowedExtensions
                  ?.map((extension) => `.${extension}`)
                  .join(",")}
                files={files[field.id] ?? []}
                onChange={(next) =>
                  setFiles((current) => ({ ...current, [field.id]: next }))
                }
              />
              {error ? <p className="vtk-form-error">{error}</p> : null}
            </div>
          );
        }

        return (
          <FormFieldBlock
            key={field.id}
            field={field}
            locale={locale}
            error={error}
            value={answers[field.id] ?? {}}
            onChange={(next) => setAnswers((current) => ({ ...current, [field.id]: next }))}
          />
        );
      })}
    </>
  );
}

/** Eén stap: de titel en beschrijving van de sectie, plus haar velden. */
function StepView({
  section,
  fields,
  formId,
  locale,
  answers,
  setAnswers,
  files,
  setFiles,
  errors,
  nl,
}: {
  section: PublicSection | null;
  fields: FieldWithSection[];
  formId: string;
  locale: "nl" | "en";
  answers: Record<string, AnswerValue>;
  setAnswers: (next: (current: Record<string, AnswerValue>) => Record<string, AnswerValue>) => void;
  files: Record<string, UploadedFile[]>;
  setFiles: (next: (current: Record<string, UploadedFile[]>) => Record<string, UploadedFile[]>) => void;
  errors: Record<string, string>;
  nl: boolean;
}) {
  const title = section
    ? locale === "en" && section.titleEn
      ? section.titleEn
      : section.titleNl
    : null;
  const description = section
    ? locale === "en" && section.descriptionEn
      ? section.descriptionEn
      : section.descriptionNl
    : null;

  return (
    <section className="vtk-form-section" aria-labelledby={section ? `s-${section.id}` : undefined}>
      {title ? <h2 id={`s-${section?.id}`}>{title}</h2> : null}
      {description ? <p className="vtk-form-section-intro">{description}</p> : null}
      <FieldGroup
        fields={fields}
        {...{ formId, locale, answers, setAnswers, files, setFiles, errors, nl }}
      />
    </section>
  );
}

function hasValue(value: AnswerValue | undefined, type: string): boolean {
  if (!value) return false;
  if (type === "BOOLEAN" || type === "CONSENT") return value.checked === true;
  if ((value.options?.length ?? 0) > 0) return true;
  if (value.number !== null && value.number !== undefined) return true;
  return Boolean(value.text?.trim());
}

function rejectionText(reason: string, nl: boolean): string {
  switch (reason) {
    case "FULL":
      return nl
        ? "Dit formulier zit intussen vol."
        : "This form has filled up in the meantime.";
    case "OPTION_FULL":
      return nl
        ? "Een van je keuzes is intussen volzet. Kies iets anders en probeer opnieuw."
        : "One of your choices just filled up. Pick another one and try again.";
    case "CLOSED":
      return nl ? "Dit formulier is intussen gesloten." : "This form has closed in the meantime.";
    case "RATE_LIMITED":
      return nl
        ? "Je stuurde net al een aantal inzendingen. Probeer straks opnieuw."
        : "You just sent several entries. Please try again later.";
    case "ALREADY_SUBMITTED":
      return nl ? "Je diende dit formulier al in." : "You already submitted this form.";
    default:
      return nl ? "Versturen is niet gelukt." : "Sending failed.";
  }
}
