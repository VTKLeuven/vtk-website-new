import { UrenloopAdminPage } from "./UrenloopAdminPage";

/** Tabblad Tijdstippen: het startschot, de aankomst en hoe lang de eindstand blijft staan. */
export default async function AdminUrenloop({ params }: { params: Promise<{ locale: string }> }) {
  return <UrenloopAdminPage params={params} section="tijdstippen" />;
}
