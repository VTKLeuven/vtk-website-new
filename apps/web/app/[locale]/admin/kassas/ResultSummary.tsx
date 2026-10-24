import { formatEuro } from "@/lib/rekeningen/expenses";
import type { CashRegisterResult } from "@/lib/kassas/kassa";

/**
 * Het resultaat van een kassa, zoals Beheer het onder de telling ziet en de
 * post het vanaf "doorgegeven" op haar kassa ziet. Eén paneel, zodat de post
 * precies dezelfde cijfers leest als wat Beheer doorgaf.
 */
export function ResultSummary({ result, locale }: { result: CashRegisterResult; locale: "nl" | "en" }) {
  const nl = locale === "nl";
  const euro = (cents: number) => formatEuro(cents, locale);
  const notCounted = nl ? "nog niet geteld" : "not counted yet";

  // Twee groepen, elk in een eigen kolom: de kassa zelf (begin, eind, verschil)
  // en wat er verder binnenkwam. In één raster van twee kolommen las je ze
  // kriskras door elkaar.
  const groups: Array<Array<{ label: string; value: string; strong?: boolean }>> = [
    [
      { label: nl ? "Beginkassa" : "Starting float", value: euro(result.startCents) },
      {
        label: nl ? "Eindkassa" : "Closing count",
        value: result.endCents === null ? notCounted : euro(result.endCents),
      },
      {
        label: nl ? "Resultaat kassa" : "Cash result",
        value: result.cashCents === null ? notCounted : euro(result.cashCents),
        strong: true,
      },
    ],
    [
      { label: "Bancontact", value: euro(result.bancontactCents) },
      { label: "Payconiq", value: euro(result.payconiqCents) },
      { label: nl ? "Ticketverkoop" : "Ticket sales", value: euro(result.ticketCents) },
      { label: nl ? "Bonnen" : "Vouchers", value: euro(result.voucherCents) },
    ],
  ];

  return (
    <section
      aria-label={nl ? "Resultaat" : "Result"}
      className="rounded-2xl border border-vtk-blue/12 bg-white p-4 shadow-[inset_3px_0_0_var(--yellow)]"
    >
      <div className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
        {groups.map((group, index) => (
          <dl key={index} className="space-y-1">
            {group.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-3">
                <dt className={row.strong ? "font-medium text-vtk-ink" : "text-vtk-muted"}>{row.label}</dt>
                <dd className={`tabular-nums text-vtk-ink ${row.strong ? "font-semibold" : ""}`}>{row.value}</dd>
              </div>
            ))}
          </dl>
        ))}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-vtk-blue/10 pt-3">
        <span className="text-sm font-semibold text-vtk-ink">{nl ? "Finaal resultaat" : "Final result"}</span>
        <span className="text-xl font-semibold tabular-nums text-vtk-ink">{euro(result.totalCents)}</span>
      </div>
    </section>
  );
}
