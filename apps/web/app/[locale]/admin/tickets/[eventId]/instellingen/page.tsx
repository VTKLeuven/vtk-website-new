import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { Link2, Palette } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { TicketEventForm } from "@/components/ticketing/admin/TicketEventForm";
import { TicketPublishBar } from "@/components/ticketing/admin/TicketPublishBar";
import { TicketTypeManager } from "@/components/ticketing/admin/TicketTypeManager";
import { TicketQuestionManager } from "@/components/ticketing/admin/TicketQuestionManager";
import { TicketDesignManager } from "@/components/ticketing/admin/TicketDesignManager";
import { SettingsPanel } from "@/components/ticketing/admin/SettingsPanel";
import { SaveAsTemplateCard } from "@/components/ticketing/admin/SaveAsTemplateCard";
import { PresaleLinkPanel } from "@/components/ticketing/admin/PresaleLinkPanel";
import { hasPresale } from "@/lib/ticketing/presale";
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
  const canManageTemplates =
    session.user.isSuperAdmin || session.permissions.includes("tickets.templates");

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
      presaleGroups: { select: { groupId: true } },
    },
  });
  if (!event) notFound();
  const groups = canManageEvent
    ? canManageAll
      ? await prisma.group.findMany({ orderBy: { orderInPraesidium: "asc" } })
      : await prisma.group.findMany({ where: { id: event.ownerGroupId } })
    : [];
  // Voor de voorverkoop mag elke actieve groep gekozen worden: dat geeft geen
  // toegang tot het beheer, enkel het recht om vroeger te kopen. Daarom staat
  // deze lijst los van `groups`, die de verantwoordelijke groep bepaalt.
  const presaleGroups = canManageEvent
    ? await prisma.group.findMany({
        where: { active: true },
        select: { id: true, nameNl: true, nameEn: true, type: true },
        orderBy: [{ type: "asc" }, { orderInPraesidium: "asc" }, { nameNl: "asc" }],
      })
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
            event={{
              ...event,
              presaleGroupIds: event.presaleGroups.map((group) => group.groupId),
            }}
            groups={groups}
            presaleGroups={presaleGroups}
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
        <SettingsPanel
          id="voorverkooplink"
          title={locale === "nl" ? "Private voorverkooplink" : "Private presale link"}
          status={
            event.presaleToken
              ? locale === "nl"
                ? "Er staat een link klaar"
                : "A link is ready"
              : locale === "nl"
                ? "Optioneel · nog geen link"
                : "Optional · no link yet"
          }
          icon={<Link2 size={18} aria-hidden="true" />}
        >
          <PresaleLinkPanel
            eventId={eventId}
            slug={event.slug}
            token={event.presaleToken}
            hasPresale={hasPresale(event)}
            locale={locale}
          />
        </SettingsPanel>
      ) : null}
      {canManageEvent ? (
        <SettingsPanel
          id="deelnemersvragen"
          title={locale === "nl" ? "Vragen aan deelnemers" : "Attendee questions"}
          status={`${event.questions.filter((question) => question.active).length} ${locale === "nl" ? "vragen · optioneel" : "questions · optional"}`}
        >
          <TicketQuestionManager
            eventId={eventId}
            questions={event.questions}
            ticketTypes={event.ticketTypes}
            locale={locale}
          />
        </SettingsPanel>
      ) : null}
      {canManageEvent ? (
        <SettingsPanel
          id="ticketontwerp"
          title={locale === "nl" ? "Ticketontwerp" : "Ticket design"}
          status={locale === "nl" ? "Optioneel · het standaardontwerp staat klaar" : "Optional · the default design is ready"}
          icon={<Palette size={18} aria-hidden="true" />}
        >
          <TicketDesignManager
            eventId={eventId}
            initialDraft={ticketDesign.draft ?? ticketDesign.published}
            publishedRevision={ticketDesign.published?.revision}
            locale={locale}
          />
        </SettingsPanel>
      ) : null}
      {/* Onderaan: dit gaat niet over de instellingen van dit event, maar over
          het volgende. */}
      {canManageEvent && canManageTemplates ? (
        <SaveAsTemplateCard
          eventId={event.id}
          eventTitle={event.titleNl}
          ticketTypeCount={event.ticketTypes.filter((ticketType) => ticketType.active).length}
          questionCount={event.questions.filter((question) => question.active).length}
          locale={locale}
        />
      ) : null}
    </div>
  );
}
