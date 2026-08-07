"use client";

import { Card, Input, Label } from "@vtk/ui";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { deletePianoClosureAction, savePianoClosureAction } from "@/app/actions/piano";

export type ClosureRow = {
  id: string;
  reasonNl: string;
  reasonEn: string;
  /** Serverzijdig geformatteerd, bv. "24 dec 2026 tot 4 jan 2027". */
  periodLabel: string;
};

/**
 * Sluitingsdagen: de dagen waarop er niets te reserveren valt, ook al loopt er
 * een venster over. In de praktijk de sluitingsdagen van de KU Leuven, of de
 * piano die in herstelling is.
 */
export function PianoClosuresManager({
  locale,
  closures,
}: {
  locale: Locale;
  closures: ClosureRow[];
}) {
  const nl = locale === "nl";
  const dict = getDictionary(locale);

  const errorMessages = nl
    ? {
        reasonRequired: "Geef een reden op (NL).",
        dateInvalid: "Vul een geldige datum in.",
        dateOrder: "De einddatum ligt voor de startdatum.",
      }
    : {
        reasonRequired: "Give a reason (NL).",
        dateInvalid: "Fill in a valid date.",
        dateOrder: "The end date is before the start date.",
      };

  return (
    <div className="space-y-6">
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">{nl ? "Sluitingsdag toevoegen" : "Add closure"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Reservaties die al in deze periode stonden, worden mee geschrapt: het slot bestaat dan niet meer. Verwittig die leden zelf."
            : "Reservations already inside this period are removed along with it: the slot no longer exists. Notify those members yourself."}
        </p>

        <SaveForm
          action={savePianoClosureAction}
          className="space-y-4"
          submitLabel={nl ? "Sluitingsdag toevoegen" : "Add closure"}
          savingLabel={dict.common.saving}
          savedMessage={nl ? "Sluitingsdag toegevoegd" : "Closure added"}
          errorMessages={errorMessages}
          fallbackErrorMessage={dict.common.saveError}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="closure-start">{nl ? "Van" : "From"}</Label>
              <Input id="closure-start" name="startDate" type="date" required />
            </div>
            <div>
              <Label htmlFor="closure-end">{nl ? "Tot en met" : "Until (inclusive)"}</Label>
              <Input id="closure-end" name="endDate" type="date" />
              <p className="mt-1 text-xs text-[#5c667f]">
                {nl ? "Leeg = één dag." : "Empty = a single day."}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="closure-reason-nl">{nl ? "Reden (NL)" : "Reason (NL)"}</Label>
              <Input id="closure-reason-nl" name="reasonNl" required />
            </div>
            <div>
              <Label htmlFor="closure-reason-en">{nl ? "Reden (EN)" : "Reason (EN)"}</Label>
              <Input id="closure-reason-en" name="reasonEn" />
            </div>
          </div>
        </SaveForm>
      </Card>

      <Card className="p-5">
        <h2 className="mb-4 font-semibold">{nl ? "Sluitingsdagen" : "Closures"}</h2>
        {closures.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {nl ? "Er staan geen sluitingsdagen ingepland." : "No closures are scheduled."}
          </p>
        ) : (
          <ul className="divide-y divide-vtk-blue/10">
            {closures.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-vtk-ink">
                    {nl ? row.reasonNl : row.reasonEn || row.reasonNl}
                  </span>
                  <span className="block text-xs text-[#5c667f]">{row.periodLabel}</span>
                </span>

                <DeleteIconButton
                  action={deletePianoClosureAction}
                  fields={{ id: row.id }}
                  label={nl ? "Verwijderen" : "Delete"}
                  srLabel={`${nl ? "Verwijderen" : "Delete"}: ${row.reasonNl}`}
                  title={nl ? "Sluitingsdag verwijderen?" : "Delete closure?"}
                  description={
                    nl
                      ? `De uren in "${row.periodLabel}" komen weer vrij om te reserveren. Reservaties die bij het aanmaken geschrapt werden, komen niet terug.`
                      : `The hours in "${row.periodLabel}" become bookable again. Reservations removed when it was created do not come back.`
                  }
                  confirmLabel={nl ? "Verwijderen" : "Delete"}
                  cancelLabel={nl ? "Annuleren" : "Cancel"}
                  successMessage={nl ? "Sluitingsdag verwijderd" : "Closure deleted"}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
