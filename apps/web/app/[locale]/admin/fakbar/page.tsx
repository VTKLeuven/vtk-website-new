import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Card } from "@vtk/ui";
import { type Locale } from "@vtk/i18n";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { formatEuroCents } from "@/lib/fakbar";
import { cashCountTotalCents, shiftTotals, toCashCount } from "@/lib/fakbar-cash";
import { FakbarAdminNav } from "./FakbarAdminNav";
import { ShiftStarter } from "./ShiftStarter";
import { ShiftCloser } from "./ShiftCloser";

/** "wo 6 aug, 21:34" in Brussel-tijd. */
function brussels(date: Date, nl: boolean): string {
  return new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Shift-tab: de toog opent een shift met een kassatelling en sluit ze af met een
 * tweede telling, wat er naar de kluis ging, de bonnen en de SumUp-omzet.
 *
 * Er staat er maar één tegelijk open (afgedwongen in de actie), dus dit scherm
 * toont ofwel de startknop, ofwel de open shift met haar afsluitformulier.
 * Elk lid van de post mag dit (`fakbar.manage`).
 */
export default async function AdminFakbarShift({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  await requirePermission("fakbar.manage");

  const [openShift, couponTypes, recent] = await Promise.all([
    prisma.fakbarShift.findFirst({
      where: { closedAt: null },
      orderBy: { openedAt: "desc" },
      include: {
        openedBy: { select: { name: true } },
        cashCounts: true,
      },
    }),
    prisma.fakbarCouponType.findMany({ where: { active: true }, orderBy: { order: "asc" } }),
    prisma.fakbarShift.findMany({
      where: { closedAt: { not: null } },
      orderBy: { openedAt: "desc" },
      take: 10,
      include: {
        openedBy: { select: { name: true } },
        closedBy: { select: { name: true } },
        cashCounts: true,
        coupons: true,
      },
    }),
  ]);

  const openStartCents = openShift
    ? cashCountTotalCents(toCashCount(openShift.cashCounts.filter((c) => c.moment === "START")))
    : 0;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Fakbar · {nl ? "Shift" : "Shift"}</h1>
      <FakbarAdminNav base={base} nl={nl} active="shift" />

      <Card className="p-5">
        {openShift ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-vtk-ink">
                  {nl ? "Shift loopt" : "Shift running"}
                </h2>
                <p className="mt-1 text-sm text-[#5c667f]">
                  {nl ? "Gestart door" : "Started by"} {openShift.openedBy.name},{" "}
                  {brussels(openShift.openedAt, nl)} ·{" "}
                  {nl ? "beginstand" : "starting total"}{" "}
                  <span className="tabular-nums">{formatEuroCents(openStartCents, nl)}</span>
                </p>
              </div>
            </div>

            <ShiftCloser
              nl={nl}
              shiftId={openShift.id}
              startCents={openStartCents}
              couponTypes={couponTypes.map((c) => ({
                id: c.id,
                name: c.name,
                valueCents: c.valueCents,
              }))}
            />
          </div>
        ) : (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold text-vtk-ink">
              {nl ? "Geen shift bezig" : "No shift running"}
            </h2>
            <ShiftStarter nl={nl} />
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="mb-3 text-lg font-semibold text-vtk-ink">
          {nl ? "Afgesloten shiften" : "Closed shifts"}
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm text-[#5c667f]">
            {nl ? "Er is nog geen shift afgesloten." : "No shift has been closed yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] table-fixed text-sm">
              <thead>
                <tr className="whitespace-nowrap border-b border-vtk-blue/10 text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                  <th className="w-[26%] py-1 pr-3 text-left font-semibold">
                    {nl ? "Shift" : "Shift"}
                  </th>
                  <th className="w-[18%] py-1 pr-3 text-left font-semibold">
                    {nl ? "Toog" : "Bar"}
                  </th>
                  <th className="w-[14%] py-1 pr-3 text-right font-semibold">
                    {nl ? "Cash" : "Cash"}
                  </th>
                  <th className="w-[14%] py-1 pr-3 text-right font-semibold">
                    {nl ? "Kluis" : "Vault"}
                  </th>
                  <th className="w-[14%] py-1 pr-3 text-right font-semibold">
                    {nl ? "Bonnen" : "Coupons"}
                  </th>
                  <th className="w-[14%] py-1 text-right font-semibold">SumUp</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((shift) => {
                  const at = (moment: "START" | "END" | "VAULT") =>
                    cashCountTotalCents(
                      toCashCount(shift.cashCounts.filter((c) => c.moment === moment)),
                    );
                  const totals = shiftTotals({
                    startCents: at("START"),
                    endCents: at("END"),
                    vaultCents: at("VAULT"),
                    couponCents: shift.coupons.reduce(
                      (sum, c) => sum + c.quantity * c.valueCents,
                      0,
                    ),
                    sumUpCents: shift.sumUpCents ?? 0,
                  });

                  return (
                    <tr key={shift.id} className="border-b border-vtk-blue/10 last:border-0">
                      <td className="py-1.5 pr-3 text-vtk-ink">{brussels(shift.openedAt, nl)}</td>
                      <td className="py-1.5 pr-3 text-[#5c667f]">{shift.openedBy.name}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-vtk-ink">
                        {totals.cashRevenueCents === null
                          ? "—"
                          : formatEuroCents(totals.cashRevenueCents, nl)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-[#5c667f]">
                        {formatEuroCents(totals.vaultCents, nl)}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-[#5c667f]">
                        {formatEuroCents(totals.couponCents, nl)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums text-[#5c667f]">
                        {formatEuroCents(totals.sumUpCents, nl)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
