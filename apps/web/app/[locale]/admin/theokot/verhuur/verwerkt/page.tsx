import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { RentalAdminPage } from "../RentalAdminPage";

/** Tabblad Verwerkt: wat goedgekeurd, geweigerd of afgerond is. */
export default async function AdminTheokotRentalsProcessedPage({
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
  return <RentalAdminPage locale={locale} jaar={jaar} tab="verwerkt" path={`${base}/verwerkt`} />;
}
