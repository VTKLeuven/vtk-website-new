/**
 * Wat de beheerschermen van de grocomeet en het bureau nodig hebben: de
 * momenten van een semester met hun bestellingen, en de geldoverzichten.
 * Server-only; de schermen zelf zijn client components.
 */

import "server-only";

import { prisma } from "@vtk/db";
import type { MeetingKind, TheokotOrderStatus } from "@prisma/client";
import { pick, type Locale } from "@vtk/i18n";

import type { MeetingAdminView } from "@/components/meetings/MeetingAdminCard";
import type { PlannedDay } from "@/components/meetings/MeetingPlanner";
import { brusselsTimeOnDay, brusselsYMD, ymdKey } from "./brussels";
import {
  hasMeetingOrder,
  isBigBureau,
  meetingCloseAt,
  reservationTotalCents,
  type Semester,
} from "./meetings";
import { siteUrl } from "./seo";

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

/**
 * De Theokot-bestellingen die in de doos van een GM meegaan en dus bij de
 * grocomeet afgerekend worden: nog open, of daar afgegeven. Een no-show komt
 * hier niet voor, want de verwerking zet zo'n bestelling op opgehaald.
 */
const GROCOMEET_ORDER_STATUSES: TheokotOrderStatus[] = ["RESERVED", "PICKED_UP"];

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

  const [meetings, plan] = await Promise.all([
    prisma.meeting.findMany({
      where: { kind, year: workingYear, semester },
      orderBy: { startsAt: "asc" },
      include: {
        options: { orderBy: { order: "asc" } },
        reservations: {
          orderBy: { createdAt: "asc" },
          include: { user: { select: { name: true } } },
        },
        theokotOrders: {
          where: { status: { in: GROCOMEET_ORDER_STATUSES } },
          orderBy: { user: { name: "asc" } },
          include: {
            user: { select: { name: true } },
            lines: {
              include: { sessionItem: { select: { nameNl: true, nameEn: true, order: true } } },
            },
          },
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
  const meetingDays = meetings.map((meeting) => brusselsTimeOnDay(meeting.startsAt, "00:00"));
  const sessions =
    meetingDays.length > 0
      ? await prisma.theokotSession.findMany({
          where: { date: { in: meetingDays } },
          select: { date: true, isOpen: true, orderCloseAt: true },
        })
      : [];
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
  const now = new Date();

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
      totalCents: reservationTotalCents(reservation),
      paid: reservation.paidAt !== null,
      invalid: reservation.status === "INVALIDATED",
      external: reservation.status === "ACTIVE" && reservation.external,
      // Wie komt zonder broodje en zonder drankje staat even goed ingeschreven.
      hasOrder: hasMeetingOrder({
        itemName: reservation.itemNameNl,
        drinkName: reservation.drinkName,
      }),
    }));

    const theokotOrders = meeting.theokotOrders.map((order) => ({
      id: order.id,
      name: order.user.name,
      items: [...order.lines]
        .sort((a, b) => a.sessionItem.order - b.sessionItem.order)
        .map(
          (line) =>
            `${line.quantity}× ${pick(line.sessionItem.nameNl, line.sessionItem.nameEn, locale) ?? line.sessionItem.nameNl}`,
        )
        .join(", "),
      totalCents: order.totalCents,
      paid: order.grocomeetPaidAt !== null,
    }));
    const money = [...reservations, ...theokotOrders];

    // Wat Onderwijs zelf bij de externe zaak moet bestellen, per broodje.
    const externalItems = new Map<string, number>();
    let theokotCount = 0;
    for (const row of reservations) {
      if (!row.item || row.invalid) continue;
      if (row.external) externalItems.set(row.item, (externalItems.get(row.item) ?? 0) + 1);
      else theokotCount += 1;
    }

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
      bigBureau: isBigBureau(meeting),
      theokotLimit: meeting.theokotLimit,
      theokotCount,
      externalItems: [...externalItems.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      // Na de deadline werkt Theokot misschien al met de turflijst.
      deadlinePassed: now >= meetingCloseAt(meeting, session ?? null),
      options: meeting.options.map((option) => ({
        id: option.id,
        nameNl: option.nameNl,
        nameEn: option.nameEn ?? "",
        priceEuro: (option.priceCents / 100).toFixed(2),
      })),
      shareUrl: meeting.kind === "BUREAU" ? `${base}/bureau/${meeting.slug}` : null,
      sessionState: session ? (session.isOpen ? "OPEN" : "CLOSED") : "NONE",
      reservations,
      theokotOrders,
      orderCount: reservations.filter((row) => row.hasOrder).length,
      totalCents: money.reduce((total, row) => total + row.totalCents, 0),
      openCents: money.filter((row) => !row.paid).reduce((total, row) => total + row.totalCents, 0),
      showPaid: kind === "GROCOMEET",
    };
  });

  return {
    meetings: views,
    planned: meetings.map((meeting) => ({
      day: ymdKey(brusselsYMD(meeting.startsAt)),
      reservations: meeting.reservations.length,
      time: hhmm(meeting.startsAt),
      location: meeting.location ?? "",
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
 * gemaakte bestellingen tellen niet mee: daar staat geen broodje tegenover. Wie
 * enkel ingeschreven is zonder iets te bestellen evenmin: die is niets
 * verschuldigd en hoort niet in een schuldenlijst met nul erachter.
 */
export async function loadGrocomeetDebts(workingYear: number): Promise<DebtRow[]> {
  const [reservations, theokotOrders] = await Promise.all([
    prisma.meetingReservation.findMany({
      where: { status: "ACTIVE", meeting: { kind: "GROCOMEET", year: workingYear } },
      include: { user: { select: { id: true, name: true } } },
    }),
    // Wat grocos zelf bij Theokot bestelden en in de doos van de GM meeging: dat
    // betalen ze hier, niet aan de balie.
    prisma.theokotOrder.findMany({
      where: {
        status: { in: GROCOMEET_ORDER_STATUSES },
        grocomeet: { kind: "GROCOMEET", year: workingYear },
      },
      include: { user: { select: { id: true, name: true } } },
    }),
  ]);

  const byUser = new Map<string, DebtRow>();
  const add = (user: { id: string; name: string }, total: number, paid: boolean) => {
    const row = byUser.get(user.id) ?? {
      userId: user.id,
      name: user.name,
      orders: 0,
      totalCents: 0,
      paidCents: 0,
      openCents: 0,
    };
    row.orders += 1;
    row.totalCents += total;
    if (paid) row.paidCents += total;
    else row.openCents += total;
    byUser.set(user.id, row);
  };

  for (const reservation of reservations) {
    if (!hasMeetingOrder({ itemName: reservation.itemNameNl, drinkName: reservation.drinkName })) {
      continue;
    }
    add(
      reservation.user,
      reservation.itemPriceCents + reservation.drinkPriceCents,
      reservation.paidAt !== null,
    );
  }
  for (const order of theokotOrders) {
    add(order.user, order.totalCents, order.grocomeetPaidAt !== null);
  }

  return [...byUser.values()].sort((a, b) => b.openCents - a.openCents || a.name.localeCompare(b.name));
}

export type BureauTotals = {
  perMeeting: Array<{
    id: string;
    dateLabel: string;
    /** Iedereen die zich inschreef, met of zonder bestelling. */
    attendees: number;
    /** Enkel wie een broodje of een drankje bestelde; dat is wat geld kost. */
    orders: number;
    /** Big bureau: broodjes die extern besteld worden en niet in het bedrag zitten. */
    external: number;
    totalCents: number;
  }>;
  yearCents: number;
  allTimeCents: number;
};

/**
 * Wie er komt en wat de bureaus kosten: per bureau, dit werkingsjaar en over
 * alle jaren heen. Aanwezigheid en bestellingen staan bewust naast elkaar; een
 * inschrijving zonder bestelling kost niets maar telt wel voor de zaal.
 */
export async function loadBureauTotals(
  workingYear: number,
  locale: Locale,
): Promise<BureauTotals> {
  const nl = locale === "nl";
  const [meetings, allTimeItems, allTimeDrinks] = await Promise.all([
    prisma.meeting.findMany({
      where: { kind: "BUREAU", year: workingYear },
      orderBy: { startsAt: "asc" },
      include: { reservations: { where: { status: "ACTIVE" } } },
    }),
    // Een extern besteld broodje komt niet op deze rekening (`reservationTotalCents`).
    prisma.meetingReservation.aggregate({
      where: { status: "ACTIVE", external: false, meeting: { kind: "BUREAU" } },
      _sum: { itemPriceCents: true },
    }),
    prisma.meetingReservation.aggregate({
      where: { status: "ACTIVE", meeting: { kind: "BUREAU" } },
      _sum: { drinkPriceCents: true },
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
    attendees: meeting.reservations.length,
    orders: meeting.reservations.filter((reservation) =>
      hasMeetingOrder({ itemName: reservation.itemNameNl, drinkName: reservation.drinkName }),
    ).length,
    external: meeting.reservations.filter((reservation) => reservation.external).length,
    totalCents: meeting.reservations.reduce(
      (total, reservation) => total + reservationTotalCents(reservation),
      0,
    ),
  }));

  return {
    perMeeting,
    yearCents: perMeeting.reduce((total, row) => total + row.totalCents, 0),
    allTimeCents: (allTimeItems._sum.itemPriceCents ?? 0) + (allTimeDrinks._sum.drinkPriceCents ?? 0),
  };
}
