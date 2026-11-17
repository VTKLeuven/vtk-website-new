import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { MeetingDetailPage } from "@/components/meetings/MeetingAdminPages";

/** Eén bureau: wat er uitgedeeld moet worden en wie wat krijgt. */
export default async function AdminBureauMeetingPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("bureau.manage");
  return <MeetingDetailPage kind="BUREAU" locale={locale} meetingId={id} />;
}
