"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { ExternalLink, ListChecks } from "lucide-react";
import {
  addGroupingMemberAction,
  enableGroupingAction,
  moveGroupingMemberAction,
  runGroupingAction,
  saveGroupingRolesAction,
  saveGroupingSettingsAction,
} from "@/app/actions/formGrouping";
import { SaveForm } from "@/components/ui/SaveForm";
import { ThemedSelect } from "@/components/ui/ThemedSelect";
import { useToast } from "@/components/ui/toast";
import { SAVE_IDLE } from "@/lib/saveState";
import type { GroupingRole } from "@/lib/forms/grouping/algorithm";
import {
  roleHasWeight,
  roleHelp,
  roleLabel,
  roleNeedsOptions,
} from "@/lib/forms/grouping/roles";
import type { AdminLocale } from "./format";

export type GroupingFieldValue = {
  id: string;
  label: string;
  type: string;
  options: { code: string; label: string }[];
  allowedRoles: GroupingRole[];
  role: GroupingRole | null;
  weight: number;
  chosenOptions: string[];
};

/** De form waaraan deze groepjesmaker hangt, voor het blok bij de vragen. */
export type GroupingLinkedForm = {
  title: string;
  slug: string;
  /** Waar de vragen bewerkt worden; leeg wanneer deze gebruiker dat niet mag. */
  editHref: string | null;
  publicHref: string;
};

export type GroupingSettingsValue = {
  minMembers: number;
  maxMembers: number;
  minGroups: number | null;
  maxGroups: number | null;
  minAnchors: number | null;
  maxAnchors: number | null;
  autoRun: boolean;
  expectedPeople: number | null;
};

function errorMessages(locale: AdminLocale): Record<string, string> {
  const nl = locale === "nl";
  return {
    FORBIDDEN: nl
      ? "Je mag de groepjes van deze form niet beheren."
      : "You cannot manage the groups of this form.",
    GROUPING_NOT_FOUND: nl
      ? "De groepjesmaker staat niet (meer) aan voor deze form."
      : "The group maker is not (or no longer) enabled for this form.",
    GROUP_NOT_FOUND: nl ? "Die groep bestaat niet meer." : "That group no longer exists.",
    MEMBER_NOT_FOUND: nl
      ? "Die inzending bestaat niet meer."
      : "That entry no longer exists.",
    OPTIONS_REQUIRED: nl
      ? "Vink bij de kernvraag en bij 'aanvaardt nog anderen' aan welke antwoorden ja betekenen."
      : "Check which answers mean yes for the core question and for 'accepts others'.",
    ONE_GROUP_SIZE: nl
      ? "Maar één vraag kan het aantal personen geven."
      : "Only one question can give the number of people.",
    FORM_REQUIRED: nl ? "Kies een form." : "Pick a form.",
    ONE_ANCHOR: nl
      ? "Maar één vraag kan bepalen wie kern is."
      : "Only one question can decide who is core.",
    INVALID_ROLE: nl
      ? "Die rol past niet bij dat soort vraag."
      : "That role does not fit that kind of question.",
    INVALID_MINMEMBERS: nl
      ? "Het minimum per groep moet tussen 1 en 1000 liggen."
      : "The minimum per group must be between 1 and 1000.",
    INVALID_MAXMEMBERS: nl
      ? "Het maximum per groep moet minstens even groot zijn als het minimum."
      : "The maximum per group must be at least the minimum.",
    INVALID_MAXGROUPS: nl
      ? "Het maximum aantal groepen moet minstens even groot zijn als het minimum."
      : "The maximum number of groups must be at least the minimum.",
    INVALID_MINGROUPS: nl ? "Dat minimum aantal groepen kan niet." : "That minimum number of groups is not valid.",
    INVALID_MAXANCHORS: nl
      ? "Het maximum aan kern per groep moet minstens even groot zijn als het minimum."
      : "The maximum core per group must be at least the minimum.",
    INVALID_MINANCHORS: nl ? "Dat minimum aan kern kan niet." : "That core minimum is not valid.",
    INVALID_EXPECTEDPEOPLE: nl
      ? "Het verwachte aantal personen moet tussen 1 en 100.000 liggen."
      : "The expected number of people must be between 1 and 100,000.",
  };
}

// -----------------------------------------------------------------------------

