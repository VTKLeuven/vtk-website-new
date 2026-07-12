import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { EventAdminNav } from "@/components/ticketing/admin/EventAdminNav";

export default async function TicketEventAdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string; eventId: string }>;
}) {
  const { locale, eventId } = await params;
  if (!hasLocale(locale)) notFound();
  const { event, capabilities } = await requireTicketEventCapability(eventId, "VIEW_EVENT");

  return (
    <div className="ticket-admin-event">
      <EventAdminNav event={event} capabilities={capabilities} locale={locale} />
      {children}
    </div>
  );
}
