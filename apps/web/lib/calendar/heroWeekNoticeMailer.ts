import "server-only";

import * as Sentry from "@sentry/nextjs";
import { prisma } from "@vtk/db";
import { sendMail } from "@/lib/email";
import { groupMailAddress } from "@/lib/groupMail";
import { siteUrl } from "@/lib/seo";
import { HERO_WEEK_DAYS } from "./heroWeek";
import { heroWeekNoticeReasons, needsHeroWeekNotice } from "./heroWeekNotice";
import { heroWeekNoticeMail } from "./heroWeekNoticeMail";

/**
 * Verstuurt de herinnering aan de post wanneer haar evenement in het
 * weekoverzicht van de homepage komt terwijl het nog een concept is of nog geen
 * eigen banner heeft.
 *
 * Draait mee met de `background-worker` (elke vijf minuten, zie
 * /api/background/maintenance). De regels staan in `heroWeekNotice.ts`, het
 * bericht in `heroWeekNoticeMail.ts`.
 *
 * Net als de lesbezoekmails: eerst claimen, dan versturen. Twee containers
 * kunnen tegelijk wakker worden, en een post die dezelfde herinnering twee keer
 * krijgt, leest de derde niet meer. Mislukt het versturen, dan gaat de claim
 * terug open en probeert de volgende ronde opnieuw.
 */
export async function processDueHeroWeekNotices(
  now: Date = new Date(),
): Promise<{ sent: number; skipped: number; failed: number }> {
  try {
    // Ruim genomen: alles wat nog niet afgelopen is en binnen het venster van de
    // hero kan vallen. `needsHeroWeekNotice` beslist daarna per evenement; die
    // rekent met de dagen van de hero en niet met een aantal uren.
    const horizon = new Date(now.getTime() + (HERO_WEEK_DAYS + 2) * 24 * 60 * 60 * 1000);
    const candidates = await prisma.calendarEvent.findMany({
      where: {
        heroWeekNoticeAt: null,
        heroWeek: { not: "HIDDEN" },
        end: { gte: now },
        start: { lte: horizon },
      },
      select: {
        id: true,
        slug: true,
        titleNl: true,
        start: true,
        end: true,
        allDay: true,
        location: true,
        heroWeek: true,
        publishedAt: true,
        imageKey: true,
        heroWeekNoticeAt: true,
        moments: { select: { start: true, end: true }, orderBy: { start: "asc" } },
        group: { select: { id: true, code: true, nameNl: true } },
      },
      orderBy: { start: "asc" },
    });

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const event of candidates) {
      if (!needsHeroWeekNotice(event, now)) continue;

      const to = await groupMailAddress(event.group);
      if (!to) {
        // Geen adres af te leiden (een code zonder letters of cijfers). Niets
        // claimen: zodra de code klopt, hoort de herinnering alsnog te
        // vertrekken.
        skipped += 1;
        continue;
      }

      const claimed = await prisma.calendarEvent.updateMany({
        where: { id: event.id, heroWeekNoticeAt: null },
        data: { heroWeekNoticeAt: now },
      });
      if (claimed.count === 0) continue;

      const base = siteUrl();
      const mail = heroWeekNoticeMail({
        title: event.titleNl,
        start: event.start,
        allDay: event.allDay,
        location: event.location,
        groupName: event.group.nameNl,
        reasons: heroWeekNoticeReasons(event),
        adminUrl: `${base}/admin/kalender/${event.id}`,
        // Een concept heeft geen publieke pagina; dan blijft die knop weg.
        publicUrl: event.publishedAt ? `${base}/kalender/${event.slug}` : null,
        logoUrl: `${base}/vtk-logo.png`,
      });

      const delivered = await sendMail(
        { to, subject: mail.subject, text: mail.text, html: mail.html },
        { source: "calendar" },
      );

      if (delivered) {
        sent += 1;
      } else {
        await prisma.calendarEvent.updateMany({
          where: { id: event.id, heroWeekNoticeAt: now },
          data: { heroWeekNoticeAt: null },
        });
        failed += 1;
      }
    }

    return { sent, skipped, failed };
  } catch (error) {
    console.error("[kalender] fout bij het versturen van de weekoverzicht-herinneringen:", error);
    Sentry.captureException(error);
    return { sent: 0, skipped: 0, failed: 0 };
  }
}
