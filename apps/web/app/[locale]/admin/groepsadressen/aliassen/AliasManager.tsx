"use client";

import { useState } from "react";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { IconButton, IconLink } from "@/components/ui/IconButton";
import { PencilIcon, UsersIcon } from "@/components/ui/icons";
import { addAliasAction, changeAliasAction, removeAliasAction } from "./actions";

export type AliasRowView = {
  alias: string;
  ownerEmail: string;
  ownerName: string;
  ownerKind: "group" | "user";
  ownerSuspended: boolean;
  managedBySite: boolean;
  kiesploeg: boolean;
};

function errorMessages(nl: boolean): Record<string, string> {
  return nl
    ? {
        INVALID_ALIAS: "Dat is geen geldig adres. Gebruik letters, cijfers, punten en streepjes, bv. loko-av of loko-av@vtk.be.",
        OWNER_NOT_FOUND: "Dat adres hoort bij geen groep of account van het domein. Kies er een uit de lijst.",
        ALIAS_TAKEN: "Dat adres is al in gebruik, als hoofdadres of als alias. Zoek het hierboven op om te zien van wie.",
        ALREADY_ON_OWNER: "Die alias staat al op dit adres.",
        ALIAS_NOT_FOUND: "Die alias bestaat niet meer. Herlaad de pagina.",
        NOTHING_CHANGED: "Er is niets veranderd: zelfde adres, zelfde eigenaar.",
        GOOGLE_REFUSED: "Google weigerde dit adres, meestal omdat het domein niet bij VTK hoort.",
        NOT_CONFIGURED: "Google Workspace is nog niet ingesteld (Admin > IT).",
      }
    : {
        INVALID_ALIAS: "That is not a valid address. Use letters, digits, dots and dashes, e.g. loko-av or loko-av@vtk.be.",
        OWNER_NOT_FOUND: "That address belongs to no group or account of the domain. Pick one from the list.",
        ALIAS_TAKEN: "That address is already in use, as a primary address or an alias. Look it up above to see whose.",
        ALREADY_ON_OWNER: "That alias is already on this address.",
        ALIAS_NOT_FOUND: "That alias no longer exists. Reload the page.",
        NOTHING_CHANGED: "Nothing changed: same address, same owner.",
        GOOGLE_REFUSED: "Google refused this address, usually because the domain is not one of VTK's.",
        NOT_CONFIGURED: "Google Workspace is not set up yet (Admin > IT).",
      };
}

/** De keuzelijst van groepen en accounts voor het veld "Hoort bij". */
function OwnerOptions({ id, owners }: { id: string; owners: { email: string; name: string }[] }) {
  return (
    <datalist id={id}>
      {owners.map((owner) => (
        <option key={owner.email} value={owner.email}>
          {owner.name}
        </option>
      ))}
    </datalist>
  );
}

const input =
  "h-10 w-full rounded-xl border border-vtk-blue/20 bg-white px-3 text-sm text-vtk-ink";

export function AddAliasForm({
  nl,
  domain,
  owners,
  defaultOwner,
}: {
  nl: boolean;
  domain: string;
  owners: { email: string; name: string }[];
  defaultOwner?: string;
}) {
  return (
    <SaveForm
      action={addAliasAction}
      submitLabel={nl ? "Alias toevoegen" : "Add alias"}
      savingLabel={nl ? "Bezig..." : "Saving..."}
      savedMessage={nl ? "Alias toegevoegd. Google heeft soms een paar minuten nodig." : "Alias added. Google sometimes needs a few minutes."}
      errorMessages={errorMessages(nl)}
      fallbackErrorMessage={nl ? "De alias is niet toegevoegd." : "The alias was not added."}
      className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
    >
      <OwnerOptions id="alias-owner-options" owners={owners} />
      <div>
        <label htmlFor="alias-new" className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#5c667f]">
          {nl ? "Nieuwe alias" : "New alias"}
        </label>
        <input id="alias-new" name="alias" required className={input} placeholder={`loko-av@${domain}`} autoComplete="off" />
      </div>
      <div>
        <label htmlFor="alias-owner" className="mb-1 block text-xs font-medium uppercase tracking-wide text-[#5c667f]">
          {nl ? "Hoort bij (groep of account)" : "Belongs to (group or account)"}
        </label>
        <input
          id="alias-owner"
          name="owner"
          required
          list="alias-owner-options"
          defaultValue={defaultOwner}
          className={input}
          placeholder={`loko@${domain}`}
          autoComplete="off"
        />
      </div>
    </SaveForm>
  );
}

