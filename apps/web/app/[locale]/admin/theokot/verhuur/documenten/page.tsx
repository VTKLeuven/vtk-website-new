import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { RentalAdminPage } from "../RentalAdminPage";

/** Tabblad Documenten: de huurcontracten en de richtlijnen. */
export default async function AdminTheokotRentalsDocumentsPage({
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
  return <RentalAdminPage locale={locale} jaar={jaar} tab="documenten" path={`${base}/documenten`} />;
}
