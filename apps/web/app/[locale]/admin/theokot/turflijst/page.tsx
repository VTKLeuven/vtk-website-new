import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { TheokotAdminNav } from "../TheokotAdminNav";
import { PrintButton } from "./PrintButton";

import "@/app/design/vtk-basic.css";

export default async function TurflijstPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/theokot/turflijst`);
  const has = (p: string) => session.user.isSuperAdmin || session.permissions.includes(p);
  const caps = { manage: has("theokot.manage"), pickup: has("theokot.pickup") };
  if (!caps.pickup) return <p className="text-sm text-zinc-500">{nl ? "Geen toegang." : "No access."}</p>;

  const { date } = await searchParams;

  // Beschikbare dagen voor de kiezer (met minstens één sessie).
  const allSessions = await prisma.theokotSession.findMany({
    orderBy: { date: "desc" },
    select: { id: true, date: true },
  });
  const ymd = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const dayLabel = (d: Date) =>
    new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);

  const selected = allSessions.find((s) => ymd(s.date) === date) ?? allSessions[0];

  let items: Array<{ name: string; reserved: number }> = [];
  let totalOrders = 0;
  let sessionDate: Date | null = null;

  if (selected) {
    const full = await prisma.theokotSession.findUnique({
      where: { id: selected.id },
      include: {
        items: { orderBy: { order: "asc" } },
        _count: { select: { orders: true } },
      },
    });
    if (full) {
      sessionDate = full.date;
      totalOrders = full._count.orders;
      const used = await prisma.theokotOrderLine.groupBy({
        by: ["sessionItemId"],
        where: { sessionItem: { sessionId: full.id } },
        _sum: { quantity: true },
      });
      const usedMap = new Map(used.map((u) => [u.sessionItemId, u._sum.quantity ?? 0]));
      items = full.items
        .map((i) => ({ name: nl ? i.nameNl : i.nameEn ?? i.nameNl, reserved: usedMap.get(i.id) ?? 0 }))
        .filter((i) => i.reserved > 0);
    }
  }

  return (
    <div className="space-y-5">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #turf-print, #turf-print * { visibility: visible !important; }
          #turf-print { position: absolute; left: 0; top: 0; width: 100%; padding: 0; }
          .no-print { display: none !important; }
        }
        #turf-print table { width: 100%; border-collapse: collapse; }
        #turf-print th, #turf-print td { border: 1px solid #0A0F1F; padding: 8px 12px; text-align: left; }
        #turf-print th { background: #F2F0E9; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
        #turf-print td.num { text-align: center; font-variant-numeric: tabular-nums; width: 4rem; }
        #turf-print td.tally { width: 40%; }
        #turf-print td.check { width: 3rem; text-align: center; }
      `}</style>

      <div className="no-print space-y-5">
        <h1 className="text-2xl font-semibold">Theokot · {nl ? "Lijst bestelde broodjes" : "Ordered sandwiches list"}</h1>
        <TheokotAdminNav base={base} nl={nl} active="turflijst" caps={caps} />
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wide text-[#5c667f]">
              {nl ? "Verkoopdag" : "Sale day"}
            </label>
            <select
              name="date"
              defaultValue={selected ? ymd(selected.date) : ""}
              className="mt-1 rounded-xl border border-vtk-blue/12 bg-white px-3 py-2 text-sm"
            >
              {allSessions.map((s) => (
                <option key={s.id} value={ymd(s.date)}>
                  {dayLabel(s.date)}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="rounded-full border border-vtk-blue/15 px-4 py-2 text-sm hover:bg-vtk-blue-soft/60">
            {nl ? "Tonen" : "Show"}
          </button>
          {items.length > 0 && <PrintButton label={nl ? "Print / Download" : "Print / Download"} />}
        </form>
      </div>

      {!selected && (
        <div className="vtk-basic-empty no-print">{nl ? "Nog geen verkoopdagen." : "No sale days yet."}</div>
      )}

      {selected && (
        <div id="turf-print">
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 600, textTransform: "capitalize" }}>
              Theokot — {sessionDate ? dayLabel(sessionDate) : ""}
            </div>
            <div style={{ fontSize: 13, color: "#5c667f" }}>
              {totalOrders} {nl ? "bestellingen" : "orders"}
            </div>
          </div>
          {items.length === 0 ? (
            <p style={{ fontSize: 14, color: "#5c667f" }}>
              {nl ? "Geen reservaties voor deze dag." : "No reservations for this day."}
            </p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{nl ? "Broodje" : "Sandwich"}</th>
                  <th className="num">{nl ? "Gereserveerd" : "Reserved"}</th>
                  <th className="tally">{nl ? "Gemaakt (turven)" : "Made (tally)"}</th>
                  <th className="check">✓</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.name}>
                    <td>{i.name}</td>
                    <td className="num">{i.reserved}</td>
                    <td className="tally">&nbsp;</td>
                    <td className="check">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
