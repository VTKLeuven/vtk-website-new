import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requireTicketEventCapability } from "@/lib/ticketing/authorization";
import { adminShopLink } from "@/lib/ticketing/shopPath";
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
      {/* Enkel wat de navigatie toont: dit is een clientcomponent, dus alles wat
          hier meegaat staat in de pagina, en het volledige event droeg de
          voorverkoop- en privélink mee naar iedereen met leesrechten. */}
      <EventAdminNav
        event={{
          id: event.id,
          titleNl: event.titleNl,
          titleEn: event.titleEn,
          status: event.status,
          isPrivate: event.isPrivate,
        }}
        shopLink={adminShopLink(event, capabilities.includes("MANAGE_EVENT"))}
        capabilities={capabilities}
        locale={locale}
      />
      {children}
    </div>
  );
}
