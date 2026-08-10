"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  GripVertical,
  Pencil,
  Plus,
} from "lucide-react";
import { Button } from "@vtk/ui";
import {
  duplicateFormFieldAction,
  removeFormFieldAction,
  reorderFormFieldsAction,
  saveFormFieldAction,
  type FormFieldDraft,
} from "@/app/actions/formFields";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { useToast } from "@/components/ui/toast";
import { FormFieldBlock } from "@/components/forms/FormFieldBlock";
import type { PublicFormField } from "@/components/forms/FormFieldInput";
import { isChoiceType, parseFieldConfig, type FormFieldConfig } from "@/lib/forms/schema";
import { visibleFieldIds, type AnswerValue } from "@/lib/forms/visibility";
import type { AdminLocale } from "./format";
import { FieldSettings, TYPE_GROUPS, typeLabel } from "./FieldSettings";

export type EditorOption = {
  id: string;
  code: string;
  labelNl: string;
  labelEn: string | null;
  quotaLimit: number | null;
  quotaUsed: number;
  answerCount: number;
  allowWaitlist: boolean;
  nextSectionId: string | null;
  endsForm: boolean;
  archivedAt: string | null;
};

export type EditorCondition = {
  sourceFieldId: string;
  operator: "EQUALS" | "NOT_EQUALS" | "INCLUDES" | "IS_ANSWERED";
  value: string | null;
};

export type EditorField = {
  id: string;
  code: string;
  type: string;
  sectionId: string | null;
  labelNl: string;
  labelEn: string | null;
  helpNl: string | null;
  helpEn: string | null;
  required: boolean;
  config: unknown;
  options: EditorOption[];
  conditions: EditorCondition[];
  answerCount: number;
  archivedAt: string | null;
};

export type EditorSection = {
  id: string;
  titleNl: string;
  titleEn: string | null;
};

/** Alleen zinvol wanneer het formulier zijn secties één voor één toont. */
export type BranchingContext = { enabled: boolean };

/** De lokale, bewerkbare vorm van één veld. */
export type FieldDraft = {
  id: string | null;
  sectionId: string | null;
  type: string;
  labelNl: string;
  labelEn: string;
  helpNl: string;
  helpEn: string;
  required: boolean;
  config: FormFieldConfig;
  options: Array<{
    id: string | null;
    /**
     * De opgeslagen code van de optie, of null bij een nieuwe. De preview
     * vergelijkt hiermee tegen de waarde van een voorwaarde; met de database-id
     * zou een voorwaarde in het voorbeeld nooit afgaan, terwijl ze op het echte
     * formulier wel werkt.
     */
    code: string | null;
    labelNl: string;
    labelEn: string;
    quotaLimit: number | null;
    quotaUsed: number;
    answerCount: number;
    allowWaitlist: boolean;
    nextSectionId: string | null;
    endsForm: boolean;
  }>;
  conditions: EditorCondition[];
};

function toDraft(field: EditorField): FieldDraft {
  return {
    id: field.id,
    sectionId: field.sectionId,
    type: field.type,
    labelNl: field.labelNl,
    labelEn: field.labelEn ?? "",
    helpNl: field.helpNl ?? "",
    helpEn: field.helpEn ?? "",
    required: field.required,
    config: parseFieldConfig(field.type, field.config),
    options: field.options
      .filter((option) => !option.archivedAt)
      .map((option) => ({
        id: option.id,
        code: option.code,
        labelNl: option.labelNl,
        labelEn: option.labelEn ?? "",
        quotaLimit: option.quotaLimit,
        quotaUsed: option.quotaUsed,
        answerCount: option.answerCount,
        allowWaitlist: option.allowWaitlist,
        nextSectionId: option.nextSectionId,
        endsForm: option.endsForm,
      })),
    conditions: field.conditions,
  };
}

function emptyDraft(type: string, sectionId: string | null): FieldDraft {
  return {
    id: null,
    sectionId,
    type,
    labelNl: "",
    labelEn: "",
    helpNl: "",
    helpEn: "",
    required: false,
    config: parseFieldConfig(type, {}),
    options: isChoiceType(type)
      ? [
          { id: null, code: null, labelNl: "", labelEn: "", quotaLimit: null, quotaUsed: 0, answerCount: 0, allowWaitlist: false, nextSectionId: null, endsForm: false },
          { id: null, code: null, labelNl: "", labelEn: "", quotaLimit: null, quotaUsed: 0, answerCount: 0, allowWaitlist: false, nextSectionId: null, endsForm: false },
        ]
      : [],
    conditions: [],
  };
}

