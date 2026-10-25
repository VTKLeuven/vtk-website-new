"use client";

import { Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { FileField } from "@/components/ui/FileField";
import { uploadUrenloopLapsAction } from "@/app/actions/urenloop";

/**
 * `laps.csv` opladen. Het jaar staat in het bestand zelf (`event_year`), dus er
 * valt niets te kiezen; de toast zegt achteraf welk jaar het werd.
 */
export function UrenloopLapsUploadForm({ locale }: { locale: "nl" | "en" }) {
  const nl = locale === "nl";
  return (
    <SaveForm
      action={uploadUrenloopLapsAction}
      submitLabel={nl ? "Rondes opladen" : "Upload laps"}
      savingLabel={nl ? "Bezig met inlezen..." : "Reading..."}
      savedMessage={nl ? "Rondes opgeladen." : "Laps uploaded."}
      errorMessages={
        nl
          ? {
              NO_FILE: "Kies eerst laps.csv.",
              ZIP_FILE:
                "Dit is de zip van de export. Pak ze uit en kies enkel laps.csv: de rest (telefoonnummers, mails, belnotities) hoort niet op de site.",
              FILE_TOO_LARGE: "Dit bestand is groter dan 5 MB; dat is geen laps.csv.",
              EMPTY_FILE: "Het bestand bevat geen enkele ronde.",
              NOT_LAPS_CSV:
                "Dit is geen laps.csv: de kolommen event_year, lap_sequence, runner_id, r_number, lap_start_utc, lap_end_utc en lap_time_seconds ontbreken.",
              MIXED_YEARS: "Het bestand bevat rondes van meer dan één jaar; laad elk jaar apart op.",
              DUPLICATE_LAP: "Dezelfde ploegronde (lap_sequence) staat er twee keer in.",
            }
          : {
              NO_FILE: "Choose laps.csv first.",
              ZIP_FILE:
                "This is the zip of the export. Unzip it and choose only laps.csv: the rest (phone numbers, emails, call notes) does not belong on the site.",
              FILE_TOO_LARGE: "This file is larger than 5 MB; that is not laps.csv.",
              EMPTY_FILE: "The file contains no laps.",
              NOT_LAPS_CSV:
                "This is not laps.csv: the columns event_year, lap_sequence, runner_id, r_number, lap_start_utc, lap_end_utc and lap_time_seconds are missing.",
              MIXED_YEARS: "The file holds laps from more than one year; upload each year separately.",
              DUPLICATE_LAP: "The same team lap (lap_sequence) appears twice.",
            }
      }
      fallbackErrorMessage={
        nl ? "Niet opgeladen: het bestand kon niet ingelezen worden." : "Not uploaded: the file could not be read."
      }
      className="space-y-4"
    >
      <input type="hidden" name="locale" value={locale} />
      <div className="space-y-1.5">
        <Label>{nl ? "laps.csv uit de export" : "laps.csv from the export"}</Label>
        <FileField
          name="file"
          accept=".csv,text/csv"
          required
          locale={locale}
          hint={
            nl
              ? "Een nieuwe upload van hetzelfde jaar vervangt alle rondes van dat jaar; andere jaren blijven staan."
              : "A new upload for the same year replaces all laps of that year; other years stay."
          }
        />
      </div>
    </SaveForm>
  );
}
