import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";

// Handige alias: /shop -> Theokot-reservatiepagina.
export default async function ShopRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  redirect(`${locale === "nl" ? "" : "/en"}/theokot`);
}
