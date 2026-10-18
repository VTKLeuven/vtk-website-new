import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { nameParts } from "@vtk/auth";
import { pick } from "@vtk/i18n";
import { preferredEmail } from "@/lib/brevo/contacts";
import { organiserName } from "@/lib/calendar/organiser";
import { absoluteHref, eventSignupLink, SIGNUP_LINK_SELECT } from "@/lib/calendar/signupLink";
import { defaultEventImageFor, eventCategorySlugs, getDefaultEventImages } from "@/lib/defaultEventImage";
import { sendMail } from "@/lib/email";
import { oneClickUnsubscribeUrl, unsubscribeUrl } from "@/lib/mailUnsubscribe";
import { siteUrl } from "@/lib/seo";
import { publicUrl } from "@/lib/storage";
import { INTEREST_REMINDER_HORIZON_MS, interestReminderDue } from "./interestReminder";
import { interestReminderMail, type InterestReminderMailEvent } from "./interestReminderMail";

/**
 * Verstuurt de herinneringsmail de dag voor een evenement waarin een lid
 * interesse aanduidde, om 12u, aan wie de mailinglijst Evenementen aan heeft.
 *
 * Draait mee met de `background-worker` (elke vijf minuten, zie
 * /api/background/maintenance). De regels staan in `interestReminder.ts`, het
 * bericht in `interestReminderMail.ts`.
 *
 * Eén mail per lid per ronde, met al zijn evenementen van morgen erin: wie drie
 * dingen aanduidde, krijgt één mail en niet drie. Eerst claimen, dan versturen,
 * net als de push (`remindedAt`); mislukt het versturen, dan gaat de claim terug
 * open en probeert de volgende ronde opnieuw.
 *
 * **Enkel met de lijst Evenementen aan.** Dat is de keuze die het lid op
 * /account maakt; een uitschrijving via een mail (`mailUnsubscribedAt`) geldt
 * ook hier, net als voor elke lijstmail.
 */

const EVENT_SELECT = {
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
  group: { select: { nameNl: true, nameEn: true } },
  moments: { select: { start: true, end: true, label: true } },
  categories: { select: { category: { select: { slug: true } } } },
  ...SIGNUP_LINK_SELECT,
} satisfies Prisma.CalendarEventSelect;

/** Hoeveel interesses één ronde hoogstens bekijkt; de rest volgt over vijf minuten. */
const BATCH = 2000;

export async function processDueInterestReminderMails(
  now: Date = new Date(),
): Promise<{ sent: number; failed: number }> {
  try {
    const horizon = new Date(now.getTime() + INTEREST_REMINDER_HORIZON_MS);
    const candidates = await prisma.calendarEventInterest.findMany({
      where: {
        mailRemindedAt: null,
        user: { active: true, mailUnsubscribedAt: null, mailCategories: { has: "EVENEMENTEN" } },
        event: { publishedAt: { not: null } },
        // Een interesse voor één dag van een reeks telt af naar die dag; een
        // interesse voor het evenement zelf naar de start ervan. Zelfde regel
        // als de push.
        OR: [
          { momentStart: { gt: now, lte: horizon } },
          { momentStart: null, event: { start: { gt: now, lte: horizon } } },
        ],
      },
      select: {
        id: true,
        userId: true,
        momentStart: true,
        createdAt: true,
        event: { select: EVENT_SELECT },
        user: {
          select: {
            name: true,
            firstName: true,
            lastName: true,
            email: true,
            personalEmail: true,
            emailPreference: true,
            locale: true,
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: BATCH,
    });

    const due = candidates.filter((interest) =>
      interestReminderDue({ start: interest.momentStart ?? interest.event.start, createdAt: interest.createdAt }, now),
    );
    if (due.length === 0) return { sent: 0, failed: 0 };

    const byUser = new Map<string, typeof due>();
    for (const interest of due) {
      byUser.set(interest.userId, [...(byUser.get(interest.userId) ?? []), interest]);
    }

    const origin = siteUrl();
    const defaults = await getDefaultEventImages();
    let sent = 0;
    let failed = 0;

    for (const [userId, interests] of byUser) {
      // Per rij claimen: wat een tweede container al nam, laten we hem.
      const claimed: typeof interests = [];
      for (const interest of interests) {
        const { count } = await prisma.calendarEventInterest.updateMany({
          where: { id: interest.id, mailRemindedAt: null },
          data: { mailRemindedAt: now },
        });
        if (count === 1) claimed.push(interest);
      }
      if (claimed.length === 0) continue;

      const user = claimed[0]!.user;
      const locale = user.locale === "EN" ? "en" : "nl";
      const base = locale === "en" ? "/en" : "";
      const seen = new Set<string>();
      const events: (InterestReminderMailEvent & { sort: number })[] = [];
      for (const { event, momentStart } of claimed) {
        const key = `${event.id}:${momentStart?.toISOString() ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        // Een moment dat intussen verzet is, bestaat niet meer: de interesse
        // liet los (zie `CalendarEventInterest.momentStart`), dus geen mail.
        const moment = momentStart
          ? event.moments.find((candidate) => candidate.start.getTime() === momentStart.getTime())
          : null;
        if (momentStart && !moment) continue;
        const link = eventSignupLink(event, now, locale);
        const image =
          publicUrl(event.imageKey) ?? defaultEventImageFor(defaults, eventCategorySlugs(event.categories));
        events.push({
          sort: (moment?.start ?? event.start).getTime(),
          title: pick(event.titleNl, event.titleEn, locale),
          start: moment?.start ?? event.start,
          end: moment?.end ?? event.end,
          allDay: moment ? false : event.allDay,
          momentLabel: moment?.label ?? null,
          location: event.location,
          organiser: organiserName(event.organiserName, event.group, locale),
          imageUrl: absoluteHref(image, origin),
          eventUrl: `${origin}${base}/kalender/${event.slug}`,
          link: link ? { label: link.label, url: absoluteHref(link.href, origin) } : null,
        });
      }
      if (events.length === 0) continue;
      events.sort((a, b) => a.sort - b.sort);

      const mail = interestReminderMail({
        locale,
        firstName: nameParts(user).firstName || null,
        events,
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
        sent += 1;
      } else {
        await prisma.calendarEventInterest.updateMany({
          where: { id: { in: claimed.map((interest) => interest.id) }, mailRemindedAt: now },
          data: { mailRemindedAt: null },
        });
        failed += 1;
      }
    }

    return { sent, failed };
  } catch (error) {
    console.error("[kalender] fout bij het versturen van de interesseherinneringen:", error);
    Sentry.captureException(error);
    return { sent: 0, failed: 0 };
  }
}
