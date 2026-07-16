import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";

// Paginabeheer is opgegaan in /admin/inhoud, samen met het headerbeheer.
export default async function AdminPagesRedirect({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  redirect(`${locale === "nl" ? "" : "/en"}/admin/inhoud`);
}
