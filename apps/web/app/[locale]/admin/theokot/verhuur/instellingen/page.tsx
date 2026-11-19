import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { RentalAdminPage } from "../RentalAdminPage";

/** Tabblad Instellingen: de zaal, de agendafeed en de vragen op het formulier. */
export default async function AdminTheokotRentalsSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ jaar?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const base = `${locale === "nl" ? "" : "/en"}/admin/theokot/verhuur`;
  const { jaar } = await searchParams;
  return <RentalAdminPage locale={locale} jaar={jaar} tab="instellingen" path={`${base}/instellingen`} />;
}
