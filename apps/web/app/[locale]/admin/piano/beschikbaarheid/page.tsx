import { PianoAdminPage } from "../PianoAdminPage";

/** Tabblad Beschikbaarheid: de vaste vensters en de sluitingen. */
export default async function AdminPianoAvailability({ params }: { params: Promise<{ locale: string }> }) {
  return <PianoAdminPage params={params} section="beschikbaarheid" />;
}
