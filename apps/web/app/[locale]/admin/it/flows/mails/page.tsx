import { FlowsAdminPage } from "../FlowsAdminPage";

/** Elke mail die de site opstelt, met de echte template en verzonnen gegevens. */
export default async function AdminFlowMails({ params }: { params: Promise<{ locale: string }> }) {
  return <FlowsAdminPage params={params} section="mails" />;
}
