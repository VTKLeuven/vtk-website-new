import "server-only";

import { prisma } from "@vtk/db";
import type { Locale } from "@vtk/i18n";
import { buildIcs, type IcsEvent } from "@/lib/calendar/ics";
import { siteBaseUrl } from "@/lib/calendar/feeds";
import { palPlusCourseLabel, palPlusRoomLabel } from "@/lib/palPlus";

/**
 * De PAL+-agenda als iCalendar: één publieke feed met alle sessies, en één
 * sessie achter de knop "Zet in mijn agenda".
 *
 * Wat erin staat, staat ook publiek op /pal-plus: vak, moment, lokaal en de
 * naam van de tutor. Nooit wie ingeschreven is.
 *
 * Een geannuleerde sessie blijft erin, met `STATUS:CANCELLED`, zodat een
 * geabonneerde agenda ze schrapt in plaats van ze te laten staan (Google ruimt
 * een verdwenen afspraak niet altijd op). Ze valt er vanzelf uit zodra ze ouder
 * is dan `HISTORY_DAYS`.
 */

/** Hoe lang een voorbije of geannuleerde sessie in de feed blijft staan. */
const HISTORY_DAYS = 30;

const sessionSelect = {
  id: true,
  description: true,
  startsAt: true,
  endsAt: true,
  roomText: true,
  cancelledAt: true,
  cancelReason: true,
  updatedAt: true,
  course: { select: { code: true, nameNl: true, nameEn: true } },
  room: { select: { code: true, name: true, building: { select: { shortCode: true, address: true } } } },
  tutors: { orderBy: { createdAt: "asc" }, select: { user: { select: { name: true } } } },
} as const;

function pageUrl(locale: Locale): string {
  return `${siteBaseUrl()}${locale === "en" ? "/en" : ""}/pal-plus`;
}

type SessionRow = Awaited<ReturnType<typeof loadSessions>>[number];

function loadSessions(where: { id?: string; since?: Date }) {
  return prisma.palPlusSession.findMany({
    where: {
      ...(where.id ? { id: where.id } : {}),
      ...(where.since ? { endsAt: { gt: where.since } } : {}),
    },
    orderBy: { startsAt: "asc" },
    select: sessionSelect,
  });
}

function toIcsEvent(row: SessionRow, locale: Locale): IcsEvent {
  const nl = locale === "nl";
  const tutors = row.tutors.map((tutor) => tutor.user.name).join(", ");
  const room = palPlusRoomLabel(row.room, row.roomText);
  const lines = [
    row.description,
    tutors ? `${nl ? "Tutor" : "Tutor"}: ${tutors}` : null,
    room ? null : nl ? "Lokaal volgt." : "Room to follow.",
    row.cancelledAt && row.cancelReason ? `${nl ? "Geannuleerd" : "Cancelled"}: ${row.cancelReason}` : null,
  ].filter(Boolean);

  return {
    uid: `pal-plus-${row.id}@vtk.be`,
    start: row.startsAt,
    end: row.endsAt,
    allDay: false,
    summary: `PAL+: ${palPlusCourseLabel(row.course, locale)}`,
    description: lines.join("\n\n"),
    location: room && row.room?.building.address ? `${room}, ${row.room.building.address}` : room,
    url: pageUrl(locale),
    updatedAt: row.updatedAt,
    cancelled: Boolean(row.cancelledAt),
  };
}

/** Alle sessies van de voorbije maand en alles wat nog komt. */
export async function buildPalPlusFeed(locale: Locale): Promise<string> {
  const since = new Date(Date.now() - HISTORY_DAYS * 86_400_000);
  const rows = await loadSessions({ since });
  return buildIcs({
    name: "VTK PAL+",
    description:
      locale === "nl"
        ? "De PAL+-sessies van VTK: studenten helpen studenten."
        : "VTK's PAL+ sessions: students helping students.",
    url: pageUrl(locale),
    events: rows.map((row) => toIcsEvent(row, locale)),
  });
}

/** Eén sessie, of `null` als ze niet bestaat. */
export async function buildPalPlusSessionIcs(
  id: string,
  locale: Locale,
): Promise<{ body: string; filename: string } | null> {
  const [row] = await loadSessions({ id });
  if (!row) return null;
  const event = toIcsEvent(row, locale);
  return {
    body: buildIcs({ name: event.summary, url: pageUrl(locale), events: [event] }),
    filename: `pal-plus-${(row.course.code ?? row.course.nameNl).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
  };
}
