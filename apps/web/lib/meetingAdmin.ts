/**
 * Wat de beheerschermen van de grocomeet en het bureau nodig hebben: de
 * momenten van een semester met hun bestellingen, en de geldoverzichten.
 * Server-only; de schermen zelf zijn client components.
 */

import "server-only";

import { prisma } from "@vtk/db";
import type { MeetingKind } from "@prisma/client";
import { pick, type Locale } from "@vtk/i18n";

import type { MeetingAdminView } from "@/components/meetings/MeetingAdminCard";
import type { PlannedDay } from "@/components/meetings/MeetingPlanner";
import { brusselsYMD, ymdKey } from "./brussels";
import { semesterMonths, type Semester } from "./meetings";
import { siteUrl } from "./seo";

/** Eerste en laatste dag van een semester, als instants. */
function semesterRange(workingYear: number, semester: Semester): { from: Date; to: Date } {
  const months = semesterMonths(workingYear, semester);
  const first = months[0];
  const last = months[months.length - 1];
  return {
    from: new Date(Date.UTC(first.year, first.month - 1, 1)),
    to: new Date(Date.UTC(last.year, last.month, 1)),
  };
}

function hhmm(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

/** "YYYY-MM-DDTHH:mm" in Brussel-tijd, voor een datetime-local input. */
function localValue(date: Date): string {
  return `${ymdKey(brusselsYMD(date))}T${hhmm(date)}`;
}

export type MeetingAdminData = {
  meetings: MeetingAdminView[];
  planned: PlannedDay[];
  hasPlan: boolean;
};

export async function loadMeetingAdmin(
  kind: MeetingKind,
  options: { locale: Locale; workingYear: number; semester: Semester },
): Promise<MeetingAdminData> {
  const { locale, workingYear, semester } = options;
  const nl = locale === "nl";
  const { from, to } = semesterRange(workingYear, semester);

  const [meetings, plan] = await Promise.all([
    prisma.meeting.findMany({
      where: { kind, startsAt: { gte: from, lt: to } },
      orderBy: { startsAt: "asc" },
      include: {
        options: { orderBy: { order: "asc" } },
        reservations: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { name: true } } },
        },
      },
    }),
    prisma.meetingPlan.findUnique({
      where: { kind_year_semester: { kind, year: workingYear, semester } },
      select: { id: true },
    }),
  ]);

  // De verkoopdagen van Theokot op die dagen, om te tonen of het aanbod van die
  // week al vastligt.
  const sessions = await prisma.theokotSession.findMany({
    where: { date: { gte: from, lt: to } },
    select: { date: true, isOpen: true },
  });
  const sessionByDay = new Map(sessions.map((session) => [ymdKey(brusselsYMD(session.date)), session]));

  const dateTime = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const base = siteUrl();

  const views: MeetingAdminView[] = meetings.map((meeting) => {
    const session = sessionByDay.get(ymdKey(brusselsYMD(meeting.startsAt)));
    const reservations = meeting.reservations.map((reservation) => ({
      id: reservation.id,
      name: reservation.user.name,
      item: reservation.itemNameNl
        ? pick(reservation.itemNameNl, reservation.itemNameEn, locale) ?? reservation.itemNameNl
        : null,
      drink: reservation.drinkName,
      comment: reservation.comment,
      totalCents: reservation.itemPriceCents + reservation.drinkPriceCents,
      paid: reservation.paidAt !== null,
      invalid: reservation.status === "INVALIDATED",
    }));

    return {
      id: meeting.id,
      kind: meeting.kind,
      dateLabel: dateTime.format(meeting.startsAt),
      startsAtValue: localValue(meeting.startsAt),
      opensAtValue: meeting.opensAt ? localValue(meeting.opensAt) : "",
      location: meeting.location ?? "",
      noteNl: meeting.noteNl ?? "",
      noteEn: meeting.noteEn ?? "",
      useTheokot: meeting.useTheokot,
      options: meeting.options.map((option) => ({
        id: option.id,
        nameNl: option.nameNl,
        nameEn: option.nameEn ?? "",
        priceEuro: (option.priceCents / 100).toFixed(2),
      })),
      shareUrl: meeting.kind === "BUREAU" ? `${base}/bureau/${meeting.slug}` : null,
      sessionState: session ? (session.isOpen ? "OPEN" : "CLOSED") : "NONE",
      reservations,
      totalCents: reservations.reduce((total, row) => total + row.totalCents, 0),
      openCents: reservations
        .filter((row) => !row.paid)
        .reduce((total, row) => total + row.totalCents, 0),
      showPaid: kind === "GROCOMEET",
    };
  });

  return {
    meetings: views,
    planned: meetings.map((meeting) => ({
      day: ymdKey(brusselsYMD(meeting.startsAt)),
      reservations: meeting.reservations.length,
    })),
    hasPlan: plan !== null,
  };
}

