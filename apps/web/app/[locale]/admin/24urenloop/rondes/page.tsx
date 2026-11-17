import { UrenloopAdminPage } from "../UrenloopAdminPage";

/** Tabblad Rondes per loper: de rondes van elke loper opladen en bekijken. */
export default async function AdminUrenloopLaps({ params }: { params: Promise<{ locale: string }> }) {
  return <UrenloopAdminPage params={params} section="rondes" />;
}
