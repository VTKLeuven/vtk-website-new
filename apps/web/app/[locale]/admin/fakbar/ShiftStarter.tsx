"use client";

import { useState } from "react";
import { Button } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { openFakbarShiftAction } from "@/app/actions/fakbar-shift";
import { emptyCashCount, type CashCount } from "@/lib/fakbar-cash";
import { CashCountGrid } from "./CashCountGrid";

/**
 * "Shift starten": één knop die het telraster openklapt. De shift bestaat pas
 * wanneer de beginstand van de kassa geteld is, want zonder die nulmeting valt
 * de cash-omzet achteraf niet te berekenen.
 */
export function ShiftStarter({ nl }: { nl: boolean }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState<CashCount>(emptyCashCount);

  if (!open) {
    return (
      <div>
        <Button type="button" onClick={() => setOpen(true)}>
          {nl ? "Shift starten" : "Start shift"}
        </Button>
        <p className="mt-2 text-sm text-[#5c667f]">
          {nl
            ? "Je telt eerst de kassa; daarna staat de shift open."
            : "You count the register first; the shift opens after that."}
        </p>
      </div>
    );
  }

  return (
    <SaveForm
      action={openFakbarShiftAction}
      className="space-y-4"
      submitLabel={nl ? "Shift starten" : "Start shift"}
      savingLabel={nl ? "Bezig..." : "Working..."}
      savedMessage={nl ? "Shift gestart" : "Shift started"}
      errorMessages={{
        ALREADY_OPEN: nl
          ? "Er staat al een shift open. Herlaad de pagina; iemand anders was je net voor."
          : "A shift is already open. Reload the page; someone else just beat you to it.",
        INVALID_COUNT: nl
          ? "Een aantal is geen geheel getal van 0 of meer."
          : "One of the counts is not a whole number of 0 or more.",
      }}
      fallbackErrorMessage={nl ? "Starten van de shift mislukt." : "Starting the shift failed."}
    >
      <div>
        <h3 className="text-sm font-semibold text-vtk-ink">
          {nl ? "Kassa bij het begin" : "Register at the start"}
        </h3>
        <p className="mt-1 text-sm text-[#5c667f]">
          {nl
            ? "Tel wat er in de lade zit voor je begint."
            : "Count what is in the drawer before you start."}
        </p>
      </div>

      <CashCountGrid
        prefix="start"
        nl={nl}
        count={count}
        onChange={setCount}
        label={nl ? "Beginstand" : "Starting total"}
      />
    </SaveForm>
  );
}
