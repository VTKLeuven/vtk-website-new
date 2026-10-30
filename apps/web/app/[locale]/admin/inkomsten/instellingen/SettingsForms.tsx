"use client";

import { useId } from "react";
import { useRouter } from "next/navigation";
import { Input, Select } from "@vtk/ui";
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

/**
 * De dag waarop een rekening of standaardcode ingaat. De eerste mag leeg
 * blijven, dan geldt ze vanaf het begin: ook voor de maanden die al opgeladen
 * zijn. Een wissel vraagt een dag, anders zou ze stil de eerste vervangen.
 */
function FromField({ nl, first }: { nl: boolean; first: boolean }) {
  return (
    <label className="text-sm">
      <span className="block text-xs text-vtk-muted">
        {first ? (nl ? "Vanaf (leeg: vanaf het begin)" : "From (empty: from the start)") : nl ? "Wisselt vanaf" : "Changes from"}
      </span>
      <Input type="date" name="from" required={!first} className="w-40" />
    </label>
  );
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

/**
 * De basisinstellingen van één kanaal in één formulier: rekening, standaardcode,
 * gekoppeld kassatoestel en eigen naam, met één Opslaan-knop.
 */
export function ChannelBasicsForm({
  locale,
  action,
  errorMessages,
  channelId,
  isMollie,
  label,
  identifier,
  bankAccount,
  accountingCodeId,
  codes,
  device,
  deviceOptions,
}: Common & {
  channelId: string;
  isMollie: boolean;
  label: string | null;
  identifier: string;
  bankAccount: string | null;
  accountingCodeId: string | null;
  codes: AccountingCodeOption[];
  device: string;
  deviceOptions: Array<{ value: string; label: string }>;
}) {
  const nl = locale === "nl";
  const router = useRouter();
  const t = texts(nl);
  const uid = useId();
  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Kanaal opslaan" : "Save channel"}
      submitSize="sm"
      savingLabel={t.saving}
      savedMessage={t.saved}
      errorMessages={errorMessages}
      fallbackErrorMessage={t.failed}
      resetOnSuccess={false}
      onSuccess={() => router.refresh()}
      className="space-y-3"
    >
      <input type="hidden" name="id" value={channelId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-vtk-muted">{nl ? "Bankrekening" : "Bank account"}</span>
          <Input
            name="bankAccount"
            required
            defaultValue={bankAccount ?? ""}
            placeholder="BE00 0000 0000 0000"
            className="w-full tabular-nums"
            maxLength={60}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-xs font-medium text-vtk-muted">
            {nl ? "Eigen naam (optioneel)" : "Display name (optional)"}
          </span>
          <Input
            name="label"
            defaultValue={label ?? ""}
            placeholder={identifier}
            className="w-full"
            maxLength={80}
          />
        </label>
        {!isMollie ? (
          <>
            <div className="text-sm">
              <label htmlFor={`${uid}-code`} className="mb-1 block text-xs font-medium text-vtk-muted">
                {nl ? "Standaard boekhoudcode" : "Default accounting code"}
              </label>
              <AccountingCodePicker
                id={`${uid}-code`}
                codes={codes}
                name="accountingCodeId"
                defaultValue={accountingCodeId}
                locale={locale}
                noneLabel={nl ? "Geen (per kassa / na te kijken)" : "None (per register / to review)"}
              />
            </div>
            <div className="text-sm">
              <label htmlFor={`${uid}-device`} className="mb-1 block text-xs font-medium text-vtk-muted">
                {nl ? "Kassatoestel" : "Cash register device"}
              </label>
              <Select id={`${uid}-device`} name="device" defaultValue={device}>
                <option value="">{nl ? "Geen" : "None"}</option>
                {deviceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </>
        ) : null}
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
 * Een standaardcode voor dit kanaal, vanaf het begin of vanaf een dag, of geen:
 * wat erop binnenkomt en geen andere regel koppelt, krijgt de code die op die
 * dag gold.
 */
export function ChannelCodeForm({
  locale,
  action,
  errorMessages,
  channelId,
  codes,
  first,
}: Common & { channelId: string; codes: AccountingCodeOption[]; first: boolean }) {
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
      <FromField nl={nl} first={first} />
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

/**
 * Welk Bancontact-bakje of welke Payconiq-rekening van de kassa's dit kanaal
 * is. Dan toont elke kassa met dat toestel wat de import erop zag.
 */
export function ChannelDeviceForm({
  locale,
  action,
  errorMessages,
  channelId,
  value,
  options,
}: Common & { channelId: string; value: string; options: Array<{ value: string; label: string }> }) {
  const nl = locale === "nl";
  const router = useRouter();
  const t = texts(nl);
  const selectId = useId();
  return (
    <SaveForm
      action={action}
      submitLabel={nl ? "Toestel opslaan" : "Save device"}
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
      <div className="w-full max-w-xs text-sm">
        <label htmlFor={selectId} className="block text-xs text-vtk-muted">
          {nl ? "Toestel" : "Device"}
        </label>
        <Select id={selectId} name="device" defaultValue={value}>
          <option value="">{nl ? "Geen" : "None"}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>
    </SaveForm>
  );
}

/** Op welke rekening dit kanaal stort, en vanaf een dag op een andere. */
export function ChannelAccountForm({ locale, action, errorMessages, channelId, first }: Common & { channelId: string; first: boolean }) {
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
      <FromField nl={nl} first={first} />
      <label className="text-sm">
        <span className="block text-xs text-vtk-muted">{nl ? "Rekening" : "Account"}</span>
        <Input name="bankAccount" required placeholder="BE00 0000 0000 0000" className="w-56" maxLength={60} />
      </label>
    </SaveForm>
  );
}
