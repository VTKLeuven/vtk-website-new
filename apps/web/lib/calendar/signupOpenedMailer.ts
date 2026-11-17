import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { nameParts } from "@vtk/auth";
import { pick } from "@vtk/i18n";
import { preferredEmail } from "@/lib/brevo/contacts";
import { eventLinkLabel } from "@/lib/calendar/eventLink";
import { organiserName } from "@/lib/calendar/organiser";
import { absoluteHref } from "@/lib/calendar/signupLink";
import { defaultEventImageFor, eventCategorySlugs, getDefaultEventImages } from "@/lib/defaultEventImage";
import { sendMail } from "@/lib/email";
import { oneClickUnsubscribeUrl, unsubscribeUrl } from "@/lib/mailUnsubscribe";
import { siteUrl } from "@/lib/seo";
import { deductedShifts, netShiftCount, shiftDeductions } from "@/lib/shift/deductions";
import { publicUrl } from "@/lib/storage";
import { hasPresale, presaleStart, type PresaleViewer } from "@/lib/ticketing/presale";
import { currentWorkingYear, workingYearStart } from "@/lib/workingYear";
import {
  formOpening,
  linkOpening,
  SIGNUP_OPENED_WINDOW_MS,
  signupOpenedDue,
  ticketSaleOpening,
  type SignupOpening,
} from "./signupOpened";
import { signupOpenedMail, type SignupOpenedMailEvent } from "./signupOpenedMail";

/**
 * Verstuurt de mail "de ticketverkoop of de inschrijvingen zijn open" aan wie
 * interesse aanduidde in een evenement, aan wie de mailinglijst Evenementen aan
 * heeft.
 *
 * Draait mee met de `background-worker` (elke vijf minuten, zie
 * /api/background/maintenance), net als de herinnering van de dag ervoor. De
 * regels staan in `signupOpened.ts`, het bericht in `signupOpenedMail.ts`.
 *
 * Eén mail per lid per ronde, met alles wat voor hem openging erin. Eerst
 * claimen (een rij in `CalendarEventSignupMail`, uniek per lid, evenement en
 * verkoop), dan versturen; mislukt het versturen, dan gaat de claim weer weg en
 * probeert de volgende ronde opnieuw.
 *
 * De voorverkoop wordt per lid nagekeken met dezelfde regel als de shop
 * (`inPresaleAudience`): zijn posten van dit werkingsjaar, of hij erelid is, en
 * zijn shiften. De private voorverkooplink telt hier niet mee: die hangt aan een
 * cookie in een browser, niet aan een account.
 */

const TICKET_SELECT = {
  id: true,
  slug: true,
  status: true,
  isPrivate: true,
  publishedAt: true,
  salesStartAt: true,
  salesEndAt: true,
  presaleLeadMinutes: true,
  presalePraesidium: true,
  presaleHelpers: true,
  presaleHonorary: true,
  presaleGroups: { select: { groupId: true } },
} satisfies Prisma.TicketEventSelect;

type TicketRow = Prisma.TicketEventGetPayload<{ select: typeof TICKET_SELECT }>;

/** Hoeveel evenementen één ronde hoogstens bekijkt; de rest volgt over vijf minuten. */
const EVENT_BATCH = 200;

type Due = {
  userId: string;
  eventId: string;
  opening: SignupOpening;
  /** Het pad of de URL van de knop. */
  href: string;
  label: { nl: string; en: string };
  /** Bij een voorverkoop: de publieke start. */
  presalePublicStart: Date | null;
};

