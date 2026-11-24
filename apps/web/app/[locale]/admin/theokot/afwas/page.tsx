import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { brusselsYMD, isoWeekKey, parseYMD, shiftYMD, ymdKey, type YMD } from "@/lib/brussels";
import {
  AFWAS_KINDS,
  AFWAS_WEEKS_PER_PAGE,
  afwasBlock,
  afwasWeeks,
  clock,
  dateToDay,
  dayToDate,
  defaultTheokotWeek,
  describeAfwas,
  inWeekAfterEvent,
  kindLabel,
  mondayOf,
  AFWAS_HOUR_INDEXES,
  bookedSpan,
  hourLabel,
  hourPast,
  hoursLabel,
  theokotDayState,
  weekAfterEvent,
  type AfwasSlot,
  type WeekSessions,
} from "@/lib/theokotAfwas";
import {
  afwasGroupOptions,
  canManageAfwas,
  loadAfwasSlot,
  loadWeekSessions,
  ownAfwasGroupIds,
} from "@/lib/theokotAfwas-server";
import { AfwasPlanner, type AfwasDayView, type AfwasEntryView, type AfwasWeekView } from "./AfwasPlanner";

/**
 * /admin/theokot/afwas, de opvolger van de Excel "bekers afwassen": bovenaan
 * wie nog moet afwassen (de linkertabel van de Excel), daaronder zes werkweken
 * met per werkdag drie uren, elk vrij, geboekt of dicht (de tijdsloten). Alles wordt hier
 * uitgerekend; de client houdt enkel het open venster bij. Zie
 * docs/design-decisions.md, "Theokot: afwasbeurten".
 */

/** Een kalenderdag als Date op de middag in UTC, om met `timeZone: "UTC"` te formatteren. */
const noonUtc = (ymd: YMD) => new Date(Date.UTC(ymd.year, ymd.month - 1, ymd.day, 12));

const ENTRY_SELECT = {
  id: true,
  day: true,
  groupId: true,
  kinds: true,
  quantity: true,
  eventDate: true,
  note: true,
  washedAt: true,
  hours: { select: { hour: true } },
  group: { select: { nameNl: true, nameEn: true } },
  createdBy: { select: { name: true } },
  washedBy: { select: { name: true } },
} as const;

/** Hoeveel afgevinkte regels er onderaan blijven staan, om een vergissing terug te zetten. */
const RECENT_WASHED = 6;

