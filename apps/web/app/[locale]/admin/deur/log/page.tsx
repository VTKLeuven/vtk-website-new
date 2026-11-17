import { DoorAdminView } from "../DoorAdminView";

/** Tabblad Toegangslog: wie wanneer de deur opende. */
export default async function DoorAdminLog({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ days?: string; result?: string; page?: string }> }) {
  return <DoorAdminView params={params} searchParams={searchParams} section="log" />;
}
