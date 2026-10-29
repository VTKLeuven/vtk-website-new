import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { formatEuro } from "@/lib/rekeningen/expenses";
import { listAccountingCodes } from "@/lib/accounting/server";
import { dateToMonth } from "@/lib/inkomsten/parse";
import { INCOME_SOURCES } from "@/lib/inkomsten/overview";
import { countUnassigned, listIncomeChannels, listIncomeTransactions, TRANSACTION_PAGE } from "@/lib/inkomsten/server";
import { KIND_PARAMS, paramGetter, parseTransactionFilter, STATE_PARAMS } from "@/lib/inkomsten/transactionFilter";
import { changeIncomeTransactionsAction } from "@/app/actions/inkomsten";
import { IncomeNav } from "../IncomeNav";
import { incomeErrorMessages } from "../messages";
import { KIND_LABELS, monthLabel, RULE_LABELS, SOURCE_LABELS } from "../shared";
import { TransactionTable, type TransactionRow } from "./TransactionTable";

/** De parameters die de filter vormen; `pagina` hoort er niet bij. */
const FILTER_KEYS = ["bron", "kanaal", "status", "soort", "van", "tot", "code", "q"] as const;

/** De volledige lijst, te filteren en per pagina; een cel van het overzicht linkt hiernaartoe. */
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
  const get = paramGetter(query);
  const filter = parseTransactionFilter(get);
  const page = Math.max(1, Math.floor(Number(get("pagina")) || 1));
  const filterParams = new URLSearchParams();
  for (const key of FILTER_KEYS) if (get(key)) filterParams.set(key, get(key));
  const filterQuery = filterParams.toString();
  const pageHref = (target: number) => {
    const next = new URLSearchParams(filterParams);
    if (target > 1) next.set("pagina", String(target));
    const search = next.toString();
    return `${base}/admin/inkomsten/transacties${search ? `?${search}` : ""}`;
  };

  const [{ rows, total, totalCents, assignable }, openCount, codes, channels] = await Promise.all([
    listIncomeTransactions(filter, page),
    countUnassigned(),
    listAccountingCodes(),
    listIncomeChannels(),
  ]);
  const pages = Math.max(1, Math.ceil(total / TRANSACTION_PAGE));
  const errorMessages = incomeErrorMessages(locale);
  const dateTime = (value: Date) =>
    value.toLocaleString(nl ? "nl-BE" : "en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Brussels",
    });
  const number = (n: number) => n.toLocaleString(nl ? "nl-BE" : "en-GB");

  const tableRows: TransactionRow[] = rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    when: dateTime(row.occurredAt),
    month: row.periodMonth ? monthLabel(dateToMonth(row.periodMonth), nl) : null,
    source: SOURCE_LABELS[row.source],
    // Bij Mollie is het kanaal het ene account; dat zegt niets.
    channel: row.source !== "MOLLIE" && row.channel ? row.channel.label || row.channel.identifier : null,
    description: row.description,
    providerId: row.providerId,
    reference: row.reference,
    payoutReference: row.payoutReference,
    notPaidOut: row.source === "MOLLIE" && row.kind === "PAYMENT" && !row.payoutReference,
    amountCents: row.amountCents,
    refundedCents: row.refundedCents,
    code: row.accountingCode,
    codeName: row.accountingCodeName,
    rule: row.rule,
    excluded: row.excluded,
    assignedBy: row.assignedBy?.name ?? null,
    assignedAt: row.assignedAt ? dateTime(row.assignedAt) : null,
    ticketHref: row.ticketPayment ? `${base}/admin/tickets/${row.ticketPayment.order.eventId}` : null,
    cashRegister: row.cashRegister
      ? { href: `${base}/admin/kassas/${row.cashRegister.id}`, label: `${row.cashRegister.activity} (${row.cashRegister.postLabel})` }
      : null,
    linked: Boolean(row.ticketPayment || row.cashRegister || row.membershipPaymentId || row.uitleenPaymentId),
    locked: row.locked,
  }));

  const field = "rounded-lg border border-vtk-blue/15 px-2 py-1.5";
  const ruleParams = Object.entries(STATE_PARAMS).filter(([, state]) => state.type === "rule");

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Transacties" : "Transactions"}</h1>
        <p className="mt-1 max-w-3xl text-sm text-vtk-muted">
          {nl
            ? "Elke regel uit de opgeladen exports, met de code en de regel die ze gaf. Klik op een rij om de code te veranderen, of vink er meer aan om ze samen een code te geven. De periode is die van het overzicht: bij Mollie de maand van de uitbetaling."
            : "Every row from the uploaded exports, with the code and the rule that gave it. Click a row to change its code, or tick several to give them a code together. The period is the one of the overview: for Mollie the month of the payout."}
        </p>
      </header>

      <IncomeNav base={base} nl={nl} active="transacties" openCount={openCount} />

      <form className="flex flex-wrap items-end gap-3 text-sm" action={`${base}/admin/inkomsten/transacties`}>
        <label>
          <span className="block text-xs text-vtk-muted">{nl ? "Bron" : "Source"}</span>
          <select name="bron" defaultValue={filter.source?.toLowerCase() ?? ""} className={field}>
            <option value="">{nl ? "Alle" : "All"}</option>
            {INCOME_SOURCES.map((source) => (
              <option key={source} value={source.toLowerCase()}>
                {SOURCE_LABELS[source]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-xs text-vtk-muted">{nl ? "Kanaal" : "Channel"}</span>
          <select name="kanaal" defaultValue={filter.channelId ?? ""} className={`${field} max-w-56`}>
            <option value="">{nl ? "Alle" : "All"}</option>
            {INCOME_SOURCES.map((source) => {
              const own = channels.filter((channel) => channel.source === source);
              return own.length > 0 ? (
                <optgroup key={source} label={SOURCE_LABELS[source]}>
                  {own.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.label || channel.identifier}
                    </option>
                  ))}
                </optgroup>
              ) : null;
            })}
          </select>
        </label>
        <label>
          <span className="block text-xs text-vtk-muted">{nl ? "Stand" : "State"}</span>
          <select name="status" defaultValue={Object.hasOwn(STATE_PARAMS, get("status")) ? get("status") : ""} className={field}>
            <option value="">{nl ? "Alle" : "All"}</option>
            <option value="na-te-kijken">{nl ? "Na te kijken" : "To review"}</option>
            <option value="gekoppeld">{nl ? "Gekoppeld" : "Matched"}</option>
            <option value="telt-niet-mee">{nl ? "Telt niet mee" : "Does not count"}</option>
            <optgroup label={nl ? "Gekoppeld door" : "Matched by"}>
              {ruleParams.map(([param, state]) =>
                state.type === "rule" ? (
                  <option key={param} value={param}>
                    {nl ? RULE_LABELS[state.rule].nl : RULE_LABELS[state.rule].en}
                  </option>
                ) : null,
              )}
            </optgroup>
          </select>
        </label>
        <label>
          <span className="block text-xs text-vtk-muted">{nl ? "Soort" : "Kind"}</span>
          <select name="soort" defaultValue={Object.hasOwn(KIND_PARAMS, get("soort")) ? get("soort") : ""} className={field}>
            <option value="">{nl ? "Alle" : "All"}</option>
            {Object.entries(KIND_PARAMS).map(([param, kind]) => (
              <option key={param} value={param}>
                {nl ? KIND_LABELS[kind].nl : KIND_LABELS[kind].en}
              </option>
            ))}
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
        {filterQuery ? (
          <Link href={`${base}/admin/inkomsten/transacties`} className="py-1.5 text-vtk-muted underline">
            {nl ? "Filter wissen" : "Clear filter"}
          </Link>
        ) : null}
      </form>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
          {/* Het totaal is wat de cel van het overzicht toont waar je vandaan kwam. */}
          <p className="text-vtk-muted">
            {nl
              ? `${number(total)} ${total === 1 ? "transactie" : "transacties"}, samen ${formatEuro(totalCents, locale)}.`
              : `${number(total)} ${total === 1 ? "transaction" : "transactions"}, together ${formatEuro(totalCents, locale)}.`}
          </p>
          {pages > 1 ? (
            <nav className="flex items-center gap-3" aria-label={nl ? "Pagina's" : "Pages"}>
              <span className="text-vtk-muted tabular-nums">
                {nl
                  ? `${number((page - 1) * TRANSACTION_PAGE + 1)} tot ${number(Math.min(page * TRANSACTION_PAGE, total))}`
                  : `${number((page - 1) * TRANSACTION_PAGE + 1)} to ${number(Math.min(page * TRANSACTION_PAGE, total))}`}
              </span>
              {page > 1 ? (
                <Link href={pageHref(page - 1)} className="text-vtk-navy underline">
                  {nl ? "Vorige" : "Previous"}
                </Link>
              ) : null}
              {page < pages ? (
                <Link href={pageHref(page + 1)} className="text-vtk-navy underline">
                  {nl ? "Volgende" : "Next"}
                </Link>
              ) : null}
            </nav>
          ) : null}
        </div>
        {tableRows.length > 0 ? (
          <TransactionTable
            key={`${filterQuery}|${page}`}
            rows={tableRows}
            codes={codes}
            locale={locale}
            base={base}
            filterQuery={filterQuery}
            matching={assignable}
            action={changeIncomeTransactionsAction}
            errorMessages={errorMessages}
          />
        ) : page > 1 && total > 0 ? (
          <p className="mt-3 text-sm">
            <Link href={pageHref(1)} className="text-vtk-navy underline">
              {nl ? "Naar de eerste pagina" : "To the first page"}
            </Link>
          </p>
        ) : null}
      </section>
    </div>
  );
}
