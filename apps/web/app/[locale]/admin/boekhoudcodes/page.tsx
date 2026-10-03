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
        _count: { select: { ticketEvents: true } },
      },
    }),
    getMembershipConfig(),
  ]);
  const membershipCode = await membershipAccountingCode(membershipConfig.accountingCodeId);

  const eventsById = new Map(rows.map((row) => [row.id, row._count.ticketEvents]));
  const codes: AccountingCodeUsageRow[] = orderAccountingCodes(rows).map((row) => ({
    ...row,
    ticketEvents: eventsById.get(row.id) ?? 0,
    membership: membershipCode?.code === row.code,
  }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Boekhoudcodes" : "Accounting codes"}</h1>
        <p className="mt-1 max-w-3xl text-sm text-[#5c667f]">
          {nl
            ? "De codes waaruit een ticketverkoop en het lidmaatschap kiezen. De gekozen code staat vooraan in de betaalinfo bij Mollie en Bancontact, zodat je een betaling of een uitbetaling per code kan opsplitsen. Wat al verkocht is, houdt de code waaronder het betaald werd, ook als je die hier aanpast of verwijdert."
            : "The codes a ticket sale and the membership choose from. The chosen code leads the payment details at Mollie and Bancontact, so you can split a payment or a payout per code. What has been sold keeps the code it was paid under, even if you change or delete it here."}
        </p>
      </header>

      <AccountingCodesEditor locale={locale} codes={codes} />
    </div>
  );
}
