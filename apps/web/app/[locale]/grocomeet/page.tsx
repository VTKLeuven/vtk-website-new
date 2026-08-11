import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { hasLocale } from "@/lib/locale";
import { getCurrentSession } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { PleaseLogin } from "@/components/site/pleaseLogin";
import { getMeetingDrinks } from "@/lib/meetings-server";
import { buildMeetingCard } from "@/lib/meetingView";
import { MeetingReservationCard } from "@/components/meetings/MeetingReservationCard";

import "@/app/design/vtk-basic.css";
import "@/app/design/vtk-forms.css";

// Niet indexeren: de pagina geldt voor een handvol mensen en staat achter een
// permissie; in een zoekresultaat heeft ze niets te zoeken.
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Broodjes bestellen voor de grocomeet. Enkel voor wie `grocomeet.reserve` heeft:
 * de verantwoordelijken van de posten en Groep 5 (zie docs/permissions.md). De
 * pagina staat niet in de navigatie maar in het profielmenu, want ze geldt maar
 * voor een handvol mensen.
 */
export default async function GrocomeetPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  const session = await getCurrentSession();
  if (!session) {
    return <PleaseLogin locale={locale} nextPath={`${base}/grocomeet`} className="vtk-page-shell" />;
  }
  if (!hasPermission(session, "grocomeet.reserve")) notFound();

  const userId = session.user.id;
  const now = new Date();

  const [meetings, drinks] = await Promise.all([
    prisma.meeting.findMany({
      where: { kind: "GROCOMEET", startsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      include: {
        options: { orderBy: { order: "asc" } },
        reservations: { where: { userId } },
      },
    }),
    getMeetingDrinks(),
  ]);

  const cards = await Promise.all(
    meetings.map((meeting) =>
      buildMeetingCard(meeting, meeting.reservations[0] ?? null, { locale, drinks, now }),
    ),
  );

  return (
    <div className="vtk-page">
      <header className="vtk-page-head">
        <div>
          <h1 className="vtk-page-title">{nl ? "Broodjes voor de grocomeet" : "Sandwiches for the grocomeet"}</h1>
          <p className="vtk-page-subtitle">
            {nl
              ? "Kies per vergadering een broodje en een drankje. Aanpassen kan tot de besteldeadline van Theokot die dag."
              : "Pick a sandwich and a drink per meeting. You can change it until Theokot's order deadline that day."}
          </p>
        </div>
      </header>

      <div className="vtk-page-shell">
        <div className="vtk-basic-stack">
          {cards.length === 0 ? (
            <div className="vtk-basic-empty">
              {nl
                ? "Er staan nog geen grocomeets ingepland."
                : "No grocomeets have been scheduled yet."}
            </div>
          ) : (
            cards.map((card) => <MeetingReservationCard key={card.id} nl={nl} meeting={card} />)
          )}
        </div>
      </div>
    </div>
  );
}
