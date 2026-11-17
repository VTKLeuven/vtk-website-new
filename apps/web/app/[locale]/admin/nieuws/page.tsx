import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { NewsAdminPage } from "./NewsAdminPage";

/** Tabblad Op de homepage: wat er nu in de nieuwsband staat, uitgelicht of verborgen. */
export default async function AdminNews({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return <NewsAdminPage locale={locale} section="homepage" />;
}
