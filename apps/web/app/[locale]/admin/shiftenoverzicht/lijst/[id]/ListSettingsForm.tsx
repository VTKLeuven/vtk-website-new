"use client";

import { useState } from "react";
import { Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { formatCount, type ColorSetting, type SheetSetting } from "@/lib/praesidiumShifts/stats";
import { savePraesidiumShiftListSettingsAction } from "@/app/actions/praesidiumShifts";

const KIND_LABEL: Record<string, { nl: string; en: string }> = {
  SHIFTS: { nl: "shiften", en: "shifts" },
  SCHEDULE: { nl: "rooster", en: "schedule" },
  CONTACTS: { nl: "overzicht met nummers, telt niet", en: "overview with numbers, does not count" },
  EMPTY: { nl: "geen namen gevonden", en: "no names found" },
};

/**
 * Wat er op een lijst meetelt: welke tabbladen, welke kleur (op een lijst met
 * meerdere kringen telt enkel die van VTK), de richtlijn per praesidiumlid en
 * hoe een vakje telt.
 */
export function ListSettingsForm({
  locale,
  list,
  detectedOpen,
  errorMessages,
}: {
  locale: "nl" | "en";
  list: {
    id: string;
    kind: "EVENT" | "WEEKLY";
    name: string;
    eventDate: string | null;
    expectedPerMember: number | null;
    countMode: "PER_NAME" | "BY_DURATION";
    hoursPerShift: number;
    openSlots: number | null;
    sheets: SheetSetting[];
    colors: ColorSetting[];
  };
  detectedOpen: number | null;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const [mode, setMode] = useState(list.countMode);
  const shiftSheets = list.sheets.filter((s) => s.kind === "SHIFTS" || s.kind === "SCHEDULE");
  const otherSheets = list.sheets.filter((s) => s.kind !== "SHIFTS" && s.kind !== "SCHEDULE");

  return (
    <SaveForm
      action={savePraesidiumShiftListSettingsAction}
      submitLabel={nl ? "Instellingen opslaan" : "Save settings"}
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={nl ? "Instellingen opgeslagen." : "Settings saved."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Niet opgeslagen: er ging iets mis." : "Not saved: something went wrong."}
      resetOnSuccess={false}
      className="space-y-6"
    >
      <input type="hidden" name="listId" value={list.id} />
      <input type="hidden" name="locale" value={locale} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="ls-name">{nl ? "Naam" : "Name"}</Label>
          <Input id="ls-name" name="name" defaultValue={list.name} required maxLength={120} />
        </div>
        <div>
          <Label htmlFor="ls-date">{list.kind === "WEEKLY" ? (nl ? "Eerste dag" : "First day") : nl ? "Datum" : "Date"}</Label>
          <Input id="ls-date" name="eventDate" type="date" defaultValue={list.eventDate ?? ""} />
        </div>
        {list.kind === "EVENT" && (
          <>
            <div>
              <Label htmlFor="ls-expected">{nl ? "Richtlijn per praesidiumlid" : "Target per praesidium member"}</Label>
              <Input
                id="ls-expected"
                name="expectedPerMember"
                inputMode="decimal"
                defaultValue={list.expectedPerMember ?? ""}
                placeholder={nl ? "bv. 6" : "e.g. 6"}
              />
              <p className="mt-1 text-xs text-vtk-muted">
                {nl
                  ? "Hoeveel shiften elk praesidiumlid op deze lijst hoort op te nemen. Leeg als er geen richtlijn is."
                  : "How many shifts each praesidium member should take on this list. Empty if there is no target."}
              </p>
            </div>
            <div>
              <Label htmlFor="ls-open">{nl ? "Nog open voor VTK" : "Still open for VTK"}</Label>
              <Input
                id="ls-open"
                name="openSlots"
                inputMode="numeric"
                defaultValue={list.openSlots ?? ""}
                placeholder={detectedOpen !== null ? String(detectedOpen) : nl ? "onbekend" : "unknown"}
              />
              <p className="mt-1 text-xs text-vtk-muted">
                {detectedOpen !== null
                  ? nl
                    ? `Leeg laten neemt de ${detectedOpen} lege vakjes in de VTK-kleur over.`
                    : `Leaving it empty uses the ${detectedOpen} empty cells in the VTK colour.`
                  : nl
                    ? "De lege vakjes zeggen hier niets over VTK (geen aparte kleur); vul het aantal zelf in als je het weet."
                    : "The empty cells say nothing about VTK here (no separate colour); fill in the number if you know it."}
              </p>
            </div>
          </>
        )}
      </div>

      {list.kind === "EVENT" && (
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-vtk-muted">
            {nl ? "Hoe telt een vakje" : "How a cell counts"}
          </legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="countMode"
              value="PER_NAME"
              checked={mode === "PER_NAME"}
              onChange={() => setMode("PER_NAME")}
              className="mt-0.5 accent-vtk-ink"
            />
            <span>
              {nl ? "Elke naam is één shift" : "Every name is one shift"}
              <span className="block text-xs text-vtk-muted">
                {nl ? "Zoals bij een cantus: kort of lang, een vakje is een shift." : "As at a cantus: short or long, a cell is a shift."}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="countMode"
              value="BY_DURATION"
              checked={mode === "BY_DURATION"}
              onChange={() => setMode("BY_DURATION")}
              className="mt-0.5 accent-vtk-ink"
            />
            <span className="flex flex-wrap items-center gap-x-2">
              {nl ? "Naar duur: een shift is" : "By duration: a shift is"}
              <Input
                name="hoursPerShift"
                inputMode="decimal"
                defaultValue={formatCount(list.hoursPerShift, locale)}
                className="h-8 w-16! py-1 text-center"
                aria-label={nl ? "Uren per shift" : "Hours per shift"}
                disabled={mode !== "BY_DURATION"}
              />
              {nl ? "uur" : "hours"}
              <span className="block w-full text-xs text-vtk-muted">
                {nl
                  ? "Zoals bij 24UL: een vakje van een uur telt dan voor een halve shift. Vakjes tot \"einde\" tellen als één shift."
                  : "As at 24UL: a cell of one hour then counts as half a shift. Cells until \"end\" count as one shift."}
              </span>
            </span>
          </label>
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-vtk-muted">
          {nl ? "Tabbladen die meetellen" : "Tabs that count"}
        </legend>
        <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {shiftSheets.map((sheet) => (
            <label key={sheet.name} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="sheet" value={sheet.name} defaultChecked={sheet.counted} className="mt-0.5 size-4 accent-vtk-ink" />
              <span>
                {sheet.name}
                <span className="ml-1.5 text-xs text-vtk-muted">
                  {sheet.names} {nl ? (sheet.names === 1 ? "naam" : "namen") : sheet.names === 1 ? "name" : "names"}
                </span>
              </span>
            </label>
          ))}
        </div>
        {otherSheets.length > 0 && (
          <p className="text-xs text-vtk-muted">
            {nl ? "Niet als shiften gelezen: " : "Not read as shifts: "}
            {otherSheets.map((s) => `${s.name} (${nl ? KIND_LABEL[s.kind]?.nl : KIND_LABEL[s.kind]?.en})`).join(", ")}
          </p>
        )}
      </fieldset>

      {list.kind === "EVENT" && list.colors.length > 0 && (
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-vtk-muted">
            {nl ? "Kleuren die meetellen" : "Colours that count"}
          </legend>
          <p className="text-xs text-vtk-muted">
            {nl
              ? "De vulkleur van de vakjes met een naam. Op een lijst met meerdere kringen laat je enkel de kleur van VTK aan; namen in de andere kleuren worden dan niet gekoppeld."
              : "The fill colour of the cells with a name. On a list shared with other associations, keep only the VTK colour on; names in other colours are then not linked."}
          </p>
          <div className="space-y-1.5">
            {list.colors.map((color) => (
              <label key={color.color ?? "none"} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  name="color"
                  value={color.color ?? "none"}
                  defaultChecked={color.counted}
                  className="mt-0.5 size-4 accent-vtk-ink"
                />
                <span
                  aria-hidden
                  className="mt-0.5 inline-block size-4 shrink-0 rounded border border-vtk-blue/20"
                  style={{ background: color.color ? `#${color.color}` : "transparent" }}
                />
                <span>
                  {color.color ? (color.color === "FFFFFF" ? (nl ? "Wit" : "White") : `#${color.color}`) : nl ? "Geen kleur" : "No colour"}
                  <span className="ml-1.5 text-xs text-vtk-muted">
                    {color.names} {nl ? (color.names === 1 ? "naam" : "namen") : color.names === 1 ? "name" : "names"}: {color.samples.join(", ")}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}
    </SaveForm>
  );
}