function toPublicField(draft: FieldDraft, fallbackId: string): PublicFormField {
  return {
    id: draft.id ?? fallbackId,
    code: draft.id ?? fallbackId,
    type: draft.type,
    labelNl: draft.labelNl || "…",
    labelEn: draft.labelEn || null,
    helpNl: draft.helpNl || null,
    helpEn: draft.helpEn || null,
    required: draft.required,
    config: draft.config,
    options: draft.options.map((option, index) => ({
      id: option.id ?? `nieuw-${index}`,
      code: option.code ?? `nieuw-${index}`,
      labelNl: option.labelNl || "…",
      labelEn: option.labelEn || null,
      soldOut: option.quotaLimit != null && option.quotaUsed >= option.quotaLimit,
      waitlist: option.allowWaitlist,
    })),
  };
}

export function FieldEditor({
  formId,
  locale,
  sections,
  fields: initialFields,
  branching,
}: {
  formId: string;
  locale: AdminLocale;
  sections: EditorSection[];
  fields: EditorField[];
  branching: BranchingContext;
}) {
  const nl = locale === "nl";
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [fields, setFields] = useState(initialFields);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FieldDraft | null>(null);
  const [adding, setAdding] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const active = useMemo(() => fields.filter((field) => !field.archivedAt), [fields]);
  const archived = useMemo(() => fields.filter((field) => field.archivedAt), [fields]);

  function reportError(code: string) {
    const messages: Record<string, string> = {
      CHOICE_OPTIONS_REQUIRED: nl
        ? "Een keuzevraag heeft minstens één optie nodig."
        : "A choice question needs at least one option.",
      FIELD_TYPE_LOCKED: nl
        ? "Dit type kan niet meer wijzigen: er zijn al antwoorden die anders in de verkeerde kolom belanden."
        : "This type can no longer change: existing answers would end up in the wrong column.",
      CONDITION_CYCLE: nl
        ? "Deze voorwaarde maakt een kring: twee velden zouden op elkaar wachten."
        : "This condition creates a cycle: two fields would wait for each other.",
      CONDITION_SOURCE_INVALID: nl
        ? "De vraag waar deze voorwaarde naar verwijst, bestaat niet meer."
        : "The question this condition points at no longer exists.",
      QUOTA_BELOW_USED: nl
        ? "Het quotum kan niet lager dan het aantal mensen dat de optie al koos."
        : "The quota cannot be lower than the number of people who already picked the option.",
      INVALID_FIELD_RANGE: nl
        ? "Het minimum ligt boven het maximum."
        : "The minimum is above the maximum.",
      INVALID_FIELD_PATTERN: nl
        ? "Dat patroon is geen geldige reguliere expressie."
        : "That pattern is not a valid regular expression.",
      INVALID_FIELD_CONFIG: nl
        ? "Een van de instellingen van dit veld kan niet."
        : "One of this field's settings is not valid.",
    };
    showToast({
      message: messages[code] ?? (nl ? "Opslaan is niet gelukt." : "Saving failed."),
      variant: "error",
      duration: 0,
    });
  }

  function save(current: FieldDraft) {
    const payload: FormFieldDraft = {
      id: current.id,
      sectionId: current.sectionId,
      type: current.type as FormFieldDraft["type"],
      labelNl: current.labelNl,
      labelEn: current.labelEn || null,
      helpNl: current.helpNl || null,
      helpEn: current.helpEn || null,
      required: current.required,
      config: current.config,
      options: isChoiceType(current.type)
        ? current.options
            .filter((option) => option.labelNl.trim())
            .map((option) => ({
              id: option.id,
              labelNl: option.labelNl,
              labelEn: option.labelEn || null,
              quotaLimit: option.quotaLimit,
              allowWaitlist: option.allowWaitlist,
              nextSectionId: option.nextSectionId,
              endsForm: option.endsForm,
            }))
        : [],
      conditions: current.conditions,
    };

    startTransition(async () => {
      const state = await saveFormFieldAction(formId, payload);
      if (state.status === "error") {
        reportError(state.code);
        return;
      }
      showToast({
        message: nl ? "Veld opgeslagen" : "Field saved",
        variant: "success",
      });
      setEditingId(null);
      setDraft(null);
      setAdding(false);
    });
  }

  function move(fieldId: string, direction: -1 | 1) {
    const index = active.findIndex((field) => field.id === fieldId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= active.length) return;
    const next = [...active];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    persistOrder(next);
  }

  function dropOn(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = active.findIndex((field) => field.id === dragId);
    const to = active.findIndex((field) => field.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...active];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    persistOrder(next);
  }

  function persistOrder(next: EditorField[]) {
    setFields([...next, ...archived]);
    startTransition(async () => {
      const state = await reorderFormFieldsAction(
        formId,
        next.map((field) => ({ id: field.id, sectionId: field.sectionId }))
      );
      if (state.status === "error") {
        showToast({
          message: nl ? "Volgorde opslaan is niet gelukt." : "Saving the order failed.",
          variant: "error",
          duration: 0,
        });
      }
    });
  }

  function duplicate(fieldId: string) {
    startTransition(async () => {
      const state = await duplicateFormFieldAction(formId, fieldId);
      showToast(
        state.status === "error"
          ? { message: nl ? "Dupliceren is niet gelukt." : "Duplicating failed.", variant: "error", duration: 0 }
          : { message: nl ? "Veld gedupliceerd" : "Field duplicated", variant: "success" }
      );
    });
  }

  // De preview toont het formulier zoals een bezoeker het krijgt, inclusief het
  // verbergen van velden waarvan de voorwaarde niet klopt.
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, AnswerValue>>({});
  const previewFields = active.map((field) => toPublicField(toDraft(field), field.id));
  const visible = visibleFieldIds(
    active.map((field) => ({ id: field.id, type: field.type })),
    active.flatMap((field) =>
      field.conditions.map((condition) => ({ ...condition, fieldId: field.id }))
    ),
    previewAnswers
  );

  return (
    <div className="ticket-admin-grid" data-columns="2">
      <section className="ticket-admin-section" aria-labelledby="fields-heading">
        <div className="ticket-admin-section-head">
          <div>
            <h2 id="fields-heading">{nl ? "Velden" : "Fields"}</h2>
            <p>
              {nl
                ? "Sleep om te herordenen, of gebruik de pijlen."
                : "Drag to reorder, or use the arrows."}
            </p>
          </div>
        </div>

        {active.length === 0 && !adding ? (
          <p className="ticket-admin-empty">
            {nl ? "Nog geen velden." : "No fields yet."}
          </p>
        ) : null}

        <ul className="ticket-admin-list form-admin-field-list">
          {active.map((field, index) => {
            const isEditing = editingId === field.id;
            return (
              <li
                key={field.id}
                draggable={!isEditing}
                onDragStart={() => setDragId(field.id)}
                onDragEnd={() => setDragId(null)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropOn(field.id)}
                data-dragging={dragId === field.id || undefined}
              >
                <div className="ticket-admin-row-head">
                  <div className="form-admin-field-title">
                    <GripVertical aria-hidden="true" size={16} className="form-admin-grip" />
                    <div>
                      <p className="ticket-admin-row-title">
                        {field.labelNl}
                        {field.required ? " *" : ""}
                      </p>
                      <p className="ticket-admin-row-meta">
                        {typeLabel(field.type, locale)}
                        {field.answerCount > 0
                          ? ` · ${field.answerCount} ${nl ? "antwoorden" : "answers"}`
                          : ""}
                        {field.conditions.length > 0
                          ? ` · ${nl ? "voorwaardelijk" : "conditional"}`
                          : ""}
                      </p>
                      <p className="ticket-admin-row-meta ticket-admin-code">{field.code}</p>
                    </div>
                  </div>
                  <div className="ticket-admin-row-actions">
                    <IconButton
                      label={nl ? "Omhoog" : "Move up"}
                      srLabel={`${nl ? "Omhoog" : "Move up"}: ${field.labelNl}`}
                      onClick={() => move(field.id, -1)}
                      disabled={index === 0 || pending}
                    >
                      <ChevronUp size={16} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={nl ? "Omlaag" : "Move down"}
                      srLabel={`${nl ? "Omlaag" : "Move down"}: ${field.labelNl}`}
                      onClick={() => move(field.id, 1)}
                      disabled={index === active.length - 1 || pending}
                    >
                      <ChevronDown size={16} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={nl ? "Bewerken" : "Edit"}
                      srLabel={`${nl ? "Bewerken" : "Edit"}: ${field.labelNl}`}
                      onClick={() => {
                        setAdding(false);
                        setEditingId(isEditing ? null : field.id);
                        setDraft(isEditing ? null : toDraft(field));
                      }}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </IconButton>
                    <IconButton
                      label={nl ? "Dupliceren" : "Duplicate"}
                      srLabel={`${nl ? "Dupliceren" : "Duplicate"}: ${field.labelNl}`}
                      onClick={() => duplicate(field.id)}
                      disabled={pending}
                    >
                      <Copy size={16} aria-hidden="true" />
                    </IconButton>
                    <DeleteIconButton
                      action={removeFormFieldAction}
                      fields={{ formId, fieldId: field.id }}
                      label={nl ? "Verwijderen" : "Delete"}
                      srLabel={`${nl ? "Verwijderen" : "Delete"}: ${field.labelNl}`}
                      title={nl ? "Veld verwijderen?" : "Delete field?"}
                      description={
                        field.answerCount > 0
                          ? nl
                            ? `Er zijn al ${field.answerCount} antwoorden op deze vraag. Het veld verdwijnt van het formulier, maar de antwoorden blijven bewaard en blijven in de export staan.`
                            : `This question already has ${field.answerCount} answers. The field disappears from the form, but the answers are kept and stay in the export.`
                          : nl
                            ? "Er zijn nog geen antwoorden op deze vraag, dus het veld wordt echt verwijderd."
                            : "This question has no answers yet, so the field is really deleted."
                      }
                      confirmLabel={
                        field.answerCount > 0
                          ? nl
                            ? "Van formulier halen"
                            : "Remove from form"
                          : nl
                            ? "Verwijderen"
                            : "Delete"
                      }
                      cancelLabel={nl ? "Annuleren" : "Cancel"}
                      successMessage={nl ? "Veld verwijderd" : "Field deleted"}
                    />
                  </div>
                </div>

                {isEditing && draft ? (
                  <FieldSettings
                    formId={formId}
                    locale={locale}
                    draft={draft}
                    sections={sections}
                    otherFields={active.filter((other) => other.id !== field.id)}
                    branching={branching}
                    answerCount={field.answerCount}
                    pending={pending}
                    onChange={setDraft}
                    onSave={() => save(draft)}
                    onCancel={() => {
                      setEditingId(null);
                      setDraft(null);
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>

        {adding && draft ? (
          <div className="form-admin-new-field">
            <FieldSettings
              formId={formId}
              locale={locale}
              draft={draft}
              sections={sections}
              otherFields={active}
              branching={branching}
              answerCount={0}
              pending={pending}
              onChange={setDraft}
              onSave={() => save(draft)}
              onCancel={() => {
                setAdding(false);
                setDraft(null);
              }}
            />
          </div>
        ) : (
          <details className="ticket-admin-details">
            <summary>{nl ? "Veld toevoegen" : "Add field"}</summary>
            <div className="ticket-admin-details-body form-admin-type-grid">
              {TYPE_GROUPS.map((group) => (
                <div key={group.key}>
                  <h3>{nl ? group.nl : group.en}</h3>
                  <div className="form-admin-type-buttons">
                    {group.types.map((type) => (
                      <button
                        key={type}
                        className="ticket-admin-button"
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setAdding(true);
                          setDraft(emptyDraft(type, null));
                        }}
                      >
                        <Plus aria-hidden="true" size={15} />
                        {typeLabel(type, locale)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        )}

        {archived.length > 0 ? (
          <details className="ticket-admin-details">
            <summary>
              {nl
                ? `${archived.length} veld(en) van het formulier gehaald`
                : `${archived.length} field(s) removed from the form`}
            </summary>
            <div className="ticket-admin-details-body">
              <p className="form-admin-hint">
                {nl
                  ? "Deze velden staan niet meer op het formulier, maar hun antwoorden blijven bewaard en blijven in de export staan."
                  : "These fields are no longer on the form, but their answers are kept and stay in the export."}
              </p>
              <ul className="ticket-admin-list">
                {archived.map((field) => (
                  <li key={field.id}>
                    <p className="ticket-admin-row-title">{field.labelNl}</p>
                    <p className="ticket-admin-row-meta ticket-admin-code">{field.code}</p>
                  </li>
                ))}
              </ul>
            </div>
          </details>
        ) : null}
      </section>

      <section className="ticket-admin-section" aria-labelledby="preview-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon">
              <Eye aria-hidden="true" size={17} />
            </span>
            <div>
              <h2 id="preview-heading">{nl ? "Voorbeeld" : "Preview"}</h2>
              <p>
                {nl
                  ? "Zo ziet een bezoeker het. Voorwaardelijke velden verschijnen hier ook pas als ze moeten."
                  : "This is what a visitor sees. Conditional fields appear here only when they should."}
              </p>
            </div>
          </div>
        </div>
        <div className="vtk-form-preview">
          {previewFields.length === 0 ? (
            <p className="ticket-admin-empty">
              {nl ? "Nog niets om te tonen." : "Nothing to show yet."}
            </p>
          ) : (
            previewFields
              .filter((field) => visible.has(field.id))
              .map((field) => (
                <FormFieldBlock
                  key={field.id}
                  field={field}
                  locale={locale}
                  value={previewAnswers[field.id] ?? {}}
                  onChange={(next) =>
                    setPreviewAnswers((current) => ({ ...current, [field.id]: next }))
                  }
                  shuffleSeed="preview"
                />
              ))
          )}
          {previewFields.length > 0 ? (
            <Button type="button" disabled>
              {nl ? "Verzenden" : "Submit"}
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
