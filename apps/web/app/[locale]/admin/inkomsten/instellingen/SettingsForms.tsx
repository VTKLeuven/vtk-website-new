"use client";

import { useRouter } from "next/navigation";
import { Input } from "@vtk/ui";
import { AccountingCodePicker } from "@/components/admin/AccountingCodePicker";
import { SearchPicker, type SearchPickerOption } from "@/components/admin/SearchPicker";
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

/** De code waaronder de kosten van Mollie vallen. */
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
 * Op wiens eigen rekening dit kanaal stort. Een gekozen post maakt dat alles
 * wat erop binnenkomt niet meetelt; leeg is een gedeeld kanaal.
 */
export function ChannelOwnerForm({
  locale,
  action,
  errorMessages,
  channelId,
  ownerGroupId,
  posts,
}: Common & { channelId: string; ownerGroupId: string | null; posts: SearchPickerOption[] }) {
  const nl = locale === "nl";
  const router = useRouter();
  const t = texts(nl);
  const options: SearchPickerOption[] = [{ value: "", label: nl ? "Niemand: gedeeld kanaal" : "Nobody: shared channel" }, ...posts];
  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Opslaan" : "Save"}
      submitVariant="ghost"
      submitSize="sm"
      savingLabel={t.saving}
      savedMessage={t.saved}
      errorMessages={errorMessages}
      fallbackErrorMessage={t.failed}
      resetOnSuccess={false}
      onSuccess={() => router.refresh()}
      className="flex flex-wrap items-end gap-2"
    >
      <input type="hidden" name="id" value={channelId} />
      <div className="text-sm">
        <span className="block text-xs text-vtk-muted">{nl ? "Stort op de eigen rekening van" : "Pays into the own account of"}</span>
        <div className="w-64">
          <SearchPicker
            options={options}
            name="ownerGroupId"
            defaultValue={ownerGroupId ?? ""}
            placeholder={nl ? "Niemand: gedeeld kanaal" : "Nobody: shared channel"}
            searchPlaceholder={nl ? "Zoek een post" : "Search a post"}
            ariaLabel={nl ? "Stort op de eigen rekening van" : "Pays into the own account of"}
            emptyText={(query) => (nl ? `Geen post met "${query}"` : `No post matching "${query}"`)}
          />
        </div>
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
