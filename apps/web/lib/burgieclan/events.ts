import "server-only";

import { prisma } from "@vtk/db";
import { eventUrl } from "@/lib/calendar/feeds";

/**
 * De VTK-evenementen zoals Burgieclan ze leest, voor de planning (zie
 * `docs/burgieclan-planning.md`).
 *
 * Burgieclan bewaart welke evenementen iemand in zijn planning zette, en haalt
 * hier de gegevens op: bij het toevoegen, en daarna elk uur opnieuw zodat een
 * verschoven uur of een nieuwe locatie ook in de planning en de geëxporteerde
 * agenda verschuift.
 *
 * **Enkel gepubliceerde evenementen.** Die staan al in de publieke ICS-feed en op
 * /kalender, dus dit endpoint zegt niets wat daar niet al staat. Een evenement
 * dat ingetrokken of gewist wordt, ontbreekt gewoon in het antwoord; Burgieclan
 * leest dat als "weg" en toont het niet meer.
 *
 * Beide talen gaan mee, want Burgieclan heeft er ook twee en kiest zelf.
 */
export type BurgieclanVtkEvent = {
  id: string;
  slug: string;
  titleNl: string;
  titleEn: string | null;
  location: string | null;
  /** ISO 8601, UTC. */
  start: string;
  end: string;
  allDay: boolean;
  urlNl: string;
  urlEn: string;
  /** ISO 8601; verandert bij elke wijziging aan het evenement. */
  updatedAt: string;
  /** De losse momenten van een reeks (een loopweek), oplopend. Leeg voor een gewoon evenement. */
  moments: { start: string; end: string; label: string | null; location: string | null }[];
};

/** Zoveel ids per aanvraag; een planning met meer VTK-evenementen vraagt in stukken. */
export const MAX_IDS = 100;
/** Zoveel evenementen in de keuzelijst; meer dan een paar maanden vooruit plant niemand. */
const MAX_UPCOMING = 200;

const select = {
  id: true,
  slug: true,
  titleNl: true,
  titleEn: true,
  location: true,
  start: true,
  end: true,
  allDay: true,
  updatedAt: true,
  moments: {
    select: { start: true, end: true, label: true, location: true },
    orderBy: { start: "asc" },
  },
} as const;

type Row = {
  id: string;
  slug: string;
  titleNl: string;
  titleEn: string | null;
  location: string | null;
  start: Date;
  end: Date;
  allDay: boolean;
  updatedAt: Date;
  moments: { start: Date; end: Date; label: string | null; location: string | null }[];
};

function shape(row: Row): BurgieclanVtkEvent {
  return {
    id: row.id,
    slug: row.slug,
    titleNl: row.titleNl,
    titleEn: row.titleEn?.trim() || null,
    location: row.location?.trim() || null,
    start: row.start.toISOString(),
    end: row.end.toISOString(),
    allDay: row.allDay,
    urlNl: eventUrl(row.slug, "nl"),
    urlEn: eventUrl(row.slug, "en"),
    updatedAt: row.updatedAt.toISOString(),
    moments: row.moments.map((m) => ({
      start: m.start.toISOString(),
      end: m.end.toISOString(),
      label: m.label?.trim() || null,
      // Een moment zonder eigen locatie speelt op die van het evenement.
      location: m.location?.trim() || row.location?.trim() || null,
    })),
  };
}

/** Deze evenementen, voor zover ze gepubliceerd zijn. Onbekende ids vallen weg. */
export async function burgieclanEventsById(ids: string[]): Promise<BurgieclanVtkEvent[]> {
  const unique = [...new Set(ids.map((id) => id.trim()).filter(Boolean))].slice(0, MAX_IDS);
  if (unique.length === 0) return [];
  const rows = await prisma.calendarEvent.findMany({
    where: { id: { in: unique }, publishedAt: { not: null } },
    select,
    orderBy: { start: "asc" },
  });
  return rows.map(shape);
}

/**
 * Wat er aan komt, voor de keuzelijst op Burgieclan: alles wat nog niet voorbij
 * is, ook een reeks die al loopt (filter op `end`, zoals de kalender van de app).
 */
export async function burgieclanUpcomingEvents(from: Date, to: Date): Promise<BurgieclanVtkEvent[]> {
  const rows = await prisma.calendarEvent.findMany({
    where: { publishedAt: { not: null }, end: { gte: from }, start: { lte: to } },
    select,
    orderBy: { start: "asc" },
    take: MAX_UPCOMING,
  });
  return rows.map(shape);
}
