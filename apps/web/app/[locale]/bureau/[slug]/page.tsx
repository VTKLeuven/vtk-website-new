import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import type { Locale } from "@vtk/i18n";
import { PleaseLogin } from "@/components/site/pleaseLogin";
import { getMeetingDrinks } from "@/lib/meetings-server";
import { buildMeetingCard } from "@/lib/meetingView";
import { MeetingReservationCard } from "@/components/meetings/MeetingReservationCard";
import { landingQuery, taggedLanding } from "@/lib/ticketing/source";

import "@/app/design/vtk-basic.css";
import "@/app/design/vtk-forms.css";

// Niet indexeren: dit formulier bereik je via de link die Onderwijs deelt.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Inschrijven voor één VTK Bureau, met een broodje en een drankje erbij wanneer
 * je dat wil. Elke ingelogde student kan hier terecht, maar enkel via de link
 * die Onderwijs deelt: de pagina staat nergens in de navigatie en wordt niet
 * geïndexeerd.
 */
export default async function BureauPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale: localeParam, slug } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const meeting = await prisma.meeting.findUnique({
    where: { slug },
    include: { options: { orderBy: { order: "asc" } } },
  });
  if (!meeting || meeting.kind !== "BUREAU") notFound();

  const query = await searchParams;
  const session = await getCurrentSession();
  if (!session) {
    // De herkomst reist mee langs de login; anders komt elke uitgelogde
    // bezoeker uit de mail terug als "direct".
    const via = landingQuery(query);
    return (
      <PleaseLogin locale={locale} nextPath={`${base}/bureau/${slug}${via}`} className="vtk-page-shell" />
    );
  }

  const [reservation, drinks, user] = await Promise.all([
    prisma.meetingReservation.findUnique({
      where: { meetingId_userId: { meetingId: meeting.id, userId: session.user.id } },
    }),
    getMeetingDrinks(),
    // Enkel een vriendjesbureau vraagt naar de faculteit; die staat niet in de sessie.
    meeting.friendsBureau
      ? prisma.user.findUnique({ where: { id: session.user.id }, select: { firwStudent: true } })
      : null,
  ]);

  const card = await buildMeetingCard(meeting, reservation, {
    locale,
    drinks,
    facultyStudent: user?.firwStudent ?? false,
  });

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">VTK Bureau</h1>
          <p className="vtk-page-subtitle">
            {nl
              ? "Kom je naar het bureau? Schrijf je hier in. Een broodje, een drankje en je onderwijsfeedback mag je meteen meegeven, maar hoeft niet."
              : "Coming to the bureau? Register here. You can add a sandwich, a drink and your education feedback right away, but none of that is required."}
          </p>
        </div>
      </header>

      <div className="vtk-page-shell">
        <div className="vtk-basic-stack">
          <MeetingReservationCard nl={nl} meeting={card} serverLanding={taggedLanding(query)} />
        </div>
      </div>
    </div>
  );
}
