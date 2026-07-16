import { notFound } from "next/navigation";
import { AccessExchange } from "@/components/ticketing/public/AccessExchange";
import { hasLocale } from "@/lib/locale";

import "@/app/design/vtk-tickets.css";

export default async function TicketAccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return <AccessExchange locale={locale} />;
}
