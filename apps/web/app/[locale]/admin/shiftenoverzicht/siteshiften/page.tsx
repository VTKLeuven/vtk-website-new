import { notFound } from "next/navigation";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { formatWorkingYear, parseWorkingYear } from "@/lib/workingYear";
import { loadPostNames } from "@/lib/shift/postNames";
import { loadRoster, loadSiteParticipations } from "@/lib/praesidiumShifts/server";
import { SiteShiftTable, type SiteShiftRow } from "./SiteShiftTable";

export default async function PraesidiumSiteShifts({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  await requirePermission("shift.praesidium");

  const { jaar } = await searchParams;
  const year = parseWorkingYear(jaar);
  const roster = await loadRoster(year, locale);
  const [participations, postNames] = await Promise.all([
    loadSiteParticipations(year, roster.map((m) => m.userId)),
    loadPostNames(locale),
  ]);
  const names = new Map(roster.map((m) => [m.userId, m.name]));
  const now = new Date().getTime();

  const byShift = new Map<string, SiteShiftRow>();
  for (const p of participations) {
    const row =
      byShift.get(p.shiftId) ??
      {
        shiftId: p.shiftId,
        name: p.shift.name,
        startTime: p.shift.startTime.toISOString(),
        post: p.shift.post ? postNames[p.shift.post] ?? p.shift.post : null,
        taken: p.shift._count.participants,
        max: p.shift.maxParticipants,
        past: p.shift.endTime.getTime() < now,
        people: [],
      };
    row.people.push({
      userId: p.userId,
      name: names.get(p.userId) ?? "",
      necessary: Boolean(p.praesidiumNecessity),
      hoursBefore: Math.max(0, (p.shift.startTime.getTime() - p.registeredAt.getTime()) / 3_600_000),
    });
    byShift.set(p.shiftId, row);
  }
  const rows = [...byShift.values()].map((row) => ({
    ...row,
    people: row.people.sort((a, b) => a.name.localeCompare(b.name, "nl")),
  }));
  const necessary = participations.filter((p) => p.praesidiumNecessity).length;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Link href={`${base}/admin/shiftenoverzicht?jaar=${year}`} className="text-sm text-vtk-muted hover:text-vtk-ink">
          {"← "}
          {nl ? "Shiftenoverzicht praesidium" : "Praesidium shift overview"}
        </Link>
        <h1 className="text-2xl font-semibold">
          {nl ? "Shiften op /shift van het praesidium" : "Praesidium shifts on /shift"}
          <span className="ml-2 text-base font-normal text-vtk-muted">{formatWorkingYear(year)}</span>
        </h1>
        <p className="max-w-3xl text-sm text-vtk-muted">
          {nl
            ? "Een shift op /shift telt standaard als vrije wil. Raakte een shift niet vol en werd het praesidium gevraagd ze te vullen, duid de inschrijving dan aan als noodzakelijk: die tellen apart in het overzicht. Wie zich laat inschreef, staat in het oranje; dat is vaak zo'n oproep."
            : "A shift on /shift counts as voluntary by default. If a shift did not fill up and the praesidium was asked to fill it, mark the registration as necessary: those count separately in the overview. Late registrations are shown in orange; that is often such a call."}
        </p>
        <p className="text-sm text-vtk-body">
          {nl
            ? `${participations.length} inschrijvingen van praesidiumleden op ${rows.length} shiften, waarvan ${necessary} noodzakelijk.`
            : `${participations.length} registrations by praesidium members on ${rows.length} shifts, ${necessary} of them necessary.`}
        </p>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-[18px] border border-dashed border-vtk-blue/20 p-6 text-sm text-vtk-muted">
          {nl
            ? "Nog geen praesidiumlid schreef zich dit werkingsjaar in op /shift."
            : "No praesidium member registered on /shift this working year yet."}
        </p>
      ) : (
        <SiteShiftTable locale={locale} rows={rows} />
      )}
    </div>
  );
}
