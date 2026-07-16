import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";

// Headerbeheer is opgegaan in /admin/inhoud, samen met het paginabeheer.
export default async function AdminHeaderRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  redirect(`${locale === "nl" ? "" : "/en"}/admin/inhoud`);
}
