import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { MeetingListPage, semesterFromParam } from "@/components/meetings/MeetingAdminPages";

/** Tabblad Vergaderingen: de grocomeets van een semester; een rij opent de vergadering. */
export default async function AdminGrocomeetPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ semester?: string; verleden?: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("grocomeet.manage");
  const { semester, verleden } = await searchParams;
  return <MeetingListPage kind="GROCOMEET" locale={locale} semester={semesterFromParam(semester)} showPast={verleden === "1"} />;
}
