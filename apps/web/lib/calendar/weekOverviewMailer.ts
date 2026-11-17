import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { CalendarAudience, Prisma } from "@prisma/client";
import { prisma } from "@vtk/db";
import { pick } from "@vtk/i18n";
import { preferredEmail } from "@/lib/brevo/contacts";
import { audiencesForStudyProfile, STUDY_PROFILE_SELECT } from "@/lib/calendar/audienceProfile";
import { eventForMoment, MOMENT_SELECT } from "@/lib/calendar/moments";
import { organiserName } from "@/lib/calendar/organiser";
import { absoluteHref, eventSignupLink, SIGNUP_LINK_SELECT } from "@/lib/calendar/signupLink";
import {
  defaultEventImageFor,
  eventCategorySlugs,
  getDefaultEventImages,
  type DefaultEventImages,
} from "@/lib/defaultEventImage";
import { sendMail } from "@/lib/email";
import { oneClickUnsubscribeUrl, unsubscribeUrl } from "@/lib/mailUnsubscribe";
import { markdownToPlainText } from "@/lib/markdown";
import { siteUrl } from "@/lib/seo";
import { publicUrl } from "@/lib/storage";
import {
  dueWeekOverview,
  excerpt,
  occurrenceInWeek,
  pickWeekFeatured,
  visibleForAudiences,
  type WeekOverviewWeek,
} from "./weekOverview";
import { weekOverviewMail, type WeekOverviewMailEvent, type WeekOverviewMailReminder } from "./weekOverviewMail";

/**
 * Verstuurt zaterdagavond de weekmail van de kalender aan wie de mailinglijst
 * Evenementen aan heeft. Wanneer en wat staat in `weekOverview.ts`, het bericht
 * in `weekOverviewMail.ts`.
 *
 * Draait mee met de `background-worker` (elke vijf minuten, zie
 * /api/background/maintenance). Buiten het venster (zaterdag 19u tot de week
 * begint) doet dit niets; daarin neemt elke ronde de volgende {@link BATCH}
 * leden die deze week nog niets kregen, tot de lijst rond is.
 *
 * Per lid eerst claimen (een rij in `CalendarWeekMail`, uniek per lid en week),
 * dan versturen; mislukt het versturen, dan gaat de claim weer weg en probeert
 * de volgende ronde opnieuw.
 *
 * Wie de doelgroepfilter op /account aanzette, krijgt enkel wat hij ook op de
 * kalender ziet. Blijft er voor hem niets over, dan krijgt hij geen mail; de
 * claim blijft staan, zodat de volgende ronde hem niet opnieuw bekijkt.
 */

/** Hoeveel leden één ronde hoogstens bekijkt; de rest volgt over vijf minuten. */
const BATCH = 300;

const EVENT_SELECT = {
  id: true,
  slug: true,
  titleNl: true,
  titleEn: true,
  descriptionNl: true,
  descriptionEn: true,
  start: true,
  end: true,
  allDay: true,
  location: true,
  organiserName: true,
  imageKey: true,
  imageFocusX: true,
  imageFocusY: true,
  homeFeaturedAt: true,
  group: { select: { nameNl: true, nameEn: true } },
  moments: { select: MOMENT_SELECT, orderBy: { start: "asc" } },
  categories: { select: { category: { select: { slug: true, audience: true } } } },
  ...SIGNUP_LINK_SELECT,
} satisfies Prisma.CalendarEventSelect;

type EventRow = Prisma.CalendarEventGetPayload<{ select: typeof EVENT_SELECT }>;

type WeekEntry = {
  event: EventRow;
  moment: EventRow["moments"][number] | null;
  start: Date;
  end: Date;
  more: number;
  audiences: (CalendarAudience | null)[];
};

type ReminderEntry = {
  kind: WeekOverviewMailReminder["kind"];
  at: Date;
  titleNl: string;
  titleEn: string | null;
  path: (locale: "nl" | "en") => string;
};

export type WeekOverviewRun = { week: string | null; sent: number; failed: number; skipped: number };

