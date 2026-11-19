import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { NewsAdminPage } from "../NewsAdminPage";

/** Tabblad Instellingen: de band zelf en welke bronnen er vanzelf in komen. */
export default async function AdminNewsSettings({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return <NewsAdminPage locale={locale} section="instellingen" />;
}
