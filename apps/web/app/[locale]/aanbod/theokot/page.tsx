import { notFound, redirect } from "next/navigation";
import { hasLocale } from "@/lib/locale";

// De Theokot-reservatiepagina hoort bij "Aanbod"; ze leeft op /theokot, dus stuur
// /aanbod/theokot daarheen door (zo werkt de kaart op de aanbod-overzichtspagina).
export default async function AanbodTheokotRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  redirect(`${locale === "nl" ? "" : "/en"}/theokot`);
}
