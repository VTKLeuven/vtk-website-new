"use client";

import { useState } from "react";
import { Button, Card, Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import {
  deleteLesbezoekPeculiarityAction,
  saveLesbezoekPeculiarityAction,
} from "@/app/actions/lesbezoeken";
import { lesbezoekAdminErrors } from "@/lib/lesbezoekenMessages";
import type { PeculiarityView } from "./types";

/**
 * Wat je van een docent, een vak of een faculteit moet weten vóór je een aanvraag
 * doorstuurt. Het "Peculiarities"-tabblad van de Sheet.
 *
 * Deze regels zijn de reden dat dit scherm bestaat: ze verdwijnen anders met de
 * verantwoordelijke van vorig jaar, en dan mailt de opvolger een professor die al
 * drie jaar elke aanvraag afkeurt. Wat hier staat, duikt vanzelf op bij elke
 * aanvraag waar het op slaat.
 */
export function PeculiaritiesCard({
  nl,
  canManage,
  peculiarities,
}: {
  nl: boolean;
  canManage: boolean;
  peculiarities: PeculiarityView[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const errors = lesbezoekAdminErrors(nl);

  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {nl ? "Bijzonderheden per docent of vak" : "Notes per lecturer or course"}
        </h2>
        {canManage && (
          <Button type="button" size="sm" onClick={() => setAdding((prev) => !prev)}>
            {adding ? (nl ? "Annuleren" : "Cancel") : nl ? "Bijzonderheid toevoegen" : "Add a note"}
          </Button>
        )}
      </div>
      <p className="mb-4 text-sm text-[#5c667f]">
        {nl
          ? 'Zet als onderwerp een naam, een mailadres, een vak of een faculteit. De aanvragen waarin dat voorkomt, tonen deze regel als waarschuwing: "keurt alles af", "enkel op het einde van de les", "enkel VTK".'
          : 'Use a name, an email address, a course or a faculty as the subject. Requests matching it show this line as a warning: "declines everything", "only at the end of class", "VTK only".'}
      </p>

      {adding && canManage && (
        <div className="mb-4 rounded-2xl border border-vtk-blue/15 p-4">
          <PeculiarityForm nl={nl} errors={errors} peculiarity={null} onDone={() => setAdding(false)} />
        </div>
      )}

      {peculiarities.length === 0 ? (
        <p className="text-sm text-[#5c667f]">
          {nl ? "Nog geen bijzonderheden." : "No notes yet."}
        </p>
      ) : (
        <ul className="divide-y divide-vtk-blue/10">
          {peculiarities.map((peculiarity) => (
            <li key={peculiarity.id} className="py-2">
              <div className="flex flex-wrap items-start gap-3">
                <button
                  type="button"
                  className="flex-1 text-left"
                  onClick={() =>
                    setExpanded((prev) => (prev === peculiarity.id ? null : peculiarity.id))
                  }
                  aria-expanded={expanded === peculiarity.id}
                  disabled={!canManage}
                >
                  <span className="block text-sm font-semibold text-vtk-ink">
                    {peculiarity.subject}
                  </span>
                  <span className="block text-sm text-[#5c667f]">{peculiarity.note}</span>
                </button>
                {canManage && (
                  <DeleteIconButton
                    action={deleteLesbezoekPeculiarityAction}
                    fields={{ id: peculiarity.id }}
                    label={nl ? "Verwijderen" : "Delete"}
                    srLabel={`${nl ? "Verwijderen" : "Delete"}: ${peculiarity.subject}`}
                    title={nl ? "Bijzonderheid verwijderen?" : "Delete note?"}
                    description={
                      nl
                        ? `De regel bij "${peculiarity.subject}" verdwijnt en wordt niet meer getoond bij nieuwe aanvragen. De lesbezoeken zelf blijven staan.`
                        : `The note on "${peculiarity.subject}" disappears and will no longer show on new requests. The classroom visits themselves stay.`
                    }
                    confirmLabel={nl ? "Verwijderen" : "Delete"}
                    cancelLabel={nl ? "Annuleren" : "Cancel"}
                    successMessage={nl ? "Bijzonderheid verwijderd." : "Note deleted."}
                  />
                )}
              </div>

              {expanded === peculiarity.id && canManage && (
                <div className="mt-3 rounded-2xl border border-vtk-blue/15 p-4">
                  <PeculiarityForm
                    nl={nl}
                    errors={errors}
                    peculiarity={peculiarity}
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

function PeculiarityForm({
  nl,
  errors,
  peculiarity,
  onDone,
}: {
  nl: boolean;
  errors: Record<string, string>;
  peculiarity: PeculiarityView | null;
  onDone: () => void;
}) {
  const prefix = peculiarity?.id ?? "new";

  return (
    <SaveForm
      action={saveLesbezoekPeculiarityAction}
      submitLabel={nl ? "Opslaan" : "Save"}
      savingLabel={nl ? "Opslaan…" : "Saving…"}
      savedMessage={nl ? "Bijzonderheid opgeslagen." : "Note saved."}
      errorMessages={errors}
      fallbackErrorMessage={nl ? "Niet opgeslagen." : "Not saved."}
      resetOnSuccess={peculiarity === null}
      onSuccess={onDone}
      className="space-y-3"
    >
      {peculiarity && <input type="hidden" name="id" value={peculiarity.id} />}
      <div>
        <Label htmlFor={`pec-subject-${prefix}`}>
          {nl ? "Docent, vak of faculteit" : "Lecturer, course or faculty"}
        </Label>
        <Input
          id={`pec-subject-${prefix}`}
          name="subject"
          defaultValue={peculiarity?.subject ?? ""}
          maxLength={200}
          placeholder={nl ? "Vandewalle" : "Vandewalle"}
          required
        />
      </div>
      <div>
        <Label htmlFor={`pec-note-${prefix}`}>{nl ? "Wat je moet weten" : "What to know"}</Label>
        <Textarea
          id={`pec-note-${prefix}`}
          name="note"
          rows={2}
          defaultValue={peculiarity?.note ?? ""}
          maxLength={1000}
          placeholder={nl ? "enkel VTK, en enkel op het einde van de les" : "VTK only, and only at the end of class"}
          required
        />
      </div>
    </SaveForm>
  );
}
