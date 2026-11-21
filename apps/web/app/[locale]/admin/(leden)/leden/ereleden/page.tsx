import { LedenAdminPage } from "../LedenAdminPage";

/** Tabblad Ereleden. */
export default async function AdminLedenHonorary({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ jaar?: string; openstaand?: string; lijst?: string; zoek?: string; soort?: string; sorteer?: string; richting?: string }> }) {
  return <LedenAdminPage params={params} searchParams={searchParams} section="ereleden" />;
}
