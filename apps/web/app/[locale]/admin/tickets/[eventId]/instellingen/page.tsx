import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { ListChecks, Package, Settings2 } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { TicketEventForm } from "@/components/ticketing/admin/TicketEventForm";
import { TicketTypeManager } from "@/components/ticketing/admin/TicketTypeManager";
import { TicketQuestionManager } from "@/components/ticketing/admin/TicketQuestionManager";
import type { AdminLocale } from "@/components/ticketing/admin/format";

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
      <nav className="ticket-admin-subnav" aria-label={locale === "nl" ? "Instellingsonderdelen" : "Settings sections"}>
        {canManageEvent ? <a href="#event-instellingen"><Settings2 aria-hidden="true" size={15} />{locale === "nl" ? "Event" : "Event"}</a> : null}
        {canManageInventory ? <a href="#ticket-aanbod"><Package aria-hidden="true" size={15} />{locale === "nl" ? "Aanbod" : "Inventory"}</a> : null}
        {canManageEvent ? <a href="#deelnemersvragen"><ListChecks aria-hidden="true" size={15} />{locale === "nl" ? "Vragen" : "Questions"}</a> : null}
      </nav>
      {canManageEvent ? (
        <div id="event-instellingen" className="ticket-admin-anchor-section">
          <TicketEventForm event={event} groups={groups} calendarEvents={calendarEvents} locale={locale} />
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
        <div id="deelnemersvragen" className="ticket-admin-anchor-section">
          <TicketQuestionManager
            eventId={eventId}
            questions={event.questions}
            ticketTypes={event.ticketTypes}
            locale={locale}
          />
        </div>
      ) : null}
    </div>
  );
}
