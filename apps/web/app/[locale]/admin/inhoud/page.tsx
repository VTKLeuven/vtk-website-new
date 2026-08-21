import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";

/**
 * /admin/inhoud is hernoemd naar /admin/header.
 * Deze redirect zorgt dat oude bookmarks en links netjes blijven werken.
 */
export default async function AdminInhoudRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  redirect(`${locale === "nl" ? "" : "/en"}/admin/header`);
}
