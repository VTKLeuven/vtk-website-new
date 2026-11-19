import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { RentalAdminPage } from "./RentalAdminPage";

/** Tabblad Aanvragen: wat nog een antwoord of een afronding vraagt. */
export default async function AdminTheokotRentalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ tab?: string; jaar?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  const base = `${locale === "nl" ? "" : "/en"}/admin/theokot/verhuur`;
  const { tab, jaar } = await searchParams;
  // De tabbladen waren eerst `?tab=...`; een bladwijzer van toen komt nog aan.
  if (tab && ["verwerkt", "kalender", "instellingen"].includes(tab)) {
    redirect(`${base}/${tab}${jaar ? `?jaar=${jaar}` : ""}`);
  }
  return <RentalAdminPage locale={locale} jaar={jaar} tab="aanvragen" path={base} />;
}
