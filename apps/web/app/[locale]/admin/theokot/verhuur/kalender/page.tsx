import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { RentalAdminPage } from "../RentalAdminPage";

/** Tabblad Kalender: dezelfde aanvragen per maand. */
export default async function AdminTheokotRentalsCalendarPage({
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
  return <RentalAdminPage locale={locale} jaar={jaar} tab="kalender" path={`${base}/kalender`} />;
}
