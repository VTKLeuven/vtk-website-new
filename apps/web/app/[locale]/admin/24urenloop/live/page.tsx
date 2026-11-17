import { UrenloopAdminPage } from "../UrenloopAdminPage";

/** Tabblad Live: de tussenstand van de piste. */
export default async function AdminUrenloopLive({ params }: { params: Promise<{ locale: string }> }) {
  return <UrenloopAdminPage params={params} section="live" />;
}
