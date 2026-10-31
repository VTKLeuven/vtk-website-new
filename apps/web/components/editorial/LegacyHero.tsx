import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { DefaultFrontpage } from "@/components/editorial/frontpage/DefaultFrontpage";
import { JobfairFrontpage } from "@/components/editorial/frontpage/JobfairFrontpage";
import { UrenloopFrontpage } from "@/components/editorial/frontpage/UrenloopFrontpage";
import type { FrontpageShift } from "@/components/editorial/frontpage/context";
import { HOME_LINK_EVENT, OUTBOUND_EVENT, outboundHost, umamiEvent } from "@/lib/analytics";
import { viewerAudienceFilter } from "@/lib/calendar/audience";
import {
  publicInterestCounts,
  viewerInterests,
  viewerMomentStarts,
} from "@/lib/calendar/interest";
import { hasUpcomingMoment, nextOccurrenceAt } from "@/lib/calendar/moments";
import { getCachedPartners } from "@/lib/cachedContent";
import {
  FRONTPAGE_EVENT_INCLUDE,
  frontpageEventsSince,
  toFrontpageEvents,
} from "@/lib/frontpage/events";
import type { HeroPhotoDesign } from "@/lib/home/heroDesign";
import { ROSTER_PARTICIPANT_SELECT, toRoster } from "@/lib/shift/roster";
import { getCurrentSession } from "@/lib/session";
import { getCachedUrenloopData } from "@/lib/urenloop/server";
import type { getCursusdienstHours } from "@/lib/cursusdienstHours";
import { HomeHeroPhoto } from "./HomeHeroPhoto";
import { entryForDate, isClosedHours } from "./hoursUtils";

/** De achtergrondfoto en het blok erop, per design. */
const VARIANTS = {
  oldHero: { photo: "/hero-arenberg.jpg", Hero: DefaultFrontpage },
  urenloop: { photo: "/hero-24urenloop.jpg", Hero: UrenloopFrontpage },
  jobfair: { photo: "/frontpage/jobfair.jpg", Hero: JobfairFrontpage },
} as const;

/**
 * De drie hero's met een foto (oude hero, 24 urenloop, jobfair) met daaronder de
 * snelle links, gekozen in /admin/home.
 *
 * Alles hier staat bewust apart van HomeEditorial: deze lezingen en stylesheets
 * horen enkel bij wie dit design kiest, en mogen de homepage van de andere designs
 * niet zwaarder maken. Daarom staan de stylesheets in `public/` en niet achter een
 * `import`: een CSS-import laadt Next altijd mee met de route, ook via
 * `next/dynamic` (55 kB voor elke bezoeker, gemeten in een productiebuild). Zie
 * docs/design-decisions.md voor wat er niet teruggekomen is.
 */
export function LegacyHeroStyles() {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags -- bewust; zie hierboven. */}
      <link rel="stylesheet" href="/frontpage-legacy/frontpage.css" precedence="default" />
      {/* eslint-disable-next-line @next/next/no-css-tags -- bewust; zie hierboven. */}
      <link rel="stylesheet" href="/frontpage-legacy/home.css" precedence="default" />
    </>
  );
}

