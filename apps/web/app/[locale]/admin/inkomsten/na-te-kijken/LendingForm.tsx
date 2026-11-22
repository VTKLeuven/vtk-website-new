"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Input, Label, Select } from "@vtk/ui";
import { AccountingCodePicker } from "@/components/admin/AccountingCodePicker";
import { SaveForm } from "@/components/ui/SaveForm";
import type { AccountingCodeOption } from "@/lib/accounting/codes";
import type { SaveAction } from "@/lib/saveState";

export type LendingChannelOption = { id: string; label: string };

export type LendingDefaults = { id: string; channelId: string; from: string; to: string; accountingCodeId: string | null };

/**
 * Een toestel voor een of meer dagen uitlenen: nieuw (zonder `lending`) of een
 * bestaande uitlening aanpassen (in de modal van de lijst).
 */
export function LendingForm({
  channels,
  codes,
  locale,
  action,
  errorMessages,
  lending,
  onSaved,
}: {
  channels: LendingChannelOption[];
  codes: AccountingCodeOption[];
  locale: "nl" | "en";
  action: SaveAction;
  errorMessages: Record<string, string>;
  lending?: LendingDefaults;
  /** Na een geslaagde opslag; de modal sluit zich zo. */
  onSaved?: () => void;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const uid = useId();
  // Na een nieuwe uitlening een vers formulier: de codekiezer houdt zijn
  // waarde in zijn eigen state, en een `reset()` van het formulier liet die
  // staan. Een nieuwe `key` tekent alles leeg.
  const [round, setRound] = useState(0);
  return (
    <SaveForm
      key={round}
      action={action}
      submitLabel={lending ? (nl ? "Opslaan" : "Save") : nl ? "Uitlenen" : "Lend out"}
      submitSize="sm"
      savingLabel={nl ? "Bezig met koppelen..." : "Matching..."}
      savedMessage={nl ? "Opgeslagen." : "Saved."}
      errorMessages={errorMessages}
      fallbackErrorMessage={nl ? "Opslaan mislukt." : "Could not save."}
      resetOnSuccess={false}
      onSuccess={() => {
        if (!lending) setRound((current) => current + 1);
        router.refresh();
        onSaved?.();
      }}
      className="flex flex-wrap items-end gap-3"
    >
      {lending ? <input type="hidden" name="id" value={lending.id} /> : null}
      <div className="w-60">
        <Label htmlFor={`${uid}-channel`}>{nl ? "Kanaal" : "Channel"}</Label>
        <Select id={`${uid}-channel`} name="channelId" required defaultValue={lending?.channelId ?? ""}>
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
        <Label htmlFor={`${uid}-from`}>{nl ? "Eerste dag" : "First day"}</Label>
        <Input id={`${uid}-from`} type="date" name="fromDay" required defaultValue={lending?.from ?? ""} className="w-auto" />
      </div>
      <div>
        <Label htmlFor={`${uid}-to`}>{nl ? "Laatste dag" : "Last day"}</Label>
        <Input
          id={`${uid}-to`}
          type="date"
          name="toDay"
          defaultValue={lending?.to ?? ""}
          aria-describedby={`${uid}-to-hint`}
          className="w-auto"
        />
        <span id={`${uid}-to-hint`} className="sr-only">
          {nl ? "Leeg: enkel de eerste dag." : "Empty: only the first day."}
        </span>
      </div>
      <div className="min-w-[16rem] flex-1">
        <Label htmlFor={`${uid}-code`}>{nl ? "Boekhoudcode" : "Accounting code"}</Label>
        <AccountingCodePicker
          id={`${uid}-code`}
          codes={codes}
          name="accountingCodeId"
          locale={locale}
          required
          defaultValue={lending?.accountingCodeId ?? null}
        />
      </div>
    </SaveForm>
  );
}
