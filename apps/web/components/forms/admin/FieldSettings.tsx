"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@vtk/ui";
import { IconButton } from "@/components/ui/IconButton";
import {
  canChangeTypeWithAnswers,
  isChoiceType,
  isMultiChoiceType,
  parseFieldConfig,
  type FormFieldConfig,
} from "@/lib/forms/schema";
import type { AdminLocale } from "./format";
import type { EditorCondition, EditorField, EditorSection, FieldDraft } from "./FieldEditor";

export const TYPE_GROUPS = [
  {
    key: "text",
    nl: "Tekst",
    en: "Text",
    types: ["SHORT_TEXT", "LONG_TEXT", "EMAIL", "PHONE", "URL"],
  },
  {
    key: "choice",
    nl: "Keuze",
    en: "Choice",
    types: ["SINGLE_CHOICE", "MULTIPLE_CHOICE", "DROPDOWN", "BOOLEAN", "SCALE"],
  },
  {
    key: "data",
    nl: "Gegevens",
    en: "Data",
    types: ["NUMBER", "DATE", "TIME", "FILE", "PROFILE", "CONSENT"],
  },
] as const;

const TYPE_LABELS: Record<string, [string, string]> = {
  SHORT_TEXT: ["Korte tekst", "Short text"],
  LONG_TEXT: ["Lange tekst", "Long text"],
  EMAIL: ["E-mailadres", "E-mail address"],
  PHONE: ["Telefoonnummer", "Phone number"],
  URL: ["Link", "Link"],
  NUMBER: ["Getal", "Number"],
  DATE: ["Datum", "Date"],
  TIME: ["Tijdstip", "Time"],
  SINGLE_CHOICE: ["Eén keuze", "Single choice"],
  MULTIPLE_CHOICE: ["Meerdere keuzes", "Multiple choice"],
  DROPDOWN: ["Keuzelijst", "Dropdown"],
  BOOLEAN: ["Ja of nee", "Yes or no"],
  SCALE: ["Schaal", "Scale"],
  FILE: ["Bestand", "File"],
  CONSENT: ["Toestemming", "Consent"],
  PROFILE: ["Uit het profiel", "From the profile"],
};

export function typeLabel(type: string, locale: AdminLocale): string {
  const labels = TYPE_LABELS[type];
  return labels ? labels[locale === "nl" ? 0 : 1] : type;
}

const ALL_TYPES = TYPE_GROUPS.flatMap((group) => group.types);

