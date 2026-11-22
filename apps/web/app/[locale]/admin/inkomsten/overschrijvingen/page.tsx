import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { InfoTip } from "@/components/ui/InfoTip";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { formatEuro } from "@/lib/rekeningen/expenses";
import { brusselsYMD } from "@/lib/brussels";
import { listAccountingCodes } from "@/lib/accounting/server";
import { parseMonth } from "@/lib/inkomsten/parse";
import { knownBankAccounts, listTransfers, type TransferItem } from "@/lib/inkomsten/transferServer";
import { deleteIncomeTransferAction, saveIncomeTransferAction } from "@/app/actions/inkomsten";
import { incomeErrorMessages } from "../messages";
import { periodLabel, quarterOptions } from "../shared";
import { TransferForm } from "./TransferForm";
import { TransferList, type TransferListItem } from "./TransferList";

/**
 * De overschrijvingen die iemand rechtstreeks op een rekening van de kring deed
 * ("de Overschrijvingen" van het oude rekenblad). Er is geen export voor:
 * Beheer voert ze per stuk in, met de rekening en de code. Zie
 * docs/inkomsten.md, "Overschrijvingen".
 */
export default async function IncomeTransfersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  await requirePermission("income.manage");

  const query = await searchParams;
  const quarters = quarterOptions(brusselsYMD(new Date()));
  const fromParam = parseMonth(typeof query.van === "string" ? query.van : null);
  const toParam = parseMonth(typeof query.tot === "string" ? query.tot : null);
  const [from, to] = fromParam && toParam && fromParam <= toParam ? [fromParam, toParam] : [quarters[0].from, quarters[0].to];

  const [transfers, accounts, codes] = await Promise.all([listTransfers(from, to), knownBankAccounts(), listAccountingCodes()]);
  const errorMessages = incomeErrorMessages(locale);
  const total = transfers.filter((transfer) => !transfer.excluded).reduce((sum, transfer) => sum + transfer.amountCents, 0);

  // De teksten hier, op de server, zodat de lijst in de browser niet verspringt.
  const dayLabel = (ymd: string) =>
    new Date(`${ymd}T12:00:00Z`).toLocaleDateString(nl ? "nl-BE" : "en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  const enteredOn = (value: Date) =>
    value.toLocaleDateString(nl ? "nl-BE" : "en-GB", { day: "numeric", month: "short", timeZone: "Europe/Brussels" });
  // Zoals in het veld: "12,50", "-12,50".
  const fieldAmount = (cents: number) => `${cents < 0 ? "-" : ""}${(Math.abs(cents) / 100).toFixed(2).replace(".", nl ? "," : ".")}`;
  const item = (transfer: TransferItem): TransferListItem => ({
    id: transfer.id,
    day: transfer.day,
    amount: fieldAmount(transfer.amountCents),
    bankAccount: transfer.bankAccount,
    accountingCodeId: transfer.accountingCodeId,
    description: transfer.description ?? "",
    dayLabel: dayLabel(transfer.day),
    amountLabel: formatEuro(transfer.amountCents, locale),
    codeLabel: transfer.code ? `${transfer.code.code} ${transfer.code.name}` : null,
    enteredBy: [transfer.enteredBy, enteredOn(transfer.enteredAt)].filter(Boolean).join(", "),
    excluded: transfer.excluded,
    locked: transfer.locked,
  });
  const href = (van: string, tot: string) => `${base}/admin/inkomsten/overschrijvingen?van=${van}&tot=${tot}`;

  return (
    <div className="space-y-5">
      <header>
        <h2 className="text-lg font-semibold">{nl ? "Overschrijvingen" : "Transfers"}</h2>
        {/* De "i" naast de zin en niet erin: de uitleg heeft zelf alinea's. */}
        <div className="mt-1 flex max-w-3xl items-start gap-1">
          <p className="text-sm text-vtk-muted">
            {nl
              ? "Geld dat iemand rechtstreeks op een rekening van de kring stortte. Daar is geen export voor: voer elke overschrijving hier in."
              : "Money someone paid straight into one of the accounts. There is no export for it: enter each transfer here."}
          </p>
          <InfoTip label={nl ? "Wat een overschrijving hier is" : "What a transfer is here"}>
            <p>
              {nl
                ? "Een overschrijving telt in het overzicht, het kwartaalblad en het controlebestand onder \"Overschrijvingen\", met een kolom per rekening, in de maand van haar dag."
                : "A transfer counts in the overview, the quarter sheet and the check file under \"Transfers\", with a column per account, in the month of its day."}
            </p>
            <p>
              {nl
                ? "Een naam of het rekeningnummer van wie stortte is niet nodig, en de site bewaart het ook niet: de omschrijving zegt waarvoor het geld was."
                : "The name or account number of the payer is not needed, and the site does not keep it: the description says what the money was for."}
            </p>
            <p>
              {nl
                ? "Een terugbetaling per overschrijving vul je negatief in (-12,50). De rekeningen zijn die van de kanalen bij Instellingen."
                : "A refund by transfer is entered as a negative amount (-12.50). The accounts are those of the channels under Settings."}
            </p>
          </InfoTip>
        </div>
      </header>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold">{nl ? "Overschrijving toevoegen" : "Add a transfer"}</h3>
        {accounts.length === 0 ? (
          <p className="text-sm text-vtk-muted">
            {nl ? "De site kent nog geen enkele rekening. Stel eerst bij " : "The site knows no account yet. First set the account of a channel under "}
            <Link href={`${base}/admin/inkomsten/instellingen`} className="text-vtk-navy underline underline-offset-2">
              {nl ? "Instellingen" : "Settings"}
            </Link>
            {nl ? " de rekening van een kanaal in." : "."}
          </p>
        ) : (
          <TransferForm accounts={accounts} codes={codes} locale={locale} action={saveIncomeTransferAction} errorMessages={errorMessages} />
        )}
      </section>

      <nav className="flex flex-wrap gap-2" aria-label={nl ? "Kwartalen" : "Quarters"}>
        {quarters.map((quarter) => {
          const active = quarter.from === from && quarter.to === to;
          return (
            <Link
              key={quarter.from}
              href={href(quarter.from, quarter.to)}
              aria-current={active ? "page" : undefined}
              className={`rounded-full border px-3 py-1 text-sm tabular-nums ${
                active ? "border-vtk-navy bg-vtk-navy text-vtk-surface" : "border-vtk-blue/15 hover:bg-vtk-blue-soft/60"
              }`}
            >
              {quarter.label}
            </Link>
          );
        })}
      </nav>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="text-base font-semibold">{periodLabel(from, to, nl)}</h3>
          {transfers.length > 0 ? (
            <p className="text-sm text-vtk-muted">
              {nl
                ? `${transfers.length} ${transfers.length === 1 ? "overschrijving" : "overschrijvingen"}, samen ${formatEuro(total, locale)}. `
                : `${transfers.length} ${transfers.length === 1 ? "transfer" : "transfers"}, together ${formatEuro(total, locale)}. `}
              <Link href={`${base}/admin/inkomsten?van=${from}&tot=${to}`} className="text-vtk-navy underline underline-offset-2">
                {nl ? "Naar het overzicht" : "To the overview"}
              </Link>
            </p>
          ) : null}
        </div>
        {transfers.length === 0 ? (
          <p className="text-sm text-vtk-muted">{nl ? "Geen overschrijvingen in deze periode." : "No transfers in this period."}</p>
        ) : (
          <TransferList
            items={transfers.map(item)}
            accounts={accounts}
            codes={codes}
            locale={locale}
            saveAction={saveIncomeTransferAction}
            deleteAction={deleteIncomeTransferAction}
            errorMessages={errorMessages}
          />
        )}
      </section>
    </div>
  );
}
