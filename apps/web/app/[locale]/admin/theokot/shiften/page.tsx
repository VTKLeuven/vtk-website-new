import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import Link from "@/components/ui/Link";
import { IconLink } from "@/components/ui/IconButton";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { brusselsWallClock, isoWeekKey, parseYMD, shiftYMD, ymdKey, type YMD } from "@/lib/brussels";
import { canEditShifts } from "@/lib/shift/authorization";
import { THEOKOT_TEMPLATE_SLUG } from "@/lib/shift/templates";
import { getShiftTemplate } from "@/lib/shift/templateStore";
import {
  buildTheokotTimeline,
  defaultSelectedShift,
  defaultTheokotWeek,
  mondayOf,
  weekdaysOf,
  type TheokotSlot,
} from "@/lib/theokotShifts";
import { ShiftTimeline, type DayLabel } from "./ShiftTimeline";

import "@/app/design/vtk-theokot-shiften.css";

/**
 * Theokot: de shiften van één werkweek als tijdlijn per dag, zodat Theokot ziet
 * op welke dagen en uren er nog shifters nodig zijn. Een eigen pagina in de
 * groep Theokot, naast Broodjes en Verhuur, en geen tab binnen Broodjes. Zie
 * docs/design-decisions.md, "Theokot: shiftenoverzicht".
 */

/** Een kalenderdag als Date op de middag in UTC, om met `timeZone: "UTC"` te formatteren. */
const noonUtc = (ymd: YMD) => new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12));

