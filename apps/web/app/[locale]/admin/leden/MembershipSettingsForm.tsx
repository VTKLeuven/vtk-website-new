"use client";

import { Card, Input, Label } from "@vtk/ui";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveMembershipConfigAction } from "@/app/actions/membership";
import type { MembershipConfig } from "@/lib/membership/config";

/**
 * De prijs van een niet-facultair lidmaatschap, en of de twee wegen naar een
 * lidmaatschap openstaan.
 *
 * Instelbaar en niet hardgecodeerd: de prijs is een bestuursbeslissing die per
 * academiejaar kan wijzigen, en dat hoort geen deploy te vragen. Wat er al
 * betaald is, verandert niet mee: elk lidmaatschap bewaart zijn eigen bedrag.
 */
export function MembershipSettingsForm({
  nl,
  config,
}: {
  nl: boolean;
  config: MembershipConfig;
}) {
  const t = nl
    ? {
        heading: "Instellingen",
        hint: "Een prijswijziging geldt vanaf de volgende aanmelding; wat al betaald is, blijft staan op het bedrag van toen.",
        price: "Prijs niet-facultair lid (EUR)",
        faculty: "Studenten van de faculteit kunnen zich gratis aanmelden",
        external: "Niet-facultaire leden kunnen zich aanmelden en betalen",
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
        errorMessages={{ INVALID_PRICE: t.invalid }}
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
      </SaveForm>
    </Card>
  );
}
