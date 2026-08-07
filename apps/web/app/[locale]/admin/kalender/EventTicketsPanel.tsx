import Link from "next/link";
import { Card } from "@vtk/ui";

type LinkedTicketEvent = {
  id: string;
  slug: string;
  status: string;
  ticketsSold: number;
};

const STATUS_LABELS: Record<string, { nl: string; en: string }> = {
  DRAFT: { nl: "Concept", en: "Draft" },
  PUBLISHED: { nl: "Gepubliceerd", en: "Published" },
  CLOSED: { nl: "Gesloten", en: "Closed" },
  ARCHIVED: { nl: "Gearchiveerd", en: "Archived" },
};

/**
 * Het ticketblok op de bewerkpagina van een kalenderevent. Zonder dit blok moest
 * je na het inplannen apart naar het ticketbeheer om daar hetzelfde evenement
 * nog eens op te zoeken en zijn titel, datums en locatie over te tikken.
 *
 * Is er nog geen ticketevent, dan staat hier één knop die het formulier opent met
 * dit evenement al gekoppeld. Bestaat het al, dan zie je de status en spring je
 * er rechtstreeks naartoe.
 */
export function EventTicketsPanel({
  eventId,
  ticketEvent,
  canCreateTickets,
  locale,
}: {
  eventId: string;
  ticketEvent: LinkedTicketEvent | null;
  canCreateTickets: boolean;
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";

  return (
    <Card className="space-y-3 p-5">
      <div>
        <h2 className="font-semibold">{nl ? "Tickets" : "Tickets"}</h2>
        <p className="mt-1 text-sm text-vtk-blue-muted">
          {ticketEvent
            ? nl
              ? "Titel, beschrijving, locatie en datums van de ticketverkoop volgen dit evenement; je past ze hier aan."
              : "The ticket sale's title, description, location and dates follow this event; you edit them here."
            : nl
              ? "Er worden nog geen tickets verkocht voor dit evenement."
              : "No tickets are being sold for this event yet."}
        </p>
      </div>

      {ticketEvent ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="rounded-full border border-vtk-blue/20 px-3 py-1">
            {STATUS_LABELS[ticketEvent.status]?.[nl ? "nl" : "en"] ?? ticketEvent.status}
          </span>
          <span className="text-vtk-blue-muted">
            {ticketEvent.ticketsSold} {nl ? "tickets verkocht" : "tickets sold"}
          </span>
          <Link
            href={`${base}/admin/tickets/${ticketEvent.id}`}
            className="font-medium text-vtk-ink underline"
          >
            {nl ? "Naar het ticketbeheer" : "Go to ticket management"}
          </Link>
        </div>
      ) : canCreateTickets ? (
        <Link
          href={`${base}/admin/tickets/new?calendarEvent=${eventId}`}
          className="inline-flex h-10 items-center justify-center rounded-full bg-vtk-ink px-5 text-sm font-medium text-white transition-colors hover:bg-vtk-blue"
        >
          {nl ? "Tickets verkopen voor dit evenement" : "Sell tickets for this event"}
        </Link>
      ) : (
        <p className="text-sm text-vtk-blue-muted">
          {nl
            ? "Je hebt geen rechten om ticketverkoop op te zetten voor deze post."
            : "You do not have permission to set up ticket sales for this group."}
        </p>
      )}
    </Card>
  );
}
