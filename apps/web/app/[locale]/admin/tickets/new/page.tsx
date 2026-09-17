import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@vtk/db";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { hasLocale } from "@/lib/locale";
import { getAuthorizationPreview, requireSession } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import {
  canCreateTicketEventForGroup,
  canSessionCreateTicketEventForGroup,
  hasLiveTicketManageAll,
} from "@/lib/ticketing/authorization";
import { slugify } from "@/lib/ticketing/slug";
import { TicketEventCreate } from "@/components/ticketing/admin/TicketEventCreate";
import { listTicketEventTemplates } from "@/lib/ticketing/templateStore";
import { utcToLocalDateTime } from "@/lib/ticketing/time";
import { ticketBase, type AdminLocale } from "@/components/ticketing/admin/format";

export default async function NewTicketEventPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ calendarEvent?: string; sjabloon?: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const session = await requireSession();
  const preview = await getAuthorizationPreview();
  const canManageAll = preview
    ? hasPermission(session, "tickets.manageAll")
    : await hasLiveTicketManageAll(session.user.id, session.user.isSuperAdmin);

  const allGroups = canManageAll
    ? await prisma.group.findMany({ orderBy: { orderInPraesidium: "asc" } })
    : await prisma.group.findMany({
        where: { id: { in: session.groups.map((group) => group.id) } },
        orderBy: { orderInPraesidium: "asc" },
      });
  // Enkel wanneer de keuze beperkt is: wie alles beheert, krijgt elke post, en
  // dan hoefde die check per post niet gedaan (en weggegooid) te worden.
  const groups = canManageAll
    ? allGroups
    : (
        await Promise.all(
          allGroups.map(async (group) => ({
            group,
            allowed: preview
              ? canSessionCreateTicketEventForGroup(session, group.id)
              : await canCreateTicketEventForGroup(session.user.id, group.id, session.user.isSuperAdmin),
          })),
        )
      )
        .filter((entry) => entry.allowed)
        .map((entry) => entry.group);
  const calendarEvents = groups.length
    ? await prisma.calendarEvent.findMany({
        where: {
          groupId: { in: groups.map((group) => group.id) },
          ticketEvent: null,
        },
        orderBy: { start: "desc" },
        take: 100,
      })
    : [];
  // Kwam je hier via "Tickets verkopen voor dit evenement", dan is het
  // kalenderevent al gekozen en erft dit ticketevent er zijn gegevens van.
  const query = await searchParams;
  const requestedCalendarEventId = query.calendarEvent;
  const linkedCalendarEvent = requestedCalendarEventId
    ? (calendarEvents.find((e) => e.id === requestedCalendarEventId) ?? null)
    : null;
  const base = ticketBase(locale);
  const templates = await listTicketEventTemplates();
  const canManageTemplates = hasPermission(session, "tickets.templates");

  return (
    <div className="ticket-admin-page">
      <div className="ticket-admin-page-head">
        <div>
          <Link className="ticket-admin-back" href={`${base}/admin/tickets`}>
            <ArrowLeft aria-hidden="true" size={14} />
            {locale === "nl" ? "Ticketbeheer" : "Ticket management"}
          </Link>
          <h1>{locale === "nl" ? "Nieuw ticketevent" : "New ticket event"}</h1>
          <p>
            {locale === "nl"
              ? "Maak de verkoopomgeving aan. Kies een sjabloon voor een evenement dat terugkomt, of begin met een leeg formulier."
              : "Create the sales environment. Pick a template for a recurring event, or start from an empty form."}
          </p>
        </div>
      </div>
      {groups.length === 0 ? (
        <div className="ticket-admin-alert" data-tone="danger">
          <ShieldAlert aria-hidden="true" size={18} />
          <span>
            {locale === "nl"
              ? "Je hebt voor geen enkele groep toestemming om een ticketevent aan te maken."
              : "You do not have permission to create a ticket event for any group."}
          </span>
        </div>
      ) : (
        <TicketEventCreate
          templates={templates}
          initialTemplateSlug={
            query.sjabloon && templates.some((template) => template.slug === query.sjabloon)
              ? query.sjabloon
              : null
          }
          today={utcToLocalDateTime(new Date()).slice(0, 10)}
          groups={groups}
          calendarEvents={calendarEvents}
          linkedCalendarEvent={linkedCalendarEvent}
          baseEvent={
            linkedCalendarEvent
              ? { ownerGroupId: linkedCalendarEvent.groupId, slug: slugify(linkedCalendarEvent.titleNl) }
              : undefined
          }
          canManageTemplates={canManageTemplates}
          locale={locale}
        />
      )}
    </div>
  );
}
