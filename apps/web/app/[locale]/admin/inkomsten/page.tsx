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
import { loadIncomeOverview } from "@/lib/inkomsten/server";
import { closeIncomePeriodAction, setPayoutCheckAction } from "@/app/actions/inkomsten";
import { CheckIcon, InfoIcon } from "@/components/ui/icons";
import { InfoTip } from "@/components/ui/InfoTip";
import { AdminDisclosure } from "@/components/admin/AdminDisclosure";
import { PayoutCheckButton } from "./PayoutCheckButton";
import { BankSection } from "./BankSection";
import { displayAccount } from "@/lib/inkomsten/labels";
import { incomeErrorMessages } from "./messages";
import { SOURCE_LABELS, checkText, periodLabel, quarterOptions } from "./shared";

/**
 * Het overzicht dat het rekenblad "Oriëntatie Online Inkomsten" vervangt: per
 * boekhoudcode wat er in een periode via Payconiq, Mollie, SumUp en Europabank
 * binnenkwam, met een kolom per bron die ooit opgeladen werd. Alles telt in de
 * maand van de betaling; bij Mollie maakt de berekende wijziging van de
 * dynamische reserve de kolom gelijk aan wat Mollie overschreef.
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

  const data = await loadIncomeOverview(from, to);
  const { overview } = data;
  const money = (cents: number) => (cents === 0 ? "" : formatEuro(cents, locale));
  const ymdLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString(nl ? "nl-BE" : "en-GB", { timeZone: "UTC" });
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
  /** "2026-09-28" als "28 sep." */
  const dayOf = (ymd: string) => new Date(`${ymd}T00:00:00Z`).toLocaleDateString(nl ? "nl-BE" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
  const reserve = data.mollieReserve;
  const separateFeeSources = data.sources.filter((source) => overview.separateFees.bySource[source] !== 0);

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
        <p className="mt-1 max-w-3xl text-sm text-vtk-muted">
          {nl
            ? "Wat er via Payconiq, Mollie, SumUp en Europabank binnenkwam, per boekhoudcode, in de maand van de betaling. Bij Mollie maakt de wijziging van de dynamische reserve de kolom gelijk aan wat Mollie overschreef."
            : "What came in through Payconiq, Mollie, SumUp and Europabank, per accounting code, in the month of the payment. For Mollie the change in the rolling reserve makes the column equal to what Mollie transferred."}
        </p>
      </header>

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
              {nl ? "Upload een export" : "Upload an export"}
            </Link>
            .
          </p>
        ) : (
          <div className="relative mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/12 text-left text-xs uppercase tracking-wide text-vtk-muted">
                  <th className="px-3 py-2">{nl ? "Code" : "Code"}</th>
                  <th className="px-3 py-2">Post</th>
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
                {overview.reserve.count > 0 || reserve.status === "unknown" ? (
                  <tr className="border-b border-vtk-blue/8">
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-1">
                        {nl ? "Wijziging dynamische reserve" : "Change in rolling reserve"}
                        {reserve.status === "known" ? (
                          <InfoTip label={nl ? "Hoe de site de reserve berekent" : "How the site computes the reserve"}>
                            <p>
                              {nl
                                ? "Wat Mollie in de periode naar de bank overschreef, min alles van Mollie in de periode. Negatief: Mollie hield geld bij dat nog niet overgeschreven is. Positief: Mollie schreef ook betalingen van eind vorige periode over. Zo is de Mollie-kolom gelijk aan wat Mollie overschreef, op wat niet meetelt na."
                                : "What Mollie transferred to the bank in the period, minus everything from Mollie in the period. Negative: Mollie kept money it has not transferred yet. Positive: Mollie also transferred payments from the end of the previous period. That makes the Mollie column equal to what Mollie transferred, except for what does not count."}
                            </p>
                            {reserve.accounts.map((account) => (
                              <p key={account.bankAccount ?? "none"}>
                                {account.bankAccount ?? (nl ? "Rekening niet ingesteld" : "Account not set")}
                                {": "}
                                {nl
                                  ? `overgeschreven ${formatEuro(account.transfersCents, locale)} in ${account.transferCount === 1 ? "1 overschrijving" : `${account.transferCount} overschrijvingen`}${account.lastTransferOn ? ` (de laatste op ${dayOf(account.lastTransferOn)})` : ""}; betalingen ${formatEuro(account.paymentsCents, locale)}${account.refundsCents ? `, terugbetalingen ${formatEuro(account.refundsCents, locale)}` : ""}, kosten ${formatEuro(account.feesCents, locale)}${account.storedReserveCents ? `, reserveregels van Mollie ${formatEuro(account.storedReserveCents, locale)}` : ""}. Wijziging: ${formatEuro(account.lineCents, locale)}.`
                                  : `transferred ${formatEuro(account.transfersCents, locale)} in ${account.transferCount === 1 ? "1 transfer" : `${account.transferCount} transfers`}${account.lastTransferOn ? ` (the last on ${dayOf(account.lastTransferOn)})` : ""}; payments ${formatEuro(account.paymentsCents, locale)}${account.refundsCents ? `, refunds ${formatEuro(account.refundsCents, locale)}` : ""}, fees ${formatEuro(account.feesCents, locale)}${account.storedReserveCents ? `, Mollie's own reserve rows ${formatEuro(account.storedReserveCents, locale)}` : ""}. Change: ${formatEuro(account.lineCents, locale)}.`}
                                {account.notCountedCents
                                  ? nl
                                    ? ` Wat niet meetelt (${formatEuro(account.notCountedCents, locale)}, uitgesloten of kosten met een aparte factuur) zit er ook in, dus de kolom wijkt daarmee af van de overschrijvingen.`
                                    : ` What does not count (${formatEuro(account.notCountedCents, locale)}, excluded or fees on a separate invoice) is in it too, so the column differs from the transfers by that.`
                                  : ""}
                              </p>
                            ))}
                          </InfoTip>
                        ) : null}
                      </span>
                    </td>
                    {reserve.status === "unknown" ? (
                      <>
                        {data.sources.map((source) => (
                          <td key={source} className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                            {source === "MOLLIE" ? (
                              <Link href={`${base}/admin/inkomsten/opladen`} className="text-vtk-warn underline">
                                {nl ? "onbekend" : "unknown"}
                              </Link>
                            ) : (
                              money(overview.reserve.bySource[source])
                            )}
                          </td>
                        ))}
                        <td className="px-3 py-2" />
                      </>
                    ) : (
                      // De berekende reserve heeft geen rijen in Transacties: een link
                      // zou er een ander totaal tonen dan hier.
                      lineCells(overview.reserve, reserve.status === "known" ? undefined : { soort: "reserve" })
                    )}
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
          {separateFeeSources.length > 0 ? (
            <li>
              {nl ? "De kosten van " : "The fees of "}
              {separateFeeSources.map((source, index) => (
                <span key={source}>
                  {index > 0 ? (index === separateFeeSources.length - 1 ? (nl ? " en " : " and ") : ", ") : ""}
                  <Link href={transactionsHref({ soort: "kosten", bron: source.toLowerCase() })} className="underline">
                    {SOURCE_LABELS[source]} ({formatEuro(overview.separateFees.bySource[source], locale)})
                  </Link>
                </span>
              ))}
              {nl
                ? " staan niet in het overzicht: daar komt een aparte factuur van ("
                : " are not in the overview: they come on a separate invoice ("}
              <Link href={`${base}/admin/inkomsten/instellingen`} className="underline">
                {nl ? "Instellingen" : "Settings"}
              </Link>
              {nl ? "). In de uitbetalingen tellen ze wel mee." : "). They do count in the payouts."}
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
                  ? "Mollie: het balansrapport noemt elke overschrijving naar de bank met haar bedrag, en dat is het bedrag op het uittreksel. Is de som van de betalingen anders, dan hield Mollie iets bij (kosten of reserve) of gaf het oudere reserve vrij. Dat verschil zit in de wijziging van de dynamische reserve van het overzicht, dus de uitbetaling is in orde; het verschil staat er ter informatie bij."
                  : "Mollie: the balance report lists every transfer to the bank with its amount, and that is the amount on the bank statement. If the sum of the payments differs, Mollie kept something (fees or reserve) or released older reserve. That difference is in the change in the rolling reserve of the overview, so the payout is fine; the difference is shown for information."}
              </p>
              <p>
                {nl
                  ? "SumUp: elke verkoop zegt in welke uitbetaling ze zat. De som van de verkopen min hun kosten is het bedrag dat SumUp overschreef. Europabank: de OV-ref, één per kaartmerk en dag, het bruto min de commissie. Payconiq: enkel met de export die de payoutId noemt."
                  : "SumUp: every sale says which payout it was in. The sum of the sales minus their fees is what SumUp transferred. Europabank: the OV-ref, one per card brand and day, gross minus commission. Payconiq: only with the export that lists the payoutId."}
              </p>
              <p>
                {nl
                  ? "Bankafschrift: staat de uitbetaling op een opgeladen afschrift met hetzelfde bedrag, dan is ze in orde zonder vinkje. Bij Mollie volstaat dat de overschrijving zelf op de bank staat. Een vinkje met de hand gaat altijd voor."
                  : "Bank statement: if the payout is on an uploaded statement with the same amount, it is fine without a tick. For Mollie it is enough that the transfer itself is on the bank. A tick by hand always wins."}
              </p>
            </InfoTip>
          </div>
          <div className="mt-3 space-y-3">
            {data.sources
              .filter((source) => data.payouts.some((payout) => payout.source === source))
              .map((source) => {
                const payouts = data.payouts.filter((payout) => payout.source === source);
                const done = payouts.filter((payout) => ["checked", "bank", "provider", "differs"].includes(payout.state)).length;
                const differs = payouts.filter((payout) => payout.state === "changed").length;
                const bankDiffers = payouts.filter((payout) => payout.state === "bankDiffers").length;
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
                          {differs ? (nl ? `, ${differs} veranderd na het afvinken` : `, ${differs} changed after checking`) : ""}
                          {bankDiffers ? (nl ? `, ${bankDiffers} met een ander bedrag op de bank` : `, ${bankDiffers} with another amount on the bank`) : ""}
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
                                <Link
                                  href={`${base}/admin/inkomsten/transacties?${new URLSearchParams({ bron: payout.source.toLowerCase(), q: payout.reference }).toString()}`}
                                  className="underline-offset-2 hover:underline"
                                >
                                  {payout.reference}
                                </Link>
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
                                  <span className="block text-xs text-vtk-muted">
                                    {nl ? "overgeschreven" : "transferred"} {formatEuro(payout.providerAmount, locale)}
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
                                  <span className={`text-xs ${payout.state === "changed" || payout.state === "bankDiffers" ? "text-vtk-warn" : "text-vtk-muted"}`}>
                                    {payout.state === "bank" && payout.bank ? (
                                      <>
                                        {nl ? "Op het uittreksel van " : "On the statement of "}
                                        {ymdLabel(payout.bank.bookedOn)}
                                        {payout.account && payout.bank.account !== payout.account
                                          ? nl
                                            ? `, op ${displayAccount(payout.bank.account)}: een andere rekening dan bij het kanaal`
                                            : `, on ${displayAccount(payout.bank.account)}: another account than the channel's`
                                          : ""}
                                      </>
                                    ) : payout.state === "bankDiffers" && payout.bank ? (
                                      nl ? (
                                        `Op de bank ${ymdLabel(payout.bank.bookedOn)}: ${formatEuro(payout.bank.amountCents, locale)}, ${formatEuro(payout.bank.amountCents - payout.total, locale)} verschil`
                                      ) : (
                                        `On the bank ${ymdLabel(payout.bank.bookedOn)}: ${formatEuro(payout.bank.amountCents, locale)}, ${formatEuro(payout.bank.amountCents - payout.total, locale)} difference`
                                      )
                                    ) : null}
                                    {payout.state === "bank" || payout.state === "bankDiffers"
                                      ? null
                                      : payout.state === "changed" && payout.check
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
                                            ? payout.total > payout.providerAmount
                                              ? nl
                                                ? `${formatEuro(payout.total - payout.providerAmount, locale)} hield Mollie bij (in de reserve)`
                                                : `${formatEuro(payout.total - payout.providerAmount, locale)} kept by Mollie (in the reserve)`
                                              : nl
                                                ? `${formatEuro(payout.providerAmount - payout.total, locale)} meer overgeschreven (vrijgegeven reserve)`
                                                : `${formatEuro(payout.providerAmount - payout.total, locale)} more transferred (released reserve)`
                                            : null}
                                    {payout.missingOnStatement && payout.state !== "checked" ? (
                                      <span className="block text-vtk-warn">
                                        {nl ? "Niet op het afschrift van " : "Not on the statement of "}
                                        {payout.account ? displayAccount(payout.account) : ""}
                                      </span>
                                    ) : null}
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

      {data.bank ? <BankSection bank={data.bank} nl={nl} locale={locale} base={base} from={from} to={to} /> : null}

      {overview.accounts.length > 0 ? (
        <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
          <h2 className="text-lg font-semibold">{nl ? "Per bankrekening" : "Per bank account"}</h2>
          {separateFeeSources.length > 0 ? (
            <p className="mt-1 text-sm text-vtk-muted">
              {nl
                ? "Zoals geboekt: zonder de kosten met een aparte factuur. Op de bank kwam dat bedrag minder binnen."
                : "As booked: without the fees on a separate invoice. The bank received that much less."}
            </p>
          ) : null}
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