/** Een groepjesmaker op een form zetten; na het aanmaken opent hij meteen. */
export function CreateGroupingForm({
  locale,
  forms,
}: {
  locale: AdminLocale;
  forms: { id: string; label: string }[];
}) {
  const nl = locale === "nl";
  const [formId, setFormId] = useState("");
  return (
    <SaveForm
      action={enableGroupingAction}
      className="ticket-admin-form"
      submitLabel={nl ? "Groepjesmaker maken" : "Create group maker"}
      savingLabel={nl ? "Bezig..." : "Creating..."}
      savedMessage={nl ? "Groepjesmaker gemaakt" : "Group maker created"}
      fallbackErrorMessage={nl ? "Aanmaken is niet gelukt." : "Creating failed."}
      errorMessages={errorMessages(locale)}
      submitDisabled={!formId}
    >
      <input type="hidden" name="locale" value={locale} />
      <div className="ticket-admin-field">
        <label htmlFor="grouping-new-form">Form</label>
        <ThemedSelect
          id="grouping-new-form"
          name="formId"
          value={formId}
          onChange={setFormId}
          options={[
            { value: "", label: nl ? "Kies een form" : "Pick a form" },
            ...forms.map((form) => ({ value: form.id, label: form.label })),
          ]}
        />
      </div>
    </SaveForm>
  );
}

// -----------------------------------------------------------------------------

function NumberField({
  id,
  name,
  label,
  help,
  defaultValue,
  min,
  required = false,
}: {
  id: string;
  name: string;
  label: string;
  help?: string;
  defaultValue: number | null;
  min: number;
  required?: boolean;
}) {
  return (
    <div className="ticket-admin-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={name}
        type="number"
        inputMode="numeric"
        min={min}
        max={100000}
        step={1}
        defaultValue={defaultValue ?? ""}
        required={required}
      />
      {help ? <small>{help}</small> : null}
    </div>
  );
}

export function GroupingSettingsForm({
  locale,
  formId,
  settings,
  hasAnchor,
}: {
  locale: AdminLocale;
  formId: string;
  settings: GroupingSettingsValue;
  /** Heeft een vraag de rol "kern"? Dan gelden er ook grenzen voor de kern. */
  hasAnchor: boolean;
}) {
  const nl = locale === "nl";

  return (
    <SaveForm
      action={saveGroupingSettingsAction}
      className="ticket-admin-form"
      resetOnSuccess={false}
      submitLabel={nl ? "Instellingen opslaan" : "Save settings"}
      savingLabel={nl ? "Opslaan..." : "Saving..."}
      savedMessage={nl ? "Instellingen opgeslagen" : "Settings saved"}
      fallbackErrorMessage={nl ? "Opslaan is niet gelukt." : "Saving failed."}
      errorMessages={errorMessages(locale)}
    >
      <input type="hidden" name="formId" value={formId} />

      <fieldset className="form-admin-fieldset">
        <legend>{nl ? "Groepen" : "Groups"}</legend>
        <div className="ticket-admin-form-grid">
          <NumberField
            id="grouping-min-members"
            name="minMembers"
            label={nl ? "Minimum personen per groep" : "Minimum people per group"}
            help={hasAnchor ? (nl ? "Zonder de kern." : "Without the core.") : undefined}
            defaultValue={settings.minMembers}
            min={1}
            required
          />
          <NumberField
            id="grouping-max-members"
            name="maxMembers"
            label={nl ? "Maximum personen per groep" : "Maximum people per group"}
            help={hasAnchor ? (nl ? "Zonder de kern." : "Without the core.") : undefined}
            defaultValue={settings.maxMembers}
            min={1}
            required
          />
          <NumberField
            id="grouping-min-groups"
            name="minGroups"
            label={nl ? "Minimum aantal groepen" : "Minimum number of groups"}
            help={nl ? "Leeg: volgt uit de groepsgrootte." : "Empty: follows from the group size."}
            defaultValue={settings.minGroups}
            min={1}
          />
          <NumberField
            id="grouping-max-groups"
            name="maxGroups"
            label={nl ? "Maximum aantal groepen" : "Maximum number of groups"}
            help={nl ? "Leeg: volgt uit de groepsgrootte." : "Empty: follows from the group size."}
            defaultValue={settings.maxGroups}
            min={1}
          />
          {hasAnchor ? (
            <>
              <NumberField
                id="grouping-min-anchors"
                name="minAnchors"
                label={nl ? "Minimum kern per groep" : "Minimum core per group"}
                help={nl ? "Bv. peters en meters per groep." : "E.g. mentors per group."}
                defaultValue={settings.minAnchors}
                min={0}
              />
              <NumberField
                id="grouping-max-anchors"
                name="maxAnchors"
                label={nl ? "Maximum kern per groep" : "Maximum core per group"}
                help={
                  nl
                    ? "Een kerngroep die zich samen inschreef, mag groter zijn."
                    : "A core team that registered together may be larger."
                }
                defaultValue={settings.maxAnchors}
                min={1}
              />
            </>
          ) : (
            <>
              <input type="hidden" name="minAnchors" value={settings.minAnchors ?? ""} />
              <input type="hidden" name="maxAnchors" value={settings.maxAnchors ?? ""} />
            </>
          )}
        </div>
      </fieldset>

      <fieldset className="form-admin-fieldset">
        <legend>{nl ? "Wanneer indelen" : "When to divide"}</legend>
        <label className="form-admin-toggle">
          <input type="checkbox" name="autoRun" defaultChecked={settings.autoRun} />
          <span>
            <strong>{nl ? "Automatisch sluiten en indelen" : "Close and divide automatically"}</strong>
            <small>
              {nl
                ? "Zodra alle antwoorden binnen zijn, sluit de form en maakt de site de groepjes. Dat is bij het sluitmoment, bij het maximum aantal inzendingen of bij het verwachte aantal personen hieronder, wat eerst komt. Dit gebeurt één keer; daarna deel je opnieuw in met de knop."
                : "As soon as all answers are in, the form closes and the site makes the groups. That is at the closing time, at the entry limit or at the expected number of people below, whichever comes first. This happens once; after that you divide again with the button."}
            </small>
          </span>
        </label>
        <div className="ticket-admin-form-grid">
          <NumberField
            id="grouping-expected"
            name="expectedPeople"
            label={nl ? "Verwacht aantal personen" : "Expected number of people"}
            help={
              nl
                ? "Een groepsinschrijving telt voor iedereen die ze meebrengt. Leeg: enkel het sluitmoment en het maximum tellen."
                : "A group registration counts for everyone it brings. Empty: only the closing time and the entry limit count."
            }
            defaultValue={settings.expectedPeople}
            min={1}
          />
        </div>
      </fieldset>
    </SaveForm>
  );
}

