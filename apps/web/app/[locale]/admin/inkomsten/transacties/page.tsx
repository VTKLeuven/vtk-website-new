import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { ConfirmIconButton } from "@/components/ui/DeleteIconButton";
import { UndoIcon } from "@/components/ui/icons";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { formatEuro } from "@/lib/rekeningen/expenses";
import { parseMonth } from "@/lib/inkomsten/parse";
import { countUnassigned, listIncomeTransactions, TRANSACTION_PAGE, type TransactionFilter } from "@/lib/inkomsten/server";
import { resetIncomeAssignmentAction } from "@/app/actions/inkomsten";
import { IncomeNav } from "../IncomeNav";
import { incomeErrorMessages } from "../messages";
import { SOURCE_LABELS } from "../shared";

const STATES: Record<string, TransactionFilter["state"]> = {
  "na-te-kijken": "open",
  gekoppeld: "matched",
  "telt-niet-mee": "excluded",
};

const RULE_LABELS: Record<string, { nl: string; en: string }> = {
  MANUAL: { nl: "Met de hand", en: "By hand" },
  WEBSITE: { nl: "Betaling van de site", en: "Payment from the site" },
  CODE_IN_TEXT: { nl: "Code in de tekst", en: "Code in the text" },
  NAME_RULE: { nl: "Onthouden tekst", en: "Remembered text" },
  CHANNEL_DEFAULT: { nl: "Standaardcode van het kanaal", en: "Default code of the channel" },
};

const KIND_LABELS: Record<string, { nl: string; en: string }> = {
  FEE: { nl: "Kosten", en: "Fees" },
  RESERVE: { nl: "Reserve", en: "Reserve" },
  REFUND: { nl: "Terugbetaling", en: "Refund" },
};

