import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { IconLink } from "@/components/ui/IconButton";
import { DownloadIcon } from "@/components/ui/icons";
import { hasLocale } from "@/lib/locale";
import { currentWorkingYear, formatWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { formatEuro, formatSpentOn, toDateInputValue } from "@/lib/rekeningen/expenses";
import { brusselsToday, cashRegisterAccess } from "@/lib/kassas/server";
import { cashBookKindLabel, cashBookTotals, cashEffectCents } from "@/lib/kassas/cashBook";
import { saveCashBookEntryAction } from "@/app/actions/cashBook";
import { CashBookActions } from "./CashBookActions";
import { cashBookErrorMessages } from "./messages";

/**
 * Het kasboek van Beheer: cash dat naar of van de bank ging, en wat er met cash
 * betaald werd (met de factuur erbij). Per werkingsjaar, zoals de rekeningen.
 * Zie docs/design-decisions.md, "Het kasboek van Beheer".
 */
export default async function Kasboek({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const access = await cashRegisterAccess(`${base}/inloggen?next=${base}/admin/kassas/kasboek`);
  if (!access.canManage) {
    return (
      <p className="text-sm text-vtk-muted">
        {nl ? "Het kasboek is enkel voor wie de kassa's beheert." : "The cash book is only for those who manage the registers."}
      </p>
    );
  }

  const { jaar } = await searchParams;
  const parsedYear = Number(jaar);
  const year = Number.isInteger(parsedYear) && parsedYear > 2000 ? parsedYear : currentWorkingYear();

  const [entries, years] = await Promise.all([
    prisma.cashBookEntry.findMany({
      where: { workingYear: year },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.cashBookEntry.findMany({ distinct: ["workingYear"], select: { workingYear: true } }),
  ]);

  const euro = (cents: number) => formatEuro(cents, locale);
  const signed = (cents: number) => (cents > 0 ? `+${euro(cents)}` : cents < 0 ? `−${euro(-cents)}` : euro(0));
  const totals = cashBookTotals(entries);
  const tabs = workingYearTabs(years.map((row) => row.workingYear));
  const today = toDateInputValue(brusselsToday());

  const stats = [
    { label: nl ? "Afgehaald" : "Withdrawn", value: euro(totals.WITHDRAWAL) },
    { label: nl ? "Gestort" : "Deposited", value: euro(totals.DEPOSIT) },
    { label: nl ? "Aankopen" : "Purchases", value: euro(totals.PURCHASE) },
    {
      label: nl ? "Netto in de kas" : "Net into the cash",
      value: signed(totals.netCents),
      note: nl ? "afgehaald min gestort en aankopen" : "withdrawn minus deposits and purchases",
    },
  ];

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <p className="max-w-3xl text-sm text-vtk-body">
          {nl
            ? "Wat Beheer met het cash van VTK doet buiten de kassa's om: geld van de bank afhalen, cash op de bank storten, of iets met cash betalen. Bij een aankoop hoort altijd de factuur."
            : "What Administration does with VTK's cash outside the registers: withdrawing from the bank, depositing cash, or paying for something in cash. A purchase always comes with its invoice."}
        </p>
        <CashBookActions
          locale={locale}
          action={saveCashBookEntryAction}
          today={today}
          errorMessages={cashBookErrorMessages(locale)}
        />
      </section>

      <nav className="flex flex-wrap items-center gap-2" aria-label={nl ? "Werkingsjaar" : "Working year"}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">
          {nl ? "Jaar" : "Year"}
        </span>
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={`${base}/admin/kassas/kasboek?jaar=${tab}`}
            aria-current={tab === year ? "page" : undefined}
            className={`rounded-full border px-2.5 py-1 text-xs tabular-nums ${
              tab === year
                ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
                : "border-vtk-blue/15 text-vtk-body hover:bg-vtk-blue-soft/60"
            }`}
          >
            {formatWorkingYear(tab)}
          </Link>
        ))}
      </nav>

      <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-vtk-blue/12 bg-white p-4">
            <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">{stat.label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums text-vtk-ink">{stat.value}</dd>
            {stat.note && <dd className="mt-0.5 text-xs text-vtk-muted">{stat.note}</dd>}
          </div>
        ))}
      </dl>

      <section
        aria-label={nl ? `Kasboek ${formatWorkingYear(year)}` : `Cash book ${formatWorkingYear(year)}`}
        className="overflow-hidden rounded-2xl border border-vtk-blue/12 bg-white"
      >
        {entries.length === 0 ? (
          <p className="p-6 text-sm text-vtk-muted">
            {nl
              ? `Nog niets in het kasboek van ${formatWorkingYear(year)}. Kies hierboven Afhaling, Storting of Aankoop.`
              : `Nothing in the ${formatWorkingYear(year)} cash book yet. Choose Withdrawal, Deposit or Purchase above.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="vtk-kassa-table w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/10 text-left text-xs font-semibold text-vtk-muted">
                  <th scope="col" className="w-[110px] px-4 py-3">{nl ? "Datum" : "Date"}</th>
                  <th scope="col" className="w-[110px] px-4 py-3">{nl ? "Soort" : "Kind"}</th>
                  <th scope="col" className="px-4 py-3">{nl ? "Omschrijving" : "Description"}</th>
                  <th scope="col" className="w-[124px] px-4 py-3 text-right!">{nl ? "In de kas" : "Cash"}</th>
                  <th scope="col" className="w-[64px] px-4 py-3">
                    <span className="sr-only">{nl ? "Factuur" : "Invoice"}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vtk-blue/5">
                {entries.map((entry) => {
                  const href = `${base}/admin/kassas/kasboek/${entry.id}`;
                  const effect = cashEffectCents(entry);
                  return (
                    <LinkedRow key={entry.id} href={href} className="cursor-pointer transition-colors hover:bg-vtk-blue-soft/30">
                      <td data-label={nl ? "Datum" : "Date"} className="whitespace-nowrap px-4 py-3 tabular-nums text-vtk-body">
                        {formatSpentOn(entry.date, locale)}
                      </td>
                      <td data-label={nl ? "Soort" : "Kind"} className="whitespace-nowrap px-4 py-3 text-vtk-body">
                        {cashBookKindLabel(entry.kind, nl)}
                      </td>
                      <td data-wide className="px-4 py-3">
                        <Link href={href} className="font-medium text-vtk-ink hover:underline">
                          {entry.description}
                        </Link>
                        <span className="block text-xs text-vtk-muted">
                          {[entry.createdBy ? `${nl ? "door" : "by"} ${entry.createdBy.name}` : null, entry.note]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </td>
                      <td
                        data-label={nl ? "In de kas" : "Cash"}
                        className={`whitespace-nowrap px-4 py-3 text-right font-semibold tabular-nums ${
                          effect > 0 ? "text-vtk-ink" : "text-vtk-body"
                        }`}
                      >
                        {signed(effect)}
                      </td>
                      <td data-row-action data-label={nl ? "Factuur" : "Invoice"} className="px-4 py-2">
                        {entry.invoiceKey && (
                          <IconLink
                            href={`/api/admin/kassas/kasboek/${entry.id}/factuur`}
                            prefetch={false}
                            target="_blank"
                            rel="noopener"
                            label={nl ? "Factuur openen" : "Open invoice"}
                            srLabel={nl ? `Factuur openen: ${entry.description}` : `Open invoice: ${entry.description}`}
                          >
                            <DownloadIcon />
                          </IconLink>
                        )}
                      </td>
                    </LinkedRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
