import { LedenAdminPage } from "../LedenAdminPage";

/** Tabblad Instellingen: het lidgeld en de boekhoudcode. */
export default async function AdminLedenSettings({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ jaar?: string; openstaand?: string; lijst?: string; zoek?: string; soort?: string; sorteer?: string; richting?: string }> }) {
  return <LedenAdminPage params={params} searchParams={searchParams} section="instellingen" />;
}
