import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";

// De Theokot-reservatiepagina leeft op /theokot; deze redirect houdt de oude
// /aanbod/theokot-links werkend, nu onder /info/theokot.
export default async function InfoTheokotRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  redirect(`${locale === "nl" ? "" : "/en"}/theokot`);
}
