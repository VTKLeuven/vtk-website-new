import Link from "@/components/ui/Link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { DeleteButton } from "@/components/ui/DeleteIconButton";
import { hasLocale } from "@/lib/locale";
import { formatWorkingYear } from "@/lib/workingYear";
import { formatEuro, formatSpentOn, formatSubmittedOn, toDateInputValue } from "@/lib/rekeningen/expenses";
import { amountInputValue } from "@/lib/kassas/kassa";
import { brusselsToday, cashRegisterAccess } from "@/lib/kassas/server";
import { cashBookKindLabel } from "@/lib/kassas/cashBook";
import { deleteCashBookEntryAction, saveCashBookEntryAction } from "@/app/actions/cashBook";
import { CashBookForm } from "../CashBookForm";
import { cashBookErrorMessages } from "../messages";

/** Eén regel uit het kasboek van Beheer, om aan te passen of te verwijderen. */
export default async function KasboekRegel({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const access = await cashRegisterAccess(`${base}/inloggen?next=${base}/admin/kassas/kasboek/${id}`);
  if (!access.canManage) notFound();
  const entry = await prisma.cashBookEntry.findUnique({
    where: { id },
    include: { createdBy: { select: { name: true } } },
  });
  if (!entry) notFound();

  const listHref = `${base}/admin/kassas/kasboek?jaar=${entry.workingYear}`;
  const kind = cashBookKindLabel(entry.kind, nl);
  const invoiceUrl = `/api/admin/kassas/kasboek/${entry.id}/factuur`;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Link href={listHref} className="text-sm text-vtk-muted underline underline-offset-4">
          {nl ? `Kasboek ${formatWorkingYear(entry.workingYear)}` : `Cash book ${formatWorkingYear(entry.workingYear)}`}
        </Link>
        <h2 className="text-lg font-semibold">
          {kind}: {entry.description}
        </h2>
        <p className="text-sm text-vtk-muted">
          {formatEuro(entry.amountCents, locale)} · {formatSpentOn(entry.date, locale)} ·{" "}
          {nl ? "ingegeven" : "entered"} {formatSubmittedOn(entry.createdAt, locale)}
          {entry.createdBy ? ` ${nl ? "door" : "by"} ${entry.createdBy.name}` : ""}
        </p>
        {entry.invoiceKey && (
          <a href={invoiceUrl} target="_blank" rel="noopener" className="vtk-link text-sm">
            {nl ? `Factuur openen (${entry.invoiceName ?? "factuur"})` : `Open invoice (${entry.invoiceName ?? "invoice"})`}
          </a>
        )}
      </header>

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <h2 className="mb-4 text-base font-semibold text-vtk-ink">{nl ? "Aanpassen" : "Edit"}</h2>
        <CashBookForm
          locale={locale}
          action={saveCashBookEntryAction}
          maxDate={toDateInputValue(brusselsToday())}
          errorMessages={cashBookErrorMessages(locale)}
          kindEditable
          values={{
            id: entry.id,
            kind: entry.kind,
            date: toDateInputValue(entry.date),
            amount: amountInputValue(entry.amountCents),
            description: entry.description,
            note: entry.note ?? "",
            invoice: entry.invoiceKey
              ? {
                  key: entry.invoiceKey,
                  name: entry.invoiceName ?? "factuur",
                  mime: entry.invoiceMime ?? "",
                  size: entry.invoiceSize ?? 0,
                  previewUrl: entry.invoiceMime?.startsWith("image/") ? invoiceUrl : "",
                }
              : undefined,
          }}
        />
      </section>

      <div>
        <DeleteButton
          action={deleteCashBookEntryAction}
          fields={{ id: entry.id, locale }}
          title={nl ? "Regel uit het kasboek verwijderen?" : "Delete this cash book line?"}
          description={
            nl
              ? `${kind} van ${formatEuro(entry.amountCents, locale)} op ${formatSpentOn(entry.date, locale)} ("${entry.description}") verdwijnt uit het kasboek${entry.invoiceKey ? ", samen met de factuur" : ""}. De andere regels en de totalen van de andere jaren blijven staan.`
              : `${kind} of ${formatEuro(entry.amountCents, locale)} on ${formatSpentOn(entry.date, locale)} ("${entry.description}") disappears from the cash book${entry.invoiceKey ? ", together with the invoice" : ""}. The other lines and other years' totals stay.`
          }
          confirmLabel={nl ? "Verwijderen" : "Delete"}
          cancelLabel={nl ? "Annuleren" : "Cancel"}
          errorMessages={cashBookErrorMessages(locale)}
          errorFallback={nl ? "Verwijderen mislukt." : "Could not delete."}
        >
          {nl ? "Regel verwijderen" : "Delete line"}
        </DeleteButton>
      </div>
    </div>
  );
}
