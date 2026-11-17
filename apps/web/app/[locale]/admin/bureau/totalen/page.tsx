import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { Card } from "@vtk/ui";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import { formatEuro } from "@/lib/theokot";
import { loadBureauTotals } from "@/lib/meetingAdmin";

/** Tabblad Totalen: hoeveel mensen er per bureau kwamen en wat dat kostte, voor de boekhouding. */
export default async function AdminBureauTotalsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  await requirePermission("bureau.manage");

  const workingYear = currentWorkingYear();
  const totals = await loadBureauTotals(workingYear, locale);
  // Enkel een kolom wanneer er dit jaar een big bureau was; anders is ze altijd nul.
  const showExternal = totals.perMeeting.some((row) => row.external > 0);

  return (
    <Card className="p-5">
      <h2 className="mb-1 text-lg font-semibold">{nl ? "Totalen" : "Totals"}</h2>
      <p className="mb-4 text-sm text-[#5c667f]">
        {nl
          ? "Hoeveel mensen er komen en wat hun broodjes en drankjes kosten. Wie zich inschrijft zonder iets te bestellen, telt mee voor de zaal maar niet voor het bedrag. Studenten betalen niets; dit is voor de boekhouding van de post."
          : "How many people are coming and what their sandwiches and drinks cost. Someone who registers without ordering counts for the room but not for the amount. Students pay nothing; this is for the post's bookkeeping."}
        {showExternal &&
          (nl
            ? " Broodjes die bij een big bureau extern besteld werden, staan apart en zitten niet in het bedrag: die rekening komt van de externe zaak."
            : " Sandwiches ordered externally for a big bureau are listed separately and not included in the amount: that bill comes from the external vendor.")}
      </p>
      {totals.perMeeting.length === 0 ? (
        <p className="text-sm text-[#5c667f]">
          {nl ? "Nog geen inschrijvingen." : "No registrations yet."}
        </p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                <th className="py-1 pr-3">{nl ? "Bureau" : "Bureau"}</th>
                <th className="py-1 pr-3 text-right">{nl ? "Ingeschreven" : "Registered"}</th>
                <th className="py-1 pr-3 text-right">{nl ? "Bestellingen" : "Orders"}</th>
                {showExternal && (
                  <th className="py-1 pr-3 text-right">{nl ? "Extern" : "External"}</th>
                )}
                <th className="py-1 text-right">{nl ? "Bedrag" : "Amount"}</th>
              </tr>
            </thead>
            <tbody>
              {totals.perMeeting.map((row) => (
                <tr key={row.id} className="border-t border-vtk-blue/10">
                  <td className="py-1.5 pr-3 capitalize">{row.dateLabel}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{row.attendees}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{row.orders}</td>
                  {showExternal && (
                    <td className="py-1.5 pr-3 text-right tabular-nums">{row.external}</td>
                  )}
                  <td className="py-1.5 text-right tabular-nums">{formatEuro(row.totalCents)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-vtk-blue/20">
                <td className="py-1.5 pr-3 font-semibold" colSpan={showExternal ? 4 : 3}>
                  {nl ? `Totaal ${formatWorkingYear(workingYear)}` : `Total ${formatWorkingYear(workingYear)}`}
                </td>
                <td className="py-1.5 text-right font-semibold tabular-nums">
                  {formatEuro(totals.yearCents)}
                </td>
              </tr>
              <tr>
                <td className="py-1.5 pr-3 text-[#5c667f]" colSpan={showExternal ? 4 : 3}>
                  {nl ? "Totaal over alle bureaus" : "Total across all bureaus"}
                </td>
                <td className="py-1.5 text-right tabular-nums text-[#5c667f]">
                  {formatEuro(totals.allTimeCents)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
