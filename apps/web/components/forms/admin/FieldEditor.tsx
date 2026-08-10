"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  GripVertical,
  LayoutList,
  Pencil,
  Plus,
} from "lucide-react";
import { Button } from "@vtk/ui";
import {
  deleteFormSectionAction,
  duplicateFormFieldAction,
  removeFormFieldAction,
  reorderFormStructureAction,
  saveFormFieldAction,
  saveFormSectionAction,
  type FormFieldDraft,
} from "@/app/actions/formFields";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton } from "@/components/ui/IconButton";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { useToast } from "@/components/ui/toast";
import { FormFieldBlock } from "@/components/forms/FormFieldBlock";
import type { PublicFormField } from "@/components/forms/FormFieldInput";
import { isChoiceType, parseFieldConfig, type FormFieldConfig } from "@/lib/forms/schema";
import { visibleFieldIds, type AnswerValue } from "@/lib/forms/visibility";
import { groupBySections } from "@/lib/forms/groupBySections";
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
  descriptionNl: string | null;
  descriptionEn: string | null;
  nextSectionId: string | null;
  endsForm: boolean;
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

type SectionDraft = {
  id: string | null;
  titleNl: string;
  titleEn: string;
  descriptionNl: string;
  descriptionEn: string;
  nextSectionId: string | null;
  endsForm: boolean;
};

/** Eén blok in de opbouw: het losse deel bovenaan, of één sectie. */
type Group = { id: string | null; fields: EditorField[] };

type Dragging = { kind: "field" | "section"; id: string } | null;

/**
 * `dragleave` borrelt op vanuit elk kind, dus de aanwijslijn zou uitgaan zodra
 * je van de titel naar de knoppen ernaast beweegt. Dit vraagt of de muis het
 * blok echt verlaat.
 */
function reallyLeaving(event: React.DragEvent): boolean {
  const next = event.relatedTarget;
  return !(next instanceof Node) || !event.currentTarget.contains(next);
}

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

function emptyOption() {
  return {
    id: null,
    code: null,
    labelNl: "",
    labelEn: "",
    quotaLimit: null,
    quotaUsed: 0,
    answerCount: 0,
    allowWaitlist: false,
    nextSectionId: null,
    endsForm: false,
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
    options: isChoiceType(type) ? [emptyOption(), emptyOption()] : [],
    conditions: [],
  };
}

