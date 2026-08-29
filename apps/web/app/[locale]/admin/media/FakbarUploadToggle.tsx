"use client";

import { SaveForm } from "@/components/ui/SaveForm";
import { setFakbarUploadEnabledAction } from "@/app/actions/media";

/**
 * Geeft het uploaden naar de fotogalerij van 't ElixIr vrij.
 *
 * Staat standaard uit. De fakbar heeft bewust een eigen galerij met een lagere
 * lat dan vtk.be; een bestemmingskeuze die er altijd staat, is een keuze die
 * ooit verkeerd gaat en dan staat er een fakbaravond op de hoofdsite of
 * omgekeerd. Wie het toch nodig heeft, zet het hier bewust aan.
 */
export function FakbarUploadToggle({
  locale,
  enabled,
}: {
  locale: "nl" | "en";
  enabled: boolean;
}) {
  const nl = locale === "nl";

  return (
    <div className="mb-4 rounded-xl border border-vtk-blue/12 bg-vtk-blue-soft/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-vtk-ink">
            {nl ? "Uploaden naar de fakbargalerij" : "Uploading to the fakbar gallery"}
          </p>
          <p className="mt-1 max-w-[62ch] text-sm text-[#5c667f]">
            {nl
              ? "'t ElixIr heeft een eigen fotogalerij op fakbar.vtk.be, met eigen albums die niet op deze site komen. Zet dit aan om vanaf hier ook daarheen te kunnen uploaden; je kiest dan per album waar het naartoe gaat."
              : "'t ElixIr has its own photo gallery on fakbar.vtk.be, with its own albums that never appear on this site. Switch this on to upload there from here as well; you then pick the destination per album."}
          </p>
          <p className="mt-1.5 text-xs text-[#5c667f]">
            {nl ? "Staat nu " : "Currently "}
            <strong className="text-vtk-ink">{enabled ? (nl ? "aan" : "on") : nl ? "uit" : "off"}</strong>
            {nl ? "." : "."}
          </p>
        </div>

        <SaveForm
          action={setFakbarUploadEnabledAction}
          submitLabel={enabled ? (nl ? "Uitzetten" : "Switch off") : nl ? "Aanzetten" : "Switch on"}
          savingLabel={nl ? "Bezig…" : "Saving…"}
          fallbackErrorMessage={
            nl ? "De instelling kon niet opgeslagen worden." : "The setting could not be saved."
          }
          savedMessage={
            enabled
              ? nl
                ? "Uploaden naar de fakbargalerij staat nu uit."
                : "Uploading to the fakbar gallery is now off."
              : nl
                ? "Uploaden naar de fakbargalerij staat nu aan."
                : "Uploading to the fakbar gallery is now on."
          }
        >
          <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
        </SaveForm>
      </div>
    </div>
  );
}
