import Link from "@/components/ui/Link";
import { Card } from "@vtk/ui";

type LinkedTicketEvent = {
  id: string;
  slug: string;
  status: string;
  /** De tickets staan op de eventpagina zelf; zie `TicketEvent.onEventPage`. */
  onEventPage: boolean;
  /** De naam van deze verkoop op de eventpagina, als er een is. */
  label: string | null;
  ticketsSold: number;
};

const STATUS_LABELS: Record<string, { nl: string; en: string }> = {
  DRAFT: { nl: "Concept", en: "Draft" },
  PUBLISHED: { nl: "Gepubliceerd", en: "Published" },
  SALES_PAUSED: { nl: "Verkoop gepauzeerd", en: "Sales paused" },
  SALES_CLOSED: { nl: "Verkoop gesloten", en: "Sales closed" },
  CANCELLED: { nl: "Geannuleerd", en: "Cancelled" },
  ARCHIVED: { nl: "Gearchiveerd", en: "Archived" },
};

/**
 * Het ticketblok op de bewerkpagina van een kalenderevent. Zonder dit blok moest
 * je na het inplannen apart naar het ticketbeheer om daar hetzelfde evenement
 * nog eens op te zoeken en zijn titel, datums en locatie over te tikken.
 *
 * Een evenement kan meerdere ticketpagina's hebben (de volledige 12u naast de
 * losse cantussen, een eerstejaarsuur vooraf, de waves van Galabal). Elke
 * verkoop staat hier met haar status en waar ze te koop staat, en de knop
 * eronder maakt er nog een aan met dit evenement al gekoppeld.
 */
export function EventTicketsPanel({
  eventId,
  ticketEvents,
  canCreateTickets,
  locale,
}: {
  eventId: string;
  ticketEvents: LinkedTicketEvent[];
  canCreateTickets: boolean;
  locale: "nl" | "en";
}) {
  const nl = locale === "nl";
  const base = nl ? "" : "/en";
  const hasTickets = ticketEvents.length > 0;

  return (
    <Card className="space-y-3 p-5">
      <div>
        <h2 className="font-semibold">Tickets</h2>
        <p className="mt-1 text-sm text-vtk-blue-muted">
          {hasTickets
            ? nl
              ? "Titel, beschrijving en locatie van de ticketverkoop volgen dit evenement; je past ze hier aan. De uren ook, tenzij een verkoop eigen uren heeft."
              : "The ticket sale's title, description and location follow this event; you edit them here. The times too, unless a sale has its own times."
            : nl
              ? "Er worden nog geen tickets verkocht voor dit evenement."
              : "No tickets are being sold for this event yet."}
        </p>
      </div>

      {hasTickets ? (
        <table className="w-full text-sm">
          <thead className="text-left text-vtk-blue-muted">
            <tr>
              <th className="py-1 pr-3 font-medium">{nl ? "Ticketpagina" : "Ticket page"}</th>
              <th className="py-1 pr-3 font-medium">{nl ? "Te koop op" : "Sold on"}</th>
              <th className="py-1 pr-3 font-medium">Status</th>
              <th className="py-1 text-right font-medium">{nl ? "Verkocht" : "Sold"}</th>
            </tr>
          </thead>
          <tbody>
            {ticketEvents.map((ticketEvent) => (
              <tr key={ticketEvent.id} className="border-t border-vtk-blue/10">
                <td className="py-2 pr-3">
                  <Link
                    href={`${base}/admin/tickets/${ticketEvent.id}`}
                    className="font-medium text-vtk-ink underline"
                  >
                    {ticketEvent.label || `/${ticketEvent.slug}`}
                  </Link>
                </td>
                <td className="py-2 pr-3">
                  {ticketEvent.onEventPage
                    ? nl
                      ? "De eventpagina"
                      : "The event page"
                    : nl
                      ? "Een eigen ticketpagina"
                      : "Its own ticket page"}
                </td>
                <td className="py-2 pr-3">
                  <span className="rounded-full border border-vtk-blue/20 px-3 py-1">
                    {STATUS_LABELS[ticketEvent.status]?.[nl ? "nl" : "en"] ?? ticketEvent.status}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{ticketEvent.ticketsSold}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {canCreateTickets ? (
        <Link
          href={`${base}/admin/tickets/new?calendarEvent=${eventId}`}
          className={
            hasTickets
              ? "inline-flex h-10 items-center justify-center rounded-full border border-vtk-blue/20 px-5 text-sm font-medium text-vtk-ink transition-colors hover:bg-vtk-blue-soft"
              : "inline-flex h-10 items-center justify-center rounded-full bg-vtk-ink px-5 text-sm font-medium text-white transition-colors hover:bg-vtk-blue"
          }
        >
          {hasTickets
            ? nl
              ? "Nog een ticketpagina toevoegen"
              : "Add another ticket page"
            : nl
              ? "Tickets verkopen voor dit evenement"
              : "Sell tickets for this event"}
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
