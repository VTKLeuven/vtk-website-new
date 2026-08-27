import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import type { Locale } from "@vtk/i18n";
import { Input, Label } from "@vtk/ui";
import { smtpConfigured } from "@vtk/mail";
import { SaveForm } from "@/components/ui/SaveForm";
import { MarkdownEditorField } from "@/components/editor/MarkdownEditor";
import { saveExpenseSettingsAction } from "@/app/actions/expenses";
import { expenseAccess, getExpenseConfig } from "@/lib/rekeningen/server";
import { formatBytes } from "@/lib/rekeningen/expenses";
import { RekeningenNav } from "../RekeningenNav";
import { expenseErrorMessages } from "../messages";

export default async function RekeningenInstellingen({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const access = await expenseAccess(`${base}/inloggen?next=${base}/admin/rekeningen/instellingen`);
  if (!access.canManageAll) {
    return <p className="text-sm text-zinc-500">{nl ? "Geen toegang." : "No access."}</p>;
  }

  const [config, storage] = await Promise.all([
    getExpenseConfig(),
    prisma.expense.aggregate({ _sum: { receiptSize: true }, _count: true }),
  ]);
  const mailReady = smtpConfigured();

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Instellingen" : "Settings"}</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-[#5c667f]">
          {nl
            ? "Waar de bladen naartoe gaan, en wat een indiener te lezen krijgt voor hij het formulier invult."
            : "Where the sheets go, and what a submitter reads before filling in the form."}
        </p>
      </header>

      <RekeningenNav
        base={base}
        nl={nl}
        active="instellingen"
        caps={{ submit: access.canSubmit, overview: access.canSeeOverview, settings: true }}
      />

      <div className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <SaveForm
          action={saveExpenseSettingsAction}
          submitLabel={nl ? "Opslaan" : "Save"}
          savingLabel={nl ? "Opslaan..." : "Saving..."}
          savedMessage={nl ? "Instellingen opgeslagen." : "Settings saved."}
          fallbackErrorMessage={nl ? "Opslaan mislukt." : "Could not save."}
          errorMessages={expenseErrorMessages(locale)}
          resetOnSuccess={false}
          className="space-y-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="accountantEmail">
                {nl ? "Adres van de boekhouding" : "Accountant's address"}
              </Label>
              <Input
                id="accountantEmail"
                name="accountantEmail"
                type="email"
                defaultValue={config.accountantEmail}
                placeholder="aankoop-000000000@voorbeeld.be"
              />
              <p className="mt-1 text-xs text-[#5c667f]">
                {nl
                  ? "Staat standaard ingevuld wanneer je een blad doorstuurt; je kan het per blad nog aanpassen."
                  : "Pre-filled when you forward a sheet; you can still change it per sheet."}
              </p>
            </div>
            <div>
              <Label htmlFor="fromEmail">{nl ? "Afzender" : "Sender"}</Label>
              <Input
                id="fromEmail"
                name="fromEmail"
                defaultValue={config.fromEmail}
                placeholder="VTK Beheer &lt;beheer@vtk.be&gt;"
              />
              <p className="mt-1 text-xs text-[#5c667f]">
                {nl
                  ? "Leeg laten gebruikt de standaardafzender van de site."
                  : "Leave empty to use the site's default sender."}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="guidelinesNl">
                {nl ? "Richtlijnen boven het formulier (NL)" : "Guidelines above the form (NL)"}
              </Label>
              <MarkdownEditorField
                name="guidelinesNl"
                textareaId="guidelinesNl"
                locale={locale}
                rows={6}
                maxLength={4000}
                allowImages={false}
                defaultValue={config.guidelinesNl}
              />
              <p className="mt-1 text-xs text-[#5c667f]">
                {nl
                  ? "Bijvoorbeeld: plak het bonnetje volledig en vlak, geen doorhalingen, gebruik meerdere bladen indien nodig."
                  : "For example: stick the receipt down whole and flat, no crossings-out, use several sheets if needed."}
              </p>
            </div>
            <div>
              <Label htmlFor="guidelinesEn">
                {nl ? "Richtlijnen boven het formulier (EN)" : "Guidelines above the form (EN)"}
              </Label>
              <MarkdownEditorField
                name="guidelinesEn"
                textareaId="guidelinesEn"
                locale={locale}
                rows={6}
                maxLength={4000}
                allowImages={false}
                defaultValue={config.guidelinesEn}
              />
            </div>
          </div>
        </SaveForm>
      </div>

      <section className="space-y-3 rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <h2 className="text-sm font-semibold text-vtk-ink">{nl ? "Toestand" : "State"}</h2>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5c667f]">
              {nl ? "Bonnetjes in opslag" : "Receipts in storage"}
            </dt>
            <dd className="m-0 text-sm text-vtk-ink">
              {storage._count} {nl ? "bestanden" : "files"} ·{" "}
              {formatBytes(storage._sum.receiptSize ?? 0, locale)}
            </dd>
            <p className="mt-1 text-xs text-[#5c667f]">
              {nl
                ? "Ze staan in de eigen objectopslag van de site, dus er is geen quotum zoals bij het oude Supabase-project."
                : "They live in the site's own object storage, so there is no quota like the old Supabase project had."}
            </p>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5c667f]">
              {nl ? "Mailserver" : "Mail server"}
            </dt>
            <dd className="m-0 text-sm text-vtk-ink">
              {mailReady
                ? nl
                  ? "Ingesteld"
                  : "Configured"
                : nl
                  ? "Niet ingesteld"
                  : "Not configured"}
            </dd>
            <p className="mt-1 text-xs text-[#5c667f]">
              {mailReady
                ? nl
                  ? "Doorsturen naar de boekhouding werkt."
                  : "Forwarding to the accountant works."
                : nl
                  ? "Zonder SMTP kan een blad niet doorgestuurd worden; downloaden en zelf mailen kan wel."
                  : "Without SMTP a sheet cannot be forwarded; downloading and mailing it yourself does work."}
            </p>
          </div>
        </dl>
      </section>
    </div>
  );
}