export async function processDueSignupOpenedMails(
  now: Date = new Date(),
): Promise<{ sent: number; failed: number }> {
  try {
    const since = new Date(now.getTime() - SIGNUP_OPENED_WINDOW_MS);
    const mailable = { active: true, mailUnsubscribedAt: null, mailCategories: { has: "EVENEMENTEN" as const } };

    // Enkel evenementen waar de laatste 24 uur iets openging, of nog kan opengaan
    // (een verkoop met een start in de toekomst: de voorverkoop kan al lopen).
    // De precieze regel per lid staat in `signupOpened.ts`; dit is de ruwe zeef.
    const events = await prisma.calendarEvent.findMany({
      where: {
        publishedAt: { not: null },
        start: { gt: now },
        interests: { some: { user: mailable } },
        OR: [
          {
            ticketEvents: {
              some: {
                status: "PUBLISHED",
                isPrivate: false,
                publishedAt: { not: null },
                OR: [{ publishedAt: { gte: since } }, { salesStartAt: { gte: since } }],
              },
            },
          },
          {
            form: {
              status: "PUBLISHED",
              publishedAt: { not: null },
              OR: [{ publishedAt: { gte: since } }, { opensAt: { gte: since } }],
            },
          },
          {
            url: { not: null },
            OR: [{ registrationNewsAt: { gte: since } }, { registrationNewsAt: { not: null }, publishedAt: { gte: since } }],
          },
        ],
      },
      select: {
        id: true,
        slug: true,
        titleNl: true,
        titleEn: true,
        start: true,
        end: true,
        allDay: true,
        location: true,
        organiserName: true,
        imageKey: true,
        url: true,
        urlLabelNl: true,
        urlLabelEn: true,
        registrationNewsAt: true,
        publishedAt: true,
        group: { select: { nameNl: true, nameEn: true } },
        categories: { select: { category: { select: { slug: true } } } },
        ticketEvents: { where: { status: "PUBLISHED", isPrivate: false }, select: TICKET_SELECT },
        form: { select: { slug: true, status: true, publishedAt: true, opensAt: true, closesAt: true } },
        interests: {
          where: { user: mailable },
          select: { userId: true, createdAt: true },
        },
        signupMails: { select: { userId: true, source: true } },
      },
      orderBy: { start: "asc" },
      take: EVENT_BATCH,
    });
    if (events.length === 0) return { sent: 0, failed: 0 };

    // De vroegste interesse per lid per evenement: bij een reeks momenten heeft
    // een lid er meer dan één.
    const interestOf = new Map<string, Map<string, Date>>();
    for (const event of events) {
      const perUser = new Map<string, Date>();
      for (const interest of event.interests) {
        const known = perUser.get(interest.userId);
        if (!known || interest.createdAt < known) perUser.set(interest.userId, interest.createdAt);
      }
      interestOf.set(event.id, perUser);
    }

    // Wie we op de voorverkoop moeten nakijken: enkel bij een verkoop waarvan
    // de voorverkoop al loopt en die nog niet voor iedereen open is.
    const presaleSales = events.flatMap((event) =>
      event.ticketEvents
        .filter((sale) => {
          const start = presaleStart(sale);
          return start && start <= now && sale.salesStartAt && now < sale.salesStartAt;
        })
        .map((sale) => ({ event, sale })),
    );
    const viewerIds = new Set<string>();
    for (const { event } of presaleSales) {
      for (const userId of interestOf.get(event.id)!.keys()) viewerIds.add(userId);
    }
    const viewers = await presaleViewers([...viewerIds], presaleSales.map(({ sale }) => sale), now);

    const due: Due[] = [];
    for (const event of events) {
      const sent = new Set(event.signupMails.map((mail) => `${mail.userId}:${mail.source}`));
      for (const [userId, interestCreatedAt] of interestOf.get(event.id)!) {
        const check = (opening: SignupOpening | null) =>
          opening &&
          !sent.has(`${userId}:${opening.source}`) &&
          signupOpenedDue({ opening, interestCreatedAt, eventStart: event.start }, now);

        for (const sale of event.ticketEvents) {
          const opening = ticketSaleOpening(sale, hasPresale(sale) ? (viewers.get(userId) ?? null) : null);
          if (!check(opening)) continue;
          due.push({
            userId,
            eventId: event.id,
            opening: opening!,
            href: `/tickets/${sale.slug}`,
            label: { nl: "Tickets kopen", en: "Buy tickets" },
            presalePublicStart: opening!.presale ? sale.salesStartAt : null,
          });
        }
        if (event.form) {
          const opening = formOpening(event.form);
          if (check(opening)) {
            due.push({
              userId,
              eventId: event.id,
              opening: opening!,
              href: `/formulieren/${event.form.slug}`,
              label: { nl: "Inschrijven", en: "Sign up" },
              presalePublicStart: null,
            });
          }
        }
        const link = linkOpening(event);
        const url = event.url?.trim() ?? "";
        if (check(link) && (/^https?:\/\//i.test(url) || (url.startsWith("/") && !url.startsWith("//")))) {
          due.push({
            userId,
            eventId: event.id,
            opening: link!,
            href: url,
            label: { nl: eventLinkLabel(event, "nl"), en: eventLinkLabel(event, "en") },
            presalePublicStart: null,
          });
        }
      }
    }
    if (due.length === 0) return { sent: 0, failed: 0 };

    const byUser = new Map<string, Due[]>();
    for (const item of due) byUser.set(item.userId, [...(byUser.get(item.userId) ?? []), item]);
    const users = new Map(
      (
        await prisma.user.findMany({
          where: { id: { in: [...byUser.keys()] } },
          select: {
            id: true,
            name: true,
            firstName: true,
            lastName: true,
            email: true,
            personalEmail: true,
            emailPreference: true,
            locale: true,
          },
        })
      ).map((user) => [user.id, user]),
    );
    const eventById = new Map(events.map((event) => [event.id, event]));

    const origin = siteUrl();
    const defaults = await getDefaultEventImages();
    let sentCount = 0;
    let failed = 0;

    for (const [userId, items] of byUser) {
      const user = users.get(userId);
      if (!user) continue;

      // Per verkoop claimen: wat een tweede container al nam, laten we hem.
      const claimed: Due[] = [];
      for (const item of items) {
        const { count } = await prisma.calendarEventSignupMail.createMany({
          data: [{ userId, eventId: item.eventId, source: item.opening.source, presale: item.opening.presale }],
          skipDuplicates: true,
        });
        if (count === 1) claimed.push(item);
      }
      if (claimed.length === 0) continue;

      const locale = user.locale === "EN" ? "en" : "nl";
      const base = locale === "en" ? "/en" : "";
      const mailEvents: SignupOpenedMailEvent[] = claimed
        .sort((a, b) => eventById.get(a.eventId)!.start.getTime() - eventById.get(b.eventId)!.start.getTime())
        .map((item) => {
          const event = eventById.get(item.eventId)!;
          const image =
            publicUrl(event.imageKey) ?? defaultEventImageFor(defaults, eventCategorySlugs(event.categories));
          // Een pad op de site krijgt de taal van het lid; een externe link
          // blijft wat hij is.
          const href = item.href.startsWith("/") && item.opening.kind !== "link" ? `${base}${item.href}` : item.href;
          return {
            kind: item.opening.kind,
            presalePublicStart: item.presalePublicStart,
            title: pick(event.titleNl, event.titleEn, locale),
            start: event.start,
            end: event.end,
            allDay: event.allDay,
            momentLabel: null,
            location: event.location,
            organiser: organiserName(event.organiserName, event.group, locale),
            imageUrl: absoluteHref(image, origin),
            eventUrl: `${origin}${base}/kalender/${event.slug}`,
            link: { label: item.label[locale], url: absoluteHref(href, origin) },
          };
        });

      const mail = signupOpenedMail({
        locale,
        firstName: nameParts(user).firstName || null,
        events: mailEvents,
        unsubscribeUrl: unsubscribeUrl(userId, "EVENEMENTEN", locale),
        accountUrl: `${origin}${base}/account`,
        logoUrl: `${origin}/vtk-logo.png`,
      });
      const delivered = await sendMail(
        {
          to: preferredEmail(user),
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          listUnsubscribe: oneClickUnsubscribeUrl(userId, "EVENEMENTEN"),
        },
        { source: "calendar" },
      );

      if (delivered) {
        sentCount += 1;
      } else {
        await prisma.calendarEventSignupMail.deleteMany({
          where: {
            userId,
            OR: claimed.map((item) => ({ eventId: item.eventId, source: item.opening.source })),
          },
        });
        failed += 1;
      }
    }

    return { sent: sentCount, failed };
  } catch (error) {
    console.error("[kalender] fout bij het versturen van de mails over geopende verkopen:", error);
    Sentry.captureException(error);
    return { sent: 0, failed: 0 };
  }
}

/**
 * De voorverkoopviewer per lid, in een paar queries voor de hele ronde: zijn
 * posten van dit werkingsjaar, of hij erelid is, en (enkel wanneer een van de
 * verkopen de vaste medewerkers erin laat) zijn shiften. Dezelfde telling als
 * `completedShiftsThisWorkingYear` in de shop.
 */
async function presaleViewers(
  userIds: string[],
  sales: TicketRow[],
  now: Date,
): Promise<Map<string, NonNullable<PresaleViewer>>> {
  const viewers = new Map<string, NonNullable<PresaleViewer>>();
  if (userIds.length === 0 || sales.length === 0) return viewers;

  const year = currentWorkingYear();
  const countShifts = sales.some((sale) => sale.presaleHelpers !== false);
  const [memberships, users, shifts, deductions] = await Promise.all([
    prisma.groupMembership.findMany({
      where: { userId: { in: userIds }, year },
      select: { userId: true, group: { select: { id: true, type: true } } },
    }),
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, honoraryMember: true } }),
    countShifts
      ? prisma.shiftParticipant.groupBy({
          by: ["userId"],
          where: { userId: { in: userIds }, shift: { endTime: { gte: workingYearStart(year), lt: now } } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    countShifts ? shiftDeductions({ userIds, academicYear: year }) : Promise.resolve([]),
  ]);

  const groups = new Map<string, { id: string; type: string }[]>();
  for (const membership of memberships) {
    groups.set(membership.userId, [...(groups.get(membership.userId) ?? []), membership.group]);
  }
  const done = new Map(shifts.map((row) => [row.userId, row._count._all]));
  for (const user of users) {
    viewers.set(user.id, {
      groups: groups.get(user.id) ?? [],
      honorary: user.honoraryMember,
      completedShifts: countShifts
        ? netShiftCount(
            done.get(user.id) ?? 0,
            deductedShifts(deductions.filter((deduction) => deduction.userId === user.id)),
          )
        : 0,
    });
  }
  return viewers;
}
