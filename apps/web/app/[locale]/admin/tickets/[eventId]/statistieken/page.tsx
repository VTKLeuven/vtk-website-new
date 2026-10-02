import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { loadTicketStats } from "@/lib/ticketing/stats";
import { TicketStatsView } from "@/components/ticketing/admin/TicketStatsView";
import { SourceLinkBuilder } from "@/components/ticketing/admin/SourceLinkBuilder";
import type { AdminLocale } from "@/components/ticketing/admin/format";
import { privateLinkPath } from "@/lib/ticketing/shopPath";

export default async function TicketEventStatsPage({
  params,
}: {
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale: localeParam, eventId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const locale: AdminLocale = localeParam;
  const { event, capabilities } = await requireTicketEventCapability(eventId, "VIEW_REPORTS");
  // De toegang van dit ene event, in dezelfde vorm als de selectiepagina.
  const stats = await loadTicketStats(
    [eventId],
    { all: false, events: new Map([[eventId, { finance: capabilities.includes("VIEW_FINANCE") }]]) },
    locale,
  );

  // Een privé-event is enkel via de privélink te openen, dus de deelbare link
  // bouwt daarop verder. Die link is de toegang zelf: wie het event niet beheert
  // en enkel de statistieken leest, krijgt hier geen linkbouwer.
  const sharePath = !event.isPrivate
    ? `/tickets/${event.slug}`
    : capabilities.includes("MANAGE_EVENT") && event.privateToken
      ? privateLinkPath(event.slug, event.privateToken)
      : null;

  return (
    <div className="ticket-admin-page">
      <TicketStatsView
        stats={stats}
        locale={locale}
        mode="event"
        linkBuilder={sharePath ? <SourceLinkBuilder path={sharePath} locale={locale} /> : null}
      />
    </div>
  );
}