export default async function TheokotShiftsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const session = await requirePermission("theokot.manage");

  const now = new Date();
  const { week } = await searchParams;
  const requested = week ? parseYMD(week) : null;
  const defaultMonday = defaultTheokotWeek(now);
  const monday = requested ? mondayOf(requested) : defaultMonday;
  const days = weekdaysOf(monday);
  const saturday = shiftYMD(monday, 5);

  // Welke post een Theokot-shift draagt, zegt het sjabloon waarmee een
  // verkoopweek haar shiften neerzet. THEOKOT blijft er altijd bij, zodat een
  // sjabloon zonder post de pagina niet laat vollopen met elke shift zonder post.
  const template = await getShiftTemplate(THEOKOT_TEMPLATE_SLUG);
  const posts = new Set<string>(["THEOKOT"]);
  if (template?.post) posts.add(template.post);
  for (const entry of template?.shifts ?? []) {
    if (entry.ownPost && entry.post) posts.add(entry.post);
  }

  // Het vaste rooster, om te tonen welke gewone shift er een dag niet is.
  const anchor = /^(\d{2}):(\d{2})$/.exec(template?.timeOfDay ?? "");
  const slots: TheokotSlot[] = anchor
    ? (template?.shifts ?? [])
        .filter((entry) => entry.enabled)
        .map((entry) => {
          const startMinutes = Number(anchor[1]) * 60 + Number(anchor[2]) + entry.startOffsetMinutes;
          return { startMinutes, endMinutes: startMinutes + entry.durationMinutes };
        })
    : [];

  const shifts = await prisma.shift.findMany({
    where: {
      OR: [...posts].map((post) => ({ post: { equals: post, mode: "insensitive" as const } })),
      // Maandag 00:00 tot zaterdag 00:00 op de Brusselse klok: het weekend
      // hoort er nooit bij.
      startTime: {
        gte: brusselsWallClock(monday.year, monday.month, monday.day, "00:00"),
        lt: brusselsWallClock(saturday.year, saturday.month, saturday.day, "00:00"),
      },
      manualGrantId: null,
    },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      name: true,
      startTime: true,
      endTime: true,
      maxParticipants: true,
      participants: {
        orderBy: { registeredAt: "asc" },
        select: { user: { select: { name: true } } },
      },
    },
  });

  const timeline = buildTheokotTimeline({
    monday,
    shifts: shifts.map((shift) => ({
      id: shift.id,
      name: shift.name,
      startTime: shift.startTime,
      endTime: shift.endTime,
      maxParticipants: shift.maxParticipants,
      participants: shift.participants.map((participant) => participant.user.name),
    })),
    slots,
    now,
  });

  const tag = nl ? "nl-BE" : "en-GB";
  const short = new Intl.DateTimeFormat(tag, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
  const long = new Intl.DateTimeFormat(tag, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  const dayLabels: Record<string, DayLabel> = Object.fromEntries(
    days.map((day) => [
      ymdKey(day),
      { short: short.format(noonUtc(day)).replace(/\./g, ""), long: long.format(noonUtc(day)) },
    ]),
  );

  const friday = days[days.length - 1];
  const month = new Intl.DateTimeFormat(tag, { timeZone: "UTC", month: "long" });
  const range =
    monday.month === friday.month
      ? `${monday.day}–${friday.day} ${month.format(noonUtc(friday))} ${friday.year}`
      : `${monday.day} ${month.format(noonUtc(monday))} – ${friday.day} ${month.format(noonUtc(friday))} ${friday.year}`;
  const weekNumber = Number(isoWeekKey(monday).split("-W")[1]);
  const weekHref = (ymd: YMD) => `${base}/admin/theokot/shiften?week=${ymdKey(ymd)}`;
  const isDefaultWeek = ymdKey(monday) === ymdKey(defaultMonday);

  let summary: ReactNode;
  if (timeline.upcomingShifts === 0) {
    summary = nl ? "Deze week is voorbij." : "This week is over.";
  } else if (timeline.upcomingOpen === 0) {
    summary = nl ? "Alle komende shiften zijn volzet." : "Every upcoming shift is full.";
  } else {
    const places = nl
      ? `${timeline.upcomingOpen} ${timeline.upcomingOpen === 1 ? "plaats" : "plaatsen"} open`
      : `${timeline.upcomingOpen} ${timeline.upcomingOpen === 1 ? "place" : "places"} open`;
    summary = (
      <>
        <strong>{places}</strong>{" "}
        {nl
          ? `in ${timeline.upcomingOpenShifts} van de ${timeline.upcomingShifts} komende shiften`
          : `in ${timeline.upcomingOpenShifts} of the ${timeline.upcomingShifts} upcoming shifts`}
      </>
    );
  }

  return (
    <div className="tk-sh">
      <h1 className="text-2xl font-semibold">Theokot · {nl ? "Shiften" : "Shifts"}</h1>

      <div className="tk-sh-toolbar">
        <div className="tk-sh-week">
          <IconLink
            href={weekHref(shiftYMD(monday, -7))}
            label={nl ? "Vorige week" : "Previous week"}
          >
            <ChevronLeft aria-hidden="true" size={16} />
          </IconLink>
          <span className="tk-sh-week-label">
            {nl ? "Week" : "Week"} {weekNumber} · {range}
          </span>
          <IconLink
            href={weekHref(shiftYMD(monday, 7))}
            label={nl ? "Volgende week" : "Next week"}
          >
            <ChevronRight aria-hidden="true" size={16} />
          </IconLink>
          {isDefaultWeek ? null : (
            <Link href={`${base}/admin/theokot/shiften`} className="tk-sh-today">
              {nl ? "Naar deze week" : "To this week"}
            </Link>
          )}
        </div>
        {timeline.totalShifts > 0 ? <p className="tk-sh-summary">{summary}</p> : null}
      </div>

      {timeline.totalShifts === 0 ? (
        <div className="tk-sh-empty">
          <p>
            {nl
              ? "Er staan in deze week geen Theokot-shiften. Een verkoopweek aanmaken in Broodjes zet ze er vanzelf bij."
              : "There are no Theokot shifts in this week. Creating a sale week in Sandwiches adds them."}
          </p>
        </div>
      ) : (
        <ShiftTimeline
          timeline={timeline}
          dayLabels={dayLabels}
          initialSelected={defaultSelectedShift(timeline)}
          editHrefBase={canEditShifts(session) ? `${base}/admin/shiften` : null}
          nl={nl}
        />
      )}
    </div>
  );
}
