import Link from "next/link";
import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { Button, Card } from "@vtk/ui";
import { sharedMomentTime } from "@/lib/calendar/moments";
import { EventRow } from "./EventRow";

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
  // Het weekoverzicht op de homepage is een eigen permissie; zie het veld in het
  // formulier en `setEventHeroWeekAction`.
  const canHeroWeek = session.user.isSuperAdmin || hasPermission(session, "calendar.heroWeek");

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
    include: {
      group: true,
      // De losse momenten van een reeks: de kolom "Wanneer" schrijft ze als een
      // periode met het gedeelde uur, in plaats van als één blok van vrijdag tot
      // woensdag. Zie `CalendarEventMoment`.
      moments: { orderBy: { start: "asc" }, select: { start: true, end: true, label: true } },
      _count: { select: { interests: true, guestInterests: true } },
    },
    // Aankomend: eerstvolgende bovenaan. Verleden: recentste bovenaan.
    orderBy: { start: showPast ? "desc" : "asc" },
    take: 100,
  });

  const tag = nl ? "nl-BE" : "en-GB";
  const zone = "Europe/Brussels";
  const dayFmt = new Intl.DateTimeFormat(tag, {
    timeZone: zone,
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const shortDayFmt = new Intl.DateTimeFormat(tag, { timeZone: zone, day: "2-digit", month: "short" });
  const timeFmt = new Intl.DateTimeFormat(tag, { timeZone: zone, hour: "2-digit", minute: "2-digit" });
  const dayKey = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
      date,
    );

  /**
   * Eén kolom "Wanneer" in plaats van Start en Einde apart.
   *
   * Twee kolommen met een volledige datum en een uur erin namen samen bijna de
   * halve tabel, terwijl het einde bijna altijd dezelfde dag is; die ruimte is nu
   * de kolom Homepage. Een reeks losse momenten leest hier bovendien als een
   * periode met haar gedeelde uur, in plaats van als één blok dat van vrijdag tot
   * woensdag doorloopt (dat is precies wat de momenten niet zijn).
   */
  function whenLabel(event: {
    start: Date;
    end: Date;
    allDay: boolean;
    moments: Array<{ start: Date; end: Date; label: string | null }>;
  }): { main: string; sub: string | null } {
    if (event.moments.length > 0) {
      const first = event.moments[0]!.start;
      const last = event.moments[event.moments.length - 1]!.start;
      // Het aantal staat er altijd bij; het uur enkel wanneer elk moment
      // hetzelfde uur draagt, want anders is elke samenvatting op één uur
      // gelogen (zie `sharedMomentTime`).
      const shared = sharedMomentTime(event.moments, zone);
      const count = `${event.moments.length} ${nl ? "momenten" : "moments"}`;
      return {
        main: `${shortDayFmt.format(first)} ${nl ? "t.e.m." : "to"} ${dayFmt.format(last)}`,
        sub: shared ? `${count} · ${nl ? "telkens" : "each time"} ${shared}` : count,
      };
    }
    if (event.allDay) {
      const sameDay = dayKey(event.start) === dayKey(event.end);
      return {
        main: sameDay
          ? dayFmt.format(event.start)
          : `${shortDayFmt.format(event.start)} ${nl ? "t.e.m." : "to"} ${dayFmt.format(event.end)}`,
        sub: nl ? "hele dag" : "all day",
      };
    }
    if (dayKey(event.start) === dayKey(event.end)) {
      return {
        main: dayFmt.format(event.start),
        sub: `${timeFmt.format(event.start)} - ${timeFmt.format(event.end)}`,
      };
    }
    return {
      main: `${shortDayFmt.format(event.start)} ${nl ? "t.e.m." : "to"} ${dayFmt.format(event.end)}`,
      sub: `${timeFmt.format(event.start)} - ${timeFmt.format(event.end)}`,
    };
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <h1 className="text-2xl font-semibold">{nl ? "Evenementen" : "Events"}</h1>
        <div className="flex items-center gap-3">
          {canAll && (
            <Link
              href={`${base}/admin/kalender/categorieen`}
              className="text-sm text-vtk-blue-muted hover:underline"
            >
              {nl ? "Categorieën" : "Categories"}
            </Link>
          )}
          <Link href={`${base}/admin/kalender/new`}>
            <Button>{nl ? "Nieuw evenement" : "New event"}</Button>
          </Link>
        </div>
      </div>

      <div className="flex gap-2">
        <FilterPill href={`${base}/admin/kalender`} active={!showPast}>
          {nl ? "Aankomend" : "Upcoming"}
        </FilterPill>
        <FilterPill href={`${base}/admin/kalender?tonen=verleden`} active={showPast}>
          {nl ? "Verleden" : "Past"}
        </FilterPill>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-vtk-blue-soft text-left">
            <tr>
              <th className="px-4 py-2">{nl ? "Titel" : "Title"}</th>
              <th className="px-4 py-2">{nl ? "Wanneer" : "When"}</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">{nl ? "Geïnteresseerd" : "Interested"}</th>
              {canHeroWeek ? <th className="px-4 py-2">{nl ? "Homepage" : "Home page"}</th> : null}
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <EventRow
                key={e.id}
                locale={locale}
                base={base}
                canHeroWeek={canHeroWeek}
                event={{
                  id: e.id,
                  title: e.titleNl,
                  group: nl ? e.group.nameNl : e.group.nameEn,
                  published: Boolean(e.publishedAt),
                  interested: e._count.interests + e._count.guestInterests,
                  when: whenLabel(e),
                  heroWeek: e.heroWeek,
                }}
              />
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={canHeroWeek ? 6 : 5} className="px-4 py-8 text-center text-zinc-500">
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
