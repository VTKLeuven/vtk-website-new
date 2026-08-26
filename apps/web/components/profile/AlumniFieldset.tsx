"use client";

import { useState } from "react";
import { CheckboxChip } from "./StudyFieldset";

/**
 * De alumni-velden in het studieformulier.
 *
 * Client-component omdat de drie vervolgvragen (afstudeerjaar, ooit in VTK,
 * mail-opt-in) pas zin hebben zodra "ik ben alumnus" aanstaat. Ze altijd tonen
 * zou het formulier voor elke eerstejaars drie vragen langer maken die hem niets
 * zeggen; ze in een `<details>` stoppen verbergt precies de vraag waar het bij
 * alumni om draait.
 *
 * De labels komen als props binnen zodat de volledige i18n-dictionary niet in de
 * clientbundel belandt.
 */
export function AlumniFieldset({
  alumni,
  graduationYear,
  wasInVtk,
  alumniMailOptIn,
  labels,
}: {
  alumni: boolean;
  graduationYear: number | null;
  wasInVtk: boolean;
  alumniMailOptIn: boolean;
  labels: {
    alumni: string;
    alumniHint: string;
    graduationYear: string;
    graduationYearHint: string;
    wasInVtk: string;
    wasInVtkHint: string;
    mailOptIn: string;
    mailOptInHint: string;
  };
}) {
  const [checked, setChecked] = useState(alumni);

  return (
    <div>
      <label className="inline-flex items-center gap-2 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/30 px-3 py-2 text-sm">
        <input
          type="checkbox"
          name="alumni"
          value="on"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
          className="shrink-0"
        />
        <span className="min-w-0 break-words">{labels.alumni}</span>
      </label>
      <p className="mt-1 text-xs text-[#5c667f]">{labels.alumniHint}</p>

      {checked && (
        <div className="mt-3 space-y-3 border-l-2 border-vtk-blue/15 pl-4">
          <div>
            <label
              htmlFor="graduationYear"
              className="block text-sm font-medium text-vtk-ink"
            >
              {labels.graduationYear}
            </label>
            {/* Geen `type="number"`: een spinner op een jaartal is op een
                telefoon onbruikbaar en scrollt per ongeluk mee. */}
            <input
              id="graduationYear"
              name="graduationYear"
              inputMode="numeric"
              pattern="[0-9]{4}"
              maxLength={4}
              defaultValue={graduationYear ?? ""}
              placeholder="2019"
              className="mt-1 w-32 rounded-xl border border-vtk-blue/15 bg-white px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-[#5c667f]">{labels.graduationYearHint}</p>
          </div>

          <div>
            <CheckboxChip
              name="wasInVtk"
              value="on"
              defaultChecked={wasInVtk}
              label={labels.wasInVtk}
            />
            <p className="mt-1 text-xs text-[#5c667f]">{labels.wasInVtkHint}</p>
          </div>

          <div>
            <CheckboxChip
              name="alumniMailOptIn"
              value="on"
              defaultChecked={alumniMailOptIn}
              label={labels.mailOptIn}
            />
            <p className="mt-1 text-xs text-[#5c667f]">{labels.mailOptInHint}</p>
          </div>
        </div>
      )}
    </div>
  );
}
