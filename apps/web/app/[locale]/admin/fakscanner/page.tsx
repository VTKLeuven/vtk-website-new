import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { FakScanResult } from "@prisma/client";
import { Card, Input, Label } from "@vtk/ui";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";
import { SaveForm } from "@/components/ui/SaveForm";
import { saveFakscannerConfigAction } from "@/app/actions/fakscanner";
import { getFakRanking, getFakscannerConfig } from "@/lib/fakscanner-server";
import { rewardProgress } from "@/lib/fakscanner";
import {
  currentWorkingYear,
  formatWorkingYear,
  parseWorkingYear,
  workingYearStart,
  workingYearTabs,
} from "@/lib/workingYear";

const PAGE_SIZE = 50;
const FAILED_RESULTS: FakScanResult[] = ["UNKNOWN_CARD", "ERROR"];

type Search = { jaar?: string; result?: string; page?: string };

/**
 * Fakscanner: de kaartlezer aan de bar. Bovenaan de ranglijst van dit
 * werkingsjaar (wie het meest incheckte), daaronder de log van elke scan, ook de
 * mislukte. De instellingen (dubbeltelvenster, punten per pint, bardag-rollover)
 * staan ertussen; het device-token zelf staat bewust enkel in de omgeving en is
 * hier dus niet te zien of te wijzigen.
 */
