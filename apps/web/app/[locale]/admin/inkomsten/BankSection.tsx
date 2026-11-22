import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { InfoTip } from "@/components/ui/InfoTip";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { formatEuro } from "@/lib/rekeningen/expenses";
import { displayAccount } from "@/lib/inkomsten/labels";
import type { ReconPart, UnmatchedReason } from "@/lib/inkomsten/bank";
import type { BankOverview } from "@/lib/inkomsten/bankServer";
import { SOURCE_LABELS } from "./shared";

const REASONS: Record<UnmatchedReason, { nl: string; en: string }> = {
  NO_REFERENCE: { nl: "Geen referentie in de mededeling", en: "No reference in the message" },
  PAYCONIQ_WITHOUT_PAYOUT_ID: {
    nl: "De Payconiq-export op de site noemt geen payoutId: upload de export met payoutId",
    en: "The Payconiq export on the site has no payoutId: upload the export with payoutId",
  },
  NOT_FOUND: {
    nl: "Geen uitbetaling met die referentie: staat de export van die dagen er al?",
    en: "No payout with that reference: is the export of those days uploaded?",
  },
};

/**
 * Per rekening: wat de site op de bank verwacht in de periode, naast de regels
 * van providers op de afschriften, en wat geen uitbetaling vond. Leest enkel;
 * zie `reconcileAccounts` in `lib/inkomsten/bank.ts`.
 */
