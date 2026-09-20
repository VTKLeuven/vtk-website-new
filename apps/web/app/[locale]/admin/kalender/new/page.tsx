import { prisma } from "@vtk/db";
import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireSession } from "@/lib/session";
import { hasPermission } from "@vtk/auth";
import type { Locale } from "@vtk/i18n";
import { canCreateTicketEventForGroup } from "@/lib/ticketing/authorization";
import { getDefaultEventImage } from "@/lib/defaultEventImage";
import { publicUrl } from "@/lib/storage";
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
  // Het weekoverzicht op de homepage staat los van het beheer van het evenement
  // zelf; zie packages/db/src/permissions.ts.
  const canHeroWeek = session.user.isSuperAdmin || hasPermission(session, "calendar.heroWeek");
  if (!canAll && !hasPermission(session, "calendar.create")) {
    return <p>{locale === "nl" ? "Geen toegang." : "No access."}</p>;
  }
  const groups = canAll
    ? await prisma.group.findMany({ orderBy: { orderInPraesidium: "asc" } })
    : await prisma.group.findMany({
        where: { id: { in: session.groups.map((g) => g.id) } },
        orderBy: { orderInPraesidium: "asc" },
      });
  const [categoryRows, siteDefaultImage] = await Promise.all([
    prisma.calendarCategory.findMany({
      select: { id: true, nameNl: true, nameEn: true, colour: true, audience: true, imageKey: true },
      orderBy: [{ order: "asc" }, { nameNl: "asc" }],
    }),
    // De preview van de affiche toont de foto die dit evenement zonder upload
    // krijgt: die van zijn thema, en anders deze.
    getDefaultEventImage(),
  ]);
  const categories = categoryRows.map(({ imageKey, ...category }) => ({
    ...category,
    bannerUrl: publicUrl(imageKey),
  }));

  // Ticketevents aanmaken is een eigen permissie: wie enkel mag inplannen, krijgt
  // de doorstuurknop niet te zien.
  const canCreateTickets = (
    await Promise.all(
      groups.map((g) =>
        canCreateTicketEventForGroup(session.user.id, g.id, session.user.isSuperAdmin),
      ),
    )
  ).some(Boolean);

  // Geen <h1> hier: de titel staat in de meescrollende kop van het formulier,
  // samen met de status en de opslagknoppen.
  return (
    <div className="space-y-4">
      <EventForm
        event={{}}
        groups={groups}
        categories={categories}
        locale={locale}
        siteDefaultImage={siteDefaultImage}
        canCreateTickets={canCreateTickets}
        canManageCategories={canAll}
        canHeroWeek={canHeroWeek}
      />
    </div>
  );
}