export default async function FakscannerAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Search>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/fakscanner`);
  const canManage = session.user.isSuperAdmin || session.permissions.includes("fakscanner.manage");
  if (!canManage) return <p className="text-sm text-zinc-500">{nl ? "Geen toegang." : "No access."}</p>;

  const dict = getDictionary(locale);
  const sp = await searchParams;
  const year = parseWorkingYear(sp.jaar);
  const onlyFailed = sp.result === "failed";
  const page = Math.max(1, Number(sp.page) || 1);
  const isCurrentYear = year === currentWorkingYear();

  const config = await getFakscannerConfig();

  // De log heeft geen jaarkolom; het werkingsjaarvenster (15 juli tot 15 juli)
  // snijdt hem op dezelfde grens als de check-ins zelf.
  const logWhere = {
    at: { gte: workingYearStart(year), lt: workingYearStart(year + 1) },
    ...(onlyFailed ? { result: { in: FAILED_RESULTS } } : {}),
  };

  const [ranking, yearsWithData, logCount, logs] = await Promise.all([
    getFakRanking(year, config.rewardEvery),
    prisma.fakCheckin.findMany({ distinct: ["year"], select: { year: true }, orderBy: { year: "desc" } }),
    prisma.fakScanLog.count({ where: logWhere }),
    prisma.fakScanLog.findMany({
      where: logWhere,
      orderBy: { at: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { user: { select: { name: true } } },
    }),
  ]);

  const years = workingYearTabs(yearsWithData.map((r) => r.year));
  const totalPages = Math.max(1, Math.ceil(logCount / PAGE_SIZE));

  const dateTimeFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const buildHref = (patch: Partial<Search>) => {
    const next = new URLSearchParams({
      jaar: String(year),
      ...(onlyFailed ? { result: "failed" } : {}),
      page: String(page),
    });
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) next.delete(k);
      else next.set(k, v);
    }
    return `${base}/admin/fakscanner?${next.toString()}`;
  };

  const resultLabel = (r: FakScanResult): string => {
    if (nl)
      return {
        COUNTED: "Geteld",
        ALREADY_TODAY: "Al gescand",
        UNKNOWN_CARD: "Onbekende kaart",
        ERROR: "Fout",
      }[r];
    return {
      COUNTED: "Counted",
      ALREADY_TODAY: "Already scanned",
      UNKNOWN_CARD: "Unknown card",
      ERROR: "Error",
    }[r];
  };

  const resultTone = (r: FakScanResult): string => {
    if (r === "COUNTED") return "bg-green-100 text-green-800";
    if (r === "ALREADY_TODAY") return "bg-vtk-blue-soft/60 text-[#34405e]";
    return "bg-red-100 text-red-800";
  };

  const totals = ranking.reduce(
    (acc, row) => ({
      people: acc.people + 1,
      checkins: acc.checkins + row.checkins,
      beers: acc.beers + row.beers,
    }),
    { people: 0, checkins: 0, beers: 0 },
  );

  const pill = (active: boolean) =>
    "rounded-full border px-3 py-1 " +
    (active ? "border-vtk-blue bg-vtk-blue/10 text-vtk-ink" : "border-vtk-blue/20 text-[#5c667f]");

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{dict.admin.fakscanner}</h1>
        <p className="text-sm text-zinc-500">
          {nl
            ? "De kaartlezer aan de bar. Eén check-in per avond per lid; om de zoveel punten is er een gratis pint. De scanner praat met de site via een token uit de omgeving (FAKSCANNER_TOKEN), niet via een login."
            : "The card reader at the bar. One check-in per evening per member; every so many points there is a free beer. The scanner talks to the site with a token from the environment (FAKSCANNER_TOKEN), not with a login."}
        </p>
      </header>

      {/* Werkingsjaar */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-[#5c667f]">{nl ? "Werkingsjaar" : "Working year"}</span>
        {years.map((y) => (
          <Link key={y} href={buildHref({ jaar: String(y), page: "1" })} className={pill(y === year)}>
            {formatWorkingYear(y)}
          </Link>
        ))}
      </div>

      {/* Samenvatting */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: nl ? "Leden met check-ins" : "Members with check-ins", value: totals.people },
          { label: nl ? "Check-ins" : "Check-ins", value: totals.checkins },
          { label: nl ? "Verdiende pinten" : "Beers earned", value: totals.beers },
        ].map((tile) => (
          <div key={tile.label} className="rounded-2xl border border-vtk-blue/12 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-[#5c667f]">{tile.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-vtk-ink">{tile.value}</div>
          </div>
        ))}
      </section>

      {/* Ranglijst */}
      <section className="space-y-3 rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <div>
          <h2 className="text-sm font-semibold text-vtk-ink">
            {nl ? "Ranglijst" : "Ranking"} · {formatWorkingYear(year)}
          </h2>
          <p className="text-xs text-[#5c667f]">
            {nl
              ? `Punten, niet check-ins: een scan tijdens het dubbeltelvenster telt voor twee. Een gratis pint per ${config.rewardEvery} punten.`
              : `Points, not check-ins: a scan during the double window counts twice. One free beer per ${config.rewardEvery} points.`}
          </p>
        </div>

        {ranking.length === 0 ? (
          <p className="text-sm text-[#5c667f]">
            {nl ? "Nog geen check-ins in dit werkingsjaar." : "No check-ins in this working year yet."}
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[#5c667f]">
                  <th className="w-10 py-2 pr-3">#</th>
                  <th className="py-2 pr-3">{nl ? "Naam" : "Name"}</th>
                  <th className="py-2 pr-3 text-right">{nl ? "Punten" : "Points"}</th>
                  <th className="py-2 pr-3 text-right">{nl ? "Check-ins" : "Check-ins"}</th>
                  <th className="py-2 pr-3 text-right">{nl ? "Pinten" : "Beers"}</th>
                  <th className="py-2 pr-3 text-right">{nl ? "Tot volgende" : "To next"}</th>
                  <th className="py-2">{nl ? "Laatste scan" : "Last scan"}</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map((row, index) => (
                  <tr key={row.userId} className="border-t border-vtk-blue/10">
                    <td className="py-2 pr-3 tabular-nums text-[#5c667f]">{index + 1}</td>
                    <td className="py-2 pr-3 text-vtk-ink">
                      {row.name}
                      {row.rNumber ? <span className="ml-1 text-xs text-[#5c667f]">{row.rNumber}</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums text-vtk-ink">{row.total}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[#34405e]">{row.checkins}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[#34405e]">{row.beers}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[#5c667f]">
                      {rewardProgress(config, row.total).toNext}
                    </td>
                    <td className="whitespace-nowrap py-2 tabular-nums text-[#5c667f]">
                      {dateTimeFmt.format(row.lastAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Instellingen */}
      <Card className="p-5">
        <h2 className="mb-1 text-lg font-semibold">{nl ? "Instellingen" : "Settings"}</h2>
        <p className="mb-4 text-sm text-[#5c667f]">
          {nl
            ? "Deze waarden gelden vanaf de volgende scan; ze herrekenen niets met terugwerkende kracht."
            : "These values apply from the next scan onwards; they do not recalculate anything retroactively."}
        </p>
        <SaveForm
          action={saveFakscannerConfigAction}
          className="space-y-4"
          resetOnSuccess={false}
          submitLabel={nl ? "Instellingen opslaan" : "Save settings"}
          savingLabel={nl ? "Bezig met opslaan..." : "Saving..."}
          savedMessage={nl ? "Instellingen opgeslagen" : "Settings saved"}
          fallbackErrorMessage={nl ? "Opslaan van de instellingen mislukt." : "Saving the settings failed."}
          errorMessages={{
            bad_time: nl ? "Een uur moet als uu:mm ingevuld zijn." : "A time must be filled in as hh:mm.",
            empty_window: nl
              ? "Begin en einde van het dubbeltelvenster mogen niet gelijk zijn."
              : "The double window's start and end may not be the same.",
            bad_reward: nl
              ? "Punten per pint moet een geheel getal van minstens 1 zijn."
              : "Points per beer must be a whole number of at least 1.",
            bad_rollover: nl
              ? "Het startuur van de bardag moet tussen 0 en 23 liggen."
              : "The bar day's start hour must be between 0 and 23.",
          }}
        >
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <label className="flex items-center gap-2 text-sm text-vtk-ink">
                <input
                  type="checkbox"
                  name="doubleEnabled"
                  defaultChecked={config.doubleEnabled}
                  className="size-4 rounded border-zinc-400"
                />
                {nl ? "Dubbeltelvenster aan" : "Double window on"}
              </label>
              <p className="mt-1 text-sm text-[#5c667f]">
                {nl
                  ? "Binnen dit venster telt een check-in voor twee punten. Het venster mag over middernacht lopen (bv. 23:30 tot 00:30)."
                  : "Within this window a check-in counts for two points. The window may cross midnight (e.g. 23:30 to 00:30)."}
              </p>
            </div>
            <div>
              <Label htmlFor="doubleStart">{nl ? "Dubbel vanaf" : "Double from"}</Label>
              <Input id="doubleStart" name="doubleStart" type="time" defaultValue={config.doubleStart} />
            </div>
            <div>
              <Label htmlFor="doubleEnd">{nl ? "Dubbel tot" : "Double until"}</Label>
              <Input id="doubleEnd" name="doubleEnd" type="time" defaultValue={config.doubleEnd} />
            </div>
            <div>
              <Label htmlFor="rewardEvery">{nl ? "Punten per gratis pint" : "Points per free beer"}</Label>
              <Input
                id="rewardEvery"
                name="rewardEvery"
                type="number"
                min={1}
                max={1000}
                defaultValue={config.rewardEvery}
              />
            </div>
            <div className="sm:col-span-3">
              <Label htmlFor="dayRolloverHour">{nl ? "Nieuwe bardag begint om" : "New bar day starts at"}</Label>
              <div className="max-w-[10rem]">
                <Input
                  id="dayRolloverHour"
                  name="dayRolloverHour"
                  type="number"
                  min={0}
                  max={23}
                  defaultValue={config.dayRolloverHour}
                />
              </div>
              <p className="mt-1 text-sm text-[#5c667f]">
                {nl
                  ? "Het uur waarop een nieuwe dag begint voor de teller. Staat dit op 6, dan hoort een scan om 01:00 nog bij de avond ervoor en levert een tweede scan die nacht dus niets op."
                  : "The hour at which a new day starts for the counter. At 6, a scan at 01:00 still belongs to the previous evening, so a second scan that night earns nothing."}
              </p>
            </div>
          </div>
        </SaveForm>
      </Card>

      {/* Log */}
      <section className="space-y-3 rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-vtk-ink">{nl ? "Scanlog" : "Scan log"}</h2>
            <p className="text-xs text-[#5c667f]">
              {nl
                ? "Elke scan, ook de mislukte. Blijft het bij fouten, dan ligt het aan de lezer of aan KU Leuven, niet aan de teller."
                : "Every scan, failures included. A run of errors points at the reader or at KU Leuven, not at the counter."}
            </p>
          </div>
          <Link href={buildHref({ result: onlyFailed ? undefined : "failed", page: "1" })} className={pill(onlyFailed)}>
            <span className="text-xs">{nl ? "Enkel mislukt" : "Failed only"}</span>
          </Link>
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-[#5c667f]">
            {nl ? "Geen scans in dit werkingsjaar." : "No scans in this working year."}
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left uppercase text-[#5c667f]">
                  <th className="py-2 pr-3">{nl ? "Tijdstip" : "Time"}</th>
                  <th className="py-2 pr-3">{nl ? "Persoon" : "Person"}</th>
                  <th className="py-2 pr-3">{nl ? "Resultaat" : "Result"}</th>
                  <th className="py-2 pr-3 text-right">{nl ? "Punten" : "Points"}</th>
                  <th className="py-2 pr-3 text-right">{nl ? "Stand" : "Total"}</th>
                  <th className="py-2">{nl ? "Detail" : "Detail"}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-vtk-blue/10">
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-[#34405e]">
                      {dateTimeFmt.format(l.at)}
                    </td>
                    <td className="py-2 pr-3 text-vtk-ink">
                      {l.user?.name ?? l.cardName ?? "—"}
                      {l.rNumber ? <span className="ml-1 text-[#5c667f]">{l.rNumber}</span> : null}
                    </td>
                    <td className="py-2 pr-3">
                      <span className={"rounded-full px-2 py-0.5 font-medium " + resultTone(l.result)}>
                        {resultLabel(l.result)}
                      </span>
                      {l.reward ? (
                        <span className="ml-1 rounded-full bg-yellow-100 px-2 py-0.5 font-medium text-yellow-800">
                          {nl ? "Pint" : "Beer"}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[#34405e]">{l.points ?? ""}</td>
                    <td className="py-2 pr-3 text-right tabular-nums text-[#34405e]">{l.total ?? ""}</td>
                    <td className="py-2 text-[#5c667f]">{l.reason ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-[#5c667f]">
            <span>
              {nl ? "Pagina" : "Page"} {page} / {totalPages}
            </span>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={buildHref({ page: String(page - 1) })} className="rounded-full border border-vtk-blue/20 px-3 py-1">
                  {nl ? "Vorige" : "Previous"}
                </Link>
              )}
              {page < totalPages && (
                <Link href={buildHref({ page: String(page + 1) })} className="rounded-full border border-vtk-blue/20 px-3 py-1">
                  {nl ? "Volgende" : "Next"}
                </Link>
              )}
            </div>
          </div>
        )}
      </section>

      {!isCurrentYear && (
        <p className="text-xs text-[#5c667f]">
          {nl
            ? "Je bekijkt een afgelopen werkingsjaar. Nieuwe scans komen altijd in het lopende jaar terecht."
            : "You are viewing a past working year. New scans always land in the current year."}
        </p>
      )}
    </div>
  );
}