export default async function TheokotAfwasPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ vanaf?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const nl = locale === "nl";
  const path = `${nl ? "" : "/en"}/admin/theokot/afwas`;
  const session = await requireSession();
  const manage = canManageAfwas(session);
  const own = ownAfwasGroupIds(session);
  if (!manage && own.length === 0) notFound();

  const now = new Date();
  const today = brusselsYMD(now);
  const { vanaf } = await searchParams;
  const requested = vanaf ? parseYMD(vanaf) : null;
  const defaultMonday = defaultTheokotWeek(now);
  const firstMonday = requested ? mondayOf(requested) : defaultMonday;
  const weeks = afwasWeeks(firstMonday, AFWAS_WEEKS_PER_PAGE);
  const firstDay = weeks[0][0];
  const lastDay = weeks[weeks.length - 1][4];

  const [slot, inRange, outstanding, recent, groups] = await Promise.all([
    loadAfwasSlot(),
    prisma.theokotDishwash.findMany({
      where: { day: { gte: dayToDate(firstDay), lte: dayToDate(lastDay) } },
      select: ENTRY_SELECT,
    }),
    // Wie moet nog afwassen: alles wat niet afgevinkt is, eerst wat nog geen
    // namiddag heeft, dan op namiddag.
    prisma.theokotDishwash.findMany({
      where: { washedAt: null },
      orderBy: [{ day: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      select: ENTRY_SELECT,
    }),
    prisma.theokotDishwash.findMany({
      where: { washedAt: { not: null } },
      orderBy: { washedAt: "desc" },
      take: RECENT_WASHED,
      select: ENTRY_SELECT,
    }),
    afwasGroupOptions(session, nl),
  ]);

  // De verkoopdagen voor het raster én voor de namiddagen in de lijst, die
  // buiten de zes weken kunnen vallen.
  const listedDays = [...outstanding, ...recent].flatMap((entry) => (entry.day ? [dateToDay(entry.day)] : []));
  const keys = [firstDay, lastDay, ...listedDays].map(ymdKey).sort();
  const sessions = await loadWeekSessions(parseYMD(keys[0])!, parseYMD(keys[keys.length - 1])!);

  const tag = nl ? "nl-BE" : "en-GB";
  const short = new Intl.DateTimeFormat(tag, { timeZone: "UTC", weekday: "short", day: "numeric", month: "short" });
  const long = new Intl.DateTimeFormat(tag, { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  const monthShort = new Intl.DateTimeFormat(tag, { timeZone: "UTC", month: "short" });
  const shortLabel = (day: YMD) => short.format(noonUtc(day)).replace(/\./g, "");
  const strip = (text: string) => text.replace(/\./g, "");
  const ownSet = new Set(own);
  const toEntry = (entry: (typeof outstanding)[number]) =>
    entryView(entry, { nl, manage, ownSet, slot, sessions, now, shortLabel });

  const todayKey = ymdKey(today);
  // Per dag en per uur de afwas die het neemt.
  const byHour = new Map<string, (typeof inRange)[number]>();
  for (const entry of inRange) {
    for (const { hour } of entry.hours) byHour.set(`${ymdKey(dateToDay(entry.day as Date))}:${hour}`, entry);
  }

  const weekViews: AfwasWeekView[] = weeks.map((days) => {
    const monday = days[0];
    const friday = days[4];
    const range =
      monday.month === friday.month
        ? `${monday.day}–${friday.day} ${strip(monthShort.format(noonUtc(friday)))}`
        : `${monday.day} ${strip(monthShort.format(noonUtc(monday)))} – ${friday.day} ${strip(monthShort.format(noonUtc(friday)))}`;
    return {
      key: ymdKey(monday),
      title: `${nl ? "Week" : "Week"} ${Number(isoWeekKey(monday).split("-W")[1])}`,
      range,
      days: days.map((day): AfwasDayView => {
        const key = ymdKey(day);
        const state = theokotDayState(day, sessions);
        return {
          key,
          short: shortLabel(day),
          long: long.format(noonUtc(day)),
          today: key === todayKey,
          state,
          block: afwasBlock({ day, state, slot, now }),
          hours: AFWAS_HOUR_INDEXES.map((hour) => {
            const entry = byHour.get(`${key}:${hour}`);
            return {
              hour,
              label: hourLabel(slot, hour),
              past: hourPast(day, slot, hour, now),
              entry: entry ? toEntry(entry) : null,
            };
          }),
        };
      }),
    };
  });

  const defaultGroupId = groups.find((group) => ownSet.has(group.id))?.id ?? groups[0]?.id ?? "";

  return (
    <AfwasPlanner
      nl={nl}
      weeks={weekViews}
      outstanding={outstanding.map(toEntry)}
      recentlyWashed={recent.map(toEntry)}
      slotLabel={`${clock(slot.startMinutes)}–${clock(slot.endMinutes)}`}
      slotShift={slot.shiftName}
      groups={groups}
      defaultGroupId={defaultGroupId}
      kinds={AFWAS_KINDS.map((kind) => ({ value: kind, label: kindLabel(kind, nl) }))}
      manage={manage}
      nav={{
        previous: `${path}?vanaf=${ymdKey(shiftYMD(firstMonday, -7 * AFWAS_WEEKS_PER_PAGE))}`,
        next: `${path}?vanaf=${ymdKey(shiftYMD(firstMonday, 7 * AFWAS_WEEKS_PER_PAGE))}`,
        today: ymdKey(firstMonday) === ymdKey(defaultMonday) ? null : path,
        label: `${shortLabel(firstDay)} – ${shortLabel(lastDay)}`,
      }}
    />
  );
}

type EntryRow = {
  id: string;
  day: Date | null;
  groupId: string;
  kinds: (typeof AFWAS_KINDS)[number][];
  quantity: string;
  eventDate: Date | null;
  note: string | null;
  washedAt: Date | null;
  hours: { hour: number }[];
  group: { nameNl: string; nameEn: string };
  createdBy: { name: string } | null;
  washedBy: { name: string } | null;
};

function entryView(
  entry: EntryRow,
  context: {
    nl: boolean;
    manage: boolean;
    ownSet: Set<string>;
    slot: AfwasSlot;
    sessions: WeekSessions;
    now: Date;
    shortLabel: (day: YMD) => string;
  },
): AfwasEntryView {
  const { nl, manage, ownSet, slot, sessions, now, shortLabel } = context;
  const day = entry.day ? dateToDay(entry.day) : null;
  const eventDay = entry.eventDate ? dateToDay(entry.eventDate) : null;
  const own = ownSet.has(entry.groupId);
  const hours = entry.hours.map((row) => row.hour).sort((a, b) => a - b);
  // Begonnen zodra het eerste geboekte uur begon.
  const started = day && hours.length > 0 ? now.getTime() >= bookedSpan(day, slot, hours).start.getTime() : false;
  return {
    id: entry.id,
    groupId: entry.groupId,
    groupName: (nl ? entry.group.nameNl : entry.group.nameEn) || entry.group.nameNl,
    what: describeAfwas(entry.quantity, entry.kinds, nl),
    note: entry.note,
    eventKey: eventDay ? ymdKey(eventDay) : null,
    eventLabel: eventDay ? shortLabel(eventDay) : null,
    dayKey: day ? ymdKey(day) : null,
    dayLabel: day ? `${shortLabel(day)}, ${hoursLabel(slot, hours)}` : null,
    hours,
    own,
    washed: entry.washedAt !== null,
    washedBy: entry.washedBy?.name ?? null,
    // Wie boekte, enkel voor wie er iets mee kan: de eigen groep, Theokot en Logistiek.
    createdBy: manage || own ? (entry.createdBy?.name ?? null) : null,
    canToggle: manage || own,
    canCancel: manage || (own && entry.washedAt === null && !started),
    // Een namiddag kiezen of verzetten: zolang niets afgevinkt is, en voor de
    // groep zelf tot het begin van haar namiddag.
    canPick: entry.washedAt === null && (manage || (own && !started)),
    weekAfterKey: eventDay ? ymdKey(weekAfterEvent(eventDay)) : null,
    past: started,
    closed: day !== null && !started && theokotDayState(day, sessions) === "closed",
    offWeek: !inWeekAfterEvent(eventDay, day),
  };
}
