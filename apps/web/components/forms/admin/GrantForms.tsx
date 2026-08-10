"use client";

import { addFormGroupGrantAction, addFormUserGrantAction } from "@/app/actions/forms";
import { SaveForm } from "@/components/ui/SaveForm";
import { grantRoleHelp, grantRoleLabel, type AdminLocale } from "./format";

const ROLES = ["VIEWER", "EDITOR", "MANAGER"] as const;

function roleOptions(locale: AdminLocale) {
  return ROLES.map((role) => (
    <option key={role} value={role}>
      {grantRoleLabel(role, locale)}
    </option>
  ));
}

function errorMessages(locale: AdminLocale) {
  const nl = locale === "nl";
  return {
    USER_NOT_FOUND: nl
      ? "Geen lid gevonden met dat adres. Het moet het e-mailadres van een VTK-account zijn."
      : "No member found with that address. It has to be the e-mail of a VTK account.",
    INVALID_EMAIL: nl ? "Dat is geen geldig e-mailadres." : "That is not a valid e-mail address.",
    GROUP_REQUIRED: nl ? "Kies een post." : "Pick a post.",
    FORBIDDEN: nl
      ? "Je mag de toegang van dit formulier niet wijzigen."
      : "You cannot change this form's access.",
  };
}

export function AddUserGrantForm({ locale, formId }: { locale: AdminLocale; formId: string }) {
  const nl = locale === "nl";
  return (
    <SaveForm
      action={addFormUserGrantAction}
      className="ticket-admin-form"
      submitLabel={nl ? "Toegang opslaan" : "Save access"}
      savingLabel={nl ? "Bezig..." : "Saving..."}
      savedMessage={nl ? "Toegang toegekend" : "Access granted"}
      fallbackErrorMessage={nl ? "Toegang toekennen is niet gelukt." : "Granting access failed."}
      errorMessages={errorMessages(locale)}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="formId" value={formId} />
      <div className="ticket-admin-field">
        <label htmlFor="grant-user-email">E-mail</label>
        <input id="grant-user-email" name="email" type="email" autoComplete="off" required />
      </div>
      <div className="ticket-admin-field">
        <label htmlFor="grant-user-role">{nl ? "Rol" : "Role"}</label>
        <select id="grant-user-role" name="role" defaultValue="EDITOR">
          {roleOptions(locale)}
        </select>
      </div>
      <ul className="form-admin-hint">
        {ROLES.map((role) => (
          <li key={role}>
            <strong>{grantRoleLabel(role, locale)}</strong>: {grantRoleHelp(role, locale)}
          </li>
        ))}
      </ul>
    </SaveForm>
  );
}

export function AddGroupGrantForm({
  locale,
  formId,
  groups,
}: {
  locale: AdminLocale;
  formId: string;
  groups: Array<{ id: string; name: string }>;
}) {
  const nl = locale === "nl";
  return (
    <SaveForm
      action={addFormGroupGrantAction}
      className="ticket-admin-form"
      submitLabel={nl ? "Posttoegang opslaan" : "Save post access"}
      savingLabel={nl ? "Bezig..." : "Saving..."}
      savedMessage={nl ? "Toegang toegekend" : "Access granted"}
      fallbackErrorMessage={nl ? "Toegang toekennen is niet gelukt." : "Granting access failed."}
      errorMessages={errorMessages(locale)}
    >
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="formId" value={formId} />
      <div className="ticket-admin-form-grid">
        <div className="ticket-admin-field" data-span="2">
          <label htmlFor="grant-group">{nl ? "Post" : "Post"}</label>
          <select id="grant-group" name="groupId" required>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name}
              </option>
            ))}
          </select>
        </div>
        <div className="ticket-admin-field">
          <label htmlFor="grant-group-role">{nl ? "Rol" : "Role"}</label>
          <select id="grant-group-role" name="role" defaultValue="EDITOR">
            {roleOptions(locale)}
          </select>
        </div>
        <div className="ticket-admin-field">
          <label htmlFor="grant-group-scope">{nl ? "Voor wie" : "Scope"}</label>
          <select id="grant-group-scope" name="scope" defaultValue="LEADS_ONLY">
            <option value="LEADS_ONLY">
              {nl ? "Alleen de verantwoordelijken" : "Post leads only"}
            </option>
            <option value="ALL_MEMBERS">{nl ? "Alle leden van de post" : "All post members"}</option>
          </select>
        </div>
      </div>
    </SaveForm>
  );
}
