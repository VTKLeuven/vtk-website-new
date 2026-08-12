import type { Metadata } from "next";
import { staticMetadata } from "@/lib/pageMetadata";
import { notFound } from "next/navigation";
import { AccessExchange } from "@/components/ticketing/public/AccessExchange";
import { hasLocale } from "@/lib/locale";

import "@/app/design/vtk-tickets.css";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(locale)) return {};
  return staticMetadata("ticketAccess", "/tickets/toegang", locale, { noIndex: true });
}

export default async function TicketAccessPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return <AccessExchange locale={locale} />;
}