export function AliasTable({
  nl,
  rows,
  owners,
  lookupBase,
  search,
}: {
  nl: boolean;
  rows: AliasRowView[];
  owners: { email: string; name: string }[];
  /** De pagina zelf; "Wie krijgt de mail?" zet er `?adres=` achter. */
  lookupBase: string;
  search: string;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const lookupHref = (address: string) => {
    const params = new URLSearchParams({ adres: address });
    if (search) params.set("zoek", search);
    return `${lookupBase}?${params.toString()}#ontvangers`;
  };

  return (
    <div className="relative overflow-x-auto rounded-xl border border-vtk-blue/15 bg-white">
      <OwnerOptions id="alias-edit-owner-options" owners={owners} />
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-vtk-blue/10 text-left text-xs uppercase tracking-wide text-[#5c667f]">
            <th className="px-4 py-3 font-medium">Alias</th>
            <th className="px-4 py-3 font-medium">{nl ? "Hoort bij" : "Belongs to"}</th>
            <th className="px-4 py-3">
              <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.alias} className="border-b border-vtk-blue/10 align-top last:border-0">
              <td className="px-4 py-3">
                <span className="font-medium text-vtk-ink">{row.alias}</span>
                {row.kiesploeg ? (
                  <span className="block text-xs text-[#5c667f]">
                    {nl ? "Kiesploegadres: de sync haalt het op 15 juli weg" : "Kiesploeg address: the sync removes it on 15 July"}
                  </span>
                ) : null}
                {editing === row.alias ? (
                  <SaveForm
                    action={changeAliasAction}
                    submitLabel={nl ? "Wijzigen" : "Change"}
                    savingLabel={nl ? "Bezig..." : "Saving..."}
                    savedMessage={nl ? "Alias gewijzigd." : "Alias changed."}
                    errorMessages={errorMessages(nl)}
                    fallbackErrorMessage={nl ? "De alias is niet gewijzigd." : "The alias was not changed."}
                    onSuccess={() => setEditing(null)}
                    className="mt-3 grid gap-2"
                  >
                    <input type="hidden" name="oldAlias" value={row.alias} />
                    <label className="text-xs font-medium text-[#5c667f]" htmlFor={`edit-alias-${row.alias}`}>
                      {nl ? "Adres" : "Address"}
                    </label>
                    <input id={`edit-alias-${row.alias}`} name="alias" defaultValue={row.alias} required className={input} />
                    <label className="text-xs font-medium text-[#5c667f]" htmlFor={`edit-owner-${row.alias}`}>
                      {nl ? "Hoort bij" : "Belongs to"}
                    </label>
                    <input
                      id={`edit-owner-${row.alias}`}
                      name="owner"
                      defaultValue={row.ownerEmail}
                      list="alias-edit-owner-options"
                      required
                      className={input}
                    />
                    <span className="text-xs text-[#5c667f]">
                      {nl
                        ? "Een nieuw adres komt er eerst bij en pas daarna gaat het oude weg. Verhuist hetzelfde adres naar een andere eigenaar, dan is het heel even weg."
                        : "A new address is added first and only then is the old one removed. Moving the same address to another owner leaves it briefly unassigned."}
                    </span>
                  </SaveForm>
                ) : null}
              </td>
              <td className="px-4 py-3">
                <span className="text-vtk-ink">{row.ownerName}</span>
                <span className="block text-xs text-[#5c667f]">
                  {row.ownerEmail} · {row.ownerKind === "group" ? (nl ? "groep" : "group") : nl ? "account" : "account"}
                  {row.managedBySite ? (nl ? " · leden beheerd door de site" : " · members managed by the site") : ""}
                  {row.ownerSuspended ? (nl ? " · geschorst" : " · suspended") : ""}
                </span>
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-1">
                  <IconLink
                    href={lookupHref(row.alias)}
                    label={nl ? "Wie krijgt de mail?" : "Who gets the mail?"}
                    srLabel={nl ? `Wie krijgt de mail naar ${row.alias}?` : `Who gets mail sent to ${row.alias}?`}
                  >
                    <UsersIcon />
                  </IconLink>
                  <IconButton
                    label={editing === row.alias ? (nl ? "Wijzigen sluiten" : "Close editing") : nl ? "Wijzigen" : "Edit"}
                    srLabel={nl ? `Wijzigen: ${row.alias}` : `Edit: ${row.alias}`}
                    aria-expanded={editing === row.alias}
                    onClick={() => setEditing(editing === row.alias ? null : row.alias)}
                  >
                    <PencilIcon />
                  </IconButton>
                  <DeleteIconButton
                    action={removeAliasAction}
                    fields={{ alias: row.alias }}
                    label={nl ? "Verwijderen" : "Delete"}
                    srLabel={nl ? `Verwijderen: ${row.alias}` : `Delete: ${row.alias}`}
                    title={nl ? `Alias ${row.alias} verwijderen?` : `Delete alias ${row.alias}?`}
                    description={
                      nl
                        ? `Mail naar ${row.alias} komt daarna niet meer aan bij ${row.ownerEmail}; de afzender krijgt een foutmelding. ${row.ownerEmail} zelf en zijn andere aliassen blijven.${row.kiesploeg ? " Dit is een kiesploegadres dat de sync zelf beheert." : ""}`
                        : `Mail to ${row.alias} will no longer reach ${row.ownerEmail}; the sender gets a bounce. ${row.ownerEmail} itself and its other aliases stay.${row.kiesploeg ? " This is a kiesploeg address managed by the sync." : ""}`
                    }
                    confirmLabel={nl ? "Verwijderen" : "Delete"}
                    cancelLabel={nl ? "Annuleren" : "Cancel"}
                    successMessage={nl ? "Alias verwijderd." : "Alias deleted."}
                    errorMessages={errorMessages(nl)}
                  />
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-4 py-6 text-center text-[#5c667f]">
                {nl ? "Geen aliassen die hierbij passen." : "No aliases match."}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
