import { AlumniAdminPage } from "./AlumniAdminPage";

/** Tabblad Alumni: de mailinglijst per lichting en alle alumni. */
export default async function AdminAlumni({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ jaar?: string | string[]; q?: string | string[] }> }) {
  return <AlumniAdminPage params={params} searchParams={searchParams} section="alumni" />;
}
