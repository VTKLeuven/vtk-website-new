import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { HomeAdminPage } from "../HomeAdminPage";

/** Tabblad Openingsuren: de weergave op de homepage en de uren van Cursusdienst en Theokot. */
export default async function AdminHomeHours({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return <HomeAdminPage locale={locale} section="openingsuren" />;
}
