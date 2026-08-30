import { needsStudyConfirmation } from "@vtk/auth";
import { prisma } from "@vtk/db";
import { pick } from "@vtk/i18n";

import { getCurrentAnnouncement, announcementFits } from "@/lib/announcements";
import { viewerAudienceFilter } from "@/lib/calendar/audience";
import { publicInterestCounts } from "@/lib/calendar/interest";
import { corsPreflight } from "@/lib/cors";
import { getCursusdienstHours } from "@/lib/cursusdienstHours";
import { BUILTIN_DEFAULT_EVENT_IMAGE, DEFAULT_EVENT_IMAGE_SETTING } from "@/lib/defaultEventImage";
import { readBarStatus } from "@/lib/elixir/status";
import { getCurrentSession } from "@/lib/session";
import { publicUrl } from "@/lib/storage";
import { appAbilities } from "@/lib/app-api/abilities";
import {
  appLocaleFrom,
  type AppCalendarEvent,
  type AppToday,
  type AppTodayTask,
} from "@/lib/app-api/contract";
import { interestedEventIds } from "@/lib/app-api/interest";
import { absoluteMediaUrl, absoluteUrl } from "@/lib/app-api/media";
import { appErrorResponse, appJson } from "@/lib/app-api/respond";
import { serviceStatus } from "@/lib/app-api/serviceStatus";
import { voucherBalance } from "@/lib/app-api/vouchers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Het beginscherm van de app: **vandaag**.
 *
 * Bewust niet hetzelfde als `/home`. Die route is de voorpagina van de site in
 * gegevensvorm (fotohero, aftermovies, career, partners) en blijft staan zolang
 * er toestellen op de vorige versie van de app zitten. Deze route beantwoordt de
 * twee vragen waarmee iemand zijn telefoon bovenhaalt: **wat is er open** en
 * **wat wacht er op mij**.
 *
 * Werkt zonder login; dan blijven de taken en de bonnetjes leeg en houd je de
 * openingsuren en de kalender over. Dat is precies wat een niet-lid eraan heeft.
 */

