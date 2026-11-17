import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { MeetingPlanningPage, semesterFromParam } from "@/components/meetings/MeetingAdminPages";

/** Tabblad Planning: de kalender van een semester en een los bureau. */
export default async function AdminBureauPlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ semester?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("bureau.manage");
  const { semester } = await searchParams;
  return <MeetingPlanningPage kind="BUREAU" locale={locale} semester={semesterFromParam(semester)} />;
}