export function FieldSettings({
  locale,
  draft,
  sections,
  otherFields,
  answerCount,
  pending,
  onChange,
  onSave,
  onCancel,
}: {
  locale: AdminLocale;
  draft: FieldDraft;
  sections: EditorSection[];
  otherFields: EditorField[];
  answerCount: number;
  pending: boolean;
  onChange: (next: FieldDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const nl = locale === "nl";
  const config = draft.config;

  function setConfig(patch: Partial<FormFieldConfig>) {
    onChange({ ...draft, config: { ...config, ...patch } });
  }

  function setType(type: string) {
    // Wisselen van opslagvorm zou bestaande antwoorden onleesbaar maken; de
    // keuzelijst laat het niet toe, dit is de tweede grendel.
    if (answerCount > 0 && !canChangeTypeWithAnswers(draft.type, type)) return;
    onChange({
      ...draft,
      type,
      config: parseFieldConfig(type, config),
      options: isChoiceType(type) && draft.options.length === 0
        ? [
            { id: null, code: null, labelNl: "", labelEn: "", quotaLimit: null, quotaUsed: 0 },
            { id: null, code: null, labelNl: "", labelEn: "", quotaLimit: null, quotaUsed: 0 },
          ]
        : draft.options,
    });
  }

  const numberInput = (
    value: number | null | undefined,
    onNumber: (next: number | null) => void,
    props: { min?: number; max?: number; step?: number } = {}
  ) => (
    <input
      type="number"
      value={value ?? ""}
      min={props.min}
      max={props.max}
      step={props.step}
      onChange={(event) => onNumber(event.target.value === "" ? null : Number(event.target.value))}
    />
  );

  return (
    <div className="form-admin-field-settings">
      <div className="ticket-admin-form-grid">
        <div className="ticket-admin-field">
          <label htmlFor={`type-${draft.id ?? "new"}`}>{nl ? "Soort veld" : "Field type"}</label>
          <select
            id={`type-${draft.id ?? "new"}`}
            value={draft.type}
            onChange={(event) => setType(event.target.value)}
          >
            {ALL_TYPES.map((type) => (
              <option
                key={type}
                value={type}
                disabled={answerCount > 0 && !canChangeTypeWithAnswers(draft.type, type)}
              >
                {typeLabel(type, locale)}
              </option>
            ))}
          </select>
          {answerCount > 0 ? (
            <span className="ticket-admin-help">
              {nl
                ? `Er zijn al ${answerCount} antwoorden, dus enkel een verwant type kan nog.`
                : `There are already ${answerCount} answers, so only a related type is possible.`}
            </span>
          ) : null}
        </div>

        {sections.length > 0 ? (
          <div className="ticket-admin-field">
            <label htmlFor={`section-${draft.id ?? "new"}`}>{nl ? "Sectie" : "Section"}</label>
            <select
              id={`section-${draft.id ?? "new"}`}
              value={draft.sectionId ?? ""}
              onChange={(event) => onChange({ ...draft, sectionId: event.target.value || null })}
            >
              <option value="">{nl ? "Bovenaan, zonder sectie" : "At the top, no section"}</option>
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {locale === "en" && section.titleEn ? section.titleEn : section.titleNl}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="ticket-admin-field">
          <label htmlFor={`label-nl-${draft.id ?? "new"}`}>{nl ? "Vraag (NL)" : "Question (NL)"}</label>
          <input
            id={`label-nl-${draft.id ?? "new"}`}
            value={draft.labelNl}
            maxLength={300}
            onChange={(event) => onChange({ ...draft, labelNl: event.target.value })}
          />
        </div>
        <div className="ticket-admin-field">
          <label htmlFor={`label-en-${draft.id ?? "new"}`}>{nl ? "Vraag (EN)" : "Question (EN)"}</label>
          <input
            id={`label-en-${draft.id ?? "new"}`}
            value={draft.labelEn}
            maxLength={300}
            onChange={(event) => onChange({ ...draft, labelEn: event.target.value })}
          />
          {!draft.labelEn ? (
            <span className="form-admin-lang-flag" data-missing="true">
              {nl ? "Geen vertaling" : "No translation"}
            </span>
          ) : null}
        </div>

        <div className="ticket-admin-field" data-span="2">
          <label htmlFor={`help-nl-${draft.id ?? "new"}`}>
            {nl ? "Toelichting (NL, markdown)" : "Explanation (NL, markdown)"}
          </label>
          <textarea
            id={`help-nl-${draft.id ?? "new"}`}
            rows={2}
            value={draft.helpNl}
            maxLength={2_000}
            onChange={(event) => onChange({ ...draft, helpNl: event.target.value })}
          />
        </div>
        <div className="ticket-admin-field" data-span="2">
          <label htmlFor={`help-en-${draft.id ?? "new"}`}>
            {nl ? "Toelichting (EN, markdown)" : "Explanation (EN, markdown)"}
          </label>
          <textarea
            id={`help-en-${draft.id ?? "new"}`}
            rows={2}
            value={draft.helpEn}
            maxLength={2_000}
            onChange={(event) => onChange({ ...draft, helpEn: event.target.value })}
          />
        </div>
      </div>

      <label className="ticket-admin-check">
        <input
          type="checkbox"
          checked={draft.required}
          onChange={(event) => onChange({ ...draft, required: event.target.checked })}
        />
        {nl ? "Verplicht invullen" : "Required"}
      </label>

      {/* Type-specifieke instellingen. Enkel wat bij dit soort veld hoort, zodat
          er nooit een optieveld op het scherm staat bij een open vraag. */}
      {["SHORT_TEXT", "LONG_TEXT", "EMAIL", "PHONE", "URL"].includes(draft.type) ? (
        <fieldset className="form-admin-fieldset">
          <legend>{nl ? "Invoer" : "Input"}</legend>
          <div className="ticket-admin-form-grid">
            <div className="ticket-admin-field">
              <label>{nl ? "Maximum aantal tekens" : "Maximum characters"}</label>
              {numberInput(config.maxLength, (next) => setConfig({ maxLength: next }), {
                min: 1,
                max: 10_000,
              })}
            </div>
            {draft.type === "LONG_TEXT" ? (
              <div className="ticket-admin-field">
                <label>{nl ? "Hoogte (regels)" : "Height (rows)"}</label>
                {numberInput(config.rows, (next) => setConfig({ rows: next }), { min: 2, max: 30 })}
              </div>
            ) : null}
            <div className="ticket-admin-field" data-span="2">
              <label>{nl ? "Patroon (reguliere expressie)" : "Pattern (regular expression)"}</label>
              <input
                value={config.pattern ?? ""}
                placeholder="^r[0-9]{7}$"
                onChange={(event) => setConfig({ pattern: event.target.value || null })}
              />
            </div>
            {config.pattern ? (
              <div className="ticket-admin-field" data-span="2">
                <label>{nl ? "Melding bij een fout antwoord" : "Message on a wrong answer"}</label>
                <input
                  value={config.patternMessageNl ?? ""}
                  placeholder={nl ? "Een r-nummer ziet eruit als r0123456." : ""}
                  onChange={(event) =>
                    setConfig({ patternMessageNl: event.target.value || null })
                  }
                />
              </div>
            ) : null}
          </div>
        </fieldset>
      ) : null}

      {draft.type === "NUMBER" ? (
        <fieldset className="form-admin-fieldset">
          <legend>{nl ? "Bereik" : "Range"}</legend>
          <div className="ticket-admin-form-grid">
            <div className="ticket-admin-field">
              <label>{nl ? "Minimum" : "Minimum"}</label>
              {numberInput(config.min, (next) => setConfig({ min: next }))}
            </div>
            <div className="ticket-admin-field">
              <label>{nl ? "Maximum" : "Maximum"}</label>
              {numberInput(config.max, (next) => setConfig({ max: next }))}
            </div>
          </div>
          <label className="ticket-admin-check">
            <input
              type="checkbox"
              checked={Boolean(config.integerOnly)}
              onChange={(event) => setConfig({ integerOnly: event.target.checked })}
            />
            {nl ? "Enkel hele getallen" : "Whole numbers only"}
          </label>
        </fieldset>
      ) : null}

      {draft.type === "DATE" ? (
        <fieldset className="form-admin-fieldset">
          <legend>{nl ? "Toegelaten periode" : "Allowed period"}</legend>
          <div className="ticket-admin-form-grid">
            <div className="ticket-admin-field">
              <label>{nl ? "Niet voor" : "Not before"}</label>
              <input
                type="date"
                value={config.minDate ?? ""}
                onChange={(event) => setConfig({ minDate: event.target.value || null })}
              />
            </div>
            <div className="ticket-admin-field">
              <label>{nl ? "Niet na" : "Not after"}</label>
              <input
                type="date"
                value={config.maxDate ?? ""}
                onChange={(event) => setConfig({ maxDate: event.target.value || null })}
              />
            </div>
          </div>
        </fieldset>
      ) : null}

      {draft.type === "SCALE" ? (
        <fieldset className="form-admin-fieldset">
          <legend>{nl ? "De schaal" : "The scale"}</legend>
          <div className="ticket-admin-form-grid">
            <div className="ticket-admin-field">
              <label>{nl ? "Van" : "From"}</label>
              {numberInput(config.min, (next) => setConfig({ min: next }), { min: 0, max: 10 })}
            </div>
            <div className="ticket-admin-field">
              <label>{nl ? "Tot" : "To"}</label>
              {numberInput(config.max, (next) => setConfig({ max: next }), { min: 2, max: 10 })}
            </div>
            <div className="ticket-admin-field">
              <label>{nl ? "Label bij het laagste" : "Label at the lowest"}</label>
              <input
                value={config.minLabelNl ?? ""}
                onChange={(event) => setConfig({ minLabelNl: event.target.value || null })}
              />
            </div>
            <div className="ticket-admin-field">
              <label>{nl ? "Label bij het hoogste" : "Label at the highest"}</label>
              <input
                value={config.maxLabelNl ?? ""}
                onChange={(event) => setConfig({ maxLabelNl: event.target.value || null })}
              />
            </div>
            <div className="ticket-admin-field">
              <label>{nl ? "Weergave" : "Display"}</label>
              <select
                value={config.display ?? "numbers"}
                onChange={(event) =>
                  setConfig({ display: event.target.value as "numbers" | "stars" })
                }
              >
                <option value="numbers">{nl ? "Cijfers" : "Numbers"}</option>
                <option value="stars">{nl ? "Sterren" : "Stars"}</option>
              </select>
            </div>
          </div>
        </fieldset>
      ) : null}

      {draft.type === "FILE" ? (
        <fieldset className="form-admin-fieldset">
          <legend>{nl ? "Bestanden" : "Files"}</legend>
          <div className="ticket-admin-form-grid">
            <div className="ticket-admin-field">
              <label>{nl ? "Maximum aantal bestanden" : "Maximum number of files"}</label>
              {numberInput(config.maxFiles, (next) => setConfig({ maxFiles: next }), {
                min: 1,
                max: 10,
              })}
            </div>
            <div className="ticket-admin-field">
              <label>{nl ? "Maximum per bestand (MB)" : "Maximum per file (MB)"}</label>
              {numberInput(config.maxSizeMb, (next) => setConfig({ maxSizeMb: next }), {
                min: 1,
                max: 50,
              })}
            </div>
            <div className="ticket-admin-field" data-span="2">
              <label>{nl ? "Toegelaten types" : "Allowed types"}</label>
              <input
                value={(config.allowedExtensions ?? []).join(", ")}
                placeholder="pdf, png, jpg"
                onChange={(event) =>
                  setConfig({
                    allowedExtensions: event.target.value
                      .split(/[,\s]+/)
                      .map((entry) => entry.trim().toLowerCase().replace(/^\./, ""))
                      .filter(Boolean),
                  })
                }
              />
              <span className="ticket-admin-help">
                {nl
                  ? "Leeg laten betekent: alles toegelaten."
                  : "Leave empty to allow everything."}
              </span>
            </div>
          </div>
        </fieldset>
      ) : null}

      {draft.type === "PROFILE" ? (
        <fieldset className="form-admin-fieldset">
          <legend>{nl ? "Welk gegeven" : "Which detail"}</legend>
          <div className="ticket-admin-field">
            <select
              value={config.profileField ?? "RNUMBER"}
              onChange={(event) =>
                setConfig({ profileField: event.target.value as FormFieldConfig["profileField"] })
              }
            >
              <option value="NAME">{nl ? "Naam" : "Name"}</option>
              <option value="EMAIL">{nl ? "E-mailadres" : "E-mail address"}</option>
              <option value="RNUMBER">{nl ? "R-nummer" : "R-number"}</option>
              <option value="STUDY_PROGRAMME">{nl ? "Studierichting" : "Study programme"}</option>
              <option value="STUDY_YEAR">{nl ? "Studiejaar" : "Study year"}</option>
            </select>
            <span className="ticket-admin-help">
              {nl
                ? "Wordt voorgevuld uit het profiel van wie ingelogd is, en gecontroleerd op vorm."
                : "Pre-filled from the profile of whoever is logged in, and checked for shape."}
            </span>
          </div>
        </fieldset>
      ) : null}

      {isChoiceType(draft.type) ? (
        <fieldset className="form-admin-fieldset">
          <legend>{nl ? "De opties" : "The options"}</legend>
          <ul className="form-admin-option-list">
            {draft.options.map((option, index) => (
              <li key={option.id ?? `nieuw-${index}`}>
                <input
                  className="form-admin-option-label"
                  value={option.labelNl}
                  placeholder={nl ? "Optie" : "Option"}
                  aria-label={`${nl ? "Optie" : "Option"} ${index + 1} (NL)`}
                  onChange={(event) => {
                    const next = [...draft.options];
                    next[index] = { ...option, labelNl: event.target.value };
                    onChange({ ...draft, options: next });
                  }}
                />
                <input
                  className="form-admin-option-label"
                  value={option.labelEn}
                  placeholder="EN"
                  aria-label={`${nl ? "Optie" : "Option"} ${index + 1} (EN)`}
                  onChange={(event) => {
                    const next = [...draft.options];
                    next[index] = { ...option, labelEn: event.target.value };
                    onChange({ ...draft, options: next });
                  }}
                />
                <input
                  className="form-admin-option-quota"
                  type="number"
                  min={option.quotaUsed || 1}
                  value={option.quotaLimit ?? ""}
                  placeholder={nl ? "Geen max" : "No cap"}
                  aria-label={`${nl ? "Maximum aantal voor optie" : "Cap for option"} ${index + 1}`}
                  onChange={(event) => {
                    const next = [...draft.options];
                    next[index] = {
                      ...option,
                      quotaLimit: event.target.value === "" ? null : Number(event.target.value),
                    };
                    onChange({ ...draft, options: next });
                  }}
                />
                <span className="form-admin-option-used">
                  {option.quotaUsed > 0
                    ? nl
                      ? `${option.quotaUsed} gekozen`
                      : `${option.quotaUsed} chosen`
                    : ""}
                </span>
                <IconButton
                  label={nl ? "Optie verwijderen" : "Remove option"}
                  srLabel={`${nl ? "Optie verwijderen" : "Remove option"}: ${option.labelNl || index + 1}`}
                  tone="danger"
                  onClick={() =>
                    onChange({
                      ...draft,
                      options: draft.options.filter((_, position) => position !== index),
                    })
                  }
                >
                  <Trash2 size={16} aria-hidden="true" />
                </IconButton>
              </li>
            ))}
          </ul>
          <button
            className="ticket-admin-button"
            type="button"
            onClick={() =>
              onChange({
                ...draft,
                options: [
                  ...draft.options,
                  { id: null, code: null, labelNl: "", labelEn: "", quotaLimit: null, quotaUsed: 0 },
                ],
              })
            }
          >
            <Plus aria-hidden="true" size={15} />
            {nl ? "Optie toevoegen" : "Add option"}
          </button>

          <p className="form-admin-hint">
            {nl
              ? "Een optie met een maximum verdwijnt niet wanneer ze vol zit: ze blijft zichtbaar met de vermelding volzet. Een optie schrappen die al aangeduid werd, haalt ze van het formulier maar bewaart de antwoorden."
              : "An option with a cap does not disappear when full: it stays visible marked as full. Removing an option that was already picked takes it off the form but keeps the answers."}
          </p>

          <label className="ticket-admin-check">
            <input
              type="checkbox"
              checked={Boolean(config.shuffle)}
              onChange={(event) => setConfig({ shuffle: event.target.checked })}
            />
            {nl ? "Toon de opties in willekeurige volgorde" : "Show the options in random order"}
          </label>
          <label className="ticket-admin-check">
            <input
              type="checkbox"
              checked={Boolean(config.allowOther)}
              onChange={(event) => setConfig({ allowOther: event.target.checked })}
            />
            {nl ? '"Andere, namelijk ..." met een eigen tekstveld' : '"Other, namely ..." with a free text field'}
          </label>

          {isMultiChoiceType(draft.type) ? (
            <div className="ticket-admin-form-grid">
              <div className="ticket-admin-field">
                <label>{nl ? "Minstens aanduiden" : "Minimum to check"}</label>
                {numberInput(config.minChecked, (next) => setConfig({ minChecked: next }), {
                  min: 0,
                  max: 100,
                })}
              </div>
              <div className="ticket-admin-field">
                <label>{nl ? "Hoogstens aanduiden" : "Maximum to check"}</label>
                {numberInput(config.maxChecked, (next) => setConfig({ maxChecked: next }), {
                  min: 1,
                  max: 100,
                })}
              </div>
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <ConditionEditor
        locale={locale}
        conditions={draft.conditions}
        otherFields={otherFields}
        onChange={(conditions) => onChange({ ...draft, conditions })}
      />

      <div className="ticket-admin-row-actions">
        <Button type="button" onClick={onSave} disabled={pending || !draft.labelNl.trim()}>
          {pending ? (nl ? "Bezig..." : "Saving...") : nl ? "Veld opslaan" : "Save field"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
          {nl ? "Annuleren" : "Cancel"}
        </Button>
      </div>
    </div>
  );
}

function ConditionEditor({
  locale,
  conditions,
  otherFields,
  onChange,
}: {
  locale: AdminLocale;
  conditions: EditorCondition[];
  otherFields: EditorField[];
  onChange: (next: EditorCondition[]) => void;
}) {
  const nl = locale === "nl";
  const usable = otherFields.filter((field) => !field.archivedAt);

  return (
    <fieldset className="form-admin-fieldset">
      <legend>{nl ? "Wanneer tonen" : "When to show"}</legend>
      {usable.length === 0 ? (
        <p className="form-admin-hint">
          {nl
            ? "Er is nog geen andere vraag om dit veld van te laten afhangen."
            : "There is no other question yet for this field to depend on."}
        </p>
      ) : (
        <>
          {conditions.length === 0 ? (
            <p className="form-admin-hint">
              {nl
                ? "Dit veld staat altijd op het formulier."
                : "This field is always on the form."}
            </p>
          ) : null}
          <ul className="form-admin-condition-list">
            {conditions.map((condition, index) => {
              const source = usable.find((field) => field.id === condition.sourceFieldId);
              return (
                <li key={index}>
                  <select
                    aria-label={nl ? "Vraag" : "Question"}
                    value={condition.sourceFieldId}
                    onChange={(event) => {
                      const next = [...conditions];
                      next[index] = {
                        ...condition,
                        sourceFieldId: event.target.value,
                        value: null,
                      };
                      onChange(next);
                    }}
                  >
                    {usable.map((field) => (
                      <option key={field.id} value={field.id}>
                        {field.labelNl}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={nl ? "Voorwaarde" : "Condition"}
                    value={condition.operator}
                    onChange={(event) => {
                      const next = [...conditions];
                      next[index] = {
                        ...condition,
                        operator: event.target.value as EditorCondition["operator"],
                      };
                      onChange(next);
                    }}
                  >
                    <option value="EQUALS">{nl ? "is gelijk aan" : "equals"}</option>
                    <option value="NOT_EQUALS">{nl ? "is niet" : "is not"}</option>
                    <option value="INCLUDES">{nl ? "bevat" : "includes"}</option>
                    <option value="IS_ANSWERED">{nl ? "is ingevuld" : "is answered"}</option>
                  </select>
                  {condition.operator === "IS_ANSWERED" ? null : source &&
                    isChoiceType(source.type) ? (
                    <select
                      aria-label={nl ? "Antwoord" : "Answer"}
                      value={condition.value ?? ""}
                      onChange={(event) => {
                        const next = [...conditions];
                        next[index] = { ...condition, value: event.target.value || null };
                        onChange(next);
                      }}
                    >
                      <option value="">{nl ? "Kies een antwoord" : "Pick an answer"}</option>
                      {source.options
                        .filter((option) => !option.archivedAt)
                        .map((option) => (
                          <option key={option.id} value={option.code}>
                            {option.labelNl}
                          </option>
                        ))}
                    </select>
                  ) : (
                    <input
                      aria-label={nl ? "Antwoord" : "Answer"}
                      value={condition.value ?? ""}
                      onChange={(event) => {
                        const next = [...conditions];
                        next[index] = { ...condition, value: event.target.value || null };
                        onChange(next);
                      }}
                    />
                  )}
                  <IconButton
                    label={nl ? "Voorwaarde verwijderen" : "Remove condition"}
                    srLabel={nl ? "Voorwaarde verwijderen" : "Remove condition"}
                    tone="danger"
                    onClick={() => onChange(conditions.filter((_, position) => position !== index))}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </IconButton>
                </li>
              );
            })}
          </ul>
          <button
            className="ticket-admin-button"
            type="button"
            onClick={() =>
              onChange([
                ...conditions,
                { sourceFieldId: usable[0].id, operator: "IS_ANSWERED", value: null },
              ])
            }
          >
            <Plus aria-hidden="true" size={15} />
            {nl ? "Voorwaarde toevoegen" : "Add condition"}
          </button>
          {conditions.length > 1 ? (
            <p className="form-admin-hint">
              {nl
                ? "Alle voorwaarden moeten kloppen voor het veld verschijnt."
                : "All conditions must hold before the field appears."}
            </p>
          ) : null}
        </>
      )}
    </fieldset>
  );
}
