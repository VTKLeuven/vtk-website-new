import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { MeetingPlanningPage, semesterFromParam } from "@/components/meetings/MeetingAdminPages";

/** Tabblad Planning: de kalender van een semester en een losse grocomeet. */
export default async function AdminGrocomeetPlanningPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ semester?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("grocomeet.manage");
  const { semester } = await searchParams;
  return <MeetingPlanningPage kind="GROCOMEET" locale={locale} semester={semesterFromParam(semester)} />;
}
