import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";

/** Oude bookmarks blijven werken; het beheer staat nu voor alle posten samen. */
export default async function LegacyTheokotOpeningHoursPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  redirect(`${locale === "nl" ? "" : "/en"}/admin/openingsuren`);
}