/** Hoe ver vooruit iets nog "vandaag" is voor de takenlijst. */
const TASK_HORIZON_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const locale = appLocaleFrom(url.searchParams.get("locale"));
    const now = new Date();
    const horizon = new Date(now.getTime() + TASK_HORIZON_MS);

    const [settings, session, cursusEntries, barStatus, announcement, abilities] =
      await Promise.all([
        prisma.setting.findMany({
          where: {
            key: {
              in: [
                "home.openingHours.theokot",
                "home.openingHours.cursusdienst",
                "home.openingHours.elixir",
                DEFAULT_EVENT_IMAGE_SETTING,
              ],
            },
          },
        }),
        getCurrentSession(),
        getCursusdienstHours(locale === "en" ? "en" : "nl"),
        readBarStatus(now),
        getCurrentAnnouncement(),
        appAbilities(),
      ]);

    const map = new Map(settings.map((setting) => [setting.key, setting.value as unknown]));

    // Dezelfde doelgroepfilter als op de site en als /kalender: geen
    // eerstejaarsevent op het scherm van wie het daar niet zou zien.
    const audiences = await viewerAudienceFilter();
    const upcoming = await prisma.calendarEvent.findMany({
      where: {
        start: { gte: now },
        publishedAt: { not: null },
        ...audiences,
      },
      orderBy: { start: "asc" },
      take: 5,
      include: {
        group: { select: { slug: true, nameNl: true, nameEn: true } },
        ticketEvent: { select: { slug: true, status: true } },
        categories: {
          select: {
            category: {
              select: { slug: true, nameNl: true, nameEn: true, colour: true, audience: true },
            },
          },
          orderBy: { category: { order: "asc" } },
        },
      },
    });

    const defaultEventImage =
      publicUrl(
        (map.get(DEFAULT_EVENT_IMAGE_SETTING) as { imageKey?: string | null } | undefined)?.imageKey,
      ) ?? BUILTIN_DEFAULT_EVENT_IMAGE;

    const [interested, publicCounts] = await Promise.all([
      interestedEventIds(session?.user.id ?? null, upcoming.map((event) => event.id)),
      // Enkel de tellers die de drempel halen; zelfde regel als op de site.
      publicInterestCounts(upcoming.map((event) => event.id)),
    ]);

    const upcomingEvents: AppCalendarEvent[] = upcoming.map((event) => ({
      id: event.id,
      title: pick(event.titleNl, event.titleEn, locale) ?? event.titleNl,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      allDay: event.allDay,
      location: event.location,
      imageUrl:
        absoluteMediaUrl(request, event.imageKey) ?? absoluteUrl(request, defaultEventImage),
      groupName: pick(event.group.nameNl, event.group.nameEn, locale) ?? event.group.nameNl,
      groupSlug: event.group.slug,
      categories: event.categories.map(({ category }) => ({
        slug: category.slug,
        name: pick(category.nameNl, category.nameEn, locale) ?? category.nameNl,
        colour: category.colour,
        audience: category.audience,
      })),
      interested: interested.has(event.id),
      interestedCount: publicCounts.get(event.id) ?? null,
      ticketSlug: event.ticketEvent?.status === "PUBLISHED" ? event.ticketEvent.slug : null,
    }));

    const measured = barStatus && !barStatus.stale ? barStatus.isOpen : null;
    const services = [
      serviceStatus(
        { key: "theokot", service: "theokot", setting: map.get("home.openingHours.theokot") },
        locale,
        now,
      ),
      serviceStatus(
        {
          key: "cursusdienst",
          service: "cursusdienst",
          setting: map.get("home.openingHours.cursusdienst"),
          // `null` betekent hier "we hadden ze moeten hebben en kregen ze niet";
          // de app toont dan "niet beschikbaar" in plaats van een leeg rooster,
          // dat als "altijd gesloten" zou lezen.
          liveEntries: cursusEntries,
        },
        locale,
        now,
      ),
      serviceStatus(
        {
          key: "elixir",
          service: "elixir",
          setting: map.get("home.openingHours.elixir"),
          measuredOpen: measured,
        },
        locale,
        now,
      ),
    ];

    const payload: AppToday = {
      now: now.toISOString(),
      greetingName: session ? session.user.name.split(" ")[0] : null,
      services,
      barStatus: barStatus
        ? {
            isOpen: barStatus.isOpen,
            decibels: barStatus.currentDecibels,
            lastUpdated: new Date(barStatus.lastUpdated).toISOString(),
            stale: barStatus.stale,
          }
        : null,
      tasks: session ? await tasksFor(session.user.id, session.user, now, horizon) : [],
      vouchers: session ? await voucherBalance(session.user.id, now) : null,
      upcomingEvents,
      announcement:
        announcement && announcementFits(announcement.scope, "/")
          ? {
              id: announcement.id,
              title: pick(announcement.titleNl, announcement.titleEn, locale),
              body: pick(announcement.bodyNl, announcement.bodyEn, locale),
              ctaLabel: pick(announcement.ctaLabelNl, announcement.ctaLabelEn, locale) ?? null,
              ctaUrl: absoluteUrl(request, announcement.ctaUrl),
            }
          : null,
      canScanTickets: abilities?.scanTickets ?? false,
      canAcceptVouchers: abilities?.acceptVouchers ?? false,
    };

    return appJson(request, payload);
  } catch (error) {
    return appErrorResponse(request, error);
  }
}

/**
 * Wat er op deze gebruiker wacht, op volgorde van dringendheid.
 *
 * De sortering gebeurt hier en niet in de app: de server weet welke van deze
 * dingen een deadline heeft en welke kan wachten, en die volgorde op twee
 * plaatsen hebben is er één te veel.
 */
