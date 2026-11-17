import { DoorAdminView } from "./DoorAdminView";

/** Tabblad Toegang: het gebruik en tijdelijke toegang. */
export default async function DoorAdminPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ days?: string; result?: string; page?: string }> }) {
  return <DoorAdminView params={params} searchParams={searchParams} section="toegang" />;
}
