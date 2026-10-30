import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { ConfirmTextButton } from "@/components/ui/DeleteIconButton";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { formatEuro } from "@/lib/rekeningen/expenses";
import { brusselsYMD } from "@/lib/brussels";
import { parseMonth } from "@/lib/inkomsten/parse";
import type { OverviewLine } from "@/lib/inkomsten/overview";
import { countUnassigned, loadIncomeOverview } from "@/lib/inkomsten/server";
import { closeIncomePeriodAction, setPayoutCheckAction } from "@/app/actions/inkomsten";
import { CheckIcon, InfoIcon } from "@/components/ui/icons";
import { InfoTip } from "@/components/ui/InfoTip";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { IncomeNav } from "./IncomeNav";
import { PayoutCheckButton } from "./PayoutCheckButton";
import { incomeErrorMessages } from "./messages";
import { SOURCE_LABELS, checkText, periodLabel, quarterOptions } from "./shared";

/**
 * Het overzicht dat het rekenblad "Oriëntatie Online Inkomsten" vervangt: per
 * boekhoudcode wat er in een periode via Payconiq, Mollie, SumUp en Europabank
 * binnenkwam, met een kolom per bron die ooit opgeladen werd. Mollie telt in de
 * maand van de uitbetaling, zoals in het rekenblad; de rest in de maand van de
 * betaling.
 */
