import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { orderAccountingCodes } from "@/lib/accounting/codes";
import { getMembershipConfig } from "@/lib/membership";
import { membershipAccountingCode } from "@/lib/accounting/server";
import { AccountingCodesEditor, type AccountingCodeUsageRow } from "./AccountingCodesEditor";

/**
 * De lijst waaruit een ticketverkoop en het lidmaatschap hun boekhoudcode
 * kiezen. Enkel de lijst: welke code een verkoop gebruikt, staat in het
 * eventformulier, en hoeveel er onder een code verkocht is in de
 * ticketstatistieken (per boekhoudcode).
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

  const [rows, membershipConfig] = await Promise.all([
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
  ]);
  const membershipCode = await membershipAccountingCode(membershipConfig.accountingCodeId);

  const countsById = new Map(rows.map((row) => [row.id, row._count]));
  const codes: AccountingCodeUsageRow[] = orderAccountingCodes(rows).map((row) => ({
    ...row,
    ticketEvents: countsById.get(row.id)?.ticketEvents ?? 0,
    templates: countsById.get(row.id)?.eventTemplates ?? 0,
    membership: membershipCode?.code === row.code,
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

      <AccountingCodesEditor locale={locale} codes={codes} />
    </div>
  );
}
