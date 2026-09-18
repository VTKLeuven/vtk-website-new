import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrderForViewer } from "@/lib/ticketing/queries";
import { paymentMethodChoice } from "@/lib/ticketing/paymentMethods";
import { hasLocale } from "@/lib/locale";
import { staticMetadata } from "@/lib/pageMetadata";
import { OrderStatus } from "@/components/ticketing/public/OrderStatus";
import type { PublicOrder } from "@/components/ticketing/public/types";

import "@/app/design/vtk-event.css";
import "@/app/design/vtk-tickets.css";
import "@/app/design/vtk-ticket-shop.css";

type Params = Promise<{ locale: string; orderId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, orderId } = await params;
  if (!hasLocale(locale)) return {};
  // Een bestelling is van één persoon: nooit indexeren, en de titel zegt bewust
  // niets over het event of de koper.
  return staticMetadata("ticketOrder", `/tickets/bestelling/${orderId}`, locale, {
    noIndex: true,
  });
}

export default async function TicketOrderPage({ params }: { params: Params }) {
  const { locale: localeParam, orderId } = await params;
  if (!hasLocale(localeParam)) notFound();
  const order = (await getOrderForViewer(orderId)) as PublicOrder | null;
  if (!order) notFound();

  // Dezelfde schil als /tickets en /tickets/[slug]: de kop en de kolommen zitten
  // in OrderStatus, want ze veranderen mee met de status van de bestelling.
  return (
    <div className="vtk-page vtk-tickets-page">
      <OrderStatus
        initialOrder={order}
        locale={localeParam}
        paymentChoice={paymentMethodChoice(localeParam)}
      />
    </div>
  );
}