export default async function IncomeOverviewPage({
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

  const [data, openCount] = await Promise.all([loadIncomeOverview(from, to), countUnassigned()]);
  const { overview } = data;
  const money = (cents: number) => (cents === 0 ? "" : formatEuro(cents, locale));
  const transactionsHref = (extra: Record<string, string>) =>
    `${base}/admin/inkomsten/transacties?${new URLSearchParams({ van: from, tot: to, ...extra }).toString()}`;
  const exportHref = (soort: "boekhouder" | "controle") =>
    `/api/admin/inkomsten/export?${new URLSearchParams({ van: from, tot: to, taal: locale, soort }).toString()}`;
  const closedHere = data.closed.find((period) => period.from <= from && to <= period.to) ?? null;
  const checks = data.checks.map((check) => checkText(check, nl, locale, base));
  const openChecks = checks.filter((check) => !check.ok);
  // Wat nog open staat bovenaan, in de volgorde van het werk; wat in orde is eronder.
  const sortedChecks = [...openChecks, ...checks.filter((check) => check.ok)];
  const errorMessages = incomeErrorMessages(locale);
  const day = (value: Date) =>
    value.toLocaleDateString(nl ? "nl-BE" : "en-GB", { day: "numeric", month: "short", timeZone: "Europe/Brussels" });

  // Een bedrag linkt naar zijn rijen in Transacties, waar het totaal bovenaan
  // hetzelfde bedrag is; zonder `filter` (het totaal) linkt niets.
  const lineCells = (line: OverviewLine, filter?: Record<string, string>) => (
    <>
      {data.sources.map((source) => (
        <td key={source} className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
          {filter && line.bySource[source] !== 0 ? (
            <Link href={transactionsHref({ ...filter, bron: source.toLowerCase() })} className="hover:underline">
              {money(line.bySource[source])}
            </Link>
          ) : (
            money(line.bySource[source])
          )}
        </td>
      ))}
      <td className="px-3 py-2 text-right font-medium whitespace-nowrap tabular-nums">{money(line.total)}</td>
    </>
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Online inkomsten" : "Online income"}</h1>
        <p className="mt-1 max-w-3xl text-sm text-vtk-muted">
          {nl
            ? "Wat er via Payconiq, Mollie, SumUp en Europabank binnenkwam, per boekhoudcode. Mollie telt in de maand van de uitbetaling, de rest in de maand van de betaling."
            : "What came in through Payconiq, Mollie, SumUp and Europabank, per accounting code. Mollie counts in the month of the payout, the rest in the month of the payment."}
        </p>
      </header>

      <IncomeNav base={base} nl={nl} active="overzicht" openCount={openCount} />

      <section className="flex flex-wrap items-end gap-3">
        <nav className="flex flex-wrap gap-2" aria-label={nl ? "Kwartalen" : "Quarters"}>
          {quarters.map((quarter) => {
            const active = quarter.from === from && quarter.to === to;
            return (
              <Link
                key={quarter.from}
                href={`${base}/admin/inkomsten?van=${quarter.from}&tot=${quarter.to}`}
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
        <form className="flex flex-wrap items-end gap-2" action={`${base}/admin/inkomsten`}>
          <label className="text-sm">
            <span className="block text-xs text-vtk-muted">{nl ? "Van" : "From"}</span>
            <input type="month" name="van" defaultValue={from} className="rounded-lg border border-vtk-blue/15 px-2 py-1" />
          </label>
          <label className="text-sm">
            <span className="block text-xs text-vtk-muted">{nl ? "Tot en met" : "Up to"}</span>
            <input type="month" name="tot" defaultValue={to} className="rounded-lg border border-vtk-blue/15 px-2 py-1" />
          </label>
          <button type="submit" className="rounded-full border border-vtk-blue/15 px-3 py-1.5 text-sm hover:bg-vtk-blue-soft/60">
            {nl ? "Toon" : "Show"}
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">{periodLabel(from, to, nl)}</h2>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <a
              href={exportHref("boekhouder")}
              className="font-medium text-vtk-navy underline-offset-2 hover:underline"
              title={nl ? "Het kwartaalblad zoals in het rekenblad, met de bedragen" : "The quarter sheet as in the spreadsheet, with the amounts"}
            >
              {nl ? "Blad voor de boekhouder" : "Sheet for the accountant"}
            </a>
            <a
              href={exportHref("controle")}
              className="font-medium text-vtk-navy underline-offset-2 hover:underline"
              title={nl ? "Met formules en elke tussenstap; enkel voor Beheer" : "With formulas and every step; for Beheer only"}
            >
              {nl ? "Controlebestand" : "Check file"}
            </a>
            {closedHere ? (
              <span className="text-vtk-muted">
                {nl ? "Afgesloten" : "Closed"} {closedHere.closedAt.toLocaleDateString(nl ? "nl-BE" : "en-GB")}
                {closedHere.closedByName ? ` · ${closedHere.closedByName}` : ""}
              </span>
            ) : (
              <ConfirmTextButton
                className="rounded-full border border-vtk-blue/15 px-3 py-1 hover:bg-vtk-blue-soft/60"
                action={closeIncomePeriodAction}
                fields={{ from, to }}
                title={nl ? "Periode afsluiten?" : "Close this period?"}
                description={
                  (nl
                    ? `Na het afsluiten verandert er niets meer aan ${periodLabel(from, to, nl)}: een nieuwe export voegt er niets aan toe en toewijzen kan niet meer. Heropenen kan bij Instellingen; de boekhouder heeft dan een nieuwe versie nodig.`
                    : `After closing, nothing changes in ${periodLabel(from, to, nl)} any more: a new export adds nothing and nothing can be assigned. You can reopen it under Settings; the accountant then needs a new version.`) +
                  (openChecks.length > 0
                    ? (nl ? " Nog open in de controle: " : " Still open in the checks: ") +
                      openChecks.map((check) => check.text.replace(/[.:?]+$/, "")).join("; ") +
                      "."
                    : "")
                }
                confirmLabel={nl ? "Afsluiten" : "Close"}
                cancelLabel={nl ? "Annuleren" : "Cancel"}
                successMessage={nl ? "Periode afgesloten." : "Period closed."}
                errorMessages={errorMessages}
              >
                {nl ? "Periode afsluiten" : "Close period"}
              </ConfirmTextButton>
            )}
          </div>
        </div>

        {overview.totals.count === 0 ? (
          <p className="mt-4 text-sm text-vtk-muted">
            {nl ? "Nog niets in deze periode. " : "Nothing in this period yet. "}
            <Link href={`${base}/admin/inkomsten/opladen`} className="font-medium text-vtk-navy underline">
              {nl ? "Laad een export op" : "Upload an export"}
            </Link>
            .
          </p>
        ) : (
          <div className="relative mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/12 text-left text-xs uppercase tracking-wide text-vtk-muted">
                  <th className="px-3 py-2">{nl ? "Code" : "Code"}</th>
                  <th className="px-3 py-2">{nl ? "Naam" : "Name"}</th>
                  {data.sources.map((source) => (
                    <th key={source} className="px-3 py-2 text-right">
                      {SOURCE_LABELS[source]}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right">{nl ? "Totaal" : "Total"}</th>
                </tr>
              </thead>
              <tbody>
                {overview.codes.map((row) => (
                  <tr key={row.code} className="border-b border-vtk-blue/8">
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      <Link href={transactionsHref({ code: row.code })} className="hover:underline">
                        {row.code}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{row.name}</td>
                    {lineCells(row, { code: row.code })}
                  </tr>
                ))}
                {overview.unassigned.count > 0 ? (
                  <tr className="border-b border-vtk-blue/8 bg-vtk-warn-soft/40">
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">
                      <Link href={`${base}/admin/inkomsten/na-te-kijken`} className="font-medium underline">
                        {nl ? `Na te kijken (${overview.unassigned.count})` : `To review (${overview.unassigned.count})`}
                      </Link>
                    </td>
                    {lineCells(overview.unassigned, { status: "na-te-kijken" })}
                  </tr>
                ) : null}
                {overview.fees.count > 0 ? (
                  <tr className="border-b border-vtk-blue/8">
                    <td className="px-3 py-2 tabular-nums">{data.feeCode?.code ?? ""}</td>
                    <td className="px-3 py-2">
                      {data.feeCode
                        ? `${data.feeCode.name} (${nl ? "kosten" : "fees"})`
                        : nl
                          ? "Kosten (nog geen code gekozen)"
                          : "Fees (no code chosen yet)"}
                    </td>
                    {lineCells(overview.fees, { soort: "kosten" })}
                  </tr>
                ) : null}
                {overview.reserve.count > 0 ? (
                  <tr className="border-b border-vtk-blue/8">
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">{nl ? "Wijziging dynamische reserve" : "Change in rolling reserve"}</td>
                    {lineCells(overview.reserve, { soort: "reserve" })}
                  </tr>
                ) : null}
                <tr className="font-semibold">
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2">{nl ? "Totaal" : "Total"}</td>
                  {lineCells(overview.totals)}
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <ul className="mt-4 space-y-1 text-sm text-vtk-muted">
          {data.molliePending.count > 0 ? (
            <li>
              {data.molliePending.count === 1
                ? nl
                  ? `1 Mollie-betaling (${formatEuro(data.molliePending.cents, locale)}) is nog niet uitbetaald. Ze telt mee in de maand van haar uitbetaling, zodra een export die vermeldt.`
                  : `1 Mollie payment (${formatEuro(data.molliePending.cents, locale)}) not paid out yet. It counts in the month of its payout, once an export lists it.`
                : nl
                  ? `${data.molliePending.count} Mollie-betalingen (${formatEuro(data.molliePending.cents, locale)}) zijn nog niet uitbetaald. Ze tellen mee in de maand van hun uitbetaling, zodra een export die vermeldt.`
                  : `${data.molliePending.count} Mollie payments (${formatEuro(data.molliePending.cents, locale)}) not paid out yet. They count in the month of their payout, once an export lists it.`}
            </li>
          ) : null}
          {overview.excluded.count > 0 ? (
            <li>
              <Link href={transactionsHref({ status: "telt-niet-mee" })} className="underline">
                {nl
                  ? `${overview.excluded.count === 1 ? "1 transactie" : `${overview.excluded.count} transacties`} (${formatEuro(overview.excluded.total, locale)}) ${overview.excluded.count === 1 ? "telt" : "tellen"} niet mee.`
                  : `${overview.excluded.count} ${overview.excluded.count === 1 ? "transaction does" : "transactions do"} not count (${formatEuro(overview.excluded.total, locale)}).`}
              </Link>
            </li>
          ) : null}
        </ul>
      </section>

      {overview.totals.count + overview.excluded.count > 0 ? (
        <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
          <h2 className="text-lg font-semibold">{nl ? "Controle" : "Checks"}</h2>
          <p className="mt-1 text-sm text-vtk-muted">
            {nl
              ? "Wat je best nakijkt voor je de periode afsluit en naar de boekhouder stuurt."
              : "What to check before you close the period and send it to the accountant."}
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {sortedChecks.map((check, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className={`mt-0.5 shrink-0 ${check.ok ? "text-vtk-muted" : "text-vtk-warn"}`} aria-hidden>
                  {check.ok ? <CheckIcon /> : <InfoIcon />}
                </span>
                <span className={check.ok ? "text-vtk-muted" : ""}>
                  <span className="sr-only">{check.ok ? (nl ? "In orde: " : "OK: ") : nl ? "Na te kijken: " : "To check: "}</span>
                  {check.href ? (
                    // Wat open staat, toont zijn link: daar los je het op.
                    <Link href={check.href} className={check.ok ? "underline-offset-2 hover:underline" : "underline underline-offset-2"}>
                      {check.text}
                    </Link>
                  ) : (
                    check.text
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {data.payouts.length > 0 ? (
        <section id="per-uitbetaling" className="scroll-mt-24 rounded-2xl border border-vtk-blue/12 bg-white p-5">
          <div className="flex items-center gap-1.5">
            <h2 className="text-lg font-semibold">{nl ? "Per uitbetaling" : "Per payout"}</h2>
            <InfoTip label={nl ? "Hoe de site een uitbetaling nakijkt" : "How the site checks a payout"}>
              <p>
                {nl
                  ? "Het totaal is elke regel met die uitbetaling, ook wat niet meetelt: het geld kwam toch op de rekening. Zo hoort het op het uittreksel te staan, met de referentie erbij."
                  : "The total is every row with that payout, including what does not count: the money still reached the account. That is how it should be on the bank statement, with the reference next to it."}
              </p>
              <p>
                {nl
                  ? "Mollie: het balansrapport noemt elke overschrijving naar de bank met haar bedrag. Is de som van de site gelijk, dan klopt de uitbetaling zonder vinkje; is ze anders, dan staat het verschil erbij en blijft het uittreksel het bewijs. Met de betalingenexport komt de som zelden uit: Mollie houdt per uitbetaling kosten en reserve in en geeft oudere reserve vrij, en dat staat enkel in de export per uitbetaling."
                  : "Mollie: the balance report lists every transfer to the bank with its amount. If the site's sum is equal, the payout matches without a check; if not, the difference is shown and the bank statement stays the proof. With the payments export the sum rarely matches: Mollie withholds fees and reserve per payout and releases older reserve, and that is only in the export per payout."}
              </p>
              <p>
                {nl
                  ? "SumUp: elke verkoop zegt in welke uitbetaling ze zat. De som van de verkopen min hun kosten is het bedrag dat SumUp overschreef; vink het af wanneer het op het uittreksel staat."
                  : "SumUp: every sale says which payout it was in. The sum of the sales minus their fees is what SumUp transferred; check it off when it is on the bank statement."}
              </p>
            </InfoTip>
          </div>
          <div className="mt-3 space-y-3">
            {data.sources
              .filter((source) => data.payouts.some((payout) => payout.source === source))
              .map((source) => {
                const payouts = data.payouts.filter((payout) => payout.source === source);
                const done = payouts.filter((payout) => payout.state === "checked" || payout.state === "provider").length;
                const differs = payouts.filter((payout) => payout.state === "differs" || payout.state === "changed").length;
                return (
                  <AdminDisclosure
                    key={source}
                    variant="row"
                    defaultOpen={done < payouts.length}
                    summary={
                      <>
                        <span className="font-medium">{SOURCE_LABELS[source]}</span>
                        <span className="text-sm text-vtk-muted">
                          {" · "}
                          {nl
                            ? `${payouts.length === 1 ? "1 uitbetaling" : `${payouts.length} uitbetalingen`}, ${done} in orde`
                            : `${payouts.length === 1 ? "1 payout" : `${payouts.length} payouts`}, ${done} done`}
                          {differs ? (nl ? `, ${differs} met een verschil` : `, ${differs} with a difference`) : ""}
                        </span>
                      </>
                    }
                  >
                    <div className="relative overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-vtk-blue/12 text-left text-xs uppercase tracking-wide text-vtk-muted">
                            <th className="px-3 py-2">{nl ? "Uitbetaling" : "Payout"}</th>
                            <th className="px-3 py-2 text-right">{nl ? "Betalingen" : "Payments"}</th>
                            <th className="px-3 py-2 text-right">{nl ? "Terug" : "Refunds"}</th>
                            <th className="px-3 py-2 text-right">{nl ? "Kosten" : "Fees"}</th>
                            <th className="px-3 py-2 text-right">{nl ? "Reserve" : "Reserve"}</th>
                            <th className="px-3 py-2 text-right">{nl ? "Totaal" : "Total"}</th>
                            <th className="px-3 py-2">{nl ? "Uittreksel" : "Statement"}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payouts.map((payout) => (
                            <tr key={payout.reference} className="border-b border-vtk-blue/8 align-top last:border-0">
                              <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                                {payout.reference}
                                <span className="block text-xs text-vtk-muted">
                                  {payout.paidOn
                                    ? `${nl ? "overgeschreven" : "transferred"} ${payout.paidOn.toLocaleDateString(nl ? "nl-BE" : "en-GB", { timeZone: "UTC" })}`
                                    : `${day(payout.firstAt)} ${nl ? "tot" : "to"} ${day(payout.lastAt)}`}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{money(payout.payments)}</td>
                              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{money(payout.refunds)}</td>
                              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{money(payout.fees)}</td>
                              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">{money(payout.reserve)}</td>
                              <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                                <span className="font-semibold">{formatEuro(payout.total, locale)}</span>
                                {payout.providerAmount !== null && payout.providerAmount !== payout.total ? (
                                  <span className="block text-xs text-vtk-warn">
                                    {nl ? "Mollie: " : "Mollie: "}
                                    {formatEuro(payout.providerAmount, locale)}
                                  </span>
                                ) : null}
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-start gap-2">
                                  <PayoutCheckButton
                                    reference={payout.reference}
                                    checked={payout.check !== null}
                                    action={setPayoutCheckAction}
                                    locale={locale}
                                    errorMessages={errorMessages}
                                  />
                                  <span className={`text-xs ${payout.state === "changed" || payout.state === "differs" ? "text-vtk-warn" : "text-vtk-muted"}`}>
                                    {payout.state === "changed" && payout.check
                                      ? nl
                                        ? `Afgevinkt op ${formatEuro(payout.check.amountCents, locale)}, nu anders`
                                        : `Checked at ${formatEuro(payout.check.amountCents, locale)}, now different`
                                      : payout.state === "checked" && payout.check
                                        ? `${day(payout.check.checkedAt)}${payout.check.checkedByName ? `, ${payout.check.checkedByName}` : ""}`
                                        : payout.state === "provider"
                                          ? nl
                                            ? "Gelijk aan de overschrijving van Mollie"
                                            : "Equal to the Mollie transfer"
                                          : payout.state === "differs" && payout.providerAmount !== null
                                            ? nl
                                              ? `${formatEuro(payout.total - payout.providerAmount, locale)} verschil met de overschrijving`
                                              : `${formatEuro(payout.total - payout.providerAmount, locale)} off from the transfer`
                                            : null}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </AdminDisclosure>
                );
              })}
          </div>
        </section>
      ) : null}

      {overview.accounts.length > 0 ? (
        <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
          <h2 className="text-lg font-semibold">{nl ? "Per bankrekening" : "Per bank account"}</h2>
          <table className="mt-3 text-sm">
            <tbody>
              {overview.accounts.map((account) => (
                <tr key={account.bankAccount ?? "none"} className="border-b border-vtk-blue/8 last:border-0">
                  <td className="py-2 pr-8">
                    {account.bankAccount ?? (
                      <Link href={`${base}/admin/inkomsten/instellingen`} className="text-vtk-muted underline">
                        {nl ? "Rekening niet ingesteld" : "Account not set"}
                      </Link>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatEuro(account.total, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

    </div>
  );
}
