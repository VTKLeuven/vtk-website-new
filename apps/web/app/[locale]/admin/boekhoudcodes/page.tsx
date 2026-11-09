import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { orderAccountingCodes } from "@/lib/accounting/codes";
import { getMembershipConfig } from "@/lib/membership";
import { membershipAccountingCode } from "@/lib/accounting/server";
import { ticketTotalsPerCode } from "@/lib/accounting/ticketTotals";
import { AccountingCodesEditor, type AccountingCodeUsageRow } from "./AccountingCodesEditor";
import { CodesUploadForm } from "./CodesUploadForm";
import { importAccountingCodesAction, previewAccountingCodesImportAction } from "@/app/actions/accountingCodes";

/**
 * De lijst waaruit een ticketverkoop en het lidmaatschap hun boekhoudcode
 * kiezen, met per code wat er via de ticketverkoop binnenkwam. Welke code een
 * verkoop gebruikt, staat in het eventformulier; de uitsplitsing per event en
 * betaalwijze in de ticketstatistieken.
 */
export default async function AdminAccountingCodes({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("accounting.manage");

  const [rows, membershipConfig, orderSums] = await Promise.all([
    prisma.accountingCode.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        parentId: true,
        sortOrder: true,
        _count: { select: { ticketEvents: true, eventTemplates: true } },
      },
    }),
    getMembershipConfig(),
    // Dezelfde bestellingen als de omzet per event: betaald, ook als er later
    // iets terugbetaald werd.
    prisma.ticketOrder.groupBy({
      by: ["accountingCode", "accountingCodeName"],
      where: { status: { in: ["PAID", "PARTIALLY_REFUNDED", "REFUNDED"] } },
      _sum: { totalCents: true, refundedCents: true },
    }),
  ]);
  const membershipCode = await membershipAccountingCode(membershipConfig.accountingCodeId);

  const totals = ticketTotalsPerCode(
    rows,
    orderSums.map((sum) => ({
      accountingCode: sum.accountingCode,
      accountingCodeName: sum.accountingCodeName,
      totalCents: sum._sum.totalCents ?? 0,
      refundedCents: sum._sum.refundedCents ?? 0,
    })),
  );

  const countsById = new Map(rows.map((row) => [row.id, row._count]));
  const codes: AccountingCodeUsageRow[] = orderAccountingCodes(rows).map((row) => ({
    ...row,
    ticketEvents: countsById.get(row.id)?.ticketEvents ?? 0,
    templates: countsById.get(row.id)?.eventTemplates ?? 0,
    membership: membershipCode?.code === row.code,
    ticketCents: totals.byId.get(row.id) ?? null,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Boekhoudcodes" : "Accounting codes"}</h1>
        <p className="mt-1 max-w-3xl text-sm text-[#5c667f]">
          {nl
            ? "De codes waaruit een ticketverkoop en het lidmaatschap kiezen. Een subcode is de analytische code onder haar hoofdrekening en staat er met een spatie achter (700120 12002), zo komt ze vooraan in de betaalinfo bij Mollie en Bancontact. Klik op een rij om ze te bewerken; sleep aan de greep om de lijst te ordenen."
            : "The codes a ticket sale and the membership choose from. A sub code is the analytic code under its main account and follows it after a space (700120 12002); that is how it leads the payment details at Mollie and Bancontact. Click a row to edit it; drag the handle to order the list."}
        </p>
      </header>

      <AccountingCodesEditor locale={locale} codes={codes} unlisted={totals.unlisted} />

      <section className="rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <h2 className="text-lg font-semibold">{nl ? "De lijst uploaden als CSV" : "Upload the list as CSV"}</h2>
        <p className="mt-1 mb-3 max-w-3xl text-sm text-vtk-muted">
          {nl
            ? "Staat de lijst in een rekenblad, upload dat dan in plaats van elke code met de hand in te tikken. Nieuwe codes komen erbij en namen worden bijgewerkt; een code die niet in het bestand staat, blijft staan."
            : "If the list is in a spreadsheet, upload it instead of typing every code by hand. New codes are added and names updated; a code that is not in the file stays."}
        </p>
        <CodesUploadForm
          locale={locale}
          previewAction={previewAccountingCodesImportAction}
          importAction={importAccountingCodesAction}
        />
      </section>
    </div>
  );
}
