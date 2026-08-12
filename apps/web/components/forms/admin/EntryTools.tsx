"use client";

import { useMemo, useState, useTransition } from "react";
import { Download, FileArchive, FileText, UserPlus } from "lucide-react";
import { Button } from "@vtk/ui";
import {
  addEntryOnBehalfAction,
  editFormEntryAction,
} from "@/app/actions/formEntries";
import { useToast } from "@/components/ui/toast";
import { SaveForm } from "@/components/ui/SaveForm";
import { FormFieldBlock } from "@/components/forms/FormFieldBlock";
import type { PublicFormField } from "@/components/forms/FormFieldInput";
import { visibleFieldIds, type AnswerValue, type VisibilityCondition } from "@/lib/forms/visibility";
import {
  fieldsOnPath,
  sectionPath,
  type BranchOption,
  type BranchSection,
} from "@/lib/forms/branching";
import type { AdminLocale } from "./format";

export type ExportColumn = { code: string; label: string; archived: boolean };
export type ManagedEntryField = PublicFormField & {
  sectionId: string | null;
  sortOrder: number;
};

function entryVisibleFieldIds({
  fields,
  conditions,
  answers,
  stepBySections,
  sections,
  branchOptions,
}: {
  fields: ManagedEntryField[];
  conditions: VisibilityCondition[];
  answers: Record<string, AnswerValue>;
  stepBySections: boolean;
  sections: BranchSection[];
  branchOptions: BranchOption[];
}): Set<string> {
  const visible = visibleFieldIds(
    fields.map((field) => ({ id: field.id, type: field.type })),
    conditions,
    answers
  );
  if (!stepBySections) return visible;

  const path = sectionPath(sections, fields, branchOptions, answers, visible);
  const onPath = fieldsOnPath(fields, path);
  for (const field of fields) {
    if (!onPath.has(field.id)) visible.delete(field.id);
  }
  return visible;
}

function EntryAnswerFields({
  locale,
  fields,
  visible,
  answers,
  setAnswers,
  errors,
  fileHint,
}: {
  locale: AdminLocale;
  fields: ManagedEntryField[];
  visible: Set<string>;
  answers: Record<string, AnswerValue>;
  setAnswers: (next: (current: Record<string, AnswerValue>) => Record<string, AnswerValue>) => void;
  errors: Record<string, string>;
  fileHint: string;
}) {
  const nl = locale === "nl";
  return (
    <>
      <div className="vtk-form">
        {fields
          .filter((field) => visible.has(field.id) && field.type !== "FILE")
          .map((field) => (
            <FormFieldBlock
              key={field.id}
              field={field}
              locale={locale}
              error={
                errors[field.id]
                  ? nl
                    ? "Dit antwoord kan niet."
                    : "This answer is not valid."
                  : null
              }
              value={answers[field.id] ?? {}}
              onChange={(next) =>
                setAnswers((current) => ({ ...current, [field.id]: next }))
              }
            />
          ))}
      </div>
      {fields.some((field) => visible.has(field.id) && field.type === "FILE") ? (
        <p className="form-admin-hint">{fileHint}</p>
      ) : null}
    </>
  );
}

/**
 * Exporteren met een kolomkeuze.
 *
 * Standaard staat alles aan; dat is wat je meestal wil. Wie een lijst voor de
 * cateraar maakt, vinkt de rest uit in plaats van achteraf kolommen te wissen
 * in een spreadsheet.
 */
