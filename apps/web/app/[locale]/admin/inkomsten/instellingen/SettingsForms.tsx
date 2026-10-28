"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@vtk/ui";
import { AccountingCodePicker } from "@/components/admin/AccountingCodePicker";
import { SaveForm } from "@/components/ui/SaveForm";
import type { AccountingCodeOption } from "@/lib/accounting/codes";
import type { SaveAction } from "@/lib/saveState";

type Common = { locale: "nl" | "en"; action: SaveAction; errorMessages: Record<string, string> };

function texts(nl: boolean) {
  return {
    saving: nl ? "Bezig met opslaan..." : "Saving...",
    saved: nl ? "Opgeslagen." : "Saved.",
    failed: nl ? "Opslaan mislukt." : "Could not save.",
  };
}

/** De code waaronder de kosten van Mollie, SumUp en Europabank vallen. */
export function FeeCodeForm({ locale, action, errorMessages, codes, value }: Common & { codes: AccountingCodeOption[]; value: string | null }) {
  const nl = locale === "nl";
  const router = useRouter();
  const t = texts(nl);
  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Kostencode opslaan" : "Save fee code"}
      savingLabel={t.saving}
      savedMessage={t.saved}
      errorMessages={errorMessages}
      fallbackErrorMessage={t.failed}
      resetOnSuccess={false}
      onSuccess={() => router.refresh()}
      className="space-y-3"
    >
      <div className="max-w-md">
        <AccountingCodePicker
          codes={codes}
          name="feeAccountingCodeId"
          defaultValue={value}
          locale={locale}
          noneLabel={nl ? "Nog geen code" : "No code yet"}
        />
      </div>
    </SaveForm>
  );
}

/** Een eigen naam voor een kanaal, voor het overzicht. */
export function ChannelLabelForm({ locale, action, errorMessages, channelId, label, placeholder }: Common & { channelId: string; label: string | null; placeholder: string }) {
  const nl = locale === "nl";
  const router = useRouter();
  const t = texts(nl);
  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Naam opslaan" : "Save name"}
      submitVariant="ghost"
      submitSize="sm"
      savingLabel={t.saving}
      savedMessage={t.saved}
      errorMessages={errorMessages}
      fallbackErrorMessage={t.failed}
      resetOnSuccess={false}
      onSuccess={() => router.refresh()}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="id" value={channelId} />
      <Input
        name="label"
        defaultValue={label ?? ""}
        placeholder={placeholder}
        aria-label={nl ? "Eigen naam" : "Own name"}
        className="w-56"
        maxLength={80}
      />
    </SaveForm>
  );
}

/**
 * Vanaf een dag een standaardcode voor dit kanaal, of geen: wat erop binnenkomt
 * en geen andere regel koppelt, krijgt de code die op die dag gold.
 */
export function ChannelCodeForm({
  locale,
  action,
  errorMessages,
  channelId,
  codes,
}: Common & { channelId: string; codes: AccountingCodeOption[] }) {
  const nl = locale === "nl";
  const router = useRouter();
  const t = texts(nl);
  const pickerId = useId();
  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Code toevoegen" : "Add code"}
      submitVariant="ghost"
      submitSize="sm"
      savingLabel={t.saving}
      savedMessage={nl ? "Code toegevoegd." : "Code added."}
      errorMessages={errorMessages}
      fallbackErrorMessage={t.failed}
      onSuccess={() => router.refresh()}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="channelId" value={channelId} />
      <label className="text-sm">
        <span className="block text-xs text-vtk-muted">{nl ? "Vanaf" : "From"}</span>
        <Input type="date" name="from" required className="w-40" />
      </label>
      <div className="w-full max-w-sm text-sm">
        <label htmlFor={pickerId} className="block text-xs text-vtk-muted">
          {nl ? "Standaardcode" : "Default code"}
        </label>
        <AccountingCodePicker
          id={pickerId}
          codes={codes}
          name="accountingCodeId"
          locale={locale}
          noneLabel={nl ? "Geen: naar Na te kijken" : "None: to To review"}
        />
      </div>
    </SaveForm>
  );
}

/** Vanaf een dag stort dit kanaal op een andere rekening. */
export function ChannelAccountForm({ locale, action, errorMessages, channelId }: Common & { channelId: string }) {
  const nl = locale === "nl";
  const router = useRouter();
  const t = texts(nl);
  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Rekening toevoegen" : "Add account"}
      submitVariant="ghost"
      submitSize="sm"
      savingLabel={t.saving}
      savedMessage={nl ? "Rekening toegevoegd." : "Account added."}
      errorMessages={errorMessages}
      fallbackErrorMessage={t.failed}
      onSuccess={() => router.refresh()}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="channelId" value={channelId} />
      <label className="text-sm">
        <span className="block text-xs text-vtk-muted">{nl ? "Vanaf" : "From"}</span>
        <Input type="date" name="from" required className="w-40" />
      </label>
      <label className="text-sm">
        <span className="block text-xs text-vtk-muted">{nl ? "Rekening" : "Account"}</span>
        <Input name="bankAccount" required placeholder="BE00 0000 0000 0000" className="w-56" maxLength={60} />
      </label>
    </SaveForm>
  );
}
