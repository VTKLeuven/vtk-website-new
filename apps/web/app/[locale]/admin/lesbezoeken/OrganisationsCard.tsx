"use client";

import { useState } from "react";
import { Button, Card, Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import {
  deleteLesbezoekOrganisationAction,
  saveLesbezoekOrganisationAction,
} from "@/app/actions/lesbezoeken";
import { LESBEZOEK_LIMITS } from "@/lib/lesbezoeken";
import { lesbezoekAdminErrors } from "@/lib/lesbezoekenMessages";
import type { OrganisationView } from "./types";

/**
 * De organisaties die een lesbezoek mogen aanvragen: de keuzelijst van het
 * publieke formulier, en meteen de kleurenlegende van de kalender.
 *
 * De notitie per organisatie is het "Shame"-tabblad van de Sheet. Ze staat hier
 * omdat ze vanzelf in het detailpaneel van elke aanvraag opduikt: wie beoordeelt
 * ziet dan dat deze organisatie vorig jaar niet kwam opdagen, zonder een tweede
 * document open te doen.
 */
export function OrganisationsCard({
  nl,
  canManage,
  organisations,
}: {
  nl: boolean;
  canManage: boolean;
  organisations: OrganisationView[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const errors = lesbezoekAdminErrors(nl);

  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{nl ? "Organisaties" : "Organisations"}</h2>
        {canManage && (
          <Button type="button" size="sm" onClick={() => setAdding((prev) => !prev)}>
            {adding ? (nl ? "Annuleren" : "Cancel") : nl ? "Organisatie toevoegen" : "Add organisation"}
          </Button>
        )}
      </div>
      <p className="mb-4 text-sm text-[#5c667f]">
        {nl
          ? "Wat hier actief staat, kan een aanvrager kiezen in het formulier. Een organisatie die zelf een naam intikt, komt er automatisch bij met een vrije kleur."
          : "Whatever is active here can be picked in the request form. An organisation that types its own name is added automatically with a free colour."}
      </p>

      {adding && canManage && (
        <div className="mb-4 rounded-2xl border border-vtk-blue/15 p-4">
          <OrganisationForm
            nl={nl}
            errors={errors}
            organisation={null}
            onDone={() => setAdding(false)}
          />
        </div>
      )}

      {organisations.length === 0 ? (
        <p className="text-sm text-[#5c667f]">
          {nl ? "Nog geen organisaties." : "No organisations yet."}
        </p>
      ) : (
        <ul className="divide-y divide-vtk-blue/10">
          {organisations.map((organisation) => (
            <li key={organisation.id} className="py-2">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="size-4 shrink-0 rounded-full"
                  style={{ background: organisation.colour }}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  className="flex-1 text-left text-sm font-semibold text-vtk-ink"
                  onClick={() =>
                    setExpanded((prev) => (prev === organisation.id ? null : organisation.id))
                  }
                  aria-expanded={expanded === organisation.id}
                  disabled={!canManage}
                >
                  {organisation.name}
                </button>
                <span className="text-xs text-[#5c667f]">
                  {organisation.visitCount} {nl ? "bezoeken" : "visits"}
                </span>
                {!organisation.active && (
                  <span className="lb-badge" data-tone="no">
                    {nl ? "Niet actief" : "Inactive"}
                  </span>
                )}
                {canManage && organisation.visitCount === 0 && (
                  <DeleteIconButton
                    action={deleteLesbezoekOrganisationAction}
                    fields={{ id: organisation.id }}
                    label={nl ? "Verwijderen" : "Delete"}
                    srLabel={`${nl ? "Verwijderen" : "Delete"}: ${organisation.name}`}
                    title={nl ? "Organisatie verwijderen?" : "Delete organisation?"}
                    description={
                      nl
                        ? `"${organisation.name}" verdwijnt uit de keuzelijst van het formulier en uit de legende. Er hangen geen lesbezoeken aan, dus er gaat geen historiek verloren.`
                        : `"${organisation.name}" disappears from the request form and the legend. No classroom visits are attached, so no history is lost.`
                    }
                    confirmLabel={nl ? "Verwijderen" : "Delete"}
                    cancelLabel={nl ? "Annuleren" : "Cancel"}
                    successMessage={nl ? "Organisatie verwijderd." : "Organisation deleted."}
                  />
                )}
              </div>

              {organisation.note && expanded !== organisation.id && (
                <p className="mt-1 pl-7 text-sm text-[#5c667f]">{organisation.note}</p>
              )}

              {expanded === organisation.id && canManage && (
                <div className="mt-3 rounded-2xl border border-vtk-blue/15 p-4">
                  <OrganisationForm
                    nl={nl}
                    errors={errors}
                    organisation={organisation}
                    onDone={() => setExpanded(null)}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function OrganisationForm({
  nl,
  errors,
  organisation,
  onDone,
}: {
  nl: boolean;
  errors: Record<string, string>;
  organisation: OrganisationView | null;
  onDone: () => void;
}) {
  const prefix = organisation?.id ?? "new";

  return (
    <SaveForm
      action={saveLesbezoekOrganisationAction}
      submitLabel={nl ? "Opslaan" : "Save"}
      savingLabel={nl ? "Opslaan…" : "Saving…"}
      savedMessage={nl ? "Organisatie opgeslagen." : "Organisation saved."}
      errorMessages={errors}
      fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
      resetOnSuccess={organisation === null}
      onSuccess={onDone}
      className="space-y-3"
    >
      {organisation && <input type="hidden" name="id" value={organisation.id} />}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <Label htmlFor={`org-name-${prefix}`}>{nl ? "Naam" : "Name"}</Label>
          <Input
            id={`org-name-${prefix}`}
            name="name"
            defaultValue={organisation?.name ?? ""}
            maxLength={LESBEZOEK_LIMITS.organisation}
            required
          />
        </div>
        <div>
          <Label htmlFor={`org-colour-${prefix}`}>{nl ? "Kleur" : "Colour"}</Label>
          <input
            id={`org-colour-${prefix}`}
            type="color"
            name="colour"
            defaultValue={organisation?.colour ?? "#3B82F6"}
            className="h-10 w-14 cursor-pointer rounded-lg border border-vtk-blue/15 bg-white p-1"
          />
        </div>
      </div>

      <div>
        <Label htmlFor={`org-mail-${prefix}`}>
          {nl ? "Vast mailadres van de organisatie" : "Standing address of the organisation"}
        </Label>
        <Input
          id={`org-mail-${prefix}`}
          name="contactEmail"
          type="email"
          defaultValue={organisation?.contactEmail ?? ""}
          maxLength={LESBEZOEK_LIMITS.email}
        />
        <p className="lb-help">
          {nl
            ? "Leest mee in kopie bij een terugkoppeling. De persoon die aanvroeg is volgend jaar weg, de post blijft."
            : "Kept in copy on replies. The person who requested moves on; the post stays."}
        </p>
      </div>

      <div>
        <Label htmlFor={`org-note-${prefix}`}>{nl ? "Interne notitie" : "Internal note"}</Label>
        <Textarea
          id={`org-note-${prefix}`}
          name="note"
          rows={2}
          defaultValue={organisation?.note ?? ""}
          placeholder={
            nl
              ? "kwam vorig jaar twee keer niet opdagen"
              : "did not show up twice last year"
          }
        />
        <p className="lb-help">
          {nl
            ? "Verschijnt als waarschuwing bij elke aanvraag van deze organisatie."
            : "Shows as a warning on every request from this organisation."}
        </p>
      </div>

      <label className="lb-check">
        <input type="checkbox" name="active" defaultChecked={organisation?.active ?? true} />
        <span>{nl ? "Kiesbaar in het aanvraagformulier" : "Selectable in the request form"}</span>
      </label>
    </SaveForm>
  );
}
