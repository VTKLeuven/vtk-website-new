import { notFound } from "next/navigation";
import { hasLocale } from "@/lib/locale";
import { requirePermission } from "@/lib/session";
import { currentWorkingYear, formatWorkingYear } from "@/lib/workingYear";
import { ModuleAdminShell } from "@/components/admin/ModuleAdminShell";
import { meetingAdminTabs } from "@/components/meetings/MeetingAdminPages";

import "@/app/design/vtk-basic.css";

/**
 * Beheer van de VTK Bureaus (`bureau.manage`, Onderwijs), in tabbladen zoals
 * Tickets: de vergaderingen (een lijst, en per bureau wat er uitgedeeld moet
 * worden), de planning, de totalen voor de boekhouding, de drankjes en de
 * statistieken. Draait op dezelfde code als /admin/grocomeet; zie
 * components/meetings/MeetingAdminPages.tsx.
 */
export default async function AdminBureauLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(locale)) notFound();
  await requirePermission("bureau.manage");
  const nl = locale === "nl";

  return (
    <ModuleAdminShell
      title={`VTK Bureau · ${formatWorkingYear(currentWorkingYear())}`}
      navLabel="VTK Bureau"
      tabs={meetingAdminTabs("BUREAU", nl)}
    >
      {children}
    </ModuleAdminShell>
  );
}