/** De volledige lijst, te filteren; een cel van het overzicht linkt hiernaartoe. */
export default async function IncomeTransactionsPage({
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
  const one = (key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");
  const sourceParam = one("bron").toUpperCase();
  const filter: TransactionFilter = {
    source: sourceParam === "PAYCONIQ" || sourceParam === "MOLLIE" ? sourceParam : null,
    state: STATES[one("status")] ?? "all",
    from: parseMonth(one("van")),
    to: parseMonth(one("tot")),
    code: one("code").trim() || null,
    query: one("q").trim().slice(0, 100) || null,
  };

  const [{ rows, total }, openCount] = await Promise.all([listIncomeTransactions(filter), countUnassigned()]);
  const errorMessages = incomeErrorMessages(locale);
  const when = (value: Date) =>
    value.toLocaleString(nl ? "nl-BE" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Brussels",
    });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Transacties" : "Transactions"}</h1>
        <p className="mt-1 max-w-3xl text-sm text-vtk-muted">
          {nl
            ? "Elke regel uit de opgeladen exports, met de code en de regel die ze gaf. De periode is die van het overzicht: bij Mollie de maand van de uitbetaling."
            : "Every row from the uploaded exports, with the code and the rule that gave it. The period is the one of the overview: for Mollie the month of the payout."}
        </p>
      </header>

      <IncomeNav base={base} nl={nl} active="transacties" openCount={openCount} />

      <form className="flex flex-wrap items-end gap-3 text-sm" action={`${base}/admin/inkomsten/transacties`}>
        <label>
          <span className="block text-xs text-vtk-muted">{nl ? "Bron" : "Source"}</span>
          <select name="bron" defaultValue={filter.source?.toLowerCase() ?? ""} className="rounded-lg border border-vtk-blue/15 px-2 py-1.5">
            <option value="">{nl ? "Alle" : "All"}</option>
            <option value="payconiq">Payconiq</option>
            <option value="mollie">Mollie</option>
          </select>
        </label>
        <label>
          <span className="block text-xs text-vtk-muted">{nl ? "Stand" : "State"}</span>
          <select name="status" defaultValue={one("status")} className="rounded-lg border border-vtk-blue/15 px-2 py-1.5">
            <option value="">{nl ? "Alle" : "All"}</option>
            <option value="na-te-kijken">{nl ? "Na te kijken" : "To review"}</option>
            <option value="gekoppeld">{nl ? "Gekoppeld" : "Matched"}</option>
            <option value="telt-niet-mee">{nl ? "Telt niet mee" : "Does not count"}</option>
          </select>
        </label>
        <label>
          <span className="block text-xs text-vtk-muted">{nl ? "Van" : "From"}</span>
          <input type="month" name="van" defaultValue={filter.from ?? ""} className="rounded-lg border border-vtk-blue/15 px-2 py-1" />
        </label>
        <label>
          <span className="block text-xs text-vtk-muted">{nl ? "Tot en met" : "Up to"}</span>
          <input type="month" name="tot" defaultValue={filter.to ?? ""} className="rounded-lg border border-vtk-blue/15 px-2 py-1" />
        </label>
        <label>
          <span className="block text-xs text-vtk-muted">{nl ? "Code" : "Code"}</span>
          <input name="code" defaultValue={filter.code ?? ""} className="w-36 rounded-lg border border-vtk-blue/15 px-2 py-1" />
        </label>
        <label>
          <span className="block text-xs text-vtk-muted">{nl ? "Zoeken" : "Search"}</span>
          <input name="q" defaultValue={filter.query ?? ""} placeholder={nl ? "omschrijving of ID" : "description or ID"} className="w-48 rounded-lg border border-vtk-blue/15 px-2 py-1" />
        </label>
        <button type="submit" className="rounded-full border border-vtk-blue/15 px-3 py-1.5 hover:bg-vtk-blue-soft/60">
          {nl ? "Filteren" : "Filter"}
        </button>
      </form>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <p className="text-sm text-vtk-muted">
          {total > TRANSACTION_PAGE
            ? nl
              ? `De laatste ${TRANSACTION_PAGE} van ${total.toLocaleString("nl-BE")} transacties. Filter om de rest te zien.`
              : `The latest ${TRANSACTION_PAGE} of ${total.toLocaleString("en-GB")} transactions. Filter to see the rest.`
            : nl
              ? `${total} transacties.`
              : `${total} transactions.`}
        </p>
        {rows.length > 0 ? (
          <div className="relative mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/12 text-left text-xs uppercase tracking-wide text-vtk-muted">
                  <th className="px-3 py-2">{nl ? "Wanneer" : "When"}</th>
                  <th className="px-3 py-2">{nl ? "Kanaal" : "Channel"}</th>
                  <th className="px-3 py-2">{nl ? "Omschrijving" : "Description"}</th>
                  <th className="px-3 py-2 text-right">{nl ? "Bedrag" : "Amount"}</th>
                  <th className="px-3 py-2">{nl ? "Code" : "Code"}</th>
                  <th className="px-3 py-2">{nl ? "Waarom" : "Why"}</th>
                  <th className="px-3 py-2">
                    <span className="sr-only">{nl ? "Acties" : "Actions"}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const kind = KIND_LABELS[row.kind];
                  const rule = row.rule ? RULE_LABELS[row.rule] : null;
                  const eventId = row.ticketPayment?.order.eventId;
                  return (
                    <tr key={row.id} className="border-b border-vtk-blue/8 align-top last:border-0">
                      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                        {when(row.occurredAt)}
                        {row.source === "MOLLIE" && row.kind === "PAYMENT" && !row.payoutReference ? (
                          <span className="block text-xs text-vtk-muted">{nl ? "nog niet uitbetaald" : "not paid out yet"}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {SOURCE_LABELS[row.source]}
                        {row.source === "PAYCONIQ" && row.channel ? (
                          <span className="block text-xs text-vtk-muted">{row.channel.label || row.channel.identifier}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {kind ? <span className="mr-1 text-xs font-medium uppercase text-vtk-muted">{nl ? kind.nl : kind.en}</span> : null}
                        {row.description ?? ""}
                        {row.providerId ? <span className="block text-xs text-vtk-muted break-all">{row.providerId}</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                        {formatEuro(row.amountCents, locale)}
                        {row.refundedCents ? (
                          <span className="block text-xs text-vtk-muted">
                            {nl ? "teruggestort " : "refunded "}
                            {formatEuro(row.refundedCents, locale)}
                          </span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {row.excluded ? (
                          <span className="text-vtk-muted">{nl ? "telt niet mee" : "does not count"}</span>
                        ) : row.accountingCode ? (
                          <>
                            <span className="tabular-nums">{row.accountingCode}</span>
                            <span className="block text-xs text-vtk-muted">{row.accountingCodeName}</span>
                          </>
                        ) : row.kind === "PAYMENT" || row.kind === "REFUND" ? (
                          <Link href={`${base}/admin/inkomsten/na-te-kijken`} className="text-vtk-warn underline">
                            {nl ? "na te kijken" : "to review"}
                          </Link>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        {rule ? (nl ? rule.nl : rule.en) : ""}
                        {row.rule === "MANUAL" && row.assignedBy?.name ? (
                          <span className="block text-xs text-vtk-muted">{row.assignedBy.name}</span>
                        ) : null}
                        {eventId ? (
                          <Link href={`${base}/admin/tickets/${eventId}`} className="block text-xs text-vtk-navy underline">
                            {nl ? "Ticketverkoop" : "Ticket sale"}
                          </Link>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {row.rule === "MANUAL" ? (
                          <ConfirmIconButton
                            icon={<UndoIcon />}
                            action={resetIncomeAssignmentAction}
                            fields={{ id: row.id }}
                            label={nl ? "Toewijzing wissen" : "Clear assignment"}
                            srLabel={nl ? `Toewijzing wissen: ${row.description ?? row.id}` : `Clear assignment: ${row.description ?? row.id}`}
                            title={nl ? "Toewijzing met de hand wissen?" : "Clear the manual assignment?"}
                            description={
                              nl
                                ? "De koppelregels nemen deze transactie weer over. Past er geen, dan staat ze opnieuw bij Na te kijken. Andere transacties uit dezelfde groep houden hun code."
                                : "The matching rules take this transaction over again. If none fits, it is back under To review. Other transactions from the same group keep their code."
                            }
                            confirmLabel={nl ? "Wissen" : "Clear"}
                            cancelLabel={nl ? "Annuleren" : "Cancel"}
                            successMessage={nl ? "Toewijzing gewist." : "Assignment cleared."}
                            errorMessages={errorMessages}
                          />
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
