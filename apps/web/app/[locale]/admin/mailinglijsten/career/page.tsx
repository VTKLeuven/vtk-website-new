import { MailingListsAdminPage } from "../MailingListsAdminPage";

/** Tabblad Career: waar de opt-ins voor de Career-lijst vandaan komen. */
export default async function AdminMailingListsCareer({ params }: { params: Promise<{ locale: string }> }) {
  return <MailingListsAdminPage params={params} section="career" />;
}
