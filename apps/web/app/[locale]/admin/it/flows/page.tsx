import { FlowsAdminPage } from "./FlowsAdminPage";

/** Schermen die een lid maar één keer of via een mail ziet, met een actie die niets bewaart. */
export default async function AdminFlowPreview({ params }: { params: Promise<{ locale: string }> }) {
  return <FlowsAdminPage params={params} section="schermen" />;
}
