"use client";

import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteButton, DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { CHAT_ROLES, chatRoleLabel, type ChatRole } from "@/lib/google/chatRoles";
import {
  addChatMemberAction,
  deleteChatSpaceAction,
  removeChatMemberAction,
  setChatMemberRoleAction,
  updateChatSpaceAction,
} from "./actions";

/** Foutcodes van de Chat-acties, met wat er misging en wat eraan te doen is. */
export function chatErrorMessages(nl: boolean): Record<string, string> {
  return nl
    ? {
        NOT_CONFIGURED: "Google Workspace is nog niet ingesteld (Admin > IT).",
        CHAT_NOT_DELEGATED:
          "Google weigerde het aanmelden voor Chat: de Chat-scopes staan nog niet in de domain-wide delegation. Zie docs/google-workspace.md, “Chatruimtes”.",
        CHAT_FORBIDDEN:
          "Google Chat weigerde dit: staat de Chat API aan en is ze geconfigureerd in het Cloud-project, en heeft de beheerder het recht om ruimtes te beheren?",
        NAME_TAKEN: "Er bestaat al een ruimte met die naam.",
        GOOGLE_REFUSED: "Google weigerde deze wijziging.",
        NOT_FOUND: "Deze ruimte of dit lid bestaat niet meer. Herlaad de pagina.",
        INVALID_NAME: "Geef de ruimte een naam van hoogstens 128 tekens.",
        DESCRIPTION_TOO_LONG: "De beschrijving mag hoogstens 150 tekens lang zijn (een grens van Chat).",
        GUIDELINES_TOO_LONG: "De richtlijnen mogen hoogstens 5000 tekens lang zijn.",
        ADDRESS_REQUIRED: "Vul het adres in van een persoon of een groep.",
        NOT_IN_DOMAIN:
          "Dat adres hoort bij geen account en geen groep van het domein. Externe leden kan je via de beheerderstoegang niet toevoegen.",
      }
    : {
        NOT_CONFIGURED: "Google Workspace is not set up yet (Admin > IT).",
        CHAT_NOT_DELEGATED:
          "Google refused the Chat sign-in: the Chat scopes are not in the domain-wide delegation yet. See docs/google-workspace.md, “Chatruimtes”.",
        CHAT_FORBIDDEN:
          "Google Chat refused this: is the Chat API enabled and configured in the Cloud project, and may the admin manage spaces?",
        NAME_TAKEN: "A space with that name already exists.",
        GOOGLE_REFUSED: "Google refused this change.",
        NOT_FOUND: "This space or member no longer exists. Reload the page.",
        INVALID_NAME: "Give the space a name of at most 128 characters.",
        DESCRIPTION_TOO_LONG: "The description can be at most 150 characters (a Chat limit).",
        GUIDELINES_TOO_LONG: "The guidelines can be at most 5000 characters.",
        ADDRESS_REQUIRED: "Enter the address of a person or a group.",
        NOT_IN_DOMAIN:
          "That address belongs to no account and no group of the domain. External members cannot be added with admin access.",
      };
}

const input = "w-full rounded-xl border border-vtk-blue/20 bg-white px-3 py-2 text-sm text-vtk-ink";
const label = "mb-1 block text-xs font-medium uppercase tracking-wide text-[#5c667f]";

export function SpaceDetailsForm({
  nl,
  spaceId,
  displayName,
  description,
  guidelines,
}: {
  nl: boolean;
  spaceId: string;
  displayName: string;
  description: string;
  guidelines: string;
}) {
  return (
    <SaveForm
      action={updateChatSpaceAction}
      submitLabel={nl ? "Opslaan" : "Save"}
      savingLabel={nl ? "Opslaan..." : "Saving..."}
      savedMessage={nl ? "Ruimte opgeslagen." : "Space saved."}
      resetOnSuccess={false}
      errorMessages={chatErrorMessages(nl)}
      fallbackErrorMessage={nl ? "De ruimte is niet opgeslagen." : "The space was not saved."}
      className="space-y-3"
    >
      <input type="hidden" name="spaceId" value={spaceId} />
      <div>
        <label htmlFor="space-name" className={label}>{nl ? "Naam" : "Name"}</label>
        <input id="space-name" name="displayName" defaultValue={displayName} required maxLength={128} className={input} />
      </div>
      <div>
        <label htmlFor="space-description" className={label}>{nl ? "Beschrijving" : "Description"}</label>
        <input id="space-description" name="description" defaultValue={description} maxLength={150} className={input} />
      </div>
      <div>
        <label htmlFor="space-guidelines" className={label}>{nl ? "Richtlijnen" : "Guidelines"}</label>
        <textarea id="space-guidelines" name="guidelines" defaultValue={guidelines} rows={3} maxLength={5000} className={input} />
      </div>
    </SaveForm>
  );
}