async function tasksFor(
  userId: string,
  user: { onboarded: boolean; isStudent: boolean; studyConfirmedYear: number | null },
  now: Date,
  horizon: Date,
): Promise<AppTodayTask[]> {
  const tasks: AppTodayTask[] = [];

  // De twee poorten uit `proxy.ts` staan bovenaan: zolang die openstaan, werkt de
  // helft van de app niet en zegt ze niet waarom.
  if (!user.onboarded) {
    tasks.push({
      kind: "gate",
      title: "Werk je profiel af",
      detail: "Zonder dat blijven bestellen en tickets gesloten.",
      path: "/poort?gate=onboarding",
      actionLabel: "Nu doen",
      highlight: true,
      at: null,
    });
  } else if (needsStudyConfirmation(user)) {
    tasks.push({
      kind: "gate",
      title: "Bevestig je studie",
      detail: "Elk academiejaar geef je opnieuw op wat je studeert.",
      path: "/poort?gate=studie-bevestigen",
      actionLabel: "Nu doen",
      highlight: true,
      at: null,
    });
  }

  const [theokotOrders, openSessions, tickets, shifts, piano] = await Promise.all([
    prisma.theokotOrder.findMany({
      where: {
        userId,
        status: "RESERVED",
        session: { pickupEnd: { gte: now }, pickupStart: { lte: horizon } },
      },
      select: {
        id: true,
        session: { select: { pickupStart: true, pickupEnd: true } },
        lines: {
          select: { quantity: true, sessionItem: { select: { nameNl: true } } },
          orderBy: { sessionItem: { order: "asc" } },
        },
      },
    }),
    // Een open bestelronde waarvoor je nog niets besteld hebt. Enkel wanneer de
    // deadline nog niet gepasseerd is; daarna is het geen taak meer maar een
    // gemiste kans, en daar hoort geen kaart bij.
    prisma.theokotSession.findMany({
      where: {
        isOpen: true,
        orderOpenAt: { lte: now },
        orderCloseAt: { gt: now },
        orders: { none: { userId, status: { in: ["RESERVED", "PICKED_UP"] } } },
      },
      orderBy: { date: "asc" },
      take: 1,
      select: { id: true, date: true, orderCloseAt: true },
    }),
    prisma.ticket.findMany({
      where: {
        status: "VALID",
        checkedInAt: null,
        orderItem: { order: { buyerUserId: userId } },
        event: { startsAt: { gte: new Date(now.getTime() - 6 * 60 * 60 * 1000), lte: horizon } },
      },
      select: {
        id: true,
        event: { select: { titleNl: true, startsAt: true, location: true } },
      },
    }),
    prisma.shiftParticipant.findMany({
      where: { userId, shift: { endTime: { gte: now }, startTime: { lte: horizon } } },
      select: {
        shift: { select: { id: true, name: true, location: true, startTime: true } },
      },
      orderBy: { shift: { startTime: "asc" } },
    }),
    prisma.pianoReservation.findMany({
      where: { userId, startsAt: { gte: now, lte: horizon } },
      orderBy: { startsAt: "asc" },
      take: 1,
      select: { startsAt: true },
    }),
  ]);

  const timeFormat = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  });
  const dayFormat = new Intl.DateTimeFormat("nl-BE", {
    timeZone: "Europe/Brussels",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  for (const order of theokotOrders) {
    const ready = order.session.pickupStart <= now;
    const what = order.lines
      .map((line) => (line.quantity > 1 ? `${line.quantity}x ${line.sessionItem.nameNl}` : line.sessionItem.nameNl))
      .join(", ");
    tasks.push({
      kind: "theokot-pickup",
      title: ready ? "Je broodje ligt klaar" : "Je broodje is besteld",
      detail: `${what}, af te halen tot ${timeFormat.format(order.session.pickupEnd)}`,
      path: "/broodjes",
      actionLabel: "Toon code",
      highlight: ready,
      at: order.session.pickupStart.toISOString(),
    });
  }

  for (const shift of shifts) {
    tasks.push({
      kind: "shift",
      title: shift.shift.name,
      detail: `${timeFormat.format(shift.shift.startTime)}, ${shift.shift.location}`,
      path: "/shiften",
      actionLabel: null,
      highlight: shift.shift.startTime <= new Date(now.getTime() + 2 * 60 * 60 * 1000),
      at: shift.shift.startTime.toISOString(),
    });
  }

  for (const ticket of tickets) {
    tasks.push({
      kind: "ticket",
      title: ticket.event.titleNl,
      detail: ticket.event.location
        ? `${timeFormat.format(ticket.event.startsAt)}, ${ticket.event.location}`
        : timeFormat.format(ticket.event.startsAt),
      path: "/tickets?tab=mijne",
      actionLabel: "Toon ticket",
      highlight: false,
      at: ticket.event.startsAt.toISOString(),
    });
  }

  for (const session of openSessions) {
    tasks.push({
      kind: "theokot-order",
      title: `Broodjes voor ${dayFormat.format(session.date)}`,
      detail: `Bestellen kan tot ${timeFormat.format(session.orderCloseAt)}`,
      path: "/broodjes",
      actionLabel: "Bestellen",
      highlight: false,
      at: session.orderCloseAt.toISOString(),
    });
  }

  for (const reservation of piano) {
    tasks.push({
      kind: "piano",
      title: "Piano gereserveerd",
      detail: timeFormat.format(reservation.startsAt),
      path: "/piano",
      actionLabel: null,
      highlight: false,
      at: reservation.startsAt.toISOString(),
    });
  }

  // Uitgelicht eerst, daarna op tijd. Een taak zonder tijd (een poort) hoort
  // bovenaan te blijven en niet achteraan te belanden.
  return tasks.sort((a, b) => {
    if (a.highlight !== b.highlight) return a.highlight ? -1 : 1;
    if (a.at === null) return -1;
    if (b.at === null) return 1;
    return a.at.localeCompare(b.at);
  });
}

export function OPTIONS(request: Request) {
  return corsPreflight(request, "GET, OPTIONS");
}
