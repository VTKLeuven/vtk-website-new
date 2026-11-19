import { MailingListsAdminPage } from "./MailingListsAdminPage";

/** Tabblad Lijsten: de koppeling met Brevo en elke lijst om te exporteren. */
export default async function AdminMailingLists({ params }: { params: Promise<{ locale: string }> }) {
  return <MailingListsAdminPage params={params} section="lijsten" />;
}
