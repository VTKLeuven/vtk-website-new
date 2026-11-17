import { PianoAdminPage } from "./PianoAdminPage";

/** Tabblad Reservaties: wie de piano de komende tijd reserveerde. */
export default async function AdminPiano({ params }: { params: Promise<{ locale: string }> }) {
  return <PianoAdminPage params={params} section="reservaties" />;
}