/** De evenementen die in deze week beginnen, in de volgorde van de week. */
async function loadWeek(range: WeekOverviewWeek): Promise<WeekEntry[]> {
  const events = await prisma.calendarEvent.findMany({
    where: {
      publishedAt: { not: null },
      OR: [
        { moments: { none: {} }, start: { gte: range.start, lt: range.end } },
        { moments: { some: { start: { gte: range.start, lt: range.end } } } },
      ],
    },
    select: EVENT_SELECT,
    orderBy: { start: "asc" },
  });
  const entries: WeekEntry[] = [];
  for (const event of events) {
    const occurrence = occurrenceInWeek(event, range);
    if (!occurrence) continue;
    entries.push({
      event,
      moment: occurrence.moment,
      start: occurrence.start,
      end: occurrence.end,
      more: occurrence.more,
      audiences: event.categories.map((row) => row.category.audience),
    });
  }
  return entries.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** Een ticketverkoop die opent of een inschrijving die sluit, van nu tot het einde van de week. */
async function loadReminders(now: Date, range: WeekOverviewWeek): Promise<ReminderEntry[]> {
  const window = { gte: now, lt: range.end };
  const [sales, forms] = await Promise.all([
    prisma.ticketEvent.findMany({
      where: {
        status: "PUBLISHED",
        isPrivate: false,
        salesStartAt: window,
        OR: [{ calendarEventId: null }, { calendarEvent: { publishedAt: { not: null } } }],
      },
      select: { slug: true, titleNl: true, titleEn: true, salesStartAt: true },
    }),
    prisma.form.findMany({
      where: { status: "PUBLISHED", closesAt: window, calendarEvent: { publishedAt: { not: null } } },
      select: { slug: true, titleNl: true, titleEn: true, closesAt: true },
    }),
  ]);
  return [
    ...sales.map(
      (sale): ReminderEntry => ({
        kind: "ticketSale",
        at: sale.salesStartAt!,
        titleNl: sale.titleNl,
        titleEn: sale.titleEn,
        path: (locale) => `${locale === "en" ? "/en" : ""}/tickets/${sale.slug}`,
      }),
    ),
    ...forms.map(
      (form): ReminderEntry => ({
        kind: "formCloses",
        at: form.closesAt!,
        titleNl: form.titleNl,
        titleEn: form.titleEn,
        path: (locale) => `${locale === "en" ? "/en" : ""}/formulieren/${form.slug}`,
      }),
    ),
  ].sort((a, b) => a.at.getTime() - b.at.getTime());
}

function mailEvent(
  entry: WeekEntry,
  locale: "nl" | "en",
  origin: string,
  defaults: DefaultEventImages,
  now: Date,
): WeekOverviewMailEvent & { featured: boolean; hasSignup: boolean } {
  const { event, moment } = entry;
  const base = locale === "en" ? "/en" : "";
  // Deze mail gaat over één keer: de startplaats en de affiche van dat moment.
  const shown = eventForMoment(event, moment);
  const image = publicUrl(shown.imageKey) ?? defaultEventImageFor(defaults, eventCategorySlugs(event.categories));
  const link = eventSignupLink(event, now, locale);
  const description = pick(event.descriptionNl ?? "", event.descriptionEn ?? "", locale);
  return {
    title: pick(event.titleNl, event.titleEn, locale),
    start: entry.start,
    end: entry.end,
    allDay: moment ? false : event.allDay,
    momentLabel: moment?.label ?? null,
    location: shown.location,
    organiser: organiserName(event.organiserName, event.group, locale),
    imageUrl: absoluteHref(image, origin),
    eventUrl: `${origin}${base}/kalender/${event.slug}`,
    link: link ? { label: link.label, url: absoluteHref(link.href, origin) } : null,
    moreThisWeek: entry.more,
    excerpt: description ? excerpt(markdownToPlainText(description)) : null,
    featured: event.homeFeaturedAt !== null,
    hasSignup: link !== null,
  };
}

export async function processDueWeekOverviewMails(now: Date = new Date()): Promise<WeekOverviewRun> {
  const range = dueWeekOverview(now);
  if (!range) return { week: null, sent: 0, failed: 0, skipped: 0 };

  try {
    const users = await prisma.user.findMany({
      where: {
        active: true,
        mailUnsubscribedAt: null,
        mailCategories: { has: "EVENEMENTEN" },
        calendarWeekMails: { none: { week: range.week } },
      },
      select: {
        id: true,
        email: true,
        personalEmail: true,
        emailPreference: true,
        locale: true,
        calendarOnlyMyAudiences: true,
        ...STUDY_PROFILE_SELECT,
      },
      orderBy: { id: "asc" },
      take: BATCH,
    });
    if (users.length === 0) return { week: range.week, sent: 0, failed: 0, skipped: 0 };

    // Een lege week: geen mail, en ook geen claim. Komt er zondag nog iets bij,
    // dan vertrekt ze alsnog.
    const week = await loadWeek(range);
    if (week.length === 0) return { week: range.week, sent: 0, failed: 0, skipped: 0 };

    const [reminders, defaults] = await Promise.all([loadReminders(now, range), getDefaultEventImages()]);
    const origin = siteUrl();
    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const user of users) {
      // Wat een tweede container al nam, laten we hem.
      const { count } = await prisma.calendarWeekMail.createMany({
        data: [{ userId: user.id, week: range.week }],
        skipDuplicates: true,
      });
      if (count !== 1) continue;

      const audiences = user.calendarOnlyMyAudiences ? audiencesForStudyProfile(user) : null;
      const visible = week.filter((entry) => visibleForAudiences(entry.audiences, audiences));
      if (visible.length === 0) {
        skipped += 1;
        continue;
      }

      const locale = user.locale === "EN" ? "en" : "nl";
      const base = locale === "en" ? "/en" : "";
      const events = visible.map((entry) => mailEvent(entry, locale, origin, defaults, now));
      const featured = pickWeekFeatured(events)!;
      const mail = weekOverviewMail({
        locale,
        weekStart: range.start,
        featured,
        others: events.filter((event) => event !== featured),
        reminders: reminders.map((reminder) => ({
          kind: reminder.kind,
          at: reminder.at,
          title: pick(reminder.titleNl, reminder.titleEn, locale),
          url: `${origin}${reminder.path(locale)}`,
        })),
        calendarUrl: `${origin}${base}/kalender`,
        unsubscribeUrl: unsubscribeUrl(user.id, "EVENEMENTEN", locale),
        accountUrl: `${origin}${base}/account`,
        logoUrl: `${origin}/vtk-logo.png`,
      });

      const delivered = await sendMail(
        {
          to: preferredEmail(user),
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          listUnsubscribe: oneClickUnsubscribeUrl(user.id, "EVENEMENTEN"),
        },
        { source: "calendar" },
      );

      if (delivered) {
        sent += 1;
      } else {
        await prisma.calendarWeekMail.deleteMany({ where: { userId: user.id, week: range.week } });
        failed += 1;
      }
    }

    return { week: range.week, sent, failed, skipped };
  } catch (error) {
    console.error("[kalender] fout bij het versturen van de weekmail:", error);
    Sentry.captureException(error);
    return { week: range.week, sent: 0, failed: 0, skipped: 0 };
  }
}