export type DebtRow = {
  userId: string;
  name: string;
  orders: number;
  totalCents: number;
  paidCents: number;
  openCents: number;
};

/**
 * Wie hoeveel verschuldigd is voor de grocomeets van een werkingsjaar. Ongeldig
 * gemaakte bestellingen tellen niet mee: daar staat geen broodje tegenover.
 */
export async function loadGrocomeetDebts(workingYear: number): Promise<DebtRow[]> {
  const reservations = await prisma.meetingReservation.findMany({
    where: { status: "ACTIVE", meeting: { kind: "GROCOMEET", year: workingYear } },
    include: { user: { select: { id: true, name: true } } },
  });

  const byUser = new Map<string, DebtRow>();
  for (const reservation of reservations) {
    const total = reservation.itemPriceCents + reservation.drinkPriceCents;
    const row = byUser.get(reservation.userId) ?? {
      userId: reservation.userId,
      name: reservation.user.name,
      orders: 0,
      totalCents: 0,
      paidCents: 0,
      openCents: 0,
    };
    row.orders += 1;
    row.totalCents += total;
    if (reservation.paidAt) row.paidCents += total;
    else row.openCents += total;
    byUser.set(reservation.userId, row);
  }

  return [...byUser.values()].sort((a, b) => b.openCents - a.openCents || a.name.localeCompare(b.name));
}

export type BureauTotals = {
  perMeeting: Array<{ id: string; dateLabel: string; orders: number; totalCents: number }>;
  yearCents: number;
  allTimeCents: number;
};

/** Wat de bureaus kosten: per bureau, dit werkingsjaar en over alle jaren heen. */
export async function loadBureauTotals(
  workingYear: number,
  locale: Locale,
): Promise<BureauTotals> {
  const nl = locale === "nl";
  const [meetings, allTime] = await Promise.all([
    prisma.meeting.findMany({
      where: { kind: "BUREAU", year: workingYear },
      orderBy: { startsAt: "asc" },
      include: { reservations: { where: { status: "ACTIVE" } } },
    }),
    prisma.meetingReservation.aggregate({
      where: { status: "ACTIVE", meeting: { kind: "BUREAU" } },
      _sum: { itemPriceCents: true, drinkPriceCents: true },
    }),
  ]);

  const dateOnly = new Intl.DateTimeFormat(nl ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const perMeeting = meetings.map((meeting) => ({
    id: meeting.id,
    dateLabel: dateOnly.format(meeting.startsAt),
    orders: meeting.reservations.length,
    totalCents: meeting.reservations.reduce(
      (total, reservation) => total + reservation.itemPriceCents + reservation.drinkPriceCents,
      0,
    ),
  }));

  return {
    perMeeting,
    yearCents: perMeeting.reduce((total, row) => total + row.totalCents, 0),
    allTimeCents: (allTime._sum.itemPriceCents ?? 0) + (allTime._sum.drinkPriceCents ?? 0),
  };
}
