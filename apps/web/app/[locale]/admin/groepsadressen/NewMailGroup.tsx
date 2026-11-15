"use client";

import { useState } from "react";
import { Input, Label, Select } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { createMailGroupAction } from "./actions";

/**
 * Een nieuw groepsadres. Na het aanmaken gaat de action naar de detailpagina,
 * waar je de bronnen en leden toevoegt; die navigatie is de bevestiging.
 *
 * Een werkgroep kiest enkel het stuk na haar voorvoegsel: statix. + pr wordt
 * statix.pr@vtk.be. Zo kan ze geen adres maken dat op een post lijkt.
 */
export function NewMailGroup({
  nl,
  domain,
  manageAll,
  werkgroepen,
}: {
  nl: boolean;
  domain: string;
  manageAll: boolean;
  werkgroepen: { id: string; name: string; prefix: string }[];
}) {
  const [ownerId, setOwnerId] = useState(manageAll ? "" : (werkgroepen[0]?.id ?? ""));
  const owner = werkgroepen.find((w) => w.id === ownerId) ?? null;
  if (!manageAll && werkgroepen.length === 0) return null;

  const errorMessages = nl
    ? {
        DUPLICATE_EMAIL: "Niet aangemaakt: dat adres bestaat al.",
        INVALID_EMAIL: "Niet aangemaakt: dat is geen geldig adres.",
        WRONG_PREFIX: "Niet aangemaakt: een werkgroep maakt enkel adressen met haar eigen voorvoegsel.",
        INVALID_INPUT: "Niet aangemaakt: controleer de velden.",
      }
    : {
        DUPLICATE_EMAIL: "Not created: that address already exists.",
        INVALID_EMAIL: "Not created: that is not a valid address.",
        WRONG_PREFIX: "Not created: a work group only creates addresses with its own prefix.",
        INVALID_INPUT: "Not created: check the fields.",
      };

  return (
    <AdminDisclosure
      summary={
        <span className="font-semibold text-vtk-ink">
          {nl ? "Nieuw groepsadres" : "New group address"}
        </span>
      }
    >
      <SaveForm
        action={createMailGroupAction}
        submitLabel={nl ? "Aanmaken" : "Create"}
        savingLabel={nl ? "Bezig met aanmaken..." : "Creating..."}
        savedMessage={nl ? "Groepsadres aangemaakt." : "Group address created."}
        errorMessages={errorMessages}
        fallbackErrorMessage={nl ? "Aanmaken is mislukt." : "Creating failed."}
        className="space-y-3"
      >
        <input type="hidden" name="locale" value={nl ? "nl" : "en"} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {werkgroepen.length > 0 && (
            <div>
              <Label>{nl ? "Werkgroep" : "Work group"}</Label>
              <Select
                name="ownerGroupId"
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                required={!manageAll}
              >
                {manageAll && <option value="">{nl ? "Geen (enkel IT)" : "None (IT only)"}</option>}
                {werkgroepen.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.prefix}.)
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-xs text-zinc-500">
                {nl
                  ? "De werkgroep beheert dan zelf de leden van dit adres."
                  : "That work group then manages this address's members itself."}
              </p>
            </div>
          )}
          <div>
            <Label>{nl ? "Adres" : "Address"}</Label>
            {owner && !manageAll ? (
              <div className="flex items-center gap-1 text-sm">
                <span className="text-zinc-500">{owner.prefix}.</span>
                <Input name="localPart" placeholder="pr" required className="flex-1" />
                <span className="text-zinc-500">@{domain}</span>
              </div>
            ) : (
              <Input
                name="email"
                type="email"
                placeholder={owner ? `${owner.prefix}.pr@${domain}` : `activiteiten@${domain}`}
                required
              />
            )}
          </div>
          <div>
            <Label>{nl ? "Naam" : "Name"}</Label>
            <Input name="name" placeholder={owner ? `${owner.name} PR` : "Activiteiten"} required />
          </div>
          <div className="sm:col-span-2">
            <Label>{nl ? "Omschrijving" : "Description"}</Label>
            <Input name="description" />
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-zinc-700">
          <input type="checkbox" name="allowExternalSenders" defaultChecked className="mt-1" />
          <span>
            {nl ? "Mail van buiten vtk.be toelaten" : "Allow mail from outside vtk.be"}
            <span className="block text-xs text-zinc-500">
              {nl
                ? "Aan voor elk adres waar bedrijven, profs of studenten naartoe mailen."
                : "On for every address companies, professors or students mail."}
            </span>
          </span>
        </label>
      </SaveForm>
    </AdminDisclosure>
  );
}
