import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { brusselsTimeOnDay } from "@/lib/theokot";
import { brusselsWallClock, brusselsYMD, shiftYMD } from "@/lib/brussels";
import { TheokotAdminNav } from "../TheokotAdminNav";
import { PrintButton } from "./PrintButton";
import { SaleDayPicker } from "./SaleDayPicker";

import "@/app/design/vtk-basic.css";

export default async function TurflijstPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ date?: string; alles?: string }>;
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

  const { date, alles } = await searchParams;

  // Beschikbare dagen voor de kiezer. Standaard de laatste drie maanden plus
  // alles wat nog komt: een lijst van elke verkoopdag ooit wordt na een paar
  // jaar onbruikbaar. Wie verder terug moet, zet ze met één klik helemaal open.
  const showAll = alles === "1";
  const since = shiftYMD(brusselsYMD(new Date()), -92);
  const allSessions = await prisma.theokotSession.findMany({
    where: showAll
      ? undefined
      : { date: { gte: brusselsWallClock(since.year, since.month, since.day, "00:00") } },
    orderBy: { date: "desc" },
    select: { id: true, date: true },
  });
  const olderCount = showAll
    ? 0
    : await prisma.theokotSession.count({
        where: { date: { lt: brusselsWallClock(since.year, since.month, since.day, "00:00") } },
      });
  const ymd = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  const dayLabel = (d: Date) =>
    new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", { timeZone: "Europe/Brussels", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d);

  // Zonder gekozen dag de eerstvolgende verkoopdag, vandaag inbegrepen: dat is
  // de lijst die iemand in de Theokot nodig heeft. De kiezer staat van nieuw
  // naar oud, dus de eerste rij is de verste dag die al gepland is, niet de
  // volgende. Staat er niets meer gepland, dan de laatste die voorbij is.
  const today = ymd(new Date());
  const upcoming = allSessions.filter((s) => ymd(s.date) >= today).at(-1);
  const selected =
    allSessions.find((s) => ymd(s.date) === date) ?? upcoming ?? allSessions[0];

  type TurfRow = { id: string; name: string; students: number; grocomeet: number; bureau: number };
  let items: TurfRow[] = [];
  let totalOrders = 0;
  let sessionDate: Date | null = null;
  const meetingDrinks: Array<{ label: string; drinks: Array<{ name: string; count: number }> }> = [];

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

      // De broodjes van de grocomeet en het bureau gaan in een aparte doos, dus
      // ze krijgen hun eigen kolom in plaats van in het studentenaantal te
      // verdwijnen. Ze hangen aan hetzelfde aanbod-item.
      // Niet "plus 24 uur": op de twee dagen dat de klok verspringt, schuift dat
      // venster een uur en valt een vergadering er net binnen of buiten.
      const dayStart = brusselsTimeOnDay(full.date, "00:00");
      const next = shiftYMD(brusselsYMD(full.date), 1);
      const dayEnd = brusselsWallClock(next.year, next.month, next.day, "00:00");
      const [used, reservations] = await Promise.all([
        prisma.theokotOrderLine.groupBy({
          by: ["sessionItemId"],
          where: { sessionItem: { sessionId: full.id } },
          _sum: { quantity: true },
        }),
        prisma.meetingReservation.findMany({
          where: {
            status: "ACTIVE",
            meeting: { startsAt: { gte: dayStart, lt: dayEnd } },
          },
          include: { meeting: { select: { kind: true, startsAt: true } } },
        }),
      ]);

      const usedMap = new Map(used.map((u) => [u.sessionItemId, u._sum.quantity ?? 0]));
      const meetingCounts = new Map<string, { grocomeet: number; bureau: number }>();
      for (const reservation of reservations) {
        if (!reservation.sessionItemId) continue;
        const row = meetingCounts.get(reservation.sessionItemId) ?? { grocomeet: 0, bureau: 0 };
        if (reservation.meeting.kind === "GROCOMEET") row.grocomeet += 1;
        else row.bureau += 1;
        meetingCounts.set(reservation.sessionItemId, row);
      }

      items = full.items
        .map((i) => ({
          id: i.id,
          name: nl ? i.nameNl : i.nameEn ?? i.nameNl,
          students: usedMap.get(i.id) ?? 0,
          grocomeet: meetingCounts.get(i.id)?.grocomeet ?? 0,
          bureau: meetingCounts.get(i.id)?.bureau ?? 0,
        }))
        .filter((i) => i.students + i.grocomeet + i.bureau > 0);

      // De drankjes horen in dezelfde doos, dus ze staan op hetzelfde blad.
      for (const kind of ["GROCOMEET", "BUREAU"] as const) {
        const drinks = new Map<string, number>();
        for (const reservation of reservations) {
          if (reservation.meeting.kind !== kind || !reservation.drinkName) continue;
          drinks.set(reservation.drinkName, (drinks.get(reservation.drinkName) ?? 0) + 1);
        }
        if (drinks.size === 0) continue;
        meetingDrinks.push({
          label: kind === "GROCOMEET" ? "Grocomeet" : "VTK Bureau",
          drinks: [...drinks.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
        });
      }
    }
  }

  const hasGrocomeet = items.some((i) => i.grocomeet > 0);
  const hasBureau = items.some((i) => i.bureau > 0);

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
        #turf-print th { background: #E6ECF5; font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; }
        #turf-print td.num { text-align: center; font-variant-numeric: tabular-nums; width: 4rem; }
        #turf-print td.tally { width: 40%; }
        #turf-print td.check { width: 3rem; text-align: center; }
      `}</style>

      <div className="no-print space-y-5">
        <h1 className="text-2xl font-semibold">Theokot · {nl ? "Lijst bestelde broodjes" : "Ordered sandwiches list"}</h1>
        <TheokotAdminNav base={base} nl={nl} active="turflijst" caps={caps} />
        <div className="flex flex-wrap items-end gap-3">
          {allSessions.length > 0 && (
            <SaleDayPicker
              base={base}
              label={nl ? "Verkoopdag" : "Sale day"}
              options={allSessions.map((s) => ({ value: ymd(s.date), label: dayLabel(s.date) }))}
              selected={selected ? ymd(selected.date) : ""}
              showAll={showAll}
            />
          )}
          {olderCount > 0 && (
            <Link
              href={`${base}/admin/theokot/turflijst?alles=1`}
              className="text-sm text-[#5c667f] underline underline-offset-2 hover:text-vtk-ink"
            >
              {nl
                ? `Toon ook de ${olderCount} oudere verkoopdag(en)`
                : `Also show the ${olderCount} older sale day(s)`}
            </Link>
          )}
          {items.length > 0 && <PrintButton label={nl ? "Print / Download" : "Print / Download"} />}
        </div>
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
                  <th className="num">{nl ? "Studenten" : "Students"}</th>
                  {hasGrocomeet && <th className="num">GM</th>}
                  {hasBureau && <th className="num">{nl ? "Bureau" : "Bureau"}</th>}
                  <th className="num">{nl ? "Totaal" : "Total"}</th>
                  <th className="tally">{nl ? "Gemaakt (turven)" : "Made (tally)"}</th>
                  <th className="check">✓</th>
                </tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td className="num">{i.students}</td>
                    {hasGrocomeet && <td className="num">{i.grocomeet || ""}</td>}
                    {hasBureau && <td className="num">{i.bureau || ""}</td>}
                    <td className="num">{i.students + i.grocomeet + i.bureau}</td>
                    <td className="tally">&nbsp;</td>
                    <td className="check">&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {(hasGrocomeet || hasBureau) && (
            <p style={{ marginTop: 10, fontSize: 13 }}>
              {nl
                ? "De kolommen GM en Bureau gaan in een aparte doos."
                : "The GM and Bureau columns go in a separate box."}
            </p>
          )}

          {meetingDrinks.map((group) => (
            <div key={group.label} style={{ marginTop: 12, fontSize: 13 }}>
              <strong>{group.label} · {nl ? "drankjes" : "drinks"}:</strong>{" "}
              {group.drinks.map((drink) => `${drink.count}× ${drink.name}`).join(", ")}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
