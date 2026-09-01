import type { CSSProperties } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { requirePermission, requireSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { publicUrl } from "@/lib/storage";
import { readFieldValues } from "@/lib/frontpage/fields";
import { frontpagePhoto, getFrontpageModule } from "@/lib/frontpage/registry";
import { viewerAudienceFilter } from "@/lib/calendar/audience";
import { publicInterestCounts, viewerInterests } from "@/lib/calendar/interest";
import {
  FRONTPAGE_EVENT_INCLUDE,
  frontpageEventsSince,
  toFrontpageEvents,
} from "@/lib/frontpage/events";
import { ToastProvider } from "@/components/ui/toast";
import { Frontpage } from "@/components/editorial/frontpage";

// Outside `app/[locale]/` on purpose, so the site header, the footer and the
// admin navigation stay out of the frame; only the root layout wraps this. That
// also means the design tokens have to be imported here rather than inherited.
import "@/app/design/vtk-base.css";
import "@/app/design/vtk-home.css";
import "@/app/design/vtk-frontpage.css";

/**
 * One front page on its own, for the preview frame in /admin/frontpage.
 *
 * Renders the real component with the real stylesheets and the values actually
 * saved for it, so the preview cannot drift from the homepage the way a
 * hand-drawn thumbnail would. It shows the front page whether or not it is
 * currently live, which is the whole point: you want to see the jobfair page
 * while you are filling it in, weeks before its window opens.
 *
 * Behind `home.edit` like the rest of the screen. Nothing here is a second way
 * to publish something; it only reads.
 */
export const metadata = { robots: { index: false, follow: false } };

export default async function FrontpagePreview({
  params,
}: {
  params: Promise<{ locale: string; layout: string }>;
}) {
  const { locale: localeParam, layout } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const base = locale === "nl" ? "" : "/en";
  // Redirect to the login rather than throwing, the same as the admin layout
  // does: a session that expires while the front page screen is open would
  // otherwise turn every preview frame into a bare 404.
  const session = await requireSession(`${base}/inloggen?next=${base}/admin/frontpage`);
  await requirePermission("home.edit");

  const layoutModule = getFrontpageModule(layout);
  if (!layoutModule) notFound();

  const now = new Date();
  // Dezelfde lezing als de homepage, tot en met het venster dat een dag
  // terugkijkt: een voorbeeld dat andere evenementen toont dan de echte pagina,
  // is geen voorbeeld. Zie lib/frontpage/events.ts.
  const [row, calendarEvents, partners] = await Promise.all([
    prisma.frontpage.findUnique({ where: { layout } }),
    viewerAudienceFilter().then((audiences) =>
      prisma.calendarEvent.findMany({
        where: {
          start: { gte: frontpageEventsSince(now) },
          publishedAt: { not: null },
          ...audiences,
        },
        orderBy: { start: "asc" },
        take: 40,
        include: FRONTPAGE_EVENT_INCLUDE,
      }),
    ),
    prisma.partner.findMany({
      where: { active: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      take: 12,
    }),
  ]);

  const eventIds = calendarEvents.map((event) => event.id);
  const [interested, viewerInterestMap] = await Promise.all([
    publicInterestCounts(eventIds),
    viewerInterests(eventIds, session.user.id),
  ]);
  const viewerInterestIds = new Set(viewerInterestMap.keys());
  const upcomingEvents = calendarEvents.filter((event) => event.start >= now);

  const values = readFieldValues(row?.values, layoutModule.fields);
  const heroPhoto = frontpagePhoto(layoutModule, publicUrl(values.photo));
  const style = { "--home-hero-photo": `url("${heroPhoto}")` } as CSSProperties;

  return (
    <div className="vtk-design">
      {/* No quick-links row and no site header: the preview is about the front
          page itself, and the surrounding chrome would only shrink it.

          De ToastProvider staat hier apart: deze route valt buiten `[locale]`,
          en de ster van het weekoverzicht meldt via een toast wanneer de server
          weigert. Zonder provider gooit die hook en gaat het voorbeeld stuk. */}
      <ToastProvider>
        <div className="home-dark-zone" style={style}>
          <Frontpage
            id={layoutModule.id}
            values={values}
            locale={locale}
            base={base}
            now={now}
            upcomingEvents={toFrontpageEvents(upcomingEvents, interested, viewerInterestIds)}
            weekEvents={toFrontpageEvents(calendarEvents, interested, viewerInterestIds)}
            signedIn
            partners={partners}
          />
        </div>
      </ToastProvider>
    </div>
  );
}
