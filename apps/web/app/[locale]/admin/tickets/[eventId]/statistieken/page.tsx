import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { loadTicketStats } from "@/lib/ticketing/stats";
import { TicketStatsView } from "@/components/ticketing/admin/TicketStatsView";
import { SourceLinkBuilder } from "@/components/ticketing/admin/SourceLinkBuilder";
import type { AdminLocale } from "@/components/ticketing/admin/format";

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

  return (
    <div className="ticket-admin-page">
      <TicketStatsView
        stats={stats}
        locale={locale}
        mode="event"
        linkBuilder={<SourceLinkBuilder slug={event.slug} locale={locale} />}
      />
    </div>
  );
}
