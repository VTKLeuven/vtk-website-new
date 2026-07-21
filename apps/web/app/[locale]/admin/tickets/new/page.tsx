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
import { TicketEventForm } from "@/components/ticketing/admin/TicketEventForm";
import { ticketBase, type AdminLocale } from "@/components/ticketing/admin/format";

export default async function NewTicketEventPage({
  params,
}: {
  params: Promise<{ locale: string }>;
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
  const allowed = await Promise.all(allGroups.map(async (group) => ({
    group,
    allowed: preview
      ? canSessionCreateTicketEventForGroup(session, group.id)
      : await canCreateTicketEventForGroup(session.user.id, group.id, session.user.isSuperAdmin),
  })));
  const groups = canManageAll
    ? allGroups
    : allowed.filter((entry) => entry.allowed).map((entry) => entry.group);
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
  const base = ticketBase(locale);

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
              ? "Maak de verkoopomgeving aan. Tickettypes voeg je daarna toe."
              : "Create the sales environment. Ticket types are added afterwards."}
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
        <TicketEventForm
          groups={groups}
          calendarEvents={calendarEvents}
          locale={locale}
        />
      )}
    </div>
  );
}
