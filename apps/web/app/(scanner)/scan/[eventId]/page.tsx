import { ScannerApp } from "@/components/ticketing/scanner/ScannerApp";
import { requireSession } from "@/lib/session";

export default async function ScannerPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  await requireSession(`/inloggen?next=${encodeURIComponent(`/scan/${eventId}`)}`);
  return <ScannerApp eventId={eventId} />;
}
