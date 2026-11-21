"use client";

import { Card, Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveMembershipConfigAction } from "@/app/actions/membership";
import type { MembershipConfig } from "@/lib/membership/config";
import {
  accountingCodeLabel,
  MEMBERSHIP_DEFAULT_ACCOUNTING_CODE,
  type AccountingCodeOption,
} from "@/lib/accounting/codes";
import { AccountingCodePicker } from "@/components/admin/AccountingCodePicker";

/**
 * De prijs van een niet-facultair lidmaatschap en van een betalend
 * erelidmaatschap, en of die wegen naar een lidmaatschap openstaan.
 *
 * Instelbaar en niet hardgecodeerd: de prijs is een bestuursbeslissing die per
 * academiejaar kan wijzigen, en dat hoort geen deploy te vragen. Wat er al
 * betaald is, verandert niet mee: elk lidmaatschap bewaart zijn eigen bedrag.
 */
export function MembershipSettingsForm({
  nl,
  config,
  accountingCodes,
}: {
  nl: boolean;
  config: MembershipConfig;
  accountingCodes: AccountingCodeOption[];
}) {
  const fallback = accountingCodes.find((code) => code.code === MEMBERSHIP_DEFAULT_ACCOUNTING_CODE);
  const t = nl
    ? {
        heading: "Instellingen",
        hint: "Een prijswijziging geldt vanaf de volgende aanmelding; wat al betaald is, blijft staan op het bedrag van toen.",
        price: "Prijs niet-facultair lid (EUR)",
        faculty: "Studenten van de faculteit kunnen zich gratis aanmelden",
        external: "Niet-facultaire leden kunnen zich aanmelden en betalen",
        honoraryPrice: "Prijs betalend erelid (EUR)",
        honoraryPriceHint: "Per academiejaar. Enkel wie geen student is, ziet het aanbod op /lidmaatschap.",
        honoraryOpen: "Wie geen student is, kan zichzelf betalend erelid maken",
        invalidHonorary: "Vul een geldige prijs in voor een erelid, groter dan 0, bijvoorbeeld 75.",
        code: "Boekhoudcode",
        codeDefault: fallback ? `Standaard: ${accountingCodeLabel(fallback)}` : "Geen code",
        codeHint: "Staat vooraan in de betaalinfo bij Mollie, zodat het lidgeld in een uitbetaling herkenbaar is.",
        invalidCode: "Die boekhoudcode bestaat niet meer. Kies een andere.",
        submit: "Opslaan",
        saving: "Opslaan...",
        saved: "Instellingen opgeslagen.",
        invalid: "Vul een geldig bedrag in, bijvoorbeeld 25 of 12,50.",
        failed: "Opslaan is mislukt.",
      }
    : {
        heading: "Settings",
        hint: "A price change applies from the next sign-up; what has been paid keeps the amount of that moment.",
        price: "Price for a non-faculty member (EUR)",
        faculty: "Faculty students can sign up for free",
        external: "Non-faculty members can sign up and pay",
        honoraryPrice: "Price for a paying honorary member (EUR)",
        honoraryPriceHint: "Per academic year. Only people who are not a student see the offer on /lidmaatschap.",
        honoraryOpen: "People who are not a student can become a paying honorary member",
        invalidHonorary: "Enter a valid honorary member price above 0, for example 75.",
        code: "Accounting code",
        codeDefault: fallback ? `Default: ${accountingCodeLabel(fallback)}` : "No code",
        codeHint: "Leads the payment details at Mollie, so the fee is recognisable in a payout.",
        invalidCode: "That accounting code no longer exists. Choose another one.",
        submit: "Save",
        saving: "Saving...",
        saved: "Settings saved.",
        invalid: "Enter a valid amount, for example 25 or 12.50.",
        failed: "Saving failed.",
      };

  return (
    <Card className="p-5">
      <h2 className="mb-1 font-medium text-vtk-ink">{t.heading}</h2>
      <p className="mb-3 text-sm text-[#5c667f]">{t.hint}</p>
      <SaveForm
        action={saveMembershipConfigAction}
        submitLabel={t.submit}
        savingLabel={t.saving}
        savedMessage={t.saved}
        resetOnSuccess={false}
        errorMessages={{
          INVALID_PRICE: t.invalid,
          INVALID_HONORARY_PRICE: t.invalidHonorary,
          INVALID_ACCOUNTING_CODE: t.invalidCode,
        }}
        fallbackErrorMessage={t.failed}
        className="space-y-4"
      >
        <div className="w-56">
          <Label htmlFor="membership-price">{t.price}</Label>
          <Input
            id="membership-price"
            name="externalPrice"
            inputMode="decimal"
            defaultValue={(config.externalPriceCents / 100).toFixed(2).replace(".", ",")}
          />
        </div>
        <div>
          <div className="w-56">
            <Label htmlFor="membership-honorary-price">{t.honoraryPrice}</Label>
            <Input
              id="membership-honorary-price"
              name="honoraryPrice"
              inputMode="decimal"
              aria-describedby="membership-honorary-price-hint"
              defaultValue={(config.honoraryPriceCents / 100).toFixed(2).replace(".", ",")}
            />
          </div>
          <p id="membership-honorary-price-hint" className="mt-1 text-xs text-[#5c667f]">
            {t.honoraryPriceHint}
          </p>
        </div>
        <div className="max-w-md">
          <Label htmlFor="membership-accounting-code">{t.code}</Label>
          <AccountingCodePicker
            id="membership-accounting-code"
            name="accountingCodeId"
            codes={accountingCodes}
            defaultValue={config.accountingCodeId}
            noneLabel={t.codeDefault}
            locale={nl ? "nl" : "en"}
          />
          <p className="mt-1 text-xs text-[#5c667f]">{t.codeHint}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-vtk-ink">
          <input
            type="checkbox"
            name="facultyOpen"
            defaultChecked={config.facultyOpen}
            className="shrink-0"
          />
          {t.faculty}
        </label>
        <label className="flex items-center gap-2 text-sm text-vtk-ink">
          <input
            type="checkbox"
            name="externalOpen"
            defaultChecked={config.externalOpen}
            className="shrink-0"
          />
          {t.external}
        </label>
        <label className="flex items-center gap-2 text-sm text-vtk-ink">
          <input
            type="checkbox"
            name="honoraryOpen"
            defaultChecked={config.honoraryOpen}
            className="shrink-0"
          />
          {t.honoraryOpen}
        </label>
      </SaveForm>
    </Card>
  );
}