export function ExportPanel({
  locale,
  formId,
  columns,
  filters,
}: {
  locale: AdminLocale;
  formId: string;
  columns: ExportColumn[];
  filters: { q?: string; beoordeling?: string; test?: string };
}) {
  const nl = locale === "nl";
  const [chosen, setChosen] = useState<string[]>(columns.map((column) => column.code));
  const [withMetadata, setWithMetadata] = useState(true);

  const allChosen = chosen.length === columns.length;
  const query = new URLSearchParams({
    locale,
    ...(filters.q ? { q: filters.q } : {}),
    ...(filters.beoordeling ? { beoordeling: filters.beoordeling } : {}),
    ...(filters.test ? { test: filters.test } : {}),
    ...(allChosen ? {} : { velden: chosen.join(",") }),
    ...(withMetadata ? {} : { meta: "0" }),
  }).toString();

  return (
    <details className="ticket-admin-details">
      <summary>{nl ? "Exporteren" : "Export"}</summary>
      <div className="ticket-admin-details-body">
        <p className="form-admin-hint">
          {nl
            ? "De export volgt de filters hierboven, dus je krijgt wat je nu ziet."
            : "The export follows the filters above, so you get what you see now."}
        </p>

        <fieldset className="form-admin-fieldset">
          <legend>{nl ? "Kolommen" : "Columns"}</legend>
          <label className="ticket-admin-check">
            <input
              type="checkbox"
              checked={withMetadata}
              onChange={(event) => setWithMetadata(event.target.checked)}
            />
            {nl
              ? "Datum, naam, e-mail en opvolging meenemen"
              : "Include date, name, e-mail and follow-up"}
          </label>
          {columns.map((column) => (
            <label className="ticket-admin-check" key={column.code}>
              <input
                type="checkbox"
                checked={chosen.includes(column.code)}
                onChange={(event) =>
                  setChosen((current) =>
                    event.target.checked
                      ? [...current, column.code]
                      : current.filter((code) => code !== column.code)
                  )
                }
              />
              {column.label}
              {column.archived ? (
                <span className="ticket-admin-row-meta">
                  {nl ? " (van het formulier gehaald)" : " (removed from the form)"}
                </span>
              ) : null}
            </label>
          ))}
        </fieldset>

        <div className="ticket-admin-row-actions">
          <a
            className="ticket-admin-button"
            data-variant="primary"
            href={`/api/forms/${formId}/exports/entries?${query}`}
          >
            <Download aria-hidden="true" size={15} />
            CSV
          </a>
          <a className="ticket-admin-button" href={`/api/forms/${formId}/exports/pdf?${query}`}>
            <FileText aria-hidden="true" size={15} />
            PDF
          </a>
          <a className="ticket-admin-button" href={`/api/forms/${formId}/exports/bestanden`}>
            <FileArchive aria-hidden="true" size={15} />
            {nl ? "Bestanden (zip)" : "Files (zip)"}
          </a>
        </div>
      </div>
    </details>
  );
}

/**
 * Een inzending intikken voor wie ze doormailde of doorbelde. Gebruikt exact
 * hetzelfde formulier als de bezoeker ziet, zodat de beheerder niet in een
 * tweede, afwijkende versie zit te typen.
 */
