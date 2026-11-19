import { AlumniAdminPage } from "../AlumniAdminPage";

/** Tabblad Toevoegen: één alumnus, of een geplakte lijst. */
export default async function AdminAlumniAdd({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ jaar?: string | string[]; q?: string | string[] }> }) {
  return <AlumniAdminPage params={params} searchParams={searchParams} section="toevoegen" />;
}
