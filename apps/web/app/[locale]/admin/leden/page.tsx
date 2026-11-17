import { redirect } from "next/navigation";
import { LedenAdminPage } from "./LedenAdminPage";

/** Tabblad Leden: het ledenaantal, de uitsplitsing en de ledenlijst. */
export default async function AdminLeden({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ jaar?: string; openstaand?: string; lijst?: string; zoek?: string; soort?: string }> }) {
  // De ereleden waren eerst `?lijst=ereleden`; een bladwijzer van toen komt nog aan.
  const [{ locale }, { lijst }] = await Promise.all([params, searchParams]);
  if (lijst === "ereleden") redirect(`${locale === "en" ? "/en" : ""}/admin/leden/ereleden`);
  return <LedenAdminPage params={params} searchParams={searchParams} section="leden" />;
}
