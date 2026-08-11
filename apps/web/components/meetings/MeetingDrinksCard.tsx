"use client";

import type { MeetingKind } from "@prisma/client";
import { Card, Input, Label, Textarea } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveMeetingDrinksAction } from "@/app/actions/meetings";

/**
 * De drankkeuze en de prijs, gedeeld door de grocomeet en het bureau: het is
 * dezelfde koelkast. Eén regel per drankje houdt het bewerken triviaal.
 */
export function MeetingDrinksCard({
  nl,
  kind,
  items,
  priceCents,
}: {
  nl: boolean;
  kind: MeetingKind;
  items: string[];
  priceCents: number;
}) {
  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg font-semibold">{nl ? "Drankjes" : "Drinks"}</h2>
      <p className="mb-4 text-sm text-[#5c667f]">
        {nl
          ? "Eén drankje per regel. Deze lijst en prijs gelden voor de grocomeet én het bureau."
          : "One drink per line. This list and price apply to both the grocomeet and the bureau."}
      </p>
      <SaveForm
        action={saveMeetingDrinksAction}
        className="grid gap-4 sm:grid-cols-[1fr_8rem]"
        resetOnSuccess={false}
        submitLabel={nl ? "Drankjes opslaan" : "Save drinks"}
        savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
        savedMessage={nl ? "Drankjes opgeslagen" : "Drinks saved"}
        errorMessages={
          nl
            ? { NO_DRINKS: "Zet minstens één drankje in de lijst.", INVALID_PRICE: "Geef een geldige prijs op." }
            : { NO_DRINKS: "Put at least one drink in the list.", INVALID_PRICE: "Enter a valid price." }
        }
        fallbackErrorMessage={nl ? "Opslaan van de drankjes mislukt." : "Saving the drinks failed."}
      >
        <input type="hidden" name="kind" value={kind} />
        <div>
          <Label>{nl ? "Keuze" : "Choices"}</Label>
          <Textarea name="items" defaultValue={items.join("\n")} rows={items.length + 1} />
        </div>
        <div>
          <Label>{nl ? "Prijs €" : "Price €"}</Label>
          <Input name="price" defaultValue={(priceCents / 100).toFixed(2)} inputMode="decimal" />
        </div>
      </SaveForm>
    </Card>
  );
}
