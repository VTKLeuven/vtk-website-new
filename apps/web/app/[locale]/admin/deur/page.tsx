import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import type { DoorLogResult } from "@prisma/client";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { getDictionary, type Locale } from "@vtk/i18n";
import { getDoorStats } from "@/lib/door-server";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { revokeDoorGrantAction } from "@/app/actions/door";
import type { SaveLabels } from "@/app/[locale]/admin/pocs/PocsTable";
import { DoorGrantForm } from "./DoorGrantForm";

const PAGE_SIZE = 50;
const DENIED_RESULTS: DoorLogResult[] = ["DENIED", "UNKNOWN_CARD", "ERROR"];

type Search = { days?: string; result?: string; page?: string };

export default async function DoorAdminPage({
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
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/deur`);
  const canManage = session.user.isSuperAdmin || session.permissions.includes("door.manage");
  if (!canManage) return <p className="text-sm text-zinc-500">{nl ? "Geen toegang." : "No access."}</p>;

  const dict = getDictionary(locale);
  const sp = await searchParams;
  const days = sp.days === "1" || sp.days === "30" || sp.days === "all" ? sp.days : "7";
  const onlyDenied = sp.result === "denied";
  const page = Math.max(1, Number(sp.page) || 1);

  const now = new Date();
  const logWhere = {
    ...(days === "all" ? {} : { at: { gte: new Date(now.getTime() - Number(days) * 86_400_000) } }),
    ...(onlyDenied ? { result: { in: DENIED_RESULTS } } : {}),
  };

  const [stats, grants, logCount, logs] = await Promise.all([
    getDoorStats(now),
    prisma.doorAccessGrant.findMany({
      where: { endsAt: { gt: now } },
      orderBy: [{ startsAt: "asc" }],
      take: 200,
      include: { user: { select: { name: true, rNumber: true } } },
    }),
    prisma.doorAccessLog.count({ where: logWhere }),
    prisma.doorAccessLog.findMany({
      where: logWhere,
      orderBy: { at: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { user: { select: { name: true } } },
    }),
  ]);

  const dateTimeFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const grantSaveLabels: SaveLabels = {
    submitLabel: nl ? "Toegang geven" : "Grant access",
    savingLabel: nl ? "Opslaan..." : "Saving...",
    savedMessage: nl ? "Tijdelijke toegang toegevoegd." : "Temporary access added.",
    fallbackErrorMessage: nl ? "Toevoegen mislukt." : "Could not add access.",
    errorMessages: {
      no_user: nl ? "Kies eerst een geldige persoon." : "Pick a valid person first.",
      bad_dates: nl ? "De einddatum moet na de startdatum liggen." : "The end must be after the start.",
    },
  };

  const totalPages = Math.max(1, Math.ceil(logCount / PAGE_SIZE));
  const buildHref = (patch: Partial<Search>) => {
    const next = new URLSearchParams({ days, ...(onlyDenied ? { result: "denied" } : {}), page: String(page) });
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    return `${base}/admin/deur${qs ? `?${qs}` : ""}`;
  };

  const resultLabel = (r: DoorLogResult): string => {
    if (nl)
      return { ALLOWED: "Toegelaten", DENIED: "Geweigerd", UNKNOWN_CARD: "Onbekende kaart", ERROR: "Fout" }[r];
    return { ALLOWED: "Allowed", DENIED: "Denied", UNKNOWN_CARD: "Unknown card", ERROR: "Error" }[r];
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{dict.admin.door}</h1>
        <p className="text-sm text-zinc-500">
          {nl
            ? "Wie de deur mag openen met zijn studentenkaart regel je via het recht door.open in /admin/roles. Hieronder geef je tijdelijke toegang en zie je het gebruik."
            : "Who may open the door with their student card is set via the door.open permission in /admin/roles. Below you grant temporary access and see usage."}
        </p>
      </header>

      {/* Statistiek */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((w) => (
          <div key={w.days} className="rounded-2xl border border-vtk-blue/12 bg-white p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-[#5c667f]">
              {nl ? `Laatste ${w.days} ${w.days === 1 ? "dag" : "dagen"}` : `Last ${w.days} ${w.days === 1 ? "day" : "days"}`}
            </div>
            <div className="mt-1 text-2xl font-semibold tabular-nums text-vtk-ink">{w.total}</div>
            <div className="mt-0.5 text-xs text-[#5c667f]">
              {nl ? `${w.card} kaart · ${w.remote} remote` : `${w.card} card · ${w.remote} remote`}
            </div>
          </div>
        ))}
      </section>

      {/* Tijdelijke toegang */}
      <section className="space-y-3 rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <div>
          <h2 className="text-sm font-semibold text-vtk-ink">{nl ? "Tijdelijke toegang" : "Temporary access"}</h2>
          <p className="text-xs text-[#5c667f]">
            {nl
              ? "Geef iemand deurtoegang binnen een venster, los van zijn rollen. Verlopen toegang verdwijnt vanzelf uit deze lijst."
              : "Give someone door access within a window, independent of their roles. Expired access drops off this list by itself."}
          </p>
        </div>

        <DoorGrantForm locale={locale} saveLabels={grantSaveLabels} />

        {grants.length === 0 ? (
          <p className="text-sm text-[#5c667f]">{nl ? "Geen lopende of geplande toegang." : "No active or scheduled access."}</p>
        ) : (
          <ul className="divide-y divide-vtk-blue/10">
            {grants.map((g) => {
              const activeNow = g.startsAt <= now && g.endsAt > now;
              return (
                <li key={g.id} className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-vtk-ink">
                      <span className="truncate">{g.user.name}</span>
                      {g.user.rNumber ? <span className="text-xs font-normal text-[#5c667f]">{g.user.rNumber}</span> : null}
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                          (activeNow ? "bg-yellow-100 text-yellow-800" : "bg-vtk-blue-soft/60 text-[#5c667f]")
                        }
                      >
                        {activeNow ? (nl ? "Actief" : "Active") : nl ? "Gepland" : "Scheduled"}
                      </span>
                    </div>
                    <div className="text-xs text-[#5c667f]">
                      {dateTimeFmt.format(g.startsAt)} → {dateTimeFmt.format(g.endsAt)}
                      {g.note ? ` · ${g.note}` : ""}
                    </div>
                  </div>
                  <DeleteIconButton
                    action={revokeDoorGrantAction}
                    fields={{ id: g.id }}
                    label={nl ? "Intrekken" : "Revoke"}
                    srLabel={`${nl ? "Intrekken" : "Revoke"}: ${g.user.name}`}
                    title={nl ? "Toegang intrekken?" : "Revoke access?"}
                    description={
                      nl
                        ? `${g.user.name} verliest de tijdelijke deurtoegang. Rollen met door.open blijven ongewijzigd.`
                        : `${g.user.name} loses this temporary door access. Roles with door.open stay unchanged.`
                    }
                    confirmLabel={nl ? "Intrekken" : "Revoke"}
                    cancelLabel={nl ? "Annuleren" : "Cancel"}
                    successMessage={nl ? "Toegang ingetrokken." : "Access revoked."}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Log */}
      <section className="space-y-3 rounded-2xl border border-vtk-blue/12 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-vtk-ink">{nl ? "Toegangslog" : "Access log"}</h2>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {(["1", "7", "30", "all"] as const).map((d) => (
              <Link
                key={d}
                href={buildHref({ days: d, page: "1" })}
                className={
                  "rounded-full border px-3 py-1 " +
                  (days === d ? "border-vtk-blue bg-vtk-blue/10 text-vtk-ink" : "border-vtk-blue/20 text-[#5c667f]")
                }
              >
                {d === "all" ? (nl ? "Alles" : "All") : nl ? `${d}d` : `${d}d`}
              </Link>
            ))}
            <Link
              href={buildHref({ result: onlyDenied ? undefined : "denied", page: "1" })}
              className={
                "rounded-full border px-3 py-1 " +
                (onlyDenied ? "border-vtk-blue bg-vtk-blue/10 text-vtk-ink" : "border-vtk-blue/20 text-[#5c667f]")
              }
            >
              {nl ? "Enkel geweigerd" : "Denied only"}
            </Link>
          </div>
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-[#5c667f]">{nl ? "Geen gebeurtenissen in dit venster." : "No events in this window."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-[#5c667f]">
                  <th className="py-2 pr-3">{nl ? "Tijdstip" : "Time"}</th>
                  <th className="py-2 pr-3">{nl ? "Persoon" : "Person"}</th>
                  <th className="py-2 pr-3">{nl ? "Methode" : "Method"}</th>
                  <th className="py-2 pr-3">{nl ? "Resultaat" : "Result"}</th>
                  <th className="py-2">{nl ? "Detail" : "Detail"}</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((l) => (
                  <tr key={l.id} className="border-t border-vtk-blue/10">
                    <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-[#34405e]">{dateTimeFmt.format(l.at)}</td>
                    <td className="py-2 pr-3 text-vtk-ink">
                      {l.user?.name ?? l.cardName ?? "—"}
                      {l.rNumber ? <span className="ml-1 text-xs text-[#5c667f]">{l.rNumber}</span> : null}
                    </td>
                    <td className="py-2 pr-3 text-[#5c667f]">
                      {l.method === "REMOTE" ? (nl ? "Remote" : "Remote") : nl ? "Kaart" : "Card"}
                      {l.offline ? <span className="ml-1 text-[11px] text-[#5c667f]">(offline)</span> : null}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[11px] font-medium " +
                          (l.result === "ALLOWED" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800")
                        }
                      >
                        {resultLabel(l.result)}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-[#5c667f]">{l.reason ?? ""}</td>
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
    </div>
  );
}
