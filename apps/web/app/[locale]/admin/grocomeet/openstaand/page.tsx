import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { Card } from "@vtk/ui";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import { formatEuro } from "@/lib/theokot";
import { loadGrocomeetDebts } from "@/lib/meetingAdmin";

/** Tabblad Openstaand: wie nog wat verschuldigd is over het werkingsjaar. */
export default async function AdminGrocomeetDebtsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  await requirePermission("grocomeet.manage");

  const workingYear = currentWorkingYear();
  const debts = await loadGrocomeetDebts(workingYear);
  const openTotal = debts.reduce((total, row) => total + row.openCents, 0);

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg font-semibold">{nl ? "Openstaand" : "Outstanding"}</h2>
      <p className="mb-4 text-sm text-[#5c667f]">
        {nl
          ? `Per persoon over ${formatWorkingYear(workingYear)}, met wat grocos zelf bij Theokot bestelden voor in de doos. Afvinken doe je bij de vergadering zelf (tabblad Vergaderingen), zodat je ziet welke bestelling betaald werd.`
          : `Per person over ${formatWorkingYear(workingYear)}, including what grocos ordered at Theokot themselves for the box. Tick off at the meeting itself (Meetings tab), so you can see which order was paid.`}
      </p>
      {debts.length === 0 ? (
        <p className="text-sm text-[#5c667f]">{nl ? "Nog geen bestellingen." : "No orders yet."}</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                <th className="py-1 pr-3">{nl ? "Naam" : "Name"}</th>
                <th className="py-1 pr-3 text-right">{nl ? "Bestellingen" : "Orders"}</th>
                <th className="py-1 pr-3 text-right">{nl ? "Totaal" : "Total"}</th>
                <th className="py-1 pr-3 text-right">{nl ? "Betaald" : "Paid"}</th>
                <th className="py-1 text-right">{nl ? "Openstaand" : "Outstanding"}</th>
              </tr>
            </thead>
            <tbody>
              {debts.map((row) => (
                <tr key={row.userId} className="border-t border-vtk-blue/10">
                  <td className="py-1.5 pr-3">{row.name}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{row.orders}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{formatEuro(row.totalCents)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-[#5c667f]">{formatEuro(row.paidCents)}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{formatEuro(row.openCents)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-vtk-blue/20">
                <td className="py-1.5 pr-3 font-semibold" colSpan={4}>
                  {nl ? "Totaal openstaand" : "Total outstanding"}
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{formatEuro(openTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
