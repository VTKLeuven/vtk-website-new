import { Card } from "@vtk/ui";
import { formatEuro } from "@/lib/theokot";
import { formatWorkingYear } from "@/lib/workingYear";
import {
  type GrocomeetSummary,
  type SummaryCounts,
  type SummarySource,
} from "@/lib/grocomeetSummary";

const SOURCES: SummarySource[] = ["FORM_ITEM", "FORM_DRINK", "BOX"];

/** De kop van elke groep in de producttabel. */
const GROUP_LABEL: Record<SummarySource, { nl: string; en: string }> = {
  FORM_ITEM: { nl: "Broodjes via het formulier", en: "Sandwiches via the form" },
  FORM_DRINK: { nl: "Drankjes via het formulier", en: "Drinks via the form" },
  BOX: { nl: "GM-doos (zelf bij Theokot besteld)", en: "GM box (ordered at Theokot)" },
};

/**
 * Wat er op de grocomeets van dit werkingsjaar al gegeten en gedronken is, voor
 * de herbegroting: het tabblad Overzicht van /admin/grocomeet. Het totaal staat
 * vooraan, want dat is het getal dat de herbegroting nodig heeft.
 */
export function GrocomeetSummaryCard({
  nl,
  summary,
  workingYear,
  exportHref,
}: {
  nl: boolean;
  summary: GrocomeetSummary;
  workingYear: number;
  exportHref: string;
}) {
  const { year } = summary;
  const dateFormat = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  const headline =
    year.meetings === 0
      ? nl
        ? "Nog geen grocomeet geweest"
        : "No grocomeet has taken place yet"
      : nl
        ? `${year.meetings} ${year.meetings === 1 ? "GM" : "GM's"} · ${year.formItems + year.boxItems} broodjes · ${year.formDrinks} drankjes`
        : `${year.meetings} ${year.meetings === 1 ? "GM" : "GMs"} · ${year.formItems + year.boxItems} sandwiches · ${year.formDrinks} drinks`;

  const countHeads = nl
    ? ["Broodjes", "Drankjes", "Bedrag", "Stuks", "Bedrag", "Totaal"]
    : ["Sandwiches", "Drinks", "Amount", "Items", "Amount", "Total"];

  return (
    <Card className="p-5">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{nl ? "Overzicht tot nu toe" : "Overview so far"}</h2>
        <p className="text-sm text-[#5c667f]">{headline}</p>
      </div>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="max-w-[46rem] text-sm text-[#5c667f]">
            {nl
              ? `Alle grocomeets van ${formatWorkingYear(workingYear)} die al begonnen zijn. "Formulier" is wat voor de vergadering besteld werd; "GM-doos" is wat grocos die dag zelf bij Theokot bestelden en in de doos meeging. Ongeldige inschrijvingen en geannuleerde bestellingen tellen niet mee.`
              : `Every grocomeet of ${formatWorkingYear(workingYear)} that has started. "Form" is what was ordered for the meeting; "GM box" is what grocos ordered at Theokot themselves that day for the box. Invalidated sign-ups and cancelled orders are left out.`}
            {summary.upcoming > 0
              ? nl
                ? ` Nog ${summary.upcoming} ${summary.upcoming === 1 ? "GM komt" : "GM's komen"} dit jaar en ${summary.upcoming === 1 ? "telt" : "tellen"} nog niet mee.`
                : ` ${summary.upcoming} more ${summary.upcoming === 1 ? "GM is" : "GMs are"} planned this year and not counted yet.`
              : ""}
          </p>
          <a
            href={exportHref}
            className="rounded-full border border-vtk-blue/15 px-4 py-2 text-sm font-medium text-vtk-ink transition-colors hover:bg-vtk-blue-soft/70"
          >
            {nl ? "Download Excel" : "Download Excel"}
          </a>
        </div>

        {year.meetings === 0 ? null : (
          <>
            <dl className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-vtk-blue/10 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                  {nl ? "Formulier" : "Form"}
                </dt>
                <dd className="text-xl font-semibold tabular-nums">{formatEuro(year.formCents)}</dd>
                <dd className="text-xs text-[#5c667f]">
                  {nl
                    ? `${year.formItems} broodjes, ${year.formDrinks} drankjes`
                    : `${year.formItems} sandwiches, ${year.formDrinks} drinks`}
                </dd>
              </div>
              <div className="rounded-xl border border-vtk-blue/10 px-4 py-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                  {nl ? "GM-doos" : "GM box"}
                </dt>
                <dd className="text-xl font-semibold tabular-nums">{formatEuro(year.boxCents)}</dd>
                <dd className="text-xs text-[#5c667f]">
                  {nl ? `${year.boxItems} stuks bij Theokot` : `${year.boxItems} items at Theokot`}
                </dd>
              </div>
              <div className="rounded-xl border border-vtk-blue/10 px-4 py-3 shadow-[inset_3px_0_0_var(--yellow)]">
                <dt className="text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                  {nl ? "Totaal" : "Total"} {formatWorkingYear(workingYear)}
                </dt>
                <dd className="text-xl font-semibold tabular-nums">{formatEuro(year.totalCents)}</dd>
                <dd className="text-xs text-[#5c667f]">
                  {nl
                    ? `over ${year.meetings} ${year.meetings === 1 ? "GM" : "GM's"}`
                    : `over ${year.meetings} ${year.meetings === 1 ? "GM" : "GMs"}`}
                </dd>
              </div>
            </dl>

            <section>
              <h3 className="mb-2 text-sm font-semibold">{nl ? "Per vergadering" : "Per meeting"}</h3>
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                      <th className="py-1 pr-3" rowSpan={2}>{nl ? "Datum" : "Date"}</th>
                      <th className="py-1 pr-3 text-right" rowSpan={2}>{nl ? "Ingeschreven" : "Signed up"}</th>
                      <th className="py-1 pr-3 text-center" colSpan={3}>{nl ? "Formulier" : "Form"}</th>
                      <th className="py-1 pr-3 text-center" colSpan={2}>{nl ? "GM-doos" : "GM box"}</th>
                      <th className="py-1 text-right" rowSpan={2}>{countHeads[5]}</th>
                    </tr>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                      {countHeads.slice(0, 5).map((label, index) => (
                        <th key={index} className="py-1 pr-3 text-right">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {summary.meetings.map((row) => (
                      <tr key={row.id} className="border-t border-vtk-blue/10">
                        <td className="whitespace-nowrap py-1.5 pr-3">{dateFormat.format(row.startsAt)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{row.attendees}</td>
                        <CountCells row={row} />
                      </tr>
                    ))}
                    {(summary.semesters.length > 1 ? summary.semesters : []).map((row) => (
                      <tr key={row.semester} className="border-t-2 border-vtk-blue/20 font-semibold">
                        <td className="py-1.5 pr-3" colSpan={2}>
                          Semester {row.semester}
                        </td>
                        <CountCells row={row} />
                      </tr>
                    ))}
                    <tr className="border-t-2 border-vtk-blue/20 font-semibold">
                      <td className="py-1.5 pr-3" colSpan={2}>
                        {nl ? "Totaal" : "Total"} {formatWorkingYear(workingYear)}
                      </td>
                      <CountCells row={year} />
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">{nl ? "Per product" : "Per product"}</h3>
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                      <th className="py-1 pr-3">Product</th>
                      <th className="py-1 pr-3 text-right">{nl ? "Aantal" : "Count"}</th>
                      <th className="py-1 text-right">{nl ? "Bedrag" : "Amount"}</th>
                    </tr>
                  </thead>
                  {SOURCES.map((source) => {
                    const rows = summary.products.filter((row) => row.source === source);
                    if (rows.length === 0) return null;
                    return (
                      <tbody key={source}>
                        <tr className="border-t-2 border-vtk-blue/20">
                          <td colSpan={3} className="py-1.5 pr-3 text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
                            {nl ? GROUP_LABEL[source].nl : GROUP_LABEL[source].en}
                          </td>
                        </tr>
                        {rows.map((row) => (
                          <tr key={row.name} className="border-t border-vtk-blue/10">
                            <td className="py-1.5 pr-3">{row.name}</td>
                            <td className="py-1.5 pr-3 text-right tabular-nums">{row.count}</td>
                            <td className="py-1.5 text-right tabular-nums">{formatEuro(row.cents)}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-vtk-blue/10 text-[#5c667f]">
                          <td className="py-1.5 pr-3">{nl ? "Subtotaal" : "Subtotal"}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">
                            {rows.reduce((total, row) => total + row.count, 0)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {formatEuro(rows.reduce((total, row) => total + row.cents, 0))}
                          </td>
                        </tr>
                      </tbody>
                    );
                  })}
                  <tfoot>
                    <tr className="border-t-2 border-vtk-blue/20 font-semibold">
                      <td className="py-1.5 pr-3" colSpan={2}>
                        {nl ? "Totaal" : "Total"} {formatWorkingYear(workingYear)}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{formatEuro(year.totalCents)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>
          </>
        )}
      </div>
    </Card>
  );
}

function CountCells({ row }: { row: SummaryCounts }) {
  return (
    <>
      <td className="py-1.5 pr-3 text-right tabular-nums">{row.formItems}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{row.formDrinks}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{formatEuro(row.formCents)}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{row.boxItems}</td>
      <td className="py-1.5 pr-3 text-right tabular-nums">{formatEuro(row.boxCents)}</td>
      <td className="py-1.5 text-right font-semibold tabular-nums">{formatEuro(row.totalCents)}</td>
    </>
  );
}