export function BankSection({
  bank,
  nl,
  locale,
  base,
  from,
  to,
}: {
  bank: BankOverview;
  nl: boolean;
  locale: Locale;
  base: string;
  from: string;
  to: string;
}) {
  if (bank.accounts.length === 0 && bank.unmatched.length === 0) return null;
  const euro = (cents: number) => formatEuro(cents, locale);
  const ymd = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(nl ? "nl-BE" : "en-GB", { timeZone: "UTC" });
  // Een geschatte dag staat schuin, met hoeveel er geschat zijn.
  // Wat eraf gaat, negatief zoals elk bedrag op de site ("€ -407,00").
  const part = (value: ReconPart, sign: "-" | "+" | "") =>
    value.cents === 0 && value.count === 0 ? (
      ""
    ) : (
      <span className={value.estimated ? "italic" : undefined} title={value.estimated ? (nl ? `${value.estimated} met een geschatte dag` : `${value.estimated} with an estimated day`) : undefined}>
        {sign === "-" ? euro(-value.cents) : `${sign}${euro(value.cents)}`}
      </span>
    );
  const rows: Array<{ label: string; cell: (account: BankOverview["accounts"][number]) => React.ReactNode; strong?: boolean }> = [
    { label: nl ? "Verkocht in de periode" : "Sold in the period", cell: (account) => part(account.sold, "") },
    { label: nl ? "Verkocht in de periode, op de bank erna" : "Sold in the period, on the bank after it", cell: (account) => part(account.laterOut, "-") },
    { label: nl ? "Verkocht ervoor, op de bank in de periode" : "Sold before, on the bank in the period", cell: (account) => part(account.earlierIn, "") },
    { label: nl ? "Overschrijvingen van Mollie" : "Mollie transfers", cell: (account) => part(account.mollie, "") },
    { label: nl ? "Verwacht op de bank" : "Expected on the bank", cell: (account) => euro(account.expected), strong: true },
    {
      label: nl ? "Op de afschriften" : "On the statements",
      cell: (account) => (
        <>
          {euro(account.bank)}
          <span className="block text-xs font-normal text-vtk-muted">
            {account.bankCount} {nl ? (account.bankCount === 1 ? "regel" : "regels") : account.bankCount === 1 ? "line" : "lines"}
          </span>
        </>
      ),
    },
    {
      label: nl ? "Verschil" : "Difference",
      strong: true,
      cell: (account) =>
        account.covered ? (
          <span className={account.difference === 0 ? undefined : "text-vtk-warn"}>{euro(account.difference)}</span>
        ) : (
          <span className="text-xs font-normal text-vtk-muted">{nl ? "geen afschrift voor de hele periode" : "no statement for the whole period"}</span>
        ),
    },
  ];
  const byHand = bank.accounts.some((account) => account.byHand !== 0);

  return (
    <section id="tegen-de-bank" className="scroll-mt-24 rounded-2xl border border-vtk-blue/12 bg-white p-5">
      <div className="flex items-center gap-1.5">
        <h2 className="text-lg font-semibold">{nl ? "Tegen de bankafschriften" : "Against the bank statements"}</h2>
        <InfoTip label={nl ? "Hoe de site afstemt met de bank" : "How the site reconciles with the bank"}>
          <p>
            {nl
              ? "Een verkoop telt in de periode van haar dag, maar haar geld komt pas de volgende bankdag op de rekening (SumUp, Payconiq, Europabank), en Mollie schrijft wekelijks over. Wat op de laatste dag verkocht werd, staat dus op het afschrift van de volgende periode, en de eerste dagen brengen het geld van de vorige. Dat zijn geen verschillen; pas wat overblijft, is er een."
              : "A sale counts in the period of its day, but its money only reaches the account on the next banking day (SumUp, Payconiq, Europabank), and Mollie transfers weekly. What was sold on the last day is on the next period's statement, and the first days bring the previous period's money. Those are not differences; only what is left is one."}
          </p>
          <p>
            {nl
              ? "De dag op de bank is die van de regel op het afschrift, anders die van de uitbetaling in de export, en anders de volgende bankdag: dan is het een schatting, en staat het bedrag schuin. Alles telt hier, ook wat niet meetelt en de kosten: het geld kwam toch op de rekening, of ging eraf."
              : "The day on the bank is that of the line on the statement, otherwise that of the payout in the export, and otherwise the next banking day: then it is an estimate, and the amount is in italics. Everything counts here, including what does not count and the fees: the money still reached the account, or left it."}
          </p>
          <p>
            {nl
              ? "Een verschil staat er enkel voor een rekening waarvan afschriften elke dag van de periode dekken. Overschrijvingen met de hand staan er ter info bij: een regel van een lid bewaart de site niet, dus valt er niets mee te vergelijken."
              : "A difference is only shown for an account whose statements cover every day of the period. Transfers entered by hand are shown for information: the site keeps no member line, so there is nothing to compare them with."}
          </p>
        </InfoTip>
      </div>

      {bank.accounts.length > 0 ? (
        <div className="relative mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-vtk-blue/12 text-left text-xs uppercase tracking-wide text-vtk-muted">
                <th className="py-2 pr-3">
                  <span className="sr-only">{nl ? "Regel" : "Line"}</span>
                </th>
                {bank.accounts.map((account) => (
                  <th key={account.account} className="px-3 py-2 text-right font-medium whitespace-nowrap normal-case tracking-normal tabular-nums">
                    {account.display}
                    {!account.known ? <span className="block text-xs text-vtk-warn">{nl ? "bij geen kanaal" : "on no channel"}</span> : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className={`border-b border-vtk-blue/8 align-top last:border-0 ${row.strong ? "font-semibold" : ""}`}>
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    {row.label}
                  </th>
                  {bank.accounts.map((account) => (
                    <td key={account.account} className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {row.cell(account)}
                    </td>
                  ))}
                </tr>
              ))}
              {byHand ? (
                <tr className="text-vtk-muted">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">
                    <Link href={`${base}/admin/inkomsten/overschrijvingen?van=${from}&tot=${to}`} className="underline underline-offset-2">
                      {nl ? "Overschrijvingen met de hand (ter info)" : "Transfers entered by hand (for information)"}
                    </Link>
                  </th>
                  {bank.accounts.map((account) => (
                    <td key={account.account} className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                      {account.byHand ? euro(account.byHand) : ""}
                    </td>
                  ))}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-4">
        <AdminDisclosure
          variant="row"
          defaultOpen={false}
          summary={
            <>
              <span className="font-medium">{nl ? "Regels van providers zonder uitbetaling op de site" : "Provider lines without a payout on the site"}</span>
              <span className="text-sm text-vtk-muted"> · {bank.unmatched.length}</span>
            </>
          }
        >
          {bank.unmatched.length === 0 ? (
            <p className="text-sm text-vtk-muted">{nl ? "Elke regel vond haar uitbetaling." : "Every line found its payout."}</p>
          ) : (
            <div className="relative overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-vtk-blue/12 text-left text-xs uppercase tracking-wide text-vtk-muted">
                    <th className="px-3 py-2">{nl ? "Dag" : "Day"}</th>
                    <th className="px-3 py-2">{nl ? "Rekening" : "Account"}</th>
                    <th className="px-3 py-2">{nl ? "Van" : "From"}</th>
                    <th className="px-3 py-2">{nl ? "Referentie" : "Reference"}</th>
                    <th className="px-3 py-2 text-right">{nl ? "Bedrag" : "Amount"}</th>
                    <th className="px-3 py-2">{nl ? "Waarom" : "Why"}</th>
                  </tr>
                </thead>
                <tbody>
                  {bank.unmatched.map((line, index) => (
                    <tr key={`${line.account}-${line.bookedOn}-${index}`} className="border-b border-vtk-blue/8 align-top last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{ymd(line.bookedOn)}</td>
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">{displayAccount(line.account)}</td>
                      <td className="px-3 py-2">{SOURCE_LABELS[line.provider]}</td>
                      <td className="px-3 py-2 break-all">{line.reference ?? ""}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{euro(line.amountCents)}</td>
                      <td className="px-3 py-2 text-vtk-muted">{nl ? REASONS[line.reason].nl : REASONS[line.reason].en}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminDisclosure>
      </div>
    </section>
  );
}
