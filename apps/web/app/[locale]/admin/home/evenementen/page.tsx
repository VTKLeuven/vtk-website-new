import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { HomeAdminPage } from "../HomeAdminPage";

/** Tabblad Evenementen: de foto van een evenement zonder eigen foto. */
export default async function AdminHomeEvents({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return <HomeAdminPage locale={locale} section="evenementen" />;
}
