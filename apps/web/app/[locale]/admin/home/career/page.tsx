import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { HomeAdminPage } from "../HomeAdminPage";

/** Tabblad Career & media: de VTK Career-band en de aftermovies. */
export default async function AdminHomeCareer({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return <HomeAdminPage locale={locale} section="career" />;
}
