import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { MeetingDetailPage } from "@/components/meetings/MeetingAdminPages";

/** Eén grocomeet: wat er in de doos moet, wie wat krijgt, en afvinken wie betaalde. */
export default async function AdminGrocomeetMeetingPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("grocomeet.manage");
  return <MeetingDetailPage kind="GROCOMEET" locale={locale} meetingId={id} />;
}
