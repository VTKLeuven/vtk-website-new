import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { HomeAdminPage } from "../HomeAdminPage";

/** Tabblad Banden: de POC-band en de shiften-band. */
export default async function AdminHomeBands({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return <HomeAdminPage locale={locale} section="banden" />;
}
