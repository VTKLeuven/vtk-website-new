import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Palette } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { TicketEventForm } from "@/components/ticketing/admin/TicketEventForm";
import { TicketPublishBar } from "@/components/ticketing/admin/TicketPublishBar";
import { TicketTypeManager } from "@/components/ticketing/admin/TicketTypeManager";
import { TicketQuestionManager } from "@/components/ticketing/admin/TicketQuestionManager";
import { TicketDesignManager } from "@/components/ticketing/admin/TicketDesignManager";
import type { AdminLocale } from "@/components/ticketing/admin/format";
import { readTicketDesignSettings } from "@/lib/ticketing/design";

export default async function TicketEventSettingsPage({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale: localeParam, eventId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const { session, capabilities } = await requireTicketEventCapability(eventId, "VIEW_EVENT");
  const canManageEvent = capabilities.includes("MANAGE_EVENT");
  const canManageInventory = capabilities.includes("MANAGE_INVENTORY");
  if (!canManageEvent && !canManageInventory) throw new Error("FORBIDDEN");
  const canManageAll =
    session.user.isSuperAdmin || session.permissions.includes("tickets.manageAll");

  const event = await prisma.ticketEvent.findUnique({
    where: { id: eventId },
    include: {
      inventoryPools: { orderBy: { createdAt: "asc" } },
      ticketTypes: {
        include: { inventoryPool: true, _count: { select: { orderItems: true } } },
        orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      },
      questions: {
        include: { ticketType: true },
        orderBy: [{ active: "desc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
  });
  if (!event) notFound();
  const groups = canManageEvent
    ? canManageAll
      ? await prisma.group.findMany({ orderBy: { orderInPraesidium: "asc" } })
      : await prisma.group.findMany({ where: { id: event.ownerGroupId } })
    : [];
  const calendarEvents = canManageEvent
    ? await prisma.calendarEvent.findMany({
        where: {
          groupId: { in: groups.map((group) => group.id) },
          OR: event.calendarEventId
            ? [{ ticketEvent: null }, { id: event.calendarEventId }]
            : [{ ticketEvent: null }],
        },
        orderBy: { start: "desc" },
        take: 100,
      })
    : [];
  const ticketDesign = readTicketDesignSettings(event.settings, eventId);

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-page-head">
        <div>
          <h1>{locale === "nl" ? "Instellingen" : "Settings"}</h1>
          <p>
            {locale === "nl"
              ? "Beheer de ticketshop, voorraad en informatie die je van deelnemers nodig hebt."
              : "Manage the ticket shop, inventory and attendee information."}
          </p>
        </div>
      </div>
      {canManageEvent ? (
        <div id="event-instellingen" className="ticket-admin-anchor-section">
          <TicketPublishBar
            eventId={event.id}
            status={event.status}
            slug={event.slug}
            hasActiveTicketType={event.ticketTypes.some((ticketType) => ticketType.active)}
            locale={locale}
          />
          <TicketEventForm
            event={event}
            groups={groups}
            calendarEvents={calendarEvents}
            linkedCalendarEvent={
              calendarEvents.find((candidate) => candidate.id === event.calendarEventId) ?? null
            }
            hasActiveTicketType={event.ticketTypes.some((ticketType) => ticketType.active)}
            locale={locale}
          />
        </div>
      ) : null}
      {canManageInventory ? (
        <div id="ticket-aanbod" className="ticket-admin-anchor-section">
          <TicketTypeManager
            eventId={eventId}
            pools={event.inventoryPools}
            ticketTypes={event.ticketTypes}
            currency={event.currency}
            locale={locale}
          />
        </div>
      ) : null}
      {canManageEvent ? (
        <details id="deelnemersvragen" className="ticket-admin-settings-disclosure">
          <summary>{locale === "nl" ? "Vragen aan deelnemers" : "Attendee questions"}<small>{event.questions.filter((question) => question.active).length} {locale === "nl" ? "vragen · optioneel" : "questions · optional"}</small></summary>
          <div className="ticket-admin-settings-content">
          <TicketQuestionManager
            eventId={eventId}
            questions={event.questions}
            ticketTypes={event.ticketTypes}
            locale={locale}
          />
          </div>
        </details>
      ) : null}
      {canManageEvent ? (
        <details id="ticketontwerp" className="ticket-admin-settings-disclosure">
          <summary><Palette size={18} aria-hidden="true" />{locale === "nl" ? "Ticketontwerp" : "Ticket design"}<small>{locale === "nl" ? "Optioneel · het standaardontwerp staat klaar" : "Optional · the default design is ready"}</small></summary>
          <div className="ticket-admin-settings-content">
          <TicketDesignManager
            eventId={eventId}
            initialDraft={ticketDesign.draft ?? ticketDesign.published}
            publishedRevision={ticketDesign.published?.revision}
            locale={locale}
          />
          </div>
        </details>
      ) : null}
    </div>
  );
}
