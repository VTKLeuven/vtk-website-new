import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { Button, Card } from "@vtk/ui";
import { EventRowActions } from "./EventRowActions";

export default async function AdminCalendar({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tonen?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const session = await requireSession();
  const base = locale === "nl" ? "" : "/en";

  const showPast = (await searchParams).tonen === "verleden";

  const canAll = session.user.isSuperAdmin || hasPermission(session, "calendar.manageAll");
  const canCreate = canAll || hasPermission(session, "calendar.create");

  if (!canCreate) {
    return <p>{nl ? "Geen toegang." : "No access."}</p>;
  }

  const now = new Date();
  const scope = canAll ? {} : { groupId: { in: session.groups.map((g) => g.id) } };
  // Op `end` filteren, niet op `start`: een evenement dat nu bezig is, is niet
  // voorbij en moet bewerkbaar blijven.
  const period = showPast ? { end: { lt: now } } : { end: { gte: now } };

  const events = await prisma.calendarEvent.findMany({
    where: { ...scope, ...period },
    include: { group: true },
    // Aankomend: eerstvolgende bovenaan. Verleden: recentste bovenaan.
    orderBy: { start: showPast ? "desc" : "asc" },
    take: 100,
  });

  const dateFmt = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{nl ? "Evenementen" : "Events"}</h1>
        <Link href={`${base}/admin/kalender/new`}>
          <Button>{nl ? "Nieuw evenement" : "New event"}</Button>
        </Link>
      </div>

      <div className="flex gap-2">
        <FilterPill href={`${base}/admin/kalender`} active={!showPast}>
          {nl ? "Aankomend" : "Upcoming"}
        </FilterPill>
        <FilterPill href={`${base}/admin/kalender?tonen=verleden`} active={showPast}>
          {nl ? "Verleden" : "Past"}
        </FilterPill>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-vtk-blue-soft text-left">
            <tr>
              <th className="px-4 py-2">{nl ? "Titel" : "Title"}</th>
              <th className="px-4 py-2">{nl ? "Groep" : "Group"}</th>
              <th className="px-4 py-2">Start</th>
              <th className="px-4 py-2">{nl ? "Einde" : "End"}</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t border-zinc-200">
                <td className="px-4 py-2 font-medium">{e.titleNl}</td>
                <td className="px-4 py-2 text-zinc-500">{nl ? e.group.nameNl : e.group.nameEn}</td>
                <td className="px-4 py-2 tabular-nums text-zinc-500">{dateFmt.format(e.start)}</td>
                <td className="px-4 py-2 tabular-nums text-zinc-500">{dateFmt.format(e.end)}</td>
                <td className="px-4 py-2 text-right">
                  <EventRowActions locale={locale} id={e.id} title={e.titleNl} base={base} />
                </td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                  {showPast
                    ? nl
                      ? "Geen evenementen in het verleden"
                      : "No past events"
                    : nl
                      ? "Geen aankomende evenementen"
                      : "No upcoming events"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function FilterPill({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={[
        "rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-vtk-ink bg-vtk-ink text-vtk-surface"
          : "border-vtk-blue/15 text-vtk-ink hover:border-vtk-blue/30 hover:bg-vtk-blue-soft/70",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}
