import { redirect } from "next/navigation";
import { hasPermission } from "@vtk/auth";
import { getCurrentSession } from "@/lib/session";
import { LedenAdminPage } from "./LedenAdminPage";

/** Tabblad Leden: het ledenaantal, de uitsplitsing en de ledenlijst. */
export default async function AdminLeden({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ jaar?: string; openstaand?: string; lijst?: string; zoek?: string; soort?: string }> }) {
  // De ereleden waren eerst `?lijst=ereleden`; een bladwijzer van toen komt nog aan.
  const [{ locale }, { lijst }] = await Promise.all([params, searchParams]);
  const base = `${locale === "en" ? "/en" : ""}/admin`;
  if (lijst === "ereleden") redirect(`${base}/leden/ereleden`);
  // De zijbalk heeft één item Leden, ook voor wie enkel de alumni beheert.
  const session = await getCurrentSession();
  if (session && !hasPermission(session, "leden.manage") && hasPermission(session, "alumni.manage")) {
    redirect(`${base}/alumni`);
  }
  return <LedenAdminPage params={params} searchParams={searchParams} section="leden" />;
}
