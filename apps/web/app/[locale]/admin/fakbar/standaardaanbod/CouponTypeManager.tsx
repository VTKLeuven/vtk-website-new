"use client";

import { useState } from "react";
import { Button, Input } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { IconButton } from "@/components/ui/IconButton";
import { TrashIcon } from "@/components/ui/icons";
import { saveFakbarCouponTypesAction } from "@/app/actions/fakbar-shift";

export type CouponRow = { id: string; name: string; valueEuro: string };

/**
 * Beheert de bontypes waarmee aan de toog betaald kan worden. Ze verschijnen als
 * telveld bij het afsluiten van een shift, met hun waarde erbij.
 *
 * Een bon uit de lijst halen deactiveert ze; ze verdwijnt uit nieuwe shiften maar
 * blijft in de tellingen van oude staan. Daarom is dit, anders dan bij het
 * aanbod, geen onomkeerbare actie en volstaat de opslaan-knop als bevestiging.
 */
export function CouponTypeManager({ nl, initial }: { nl: boolean; initial: CouponRow[] }) {
  const [rows, setRows] = useState<CouponRow[]>(initial);

  return (
    <SaveForm
      action={saveFakbarCouponTypesAction}
      className="space-y-3"
      submitLabel={nl ? "Bonnen opslaan" : "Save coupons"}
      savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
      savedMessage={nl ? "Bonnen opgeslagen" : "Coupons saved"}
      errorMessages={{
        INVALID_PRICE: nl
          ? "Een waarde is leeg of geen geldig bedrag. Schrijf ze als 1,55."
          : "A value is empty or not a valid amount. Write it as 1.55.",
      }}
      fallbackErrorMessage={nl ? "Opslaan van de bonnen mislukt." : "Saving the coupons failed."}
    >
      <input type="hidden" name="couponCount" value={rows.length} />

      {rows.length > 0 && (
        <div className="hidden gap-2 text-xs font-semibold uppercase tracking-wide text-[#5c667f] sm:grid sm:grid-cols-[minmax(8rem,1fr)_8rem_2rem]">
          <span>{nl ? "Naam" : "Name"}</span>
          <span>{nl ? "Waarde" : "Value"}</span>
          <span />
        </div>
      )}

      {rows.map((row, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[minmax(8rem,1fr)_8rem_2rem] sm:items-center">
          <input type="hidden" name={`coupon-${i}-id`} value={row.id} />
          <Input
            name={`coupon-${i}-name`}
            value={row.name}
            onChange={(e) =>
              setRows((current) =>
                current.map((r, idx) => (idx === i ? { ...r, name: e.target.value } : r)),
              )
            }
            placeholder={nl ? "Naam" : "Name"}
            required
          />
          <Input
            name={`coupon-${i}-value`}
            value={row.valueEuro}
            onChange={(e) =>
              setRows((current) =>
                current.map((r, idx) => (idx === i ? { ...r, valueEuro: e.target.value } : r)),
              )
            }
            inputMode="decimal"
            aria-label={nl ? "Waarde" : "Value"}
          />
          <IconButton
            label={nl ? "Uit de lijst halen" : "Remove from the list"}
            srLabel={
              nl
                ? `Uit de lijst halen: ${row.name || "nieuwe bon"}`
                : `Remove from the list: ${row.name || "new coupon"}`
            }
            tone="danger"
            onClick={() => setRows((current) => current.filter((_, idx) => idx !== i))}
          >
            <TrashIcon />
          </IconButton>
        </div>
      ))}

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setRows((current) => [...current, { id: "", name: "", valueEuro: "1.50" }])}
      >
        + {nl ? "Bon toevoegen" : "Add coupon"}
      </Button>
    </SaveForm>
  );
}
