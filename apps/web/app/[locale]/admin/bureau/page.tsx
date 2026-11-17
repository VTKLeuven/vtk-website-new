import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { MeetingListPage, semesterFromParam } from "@/components/meetings/MeetingAdminPages";

/** Tabblad Vergaderingen: de bureaus van een semester; een rij opent de vergadering. */
export default async function AdminBureauPage({
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
  return <MeetingListPage kind="BUREAU" locale={locale} semester={semesterFromParam(semester)} />;
}