export function AddChatMemberForm({
  nl,
  spaceId,
  domain,
  options,
}: {
  nl: boolean;
  spaceId: string;
  domain: string;
  options: { email: string; name: string }[];
}) {
  return (
    <SaveForm
      action={addChatMemberAction}
      submitLabel={nl ? "Toevoegen" : "Add"}
      savingLabel={nl ? "Bezig..." : "Saving..."}
      savedMessage={nl ? "Toegevoegd aan de ruimte." : "Added to the space."}
      errorMessages={chatErrorMessages(nl)}
      fallbackErrorMessage={nl ? "Niet toegevoegd." : "Not added."}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="spaceId" value={spaceId} />
      <datalist id="chat-member-options">
        {options.map((option) => (
          <option key={option.email} value={option.email}>
            {option.name}
          </option>
        ))}
      </datalist>
      <div className="min-w-64 flex-1">
        <label htmlFor="chat-member-address" className={label}>
          {nl ? "Persoon of groep" : "Person or group"}
        </label>
        <input
          id="chat-member-address"
          name="address"
          list="chat-member-options"
          required
          autoComplete="off"
          placeholder={`naam@${domain}`}
          className={input}
        />
      </div>
    </SaveForm>
  );
}

export function ChatMemberRoleForm({
  nl,
  spaceId,
  membership,
  memberLabel,
  role,
}: {
  nl: boolean;
  spaceId: string;
  membership: string;
  memberLabel: string;
  role: ChatRole;
}) {
  return (
    <SaveForm
      action={setChatMemberRoleAction}
      submitLabel={nl ? "Rol opslaan" : "Save role"}
      submitSize="sm"
      submitVariant="ghost"
      savingLabel={nl ? "Bezig..." : "Saving..."}
      savedMessage={nl ? `Rol van ${memberLabel} gewijzigd.` : `${memberLabel}'s role changed.`}
      resetOnSuccess={false}
      errorMessages={chatErrorMessages(nl)}
      fallbackErrorMessage={nl ? "De rol is niet gewijzigd." : "The role was not changed."}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="membership" value={membership} />
      <input type="hidden" name="label" value={memberLabel} />
      <label className="sr-only" htmlFor={`role-${membership}`}>
        {nl ? `Rol van ${memberLabel}` : `Role of ${memberLabel}`}
      </label>
      <select
        id={`role-${membership}`}
        name="role"
        defaultValue={role}
        className="h-8 rounded-full border border-vtk-blue/20 bg-white px-2 text-sm"
      >
        {CHAT_ROLES.map((option) => (
          <option key={option} value={option}>
            {chatRoleLabel(option, nl)}
          </option>
        ))}
      </select>
    </SaveForm>
  );
}

export function RemoveChatMemberButton({
  nl,
  spaceId,
  membership,
  memberLabel,
  isGroup,
  spaceName,
}: {
  nl: boolean;
  spaceId: string;
  membership: string;
  memberLabel: string;
  isGroup: boolean;
  spaceName: string;
}) {
  return (
    <DeleteIconButton
      action={removeChatMemberAction}
      fields={{ spaceId, membership, label: memberLabel }}
      label={nl ? "Uit de ruimte halen" : "Remove from the space"}
      srLabel={nl ? `Uit de ruimte halen: ${memberLabel}` : `Remove from the space: ${memberLabel}`}
      title={nl ? `${memberLabel} uit ${spaceName} halen?` : `Remove ${memberLabel} from ${spaceName}?`}
      description={
        isGroup
          ? nl
            ? `De leden van deze groep zien de ruimte daarna niet meer, tenzij ze er ook zelf of via een andere groep in zitten. De berichten in de ruimte blijven staan.`
            : `Members of this group will no longer see the space, unless they are in it themselves or through another group. The messages in the space stay.`
          : nl
            ? `${memberLabel} ziet de ruimte daarna niet meer. De berichten die ${memberLabel} er stuurde, blijven staan.`
            : `${memberLabel} will no longer see the space. The messages ${memberLabel} sent there stay.`
      }
      confirmLabel={nl ? "Uit de ruimte halen" : "Remove"}
      cancelLabel={nl ? "Annuleren" : "Cancel"}
      successMessage={nl ? `${memberLabel} uit de ruimte gehaald.` : `${memberLabel} removed from the space.`}
      errorMessages={chatErrorMessages(nl)}
    />
  );
}

export function DeleteChatSpaceButton({
  nl,
  spaceId,
  spaceName,
  members,
}: {
  nl: boolean;
  spaceId: string;
  spaceName: string;
  members: number;
}) {
  return (
    <DeleteButton
      action={deleteChatSpaceAction}
      fields={{ spaceId }}
      title={nl ? `Ruimte ${spaceName} verwijderen?` : `Delete the space ${spaceName}?`}
      description={
        nl
          ? `De ruimte verdwijnt voor alle ${members} leden, met al haar berichten en draadjes. Dat kan niet ongedaan gemaakt worden, ook niet in de Admin console.`
          : `The space disappears for all ${members} members, with all its messages and threads. This cannot be undone, not in the Admin console either.`
      }
      confirmLabel={nl ? "Definitief verwijderen" : "Delete permanently"}
      cancelLabel={nl ? "Annuleren" : "Cancel"}
      successMessage={nl ? "Ruimte verwijderd." : "Space deleted."}
      errorMessages={chatErrorMessages(nl)}
    >
      {nl ? "Ruimte verwijderen" : "Delete space"}
    </DeleteButton>
  );
}
