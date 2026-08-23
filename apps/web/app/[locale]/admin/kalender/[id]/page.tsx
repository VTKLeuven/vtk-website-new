import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { canCreateTicketEventForGroup } from "@/lib/ticketing/authorization";
import { EventForm } from "../EventForm";
import { EventTicketsPanel } from "../EventTicketsPanel";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale: localeParam, id } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const session = await requireSession();
  const canAll = session.user.isSuperAdmin || hasPermission(session, "calendar.manageAll");

  const event = await prisma.calendarEvent.findUnique({
    where: { id },
    include: {
      categories: { select: { categoryId: true } },
      ticketEvent: {
        select: { id: true, slug: true, status: true, _count: { select: { tickets: true } } },
      },
    },
  });
  if (!event) notFound();
  if (!canAll && !session.groups.some((g) => g.id === event.groupId)) {
    return <p>{locale === "nl" ? "Geen toegang." : "No access."}</p>;
  }

  const groups = canAll
    ? await prisma.group.findMany({ orderBy: { orderInPraesidium: "asc" } })
    : await prisma.group.findMany({
        where: { id: { in: session.groups.map((g) => g.id) } },
        orderBy: { orderInPraesidium: "asc" },
      });
  const categories = await prisma.calendarCategory.findMany({
    select: { id: true, nameNl: true, nameEn: true, colour: true, audience: true },
    orderBy: [{ order: "asc" }, { nameNl: "asc" }],
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">
        {locale === "nl" ? "Evenement bewerken" : "Edit event"}
      </h1>
      <EventForm
        event={{ ...event, categoryIds: event.categories.map((c) => c.categoryId) }}
        groups={groups}
        categories={categories}
        locale={locale}
        canManageCategories={canAll}
      />
      <EventTicketsPanel
        eventId={event.id}
        ticketEvent={
          event.ticketEvent
            ? {
                id: event.ticketEvent.id,
                slug: event.ticketEvent.slug,
                status: event.ticketEvent.status,
                ticketsSold: event.ticketEvent._count.tickets,
              }
            : null
        }
        canCreateTickets={await canCreateTicketEventForGroup(
          session.user.id,
          event.groupId,
          session.user.isSuperAdmin,
        )}
        locale={locale}
      />
    </div>
  );
}
