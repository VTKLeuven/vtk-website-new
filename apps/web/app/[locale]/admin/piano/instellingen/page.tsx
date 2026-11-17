import { PianoAdminPage } from "../PianoAdminPage";

/** Tabblad Instellingen: de regels en de tekst op de pianopagina. */
export default async function AdminPianoSettings({ params }: { params: Promise<{ locale: string }> }) {
  return <PianoAdminPage params={params} section="instellingen" />;
}