export async function LegacyHero({
  locale,
  design,
  now,
  session,
  cursusEntries,
}: {
  locale: Locale;
  design: HeroPhotoDesign;
  now: Date;
  session: Awaited<ReturnType<typeof getCurrentSession>>;
  cursusEntries: Awaited<ReturnType<typeof getCursusdienstHours>>;
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const { photo, Hero } = VARIANTS[design];

  const [partners, calendarEvents, shifts] = await Promise.all([
    getCachedPartners(),
    // Vanaf gisteren en niet vanaf nu: het weekoverzicht laat de dag van gisteren
    // staan zolang daar iets was (zie lib/calendar/heroWeek.ts). De limiet ligt
    // ruim, omdat de terugval de eerstvolgende vier moet kunnen vinden, ook als
    // die pas over een maand zijn.
    viewerAudienceFilter().then((audiences) =>
      prisma.calendarEvent.findMany({
        where: {
          end: { gte: frontpageEventsSince(now) },
          publishedAt: { not: null },
          ...audiences,
        },
        orderBy: { start: "asc" },
        take: 40,
        include: FRONTPAGE_EVENT_INCLUDE,
      }),
    ),
    prisma.shift.findMany({
      where: { endTime: { gte: now }, manualGrantId: null },
      orderBy: { startTime: "asc" },
      take: 40,
      select: {
        id: true,
        name: true,
        startTime: true,
        endTime: true,
        // Niet getoond; `ShiftDialog` verwacht de volledige `Shift`-vorm.
        updatedAt: true,
        location: true,
        description: true,
        instructions: true,
        maxParticipants: true,
        reward: true,
        post: true,
        openToInternationals: true,
        _count: { select: { participants: true } },
        participants: { select: ROSTER_PARTICIPANT_SELECT },
      },
    }),
  ]);

  const eventIds = calendarEvents.map((event) => event.id);
  const viewerUserId = session?.user.id ?? null;
  const [interested, viewerInterestMap, viewerMoments, urenloopData] = await Promise.all([
    publicInterestCounts(eventIds),
    viewerInterests(eventIds, viewerUserId),
    viewerMomentStarts(eventIds, viewerUserId),
    design === "urenloop"
      ? getCachedUrenloopData().catch(() => undefined)
      : undefined,
  ]);
  const viewerInterestIds = new Set(viewerInterestMap.keys());
  const viewerId = viewerUserId ?? "";

  const upcomingEvents = calendarEvents
    .filter((event) => hasUpcomingMoment(event, now))
    .sort((a, b) => +nextOccurrenceAt(a, now) - +nextOccurrenceAt(b, now));

  const openShifts: FrontpageShift[] = shifts.map(({ _count, participants, ...shift }) => ({
    ...shift,
    takenSpots: _count.participants,
    viewerRegistered: participants.some((p) => p.userId === viewerId),
    roster: toRoster(participants, viewerId),
  }));

  const curToday = cursusEntries ? entryForDate(cursusEntries, now, locale) : undefined;
  const quickLinks = [
    { k: nl ? "Kalender" : "Calendar", v: nl ? "Kalender" : "Calendar", m: nl ? "Alle events" : "All events", href: `${base}/kalender` },
    { k: nl ? "Werk" : "Work", v: "Shiften", m: nl ? "Help mee" : "Join a shift", href: `${base}/shift` },
    { k: nl ? "Koop" : "Buy", v: "Tickets", m: nl ? "Voor onze events" : "For our events", href: `${base}/tickets` },
    {
      k: nl ? "Eten" : "Eat",
      v: "Theokot",
      m: nl ? "Bestel broodjes" : "Order sandwiches",
      href: `${base}/theokot`,
    },
    {
      k: nl ? "Boeken" : "Books",
      v: nl ? "Cursusdienst" : "Course shop",
      m: curToday && !isClosedHours(curToday.hours) ? curToday.hours : nl ? "Cursussen & tweedehands" : "Courses & second-hand",
      href: "https://cudi.vtk.be",
    },
    {
      k: nl ? "Reserveer" : "Reserve",
      v: nl ? "Tijdsloten Cudi" : "Cudi Time Slots",
      m: nl ? "Praktische tools" : "Practical tools",
      href: "https://cudi.vtk.be/vtk/account/slots",
    },
  ];

  return (
    // De hero-foto en scrim lopen door tot en met de snelle links; de zone draagt
    // de achtergrond zodat beide secties op hetzelfde donker zitten.
    <div className="home-dark-zone">
      <LegacyHeroStyles />
      <HomeHeroPhoto src={photo} />
      <Hero
        locale={locale}
        base={base}
        now={now}
        upcomingEvents={toFrontpageEvents(upcomingEvents, interested, viewerInterestIds, viewerMoments)}
        weekEvents={toFrontpageEvents(calendarEvents, interested, viewerInterestIds, viewerMoments)}
        signedIn={session !== null}
        openShifts={openShifts}
        partners={partners}
        urenloop={urenloopData}
      />

      <section className="quick">
        <div className="quick-row">
          {quickLinks.map((item) => {
            const body = (
              <>
                <span className="k">{item.k}</span>
                <span className="v">{item.v}</span>
                <span className="m">{item.m}</span>
              </>
            );
            const tracking = item.href.startsWith("http")
              ? umamiEvent(OUTBOUND_EVENT, {
                  bestemming: outboundHost(item.href),
                  vanaf: "quicklink",
                })
              : umamiEvent(HOME_LINK_EVENT, { soort: "quicklink", naar: item.href });
            return item.href.startsWith("http") ? (
              <a key={item.k} className="ql" href={item.href} {...tracking}>
                {body}
              </a>
            ) : (
              <Link key={item.k} className="ql" href={item.href} {...tracking}>
                {body}
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
