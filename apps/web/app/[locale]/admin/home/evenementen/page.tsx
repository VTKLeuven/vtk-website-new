import { redirect } from "next/navigation";

/** De standaardfoto van een evenement staat nu onder Kalender › Standaardbanner. */
export default async function AdminHomeEvents({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`${locale === "en" ? "/en" : ""}/admin/kalender/standaardbanner`);
}