/** Wat elke vraag doet: het tabblad Vragen. */
export function GroupingRolesForm({
  locale,
  formId,
  fields,
  linkedForm,
}: {
  locale: AdminLocale;
  formId: string;
  fields: GroupingFieldValue[];
  linkedForm: GroupingLinkedForm;
}) {
  const nl = locale === "nl";
  const [roles, setRoles] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.id, field.role ?? ""]))
  );
  const withRole = Object.values(roles).filter(Boolean).length;

  return (
    <SaveForm
      action={saveGroupingRolesAction}
      className="ticket-admin-form"
      resetOnSuccess={false}
      submitLabel={nl ? "Vragen opslaan" : "Save questions"}
      savingLabel={nl ? "Opslaan..." : "Saving..."}
      savedMessage={nl ? "Opgeslagen" : "Saved"}
      fallbackErrorMessage={nl ? "Opslaan is niet gelukt." : "Saving failed."}
      errorMessages={errorMessages(locale)}
    >
      <input type="hidden" name="formId" value={formId} />
      <fieldset className="form-admin-fieldset">
        <legend>{nl ? "Wat doet elke vraag?" : "What does each question do?"}</legend>
        {/* De vragen komen van een andere plek dan dit scherm. Zonder te zeggen
            wélke form dat is, staat hier een lijst vragen zonder afzender, en
            weet je niet waar je er een bijmaakt. */}
        <div className="form-grouping-linked">
          <div className="form-grouping-linked-form">
            <span className="ticket-admin-label">
              {nl ? "De vragen komen van deze form" : "The questions come from this form"}
            </span>
            <strong>{linkedForm.title}</strong>
            <span className="ticket-admin-code">/formulieren/{linkedForm.slug}</span>
            <span className="form-grouping-linked-count">
              {nl
                ? `${fields.length} bruikbare vragen, ${withRole} met een rol`
                : `${fields.length} usable questions, ${withRole} with a role`}
            </span>
          </div>
          <div className="form-grouping-linked-actions">
            {linkedForm.editHref ? (
              <Link className="ticket-admin-button" data-variant="primary" href={linkedForm.editHref}>
                <ListChecks aria-hidden="true" size={15} />
                {nl ? "Vragen bewerken" : "Edit the questions"}
              </Link>
            ) : null}
            <Link className="ticket-admin-button" href={linkedForm.publicHref}>
              <ExternalLink aria-hidden="true" size={15} />
              {nl ? "Form bekijken" : "View form"}
            </Link>
          </div>
        </div>
        <p className="ticket-admin-help">
          {nl
            ? "Een vraag zonder rol is gewoon een gegeven: ze komt in de export maar telt niet mee voor de indeling."
            : "A question without a role is just data: it is exported but does not affect the grouping."}
        </p>
        <div className="form-grouping-fields">
          {fields.map((field) => {
            const role = (roles[field.id] || null) as GroupingRole | null;
            return (
              <div className="form-grouping-field" key={field.id}>
                <div className="ticket-admin-field">
                  <label htmlFor={`grouping-role-${field.id}`}>{field.label}</label>
                  <ThemedSelect
                    id={`grouping-role-${field.id}`}
                    name={`role:${field.id}`}
                    value={roles[field.id] ?? ""}
                    onChange={(next) => setRoles((current) => ({ ...current, [field.id]: next }))}
                    options={[
                      { value: "", label: nl ? "Geen rol (gegeven)" : "No role (data)" },
                      ...field.allowedRoles.map((candidate) => ({
                        value: candidate,
                        label: roleLabel(candidate, locale),
                      })),
                    ]}
                  />
                  {role ? <small>{roleHelp(role, locale)}</small> : null}
                </div>
                {role && roleHasWeight(role) ? (
                  <div className="ticket-admin-field">
                    <label htmlFor={`grouping-weight-${field.id}`}>
                      {nl ? "Belang" : "Weight"}
                    </label>
                    <ThemedSelect
                      id={`grouping-weight-${field.id}`}
                      name={`weight:${field.id}`}
                      defaultValue={String(field.weight)}
                      options={[1, 2, 3, 4, 5].map((weight) => ({
                        value: String(weight),
                        label:
                          weight === 1
                            ? nl
                              ? "1: een beetje"
                              : "1: a little"
                            : weight === 5
                              ? nl
                                ? "5: doorslaggevend"
                                : "5: decisive"
                              : String(weight),
                      }))}
                    />
                  </div>
                ) : null}
                {role && roleNeedsOptions(role) ? (
                  <fieldset className="ticket-admin-field form-grouping-options">
                    <legend className="ticket-admin-label">
                      {role === "ANCHOR"
                        ? nl
                          ? "Kern is wie antwoordt:"
                          : "Core is whoever answers:"
                        : nl
                          ? "Ja betekent:"
                          : "Yes means:"}
                    </legend>
                    {field.options.map((option) => (
                      <label key={option.code}>
                        <input
                          type="checkbox"
                          name={`options:${field.id}`}
                          value={option.code}
                          defaultChecked={field.chosenOptions.includes(option.code)}
                        />
                        {option.label}
                      </label>
                    ))}
                  </fieldset>
                ) : null}
              </div>
            );
          })}
        </div>
      </fieldset>
    </SaveForm>
  );
}

