import { LedenAdminPage } from "../LedenAdminPage";

/** Tabblad Lid maken: iemand lid maken zonder dat die betaalt. */
export default async function AdminLedenGrant({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ jaar?: string; openstaand?: string; lijst?: string; zoek?: string; soort?: string }> }) {
  return <LedenAdminPage params={params} searchParams={searchParams} section="lid-maken" />;
}
