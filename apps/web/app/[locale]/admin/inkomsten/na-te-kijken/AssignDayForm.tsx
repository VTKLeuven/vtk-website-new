"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { Label, Select } from "@vtk/ui";
import { AccountingCodePicker } from "@/components/admin/AccountingCodePicker";
import { SaveForm } from "@/components/ui/SaveForm";
import type { AccountingCodeOption } from "@/lib/accounting/codes";
import type { SaveAction } from "@/lib/saveState";

export type DayChannelOption = { id: string; label: string };

/**
 * Een hele dag van een kanaal met de hand een code geven, ook wat de
 * standaardcode van het kanaal al kreeg. "Terug naar de regels" draait dat
 * terug voor die dag.
 */
export function AssignDayForm({
  channels,
  codes,
  locale,
  action,
  errorMessages,
}: {
  channels: DayChannelOption[];
  codes: AccountingCodeOption[];
  locale: "nl" | "en";
  action: SaveAction;
  errorMessages: Record<string, string>;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const uid = useId();
  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Toewijzen" : "Assign"}
      submitSize="sm"
      savingLabel={nl ? "Bezig..." : "Saving..."}
      savedMessage={nl ? "Toegewezen." : "Assigned."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Toewijzen mislukt." : "Could not assign."}
      secondarySubmit={{
        name: "intent",
        value: "reset",
        label: nl ? "Terug naar de regels" : "Back to the rules",
        confirm: {
          title: nl ? "Die dag terug aan de koppelregels geven?" : "Give that day back to the matching rules?",
          description: nl
            ? "Wat er die dag op dit kanaal met de hand een code kreeg, hier of bij Na te kijken, verliest die code. De koppelregels nemen het weer over: meestal de standaardcode van het kanaal, en anders staat het opnieuw bij Na te kijken. Andere dagen en andere kanalen blijven zoals ze zijn."
            : "What got a code by hand on this channel that day, here or under To review, loses it. The matching rules take over again: usually the channel's default code, otherwise it is back under To review. Other days and channels stay as they are.",
          confirmLabel: nl ? "Terugzetten" : "Reset",
          cancelLabel: nl ? "Annuleren" : "Cancel",
        },
      }}
      resetOnSuccess={false}
      onSuccess={() => router.refresh()}
      className="flex flex-wrap items-end gap-3"
    >
      <div className="w-56">
        <Label htmlFor={`${uid}-channel`}>{nl ? "Kanaal" : "Channel"}</Label>
        <Select id={`${uid}-channel`} name="channelId" required defaultValue="">
          <option value="" disabled>
            {nl ? "Kies een kanaal" : "Choose a channel"}
          </option>
          {channels.map((channel) => (
            <option key={channel.id} value={channel.id}>
              {channel.label}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={`${uid}-day`}>{nl ? "Dag" : "Day"}</Label>
        <input
          id={`${uid}-day`}
          type="date"
          name="day"
          required
          className="block rounded-lg border border-vtk-blue/15 px-2 py-1.5 text-sm"
        />
      </div>
      <div className="min-w-[16rem] flex-1">
        <Label htmlFor={`${uid}-code`}>{nl ? "Boekhoudcode" : "Accounting code"}</Label>
        <AccountingCodePicker id={`${uid}-code`} codes={codes} name="accountingCodeId" locale={locale} />
      </div>
    </SaveForm>
  );
}
