import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { HomeAdminPage } from "../HomeAdminPage";

/** Tabblad Wat we doen: de kaarten met de werkingen. */
export default async function AdminHomeOffer({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return <HomeAdminPage locale={locale} section="aanbod" />;
}
