import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { canCreateTicketEventForGroup } from "@/lib/ticketing/authorization";
import { EventForm } from "../EventForm";

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale: localeParam } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: Locale = localeParam;
  const session = await requireSession();
  const canAll = session.user.isSuperAdmin || hasPermission(session, "calendar.manageAll");
  if (!canAll && !hasPermission(session, "calendar.create")) {
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

  // Ticketevents aanmaken is een eigen permissie: wie enkel mag inplannen, krijgt
  // de doorstuurknop niet te zien.
  const canCreateTickets = (
    await Promise.all(
      groups.map((g) =>
        canCreateTicketEventForGroup(session.user.id, g.id, session.user.isSuperAdmin),
      ),
    )
  ).some(Boolean);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{locale === "nl" ? "Nieuw evenement" : "New event"}</h1>
      <EventForm
        event={{}}
        groups={groups}
        categories={categories}
        locale={locale}
        canCreateTickets={canCreateTickets}
        canManageCategories={canAll}
      />
    </div>
  );
}
