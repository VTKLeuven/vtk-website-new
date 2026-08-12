import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { TheokotAdminNav } from "../TheokotAdminNav";
import { PickupCounter } from "@/components/theokot/PickupCounter";

import "@/app/design/vtk-basic.css";

export default async function TheokotPickupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/theokot/afhalen`);
  const has = (p: string) => session.user.isSuperAdmin || session.permissions.includes(p);
  const caps = { manage: has("theokot.manage"), pickup: has("theokot.pickup") };

  if (!caps.pickup) {
    return <p className="text-sm text-zinc-500">{nl ? "Geen toegang." : "No access."}</p>;
  }

  const [redemptions, redemptionCount, redemptionTotal, redemptionStudents] = await Promise.all([
    prisma.theokotVoucherRedemption.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        user: { select: { name: true, rNumber: true } },
        processedBy: { select: { name: true } },
        order: { select: { session: { select: { date: true } } } },
      },
    }),
    prisma.theokotVoucherRedemption.count(),
    prisma.theokotVoucherRedemption.aggregate({ _sum: { amount: true } }),
    prisma.theokotVoucherRedemption.groupBy({ by: ["userId"] }),
  ]);
  const dateTimeFormatter = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const dayFormatter = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    dateStyle: "medium",
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Theokot · {nl ? "Afhaalbalie" : "Pickup counter"}</h1>
        <Link
          href={`${base}/theokot/balie`}
          target="_blank"
          className="rounded-full border border-vtk-blue/15 px-4 py-2 text-sm text-vtk-ink hover:bg-vtk-blue-soft/60"
        >
          {nl ? "Open op aparte pagina ↗" : "Open on separate page ↗"}
        </Link>
      </div>
      <TheokotAdminNav base={base} nl={nl} active="afhalen" caps={caps} />
      <p className="text-sm text-[#5c667f]">
        {nl
          ? "De aparte pagina toont enkel de afhaalbalie (zonder admin-menu) — geef die link aan shifters die enkel broodjes mogen uitdelen."
          : "The separate page shows only the pickup counter (no admin menu) — share it with shifters who may only hand out sandwiches."}
      </p>
      <PickupCounter nl={nl} />

      <section className="space-y-3" aria-labelledby="voucher-history-heading">
        <div>
          <h2 id="voucher-history-heading" className="text-xl font-semibold text-vtk-ink">
            {nl ? "Betalingen met openstaande bonnetjes" : "Payments with outstanding vouchers"}
          </h2>
          <p className="mt-1 text-sm text-[#5c667f]">
            {nl
              ? "Auditlog van medewerkersbonnetjes die digitaal aan de afhaalbalie werden gebruikt."
              : "Audit log of staff vouchers used digitally at the pickup counter."}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="p-4">
            <div className="text-2xl font-semibold text-vtk-ink">{redemptionStudents.length}</div>
            <div className="text-sm text-[#5c667f]">{nl ? "unieke studenten" : "unique students"}</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-semibold text-vtk-ink">{redemptionCount}</div>
            <div className="text-sm text-[#5c667f]">{nl ? "digitale betalingen" : "digital payments"}</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-semibold text-vtk-ink">
              {redemptionTotal._sum.amount ?? 0}
            </div>
            <div className="text-sm text-[#5c667f]">{nl ? "bonnetjes gebruikt" : "vouchers used"}</div>
          </Card>
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-vtk-blue-soft text-left">
              <tr>
                <th className="px-4 py-2">{nl ? "Student" : "Student"}</th>
                <th className="px-4 py-2">{nl ? "Gebruikt op" : "Used at"}</th>
                <th className="px-4 py-2">{nl ? "Afhaaldag" : "Pickup day"}</th>
                <th className="px-4 py-2">{nl ? "Bonnetjes" : "Vouchers"}</th>
                <th className="px-4 py-2">{nl ? "Verwerkt door" : "Processed by"}</th>
              </tr>
            </thead>
            <tbody>
              {redemptions.map((redemption) => (
                <tr key={redemption.id} className="border-t border-zinc-200">
                  <td className="px-4 py-3">
                    <span className="block font-medium text-vtk-ink">{redemption.user.name}</span>
                    <span className="text-xs text-zinc-500">{redemption.user.rNumber ?? "–"}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {dateTimeFormatter.format(redemption.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-zinc-600">
                    {dayFormatter.format(redemption.order.session.date)}
                  </td>
                  <td className="px-4 py-3 font-medium">{redemption.amount}</td>
                  <td className="px-4 py-3 text-zinc-600">
                    {redemption.processedBy?.name ?? (nl ? "Verwijderde gebruiker" : "Deleted user")}
                  </td>
                </tr>
              ))}
              {redemptions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    {nl
                      ? "Nog geen digitale bonnetjes gebruikt aan de afhaalbalie."
                      : "No digital vouchers have been used at the pickup counter yet."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {redemptionCount > redemptions.length ? (
            <p className="border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500">
              {nl
                ? `De ${redemptions.length} meest recente van ${redemptionCount} registraties worden getoond.`
                : `Showing the ${redemptions.length} most recent of ${redemptionCount} records.`}
            </p>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
