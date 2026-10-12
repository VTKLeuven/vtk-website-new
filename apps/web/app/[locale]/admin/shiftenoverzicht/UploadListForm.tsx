"use client";

import { useState } from "react";
import { Button, Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { suggestListName } from "@/lib/praesidiumShifts/names";
import { uploadPraesidiumShiftListAction } from "@/app/actions/praesidiumShifts";

/**
 * Een shiftenlijst opladen: het bestand, een naam en het werkingsjaar. De naam
 * vult zich vanzelf in uit de bestandsnaam ("Shiftenlijst 24UL '26-'27.xlsx"
 * wordt "24UL"), maar blijft aanpasbaar. Na het opladen gaat de action naar het
 * nakijkscherm van de lijst; die navigatie is de bevestiging.
 */
export function UploadListForm({
  locale,
  kind,
  year,
  errorMessages,
  variant = "button",
}: {
  locale: "nl" | "en";
  kind: "EVENT" | "WEEKLY";
  year: number;
  errorMessages: Record<string, string>;
  /**
   * `card` is de gestippelde kaart achteraan de rij evenementen; open neemt het
   * formulier de volle breedte van die rij.
   */
  variant?: "button" | "card";
}) {
  const nl = locale === "nl";
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  if (!open && variant === "card") {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="grid min-h-[132px] place-content-center gap-1 rounded-[18px] border-[1.5px] border-dashed border-vtk-navy/20 p-4 text-center text-vtk-body transition-colors hover:border-vtk-navy/40 hover:bg-vtk-surface-elevated"
      >
        <span className="font-semibold text-vtk-ink">
          {kind === "WEEKLY" ? (nl ? "+ Rooster opladen" : "+ Upload schedule") : nl ? "+ Lijst opladen" : "+ Upload list"}
        </span>
        <span className="text-xs text-vtk-muted">{nl ? "xlsx-export van Google Sheets" : "xlsx export from Google Sheets"}</span>
      </button>
    );
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        {kind === "WEEKLY"
          ? nl
            ? "Rooster opladen"
            : "Upload schedule"
          : nl
            ? "Shiftenlijst opladen"
            : "Upload shift list"}
      </Button>
    );
  }

  return (
    <div className="col-span-full w-full rounded-[18px] border border-vtk-blue/10 bg-vtk-surface-elevated p-5 shadow-[inset_3px_0_0_var(--color-vtk-yellow)]">
      <SaveForm
        action={uploadPraesidiumShiftListAction}
        submitLabel={nl ? "Opladen en nakijken" : "Upload and review"}
        savingLabel={nl ? "Bezig met inlezen..." : "Reading..."}
        savedMessage={nl ? "Opgeladen." : "Uploaded."}
        errorMessages={errorMessages}
        fallbackErrorMessage={nl ? "Niet opgeladen: er ging iets mis bij het inlezen." : "Not uploaded: reading the file failed."}
        resetOnSuccess={false}
        className="space-y-4"
        footer={({ submitButton }) => (
          <div className="flex flex-wrap items-center gap-2">
            {submitButton}
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {nl ? "Annuleren" : "Cancel"}
            </Button>
          </div>
        )}
      >
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="year" value={year} />
        <p className="text-sm text-vtk-body">
          {kind === "WEEKLY"
            ? nl
              ? "Exporteer de Google Sheet met de wekelijkse praesidiumshiften als xlsx (Bestand > Downloaden > Microsoft Excel). Elke rij met een datum is een dag, elke kolom een taak."
              : "Export the Google Sheet with the weekly praesidium shifts as xlsx (File > Download > Microsoft Excel). Every row with a date is a day, every column a task."
            : nl
              ? "Exporteer de Google Sheet als xlsx (Bestand > Downloaden > Microsoft Excel). De kleuren blijven bewaard: op een lijst met meerdere kringen kies je straks welke kleur van VTK is."
              : "Export the Google Sheet as xlsx (File > Download > Microsoft Excel). Colours are kept: on a list shared with other student associations you pick the VTK colour next."}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="psl-file">{nl ? "Bestand (.xlsx)" : "File (.xlsx)"}</Label>
            <Input
              id="psl-file"
              type="file"
              name="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file && !touched) setName(suggestListName(file.name));
              }}
            />
          </div>
          <div>
            <Label htmlFor="psl-name">{nl ? "Naam" : "Name"}</Label>
            <Input
              id="psl-name"
              name="name"
              required
              maxLength={120}
              value={name}
              placeholder={kind === "WEEKLY" ? (nl ? "Semester 1" : "Semester 1") : "24UL"}
              onChange={(event) => {
                setTouched(true);
                setName(event.currentTarget.value);
              }}
            />
          </div>
        </div>
      </SaveForm>
    </div>
  );
}
