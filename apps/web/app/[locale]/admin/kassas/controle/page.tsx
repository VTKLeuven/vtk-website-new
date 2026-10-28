import Link from "@/components/ui/Link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { LinkedRow } from "@/components/ui/LinkedRow";
import { CheckIcon } from "@/components/ui/icons";
import { hasLocale } from "@/lib/locale";
import { currentWorkingYear, formatWorkingYear, workingYearTabs } from "@/lib/workingYear";
import { formatEuro, formatSpentOn } from "@/lib/rekeningen/expenses";
import { cashRegisterAccess, permanentTabLabel } from "@/lib/kassas/server";
import { timeRangeShort } from "@/lib/kassas/kassa";
import { kassaControlList } from "@/lib/inkomsten/server";
import { controlSpanLabel, paymentsLabel, type KassaControlState } from "@/lib/inkomsten/kassa";
import { KassaNav } from "../KassaNav";

type SearchParams = { jaar?: string; stand?: string };

/** De standen in de volgorde waarin Beheer ze afwerkt; wat klopt, staat achteraan. */
const STATES: KassaControlState[] = ["differs", "empty", "nothing", "unlinked", "match"];

const STATE_SLUGS: Record<KassaControlState, string> = {
  differs: "verschil",
  empty: "niet-afgelezen",
  nothing: "niets",
  unlinked: "geen-kanaal",
  match: "klopt",
};

const STATE_LABELS: Record<KassaControlState, { nl: string; en: string }> = {
  differs: { nl: "Verschil", en: "Differs" },
  empty: { nl: "Niet afgelezen", en: "Not read" },
  nothing: { nl: "Niets in de import", en: "Nothing imported" },
  unlinked: { nl: "Geen kanaal", en: "No channel" },
  match: { nl: "Klopt", en: "Matches" },
};

const ALL = "alles";

/**
 * De lijst met afwijkingen: per kassa en per toestel het bedrag dat bij het
 * tellen ingetikt is, naast wat de online inkomsten op dat toestel zagen. De
 * site past niets aan; een rij opent het telformulier van die kassa, waar
 * Beheer corrigeert of overneemt. Zie docs/inkomsten.md, "De kassacontrole".
 */