function emptySectionDraft(): SectionDraft {
  return {
    id: null,
    titleNl: "",
    titleEn: "",
    descriptionNl: "",
    descriptionEn: "",
    nextSectionId: null,
    endsForm: false,
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

/**
 * De opbouw van het formulier: secties en de vragen erin, in één lijst.
 *
 * Bewust niet twee schermen naast elkaar. Een sectie is niets anders dan een kop
 * boven een reeks vragen, dus een aparte sectielijst dwong je om een vraag in het
 * ene blok te maken en haar in het andere terug te vinden. Hier maak je een vraag
 * meteen op de plaats waar ze hoort, en verplaatsen doe je door te slepen.
 */
export function FieldEditor({
  formId,
  locale,
  sections: initialSections,
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
  const router = useRouter();
  const showToast = useToast();
  const [pending, startTransition] = useTransition();
  const [fields, setFields] = useState(initialFields);
  const [fieldsSource, setFieldsSource] = useState(initialFields);
  const [sections, setSections] = useState(initialSections);
  const [sectionsSource, setSectionsSource] = useState(initialSections);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<FieldDraft | null>(null);
  /** In welk blok een nieuwe vraag komt; `undefined` betekent: geen. */
  const [addingIn, setAddingIn] = useState<{ sectionId: string | null } | null>(null);
  const [sectionDraft, setSectionDraft] = useState<SectionDraft | null>(null);
  const [dragging, setDragging] = useState<Dragging>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Na een servermutatie levert router.refresh een nieuwe propverwijzing. Leid
  // de lokale lijsten daar tijdens render van af, zoals React voor prop-state
  // synchronisatie voorschrijft, zodat geen tweede effectrender nodig is.
  if (initialFields !== fieldsSource) {
    setFieldsSource(initialFields);
    setFields(initialFields);
  }
  if (initialSections !== sectionsSource) {
    setSectionsSource(initialSections);
    setSections(initialSections);
  }

  const active = useMemo(() => fields.filter((field) => !field.archivedAt), [fields]);
  const archived = useMemo(() => fields.filter((field) => field.archivedAt), [fields]);

  const groups: Group[] = useMemo(() => {
    const known = new Set(sections.map((section) => section.id));
    return [
      // Een verweesde sectionId valt hier terug naar bovenaan, net als op het
      // publieke formulier: onzichtbaar maken is een slechtere foutmodus.
      { id: null, fields: active.filter((field) => !field.sectionId || !known.has(field.sectionId)) },
      ...sections.map((section) => ({
        id: section.id as string | null,
        fields: active.filter((field) => field.sectionId === section.id),
      })),
    ];
  }, [active, sections]);

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
      setAddingIn(null);
      router.refresh();
    });
  }

  function saveSection(current: SectionDraft) {
    startTransition(async () => {
      const state = await saveFormSectionAction(formId, {
        id: current.id,
        titleNl: current.titleNl,
        titleEn: current.titleEn || null,
        descriptionNl: current.descriptionNl || null,
        descriptionEn: current.descriptionEn || null,
        nextSectionId: current.nextSectionId,
        endsForm: current.endsForm,
      });
      if (state.status === "error") {
        showToast({
          message:
            state.code === "SECTION_LOOP"
              ? nl
                ? "Die sprong maakt een kring: de bezoeker zou er niet meer uit geraken."
                : "That jump creates a loop: the visitor would never get out."
              : nl
                ? "Sectie opslaan is niet gelukt."
                : "Saving the section failed.",
          variant: "error",
          duration: 0,
        });
        return;
      }
      showToast({ message: nl ? "Sectie opgeslagen" : "Section saved", variant: "success" });
      setSectionDraft(null);
      router.refresh();
    });
  }

  /**
   * De hele opbouw wegschrijven. De volgorde van de velden is die van de blokken
   * achter elkaar, zodat een sectie verplaatsen haar vragen meeneemt.
   */
  function persist(nextSections: EditorSection[], nextGroups: Group[]) {
    const byId = new Map(nextGroups.map((group) => [group.id, group]));
    const ordered = [
      byId.get(null) ?? { id: null, fields: [] },
      ...nextSections.map((section) => byId.get(section.id)).filter((group) => group !== undefined),
    ];
    const flat = ordered.flatMap((group) =>
      group.fields.map((field) => ({ ...field, sectionId: group.id }))
    );

    setSections(nextSections);
    setFields([...flat, ...archived]);

    startTransition(async () => {
      const state = await reorderFormStructureAction(formId, {
        sections: nextSections.map((section) => section.id),
        fields: flat.map((field) => ({ id: field.id, sectionId: field.sectionId })),
      });
      if (state.status === "error") {
        showToast({
          message: nl ? "Volgorde opslaan is niet gelukt." : "Saving the order failed.",
          variant: "error",
          duration: 0,
        });
        router.refresh();
      }
    });
  }

  /** Eén vraag op een plaats zetten: in dit blok, op deze positie. */
  function placeField(fieldId: string, sectionId: string | null, index: number) {
    const field = active.find((item) => item.id === fieldId);
    if (!field) return;
    const next = groups.map((group) => ({
      ...group,
      fields: group.fields.filter((item) => item.id !== fieldId),
    }));
    const target = next.find((group) => group.id === sectionId);
    if (!target) return;
    const at = Math.min(Math.max(index, 0), target.fields.length);
    target.fields.splice(at, 0, { ...field, sectionId });
    persist(sections, next);
  }

  function moveField(fieldId: string, direction: -1 | 1) {
    const groupIndex = groups.findIndex((group) =>
      group.fields.some((field) => field.id === fieldId)
    );
    if (groupIndex < 0) return;
    const index = groups[groupIndex].fields.findIndex((field) => field.id === fieldId);
    const withinGroup =
      direction === -1 ? index > 0 : index < groups[groupIndex].fields.length - 1;
    const targetGroup = withinGroup ? groupIndex : groupIndex + direction;
    if (targetGroup < 0 || targetGroup >= groups.length) return;
    const targetIndex = withinGroup
      ? index + direction
      : direction === -1
        ? groups[targetGroup].fields.length
        : 0;
    placeField(fieldId, groups[targetGroup].id, targetIndex);
  }

  function moveSection(sectionId: string, direction: -1 | 1) {
    const index = sections.findIndex((section) => section.id === sectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= sections.length) return;
    const next = [...sections];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    persist(next, groups);
  }

  function dropOnField(targetFieldId: string) {
    if (!dragging || dragging.kind !== "field" || dragging.id === targetFieldId) return;
    for (const group of groups) {
      const index = group.fields.findIndex((field) => field.id === targetFieldId);
      if (index < 0) continue;
      // De positie na verwijderen van de gesleepte vraag: die kan in ditzelfde
      // blok vóór het doel staan, en dan schuift alles één op.
      const before = group.fields
        .slice(0, index)
        .filter((field) => field.id !== dragging.id).length;
      placeField(dragging.id, group.id, before);
      return;
    }
  }

  function dropOnGroup(sectionId: string | null) {
    if (!dragging) return;
    if (dragging.kind === "field") {
      const group = groups.find((item) => item.id === sectionId);
      if (!group) return;
      placeField(
        dragging.id,
        sectionId,
        group.fields.filter((field) => field.id !== dragging.id).length
      );
      return;
    }
    if (sectionId === null || dragging.id === sectionId) return;
    const from = sections.findIndex((section) => section.id === dragging.id);
    const to = sections.findIndex((section) => section.id === sectionId);
    if (from < 0 || to < 0) return;
    const next = [...sections];
    const [moved] = next.splice(from, 1);
    next.splice(from < to ? to - 1 : to, 0, moved);
    persist(next, groups);
  }

  function duplicate(fieldId: string) {
    startTransition(async () => {
      const state = await duplicateFormFieldAction(formId, fieldId);
      showToast(
        state.status === "error"
          ? {
              message: nl ? "Dupliceren is niet gelukt." : "Duplicating failed.",
              variant: "error",
              duration: 0,
            }
          : { message: nl ? "Veld gedupliceerd" : "Field duplicated", variant: "success" }
      );
      if (state.status === "success") router.refresh();
    });
  }

  function startAdding(sectionId: string | null) {
    setEditingId(null);
    setDraft(null);
    setSectionDraft(null);
    setAddingIn({ sectionId });
  }

  function endDrag() {
    setDragging(null);
    setDropTarget(null);
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
  const visiblePreviewFields = previewFields.filter((field) => visible.has(field.id));
  const groupedPreviewFields = groupBySections(
    visiblePreviewFields.map((field) => ({
      item: field,
      sectionId: active.find((item) => item.id === field.id)?.sectionId ?? null,
    })),
    sections.map((section) => section.id)
  );

  function previewField(field: PublicFormField) {
    return (
      <FormFieldBlock
        key={field.id}
        field={field}
        locale={locale}
        value={previewAnswers[field.id] ?? {}}
        onChange={(next) => setPreviewAnswers((current) => ({ ...current, [field.id]: next }))}
        shuffleSeed="preview"
      />
    );
  }

  function typePicker(sectionId: string | null) {
    return (
      <>
        <div className="form-admin-type-grid">
          {TYPE_GROUPS.map((group) => (
            <div key={group.key}>
              <h3>{nl ? group.nl : group.en}</h3>
              <div className="form-admin-type-buttons">
                {group.types.map((type) => (
                  <button
                    key={type}
                    className="ticket-admin-button"
                    type="button"
                    onClick={() => setDraft(emptyDraft(type, sectionId))}
                  >
                    <Plus aria-hidden="true" size={15} />
                    {typeLabel(type, locale)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="ticket-admin-row-actions">
          <Button type="button" variant="ghost" onClick={() => setAddingIn(null)}>
            {nl ? "Annuleren" : "Cancel"}
          </Button>
        </div>
      </>
    );
  }

  function fieldRow(field: EditorField, group: Group, index: number) {
    const isEditing = editingId === field.id;
    const isFirst = index === 0 && group.id === null;
    const isLast =
      index === group.fields.length - 1 && group.id === groups[groups.length - 1].id;
    return (
      <li
        key={field.id}
        draggable={!isEditing}
        onDragStart={() => setDragging({ kind: "field", id: field.id })}
        onDragEnd={endDrag}
        onDragOver={(event) => {
          if (dragging?.kind !== "field") return;
          event.preventDefault();
          setDropTarget(field.id);
        }}
        onDragLeave={(event) => {
          if (!reallyLeaving(event)) return;
          setDropTarget((current) => (current === field.id ? null : current));
        }}
        onDrop={(event) => {
          event.preventDefault();
          dropOnField(field.id);
          endDrag();
        }}
        data-dragging={dragging?.kind === "field" && dragging.id === field.id ? "true" : undefined}
        data-over={
          dropTarget === field.id && dragging?.kind === "field" && dragging.id !== field.id
            ? "true"
            : undefined
        }
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
                {field.conditions.length > 0 ? ` · ${nl ? "voorwaardelijk" : "conditional"}` : ""}
              </p>
              <p className="ticket-admin-row-meta ticket-admin-code">{field.code}</p>
            </div>
          </div>
          <div className="ticket-admin-row-actions">
            <IconButton
              label={nl ? "Omhoog" : "Move up"}
              srLabel={`${nl ? "Omhoog" : "Move up"}: ${field.labelNl}`}
              onClick={() => moveField(field.id, -1)}
              disabled={isFirst || pending}
            >
              <ChevronUp size={16} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={nl ? "Omlaag" : "Move down"}
              srLabel={`${nl ? "Omlaag" : "Move down"}: ${field.labelNl}`}
              onClick={() => moveField(field.id, 1)}
              disabled={isLast || pending}
            >
              <ChevronDown size={16} aria-hidden="true" />
            </IconButton>
            <IconButton
              label={nl ? "Bewerken" : "Edit"}
              srLabel={`${nl ? "Bewerken" : "Edit"}: ${field.labelNl}`}
              onClick={() => {
                setAddingIn(null);
                setSectionDraft(null);
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
  }

  function groupBlock(group: Group) {
    const section = sections.find((item) => item.id === group.id) ?? null;
    const sectionIndex = section ? sections.findIndex((item) => item.id === section.id) : -1;
    const isAdding = addingIn !== null && addingIn.sectionId === group.id;
    const isEditingSection = section !== null && sectionDraft?.id === section.id;
    const key = group.id ?? "__loose";

    return (
      <li
        key={key}
        className="form-admin-structure-group"
        data-kind={section ? "section" : "loose"}
        data-dragging={
          section && dragging?.kind === "section" && dragging.id === section.id ? "true" : undefined
        }
        data-over={dropTarget === `group-${key}` ? "true" : undefined}
      >
        <div
          className="form-admin-structure-head"
          draggable={section !== null && !isEditingSection}
          onDragStart={
            section ? () => setDragging({ kind: "section", id: section.id }) : undefined
          }
          onDragEnd={endDrag}
          onDragOver={(event) => {
            if (!dragging) return;
            if (dragging.kind === "section" && (!section || dragging.id === section.id)) return;
            event.preventDefault();
            setDropTarget(`group-${key}`);
          }}
          onDragLeave={(event) => {
            if (!reallyLeaving(event)) return;
            setDropTarget((current) => (current === `group-${key}` ? null : current));
          }}
          onDrop={(event) => {
            event.preventDefault();
            dropOnGroup(group.id);
            endDrag();
          }}
        >
          <div className="form-admin-structure-title">
            {section ? (
              <GripVertical aria-hidden="true" size={16} className="form-admin-grip" />
            ) : (
              <LayoutList aria-hidden="true" size={16} className="form-admin-structure-icon" />
            )}
            <div>
              <p className="ticket-admin-row-title">
                {section
                  ? section.titleNl
                  : nl
                    ? "Bovenaan, zonder sectie"
                    : "At the top, without a section"}
              </p>
              <p className="ticket-admin-row-meta">
                {group.fields.length}{" "}
                {nl
                  ? group.fields.length === 1
                    ? "vraag"
                    : "vragen"
                  : group.fields.length === 1
                    ? "question"
                    : "questions"}
                {section && !section.titleEn ? ` · ${nl ? "geen vertaling" : "no translation"}` : ""}
                {section && branching.enabled && section.endsForm
                  ? ` · ${nl ? "eindigt hier" : "ends here"}`
                  : section && branching.enabled && section.nextSectionId
                    ? ` · ${nl ? "springt naar" : "jumps to"} ${
                        sections.find((other) => other.id === section.nextSectionId)?.titleNl ?? "?"
                      }`
                    : ""}
              </p>
            </div>
          </div>
          {section ? (
            <div className="ticket-admin-row-actions">
              <IconButton
                label={nl ? "Omhoog" : "Move up"}
                srLabel={`${nl ? "Sectie omhoog" : "Move section up"}: ${section.titleNl}`}
                onClick={() => moveSection(section.id, -1)}
                disabled={sectionIndex === 0 || pending}
              >
                <ChevronUp size={16} aria-hidden="true" />
              </IconButton>
              <IconButton
                label={nl ? "Omlaag" : "Move down"}
                srLabel={`${nl ? "Sectie omlaag" : "Move section down"}: ${section.titleNl}`}
                onClick={() => moveSection(section.id, 1)}
                disabled={sectionIndex === sections.length - 1 || pending}
              >
                <ChevronDown size={16} aria-hidden="true" />
              </IconButton>
              <IconButton
                label={nl ? "Sectie bewerken" : "Edit section"}
                srLabel={`${nl ? "Sectie bewerken" : "Edit section"}: ${section.titleNl}`}
                onClick={() => {
                  setAddingIn(null);
                  setEditingId(null);
                  setDraft(null);
                  setSectionDraft(
                    isEditingSection
                      ? null
                      : {
                          id: section.id,
                          titleNl: section.titleNl,
                          titleEn: section.titleEn ?? "",
                          descriptionNl: section.descriptionNl ?? "",
                          descriptionEn: section.descriptionEn ?? "",
                          nextSectionId: section.nextSectionId,
                          endsForm: section.endsForm,
                        }
                  );
                }}
              >
                <Pencil size={16} aria-hidden="true" />
              </IconButton>
              <DeleteIconButton
                action={deleteFormSectionAction}
                fields={{ formId, sectionId: section.id }}
                label={nl ? "Sectie verwijderen" : "Delete section"}
                srLabel={`${nl ? "Sectie verwijderen" : "Delete section"}: ${section.titleNl}`}
                title={nl ? "Sectie verwijderen?" : "Delete section?"}
                description={
                  group.fields.length > 0
                    ? nl
                      ? `De ${group.fields.length} vragen in deze sectie blijven bestaan en schuiven naar het deel bovenaan het formulier. Er gaan geen antwoorden verloren.`
                      : `The ${group.fields.length} questions in this section stay and move to the part at the top of the form. No answers are lost.`
                    : nl
                      ? "Deze sectie is leeg."
                      : "This section is empty."
                }
                confirmLabel={nl ? "Verwijderen" : "Delete"}
                cancelLabel={nl ? "Annuleren" : "Cancel"}
                successMessage={nl ? "Sectie verwijderd" : "Section deleted"}
              />
            </div>
          ) : null}
        </div>

        <div className="form-admin-structure-body">
          {section?.descriptionNl && !isEditingSection ? (
            <p className="form-admin-hint">{section.descriptionNl}</p>
          ) : null}

          {isEditingSection && sectionDraft ? sectionForm(sectionDraft) : null}

          {group.fields.length === 0 && !isAdding ? (
            <p className="ticket-admin-empty">
              {section
                ? nl
                  ? "Nog geen vragen in deze sectie."
                  : "No questions in this section yet."
                : nl
                  ? "Geen vragen boven de eerste sectie."
                  : "No questions above the first section."}
            </p>
          ) : (
            <ul className="ticket-admin-list form-admin-field-list">
              {group.fields.map((field, index) => fieldRow(field, group, index))}
            </ul>
          )}

          {dragging?.kind === "field" ? (
            <div
              className="form-admin-structure-drop"
              data-over={dropTarget === `drop-${key}` ? "true" : undefined}
              onDragOver={(event) => {
                event.preventDefault();
                setDropTarget(`drop-${key}`);
              }}
              onDragLeave={(event) => {
                if (!reallyLeaving(event)) return;
                setDropTarget((current) => (current === `drop-${key}` ? null : current));
              }}
              onDrop={(event) => {
                event.preventDefault();
                dropOnGroup(group.id);
                endDrag();
              }}
            >
              {section
                ? nl
                  ? "Hier onderaan deze sectie"
                  : "Here, at the end of this section"
                : nl
                  ? "Hier bovenaan het formulier"
                  : "Here, at the top of the form"}
            </div>
          ) : null}

          {isAdding && draft ? (
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
                  setAddingIn(null);
                  setDraft(null);
                }}
              />
            </div>
          ) : isAdding ? (
            <div className="form-admin-new-field">{typePicker(group.id)}</div>
          ) : (
            <div className="form-admin-structure-foot">
              <button
                className="ticket-admin-button"
                type="button"
                onClick={() => startAdding(group.id)}
              >
                <Plus aria-hidden="true" size={15} />
                {nl ? "Vraag toevoegen" : "Add question"}
              </button>
            </div>
          )}
        </div>
      </li>
    );
  }

  function sectionForm(current: SectionDraft) {
    return (
      <div className="form-admin-fieldset">
        <div className="ticket-admin-form-grid">
          <div className="ticket-admin-field">
            <label htmlFor="section-title-nl">{nl ? "Titel (NL)" : "Title (NL)"}</label>
            <input
              id="section-title-nl"
              value={current.titleNl}
              maxLength={300}
              onChange={(event) => setSectionDraft({ ...current, titleNl: event.target.value })}
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="section-title-en">{nl ? "Titel (EN)" : "Title (EN)"}</label>
            <input
              id="section-title-en"
              value={current.titleEn}
              maxLength={300}
              onChange={(event) => setSectionDraft({ ...current, titleEn: event.target.value })}
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="section-description-nl">
              {nl ? "Beschrijving (NL)" : "Description (NL)"}
            </label>
            <textarea
              id="section-description-nl"
              rows={2}
              value={current.descriptionNl}
              maxLength={2_000}
              onChange={(event) =>
                setSectionDraft({ ...current, descriptionNl: event.target.value })
              }
            />
          </div>
          <div className="ticket-admin-field">
            <label htmlFor="section-description-en">
              {nl ? "Beschrijving (EN)" : "Description (EN)"}
            </label>
            <textarea
              id="section-description-en"
              rows={2}
              value={current.descriptionEn}
              maxLength={2_000}
              onChange={(event) =>
                setSectionDraft({ ...current, descriptionEn: event.target.value })
              }
            />
          </div>
        </div>
        {branching.enabled ? (
          <div className="ticket-admin-field">
            <label htmlFor="section-next">{nl ? "Ga hierna naar" : "Then go to"}</label>
            <ThemedSelect
              id="section-next"
              name="sectionNext"
              value={current.endsForm ? "__end" : (current.nextSectionId ?? "")}
              onChange={(chosen) =>
                setSectionDraft({
                  ...current,
                  endsForm: chosen === "__end",
                  nextSectionId: chosen === "__end" || !chosen ? null : chosen,
                })
              }
              options={[
                { value: "", label: nl ? "de volgende sectie" : "the next section" },
                ...sections
                  .filter((section) => section.id !== current.id)
                  .map((section) => ({
                    value: section.id,
                    label: locale === "en" && section.titleEn ? section.titleEn : section.titleNl,
                  })),
                { value: "__end", label: nl ? "het einde van de form" : "the end of the form" },
              ]}
            />
            <span className="ticket-admin-help">
              {nl
                ? "Dit is het standaardvervolg. Een antwoord met een eigen sprong (bij de vraag zelf) gaat hierop voor."
                : "This is the default. An answer with its own jump (on the question itself) takes precedence."}
            </span>
          </div>
        ) : null}

        <div className="ticket-admin-row-actions">
          <Button
            type="button"
            onClick={() => saveSection(current)}
            disabled={pending || !current.titleNl.trim()}
          >
            {pending ? (nl ? "Bezig..." : "Saving...") : nl ? "Sectie opslaan" : "Save section"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setSectionDraft(null)}
            disabled={pending}
          >
            {nl ? "Annuleren" : "Cancel"}
          </Button>
        </div>
      </div>
    );
  }

  // Het losse deel bovenaan verdwijnt zodra alles in secties zit; tijdens het
  // slepen komt het terug, want anders kan je een vraag er niet meer uit halen.
  const looseGroup = groups[0];
  const showLoose =
    looseGroup.fields.length > 0 ||
    sections.length === 0 ||
    dragging?.kind === "field" ||
    (addingIn !== null && addingIn.sectionId === null);
  const visibleGroups = showLoose ? groups : groups.slice(1);

  return (
    <div className="ticket-admin-grid" data-columns="2">
      <section className="ticket-admin-section" aria-labelledby="structure-heading">
        <div className="ticket-admin-section-head">
          <div className="ticket-admin-section-heading">
            <span className="ticket-admin-section-icon">
              <LayoutList aria-hidden="true" size={17} />
            </span>
            <div>
              <h2 id="structure-heading">{nl ? "Opbouw" : "Structure"}</h2>
              <p>
                {nl
                  ? "Sleep een vraag naar een andere plaats of sectie, of gebruik de pijlen. Een sectie sleep je aan haar kop; haar vragen gaan mee."
                  : "Drag a question to another place or section, or use the arrows. Drag a section by its header; its questions follow."}
              </p>
            </div>
          </div>
        </div>

        <ul className="form-admin-structure">{visibleGroups.map(groupBlock)}</ul>

        {sectionDraft && sectionDraft.id === null ? (
          <div className="form-admin-new-field">{sectionForm(sectionDraft)}</div>
        ) : (
          <div className="ticket-admin-section-actions ticket-admin-row-actions">
            <button
              className="ticket-admin-button"
              type="button"
              onClick={() => {
                setAddingIn(null);
                setEditingId(null);
                setDraft(null);
                setSectionDraft(emptySectionDraft());
              }}
            >
              <Plus aria-hidden="true" size={15} />
              {nl ? "Sectie toevoegen" : "Add section"}
            </button>
          </div>
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
            <>
              {groupedPreviewFields.unsectioned.map(previewField)}
              {sections.map((section) => {
                const fieldsInSection = groupedPreviewFields.bySection.get(section.id) ?? [];
                if (fieldsInSection.length === 0) return null;
                const title =
                  locale === "en" && section.titleEn ? section.titleEn : section.titleNl;
                const description =
                  locale === "en" && section.descriptionEn
                    ? section.descriptionEn
                    : section.descriptionNl;
                return (
                  <section
                    key={section.id}
                    className="vtk-form-section"
                    aria-labelledby={`preview-section-${section.id}`}
                  >
                    <h3 id={`preview-section-${section.id}`}>{title}</h3>
                    {description ? <p className="vtk-form-section-intro">{description}</p> : null}
                    {fieldsInSection.map(previewField)}
                  </section>
                );
              })}
            </>
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
