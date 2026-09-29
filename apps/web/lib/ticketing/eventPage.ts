/**
 * De ticketverkopen van één kalenderevent, zoals de eventpagina ze toont.
 *
 * Een kalenderevent kan meerdere ticketevents hebben (de volledige 12u naast de
 * losse cantussen, een eerstejaarsuur vooraf, de waves van Galabal). Elk houdt
 * zijn eigen adres, `/tickets/<slug>`. Staat `onEventPage` aan, dan toont dat
 * adres de eventpagina met die verkoop gekozen, en toont `/kalender/<slug>` de
 * eerste. Zonder `onEventPage` blijft het een losse ticketpagina, met een knop
 * op de eventpagina.
 *
 * Puur, zonder prisma: ook de kaarten op de homepage en de app-API lezen hier
 * welke ticketlink ze moeten tonen. Zie docs/design-decisions.md.
 */

/** Wat hier van een ticketevent gelezen wordt. */
export type EventPageTicket = {
  id: string;
  slug: string;
  status: string;
  onEventPage: boolean;
  labelNl: string | null;
  labelEn: string | null;
  ownTimes: boolean;
  startsAt: Date;
  endsAt: Date;
  createdAt: Date;
};

/** Het `select`-blok dat bij `EventPageTicket` hoort. */
export const EVENT_PAGE_TICKET_SELECT = {
  id: true,
  slug: true,
  status: true,
  onEventPage: true,
  labelNl: true,
  labelEn: true,
  ownTimes: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
} as const;

/** Enkel een gepubliceerd ticketevent heeft een pagina die een bezoeker kan openen. */
function isPublished(ticket: { status: string }): boolean {
  return ticket.status === "PUBLISHED";
}

/**
 * Chronologisch, en bij hetzelfde uur in de volgorde waarin ze aangemaakt zijn:
 * het eerstejaarsuur staat zo voor de gewone cantus, Wave 1 voor Wave 2.
 */
export function sortEventPageTickets<T extends { startsAt: Date; createdAt: Date }>(
  tickets: readonly T[],
): T[] {
  return [...tickets].sort(
    (a, b) =>
      a.startsAt.getTime() - b.startsAt.getTime() || a.createdAt.getTime() - b.createdAt.getTime(),
  );
}

/** De verkopen die op de eventpagina zelf staan, in de volgorde van de tabs. */
export function eventPageTickets<T extends Pick<EventPageTicket, "status" | "onEventPage" | "startsAt" | "createdAt">>(
  tickets: readonly T[],
): T[] {
  return sortEventPageTickets(tickets.filter((ticket) => ticket.onEventPage && isPublished(ticket)));
}

/** De verkopen met een eigen ticketpagina; de eventpagina linkt ernaar. */
export function separateTicketPages<T extends Pick<EventPageTicket, "status" | "onEventPage" | "startsAt" | "createdAt">>(
  tickets: readonly T[],
): T[] {
  return sortEventPageTickets(tickets.filter((ticket) => !ticket.onEventPage && isPublished(ticket)));
}

/**
 * De ticketlink van een evenementkaart of van de app: de eerste gepubliceerde
 * verkoop. Staat die op de eventpagina, dan toont haar adres die pagina met de
 * tickets al gekozen, dus de link klopt in beide gevallen.
 */
export function publishedTicketSlug(
  tickets: readonly TicketLinkRow[] | null | undefined,
): string | null {
  return sortEventPageTickets((tickets ?? []).filter(isPublished))[0]?.slug ?? null;
}

/** Wat een kaart of de app nodig heeft om de ticketlink te kiezen. */
export type TicketLinkRow = { slug: string; status: string; startsAt: Date; createdAt: Date };

/** Het `select`-blok dat bij `TicketLinkRow` hoort. */
export const TICKET_LINK_SELECT = {
  slug: true,
  status: true,
  startsAt: true,
  createdAt: true,
} as const;

function clock(date: Date, locale: "nl" | "en"): string {
  return new Intl.DateTimeFormat(locale === "nl" ? "nl-BE" : "en-GB", {
    timeZone: "Europe/Brussels",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * De naam van een verkoop op de eventpagina. Zonder naam: het uur, wanneer ze
 * eigen uren heeft (dat is dan het verschil), en anders een nummer. Het beheer
 * vraagt een naam zodra er meer dan één verkoop op de pagina staat, dus dit is
 * een vangnet en geen weergave die iemand hoort te zien.
 */
export function eventPageTicketLabel(
  ticket: Pick<EventPageTicket, "labelNl" | "labelEn" | "ownTimes" | "startsAt">,
  locale: "nl" | "en",
  index: number,
): string {
  const label = (locale === "en" ? ticket.labelEn?.trim() || ticket.labelNl : ticket.labelNl)?.trim();
  if (label) return label;
  if (ticket.ownTimes) return clock(ticket.startsAt, locale);
  return `Tickets ${index + 1}`;
}

/** "19:00 - 00:00", voor een verkoop met eigen uren. */
export function ticketTimeRange(ticket: { startsAt: Date; endsAt: Date }, locale: "nl" | "en"): string {
  return `${clock(ticket.startsAt, locale)} - ${clock(ticket.endsAt, locale)}`;
}
