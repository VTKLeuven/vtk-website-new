import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { NewsAdminPage } from "../NewsAdminPage";

/** Tabblad Berichten: de mededelingen en woordjes die hier geschreven werden. */
export default async function AdminNewsPosts({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  return <NewsAdminPage locale={locale} section="berichten" />;
}
