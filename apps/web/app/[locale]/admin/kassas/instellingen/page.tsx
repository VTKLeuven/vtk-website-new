import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { cashRegisterAccess, getCashRegisterConfig, permanentTabLabel } from "@/lib/kassas/server";
import { saveCashRegisterConfigAction } from "@/app/actions/kassas";
import { KassaNav } from "../KassaNav";
import { SettingsForm } from "../SettingsForm";
import { kassaErrorMessages } from "../messages";

export default async function KassaInstellingen({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const access = await cashRegisterAccess(`${base}/inloggen?next=${base}/admin/kassas/instellingen`);
  if (!access.canManage) {
    return (
      <p className="text-sm text-vtk-muted">
        {nl
          ? "Enkel wie kassa's beheert, kan de instellingen aanpassen."
          : "Only cash register managers can change the settings."}
      </p>
    );
  }

  const config = await getCashRegisterConfig();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Instellingen kassa's" : "Cash register settings"}</h1>
        <p className="mt-1 max-w-5xl text-sm text-vtk-muted">
          {nl
            ? "De bakjes en rekeningen die je bij het tellen aan een kassa hangt. Een kassa zonder Bancontact of Payconiq krijgt gewoon geen bakje; \"n.v.t.\" hoeft dus niet in de lijst."
            : "The terminals and accounts you attach to a register when counting it. A register without Bancontact or Payconiq simply gets none, so \"n/a\" does not need to be in the list."}
        </p>
      </header>

      <KassaNav
        base={base}
        nl={nl}
        active="instellingen"
        caps={{ request: true, manage: true }}
        permanentLabel={permanentTabLabel(access, locale)}
      />

      <div className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <SettingsForm
          locale={locale}
          action={saveCashRegisterConfigAction}
          config={config}
          errorMessages={kassaErrorMessages(locale)}
        />
      </div>
    </div>
  );
}