// -----------------------------------------------------------------------------

export function RunGroupingForm({
  locale,
  formId,
  hasResult,
  manualMoves,
}: {
  locale: AdminLocale;
  formId: string;
  hasResult: boolean;
  manualMoves: number;
}) {
  const nl = locale === "nl";
  const label = hasResult
    ? nl
      ? "Opnieuw indelen"
      : "Divide again"
    : nl
      ? "Nu indelen"
      : "Divide now";
  return (
    <SaveForm
      action={runGroupingAction}
      submitLabel={label}
      savingLabel={nl ? "Indelen..." : "Dividing..."}
      savedMessage={nl ? "De groepjes zijn gemaakt" : "The groups have been made"}
      fallbackErrorMessage={nl ? "Indelen is niet gelukt." : "Dividing failed."}
      errorMessages={errorMessages(locale)}
      secondarySubmit={
        hasResult
          ? {
              name: "run",
              value: "1",
              label,
              confirm: {
                title: nl ? "Opnieuw indelen?" : "Divide again?",
                description:
                  manualMoves > 0
                    ? nl
                      ? `De huidige groepen verdwijnen, ook de ${manualMoves} handmatige verplaatsing(en). De inzendingen zelf blijven staan; met dezelfde inzendingen komen dezelfde groepen terug, zonder de verplaatsingen.`
                      : `The current groups are replaced, including the ${manualMoves} manual move(s). The entries themselves stay; the same entries give the same groups again, without the moves.`
                    : nl
                      ? "De huidige groepen worden vervangen door een nieuwe indeling met alle inzendingen van nu. De inzendingen zelf blijven staan."
                      : "The current groups are replaced by a new division with all current entries. The entries themselves stay.",
                confirmLabel: nl ? "Opnieuw indelen" : "Divide again",
                cancelLabel: nl ? "Annuleren" : "Cancel",
              },
            }
          : undefined
      }
      footer={
        hasResult
          ? ({ secondaryButtons, confirmDialog }) => (
              <>
                {secondaryButtons}
                {confirmDialog}
              </>
            )
          : undefined
      }
    >
      <input type="hidden" name="formId" value={formId} />
    </SaveForm>
  );
}