export function AddEntryPanel({
  locale,
  formId,
  fields,
  conditions,
  stepBySections,
  sections,
  branchOptions,
}: {
  locale: AdminLocale;
  formId: string;
  fields: ManagedEntryField[];
  conditions: VisibilityCondition[];
  stepBySections: boolean;
  sections: BranchSection[];
  branchOptions: BranchOption[];
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const visible = useMemo(
    () =>
      entryVisibleFieldIds({
        fields,
        conditions,
        answers,
        stepBySections,
        sections,
        branchOptions,
      }),
    [fields, conditions, answers, stepBySections, sections, branchOptions]
  );

  function submit() {
    setErrors({});
    startTransition(async () => {
      const result = await addEntryOnBehalfAction({
        formId,
        locale,
        submitterName: name,
        submitterEmail: email,
        answers: Object.fromEntries(
          Object.entries(answers).filter(([fieldId]) => visible.has(fieldId))
        ),
      });

      if (result.status === "invalid") {
        setErrors(result.errors);
        showToast({
          message: nl
            ? "Een paar antwoorden kloppen nog niet."
            : "A few answers are not valid yet.",
          variant: "error",
          duration: 0,
        });
        return;
      }
      if (result.status === "rejected") {
        showToast({
          message:
            result.reason === "OPTION_FULL"
              ? nl
                ? "Een van de gekozen opties is volzet."
                : "One of the chosen options is full."
              : result.reason === "FULL"
                ? nl
                  ? "Het formulier zit vol."
                  : "The form is full."
                : nl
                  ? "Toevoegen is niet gelukt."
                  : "Adding failed.",
          variant: "error",
          duration: 0,
        });
        return;
      }

      showToast({ message: nl ? "Inzending toegevoegd" : "Entry added", variant: "success" });
      setAnswers({});
      setName("");
      setEmail("");
    });
  }

  return (
    <details className="ticket-admin-details">
      <summary>
        {nl ? "Inzending toevoegen namens iemand" : "Add an entry on behalf of someone"}
      </summary>
      <div className="ticket-admin-details-body">
        <p className="form-admin-hint">
          {nl
            ? "Voor wie zijn inschrijving doormailde of doorbelde. Er vertrekt geen bevestigingsmail, want de inzender deed dit niet zelf. Het formulier hoeft hiervoor niet open te staan."
            : "For someone who mailed or called their entry in. No confirmation mail is sent, because they did not do this themselves. The form does not need to be open."}
        </p>

        <div className="ticket-admin-form-grid">
          <div className="ticket-admin-field">
            <label htmlFor="behalf-name">{nl ? "Naam" : "Name"}</label>
            <input
              id="behalf-name"
              value={name}
              maxLength={200}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="behalf-email">E-mail</label>
            <input
              id="behalf-email"
              type="email"
              value={email}
              maxLength={320}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
        </div>

        <EntryAnswerFields
          {...{ locale, fields, visible, answers, setAnswers, errors }}
          fileHint={
            nl
              ? "Uploadvelden staan hier niet: die vult de inzender zelf in."
              : "Upload fields are not here: the submitter fills those in themselves."
          }
        />

        <div className="ticket-admin-row-actions">
          <Button type="button" onClick={submit} disabled={pending}>
            <UserPlus aria-hidden="true" size={15} />
            {pending ? (nl ? "Bezig..." : "Adding...") : nl ? "Inzending toevoegen" : "Add entry"}
          </Button>
        </div>
      </div>
    </details>
  );
}

/** De antwoorden aanpassen met dezelfde renderer en vertakkingen als publiek. */
export function EditEntryForm({
  locale,
  formId,
  entryId,
  fields,
  conditions,
  stepBySections,
  sections,
  branchOptions,
  initialAnswers,
  initialName,
  initialEmail,
}: {
  locale: AdminLocale;
  formId: string;
  entryId: string;
  fields: ManagedEntryField[];
  conditions: VisibilityCondition[];
  stepBySections: boolean;
  sections: BranchSection[];
  branchOptions: BranchOption[];
  initialAnswers: Record<string, AnswerValue>;
  initialName: string;
  initialEmail: string;
}) {
  const nl = locale === "nl";
  const [answers, setAnswers] = useState(initialAnswers);
  const [name, setName] = useState(initialName);
  const [email, setEmail] = useState(initialEmail);
  const visible = useMemo(
    () =>
      entryVisibleFieldIds({
        fields,
        conditions,
        answers,
        stepBySections,
        sections,
        branchOptions,
      }),
    [fields, conditions, answers, stepBySections, sections, branchOptions]
  );
  const submittedAnswers = Object.fromEntries(
    Object.entries(answers).filter(([fieldId]) => visible.has(fieldId))
  );

  return (
    <SaveForm
      action={editFormEntryAction}
      className="ticket-admin-form"
      submitLabel={nl ? "Wijzigingen opslaan" : "Save changes"}
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={nl ? "Inzending bijgewerkt" : "Entry updated"}
      resetOnSuccess={false}
      fallbackErrorMessage={
        nl ? "De inzending kon niet worden bijgewerkt." : "The entry could not be updated."
      }
      errorMessages={{
        INVALID_INPUT: nl ? "De invoer is niet geldig." : "The input is not valid.",
        INVALID_ANSWERS: nl
          ? "Een paar antwoorden kloppen nog niet."
          : "A few answers are not valid yet.",
        ENTRY_NOT_FOUND: nl
          ? "Deze inzending bestaat niet meer."
          : "This entry no longer exists.",
        FULL: nl ? "Het formulier zit vol." : "The form is full.",
        OPTION_FULL: nl
          ? "Een van de gekozen opties is volzet."
          : "One of the selected options is full.",
      }}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="formId" value={formId} />
      <input type="hidden" name="entryId" value={entryId} />
      <input type="hidden" name="answers" value={JSON.stringify(submittedAnswers)} />

      <div className="ticket-admin-form-grid">
        <div className="ticket-admin-field">
          <label htmlFor={`entry-name-${entryId}`}>{nl ? "Naam" : "Name"}</label>
          <input
            id={`entry-name-${entryId}`}
            name="submitterName"
            value={name}
            maxLength={200}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="ticket-admin-field">
          <label htmlFor={`entry-email-${entryId}`}>E-mail</label>
          <input
            id={`entry-email-${entryId}`}
            name="submitterEmail"
            type="email"
            value={email}
            maxLength={320}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
      </div>

      <EntryAnswerFields
        locale={locale}
        fields={fields}
        visible={visible}
        answers={answers}
        setAnswers={setAnswers}
        errors={{}}
        fileHint={
          nl
            ? "Bestaande bestanden blijven bij de inzending. Uploadvelden kan je hier niet wijzigen."
            : "Existing files remain attached to the entry. Upload fields cannot be changed here."
        }
      />
    </SaveForm>
  );
}