export default async function KassaControle({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const access = await cashRegisterAccess(`${base}/inloggen?next=${base}/admin/kassas/controle`);
  if (!access.canRequest) {
    return (
      <p className="text-sm text-vtk-muted">
        {nl
          ? "Je hebt geen toegang tot de kassa's. Vraag IT om het recht 'Een kassa aanvragen' aan je rol te hangen."
          : "You do not have access to the cash registers. Ask IT to add the 'Request a cash register' permission to your role."}
      </p>
    );
  }
  if (!access.canManage) redirect(`${base}/admin/kassas/mijn`);
  if (!access.canCheckIncome) {
    return (
      <p className="text-sm text-vtk-muted">
        {nl
          ? "De controle legt de kassa's naast de online inkomsten. Vraag IT om het recht 'Online inkomsten opladen en koppelen' aan je rol te hangen."
          : "The check compares the cash registers with the online income. Ask IT to add the 'Import and match online income' permission to your role."}
      </p>
    );
  }

  const sp = await searchParams;
  const year = sp.jaar === "alles" ? "all" : Number(sp.jaar) || currentWorkingYear();
  const state: KassaControlState | null =
    sp.stand === ALL ? null : (STATES.find((value) => STATE_SLUGS[value] === sp.stand) ?? "differs");

  const [years, lines] = await Promise.all([
    prisma.cashRegister.findMany({
      distinct: ["workingYear"],
      select: { workingYear: true },
      orderBy: { workingYear: "desc" },
    }),
    kassaControlList(year),
  ]);
  const shown = state ? lines.filter((line) => line.state === state) : lines;
  const countOf = (value: KassaControlState) => lines.filter((line) => line.state === value).length;
  const euro = (cents: number) => formatEuro(cents, locale);

  const hrefWith = (patch: Partial<Record<keyof SearchParams, string>>) => {
    const query = new URLSearchParams();
    const values: Record<string, string> = {
      jaar: year === "all" ? "alles" : year === currentWorkingYear() ? "" : String(year),
      stand: state === null ? ALL : state === "differs" ? "" : STATE_SLUGS[state],
      ...patch,
    };
    for (const [key, value] of Object.entries(values)) if (value) query.set(key, value);
    const qs = query.toString();
    return `${base}/admin/kassas/controle${qs ? `?${qs}` : ""}`;
  };

  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] ${
      active
        ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
        : "border-vtk-blue/15 bg-white text-vtk-body hover:bg-vtk-blue-soft/60"
    }`;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">{nl ? "Kassacontrole" : "Cash register check"}</h1>
        <p className="mt-1 max-w-5xl text-sm text-vtk-muted">
          {nl
            ? "Per kassa en per toestel het bedrag dat bij het tellen ingetikt is, naast wat de online inkomsten op dat toestel zagen. Een verschil is een waarschuwing: de site past geen bedrag aan. Een rij opent het telformulier van die kassa."
            : "Per register and per device the amount typed when counting, next to what the online income saw on that device. A difference is a warning: the site changes no amount. A row opens the count form of that register."}
        </p>
      </header>

      <KassaNav
        base={base}
        nl={nl}
        active="controle"
        caps={{ request: access.canRequest, manage: true, control: true }}
        permanentLabel={permanentTabLabel(access, locale)}
      />

      <nav className="flex flex-wrap items-center gap-2" aria-label={nl ? "Werkingsjaar" : "Working year"}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-vtk-muted">
          {nl ? "Jaar" : "Year"}
        </span>
        {workingYearTabs(years.map((row) => row.workingYear)).map((tab) => (
          <Link
            key={tab}
            href={hrefWith({ jaar: tab === currentWorkingYear() ? "" : String(tab) })}
            aria-current={year === tab ? "page" : undefined}
            className={`rounded-full border px-2.5 py-1 text-xs tabular-nums ${
              year === tab
                ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
                : "border-vtk-blue/15 text-vtk-body hover:bg-vtk-blue-soft/60"
            }`}
          >
            {formatWorkingYear(tab)}
          </Link>
        ))}
        <Link
          href={hrefWith({ jaar: "alles" })}
          aria-current={year === "all" ? "page" : undefined}
          className={`rounded-full border px-2.5 py-1 text-xs ${
            year === "all"
              ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
              : "border-vtk-blue/15 text-vtk-body hover:bg-vtk-blue-soft/60"
          }`}
        >
          {nl ? "Alle jaren" : "All years"}
        </Link>
      </nav>

      <nav className="flex flex-wrap gap-2" aria-label={nl ? "Stand" : "State"}>
        {STATES.map((value) => (
          <Link
            key={value}
            href={hrefWith({ stand: value === "differs" ? "" : STATE_SLUGS[value] })}
            aria-current={state === value ? "page" : undefined}
            className={chip(state === value)}
          >
            {nl ? STATE_LABELS[value].nl : STATE_LABELS[value].en}
            <span className="font-semibold tabular-nums">{countOf(value)}</span>
          </Link>
        ))}
        <Link href={hrefWith({ stand: ALL })} aria-current={state === null ? "page" : undefined} className={chip(state === null)}>
          {nl ? "Alles" : "All"}
          <span className="font-semibold tabular-nums">{lines.length}</span>
        </Link>
      </nav>

      <section className="overflow-hidden rounded-2xl border border-vtk-blue/12 bg-white">
        {shown.length === 0 ? (
          <p className="p-6 text-sm text-vtk-muted">
            {state === "differs"
              ? nl
                ? "Geen verschillen met de online inkomsten."
                : "No differences with the online income."
              : nl
                ? "Geen toestellen in deze stand."
                : "No devices in this state."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="vtk-kassa-table w-full text-sm">
              <thead>
                <tr className="border-b border-vtk-blue/10 text-left text-xs font-semibold text-vtk-muted">
                  <th scope="col" className="w-[100px] px-4 py-3">{nl ? "Datum" : "Date"}</th>
                  <th scope="col" className="px-4 py-3">{nl ? "Kassa" : "Register"}</th>
                  <th scope="col" className="w-[150px] px-4 py-3">{nl ? "Toestel" : "Device"}</th>
                  <th scope="col" className="w-[104px] px-4 py-3 text-right">{nl ? "Ingetikt" : "Typed"}</th>
                  <th scope="col" className="w-[150px] px-4 py-3 text-right">{nl ? "Online inkomsten" : "Online income"}</th>
                  <th scope="col" className="w-[112px] px-4 py-3 text-right">{nl ? "Verschil" : "Difference"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-vtk-blue/5">
                {shown.map((line) => {
                  const href = `${base}/admin/kassas/${line.registerId}#tellen`;
                  const time = timeRangeShort(line.startsAt, line.endsAt);
                  const difference =
                    line.state === "differs" && line.typedCents !== null && line.amount
                      ? line.typedCents - line.amount.cents
                      : null;
                  return (
                    <LinkedRow
                      key={`${line.registerId}-${line.method}-${line.terminal}`}
                      href={href}
                      className="cursor-pointer transition-colors hover:bg-vtk-blue-soft/30"
                    >
                      <td data-label={nl ? "Datum" : "Date"} className="whitespace-nowrap px-4 py-3 tabular-nums text-vtk-body">
                        {formatSpentOn(line.date, locale)}
                        {time && <span className="block text-xs text-vtk-muted">{time}</span>}
                      </td>
                      <td data-wide className="px-4 py-3">
                        <Link href={href} className="font-medium text-vtk-ink hover:underline">
                          {line.activity}
                        </Link>
                        <span className="block text-xs text-vtk-muted">{line.postLabel}</span>
                      </td>
                      <td data-label={nl ? "Toestel" : "Device"} className="px-4 py-3 text-vtk-body">
                        {line.method === "BANCONTACT" ? "Bancontact" : "Payconiq"} {line.terminal}
                      </td>
                      <td data-label={nl ? "Ingetikt" : "Typed"} className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                        {line.typedCents === null ? (
                          <span className="text-xs text-vtk-muted">{nl ? "niet afgelezen" : "not read"}</span>
                        ) : (
                          euro(line.typedCents)
                        )}
                      </td>
                      <td data-label={nl ? "Online inkomsten" : "Online income"} className="px-4 py-3 text-right tabular-nums">
                        {!line.amount ? (
                          <span className="text-xs text-vtk-muted">
                            {nl ? "geen kanaal gekoppeld" : "no channel linked"}
                            {" ("}
                            <Link href={`${base}/admin/inkomsten/instellingen`} className="underline">
                              {nl ? "instellingen" : "settings"}
                            </Link>
                            {")"}
                          </span>
                        ) : line.amount.count === 0 ? (
                          <span className="text-xs text-vtk-muted">
                            {nl ? "niets" : "nothing"}, {controlSpanLabel(line.amount, nl)}
                          </span>
                        ) : (
                          <>
                            {euro(line.amount.cents)}
                            <span className="block text-xs text-vtk-muted">
                              {paymentsLabel(line.amount.count, nl)}, {controlSpanLabel(line.amount, nl)}
                            </span>
                          </>
                        )}
                      </td>
                      <td
                        data-label={nl ? "Verschil" : "Difference"}
                        data-empty={difference === null && line.state !== "match" ? "" : undefined}
                        className="whitespace-nowrap px-4 py-3 text-right tabular-nums"
                      >
                        {difference !== null ? (
                          <span className="text-vtk-warn">
                            <span className="font-semibold">{euro(Math.abs(difference))}</span>
                            <span className="block text-xs">
                              {difference > 0 ? (nl ? "meer ingetikt" : "more typed") : nl ? "minder ingetikt" : "less typed"}
                            </span>
                          </span>
                        ) : line.state === "match" ? (
                          <span className="inline-flex items-center gap-1 text-xs text-vtk-muted">
                            <span aria-hidden>
                              <CheckIcon />
                            </span>
                            {nl ? "klopt" : "matches"}
                          </span>
                        ) : null}
                      </td>
                    </LinkedRow>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