// -----------------------------------------------------------------------------

/**
 * Een keuzelijst die bij een wijziging meteen verplaatst en de uitkomst als
 * toast meldt. Gedeeld door een ingedeelde inzending en een laatkomer.
 */
function GroupPicker({
  locale,
  label,
  groups,
  current,
  allowNew,
  onPick,
}: {
  locale: AdminLocale;
  label: string;
  groups: { id: string; number: number }[];
  current: string;
  allowNew: boolean;
  onPick: (groupId: string) => Promise<{ ok: boolean; code?: string }>;
}) {
  const nl = locale === "nl";
  const [value, setValue] = useState(current);
  const [pending, startTransition] = useTransition();
  const showToast = useToast();

  return (
    <ThemedSelect
      name="groupId"
      ariaLabel={label}
      value={value}
      disabled={pending}
      onChange={(next) => {
        if (next === value) return;
        const previous = value;
        setValue(next);
        startTransition(async () => {
          const result = await onPick(next);
          if (result.ok) {
            showToast({ message: nl ? "Verplaatst" : "Moved", variant: "success" });
          } else {
            setValue(previous);
            showToast({
              message:
                errorMessages(locale)[result.code ?? ""] ??
                (nl ? "Verplaatsen is niet gelukt." : "Moving failed."),
              variant: "error",
              duration: 0,
            });
          }
        });
      }}
      options={[
        ...(current ? [] : [{ value: "", label: nl ? "Kies een groep" : "Pick a group" }]),
        ...groups.map((group) => ({
          value: group.id,
          label: `${nl ? "Groep" : "Group"} ${group.number}`,
        })),
        ...(allowNew ? [{ value: "new", label: nl ? "Nieuwe groep" : "New group" }] : []),
      ]}
    />
  );
}

function stateToResult(state: Awaited<ReturnType<typeof moveGroupingMemberAction>>) {
  return state.status === "success"
    ? { ok: true }
    : { ok: false, code: state.status === "error" ? state.code : undefined };
}

export function MoveMemberSelect({
  locale,
  formId,
  memberId,
  name,
  currentGroupId,
  groups,
}: {
  locale: AdminLocale;
  formId: string;
  memberId: string;
  name: string;
  currentGroupId: string;
  groups: { id: string; number: number }[];
}) {
  return (
    <GroupPicker
      locale={locale}
      label={`${locale === "nl" ? "Groep van" : "Group of"} ${name}`}
      groups={groups}
      current={currentGroupId}
      allowNew
      onPick={async (groupId) => {
        const data = new FormData();
        data.set("formId", formId);
        data.set("memberId", memberId);
        data.set("groupId", groupId);
        return stateToResult(await moveGroupingMemberAction(SAVE_IDLE, data));
      }}
    />
  );
}

export function AddLateEntrySelect({
  locale,
  formId,
  entryId,
  name,
  groups,
}: {
  locale: AdminLocale;
  formId: string;
  entryId: string;
  name: string;
  groups: { id: string; number: number }[];
}) {
  return (
    <GroupPicker
      locale={locale}
      label={`${locale === "nl" ? "Groep voor" : "Group for"} ${name}`}
      groups={groups}
      current=""
      allowNew={false}
      onPick={async (groupId) => {
        const data = new FormData();
        data.set("formId", formId);
        data.set("entryId", entryId);
        data.set("groupId", groupId);
        return stateToResult(await addGroupingMemberAction(SAVE_IDLE, data));
      }}
    />
  );
}
