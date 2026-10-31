import Link from "@/components/ui/Link";
import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { splitFullName } from "@vtk/auth";
import { Frontpage } from "@/components/editorial/frontpage";
import type { FrontpageShift } from "@/components/editorial/frontpage/context";
import { HOME_LINK_EVENT, OUTBOUND_EVENT, outboundHost, umamiEvent } from "@/lib/analytics";
import { viewerAudienceFilter } from "@/lib/calendar/audience";
import {
  publicInterestCounts,
  viewerInterests,
  viewerMomentStarts,
} from "@/lib/calendar/interest";
import { hasUpcomingMoment, nextOccurrenceAt } from "@/lib/calendar/moments";
import { getCachedSetting, getCachedPartners } from "@/lib/cachedContent";
import {
  FRONTPAGE_EVENT_INCLUDE,
  frontpageEventsSince,
  toFrontpageEvents,
} from "@/lib/frontpage/events";
import { frontpagePhoto } from "@/lib/frontpage/registry";
import { resolveFrontpage } from "@/lib/frontpage/resolve";
import type { HeroFrontpageChoice } from "@/lib/home/heroDesign";
import { ROSTER_PARTICIPANT_SELECT, toRoster } from "@/lib/shift/roster";
import { getCurrentSession } from "@/lib/session";
import { readSlogansSetting, resolveSlogans } from "@/lib/slogans";
import { publicUrl } from "@/lib/storage";
import { getCachedUrenloopData } from "@/lib/urenloop/server";
import type { getCursusdienstHours } from "@/lib/cursusdienstHours";
import { HomeHeroPhoto } from "./HomeHeroPhoto";
import { entryForDate, isClosedHours } from "./hoursUtils";

/**
 * De oude hero: de foto met een frontpage (standaard, 24 urenloop, jobfair, nieuw)
 * en daaronder de snelle links, gekozen in /admin/home.
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
      <link rel="stylesheet" href="/frontpage-legacy/frontpage.css" precedence="default" />
      <link rel="stylesheet" href="/frontpage-legacy/home.css" precedence="default" />
    </>
  );
}

export async function LegacyHero({
  locale,
  choice,
  now,
  session,
  cursusEntries,
}: {
  locale: Locale;
  choice: HeroFrontpageChoice;
  now: Date;
  session: Awaited<ReturnType<typeof getCurrentSession>>;
  cursusEntries: Awaited<ReturnType<typeof getCursusdienstHours>>;
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const [frontpage, partners, sloganSetting, calendarEvents, shifts] = await Promise.all([
    resolveFrontpage(now, choice === "planned" ? undefined : choice),
    getCachedPartners(),
    getCachedSetting("home.slogans"),
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
    frontpage.module.id === "urenloop"
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

  const user = session?.user
    ? {
        name: session.user.name,
        firstName: splitFullName(session.user.name).firstName || null,
      }
    : null;
  // Op de server opgelost, met dezelfde `now` als de rest van de pagina: welke
  // slogans bij dit publiek en dit dagdeel horen, ligt dan vast voor de HTML
  // vertrekt en is in de browser exact hetzelfde. Zie lib/slogans.ts.
  const slogans = resolveSlogans({
    config: readSlogansSetting(sloganSetting),
    locale,
    user,
    now,
    fallback: frontpage.legacyHero,
  });

  // De foto is een veld van de frontpage: een /api/media/...-pad of een pad in
  // public/, zodat wisselen een upload is en geen deploy.
  const heroPhoto = frontpagePhoto(frontpage.module, publicUrl(frontpage.values.photo));

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
      <HomeHeroPhoto src={heroPhoto} />
      <Frontpage
        id={frontpage.module.id}
        values={frontpage.values}
        locale={locale}
        base={base}
        now={now}
        upcomingEvents={toFrontpageEvents(upcomingEvents, interested, viewerInterestIds, viewerMoments)}
        weekEvents={toFrontpageEvents(calendarEvents, interested, viewerInterestIds, viewerMoments)}
        signedIn={session !== null}
        openShifts={openShifts}
        partners={partners}
        slogans={slogans}
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
